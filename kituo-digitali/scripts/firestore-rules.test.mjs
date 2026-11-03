import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

const projectId = "demo-firestore-rules";
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: await readFile(new URL("../../firestore.rules", import.meta.url), "utf8"),
    },
  });
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "users/alice"), {
      uid: "alice", phone: "255712345678", role: "user",
      tokenBalance: 0, verificationStatus: "pending",
    });
    await setDoc(doc(db, "users/bob"), {
      uid: "bob", phone: "255712345679", role: "user",
      tokenBalance: 0, verificationStatus: "pending",
    });
    await setDoc(doc(db, "services/public-service"), { slug: "public-service", name: "Public" });
  });
});

after(async () => { await env?.cleanup(); });

test("a signed-in user can read their own profile but not another user's profile", async () => {
  const db = env.authenticatedContext("alice").firestore();
  await assertSucceeds(getDoc(doc(db, "users/alice")));
  await assertFails(getDoc(doc(db, "users/bob")));
});

test("a user cannot grant themselves admin rights or change token balances", async () => {
  const db = env.authenticatedContext("alice").firestore();
  await assertFails(updateDoc(doc(db, "users/alice"), { role: "super_admin" }));
  await assertFails(updateDoc(doc(db, "users/alice"), { permissions: { manageUsers: true } }));
  await assertFails(updateDoc(doc(db, "users/alice"), { tokenBalance: 999999 }));
});

test("public service catalogue is readable but remains client read-only", async () => {
  const anonymousDb = env.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(anonymousDb, "services/public-service")));
  await assertFails(setDoc(doc(anonymousDb, "services/forbidden"), { name: "Injected" }));
});


test("user document archive metadata is Worker-only; browser clients cannot read or write it directly", async () => {
  const aliceDb = env.authenticatedContext("alice").firestore();
  const bobDb = env.authenticatedContext("bob").firestore();
  const record = {
    ownerUid: "alice",
    documentId: "doc-alice-1234567890",
    name: "kitambulisho-mbele.png",
    type: "PNG",
    mimeType: "image/png",
    storagePath: "userDocuments/alice/doc-alice-1234567890/kitambulisho-mbele.png",
    size: 2048,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    source: "kitambulisho-wakala",
  };

  // HATI ZANGU is stored through the authenticated Worker using the Admin SDK.
  // Direct browser access must remain denied for every user, including the owner.
  await assertFails(setDoc(doc(aliceDb, "userDocuments", "alice_doc-alice-1234567890"), record));
  await assertFails(getDoc(doc(aliceDb, "userDocuments", "alice_doc-alice-1234567890")));
  await assertFails(getDoc(doc(bobDb, "userDocuments", "alice_doc-alice-1234567890")));
});
