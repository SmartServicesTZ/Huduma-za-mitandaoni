import { initializeApp } from "firebase/app";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import {
  createUserWithEmailAndPassword,
  getAuth,
  setPersistence,
  browserLocalPersistence,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  type User,
} from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  increment,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
} from "firebase/firestore";
import type { ServiceFormField, ServiceFormValues } from "../../../shared/serviceForms";
import { omitUndefinedFields } from "../../../shared/omitUndefinedFields";
import type { BrowserLicenseForm } from "./businessLicensePdf";

const firebaseConfig = {
  apiKey: "AIzaSyCjzY-MjV40lJSyZr8b47AimYMybJoVEac",
  authDomain: "huduma-za-mtandaoni-b1c0c.firebaseapp.com",
  projectId: "huduma-za-mtandaoni-b1c0c",
  storageBucket: "huduma-za-mtandaoni-b1c0c.firebasestorage.app",
  messagingSenderId: "683694464738",
  appId: "1:683694464738:web:232118bbf210ee9b6088bb",
};

const app = initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(app);
export const firestore = getFirestore(app);
export const firebaseStorage = getStorage(app);
// Keep login across page refreshes/browser restarts. Explicitly selecting local persistence avoids accidental session-only auth.\nvoid setPersistence(firebaseAuth, browserLocalPersistence).catch((error) => console.warn("Firebase auth persistence could not be configured:", error));\n
function workerBaseUrl() {
  const configured = String(import.meta.env.VITE_CLOUDFLARE_WORKER_URL ?? "").trim();
  const productionFallback = "https://huduma-za-mtandao-api.stewardjackson999.workers.dev";
  const value = configured || (import.meta.env.DEV ? "http://127.0.0.1:8787" : productionFallback);
  if (!value) throw Object.assign(new Error("Huduma ya API haijasanidiwa. Wasiliana na msimamizi."), { code: "api/unconfigured" });
  return value.replace(/\/+$/, "");
}

