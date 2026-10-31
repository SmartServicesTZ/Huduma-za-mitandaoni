import { Buffer } from "node:buffer";
import { createHash, randomUUID } from "node:crypto";
import { FieldValue, getFirestore, type DocumentReference, type DocumentSnapshot, type Query, type Transaction } from "./firestore-rest.js";
import { getStorage } from "./storage-rest.js";
import { ApiError, defineWorkerSecret, callable, httpEndpoint, type ApiRequest } from "./api-adapter.js";
import { getGoogleAccessToken, getWorkerEnv } from "./runtime.js";
import { resolveAuthRole } from "./authClaims.js";
import { defaultAccessLipaServices, defaultLipaServices, defaultServices } from "./defaultCatalog.js";
import { generateRandomBusinessLicenseNumber } from "./businessLicenseNumber.js";
import { fimipayTerminalStatus, isConfirmedLivePayment, isFimipaySuccessEvent, isOpenTokenPurchaseStatus, makeTokenPurchaseOrderId, normalizeTanzaniaPhone, tokenCreditsForAmount, verifyFimipayWebhookSignature } from "./fimipayCore.js";
import { phoneAuthAlias } from "../../shared/tanzaniaPhone.js";
import { accountRestrictionActions, resolveAccountAccessMode, type AccountRestrictionAction } from "../../shared/accountAccess.js";

const db = getFirestore();
const bucket = getStorage().bucket();
const fimipayApiSecret = defineWorkerSecret("FIMIPAY_SECRET_KEY");
const fimipayWebhookSecret = defineWorkerSecret("FIMIPAY_WEBHOOK_SECRET");
const roles = ["user", "admin", "moderator", "support", "super_admin"] as const;
type Role = (typeof roles)[number];
const permissions = ["viewUsers", "manageUsers", "manageTokens", "manageServices", "manageLipaApplications", "manageContent", "manageMessages", "manageReports", "manageSettings", "manageLicenses", "viewAuditLogs"] as const;
const defaultLockedServiceSlugs = new Set(["cheti-kuzaliwa", "visa-pasipoti", "cheti-ndoa", "ripoti-hasara"]);
// Keep each Firestore request bounded; complete admin lists advance through
// deterministic document-ID cursors so no records are silently dropped.
const ADMIN_LIST_LIMIT = 50;
const FCM_PAGE_SIZE = 100;
const FCM_SEND_CONCURRENCY = 20;

function applicationDuplicateFingerprint(scope: string, values: Record<string, unknown>) {
  const normalized = Object.entries(values)
    .filter(([, value]) => value !== null && value !== undefined && value !== "" && !(typeof value === "string" && /^(lipaUploads|serviceUploads|lipaApplications|serviceApplications)\//.test(value)))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => [key, typeof value === "string" ? value.trim().toLowerCase().replace(/\s+/g, " ") : value]);
  return createHash("sha256").update(`${scope}\n${JSON.stringify(normalized)}`).digest("hex");
}

function recordValues(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

type Profile = { createdAt?: unknown; role?: Role; permissions?: Partial<Record<(typeof permissions)[number], boolean>>; tokenBalance?: number; tokenBalanceNida?: number; tokenBalanceOther?: number; tokenBonusRegistrationGranted?: boolean; lastDailyTokenBonusDate?: string; verificationStatus?: string; accountStatus?: string; accessMode?: string; allowedActions?: string[]; restrictionReason?: string; restrictionMessage?: string; name?: string; firstName?: string; phone?: string; profileImageUrl?: string; mustChangePassword?: boolean };

function authUid(request: ApiRequest<unknown>) {
  if (!request.auth?.uid) throw new ApiError("unauthenticated", "Ingia kwanza.");
  return request.auth.uid;
}

async function getAllCollectionDocs(collectionName: string, pageSize = ADMIN_LIST_LIMIT, equalityFilter?: { field: string; value: unknown }) {
  const documents: Array<DocumentSnapshot> = [];
  let cursor: string | undefined;
  for (;;) {
    let pageQuery: Query = db.collection(collectionName);
    if (equalityFilter) pageQuery = pageQuery.where(equalityFilter.field, "==", equalityFilter.value);
    pageQuery = pageQuery.orderByDocumentId();
    if (cursor) pageQuery = pageQuery.startAfterDocumentId(cursor);
    const page = await pageQuery.limit(pageSize).get();
    documents.push(...page.docs);
    if (page.docs.length < pageSize) return documents;
    const nextCursor = page.docs.at(-1)?.id;
    if (!nextCursor || nextCursor === cursor) throw new Error(`Firestore pagination stalled for ${collectionName}.`);
    cursor = nextCursor;
  }
}

async function profileFor(uid: string, prefetched?: Profile) {
  let profile = prefetched;
  if (!profile) {
    const snapshot = await db.collection("users").doc(uid).get();
    if (!snapshot.exists) throw new ApiError("permission-denied", "Profile ya akaunti haijapatikana.");
    profile = snapshot.data() as Profile;
  }
  const roleResolution = resolveAuthRole(profile.role, profile.phone, getWorkerEnv().SUPER_ADMIN_PHONE ?? "255698232313");
  if (roleResolution.shouldDemote) {
    await db.collection("users").doc(uid).update({ role: "user", permissions: {}, updatedAt: FieldValue.serverTimestamp() });
  }
  return { ...profile, role: roleResolution.role, ...(roleResolution.shouldDemote ? { permissions: {} } : {}) };
}

const callableAccessAction: Record<string, "admin" | "read" | "profile" | "applications" | "services" | "payments" | "auth"> = {
  adminDelete: "admin", adminWrite: "admin", adminDeleteUserAccount: "admin", adjustTokens: "admin", resetUserPassword: "admin", seedServiceCatalog: "admin",
  setAccountStatus: "admin", setHomepageServiceOrder: "admin", setLipaApplicationStatus: "admin", setServiceApplicationStatus: "admin", replyToServiceApplication: "admin", 
  setServiceLock: "admin", updateUserAccess: "admin", verifyUser: "admin", ensureDefaultServiceCatalog: "admin",
  changeOwnPassword: "profile", claimRegistrationPhone: "profile", consumeTokens: "services", generateBusinessLicense: "services",
  createPocketWifiOrder: "applications", createServiceApplication: "applications", updateServiceApplication: "applications", completeBusinessLicense: "applications", reserveBusinessLicenseNumber: "applications",
  submitLipaApplication: "applications", markLipaApplicationViewed: "applications", markServiceApplicationViewed: "applications", listLipaApplications: "admin",
  getLipaApplicationDocument: "read", getServiceApplicationDocument: "read", listServiceApplications: "admin", createTokenPurchaseOrder: "payments",
  markUserMessageRead: "read", registerFcmToken: "profile", sendPushNotification: "admin", syncAuthClaims: "auth",
};

export async function enforceAccountRestriction(uid: string, callableName: string): Promise<Profile | undefined> {
  const action = callableAccessAction[callableName] ?? "admin";
  if (action === "auth") return;
  const snapshot = await db.collection("users").doc(uid).get();
  if (!snapshot.exists) return;
  const profile = snapshot.data() as Profile;
  const mode = resolveAccountAccessMode(profile);
  if (mode === "active") return profile;
  if (mode === "read_only" && (action === "read" || action === "profile")) return profile;
  if (mode === "limited" && (action === "read" || accountRestrictionActions.includes(action as AccountRestrictionAction) && profile.allowedActions?.includes(action))) return profile;
  const reason = typeof profile.restrictionReason === "string" && profile.restrictionReason.trim() ? ` Sababu: ${profile.restrictionReason.trim()}` : " Admin hakuweka sababu maalum.";
  throw new ApiError("permission-denied", `Akaunti hii imewekewa kizuizi.${reason} Wasiliana na admin kupitia 0698232313.`);
}

function can(profile: Profile, permission: string) {
  // Admin accounts are trusted to manage the admin dashboard. Keep explicit
  // permissions working for limited/legacy accounts, while avoiding a
  // permission mismatch where role=admin but manageLipaApplications is absent.
  return profile.role === "super_admin" || profile.role === "admin" || (profile.permissions?.[permission as keyof Profile["permissions"]] === true);
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


export const registerFcmToken = callable(async (request) => {
  const uid = authUid(request);
  const data = (request.data ?? {}) as Record<string, unknown>;
  const token = typeof data.token === "string" ? data.token.trim() : "";
  if (token.length < 20 || token.length > 4096 || /\s/.test(token)) {
    throw new ApiError("invalid-argument", "Token ya arifa si sahihi.");
  }
  const existing = await db.collection("fcmTokens").where("token", "==", token).limit(1).get();
  if (!existing.empty) {
    const ref = existing.docs[0].ref;
    await ref.set({ uid, token, updatedAt: FieldValue.serverTimestamp(), platform: "android" }, { merge: true });
    return { saved: true };
  }
  await db.collection("fcmTokens").add({
    uid, token, platform: "android",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { saved: true };
});

export const sendPushNotification = callable(async (request) => {
  const uid = authUid(request);
  const actor = await profileFor(uid, request.profile as Profile | undefined);
  requirePermission(actor, "manageMessages");
  const data = (request.data ?? {}) as Record<string, unknown>;
  const title = typeof data.title === "string" ? data.title.trim().slice(0, 100) : "";
  const body = typeof data.body === "string" ? data.body.trim().slice(0, 500) : "";
  const targetUid = typeof data.targetUid === "string" ? data.targetUid.trim().slice(0, 128) : "";
  const broadcast = data.broadcast === true;
  if (!title || !body || (!broadcast && !targetUid) || (broadcast && targetUid)) {
    throw new ApiError("invalid-argument", "Weka kichwa, ujumbe na chagua mtumiaji mmoja au watumiaji wote.");
  }
  const tokenDocuments = await getAllCollectionDocs("fcmTokens", FCM_PAGE_SIZE, broadcast ? undefined : { field: "uid", value: targetUid });
  const tokens = [...new Set(tokenDocuments
    .map((document) => document.data()?.token)
    .filter((token): token is string => typeof token === "string" && token.length >= 20))];
  if (!tokens.length) return { sent: 0, failed: 0, message: "Hakuna kifaa kilichosajili tokeni ya arifa." };
  const accessToken = await getGoogleAccessToken();
  let sent = 0;
  let failed = 0;
  const sendOne = async (token: string) => {
    try {
      const response = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(getWorkerEnv().FIREBASE_PROJECT_ID)}/messages:send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: { token, notification: { title, body }, android: { priority: "HIGH", notification: { channel_id: "smartservicestz_updates" } } } }),
        signal: AbortSignal.timeout(15000),
      });
      if (response.ok) sent++;
      else { failed++; console.error("FCM delivery failed", { status: response.status }); }
    } catch (error) {
      failed++;
      console.error("FCM delivery failed", { error: error instanceof Error ? error.message : "network error" });
    }
  };
  for (let offset = 0; offset < tokens.length; offset += FCM_SEND_CONCURRENCY) {
    await Promise.all(tokens.slice(offset, offset + FCM_SEND_CONCURRENCY).map(sendOne));
  }
  return { sent, failed, attempted: tokens.length };
});

export const adminWrite = callable(async (request) => {
  const uid = authUid(request);
  const actor = await profileFor(uid, request.profile as Profile | undefined);
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
  const actor = await profileFor(uid, request.profile as Profile | undefined);
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
  const actor = await profileFor(uid, request.profile as Profile | undefined);
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

export const claimDailyTokenBonus = callable(async (request) => {
  const uid = authUid(request);
  const userRef = db.collection("users").doc(uid);
  const settingsRef = db.collection("siteSettings").doc("public");
  // Tarehe ya bonus hutumia siku ya Tanzania (EAT), si UTC.
  const now = new Date();
  const dateInTanzania = (date: Date) => {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Dar_es_Salaam", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
    const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
    return part("year") + "-" + part("month") + "-" + part("day");
  };
  const today = dateInTanzania(now);
  return db.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists) throw new ApiError("not-found", "Profile ya akaunti haijapatikana.");
    const settingsSnap = await transaction.get(settingsRef);
    const settings = settingsSnap.exists ? settingsSnap.data()! : {};
    const config = (settings.tokenBonusConfig ?? {}) as Record<string, unknown>;
    const dailyBonus = Math.max(0, Math.min(10000, Math.floor(Number(config.dailyBonus ?? 6))));
    const profile = userSnap.data() as Profile;
    // Usajili siku hii unatoa tokeni za usajili pekee; bonus ya kila siku huanza siku inayofuata.
    const createdAt = profile.createdAt;
    const createdDate = createdAt && typeof createdAt === "object" && "toDate" in createdAt && typeof (createdAt as {toDate?: unknown}).toDate === "function"
      ? dateInTanzania((createdAt as {toDate: () => Date}).toDate())
      : typeof createdAt === "string" ? createdAt.slice(0, 10) : "";
    if (!createdDate || createdDate >= today || profile.lastDailyTokenBonusDate === today || dailyBonus === 0) return { granted: 0, balanceAfter: Number(profile.tokenBalanceOther ?? profile.tokenBalance ?? 0) };
    const before = Number(profile.tokenBalanceOther ?? profile.tokenBalance ?? 0);
    const after = before + dailyBonus;
    transaction.update(userRef, { tokenBalanceOther: after, tokenBalance: after, lastDailyTokenBonusDate: today, updatedAt: FieldValue.serverTimestamp() });
    const ledgerRef = db.collection("tokenTransactions").doc("daily_" + uid + "_" + today);
    transaction.set(ledgerRef, { transactionId: ledgerRef.id, userId: uid, actorId: "SYSTEM", tokenType: "huduma", type: "bonus", amount: dailyBonus, balanceBefore: before, balanceAfter: after, reason: "Bonus ya kila siku", serviceId: "daily-bonus", serviceName: "Daily token bonus", reference: ledgerRef.id, createdAt: FieldValue.serverTimestamp(), status: "completed" }, { merge: true });
    return { granted: dailyBonus, balanceAfter: after };
  });
});

