import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, type Transaction } from "firebase-admin/firestore";
import { onCall, HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";

initializeApp();
setGlobalOptions({ region: process.env.FUNCTIONS_REGION ?? "us-central1", maxInstances: 20 });

const db = getFirestore();
const roles = ["user", "admin", "moderator", "support", "super_admin"] as const;
type Role = (typeof roles)[number];
const permissions = ["viewUsers", "manageUsers", "manageTokens", "manageServices", "manageContent", "manageMessages", "manageReports", "manageSettings", "manageLicenses", "viewAuditLogs"] as const;

type Profile = { role?: Role; permissions?: Partial<Record<(typeof permissions)[number], boolean>>; tokenBalance?: number; verificationStatus?: string; accountStatus?: string };

function authUid(request: CallableRequest<unknown>) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Ingia kwanza.");
  return request.auth.uid;
}

async function profileFor(uid: string) {
  const snapshot = await db.collection("users").doc(uid).get();
  if (!snapshot.exists) throw new HttpsError("permission-denied", "Profile ya akaunti haijapatikana.");
  return snapshot.data() as Profile;
}

function can(profile: Profile, permission: string) {
  return profile.role === "super_admin" || (profile.permissions?.[permission as keyof Profile["permissions"]] === true);
}

function requirePermission(profile: Profile, permission: string) {
  if (!can(profile, permission)) throw new HttpsError("permission-denied", "Huna ruhusa ya kufanya kitendo hiki.");
}

function text(value: unknown, max: number) {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > max) throw new HttpsError("invalid-argument", "Taarifa ya request si sahihi.");
  return value.trim();
}

function recordAudit(transaction: Transaction, actorId: string, actorRole: string, action: string, targetType: string, targetId: string, before: unknown, after: unknown, details: Record<string, unknown> = {}) {
  const ref = db.collection("adminActions").doc();
  transaction.set(ref, { actorId, actorRole, action, targetType, targetId, description: action, before, after, details, createdAt: FieldValue.serverTimestamp() });
}

const writePolicy: Record<string, { permission: string; targetType: string }> = {
  services: { permission: "manageServices", targetType: "service" },
  announcements: { permission: "manageContent", targetType: "announcement" },
  tutorialVideos: { permission: "manageContent", targetType: "tutorialVideo" },
  messages: { permission: "manageMessages", targetType: "message" },
  licenseTemplates: { permission: "manageLicenses", targetType: "licenseTemplate" },
  siteSettings: { permission: "manageSettings", targetType: "siteSettings" },
};

const blockedFields = new Set(["password", "pin", "pinHash", "role", "permissions", "tokenBalance", "actorId", "actorRole", "updatedBy", "createdAt", "updatedAt"]);
function safePatch(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new HttpsError("invalid-argument", "Taarifa za kuhifadhi si sahihi.");
  const patch = Object.fromEntries(Object.entries(value).filter(([key, entry]) => !blockedFields.has(key) && entry !== undefined));
  if (Object.keys(patch).length > 40) throw new HttpsError("invalid-argument", "Taarifa zimezidi.");
  return patch;
}

export const adminWrite = onCall(async (request) => {
  const uid = authUid(request);
  const actor = await profileFor(uid);
  const data = (request.data ?? {}) as Record<string, unknown>;
  const collectionName = text(data.collection, 80);
  const policy = writePolicy[collectionName];
  if (!policy) throw new HttpsError("invalid-argument", "Collection hairuhusiwi.");
  requirePermission(actor, policy.permission);
  if (collectionName === "licenseTemplates" && actor.role !== "super_admin") throw new HttpsError("permission-denied", "Leseni zinasimamiwa na Super Admin pekee.");
  const id = data.id === undefined || data.id === null || data.id === "" ? db.collection(collectionName).doc().id : text(data.id, 180);
  if (collectionName === "siteSettings" && id !== "public") throw new HttpsError("invalid-argument", "Site settings ID si sahihi.");
  const targetRef = db.collection(collectionName).doc(id);
  const patch = safePatch(data.values);
  return db.runTransaction(async (transaction) => {
    const existing = await transaction.get(targetRef);
    const before = existing.exists ? existing.data() : null;
    transaction.set(targetRef, { ...patch, updatedBy: uid, updatedAt: FieldValue.serverTimestamp(), ...(existing.exists ? {} : { createdAt: FieldValue.serverTimestamp() }) }, { merge: true });
    recordAudit(transaction, uid, String(actor.role), existing.exists ? "UPDATE_CONTENT" : "CREATE_CONTENT", policy.targetType, id, before, patch, { collection: collectionName });
    return { id };
  });
});

