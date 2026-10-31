import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { FirestoreTimestamp, getFirestore } from "../src/firestore-rest.js";
import { withWorkerEnv, type WorkerEnv } from "../src/runtime.js";

function environment(): WorkerEnv {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  return {
    FIREBASE_PROJECT_ID: "pagination-test",
    FIREBASE_STORAGE_BUCKET: "pagination-test.appspot.com",
    FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: "pagination-test@example.com", private_key: pem }),
  };
}

test("Firestore adapter serializes chronological order and timestamp-plus-ID cursor", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<Record<string, unknown>> = [];
  globalThis.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = input instanceof URL ? input.href : String(input);
    if (url.includes("oauth2.googleapis.com/token")) return new Response(JSON.stringify({ access_token: "test-token", expires_in: 3600 }), { status: 200 });
    if (url.includes(":runQuery")) {
      calls.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      return new Response("", { status: 200 });
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  try {
    await withWorkerEnv(environment(), () => getFirestore()
      .collection("serviceApplications")
      .where("status", "==", "PENDING")
      .orderBy("submittedAt", "desc")
      .startAfterValues([new Date("2026-10-28T10:00:00.000Z"), "application-2"])
      .limit(26)
      .get());
  } finally {
    globalThis.fetch = originalFetch;
  }

  const structuredQuery = calls[0]?.structuredQuery as Record<string, any>;
  assert.deepEqual(structuredQuery.orderBy, [
    { field: { fieldPath: "submittedAt" }, direction: "DESCENDING" },
    { field: { fieldPath: "__name__" }, direction: "DESCENDING" },
  ]);
  assert.equal(structuredQuery.limit, 26);
  assert.deepEqual(structuredQuery.startAt, {
    before: false,
    values: [
      { timestampValue: "2026-10-28T10:00:00.000Z" },
      { referenceValue: "projects/pagination-test/databases/(default)/documents/serviceApplications/application-2" },
    ],
  });
});

test("Firestore adapter round-trips nanosecond timestamps through decoded results and runQuery cursor", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<Record<string, any>> = [];
  const rawTimestamp = "2026-10-28T10:00:00.123456789Z";
  globalThis.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = input instanceof URL ? input.href : String(input);
    if (url.includes("oauth2.googleapis.com/token")) return new Response(JSON.stringify({ access_token: "test-token", expires_in: 3600 }), { status: 200 });
    if (url.includes(":runQuery")) {
      const body = JSON.parse(String(init.body)) as Record<string, any>;
      calls.push(body);
      if (!body.structuredQuery.startAt) {
        return new Response(JSON.stringify([{ document: {
          name: "projects/pagination-test/databases/(default)/documents/serviceApplications/application_2",
          fields: { submittedAt: { timestampValue: rawTimestamp }, status: { stringValue: "PENDING" } },
        } }]), { status: 200 });
      }
      return new Response("", { status: 200 });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  try {
    await withWorkerEnv(environment(), async () => {
      const collection = getFirestore().collection("serviceApplications");
      const page = await collection.orderBy("submittedAt", "desc").limit(1).get();
      const timestamp = page.docs[0]?.data()?.submittedAt;
      assert.ok(timestamp instanceof FirestoreTimestamp);
      assert.equal(JSON.stringify(timestamp), JSON.stringify(rawTimestamp));
      await collection.orderBy("submittedAt", "desc").startAfterValues([timestamp, page.docs[0]!.id]).limit(2).get();
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1]?.structuredQuery.startAt?.values, [
    { timestampValue: rawTimestamp },
    { referenceValue: "projects/pagination-test/databases/(default)/documents/serviceApplications/application_2" },
  ]);
});

test("Firestore adapter rejects malformed timestamp cursor values and unsafe document IDs", async () => {
  const collection = getFirestore().collection("serviceApplications").orderBy("submittedAt", "desc");
  assert.throws(() => collection.startAfterValues([null, "application_2"]), /Invalid Firestore cursor values/);
  assert.throws(() => collection.startAfterValues([new Date("invalid"), "application_2"]), /Invalid Firestore timestamp/);
  assert.throws(() => collection.startAfterValues([new Date(), "../other"]), /Invalid Firestore cursor document ID/);
});
