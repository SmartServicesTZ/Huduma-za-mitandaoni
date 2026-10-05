import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { FieldValue, getFirestore, type DocumentReference, type DocumentSnapshot, type Transaction } from "./firestore-rest.js";
import { getStorage } from "./storage-rest.js";
import { ApiError, defineWorkerSecret, callable, httpEndpoint, type ApiRequest } from "./api-adapter.js";
import { getGoogleAccessToken, getWorkerEnv } from "./runtime.js";
import { resolveAuthRole } from "./authClaims.js";
import { defaultLipaServices, defaultServices } from "./defaultCatalog.js";
import { fimipayTerminalStatus, isConfirmedLivePayment, isFimipaySuccessEvent, isOpenTokenPurchaseStatus, makeTokenPurchaseOrderId, normalizeTanzaniaPhone, tokenCreditsForAmount, verifyFimipayWebhookSignature } from "./fimipayCore.js";
import { phoneAuthAlias } from "../../shared/tanzaniaPhone.js";

const db = getFirestore();
const bucket = getStorage().bucket();
const fimipayApiSecret = defineWorkerSecret("FIMIPAY_SECRET_KEY");
const fimipayWebhookSecret = defineWorkerSecret("FIMIPAY_WEBHOOK_SECRET");
const roles = ["user", "admin", "moderator", "support", "super_admin"] as const;
type Role = (typeof roles)[number];
const permissions = ["viewUsers", "manageUsers", "manageTokens", "manageServices", "manageLipaApplications", "manageContent", "manageMessages", "manageReports", "manageSettings", "manageLicenses", "viewAuditLogs"] as const;
const defaultLockedServiceSlugs = new Set(["cheti-kuzaliwa", "visa-pasipoti", "cheti-ndoa", "ripoti-hasara"]);

type Profile = { role?: Role; permissions?: Partial<Record<(typeof permissions)[number], boolean>>; tokenBalance?: number; verificationStatus?: string; accountStatus?: string; name?: string; phone?: string; mustChangePassword?: boolean };

function authUid(request: ApiRequest<unknown>) {
  if (!request.auth?.uid) throw new ApiError("unauthenticated", "Ingia kwanza.");
  return request.auth.uid;
}

async function profileFor(uid: string) {
  const snapshot = await db.collection("users").doc(uid).get();
  if (!snapshot.exists) throw new ApiError("permission-denied", "Profile ya akaunti haijapatikana.");
  const profile = snapshot.data() as Profile;
  const role = resolveAuthRole(profile.role, profile.phone, getWorkerEnv().SUPER_ADMIN_PHONE ?? "255698232313").role;
  return { ...profile, role };
}

function can(profile: Profile, permission: string) {
  return profile.role === "super_admin" || (profile.permissions?.[permission as keyof Profile["permissions"]] === true);
}

function requirePermission(profile: Profile, permission: string) {
  if (!can(profile, permission)) throw new ApiError("permission-denied", "Huna ruhusa ya kufanya kitendo hiki.");
}

async function serviceIsLocked(transaction: Transaction, slug: string) {
  const lockSnapshot = await transaction.get(db.collection("serviceLocks").doc(slug));
  if (lockSnapshot.exists && typeof lockSnapshot.data()?.isLocked === "boolean") return lockSnapshot.data()!.isLocked === true;
  if (defaultLockedServiceSlugs.has(slug)) return true;
  const serviceSnapshot = await transaction.get(db.collection("services").where("slug", "==", slug).limit(1));
  return serviceSnapshot.docs.some((document) => document.data()?.isLocked === true);
}

function text(value: unknown, max: number) {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > max) throw new ApiError("invalid-argument", "Taarifa ya request si sahihi.");
  return value.trim();
}

function recordAudit(transaction: Transaction, actorId: string, actorRole: string, action: string, targetType: string, targetId: string, before: unknown, after: unknown, details: Record<string, unknown> = {}) {
  const ref = db.collection("adminActions").doc();
  transaction.set(ref, { actorId, actorRole, action, targetType, targetId, description: action, before, after, details, createdAt: FieldValue.serverTimestamp() });
}

const writePolicy: Record<string, { permission: string; targetType: string }> = {
  services: { permission: "manageServices", targetType: "service" },
  lipaServices: { permission: "manageServices", targetType: "lipaService" },
  announcements: { permission: "manageContent", targetType: "announcement" },
  tutorialVideos: { permission: "manageContent", targetType: "tutorialVideo" },
  messages: { permission: "manageMessages", targetType: "message" },
  licenseTemplates: { permission: "manageLicenses", targetType: "licenseTemplate" },
  siteSettings: { permission: "manageSettings", targetType: "siteSettings" },
};

const blockedFields = new Set(["password", "pin", "pinHash", "role", "permissions", "tokenBalance", "actorId", "actorRole", "catalogInitialized", "updatedBy", "createdAt", "updatedAt"]);
function safePatch(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new ApiError("invalid-argument", "Taarifa za kuhifadhi si sahihi.");
  const patch = Object.fromEntries(Object.entries(value).filter(([key, entry]) => !blockedFields.has(key) && entry !== undefined));
  if (Object.keys(patch).length > 40) throw new ApiError("invalid-argument", "Taarifa zimezidi.");
  return patch;
}

const formFieldTypes = new Set(["TEXT", "NUMBER", "PHONE", "TIN", "NIDA", "DROPDOWN", "TEXTAREA", "IMAGE_UPLOAD", "FILE_UPLOAD", "DATE"]);
function validateConfiguredFields(value: unknown) {
  if (!Array.isArray(value) || value.length > 40) throw new ApiError("invalid-argument", "Orodha ya fields si sahihi.");
  const names = new Set<string>();
  return value.map((raw, index) => {
    const field = objectValue(raw, "Field");
    const fieldName = text(field.fieldName, 64);
    const label = text(field.label, 100);
    const type = text(field.type, 30);
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(fieldName) || names.has(fieldName)) throw new ApiError("invalid-argument", "Jina la field limejirudia au si sahihi.");
    if (!formFieldTypes.has(type)) throw new ApiError("invalid-argument", `Aina ya field ${type} haijaruhusiwa.`);
    names.add(fieldName);
    const options = field.options === undefined ? undefined : Array.isArray(field.options) ? field.options.map((item) => text(item, 120)).slice(0, 80) : (() => { throw new ApiError("invalid-argument", `Options za ${label} si sahihi.`); })();
    if (type === "DROPDOWN" && (!options || options.length === 0)) throw new ApiError("invalid-argument", `Weka options za ${label}.`);
    const validation = field.validation === undefined || field.validation === "" ? undefined : text(field.validation, 200);
    if (validation) { try { new RegExp(validation); } catch { throw new ApiError("invalid-argument", `Regex ya ${label} si sahihi.`); } }
    const maxSizeMb = field.maxSizeMb === undefined ? undefined : Number(field.maxSizeMb);
    if (maxSizeMb !== undefined && (!Number.isFinite(maxSizeMb) || maxSizeMb <= 0 || maxSizeMb > 10)) throw new ApiError("invalid-argument", `Ukubwa wa juu wa ${label} lazima uwe 1–10 MB.`);
    return { fieldName, label, type, placeholder: typeof field.placeholder === "string" ? field.placeholder.slice(0, 200) : "", required: field.required === true, helpText: typeof field.helpText === "string" ? field.helpText.slice(0, 300) : "", order: Number.isFinite(Number(field.order)) ? Number(field.order) : index, ...(options ? { options } : {}), ...(validation ? { validation } : {}), ...(maxSizeMb ? { maxSizeMb } : {}), ...(Array.isArray(field.accept) ? { accept: field.accept.filter((item): item is string => typeof item === "string" && item.length <= 100).slice(0, 10) } : {}) };
  });
}

export const adminWrite = callable(async (request) => {
  const uid = authUid(request);
  const actor = await profileFor(uid);
  const data = (request.data ?? {}) as Record<string, unknown>;
  const collectionName = text(data.collection, 80);
  const policy = writePolicy[collectionName];
  if (!policy) throw new ApiError("invalid-argument", "Collection hairuhusiwi.");
  requirePermission(actor, policy.permission);
  if (collectionName === "lipaServices" && actor.role !== "super_admin") throw new ApiError("permission-denied", "Mipangilio ya mitandao ya Lipa inabadilishwa na Super Admin pekee.");
  if (collectionName === "siteSettings" && actor.role !== "super_admin" && typeof data.values === "object" && data.values !== null && !Array.isArray(data.values)) {
    const values = data.values as Record<string, unknown>;
    if ("serviceOrder" in values || "homepageSectionOrder" in values) throw new ApiError("permission-denied", "Mpangilio wa ukurasa wa mwanzo unaweza kubadilishwa na Super Admin pekee.");
  }
  if (collectionName === "licenseTemplates" && actor.role !== "super_admin") throw new ApiError("permission-denied", "Leseni zinasimamiwa na Super Admin pekee.");
  const id = data.id === undefined || data.id === null || data.id === "" ? db.collection(collectionName).doc().id : text(data.id, 180);
  if (collectionName === "siteSettings" && id !== "public") throw new ApiError("invalid-argument", "Site settings ID si sahihi.");
  const targetRef = db.collection(collectionName).doc(id);
  const patch = safePatch(data.values);
  if (collectionName === "services" || collectionName === "lipaServices") {
    const slug = text(patch.slug ?? patch.id ?? id, 120);
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/.test(slug)) throw new ApiError("invalid-argument", "Slug si sahihi.");
    patch.slug = slug;
    if (patch.name !== undefined) patch.name = text(patch.name, 120);
    if (patch.tokenCost !== undefined) {
      const tokenCost = Number(patch.tokenCost);
      if (!Number.isSafeInteger(tokenCost) || tokenCost < 0 || tokenCost > 100000) throw new ApiError("invalid-argument", "Gharama ya tokeni si sahihi.");
      patch.tokenCost = tokenCost;
    }
    if (patch.fields !== undefined) patch.fields = validateConfiguredFields(patch.fields);
    if (patch.statusOptions !== undefined && (!Array.isArray(patch.statusOptions) || patch.statusOptions.length > 12 || patch.statusOptions.some((status) => typeof status !== "string" || status.length > 40))) throw new ApiError("invalid-argument", "Status options si sahihi.");
    if (patch.active !== undefined && typeof patch.active !== "boolean") throw new ApiError("invalid-argument", "Hali ya huduma si sahihi.");
    if (patch.isVisible !== undefined && typeof patch.isVisible !== "boolean") throw new ApiError("invalid-argument", "Hali ya kuonekana si sahihi.");
    if (patch.reward !== undefined && (!Number.isFinite(Number(patch.reward)) || Number(patch.reward) < 0 || Number(patch.reward) > 100000000)) throw new ApiError("invalid-argument", "Taarifa ya zawadi si sahihi.");
  }
  return db.runTransaction(async (transaction) => {
    const existing = await transaction.get(targetRef);
    const before = existing.exists ? existing.data() : null;
    transaction.set(targetRef, { ...patch, updatedBy: uid, updatedAt: FieldValue.serverTimestamp(), ...(existing.exists ? {} : { createdAt: FieldValue.serverTimestamp() }) }, { merge: true });
    recordAudit(transaction, uid, String(actor.role), existing.exists ? "UPDATE_CONTENT" : "CREATE_CONTENT", policy.targetType, id, before, patch, { collection: collectionName });
    return { id };
  });
});

const homepageSections = ["services", "locked", "special", "tools", "tutorials"] as const;

