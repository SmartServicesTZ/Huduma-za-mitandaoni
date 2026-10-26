import { initializeApp } from "firebase/app";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, getBlob, deleteObject } from "firebase/storage";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  initializeAuth,
  browserLocalPersistence,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  updatePassword as updateFirebasePassword,
  connectAuthEmulator,
  signOut,
  type User,
} from "firebase/auth";
import {
  addDoc,
  arrayUnion,
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocFromServer,
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
  type QuerySnapshot,
} from "firebase/firestore";
import type { ServiceFormField, ServiceFormValues } from "../../../shared/serviceForms";
import { omitUndefinedFields } from "../../../shared/omitUndefinedFields";
import { normalizeTanzaniaPhone, phoneAuthAlias } from "../../../shared/tanzaniaPhone";
import type { AccountAccessMode, AccountRestrictionAction } from "../../../shared/accountAccess";
import { renderBusinessLicenseDocuments, type BrowserLicenseForm } from "./businessLicensePdf";

const firebaseConfig = {
  apiKey: "AIzaSyCjzY-MjV40lJSyZr8b47AimYMybJoVEac",
  authDomain: "huduma-za-mtandaoni-b1c0c.firebaseapp.com",
  projectId: "huduma-za-mtandaoni-b1c0c",
  storageBucket: "huduma-za-mtandaoni-b1c0c.firebasestorage.app",
  messagingSenderId: "683694464738",
  appId: "1:683694464738:web:232118bbf210ee9b6088bb",
};

