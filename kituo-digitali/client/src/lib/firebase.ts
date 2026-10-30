import { initializeApp } from "firebase/app";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
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
  collection,
  connectFirestoreEmulator,
  deleteField,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  or,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  startAfter,
  type DocumentReference,
  type Query,
  type QueryDocumentSnapshot,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
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

// Firestore quota protection: after a quota response, pause Worker-backed calls briefly
// instead of letting repeated UI refreshes immediately hit the same exhausted quota.
let workerQuotaCooldownUntil = 0;
const WORKER_QUOTA_COOLDOWN_MS = 60_000;

function isQuotaFailure(status: number, code: string, message: string) {
  const value = `${code} ${message}`.toLowerCase();
  return status === 429 || value.includes("resource_exhausted") || value.includes("resource-exhausted") || value.includes("quota exceeded") || value.includes("quota-exceeded");
}

async function invokeWorker<TResponse>(name: string, data: unknown, authUser?: User): Promise<TResponse> {
  if (Date.now() < workerQuotaCooldownUntil) {
    throw Object.assign(new Error("Matumizi ya database yamefikia kikomo kwa muda. Mfumo unasubiri kabla ya kujaribu tena; tafadhali subiri dakika moja."), { code: "api/quota-cooldown" });
  }
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
    const message = result?.error?.message ?? `Ombi la API limeshindikana (${response.status}).`;
    if (isQuotaFailure(response.status, code, message)) workerQuotaCooldownUntil = Date.now() + WORKER_QUOTA_COOLDOWN_MS;
    const error = new Error(message);
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

type CollectionListener = {
  callbacks: Set<(rows: DocumentData[]) => void>;
  unsubscribe: () => void;
};
const collectionListenerCache = new Map<string, CollectionListener>();
async function readAllDocuments(buildQuery: (cursor?: QueryDocumentSnapshot<DocumentData>) => Query<DocumentData>, pageSize = 100) {
  const documents: QueryDocumentSnapshot<DocumentData>[] = [];
  let cursor: QueryDocumentSnapshot<DocumentData> | undefined;
  for (;;) {
    const page = await getDocs(buildQuery(cursor));
    documents.push(...page.docs);
    if (page.docs.length < pageSize) return documents;
    const nextCursor = page.docs.at(-1);
    if (!nextCursor || nextCursor.id === cursor?.id) throw new Error("Firestore pagination did not advance.");
    cursor = nextCursor;
  }
}

const PROFILE_CACHE_TTL_MS = 45_000;
const profileCache = new Map<string, { loadedAt: number; value: FirebaseProfile | null }>();
const profileRequests = new Map<string, Promise<FirebaseProfile | null>>();
const collectionReadLimits: Record<string, number> = {
  announcements: 50,
  siteSettings: 10,
  serviceLocks: 100,
  services: 100,
  lipaServices: 50,
  agentRecords: 100,
  tokenTransactions: 100,
  adminActions: 100,
  auditLogs: 100,
  advertisements: 100,
  tutorialVideos: 100,
  licenseTemplates: 100,
  messages: 100,
  systemSettings: 50,
  tokenPurchaseOrders: 100,
  websiteHealthReports: 100,
};
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
const profileInitializationRequests = new Map<string, Promise<DocumentReference>>();
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
  if (profilesReadyInThisSession.has(user.uid)) return doc(firestore, "users", user.uid);
  const pending = profileInitializationRequests.get(user.uid);
  if (pending) return pending;
  const request = (async () => {
    const registration = activeRegistration;
    if (registration) {
      await registration.promise;
      if (registration.ready && registration.uid === user.uid) return doc(firestore, "users", user.uid);
    }
    if (profilesReadyInThisSession.has(user.uid)) return doc(firestore, "users", user.uid);
    const ref = await ensureUserProfile(user);
    profilesReadyInThisSession.add(user.uid);
    return ref;
  })();
  profileInitializationRequests.set(user.uid, request);
  try { return await request; }
  finally { if (profileInitializationRequests.get(user.uid) === request) profileInitializationRequests.delete(user.uid); }
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
  if (uid) {
    authClaimsInFlight.delete(uid);
    profileCache.delete(uid);
    profileRequests.delete(uid);
  }
}