export const consumeTokens = callable(async (request) => {
  const uid = authUid(request);
  const data = (request.data ?? {}) as Record<string, unknown>;
  const serviceId = text(data.serviceId, 120);
  const requestId = text(data.requestId, 160);
  const requestedCost = Number(data.tokenCost);
  const requestedTokenType = text(data.tokenType, 20) || "huduma";
  if (requestedTokenType !== "nida" && requestedTokenType !== "huduma") throw new ApiError("invalid-argument", "Aina ya tokeni si sahihi.");
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
    if (serviceId !== "cheti-tin" && await serviceIsLocked(transaction, serviceId)) throw new ApiError("failed-precondition", "Huduma hii imefungwa kwa sasa.");
    const serviceSnapshot = await transaction.get(db.collection("services").where("slug", "==", serviceId).limit(1));
    // Use the built-in catalog only when a known default service has not yet been
    // seeded into Firestore. The portal can show local fallback services while
    // the worker previously rejected them all as "haipatikani".
    const service = serviceSnapshot.docs[0]?.data() ?? defaultServices.find((item) => item.slug === serviceId);
    if (!service || service.active === false || service.isVisible === false) throw new ApiError("failed-precondition", "Huduma hii haipatikani kwa sasa.");
    // Kitambulisho cha wakala ni huduma ya kulipia hata kama rekodi ya zamani ina isFree=true/tokenCost=0.
    // Tumia bei ya admin ikiwa ni chanya; vinginevyo tokeni 2 ndizo gharama ya msingi.
    const isAgentId = serviceId === "kitambulisho-wakala";
    if (service.isFree === true && !isAgentId && serviceId !== "yanga-africans") throw new ApiError("failed-precondition", "Huduma hii haitumii tokeni.");
    const configuredCost = Number(service.tokenCost);
    // Enforce the Yanga WhatsApp entry price even when Firestore still has an older catalog value.
    const cost = serviceId === "yanga-africans" ? 6 : (isAgentId && (!Number.isSafeInteger(configuredCost) || configuredCost <= 0) ? 2 : configuredCost);
    if (!Number.isSafeInteger(cost) || cost <= 0 || cost > 100000) throw new ApiError("failed-precondition", "Gharama ya huduma haijawekwa sawa. Wasiliana na admin.");
    // The user must confirm the exact price shown from the Admin dashboard.
    // If Admin changes the price while the page is open, reject instead of charging a different amount.
    if (requestedCost !== cost) throw new ApiError("failed-precondition", "Bei ya huduma imebadilika kwenye Dashboard ya Admin. Rudi nyuma kisha fungua huduma tena ili kuona bei mpya.");
    const serviceName = String(service.name ?? data.serviceName ?? serviceId).slice(0, 180);
    const userSnapshot = await transaction.get(userRef);
    const profile = userSnapshot.data() as Profile | undefined;
    if (!profile || profile.accountStatus === "blocked" || profile.accountStatus === "deleted") throw new ApiError("permission-denied", "Akaunti hii haiwezi kutumia huduma.");
    if (profile.verificationStatus !== "approved") throw new ApiError("permission-denied", "Akaunti yako haijathibitishwa na admin.");
    const effectiveTokenType = service.tokenType === "nida" || serviceId === "nakala-nida" || serviceId === "utafutaji-nida" ? "nida" : "huduma";
    const legacyOther = profile.tokenBalanceOther === undefined ? Number(profile.tokenBalance ?? 0) : Number(profile.tokenBalanceOther);
    const tokenField = effectiveTokenType === "nida" ? "tokenBalanceNida" : "tokenBalanceOther";
    const before = Number(effectiveTokenType === "nida" ? (profile.tokenBalanceNida ?? 0) : legacyOther);
    if (before < cost) throw new ApiError("failed-precondition", "Tokeni za aina hii hazitoshi kutumia huduma hii.");
    const after = before - cost;
    const update: Record<string, unknown> = { [tokenField]: after, updatedAt: FieldValue.serverTimestamp() };
    if (effectiveTokenType === "huduma") update.tokenBalance = after;
    transaction.update(userRef, update);
    transaction.set(ledgerRef, { transactionId: requestId, userId: uid, actorId: uid, tokenType: effectiveTokenType, type: "service_usage", amount: -cost, balanceBefore: before, balanceAfter: after, reason: `Matumizi ya ${serviceName}`, serviceId, serviceName, reference: requestId, createdAt: FieldValue.serverTimestamp(), status: "completed" });
    return { reference: requestId, balanceAfter: after, duplicate: false };
  });
});

export const adjustTokens = callable(async (request) => {
  const uid = authUid(request);
  const profile = await profileFor(uid, request.profile as Profile | undefined);
  requirePermission(profile, "manageTokens");
  const data = (request.data ?? {}) as Record<string, unknown>;
  const userId = text(data.userId, 180);
  const description = text(data.description, 300);
  const requestId = text(data.requestId, 160);
  if (!/^[A-Za-z0-9_-]{8,160}$/.test(requestId)) throw new ApiError("invalid-argument", "Rejea ya ombi la tokeni si sahihi.");
  const amount = Number(data.amount);
  if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 100000) throw new ApiError("invalid-argument", "Kiasi cha tokeni si sahihi.");
  const tokenType = text(data.tokenType, 20);
  if (tokenType !== "nida" && tokenType !== "huduma") throw new ApiError("invalid-argument", "Aina ya tokeni si sahihi.");
  const tokenField = tokenType === "nida" ? "tokenBalanceNida" : "tokenBalanceOther";
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
      const legacyOther = target.tokenBalanceOther === undefined ? Number(target.tokenBalance ?? 0) : Number(target.tokenBalanceOther);
      const before = Number(tokenType === "nida" ? (target.tokenBalanceNida ?? 0) : legacyOther);
      if (!Number.isSafeInteger(before) || before < 0) throw new ApiError("failed-precondition", "Salio la tokeni kwenye profile si sahihi. Kagua taarifa za mtumiaji kwanza.");
      const after = before + amount;
      if (!Number.isSafeInteger(after)) throw new ApiError("out-of-range", "Salio jipya la tokeni limezidi kikomo kinachoruhusiwa.");
      if (after < 0) throw new ApiError("failed-precondition", "Salio haliwezi kuwa chini ya sifuri.");
      transaction.update(userRef, { [tokenField]: after, ...(tokenType === "huduma" ? { tokenBalance: after } : {}), updatedAt: FieldValue.serverTimestamp() });
      transaction.set(ledgerRef, { transactionId: ledgerRef.id, userId, actorId: uid, tokenType, type: amount > 0 ? "credit" : "debit", amount, balanceBefore: before, balanceAfter: after, reason: description, serviceId: "admin-adjustment", serviceName: "Admin token adjustment", reference: ledgerRef.id, createdAt: FieldValue.serverTimestamp(), status: "completed" });
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
  const actor = await profileFor(uid, request.profile as Profile | undefined);
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
    ...defaultAccessLipaServices.map((service) => ({ ref: db.collection("services").doc(service.slug), data: service })),
    ...defaultLipaServices.map((service) => ({ ref: db.collection("lipaServices").doc(service.id), data: service })),
  ];
  const settingsRef = db.collection("siteSettings").doc("public");
  return db.runTransaction(async (transaction) => {
    const settingsSnapshot = await transaction.get(settingsRef);
    const alreadyInitialized = settingsSnapshot.data()?.catalogInitialized === true;
    const refsToSeed = alreadyInitialized && skipIfInitialized
      ? refs.filter((item) => item.ref.parent.id === "services" && ["access-lipa-number", "access-lipa-airtel", "access-lipa-yas", "access-lipa-vodacom", "access-lipa-halotel", "sme-vodacom", "kitambulisho-wakala-airtel", "kitambulisho-wakala-halotel", "kitambulisho-wakala-yas", "kitambulisho-wakala-vodacom", "kitambulisho-wakala-mbeya"].includes(String((item.data as { slug?: string }).slug ?? "")))
      : refs;
    const existingRecords: Array<{ item: (typeof refs)[number]; snapshot: DocumentSnapshot; targetRef: DocumentReference }> = [];
    for (const item of refsToSeed) {
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
      const isAccessService = targetRef.parent.id === "services" && /^access-lipa-(airtel|yas|vodacom|halotel)$/.test(String((item.data as { slug?: string }).slug ?? ""));
      if (isAccessService) {
        backfill.isVisible = true;
        backfill.active = true;
      }
      if (Object.keys(backfill).length) transaction.set(targetRef, { ...backfill, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    });
    transaction.set(settingsRef, { catalogInitialized: true, catalogInitializedAt: FieldValue.serverTimestamp() }, { merge: true });
    recordAudit(transaction, uid, actorRole, "SEED_SERVICE_CATALOG", "serviceCatalog", "initial", { catalogInitialized: settingsSnapshot.data()?.catalogInitialized === true }, { createdServices, createdNetworks, catalogInitialized: true });
    return { createdServices, createdNetworks, initialized: true };
  });
}

export const ensureDefaultServiceCatalog = callable(async (request) => {
  const uid = authUid(request);
  const actor = await profileFor(uid, request.profile as Profile | undefined);
  requirePermission(actor, "manageServices");
  const actorRole = String(actor.role ?? "user");
  return initializeServiceCatalog(uid, actorRole, true);
});