const app = initializeApp(firebaseConfig);
export const firebaseAuth = initializeAuth(app, { persistence: browserLocalPersistence });
export const firestore = getFirestore(app);
export const firebaseStorage = getStorage(app);
export const usingFirebaseEmulators = import.meta.env.VITE_FIREBASE_EMULATOR === "true";
if (usingFirebaseEmulators) {
  connectAuthEmulator(firebaseAuth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(firestore, "127.0.0.1", 8080);
}
// Local persistence is configured at Auth initialization; Firebase Auth itself
// restores sessions after refresh and browser restarts where the browser permits it.
export const authPersistenceReady = Promise.resolve();
function workerBaseUrl() {
  const configured = String(import.meta.env.VITE_CLOUDFLARE_WORKER_URL ?? "").trim();
  const productionFallback = "https://huduma-za-mtandao-api.stewardjackson999.workers.dev";
  const value = configured || (import.meta.env.DEV ? "http://127.0.0.1:8787" : productionFallback);
  if (!value) throw Object.assign(new Error("Huduma ya API haijasanidiwa. Wasiliana na msimamizi."), { code: "api/unconfigured" });
  return value.replace(/\/+$/, "");
}

async function invokeWorker<TResponse>(name: string, data: unknown, authUser?: User): Promise<TResponse> {
  const user = authUser ?? firebaseAuth.currentUser;
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
export { onAuthStateChanged };
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
  firstName: string;
  lastName: string;
  phone: string;
  name: string;
  bio?: string;
  username: string;
  tokenBalance: number;
  tokenBalanceNida?: number;
  tokenBalanceOther?: number;
  lastDailyTokenBonusDate?: string;
  verificationStatus: "pending" | "approved" | "rejected";
  role: "user" | "admin" | "moderator" | "support" | "super_admin";
  permissions?: AdminPermissions;
  profileImageUrl?: string;
  mustChangePassword?: boolean;
  accountStatus?: "active" | "blocked" | "deleted" | "restricted";
  accessMode?: AccountAccessMode;
  allowedActions?: AccountRestrictionAction[];
  restrictionReason?: string;
  restrictionMessage?: string;
  restrictionUpdatedBy?: string;
  restrictionUpdatedAt?: unknown;
  language?: "sw" | "en";
  settings?: { theme?: "system" | "light" | "dark"; accent?: "green" | "blue" | "purple"; compactMode?: boolean; showBalance?: boolean; notifications?: boolean; reduceMotion?: boolean; sounds?: boolean; autoRefresh?: boolean; showOnlineStatus?: boolean; confirmActions?: boolean; dataSaver?: boolean };
  createdAt?: unknown;
};

const credentialFieldNames = ["password", "pin", "pinHash"] as const;
const profilesReadyInThisSession = new Set<string>();
let activeRegistration: { uid?: string; ready: boolean; promise: Promise<void>; resolve: () => void } | null = null;
export function sanitizeProfileData(data: DocumentData): FirebaseProfile {
  const safe = { ...data } as Record<string, unknown>;
  for (const field of [...credentialFieldNames, "email", "emailVerified"]) delete safe[field];
  return safe as FirebaseProfile;
}

export async function ensureUserProfile(user: User, extra: Partial<FirebaseProfile> = {}) {
  const ref = doc(firestore, "users", user.uid);
  let existing = await getDoc(ref);
  let current = existing.data() ?? {};
  const firstName = extra.firstName ?? String(current.firstName ?? user.displayName?.split(" ")[0] ?? "");
  const lastName = extra.lastName ?? String(current.lastName ?? user.displayName?.split(" ").slice(1).join(" ") ?? "");
  const phone = normalizeTanzaniaPhone(extra.phone ?? current.phone ?? phoneFromLegacyAlias(user.email) ?? "") ?? "";
  const profile = omitUndefinedFields({
    uid: user.uid,
    firstName,
    lastName,
    phone,
    name: extra.name ?? current.name ?? (`${firstName} ${lastName}`.trim() || "Mwanachama"),
    bio: extra.bio ?? current.bio,
    username: extra.username ?? current.username ?? user.uid.slice(0, 8),
    tokenBalance: typeof current.tokenBalance === "number" ? current.tokenBalance : 0,
    tokenBalanceNida: typeof current.tokenBalanceNida === "number" ? current.tokenBalanceNida : 0,
    tokenBalanceOther: typeof current.tokenBalanceOther === "number" ? current.tokenBalanceOther : (typeof current.tokenBalance === "number" ? current.tokenBalance : 0),
    lastDailyTokenBonusDate: current.lastDailyTokenBonusDate,
    verificationStatus: current.verificationStatus ?? "pending",
    role: current.role ?? "user",
    permissions: current.permissions ?? {},
    createdAt: current.createdAt ?? serverTimestamp(),
    language: extra.language ?? current.language ?? "sw",
    profileImageUrl: extra.profileImageUrl ?? current.profileImageUrl,
    updatedAt: serverTimestamp(),
  });
  if (!existing.exists()) {
    const claim = await invokeWorker<{ ok: boolean; profileCreated: boolean; uid: string }>("claimRegistrationPhone", { phone, firstName, lastName, name: `${firstName} ${lastName}`.trim(), username: extra.username ?? current.username ?? user.uid.slice(0, 8) }, user);
    if (claim.uid !== user.uid || claim.profileCreated !== true) {
      throw Object.assign(new Error("Worker imetengeneza profile ya akaunti tofauti. Toka kwenye akaunti kisha ingia tena."), { code: "profile/uid-mismatch" });
    }
    // Worker ndiye mmiliki wa uundaji wa profile na bonus. Usifanye setDoc ya pili kutoka browser,
    // kwa sababu Firestore Rules haziruhusu browser kubadilisha salio la tokeni.
    // Soma kutoka server moja kwa moja, si cache ya browser, kuthibitisha profile ya Worker.
    existing = await getDocFromServer(ref);
    if (!existing.exists()) throw Object.assign(new Error("Worker imerudisha mafanikio lakini profile haionekani kwenye Firestore server. Tafadhali jaribu tena."), { code: "profile/not-created" });
    return ref;
  }
  await setDoc(ref, { ...profile, email: deleteField(), emailVerified: deleteField() }, { merge: true });
  return ref;
}

export async function ensureAuthenticatedProfile(user: User) {
  const registration = activeRegistration;
  if (registration) {
    await registration.promise;
    if (registration.ready && registration.uid === user.uid) return doc(firestore, "users", user.uid);
  }
  if (profilesReadyInThisSession.has(user.uid)) return doc(firestore, "users", user.uid);
  const ref = await ensureUserProfile(user);
  profilesReadyInThisSession.add(user.uid);
  return ref;
}

function phoneFromLegacyAlias(alias: string | null) {
  return /^(255[67]\d{8})@login\.huduma-za-mtandao\.local$/i.exec(alias ?? "")?.[1] ?? "";
}

export async function registerFirebaseUser(input: { password: string; firstName: string; lastName: string; phone: string }) {
  await authPersistenceReady;
  const phone = normalizeTanzaniaPhone(input.phone);
  if (!phone) throw Object.assign(new Error("Namba ya simu ya Tanzania si sahihi."), { code: "phone/invalid" });
  const email = phoneAuthAlias(phone);
  let resolveRegistration!: () => void;
  const registration: { uid?: string; ready: boolean; promise: Promise<void>; resolve: () => void } = {
    ready: false,
    promise: new Promise<void>((resolve) => { resolveRegistration = resolve; }),
    resolve: () => resolveRegistration(),
  };
  activeRegistration = registration;
  try {
    const credential = await createUserWithEmailAndPassword(firebaseAuth, email, input.password);
    registration.uid = credential.user.uid;
    try {
      await ensureUserProfile(credential.user, { ...input, phone });
    } catch (error) {
      if (String((error as { code?: unknown })?.code ?? "") === "already-exists") {
        await deleteUser(credential.user).catch(() => undefined);
        throw Object.assign(new Error("Namba hii tayari imesajiliwa. Tafadhali ingia kwenye akaunti yako."), { code: "phone/already-registered" });
      }
      throw error;
    }
    registration.ready = true;
    profilesReadyInThisSession.add(credential.user.uid);
    // No email is collected, displayed, sent, or saved to the Firestore profile.
    return credential.user;
  } finally {
    registration.resolve();
    if (activeRegistration === registration) activeRegistration = null;
  }
}

export async function signInWithPhonePassword(phone: string, password: string) {
  await authPersistenceReady;
  const normalizedPhone = normalizeTanzaniaPhone(phone);
  if (!normalizedPhone) throw Object.assign(new Error("Namba ya simu ya Tanzania si sahihi."), { code: "phone/invalid" });
  return signInWithEmailAndPassword(firebaseAuth, phoneAuthAlias(normalizedPhone), password);
}

export async function completeRequiredPasswordChange(password: string) {
  const user = firebaseAuth.currentUser;
  if (!user) throw Object.assign(new Error("Ingia kwanza."), { code: "unauthenticated" });
  await invokeWorker("changeOwnPassword", { password });
  await user.getIdToken(true);
  await syncFirebaseAuthClaims(true);
}

export type FirebaseRoleClaims = { role: FirebaseProfile["role"]; permissions: AdminPermissions; isSuperAdmin: boolean };
const authClaimsInFlight = new Map<string, Promise<FirebaseRoleClaims>>();
export async function syncFirebaseAuthClaims(force = false) {
  const user = firebaseAuth.currentUser;
  if (!user) throw Object.assign(new Error("Ingia kwanza."), { code: "unauthenticated" });
  if (usingFirebaseEmulators) return { role: "user", permissions: {}, isSuperAdmin: false } as FirebaseRoleClaims;
  if (force) authClaimsInFlight.delete(user.uid);
  const existing = authClaimsInFlight.get(user.uid);
  if (existing) return existing;
  const pending = invokeWorker<FirebaseRoleClaims>("syncAuthClaims", {}).then(async (claims) => {
    await user.getIdToken(true);
    return claims;
  }).catch((error) => {
    authClaimsInFlight.delete(user.uid);
    throw error;
  });
  authClaimsInFlight.set(user.uid, pending);
  return pending;
}
export async function signOutFirebaseUser() {
  const uid = firebaseAuth.currentUser?.uid;
  await signOut(firebaseAuth);
  if (uid) authClaimsInFlight.delete(uid);
}

export function subscribeToProfile(uid: string, callback: (profile: FirebaseProfile | null) => void, onError?: (error: unknown) => void) {
  return onSnapshot(doc(firestore, "users", uid), (snapshot) => callback(snapshot.exists() ? sanitizeProfileData(snapshot.data()) : null), onError);
}

export async function saveFirebaseProfile(uid: string, values: Partial<FirebaseProfile>) {
  await setDoc(doc(firestore, "users", uid), { ...omitUndefinedFields(values as Record<string, unknown>), updatedAt: serverTimestamp() }, { merge: true });
}

export async function claimDailyTokenBonus() {
  const callable = createWorkerCall<{ }, { granted: number; balanceAfter: number }>("claimDailyTokenBonus");
  return (await callable({})).data;
}

export async function consumeFirebaseTokens(uid: string, service: { slug: string; name: string; tokenCost: number; kind: string; tokenType?: "nida" | "huduma" }, requestId?: string) {
  if (service.kind === "free" || service.tokenCost <= 0) return { balanceAfter: null, reference: requestId ?? `free-${Date.now()}`, duplicate: false };
  const transactionId = requestId?.trim() || crypto.randomUUID();
  const callable = createWorkerCall<{ serviceId: string; serviceName: string; tokenCost: number; requestId: string; tokenType: "nida" | "huduma" }, { balanceAfter: number; reference: string; duplicate: boolean }>("consumeTokens");
  return (await callable({ serviceId: service.slug, serviceName: service.name, tokenCost: service.tokenCost, requestId: transactionId, tokenType: service.tokenType ?? "huduma" })).data;
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
  applicantName: string;
  businessType: string; otherBusinessType?: string;
  licenseType: "NEW LICENCE" | "RENEWED LICENCE"; principalBranch: "PRINCIPAL" | "BRANCH";
  region: string; ward: string; street: string; tin: string; licenseFee: number;
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
  jpgBlob: Blob;
};

type PreparedBusinessLicense = Omit<GeneratedBusinessLicense, "pdfBlob" | "jpgBlob"> & { form?: BrowserLicenseForm };

function licensePdfBlob(bytes: Uint8Array) {
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Blob([arrayBuffer], { type: "application/pdf" });
}

export async function generateBusinessLicense(payload: BusinessLicensePayload): Promise<GeneratedBusinessLicense> {
  const preparation = await invokeWorker<PreparedBusinessLicense>("generateBusinessLicense", payload);
  if (!preparation.requestId || !preparation.applicationId || !preparation.licenseNumber) throw new Error("Taarifa za ombi la leseni hazijakamilika.");
  const form: BrowserLicenseForm = preparation.form ?? { ...payload, issuingOffice: "" };
  const issueDate = preparation.issueDate ?? "";
  const expiryDate = preparation.expiryDate ?? "";
  const documents = await renderBusinessLicenseDocuments(form, preparation.licenseNumber, issueDate, expiryDate);
  let completed: Omit<GeneratedBusinessLicense, "pdfBlob" | "jpgBlob"> = preparation;
  if (preparation.status !== "COMPLETED") {
    completed = await invokeWorker<Omit<GeneratedBusinessLicense, "pdfBlob" | "jpgBlob">>("completeBusinessLicense", { requestId: preparation.requestId });
  }
  return { ...completed, pdfBlob: licensePdfBlob(documents.pdfBytes), jpgBlob: documents.jpgBlob };
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


export type AdminUserRecord = FirebaseProfile & { lastLoginAt?: unknown; totalTokensReceived?: number; totalTokensUsed?: number };

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

export type WebsiteHealthReport = {
  id: string;
  kind: "javascript" | "promise" | "blank-page" | "firebase";
  message: string;
  source?: string;
  stack?: string;
  pathname?: string;
  href?: string;
  userAgent?: string;
  reporterUid?: string;
  status: "new" | "ongoing" | "resolved";
  createdAt?: string | null;
  resolvedAt?: string | null;
  resolutionNote?: string;
};

export async function recordWebsiteHealthReport(input: { kind: WebsiteHealthReport["kind"]; message: string; source?: string; stack?: string }) {
  const current = firebaseAuth.currentUser;
  if (!current) return null;
  return addDoc(collection(firestore, "websiteHealthReports"), {
    kind: input.kind,
    message: input.message.slice(0, 1200),
    source: input.source?.slice(0, 300) ?? "",
    stack: input.stack?.slice(0, 1600) ?? "",
    pathname: window.location.pathname.slice(0, 300),
    href: window.location.href.slice(0, 500),
    userAgent: navigator.userAgent.slice(0, 500),
    reporterUid: current.uid,
    status: "new",
    createdAt: serverTimestamp(),
  });
}

export function subscribeAdminWebsiteHealthReports(callback: (rows: WebsiteHealthReport[]) => void, onError?: (error: unknown) => void) {
  return onSnapshot(collection(firestore, "websiteHealthReports"), (snapshot) => {
    const rows = snapshot.docs.map((item) => ({ id: item.id, ...item.data(), createdAt: timestampValue(item.data().createdAt), resolvedAt: timestampValue(item.data().resolvedAt) } as WebsiteHealthReport));
    rows.sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
    callback(rows);
  }, onError);
}

export async function resolveWebsiteHealthReport(id: string, note = "Imekaguliwa na kutatuliwa na admin.") {
  await updateDoc(doc(firestore, "websiteHealthReports", id), { status: "resolved", resolutionNote: note.slice(0, 500), resolvedAt: serverTimestamp(), updatedAt: serverTimestamp() });
}

export async function adminListTransactions() {
  const snapshot = await getDocs(collection(firestore, "tokenTransactions"));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data(), createdAt: timestampValue(item.data().createdAt) })).sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
}