export const setHomepageServiceOrder = callable(async (request) => {
  const uid = authUid(request);
  const actor = await profileFor(uid);
  if (actor.role !== "super_admin") throw new ApiError("permission-denied", "Mpangilio wa huduma unaweza kubadilishwa na Super Admin pekee.");

  const data = (request.data ?? {}) as Record<string, unknown>;
  if (!Array.isArray(data.serviceOrder) || data.serviceOrder.length === 0 || data.serviceOrder.length > 300) {
    throw new ApiError("invalid-argument", "Mpangilio wa huduma si sahihi.");
  }
  const serviceOrder = data.serviceOrder.map((value) => {
    const slug = text(value, 120);
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/.test(slug)) throw new ApiError("invalid-argument", "Kitambulisho cha huduma si sahihi.");
    return slug;
  });
  if (new Set(serviceOrder).size !== serviceOrder.length) throw new ApiError("invalid-argument", "Mpangilio una huduma zilizorudiwa.");

  if (!Array.isArray(data.homepageSectionOrder) || data.homepageSectionOrder.length !== homepageSections.length) throw new ApiError("invalid-argument", "Mpangilio wa makundi ya ukurasa wa mwanzo si sahihi.");
  const homepageSectionOrder = data.homepageSectionOrder.map((value) => text(value, 40));
  if (new Set(homepageSectionOrder).size !== homepageSections.length || homepageSectionOrder.some((id) => !homepageSections.includes(id as (typeof homepageSections)[number]))) {
    throw new ApiError("invalid-argument", "Makundi ya ukurasa wa mwanzo lazima yawe ya kipekee na sahihi.");
  }

  const settingsRef = db.collection("siteSettings").doc("public");
  return db.runTransaction(async (transaction) => {
    const settingsSnapshot = await transaction.get(settingsRef);
    const existing = settingsSnapshot.data() ?? {};
    const before = { serviceOrder: existing.serviceOrder ?? [], homepageSectionOrder: existing.homepageSectionOrder ?? [] };
    const after = { serviceOrder, homepageSectionOrder };
    transaction.set(settingsRef, after, { merge: true });
    recordAudit(transaction, uid, String(actor.role), "UPDATE_HOMEPAGE_SERVICE_ORDER", "siteSettings", "public", before, after, { itemCount: serviceOrder.length, sectionCount: homepageSectionOrder.length });
    return { savedServices: serviceOrder.length, savedSections: homepageSectionOrder.length };
  });
});

export const adminDelete = callable(async (request) => {
  const uid = authUid(request);
  const actor = await profileFor(uid);
  const data = (request.data ?? {}) as Record<string, unknown>;
  const collectionName = text(data.collection, 80);
  const policy = writePolicy[collectionName];
  if (!policy || collectionName === "siteSettings") throw new ApiError("invalid-argument", "Delete hairuhusiwi kwa collection hii.");
  requirePermission(actor, policy.permission);
  if (collectionName === "lipaServices" && actor.role !== "super_admin") throw new ApiError("permission-denied", "Mipangilio ya mitandao ya Lipa inasimamiwa na Super Admin pekee.");
  if (collectionName === "licenseTemplates" && actor.role !== "super_admin") throw new ApiError("permission-denied", "Leseni zinasimamiwa na Super Admin pekee.");
  const id = text(data.id, 180);
  const targetRef = db.collection(collectionName).doc(id);
  return db.runTransaction(async (transaction) => {
    const existing = await transaction.get(targetRef);
    if (!existing.exists) throw new ApiError("not-found", "Kitu cha kufuta hakikupatikana.");
    transaction.delete(targetRef);
    recordAudit(transaction, uid, String(actor.role), "DELETE_CONTENT", policy.targetType, id, existing.data(), null, { collection: collectionName });
    return { ok: true };
  });
});

export const consumeTokens = callable(async (request) => {
  const uid = authUid(request);
  const data = (request.data ?? {}) as Record<string, unknown>;
  const serviceId = text(data.serviceId, 120);
  const requestId = text(data.requestId, 160);
  const requestedCost = Number(data.tokenCost);
  if (!Number.isInteger(requestedCost) || requestedCost <= 0 || requestedCost > 100000) throw new ApiError("invalid-argument", "Gharama ya tokeni si sahihi.");

  const userRef = db.collection("users").doc(uid);
  const ledgerRef = db.collection("tokenTransactions").doc(requestId);
  return db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ledgerRef);
    if (existing.exists) {
      const row = existing.data()!;
      if (row.userId !== uid || row.serviceId !== serviceId) throw new ApiError("already-exists", "Request ya tokeni si sahihi.");
      return { reference: requestId, balanceAfter: row.balanceAfter, duplicate: true };
    }
    if (await serviceIsLocked(transaction, serviceId)) throw new ApiError("failed-precondition", "Huduma hii imefungwa kwa sasa.");
    const serviceSnapshot = await transaction.get(db.collection("services").where("slug", "==", serviceId).limit(1));
    const service = serviceSnapshot.docs[0]?.data();
    if (!service || service.active === false || service.isVisible === false) throw new ApiError("failed-precondition", "Huduma hii haipatikani kwa sasa.");
    if (service.isFree === true) throw new ApiError("failed-precondition", "Huduma hii haitumii tokeni.");
    const cost = Number(service.tokenCost);
    if (!Number.isSafeInteger(cost) || cost <= 0 || cost > 100000) throw new ApiError("failed-precondition", "Gharama ya huduma haijawekwa sawa. Wasiliana na admin.");
    const serviceName = String(service.name ?? data.serviceName ?? serviceId).slice(0, 180);
    const userSnapshot = await transaction.get(userRef);
    const profile = userSnapshot.data() as Profile | undefined;
    if (!profile || profile.accountStatus === "blocked" || profile.accountStatus === "deleted") throw new ApiError("permission-denied", "Akaunti hii haiwezi kutumia huduma.");
    if (profile.verificationStatus !== "approved") throw new ApiError("permission-denied", "Akaunti yako haijathibitishwa na admin.");
    const before = Number(profile.tokenBalance ?? 0);
    if (before < cost) throw new ApiError("failed-precondition", "Tokeni zako hazitoshi kutumia huduma hii.");
    const after = before - cost;
    transaction.update(userRef, { tokenBalance: after, updatedAt: FieldValue.serverTimestamp() });
    transaction.set(ledgerRef, { transactionId: requestId, userId: uid, actorId: uid, type: "service_usage", amount: -cost, balanceBefore: before, balanceAfter: after, reason: `Matumizi ya ${serviceName}`, serviceId, serviceName, reference: requestId, createdAt: FieldValue.serverTimestamp(), status: "completed" });
    return { reference: requestId, balanceAfter: after, duplicate: false };
  });
});

export const adjustTokens = callable(async (request) => {
  const uid = authUid(request);
  const profile = await profileFor(uid);
  requirePermission(profile, "manageTokens");
  const data = (request.data ?? {}) as Record<string, unknown>;
  const userId = text(data.userId, 180);
  const description = text(data.description, 300);
  const requestId = text(data.requestId, 160);
  if (!/^[A-Za-z0-9_-]{8,160}$/.test(requestId)) throw new ApiError("invalid-argument", "Rejea ya ombi la tokeni si sahihi.");
  const amount = Number(data.amount);
  if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 100000) throw new ApiError("invalid-argument", "Kiasi cha tokeni si sahihi.");
  const userRef = db.collection("users").doc(userId);
  const ledgerRef = db.collection("tokenTransactions").doc(`${uid}_${requestId}`);
  try {
    return await db.runTransaction(async (transaction) => {
      const prior = await transaction.get(ledgerRef);
      if (prior.exists) {
        const row = prior.data()!;
        if (row.actorId !== uid || row.userId !== userId || Number(row.amount) !== amount || row.reason !== description) throw new ApiError("already-exists", "Rejea hii tayari imetumika kwa ombi tofauti.");
        return { balanceAfter: row.balanceAfter, reference: row.reference ?? ledgerRef.id, duplicate: true };
      }
      const snapshot = await transaction.get(userRef);
      if (!snapshot.exists) throw new ApiError("not-found", "Mtumiaji hakupatikana.");
      const target = snapshot.data() as Profile;
      const targetRole = resolveAuthRole(target.role, target.phone, getWorkerEnv().SUPER_ADMIN_PHONE ?? "255698232313").role;
      if (targetRole === "super_admin" && uid !== userId) throw new ApiError("permission-denied", "Super Admin inalindwa.");
      const before = Number(target.tokenBalance ?? 0);
      if (!Number.isSafeInteger(before) || before < 0) throw new ApiError("failed-precondition", "Salio la tokeni kwenye profile si sahihi. Kagua taarifa za mtumiaji kwanza.");
      const after = before + amount;
      if (!Number.isSafeInteger(after)) throw new ApiError("out-of-range", "Salio jipya la tokeni limezidi kikomo kinachoruhusiwa.");
      if (after < 0) throw new ApiError("failed-precondition", "Salio haliwezi kuwa chini ya sifuri.");
      transaction.update(userRef, { tokenBalance: after, updatedAt: FieldValue.serverTimestamp() });
      transaction.set(ledgerRef, { transactionId: ledgerRef.id, userId, actorId: uid, type: amount > 0 ? "credit" : "debit", amount, balanceBefore: before, balanceAfter: after, reason: description, serviceId: "admin-adjustment", serviceName: "Admin token adjustment", reference: ledgerRef.id, createdAt: FieldValue.serverTimestamp(), status: "completed" });
      recordAudit(transaction, uid, String(profile.role), amount > 0 ? "ADD_TOKENS" : "REMOVE_TOKENS", "user", userId, { tokenBalance: before }, { tokenBalance: after }, { amount, description });
      return { balanceAfter: after, reference: ledgerRef.id, duplicate: false };
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const cause = error as { code?: unknown; message?: unknown };
    console.error("adjustTokens failed", { actorId: uid, targetUserId: userId, requestId, amount, code: String(cause?.code ?? "unknown"), message: String(cause?.message ?? "unknown") });
    throw new ApiError("internal", "Imeshindikana kuhifadhi tokeni. Jaribu tena; ombi linalindwa lisihesabiwe mara mbili.");
  }
});

export const setServiceLock = callable(async (request) => {
  const uid = authUid(request);
  const actor = await profileFor(uid);
  requirePermission(actor, "manageServices");
  const data = (request.data ?? {}) as Record<string, unknown>;
  const slug = text(data.slug, 120);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/.test(slug)) throw new ApiError("invalid-argument", "Kitambulisho cha huduma si sahihi.");
  if (typeof data.isLocked !== "boolean") throw new ApiError("invalid-argument", "Hali ya huduma si sahihi.");
  const ref = db.collection("serviceLocks").doc(slug);
  return db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    const before = existing.exists ? existing.data()?.isLocked === true : defaultLockedServiceSlugs.has(slug);
    const after = data.isLocked as boolean;
    transaction.set(ref, { slug, isLocked: after, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    recordAudit(transaction, uid, String(actor.role), after ? "LOCK_SERVICE" : "UNLOCK_SERVICE", "service", slug, { isLocked: before }, { isLocked: after });
    return { slug, isLocked: after };
  });
});