export async function getFirebaseProfileOnce(uid: string, options?: { force?: boolean }): Promise<FirebaseProfile | null> {
  const force = options?.force === true;
  const cached = profileCache.get(uid);
  if (!force && cached && Date.now() - cached.loadedAt < PROFILE_CACHE_TTL_MS) return cached.value;
  if (force) profileCache.delete(uid);
  const pending = profileRequests.get(uid);
  if (!force && pending) return pending;
  const request = getDocFromServer(doc(firestore, "users", uid)).then((snapshot) => {
    const value = snapshot.exists() ? sanitizeProfileData(snapshot.data()) : null;
    if (profileRequests.get(uid) === request) profileCache.set(uid, { loadedAt: Date.now(), value });
    return value;
  }).catch((error) => {
    profileCache.delete(uid);
    throw error;
  }).finally(() => {
    if (profileRequests.get(uid) === request) profileRequests.delete(uid);
  });
  profileRequests.set(uid, request);
  return request;
}

export function subscribeToProfile(uid: string, callback: (profile: FirebaseProfile | null) => void, onError?: (error: unknown) => void) {
  return onSnapshot(doc(firestore, "users", uid), (snapshot) => callback(snapshot.exists() ? sanitizeProfileData(snapshot.data()) : null), onError);
}

export async function saveFirebaseProfile(uid: string, values: Partial<FirebaseProfile>) {
  await setDoc(doc(firestore, "users", uid), { ...omitUndefinedFields(values as Record<string, unknown>), updatedAt: serverTimestamp() }, { merge: true });
  profileCache.delete(uid);
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
  const purchases = query(collection(firestore, "tokenPurchaseOrders"), where("userId", "==", uid), orderBy("createdAt", "desc"), limit(10));
  return onSnapshot(purchases, (snapshot) => {
    callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as TokenPurchaseOrder)));
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

export function subscribeToTokenHistory(uid: string, callback: (rows: DocumentData[]) => void, onError?: (error: unknown) => void) {
  let active = true;
  void readAllDocuments((cursor) => query(collection(firestore, "tokenTransactions"), where("userId", "==", uid), limit(100), ...(cursor ? [startAfter(cursor)] : []))).then((documents) => {
    if (!active) return;
    callback(documents.map((item) => ({ id: item.id, ...item.data() } as DocumentData)).sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""))));
  }).catch((error) => { if (active) onError?.(error); });
  return () => { active = false; };
}


export type AdminUserRecord = FirebaseProfile & { lastLoginAt?: unknown; totalTokensReceived?: number; totalTokensUsed?: number };

function timestampValue(value: unknown) {
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return value ?? null;
}


export type AgentRecord = {
  id: string;
  agentId: string;
  userId: string;
  name: string;
  phone: string;
  network: string;
  type: string;
  region: string;
  regionCode: string;
  district: string;
  area: string;
  issueDate: string;
  expiryDate: string;
  status: string;
  createdAt?: string | null;
  updatedAt?: string | null;
};

