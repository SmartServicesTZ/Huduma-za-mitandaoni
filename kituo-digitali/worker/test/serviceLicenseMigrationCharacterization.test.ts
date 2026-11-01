import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { completeBusinessLicense, createServiceApplication, setServiceApplicationStatus } from "../src/handlers.js";
import { withWorkerEnv, type WorkerEnv } from "../src/runtime.js";

type Fields = Record<string, unknown>;
const actorId = "synthetic-service-admin";
const userId = "synthetic-service-user";
const applicationId = "synthetic-service-application-0001";
const requestId = "123e4567-e89b-42d3-a456-426614174000";
const documents = new Map<string, Fields>();

function encode(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) return { nullValue: "NULL_VALUE" };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "number") return { integerValue: String(value) };
  if (typeof value === "boolean") return { booleanValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  if (typeof value === "object") return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)])) } };
  throw new Error(`Unexpected synthetic value: ${String(value)}`);
}
function decode(value: any): unknown {
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return value.booleanValue;
  if ("nullValue" in value) return null;
  if ("arrayValue" in value) return (value.arrayValue.values ?? []).map(decode);
  if ("mapValue" in value) return Object.fromEntries(Object.entries(value.mapValue.fields ?? {}).map(([key, item]) => [key, decode(item)]));
  return undefined;
}
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}
function document(path: string, fields: Fields) {
  return { name: `projects/synthetic-service-test/databases/(default)/documents/${path}`, fields: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, encode(value)])) };
}
function environment(): WorkerEnv {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    FIREBASE_PROJECT_ID: "synthetic-service-test",
    FIREBASE_STORAGE_BUCKET: "synthetic-service-test.appspot.com",
    FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: "synthetic@test.invalid", private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString() }),
  };
}
async function withSyntheticFirestore<T>(run: (calls: Array<{ url: string; method: string; body: any }>) => Promise<T>) {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; method: string; body: any }> = [];
  let tx = 0;
  globalThis.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = input instanceof URL ? input.href : typeof input === "string" ? input : input.url;
    const method = init.method ?? "GET";
    const body = typeof init.body === "string" ? JSON.parse(init.body) : {};
    calls.push({ url, method, body });
    if (url.includes("oauth2.googleapis.com/token")) return json({ access_token: "synthetic-only", expires_in: 3600 });
    if (url.endsWith(":beginTransaction")) return json({ transaction: `synthetic-tx-${++tx}` });
    if (url.endsWith(":rollback")) return json({});
    if (url.endsWith(":commit")) {
      for (const write of body.writes ?? []) {
        const fullPath = String(write.update?.name ?? "").split("/documents/")[1];
        if (fullPath) {
          const path = fullPath.split("/").map(decodeURIComponent).join("/");
          const patch = Object.fromEntries(Object.entries(write.update.fields ?? {}).map(([key, value]) => [key, decode(value)]));
          documents.set(path, write.updateMask ? { ...(documents.get(path) ?? {}), ...patch } : patch);
        }
        const deleted = write.delete as string | undefined;
        if (deleted) documents.delete(deleted.split("/documents/")[1].split("/").map(decodeURIComponent).join("/"));
      }
      return json({});
    }
    if (url.endsWith(":runQuery")) {
      const query = body.structuredQuery;
      const collection = query.from?.[0]?.collectionId;
      const field = query.where?.fieldFilter?.field?.fieldPath;
      const expected = query.where?.fieldFilter?.value ? decode(query.where.fieldFilter.value) : undefined;
      const rows = [...documents.entries()].filter(([path, fields]) => path.split("/").at(-2) === collection && (!field || fields[field] === expected)).map(([path, fields]) => ({ document: document(path, fields) }));
      return json(rows);
    }
    if (url.includes("/documents/")) {
      const path = decodeURIComponent(url.split("/documents/")[1].split("?")[0]).split("/").map(decodeURIComponent).join("/");
      const fields = documents.get(path);
      return fields ? json(document(path, fields)) : json({ error: { status: "NOT_FOUND", message: "synthetic missing document" } }, 404);
    }
    throw new Error(`Unexpected request in synthetic-only test: ${method} ${url}`);
  };
  try { return await run(calls); }
  finally { globalThis.fetch = originalFetch; }
}

 test("service application duplicate returns the stored state without another charge or open-marker write", async () => {
  documents.clear();
  documents.set(`users/${userId}`, { role: "user", name: "Synthetic User", tokenBalance: 9, tokenBalanceOther: 9, verificationStatus: "approved" });
  documents.set(`services/synthetic-service-doc`, { slug: "synthetic-paid-service", name: "Synthetic paid service", fields: [{ fieldName: "description", label: "Description", type: "TEXT", required: true }], tokenCost: 2, active: true, isVisible: true });
  documents.set(`serviceApplications/${applicationId}`, { applicationId, userId, serviceSlug: "synthetic-paid-service", status: "PROCESSING" });
  await withSyntheticFirestore(async (calls) => withWorkerEnv(environment(), async () => {
    const result = await createServiceApplication.handler({ auth: { uid: userId }, data: { applicationId, serviceSlug: "synthetic-paid-service", values: { description: "synthetic" } } });
    assert.deepEqual(result, { applicationId, status: "PROCESSING", duplicate: true });
    assert.equal(documents.get(`users/${userId}`)?.tokenBalance, 9);
    assert.equal(calls.some(({ url, body }) => url.endsWith(":commit") && (body.writes ?? []).some((write: any) => String(write.update?.name ?? "").includes("serviceOpenApplications/"))), false);
    assert.equal(calls.some(({ url }) => !url.includes("firestore.googleapis.com") && !url.includes("oauth2.googleapis.com")), false);
  }));
});

