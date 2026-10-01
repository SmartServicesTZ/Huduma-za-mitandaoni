import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, type Transaction } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";
import { onCall, onRequest, HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { defineSecret } from "firebase-functions/params";
import { defaultLipaServices, defaultServices } from "./defaultCatalog.js";
import { fimipayTerminalStatus, isConfirmedLivePayment, isFimipaySuccessEvent, isOpenTokenPurchaseStatus, makeTokenPurchaseOrderId, normalizeTanzaniaPhone, tokenCreditsForAmount, verifyFimipayWebhookSignature } from "./fimipayCore.js";

initializeApp();
setGlobalOptions({ region: process.env.FUNCTIONS_REGION ?? "us-central1", maxInstances: 20 });

const db = getFirestore();
const bucket = getStorage().bucket();
const fimipayApiSecret = defineSecret("FIMIPAY_SECRET_KEY");
const fimipayWebhookSecret = defineSecret("FIMIPAY_WEBHOOK_SECRET");
const functionsRoot = path.dirname(fileURLToPath(import.meta.url));
const roles = ["user", "admin", "moderator", "support", "super_admin"] as const;
type Role = (typeof roles)[number];
const permissions = ["viewUsers", "manageUsers", "manageTokens", "manageServices", "manageLipaApplications", "manageContent", "manageMessages", "manageReports", "manageSettings", "manageLicenses", "viewAuditLogs"] as const;
const defaultLockedServiceSlugs = new Set(["cheti-kuzaliwa", "visa-pasipoti", "cheti-ndoa", "ripoti-hasara"]);

type Profile = { role?: Role; permissions?: Partial<Record<(typeof permissions)[number], boolean>>; tokenBalance?: number; verificationStatus?: string; accountStatus?: string; name?: string; email?: string; phone?: string };

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

async function serviceIsLocked(transaction: Transaction, slug: string) {
  const lockSnapshot = await transaction.get(db.collection("serviceLocks").doc(slug));
  if (lockSnapshot.exists && typeof lockSnapshot.data()?.isLocked === "boolean") return lockSnapshot.data()!.isLocked === true;
  if (defaultLockedServiceSlugs.has(slug)) return true;
  const serviceSnapshot = await transaction.get(db.collection("services").where("slug", "==", slug).limit(1));
  return serviceSnapshot.docs.some((document) => document.data().isLocked === true);
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
  lipaServices: { permission: "manageServices", targetType: "lipaService" },
  announcements: { permission: "manageContent", targetType: "announcement" },
  tutorialVideos: { permission: "manageContent", targetType: "tutorialVideo" },
  messages: { permission: "manageMessages", targetType: "message" },
  licenseTemplates: { permission: "manageLicenses", targetType: "licenseTemplate" },
  siteSettings: { permission: "manageSettings", targetType: "siteSettings" },
};

const blockedFields = new Set(["password", "pin", "pinHash", "role", "permissions", "tokenBalance", "actorId", "actorRole", "catalogInitialized", "updatedBy", "createdAt", "updatedAt"]);
function safePatch(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new HttpsError("invalid-argument", "Taarifa za kuhifadhi si sahihi.");
  const patch = Object.fromEntries(Object.entries(value).filter(([key, entry]) => !blockedFields.has(key) && entry !== undefined));
  if (Object.keys(patch).length > 40) throw new HttpsError("invalid-argument", "Taarifa zimezidi.");
  return patch;
}

const formFieldTypes = new Set(["TEXT", "NUMBER", "PHONE", "TIN", "NIDA", "DROPDOWN", "TEXTAREA", "IMAGE_UPLOAD", "FILE_UPLOAD", "DATE"]);
function validateConfiguredFields(value: unknown) {
  if (!Array.isArray(value) || value.length > 40) throw new HttpsError("invalid-argument", "Orodha ya fields si sahihi.");
  const names = new Set<string>();
  return value.map((raw, index) => {
    const field = objectValue(raw, "Field");
    const fieldName = text(field.fieldName, 64);
    const label = text(field.label, 100);
    const type = text(field.type, 30);
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(fieldName) || names.has(fieldName)) throw new HttpsError("invalid-argument", "Jina la field limejirudia au si sahihi.");
    if (!formFieldTypes.has(type)) throw new HttpsError("invalid-argument", `Aina ya field ${type} haijaruhusiwa.`);
    names.add(fieldName);
    const options = field.options === undefined ? undefined : Array.isArray(field.options) ? field.options.map((item) => text(item, 120)).slice(0, 80) : (() => { throw new HttpsError("invalid-argument", `Options za ${label} si sahihi.`); })();
    if (type === "DROPDOWN" && (!options || options.length === 0)) throw new HttpsError("invalid-argument", `Weka options za ${label}.`);
    const validation = field.validation === undefined || field.validation === "" ? undefined : text(field.validation, 200);
    if (validation) { try { new RegExp(validation); } catch { throw new HttpsError("invalid-argument", `Regex ya ${label} si sahihi.`); } }
    const maxSizeMb = field.maxSizeMb === undefined ? undefined : Number(field.maxSizeMb);
    if (maxSizeMb !== undefined && (!Number.isFinite(maxSizeMb) || maxSizeMb <= 0 || maxSizeMb > 10)) throw new HttpsError("invalid-argument", `Ukubwa wa juu wa ${label} lazima uwe 1–10 MB.`);
    return { fieldName, label, type, placeholder: typeof field.placeholder === "string" ? field.placeholder.slice(0, 200) : "", required: field.required === true, helpText: typeof field.helpText === "string" ? field.helpText.slice(0, 300) : "", order: Number.isFinite(Number(field.order)) ? Number(field.order) : index, ...(options ? { options } : {}), ...(validation ? { validation } : {}), ...(maxSizeMb ? { maxSizeMb } : {}), ...(Array.isArray(field.accept) ? { accept: field.accept.filter((item): item is string => typeof item === "string" && item.length <= 100).slice(0, 10) } : {}) };
  });
}

