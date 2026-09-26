import { initializeApp } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
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
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
} from "firebase/firestore";

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
export const firebaseFunctions = getFunctions(app, import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION ?? "us-central1");
const appCheckSiteKey = String(import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY ?? "").trim();
export const firebaseAppCheck = appCheckSiteKey ? initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey), isTokenAutoRefreshEnabled: true }) : null;
export { onAuthStateChanged, signInWithEmailAndPassword, signOut, updatePassword };
export type AdminPermissions = {
  viewUsers?: boolean;
  manageUsers?: boolean;
  manageTokens?: boolean;
  manageServices?: boolean;
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
  await setDoc(ref, {
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
    password: deleteField(),
    language: extra.language ?? current.language ?? "sw",
    profileImageUrl: extra.profileImageUrl ?? current.profileImageUrl,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  return ref;
}

export async function registerFirebaseUser(input: { email: string; password: string; firstName: string; lastName: string; phone: string }) {
  const credential = await createUserWithEmailAndPassword(firebaseAuth, input.email.trim(), input.password);
  await ensureUserProfile(credential.user, input);
  return credential.user;
}

export function subscribeToProfile(uid: string, callback: (profile: FirebaseProfile | null) => void) {
  return onSnapshot(doc(firestore, "users", uid), (snapshot) => callback(snapshot.exists() ? sanitizeProfileData(snapshot.data()) : null));
}

export async function saveFirebaseProfile(uid: string, values: Partial<FirebaseProfile>) {
  await setDoc(doc(firestore, "users", uid), { ...values, updatedAt: serverTimestamp() }, { merge: true });
}

export async function consumeFirebaseTokens(uid: string, service: { slug: string; name: string; tokenCost: number; kind: string }, requestId?: string) {
  if (service.kind === "free" || service.tokenCost <= 0) return { balanceAfter: null, reference: requestId ?? `free-${Date.now()}`, duplicate: false };
  const transactionId = requestId?.trim() || crypto.randomUUID();
  const callable = httpsCallable<{ serviceId: string; serviceName: string; tokenCost: number; requestId: string }, { balanceAfter: number; reference: string; duplicate: boolean }>(firebaseFunctions, "consumeTokens");
  return (await callable({ serviceId: service.slug, serviceName: service.name, tokenCost: service.tokenCost, requestId: transactionId })).data;
}

export type BusinessLicensePayload = {
  requestId: string;
  firstName: string; middleName: string; lastName: string;
  businessType: string; otherBusinessType?: string;
  licenseType: "NEW LICENCE" | "RENEWED LICENCE"; principalBranch: "PRINCIPAL" | "BRANCH";
  region: string; district: string; ward: string; street: string; tin: string; licenseFee: number;
};

export async function generateBusinessLicense(payload: BusinessLicensePayload) {
  const callable = httpsCallable<BusinessLicensePayload, { status: string; applicationId: string; licenseNumber: string; downloadUrl: string; reference: string; duplicate: boolean }>(firebaseFunctions, "generateBusinessLicense");
  return (await callable(payload)).data;
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

export async function adminListCollection(name: "announcements" | "auditLogs" | "advertisements" | "tutorialVideos" | "licenseTemplates" | "adminActions" | "siteSettings" | "messages" | "systemSettings") {
  const snapshot = await getDocs(collection(firestore, name));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data(), createdAt: timestampValue(item.data().createdAt) }));
}

export async function adminAdjustTokens(adminId: string, userId: string, amount: number, description: string) {
  const callable = httpsCallable<{ userId: string; amount: number; description: string }, { balanceAfter: number; reference: string }>(firebaseFunctions, "adjustTokens");
  return (await callable({ userId, amount, description })).data;
}

export async function adminUpdateUser(adminId: string, userId: string, values: Partial<AdminUserRecord>) {
  if (values.role !== undefined || values.permissions !== undefined) {
    const callable = httpsCallable(firebaseFunctions, "updateUserAccess");
    await callable({ userId, role: values.role, permissions: values.permissions });
  } else if (values.accountStatus !== undefined) {
    const callable = httpsCallable(firebaseFunctions, "setAccountStatus");
    await callable({ userId, status: values.accountStatus });
  } else if (values.verificationStatus !== undefined) {
    const callable = httpsCallable(firebaseFunctions, "verifyUser");
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
  const callable = httpsCallable(firebaseFunctions, "adminWrite");
  return (await callable({ collection: "services", id, values })).data;
}

export async function adminDeleteService(adminId: string, id: string) {
  const callable = httpsCallable(firebaseFunctions, "adminDelete");
  return (await callable({ collection: "services", id })).data;
}

export async function adminSaveAnnouncement(adminId: string, values: Record<string, unknown>, id?: string) {
  const callable = httpsCallable(firebaseFunctions, "adminWrite");
  return (await callable({ collection: "announcements", id, values })).data;
}

export async function adminDeleteAnnouncement(adminId: string, id: string) {
  const callable = httpsCallable(firebaseFunctions, "adminDelete");
  return (await callable({ collection: "announcements", id })).data;
}


export async function adminSaveCollectionItem(adminId: string, collectionName: string, values: Record<string, unknown>, id?: string) {
  const callable = httpsCallable(firebaseFunctions, "adminWrite");
  return (await callable({ collection: collectionName, id, values })).data;
}

export async function adminDeleteCollectionItem(adminId: string, collectionName: string, id: string) {
  const callable = httpsCallable(firebaseFunctions, "adminDelete");
  return (await callable({ collection: collectionName, id })).data;
}

export async function adminSaveSiteSettings(adminId: string, values: Record<string, unknown>) {
  const callable = httpsCallable(firebaseFunctions, "adminWrite");
  return (await callable({ collection: "siteSettings", id: "public", values })).data;
}

export async function adminGetSiteSettings() {
  const snapshot = await getDoc(doc(firestore, "siteSettings", "public"));
  return snapshot.exists() ? snapshot.data() : null;
}

export async function reserveBusinessLicenseNumber(reservationId: string) {
  const callable = httpsCallable<{ reservationId: string }, { reservationId: string; licenseNumber: string }>(firebaseFunctions, "reserveBusinessLicenseNumber");
  return (await callable({ reservationId })).data;
}

export function subscribeToCollection(name: string, callback: (rows: DocumentData[]) => void, onError?: (error: unknown) => void) {
  return onSnapshot(collection(firestore, name), (snapshot) => {
    callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
  }, onError);
}
