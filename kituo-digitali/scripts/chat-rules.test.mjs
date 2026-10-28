import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { initializeTestEnvironment, assertFails } from "@firebase/rules-unit-testing";
import { collection, doc, getDocs, setDoc } from "firebase/firestore";

const projectId = "demo-chat-rules";
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: await readFile(new URL("../../firestore.rules", import.meta.url), "utf8"),
    },
  });
});
after(async () => { await env?.cleanup(); });

test("retired Chat collections deny all client reads and writes", async () => {
  const db = env.authenticatedContext("alice").firestore();
  const paths = [
    "publicChatMessages",
    "callSessions",
    "conversations",
    "chatGroups",
    "userPresence",
    "chatReports",
    "userBlocks/alice/blocked",
  ];
  for (const path of paths) {
    await assertFails(getDocs(collection(db, path)));
  }
  await assertFails(setDoc(doc(db, "publicChatMessages", "blocked-test"), {
    senderId: "alice",
    text: "This write must be denied",
  }));
  await assertFails(setDoc(doc(db, "conversations", "alice__bob"), {
    participants: ["alice", "bob"],
  }));
});