export async function adminListCollection(name: "announcements" | "auditLogs" | "advertisements" | "tutorialVideos" | "licenseTemplates" | "adminActions" | "siteSettings" | "messages" | "systemSettings" | "serviceLocks" | "lipaServices" | "tokenPurchaseOrders") {
  const snapshot = await getDocs(collection(firestore, name));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data(), createdAt: timestampValue(item.data().createdAt) }));
}

export async function adminAdjustTokens(adminId: string, userId: string, amount: number, description: string, requestId: string, tokenType: "nida" | "huduma" = "huduma") {
  const callable = createWorkerCall<{ userId: string; amount: number; description: string; requestId: string; tokenType: "nida" | "huduma" }, { balanceAfter: number; reference: string; duplicate: boolean }>("adjustTokens");
  return (await callable({ userId, amount, description, requestId, tokenType })).data;
}

export async function updatePassword(user: User, newPassword: string) {
  return updateFirebasePassword(user, newPassword);
}

export async function adminResetUserPassword(adminId: string, userId: string, temporaryPassword: string) {
  const callable = createWorkerCall("resetUserPassword");
  return (await callable({ userId, temporaryPassword })).data as { ok: boolean; mustChangePassword: boolean };
}

export async function adminUpdateUser(adminId: string, userId: string, values: Partial<AdminUserRecord>) {
  if (values.role !== undefined || values.permissions !== undefined) {
    const callable = createWorkerCall("updateUserAccess");
    await callable({ userId, role: values.role, permissions: values.permissions });
  } else if (values.accessMode !== undefined || values.accountStatus !== undefined) {
    const callable = createWorkerCall("setAccountStatus");
    const accessMode = values.accessMode ?? (values.accountStatus === "blocked" || values.accountStatus === "deleted" ? "denied" : "active");
    await callable({ userId, accessMode, reason: values.restrictionReason ?? "", restrictionMessage: values.restrictionMessage ?? "", allowedActions: values.allowedActions ?? [] });
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

  // Tumia jina la kipekee ili browser/CDN isirudishe avatar ya zamani kutoka cache.
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const objectRef = storageRef(firebaseStorage, `users/${uid}/profile/avatar-${Date.now()}-${crypto.randomUUID()}.${extension}`);
  await uploadBytes(objectRef, file, { contentType: file.type, cacheControl: "private,max-age=300" });
  const url = await getDownloadURL(objectRef);

  // Hifadhi URL kwenye hati ya mtumiaji na ithibitishe imesalia Firestore server.
  await saveFirebaseProfile(uid, { profileImageUrl: url });
  const savedProfile = await getDocFromServer(doc(firestore, "users", uid));
  const savedUrl = savedProfile.exists() ? savedProfile.data().profileImageUrl : undefined;
  if (typeof savedUrl !== "string" || savedUrl !== url) {
    throw new Error("Picha imepakiwa lakini haikuthibitishwa kwenye wasifu. Jaribu tena.");
  }
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
  const value = settings?.templateLayouts && typeof settings.templateLayouts === "object" ? { license: (settings.templateLayouts as any).license } : settings?.licenseTemplateSettings;
  publicLicenseTemplateCache = value && typeof value === "object" ? value as Record<string, unknown> : null;
  return publicLicenseTemplateCache;
}

export async function adminGetSiteSettings() {
  const snapshot = await getDoc(doc(firestore, "siteSettings", "public"));
  return snapshot.exists() ? snapshot.data() : null;
}

export async function reserveBusinessLicenseNumber(reservationId: string, licenseType: "NEW LICENCE" | "RENEWED LICENCE" = "NEW LICENCE") {
  const callable = createWorkerCall<{ reservationId: string; licenseType: "NEW LICENCE" | "RENEWED LICENCE" }, { reservationId: string; licenseNumber: string }>("reserveBusinessLicenseNumber");
  return (await callable({ reservationId, licenseType })).data;
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
  additionalNotes?: string;
  adminReply?: string;
  additionalInfoRequest?: string;
  lastAdminReplyAt?: unknown;
  lastAdminReplyBy?: string;
  reward?: number;
  lipaNumber?: string;
  verifiedTransactions?: number;
  qualificationStatus?: "PENDING_CHECK" | "QUALIFIED" | "NOT_QUALIFIED";
  rewardStatus?: "UNPAID" | "PAID" | "NOT_ELIGIBLE";
  rewardPaymentReference?: string;
  rewardPaidAt?: unknown;
  rewardPaidBy?: string;
  rewardNote?: string;
  submittedAt?: unknown;
  updatedAt?: unknown;
};
export type ServiceApplication = { id: string; applicationId: string; userId: string; userName?: string; serviceSlug: string; serviceName: string; serviceFields?: ServiceFormField[]; statusOptions?: string[]; applicantData: ServiceFormValues; status: string; rejectionReason?: string; assignedAdmin?: string; submittedAt?: unknown; updatedAt?: unknown };
export type NidaRequest = { id: string; requestId: string; userId: string; userName?: string; phone: string; status: "PENDING" | "PROCESSING" | "APPROVED" | "REJECTED"; nidaNumber?: string; rejectionReason?: string; submittedAt?: unknown; updatedAt?: unknown };

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

export async function replyToLipaApplication(applicationId: string, reply = "", infoRequest = "") {
  const callable = createWorkerCall("replyToLipaApplication");
  return (await callable({ applicationId, reply, infoRequest })).data;
}

export async function updateLipaRewardTracking(applicationId: string, values: {
  lipaNumber: string;
  verifiedTransactions: number;
  qualificationStatus: "PENDING_CHECK" | "QUALIFIED" | "NOT_QUALIFIED";
  rewardStatus: "UNPAID" | "PAID" | "NOT_ELIGIBLE";
  rewardPaymentReference?: string;
  rewardNote?: string;
}) {
  const callable = createWorkerCall("updateLipaRewardTracking");
  return (await callable({ applicationId, ...values })).data;
}

export async function markLipaApplicationViewed(applicationId: string) {
  const callable = createWorkerCall("markLipaApplicationViewed");
  return (await callable({ applicationId })).data;
}

export async function getLipaApplicationDocument(applicationId: string, fieldName: string) {
  const callable = createWorkerCall<{ applicationId: string; fieldName: string }, { url: string; expiresAt: number }>("getLipaApplicationDocument");
  const result = (await callable({ applicationId, fieldName })).data;
  if (!result.url.includes("/download/lipa?")) return result;
  const user = firebaseAuth.currentUser;
  if (!user) throw Object.assign(new Error("Ingia kwanza."), { code: "unauthenticated" });
  const response = await fetch(result.url, { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
  if (!response.ok) throw new Error("Picha haikupatikana kwa sasa.");
  const blob = await response.blob();
  return { ...result, url: URL.createObjectURL(blob) };
}

async function waitForLipaUploadAuth(expectedUid: string): Promise<User> {
  if (firebaseAuth.currentUser?.uid === expectedUid) return firebaseAuth.currentUser;
  return await new Promise<User>((resolve, reject) => {
    let unsubscribe: (() => void) | undefined;
    let settled = false;
    const finish = (user: User | null) => {
      if (settled) return;
      settled = true;
      if (unsubscribe) unsubscribe();
      clearTimeout(timeout);
      if (user?.uid === expectedUid) resolve(user);
      else reject(Object.assign(new Error("Kikao cha kuingia hakijapatikana. Toka kwenye akaunti kisha ingia tena."), { code: "unauthenticated" }));
    };
    const timeout = setTimeout(() => finish(firebaseAuth.currentUser), 8000);
    unsubscribe = onAuthStateChanged(firebaseAuth, finish);
  });
}

export async function uploadLipaDocument(uid: string, applicationId: string, fieldName: string, file: File, maxSizeMb = 5, accept = ["image/jpeg", "image/png", "image/webp"]) {
  if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(fieldName)) throw new Error("Jina la field si sahihi.");
  const extension = String(file.name || "").toLowerCase().split(".").pop() || "";
  const detectedType = String(file.type || "").toLowerCase() || ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" } as Record<string, string>)[extension] || "";
  const normalizedType = detectedType === "image/jpg" ? "image/jpeg" : detectedType;
  if (!accept.includes(normalizedType)) throw new Error("Picha lazima iwe JPG, PNG au WebP.");
  const sizeLimit = Math.min(Math.max(maxSizeMb, 1), 10);
  if (file.size > sizeLimit * 1024 * 1024) throw new Error(`Faili lisizidi MB ${sizeLimit}.`);
  const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-90) || "document";
  try {
    // Wait for Firebase to restore the signed-in session before sending the file to the Worker.
    const authUser = await waitForLipaUploadAuth(uid);
    const token = await authUser.getIdToken();
    const body = new FormData();
    body.set("applicationId", applicationId);
    body.set("fieldName", fieldName);
    body.set("fileName", safeName);
    body.set("contentType", normalizedType);
    body.set("file", file, safeName);
    const uploadDirectToFirebase = async () => {
      // Firebase Storage is an authenticated fallback for network/CORS and server failures.
      // Storage rules still enforce the user's UID, access mode, allowed type and file size.
      const fallbackRef = storageRef(firebaseStorage, `lipaUploads/${uid}/${applicationId}/${fieldName}-${crypto.randomUUID()}-${safeName}`);
      await uploadBytes(fallbackRef, file, { contentType: normalizedType, cacheControl: "private,no-store,max-age=0" });
      return fallbackRef.fullPath;
    };
    let response: Response;
    try {
      response = await fetch(`${workerBaseUrl()}/upload/lipa`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        body,
      });
    } catch {
      return await uploadDirectToFirebase();
    }
    // Retry through Firebase Storage if the API is temporarily unavailable.
    // Do not bypass normal validation/authentication errors returned by the API.
    if (response.status >= 500) return await uploadDirectToFirebase();
    const result = await response.json().catch(() => null) as { data?: { path?: string }; error?: { message?: string } } | null;
    if (!response.ok || !result?.data?.path) throw new Error(result?.error?.message ?? `Seva ya kuhifadhi picha imekataa faili (HTTP ${response.status}).`);
    return result.data.path;
  } catch (error) {
    const err = error as { message?: string; code?: string };
    const message = err?.message || "Hitilafu isiyojulikana.";
    if (err?.code === "unauthenticated") throw new Error(message);
    throw new Error(`Imeshindikana kupakia ${file.name}: ${message}`);
  }
}

