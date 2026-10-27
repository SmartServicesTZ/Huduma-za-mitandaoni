import assert from "node:assert/strict";
import { createHmac, generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { ApiHttpResponse } from "../src/api-adapter.js";
import { fimipayWebhook } from "../src/handlers.js";
import { withWorkerEnv, type WorkerEnv } from "../src/runtime.js";

const orderId = "hmt_synthetic_payment_order_01";
const userId = "synthetic-payment-user";
const webhookSecret = "synthetic-webhook-secret";

function environment(): WorkerEnv {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    FIREBASE_PROJECT_ID: "synthetic-payment-project",
    FIREBASE_STORAGE_BUCKET: "synthetic-payment-project.appspot.com",
    FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
      client_email: "synthetic-payment-test@example.invalid",
      private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    }),
    FIMIPAY_SECRET_KEY: "synthetic-provider-api-key-not-used-outside-mock",
    FIMIPAY_WEBHOOK_SECRET: webhookSecret,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function encode(value: unknown): Record<string, unknown> {
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "number") return { integerValue: String(value) };
  if (typeof value === "boolean") return { booleanValue: value };
  throw new Error(`Unexpected synthetic Firestore value: ${String(value)}`);
}

function purchaseDocument() {
  const path = `tokenPurchaseOrders/${orderId}`;
  const fields = {
    orderId,
    requestId: "synthetic-request-001",
    userId,
    amount: 2000,
    currency: "TZS",
    tokenAmount: 40,
    status: "PENDING",
    providerOrderId: orderId,
  };
  return {
    name: `projects/synthetic-payment-project/databases/(default)/documents/${path}`,
    fields: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, encode(value)])),
  };
}

test("fimipayWebhook returns retryable pending response and does not settle a provider-pending payment", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; method: string }> = [];
  globalThis.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = input instanceof URL ? input.href : typeof input === "string" ? input : input.url;
    const method = init.method ?? "GET";
    calls.push({ url, method });
    if (url.includes("oauth2.googleapis.com/token")) {
      return jsonResponse({ access_token: "synthetic-access-token", expires_in: 3600 });
    }
    if (url.includes("firestore.googleapis.com") && url.includes(`/documents/tokenPurchaseOrders/${orderId}`)) {
      return jsonResponse(purchaseDocument());
    }
    if (url === "https://fimipay.com/api/v1/payment/order_status" && method === "POST") {
      return jsonResponse({
        status: "success",
        data: {
          order_id: orderId,
          payment_status: "PENDING",
          amount: 2000,
          currency: "TZS",
          environment: "live",
          simulated: false,
        },
      });
    }
    throw new Error(`Unexpected request in synthetic-only payment test: ${method} ${url}`);
  };

  const rawBody = Buffer.from(JSON.stringify({
    order_id: orderId,
    event: "payment.success",
    amount: 2000,
    currency: "TZS",
  }));
  const signature = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  const response = new ApiHttpResponse();
  try {
    await withWorkerEnv(environment(), () => fimipayWebhook.handler({
      method: "POST",
      rawBody,
      get: (name) => name.toLowerCase() === "x-fimipay-signature" ? signature : undefined,
    }, response));
  } finally {
    globalThis.fetch = originalFetch;
  }

  const result = await response.toResponse().json() as Record<string, unknown>;
  assert.equal(response.toResponse().status, 500);
  assert.deepEqual(result, { received: false, pending: true });
  assert.equal(calls.filter(({ url }) => url === "https://fimipay.com/api/v1/payment/order_status").length, 1);
  assert.equal(calls.some(({ url }) => url.includes("firestore.googleapis.com") && (url.endsWith(":commit") || url.endsWith(":beginTransaction"))), false);
});
