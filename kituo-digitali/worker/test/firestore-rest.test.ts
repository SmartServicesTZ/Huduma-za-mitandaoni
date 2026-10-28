import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { FirestoreRest } from "../src/firestore-rest.js";
import { withWorkerEnv, type WorkerEnv } from "../src/runtime.js";

function environment(): WorkerEnv {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    FIREBASE_PROJECT_ID: "pagination-test",
    FIREBASE_STORAGE_BUCKET: "pagination-test.appspot.com",
    FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: "worker-test@pagination-test.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString() }),
  };
}
function json(body: unknown) { return new Response(JSON.stringify(body), { status: 200 }); }
function doc(id: string) { return { document: { name: `projects/pagination-test/databases/(default)/documents/items/${id}`, fields: { value: { stringValue: id } } } }; }

test("Firestore REST query cursor pages records exactly once in stable document-ID order", async () => {
  const originalFetch = globalThis.fetch;
  const queryBodies: Array<Record<string, any>> = [];
  let requests = 0;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.includes("oauth2.googleapis.com/token")) return json({ access_token: "test-access", expires_in: 3600 });
    assert.match(url, /:runQuery$/);
    const body = JSON.parse(String(init.body)) as Record<string, any>;
    queryBodies.push(body);
    requests += 1;
    return json(requests === 1 ? [doc("a"), doc("b")] : [doc("c")]);
  };
  try {
    await withWorkerEnv(environment(), async () => {
      const db = new FirestoreRest();
      const first = await db.collection("items").orderByDocumentId().limit(2).get();
      const last = await db.collection("items").orderByDocumentId().startAfterDocumentId(first.docs.at(-1)!.id).limit(2).get();
      assert.deepEqual([...first.docs, ...last.docs].map((item) => item.id), ["a", "b", "c"]);
    });
    assert.equal(queryBodies[0].structuredQuery.orderBy[0].field.fieldPath, "__name__");
    assert.equal(queryBodies[0].structuredQuery.limit, 2);
    assert.equal(queryBodies[1].structuredQuery.startAt.before, false);
    assert.match(queryBodies[1].structuredQuery.startAt.values[0].referenceValue, /\/items\/b$/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Firestore cursor rejects invalid document IDs", () => {
  const db = new FirestoreRest();
  assert.throws(() => db.collection("items").startAfterDocumentId("bad/id"), /Invalid Firestore cursor/);
});