export const seedServiceCatalog = callable(async (request) => {
  const uid = authUid(request);
  const actor = await profileFor(uid, request.profile as Profile | undefined);
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
  const profile = await profileFor(uid, request.profile as Profile | undefined);
  if (profile.accountStatus === "blocked" || profile.accountStatus === "deleted") throw new ApiError("permission-denied", "Akaunti hii imezuiwa.");
  const data = objectValue(request.data, "Taarifa za ombi");
  const networkId = text(data.networkId, 80);
  const applicationId = text(data.applicationId, 80);
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(applicationId)) throw new ApiError("invalid-argument", "Namba ya ombi si sahihi.");
  const configRef = db.collection("lipaServices").doc(networkId);
  const configSnapshot = await configRef.get();
  const configured = configSnapshot.exists ? configSnapshot.data()! : null;
  const fallback = defaultLipaServices.find((item) => String(item.id) === networkId) ?? null;
  const config = configured ?? fallback;
  if (!config) throw new ApiError("not-found", "Mtandao huu haujapatikana.");
  if (config.active !== true) throw new ApiError("failed-precondition", "Maombi ya mtandao huu yamefungwa kwa sasa.");
  let fields = Array.isArray(config.fields) ? [...config.fields as Array<Record<string, unknown>>] : [];
  if (/yas|tigo/i.test(networkId)) {
    for (let index = fields.length - 1; index >= 0; index -= 1) {
      const name = String(fields[index].fieldName ?? "");
      if (name === "businessLicense") fields.splice(index, 1);
      else if (name === "tinNumber" || name === "businessLicensePhoto") fields[index] = { ...fields[index], required: false };
    }
    const hasField = (name: string) => fields.some((field) => String(field.fieldName ?? "") === name);
    if (!hasField("hasTinNumber")) fields.push({ fieldName: "hasTinNumber", label: "Je, una namba ya TIN?", type: "DROPDOWN", options: ["Ndiyo", "Hapana"], required: true, order: 2.8 });
    if (!hasField("tinNumber")) fields.push({ fieldName: "tinNumber", label: "Namba ya TIN", type: "TIN", required: false, order: 3 });
    if (!hasField("hasBusinessLicense")) fields.push({ fieldName: "hasBusinessLicense", label: "Je, una leseni ya biashara?", type: "DROPDOWN", options: ["Ndiyo", "Hapana"], required: true, order: 4 });
    if (!hasField("businessLicensePhoto")) fields.push({ fieldName: "businessLicensePhoto", label: "Picha ya leseni ya biashara", type: "IMAGE_UPLOAD", required: false, maxSizeMb: 5, accept: ["image/jpeg", "image/png", "image/webp"], order: 5 });
  }
  if (networkId.toLowerCase().includes("vodacom")) {
    fields = fields.filter((field) => !["businessName", "businessNameEvidence"].includes(String(field.fieldName ?? "")));
    if (!fields.some((field) => String(field.fieldName ?? "") === "additionalNotes")) fields.push({ fieldName: "additionalNotes", label: "Maelezo ya ziada (si lazima)", type: "TEXTAREA", required: false, order: 999 });
  }
  const rawValues = objectValue(data.values, "Fomu");
  if (/yas|tigo/i.test(networkId)) {
    if (rawValues.hasTinNumber === "Ndiyo" && !String(rawValues.tinNumber ?? "").trim()) {
      throw new ApiError("failed-precondition", "Umechagua Ndiyo kwenye swali la TIN; weka namba ya TIN.");
    }
    if (rawValues.hasBusinessLicense === "Ndiyo" && !String(rawValues.businessLicensePhoto ?? "").startsWith(`lipaUploads/${uid}/${applicationId}/businessLicensePhoto-`)) {
      throw new ApiError("failed-precondition", "Umechagua Ndiyo kwenye swali la leseni; pakia picha ya leseni ya biashara iliyo wazi.");
    }
  }

  const applicantData = cleanApplicationValues(rawValues, fields, uid, applicationId);
  const additionalNotes = typeof rawValues.additionalNotes === "string" ? rawValues.additionalNotes.trim().slice(0, 2000) : "";
  const duplicateFingerprint = applicationDuplicateFingerprint(`lipa:${networkId}`, applicantData);
  const openRef = db.collection("lipaOpenApplications").doc(`${uid}_${networkId}_${applicationId}`);
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
    const existingApplication = await transaction.get(applicationRef);
    if (existingApplication.exists) throw new ApiError("already-exists", "Namba hii ya ombi tayari imetumika.");
    const previousLipaApplications = await transaction.get(db.collection("lipaApplications").where("userId", "==", uid).where("networkId", "==", networkId).limit(100));
    const duplicate = previousLipaApplications.docs.find((document) => {
      const previous = document.data() ?? {};
      const status = String(previous.status ?? "PENDING").toUpperCase();
      if (status !== "PENDING" && status !== "PROCESSING") return false;
      const previousFingerprint = typeof previous.duplicateFingerprint === "string"
        ? previous.duplicateFingerprint
        : applicationDuplicateFingerprint(`lipa:${networkId}`, recordValues(previous.applicantData));
      return previousFingerprint === duplicateFingerprint;
    });
    if (duplicate) throw new ApiError("already-exists", "Tayari umetuma ombi la Lipa Namba lenye taarifa hizi. Subiri Admin aidhinishe au akatae ombi la awali.", { applicationId: duplicate.id });
    const application = {
      applicationId, userId: uid, userName: String(profile.name ?? ""), network: String(config.name ?? networkId), networkId, serviceId: "pata-lipa-namba",
      applicantName: [applicantData.firstName, applicantData.middleName, applicantData.lastName].filter(Boolean).join(" ") || String(profile.name ?? profile.firstName ?? "Mwombaji"),
      phone: String(applicantData.phone ?? ""), businessName: String(applicantData.businessName ?? ""), nidaNumber: String(applicantData.nidaNumber ?? ""), tinNumber: String(applicantData.tinNumber ?? ""),
      businessLicense: String(applicantData.businessLicense ?? ""), idDocumentUrl: String(applicantData.idDocument ?? ""), idDocumentType: String(applicantData.idDocumentType ?? ""), applicantData, duplicateFingerprint,
      reward: networkId.toLowerCase().includes("vodacom") ? 5000 : Number(config.reward ?? 0), additionalNotes, rewardStatus: (networkId.toLowerCase().includes("vodacom") ? 5000 : Number(config.reward ?? 0)) > 0 ? "UNPAID" : "NOT_ELIGIBLE", qualificationStatus: (networkId.toLowerCase().includes("vodacom") ? 5000 : Number(config.reward ?? 0)) > 0 ? "PENDING_CHECK" : "NOT_QUALIFIED", verifiedTransactions: 0, lipaNumber: "", rewardPaymentReference: "", rewardNote: "", status: "PENDING", rejectionReason: "", submittedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp(),
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
  const actor = await profileFor(uid, request.profile as Profile | undefined);
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
    const allowed = from !== status && (
      (status === "PROCESSING" && from === "PENDING") ||
      (status === "APPROVED" && (from === "PENDING" || from === "PROCESSING")) ||
      (status === "REJECTED" && (from === "PENDING" || from === "PROCESSING"))
    );
    if (!allowed) throw new ApiError("failed-precondition", `Mabadiliko kutoka ${from} kwenda ${status} hayaruhusiwi.`);
    const now = FieldValue.serverTimestamp();
    const networkName = String(application.network ?? application.networkId ?? "").trim();
    const isAirtel = /airtel/i.test(networkName) || /airtel/i.test(String(application.networkId ?? ""));
    const applicantPhone = (application.applicantData as Record<string, unknown> | undefined)?.phone;
    const approvedMessage = isAirtel
      ? `Ombi lako la lipa namba Airtel la namba hii ${String(application.phone ?? applicantPhone ?? "—")} limefanikiwa.\\n\\nKuwezesha account ya biashara fuata hatua hizi\\n*150*60*05#\\nChagua 1 kuendelea\\nChagua 1 Get lipa namba\\nKisha weka namba ya siri\\n(Utapokea lipa namba yako kupitia SMS)`
      : `Ombi lako la Lipa Namba la ${networkName || "mtandao uliochagua"} limekubaliwa. Tafadhali fuata maelekezo ya mtandao husika ili kukamilisha kuwezesha account ya biashara.`;
    const patch: Record<string, unknown> = { status, updatedAt: now, assignedAdmin: application.assignedAdmin ?? uid };
    if (status === "PROCESSING") Object.assign(patch, { processedAt: now, processedBy: uid });
    if (status === "APPROVED") Object.assign(patch, { approvedAt: now, approvedBy: uid, adminReply: approvedMessage, rejectionReason: "" });
    if (status === "REJECTED") Object.assign(patch, { rejectionReason, rejectedAt: now, rejectedBy: uid });
    transaction.update(ref, patch);
    if (status === "APPROVED" || status === "REJECTED") transaction.delete(db.collection("lipaOpenApplications").doc(`${application.userId}_${application.networkId}_${application.applicationId}`));
    const reasonSuffix = status === "REJECTED" ? `\\n\\nSababu: ${rejectionReason}` : "";
    const messageBody = status === "PROCESSING" ? "Ombi lako linafanyiwa kazi na Admin." : status === "APPROVED" ? approvedMessage : `Ombi lako limekataliwa.${reasonSuffix}`;
    transaction.set(db.collection("messages").doc(), { recipientId: application.userId, subject: `Hali ya ombi la ${networkName || "Lipa Namba"}`, body: messageBody, type: "lipaApplicationStatus", applicationId, status, rejectionReason: status === "REJECTED" ? rejectionReason : "", createdAt: now });
    const auditRef = db.collection("auditLogs").doc();
    transaction.create(auditRef, { action: status === "PROCESSING" ? "LIPA_APPLICATION_PROCESSING" : status === "APPROVED" ? "LIPA_APPLICATION_APPROVED" : "LIPA_APPLICATION_REJECTED", actorId: uid, actorRole: String(actor.role), applicationId, targetUserId: String(application.userId), reason: status === "REJECTED" ? rejectionReason : "", createdAt: now });
    recordAudit(transaction, uid, String(actor.role), `LIPA_APPLICATION_${status}`, "lipaApplication", applicationId, { status: from }, { status }, { reason: status === "REJECTED" ? rejectionReason : "" });
    return { applicationId, status };
  });
});

export const replyToLipaApplication = callable(async (request) => {
  const uid = authUid(request);
  const actor = await profileFor(uid, request.profile as Profile | undefined);
  requirePermission(actor, "manageLipaApplications");
  const data = objectValue(request.data, "Jibu la ombi");
  const applicationId = text(data.applicationId, 80);
  const reply = typeof data.reply === "string" ? data.reply.trim().slice(0, 2000) : "";
  const infoRequest = typeof data.infoRequest === "string" ? data.infoRequest.trim().slice(0, 2000) : "";
  if (!reply && !infoRequest) throw new ApiError("invalid-argument", "Andika jibu au ombi la taarifa za ziada.");
  const ref = db.collection("lipaApplications").doc(applicationId);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new ApiError("not-found", "Ombi halikupatikana.");
    const application = snapshot.data()!;
    const now = FieldValue.serverTimestamp();
    const patch: Record<string, unknown> = {
      updatedAt: now,
      lastAdminReplyAt: now,
      lastAdminReplyBy: uid,
    };
    if (reply) Object.assign(patch, { adminReply: reply });
    if (infoRequest) Object.assign(patch, { additionalInfoRequest: infoRequest });
    transaction.update(ref, patch);
    const subject = infoRequest ? `Taarifa za ziada kuhusu ombi la ${application.network}` : `Jibu kuhusu ombi la ${application.network}`;
    const body = infoRequest ? `Admin anaomba taarifa za ziada: ${infoRequest}${reply ? `

Jibu la Admin: ${reply}` : ""}` : reply;
    transaction.set(db.collection("messages").doc(), {
      recipientId: application.userId,
      subject,
      body,
      type: "lipaApplicationAdminReply",
      applicationId,
      createdAt: now,
    });
    recordAudit(transaction, uid, String(actor.role), "LIPA_APPLICATION_ADMIN_REPLY", "lipaApplication", applicationId, {}, { adminReply: Boolean(reply), additionalInfoRequest: Boolean(infoRequest) }, {});
    return { applicationId, adminReply: reply, additionalInfoRequest: infoRequest };
  });
});