export async function removeLipaUpload(storagePath: string) {
  if (!storagePath.startsWith("lipaUploads/")) return;
  await deleteObject(storageRef(firebaseStorage, storagePath));
}

export async function adminListLipaApplications() {
  const callable = createWorkerCall("listLipaApplications");
  const result = (await callable({})).data as { applications?: Array<Record<string, unknown>> };
  return (result.applications ?? []).map((item) => ({
    id: String(item.id ?? item.applicationId ?? ""),
    ...item,
    submittedAt: timestampValue(item.submittedAt),
    updatedAt: timestampValue(item.updatedAt),
  } as LipaApplication));
}

export function subscribeToAdminLipaApplications(callback: (rows: LipaApplication[]) => void, onError?: (error: unknown) => void) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const load = async () => {
    try {
      const rows = await adminListLipaApplications();
      if (!stopped) callback(rows);
    } catch (error) {
      if (!stopped) onError?.(error);
    } finally {
      if (!stopped) timer = setTimeout(load, 5000);
    }
  };
  void load();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

export function subscribeUserLipaApplications(uid: string, callback: (rows: LipaApplication[]) => void, onError?: (error: unknown) => void) {
  const userQuery = query(collection(firestore, "lipaApplications"), where("userId", "==", uid));
  return onSnapshot(userQuery, (snapshot) => callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data(), submittedAt: timestampValue(item.data().submittedAt), updatedAt: timestampValue(item.data().updatedAt) } as LipaApplication)).sort((a, b) => String(b.submittedAt ?? "").localeCompare(String(a.submittedAt ?? "")))), onError);
}

