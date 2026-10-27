import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { adminWrite, markUserMessageRead, registerFcmToken, sendPushNotification } from "../src/handlers.js";
import { withWorkerEnv, type WorkerEnv } from "../src/runtime.js";

type Fields = Record<string, unknown>;
const docs = new Map<string, Fields>();

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
function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
function document(path: string, fields: Fields) {
  return { name: `projects/audit-comms-test/databases/(default)/documents/${path}`, fields: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, encode(value)])) };
}
function env(): WorkerEnv {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    FIREBASE_PROJECT_ID: "audit-comms-test",
    FIREBASE_STORAGE_BUCKET: "audit-comms-test.appspot.com",
    FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: "synthetic@test.invalid", private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString() }),
    SUPER_ADMIN_PHONE: "255600000001",
  };
}
function pathFromName(name: string) {
  return name.split("/documents/")[1].split("/").map(decodeURIComponent).join("/");
}
async function withSyntheticServices<T>(run: (calls: Array<{ url: string; method: string; body: any }>) => Promise<T>) {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; method: string; body: any }> = [];
  let generatedId = 0;
  globalThis.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = input instanceof URL ? input.href : typeof input === "string" ? input : input.url;
    const method = init.method ?? "GET";
    const body = typeof init.body === "string" ? JSON.parse(init.body) : {};
    calls.push({ url, method, body });
    if (url === "https://oauth2.googleapis.com/token") return response({ access_token: "synthetic-access-token", expires_in: 3600 });
    if (url.includes("fcm.googleapis.com")) return response({ error: { status: "INVALID_ARGUMENT" } }, 400);
    if (url.endsWith(":beginTransaction")) return response({ transaction: "synthetic-tx" });
    if (url.endsWith(":rollback")) return response({});
    if (url.endsWith(":commit")) {
      for (const write of body.writes ?? []) {
        const update = write.update;
        if (!update?.name) continue;
        const path = pathFromName(String(update.name));
        const previous = write.updateMask ? docs.get(path) ?? {} : {};
        const next: Fields = { ...previous, ...Object.fromEntries(Object.entries(update.fields ?? {}).map(([key, value]) => [key, decode(value)])) };
        for (const transform of write.updateTransforms ?? []) if (transform.setToServerValue === "REQUEST_TIME") next[String(transform.fieldPath)] = new Date("2026-10-27T10:00:00.000Z");
        docs.set(path, next);
      }
      return response({});
    }
    if (url.endsWith(":runQuery")) {
      const query = body.structuredQuery ?? {};
      const collection = query.from?.[0]?.collectionId;
      const filter = query.where?.fieldFilter;
      let rows = [...docs.entries()].filter(([path]) => path.split("/").length % 2 === 0 && path.split("/").at(-2) === collection);
      if (filter) {
        const expected = decode(filter.value);
        rows = rows.filter(([, fields]) => fields[String(filter.field.fieldPath)] === expected);
      }
      if (query.limit) rows = rows.slice(0, query.limit);
      return response(rows.map(([path, fields]) => ({ document: document(path, fields) })));
    }
    if (url.includes("/documents/")) {
      const path = decodeURIComponent(url.split("/documents/")[1].split("?")[0]).split("/").map(decodeURIComponent).join("/");
      const value = docs.get(path);
      return value ? response(document(path, value)) : response({ error: { status: "NOT_FOUND", message: "synthetic missing document" } }, 404);
    }
    throw new Error(`Unexpected request in synthetic-only audit/comms test: ${method} ${url}`);
  };
  const originalRandomUUID = globalThis.crypto.randomUUID;
  // Generated Firestore IDs are intentionally synthetic; URL-safe and unique within this test.
  globalThis.crypto.randomUUID = (() => `synthetic-${++generatedId}-id`) as Crypto["randomUUID"];
  try { return await run(calls); }
  finally {
    globalThis.fetch = originalFetch;
    globalThis.crypto.randomUUID = originalRandomUUID;
  }
}