export const updateLipaRewardTracking = callable(async (request) => {
  const uid = authUid(request);
  const actor = await profileFor(uid, request.profile as Profile | undefined);
  requirePermission(actor, "manageLipaApplications");
  const data = objectValue(request.data, "Taarifa za zawadi");
  const applicationId = text(data.applicationId, 80);
  const lipaNumber = typeof data.lipaNumber === "string" ? data.lipaNumber.trim().slice(0, 50) : "";
  const verifiedTransactions = Number(data.verifiedTransactions);
  if (!Number.isSafeInteger(verifiedTransactions) || verifiedTransactions < 0 || verifiedTransactions > 100000000) throw new ApiError("invalid-argument", "Idadi ya miamala si sahihi.");
  const verifiedTransactionAmount = Number(data.verifiedTransactionAmount ?? 0);
  if (!Number.isSafeInteger(verifiedTransactionAmount) || verifiedTransactionAmount < 0 || verifiedTransactionAmount > 1000000000000) throw new ApiError("invalid-argument", "Jumla ya thamani ya miamala si sahihi.");
  const qualificationMonth = typeof data.qualificationMonth === "string" ? data.qualificationMonth.trim() : "";
  if (qualificationMonth && !/^\d{4}-(0[1-9]|1[0-2])$/.test(qualificationMonth)) throw new ApiError("invalid-argument", "Chagua mwezi sahihi wa miamala.");
  const verifiedTransactionSource = String(data.verifiedTransactionSource ?? "");
  if (!["", "VODACOM", "OTHER"].includes(verifiedTransactionSource)) throw new ApiError("invalid-argument", "Chanzo cha miamala si sahihi.");
  const qualificationStatus = String(data.qualificationStatus ?? "");
  if (!["PENDING_CHECK", "QUALIFIED", "NOT_QUALIFIED"].includes(qualificationStatus)) throw new ApiError("invalid-argument", "Hali ya qualification si sahihi.");
  const rewardStatus = String(data.rewardStatus ?? "");
  if (!["UNPAID", "PAID", "NOT_ELIGIBLE"].includes(rewardStatus)) throw new ApiError("invalid-argument", "Hali ya malipo ya zawadi si sahihi.");
  const rewardPaymentReference = typeof data.rewardPaymentReference === "string" ? data.rewardPaymentReference.trim().slice(0, 120) : "";
  const rewardNote = typeof data.rewardNote === "string" ? data.rewardNote.trim().slice(0, 1000) : "";
  if (rewardStatus === "PAID" && !rewardPaymentReference) throw new ApiError("invalid-argument", "Weka reference ya malipo kabla ya kuweka PAID.");
  const ref = db.collection("lipaApplications").doc(applicationId);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new ApiError("not-found", "Ombi halikupatikana.");
    const application = snapshot.data()!;
    const isVodacom = String(application.networkId ?? application.network ?? "").toLowerCase().includes("vodacom");
    const reward = isVodacom ? 5000 : Number(application.reward ?? 0);
    if (String(application.status ?? "") !== "APPROVED") throw new ApiError("failed-precondition", "Ombi lazima liwe APPROVED kabla ya kufuatilia zawadi.");
    if (isVodacom && qualificationStatus === "QUALIFIED") {
      if (verifiedTransactions < 3) throw new ApiError("failed-precondition", "Vodacom: lazima uthibitishe angalau miamala 3 ndani ya mwezi husika.");
      if (verifiedTransactionAmount < 70000) throw new ApiError("failed-precondition", "Vodacom: jumla ya thamani ya miamala lazima iwe angalau TSh 70,000.");
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(qualificationMonth)) throw new ApiError("failed-precondition", "Vodacom: chagua mwezi ambao miamala imethibitishwa.");
      if (verifiedTransactionSource !== "VODACOM") throw new ApiError("failed-precondition", "Vodacom: miamala yote inayohesabika lazima ithibitishwe kuwa imetoka Vodacom pekee.");
    }
    if (rewardStatus === "PAID" && qualificationStatus !== "QUALIFIED") throw new ApiError("failed-precondition", "Zawadi haiwezi kuwa PAID bila kuthibitisha qualification.");
    const now = FieldValue.serverTimestamp();
    const patch: Record<string, unknown> = { lipaNumber, verifiedTransactions, verifiedTransactionAmount, qualificationMonth, verifiedTransactionSource, qualificationStatus, rewardStatus, rewardPaymentReference, rewardNote, ...(isVodacom ? { reward: 5000 } : {}), updatedAt: now, rewardUpdatedAt: now, rewardUpdatedBy: uid };
    if (rewardStatus === "PAID") { patch.rewardPaidAt = now; patch.rewardPaidBy = uid; }
    transaction.update(ref, patch);
    const qualificationLabel = qualificationStatus === "QUALIFIED" ? "Umefikia vigezo vya zawadi" : qualificationStatus === "NOT_QUALIFIED" ? "Kwa sasa hujafikia vigezo vya zawadi" : "Miamala yako bado inafuatiliwa";
    const paymentLabel = rewardStatus === "PAID" ? "Malipo yamekamilika" : rewardStatus === "NOT_ELIGIBLE" ? "Hustahili malipo ya zawadi kwa ombi hili" : qualificationStatus === "QUALIFIED" ? "Umefuzu; malipo yanasubiri kufanyika" : "Malipo yanasubiri uthibitisho wa vigezo";
    const progressMessage = [
      `Hali ya ufuatiliaji wa Lipa Namba yako ya ${String(application.network ?? application.networkId ?? "mtandao")} imesasishwa.`,
      `Lipa Namba: ${lipaNumber || "Bado haijawekwa"}`,
      `Miamala iliyothibitishwa: ${verifiedTransactions}`,
      `Thamani ya miamala: TSh ${verifiedTransactionAmount.toLocaleString("en-US")}`,
      qualificationMonth ? `Mwezi wa miamala: ${qualificationMonth}` : "",
      verifiedTransactionSource ? `Chanzo cha miamala: ${verifiedTransactionSource === "VODACOM" ? "Vodacom pekee" : "Haijathibitishwa kuwa Vodacom pekee"}` : "",
      `Ufuatiliaji: ${qualificationLabel}`,
      `Malipo ya zawadi: ${paymentLabel}`,
      reward > 0 ? `Kiasi cha zawadi: TSh ${reward.toLocaleString("en-US")}` : "",
      rewardStatus === "PAID" ? `Reference ya malipo: ${rewardPaymentReference}` : "",
      rewardNote ? `Maelezo: ${rewardNote}` : "",
    ].filter(Boolean).join("\\n");
    transaction.set(db.collection("messages").doc(), {
      recipientId: application.userId,
      subject: rewardStatus === "PAID" ? "Malipo ya Lipa Namba yamekamilika" : "Taarifa za malipo ya Lipa Namba zimesasishwa",
      body: progressMessage,
      type: "lipaRewardTracking",
      applicationId,
      createdAt: now,
    });
    recordAudit(transaction, uid, String(actor.role), "LIPA_REWARD_TRACKING_UPDATED", "lipaApplication", applicationId, {
      qualificationStatus: application.qualificationStatus ?? "PENDING_CHECK",
      rewardStatus: application.rewardStatus ?? "UNPAID",
      lipaNumber: application.lipaNumber ?? "",
    }, { qualificationStatus, rewardStatus, lipaNumber }, { verifiedTransactions, reward, rewardPaymentReference });
    return { applicationId, reward, qualificationStatus, rewardStatus, lipaNumber, verifiedTransactions, verifiedTransactionAmount, qualificationMonth, verifiedTransactionSource };
  });
});

export const listLipaApplications = callable(async (request) => {
  const uid = authUid(request);
  const actor = await profileFor(uid, request.profile as Profile | undefined);
  requirePermission(actor, "manageLipaApplications");
  const documents = await getAllCollectionDocs("lipaApplications");
  const rows: Array<Record<string, unknown> & { id: string }> = documents.map((item) => ({ id: item.id, ...item.data() }));
  rows.sort((a, b) => {
    const left = String(a.submittedAt ?? "");
    const right = String(b.submittedAt ?? "");
    return right.localeCompare(left);
  });
  return { applications: rows };
});

export const markLipaApplicationViewed = callable(async (request) => {
  const uid = authUid(request);
  const actor = await profileFor(uid, request.profile as Profile | undefined);
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

export const createLipaDocumentUploadUrl = callable(async (request) => {
  const uid = authUid(request);
  await enforceAccountRestriction(uid, "submitLipaApplication");
  const data = objectValue(request.data, "Taarifa za picha");
  const applicationId = text(data.applicationId, 80);
  const fieldName = text(data.fieldName, 64);
  if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(fieldName)) throw new ApiError("invalid-argument", "Field ya picha si sahihi.");
  const contentType = text(data.contentType, 100).toLowerCase();
  if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) throw new ApiError("invalid-argument", "Picha lazima iwe JPG, PNG au WebP.");
  const fileName = text(data.fileName, 120).replace(/[^A-Za-z0-9._-]/g, "_");
  const path = `lipaUploads/${uid}/${applicationId}/${fieldName}-${randomUUID()}-${fileName}`;
  const { signStorageUrl } = await import("./storage-rest.js");
  const url = await signStorageUrl("write", path, Date.now() + 10 * 60 * 1000);
  return { url, path };
});

export const getLipaApplicationDocument = callable(async (request) => {
  const uid = authUid(request);
  const actor = await profileFor(uid, request.profile as Profile | undefined);
  const data = objectValue(request.data, "Taarifa za faili");
  const applicationId = text(data.applicationId, 80);
  const fieldName = text(data.fieldName, 64);
  if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(fieldName)) throw new ApiError("invalid-argument", "Field ya faili si sahihi.");
  const snapshot = await db.collection("lipaApplications").doc(applicationId).get();
  if (!snapshot.exists) throw new ApiError("not-found", "Ombi halikupatikana.");
  const application = snapshot.data()!;
  if (application.userId !== uid) requirePermission(actor, "manageLipaApplications");
  const storagePath = String((application.applicantData as Record<string, unknown> | undefined)?.[fieldName] ?? "");
  const allowedPath = storagePath.startsWith(`lipaUploads/${application.userId}/${applicationId}/`)
    || storagePath.startsWith(`lipaApplications/${applicationId}/documents/`);
  if (!allowedPath) throw new ApiError("not-found", "Faili halikupatikana.");
  const env = getWorkerEnv();
  if (env.LIPA_DOCUMENTS) {
    const workerUrl = String(env.WORKER_PUBLIC_URL ?? "https://huduma-za-mtandao-api.stewardjackson999.workers.dev").replace(/\/+$/, "");
    return { url: `${workerUrl}/download/lipa?applicationId=${encodeURIComponent(applicationId)}&fieldName=${encodeURIComponent(fieldName)}`, expiresAt: Date.now() + 5 * 60 * 1000 };
  }
  const [url] = await bucket.file(storagePath).getSignedUrl({ action: "read", expires: Date.now() + 5 * 60 * 1000 });
  return { url, expiresAt: Date.now() + 5 * 60 * 1000 };
});


