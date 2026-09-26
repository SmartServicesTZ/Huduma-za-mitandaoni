import { initializeApp } from "firebase/app";
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
export { onAuthStateChanged, signInWithEmailAndPassword, signOut, updatePassword };
export type AdminPermissions = {
  manageUsers?: boolean;
  manageTokens?: boolean;
  manageServices?: boolean;
  manageContent?: boolean;
  manageMessages?: boolean;
  manageSecurity?: boolean;
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
  role: "user" | "admin" | "super_admin";
  permissions?: AdminPermissions;
  profileImageUrl?: string;
  language?: "sw" | "en";
  createdAt?: unknown;
};

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
    ...extra,
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
  return onSnapshot(doc(firestore, "users", uid), (snapshot) => callback(snapshot.exists() ? snapshot.data() as FirebaseProfile : null));
}

export async function saveFirebaseProfile(uid: string, values: Partial<FirebaseProfile>) {
  await setDoc(doc(firestore, "users", uid), { ...values, updatedAt: serverTimestamp() }, { merge: true });
}

export async function consumeFirebaseTokens(uid: string, service: { slug: string; name: string; tokenCost: number; kind: string }) {
  if (service.kind === "free" || service.tokenCost <= 0) return { balanceAfter: null, reference: `free-${Date.now()}` };
  const userRef = doc(firestore, "users", uid);
  const ledgerRef = doc(collection(firestore, "tokenTransactions"));
  return runTransaction(firestore, async (transaction) => {
    const snapshot = await transaction.get(userRef);
    const before = Number(snapshot.data()?.tokenBalance ?? 0);
    if (before < service.tokenCost) throw new Error("Huna tokeni za kutosha kwa huduma hii.");
    const after = before - service.tokenCost;
    transaction.update(userRef, { tokenBalance: after, updatedAt: serverTimestamp() });
    transaction.set(ledgerRef, { userId: uid, serviceSlug: service.slug, description: service.name, amount: -service.tokenCost, balanceBefore: before, balanceAfter: after, reference: ledgerRef.id, createdAt: serverTimestamp(), status: "completed" });
    return { balanceAfter: after, reference: ledgerRef.id };
  });
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
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data(), createdAt: timestampValue(item.data().createdAt), lastLoginAt: timestampValue(item.data().lastLoginAt) } as AdminUserRecord & { id: string }));
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
  if (!Number.isInteger(amount) || amount === 0) throw new Error("Kiasi cha tokeni si sahihi.");
  const userRef = doc(firestore, "users", userId);
  const ledgerRef = doc(collection(firestore, "tokenTransactions"));
  return runTransaction(firestore, async (transaction) => {
    const snapshot = await transaction.get(userRef);
    if (!snapshot.exists()) throw new Error("Mtumiaji hakupatikana.");
    const current = Number(snapshot.data().tokenBalance ?? 0);
    const next = current + amount;
    if (next < 0) throw new Error("Salio haliwezi kuwa chini ya sifuri.");
    transaction.update(userRef, { tokenBalance: next, updatedAt: serverTimestamp() });
    transaction.set(ledgerRef, { userId, serviceId: "admin-adjustment", serviceName: "Admin token adjustment", type: amount > 0 ? "credit" : "debit", amount, previousBalance: current, newBalance: next, description, reference: ledgerRef.id, adminId, createdAt: serverTimestamp(), status: "completed" });
    transaction.set(doc(collection(firestore, "auditLogs")), { adminId, action: amount > 0 ? "tokens_added" : "tokens_removed", targetUserId: userId, amount, reason: description, createdAt: serverTimestamp() });
    return next;
  });
}

export async function adminUpdateUser(adminId: string, userId: string, values: Partial<AdminUserRecord>) {
  await updateDoc(doc(firestore, "users", userId), { ...values, updatedAt: serverTimestamp() });
  await addDoc(collection(firestore, "auditLogs"), { adminId, targetUserId: userId, action: "user_updated", changes: values, createdAt: serverTimestamp() });
}

export async function adminSaveService(adminId: string, values: Record<string, unknown>, id?: string) {
  const payload = { ...values, updatedAt: serverTimestamp(), updatedBy: adminId };
  if (id) await updateDoc(doc(firestore, "services", id), payload);
  else await addDoc(collection(firestore, "services"), { ...payload, createdAt: serverTimestamp() });
}

export async function adminDeleteService(adminId: string, id: string) {
  await deleteDoc(doc(firestore, "services", id));
  await addDoc(collection(firestore, "auditLogs"), { adminId, action: "service_deleted", targetId: id, createdAt: serverTimestamp() });
}

export async function adminSaveAnnouncement(adminId: string, values: Record<string, unknown>, id?: string) {
  const payload = { ...values, updatedAt: serverTimestamp(), updatedBy: adminId };
  if (id) await updateDoc(doc(firestore, "announcements", id), payload);
  else await addDoc(collection(firestore, "announcements"), { ...payload, createdAt: serverTimestamp() });
}

export async function adminDeleteAnnouncement(adminId: string, id: string) {
  await deleteDoc(doc(firestore, "announcements", id));
  await addDoc(collection(firestore, "auditLogs"), { adminId, action: "announcement_deleted", targetId: id, createdAt: serverTimestamp() });
}


export async function adminSaveCollectionItem(adminId: string, collectionName: string, values: Record<string, unknown>, id?: string) {
  const payload = { ...values, updatedAt: serverTimestamp(), updatedBy: adminId };
  if (id) await updateDoc(doc(firestore, collectionName, id), payload);
  else await addDoc(collection(firestore, collectionName), { ...payload, createdAt: serverTimestamp() });
}

export async function adminDeleteCollectionItem(adminId: string, collectionName: string, id: string) {
  await deleteDoc(doc(firestore, collectionName, id));
  await addDoc(collection(firestore, "auditLogs"), { adminId, action: `${collectionName}_deleted`, targetId: id, createdAt: serverTimestamp() });
}

export async function adminSaveSiteSettings(adminId: string, values: Record<string, unknown>) {
  await setDoc(doc(firestore, "siteSettings", "public"), { ...values, updatedAt: serverTimestamp(), updatedBy: adminId }, { merge: true });
}

export async function adminGetSiteSettings() {
  const snapshot = await getDoc(doc(firestore, "siteSettings", "public"));
  return snapshot.exists() ? snapshot.data() : null;
}

export function subscribeToCollection(name: string, callback: (rows: DocumentData[]) => void, onError?: (error: unknown) => void) {
  return onSnapshot(collection(firestore, name), (snapshot) => {
    callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
  }, onError);
}