export async function submitNidaRequest(phone: string) {
  const callable = createWorkerCall<{ phone: string }, { requestId: string; status: string }>("submitNidaRequest");
  return (await callable({ phone })).data;
}

export async function updateNidaRequestPhone(requestId: string, phone: string) {
  const callable = createWorkerCall<{ requestId: string; phone: string }, { requestId: string; status: string; phone: string }>("updateNidaRequestPhone");
  return (await callable({ requestId, phone })).data;
}

export async function listMyNidaRequests() {
  const callable = createWorkerCall<Record<string, never>, { requests: NidaRequest[] }>("listMyNidaRequests");
  return (await callable({})).data.requests ?? [];
}

export async function listNidaRequests() {
  const callable = createWorkerCall<Record<string, never>, { requests: NidaRequest[] }>("listNidaRequests");
  return (await callable({})).data.requests ?? [];
}

export async function setNidaRequestStatus(requestId: string, status: "PROCESSING" | "REJECTED", rejectionReason = "") {
  const callable = createWorkerCall<{ requestId: string; status: string; rejectionReason: string }, { requestId: string; status: string }>("setNidaRequestStatus");
  return (await callable({ requestId, status, rejectionReason })).data;
}

export async function completeNidaRequest(requestId: string, nidaNumber: string) {
  const callable = createWorkerCall<{ requestId: string; nidaNumber: string }, { requestId: string; status: string }>("completeNidaRequest");
  return (await callable({ requestId, nidaNumber })).data;
}

export async function createServiceApplication(applicationId: string, serviceSlug: string, values: ServiceFormValues) {
  const callable = createWorkerCall("createServiceApplication");
  return (await callable({ applicationId, serviceSlug, values })).data as { applicationId: string; status: string; duplicate: boolean; balanceAfter: number | null; reference: string };
}

export async function updateServiceApplication(applicationId: string, values: ServiceFormValues) {
  const callable = createWorkerCall("updateServiceApplication");
  return (await callable({ applicationId, values })).data as { applicationId: string; status: string; updated: boolean };
}

export async function setServiceApplicationStatus(applicationId: string, status: string, rejectionReason = "") {
  const callable = createWorkerCall("setServiceApplicationStatus");
  return (await callable({ applicationId, status, rejectionReason })).data;
}

export async function uploadServiceDocument(uid: string, applicationId: string, fieldName: string, file: File, maxSizeMb = 5, accept = ["image/jpeg", "image/png", "image/webp"]) {
  if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(fieldName)) throw new Error("Jina la field si sahihi.");
  if (firebaseAuth.currentUser?.uid !== uid) throw new Error("Akaunti haijathibitishwa. Ingia tena.");
  if (!accept.includes(file.type)) throw new Error("Aina ya faili hairuhusiwi.");
  const sizeLimit = Math.min(Math.max(maxSizeMb, 1), 5);
  if (file.size < 1 || file.size > sizeLimit * 1024 * 1024) throw new Error(`Faili liwe chini ya ${sizeLimit} MB.`);
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error("Ingia kwanza.");
  const token = await user.getIdToken();
  const form = new FormData();
  form.append("applicationId", applicationId);
  form.append("fieldName", fieldName);
  form.append("file", file, file.name || "document");
  const response = await fetch(`${workerBaseUrl()}/upload/service-document`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    body: form,
    signal: AbortSignal.timeout(45000),
  });
  const result = await response.json().catch(() => null) as { data?: { path?: string }; error?: { message?: string } } | null;
  if (!response.ok || !result?.data?.path) throw new Error(result?.error?.message || `Imeshindikana kuhifadhi picha (HTTP ${response.status}).`);
  return result.data.path;
}

export async function removeServiceUpload(storagePath: string) {
  if (!storagePath.startsWith("serviceUploads/")) return;
  const user = firebaseAuth.currentUser;
  if (!user) return;
  const token = await user.getIdToken();
  const response = await fetch(`${workerBaseUrl()}/delete/service-document`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ path: storagePath }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(result?.error?.message || "Imeshindikana kufuta picha ya zamani.");
  }
}

export async function adminListServiceApplications() {
  const callable = createWorkerCall("listServiceApplications");
  const result = (await callable({})).data as { applications?: Array<Record<string, unknown>> };
  return (result.applications ?? []).map((item) => ({
    id: String(item.id ?? item.applicationId ?? ""),
    ...item,
    submittedAt: timestampValue(item.submittedAt),
    updatedAt: timestampValue(item.updatedAt),
  } as ServiceApplication));
}

export function subscribeToAdminServiceApplications(callback: (rows: ServiceApplication[]) => void, onError?: (error: unknown) => void) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const load = async () => {
    try {
      const rows = await adminListServiceApplications();
      if (!stopped) callback(rows);
    } catch (error) {
      if (!stopped) onError?.(error);
    } finally {
      if (!stopped) timer = setTimeout(load, 5000);
    }
  };
  void load();
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}

export async function replyToServiceApplication(applicationId: string, subject: string, body: string, messageType: "reply" | "request-info" = "reply") {
  const callable = createWorkerCall("replyToServiceApplication");
  return (await callable({ applicationId, subject, body, messageType })).data;
}

export async function markServiceApplicationViewed(applicationId: string) {
  const callable = createWorkerCall<{ applicationId: string }, { ok: boolean }>("markServiceApplicationViewed");
  return (await callable({ applicationId })).data;
}

export async function getServiceApplicationDocument(applicationId: string, fieldName: string) {
  const callable = createWorkerCall<{ applicationId: string; fieldName: string }, { url: string; expiresAt: number }>("getServiceApplicationDocument");
  return (await callable({ applicationId, fieldName })).data;
}