export const markUserMessageRead = callable(async (request) => {
  const uid = authUid(request);
  const data = objectValue(request.data, "Soma arifa");
  const messageId = text(data.messageId, 160);
  const ref = db.collection("messages").doc(messageId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new ApiError("not-found", "Arifa haipatikani.");
  const message = snapshot.data()!;
  if (String(message.recipientId ?? "") !== uid && message.broadcast !== true) throw new ApiError("permission-denied", "Huna ruhusa ya kusoma arifa hii.");
  const readBy = Array.isArray(message.readBy) ? message.readBy.filter((item): item is string => typeof item === "string") : [];
  if (!readBy.includes(uid)) await ref.set({ readBy: [...readBy, uid], readAt: FieldValue.serverTimestamp() }, { merge: true });
  return { ok: true };
});

export const createPocketWifiOrder = callable(async (request) => {
  const uid = authUid(request);
  const profile = await profileFor(uid, request.profile as Profile | undefined);
  if (profile.accountStatus === "blocked" || profile.accountStatus === "deleted") throw new ApiError("permission-denied", "Akaunti hii imezuiwa.");
  const data = objectValue(request.data, "Oda ya Pocket WiFi");
  const applicationId = text(data.applicationId, 80);
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(applicationId)) throw new ApiError("invalid-argument", "Namba ya oda si sahihi.");
  const details = text(data.details, 6000);
  const phone = text(data.phone, 30);
  if (details.length < 20) throw new ApiError("invalid-argument", "Taarifa za oda hazijakamilika.");
  if (!/^\+?[0-9][0-9 ()-]{6,18}$/.test(phone)) throw new ApiError("invalid-argument", "Namba ya mawasiliano si sahihi.");
  const ref = db.collection("serviceApplications").doc(applicationId);
  const fields = [{ fieldName: "details", label: "Maelezo ya oda", type: "TEXTAREA", required: true, order: 0 }];
  const applicantData = { details };
  const duplicateFingerprint = applicationDuplicateFingerprint("service:pata-pocket-wifi-mabando", { details, phone });
  await db.runTransaction(async (transaction) => {
    const prior = await transaction.get(ref);
    if (prior.exists) throw new ApiError("already-exists", "Namba ya oda hii tayari imetumika.");
    const previousOrders = await transaction.get(db.collection("serviceApplications").where("userId", "==", uid).where("serviceSlug", "==", "pata-pocket-wifi-mabando").limit(100));
    const duplicate = previousOrders.docs.find((document) => {
      const previous = document.data() ?? {};
      const status = String(previous.status ?? "PENDING").toUpperCase();
      if (status !== "PENDING" && status !== "PROCESSING") return false;
      const previousValues = recordValues(previous.applicantData);
      const previousFingerprint = typeof previous.duplicateFingerprint === "string"
        ? previous.duplicateFingerprint
        : applicationDuplicateFingerprint("service:pata-pocket-wifi-mabando", { details: String(previousValues.details ?? ""), phone: String(previous.orderPhone ?? "") });
      return previousFingerprint === duplicateFingerprint;
    });
    if (duplicate) throw new ApiError("already-exists", "Tayari umetuma oda yenye taarifa hizi. Subiri Admin aidhinishe au akatae oda ya awali.", { applicationId: duplicate.id });
    transaction.create(ref, {
      applicationId, userId: uid, userName: String(profile.name ?? ""), serviceSlug: "pata-pocket-wifi-mabando",
      serviceName: "PATA POCKET WIFI & MABANDO", serviceFields: fields,
      statusOptions: ["PENDING", "PROCESSING", "APPROVED", "REJECTED"], applicantData, duplicateFingerprint,
      orderPhone: phone, orderType: "POCKET_WIFI", status: "PENDING",
      submittedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp(),
    });
    transaction.set(db.collection("messages").doc(), {
      recipientId: uid, subject: "Oda ya Pocket WiFi imepokelewa",
      body: "Oda yako ya Pocket WiFi imehifadhiwa. Unaweza kufuatilia hali yake kwenye Historia > Maombi yangu ya huduma. Admin atakuthibitishia malipo na usafirishaji.",
      type: "serviceApplication", applicationId, createdAt: FieldValue.serverTimestamp(),
    });
  });
  return { applicationId, status: "PENDING", duplicate: false };
});

export const createServiceApplication = callable(async (request) => {
  const uid = authUid(request);
  const profile = await profileFor(uid, request.profile as Profile | undefined);
  if (profile.accountStatus === "blocked" || profile.accountStatus === "deleted") throw new ApiError("permission-denied", "Akaunti hii imezuiwa.");
  const data = objectValue(request.data, "Ombi la huduma");
  const serviceSlug = text(data.serviceSlug, 120);
  const applicationId = text(data.applicationId, 80);
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(applicationId)) throw new ApiError("invalid-argument", "Namba ya ombi si sahihi.");
  const serviceSnapshot = await db.collection("services").where("slug", "==", serviceSlug).limit(1).get();
  const seededAccessService = defaultAccessLipaServices.find((item) => item.slug === serviceSlug);
  const seededSmeVodacom = serviceSlug === "sme-vodacom" ? defaultServices.find((item) => item.slug === serviceSlug) : undefined;
  const seededTillService = serviceSlug === "pata-till-mitandao-yote" ? defaultServices.find((item) => item.slug === serviceSlug) : undefined;
  const service = serviceSnapshot.empty ? (seededAccessService ?? seededSmeVodacom ?? seededTillService) : serviceSnapshot.docs[0]?.data();
  // Keep the dedicated SME Vodacom schema in sync with the built-in form schema.
  if (serviceSlug === "sme-vodacom" && service && seededSmeVodacom) service.fields = seededSmeVodacom.fields;
  if (!service) throw new ApiError("not-found", "Huduma haikupatikana.");
  const isAccessService = defaultAccessLipaServices.some((item) => item.slug === serviceSlug);
  const isDedicatedSmeForm = ["sme-airtel", "sme-vodacom"].includes(serviceSlug);
  if (!isDedicatedSmeForm && (service.active === false || (!isAccessService && service.isVisible === false))) throw new ApiError("failed-precondition", "Huduma hii haipatikani kwa sasa.");
  if (serviceSlug === "pata-lipa-namba" || serviceSlug === "leseni-biashara") throw new ApiError("failed-precondition", "Tumia fomu maalum ya huduma hii.");
  const fields = Array.isArray(service.fields) ? service.fields as Array<Record<string, unknown>> : [];
  const applicantData = cleanApplicationValues(objectValue(data.values, "Fomu"), fields, uid, applicationId, "serviceUploads");
  if (serviceSlug === "pata-till-mitandao-yote") {
    const network = String(applicantData.network ?? "").toUpperCase();
    if (!["HALOTEL", "AIRTEL", "VODACOM"].includes(network)) throw new ApiError("invalid-argument", "Mtandao wa Till si sahihi.");
    applicantData.paymentStatus = network === "HALOTEL" ? "NOT_REQUIRED" : "UNPAID";
  }
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
  const duplicateFingerprint = applicationDuplicateFingerprint(`service:${serviceSlug}`, applicantData);
  const openRef = db.collection("serviceOpenApplications").doc(`${uid}_${serviceSlug}_${applicationId}`);
  const tokenCost = Number(service.isFree === true ? 0 : service.tokenCost);
  if (!Number.isSafeInteger(tokenCost) || tokenCost < 0 || tokenCost > 100000) throw new ApiError("failed-precondition", "Gharama ya huduma haijawekwa sawa.");
  try {
  const result = await db.runTransaction(async (transaction) => {
    const prior = await transaction.get(applicationRef);
    if (prior.exists) {
      if (prior.data()?.userId === uid && prior.data()?.serviceSlug === serviceSlug) return { applicationId, status: prior.data()?.status ?? "PENDING", duplicate: true };
      throw new ApiError("already-exists", "Namba hii ya ombi tayari imetumika.");
    }
    const existingServiceApplications = await transaction.get(db.collection("serviceApplications").where("userId", "==", uid).where("serviceSlug", "==", serviceSlug).limit(100));
    const duplicate = existingServiceApplications.docs.find((document) => {
      const previous = document.data() ?? {};
      const status = String(previous.status ?? "PENDING").toUpperCase();
      if (status !== "PENDING" && status !== "PROCESSING") return false;
      const previousFingerprint = typeof previous.duplicateFingerprint === "string"
        ? previous.duplicateFingerprint
        : applicationDuplicateFingerprint(`service:${serviceSlug}`, recordValues(previous.applicantData));
      return previousFingerprint === duplicateFingerprint;
    });
    if (duplicate) throw new ApiError("already-exists", "Tayari umetuma ombi la huduma lenye taarifa hizi. Subiri Admin aidhinishe au akatae ombi la awali.", { applicationId: duplicate.id });
    const open = await transaction.get(openRef);
    if (open.exists) throw new ApiError("already-exists", "Namba hii ya ombi tayari imetumika.");
    if (await serviceIsLocked(transaction, serviceSlug)) throw new ApiError("failed-precondition", "Huduma hii imefungwa kwa sasa.");
    const userRef = db.collection("users").doc(uid);
    const userSnapshot = await transaction.get(userRef);
    const user = userSnapshot.data() as Profile | undefined;
    if (!user) throw new ApiError("permission-denied", "Profile haikupatikana.");
    let balanceAfter: number | null = null;
    let ledgerRef: DocumentReference | null = null;
    if (tokenCost > 0) {
      if (user.verificationStatus !== "approved") throw new ApiError("permission-denied", "Akaunti yako haijathibitishwa na admin.");
      const effectiveTokenType = service.tokenType === "nida" || serviceSlug === "nakala-nida" || serviceSlug === "utafutaji-nida" ? "nida" : "huduma";
      const legacyOther = user.tokenBalanceOther === undefined ? Number(user.tokenBalance ?? 0) : Number(user.tokenBalanceOther);
      const tokenField = effectiveTokenType === "nida" ? "tokenBalanceNida" : "tokenBalanceOther";
      const before = Number(effectiveTokenType === "nida" ? (user.tokenBalanceNida ?? 0) : legacyOther);
      if (!Number.isSafeInteger(before) || before < tokenCost) throw new ApiError("failed-precondition", "Tokeni za aina hii hazitoshi kutumia huduma hii.");
      balanceAfter = before - tokenCost;
      const tokenUpdate: Record<string, unknown> = { [tokenField]: balanceAfter, updatedAt: FieldValue.serverTimestamp() };
      if (effectiveTokenType === "huduma") tokenUpdate.tokenBalance = balanceAfter;
      transaction.update(userRef, tokenUpdate);
      ledgerRef = db.collection("tokenTransactions").doc(applicationId);
      transaction.create(ledgerRef, { transactionId: applicationId, reference: applicationId, userId: uid, actorId: uid, tokenType: effectiveTokenType, type: "service_usage", amount: -tokenCost, balanceBefore: before, balanceAfter, reason: `Ombi la ${String(service.name ?? serviceSlug)}`, serviceId: serviceSlug, serviceName: String(service.name ?? serviceSlug), createdAt: FieldValue.serverTimestamp(), status: "completed" });
    }
    transaction.create(applicationRef, { applicationId, userId: uid, userName: String(user.name ?? ""), serviceSlug, serviceName: String(service.name ?? serviceSlug), serviceFields: fields, statusOptions: Array.isArray(service.statusOptions) ? service.statusOptions : ["PENDING", "PROCESSING", "APPROVED", "REJECTED"], applicantData, duplicateFingerprint, status: "PENDING", submittedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp(), ...(balanceAfter !== null ? { balanceAfter } : {}) });
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

export const updateServiceApplication = callable(async (request) => {
  const uid = authUid(request);
  const profile = await profileFor(uid, request.profile as Profile | undefined);
  if (profile.accountStatus === "blocked" || profile.accountStatus === "deleted") throw new ApiError("permission-denied", "Akaunti hii haiwezi kuhariri maombi.");
  const data = objectValue(request.data, "Hariri ombi");
  const applicationId = text(data.applicationId, 80);
  const incoming = objectValue(data.values, "Taarifa za ombi");
  const ref = db.collection("serviceApplications").doc(applicationId);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new ApiError("not-found", "Ombi halikupatikana.");
    const application = snapshot.data()!;
    if (String(application.userId ?? "") !== uid) throw new ApiError("permission-denied", "Huwezi kuhariri ombi la mtumiaji mwingine.");
    const currentStatus = String(application.status ?? "PENDING");
    const isAllowedRejectedRetry = currentStatus === "REJECTED";
    if (currentStatus !== "PENDING" && !isAllowedRejectedRetry) throw new ApiError("failed-precondition", "Ombi haliwezi kuhaririwa kwa sababu halijaruhusiwa kurudiwa au tayari limeanza kushughulikiwa.");
    const previous = application.applicantData && typeof application.applicantData === "object" ? application.applicantData as Record<string, unknown> : {};
    const next: Record<string, unknown> = { ...previous };
    for (const [key, value] of Object.entries(incoming)) {
      if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key)) continue;
      if (typeof value === "string") {
        if (value.length > 4000) throw new ApiError("invalid-argument", `Taarifa ya ${key} ni ndefu sana.`);
        if (/^(serviceUploads|serviceApplications)\//.test(value)) {
          if (value !== previous[key]) throw new ApiError("invalid-argument", "Huwezi kubadilisha kiambatisho kupitia sehemu hii; pakia faili upya.");
          continue;
        }
        next[key] = value.trim();
      } else if (typeof value === "number" && Number.isFinite(value)) next[key] = value;
      else if (typeof value === "boolean" || value === null) next[key] = value;
      else if (Array.isArray(value) && value.every((item) => typeof item === "string" && item.length <= 300)) next[key] = value;
    }
    const now = FieldValue.serverTimestamp();
    const duplicateFingerprint = applicationDuplicateFingerprint(`service:${String(application.serviceSlug ?? "")}`, next);
    transaction.update(ref, { applicantData: next, duplicateFingerprint, status: "PENDING", rejectionReason: "", allowResubmission: false, resubmittedAt: now, updatedAt: now, editedAt: now, editedBy: uid });
    transaction.set(db.collection("serviceOpenApplications").doc(`${uid}_${String(application.serviceSlug ?? "")}_${applicationId}`), { applicationId, userId: uid, serviceSlug: String(application.serviceSlug ?? ""), createdAt: now });
    transaction.set(db.collection("serviceOpenApplications").doc(`${uid}_${String(application.serviceSlug ?? "")}`), { applicationId, userId: uid, serviceSlug: String(application.serviceSlug ?? ""), createdAt: now });
    transaction.set(db.collection("messages").doc(), { recipientId: uid, subject: `Ombi la ${String(application.serviceName ?? application.serviceSlug)} limehaririwa`, body: "Mabadiliko ya taarifa zako yamehifadhiwa. Ombi bado linasubiri kuanza kushughulikiwa.", type: "serviceApplicationEdited", applicationId, createdAt: now });
    recordAudit(transaction, uid, String(profile.role ?? "user"), "SERVICE_APPLICATION_EDITED", "serviceApplication", applicationId, previous, next, {});
    return { applicationId, status: "PENDING", updated: true };
  });
});

