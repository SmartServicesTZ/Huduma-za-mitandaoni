import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, type Transaction } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";
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
  firstName?: unknown; middleName?: unknown; lastName?: unknown; email?: unknown;
  businessName?: unknown; businessType?: unknown; otherBusinessType?: unknown;
  licenseType?: unknown; principalBranch?: unknown; region?: unknown; district?: unknown;
  ward?: unknown; street?: unknown; tin?: unknown; licenseFee?: unknown;
};

type LicenseForm = {
  firstName: string; middleName: string; lastName: string; email: string;
  businessName: string; businessType: string; otherBusinessType: string;
  licenseType: "NEW LICENSE" | "RENEWED LICENSE"; principalBranch: "PRINCIPAL" | "BRANCH";
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
  page.drawImage(watermark, { x: 150, y: 154, width: 312, height: 420, opacity: 0.16 });
  const crest = await pdf.embedPng(await readFile(path.join(functionsRoot, "../assets/tanzania-crest.png")));
  page.drawImage(crest, { x: 278, y: 695, width: 56, height: 56 });
  const draw = (text: string, x: number, y: number, size = 8.5, bold = false, color = ink) => page.drawText(text.slice(0, 70), { x, y, size, font: bold ? boldFont : regularFont, color });
  const label = (text: string, y: number) => draw(text, 56, y, 8, false, rgb(0.22, 0.28, 0.3));
  const value = (text: string, y: number, size = 8) => draw(text || "—", 220, y, size, true);
  const owner = `${form.firstName} ${form.middleName} ${form.lastName}`.replace(/\s+/g, " ").trim();
  const businessType = form.businessType === "OTHER" ? form.otherBusinessType ?? "OTHER" : form.businessType;
  const office = form.district.toUpperCase().includes("CITY") ? `${form.district} CITY COUNCIL` : `${form.district} DISTRICT COUNCIL`;
  draw("THE UNITED REPUBLIC OF TANZANIA", 185, 674, 15, false);
  draw("BUSINESS LICENSE", 247, 650, 13, true);
  draw(`B.L. NO: ${licenseNumber}`, 232, 628, 9, true, blue);
  draw("The Business Licensing Act (Act No. 25 of 1972)", 195, 608, 7.5, false);
  draw("License Details", 45, 576, 12, true);
  label("Issuing Office:", 552); value(office, 552);
  label("Tax Identification No:", 526); value(form.tin, 526);
  label("License Issued To:", 500); value(owner, 500);
  label("Business Name:", 474); value(form.businessName, 474);
  label("For the Business of:", 448); value(businessType, 448, 7.5);
  label("Business Licensing:", 422); value(form.licenseType, 422);
  label("Date of Issue:", 396); value(issueDate, 396);
  label("Expiring Date:", 370); value(expiryDate, 370);
  label("Principal/Branch:", 344); value(form.principalBranch, 344);
  draw("Business Location", 45, 306, 12, true);
  label("Region:", 282); value(form.region, 282);
  label("District/Council:", 256); value(form.district, 256);
  label("Ward:", 230); value(form.ward, 230);
  label("Street:", 204); value(form.street, 204);
  draw("Payment Details", 45, 166, 12, true);
  label("Amount of Fee Paid:", 140); value(Number(form.licenseFee).toLocaleString("en-TZ", { minimumFractionDigits: 2 }), 140);
  const hc = createHash("sha256").update(`${licenseNumber}|${form.tin}|${expiryDate}`).digest("hex").toUpperCase();
  const qrPayload = JSON.stringify({ licenceNumber: licenseNumber, tin: form.tin, expireDate: expiryDate, hc });
  const qrData = await QRCode.toDataURL(qrPayload, { errorCorrectionLevel: "H", margin: 1, width: 700 });
  const qr = await pdf.embedPng(Buffer.from(qrData.split(",")[1], "base64"));
  page.drawImage(qr, { x: 383, y: 168, width: 145, height: 145 });
  const logo = await pdf.embedPng(await readFile(path.join(functionsRoot, "../assets/tausi-logo.png")));
  page.drawCircle({ x: 455.5, y: 240.5, size: 24, color: rgb(1, 1, 1), opacity: 0.92 });
  page.drawImage(logo, { x: 434, y: 219, width: 43, height: 43 });
  draw("This digital copy does not require a signature of authority", 180, 92, 8, false);
  page.drawLine({ start: { x: 48, y: 78 }, end: { x: 564, y: 78 }, thickness: 0.8, color: rgb(0.22, 0.28, 0.3) });
  draw("CONDITIONS & NOTES:", 48, 62, 7.5, true);
  draw("1. This license shall be conspicuously displayed at the place of business.", 48, 47, 6.8);
  draw("2. Renewal applications must be submitted within 21 days of the license expiry; Otherwise, penalties begin at 25% of the license fee and rise by 2% for each additional month, up to 47%.", 48, 34, 6.2);
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
    firstName: cleanText(data.firstName, "Jina la kwanza", 80), middleName: cleanText(data.middleName, "Jina la pili", 80), lastName: cleanText(data.lastName, "Jina la mwisho", 80), email: cleanText(data.email, "Barua pepe", 160),
    businessName: cleanText(data.businessName, "Jina la biashara", 120), businessType: cleanText(data.businessType, "Aina ya biashara", 100), otherBusinessType: typeof data.otherBusinessType === "string" ? data.otherBusinessType.trim().slice(0, 100) : "", licenseType: data.licenseType === "RENEWED LICENSE" ? "RENEWED LICENSE" : "NEW LICENSE", principalBranch: data.principalBranch === "BRANCH" ? "BRANCH" : "PRINCIPAL", region: cleanText(data.region, "Mkoa", 80), district: cleanText(data.district, "Wilaya / Halmashauri", 100), ward: cleanText(data.ward, "Kata", 100), street: cleanText(data.street, "Mtaa / Kijiji", 140), tin: cleanText(data.tin, "TIN", 40), licenseFee: Number(data.licenseFee),
  } as const;
  if (form.businessType === "OTHER" && !form.otherBusinessType) throw new HttpsError("invalid-argument", "Eleza aina ya biashara.");
  if (!/^\d{3}-\d{3}-\d{3}$/.test(form.tin)) throw new HttpsError("invalid-argument", "Format ya TIN si sahihi. Tumia mfumo 123-123-123.");
  if (!Number.isFinite(form.licenseFee) || form.licenseFee < 0 || form.licenseFee > 100000000) throw new HttpsError("invalid-argument", "Malipo ya leseni si sahihi.");
  const issueDate = new Date().toISOString().slice(0, 10); const expiry = new Date(`${issueDate}T00:00:00`); expiry.setFullYear(expiry.getFullYear() + 1); expiry.setDate(expiry.getDate() - 1); const expiryDate = expiry.toISOString().slice(0, 10);
  const applicationId = `APP-${randomUUID().replaceAll("-", "").slice(0, 18).toUpperCase()}`;
  let licenseNumber = "";
  const balanceSnapshot = await db.collection("users").doc(uid).get();
  if (Number(balanceSnapshot.data()?.tokenBalance ?? 0) < 2) throw new HttpsError("failed-precondition", "Huna tokeni za kutosha kupakua hati hii. Unahitaji tokeni 2.");
  await db.runTransaction(async (transaction) => {
    const claim = await transaction.get(applicationRef);
    if (claim.exists) throw new HttpsError("already-exists", "PDF tayari inatengenezwa. Subiri kidogo.");
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
    const applicationData = { applicationId, userId: uid, templateId: "business-license-v1", serviceId: "leseni-biashara", applicantData: { firstName: form.firstName, middleName: form.middleName, lastName: form.lastName, email: form.email }, businessData: { businessName: form.businessName, businessType: form.businessType, otherBusinessType: form.otherBusinessType, tin: form.tin }, locationData: { region: form.region, district: form.district, ward: form.ward, street: form.street }, licenseData: { licenseType: form.licenseType, principalBranch: form.principalBranch, licenseNumber, issuingOffice: form.district, dateOfIssue: issueDate, expiryDate, licenseFee: form.licenseFee }, status: "PROCESSING", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() };
    transaction.create(applicationRef, applicationData);
  });
  try {
    const pdfBytes = await renderLicensePdf(form, licenseNumber, applicationId, issueDate, expiryDate);
    const filePath = `license-documents/${uid}/${applicationId}.pdf`;
    const file = bucket.file(filePath);
    await file.save(Buffer.from(pdfBytes), { metadata: { contentType: "application/pdf", metadata: { userId: uid, applicationId } } });
    const [downloadUrl] = await file.getSignedUrl({ action: "read", expires: Date.now() + 15 * 60 * 1000 });
    const userRef = db.collection("users").doc(uid); const ledgerRef = db.collection("tokenTransactions").doc(); const usageRef = db.collection("serviceUsage").doc(); const now = FieldValue.serverTimestamp();
    const result = await db.runTransaction(async (transaction) => {
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
