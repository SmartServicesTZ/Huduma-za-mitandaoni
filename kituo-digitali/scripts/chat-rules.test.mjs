import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, beforeEach, test } from "node:test";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc, updateDoc, where,
} from "firebase/firestore";
import { deleteObject, getBytes, ref, uploadBytes } from "firebase/storage";

const projectId = "demo-chat-rules";
let env;
const member = (uid) => env.authenticatedContext(uid, { email: `${uid}@example.test` });
const phoneMember = (uid, phone) => env.authenticatedContext(uid, { email: `${phone}@login.huduma-za-mtandao.local` });
const moderator = () => env.authenticatedContext("moderator", {
  role: "admin",
  permissions: { manageMessages: true },
});

before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: await readFile(new URL("../../firestore.rules", import.meta.url), "utf8"),
    },
    storage: {
      rules: await readFile(new URL("../../storage.rules", import.meta.url), "utf8"),
    },
  });
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
});
after(async () => { await env?.cleanup(); });

async function createConversation() {
  const db = member("alice").firestore();
  await assertSucceeds(setDoc(doc(db, "conversations", "alice__bob"), {
    participants: ["alice", "bob"],
    names: { alice: "Alice", bob: "Bob" },
    phones: { alice: "255712345678", bob: "255698765432" },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastMessage: "",
  }));
}

function message(senderId, text) {
  return {
    senderId,
    senderName: senderId === "alice" ? "Alice" : "Bob",
    text,
    deliveredTo: [senderId],
    readBy: [senderId],
    createdAt: serverTimestamp(),
  };
}

test("public chat supports sender edits and restricts deletion to author or moderator", async () => {
  const aliceDb = member("alice").firestore();
  const bobDb = member("bob").firestore();
  const moderatorDb = moderator().firestore();
  const messageRef = doc(aliceDb, "publicChatMessages", "public-1");
  await assertSucceeds(setDoc(messageRef, message("alice", "Habari")));
  await assertSucceeds(updateDoc(messageRef, { text: "Habari, nimehariri", editedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(bobDb, "publicChatMessages", "public-1"), { text: "Nimebadili ujumbe wa mwingine", editedAt: serverTimestamp() }));
  await assertFails(deleteDoc(doc(bobDb, "publicChatMessages", "public-1")));
  await assertSucceeds(deleteDoc(doc(moderatorDb, "publicChatMessages", "public-1")));
});

test("phone registry is private and a reserved phone can create only its owner's profile", async () => {
  const phone = "255698232313";
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "phoneRegistry", phone), { uid: "alice", phone });
  });
  const profile = {
    uid: "alice", firstName: "Alice", lastName: "Test", phone, name: "Alice Test", username: "alice",
    tokenBalance: 0, verificationStatus: "pending", role: "user", permissions: {},
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  };
  const aliceDb = phoneMember("alice", phone).firestore();
  const bobDb = phoneMember("bob", phone).firestore();
  await assertSucceeds(setDoc(doc(aliceDb, "users", "alice"), profile));
  await assertFails(setDoc(doc(bobDb, "users", "bob"), { ...profile, uid: "bob", name: "Bob Test", username: "bob" }));
  await assertFails(getDoc(doc(aliceDb, "phoneRegistry", phone)));
  await assertFails(setDoc(doc(bobDb, "phoneRegistry", "255712345678"), { uid: "bob", phone: "255712345678" }));
});

test("Lipa applications are private to the applicant and the authorized admin inbox", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "lipaApplications", "lipa-alice"), { applicationId: "lipa-alice", userId: "alice", status: "PENDING", submittedAt: "2026-10-01" });
    await setDoc(doc(db, "lipaApplications", "lipa-bob"), { applicationId: "lipa-bob", userId: "bob", status: "PENDING", submittedAt: "2026-10-02" });
  });
  const aliceDb = member("alice").firestore();
  const adminDb = env.authenticatedContext("lipa-admin", { role: "admin", permissions: { manageLipaApplications: true } }).firestore();
  await assertSucceeds(getDoc(doc(aliceDb, "lipaApplications", "lipa-alice")));
  await assertFails(getDoc(doc(aliceDb, "lipaApplications", "lipa-bob")));
  const ownRows = await assertSucceeds(getDocs(query(collection(aliceDb, "lipaApplications"), where("userId", "==", "alice"))));
  assert.equal(ownRows.size, 1);
  await assertFails(getDocs(collection(aliceDb, "lipaApplications")));
  const adminRows = await assertSucceeds(getDocs(query(collection(adminDb, "lipaApplications"), orderBy("submittedAt", "desc"))));
  assert.equal(adminRows.size, 2);
});

test("a user can check only their own deterministic conversation before it is created", async () => {
  const aliceDb = member("alice").firestore();
  const charlieDb = member("charlie").firestore();
  await assertSucceeds(getDoc(doc(aliceDb, "conversations", "alice__bob")));
  await assertFails(getDoc(doc(charlieDb, "conversations", "alice__bob")));
});

test("private conversations list for participants only; moderators can review and delete messages", async () => {
  await createConversation();
  const aliceDb = member("alice").firestore();
  const bobDb = member("bob").firestore();
  const charlieDb = member("charlie").firestore();
  const moderatorDb = moderator().firestore();
  const aliceMessage = doc(aliceDb, "conversations", "alice__bob", "messages", "private-1");
  await assertSucceeds(setDoc(aliceMessage, message("alice", "Siri yetu")));

  const participantRows = await assertSucceeds(getDocs(query(collection(bobDb, "conversations"), where("participants", "array-contains", "bob"))));
  assert.equal(participantRows.size, 1);
  await assertFails(getDoc(doc(charlieDb, "conversations", "alice__bob")));
  await assertFails(getDoc(doc(charlieDb, "conversations", "alice__bob", "messages", "private-1")));
  await assertSucceeds(getDocs(collection(moderatorDb, "conversations")));
  await assertSucceeds(getDoc(doc(moderatorDb, "conversations", "alice__bob", "messages", "private-1")));
  await assertSucceeds(deleteDoc(doc(moderatorDb, "conversations", "alice__bob", "messages", "private-1")));
});

test("private files stay participant-only, with designated message moderators able to inspect and remove them", async () => {
  await createConversation();
  const bytes = new Uint8Array([1, 2, 3]);
  const path = "chatFiles/alice__bob/alice/note.png";
  await assertSucceeds(uploadBytes(ref(member("alice").storage(), path), bytes, { contentType: "image/png" }));
  await assertSucceeds(getBytes(ref(member("bob").storage(), path)));
  await assertFails(getBytes(ref(member("charlie").storage(), path)));
  await assertSucceeds(getBytes(ref(moderator().storage(), path)));
  await assertSucceeds(deleteObject(ref(moderator().storage(), path)));
});