async function invokeWorker<TResponse>(name: string, data: unknown): Promise<TResponse> {
  const user = firebaseAuth.currentUser;
  if (!user) throw Object.assign(new Error("Ingia kwanza."), { code: "unauthenticated" });
  const token = await user.getIdToken();
  const response = await fetch(`${workerBaseUrl()}/call/${encodeURIComponent(name)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ data }),
  });
  const result = await response.json().catch(() => null) as { data?: TResponse; error?: { code?: string; message?: string } } | null;
  if (!response.ok || !result || result.error) {
    const code = result?.error?.code ?? "api/request-failed";
    const error = new Error(result?.error?.message ?? `Ombi la API limeshindikana (${response.status}).`);
    Object.assign(error, { code });
    throw error;
  }
  return result.data as TResponse;
}

function createWorkerCall<TRequest = unknown, TResponse = unknown>(name: string) {
  return async (data?: TRequest): Promise<{ data: TResponse }> => ({ data: await invokeWorker<TResponse>(name, data ?? {}) });
}
const appCheckSiteKey = String(import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY ?? "").trim();
export const firebaseAppCheck = appCheckSiteKey ? initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey), isTokenAutoRefreshEnabled: true }) : null;
export { onAuthStateChanged, signInWithEmailAndPassword, signOut, updatePassword };
export type AdminPermissions = {
  viewUsers?: boolean;
  manageUsers?: boolean;
  manageTokens?: boolean;
  manageServices?: boolean;
  manageLipaApplications?: boolean;
  manageContent?: boolean;
  manageMessages?: boolean;
  manageReports?: boolean;
  manageSettings?: boolean;
  manageLicenses?: boolean;
  viewAuditLogs?: boolean;
};

export type FirebaseProfile = {
  uid: string;
  email: string;
  emailVerified?: boolean;
  firstName: string;
  lastName: string;
  phone: string;
  name: string;
  username: string;
  tokenBalance: number;
  verificationStatus: "pending" | "approved" | "rejected";
  role: "user" | "admin" | "moderator" | "support" | "super_admin";
  permissions?: AdminPermissions;
  profileImageUrl?: string;
  language?: "sw" | "en";
  createdAt?: unknown;
};

const credentialFieldNames = ["password", "pin", "pinHash"] as const;
export function sanitizeProfileData(data: DocumentData): FirebaseProfile {
  const safe = { ...data } as Record<string, unknown>;
  for (const field of credentialFieldNames) delete safe[field];
  return safe as FirebaseProfile;
}

export async function ensureUserProfile(user: User, extra: Partial<FirebaseProfile> = {}) {
  const ref = doc(firestore, "users", user.uid);
  const existing = await getDoc(ref);
  const current = existing.data() ?? {};
  const firstName = extra.firstName ?? String(current.firstName ?? user.displayName?.split(" ")[0] ?? "");
  const lastName = extra.lastName ?? String(current.lastName ?? user.displayName?.split(" ").slice(1).join(" ") ?? "");
  const profile = omitUndefinedFields({
    uid: user.uid,
    email: user.email ?? "",
    firstName,
    lastName,
    phone: extra.phone ?? current.phone ?? "",
    name: extra.name ?? current.name ?? (`${firstName} ${lastName}`.trim() || user.email?.split("@")[0] || "Mwanachama"),
    username: extra.username ?? current.username ?? user.email?.split("@")[0] ?? user.uid.slice(0, 8),
    tokenBalance: typeof current.tokenBalance === "number" ? current.tokenBalance : 0,
    verificationStatus: current.verificationStatus ?? "pending",
    role: current.role ?? "user",
    permissions: current.permissions ?? {},
    createdAt: current.createdAt ?? serverTimestamp(),
    language: extra.language ?? current.language ?? "sw",
    profileImageUrl: extra.profileImageUrl ?? current.profileImageUrl,
    updatedAt: serverTimestamp(),
    emailVerified: user.emailVerified,
  });
  await setDoc(ref, profile, { merge: true });
  return ref;
}

function authEmailFromPhone(phone: string) {
  const compact = phone.replace(/\D/g, "");
  const normalized = compact.startsWith("255") ? compact : compact.startsWith("0") ? "255" + compact.slice(1) : "255" + compact;
  return normalized + "@login.huduma-za-mtandao.local";
}

export async function registerFirebaseUser(input: { password: string; firstName: string; lastName: string; phone: string }) {
  const email = authEmailFromPhone(input.phone);
  const credential = await createUserWithEmailAndPassword(firebaseAuth, email, input.password);
  await ensureUserProfile(credential.user, { ...input, email: "" });
  // Hakuna email verification: akaunti ya mfumo huu hutumia namba ya simu kama kitambulisho.
  return credential.user;
}

export async function signInWithPhonePassword(phone: string, password: string) {
  return signInWithEmailAndPassword(firebaseAuth, authEmailFromPhone(phone), password);
}

export function sendPasswordReset(email: string) {
  return sendPasswordResetEmail(firebaseAuth, email.trim());
}

export function sendVerificationEmail(user: User) {
  return sendEmailVerification(user);
}

export function subscribeToProfile(uid: string, callback: (profile: FirebaseProfile | null) => void) {
  return onSnapshot(doc(firestore, "users", uid), (snapshot) => callback(snapshot.exists() ? sanitizeProfileData(snapshot.data()) : null));
}

export async function saveFirebaseProfile(uid: string, values: Partial<FirebaseProfile>) {
  await setDoc(doc(firestore, "users", uid), { ...omitUndefinedFields(values as Record<string, unknown>), updatedAt: serverTimestamp() }, { merge: true });
}

export async function consumeFirebaseTokens(uid: string, service: { slug: string; name: string; tokenCost: number; kind: string }, requestId?: string) {
  if (service.kind === "free" || service.tokenCost <= 0) return { balanceAfter: null, reference: requestId ?? `free-${Date.now()}`, duplicate: false };
  const transactionId = requestId?.trim() || crypto.randomUUID();
  const callable = createWorkerCall<{ serviceId: string; serviceName: string; tokenCost: number; requestId: string }, { balanceAfter: number; reference: string; duplicate: boolean }>("consumeTokens");
  return (await callable({ serviceId: service.slug, serviceName: service.name, tokenCost: service.tokenCost, requestId: transactionId })).data;
}

export type TokenPurchaseOrder = { id: string; orderId: string; amount: number; currency: string; tokenAmount: number; status: string; createdAt?: unknown; transid?: string };

export async function createTokenPurchaseOrder(amount: number, requestId = crypto.randomUUID()) {
  const callable = createWorkerCall<{ amount: number; requestId: string }, { orderId: string; status: string; amount: number; tokenAmount: number; duplicate: boolean }>("createTokenPurchaseOrder");
  return (await callable({ amount, requestId })).data;
}

export function subscribeToTokenPurchaseOrders(uid: string, callback: (orders: TokenPurchaseOrder[]) => void, onError?: (error: Error) => void) {
  const purchases = query(collection(firestore, "tokenPurchaseOrders"), where("userId", "==", uid));
  return onSnapshot(purchases, (snapshot) => {
    const orders = snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as TokenPurchaseOrder));
    orders.sort((a, b) => {
      const timestamp = (value: unknown) => value && typeof value === "object" && "toMillis" in value && typeof (value as { toMillis?: unknown }).toMillis === "function" ? (value as { toMillis: () => number }).toMillis() : 0;
      return timestamp(b.createdAt) - timestamp(a.createdAt);
    });
    callback(orders.slice(0, 10));
  }, onError);
}

export type BusinessLicensePayload = {
  requestId: string;
  firstName: string; middleName: string; lastName: string;
  businessType: string; otherBusinessType?: string;
  licenseType: "NEW LICENCE" | "RENEWED LICENCE"; principalBranch: "PRINCIPAL" | "BRANCH";
  region: string; district: string; ward: string; street: string; tin: string; licenseFee: number;
};

export type GeneratedBusinessLicense = {
  status: string;
  requestId: string;
  applicationId: string;
  licenseNumber: string;
  issueDate?: string;
  expiryDate?: string;
  reference: string;
  duplicate: boolean;
  pdfBlob: Blob;
  pngBlob: Blob;
};

type PreparedBusinessLicense = Omit<GeneratedBusinessLicense, "pdfBlob" | "pngBlob"> & { form?: BrowserLicenseForm };

function licensePdfBlob(bytes: Uint8Array) {
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Blob([arrayBuffer], { type: "application/pdf" });
}

export async function generateBusinessLicense(payload: BusinessLicensePayload): Promise<GeneratedBusinessLicense> {
  const preparation = await invokeWorker<PreparedBusinessLicense>("generateBusinessLicense", payload);
  if (!preparation.requestId || !preparation.applicationId || !preparation.licenseNumber) throw new Error("Taarifa za ombi la leseni hazijakamilika.");
  const form = preparation.form ?? payload;
  const issueDate = preparation.issueDate ?? "";
  const expiryDate = preparation.expiryDate ?? "";
  const { renderBusinessLicenseDocuments } = await import("./businessLicensePdf");
  const documents = await renderBusinessLicenseDocuments(form, preparation.licenseNumber, issueDate, expiryDate);
  let completed: Omit<GeneratedBusinessLicense, "pdfBlob" | "pngBlob"> = preparation;
  if (preparation.status !== "COMPLETED") {
    completed = await invokeWorker<Omit<GeneratedBusinessLicense, "pdfBlob" | "pngBlob">>("completeBusinessLicense", { requestId: preparation.requestId });
  }
  return { ...completed, pdfBlob: licensePdfBlob(documents.pdfBytes), pngBlob: documents.pngBlob };
}
export async function createServiceRequest(uid: string, service: { slug: string; name: string }, details: string) {
  const requestRef = await addDoc(collection(firestore, "serviceRequests"), {
    userId: uid,
    serviceSlug: service.slug,
    serviceName: service.name,
    details: details.trim(),
    status: "pending",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return requestRef.id;
}

export function subscribeToTokenHistory(uid: string, callback: (rows: DocumentData[]) => void) {
  const tokenQuery = query(collection(firestore, "tokenTransactions"), where("userId", "==", uid));
  return onSnapshot(tokenQuery, (snapshot) => callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as DocumentData) as DocumentData).sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")))));
}


export type AdminUserRecord = FirebaseProfile & { accountStatus?: "active" | "blocked"; lastLoginAt?: unknown; totalTokensReceived?: number; totalTokensUsed?: number };

function timestampValue(value: unknown) {
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return value ?? null;
}

export async function adminListUsers() {
  const snapshot = await getDocs(collection(firestore, "users"));
  return snapshot.docs.map((item) => {
    const { password: _password, pin: _pin, pinHash: _pinHash, ...safeData } = item.data();
    return { id: item.id, ...safeData, createdAt: timestampValue(safeData.createdAt), lastLoginAt: timestampValue(safeData.lastLoginAt) } as AdminUserRecord & { id: string };
  });
}

export async function adminListServices() {
  const snapshot = await getDocs(collection(firestore, "services"));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function adminListTransactions() {
  const snapshot = await getDocs(collection(firestore, "tokenTransactions"));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data(), createdAt: timestampValue(item.data().createdAt) })).sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
}

export async function adminListCollection(name: "announcements" | "auditLogs" | "advertisements" | "tutorialVideos" | "licenseTemplates" | "adminActions" | "siteSettings" | "messages" | "systemSettings" | "serviceLocks" | "lipaServices" | "tokenPurchaseOrders") {
  const snapshot = await getDocs(collection(firestore, name));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data(), createdAt: timestampValue(item.data().createdAt) }));
}

export async function adminAdjustTokens(adminId: string, userId: string, amount: number, description: string, requestId: string) {
  const callable = createWorkerCall<{ userId: string; amount: number; description: string; requestId: string }, { balanceAfter: number; reference: string; duplicate: boolean }>("adjustTokens");
  return (await callable({ userId, amount, description, requestId })).data;
}

export async function adminUpdateUser(adminId: string, userId: string, values: Partial<AdminUserRecord>) {
  if (values.role !== undefined || values.permissions !== undefined) {
    const callable = createWorkerCall("updateUserAccess");
    await callable({ userId, role: values.role, permissions: values.permissions });
  } else if (values.accountStatus !== undefined) {
    const callable = createWorkerCall("setAccountStatus");
    await callable({ userId, status: values.accountStatus });
  } else if (values.verificationStatus !== undefined) {
    const callable = createWorkerCall("verifyUser");
    await callable({ userId, status: values.verificationStatus });
  } else {
    throw new Error("Mabadiliko haya ya admin hayaruhusiwi kupitia frontend.");
  }
}

export async function uploadProfileImage(uid: string, file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error("Chagua picha ya JPG, PNG au WebP.");
  if (file.size > 2 * 1024 * 1024) throw new Error("Picha isizidi MB 2.");
  const objectRef = storageRef(firebaseStorage, `users/${uid}/profile/avatar`);
  await uploadBytes(objectRef, file, { contentType: file.type, cacheControl: "public,max-age=3600" });
  const url = await getDownloadURL(objectRef);
  await saveFirebaseProfile(uid, { profileImageUrl: url });
  return url;
}

export async function recordAdminAction(actorId: string, action: string, targetType: string, targetId: string, details: Record<string, unknown> = {}) {
  const actorSnapshot = await getDoc(doc(firestore, "users", actorId));
  await addDoc(collection(firestore, "adminActions"), {
    actorId,
    actorRole: String(actorSnapshot.data()?.role ?? "unknown"),
    action,
    targetType,
    targetId,
    description: String(details.description ?? action),
    before: details.before ?? null,
    after: details.after ?? null,
    details: Object.fromEntries(Object.entries(details).filter(([key]) => !["before", "after", "description"].includes(key))),
    createdAt: serverTimestamp(),
  });
}

export async function adminSaveService(adminId: string, values: Record<string, unknown>, id?: string) {
  const callable = createWorkerCall("adminWrite");
  return (await callable({ collection: "services", id, values })).data;
}

export async function adminSetServiceLock(slug: string, isLocked: boolean) {
  const callable = createWorkerCall<{ slug: string; isLocked: boolean }, { slug: string; isLocked: boolean }>("setServiceLock");
  return (await callable({ slug, isLocked })).data;
}

export async function adminDeleteService(adminId: string, id: string) {
  const callable = createWorkerCall("adminDelete");
  return (await callable({ collection: "services", id })).data;
}

export async function adminSaveAnnouncement(adminId: string, values: Record<string, unknown>, id?: string) {
  const callable = createWorkerCall("adminWrite");
  return (await callable({ collection: "announcements", id, values })).data;
}

export async function adminDeleteAnnouncement(adminId: string, id: string) {
  const callable = createWorkerCall("adminDelete");
  return (await callable({ collection: "announcements", id })).data;
}


export async function adminSaveCollectionItem(adminId: string, collectionName: string, values: Record<string, unknown>, id?: string) {
  const callable = createWorkerCall("adminWrite");
  return (await callable({ collection: collectionName, id, values })).data;
}

export async function adminDeleteCollectionItem(adminId: string, collectionName: string, id: string) {
  const callable = createWorkerCall("adminDelete");
  return (await callable({ collection: collectionName, id })).data;
}

export async function adminSaveSiteSettings(adminId: string, values: Record<string, unknown>) {
  const callable = createWorkerCall("adminWrite");
  return (await callable({ collection: "siteSettings", id: "public", values })).data;
}

export async function setHomepageServiceOrder(serviceOrder: string[], homepageSectionOrder: string[]) {
  const callable = createWorkerCall<{ serviceOrder: string[]; homepageSectionOrder: string[] }, { savedServices: number; savedSections: number }>("setHomepageServiceOrder");
  return (await callable({ serviceOrder, homepageSectionOrder })).data;
}

export async function getPublicSiteSettings() {
  const snapshot = await getDoc(doc(firestore, "siteSettings", "public"));
  return snapshot.exists() ? snapshot.data() : null;
}

let publicLicenseTemplateCache: Record<string, unknown> | null | undefined;
export async function getPublicLicenseTemplateSettings() {
  if (publicLicenseTemplateCache !== undefined) return publicLicenseTemplateCache;
  const settings = await getPublicSiteSettings();
  const value = settings?.licenseTemplateSettings;
  publicLicenseTemplateCache = value && typeof value === "object" ? value as Record<string, unknown> : null;
  return publicLicenseTemplateCache;
}

export async function adminGetSiteSettings() {
  const snapshot = await getDoc(doc(firestore, "siteSettings", "public"));
  return snapshot.exists() ? snapshot.data() : null;
}

export async function reserveBusinessLicenseNumber(reservationId: string) {
  const callable = createWorkerCall<{ reservationId: string }, { reservationId: string; licenseNumber: string }>("reserveBusinessLicenseNumber");
  return (await callable({ reservationId })).data;
}

export function subscribeToCollection(name: string, callback: (rows: DocumentData[]) => void, onError?: (error: unknown) => void) {
  return onSnapshot(collection(firestore, name), (snapshot) => {
    callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
  }, onError);
}

export type LipaNetworkConfig = {
  id: string;
  name: string;
  title: string;
  introduction: string;
  requirements: string;
  paymentInfo: string;
  reward: number;
  active: boolean;
  fields: ServiceFormField[];
};
export type LipaApplication = {
  id: string;
  applicationId: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  network: string;
  networkId: string;
  serviceId: string;
  applicantName: string;
  phone: string;
  businessName: string;
  nidaNumber: string;
  tinNumber: string;
  idDocumentUrl: string;
  idDocumentType: string;
  applicantData: ServiceFormValues;
  status: "PENDING" | "PROCESSING" | "APPROVED" | "REJECTED";
  rejectionReason?: string;
  assignedAdmin?: string;
  submittedAt?: unknown;
  updatedAt?: unknown;
};
export type ServiceApplication = { id: string; applicationId: string; userId: string; userName?: string; userEmail?: string; serviceSlug: string; serviceName: string; serviceFields?: ServiceFormField[]; statusOptions?: string[]; applicantData: ServiceFormValues; status: string; rejectionReason?: string; assignedAdmin?: string; submittedAt?: unknown; updatedAt?: unknown };

export async function seedServiceCatalog() {
  const callable = createWorkerCall("seedServiceCatalog");
  return (await callable({})).data as { createdServices: number; createdNetworks: number };
}

export async function ensureDefaultServiceCatalog() {
  const callable = createWorkerCall("ensureDefaultServiceCatalog");
  return (await callable({})).data as { createdServices: number; createdNetworks: number; initialized: boolean };
}

export async function submitLipaApplication(applicationId: string, networkId: string, values: ServiceFormValues) {
  const callable = createWorkerCall<{ applicationId: string; networkId: string; values: ServiceFormValues }, { applicationId: string; status: "PENDING" }>("submitLipaApplication");
  return (await callable({ applicationId, networkId, values })).data;
}

export async function setLipaApplicationStatus(applicationId: string, status: "PROCESSING" | "APPROVED" | "REJECTED", rejectionReason = "") {
  const callable = createWorkerCall("setLipaApplicationStatus");
  return (await callable({ applicationId, status, rejectionReason })).data;
}

export async function markLipaApplicationViewed(applicationId: string) {
  const callable = createWorkerCall("markLipaApplicationViewed");
  return (await callable({ applicationId })).data;
}

export async function getLipaApplicationDocument(applicationId: string, fieldName: string) {
  const callable = createWorkerCall<{ applicationId: string; fieldName: string }, { url: string; expiresAt: number }>("getLipaApplicationDocument");
  return (await callable({ applicationId, fieldName })).data;
}

export async function uploadLipaDocument(uid: string, applicationId: string, fieldName: string, file: File, maxSizeMb = 5, accept = ["image/jpeg", "image/png", "image/webp"]) {
  if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(fieldName)) throw new Error("Jina la field si sahihi.");
  if (!accept.includes(file.type)) throw new Error("Aina ya faili hairuhusiwi.");
  const sizeLimit = Math.min(Math.max(maxSizeMb, 1), 10);
  if (file.size > sizeLimit * 1024 * 1024) throw new Error(`Faili lisizidi ${sizeLimit} MB.`);
  const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-90) || "document";
  const objectRef = storageRef(firebaseStorage, `lipaUploads/${uid}/${applicationId}/${fieldName}-${crypto.randomUUID()}-${safeName}`);
  await uploadBytes(objectRef, file, { contentType: file.type, cacheControl: "private,no-store,max-age=0" });
  return objectRef.fullPath;
}

export async function removeLipaUpload(storagePath: string) {
  if (!storagePath.startsWith("lipaUploads/")) return;
  await deleteObject(storageRef(firebaseStorage, storagePath));
}

export async function adminListLipaApplications() {
  const snapshot = await getDocs(query(collection(firestore, "lipaApplications"), orderBy("submittedAt", "desc")));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data(), submittedAt: timestampValue(item.data().submittedAt) } as LipaApplication));
}

export function subscribeUserLipaApplications(uid: string, callback: (rows: LipaApplication[]) => void, onError?: (error: unknown) => void) {
  const userQuery = query(collection(firestore, "lipaApplications"), where("userId", "==", uid));
  return onSnapshot(userQuery, (snapshot) => callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data(), submittedAt: timestampValue(item.data().submittedAt), updatedAt: timestampValue(item.data().updatedAt) } as LipaApplication)).sort((a, b) => String(b.submittedAt ?? "").localeCompare(String(a.submittedAt ?? "")))), onError);
}

export async function createServiceApplication(applicationId: string, serviceSlug: string, values: ServiceFormValues) {
  const callable = createWorkerCall("createServiceApplication");
  return (await callable({ applicationId, serviceSlug, values })).data as { applicationId: string; status: string; duplicate: boolean; balanceAfter: number | null; reference: string };
}

export async function setServiceApplicationStatus(applicationId: string, status: string, rejectionReason = "") {
  const callable = createWorkerCall("setServiceApplicationStatus");
  return (await callable({ applicationId, status, rejectionReason })).data;
}

export async function uploadServiceDocument(uid: string, applicationId: string, fieldName: string, file: File, maxSizeMb = 5, accept = ["image/jpeg", "image/png", "image/webp"]) {
  if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(fieldName)) throw new Error("Jina la field si sahihi.");
  if (!accept.includes(file.type)) throw new Error("Aina ya faili hairuhusiwi.");
  const sizeLimit = Math.min(Math.max(maxSizeMb, 1), 10);
  if (file.size > sizeLimit * 1024 * 1024) throw new Error(`Faili lisizidi ${sizeLimit} MB.`);
  const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-90) || "document";
  const objectRef = storageRef(firebaseStorage, `serviceUploads/${uid}/${applicationId}/${fieldName}-${crypto.randomUUID()}-${safeName}`);
  await uploadBytes(objectRef, file, { contentType: file.type, cacheControl: "private,no-store,max-age=0" });
  return objectRef.fullPath;
}

export async function removeServiceUpload(storagePath: string) {
  if (!storagePath.startsWith("serviceUploads/")) return;
  await deleteObject(storageRef(firebaseStorage, storagePath));
}

export async function markServiceApplicationViewed(applicationId: string) {
  const callable = createWorkerCall<{ applicationId: string }, { ok: boolean }>("markServiceApplicationViewed");
  return (await callable({ applicationId })).data;
}

export async function getServiceApplicationDocument(applicationId: string, fieldName: string) {
  const callable = createWorkerCall<{ applicationId: string; fieldName: string }, { url: string; expiresAt: number }>("getServiceApplicationDocument");
  return (await callable({ applicationId, fieldName })).data;
}

export async function adminListServiceApplications() {
  const snapshot = await getDocs(query(collection(firestore, "serviceApplications"), orderBy("submittedAt", "desc")));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data(), submittedAt: timestampValue(item.data().submittedAt) } as ServiceApplication));
}

export function subscribeUserServiceApplications(uid: string, callback: (rows: ServiceApplication[]) => void, onError?: (error: unknown) => void) {
  const userQuery = query(collection(firestore, "serviceApplications"), where("userId", "==", uid));
  return onSnapshot(userQuery, (snapshot) => callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data(), submittedAt: timestampValue(item.data().submittedAt), updatedAt: timestampValue(item.data().updatedAt) } as ServiceApplication)).sort((a, b) => String(b.submittedAt ?? "").localeCompare(String(a.submittedAt ?? "")))), onError);
}

export function subscribeUserMessages(uid: string, callback: (rows: Array<Record<string, unknown> & { id: string }>) => void, onError?: (error: unknown) => void) {
  const userQuery = query(collection(firestore, "messages"), where("recipientId", "==", uid));
  return onSnapshot(userQuery, (snapshot) => callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data(), createdAt: timestampValue(item.data().createdAt) })).sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")))), onError);
}