export function subscribeUserServiceApplications(uid: string, callback: (rows: ServiceApplication[]) => void, onError?: (error: unknown) => void) {
  const userQuery = query(collection(firestore, "serviceApplications"), where("userId", "==", uid));
  return onSnapshot(userQuery, (snapshot) => callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data(), submittedAt: timestampValue(item.data().submittedAt), updatedAt: timestampValue(item.data().updatedAt) } as ServiceApplication)).sort((a, b) => String(b.submittedAt ?? "").localeCompare(String(a.submittedAt ?? "")))), onError);
}

export async function markUserMessageRead(messageId: string, uid: string) {
  if (!messageId || !uid || uid !== firebaseAuth.currentUser?.uid) throw new Error("Akaunti haijathibitishwa.");
  const callable = createWorkerCall<{ messageId: string }, { ok: boolean }>("markUserMessageRead");
  return (await callable({ messageId })).data;
}

export function subscribeUserMessages(uid: string, callback: (rows: Array<Record<string, unknown> & { id: string }>) => void, onError?: (error: unknown) => void) {
  const messages = collection(firestore, "messages");
  const personalQuery = query(messages, where("recipientId", "==", uid));
  const broadcastQuery = query(messages, where("broadcast", "==", true));
  const personalRows = new Map<string, Record<string, unknown> & { id: string }>();
  const broadcastRows = new Map<string, Record<string, unknown> & { id: string }>();
  const emit = () => {
    const rows = new Map(personalRows);
    broadcastRows.forEach((row, id) => { if (!rows.has(id)) rows.set(id, row); });
    callback(Array.from(rows.values()).sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""))));
  };
  const updateRows = (target: Map<string, Record<string, unknown> & { id: string }>, snapshot: QuerySnapshot<DocumentData>) => {
    target.clear();
    for (const item of snapshot.docs) target.set(item.id, { id: item.id, ...item.data(), createdAt: timestampValue(item.data().createdAt) });
    emit();
  };
  const unsubscribePersonal = onSnapshot(personalQuery, (snapshot) => updateRows(personalRows, snapshot), onError);
  const unsubscribeBroadcast = onSnapshot(broadcastQuery, (snapshot) => updateRows(broadcastRows, snapshot), onError);
  return () => { unsubscribePersonal(); unsubscribeBroadcast(); };
}

export type ChatUser = { uid: string; name: string; phone: string; profileImageUrl?: string; verificationStatus?: "pending" | "approved" | "rejected" };
export type ChatMessage = { id: string; senderId: string; senderName?: string; text?: string; filePath?: string; fileName?: string; fileType?: string; replyTo?: { id: string; text: string; senderId: string }; createdAt?: unknown; editedAt?: unknown; deliveredTo?: string[]; readBy?: string[] };
export type PrivateConversation = { id: string; participants: string[]; names: Record<string, string>; phones: Record<string, string>; profileImages?: Record<string, string>; lastMessage?: string; updatedAt?: unknown };
export type ChatGroup = { id: string; name: string; description?: string; ownerId: string; visibility: "private" | "public"; memberIds: string[]; memberNames: Record<string, string>; memberPhones: Record<string, string>; memberImages?: Record<string, string>; avatarUrl?: string; lastMessage?: string; updatedAt?: unknown; createdAt?: unknown };
export type ChatGroupJoinRequest = { id: string; groupId: string; userId: string; userName: string; userPhone: string; userImage?: string; status: "pending" | "approved" | "rejected"; createdAt?: unknown };

export function subscribeChatMembers(callback: (rows: ChatUser[]) => void, onError?: (error: unknown) => void) {
  let active = true;
  void invokeWorker<ChatUser[]>("listChatMembers", {}).then((rows) => {
    if (active) callback(rows);
  }).catch((error) => {
    if (active) onError?.(error);
  });
  return () => { active = false; };
}

export async function findChatUser(phone: string) {
  return invokeWorker<ChatUser>("findChatUser", { phone });
}

export async function openPrivateConversation(current: ChatUser, other: ChatUser) {
  const participants = [current.uid, other.uid].sort();
  const id = participants.join("__");
  const ref = doc(firestore, "conversations", id);
  if (!(await getDoc(ref)).exists()) await setDoc(ref, {
    participants,
    names: { [current.uid]: current.name, [other.uid]: other.name },
    phones: { [current.uid]: current.phone, [other.uid]: other.phone },
    profileImages: { [current.uid]: current.profileImageUrl ?? "", [other.uid]: other.profileImageUrl ?? "" },
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(), lastMessage: "",
  });
  return id;
}