const agentRegionCodes: Record<string, string> = {
  "dar es salaam": "DSM", "dodoma": "DOM", "arusha": "ARU", "mwanza": "MWZ",
  "mbeya": "MBY", "morogoro": "MOR", "tanga": "TNG", "kilimanjaro": "KLM",
  "iringa": "IRG", "tabora": "TBR", "singida": "SNG", "kigoma": "KGM",
  "ruvuma": "RVM", "mtwara": "MTW", "lindi": "LND", "pwani": "PWN",
  "kagera": "KGR", "mara": "MRA", "shinyanga": "SHY", "geita": "GET",
  "simiyu": "SMY", "njombe": "NJB", "rukwa": "RKW", "katavi": "KTV",
  "songwe": "SGW", "manyara": "MNY", "zanzibar": "ZNZ"
};
const agentNetworkCodes: Record<string, string> = {
  "Airtel": "AIR", "Vodacom": "VOD", "Yas": "YAS", "Halotel": "HAL",
  "Mbeya One Company Limited": "MBC", "Huduma za Mtandaoni": "HMT"
};
const agentRoleCodes: Record<string, string> = {
  "Freelancer": "FR", "Team Leader": "TL", "Supervisor": "SV", "Authorized Agent": "AA"
};
const agentCode = (value: string) => {
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  return agentRegionCodes[normalized] ?? normalized.replace(/[^a-z]/g, "").slice(0, 3).toUpperCase().padEnd(3, "X");
};

export async function createAgentRecord(input: Omit<AgentRecord, "id" | "agentId" | "createdAt" | "updatedAt" | "regionCode" | "status">) {
  const user = firebaseAuth.currentUser;
  if (!user || user.uid !== input.userId) throw Object.assign(new Error("Ingia tena kabla ya kuhifadhi taarifa za wakala."), { code: "unauthenticated" });
  const regionCode = agentCode(input.region);
  const networkCode = agentNetworkCodes[input.network] ?? "OTH";
  const typeCode = agentRoleCodes[input.type] ?? "AG";
  const groupKey = `${regionCode}-${networkCode}-${typeCode}`;
  const counterRef = doc(firestore, "agentIdCounters", groupKey);
  const recordRef = doc(collection(firestore, "agentRecords"));
  const created = await runTransaction(firestore, async (transaction) => {
    const counter = await transaction.get(counterRef);
    const next = Number(counter.data()?.lastSerial ?? 0) + 1;
    const agentId = `T-${regionCode}-${networkCode}-${typeCode}-${String(next).padStart(3, "0")}`;
    const now = serverTimestamp();
    transaction.set(counterRef, { lastSerial: next, regionCode, networkCode, typeCode, updatedAt: now });
    transaction.set(recordRef, {
      ...input, agentId, regionCode, networkCode, typeCode, status: "created",
      createdAt: now, updatedAt: now, lastUpdatedBy: user.uid,
      history: [{ action: "created", by: user.uid, at: new Date().toISOString(), details: "Taarifa za wakala zimesajiliwa." }]
    });
    return { id: recordRef.id, agentId };
  });
  return created;
}

export async function adminListAgentRecords() {
  const rows = await getCollectionOnce("agentRecords");
  return rows.map((item) => ({ ...item, createdAt: timestampValue(item.createdAt), updatedAt: timestampValue(item.updatedAt) } as AgentRecord)).sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
}

export async function adminListUsers() {
  const users = await invokeWorker<Array<AdminUserRecord & { id: string; createdAt?: unknown; lastLoginAt?: unknown }>>("listAdminUsers", {});
  return users.map((user) => ({
    ...user,
    createdAt: timestampValue(user.createdAt),
    lastLoginAt: timestampValue(user.lastLoginAt),
  })).sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
}

export async function adminListServices() {
  return getCollectionOnce("services");
}

/** Read the live token price configured by Admin for a service. */
export async function getServiceTokenConfig(slug: string): Promise<{ name: string; tokenCost: number; isFree: boolean }> {
  const snapshot = await getDocs(query(collection(firestore, "services"), where("slug", "==", slug), limit(1)));
  const row = snapshot.docs[0]?.data();
  if (!row) throw new Error("Bei ya huduma haijapatikana kwenye Dashboard ya Admin. Wasiliana na admin.");
  const tokenCost = Number(row.tokenCost);
  if (!Number.isSafeInteger(tokenCost) || tokenCost < 0 || tokenCost > 100000) {
    throw new Error("Gharama ya tokeni haijawekwa sawa kwenye Dashboard ya Admin.");
  }
  return {
    name: String(row.name ?? slug),
    tokenCost,
    isFree: row.isFree === true || tokenCost === 0,
  };
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
  return onSnapshot(query(collection(firestore, "websiteHealthReports"), orderBy("createdAt", "desc"), limit(100)), (snapshot) => {
    const rows = snapshot.docs.map((item) => ({ id: item.id, ...item.data(), createdAt: timestampValue(item.data().createdAt), resolvedAt: timestampValue(item.data().resolvedAt) } as WebsiteHealthReport));
    rows.sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
    callback(rows);
  }, onError);
}

