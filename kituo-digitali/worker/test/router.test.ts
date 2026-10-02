import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";

const baseEnv = {
  FIREBASE_PROJECT_ID: "huduma-za-mtandaoni-b1c0c",
  FIREBASE_STORAGE_BUCKET: "huduma-za-mtandaoni-b1c0c.firebasestorage.app",
  ALLOWED_ORIGINS: "https://steward-tz.github.io,http://localhost:5173",
};

function request(path: string, origin?: string) {
  return new Request(`https://worker.example${path}`, {
    method: "GET",
    headers: origin ? { Origin: origin } : {},
  });
}

test("health endpoint responds without requiring credentials", async () => {
  const response = await worker.fetch(request("/health"), baseEnv as never);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
});

test("core readiness identifies only the missing Firebase service account", async () => {
  const response = await worker.fetch(request("/ready"), baseEnv as never);
  assert.equal(response.status, 503);
  const body = await response.json() as { ready: boolean; missing: string[] };
  assert.equal(body.ready, false);
  assert.deepEqual(body.missing, ["FIREBASE_SERVICE_ACCOUNT_JSON"]);
});

test("core readiness becomes available without FimiPay secrets", async () => {
  const env = {
    ...baseEnv,
    FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: "worker-test@huduma-test.iam.gserviceaccount.com", private_key: "-----BEGIN PRIVATE KEY-----\\nTEST-ONLY-NOT-A-REAL-KEY\\n-----END PRIVATE KEY-----" }),
  };
  const response = await worker.fetch(request("/ready"), env as never);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ready: true, missing: [] });
});

test("readiness blocks malformed Firebase service-account credentials", async () => {
  const env = {
    ...baseEnv,
    FIREBASE_SERVICE_ACCOUNT_JSON: "not-json",
  };
  const response = await worker.fetch(request("/ready"), env as never);
  assert.equal(response.status, 503);
  assert.deepEqual((await response.json() as { missing: string[] }).missing, ["FIREBASE_SERVICE_ACCOUNT_JSON"]);
});

test("token purchase endpoint is paused before authentication or database writes", async () => {
  const response = await worker.fetch(new Request("https://worker.example/call/createTokenPurchaseOrder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: { amount: 5000, requestId: "paused-purchase-test" } }),
  }), baseEnv as never);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: { code: "unavailable", message: "Ununuzi wa tokeni umesitishwa kwa muda." } });
});

test("FimiPay webhook is paused without processing or acknowledging payment events", async () => {
  const response = await worker.fetch(new Request("https://worker.example/webhooks/fimipay", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "SUCCESS", order_id: "paused-webhook-test" }),
  }), baseEnv as never);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: { code: "unavailable", message: "Malipo yamesitishwa kwa muda." } });
});

test("allowed origins receive CORS headers while unknown origins are rejected", async () => {
  const allowed = await worker.fetch(request("/health", "https://steward-tz.github.io"), baseEnv as never);
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get("Access-Control-Allow-Origin"), "https://steward-tz.github.io");

  const denied = await worker.fetch(request("/health", "https://attacker.example"), baseEnv as never);
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get("Access-Control-Allow-Origin"), null);
});

test("preflight requests only allow the configured website origin", async () => {
  const response = await worker.fetch(new Request("https://worker.example/call/consumeTokens", {
    method: "OPTIONS",
    headers: { Origin: "https://steward-tz.github.io", "Access-Control-Request-Method": "POST" },
  }), baseEnv as never);
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Access-Control-Allow-Methods"), "GET, POST, OPTIONS");
});

test("Lipa application submission is registered and rejects unauthenticated calls", async () => {
  const response = await worker.fetch(new Request("https://worker.example/call/submitLipaApplication", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: {} }),
  }), baseEnv as never);
  assert.equal(response.status, 401);
  assert.equal((await response.json() as { error: { code: string } }).error.code, "unauthenticated");
});
