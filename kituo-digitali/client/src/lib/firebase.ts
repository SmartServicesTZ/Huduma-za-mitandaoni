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
  collection,
  doc,
  getDoc,
  getFirestore,
  increment,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
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

export function subscribeToTokenHistory(uid: string, callback: (rows: DocumentData[]) => void) {
  const tokenQuery = query(collection(firestore, "tokenTransactions"), where("userId", "==", uid));
  return onSnapshot(tokenQuery, (snapshot) => callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as DocumentData) as DocumentData).sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")))));
}
