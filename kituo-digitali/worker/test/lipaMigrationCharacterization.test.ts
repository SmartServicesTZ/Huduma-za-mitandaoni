import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { submitLipaApplication, setLipaApplicationStatus, updateLipaRewardTracking } from "../src/handlers.js";
import { withWorkerEnv, type WorkerEnv } from "../src/runtime.js";

type Fields = Record<string, unknown>;
const userId = "synthetic-lipa-user";
const adminId = "synthetic-lipa-admin";
const applicationId = "synthetic-lipa-application-001";
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
  return { name: `projects/lipa-characterization/databases/(default)/documents/${path}`, fields: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, encode(value)])) };
}
function environment(): WorkerEnv {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    FIREBASE_PROJECT_ID: "lipa-characterization",
    FIREBASE_STORAGE_BUCKET: "lipa-characterization.appspot.com",
    FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: "synthetic-lipa@test.invalid", private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString() }),
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
    if (url.includes("oauth2.googleapis.com/token")) return json({ access_token: "synthetic-lipa-token", expires_in: 3600 });
    if (url.endsWith(":beginTransaction")) return json({ transaction: `synthetic-lipa-tx-${++transactionNumber}` });
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
    throw new Error(`Unexpected request in synthetic-only Lipa test: ${method} ${url}`);
  };
  try { return await run(calls); }
  finally { globalThis.fetch = originalFetch; }
}

test("Lipa submission fields and current application status/tracking transitions are characterized with synthetic Firestore", async () => {
  documents.clear();
  documents.set(`users/${userId}`, { role: "user", name: "Synthetic Applicant" });
  documents.set(`users/${adminId}`, { role: "admin", permissions: { manageLipaApplications: true }, name: "Synthetic Admin" });
  documents.set("lipaServices/synthetic-network", {
    id: "synthetic-network", name: "Synthetic Network", active: true, reward: 2500,
    fields: [
      { fieldName: "firstName", label: "First name", type: "TEXT", required: true },
      { fieldName: "phone", label: "Phone", type: "PHONE", required: true },
      { fieldName: "businessName", label: "Business name", type: "TEXT", required: false },
    ],
  });

  await withSyntheticFirestore(async (calls) => withWorkerEnv(environment(), async () => {
    const submitted = await submitLipaApplication.handler({
      auth: { uid: userId },
      data: { applicationId, networkId: "synthetic-network", values: { firstName: " Synthetic ", phone: "0712 345 678", businessName: " Synthetic Shop ", additionalNotes: " Test note " } },
    }) as { applicationId: string; status: string };
    assert.deepEqual(submitted, { applicationId, status: "PENDING" });
    const appPath = `lipaApplications/${applicationId}`;
    const application = documents.get(appPath)!;
    assert.deepEqual({
      applicationId: application.applicationId, userId: application.userId, network: application.network,
      networkId: application.networkId, serviceId: application.serviceId, applicantName: application.applicantName,
      phone: application.phone, businessName: application.businessName, applicantData: application.applicantData,
      rewardStatus: application.rewardStatus, qualificationStatus: application.qualificationStatus,
      verifiedTransactions: application.verifiedTransactions, lipaNumber: application.lipaNumber,
      rewardPaymentReference: application.rewardPaymentReference, status: application.status,
      rejectionReason: application.rejectionReason, additionalNotes: application.additionalNotes,
    }, {
      applicationId, userId, network: "Synthetic Network", networkId: "synthetic-network", serviceId: "pata-lipa-namba",
      applicantName: "Synthetic", phone: "0712 345 678", businessName: "Synthetic Shop",
      applicantData: { firstName: "Synthetic", phone: "0712 345 678", businessName: "Synthetic Shop" },
      rewardStatus: "UNPAID", qualificationStatus: "PENDING_CHECK", verifiedTransactions: 0,
      lipaNumber: "", rewardPaymentReference: "", status: "PENDING", rejectionReason: "", additionalNotes: "Test note",
    });
    assert.equal(documents.get(`lipaOpenApplications/${userId}_synthetic-network_${applicationId}`)?.applicationId, applicationId);

    const processing = await setLipaApplicationStatus.handler({ auth: { uid: adminId }, data: { applicationId, status: "PROCESSING" } });
    assert.deepEqual(processing, { applicationId, status: "PROCESSING" });
    assert.equal(documents.get(appPath)?.status, "PROCESSING");
    const approved = await setLipaApplicationStatus.handler({ auth: { uid: adminId }, data: { applicationId, status: "APPROVED" } });
    assert.deepEqual(approved, { applicationId, status: "APPROVED" });
    assert.equal(documents.get(appPath)?.status, "APPROVED");
    assert.equal(documents.has(`lipaOpenApplications/${userId}_synthetic-network_${applicationId}`), false);

    const tracking = await updateLipaRewardTracking.handler({
      auth: { uid: adminId }, data: { applicationId, lipaNumber: " 555000 ", verifiedTransactions: 12,
        qualificationStatus: "QUALIFIED", rewardStatus: "UNPAID", rewardPaymentReference: "", rewardNote: " Synthetic progress " },
    });
    assert.deepEqual(tracking, { applicationId, reward: 2500, qualificationStatus: "QUALIFIED", rewardStatus: "UNPAID", lipaNumber: "555000", verifiedTransactions: 12 });
    assert.deepEqual({ lipaNumber: documents.get(appPath)?.lipaNumber, verifiedTransactions: documents.get(appPath)?.verifiedTransactions,
      qualificationStatus: documents.get(appPath)?.qualificationStatus, rewardStatus: documents.get(appPath)?.rewardStatus,
      rewardPaymentReference: documents.get(appPath)?.rewardPaymentReference, rewardNote: documents.get(appPath)?.rewardNote },
    { lipaNumber: "555000", verifiedTransactions: 12, qualificationStatus: "QUALIFIED", rewardStatus: "UNPAID", rewardPaymentReference: "", rewardNote: "Synthetic progress" });
    assert.ok(calls.every(({ url }) => url.includes("firestore.googleapis.com") || url.includes("oauth2.googleapis.com/token")));
  }));
});