export const adminWrite = onCall(async (request) => {
  const uid = authUid(request);
  const actor = await profileFor(uid);
  const data = (request.data ?? {}) as Record<string, unknown>;
  const collectionName = text(data.collection, 80);
  const policy = writePolicy[collectionName];
  if (!policy) throw new HttpsError("invalid-argument", "Collection hairuhusiwi.");
  requirePermission(actor, policy.permission);
  if (collectionName === "lipaServices" && actor.role !== "super_admin") throw new HttpsError("permission-denied", "Mipangilio ya mitandao ya Lipa inabadilishwa na Super Admin pekee.");
  if (collectionName === "siteSettings" && actor.role !== "super_admin" && typeof data.values === "object" && data.values !== null && !Array.isArray(data.values)) {
    const values = data.values as Record<string, unknown>;
    if ("serviceOrder" in values || "homepageSectionOrder" in values) throw new HttpsError("permission-denied", "Mpangilio wa ukurasa wa mwanzo unaweza kubadilishwa na Super Admin pekee.");
  }
  if (collectionName === "licenseTemplates" && actor.role !== "super_admin") throw new HttpsError("permission-denied", "Leseni zinasimamiwa na Super Admin pekee.");
  const id = data.id === undefined || data.id === null || data.id === "" ? db.collection(collectionName).doc().id : text(data.id, 180);
  if (collectionName === "siteSettings" && id !== "public") throw new HttpsError("invalid-argument", "Site settings ID si sahihi.");
  const targetRef = db.collection(collectionName).doc(id);
  const patch = safePatch(data.values);
  if (collectionName === "services" || collectionName === "lipaServices") {
    const slug = text(patch.slug ?? patch.id ?? id, 120);
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/.test(slug)) throw new HttpsError("invalid-argument", "Slug si sahihi.");
    patch.slug = slug;
    if (patch.name !== undefined) patch.name = text(patch.name, 120);
    if (patch.tokenCost !== undefined) {
      const tokenCost = Number(patch.tokenCost);
      if (!Number.isSafeInteger(tokenCost) || tokenCost < 0 || tokenCost > 100000) throw new HttpsError("invalid-argument", "Gharama ya tokeni si sahihi.");
      patch.tokenCost = tokenCost;
    }
    if (patch.fields !== undefined) patch.fields = validateConfiguredFields(patch.fields);
    if (patch.statusOptions !== undefined && (!Array.isArray(patch.statusOptions) || patch.statusOptions.length > 12 || patch.statusOptions.some((status) => typeof status !== "string" || status.length > 40))) throw new HttpsError("invalid-argument", "Status options si sahihi.");
    if (patch.active !== undefined && typeof patch.active !== "boolean") throw new HttpsError("invalid-argument", "Hali ya huduma si sahihi.");
    if (patch.isVisible !== undefined && typeof patch.isVisible !== "boolean") throw new HttpsError("invalid-argument", "Hali ya kuonekana si sahihi.");
    if (patch.reward !== undefined && (!Number.isFinite(Number(patch.reward)) || Number(patch.reward) < 0 || Number(patch.reward) > 100000000)) throw new HttpsError("invalid-argument", "Taarifa ya zawadi si sahihi.");
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

export const setHomepageServiceOrder = onCall(async (request) => {
  const uid = authUid(request);
  const actor = await profileFor(uid);
  if (actor.role !== "super_admin") throw new HttpsError("permission-denied", "Mpangilio wa huduma unaweza kubadilishwa na Super Admin pekee.");

  const data = (request.data ?? {}) as Record<string, unknown>;
  if (!Array.isArray(data.serviceOrder) || data.serviceOrder.length === 0 || data.serviceOrder.length > 300) {
    throw new HttpsError("invalid-argument", "Mpangilio wa huduma si sahihi.");
  }
  const serviceOrder = data.serviceOrder.map((value) => {
    const slug = text(value, 120);
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/.test(slug)) throw new HttpsError("invalid-argument", "Kitambulisho cha huduma si sahihi.");
    return slug;
  });
  if (new Set(serviceOrder).size !== serviceOrder.length) throw new HttpsError("invalid-argument", "Mpangilio una huduma zilizorudiwa.");

  if (!Array.isArray(data.homepageSectionOrder) || data.homepageSectionOrder.length !== homepageSections.length) throw new HttpsError("invalid-argument", "Mpangilio wa makundi ya ukurasa wa mwanzo si sahihi.");
  const homepageSectionOrder = data.homepageSectionOrder.map((value) => text(value, 40));
  if (new Set(homepageSectionOrder).size !== homepageSections.length || homepageSectionOrder.some((id) => !homepageSections.includes(id as (typeof homepageSections)[number]))) {
    throw new HttpsError("invalid-argument", "Makundi ya ukurasa wa mwanzo lazima yawe ya kipekee na sahihi.");
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

export const adminDelete = onCall(async (request) => {
  const uid = authUid(request);
  const actor = await profileFor(uid);
  const data = (request.data ?? {}) as Record<string, unknown>;
  const collectionName = text(data.collection, 80);
  const policy = writePolicy[collectionName];
  if (!policy || collectionName === "siteSettings") throw new HttpsError("invalid-argument", "Delete hairuhusiwi kwa collection hii.");
  requirePermission(actor, policy.permission);
  if (collectionName === "lipaServices" && actor.role !== "super_admin") throw new HttpsError("permission-denied", "Mipangilio ya mitandao ya Lipa inasimamiwa na Super Admin pekee.");
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
  const requestId = text(data.requestId, 160);
  const requestedCost = Number(data.tokenCost);
  if (!Number.isInteger(requestedCost) || requestedCost <= 0 || requestedCost > 100000) throw new HttpsError("invalid-argument", "Gharama ya tokeni si sahihi.");

  const userRef = db.collection("users").doc(uid);
  const ledgerRef = db.collection("tokenTransactions").doc(requestId);
  return db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ledgerRef);
    if (existing.exists) {
      const row = existing.data()!;
      if (row.userId !== uid || row.serviceId !== serviceId) throw new HttpsError("already-exists", "Request ya tokeni si sahihi.");
      return { reference: requestId, balanceAfter: row.balanceAfter, duplicate: true };
    }
    if (await serviceIsLocked(transaction, serviceId)) throw new HttpsError("failed-precondition", "Huduma hii imefungwa kwa sasa.");
    const serviceSnapshot = await transaction.get(db.collection("services").where("slug", "==", serviceId).limit(1));
    const service = serviceSnapshot.docs[0]?.data();
    if (!service || service.active === false || service.isVisible === false) throw new HttpsError("failed-precondition", "Huduma hii haipatikani kwa sasa.");
    if (service.isFree === true) throw new HttpsError("failed-precondition", "Huduma hii haitumii tokeni.");
    const cost = Number(service.tokenCost);
    if (!Number.isSafeInteger(cost) || cost <= 0 || cost > 100000) throw new HttpsError("failed-precondition", "Gharama ya huduma haijawekwa sawa. Wasiliana na admin.");
    const serviceName = String(service.name ?? data.serviceName ?? serviceId).slice(0, 180);
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
  const requestId = text(data.requestId, 160);
  if (!/^[A-Za-z0-9_-]{8,160}$/.test(requestId)) throw new HttpsError("invalid-argument", "Rejea ya ombi la tokeni si sahihi.");
  const amount = Number(data.amount);
  if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 100000) throw new HttpsError("invalid-argument", "Kiasi cha tokeni si sahihi.");
  const userRef = db.collection("users").doc(userId);
  const ledgerRef = db.collection("tokenTransactions").doc(`${uid}_${requestId}`);
  try {
    return await db.runTransaction(async (transaction) => {
      const prior = await transaction.get(ledgerRef);
      if (prior.exists) {
        const row = prior.data()!;
        if (row.actorId !== uid || row.userId !== userId || Number(row.amount) !== amount || row.reason !== description) throw new HttpsError("already-exists", "Rejea hii tayari imetumika kwa ombi tofauti.");
        return { balanceAfter: row.balanceAfter, reference: row.reference ?? ledgerRef.id, duplicate: true };
      }
      const snapshot = await transaction.get(userRef);
      if (!snapshot.exists) throw new HttpsError("not-found", "Mtumiaji hakupatikana.");
      const target = snapshot.data() as Profile;
      if (target.role === "super_admin" && uid !== userId) throw new HttpsError("permission-denied", "Super Admin inalindwa.");
      const before = Number(target.tokenBalance ?? 0);
      if (!Number.isSafeInteger(before) || before < 0) throw new HttpsError("failed-precondition", "Salio la tokeni kwenye profile si sahihi. Kagua taarifa za mtumiaji kwanza.");
      const after = before + amount;
      if (!Number.isSafeInteger(after)) throw new HttpsError("out-of-range", "Salio jipya la tokeni limezidi kikomo kinachoruhusiwa.");
      if (after < 0) throw new HttpsError("failed-precondition", "Salio haliwezi kuwa chini ya sifuri.");
      transaction.update(userRef, { tokenBalance: after, updatedAt: FieldValue.serverTimestamp() });
      transaction.set(ledgerRef, { transactionId: ledgerRef.id, userId, actorId: uid, type: amount > 0 ? "credit" : "debit", amount, balanceBefore: before, balanceAfter: after, reason: description, serviceId: "admin-adjustment", serviceName: "Admin token adjustment", reference: ledgerRef.id, createdAt: FieldValue.serverTimestamp(), status: "completed" });
      recordAudit(transaction, uid, String(profile.role), amount > 0 ? "ADD_TOKENS" : "REMOVE_TOKENS", "user", userId, { tokenBalance: before }, { tokenBalance: after }, { amount, description });
      return { balanceAfter: after, reference: ledgerRef.id, duplicate: false };
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    const cause = error as { code?: unknown; message?: unknown };
    console.error("adjustTokens failed", { actorId: uid, targetUserId: userId, requestId, amount, code: String(cause?.code ?? "unknown"), message: String(cause?.message ?? "unknown") });
    throw new HttpsError("internal", "Imeshindikana kuhifadhi tokeni. Jaribu tena; ombi linalindwa lisihesabiwe mara mbili.");
  }
});

export const setServiceLock = onCall(async (request) => {
  const uid = authUid(request);
  const actor = await profileFor(uid);
  requirePermission(actor, "manageServices");
  const data = (request.data ?? {}) as Record<string, unknown>;
  const slug = text(data.slug, 120);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/.test(slug)) throw new HttpsError("invalid-argument", "Kitambulisho cha huduma si sahihi.");
  if (typeof data.isLocked !== "boolean") throw new HttpsError("invalid-argument", "Hali ya huduma si sahihi.");
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
    const existingRecords: Array<{ item: (typeof refs)[number]; snapshot: FirebaseFirestore.DocumentSnapshot; targetRef: FirebaseFirestore.DocumentReference }> = [];
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

export const ensureDefaultServiceCatalog = onCall(async (request) => {
  const uid = authUid(request);
  const actor = await profileFor(uid);
  requirePermission(actor, "manageServices");
  const actorRole = String(actor.role ?? "user");
  return initializeServiceCatalog(uid, actorRole, true);
});

export const seedServiceCatalog = onCall(async (request) => {
  const uid = authUid(request);
  const actor = await profileFor(uid);
  if (actor.role !== "super_admin") throw new HttpsError("permission-denied", "Super Admin pekee anaweza kuanzisha katalogi ya huduma.");
  return initializeServiceCatalog(uid, String(actor.role), false);
});

function objectValue(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new HttpsError("invalid-argument", `${field} si sahihi.`);
  return value as Record<string, unknown>;
}

function cleanApplicationValues(values: Record<string, unknown>, fields: Array<Record<string, unknown>>, uid: string, applicationId: string, uploadCollection = "lipaUploads") {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    const name = String(field.fieldName ?? "");
    const label = String(field.label ?? name);
    const type = String(field.type ?? "TEXT");
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name)) throw new HttpsError("failed-precondition", "Fomu ya huduma ina field isiyo sahihi.");
    const value = values[name];
    const raw = value == null ? "" : String(value).trim();
    if (field.required === true && !raw) throw new HttpsError("invalid-argument", `${label} inahitajika.`);
    if (!raw) continue;
    if (["IMAGE_UPLOAD", "FILE_UPLOAD"].includes(type)) {
      const prefix = `${uploadCollection}/${uid}/${applicationId}/`;
      if (!raw.startsWith(prefix) || raw.includes("..") || raw.length > 600) throw new HttpsError("invalid-argument", `Pakia ${label.toLowerCase()} tena.`);
      result[name] = raw;
      continue;
    }
    if (type === "NUMBER" && !Number.isFinite(Number(raw))) throw new HttpsError("invalid-argument", `${label} iwe namba sahihi.`);
    if (type === "PHONE" && !/^\+?[0-9][0-9 ()-]{6,18}$/.test(raw)) throw new HttpsError("invalid-argument", `${label} si namba sahihi ya simu.`);
    if (type === "TIN" && !/^\d{3}-\d{3}-\d{3}$/.test(raw)) throw new HttpsError("invalid-argument", `${label} itumie muundo 123-123-123.`);
    if (type === "NIDA" && !/^\d{8}-\d{5}-\d{5}-\d{2}$/.test(raw)) throw new HttpsError("invalid-argument", `${label} itumie muundo 20068517-27520-00001-22.`);
    if (type === "DROPDOWN" && !(Array.isArray(field.options) && field.options.includes(raw))) throw new HttpsError("invalid-argument", `Chagua ${label.toLowerCase()} kwenye orodha.`);
    if (type === "DATE" && (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(`${raw}T00:00:00Z`)))) throw new HttpsError("invalid-argument", `${label} si tarehe sahihi.`);
    if (typeof field.validation === "string" && field.validation.length <= 200) {
      try { if (!new RegExp(field.validation).test(raw)) throw new HttpsError("invalid-argument", `${label} haijakidhi muundo unaotakiwa.`); }
      catch (error) { if (error instanceof HttpsError) throw error; throw new HttpsError("failed-precondition", `Kanuni ya ${label.toLowerCase()} si sahihi.`); }
    }
    result[name] = type === "NUMBER" ? Number(raw) : raw.slice(0, 2000);
  }
  return result;
}

export const submitLipaApplication = onCall({ maxInstances: 20 }, async (request) => {
  const uid = authUid(request);
  const profile = await profileFor(uid);
  if (profile.accountStatus === "blocked" || profile.accountStatus === "deleted") throw new HttpsError("permission-denied", "Akaunti hii imezuiwa.");
  const data = objectValue(request.data, "Taarifa za ombi");
  const networkId = text(data.networkId, 80);
  const applicationId = text(data.applicationId, 80);
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(applicationId)) throw new HttpsError("invalid-argument", "Namba ya ombi si sahihi.");
  const configRef = db.collection("lipaServices").doc(networkId);
  const configSnapshot = await configRef.get();
  if (!configSnapshot.exists) throw new HttpsError("not-found", "Mtandao huu haujapatikana.");
  const config = configSnapshot.data()!;
  if (config.active !== true) throw new HttpsError("failed-precondition", "Maombi ya mtandao huu yamefungwa kwa sasa.");
  const fields = Array.isArray(config.fields) ? config.fields as Array<Record<string, unknown>> : [];
  const applicantData = cleanApplicationValues(objectValue(data.values, "Fomu"), fields, uid, applicationId);
  const openRef = db.collection("lipaOpenApplications").doc(`${uid}_${networkId}`);
  const preexistingOpen = await openRef.get();
  if (preexistingOpen.exists) throw new HttpsError("already-exists", "Una ombi la mtandao huu ambalo bado linasubiri kukamilika.", { applicationId: preexistingOpen.data()?.applicationId });
  const finalPaths: string[] = [];
  const sourcePaths: string[] = [];
  try {
  for (const field of fields) {
    const name = String(field.fieldName ?? "");
    const pathValue = applicantData[name];
    if (!["IMAGE_UPLOAD", "FILE_UPLOAD"].includes(String(field.type)) || typeof pathValue !== "string") continue;
    const sourceFile = bucket.file(pathValue);
    const [metadata] = await sourceFile.getMetadata().catch(() => { throw new HttpsError("invalid-argument", `Faili la ${String(field.label ?? name).toLowerCase()} halijapatikana.`); });
    const allowed = Array.isArray(field.accept) ? field.accept : String(field.type) === "IMAGE_UPLOAD" ? ["image/jpeg", "image/png", "image/webp"] : [];
    const maxSize = Math.min(Number(field.maxSizeMb ?? 5), 10) * 1024 * 1024;
    if (Number(metadata.size) > maxSize || (allowed.length && !allowed.includes(String(metadata.contentType)))) throw new HttpsError("invalid-argument", `Aina au ukubwa wa ${String(field.label ?? name).toLowerCase()} haurusiwi.`);
    const originalName = path.basename(pathValue).replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80);
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
    if (openSnapshot.exists) throw new HttpsError("already-exists", "Una ombi la mtandao huu ambalo bado linasubiri kukamilika.", { applicationId: openSnapshot.data()?.applicationId });
    const existingApplication = await transaction.get(applicationRef);
    if (existingApplication.exists) throw new HttpsError("already-exists", "Namba hii ya ombi tayari imetumika.");
    const application = {
      applicationId, userId: uid, userName: String(profile.name ?? ""), userEmail: String(profile.email ?? ""), network: String(config.name ?? networkId), networkId, serviceId: "pata-lipa-namba",
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

export const setLipaApplicationStatus = onCall(async (request) => {
  const uid = authUid(request);
  const actor = await profileFor(uid);
  requirePermission(actor, "manageLipaApplications");
  const data = objectValue(request.data, "Mabadiliko ya status");
  const applicationId = text(data.applicationId, 80);
  const status = String(data.status ?? "");
  if (!["PROCESSING", "APPROVED", "REJECTED"].includes(status)) throw new HttpsError("invalid-argument", "Status si sahihi.");
  const rejectionReason = typeof data.rejectionReason === "string" ? data.rejectionReason.trim().slice(0, 1000) : "";
  if (status === "REJECTED" && rejectionReason.length < 3) throw new HttpsError("invalid-argument", "Andika sababu ya kukataliwa kabla ya kuendelea.");
  const ref = db.collection("lipaApplications").doc(applicationId);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new HttpsError("not-found", "Ombi halikupatikana.");
    const application = snapshot.data()!;
    const from = String(application.status ?? "PENDING");
    const allowed = (status === "PROCESSING" && from === "PENDING") || ((status === "APPROVED" || status === "REJECTED") && from === "PROCESSING");
    if (!allowed) throw new HttpsError("failed-precondition", `Mabadiliko kutoka ${from} kwenda ${status} hayaruhusiwi.`);
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

export const markLipaApplicationViewed = onCall(async (request) => {
  const uid = authUid(request);
  const actor = await profileFor(uid);
  requirePermission(actor, "manageLipaApplications");
  const applicationId = text((request.data as Record<string, unknown> | undefined)?.applicationId, 80);
  const snapshot = await db.collection("lipaApplications").doc(applicationId).get();
  if (!snapshot.exists) throw new HttpsError("not-found", "Ombi halikupatikana.");
  const application = snapshot.data()!;
  const now = FieldValue.serverTimestamp();
  const auditRef = db.collection("auditLogs").doc();
  await auditRef.create({ action: "LIPA_APPLICATION_VIEWED", actorId: uid, actorRole: String(actor.role), applicationId, targetUserId: String(application.userId), reason: "", createdAt: now });
  return { ok: true };
});

export const getLipaApplicationDocument = onCall(async (request) => {
  const uid = authUid(request);
  const actor = await profileFor(uid);
  const data = objectValue(request.data, "Taarifa za faili");
  const applicationId = text(data.applicationId, 80);
  const fieldName = text(data.fieldName, 64);
  if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(fieldName)) throw new HttpsError("invalid-argument", "Field ya faili si sahihi.");
  const snapshot = await db.collection("lipaApplications").doc(applicationId).get();
  if (!snapshot.exists) throw new HttpsError("not-found", "Ombi halikupatikana.");
  const application = snapshot.data()!;
  if (application.userId !== uid) requirePermission(actor, "manageLipaApplications");
  const storagePath = String((application.applicantData as Record<string, unknown> | undefined)?.[fieldName] ?? "");
  if (!storagePath.startsWith(`lipaApplications/${applicationId}/documents/`)) throw new HttpsError("not-found", "Faili halikupatikana.");
  const [url] = await bucket.file(storagePath).getSignedUrl({ action: "read", expires: Date.now() + 5 * 60 * 1000 });
  return { url, expiresAt: Date.now() + 5 * 60 * 1000 };
});

export const createServiceApplication = onCall({ maxInstances: 20 }, async (request) => {
  const uid = authUid(request);
  const profile = await profileFor(uid);
  if (profile.accountStatus === "blocked" || profile.accountStatus === "deleted") throw new HttpsError("permission-denied", "Akaunti hii imezuiwa.");
  const data = objectValue(request.data, "Ombi la huduma");
  const serviceSlug = text(data.serviceSlug, 120);
  const applicationId = text(data.applicationId, 80);
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(applicationId)) throw new HttpsError("invalid-argument", "Namba ya ombi si sahihi.");
  const serviceSnapshot = await db.collection("services").where("slug", "==", serviceSlug).limit(1).get();
  if (serviceSnapshot.empty) throw new HttpsError("not-found", "Huduma haikupatikana.");
  const service = serviceSnapshot.docs[0].data();
  if (service.active === false || service.isVisible === false) throw new HttpsError("failed-precondition", "Huduma hii haipatikani kwa sasa.");
  if (serviceSlug === "pata-lipa-namba" || serviceSlug === "leseni-biashara") throw new HttpsError("failed-precondition", "Tumia fomu maalum ya huduma hii.");
  const fields = Array.isArray(service.fields) ? service.fields as Array<Record<string, unknown>> : [];
  const applicantData = cleanApplicationValues(objectValue(data.values, "Fomu"), fields, uid, applicationId, "serviceUploads");
  const finalPaths: string[] = [];
  const sourcePaths: string[] = [];
  for (const field of fields) {
    const name = String(field.fieldName ?? "");
    const filePath = applicantData[name];
    if (!["IMAGE_UPLOAD", "FILE_UPLOAD"].includes(String(field.type)) || typeof filePath !== "string") continue;
    const [metadata] = await bucket.file(filePath).getMetadata().catch(() => { throw new HttpsError("invalid-argument", `Faili la ${String(field.label ?? name)} halijapatikana.`); });
    const allowed = Array.isArray(field.accept) ? field.accept : String(field.type) === "IMAGE_UPLOAD" ? ["image/jpeg", "image/png", "image/webp"] : ["application/pdf"];
    if (Number(metadata.size) > Math.min(Number(field.maxSizeMb ?? 5), 10) * 1024 * 1024 || (allowed.length && !allowed.includes(String(metadata.contentType)))) throw new HttpsError("invalid-argument", `Aina au ukubwa wa ${String(field.label ?? name)} haurusiwi.`);
    const originalName = path.basename(filePath).replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80);
    const finalPath = `serviceApplications/${applicationId}/documents/${name}-${originalName}`;
    sourcePaths.push(filePath);
    await bucket.file(filePath).copy(bucket.file(finalPath));
    finalPaths.push(finalPath);
    applicantData[name] = finalPath;
  }
  const applicationRef = db.collection("serviceApplications").doc(applicationId);
  const openRef = db.collection("serviceOpenApplications").doc(`${uid}_${serviceSlug}`);
  const tokenCost = Number(service.isFree === true ? 0 : service.tokenCost);
  if (!Number.isSafeInteger(tokenCost) || tokenCost < 0 || tokenCost > 100000) throw new HttpsError("failed-precondition", "Gharama ya huduma haijawekwa sawa.");
  try {
  const result = await db.runTransaction(async (transaction) => {
    const prior = await transaction.get(applicationRef);
    if (prior.exists) {
      if (prior.data()?.userId === uid && prior.data()?.serviceSlug === serviceSlug) return { applicationId, status: prior.data()?.status ?? "PENDING", duplicate: true };
      throw new HttpsError("already-exists", "Namba hii ya ombi tayari imetumika.");
    }
    const open = await transaction.get(openRef);
    if (open.exists) throw new HttpsError("already-exists", "Una ombi la huduma hii ambalo bado linaendelea.", { applicationId: open.data()?.applicationId });
    if (await serviceIsLocked(transaction, serviceSlug)) throw new HttpsError("failed-precondition", "Huduma hii imefungwa kwa sasa.");
    const userRef = db.collection("users").doc(uid);
    const userSnapshot = await transaction.get(userRef);
    const user = userSnapshot.data() as Profile | undefined;
    if (!user) throw new HttpsError("permission-denied", "Profile haikupatikana.");
    let balanceAfter: number | null = null;
    let ledgerRef: FirebaseFirestore.DocumentReference | null = null;
    if (tokenCost > 0) {
      if (user.verificationStatus !== "approved") throw new HttpsError("permission-denied", "Akaunti yako haijathibitishwa na admin.");
      const before = Number(user.tokenBalance ?? 0);
      if (!Number.isSafeInteger(before) || before < tokenCost) throw new HttpsError("failed-precondition", "Tokeni hazitoshi kutumia huduma hii.");
      balanceAfter = before - tokenCost;
      transaction.update(userRef, { tokenBalance: balanceAfter, updatedAt: FieldValue.serverTimestamp() });
      ledgerRef = db.collection("tokenTransactions").doc(applicationId);
      transaction.create(ledgerRef, { transactionId: applicationId, reference: applicationId, userId: uid, actorId: uid, type: "service_usage", amount: -tokenCost, balanceBefore: before, balanceAfter, reason: `Ombi la ${String(service.name ?? serviceSlug)}`, serviceId: serviceSlug, serviceName: String(service.name ?? serviceSlug), createdAt: FieldValue.serverTimestamp(), status: "completed" });
    }
    transaction.create(applicationRef, { applicationId, userId: uid, userName: String(user.name ?? ""), userEmail: String(user.email ?? ""), serviceSlug, serviceName: String(service.name ?? serviceSlug), serviceFields: fields, statusOptions: Array.isArray(service.statusOptions) ? service.statusOptions : ["PENDING", "PROCESSING", "APPROVED", "REJECTED"], applicantData, status: "PENDING", submittedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp(), ...(balanceAfter !== null ? { balanceAfter } : {}) });
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

export const setServiceApplicationStatus = onCall(async (request) => {
  const uid = authUid(request);
  const actor = await profileFor(uid);
  requirePermission(actor, "manageServices");
  const data = objectValue(request.data, "Hali ya ombi");
  const applicationId = text(data.applicationId, 80);
  const status = text(data.status, 40);
  if (status === "PENDING") throw new HttpsError("invalid-argument", "Hali PENDING huwekwa ombi linapotumwa.");
  const rejectionReason = typeof data.rejectionReason === "string" ? data.rejectionReason.trim().slice(0, 1000) : "";
  if (status === "REJECTED" && rejectionReason.length < 3) throw new HttpsError("invalid-argument", "Sababu ya kukataliwa inahitajika.");
  const ref = db.collection("serviceApplications").doc(applicationId);
  const applicationSnapshot = await ref.get();
  if (!applicationSnapshot.exists) throw new HttpsError("not-found", "Ombi halikupatikana.");
  const applicationBefore = applicationSnapshot.data()!;
  const serviceSnapshot = await db.collection("services").where("slug", "==", applicationBefore.serviceSlug).limit(1).get();
  const service = serviceSnapshot.docs[0]?.data();
  const statusOptions = Array.isArray(service?.statusOptions) ? service.statusOptions : Array.isArray(applicationBefore.statusOptions) ? applicationBefore.statusOptions : ["PENDING", "PROCESSING", "APPROVED", "REJECTED"];
  if (!statusOptions.includes(status)) throw new HttpsError("failed-precondition", "Hali hii haipo kwenye status options za huduma.");
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new HttpsError("not-found", "Ombi halikupatikana.");
    const application = snapshot.data()!;
    const from = String(application.status ?? "PENDING");
    const terminal = ["APPROVED", "REJECTED"].includes(from);
    if (terminal || status === from) throw new HttpsError("failed-precondition", `Mabadiliko ya ${from} kwenda ${status} hayaruhusiwi.`);
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

export const markServiceApplicationViewed = onCall(async (request) => {
  const uid = authUid(request);
  const actor = await profileFor(uid);
  requirePermission(actor, "manageServices");
  const applicationId = text((request.data as Record<string, unknown> | undefined)?.applicationId, 80);
  const snapshot = await db.collection("serviceApplications").doc(applicationId).get();
  if (!snapshot.exists) throw new HttpsError("not-found", "Ombi halikupatikana.");
  const application = snapshot.data()!;
  await db.collection("auditLogs").add({ action: "SERVICE_APPLICATION_VIEWED", actorId: uid, actorRole: String(actor.role), applicationId, targetUserId: String(application.userId), createdAt: FieldValue.serverTimestamp() });
  return { ok: true };
});

export const getServiceApplicationDocument = onCall(async (request) => {
  const uid = authUid(request);
  const actor = await profileFor(uid);
  const data = objectValue(request.data, "Taarifa za faili");
  const applicationId = text(data.applicationId, 80);
  const fieldName = text(data.fieldName, 64);
  if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(fieldName)) throw new HttpsError("invalid-argument", "Field ya faili si sahihi.");
  const snapshot = await db.collection("serviceApplications").doc(applicationId).get();
  if (!snapshot.exists) throw new HttpsError("not-found", "Ombi halikupatikana.");
  const application = snapshot.data()!;
  if (application.userId !== uid) {
    requirePermission(actor, "manageServices");
    await db.collection("auditLogs").add({ action: "SERVICE_APPLICATION_DOCUMENT_VIEWED", actorId: uid, actorRole: String(actor.role), applicationId, targetUserId: String(application.userId), fieldName, createdAt: FieldValue.serverTimestamp() });
  }
  const storagePath = String((application.applicantData as Record<string, unknown> | undefined)?.[fieldName] ?? "");
  if (!storagePath.startsWith(`serviceApplications/${applicationId}/documents/`)) throw new HttpsError("not-found", "Faili halikupatikana.");
  const [url] = await bucket.file(storagePath).getSignedUrl({ action: "read", expires: Date.now() + 5 * 60 * 1000 });
  return { url, expiresAt: Date.now() + 5 * 60 * 1000 };
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

type LicenseRequest = {
  requestId?: unknown;
  firstName?: unknown; middleName?: unknown; lastName?: unknown;
  businessType?: unknown; otherBusinessType?: unknown;
  licenseType?: unknown; principalBranch?: unknown; region?: unknown; district?: unknown;
  ward?: unknown; street?: unknown; tin?: unknown; licenseFee?: unknown;
};

type LicenseForm = {
  firstName: string; middleName: string; lastName: string;
  businessType: string; otherBusinessType: string;
  licenseType: "NEW LICENCE" | "RENEWED LICENCE"; principalBranch: "PRINCIPAL" | "BRANCH";
  region: string; district: string; ward: string; street: string; tin: string; licenseFee: number;
};

function cleanText(value: unknown, label: string, max = 180) {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > max || /[\r\n]/.test(value)) throw new HttpsError("invalid-argument", `${label} si sahihi.`);
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

function addText(page: import("pdf-lib").PDFPage, text: string, x: number, y: number, size = 8.5, bold = false) {
  page.drawText(text.slice(0, 70), { x, y, size, font: bold ? undefined : undefined, color: rgb(0.05, 0.08, 0.1) });
}

async function renderLicensePdf(form: LicenseForm, licenseNumber: string, applicationId: string, issueDate: string, expiryDate: string) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 800]);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await pdf.embedFont(StandardFonts.Helvetica);
  const blue = rgb(0.12, 0.48, 0.64);
  const ink = rgb(0.05, 0.08, 0.1);
  page.drawRectangle({ x: 0, y: 0, width: 612, height: 800, color: rgb(0.83, 0.94, 0.96) });
  page.drawRectangle({ x: 16, y: 16, width: 580, height: 768, borderColor: blue, borderWidth: 3, color: rgb(0.83, 0.94, 0.96), opacity: 0.18 });
  const watermark = await pdf.embedPng(await readFile(path.join(functionsRoot, "../assets/tanzania-watermark.png")));
  page.drawImage(watermark, { x: 70, y: 70, width: 472, height: 660, opacity: 0.22 });
  const crest = await pdf.embedPng(await readFile(path.join(functionsRoot, "../assets/tanzania-crest.png")));
  page.drawImage(crest, { x: 278, y: 695, width: 56, height: 56 });
  const draw = (text: string, x: number, y: number, size = 8.5, bold = false, color = ink) => page.drawText(text.slice(0, 70), { x, y, size, font: bold ? boldFont : regularFont, color });
  const label = (text: string, y: number) => draw(text, 56, y, 8, false, rgb(0.22, 0.28, 0.3));
  const value = (text: string, y: number, size = 8) => draw(text || "—", 220, y, size, true);
  const owner = `${form.firstName} ${form.middleName} ${form.lastName}`.replace(/\s+/g, " ").trim().toUpperCase();
  const businessType = (form.businessType === "OTHER" ? form.otherBusinessType ?? "OTHER" : form.businessType).toUpperCase();
  const office = "DAR ES SALAAM CITY COUNCIL";
  draw("THE UNITED REPUBLIC OF TANZANIA", 185, 674, 15, false);
  draw("BUSINESS LICENSE", 247, 650, 13, true);
  draw(`B.L. NO: ${licenseNumber}`, 232, 628, 9, true, blue);
  draw("The Business Licensing Act (Act No. 25 of 1972)", 195, 608, 7.5, false);
  draw("License Details", 45, 570, 12, true);
  label("Issuing Office:", 545); value(office, 545);
  label("Tax Identification No:", 520); value(form.tin, 520);
  label("License Issued To:", 495); value(owner, 495);
  label("For the Business of:", 470); value(businessType, 470, 7.5);
  label("Business Licensing:", 445); value(form.licenseType, 445);
  label("Date of Issue:", 420); value(issueDate, 420);
  label("Expiring Date:", 395); value(expiryDate, 395);
  label("Principal/Branch:", 370); value(form.principalBranch, 370);
  draw("Business Location", 45, 335, 12, true);
  label("Region:", 310); value(form.region, 310);
  label("Ward:", 285); value(form.ward, 285);
  label("Street:", 260); value(form.street, 260);
  draw("Payment Details", 45, 195, 12, true);
  label("Amount of Fee Paid:", 170); value(`${Number(form.licenseFee).toLocaleString("en-TZ", { maximumFractionDigits: 2 })} TZS`, 170);
  const hc = createHash("sha256").update(`${licenseNumber}|${form.tin}|${expiryDate}`).digest("hex").toUpperCase();
  const qrPayload = JSON.stringify({ licenceNumber: licenseNumber, tin: form.tin, expireDate: expiryDate, hc });
  const qrData = await QRCode.toDataURL(qrPayload, { errorCorrectionLevel: "H", margin: 1, width: 700 });
  const qr = await pdf.embedPng(Buffer.from(qrData.split(",")[1], "base64"));
  page.drawImage(qr, { x: 410, y: 205, width: 135, height: 135 });
  const logo = await pdf.embedPng(await readFile(path.join(functionsRoot, "../assets/tausi-logo.png")));
  page.drawCircle({ x: 477.5, y: 272.5, size: 22, color: rgb(1, 1, 1), opacity: 0.92 });
  page.drawImage(logo, { x: 458, y: 250, width: 39, height: 39 });
  draw("This digital copy does not require a signature of authority", 180, 122, 8, false);
  page.drawLine({ start: { x: 48, y: 106 }, end: { x: 564, y: 106 }, thickness: 0.8, color: rgb(0.22, 0.28, 0.3) });
  draw("CONDITIONS & NOTES:", 48, 90, 7.5, true);
  draw("1. This license shall be conspicuously displayed at the place of business.", 48, 75, 6.8);
  draw("2. Renewal applications must be submitted within 21 days of the license expiry; Otherwise, penalties begin at 25% of the license fee and rise by 2% for each additional month, up to 47%.", 48, 62, 6.2);
  return pdf.save();
}

async function renderUploadedLicensePdf(form: LicenseForm, licenseNumber: string, issueDate: string, expiryDate: string) {
  const pdf = await PDFDocument.create();
  const pageWidth = 612;
  const pageHeight = 779;
  const page = pdf.addPage([pageWidth, pageHeight]);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await pdf.embedFont(StandardFonts.Helvetica);
  const template = await pdf.embedPng(await readFile(path.join(functionsRoot, "../assets/license-template-uploaded.png")));
  page.drawImage(template, { x: 0, y: 0, width: pageWidth, height: pageHeight });
  const sx = pageWidth / 1012;
  const sy = pageHeight / 1300;
  const draw = (value: string, x: number, y: number, size: number, bold = false, color = rgb(0.06, 0.08, 0.1), align: "left" | "center" = "left") => {
    const safe = String(value || "—").slice(0, 100);
    const font = bold ? boldFont : regularFont;
    const width = font.widthOfTextAtSize(safe, size * sy);
    page.drawText(safe, { x: x * sx - (align === "center" ? width / 2 : 0), y: pageHeight - y * sy - size * sy, size: size * sy, font, color });
  };
  const owner = `${form.firstName} ${form.middleName} ${form.lastName}`.replace(/\s+/g, " ").trim().toUpperCase();
  const businessType = (form.businessType === "OTHER" ? form.otherBusinessType || "OTHER" : form.businessType).toUpperCase();
  draw("THE UNITED REPUBLIC OF TANZANIA", 506, 193, 20, true, undefined, "center");
  draw("BUSINESS LICENSE", 506, 228, 16.7, true, undefined, "center");
  draw(`B.L NO: ${licenseNumber}`, 506, 255, 16, true, rgb(0, 0.55, 0.72), "center");
  draw("Digital license preview", 506, 287, 13.5, false, rgb(0.33, 0.36, 0.38), "center");
  draw("License Details", 74, 360, 19, true);
  const row = (label: string, value: string, y: number) => { draw(label, 84, y, 13.9, true, rgb(0.25, 0.31, 0.35)); draw(value, 355, y, 11.3, true); };
  row("Issuing Office", "DAR ES SALAAM CITY COUNCIL", 417.5);
  row("Tax Identification No:", form.tin, 457.5);
  row("License Issued To:", owner, 499.5);
  row("For the Business of:", businessType, 542.5);
  row("Business Licensing:", form.licenseType, 585.5);
  row("Date of Issue:", issueDate, 627.5);
  row("Expiring Date:", expiryDate, 670.5);
  row("Principal/Branch:", form.principalBranch, 712.5);
  draw("Business Location", 74, 760, 19, true);
  row("Region:", form.region, 805.5);
  row("Ward:", form.ward, 845.5);
  row("Street:", form.street, 887.5);
  draw("Payment Details", 74, 935, 19, true);
  row("Amount of Fee Paid", `${Number(form.licenseFee).toLocaleString("en-TZ", { maximumFractionDigits: 2 })} TZS`, 979.5);
  const qrX = 620 * sx;
  const qrY = pageHeight - 1000 * sy;
  const qrSize = 190 * sx;
  page.drawRectangle({ x: qrX - 6, y: qrY - 6, width: qrSize + 12, height: qrSize + 12, color: rgb(1, 1, 1), opacity: 0.98 });
  const hc = createHash("sha256").update(`${licenseNumber}|${form.tin}|${expiryDate}`).digest("hex").toUpperCase();
  const qrPayload = JSON.stringify({ licenceNumber: licenseNumber, tin: form.tin, expireDate: expiryDate, hc });
  const qrData = await QRCode.toDataURL(qrPayload, { errorCorrectionLevel: "H", margin: 1, width: 700 });
  const qr = await pdf.embedPng(Buffer.from(qrData.split(",")[1], "base64"));
  page.drawImage(qr, { x: qrX, y: qrY, width: qrSize, height: qrSize });
  draw("This digital copy does not require a signature of authority", 506, 1050, 14, true, undefined, "center");
  draw("CONDITIONS & NOTES", 74, 1090, 14, true);
  draw("1. This license shall be conspicuously displayed at the place of business", 90, 1120, 12);
  draw("2. Renewal applications must be submitted within 21 days of the license expiry; otherwise, penalties begin at 25% of the license fee and rise by 2% for each additional month, up to 47%.", 90, 1150, 10.5);
  return pdf.save();
}

export const reserveBusinessLicenseNumber = onCall(async (request) => {
  const uid = authUid(request);
  const reservationId = cleanText((request.data as { reservationId?: unknown } | undefined)?.reservationId ?? randomUUID(), "Reservation ID", 160);
  const reservationRef = db.collection("licenseNumberReservations").doc(reservationId);
  let licenseNumber = "";
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(reservationRef);
    if (existing.exists) {
      const current = existing.data()!;
      if (current.userId !== uid) throw new HttpsError("already-exists", "Reservation ID si sahihi.");
      licenseNumber = String(current.licenseNumber);
      return;
    }
    if (await serviceIsLocked(transaction, "leseni-biashara")) throw new HttpsError("failed-precondition", "Huduma ya Leseni ya Biashara imefungwa kwa sasa.");
    const counterRef = db.collection("licenseNumberCounters").doc(BUSINESS_LICENSE_COUNTER_ID);
    const counterSnapshot = await transaction.get(counterRef);
    const nextSuffix = counterSnapshot.exists ? Number(counterSnapshot.data()?.nextSuffix ?? FIRST_BUSINESS_LICENSE_SUFFIX) : FIRST_BUSINESS_LICENSE_SUFFIX;
    if (!Number.isInteger(nextSuffix) || nextSuffix < 0 || nextSuffix > 99999) throw new HttpsError("resource-exhausted", "Namba za leseni zimejaa.");
    licenseNumber = formatBusinessLicenseNumber(nextSuffix);
    transaction.create(reservationRef, { reservationId, userId: uid, licenseNumber, prefix: BUSINESS_LICENSE_PREFIX, suffix: nextSuffix, status: "RESERVED", createdAt: FieldValue.serverTimestamp() });
    transaction.set(counterRef, { counterId: BUSINESS_LICENSE_COUNTER_ID, prefix: BUSINESS_LICENSE_PREFIX, nextSuffix: nextSuffix + 1, lastSuffix: nextSuffix, lastLicenseNumber: licenseNumber, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
  return { reservationId, licenseNumber };
});

export const generateBusinessLicense = onCall(async (request) => {
  const uid = authUid(request);
  const profile = await profileFor(uid);
  if (profile.accountStatus === "blocked" || profile.accountStatus === "deleted") throw new HttpsError("permission-denied", "Akaunti hii imezuiwa.");
  if (profile.verificationStatus !== "approved") throw new HttpsError("permission-denied", "Akaunti yako haijathibitishwa na admin.");
  const data = (request.data ?? {}) as LicenseRequest;
  const requestId = cleanText(data.requestId ?? randomUUID(), "Request ID", 160);
  const applicationRef = db.collection("licenseApplications").doc(requestId);
  const existing = await applicationRef.get();
  if (existing.exists) {
    const current = existing.data()!;
    if (current.userId !== uid) throw new HttpsError("already-exists", "Request ID si sahihi.");
    if (current.status === "COMPLETED") return { status: "COMPLETED", applicationId: current.applicationId, downloadUrl: current.downloadUrl, reference: current.reference, duplicate: true };
    if (current.status === "PROCESSING") throw new HttpsError("already-exists", "PDF tayari inatengenezwa. Subiri kidogo.");
  }
  const form = {
    firstName: cleanText(data.firstName, "Jina la kwanza", 80).toUpperCase(), middleName: cleanText(data.middleName, "Jina la pili", 80).toUpperCase(), lastName: cleanText(data.lastName, "Jina la mwisho", 80).toUpperCase(),
    businessType: cleanText(data.businessType, "Aina ya biashara", 100).toUpperCase(), otherBusinessType: typeof data.otherBusinessType === "string" ? data.otherBusinessType.trim().slice(0, 100).toUpperCase() : "", licenseType: data.licenseType === "NEW LICENCE" || data.licenseType === "RENEWED LICENCE" ? data.licenseType : "", principalBranch: data.principalBranch === "PRINCIPAL" || data.principalBranch === "BRANCH" ? data.principalBranch : "", region: titleCaseLocation(cleanText(data.region, "Mkoa", 80)), district: "DAR ES SALAAM", ward: titleCaseLocation(cleanText(data.ward, "Kata", 100)), street: titleCaseLocation(cleanText(data.street, "Mtaa / Kijiji", 140)), tin: cleanText(data.tin, "TIN", 40).toUpperCase(), licenseFee: Number(data.licenseFee),
  } as const;
  if (!form.licenseType) throw new HttpsError("invalid-argument", "Chagua aina ya leseni.");
  if (!form.principalBranch) throw new HttpsError("invalid-argument", "Chagua Principal au Branch.");
  if (form.businessType === "OTHER" && !form.otherBusinessType) throw new HttpsError("invalid-argument", "Eleza aina ya biashara.");
  if (!/^\d{3}-\d{3}-\d{3}$/.test(form.tin)) throw new HttpsError("invalid-argument", "Format ya TIN si sahihi. Tumia mfumo 123-123-123.");
  if (!Number.isFinite(form.licenseFee) || form.licenseFee < 0 || form.licenseFee > 100000000) throw new HttpsError("invalid-argument", "Malipo ya leseni si sahihi.");
  const now = new Date(); const issueDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; const expiry = new Date(`${issueDate}T00:00:00`); expiry.setFullYear(expiry.getFullYear() + 1); const expiryDate = `${expiry.getFullYear()}-${String(expiry.getMonth() + 1).padStart(2, "0")}-${String(expiry.getDate()).padStart(2, "0")}`;
  const applicationId = `APP-${randomUUID().replaceAll("-", "").slice(0, 18).toUpperCase()}`;
  let licenseNumber = "";
  const balanceSnapshot = await db.collection("users").doc(uid).get();
  if (Number(balanceSnapshot.data()?.tokenBalance ?? 0) < 2) throw new HttpsError("failed-precondition", "Huna tokeni za kutosha kupakua hati hii. Unahitaji tokeni 2.");
  await db.runTransaction(async (transaction) => {
    const claim = await transaction.get(applicationRef);
    if (claim.exists) throw new HttpsError("already-exists", "PDF tayari inatengenezwa. Subiri kidogo.");
    if (await serviceIsLocked(transaction, "leseni-biashara")) throw new HttpsError("failed-precondition", "Huduma ya Leseni ya Biashara imefungwa kwa sasa.");
    const reservationRef = db.collection("licenseNumberReservations").doc(requestId);
    const reservationSnapshot = await transaction.get(reservationRef);
    if (reservationSnapshot.exists) {
      const reservation = reservationSnapshot.data()!;
      if (reservation.userId !== uid) throw new HttpsError("permission-denied", "Reservation ID si sahihi.");
      licenseNumber = String(reservation.licenseNumber);
    } else {
      const counterRef = db.collection("licenseNumberCounters").doc(BUSINESS_LICENSE_COUNTER_ID);
      const counterSnapshot = await transaction.get(counterRef);
      const nextSuffix = counterSnapshot.exists ? Number(counterSnapshot.data()?.nextSuffix ?? FIRST_BUSINESS_LICENSE_SUFFIX) : FIRST_BUSINESS_LICENSE_SUFFIX;
      if (!Number.isInteger(nextSuffix) || nextSuffix < 0 || nextSuffix > 99999) throw new HttpsError("resource-exhausted", "Namba za leseni zimejaa.");
      licenseNumber = formatBusinessLicenseNumber(nextSuffix);
      transaction.create(reservationRef, { reservationId: requestId, userId: uid, licenseNumber, prefix: BUSINESS_LICENSE_PREFIX, suffix: nextSuffix, status: "RESERVED", createdAt: FieldValue.serverTimestamp() });
      transaction.set(counterRef, { counterId: BUSINESS_LICENSE_COUNTER_ID, prefix: BUSINESS_LICENSE_PREFIX, nextSuffix: nextSuffix + 1, lastSuffix: nextSuffix, lastLicenseNumber: licenseNumber, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    const applicationData = { applicationId, userId: uid, templateId: "business-license-v1", serviceId: "leseni-biashara", applicantData: { firstName: form.firstName, middleName: form.middleName, lastName: form.lastName }, businessData: { businessType: form.businessType, otherBusinessType: form.otherBusinessType, tin: form.tin }, locationData: { region: form.region, district: form.district, ward: form.ward, street: form.street }, licenseData: { licenseType: form.licenseType, principalBranch: form.principalBranch, licenseNumber, issuingOffice: "DAR ES SALAAM CITY COUNCIL", dateOfIssue: issueDate, expiryDate, licenseFee: form.licenseFee }, status: "PROCESSING", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() };
    transaction.create(applicationRef, applicationData);
  });
  try {
    const pdfBytes = await renderUploadedLicensePdf(form as LicenseForm, licenseNumber, issueDate, expiryDate);
    const filePath = `license-documents/${uid}/${applicationId}.pdf`;
    const file = bucket.file(filePath);
    await file.save(Buffer.from(pdfBytes), { metadata: { contentType: "application/pdf", metadata: { userId: uid, applicationId } } });
    const [downloadUrl] = await file.getSignedUrl({ action: "read", expires: Date.now() + 15 * 60 * 1000 });
    const userRef = db.collection("users").doc(uid); const ledgerRef = db.collection("tokenTransactions").doc(); const usageRef = db.collection("serviceUsage").doc(); const now = FieldValue.serverTimestamp();
    const result = await db.runTransaction(async (transaction) => {
      if (await serviceIsLocked(transaction, "leseni-biashara")) throw new HttpsError("failed-precondition", "Huduma ya Leseni ya Biashara imefungwa kwa sasa.");
      const userSnapshot = await transaction.get(userRef); const user = userSnapshot.data() as Profile; const before = Number(user.tokenBalance ?? 0); const cost = 2;
      if (before < cost) throw new HttpsError("failed-precondition", "Huna tokeni za kutosha kupakua hati hii. Unahitaji tokeni 2.");
      const after = before - cost; transaction.update(userRef, { tokenBalance: after, updatedAt: now });
      transaction.set(ledgerRef, { transactionId: ledgerRef.id, userId: uid, actorId: uid, type: "service_usage", amount: -cost, balanceBefore: before, balanceAfter: after, reason: "Matumizi ya LESENI YA BIASHARA", serviceId: "leseni-biashara", serviceName: "LESENI YA BIASHARA", reference: ledgerRef.id, createdAt: now, status: "completed", applicationId });
      transaction.set(usageRef, { usageId: usageRef.id, userId: uid, serviceId: "leseni-biashara", serviceName: "LESENI YA BIASHARA", applicationId, tokensUsed: cost, balanceBefore: before, balanceAfter: after, documentType: "BUSINESS_LICENSE_PDF", status: "COMPLETED", createdAt: now, reference: ledgerRef.id });
      transaction.update(applicationRef, { status: "COMPLETED", downloadUrl, storagePath: filePath, reference: ledgerRef.id, updatedAt: now });
      recordAudit(transaction, uid, String(profile.role), "GENERATE_BUSINESS_LICENSE_PDF", "licenseApplication", applicationId, { tokenBalance: before }, { tokenBalance: after }, { serviceId: "leseni-biashara", tokensUsed: cost, reference: ledgerRef.id });
      return { before, after, reference: ledgerRef.id };
    });
    return { status: "COMPLETED", applicationId, licenseNumber, downloadUrl, reference: result.reference, duplicate: false };
  } catch (error) {
    await applicationRef.update({ status: "FAILED", failureReason: error instanceof HttpsError ? error.message : "PDF generation failed", updatedAt: FieldValue.serverTimestamp() }).catch(() => undefined);
    throw error instanceof HttpsError ? error : new HttpsError("internal", "Imeshindikana kutengeneza PDF.");
  }
});

const tokenPackageLabel = (amount: number, credits: number) => `${amount.toLocaleString("en-US")} TZS — ${credits} tokeni`;

export const createTokenPurchaseOrder = onCall({ secrets: [fimipayApiSecret], maxInstances: 20 }, async (request) => {
  const uid = authUid(request);
  const profile = await profileFor(uid);
  if (profile.accountStatus === "blocked" || profile.accountStatus === "deleted") throw new HttpsError("permission-denied", "Akaunti hii haiwezi kununua tokeni.");

  const data = objectValue(request.data, "Ombi la kununua tokeni");
  const requestId = text(data.requestId, 100);
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(requestId)) throw new HttpsError("invalid-argument", "Namba ya ombi si sahihi.");
  const amount = Number(data.amount);
  const credits = tokenCreditsForAmount(amount);
  if (credits === null) throw new HttpsError("invalid-argument", "Chagua kifurushi halali cha tokeni.");
  const phone = normalizeTanzaniaPhone(profile.phone);
  if (!phone) throw new HttpsError("failed-precondition", "Weka namba sahihi ya Tanzania kwenye akaunti yako kwanza.");

  const orderId = makeTokenPurchaseOrderId(uid, requestId);
  const orderRef = db.collection("tokenPurchaseOrders").doc(orderId);
  const openLockRef = db.collection("tokenPurchaseOpenLocks").doc(uid);
  const reservation = await db.runTransaction(async (transaction) => {
    const savedOrderSnapshot = await transaction.get(orderRef);
    const lockSnapshot = await transaction.get(openLockRef);
    if (savedOrderSnapshot.exists) {
      const saved = savedOrderSnapshot.data()!;
      if (saved.userId !== uid || Number(saved.amount) !== amount || Number(saved.tokenAmount) !== credits) throw new HttpsError("already-exists", "Rejea hii ya malipo imetumika kwa ombi tofauti.");
      if (saved.status === "PAID") return { status: "PAID", duplicate: true };
      if (isOpenTokenPurchaseStatus(lockSnapshot.data()?.status) && lockSnapshot.data()?.orderId !== orderId) throw new HttpsError("failed-precondition", "Tayari una ombi la malipo linalosubiri. Subiri likamilike kabla ya kuanzisha jingine.");
      transaction.set(openLockRef, { orderId, status: saved.status, updatedAt: FieldValue.serverTimestamp() });
      return { status: String(saved.status ?? "CREATING"), duplicate: true };
    }
    if (lockSnapshot.exists && isOpenTokenPurchaseStatus(lockSnapshot.data()?.status)) throw new HttpsError("failed-precondition", "Tayari una ombi la malipo linalosubiri. Subiri likamilike kabla ya kuanzisha jingine.");
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
      throw new HttpsError("unavailable", "Imeshindikana kuanzisha malipo kwa sasa. Jaribu tena baadaye.");
    }

    const status = String(result.data?.payment_status ?? "PENDING").toUpperCase();
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(orderRef);
      const lockSnapshot = await transaction.get(openLockRef);
      if (!snapshot.exists) throw new HttpsError("not-found", "Ombi la malipo halikupatikana.");
      if (snapshot.data()?.status !== "PAID") transaction.set(orderRef, { providerOrderId, providerStatus: status, status: status === "SUCCESS" ? "PENDING" : status, providerEnvironment: String(result.data?.environment ?? "unknown"), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      if (lockSnapshot.data()?.orderId === orderId) {
        if (["REJECTED", "FAILED", "CANCELLED", "USERCANCELLED", "EXPIRED"].includes(status)) transaction.delete(openLockRef);
        else transaction.set(openLockRef, { orderId, status: status === "SUCCESS" ? "PENDING" : status, updatedAt: FieldValue.serverTimestamp() });
      }
    });
    return { orderId, status, amount, tokenAmount: credits, duplicate: reservation.duplicate };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error("createTokenPurchaseOrder failed", { uid, orderId, error: String((error as Error)?.message ?? error).slice(0, 240) });
    await db.runTransaction(async (transaction) => {
      const lockSnapshot = await transaction.get(openLockRef);
      transaction.set(orderRef, { status: "CREATE_UNKNOWN", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      if (lockSnapshot.data()?.orderId === orderId) transaction.set(openLockRef, { orderId, status: "CREATE_UNKNOWN", updatedAt: FieldValue.serverTimestamp() });
    }).catch(() => undefined);
    throw new HttpsError("unavailable", "Imeshindikana kuwasiliana na FimiPay. Jaribu tena baadaye.");
  }
});

export const fimipayWebhook = onRequest({ secrets: [fimipayApiSecret, fimipayWebhookSecret], timeoutSeconds: 60, maxInstances: 10 }, async (req, res) => {
  if (req.method !== "POST") { res.set("Allow", "POST").status(405).send("Method not allowed"); return; }
  const rawBody = req.rawBody;
  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0 || rawBody.length > 65536) { res.status(400).send("Invalid payload"); return; }
  if (!verifyFimipayWebhookSignature(rawBody, req.get("X-FIMIPAY-SIGNATURE"), fimipayWebhookSecret.value())) { res.status(401).send("Invalid signature"); return; }

  let event: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(rawBody.toString("utf8"));
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
