import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { resolveAuthRole } from "../src/authClaims.js";
import { adminWrite, enforceAccountRestriction } from "../src/handlers.js";
import { withWorkerEnv, type WorkerEnv } from "../src/runtime.js";
import { resolveAccountAccessMode } from "../../shared/accountAccess.js";

const uid = "characterization-user";

function testEnvironment(): WorkerEnv {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    FIREBASE_PROJECT_ID: "synthetic-characterization-project",
    FIREBASE_STORAGE_BUCKET: "synthetic-characterization-project.appspot.com",
    FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
      client_email: "synthetic-test@synthetic-characterization-project.iam.gserviceaccount.com",
      private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    }),
    SUPER_ADMIN_PHONE: "255600000001",
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function firestoreDocument(fields: Record<string, unknown>) {
  const encode = (value: unknown): Record<string, unknown> => {
    if (typeof value === "string") return { stringValue: value };
    if (typeof value === "boolean") return { booleanValue: value };
    throw new Error(`Unexpected synthetic Firestore value: ${String(value)}`);
  };
  return {
    name: `projects/synthetic-characterization-project/databases/(default)/documents/users/${uid}`,
    fields: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, encode(value)])),
  };
}

async function withSyntheticProfile<T>(profile: Record<string, unknown>, run: (calls: string[]) => Promise<T>): Promise<T> {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = input instanceof URL ? input.href : typeof input === "string" ? input : input.url;
    calls.push(url);
    if (url.includes("oauth2.googleapis.com/token")) return jsonResponse({ access_token: "synthetic-access-token", expires_in: 3600 });
    if (url.endsWith(`/documents/users/${uid}`)) return jsonResponse(firestoreDocument(profile));
    throw new Error(`Unexpected request in synthetic-only test: ${init.method ?? "GET"} ${url}`);
  };
  try {
    return await run(calls);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("role claim resolution preserves a non-super-admin profile role when the configured phone is absent", () => {
  assert.deepEqual(resolveAuthRole("moderator", "255600000002", ""), {
    role: "moderator",
    isConfiguredSuperAdmin: false,
    shouldPromote: false,
    shouldDemote: false,
  });
});

test("blocked account status takes precedence over an active accessMode", () => {
  assert.equal(resolveAccountAccessMode({ accountStatus: "blocked", accessMode: "active" }), "denied");
  assert.equal(resolveAccountAccessMode({ accountStatus: "deleted", accessMode: "limited" }), "denied");
  assert.equal(resolveAccountAccessMode({ accountStatus: "active", accessMode: "active" }), "active");
});

test("account restriction skips auth-claim synchronization even for denied accounts", async () => {
  const env = testEnvironment();
  await withSyntheticProfile({ accessMode: "denied" }, async (calls) => {
    await assert.doesNotReject(withWorkerEnv(env, () => enforceAccountRestriction(uid, "syncAuthClaims")));
    assert.equal(calls.some((url) => url.includes(`/documents/users/${uid}`)), false);
  });
});

test("adminWrite denies a moderator without the collection's explicit permission before opening a transaction", async () => {
  const env = testEnvironment();
  await withSyntheticProfile({ role: "moderator", phone: "255600000002" }, async (calls) => {
    await assert.rejects(
      async () => await withWorkerEnv(env, () => adminWrite.handler({
        auth: { uid },
        data: { collection: "services", id: "synthetic-service", values: { name: "Synthetic" } },
      })),
      (error: { code?: string; message?: string }) => error.code === "permission-denied" && error.message === "Huna ruhusa ya kufanya kitendo hiki.",
    );
    assert.equal(calls.some((url) => url.includes(":beginTransaction")), false);
  });
});