async function initializeServiceCatalog(uid: string, actorRole: string, skipIfInitialized: boolean) {
  const refs = [
    ...defaultServices.map((service) => ({ ref: db.collection("services").doc(service.slug), data: service })),
    ...defaultLipaServices.map((service) => ({ ref: db.collection("lipaServices").doc(service.id), data: service })),
  ];
  const settingsRef = db.collection("siteSettings").doc("public");
  return db.runTransaction(async (transaction) => {
    const settingsSnapshot = await transaction.get(settingsRef);
    if (skipIfInitialized && settingsSnapshot.data()?.catalogInitialized === true) return { createdServices: 0, createdNetworks: 0, initialized: true };
    const existingRecords: Array<{ item: (typeof refs)[number]; snapshot: DocumentSnapshot; targetRef: DocumentReference }> = [];
    for (const item of refs) {
      const direct = await transaction.get(item.ref);
      const catalogData = item.data as { slug?: string; id?: string };
      const snapshot = direct.exists
        ? direct
        : (await transaction.get(item.ref.parent.where("slug", "==", String(catalogData.slug ?? catalogData.id)).limit(1))).docs[0] ?? direct;
      existingRecords.push({ item, snapshot, targetRef: snapshot.exists ? snapshot.ref : item.ref });
    }
    let createdServices = 0;
    let createdNetworks = 0;
    existingRecords.forEach(({ item, snapshot, targetRef }) => {
      if (!snapshot.exists) {
        transaction.create(targetRef, { ...item.data, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
        if (item.ref.parent.id === "services") createdServices += 1;
        else createdNetworks += 1;
        return;
      }
      const existing = snapshot.data()!;
      const backfill = Object.fromEntries(Object.entries(item.data).filter(([key]) => existing[key] === undefined));
      if (Object.keys(backfill).length) transaction.set(targetRef, { ...backfill, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    });
    transaction.set(settingsRef, { catalogInitialized: true, catalogInitializedAt: FieldValue.serverTimestamp() }, { merge: true });
    recordAudit(transaction, uid, actorRole, "SEED_SERVICE_CATALOG", "serviceCatalog", "initial", { catalogInitialized: settingsSnapshot.data()?.catalogInitialized === true }, { createdServices, createdNetworks, catalogInitialized: true });
    return { createdServices, createdNetworks, initialized: true };
  });
}

export const ensureDefaultServiceCatalog = callable(async (request) => {
  const uid = authUid(request);
  const actor = await profileFor(uid);
  requirePermission(actor, "manageServices");
  const actorRole = String(actor.role ?? "user");
  return initializeServiceCatalog(uid, actorRole, true);
});

export const seedServiceCatalog = callable(async (request) => {
  const uid = authUid(request);
  const actor = await profileFor(uid);
  if (actor.role !== "super_admin") throw new ApiError("permission-denied", "Super Admin pekee anaweza kuanzisha katalogi ya huduma.");
  return initializeServiceCatalog(uid, String(actor.role), false);
});

function objectValue(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new ApiError("invalid-argument", `${field} si sahihi.`);
  return value as Record<string, unknown>;
}

function cleanApplicationValues(values: Record<string, unknown>, fields: Array<Record<string, unknown>>, uid: string, applicationId: string, uploadCollection = "lipaUploads") {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    const name = String(field.fieldName ?? "");
    const label = String(field.label ?? name);
    const type = String(field.type ?? "TEXT");
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name)) throw new ApiError("failed-precondition", "Fomu ya huduma ina field isiyo sahihi.");
    const value = values[name];
    const raw = value == null ? "" : String(value).trim();
    if (field.required === true && !raw) throw new ApiError("invalid-argument", `${label} inahitajika.`);
    if (!raw) continue;
    if (["IMAGE_UPLOAD", "FILE_UPLOAD"].includes(type)) {
      const prefix = `${uploadCollection}/${uid}/${applicationId}/`;
      if (!raw.startsWith(prefix) || raw.includes("..") || raw.length > 600) throw new ApiError("invalid-argument", `Pakia ${label.toLowerCase()} tena.`);
      result[name] = raw;
      continue;
    }
    if (type === "NUMBER" && !Number.isFinite(Number(raw))) throw new ApiError("invalid-argument", `${label} iwe namba sahihi.`);
    if (type === "PHONE" && !/^\+?[0-9][0-9 ()-]{6,18}$/.test(raw)) throw new ApiError("invalid-argument", `${label} si namba sahihi ya simu.`);
    if (type === "TIN" && !/^\d{3}-\d{3}-\d{3}$/.test(raw)) throw new ApiError("invalid-argument", `${label} itumie muundo 123-123-123.`);
    if (type === "NIDA" && !/^\d{8}-\d{5}-\d{5}-\d{2}$/.test(raw)) throw new ApiError("invalid-argument", `${label} itumie muundo 20068517-27520-00001-22.`);
    if (type === "DROPDOWN" && !(Array.isArray(field.options) && field.options.includes(raw))) throw new ApiError("invalid-argument", `Chagua ${label.toLowerCase()} kwenye orodha.`);
    if (type === "DATE" && (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(`${raw}T00:00:00Z`)))) throw new ApiError("invalid-argument", `${label} si tarehe sahihi.`);
    if (typeof field.validation === "string" && field.validation.length <= 200) {
      try { if (!new RegExp(field.validation).test(raw)) throw new ApiError("invalid-argument", `${label} haijakidhi muundo unaotakiwa.`); }
      catch (error) { if (error instanceof ApiError) throw error; throw new ApiError("failed-precondition", `Kanuni ya ${label.toLowerCase()} si sahihi.`); }
    }
    result[name] = type === "NUMBER" ? Number(raw) : raw.slice(0, 2000);
  }
  return result;
}

export const submitLipaApplication = callable(async (request) => {
  const uid = authUid(request);
  const profile = await profileFor(uid);
  if (profile.accountStatus === "blocked" || profile.accountStatus === "deleted") throw new ApiError("permission-denied", "Akaunti hii imezuiwa.");
  const data = objectValue(request.data, "Taarifa za ombi");
  const networkId = text(data.networkId, 80);
  const applicationId = text(data.applicationId, 80);
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(applicationId)) throw new ApiError("invalid-argument", "Namba ya ombi si sahihi.");
  const configRef = db.collection("lipaServices").doc(networkId);
  const configSnapshot = await configRef.get();
  if (!configSnapshot.exists) throw new ApiError("not-found", "Mtandao huu haujapatikana.");
  const config = configSnapshot.data()!;
  if (config.active !== true) throw new ApiError("failed-precondition", "Maombi ya mtandao huu yamefungwa kwa sasa.");
  const fields = Array.isArray(config.fields) ? config.fields as Array<Record<string, unknown>> : [];
  const applicantData = cleanApplicationValues(objectValue(data.values, "Fomu"), fields, uid, applicationId);
  const openRef = db.collection("lipaOpenApplications").doc(`${uid}_${networkId}`);
  const preexistingOpen = await openRef.get();
  if (preexistingOpen.exists) throw new ApiError("already-exists", "Una ombi la mtandao huu ambalo bado linasubiri kukamilika.", { applicationId: preexistingOpen.data()?.applicationId });
  const finalPaths: string[] = [];
  const sourcePaths: string[] = [];
  try {
  for (const field of fields) {
    const name = String(field.fieldName ?? "");
    const pathValue = applicantData[name];
    if (!["IMAGE_UPLOAD", "FILE_UPLOAD"].includes(String(field.type)) || typeof pathValue !== "string") continue;
    const sourceFile = bucket.file(pathValue);
    const [metadata] = await sourceFile.getMetadata().catch(() => { throw new ApiError("invalid-argument", `Faili la ${String(field.label ?? name).toLowerCase()} halijapatikana.`); });
    const allowed = Array.isArray(field.accept) ? field.accept : String(field.type) === "IMAGE_UPLOAD" ? ["image/jpeg", "image/png", "image/webp"] : [];
    const maxSize = Math.min(Number(field.maxSizeMb ?? 5), 10) * 1024 * 1024;
    if (Number(metadata.size) > maxSize || (allowed.length && !allowed.includes(String(metadata.contentType)))) throw new ApiError("invalid-argument", `Aina au ukubwa wa ${String(field.label ?? name).toLowerCase()} haurusiwi.`);
    const originalName = pathValue.split("/").pop()?.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80) ?? "document";
    const finalPath = `lipaApplications/${applicationId}/documents/${name}-${originalName}`;
    sourcePaths.push(pathValue);
    await sourceFile.copy(bucket.file(finalPath));
    finalPaths.push(finalPath);
    applicantData[name] = finalPath;
  }
  const applicationRef = db.collection("lipaApplications").doc(applicationId);
  const values = objectValue(data.values, "Fomu");
  await db.runTransaction(async (transaction) => {
    const openSnapshot = await transaction.get(openRef);
    if (openSnapshot.exists) throw new ApiError("already-exists", "Una ombi la mtandao huu ambalo bado linasubiri kukamilika.", { applicationId: openSnapshot.data()?.applicationId });
    const existingApplication = await transaction.get(applicationRef);
    if (existingApplication.exists) throw new ApiError("already-exists", "Namba hii ya ombi tayari imetumika.");
    const application = {
      applicationId, userId: uid, userName: String(profile.name ?? ""), network: String(config.name ?? networkId), networkId, serviceId: "pata-lipa-namba",
      applicantName: [applicantData.firstName, applicantData.middleName, applicantData.lastName].filter(Boolean).join(" "),
      phone: String(applicantData.phone ?? ""), businessName: String(applicantData.businessName ?? ""), nidaNumber: String(applicantData.nidaNumber ?? ""), tinNumber: String(applicantData.tinNumber ?? ""),
      businessLicense: String(applicantData.businessLicense ?? ""), idDocumentUrl: String(applicantData.idDocument ?? ""), idDocumentType: String(applicantData.idDocumentType ?? ""), applicantData,
      reward: Number(config.reward ?? 0), status: "PENDING", rejectionReason: "", submittedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp(),
    };
    transaction.create(applicationRef, application);
    transaction.create(openRef, { applicationId, userId: uid, networkId, createdAt: FieldValue.serverTimestamp() });
    transaction.set(db.collection("messages").doc(), { recipientId: uid, subject: "Ombi la Lipa Namba limepokelewa", body: `Maombi yako ya ${String(config.name ?? networkId)} yametumwa kikamilifu na yanasubiri kukaguliwa.`, type: "lipaApplication", applicationId, createdAt: FieldValue.serverTimestamp() });
  });
  await Promise.all(sourcePaths.map((file) => bucket.file(file).delete().catch(() => undefined)));
  return { applicationId, status: "PENDING" };
  } catch (error) {
    await Promise.all(finalPaths.map((file) => bucket.file(file).delete().catch(() => undefined)));
    throw error;
  }
});

export const setLipaApplicationStatus = callable(async (request) => {
  const uid = authUid(request);
  const actor = await profileFor(uid);
  requirePermission(actor, "manageLipaApplications");
  const data = objectValue(request.data, "Mabadiliko ya status");
  const applicationId = text(data.applicationId, 80);
  const status = String(data.status ?? "");
  if (!["PROCESSING", "APPROVED", "REJECTED"].includes(status)) throw new ApiError("invalid-argument", "Status si sahihi.");
  const rejectionReason = typeof data.rejectionReason === "string" ? data.rejectionReason.trim().slice(0, 1000) : "";
  if (status === "REJECTED" && rejectionReason.length < 3) throw new ApiError("invalid-argument", "Andika sababu ya kukataliwa kabla ya kuendelea.");
  const ref = db.collection("lipaApplications").doc(applicationId);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new ApiError("not-found", "Ombi halikupatikana.");
    const application = snapshot.data()!;
    const from = String(application.status ?? "PENDING");
    const allowed = (status === "PROCESSING" && from === "PENDING") || ((status === "APPROVED" || status === "REJECTED") && from === "PROCESSING");
    if (!allowed) throw new ApiError("failed-precondition", `Mabadiliko kutoka ${from} kwenda ${status} hayaruhusiwi.`);
    const now = FieldValue.serverTimestamp();
    const patch: Record<string, unknown> = { status, updatedAt: now, assignedAdmin: application.assignedAdmin ?? uid };
    if (status === "PROCESSING") Object.assign(patch, { processedAt: now, processedBy: uid });
    if (status === "APPROVED") Object.assign(patch, { approvedAt: now, approvedBy: uid });
    if (status === "REJECTED") Object.assign(patch, { rejectionReason, rejectedAt: now, rejectedBy: uid });
    transaction.update(ref, patch);
    if (status === "APPROVED" || status === "REJECTED") transaction.delete(db.collection("lipaOpenApplications").doc(`${application.userId}_${application.networkId}`));
    const reasonSuffix = status === "REJECTED" ? ` Sababu: ${rejectionReason}` : "";
    transaction.set(db.collection("messages").doc(), { recipientId: application.userId, subject: `Hali ya ombi la ${application.network}`, body: status === "PROCESSING" ? "Maombi yako yanafanyiwa kazi na Admin." : status === "APPROVED" ? "Maombi yako yamekubaliwa." : `Maombi yako yamekataliwa.${reasonSuffix}`, type: "lipaApplicationStatus", applicationId, status, rejectionReason: status === "REJECTED" ? rejectionReason : "", createdAt: now });
    const auditRef = db.collection("auditLogs").doc();
    transaction.create(auditRef, { action: status === "PROCESSING" ? "LIPA_APPLICATION_PROCESSING" : status === "APPROVED" ? "LIPA_APPLICATION_APPROVED" : "LIPA_APPLICATION_REJECTED", actorId: uid, actorRole: String(actor.role), applicationId, targetUserId: String(application.userId), reason: status === "REJECTED" ? rejectionReason : "", createdAt: now });
    recordAudit(transaction, uid, String(actor.role), `LIPA_APPLICATION_${status}`, "lipaApplication", applicationId, { status: from }, { status }, { reason: status === "REJECTED" ? rejectionReason : "" });
    return { applicationId, status };
  });
});

