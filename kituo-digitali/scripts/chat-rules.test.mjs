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

test("blocked accounts can read their own restriction notice but cannot access portal data or write", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "users", "blocked-user"), {
      uid: "blocked-user", phone: "255712345678", accessMode: "denied", accountStatus: "blocked", restrictionReason: "Taarifa zinahitaji uhakiki.", allowedActions: [],
    });
  });
  const db = member("blocked-user").firestore();
  const profile = await assertSucceeds(getDoc(doc(db, "users", "blocked-user")));
  assert.equal(profile.data().restrictionReason, "Taarifa zinahitaji uhakiki.");
  await assertFails(getDocs(collection(db, "publicChatMessages")));
  await assertFails(setDoc(doc(db, "publicChatMessages", "blocked-message"), message("blocked-user", "Siwezi kutuma")));
  await assertFails(updateDoc(doc(db, "users", "blocked-user"), { bio: "attempt", updatedAt: serverTimestamp() }));
  await assertFails(uploadBytes(ref(member("blocked-user").storage(), "publicChatFiles/blocked-user/blocked.txt"), new Uint8Array([1]), { contentType: "text/plain" }));
});

test("broadcast notifications reach all readable accounts while personal messages stay private", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "messages", "all-users-notice"), {
      subject: "Taarifa kwa wote", body: "Ujumbe wa jumla", broadcast: true, recipientId: "", type: "adminMessage",
    });
    await setDoc(doc(db, "messages", "alice-only-notice"), {
      subject: "Taarifa binafsi", body: "Ujumbe wa Alice", recipientId: "alice", type: "adminMessage",
    });
  });
  const aliceDb = member("alice").firestore();
  const bobDb = member("bob").firestore();
  const aliceBroadcasts = await assertSucceeds(getDocs(query(collection(aliceDb, "messages"), where("broadcast", "==", true))));
  const bobBroadcasts = await assertSucceeds(getDocs(query(collection(bobDb, "messages"), where("broadcast", "==", true))));
  assert.equal(aliceBroadcasts.size, 1);
  assert.equal(bobBroadcasts.size, 1);
  assert.equal(aliceBroadcasts.docs[0].data().subject, "Taarifa kwa wote");
  const alicePrivate = await assertSucceeds(getDocs(query(collection(aliceDb, "messages"), where("recipientId", "==", "alice"))));
  assert.equal(alicePrivate.size, 1);
  await assertFails(getDoc(doc(bobDb, "messages", "alice-only-notice")));
  await assertFails(getDocs(collection(bobDb, "messages")));
});

test("read-only accounts can read but cannot edit profiles, post chat, or submit service requests", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "users", "readonly-user"), {
      uid: "readonly-user", phone: "255712345678", accessMode: "read_only", accountStatus: "active", allowedActions: [],
    });
    await setDoc(doc(context.firestore(), "publicChatMessages", "existing-message"), message("alice", "Read only sees this"));
  });
  const db = member("readonly-user").firestore();
  await assertSucceeds(getDoc(doc(db, "publicChatMessages", "existing-message")));
  await assertFails(setDoc(doc(db, "publicChatMessages", "readonly-message"), message("readonly-user", "No write")));
  await assertFails(updateDoc(doc(db, "users", "readonly-user"), { bio: "attempt", updatedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(db, "serviceRequests", "readonly-request"), { userId: "readonly-user", serviceSlug: "help-request", createdAt: serverTimestamp() }));
  await assertFails(uploadBytes(ref(member("readonly-user").storage(), "users/readonly-user/profile/avatar.png"), new Uint8Array([1]), { contentType: "image/png" }));
});

test("limited accounts may use only explicitly selected action categories", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "users", "limited-user"), {
      uid: "limited-user", phone: "255712345678", accessMode: "limited", accountStatus: "active", allowedActions: ["chat"],
    });
  });
  const db = member("limited-user").firestore();
  await assertSucceeds(setDoc(doc(db, "publicChatMessages", "limited-message"), message("limited-user", "Chat imeruhusiwa")));
  await assertFails(updateDoc(doc(db, "users", "limited-user"), { bio: "attempt", updatedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(db, "serviceRequests", "limited-request"), { userId: "limited-user", serviceSlug: "help-request", createdAt: serverTimestamp() }));
  await assertSucceeds(uploadBytes(ref(member("limited-user").storage(), "publicChatFiles/limited-user/chat.txt"), new Uint8Array([1]), { contentType: "text/plain" }));
  await assertFails(uploadBytes(ref(member("limited-user").storage(), "users/limited-user/profile/avatar.png"), new Uint8Array([1]), { contentType: "image/png" }));
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
