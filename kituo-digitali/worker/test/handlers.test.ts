import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { changeOwnPassword, claimRegistrationPhone } from "../src/handlers.js";
import { withWorkerEnv, type WorkerEnv } from "../src/runtime.js";

const phone = "255712345678";
const uid = "auth-user-1";
const testPassword = "NewlySet-Test-Password-9!";

function environment(): WorkerEnv {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  return {
    FIREBASE_PROJECT_ID: "worker-handler-test",
    FIREBASE_STORAGE_BUCKET: "worker-handler-test.appspot.com",
    FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: "worker-test@worker-handler-test.iam.gserviceaccount.com", private_key: pem }),
    SUPER_ADMIN_PHONE: "255698232313",
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
function firestoreDocument(path: string, fields: Record<string, unknown>) {
  return {
    name: `projects/worker-handler-test/databases/(default)/documents/${path}`,
    fields: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, typeof value === "string" ? { stringValue: value } : { booleanValue: value } ])),
  };
}

async function withMockedGoogleFetch(
  profile: { uid?: string; phone?: string; role?: string; mustChangePassword?: boolean } | null,
  registryUid: string | null,
  callback: (calls: Array<{ url: string; method: string; body: Record<string, any> }>) => Promise<unknown>,
) {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; method: string; body: Record<string, any> }> = [];
  globalThis.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = input instanceof URL ? input.href : typeof input === "string" ? input : input.url;
    const method = init.method ?? "GET";
    const body = typeof init.body === "string" ? JSON.parse(init.body) as Record<string, any> : {};
    calls.push({ url, method, body });
    if (url.includes("oauth2.googleapis.com/token")) return jsonResponse({ access_token: "test-access-token", expires_in: 3600 });
    if (url.includes("identitytoolkit.googleapis.com")) return jsonResponse({ localId: uid });
    if (url.includes(":beginTransaction")) return jsonResponse({ transaction: "test-transaction" });
    if (url.includes(":rollback")) return jsonResponse({});
    if (url.includes(":runQuery")) return jsonResponse([]);
    if (url.includes(":commit")) return jsonResponse({ writeResults: [{}] });
    if (url.includes("/phoneRegistry/")) {
      return registryUid
        ? jsonResponse(firestoreDocument(`phoneRegistry/${phone}`, { uid: registryUid, phone }))
        : jsonResponse({ error: { status: "NOT_FOUND", message: "not found" } }, 404);
    }
    if (url.includes(`/users/${uid}`) && profile) {
      return jsonResponse(firestoreDocument(`users/${uid}`, {
        phone: profile.phone ?? phone,
        role: profile.role ?? "user",
        mustChangePassword: profile.mustChangePassword ?? false,
      }));
    }
    throw new Error(`Unexpected mocked request: ${method} ${url}`);
  };
  try {
    return await callback(calls);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("claimRegistrationPhone creates one canonical server-owned phone reservation", async () => {
  const env = environment();
  await withMockedGoogleFetch(null, null, async (calls) => {
    const result = await withWorkerEnv(env, async () => claimRegistrationPhone.handler({
      auth: { uid, email: `${phone}@login.huduma-za-mtandao.local` },
      data: { phone: "0712 345 678" },
    }));
    assert.deepEqual(result, { ok: true });
    const commit = calls.find((call) => call.url.includes(":commit"));
    assert.ok(commit);
    assert.equal(commit.body.writes[0].currentDocument.exists, false);
    assert.match(commit.body.writes[0].update.name, /phoneRegistry\/255712345678$/);
    assert.equal(commit.body.writes[0].update.fields.uid.stringValue, uid);
  });
});

test("claimRegistrationPhone refuses another account's existing phone reservation", async () => {
  const env = environment();
  await withMockedGoogleFetch(null, "different-user", async (calls) => {
    await assert.rejects(
      withWorkerEnv(env, async () => claimRegistrationPhone.handler({ auth: { uid, email: `${phone}@login.huduma-za-mtandao.local` }, data: { phone } })),
      (error: { code?: string; message?: string }) => error.code === "already-exists" && error.message === "Namba hii tayari imesajiliwa. Tafadhali ingia kwenye akaunti yako.",
    );
    assert.equal(calls.some((call) => call.url.includes(":commit")), false);
  });
});

test("changeOwnPassword updates Firebase Auth then clears the server-only gate without storing the password", async () => {
  const env = environment();
  await withMockedGoogleFetch({ phone: "255712345678", role: "user", mustChangePassword: true }, null, async (calls) => {
    const result = await withWorkerEnv(env, () => changeOwnPassword.handler({ auth: { uid }, data: { password: testPassword } }));
    assert.deepEqual(result, { ok: true });
    const authUpdate = calls.find((call) => call.url.includes("identitytoolkit.googleapis.com"));
    assert.equal(authUpdate?.body.localId, uid);
    assert.equal(authUpdate?.body.password, testPassword);
    const commit = calls.find((call) => call.url.includes(":commit"));
    assert.ok(commit);
    assert.equal(commit.body.writes[0].update.fields.mustChangePassword.booleanValue, false);
    assert.equal(JSON.stringify(commit.body).includes(testPassword), false);
  });
});