export const markLipaApplicationViewed = callable(async (request) => {
  const uid = authUid(request);
  const actor = await profileFor(uid);
  requirePermission(actor, "manageLipaApplications");
  const applicationId = text((request.data as Record<string, unknown> | undefined)?.applicationId, 80);
  const snapshot = await db.collection("lipaApplications").doc(applicationId).get();
  if (!snapshot.exists) throw new ApiError("not-found", "Ombi halikupatikana.");
  const application = snapshot.data()!;
  const now = FieldValue.serverTimestamp();
  const auditRef = db.collection("auditLogs").doc();
  await auditRef.create({ action: "LIPA_APPLICATION_VIEWED", actorId: uid, actorRole: String(actor.role), applicationId, targetUserId: String(application.userId), reason: "", createdAt: now });
  return { ok: true };
});

export const getLipaApplicationDocument = callable(async (request) => {
  const uid = authUid(request);
  const actor = await profileFor(uid);
  const data = objectValue(request.data, "Taarifa za faili");
  const applicationId = text(data.applicationId, 80);
  const fieldName = text(data.fieldName, 64);
  if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(fieldName)) throw new ApiError("invalid-argument", "Field ya faili si sahihi.");
  const snapshot = await db.collection("lipaApplications").doc(applicationId).get();
  if (!snapshot.exists) throw new ApiError("not-found", "Ombi halikupatikana.");
  const application = snapshot.data()!;
  if (application.userId !== uid) requirePermission(actor, "manageLipaApplications");
  const storagePath = String((application.applicantData as Record<string, unknown> | undefined)?.[fieldName] ?? "");
  if (!storagePath.startsWith(`lipaApplications/${applicationId}/documents/`)) throw new ApiError("not-found", "Faili halikupatikana.");
  const [url] = await bucket.file(storagePath).getSignedUrl({ action: "read", expires: Date.now() + 5 * 60 * 1000 });
  return { url, expiresAt: Date.now() + 5 * 60 * 1000 };
});

export const createServiceApplication = callable(async (request) => {
  const uid = authUid(request);
  const profile = await profileFor(uid);
  if (profile.accountStatus === "blocked" || profile.accountStatus === "deleted") throw new ApiError("permission-denied", "Akaunti hii imezuiwa.");
  const data = objectValue(request.data, "Ombi la huduma");
  const serviceSlug = text(data.serviceSlug, 120);
  const applicationId = text(data.applicationId, 80);
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(applicationId)) throw new ApiError("invalid-argument", "Namba ya ombi si sahihi.");
  const serviceSnapshot = await db.collection("services").where("slug", "==", serviceSlug).limit(1).get();
  if (serviceSnapshot.empty) throw new ApiError("not-found", "Huduma haikupatikana.");
  const service = serviceSnapshot.docs[0]?.data();
  if (!service) throw new ApiError("not-found", "Huduma haikupatikana.");
  if (service.active === false || service.isVisible === false) throw new ApiError("failed-precondition", "Huduma hii haipatikani kwa sasa.");
  if (serviceSlug === "pata-lipa-namba" || serviceSlug === "leseni-biashara") throw new ApiError("failed-precondition", "Tumia fomu maalum ya huduma hii.");
  const fields = Array.isArray(service.fields) ? service.fields as Array<Record<string, unknown>> : [];
  const applicantData = cleanApplicationValues(objectValue(data.values, "Fomu"), fields, uid, applicationId, "serviceUploads");
  const finalPaths: string[] = [];
  const sourcePaths: string[] = [];
  for (const field of fields) {
    const name = String(field.fieldName ?? "");
    const filePath = applicantData[name];
    if (!["IMAGE_UPLOAD", "FILE_UPLOAD"].includes(String(field.type)) || typeof filePath !== "string") continue;
    const [metadata] = await bucket.file(filePath).getMetadata().catch(() => { throw new ApiError("invalid-argument", `Faili la ${String(field.label ?? name)} halijapatikana.`); });
    const allowed = Array.isArray(field.accept) ? field.accept : String(field.type) === "IMAGE_UPLOAD" ? ["image/jpeg", "image/png", "image/webp"] : ["application/pdf"];
    if (Number(metadata.size) > Math.min(Number(field.maxSizeMb ?? 5), 10) * 1024 * 1024 || (allowed.length && !allowed.includes(String(metadata.contentType)))) throw new ApiError("invalid-argument", `Aina au ukubwa wa ${String(field.label ?? name)} haurusiwi.`);
    const originalName = filePath.split("/").pop()?.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80) ?? "document";
    const finalPath = `serviceApplications/${applicationId}/documents/${name}-${originalName}`;
    sourcePaths.push(filePath);
    await bucket.file(filePath).copy(bucket.file(finalPath));
    finalPaths.push(finalPath);
    applicantData[name] = finalPath;
  }
  const applicationRef = db.collection("serviceApplications").doc(applicationId);
  const openRef = db.collection("serviceOpenApplications").doc(`${uid}_${serviceSlug}`);
  const tokenCost = Number(service.isFree === true ? 0 : service.tokenCost);
  if (!Number.isSafeInteger(tokenCost) || tokenCost < 0 || tokenCost > 100000) throw new ApiError("failed-precondition", "Gharama ya huduma haijawekwa sawa.");
  try {
  const result = await db.runTransaction(async (transaction) => {
    const prior = await transaction.get(applicationRef);
    if (prior.exists) {
      if (prior.data()?.userId === uid && prior.data()?.serviceSlug === serviceSlug) return { applicationId, status: prior.data()?.status ?? "PENDING", duplicate: true };
      throw new ApiError("already-exists", "Namba hii ya ombi tayari imetumika.");
    }
    const open = await transaction.get(openRef);
    if (open.exists) throw new ApiError("already-exists", "Una ombi la huduma hii ambalo bado linaendelea.", { applicationId: open.data()?.applicationId });
    if (await serviceIsLocked(transaction, serviceSlug)) throw new ApiError("failed-precondition", "Huduma hii imefungwa kwa sasa.");
    const userRef = db.collection("users").doc(uid);
    const userSnapshot = await transaction.get(userRef);
    const user = userSnapshot.data() as Profile | undefined;
    if (!user) throw new ApiError("permission-denied", "Profile haikupatikana.");
    let balanceAfter: number | null = null;
    let ledgerRef: DocumentReference | null = null;
    if (tokenCost > 0) {
      if (user.verificationStatus !== "approved") throw new ApiError("permission-denied", "Akaunti yako haijathibitishwa na admin.");
      const before = Number(user.tokenBalance ?? 0);
      if (!Number.isSafeInteger(before) || before < tokenCost) throw new ApiError("failed-precondition", "Tokeni hazitoshi kutumia huduma hii.");
      balanceAfter = before - tokenCost;
      transaction.update(userRef, { tokenBalance: balanceAfter, updatedAt: FieldValue.serverTimestamp() });
      ledgerRef = db.collection("tokenTransactions").doc(applicationId);
      transaction.create(ledgerRef, { transactionId: applicationId, reference: applicationId, userId: uid, actorId: uid, type: "service_usage", amount: -tokenCost, balanceBefore: before, balanceAfter, reason: `Ombi la ${String(service.name ?? serviceSlug)}`, serviceId: serviceSlug, serviceName: String(service.name ?? serviceSlug), createdAt: FieldValue.serverTimestamp(), status: "completed" });
    }
    transaction.create(applicationRef, { applicationId, userId: uid, userName: String(user.name ?? ""), serviceSlug, serviceName: String(service.name ?? serviceSlug), serviceFields: fields, statusOptions: Array.isArray(service.statusOptions) ? service.statusOptions : ["PENDING", "PROCESSING", "APPROVED", "REJECTED"], applicantData, status: "PENDING", submittedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp(), ...(balanceAfter !== null ? { balanceAfter } : {}) });
    transaction.create(openRef, { applicationId, userId: uid, serviceSlug, createdAt: FieldValue.serverTimestamp() });
    transaction.set(db.collection("messages").doc(), { recipientId: uid, subject: `Ombi la ${String(service.name ?? serviceSlug)} limepokelewa`, body: "Maombi yako yametumwa kikamilifu na yanasubiri kukaguliwa.", type: "serviceApplication", applicationId, createdAt: FieldValue.serverTimestamp() });
    return { applicationId, status: "PENDING", balanceAfter, reference: ledgerRef?.id ?? applicationId, duplicate: false };
  });
  if (result.duplicate) await Promise.all(finalPaths.map((file) => bucket.file(file).delete().catch(() => undefined)));
  await Promise.all(sourcePaths.map((file) => bucket.file(file).delete().catch(() => undefined)));
  return result;
  } catch (error) {
    await Promise.all(finalPaths.map((file) => bucket.file(file).delete().catch(() => undefined)));
    throw error;
  }
});

export const setServiceApplicationStatus = callable(async (request) => {
  const uid = authUid(request);
  const actor = await profileFor(uid);
  requirePermission(actor, "manageServices");
  const data = objectValue(request.data, "Hali ya ombi");
  const applicationId = text(data.applicationId, 80);
  const status = text(data.status, 40);
  if (status === "PENDING") throw new ApiError("invalid-argument", "Hali PENDING huwekwa ombi linapotumwa.");
  const rejectionReason = typeof data.rejectionReason === "string" ? data.rejectionReason.trim().slice(0, 1000) : "";
  if (status === "REJECTED" && rejectionReason.length < 3) throw new ApiError("invalid-argument", "Sababu ya kukataliwa inahitajika.");
  const ref = db.collection("serviceApplications").doc(applicationId);
  const applicationSnapshot = await ref.get();
  if (!applicationSnapshot.exists) throw new ApiError("not-found", "Ombi halikupatikana.");
  const applicationBefore = applicationSnapshot.data()!;
  const serviceSnapshot = await db.collection("services").where("slug", "==", applicationBefore.serviceSlug).limit(1).get();
  const service = serviceSnapshot.docs[0]?.data();
  const statusOptions = Array.isArray(service?.statusOptions) ? service.statusOptions : Array.isArray(applicationBefore.statusOptions) ? applicationBefore.statusOptions : ["PENDING", "PROCESSING", "APPROVED", "REJECTED"];
  if (!statusOptions.includes(status)) throw new ApiError("failed-precondition", "Hali hii haipo kwenye status options za huduma.");
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new ApiError("not-found", "Ombi halikupatikana.");
    const application = snapshot.data()!;
    const from = String(application.status ?? "PENDING");
    const terminal = ["APPROVED", "REJECTED"].includes(from);
    if (terminal || status === from) throw new ApiError("failed-precondition", `Mabadiliko ya ${from} kwenda ${status} hayaruhusiwi.`);
    const now = FieldValue.serverTimestamp();
    const patch: Record<string, unknown> = { status, updatedAt: now, assignedAdmin: application.assignedAdmin ?? uid };
    if (status === "PROCESSING") Object.assign(patch, { processedAt: now, processedBy: uid });
    if (status === "APPROVED") Object.assign(patch, { approvedAt: now, approvedBy: uid });
    if (status === "REJECTED") Object.assign(patch, { rejectedAt: now, rejectedBy: uid, rejectionReason });
    transaction.update(ref, patch);
    if (["APPROVED", "REJECTED"].includes(status)) transaction.delete(db.collection("serviceOpenApplications").doc(`${application.userId}_${application.serviceSlug}`));
    const body = status === "PROCESSING" ? "Maombi yako yanafanyiwa kazi na Admin." : status === "APPROVED" ? "Maombi yako yamekubaliwa." : status === "REJECTED" ? `Maombi yako yamekataliwa. Sababu: ${rejectionReason}` : `Hali ya ombi lako imebadilishwa kuwa ${status}.`;
    transaction.set(db.collection("messages").doc(), { recipientId: application.userId, subject: `Hali ya ombi la ${application.serviceName}`, body, type: "serviceApplicationStatus", applicationId, status, rejectionReason: status === "REJECTED" ? rejectionReason : "", createdAt: now });
    const auditRef = db.collection("auditLogs").doc();
    transaction.create(auditRef, { action: `SERVICE_APPLICATION_${status}`, actorId: uid, actorRole: String(actor.role), applicationId, targetUserId: String(application.userId), reason: status === "REJECTED" ? rejectionReason : "", createdAt: now });
    recordAudit(transaction, uid, String(actor.role), `SERVICE_APPLICATION_${status}`, "serviceApplication", applicationId, { status: from }, { status }, { reason: status === "REJECTED" ? rejectionReason : "" });
    return { applicationId, status };
  });
});