function subscribeChatRows(collectionRef: ReturnType<typeof collection>, callback: (rows: any[]) => void, onError?: (error: unknown) => void) {
  return onSnapshot(query(collectionRef, orderBy("createdAt", "asc")), (snapshot) => {
    callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as any)));
  }, onError);
}
export function subscribePublicChat(callback: (rows: ChatMessage[]) => void, onError?: (error: unknown) => void) {
  return subscribeChatRows(collection(firestore, "publicChatMessages"), callback, onError);
}
export function subscribeConversations(uid: string, callback: (rows: PrivateConversation[]) => void, onError?: (error: unknown) => void) {
  return onSnapshot(query(collection(firestore, "conversations"), where("participants", "array-contains", uid)), (snapshot) => {
    const rows = snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as PrivateConversation));
    rows.sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")));
    callback(rows);
  }, onError);
}
export function subscribeAllConversations(callback: (rows: PrivateConversation[]) => void, onError?: (error: unknown) => void) {
  return onSnapshot(query(collection(firestore, "conversations"), orderBy("updatedAt", "desc")), (snapshot) => {
    callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as PrivateConversation)));
  }, onError);
}
export function subscribeChatGroups(uid: string, callback: (rows: ChatGroup[]) => void, onError?: (error: unknown) => void) {
  return onSnapshot(query(collection(firestore, "chatGroups"), where("memberIds", "array-contains", uid)), (snapshot) => {
    const rows = snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as ChatGroup));
    rows.sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")));
    callback(rows);
  }, onError);
}
export async function createChatGroup(current: ChatUser, members: ChatUser[], name: string, description = "", visibility: "private" | "public" = "private") {
  const cleanName = name.trim().slice(0, 80);
  const unique = [current, ...members].filter((item, index, all) => all.findIndex((candidate) => candidate.uid === item.uid) === index);
  if (!cleanName) throw new Error("Weka jina la group.");
  if (unique.length < 2) throw new Error("Ongeza angalau mtu mmoja kwenye group.");
  if (unique.length > 50) throw new Error("Group linaweza kuwa na hadi watu 50.");
  const groupRef = doc(collection(firestore, "chatGroups"));
  const memberIds = unique.map((item) => item.uid).sort();
  const memberNames = Object.fromEntries(unique.map((item) => [item.uid, item.name]));
  const memberPhones = Object.fromEntries(unique.map((item) => [item.uid, item.phone]));
  const memberImages = Object.fromEntries(unique.map((item) => [item.uid, item.profileImageUrl ?? ""]));
  await setDoc(groupRef, { name: cleanName, description: description.trim().slice(0, 240), ownerId: current.uid, visibility, memberIds, memberNames, memberPhones, memberImages, lastMessage: "", createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return groupRef.id;
}
export async function updateChatGroupSettings(groupId: string, uid: string, values: { name?: string; description?: string; visibility?: "private" | "public" }) {
  const groupRef = doc(firestore, "chatGroups", groupId);
  const snapshot = await getDoc(groupRef);
  if (!snapshot.exists()) throw new Error("Group halipatikani.");
  const group = snapshot.data() as ChatGroup;
  if (group.ownerId !== uid) throw new Error("Msimamizi wa group pekee ndiye anayeweza kubadilisha mipangilio.");
  const updates: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (values.name !== undefined) {
    const name = values.name.trim().slice(0, 80);
    if (!name) throw new Error("Jina la group haliwezi kuwa tupu.");
    updates.name = name;
  }
  if (values.description !== undefined) updates.description = values.description.trim().slice(0, 240);
  if (values.visibility !== undefined) updates.visibility = values.visibility;
  await updateDoc(groupRef, updates);
}
export async function addChatGroupMember(groupId: string, actorUid: string, member: ChatUser) {
  const ref = doc(firestore, "chatGroups", groupId);
  await runTransaction(firestore, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Group halipatikani.");
    const group = snap.data() as ChatGroup;
    if (group.ownerId !== actorUid) throw Object.assign(new Error("Admin wa group pekee ndiye anaweza kuongeza washiriki."), { code: "permission-denied" });
    if (group.memberIds.includes(member.uid)) throw new Error("Mtumiaji huyu tayari yupo kwenye group.");
    if (group.memberIds.length >= 5000) throw new Error("Group limefikia kikomo cha washiriki.");
    tx.update(ref, {
      memberIds: arrayUnion(member.uid),
      [`memberNames.${member.uid}`]: member.name,
      [`memberPhones.${member.uid}`]: member.phone,
      [`memberImages.${member.uid}`]: member.profileImageUrl ?? "",
      updatedAt: serverTimestamp(),
    });
  });
}
export async function leaveChatGroup(groupId: string, uid: string) {
  const ref = doc(firestore, "chatGroups", groupId);
  await runTransaction(firestore, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Group halipatikani.");
    const group = snap.data() as ChatGroup;
    if (group.ownerId === uid) throw new Error("Admin mkuu hawezi kutoka kabla hajahamisha umiliki wa group.");
    if (!group.memberIds.includes(uid)) throw new Error("Wewe si mwanachama wa group hili.");
    tx.update(ref, {
      memberIds: group.memberIds.filter((id) => id !== uid),
      [`memberNames.${uid}`]: deleteField(),
      [`memberPhones.${uid}`]: deleteField(),
      [`memberImages.${uid}`]: deleteField(),
      updatedAt: serverTimestamp(),
    });
  });
}
export async function reportChatGroup(reporterId: string, groupId: string, groupName: string, reason: string) {
  const cleanReason = reason.trim().slice(0, 500);
  if (!cleanReason) throw new Error("Eleza sababu ya kuripoti group.");
  await addDoc(collection(firestore, "chatReports"), {
    reporterId, targetType: "group", groupId, groupName: groupName.slice(0, 80),
    reason: cleanReason, status: "open", createdAt: serverTimestamp(),
  });
}
export function subscribeGroupTyping(groupId: string, callback: (uids: string[]) => void, onError?: (error: unknown) => void) {
  return onSnapshot(collection(firestore, "chatGroups", groupId, "typing"), (snapshot) => callback(snapshot.docs.map((item) => item.id)), onError);
}
export async function setChatGroupTyping(groupId: string, uid: string, typing: boolean) {
  const ref = doc(firestore, "chatGroups", groupId, "typing", uid);
  if (typing) await setDoc(ref, { updatedAt: serverTimestamp() });
  else await deleteDoc(ref);
}

