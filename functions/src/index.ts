import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, type Transaction } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import { onCall, HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";

initializeApp();
setGlobalOptions({ region: process.env.FUNCTIONS_REGION ?? "us-central1", maxInstances: 20 });

const db = getFirestore();
const bucket = getStorage().bucket();
const functionsRoot = path.dirname(fileURLToPath(import.meta.url));
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

function titleCaseLocation(value: string) {
  return value.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, prefix, letter) => `${prefix}${letter.toUpperCase()}`);
}

function addText(page: import("pdf-lib").PDFPage, text: string, x: number, y: number, size = 8.5, bold = false) {
  page.drawText(text.slice(0, 70), { x, y, size, font: bold ? undefined : undefined, color: rgb(0.05, 0.08, 0.1) });
}

async function renderLicensePdf(form: LicenseForm, applicationId: string) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 800]);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await pdf.embedFont(StandardFonts.Helvetica);
  const blue = rgb(0.12, 0.48, 0.64);
  const ink = rgb(0.05, 0.08, 0.1);
  const muted = rgb(0.34, 0.4, 0.45);
  page.drawRectangle({ x: 0, y: 0, width: 612, height: 800, color: rgb(0.97, 0.99, 1) });
  page.drawRectangle({ x: 18, y: 18, width: 576, height: 764, borderColor: blue, borderWidth: 3 });
  const logo = await pdf.embedPng(await readFile(path.join(functionsRoot, "../assets/tausi-logo.png")));
  page.drawImage(logo, { x: 278, y: 710, width: 56, height: 56 });
  const draw = (text: string, x: number, y: number, size = 8.5, bold = false, color = ink) => page.drawText(text.slice(0, 78), { x, y, size, font: bold ? boldFont : regularFont, color });
  const label = (text: string, y: number) => draw(text, 56, y, 8, false, muted);
  const value = (text: string, y: number, size = 8) => draw(text || "—", 220, y, size, true);
  const owner = `${form.firstName} ${form.middleName} ${form.lastName}`.replace(/\s+/g, " ").trim().toUpperCase();
  const businessType = (form.businessType === "OTHER" ? form.otherBusinessType || "OTHER" : form.businessType).toUpperCase();
  draw("HUDUMA ZA MTANDAONI", 220, 688, 12, true);
  draw("BUSINESS LICENSE APPLICATION", 195, 661, 13, true);
  draw("APPLICATION DRAFT ONLY - NOT AN OFFICIAL LICENSE", 166, 641, 9, true, blue);
  draw(`APPLICATION REF: ${applicationId}`, 217, 622, 8, true, blue);
  // Prominent on-page watermark prevents the application draft being mistaken for an issued license.
  page.drawText("DRAFT ONLY", { x: 140, y: 390, size: 58, font: boldFont, color: rgb(0.88, 0.91, 0.94), rotate: degrees(-32) });
  draw("APPLICANT & BUSINESS DETAILS", 45, 584, 11, true);
  label("Applicant name:", 558); value(owner, 558);
  label("Tax Identification No:", 536); value(form.tin, 536);
  label("Business type:", 514); value(businessType, 514, 7.5);
  label("Application type:", 492); value(form.licenseType, 492);
  label("Principal / Branch:", 470); value(form.principalBranch, 470);
  draw("BUSINESS LOCATION", 45, 438, 11, true);
  label("Region:", 412); value(form.region, 412);
  label("Council / District:", 390); value(form.district, 390);
  label("Ward:", 368); value(form.ward, 368);
  label("Street / Village:", 346); value(form.street, 346);
  draw("FEE ESTIMATE - NOT PAYMENT CONFIRMATION", 45, 307, 10, true);
  label("Estimated amount:", 281);
  value(Number(form.licenseFee) > 0 ? `${Number(form.licenseFee).toLocaleString("en-TZ", { maximumFractionDigits: 2 })} TZS (ESTIMATE)` : "Not provided", 281);
  page.drawRectangle({ x: 410, y: 142, width: 130, height: 130, borderColor: rgb(0.65, 0.7, 0.75), borderWidth: 1 });
  draw("OFFICIAL QR", 444, 218, 9, true, muted);
  draw("added by issuing", 429, 201, 7, false, muted);
  draw("authority after approval", 418, 189, 7, false, muted);
  draw("No official license number or validity dates are issued on this draft.", 114, 155, 8, true);
  page.drawLine({ start: { x: 48, y: 128 }, end: { x: 564, y: 128 }, thickness: 0.8, color: muted });
  draw("THIS DOCUMENT IS AN APPLICATION PREVIEW ONLY - IT IS NOT A LICENSE OR PROOF OF PAYMENT.", 47, 105, 7.2, true, blue);
  draw("Submit your application to the relevant licensing authority for review, payment verification and approval.", 47, 87, 7, false);
  draw("Official license number, issue/expiry dates and verification QR are added only by the licensing authority.", 47, 70, 7, false);
  return pdf.save();
}

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
    if (current.status === "DRAFT_READY") return { status: "DRAFT_READY", applicationId: current.applicationId, downloadUrl: current.downloadUrl, reference: current.reference, duplicate: true };
    if (current.status === "PROCESSING") throw new HttpsError("already-exists", "PDF ya rasimu tayari inaandaliwa. Subiri kidogo.");
  }
  const form = {
    firstName: cleanText(data.firstName, "Jina la kwanza", 80).toUpperCase(),
    middleName: typeof data.middleName === "string" ? data.middleName.trim().slice(0, 80).toUpperCase() : "",
    lastName: cleanText(data.lastName, "Jina la mwisho", 80).toUpperCase(),
    businessType: cleanText(data.businessType, "Aina ya biashara", 100).toUpperCase(),
    otherBusinessType: typeof data.otherBusinessType === "string" ? data.otherBusinessType.trim().slice(0, 100).toUpperCase() : "",
    licenseType: data.licenseType === "NEW LICENCE" || data.licenseType === "RENEWED LICENCE" ? data.licenseType : "",
    principalBranch: data.principalBranch === "PRINCIPAL" || data.principalBranch === "BRANCH" ? data.principalBranch : "",
    region: titleCaseLocation(cleanText(data.region, "Mkoa", 80)),
    district: titleCaseLocation(cleanText(data.district, "Halmashauri / Wilaya", 100)),
    ward: titleCaseLocation(cleanText(data.ward, "Kata", 100)),
    street: titleCaseLocation(cleanText(data.street, "Mtaa / Kijiji", 140)),
    tin: cleanText(data.tin, "TIN", 40).toUpperCase(),
    licenseFee: data.licenseFee === undefined || data.licenseFee === null || data.licenseFee === "" ? 0 : Number(data.licenseFee),
  } as const;
  if (!form.licenseType) throw new HttpsError("invalid-argument", "Chagua aina ya ombi.");
  if (!form.principalBranch) throw new HttpsError("invalid-argument", "Chagua Principal au Branch.");
  if (form.businessType === "OTHER" && !form.otherBusinessType) throw new HttpsError("invalid-argument", "Eleza aina ya biashara.");
  if (!/^\d{3}-\d{3}-\d{3}$/.test(form.tin)) throw new HttpsError("invalid-argument", "Format ya TIN si sahihi. Tumia mfumo 123-123-123.");
  if (!Number.isFinite(form.licenseFee) || form.licenseFee < 0 || form.licenseFee > 100000000) throw new HttpsError("invalid-argument", "Makadirio ya ada si sahihi.");
  const applicationId = `APP-${randomUUID().replaceAll("-", "").slice(0, 18).toUpperCase()}`;
  const userRef = db.collection("users").doc(uid);
  const balanceSnapshot = await userRef.get();
  if (Number(balanceSnapshot.data()?.tokenBalance ?? 0) < 2) throw new HttpsError("failed-precondition", "Huna tokeni za kutosha kupakua rasimu hii. Unahitaji tokeni 2.");
  await db.runTransaction(async (transaction) => {
    const claim = await transaction.get(applicationRef);
    if (claim.exists) throw new HttpsError("already-exists", "Rasimu tayari inatengenezwa. Subiri kidogo.");
    transaction.create(applicationRef, {
      applicationId, userId: uid, templateId: "business-license-application-draft-v1", serviceId: "leseni-biashara",
      applicantData: { firstName: form.firstName, middleName: form.middleName, lastName: form.lastName },
      businessData: { businessType: form.businessType, otherBusinessType: form.otherBusinessType, tin: form.tin },
      locationData: { region: form.region, district: form.district, ward: form.ward, street: form.street },
      applicationData: { applicationType: form.licenseType, principalBranch: form.principalBranch, estimatedFee: form.licenseFee, feeVerified: false },
      status: "PROCESSING", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
  });
  try {
    const pdfBytes = await renderLicensePdf(form as LicenseForm, applicationId);
    const filePath = `license-documents/${uid}/${applicationId}.pdf`;
    const file = bucket.file(filePath);
    await file.save(Buffer.from(pdfBytes), { metadata: { contentType: "application/pdf", metadata: { userId: uid, applicationId, documentStatus: "APPLICATION_DRAFT" } } });
    const [downloadUrl] = await file.getSignedUrl({ action: "read", expires: Date.now() + 15 * 60 * 1000 });
    const ledgerRef = db.collection("tokenTransactions").doc();
    const usageRef = db.collection("serviceUsage").doc();
    const now = FieldValue.serverTimestamp();
    const result = await db.runTransaction(async (transaction) => {
      const userSnapshot = await transaction.get(userRef);
      const user = userSnapshot.data() as Profile;
      const before = Number(user.tokenBalance ?? 0);
      const cost = 2;
      if (before < cost) throw new HttpsError("failed-precondition", "Huna tokeni za kutosha kupakua rasimu hii. Unahitaji tokeni 2.");
      const after = before - cost;
      transaction.update(userRef, { tokenBalance: after, updatedAt: now });
      transaction.set(ledgerRef, { transactionId: ledgerRef.id, userId: uid, actorId: uid, type: "service_usage", amount: -cost, balanceBefore: before, balanceAfter: after, reason: "Kuandaa rasimu ya ombi la LESENI YA BIASHARA", serviceId: "leseni-biashara", serviceName: "RASIMU YA OMBI LA LESENI YA BIASHARA", reference: ledgerRef.id, createdAt: now, status: "completed", applicationId });
      transaction.set(usageRef, { usageId: usageRef.id, userId: uid, serviceId: "leseni-biashara", serviceName: "RASIMU YA OMBI LA LESENI YA BIASHARA", applicationId, tokensUsed: cost, balanceBefore: before, balanceAfter: after, documentType: "BUSINESS_LICENSE_APPLICATION_DRAFT_PDF", status: "COMPLETED", createdAt: now, reference: ledgerRef.id });
      transaction.update(applicationRef, { status: "DRAFT_READY", documentStatus: "APPLICATION_DRAFT", downloadUrl, storagePath: filePath, reference: ledgerRef.id, updatedAt: now });
      recordAudit(transaction, uid, String(profile.role), "GENERATE_BUSINESS_LICENSE_APPLICATION_DRAFT", "licenseApplication", applicationId, { tokenBalance: before }, { tokenBalance: after }, { serviceId: "leseni-biashara", tokensUsed: cost, reference: ledgerRef.id, documentStatus: "APPLICATION_DRAFT" });
      return { reference: ledgerRef.id };
    });
    return { status: "DRAFT_READY", applicationId, downloadUrl, reference: result.reference, duplicate: false };
  } catch (error) {
    await applicationRef.update({ status: "FAILED", failureReason: error instanceof HttpsError ? error.message : "Draft PDF generation failed", updatedAt: FieldValue.serverTimestamp() }).catch(() => undefined);
    throw error instanceof HttpsError ? error : new HttpsError("internal", "Imeshindikana kutengeneza rasimu.");
  }
});