export const markServiceApplicationViewed = callable(async (request) => {
  const uid = authUid(request);
  const actor = await profileFor(uid);
  requirePermission(actor, "manageServices");
  const applicationId = text((request.data as Record<string, unknown> | undefined)?.applicationId, 80);
  const snapshot = await db.collection("serviceApplications").doc(applicationId).get();
  if (!snapshot.exists) throw new ApiError("not-found", "Ombi halikupatikana.");
  const application = snapshot.data()!;
  await db.collection("auditLogs").add({ action: "SERVICE_APPLICATION_VIEWED", actorId: uid, actorRole: String(actor.role), applicationId, targetUserId: String(application.userId), createdAt: FieldValue.serverTimestamp() });
  return { ok: true };
});

export const getServiceApplicationDocument = callable(async (request) => {
  const uid = authUid(request);
  const actor = await profileFor(uid);
  const data = objectValue(request.data, "Taarifa za faili");
  const applicationId = text(data.applicationId, 80);
  const fieldName = text(data.fieldName, 64);
  if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(fieldName)) throw new ApiError("invalid-argument", "Field ya faili si sahihi.");
  const snapshot = await db.collection("serviceApplications").doc(applicationId).get();
  if (!snapshot.exists) throw new ApiError("not-found", "Ombi halikupatikana.");
  const application = snapshot.data()!;
  if (application.userId !== uid) {
    requirePermission(actor, "manageServices");
    await db.collection("auditLogs").add({ action: "SERVICE_APPLICATION_DOCUMENT_VIEWED", actorId: uid, actorRole: String(actor.role), applicationId, targetUserId: String(application.userId), fieldName, createdAt: FieldValue.serverTimestamp() });
  }
  const storagePath = String((application.applicantData as Record<string, unknown> | undefined)?.[fieldName] ?? "");
  if (!storagePath.startsWith(`serviceApplications/${applicationId}/documents/`)) throw new ApiError("not-found", "Faili halikupatikana.");
  const [url] = await bucket.file(storagePath).getSignedUrl({ action: "read", expires: Date.now() + 5 * 60 * 1000 });
  return { url, expiresAt: Date.now() + 5 * 60 * 1000 };
});

export const updateUserAccess = callable(async (request) => {
  const uid = authUid(request);
  const actor = await profileFor(uid);
  requirePermission(actor, "manageUsers");
  const data = (request.data ?? {}) as Record<string, unknown>;
  const userId = text(data.userId, 180);
  const targetRef = db.collection("users").doc(userId);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(targetRef);
    if (!snapshot.exists) throw new ApiError("not-found", "Mtumiaji hakupatikana.");
    const target = snapshot.data() as Profile;
    const targetRole = resolveAuthRole(target.role, target.phone, getWorkerEnv().SUPER_ADMIN_PHONE ?? "255698232313").role;
    if (targetRole === "super_admin" || data.role === "super_admin") throw new ApiError("permission-denied", "Mabadiliko ya Super Admin yanahitaji workflow maalum.");
    const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (data.role !== undefined) {
      if (!roles.includes(data.role as Role) || data.role === "super_admin") throw new ApiError("invalid-argument", "Role si sahihi.");
      patch.role = data.role;
    }
    if (data.permissions !== undefined) {
      if (typeof data.permissions !== "object" || data.permissions === null) throw new ApiError("invalid-argument", "Permissions si sahihi.");
      const next = data.permissions as Record<string, unknown>;
      if (Object.keys(next).some((key) => !permissions.includes(key as typeof permissions[number]) || typeof next[key] !== "boolean")) throw new ApiError("invalid-argument", "Permission haijulikani.");
      patch.permissions = next;
    }
    if (Object.keys(patch).length === 1) throw new ApiError("invalid-argument", "Hakuna mabadiliko yaliyotumwa.");
    transaction.update(targetRef, patch);
    recordAudit(transaction, uid, String(actor.role), "UPDATE_USER_ACCESS", "user", userId, { role: target.role, permissions: target.permissions ?? {} }, { role: patch.role ?? target.role, permissions: patch.permissions ?? target.permissions ?? {} });
    return { ok: true };
  });
});

export const syncAuthClaims = callable(async (request) => {
  const uid = authUid(request);
  const profileRef = db.collection("users").doc(uid);
  const snapshot = await profileRef.get();
  if (!snapshot.exists) throw new ApiError("failed-precondition", "Profile ya akaunti bado haijapatikana.");
  const profile = snapshot.data() as Profile;
  const resolution = resolveAuthRole(profile.role, profile.phone, getWorkerEnv().SUPER_ADMIN_PHONE ?? "255698232313");
  const role = resolution.role;
  if (resolution.shouldPromote) {
    await profileRef.update({
      role: "super_admin",
      permissions: {},
      verificationStatus: "approved",
      accountStatus: "active",
      updatedAt: FieldValue.serverTimestamp(),
    });
  } else if (resolution.shouldDemote) {
    await profileRef.update({ role: "user", permissions: {}, updatedAt: FieldValue.serverTimestamp() });
  }
  const safePermissions = role === "user" || role === "super_admin"
    ? {}
    : Object.fromEntries(permissions.filter((key) => profile.permissions?.[key] === true).map((key) => [key, true]));
  const customAttributes = JSON.stringify({ role, permissions: safePermissions, isSuperAdmin: role === "super_admin" });
  if (customAttributes.length > 1000) throw new ApiError("failed-precondition", "Role claims zimezidi ukubwa unaoruhusiwa.");
  const projectId = getWorkerEnv().FIREBASE_PROJECT_ID;
  const accessToken = await getGoogleAccessToken();
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/accounts:update`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ localId: uid, customAttributes }),
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json().catch(() => null) as { localId?: unknown; error?: { message?: unknown } } | null;
  if (!response.ok || result?.localId !== uid) {
    console.error("Firebase Auth custom-claim sync failed", { uid, code: String(result?.error?.message ?? response.status) });
    throw new ApiError("unavailable", "Role ya akaunti haikuweza kusawazishwa sasa hivi.");
  }
  return { role, permissions: safePermissions, isSuperAdmin: role === "super_admin" };
});

export const findChatUser = callable(async (request) => {
  const uid = authUid(request);
  const data = (request.data ?? {}) as Record<string, unknown>;
  const phone = normalizeTanzaniaPhone(data.phone);
  if (!phone) throw new ApiError("invalid-argument", "Weka namba halali ya simu ya Tanzania.");
  if (normalizeTanzaniaPhone((await profileFor(uid)).phone) === phone) throw new ApiError("invalid-argument", "Huwezi kuanzisha mazungumzo na akaunti yako mwenyewe.");
  const matches = await db.collection("users").where("phone", "==", phone).limit(1).get();
  const target = matches.docs[0];
  if (!target) throw new ApiError("not-found", "Hakuna akaunti iliyopatikana kwa namba hiyo.");
  const user = target.data() as Profile;
  if (user.accountStatus === "blocked") throw new ApiError("failed-precondition", "Akaunti hii haipatikani kwa sasa.");
  return { uid: target.id, name: String(user.name ?? "Mwanachama"), phone };
});

export const claimRegistrationPhone = callable(async (request) => {
  const uid = authUid(request);
  const data = (request.data ?? {}) as Record<string, unknown>;
  const phone = normalizeTanzaniaPhone(data.phone);
  if (!phone) throw new ApiError("invalid-argument", "Namba ya simu ya Tanzania si sahihi.");
  if (request.auth?.email !== phoneAuthAlias(phone)) throw new ApiError("permission-denied", "Namba ya simu haiendani na akaunti hii.");

  const registryRef = db.collection("phoneRegistry").doc(phone);
  await db.runTransaction(async (transaction) => {
    const registry = await transaction.get(registryRef);
    const profiles = await transaction.get(db.collection("users").where("phone", "==", phone).limit(2));
    if (profiles.docs.some((profile) => profile.id !== uid)) {
      throw new ApiError("already-exists", "Namba hii tayari imesajiliwa. Tafadhali ingia kwenye akaunti yako.");
    }
    if (registry.exists && registry.data()?.uid !== uid) {
      throw new ApiError("already-exists", "Namba hii tayari imesajiliwa. Tafadhali ingia kwenye akaunti yako.");
    }
    if (!registry.exists) transaction.create(registryRef, { uid, phone, createdAt: FieldValue.serverTimestamp() });
  });
  return { ok: true };
});

export const changeOwnPassword = callable(async (request) => {
  const uid = authUid(request);
  const profile = await profileFor(uid);
  if (profile.mustChangePassword !== true) throw new ApiError("failed-precondition", "Akaunti hii haihitaji kubadilisha password ya muda.");
  const data = (request.data ?? {}) as Record<string, unknown>;
  const password = data.password;
  if (typeof password !== "string" || password.length < 6 || password.length > 128) {
    throw new ApiError("invalid-argument", "Password mpya iwe na herufi 6 hadi 128.");
  }

  const projectId = getWorkerEnv().FIREBASE_PROJECT_ID;
  const accessToken = await getGoogleAccessToken();
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/accounts:update`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ localId: uid, password }),
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json().catch(() => null) as { localId?: unknown; error?: { message?: unknown } } | null;
  if (!response.ok || result?.localId !== uid) {
    const code = String(result?.error?.message ?? "AUTH_UPDATE_FAILED");
    if (code.includes("WEAK_PASSWORD") || code.includes("PASSWORD_DOES_NOT_MEET_REQUIREMENTS")) throw new ApiError("invalid-argument", "Password mpya haikidhi masharti ya Firebase.");
    if (code.includes("USER_NOT_FOUND") || code.includes("EMAIL_NOT_FOUND")) throw new ApiError("not-found", "Akaunti ya Authentication haikupatikana.");
    console.error("Firebase Auth password update failed", { uid, code, status: response.status });
    throw new ApiError("unavailable", "Password haikuweza kusasishwa sasa hivi. Jaribu tena.");
  }

  const profileRef = db.collection("users").doc(uid);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(profileRef);
    if (!snapshot.exists) throw new ApiError("not-found", "Profile ya akaunti haijapatikana.");
    transaction.update(profileRef, { mustChangePassword: false, passwordChangedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  });
  return { ok: true };
});