export async function uploadChatGroupAvatar(groupId: string, uid: string, file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Chagua picha ya JPG, PNG au WebP.");
  if (file.size > 2 * 1024 * 1024) throw new Error("Picha ya group isizidi MB 2.");
  const snapshot = await getDoc(doc(firestore, "chatGroups", groupId));
  if (!snapshot.exists()) throw new Error("Group halipatikani.");
  const group = snapshot.data() as ChatGroup;
  if (group.ownerId !== uid) throw new Error("Msimamizi wa group pekee ndiye anayeweza kubadilisha picha.");
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `chatGroupFiles/${groupId}/${uid}/avatar-${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const objectRef = storageRef(firebaseStorage, path);
  await uploadBytes(objectRef, file, { contentType: file.type, cacheControl: "private,max-age=300" });
  const url = await getDownloadURL(objectRef);
  await updateDoc(doc(firestore, "chatGroups", groupId), { avatarUrl: url, avatarPath: path, updatedAt: serverTimestamp() });
  return url;
}
export function subscribePublicChatGroups(callback: (rows: ChatGroup[]) => void, onError?: (error: unknown) => void) {
  return onSnapshot(query(collection(firestore, "chatGroups"), where("visibility", "==", "public")), (snapshot) => {
    const rows = snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as ChatGroup));
    rows.sort((a, b) => String(b.updatedAt ?? b.createdAt ?? "").localeCompare(String(a.updatedAt ?? a.createdAt ?? "")));
    callback(rows);
  }, onError);
}
export async function requestToJoinChatGroup(groupId: string, user: ChatUser) {
  const group = await getDoc(doc(firestore, "chatGroups", groupId));
  if (!group.exists()) throw new Error("Group halipatikani.");
  const data = group.data() as ChatGroup;
  if (data.visibility !== "public") throw new Error("Group hili ni private.");
  if (data.memberIds.includes(user.uid)) throw new Error("Tayari uko kwenye group.");
  const ref = doc(firestore, "chatGroups", groupId, "joinRequests", user.uid);
  await setDoc(ref, { groupId, userId: user.uid, userName: user.name, userPhone: user.phone, userImage: user.profileImageUrl ?? "", status: "pending", createdAt: serverTimestamp() }, { merge: true });
}
export function subscribeGroupJoinRequests(groupId: string, callback: (rows: ChatGroupJoinRequest[]) => void, onError?: (error: unknown) => void) {
  return onSnapshot(query(collection(firestore, "chatGroups", groupId, "joinRequests"), where("status", "==", "pending")), (snapshot) => {
    callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as ChatGroupJoinRequest)));
  }, onError);
}
export async function approveChatGroupJoinRequest(groupId: string, request: ChatGroupJoinRequest) {
  const groupRef = doc(firestore, "chatGroups", groupId);
  const requestRef = doc(firestore, "chatGroups", groupId, "joinRequests", request.id);
  await runTransaction(firestore, async (tx) => {
    const groupSnap = await tx.get(groupRef);
    if (!groupSnap.exists()) throw new Error("Group halipatikani.");
    const group = groupSnap.data() as ChatGroup;
    if (group.ownerId !== firebaseAuth.currentUser?.uid) throw Object.assign(new Error("Ni admin wa group pekee anaweza kukubali."), { code: "permission-denied" });
    if (group.memberIds.includes(request.userId)) return;
    if (group.memberIds.length >= 50) throw new Error("Group limefikia watu 50.");
    tx.update(groupRef, { memberIds: arrayUnion(request.userId), memberNames: { ...group.memberNames, [request.userId]: request.userName }, memberPhones: { ...group.memberPhones, [request.userId]: request.userPhone }, memberImages: { ...(group.memberImages ?? {}), [request.userId]: request.userImage ?? "" }, updatedAt: serverTimestamp() });
    tx.update(requestRef, { status: "approved", updatedAt: serverTimestamp() });
  });
}
export function subscribeGroupChat(groupId: string, callback: (rows: ChatMessage[]) => void, onError?: (error: unknown) => void) {
  return subscribeChatRows(collection(firestore, "chatGroups", groupId, "messages"), callback, onError);
}
export async function sendGroupChatMessage(groupId: string, senderId: string, text: string, replyTo?: ChatMessage, attachment?: { filePath: string; fileName: string; fileType: string }, senderName?: string) {
  const content = text.trim();
  if (!content && !attachment) throw new Error("Andika ujumbe au chagua faili.");
  const message = { senderId, ...(senderName ? { senderName: senderName.slice(0, 80) } : {}), ...(content ? { text: content } : {}), ...(attachment ?? {}), ...(replyTo ? { replyTo: { id: replyTo.id, text: String(replyTo.text ?? replyTo.fileName ?? "Kiambatisho"), senderId: replyTo.senderId } } : {}), deliveredTo: [senderId], readBy: [senderId], createdAt: serverTimestamp() };
  await addDoc(collection(firestore, "chatGroups", groupId, "messages"), message);
  await updateDoc(doc(firestore, "chatGroups", groupId), { lastMessage: content || attachment?.fileName || "Kiambatisho", updatedAt: serverTimestamp() });
}
export function subscribePrivateChat(roomId: string, callback: (rows: ChatMessage[]) => void, onError?: (error: unknown) => void) {
  return subscribeChatRows(collection(firestore, "conversations", roomId, "messages"), callback, onError);
}
export function subscribeTyping(roomId: string, callback: (uids: string[]) => void, onError?: (error: unknown) => void) {
  return onSnapshot(collection(firestore, "conversations", roomId, "typing"), (snapshot) => callback(snapshot.docs.map((item) => item.id)), onError);
}
export function subscribePresence(uid: string, callback: (presence: { online: boolean; lastSeen?: unknown } | null) => void) {
  return onSnapshot(doc(firestore, "userPresence", uid), (snapshot) => callback(snapshot.exists() ? snapshot.data() as { online: boolean; lastSeen?: unknown } : null));
}
export async function updatePresence(uid: string, online: boolean) {
  await setDoc(doc(firestore, "userPresence", uid), { online, lastSeen: online ? null : serverTimestamp() }, { merge: true });
}
export async function setChatTyping(roomId: string, uid: string, typing: boolean) {
  const ref = doc(firestore, "conversations", roomId, "typing", uid);
  if (typing) await setDoc(ref, { updatedAt: serverTimestamp() });
  else await deleteDoc(ref);
}
export async function sendChatMessage(roomId: string | null, senderId: string, text: string, replyTo?: ChatMessage, isPublic = false, attachment?: { filePath: string; fileName: string; fileType: string }, senderName?: string) {
  const collectionRef = isPublic ? collection(firestore, "publicChatMessages") : collection(firestore, "conversations", roomId!, "messages");
  const content = text.trim();
  if (!content && !attachment) throw new Error("Andika ujumbe au chagua faili.");
  const message = {
    senderId,
    ...(senderName ? { senderName: senderName.slice(0, 80) } : {}),
    ...(content ? { text: content } : {}),
    ...(attachment ?? {}),
    ...(replyTo ? { replyTo: { id: replyTo.id, text: String(replyTo.text ?? replyTo.fileName ?? "Kiambatisho"), senderId: replyTo.senderId } } : {}),
    deliveredTo: [senderId], readBy: [senderId], createdAt: serverTimestamp(),
  };
  await addDoc(collectionRef, message);
  if (!isPublic && roomId) await updateDoc(doc(firestore, "conversations", roomId), { lastMessage: content || attachment?.fileName || "Kiambatisho", updatedAt: serverTimestamp() });
}
export async function markChatMessageRead(roomId: string | null, message: ChatMessage, uid: string, isPublic = false) {
  if (message.senderId === uid || message.readBy?.includes(uid)) return;
  const ref = isPublic ? doc(firestore, "publicChatMessages", message.id) : doc(firestore, "conversations", roomId!, "messages", message.id);
  await updateDoc(ref, { deliveredTo: arrayUnion(uid), readBy: arrayUnion(uid) });
}
export async function editChatMessage(roomId: string | null, message: ChatMessage, text: string, isPublic = false) {
  const content = text.trim();
  if (!content) throw new Error("Ujumbe hauwezi kuwa tupu.");
  if (content.length > 5000) throw new Error("Ujumbe usizidi herufi 5,000.");
  const ref = isPublic ? doc(firestore, "publicChatMessages", message.id) : doc(firestore, "conversations", roomId!, "messages", message.id);
  await updateDoc(ref, { text: content, editedAt: serverTimestamp() });
}
export async function deleteChatMessage(roomId: string | null, message: ChatMessage, isPublic = false) {
  const ref = isPublic ? doc(firestore, "publicChatMessages", message.id) : doc(firestore, "conversations", roomId!, "messages", message.id);
  await deleteDoc(ref);
  if (message.filePath) {
    try { await deleteObject(storageRef(firebaseStorage, message.filePath)); } catch { /* The message is removed; an orphaned file can be cleaned up later. */ }
  }
}
export async function uploadChatFile(roomId: string | null, senderId: string, file: File, isPublic = false, isGroup = false) {
  if (file.size > 10 * 1024 * 1024) throw new Error("Faili isizidi MB 10.");
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf", "text/plain", "audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg"];
  if (!allowed.includes(file.type)) throw new Error("Aina hii ya faili hairuhusiwi.");
  const safeName = file.name.replace(/[^\w.-]/g, "_").slice(0, 100) || "attachment";
  const path = isPublic ? `publicChatFiles/${senderId}/${Date.now()}_${safeName}` : isGroup ? `chatGroupFiles/${roomId}/${senderId}/${Date.now()}_${safeName}` : `chatFiles/${roomId}/${senderId}/${Date.now()}_${safeName}`;
  const reference = storageRef(firebaseStorage, path);
  await uploadBytes(reference, file, { contentType: file.type });
  return { filePath: path, fileName: safeName, fileType: file.type };
}
export async function loadChatAttachment(path: string) {
  return getBlob(storageRef(firebaseStorage, path));
}
export async function blockChatUser(uid: string, targetUid: string) {
  await setDoc(doc(firestore, "userBlocks", uid, "blocked", targetUid), { createdAt: serverTimestamp() });
}
export async function reportChatUser(uid: string, targetUid: string, roomId: string, reason: string) {
  await addDoc(collection(firestore, "chatReports"), { reporterId: uid, targetUid, roomId, reason: reason.slice(0, 500), createdAt: serverTimestamp(), status: "open" });
}