export const setServiceApplicationStatus = callable(async (request) => {
  const uid = authUid(request);
  const actor = await profileFor(uid, request.profile as Profile | undefined);
  requirePermission(actor, "manageServices");
  const data = objectValue(request.data, "Hali ya ombi");
  const applicationId = text(data.applicationId, 80);
  const status = text(data.status, 40);
  if (status === "PENDING") throw new ApiError("invalid-argument", "Hali PENDING huwekwa ombi linapotumwa.");
  const rejectionReason = typeof data.rejectionReason === "string" ? data.rejectionReason.trim().slice(0, 1000) : "";
  const allowResubmission = status === "REJECTED";
  if (status === "REJECTED" && rejectionReason.length < 3) throw new ApiError("invalid-argument", "Sababu ya kukataliwa inahitajika.");
  const ref = db.collection("serviceApplications").doc(applicationId);
  const applicationSnapshot = await ref.get();
  if (!applicationSnapshot.exists) throw new ApiError("not-found", "Ombi halikupatikana.");
  const applicationBefore = applicationSnapshot.data()!;
  const serviceSnapshot = await db.collection("services").where("slug", "==", applicationBefore.serviceSlug).limit(1).get();
  const service = serviceSnapshot.docs[0]?.data();
  const statusOptions = Array.isArray(service?.statusOptions) ? service.statusOptions : Array.isArray(applicationBefore.statusOptions) ? applicationBefore.statusOptions : ["PENDING", "PROCESSING", "APPROVED", "REJECTED"];
  if (status !== "PAYMENT_CONFIRMED" && !statusOptions.includes(status)) throw new ApiError("failed-precondition", "Hali hii haipo kwenye status options za huduma.");
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new ApiError("not-found", "Ombi halikupatikana.");
    const application = snapshot.data()!;
    const from = String(application.status ?? "PENDING");
    const isTillApplication = String(application.serviceSlug ?? "") === "pata-till-mitandao-yote";
    const applicantData = (application.applicantData ?? {}) as Record<string, unknown>;
    const tillNetwork = String(applicantData.network ?? "").toUpperCase();
    const requiresTillPayment = isTillApplication && ["AIRTEL", "VODACOM"].includes(tillNetwork);
    if (status === "PAYMENT_CONFIRMED") {
      if (!requiresTillPayment) throw new ApiError("failed-precondition", "Uthibitishaji huu wa malipo unatumika kwa Till za Airtel na Vodacom pekee.");
      if (from !== "PENDING" || String(applicantData.paymentStatus ?? "UNPAID").toUpperCase() === "PAID") throw new ApiError("failed-precondition", "Ombi hili halisubiri uthibitisho wa malipo.");
      const now = FieldValue.serverTimestamp();
      transaction.update(ref, { applicantData: { ...applicantData, paymentStatus: "PAID", paymentConfirmedAt: now, paymentConfirmedBy: uid }, paymentConfirmedAt: now, paymentConfirmedBy: uid, updatedAt: now });
      transaction.set(db.collection("messages").doc(), { recipientId: application.userId, subject: "Malipo ya ombi la Till yamethibitishwa", body: "Malipo yako yamethibitishwa na Admin. Ombi lako sasa linasubiri kuanza kushughulikiwa. Utaona hali ya PENDING, PROCESSING, REJECTED au APPROVED kadri linavyoendelea.", type: "serviceApplicationPaymentConfirmed", applicationId, createdAt: now });
      recordAudit(transaction, uid, String(actor.role), "TILL_PAYMENT_CONFIRMED", "serviceApplication", applicationId, { paymentStatus: applicantData.paymentStatus ?? "UNPAID" }, { paymentStatus: "PAID" }, { network: tillNetwork });
      return { applicationId, status: from, paymentStatus: "PAID", paymentConfirmed: true };
    }
    if (requiresTillPayment && status !== "REJECTED" && String(applicantData.paymentStatus ?? "UNPAID").toUpperCase() !== "PAID") throw new ApiError("failed-precondition", "Thibitisha kwanza malipo ya Till kabla ya kuanza kushughulikia ombi. Unaweza kulikataa ikiwa mteja hajalipa.");
    if (status === from) throw new ApiError("failed-precondition", `Ombi tayari lina hali ya ${status}.`);
    const now = FieldValue.serverTimestamp();
    const patch: Record<string, unknown> = { status, updatedAt: now, assignedAdmin: application.assignedAdmin ?? uid };
    if (status === "PROCESSING") Object.assign(patch, { processedAt: now, processedBy: uid });
    if (status === "APPROVED") Object.assign(patch, { approvedAt: now, approvedBy: uid, rejectionReason: "" });
    if (status === "REJECTED") Object.assign(patch, { rejectedAt: now, rejectedBy: uid, rejectionReason, allowResubmission });
    const isFalseInfoRejection = status === "REJECTED" && /(fake|feki|uongo|uwongo|taarifa za uongo|taarifa feki|taarifa zisizo sahihi|si sahihi|sio kweli|si kweli|udangany|forged|false information)/i.test(rejectionReason);
    const userRef = db.collection("users").doc(String(application.userId));
    const userSnapshot = isFalseInfoRejection ? await transaction.get(userRef) : null;
    transaction.update(ref, patch);
    if (["APPROVED", "REJECTED"].includes(status)) {
      transaction.delete(db.collection("serviceOpenApplications").doc(`${application.userId}_${application.serviceSlug}_${application.applicationId}`));
      transaction.delete(db.collection("serviceOpenApplications").doc(`${application.userId}_${application.serviceSlug}`));
    }
    const serviceSlug = String(application.serviceSlug ?? "").toLowerCase();
    const serviceName = String(application.serviceName ?? service?.name ?? "huduma");
    const isAccessLipa = serviceSlug.includes("access-lipa") || serviceSlug.includes("pata-lipa");
    const isSme = serviceSlug.includes("sme");
    const reference = String(application.applicationNumber ?? application.requestNumber ?? applicationId);
    const airtelInstructions = "NAMNA YA KUJIUNGA KIFURUSHI CHA AIRTEL: Jiunge siku hiyo hiyo. Piga *149*01*77# kisha fuata maelekezo. Kuchagua aina ya kifurushi, piga *149*91# kisha chagua 1 kwa Combo au 2 kwa Internet.";
    const accessLipaApproved = `Ombi namba ${reference} la ${serviceName} limefanikiwa (APPROVED). Tafadhali wasiliana na 0698232313 kwa maelezo zaidi na kwa ajili ya kuanza kazi.`;
    const smeApproved = `Ombi namba ${reference} la ${serviceName} limefanikiwa (APPROVED). Tafadhali wasiliana na 0698232313 kwa maelezo zaidi kuhusu kujiunga kifurushi ikiwa utashindwa.\\n\\n${airtelInstructions}`;
    const body = status === "PROCESSING" ? "Maombi yako yanafanyiwa kazi na Admin." : status === "APPROVED" ? (isAccessLipa ? accessLipaApproved : isSme ? smeApproved : `Ombi namba ${reference} la ${serviceName} limefanikiwa (APPROVED).`) : status === "REJECTED" ? `Maombi yako yamekataliwa. Sababu: ${rejectionReason}` : `Hali ya ombi lako imebadilishwa kuwa ${status}`;
    transaction.set(db.collection("messages").doc(), { recipientId: application.userId, subject: `Hali ya ombi la ${application.serviceName}`, body, type: "serviceApplicationStatus", applicationId, status, rejectionReason: status === "REJECTED" ? rejectionReason : "", createdAt: now });
    if (isFalseInfoRejection && userSnapshot?.exists) {
        const userData = userSnapshot.data()!;
        const priorWarnings = Number(userData.falseInformationWarnings ?? 0);
        if (priorWarnings >= 5) {
          transaction.update(userRef, { accountStatus: "blocked", falseInformationWarnings: priorWarnings + 1, restrictionReason: "Akaunti imezuiwa baada ya kuendelea kutuma taarifa za uongo baada ya maonyo 5.", restrictionUpdatedAt: now, restrictionUpdatedBy: uid });
          transaction.set(db.collection("messages").doc(), { recipientId: application.userId, subject: "Akaunti imezuiwa", body: "Akaunti yako imezuiwa kwa kuendelea kutuma taarifa za uongo baada ya maonyo 5.", type: "accountBlocked", applicationId, createdAt: now });
        } else {
          const warnings = priorWarnings + 1;
          transaction.update(userRef, { falseInformationWarnings: warnings, lastFalseInformationWarningAt: now });
          transaction.set(db.collection("messages").doc(), { recipientId: application.userId, subject: `Onyo ${warnings}/5: taarifa za uongo`, body: `Tumegundua taarifa zisizo sahihi kwenye ombi lako. Hili ni onyo ${warnings} kati ya 5. Ukirudia baada ya maonyo 5, akaunti yako itazuiwa.`, type: "falseInformationWarning", applicationId, createdAt: now });
        }
      }
    const auditRef = db.collection("auditLogs").doc();
    transaction.create(auditRef, { action: `SERVICE_APPLICATION_${status}`, actorId: uid, actorRole: String(actor.role), applicationId, targetUserId: String(application.userId), reason: status === "REJECTED" ? rejectionReason : "", createdAt: now });
    recordAudit(transaction, uid, String(actor.role), `SERVICE_APPLICATION_${status}`, "serviceApplication", applicationId, { status: from }, { status }, { reason: status === "REJECTED" ? rejectionReason : "" });
    return { applicationId, status };
  });
});