export async function resolveWebsiteHealthReport(id: string, note = "Imekaguliwa na kutatuliwa na admin.") {
  await updateDoc(doc(firestore, "websiteHealthReports", id), { status: "resolved", resolutionNote: note.slice(0, 500), resolvedAt: serverTimestamp(), updatedAt: serverTimestamp() });
}

export async function adminListTransactions() {
  const rows = await getCollectionOnce("tokenTransactions");
  return rows.map((item) => ({ ...item, createdAt: timestampValue(item.createdAt) })).sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
}

export async function adminListCollection(name: "announcements" | "auditLogs" | "advertisements" | "tutorialVideos" | "licenseTemplates" | "adminActions" | "siteSettings" | "messages" | "systemSettings" | "serviceLocks" | "lipaServices" | "tokenPurchaseOrders") {
  const rows = await getCollectionOnce(name);
  return rows.map((item) => ({ ...item, createdAt: timestampValue(item.createdAt) }));
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

export async function adminDeleteUserAccount(userId: string) {
  const callable = createWorkerCall<{ userId: string }, { ok: boolean; userId: string }>("adminDeleteUserAccount");
  return (await callable({ userId })).data;
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
  const result = (await callable({ collection: collectionName, id, values })).data;
  if (collectionName === "messages") invalidateUserMessagesCache();
  return result;
}

export async function adminDeleteCollectionItem(adminId: string, collectionName: string, id: string) {
  const callable = createWorkerCall("adminDelete");
  const result = (await callable({ collection: collectionName, id })).data;
  if (collectionName === "messages") invalidateUserMessagesCache();
  return result;
}

export async function adminSaveSiteSettings(adminId: string, values: Record<string, unknown>) {
  const callable = createWorkerCall("adminWrite");
  const result = (await callable({ collection: "siteSettings", id: "public", values })).data;
  publicSiteSettingsRevision += 1;
  publicSiteSettingsCache = undefined;
  publicSiteSettingsRequest = undefined;
  publicLicenseTemplateCache = undefined;
  return result;
}

export async function setHomepageServiceOrder(serviceOrder: string[], homepageSectionOrder: string[]) {
  const callable = createWorkerCall<{ serviceOrder: string[]; homepageSectionOrder: string[] }, { savedServices: number; savedSections: number }>("setHomepageServiceOrder");
  return (await callable({ serviceOrder, homepageSectionOrder })).data;
}

export async function getPublicSiteSettings() {
  return getPublicSiteSettingsOnce();
}
let publicSiteSettingsCache: { loadedAt: number; value: DocumentData | null } | undefined;
let publicSiteSettingsRequest: Promise<DocumentData | null> | undefined;
let publicSiteSettingsRevision = 0;
export async function getPublicSiteSettingsOnce(options?: { force?: boolean }): Promise<DocumentData | null> {
  const force = options?.force === true;
  if (force) publicSiteSettingsRevision += 1;
  if (!force && publicSiteSettingsCache && Date.now() - publicSiteSettingsCache.loadedAt < 45_000) return publicSiteSettingsCache.value;
  if (!force && publicSiteSettingsRequest) return publicSiteSettingsRequest;
  const revision = publicSiteSettingsRevision;
  const request: Promise<DocumentData | null> = getDoc(doc(firestore, "siteSettings", "public")).then((snapshot): Promise<DocumentData | null> | DocumentData | null => {
    const value = snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as DocumentData) : null;
    if (revision !== publicSiteSettingsRevision) return getPublicSiteSettingsOnce();
    publicSiteSettingsCache = { loadedAt: Date.now(), value };
    return value;
  }).finally(() => { if (publicSiteSettingsRequest === request) publicSiteSettingsRequest = undefined; });
  publicSiteSettingsRequest = request;
  return request;
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
  return getPublicSiteSettingsOnce();
}