export const adminDelete = onCall(async (request) => {
  const uid = authUid(request);
  const actor = await profileFor(uid);
  const data = (request.data ?? {}) as Record<string, unknown>;
  const collectionName = text(data.collection, 80);
  const policy = writePolicy[collectionName];
  if (!policy || collectionName === "siteSettings") throw new HttpsError("invalid-argument", "Delete hairuhusiwi kwa collection hii.");
  requirePermission(actor, policy.permission);
  if (collectionName === "licenseTemplates" && actor.role !== "super_admin") throw new HttpsError("permission-denied", "Leseni zinasimamiwa na Super Admin pekee.");
  const id = text(data.id, 180);
  const targetRef = db.collection(collectionName).doc(id);
  return db.runTransaction(async (transaction) => {
    const existing = await transaction.get(targetRef);
    if (!existing.exists) throw new HttpsError("not-found", "Kitu cha kufuta hakikupatikana.");
    transaction.delete(targetRef);
    recordAudit(transaction, uid, String(actor.role), "DELETE_CONTENT", policy.targetType, id, existing.data(), null, { collection: collectionName });
    return { ok: true };
  });
});

export const consumeTokens = onCall(async (request) => {
  const uid = authUid(request);
  const data = (request.data ?? {}) as Record<string, unknown>;
  const serviceId = text(data.serviceId, 120);
  const serviceName = text(data.serviceName, 180);
  const requestId = text(data.requestId, 160);
  const cost = Number(data.tokenCost);
  if (!Number.isInteger(cost) || cost <= 0 || cost > 100000) throw new HttpsError("invalid-argument", "Gharama ya tokeni si sahihi.");

  const userRef = db.collection("users").doc(uid);
  const ledgerRef = db.collection("tokenTransactions").doc(requestId);
  return db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ledgerRef);
    if (existing.exists) {
      const row = existing.data()!;
      if (row.userId !== uid || row.serviceId !== serviceId) throw new HttpsError("already-exists", "Request ya tokeni si sahihi.");
      return { reference: requestId, balanceAfter: row.balanceAfter, duplicate: true };
    }
    const userSnapshot = await transaction.get(userRef);
    const profile = userSnapshot.data() as Profile | undefined;
    if (!profile || profile.accountStatus === "blocked" || profile.accountStatus === "deleted") throw new HttpsError("permission-denied", "Akaunti hii haiwezi kutumia huduma.");
    if (profile.verificationStatus !== "approved") throw new HttpsError("permission-denied", "Akaunti yako haijathibitishwa na admin.");
    const before = Number(profile.tokenBalance ?? 0);
    if (before < cost) throw new HttpsError("failed-precondition", "Tokeni zako hazitoshi kutumia huduma hii.");
    const after = before - cost;
    transaction.update(userRef, { tokenBalance: after, updatedAt: FieldValue.serverTimestamp() });
    transaction.set(ledgerRef, { transactionId: requestId, userId: uid, actorId: uid, type: "service_usage", amount: -cost, balanceBefore: before, balanceAfter: after, reason: `Matumizi ya ${serviceName}`, serviceId, serviceName, reference: requestId, createdAt: FieldValue.serverTimestamp(), status: "completed" });
    return { reference: requestId, balanceAfter: after, duplicate: false };
  });
});

export const adjustTokens = onCall(async (request) => {
  const uid = authUid(request);
  const profile = await profileFor(uid);
  requirePermission(profile, "manageTokens");
  const data = (request.data ?? {}) as Record<string, unknown>;
  const userId = text(data.userId, 180);
  const description = text(data.description, 300);
  const amount = Number(data.amount);
  if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 100000) throw new HttpsError("invalid-argument", "Kiasi cha tokeni si sahihi.");
  const userRef = db.collection("users").doc(userId);
  const ledgerRef = db.collection("tokenTransactions").doc();
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(userRef);
    if (!snapshot.exists) throw new HttpsError("not-found", "Mtumiaji hakupatikana.");
    const target = snapshot.data() as Profile;
    if (target.role === "super_admin" && uid !== userId) throw new HttpsError("permission-denied", "Super Admin inalindwa.");
    const before = Number(target.tokenBalance ?? 0);
    const after = before + amount;
    if (after < 0) throw new HttpsError("failed-precondition", "Salio haliwezi kuwa chini ya sifuri.");
    transaction.update(userRef, { tokenBalance: after, updatedAt: FieldValue.serverTimestamp() });
    transaction.set(ledgerRef, { transactionId: ledgerRef.id, userId, actorId: uid, type: amount > 0 ? "credit" : "debit", amount, balanceBefore: before, balanceAfter: after, reason: description, serviceId: "admin-adjustment", serviceName: "Admin token adjustment", reference: ledgerRef.id, createdAt: FieldValue.serverTimestamp(), status: "completed" });
    recordAudit(transaction, uid, String(profile.role), amount > 0 ? "ADD_TOKENS" : "REMOVE_TOKENS", "user", userId, { tokenBalance: before }, { tokenBalance: after }, { amount, description });
    return { balanceAfter: after, reference: ledgerRef.id };
  });
});