test("current audit/message shape, message read authorization, and FCM validation/error counts are characterized synthetically", async () => {
  docs.clear();
  docs.set("users/synthetic-admin", { role: "admin" });
  docs.set("users/synthetic-reader", { role: "user" });
  docs.set("users/synthetic-other", { role: "user" });
  docs.set("messages/owned", { recipientId: "synthetic-reader", subject: "Synthetic subject", body: "Synthetic body", type: "syntheticNotice", readBy: [] });
  docs.set("messages/broadcast", { recipientId: "synthetic-owner", broadcast: true, subject: "Synthetic broadcast", body: "Synthetic broadcast body", type: "syntheticNotice" });
  docs.set("fcmTokens/existing", { uid: "synthetic-target", token: "synthetic-existing-fcm-token-0001", platform: "android" });

  await withSyntheticServices(async (calls) => withWorkerEnv(env(), async () => {
    const result = await adminWrite.handler({ auth: { uid: "synthetic-admin" }, data: { collection: "messages", id: "synthetic-created-message", values: { recipientId: "synthetic-reader", subject: "Created synthetically", body: "A synthetic message body", type: "testNotice" } } }) as { id: string };
    assert.deepEqual(result, { id: "synthetic-created-message" });
    const created = docs.get("messages/synthetic-created-message");
    assert.deepEqual({ recipientId: created?.recipientId, subject: created?.subject, body: created?.body, type: created?.type, updatedBy: created?.updatedBy }, { recipientId: "synthetic-reader", subject: "Created synthetically", body: "A synthetic message body", type: "testNotice", updatedBy: "synthetic-admin" });
    const audit = [...docs.entries()].find(([path]) => path.startsWith("adminActions/"))?.[1];
    assert.ok(audit);
    assert.deepEqual({ actorId: audit.actorId, actorRole: audit.actorRole, action: audit.action, targetType: audit.targetType, targetId: audit.targetId, description: audit.description, before: audit.before, after: audit.after, details: audit.details }, { actorId: "synthetic-admin", actorRole: "admin", action: "CREATE_CONTENT", targetType: "message", targetId: "synthetic-created-message", description: "CREATE_CONTENT", before: null, after: { recipientId: "synthetic-reader", subject: "Created synthetically", body: "A synthetic message body", type: "testNotice" }, details: { collection: "messages" } });

    await assert.rejects(async () => await markUserMessageRead.handler({ auth: { uid: "synthetic-other" }, data: { messageId: "owned" } }), { code: "permission-denied" });
    assert.deepEqual(await markUserMessageRead.handler({ auth: { uid: "synthetic-reader" }, data: { messageId: "owned" } }), { ok: true });
    assert.deepEqual(docs.get("messages/owned")?.readBy, ["synthetic-reader"]);
    assert.deepEqual(await markUserMessageRead.handler({ auth: { uid: "synthetic-reader" }, data: { messageId: "broadcast" } }), { ok: true });
    assert.deepEqual(docs.get("messages/broadcast")?.readBy, ["synthetic-reader"]);

    await assert.rejects(async () => await registerFcmToken.handler({ auth: { uid: "synthetic-reader" }, data: { token: "short" } }), { code: "invalid-argument" });
    assert.deepEqual(await registerFcmToken.handler({ auth: { uid: "synthetic-reader" }, data: { token: "  synthetic-new-fcm-token-0002  " } }), { saved: true });
    const registered = [...docs.values()].find((value) => value.token === "synthetic-new-fcm-token-0002");
    assert.equal(registered?.uid, "synthetic-reader");
    assert.equal(registered?.platform, "android");

    const push = await sendPushNotification.handler({ auth: { uid: "synthetic-admin" }, data: { title: " Synthetic title ", body: " Synthetic body ", targetUid: "synthetic-target" } });
    assert.deepEqual(push, { sent: 0, failed: 1, attempted: 1 });
    assert.equal(docs.has("fcmTokens/existing"), true);
    const fcmCall = calls.find(({ url }) => url.includes("fcm.googleapis.com"));
    assert.ok(fcmCall);
    assert.deepEqual(fcmCall.body.message.notification, { title: "Synthetic title", body: "Synthetic body" });
    assert.ok(calls.every(({ url }) => url.includes("firestore.googleapis.com") || url === "https://oauth2.googleapis.com/token" || url.includes("fcm.googleapis.com")));
    assert.equal(calls.some(({ url }) => url.includes("fimi") || url.includes("storage.googleapis.com") || url.includes("r2")), false);
  }));
});