export async function reserveBusinessLicenseNumber(reservationId: string, licenseType: "NEW LICENCE" | "RENEWED LICENCE" = "NEW LICENCE") {
  const callable = createWorkerCall<{ reservationId: string; licenseType: "NEW LICENCE" | "RENEWED LICENCE" }, { reservationId: string; licenseNumber: string }>("reserveBusinessLicenseNumber");
  return (await callable({ reservationId, licenseType })).data;
}

export async function getCollectionOnce(name: string): Promise<DocumentData[]> {
  const pageSize = collectionReadLimits[name] ?? 100;
  const documents = await readAllDocuments((cursor) => query(collection(firestore, name), limit(pageSize), ...(cursor ? [startAfter(cursor)] : [])), pageSize);
  return documents.map((item) => ({ id: item.id, ...item.data() } as DocumentData));
}

export function subscribeToCollection(name: string, callback: (rows: DocumentData[]) => void, onError?: (error: unknown) => void) {
  const existing = collectionListenerCache.get(name);
  if (existing) {
    existing.callbacks.add(callback);
    return () => { existing.callbacks.delete(callback); if (existing.callbacks.size === 0) { existing.unsubscribe(); collectionListenerCache.delete(name); } };
  }
  const source = collection(firestore, name);
  const bounded = collectionReadLimits[name] ? query(source, limit(collectionReadLimits[name])) : source;
  const callbacks = new Set<(rows: DocumentData[]) => void>([callback]);
  const unsubscribe = onSnapshot(bounded, (snapshot) => {
    const rows = snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as DocumentData));
    callbacks.forEach((listener) => listener(rows));
  }, onError);
  collectionListenerCache.set(name, { callbacks, unsubscribe });
  return () => { callbacks.delete(callback); if (callbacks.size === 0) { unsubscribe(); collectionListenerCache.delete(name); } };
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
  verifiedTransactionAmount?: number;
  qualificationMonth?: string;
  verifiedTransactionSource?: "VODACOM" | "OTHER" | "";
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
  verifiedTransactionAmount: number;
  qualificationMonth: string;
  verifiedTransactionSource: "VODACOM" | "OTHER" | "";
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
  } as LipaApplication)).sort((a, b) => String(b.submittedAt ?? "").localeCompare(String(a.submittedAt ?? "")));
}

export function subscribeUserLipaApplications(uid: string, callback: (rows: LipaApplication[]) => void, onError?: (error: unknown) => void) {
  let active = true;
  void readAllDocuments((cursor) => query(collection(firestore, "lipaApplications"), where("userId", "==", uid), limit(100), ...(cursor ? [startAfter(cursor)] : []))).then((documents) => {
    if (!active) return;
    callback(documents.map((item) => ({ id: item.id, ...item.data(), submittedAt: timestampValue(item.data().submittedAt), updatedAt: timestampValue(item.data().updatedAt) } as LipaApplication)).sort((a, b) => String(b.submittedAt ?? "").localeCompare(String(a.submittedAt ?? ""))));
  }).catch((error) => { if (active) onError?.(error); });
  return () => { active = false; };
}

export async function createPocketWifiOrder(applicationId: string, details: string, phone: string) {
  const callable = createWorkerCall<{ applicationId: string; details: string; phone: string }, { applicationId: string; status: string; duplicate: boolean }>("createPocketWifiOrder");
  return (await callable({ applicationId, details, phone })).data;
}