test("transitioning a service application to APPROVED deletes its open marker", async () => {
  documents.clear();
  documents.set(`users/${actorId}`, { role: "admin", phone: "255600000002" });
  documents.set(`serviceApplications/${applicationId}`, { applicationId, userId, serviceSlug: "synthetic-service", serviceName: "Synthetic service", status: "PROCESSING", statusOptions: ["PENDING", "PROCESSING", "APPROVED", "REJECTED"] });
  documents.set(`serviceOpenApplications/${userId}_synthetic-service`, { applicationId, userId, serviceSlug: "synthetic-service" });
  await withSyntheticFirestore(async (calls) => withWorkerEnv(environment(), async () => {
    await setServiceApplicationStatus.handler({ auth: { uid: actorId }, data: { applicationId, status: "APPROVED" } });
    assert.equal(documents.get(`serviceApplications/${applicationId}`)?.status, "APPROVED");
    assert.equal(documents.has(`serviceOpenApplications/${userId}_synthetic-service`), false);
    const commit = calls.find(({ url }) => url.endsWith(":commit"));
    assert.ok(commit);
    assert.ok(commit.body.writes.some((write: any) => String(write.delete ?? "").endsWith(`/serviceOpenApplications/${userId}_synthetic-service`)));
    assert.equal(calls.some(({ url }) => !url.includes("firestore.googleapis.com") && !url.includes("oauth2.googleapis.com")), false);
  }));
});

test("business-license completion charges two tokens once and repeat completion is a duplicate", async () => {
  documents.clear();
  documents.set(`users/${userId}`, { role: "user", verificationStatus: "approved", tokenBalance: 7, tokenBalanceOther: 7 });
  documents.set(`licenseApplications/${requestId}`, { requestId, applicationId: "synthetic-license-app", userId, status: "PROCESSING", licenseData: { licenseNumber: "SYNTHETIC-NUMBER" } });
  await withSyntheticFirestore(async (calls) => withWorkerEnv(environment(), async () => {
    const request = { auth: { uid: userId }, data: { requestId } };
    const first = await completeBusinessLicense.handler(request);
    assert.equal((first as any).status, "COMPLETED");
    assert.equal((first as any).duplicate, false);
    assert.equal(documents.get(`users/${userId}`)?.tokenBalanceOther, 5);
    assert.deepEqual(documents.get(`tokenTransactions/license_${requestId}`) && {
      amount: documents.get(`tokenTransactions/license_${requestId}`)?.amount,
      balanceBefore: documents.get(`tokenTransactions/license_${requestId}`)?.balanceBefore,
      balanceAfter: documents.get(`tokenTransactions/license_${requestId}`)?.balanceAfter,
    }, { amount: -2, balanceBefore: 7, balanceAfter: 5 });
    const second = await completeBusinessLicense.handler(request);
    assert.equal((second as any).duplicate, true);
    assert.equal(documents.get(`users/${userId}`)?.tokenBalanceOther, 5);
    assert.equal(calls.filter(({ url }) => url.endsWith(":commit")).length, 1);
    assert.equal(calls.some(({ url }) => !url.includes("firestore.googleapis.com") && !url.includes("oauth2.googleapis.com")), false);
  }));
});
