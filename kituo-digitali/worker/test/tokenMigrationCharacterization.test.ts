import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { adjustTokens } from "../src/handlers.js";
import { withWorkerEnv, type WorkerEnv } from "../src/runtime.js";

const actorId = "synthetic-admin";
const userId = "synthetic-user";
const requestId = "synthetic-request-01";

type Fields = Record<string, unknown>;
const documents = new Map<string, Fields>([
  [`users/${actorId}`, { role: "admin", phone: "255600000002" }],
  // Deliberately divergent fields: this characterization does not select a canonical balance.
  [`users/${userId}`, { role: "user", tokenBalance: 91, tokenBalanceOther: 12, tokenBalanceNida: 7 }],
]);

function encode(value: unknown): Record<string, unknown> {
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "number") return { integerValue: String(value) };
  if (typeof value === "boolean") return { booleanValue: value };
  if (value === null) return { nullValue: "NULL_VALUE" };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  if (typeof value === "object" && value !== null) return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)])) } };
  return { nullValue: "NULL_VALUE" };
}
function decode(value: any): unknown {
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("booleanValue" in value) return value.booleanValue;
  if ("nullValue" in value) return null;
  if ("arrayValue" in value) return (value.arrayValue.values ?? []).map(decode);
  if ("mapValue" in value) return Object.fromEntries(Object.entries(value.mapValue.fields ?? {}).map(([key, item]) => [key, decode(item)]));
  return undefined;
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
function syntheticDocument(path: string, fields: Fields) {
  return { name: `projects/token-test/databases/(default)/documents/${path}`, fields: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, encode(value)])) };
}
function environment(): WorkerEnv {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    FIREBASE_PROJECT_ID: "token-test",
    FIREBASE_STORAGE_BUCKET: "token-test.appspot.com",
    FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: "synthetic@test.invalid", private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString() }),
    SUPER_ADMIN_PHONE: "255600000001",
  };
}

async function withSyntheticFirestore<T>(run: (calls: Array<{ url: string; method: string; body: any }>) => Promise<T>) {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; method: string; body: any }> = [];
  let transactionNumber = 0;
  globalThis.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = input instanceof URL ? input.href : typeof input === "string" ? input : input.url;
    const method = init.method ?? "GET";
    const body = typeof init.body === "string" ? JSON.parse(init.body) : {};
    calls.push({ url, method, body });
    if (url.includes("oauth2.googleapis.com/token")) return json({ access_token: "synthetic-only-token", expires_in: 3600 });
    if (url.endsWith(":beginTransaction")) return json({ transaction: `synthetic-tx-${++transactionNumber}` });
    if (url.endsWith(":rollback") || url.endsWith(":commit")) {
      if (url.endsWith(":commit")) {
        for (const write of body.writes ?? []) {
          const path = String(write.update?.name ?? "").split("/documents/")[1]?.split("/").map(decodeURIComponent).join("/");
          if (!path) continue;
          const fields = Object.fromEntries(Object.entries(write.update.fields ?? {}).map(([key, value]) => [key, decode(value)]));
          documents.set(path, { ...(write.updateMask ? (documents.get(path) ?? {}) : {}), ...fields });
        }
      }
      return json({});
    }
    if (url.includes("/documents/")) {
      const path = decodeURIComponent(url.split("/documents/")[1].split("?")[0]).split("/").map(decodeURIComponent).join("/");
      const value = documents.get(path);
      return value ? json(syntheticDocument(path, value)) : json({ error: { status: "NOT_FOUND", message: "synthetic missing document" } }, 404);
    }
    throw new Error(`Unexpected synthetic-only request: ${method} ${url}`);
  };
  try { return await run(calls); }
  finally { globalThis.fetch = originalFetch; }
}

test("adjustTokens records the current mutation and same-request duplicate without overwriting distinct legacy fields", async () => {
  // Isolate the in-memory synthetic database per test invocation.
  documents.set(`users/${userId}`, { role: "user", tokenBalance: 91, tokenBalanceOther: 12, tokenBalanceNida: 7 });
  documents.delete(`${actorId}_${requestId}`);
  await withSyntheticFirestore(async (calls) => withWorkerEnv(environment(), async () => {
    const request = { auth: { uid: actorId }, data: { userId, description: "synthetic adjustment", requestId, amount: 3, tokenType: "huduma" } };
    const first = await adjustTokens.handler(request);
    assert.deepEqual(first, { balanceAfter: 15, reference: `${actorId}_${requestId}`, duplicate: false });
    assert.deepEqual(documents.get(`users/${userId}`), { role: "user", tokenBalance: 15, tokenBalanceOther: 15, tokenBalanceNida: 7 });

    const ledger = documents.get(`tokenTransactions/${actorId}_${requestId}`);
    assert.ok(ledger);
    assert.deepEqual({ tokenType: ledger.tokenType, type: ledger.type, amount: ledger.amount, balanceBefore: ledger.balanceBefore, balanceAfter: ledger.balanceAfter, reason: ledger.reason, status: ledger.status }, {
      tokenType: "huduma", type: "credit", amount: 3, balanceBefore: 12, balanceAfter: 15, reason: "synthetic adjustment", status: "completed",
    });

    const second = await adjustTokens.handler(request);
    assert.deepEqual(second, { balanceAfter: 15, reference: `${actorId}_${requestId}`, duplicate: true });
    assert.deepEqual(documents.get(`users/${userId}`), { role: "user", tokenBalance: 15, tokenBalanceOther: 15, tokenBalanceNida: 7 });
    assert.equal(calls.filter((call) => call.url.endsWith(":commit")).length, 1);
    assert.equal(calls.some((call) => !call.url.includes("firestore.googleapis.com") && !call.url.includes("oauth2.googleapis.com")), false);
  }));
});