export const listServiceApplications = callable(async (request) => {
  const uid = authUid(request);
  const actor = await profileFor(uid, request.profile as Profile | undefined);
  requirePermission(actor, "manageServices");
  const documents = await getAllCollectionDocs("serviceApplications");
  const rows: Array<Record<string, unknown> & { id: string }> = documents.map((item) => ({ id: item.id, ...item.data() }));
  rows.sort((a, b) => String(b.submittedAt ?? "").localeCompare(String(a.submittedAt ?? "")));
  return { applications: rows };
});

export const replyToServiceApplication = callable(async (request) => {
  const uid = authUid(request);
  const actor = await profileFor(uid, request.profile as Profile | undefined);
  requirePermission(actor, "manageServices");
  const data = objectValue(request.data, "Jibu la ombi");
  const applicationId = text(data.applicationId, 80);
  const subject = typeof data.subject === "string" ? data.subject.trim().slice(0, 180) : "";
  const body = typeof data.body === "string" ? data.body.trim().slice(0, 2000) : "";
  const messageType = data.messageType === "request-info" ? "request-info" : "reply";
  if (!body) throw new ApiError("invalid-argument", "Andika ujumbe kabla ya kutuma.");
  const ref = db.collection("serviceApplications").doc(applicationId);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new ApiError("not-found", "Ombi halikupatikana.");
    const application = snapshot.data()!;
    const now = FieldValue.serverTimestamp();
    transaction.set(db.collection("messages").doc(), {
      recipientId: application.userId,
      subject: subject || (messageType === "request-info" ? "Tafadhali ongeza taarifa kwenye ombi lako" : "Majibu kuhusu ombi lako"),
      body, type: messageType === "request-info" ? "serviceApplicationInfoRequest" : "serviceApplicationAdminReply",
      applicationId, serviceSlug: application.serviceSlug, serviceName: application.serviceName, createdAt: now,
    });
    transaction.update(ref, { lastAdminReply: body, lastAdminReplyAt: now, lastAdminReplyBy: uid, updatedAt: now });
    recordAudit(transaction, uid, String(actor.role), "SERVICE_APPLICATION_ADMIN_REPLY", "serviceApplication", applicationId, {}, { messageType }, {});
    return { applicationId, sent: true };
  });
});

export const markServiceApplicationViewed = callable(async (request) => {
  const uid = authUid(request);
  const actor = await profileFor(uid, request.profile as Profile | undefined);
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
  const actor = await profileFor(uid, request.profile as Profile | undefined);
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
  const isLegacyServiceDocument = storagePath.startsWith(`serviceApplications/${applicationId}/documents/`);
  const isR2ServiceUpload = storagePath.startsWith(`serviceUploads/${String(application.userId ?? "")}/${applicationId}/`);
  if (!isLegacyServiceDocument && !isR2ServiceUpload) throw new ApiError("not-found", "Faili halikupatikana.");
  const env = getWorkerEnv();
  if (env.LIPA_DOCUMENTS && (isR2ServiceUpload || isLegacyServiceDocument)) {
    const workerUrl = String(env.WORKER_PUBLIC_URL ?? "https://huduma-za-mtandao-api.stewardjackson999.workers.dev").replace(/\/+$/, "");
    return { url: `${workerUrl}/download/service-document?applicationId=${encodeURIComponent(applicationId)}&fieldName=${encodeURIComponent(fieldName)}`, expiresAt: Date.now() + 5 * 60 * 1000 };
  }
  const [url] = await bucket.file(storagePath).getSignedUrl({ action: "read", expires: Date.now() + 5 * 60 * 1000 });
  return { url, expiresAt: Date.now() + 5 * 60 * 1000 };
});

export const listAdminUsers = callable(async (request) => {
  const uid = authUid(request);
  const actor = await profileFor(uid, request.profile as Profile | undefined);
  requirePermission(actor, "viewUsers");

  const documents = await getAllCollectionDocs("users");
  return Promise.all(documents.map(async (document) => {
    const data = document.data() as Record<string, unknown>;
    const roleResolution = resolveAuthRole(
      typeof data.role === "string" ? data.role as Role : undefined,
      data.phone,
      getWorkerEnv().SUPER_ADMIN_PHONE ?? "255698232313",
    );
    if (roleResolution.shouldDemote) {
      await document.ref.update({ role: "user", permissions: {}, updatedAt: FieldValue.serverTimestamp() });
      data.role = "user";
      data.permissions = {};
    }
    const {
      password: _password,
      pin: _pin,
      pinHash: _pinHash,
      email: _email,
      emailVerified: _emailVerified,
      ...safeData
    } = data;
    return { id: document.id, ...safeData, role: roleResolution.role };
  }));
});

export const adminDeleteUserAccount = callable(async (request) => {
  const uid = authUid(request);
  const actor = await profileFor(uid, request.profile as Profile | undefined);
  if (actor.role !== "super_admin") throw new ApiError("permission-denied", "Super Admin pekee ndiye anayeruhusiwa kufuta akaunti kabisa.");
  const data = (request.data ?? {}) as Record<string, unknown>;
  const userId = text(data.userId, 180);
  if (userId === uid) throw new ApiError("failed-precondition", "Huwezi kufuta akaunti yako mwenyewe ukiwa umeingia nayo.");
  const targetRef = db.collection("users").doc(userId);
  const targetSnapshot = await targetRef.get();
  if (!targetSnapshot.exists) throw new ApiError("not-found", "Taarifa za mtumiaji hazipo tena kwenye dashboard.");
  const target = targetSnapshot.data() as Profile;
  const targetRole = resolveAuthRole(target.role, target.phone, getWorkerEnv().SUPER_ADMIN_PHONE ?? "255698232313").role;
  if (targetRole === "super_admin") throw new ApiError("permission-denied", "Akaunti ya Super Admin haiwezi kufutwa kupitia sehemu hii.");
  const normalizedPhone = normalizeTanzaniaPhone(target.phone);
  const phoneRegistryRef = normalizedPhone ? db.collection("phoneRegistry").doc(normalizedPhone) : null;

  const authResponse = await fetch("https://identitytoolkit.googleapis.com/v1/projects/" + encodeURIComponent(getWorkerEnv().FIREBASE_PROJECT_ID) + "/accounts:delete", {
    method: "POST",
    headers: { Authorization: "Bearer " + await getGoogleAccessToken(), "Content-Type": "application/json" },
    body: JSON.stringify({ localId: userId }),
  });
  if (!authResponse.ok) {
    const body = await authResponse.json().catch(() => ({})) as { error?: { message?: string } };
    const code = String(body.error?.message ?? "");
    if (!/USER_NOT_FOUND|USER_NOT_EXIST/i.test(code)) {
      throw new ApiError("internal", "Imeshindikana kufuta akaunti kwenye Firebase Authentication. Taarifa za dashboard hazijafutwa.");
    }
  }

  await db.runTransaction(async (transaction) => {
    const current = await transaction.get(targetRef);
    if (!current.exists) return;
    const currentData = current.data() as Profile;
    const currentRole = resolveAuthRole(currentData.role, currentData.phone, getWorkerEnv().SUPER_ADMIN_PHONE ?? "255698232313").role;
    if (currentRole === "super_admin") throw new ApiError("permission-denied", "Akaunti ya Super Admin haiwezi kufutwa.");
    // Clear the phone registry too; otherwise re-registration is blocked even
    // after both Firebase Auth and the Firestore user profile were deleted.
    const registrySnapshot = phoneRegistryRef ? await transaction.get(phoneRegistryRef) : null;
    transaction.delete(targetRef);
    if (phoneRegistryRef && registrySnapshot?.exists && registrySnapshot.data()?.uid === userId) {
      transaction.delete(phoneRegistryRef);
    }
    recordAudit(transaction, uid, "super_admin", "DELETE_USER_ACCOUNT", "users", userId, { name: currentData.name, phone: currentData.phone, role: currentRole }, null, { authDeleted: authResponse.ok, phoneRegistryDeleted: Boolean(phoneRegistryRef && registrySnapshot?.exists && registrySnapshot.data()?.uid === userId) });
  });
  return { ok: true, userId };
});