export const resetUserPassword = callable(async (request) => {
  const uid = authUid(request);
  const actor = await profileFor(uid);
  requirePermission(actor, "manageUsers");
  const data = (request.data ?? {}) as Record<string, unknown>;
  const userId = text(data.userId, 180);
  const temporaryPassword = text(data.temporaryPassword, 128);
  if (temporaryPassword.length < 8) throw new ApiError("invalid-argument", "Password ya muda iwe na angalau herufi 8.");
  const targetRef = db.collection("users").doc(userId);
  const targetSnapshot = await targetRef.get();
  if (!targetSnapshot.exists) throw new ApiError("not-found", "Mtumiaji hakupatikana.");
  const target = targetSnapshot.data() as Profile;
  const targetRole = resolveAuthRole(target.role, target.phone, getWorkerEnv().SUPER_ADMIN_PHONE ?? "255698232313").role;
  if (targetRole === "super_admin" || userId === uid) throw new ApiError("permission-denied", "Akaunti hii haiwezi resetiwa na admin kupitia workflow hii.");
  const projectId = getWorkerEnv().FIREBASE_PROJECT_ID;
  const accessToken = await getGoogleAccessToken();
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/accounts:update`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ localId: userId, password: temporaryPassword, validSince: String(Math.floor(Date.now() / 1000)) }),
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json().catch(() => null) as { localId?: unknown; error?: { message?: unknown } } | null;
  if (!response.ok || result?.localId !== userId) {
    const code = String(result?.error?.message ?? "AUTH_UPDATE_FAILED");
    if (code.includes("USER_NOT_FOUND")) throw new ApiError("not-found", "Akaunti ya Authentication haikupatikana.");
    if (code.includes("WEAK_PASSWORD")) throw new ApiError("invalid-argument", "Password ya muda ni dhaifu.");
    throw new ApiError("internal", "Imeshindikana kuweka password mpya ya muda.");
  }
  await db.runTransaction(async (transaction) => {
    transaction.update(targetRef, { mustChangePassword: true, passwordResetAt: FieldValue.serverTimestamp(), passwordResetBy: uid, updatedAt: FieldValue.serverTimestamp() });
    recordAudit(transaction, uid, String(actor.role), "RESET_USER_PASSWORD", "user", userId, { mustChangePassword: target.mustChangePassword === true }, { mustChangePassword: true });
  });
  return { ok: true, mustChangePassword: true };
});

export const setAccountStatus = callable(async (request) => {
  const uid = authUid(request);
  const actor = await profileFor(uid);
  requirePermission(actor, "manageUsers");
  const data = (request.data ?? {}) as Record<string, unknown>;
  const userId = text(data.userId, 180);
  const status = data.status;
  if (!['active', 'blocked', 'deleted'].includes(String(status))) throw new ApiError("invalid-argument", "Account status si sahihi.");
  if (userId === uid) throw new ApiError("permission-denied", "Huwezi kubadilisha status ya akaunti yako mwenyewe.");
  const targetRef = db.collection("users").doc(userId);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(targetRef);
    if (!snapshot.exists) throw new ApiError("not-found", "Mtumiaji hakupatikana.");
    const target = snapshot.data() as Profile;
    const targetRole = resolveAuthRole(target.role, target.phone, getWorkerEnv().SUPER_ADMIN_PHONE ?? "255698232313").role;
    if (targetRole === "super_admin") throw new ApiError("permission-denied", "Super Admin inalindwa.");
    transaction.update(targetRef, { accountStatus: status, updatedAt: FieldValue.serverTimestamp() });
    recordAudit(transaction, uid, String(actor.role), "SET_ACCOUNT_STATUS", "user", userId, { accountStatus: target.accountStatus ?? "active" }, { accountStatus: status });
    return { ok: true };
  });
});

export const verifyUser = callable(async (request) => {
  const uid = authUid(request);
  const actor = await profileFor(uid);
  requirePermission(actor, "manageUsers");
  const data = (request.data ?? {}) as Record<string, unknown>;
  const userId = text(data.userId, 180);
  const status = data.status;
  if (!['approved', 'rejected', 'pending'].includes(String(status))) throw new ApiError("invalid-argument", "Verification status si sahihi.");
  const targetRef = db.collection("users").doc(userId);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(targetRef);
    if (!snapshot.exists) throw new ApiError("not-found", "Mtumiaji hakupatikana.");
    const target = snapshot.data() as Profile;
    transaction.update(targetRef, { verificationStatus: status, updatedAt: FieldValue.serverTimestamp() });
    recordAudit(transaction, uid, String(actor.role), "VERIFY_USER", "user", userId, { verificationStatus: target.verificationStatus ?? "pending" }, { verificationStatus: status });
    return { ok: true };
  });
});

type LicenseRequest = {
  requestId?: unknown;
  firstName?: unknown; middleName?: unknown; lastName?: unknown;
  businessType?: unknown; otherBusinessType?: unknown;
  licenseType?: unknown; principalBranch?: unknown; region?: unknown; district?: unknown;
  ward?: unknown; street?: unknown; tin?: unknown; licenseFee?: unknown;
};

function cleanText(value: unknown, label: string, max = 180) {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > max || /[\r\n]/.test(value)) throw new ApiError("invalid-argument", `${label} si sahihi.`);
  return value.trim();
}

const BUSINESS_LICENSE_PREFIX = "BL01396902025-26000";
const BUSINESS_LICENSE_COUNTER_ID = "BL01396902025-26000";
const FIRST_BUSINESS_LICENSE_SUFFIX = 35809;

function formatBusinessLicenseNumber(suffix: number) {
  return `${BUSINESS_LICENSE_PREFIX}${String(suffix).padStart(5, "0")}`;
}
function titleCaseLocation(value: string) {
  return value.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, prefix, letter) => `${prefix}${letter.toUpperCase()}`);
}

function normalizeLicenseRequest(data: LicenseRequest) {
  const form = {
    firstName: cleanText(data.firstName, "Jina la kwanza", 80).toUpperCase(),
    middleName: cleanText(data.middleName, "Jina la pili", 80).toUpperCase(),
    lastName: cleanText(data.lastName, "Jina la mwisho", 80).toUpperCase(),
    businessType: cleanText(data.businessType, "Aina ya biashara", 100).toUpperCase(),
    otherBusinessType: typeof data.otherBusinessType === "string" ? data.otherBusinessType.trim().slice(0, 100).toUpperCase() : "",
    licenseType: data.licenseType === "NEW LICENCE" || data.licenseType === "RENEWED LICENCE" ? data.licenseType : "",
    principalBranch: data.principalBranch === "PRINCIPAL" || data.principalBranch === "BRANCH" ? data.principalBranch : "",
    region: titleCaseLocation(cleanText(data.region, "Mkoa", 80)),
    district: "DAR ES SALAAM",
    ward: titleCaseLocation(cleanText(data.ward, "Kata", 100)),
    street: titleCaseLocation(cleanText(data.street, "Mtaa / Kijiji", 140)),
    tin: cleanText(data.tin, "TIN", 40).toUpperCase(),
    licenseFee: Number(data.licenseFee),
  };
  if (!form.licenseType) throw new ApiError("invalid-argument", "Chagua aina ya leseni.");
  if (!form.principalBranch) throw new ApiError("invalid-argument", "Chagua Principal au Branch.");
  if (form.businessType === "OTHER" && !form.otherBusinessType) throw new ApiError("invalid-argument", "Eleza aina ya biashara.");
  if (!/^\d{3}-\d{3}-\d{3}$/.test(form.tin)) throw new ApiError("invalid-argument", "Format ya TIN si sahihi. Tumia mfumo 123-123-123.");
  if (!Number.isFinite(form.licenseFee) || form.licenseFee < 0 || form.licenseFee > 100000000) throw new ApiError("invalid-argument", "Malipo ya leseni si sahihi.");
  return form;
}

function licenseFormFromApplication(application: Record<string, any>) {
  if (application.licenseForm && typeof application.licenseForm === "object") return application.licenseForm as Record<string, unknown>;
  return {
    firstName: String(application.applicantData?.firstName ?? ""), middleName: String(application.applicantData?.middleName ?? ""), lastName: String(application.applicantData?.lastName ?? ""),
    businessType: String(application.businessData?.businessType ?? ""), otherBusinessType: String(application.businessData?.otherBusinessType ?? ""),
    licenseType: String(application.licenseData?.licenseType ?? "NEW LICENCE"), principalBranch: String(application.licenseData?.principalBranch ?? "PRINCIPAL"),
    region: String(application.locationData?.region ?? ""), district: String(application.locationData?.district ?? "DAR ES SALAAM"), ward: String(application.locationData?.ward ?? ""), street: String(application.locationData?.street ?? ""),
    tin: String(application.businessData?.tin ?? ""), licenseFee: Number(application.licenseData?.licenseFee ?? 0),
  };
}

function licenseDates() {
  const now = new Date();
  const issueDate = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
  const expiry = new Date(`${issueDate}T00:00:00Z`);
  expiry.setUTCFullYear(expiry.getUTCFullYear() + 1);
  const expiryDate = `${expiry.getUTCFullYear()}-${String(expiry.getUTCMonth() + 1).padStart(2, "0")}-${String(expiry.getUTCDate()).padStart(2, "0")}`;
  return { issueDate, expiryDate };
}

export const reserveBusinessLicenseNumber = callable(async (request) => {
  const uid = authUid(request);
  const reservationId = cleanText((request.data as { reservationId?: unknown } | undefined)?.reservationId ?? randomUUID(), "Reservation ID", 160);
  const reservationRef = db.collection("licenseNumberReservations").doc(reservationId);
  let licenseNumber = "";
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(reservationRef);
    if (existing.exists) {
      const current = existing.data()!;
      if (current.userId !== uid) throw new ApiError("already-exists", "Reservation ID si sahihi.");
      licenseNumber = String(current.licenseNumber);
      return;
    }
    if (await serviceIsLocked(transaction, "leseni-biashara")) throw new ApiError("failed-precondition", "Huduma ya Leseni ya Biashara imefungwa kwa sasa.");
    const counterRef = db.collection("licenseNumberCounters").doc(BUSINESS_LICENSE_COUNTER_ID);
    const counterSnapshot = await transaction.get(counterRef);
    const nextSuffix = counterSnapshot.exists ? Number(counterSnapshot.data()?.nextSuffix ?? FIRST_BUSINESS_LICENSE_SUFFIX) : FIRST_BUSINESS_LICENSE_SUFFIX;
    if (!Number.isInteger(nextSuffix) || nextSuffix < 0 || nextSuffix > 99999) throw new ApiError("resource-exhausted", "Namba za leseni zimejaa.");
    licenseNumber = formatBusinessLicenseNumber(nextSuffix);
    transaction.create(reservationRef, { reservationId, userId: uid, licenseNumber, prefix: BUSINESS_LICENSE_PREFIX, suffix: nextSuffix, status: "RESERVED", createdAt: FieldValue.serverTimestamp() });
    transaction.set(counterRef, { counterId: BUSINESS_LICENSE_COUNTER_ID, prefix: BUSINESS_LICENSE_PREFIX, nextSuffix: nextSuffix + 1, lastSuffix: nextSuffix, lastLicenseNumber: licenseNumber, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
  return { reservationId, licenseNumber };
});

export const generateBusinessLicense = callable(async (request) => {
  const uid = authUid(request);
  const data = (request.data ?? {}) as LicenseRequest;
  const requestId = cleanText(data.requestId ?? randomUUID(), "Request ID", 80);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    throw new ApiError("invalid-argument", "Request ID si sahihi.");
  }
  const form = normalizeLicenseRequest(data);
  const applicationRef = db.collection("licenseApplications").doc(requestId);
  const userRef = db.collection("users").doc(uid);
  const reservationRef = db.collection("licenseNumberReservations").doc(requestId);
  const dates = licenseDates();
  const preparation = await db.runTransaction(async (transaction) => {
    const existingSnapshot = await transaction.get(applicationRef);
    const existing = existingSnapshot.data() as Record<string, any> | undefined;
    if (existing && existing.userId !== uid) throw new ApiError("already-exists", "Request ID si sahihi.");
    if (existing?.status === "COMPLETED") {
      return {
        status: "COMPLETED", requestId, applicationId: existing.applicationId,
        licenseNumber: existing.licenseData?.licenseNumber ?? "", issueDate: existing.licenseData?.dateOfIssue ?? dates.issueDate,
        expiryDate: existing.licenseData?.expiryDate ?? dates.expiryDate,
        reference: existing.reference ?? "", duplicate: true, form: licenseFormFromApplication(existing),
      };
    }
    if (await serviceIsLocked(transaction, "leseni-biashara")) throw new ApiError("failed-precondition", "Huduma ya Leseni ya Biashara imefungwa kwa sasa.");
    const userSnapshot = await transaction.get(userRef);
    const profile = userSnapshot.data() as Profile | undefined;
    if (!profile || profile.accountStatus === "blocked" || profile.accountStatus === "deleted") throw new ApiError("permission-denied", "Akaunti hii imezuiwa.");
    if (profile.verificationStatus !== "approved") throw new ApiError("permission-denied", "Akaunti yako haijathibitishwa na admin.");
    if (Number(profile.tokenBalance ?? 0) < 2) throw new ApiError("failed-precondition", "Huna tokeni za kutosha kupakua hati hii. Unahitaji tokeni 2.");

    const reservationSnapshot = await transaction.get(reservationRef);
    let licenseNumber: string;
    if (reservationSnapshot.exists) {
      const reservation = reservationSnapshot.data()!;
      if (reservation.userId !== uid) throw new ApiError("permission-denied", "Reservation ID si sahihi.");
      licenseNumber = String(reservation.licenseNumber);
    } else {
      const counterRef = db.collection("licenseNumberCounters").doc(BUSINESS_LICENSE_COUNTER_ID);
      const counterSnapshot = await transaction.get(counterRef);
      const nextSuffix = counterSnapshot.exists ? Number(counterSnapshot.data()?.nextSuffix ?? FIRST_BUSINESS_LICENSE_SUFFIX) : FIRST_BUSINESS_LICENSE_SUFFIX;
      if (!Number.isInteger(nextSuffix) || nextSuffix < 0 || nextSuffix > 99999) throw new ApiError("resource-exhausted", "Namba za leseni zimejaa.");
      licenseNumber = formatBusinessLicenseNumber(nextSuffix);
      transaction.create(reservationRef, { reservationId: requestId, userId: uid, licenseNumber, prefix: BUSINESS_LICENSE_PREFIX, suffix: nextSuffix, status: "RESERVED", createdAt: FieldValue.serverTimestamp() });
      transaction.set(counterRef, { counterId: BUSINESS_LICENSE_COUNTER_ID, prefix: BUSINESS_LICENSE_PREFIX, nextSuffix: nextSuffix + 1, lastSuffix: nextSuffix, lastLicenseNumber: licenseNumber, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    const applicationId = String(existing?.applicationId ?? `APP-${randomUUID().replaceAll("-", "").slice(0, 18).toUpperCase()}`);
    const issueDate = String(existing?.licenseData?.dateOfIssue ?? dates.issueDate);
    const expiryDate = String(existing?.licenseData?.expiryDate ?? dates.expiryDate);
    const applicationData = {
      applicationId, requestId, userId: uid, templateId: "business-license-v1", serviceId: "leseni-biashara", licenseForm: form,
      applicantData: { firstName: form.firstName, middleName: form.middleName, lastName: form.lastName },
      businessData: { businessType: form.businessType, otherBusinessType: form.otherBusinessType, tin: form.tin },
      locationData: { region: form.region, district: form.district, ward: form.ward, street: form.street },
      licenseData: { licenseType: form.licenseType, principalBranch: form.principalBranch, licenseNumber, issuingOffice: "DAR ES SALAAM CITY COUNCIL", dateOfIssue: issueDate, expiryDate, licenseFee: form.licenseFee },
      storagePath: null, documentDelivery: "browser-download", status: "PROCESSING", updatedAt: FieldValue.serverTimestamp(),
      ...(existing?.createdAt ? {} : { createdAt: FieldValue.serverTimestamp() }),
    };
    if (existingSnapshot.exists) transaction.set(applicationRef, applicationData, { merge: true });
    else transaction.create(applicationRef, applicationData);
    return { status: "PROCESSING", requestId, applicationId, licenseNumber, issueDate, expiryDate, duplicate: Boolean(existing), form };
  });
  return preparation;
});

export const completeBusinessLicense = callable(async (request) => {
  const uid = authUid(request);
  const data = (request.data ?? {}) as { requestId?: unknown };
  const requestId = cleanText(data.requestId, "Request ID", 80);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) throw new ApiError("invalid-argument", "Request ID si sahihi.");
  const applicationRef = db.collection("licenseApplications").doc(requestId);
  const initialSnapshot = await applicationRef.get();
  if (!initialSnapshot.exists) throw new ApiError("not-found", "Ombi la leseni halijapatikana.");
  const initial = initialSnapshot.data()!;
  if (initial.userId !== uid) throw new ApiError("permission-denied", "Ombi la leseni halikubaliani na akaunti hii.");
  if (initial.status === "COMPLETED") return { status: "COMPLETED", requestId, applicationId: initial.applicationId, licenseNumber: String((initial.licenseData as Record<string, unknown> | undefined)?.licenseNumber ?? ""), reference: initial.reference ?? "", duplicate: true };
  if (initial.status !== "PROCESSING") throw new ApiError("failed-precondition", "Ombi hili haliwezi kukamilishwa kwa sasa.");

  const userRef = db.collection("users").doc(uid);
  const ledgerRef = db.collection("tokenTransactions").doc(`license_${requestId}`);
  const usageRef = db.collection("serviceUsage").doc(`license_${requestId}`);
  const result = await db.runTransaction(async (transaction) => {
    const applicationSnapshot = await transaction.get(applicationRef);
    const userSnapshot = await transaction.get(userRef);
    const priorLedger = await transaction.get(ledgerRef);
    const usageSnapshot = await transaction.get(usageRef);
    const application = applicationSnapshot.data() as Record<string, any> | undefined;
    if (!application || application.userId !== uid) throw new ApiError("permission-denied", "Ombi la leseni halikupatikana.");
    if (application.status === "COMPLETED") return { reference: String(application.reference ?? ledgerRef.id), duplicate: true };
    if (application.status !== "PROCESSING") throw new ApiError("failed-precondition", "Ombi hili haliwezi kukamilishwa kwa sasa.");
    if (await serviceIsLocked(transaction, "leseni-biashara")) throw new ApiError("failed-precondition", "Huduma ya Leseni ya Biashara imefungwa kwa sasa.");
    const profile = userSnapshot.data() as Profile | undefined;
    if (!profile || profile.accountStatus === "blocked" || profile.accountStatus === "deleted") throw new ApiError("permission-denied", "Akaunti hii imezuiwa.");
    if (profile.verificationStatus !== "approved") throw new ApiError("permission-denied", "Akaunti yako haijathibitishwa na admin.");

    if (priorLedger.exists) {
      const prior = priorLedger.data()!;
      if (prior.userId !== uid || Number(prior.amount) !== -2 || prior.applicationId !== application.applicationId) throw new ApiError("already-exists", "Rejea hii ya tokeni tayari imetumika.");
      transaction.update(applicationRef, { status: "COMPLETED", documentGenerated: true, reference: ledgerRef.id, updatedAt: FieldValue.serverTimestamp() });
      if (!usageSnapshot.exists) transaction.create(usageRef, { usageId: usageRef.id, userId: uid, serviceId: "leseni-biashara", serviceName: "LESENI YA BIASHARA", applicationId: application.applicationId, tokensUsed: 2, balanceBefore: prior.balanceBefore, balanceAfter: prior.balanceAfter, documentType: "BUSINESS_LICENSE_PDF", status: "COMPLETED", createdAt: FieldValue.serverTimestamp(), reference: ledgerRef.id });
      return { reference: ledgerRef.id, duplicate: true };
    }

    const before = Number(profile.tokenBalance ?? 0);
    if (!Number.isSafeInteger(before) || before < 2) throw new ApiError("failed-precondition", "Huna tokeni za kutosha kupakua hati hii. Unahitaji tokeni 2.");
    const after = before - 2;
    transaction.update(userRef, { tokenBalance: after, updatedAt: FieldValue.serverTimestamp() });
    transaction.create(ledgerRef, { transactionId: ledgerRef.id, userId: uid, actorId: uid, type: "service_usage", amount: -2, balanceBefore: before, balanceAfter: after, reason: "Matumizi ya LESENI YA BIASHARA", serviceId: "leseni-biashara", serviceName: "LESENI YA BIASHARA", reference: ledgerRef.id, createdAt: FieldValue.serverTimestamp(), status: "completed", applicationId: application.applicationId });
    transaction.create(usageRef, { usageId: usageRef.id, userId: uid, serviceId: "leseni-biashara", serviceName: "LESENI YA BIASHARA", applicationId: application.applicationId, tokensUsed: 2, balanceBefore: before, balanceAfter: after, documentType: "BUSINESS_LICENSE_PDF", status: "COMPLETED", createdAt: FieldValue.serverTimestamp(), reference: ledgerRef.id });
    transaction.update(applicationRef, { status: "COMPLETED", documentGenerated: true, reference: ledgerRef.id, updatedAt: FieldValue.serverTimestamp() });
    recordAudit(transaction, uid, String(profile.role ?? "user"), "GENERATE_BUSINESS_LICENSE_PDF", "licenseApplication", String(application.applicationId), { tokenBalance: before }, { tokenBalance: after }, { serviceId: "leseni-biashara", tokensUsed: 2, reference: ledgerRef.id });
    return { reference: ledgerRef.id, duplicate: false };
  });
  const completed = await applicationRef.get();
  const application = completed.data()!;
  return { status: "COMPLETED", requestId, applicationId: application.applicationId, licenseNumber: String((application.licenseData as Record<string, unknown> | undefined)?.licenseNumber ?? ""), reference: result.reference, duplicate: result.duplicate };
});

const tokenPackageLabel = (amount: number, credits: number) => `${amount.toLocaleString("en-US")} TZS — ${credits} tokeni`;

export const createTokenPurchaseOrder = callable(async (request) => {
  const uid = authUid(request);
  const profile = await profileFor(uid);
  if (profile.accountStatus === "blocked" || profile.accountStatus === "deleted") throw new ApiError("permission-denied", "Akaunti hii haiwezi kununua tokeni.");

  const data = objectValue(request.data, "Ombi la kununua tokeni");
  const requestId = text(data.requestId, 100);
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(requestId)) throw new ApiError("invalid-argument", "Namba ya ombi si sahihi.");
  const amount = Number(data.amount);
  const credits = tokenCreditsForAmount(amount);
  if (credits === null) throw new ApiError("invalid-argument", "Chagua kifurushi halali cha tokeni.");
  const phone = normalizeTanzaniaPhone(profile.phone);
  if (!phone) throw new ApiError("failed-precondition", "Weka namba sahihi ya Tanzania kwenye akaunti yako kwanza.");

  const orderId = makeTokenPurchaseOrderId(uid, requestId);
  const orderRef = db.collection("tokenPurchaseOrders").doc(orderId);
  const openLockRef = db.collection("tokenPurchaseOpenLocks").doc(uid);
  const reservation = await db.runTransaction(async (transaction) => {
    const savedOrderSnapshot = await transaction.get(orderRef);
    const lockSnapshot = await transaction.get(openLockRef);
    if (savedOrderSnapshot.exists) {
      const saved = savedOrderSnapshot.data()!;
      if (saved.userId !== uid || Number(saved.amount) !== amount || Number(saved.tokenAmount) !== credits) throw new ApiError("already-exists", "Rejea hii ya malipo imetumika kwa ombi tofauti.");
      if (saved.status === "PAID") return { status: "PAID", duplicate: true };
      if (isOpenTokenPurchaseStatus(lockSnapshot.data()?.status) && lockSnapshot.data()?.orderId !== orderId) throw new ApiError("failed-precondition", "Tayari una ombi la malipo linalosubiri. Subiri likamilike kabla ya kuanzisha jingine.");
      transaction.set(openLockRef, { orderId, status: saved.status, updatedAt: FieldValue.serverTimestamp() });
      return { status: String(saved.status ?? "CREATING"), duplicate: true };
    }
    if (lockSnapshot.exists && isOpenTokenPurchaseStatus(lockSnapshot.data()?.status)) throw new ApiError("failed-precondition", "Tayari una ombi la malipo linalosubiri. Subiri likamilike kabla ya kuanzisha jingine.");
    transaction.create(orderRef, { orderId, requestId, userId: uid, amount, currency: "TZS", tokenAmount: credits, status: "CREATING", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    transaction.set(openLockRef, { orderId, status: "CREATING", updatedAt: FieldValue.serverTimestamp() });
    return { status: "CREATING", duplicate: false };
  });
  if (reservation.status === "PAID") return { orderId, status: "PAID", amount, tokenAmount: credits, duplicate: true };
  if (reservation.duplicate && isOpenTokenPurchaseStatus(reservation.status)) return { orderId, status: reservation.status, amount, tokenAmount: credits, duplicate: true };

  try {
    const response = await fetch("https://fimipay.com/api/v1/payment/create_order", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": "HudumaZaMtandaoni/1.0", Authorization: `Bearer ${fimipayApiSecret.value()}` },
      body: JSON.stringify({ order_id: orderId, buyer_phone: phone, amount, currency: "TZS", payment_method: "mobile" }),
      signal: AbortSignal.timeout(20000),
    });
    const result = await response.json().catch(() => null) as { status?: unknown; message?: unknown; data?: Record<string, unknown> } | null;
    const providerOrderId = String(result?.data?.order_id ?? "");
    if (!response.ok || result?.status !== "success" || providerOrderId !== orderId) {
      const reason = String(result?.message ?? "FimiPay haikukubali ombi la malipo.").slice(0, 240);
      await db.runTransaction(async (transaction) => {
        const lockSnapshot = await transaction.get(openLockRef);
        transaction.set(orderRef, { status: "CREATE_FAILED", providerMessage: reason, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        if (lockSnapshot.data()?.orderId === orderId) transaction.delete(openLockRef);
      });
      throw new ApiError("unavailable", "Imeshindikana kuanzisha malipo kwa sasa. Jaribu tena baadaye.");
    }

    const status = String(result.data?.payment_status ?? "PENDING").toUpperCase();
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(orderRef);
      const lockSnapshot = await transaction.get(openLockRef);
      if (!snapshot.exists) throw new ApiError("not-found", "Ombi la malipo halikupatikana.");
      if (snapshot.data()?.status !== "PAID") transaction.set(orderRef, { providerOrderId, providerStatus: status, status: status === "SUCCESS" ? "PENDING" : status, providerEnvironment: String(result.data?.environment ?? "unknown"), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      if (lockSnapshot.data()?.orderId === orderId) {
        if (["REJECTED", "FAILED", "CANCELLED", "USERCANCELLED", "EXPIRED"].includes(status)) transaction.delete(openLockRef);
        else transaction.set(openLockRef, { orderId, status: status === "SUCCESS" ? "PENDING" : status, updatedAt: FieldValue.serverTimestamp() });
      }
    });
    return { orderId, status, amount, tokenAmount: credits, duplicate: reservation.duplicate };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error("createTokenPurchaseOrder failed", { uid, orderId, error: String((error as Error)?.message ?? error).slice(0, 240) });
    await db.runTransaction(async (transaction) => {
      const lockSnapshot = await transaction.get(openLockRef);
      transaction.set(orderRef, { status: "CREATE_UNKNOWN", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      if (lockSnapshot.data()?.orderId === orderId) transaction.set(openLockRef, { orderId, status: "CREATE_UNKNOWN", updatedAt: FieldValue.serverTimestamp() });
    }).catch(() => undefined);
    throw new ApiError("unavailable", "Imeshindikana kuwasiliana na FimiPay. Jaribu tena baadaye.");
  }
});

export const fimipayWebhook = httpEndpoint(async (req, res) => {
  if (req.method !== "POST") { res.set("Allow", "POST").status(405).send("Method not allowed"); return; }
  const rawBody = req.rawBody;
  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0 || rawBody.length > 65536) { res.status(400).send("Invalid payload"); return; }
  if (!verifyFimipayWebhookSignature(rawBody, req.get("X-FIMIPAY-SIGNATURE"), fimipayWebhookSecret.value())) { res.status(401).send("Invalid signature"); return; }

  let event: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(rawBody));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("not an object");
    event = parsed as Record<string, unknown>;
  } catch {
    res.status(400).send("Invalid JSON"); return;
  }

  const providerOrderId = typeof event.order_id === "string" ? event.order_id.trim() : "";
  if (!providerOrderId || providerOrderId.length > 64) { res.status(400).send("Missing order_id"); return; }
  const orderRef = db.collection("tokenPurchaseOrders").doc(providerOrderId);
  const savedOrder = await orderRef.get();
  if (!savedOrder.exists) { res.status(200).json({ received: true, ignored: true }); return; }
  const purchase = savedOrder.data()!;
  const openLockRef = db.collection("tokenPurchaseOpenLocks").doc(String(purchase.userId));
  const markNeedsReview = async (reason: string) => db.runTransaction(async (transaction) => {
    const latest = await transaction.get(orderRef);
    const lock = await transaction.get(openLockRef);
    if (!latest.exists || latest.data()?.status === "PAID") return;
    transaction.set(orderRef, { status: "NEEDS_REVIEW", reviewReason: reason, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    if (lock.data()?.orderId === providerOrderId) transaction.delete(openLockRef);
  });
  if (purchase.providerOrderId && purchase.providerOrderId !== providerOrderId) { res.status(200).json({ received: true, ignored: true }); return; }

  const terminalStatus = fimipayTerminalStatus(event);
  if (!isFimipaySuccessEvent(event)) {
    if (terminalStatus && purchase.status !== "PAID") {
      await db.runTransaction(async (transaction) => {
        const latest = await transaction.get(orderRef);
        const lock = await transaction.get(openLockRef);
        if (latest.exists && latest.data()?.status !== "PAID") transaction.set(orderRef, { status: terminalStatus, providerStatus: terminalStatus, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        if (lock.data()?.orderId === providerOrderId) transaction.delete(openLockRef);
      });
    }
    res.status(200).json({ received: true }); return;
  }

  const suppliedAmount = Number(event.amount);
  const suppliedCurrency = String(event.currency ?? "").toUpperCase();
  const expectedCredits = tokenCreditsForAmount(purchase.amount);
  if (suppliedAmount !== Number(purchase.amount) || suppliedCurrency !== "TZS" || expectedCredits === null || expectedCredits !== Number(purchase.tokenAmount)) {
    await markNeedsReview("Webhook amount/currency mismatch");
    res.status(200).json({ received: true, review: true }); return;
  }

  try {
    const verificationResponse = await fetch("https://fimipay.com/api/v1/payment/order_status", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": "HudumaZaMtandaoni/1.0", Authorization: `Bearer ${fimipayApiSecret.value()}` },
      body: JSON.stringify({ order_id: providerOrderId }),
      signal: AbortSignal.timeout(15000),
    });
    const verification = await verificationResponse.json().catch(() => null) as { status?: unknown; data?: Record<string, unknown> } | null;
    const confirmed = verification?.data;
    const confirmedSuccess = verificationResponse.ok && verification?.status === "success" && isConfirmedLivePayment(confirmed, providerOrderId, Number(purchase.amount));

    if (!confirmedSuccess) {
      if (verificationResponse.ok && verification?.status === "success" && ["PENDING", "INPROGRESS"].includes(String(confirmed?.payment_status ?? "").toUpperCase())) { res.status(500).json({ received: false, pending: true }); return; }
      await markNeedsReview("FimiPay status verification failed");
      res.status(200).json({ received: true, review: true }); return;
    }

    const userRef = db.collection("users").doc(String(purchase.userId));
    const ledgerRef = db.collection("tokenTransactions").doc(providerOrderId);
    await db.runTransaction(async (transaction) => {
      const latestOrderSnapshot = await transaction.get(orderRef);
      const userSnapshot = await transaction.get(userRef);
      const priorLedger = await transaction.get(ledgerRef);
      const lockSnapshot = await transaction.get(openLockRef);
      if (!latestOrderSnapshot.exists || !userSnapshot.exists) {
        if (latestOrderSnapshot.exists) transaction.set(orderRef, { status: "NEEDS_REVIEW", reviewReason: "Account or order missing during settlement", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        if (lockSnapshot.data()?.orderId === providerOrderId) transaction.delete(openLockRef);
        return;
      }
      const latestOrder = latestOrderSnapshot.data()!;
      if (latestOrder.userId !== purchase.userId || latestOrder.amount !== purchase.amount || latestOrder.tokenAmount !== purchase.tokenAmount) {
        transaction.set(orderRef, { status: "NEEDS_REVIEW", reviewReason: "Stored order integrity check failed", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        if (lockSnapshot.data()?.orderId === providerOrderId) transaction.delete(openLockRef);
        return;
      }
      if (latestOrder.status === "PAID") { if (lockSnapshot.data()?.orderId === providerOrderId) transaction.delete(openLockRef); return; }
      const user = userSnapshot.data() as Profile;
      const before = Number(user.tokenBalance ?? 0);
      if (!Number.isSafeInteger(before) || before < 0) {
        transaction.set(orderRef, { status: "NEEDS_REVIEW", reviewReason: "Invalid token balance", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        if (lockSnapshot.data()?.orderId === providerOrderId) transaction.delete(openLockRef);
        return;
      }
      if (priorLedger.exists) {
        const ledger = priorLedger.data()!;
        if (ledger.userId !== purchase.userId || Number(ledger.amount) !== expectedCredits || ledger.reference !== providerOrderId) {
          transaction.set(orderRef, { status: "NEEDS_REVIEW", reviewReason: "Token ledger conflict", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
          if (lockSnapshot.data()?.orderId === providerOrderId) transaction.delete(openLockRef);
          return;
        }
        transaction.set(orderRef, { status: "PAID", providerStatus: "SUCCESS", transid: String(confirmed?.transid ?? event.transid ?? "").slice(0, 120), creditedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        if (lockSnapshot.data()?.orderId === providerOrderId) transaction.delete(openLockRef);
        return;
      }
      const after = before + expectedCredits;
      if (!Number.isSafeInteger(after)) {
        transaction.set(orderRef, { status: "NEEDS_REVIEW", reviewReason: "Token balance overflow", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        if (lockSnapshot.data()?.orderId === providerOrderId) transaction.delete(openLockRef);
        return;
      }
      const transid = String(confirmed?.transid ?? event.transid ?? "").slice(0, 120);
      const paidAt = FieldValue.serverTimestamp();
      transaction.update(userRef, { tokenBalance: after, updatedAt: paidAt });
      transaction.create(ledgerRef, { transactionId: providerOrderId, userId: purchase.userId, actorId: "fimipay", type: "purchase", amount: expectedCredits, balanceBefore: before, balanceAfter: after, reason: `Ununuzi wa tokeni — ${tokenPackageLabel(Number(purchase.amount), expectedCredits)}`, description: `Ununuzi wa tokeni — ${tokenPackageLabel(Number(purchase.amount), expectedCredits)}`, serviceId: "token-purchase", serviceName: "FimiPay tokeni", reference: providerOrderId, providerTransactionId: transid, createdAt: paidAt, status: "completed", paymentAmount: Number(purchase.amount), currency: "TZS" });
      transaction.set(orderRef, { status: "PAID", providerStatus: "SUCCESS", transid, creditedAt: paidAt, updatedAt: paidAt }, { merge: true });
      transaction.create(db.collection("messages").doc(), { recipientId: purchase.userId, subject: "Malipo ya tokeni yamepokelewa", body: `Malipo yako ya TZS ${Number(purchase.amount).toLocaleString("en-US")} yamethibitishwa. Tokeni ${expectedCredits} zimeongezwa kwenye akaunti yako.`, type: "tokenPurchasePaid", orderId: providerOrderId, createdAt: paidAt });
      transaction.create(db.collection("auditLogs").doc(), { action: "FIMIPAY_TOKEN_PURCHASE_CREDITED", actorId: "fimipay", actorRole: "system", targetUserId: String(purchase.userId), orderId: providerOrderId, tokenAmount: expectedCredits, paymentAmount: Number(purchase.amount), transid, createdAt: paidAt });
      if (lockSnapshot.data()?.orderId === providerOrderId) transaction.delete(openLockRef);
    });
    res.status(200).json({ received: true });
  } catch (error) {
    console.error("fimipayWebhook settlement failed", { orderId: providerOrderId, error: String((error as Error)?.message ?? error).slice(0, 240) });
    res.status(500).json({ received: false });
  }
});
