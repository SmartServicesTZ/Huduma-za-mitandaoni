import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { completeNidaRequest, setNidaRequestStatus, submitNidaRequest } from "../src/handlers.js";
import { withWorkerEnv, type WorkerEnv } from "../src/runtime.js";

type Fields = Record<string, unknown>;
const userId = "synthetic-nida-user";
const adminId = "synthetic-nida-admin";
const documents = new Map<string, Fields>();

function encode(value: unknown): Record<string, unknown> {
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "number") return { integerValue: String(value) };
  if (typeof value === "boolean") return { booleanValue: value };
  if (value === null) return { nullValue: "NULL_VALUE" };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  if (typeof value === "object") return { mapValue: { fields: Object.fromEntries(Object.entries(value as Fields).map(([key, item]) => [key, encode(item)])) } };
  return { nullValue: "NULL_VALUE" };
}
function decode(value: any): unknown {
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return value.booleanValue;
  if ("nullValue" in value) return null;
  if ("timestampValue" in value) return new Date(value.timestampValue);
  if ("arrayValue" in value) return (value.arrayValue.values ?? []).map(decode);
  if ("mapValue" in value) return Object.fromEntries(Object.entries(value.mapValue.fields ?? {}).map(([key, item]) => [key, decode(item)]));
  return undefined;
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
function firestoreDocument(path: string, fields: Fields) {
  return { name: `projects/nida-characterization/databases/(default)/documents/${path}`, fields: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, encode(value)])) };
}
function environment(): WorkerEnv {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    FIREBASE_PROJECT_ID: "nida-characterization",
    FIREBASE_STORAGE_BUCKET: "nida-characterization.appspot.com",
    FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: "synthetic-nida@test.invalid", private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString() }),
    SUPER_ADMIN_PHONE: "255600000001",
  };
}
function pathFromName(name: string) {
  return name.split("/documents/")[1].split("/").map(decodeURIComponent).join("/");
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
    if (url.includes("oauth2.googleapis.com/token")) return json({ access_token: "synthetic-nida-token", expires_in: 3600 });
    if (url.endsWith(":beginTransaction")) return json({ transaction: `synthetic-nida-tx-${++transactionNumber}` });
    if (url.endsWith(":rollback")) return json({});
    if (url.endsWith(":commit")) {
      for (const write of body.writes ?? []) {
        if (write.delete) { documents.delete(pathFromName(String(write.delete))); continue; }
        const update = write.update;
        if (!update?.name) continue;
        const path = pathFromName(String(update.name));
        const previous = write.updateMask ? documents.get(path) ?? {} : {};
        const next: Fields = { ...previous, ...Object.fromEntries(Object.entries(update.fields ?? {}).map(([key, value]) => [key, decode(value)])) };
        for (const transform of write.updateTransforms ?? []) {
          if (transform.setToServerValue === "REQUEST_TIME") next[String(transform.fieldPath)] = new Date("2026-10-27T10:00:00.000Z");
        }
        documents.set(path, next);
      }
      return json({});
    }
    if (url.includes("/documents/")) {
      const path = decodeURIComponent(url.split("/documents/")[1].split("?")[0]).split("/").map(decodeURIComponent).join("/");
      const value = documents.get(path);
      return value ? json(firestoreDocument(path, value)) : json({ error: { status: "NOT_FOUND", message: "synthetic document absent" } }, 404);
    }
    throw new Error(`Unexpected network request in synthetic-only NIDA test: ${method} ${url}`);
  };
  try { return await run(calls); }
  finally { globalThis.fetch = originalFetch; }
}

test("NIDA request submission, status/result validation, and current token debit are characterized with synthetic Firestore", async () => {
  documents.clear();
  documents.set(`users/${userId}`, { role: "user", name: "Synthetic Applicant", tokenBalanceNida: 5 });
  documents.set(`users/${adminId}`, { role: "admin", phone: "255600000002" });
  documents.set("siteSettings/public", { nidaWorkingHours: { start: "00:00", end: "23:59" } });
  documents.set("services/utafutaji-nida", { tokenCost: 2 });

  await withSyntheticFirestore(async (calls) => withWorkerEnv(environment(), async () => {
    const submitted = await submitNidaRequest.handler({ auth: { uid: userId }, data: { phone: "0712 345 678" } }) as { requestId: string; status: string; tokenBalanceNida: number };
    assert.match(submitted.requestId, /^[0-9a-f-]{36}$/);
    assert.deepEqual(submitted, { requestId: submitted.requestId, status: "PENDING", tokenBalanceNida: 3 });
    const requestPath = `nidaRequests/${submitted.requestId}`;
    assert.deepEqual({ userId: documents.get(requestPath)?.userId, phone: documents.get(requestPath)?.phone, status: documents.get(requestPath)?.status }, { userId, phone: "0712345678", status: "PENDING" });
    assert.deepEqual(documents.get(`nidaOpenRequests/${userId}`)?.requestId, submitted.requestId);
    assert.equal(documents.get(`users/${userId}`)?.tokenBalanceNida, 3);
    const ledger = [...documents.entries()].find(([path]) => path.startsWith("tokenTransactions/nida_"))?.[1];
    assert.ok(ledger);
    assert.deepEqual({ tokenType: ledger.tokenType, type: ledger.type, amount: ledger.amount, tokenCost: ledger.tokenCost, balanceBefore: ledger.balanceBefore, balanceAfter: ledger.balanceAfter, status: ledger.status }, { tokenType: "nida", type: "service_usage", amount: -2, tokenCost: 2, balanceBefore: 5, balanceAfter: 3, status: "completed" });

    const inProcess = await setNidaRequestStatus.handler({ auth: { uid: adminId }, data: { requestId: submitted.requestId, status: "PROCESSING" } });
    assert.deepEqual(inProcess, { requestId: submitted.requestId, status: "PROCESSING" });
    assert.equal(documents.get(requestPath)?.status, "PROCESSING");

    await assert.rejects(async () => await completeNidaRequest.handler({ auth: { uid: adminId }, data: { requestId: submitted.requestId, nidaNumber: "20068517-27520-00001-22" } }), { code: "invalid-argument" });
    assert.equal(documents.get(requestPath)?.status, "PROCESSING");
    const resultNumber = "20068517275200000122";
    const completed = await completeNidaRequest.handler({ auth: { uid: adminId }, data: { requestId: submitted.requestId, nidaNumber: resultNumber } });
    assert.deepEqual(completed, { requestId: submitted.requestId, status: "APPROVED" });
    assert.equal(documents.get(requestPath)?.nidaNumber, resultNumber);
    assert.equal(documents.get(requestPath)?.status, "APPROVED");
    assert.equal(documents.has(`nidaOpenRequests/${userId}`), false);

    const commits = calls.filter((call) => call.url.endsWith(":commit"));
    assert.equal(commits.length, 3);
    assert.ok(calls.every(({ url }) => url.includes("firestore.googleapis.com") || url.includes("oauth2.googleapis.com/token")));
  }));
});