export const updateUserAccess = callable(async (request) => {
  const uid = authUid(request);
  const actor = await profileFor(uid, request.profile as Profile | undefined);
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

export const claimRegistrationPhone = callable(async (request) => {
  const uid = authUid(request);
  const data = (request.data ?? {}) as Record<string, unknown>;
  const phone = normalizeTanzaniaPhone(data.phone);
  if (!phone) throw new ApiError("invalid-argument", "Namba ya simu ya Tanzania si sahihi.");
  if (request.auth?.email !== phoneAuthAlias(phone)) throw new ApiError("permission-denied", "Namba ya simu haiendani na akaunti hii.");
  const firstName = typeof data.firstName === "string" ? data.firstName.trim().slice(0, 80) : "";
  const lastName = typeof data.lastName === "string" ? data.lastName.trim().slice(0, 80) : "";
  const name = [firstName, lastName].filter(Boolean).join(" ").slice(0, 160);
  const username = typeof data.username === "string" && data.username.trim() ? data.username.trim().slice(0, 80) : uid.slice(0, 8);
  if (!firstName) throw new ApiError("invalid-argument", "Jina la kwanza linahitajika wakati wa usajili.");

  const registryRef = db.collection("phoneRegistry").doc(phone);
  const profileRef = db.collection("users").doc(uid);
  const settingsRef = db.collection("siteSettings").doc("public");
  await db.runTransaction(async (transaction) => {
    // Soma nyaraka zote kabla ya kuanza kuandika transaction.
    const registry = await transaction.get(registryRef);
    const profiles = await transaction.get(db.collection("users").where("phone", "==", phone).limit(2));
    const profileSnap = await transaction.get(profileRef);
    const settingsSnap = await transaction.get(settingsRef);
    if (profiles.docs.some((profile) => profile.id !== uid)) {
      throw new ApiError("already-exists", "Namba hii tayari imesajiliwa. Tafadhali ingia kwenye akaunti yako.");
    }
    if (registry.exists && registry.data()?.uid !== uid) {
      throw new ApiError("already-exists", "Namba hii tayari imesajiliwa. Tafadhali ingia kwenye akaunti yako.");
    }

    const config = settingsSnap.exists ? ((settingsSnap.data()?.tokenBonusConfig ?? {}) as Record<string, unknown>) : {};
    const registrationBonus = 12; // Kiasi kilichowekwa: akaunti mpya hupata tokeni 12 mara moja.
    const existingProfile = profileSnap.exists ? profileSnap.data() as Profile : null;
    const currentOther = Number(existingProfile?.tokenBalanceOther ?? existingProfile?.tokenBalance ?? 0);
    const shouldGrantBonus = registrationBonus > 0 && existingProfile?.tokenBonusRegistrationGranted !== true;
    const bonus = shouldGrantBonus ? registrationBonus : 0;

    if (!registry.exists) transaction.create(registryRef, { uid, phone, createdAt: FieldValue.serverTimestamp() });

    if (!profileSnap.exists) {
      transaction.create(profileRef, {
        uid, firstName, lastName, phone, name: name || "Mwanachama", username,
        tokenBalance: bonus, tokenBalanceOther: bonus, tokenBalanceNida: 0,
        ...(bonus > 0 ? { tokenBonusRegistrationGranted: true } : {}),
        verificationStatus: "approved", role: "user", permissions: {},
        createdAt: FieldValue.serverTimestamp(), language: "sw", updatedAt: FieldValue.serverTimestamp(),
      });
    } else if (shouldGrantBonus) {
      transaction.update(profileRef, { tokenBalanceOther: currentOther + bonus, tokenBalance: currentOther + bonus, tokenBonusRegistrationGranted: true, updatedAt: FieldValue.serverTimestamp() });
    }

    if (bonus > 0) {
      const ledgerRef = db.collection("tokenTransactions").doc("registration_" + uid);
      transaction.set(ledgerRef, { transactionId: ledgerRef.id, userId: uid, actorId: "SYSTEM", tokenType: "huduma", type: "bonus", amount: bonus, balanceBefore: currentOther, balanceAfter: currentOther + bonus, reason: "Bonus ya usajili mpya", serviceId: "registration-bonus", serviceName: "Registration token bonus", reference: ledgerRef.id, createdAt: FieldValue.serverTimestamp(), status: "completed" }, { merge: true });
    }
  });

  // Hakikisha commit imeonekana kwenye Firestore kabla ya kurudisha mafanikio kwa browser.
  const confirmedProfile = await profileRef.get();
  if (!confirmedProfile.exists) {
    console.error("claimRegistrationPhone committed but profile verification failed", { uid, projectId: getWorkerEnv().FIREBASE_PROJECT_ID });
    throw new ApiError("internal", "Profile haikuonekana baada ya kuhifadhiwa. Jaribu tena.");
  }
  return { ok: true, profileCreated: true, uid };
});

export const changeOwnPassword = callable(async (request) => {
  const uid = authUid(request);
  const profile = await profileFor(uid, request.profile as Profile | undefined);
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
  const actor = await profileFor(uid, request.profile as Profile | undefined);
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
  const actor = await profileFor(uid, request.profile as Profile | undefined);
  requirePermission(actor, "manageUsers");
  const data = (request.data ?? {}) as Record<string, unknown>;
  const userId = text(data.userId, 180);
  const requestedMode = data.accessMode ?? (data.status === "blocked" || data.status === "deleted" ? "denied" : "active");
  if (!['active', 'read_only', 'limited', 'denied'].includes(String(requestedMode))) throw new ApiError("invalid-argument", "Aina ya ufungaji si sahihi.");
  const mode = String(requestedMode);
  const reason = data.reason === undefined ? "" : typeof data.reason === "string" ? data.reason.trim().slice(0, 500) : null;
  if (reason === null) throw new ApiError("invalid-argument", "Sababu ya kufungia lazima iwe maandishi.");
  const customMessage = data.restrictionMessage === undefined ? "" : typeof data.restrictionMessage === "string" ? data.restrictionMessage.trim().slice(0, 1000) : null;
  if (customMessage === null) throw new ApiError("invalid-argument", "Ujumbe wa arifa lazima uwe maandishi.");
  const allowedActions = data.allowedActions === undefined ? [] : data.allowedActions;
  if (!Array.isArray(allowedActions) || allowedActions.some((action) => typeof action !== "string" || !accountRestrictionActions.includes(action as AccountRestrictionAction))) {
    throw new ApiError("invalid-argument", "Vitendo vilivyoruhusiwa si sahihi.");
  }
  if (mode === "limited" && allowedActions.length === 0) throw new ApiError("invalid-argument", "Chagua angalau kitendo kimoja, au tumia hali ya kusoma tu.");
  if (userId === uid) throw new ApiError("permission-denied", "Huwezi kubadilisha status ya akaunti yako mwenyewe.");
  const defaultMessage = mode === "denied" ? "Akaunti yako imezuiwa kutumia mfumo kwa sasa."
    : mode === "read_only" ? "Akaunti yako imewekwa kwenye hali ya kusoma tu."
    : mode === "limited" ? "Akaunti yako imewekewa ruhusa maalum."
    : "";
  const userMessage = mode === "active" ? "" : customMessage || defaultMessage;
  const targetRef = db.collection("users").doc(userId);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(targetRef);
    if (!snapshot.exists) throw new ApiError("not-found", "Mtumiaji hakupatikana.");
    const target = snapshot.data() as Profile;
    const targetRole = resolveAuthRole(target.role, target.phone, getWorkerEnv().SUPER_ADMIN_PHONE ?? "255698232313").role;
    if (targetRole === "super_admin") throw new ApiError("permission-denied", "Super Admin inalindwa.");
    const next = {
      accountStatus: mode === "denied" ? "blocked" : "active",
      accessMode: mode,
      allowedActions: mode === "limited" ? allowedActions : [],
      restrictionReason: mode === "active" ? "" : reason,
      restrictionMessage: userMessage,
      restrictionUpdatedBy: uid,
      restrictionUpdatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    transaction.update(targetRef, next);
    if (mode !== "active") {
      const messageSubject = mode === "denied" ? "Ufikiaji wa akaunti umezuiwa" : "Taarifa ya ufikiaji wa akaunti";
      const messageBody = [userMessage, reason ? `Sababu: ${reason}` : "", "Kwa msaada, wasiliana na admin kupitia 0698232313."].filter(Boolean).join("\n\n");
      transaction.create(db.collection("messages").doc(), {
        recipientId: userId,
        subject: messageSubject,
        body: messageBody,
        type: "accountRestriction",
        accessMode: mode,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    recordAudit(transaction, uid, String(actor.role), "SET_ACCOUNT_STATUS", "user", userId,
      { accessMode: resolveAccountAccessMode(target), reason: target.restrictionReason ?? "", allowedActions: target.allowedActions ?? [] },
      { accessMode: mode, reason, allowedActions: next.allowedActions, customNotice: Boolean(customMessage) });
    return { ok: true };
  });
});

export const verifyUser = callable(async (request) => {
  const uid = authUid(request);
  const actor = await profileFor(uid, request.profile as Profile | undefined);
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
  applicantName?: unknown;
  businessType?: unknown; otherBusinessType?: unknown;
  licenseType?: unknown; principalBranch?: unknown; region?: unknown; district?: unknown;
  ward?: unknown; street?: unknown; tin?: unknown; licenseFee?: unknown; licenseNumber?: unknown;
};

function cleanText(value: unknown, label: string, max = 180) {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > max || /[\\r\\n]/.test(value)) throw new ApiError("invalid-argument", `${label} si sahihi.`);
  return value.trim();
}

function titleCaseLocation(value: string) {
  return value.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, prefix, letter) => `${prefix}${letter.toUpperCase()}`);
}

function normalizeLicenseRequest(data: LicenseRequest) {
  const form = {
    applicantName: cleanText(data.applicantName, "Majina matatu", 240).replace(/\s+/g, " ").toUpperCase(),
    businessType: cleanText(data.businessType, "Aina ya biashara", 100).toUpperCase(),
    otherBusinessType: typeof data.otherBusinessType === "string" ? data.otherBusinessType.trim().slice(0, 100).toUpperCase() : "",
    licenseType: data.licenseType === "NEW LICENCE" || data.licenseType === "RENEWED LICENCE" ? data.licenseType : "",
    principalBranch: data.principalBranch === "PRINCIPAL" || data.principalBranch === "BRANCH" ? data.principalBranch : "",
    // Accept any region name supplied by the user; do not validate against a fixed region list.
    region: titleCaseLocation(typeof data.region === "string" ? data.region.trim().slice(0, 80) : ""),
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
    applicantName: String(application.applicantData?.applicantName ?? [application.applicantData?.firstName, application.applicantData?.middleName, application.applicantData?.lastName].filter(Boolean).join(" ")),
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
  const data = (request.data ?? {}) as { reservationId?: unknown; licenseType?: unknown };
  const reservationId = cleanText(data.reservationId ?? randomUUID(), "Reservation ID", 160);
  if (data.licenseType === "RENEWED LICENCE") throw new ApiError("failed-precondition", "Renewed Licence hutumii namba mpya.");
  const reservationRef = db.collection("licenseNumberReservations").doc(reservationId);
  let licenseNumber = "";
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(reservationRef);
    if (existing.exists) {
      const current = existing.data()!;
      if (current.userId !== uid) throw new ApiError("already-exists", "Reservation ID si sahihi.");
      const currentNumber = String(current.licenseNumber ?? "");
      if (/^BL01699682026-27000\d{5}$/.test(currentNumber)) {
        licenseNumber = currentNumber;
      } else {
        licenseNumber = generateRandomBusinessLicenseNumber();
        transaction.update(reservationRef, {
          licenseNumber,
          status: "RESERVED",
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      return;
    }
    if (await serviceIsLocked(transaction, "leseni-biashara")) throw new ApiError("failed-precondition", "Huduma ya Leseni ya Biashara imefungwa kwa sasa.");
    licenseNumber = generateRandomBusinessLicenseNumber();
    transaction.create(reservationRef, { reservationId, userId: uid, licenseNumber, status: "RESERVED", createdAt: FieldValue.serverTimestamp() });
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
    const hudumaTokens = profile.tokenBalanceOther === undefined ? Number(profile.tokenBalance ?? 0) : Number(profile.tokenBalanceOther);
    if (!Number.isSafeInteger(hudumaTokens) || hudumaTokens < 2) throw new ApiError("failed-precondition", "Huna tokeni za huduma za kutosha kupakua hati hii. Unahitaji tokeni 2.");

    const reservationSnapshot = await transaction.get(reservationRef);
    let licenseNumber: string;
    if (form.licenseType === "RENEWED LICENCE") {
      licenseNumber = cleanText(data.licenseNumber, "Namba ya leseni ya zamani", 30);
      if (!/^BL01699682026-27000\d{5}$/.test(licenseNumber)) throw new ApiError("invalid-argument", "Namba ya leseni lazima iwe kama BL01699682026-27000012345.");
    } else if (reservationSnapshot.exists) {
      const reservation = reservationSnapshot.data()!;
      if (reservation.userId !== uid) throw new ApiError("permission-denied", "Reservation ID si sahihi.");
      const reservedNumber = String(reservation.licenseNumber ?? "");
      if (/^BL01699682026-27000\d{5}$/.test(reservedNumber)) {
        licenseNumber = reservedNumber;
      } else {
        licenseNumber = generateRandomBusinessLicenseNumber();
        transaction.update(reservationRef, {
          licenseNumber,
          status: "RESERVED",
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    } else {
      licenseNumber = generateRandomBusinessLicenseNumber();
      transaction.create(reservationRef, { reservationId: requestId, userId: uid, licenseNumber, status: "RESERVED", createdAt: FieldValue.serverTimestamp() });
    }
    const applicationId = String(existing?.applicationId ?? `APP-${randomUUID().replaceAll("-", "").slice(0, 18).toUpperCase()}`);
    const issueDate = String(existing?.licenseData?.dateOfIssue ?? dates.issueDate);
    const expiryDate = String(existing?.licenseData?.expiryDate ?? dates.expiryDate);
    const applicationData = {
      applicationId, requestId, userId: uid, templateId: "business-license-v1", serviceId: "leseni-biashara", licenseForm: form,
      applicantData: { applicantName: form.applicantName },
      businessData: { businessType: form.businessType, otherBusinessType: form.otherBusinessType, tin: form.tin },
      locationData: { region: form.region, ward: form.ward, street: form.street },
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

    const before = profile.tokenBalanceOther === undefined ? Number(profile.tokenBalance ?? 0) : Number(profile.tokenBalanceOther);
    if (!Number.isSafeInteger(before) || before < 2) throw new ApiError("failed-precondition", "Huna tokeni za huduma za kutosha kupakua hati hii. Unahitaji tokeni 2.");
    const after = before - 2;
    transaction.update(userRef, { tokenBalanceOther: after, tokenBalance: after, updatedAt: FieldValue.serverTimestamp() });
    transaction.create(ledgerRef, { transactionId: ledgerRef.id, userId: uid, actorId: uid, tokenType: "huduma", type: "service_usage", amount: -2, balanceBefore: before, balanceAfter: after, reason: "Matumizi ya LESENI YA BIASHARA", serviceId: "leseni-biashara", serviceName: "LESENI YA BIASHARA", reference: ledgerRef.id, createdAt: FieldValue.serverTimestamp(), status: "completed", applicationId: application.applicationId });
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
  const profile = await profileFor(uid, request.profile as Profile | undefined);
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