export async function createServiceApplication(applicationId: string, serviceSlug: string, values: ServiceFormValues) {
  const callable = createWorkerCall("createServiceApplication");
  return (await callable({ applicationId, serviceSlug, values })).data as { applicationId: string; status: string; duplicate: boolean; balanceAfter: number | null; reference: string };
}

export async function updateServiceApplication(applicationId: string, values: ServiceFormValues) {
  const callable = createWorkerCall("updateServiceApplication");
  return (await callable({ applicationId, values })).data as { applicationId: string; status: string; updated: boolean };
}

export async function setServiceApplicationStatus(applicationId: string, status: string, rejectionReason = "", allowResubmission = false) {
  const callable = createWorkerCall("setServiceApplicationStatus");
  return (await callable({ applicationId, status, rejectionReason, allowResubmission })).data;
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
  } as ServiceApplication)).sort((a, b) => String(b.submittedAt ?? "").localeCompare(String(a.submittedAt ?? "")));
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
  let active = true;
  void readAllDocuments((cursor) => query(collection(firestore, "serviceApplications"), where("userId", "==", uid), limit(100), ...(cursor ? [startAfter(cursor)] : []))).then((documents) => {
    if (!active) return;
    callback(documents.map((item) => ({ id: item.id, ...item.data(), submittedAt: timestampValue(item.data().submittedAt), updatedAt: timestampValue(item.data().updatedAt) } as ServiceApplication)).sort((a, b) => String(b.submittedAt ?? "").localeCompare(String(a.submittedAt ?? ""))));
  }).catch((error) => { if (active) onError?.(error); });
  return () => { active = false; };
}

export async function markUserMessageRead(messageId: string, uid: string) {
  if (!messageId || !uid || uid !== firebaseAuth.currentUser?.uid) throw new Error("Akaunti haijathibitishwa.");
  const callable = createWorkerCall<{ messageId: string }, { ok: boolean }>("markUserMessageRead");
  const result = (await callable({ messageId })).data;
  invalidateUserMessagesCache(uid);
  return result;
}

const userMessagesCache = new Map<string, { loadedAt: number; rows: Array<Record<string, unknown> & { id: string }> }>();
const userMessagesPending = new Map<string, Promise<Array<Record<string, unknown> & { id: string }>>>();
const userMessagesRevision = new Map<string, number>();
function invalidateUserMessagesCache(uid?: string) {
  const keys = uid ? [uid] : [...new Set([...userMessagesCache.keys(), ...userMessagesPending.keys()])];
  for (const key of keys) {
    userMessagesRevision.set(key, (userMessagesRevision.get(key) ?? 0) + 1);
    userMessagesCache.delete(key);
    userMessagesPending.delete(key);
  }
}
async function getUserMessagesOnce(uid: string) {
  const cached = userMessagesCache.get(uid);
  if (cached && Date.now() - cached.loadedAt < 30_000) return cached.rows;
  const pending = userMessagesPending.get(uid);
  if (pending) return pending;
  const revision = userMessagesRevision.get(uid) ?? 0;
  const request = readAllDocuments((cursor) => query(collection(firestore, "messages"), or(where("recipientId", "==", uid), where("broadcast", "==", true)), limit(100), ...(cursor ? [startAfter(cursor)] : []))).then((documents) => {
    const rows = documents.map((item) => ({ id: item.id, ...item.data(), createdAt: timestampValue(item.data().createdAt) })).sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
    if (revision === (userMessagesRevision.get(uid) ?? 0)) userMessagesCache.set(uid, { loadedAt: Date.now(), rows });
    return rows;
  }).finally(() => { if (userMessagesPending.get(uid) === request) userMessagesPending.delete(uid); });
  userMessagesPending.set(uid, request);
  return request;
}

export function subscribeUserMessages(uid: string, callback: (rows: Array<Record<string, unknown> & { id: string }>) => void, onError?: (error: unknown) => void) {
  let active = true;
  void getUserMessagesOnce(uid).then((rows) => { if (active) callback(rows); }).catch((error) => { if (active) onError?.(error); });
  return () => { active = false; };
}
