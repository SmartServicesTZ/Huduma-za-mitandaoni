import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";

const baseEnv = {
  FIREBASE_PROJECT_ID: "huduma-za-mtandaoni-b1c0c",
  FIREBASE_STORAGE_BUCKET: "huduma-za-mtandaoni-b1c0c.firebasestorage.app",
  ALLOWED_ORIGINS: "https://smartservicestz.github.io,https://steward-tz.github.io,http://localhost:5173",
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

test("core readiness becomes available with the required Firebase service account", async () => {
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

test("SmartServicesTZ payment preflight and auth errors retain CORS headers", async () => {
  const origin = "https://smartservicestz.github.io";
  const preflight = await worker.fetch(new Request("https://worker.example/payments/fimipay/create-order", {
    method: "OPTIONS",
    headers: { Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type" },
  }), baseEnv as never);
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("Access-Control-Allow-Origin"), origin);
  assert.equal(preflight.headers.get("Vary"), "Origin");

  const paymentError = await worker.fetch(new Request("https://worker.example/payments/fimipay/create-order", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ amount: 1000, requestId: "cors-payment-test" }),
  }), { ...baseEnv, PAYMENT_FLOWS_ENABLED: "true" } as never);
  assert.equal(paymentError.status, 401);
  assert.equal(paymentError.headers.get("Access-Control-Allow-Origin"), origin);

  const catalogError = await worker.fetch(new Request("https://worker.example/call/ensureDefaultServiceCatalog", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ data: {} }),
  }), baseEnv as never);
  assert.equal(catalogError.status, 401);
  assert.equal(catalogError.headers.get("Access-Control-Allow-Origin"), origin);
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

test("FimiPay create-order endpoint requires a Firebase-authenticated customer", async () => {
  const response = await worker.fetch(new Request("https://worker.example/payments/fimipay/create-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tokens: 3, phone: "0712345678" }),
  }), baseEnv as never);
  assert.equal(response.status, 401);
});

test("FimiPay order-status endpoint requires a Firebase-authenticated customer", async () => {
  const response = await worker.fetch(new Request("https://worker.example/payments/fimipay/status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ order_id: "fp_test_example" }),
  }), baseEnv as never);
  assert.equal(response.status, 401);
});


test("Hati Zangu list, upload and file-download routes all require Firebase authentication", async () => {
  const list = await worker.fetch(request("/user-documents"), baseEnv as never);
  assert.equal(list.status, 401);
  assert.equal((await list.json() as { error: { code: string } }).error.code, "unauthenticated");

  const form = new FormData();
  form.append("documentId", "doc123456789012345678901234");
  form.append("name", "hati-test.png");
  form.append("type", "PNG");
  form.append("file", new Blob(["test"], { type: "image/png" }), "hati-test.png");
  const upload = await worker.fetch(new Request("https://worker.example/user-documents", {
    method: "POST",
    body: form,
  }), baseEnv as never);
  assert.equal(upload.status, 401);
  assert.equal((await upload.json() as { error: { code: string } }).error.code, "unauthenticated");

  const download = await worker.fetch(request("/user-documents/doc123456789012345678901234"), baseEnv as never);
  assert.equal(download.status, 401);
  assert.equal((await download.json() as { error: { code: string } }).error.code, "unauthenticated");
});