export const updateUserAccess = onCall(async (request) => {
  const uid = authUid(request);
  const actor = await profileFor(uid);
  requirePermission(actor, "manageUsers");
  const data = (request.data ?? {}) as Record<string, unknown>;
  const userId = text(data.userId, 180);
  const targetRef = db.collection("users").doc(userId);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(targetRef);
    if (!snapshot.exists) throw new HttpsError("not-found", "Mtumiaji hakupatikana.");
    const target = snapshot.data() as Profile;
    if (target.role === "super_admin" || data.role === "super_admin") throw new HttpsError("permission-denied", "Mabadiliko ya Super Admin yanahitaji workflow maalum.");
    const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (data.role !== undefined) {
      if (!roles.includes(data.role as Role) || data.role === "super_admin") throw new HttpsError("invalid-argument", "Role si sahihi.");
      patch.role = data.role;
    }
    if (data.permissions !== undefined) {
      if (typeof data.permissions !== "object" || data.permissions === null) throw new HttpsError("invalid-argument", "Permissions si sahihi.");
      const next = data.permissions as Record<string, unknown>;
      if (Object.keys(next).some((key) => !permissions.includes(key as typeof permissions[number]) || typeof next[key] !== "boolean")) throw new HttpsError("invalid-argument", "Permission haijulikani.");
      patch.permissions = next;
    }
    if (Object.keys(patch).length === 1) throw new HttpsError("invalid-argument", "Hakuna mabadiliko yaliyotumwa.");
    transaction.update(targetRef, patch);
    recordAudit(transaction, uid, String(actor.role), "UPDATE_USER_ACCESS", "user", userId, { role: target.role, permissions: target.permissions ?? {} }, { role: patch.role ?? target.role, permissions: patch.permissions ?? target.permissions ?? {} });
    return { ok: true };
  });
});

export const setAccountStatus = onCall(async (request) => {
  const uid = authUid(request);
  const actor = await profileFor(uid);
  requirePermission(actor, "manageUsers");
  const data = (request.data ?? {}) as Record<string, unknown>;
  const userId = text(data.userId, 180);
  const status = data.status;
  if (!['active', 'blocked', 'deleted'].includes(String(status))) throw new HttpsError("invalid-argument", "Account status si sahihi.");
  if (userId === uid) throw new HttpsError("permission-denied", "Huwezi kubadilisha status ya akaunti yako mwenyewe.");
  const targetRef = db.collection("users").doc(userId);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(targetRef);
    if (!snapshot.exists) throw new HttpsError("not-found", "Mtumiaji hakupatikana.");
    const target = snapshot.data() as Profile;
    if (target.role === "super_admin") throw new HttpsError("permission-denied", "Super Admin inalindwa.");
    transaction.update(targetRef, { accountStatus: status, updatedAt: FieldValue.serverTimestamp() });
    recordAudit(transaction, uid, String(actor.role), "SET_ACCOUNT_STATUS", "user", userId, { accountStatus: target.accountStatus ?? "active" }, { accountStatus: status });
    return { ok: true };
  });
});

export const verifyUser = onCall(async (request) => {
  const uid = authUid(request);
  const actor = await profileFor(uid);
  requirePermission(actor, "manageUsers");
  const data = (request.data ?? {}) as Record<string, unknown>;
  const userId = text(data.userId, 180);
  const status = data.status;
  if (!['approved', 'rejected', 'pending'].includes(String(status))) throw new HttpsError("invalid-argument", "Verification status si sahihi.");
  const targetRef = db.collection("users").doc(userId);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(targetRef);
    if (!snapshot.exists) throw new HttpsError("not-found", "Mtumiaji hakupatikana.");
    const target = snapshot.data() as Profile;
    transaction.update(targetRef, { verificationStatus: status, updatedAt: FieldValue.serverTimestamp() });
    recordAudit(transaction, uid, String(actor.role), "VERIFY_USER", "user", userId, { verificationStatus: target.verificationStatus ?? "pending" }, { verificationStatus: status });
    return { ok: true };
  });
});
