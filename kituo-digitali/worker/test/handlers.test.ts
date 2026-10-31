import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { changeOwnPassword, claimRegistrationPhone, enforceAccountRestriction, listAdminUsers, listLipaApplications, listNidaRequests, listServiceApplications, setAccountStatus } from "../src/handlers.js";
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
  const encode = (value: unknown): Record<string, unknown> => Array.isArray(value)
    ? { arrayValue: { values: value.map(encode) } }
    : typeof value === "string" ? { stringValue: value }
    : typeof value === "boolean" ? { booleanValue: value }
    : { nullValue: null };
  return {
    name: `projects/worker-handler-test/databases/(default)/documents/${path}`,
    fields: Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined).map(([key, value]) => [key, encode(value)])),
  };
}

async function withMockedGoogleFetch(
  profile: { uid?: string; phone?: string; role?: string; mustChangePassword?: boolean; accountStatus?: string; accessMode?: string; allowedActions?: string[]; restrictionReason?: string; restrictionMessage?: string } | null,
  registryUid: string | null,
  callback: (calls: Array<{ url: string; method: string; body: Record<string, any> }>) => Promise<unknown>,
  extraProfiles: Record<string, { uid?: string; phone?: string; role?: string; mustChangePassword?: boolean; accountStatus?: string; accessMode?: string; allowedActions?: string[]; restrictionReason?: string; restrictionMessage?: string }> = {},
) {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; method: string; body: Record<string, any> }> = [];
  let profileCreated = false;
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
    if (url.includes(":commit")) {
      if (body.writes?.some((write: any) => String(write.update?.name ?? "").endsWith(`/users/${uid}`))) profileCreated = true;
      return jsonResponse({ writeResults: [{}] });
    }
    if (url.includes("/phoneRegistry/")) {
      return registryUid
        ? jsonResponse(firestoreDocument(`phoneRegistry/${phone}`, { uid: registryUid, phone }))
        : jsonResponse({ error: { status: "NOT_FOUND", message: "not found" } }, 404);
    }
    if (url.includes("/siteSettings/public") || url.includes("/tokenTransactions/registration_")) {
      return jsonResponse({ error: { status: "NOT_FOUND", message: "not found" } }, 404);
    }
    const userId = /\/documents\/users\/([^?]+)/.exec(url)?.[1];
    if (userId) {
      const userProfile = userId === uid ? profile : extraProfiles[userId];
      if (userId === uid && profileCreated) return jsonResponse(firestoreDocument(`users/${userId}`, { uid, phone, role: "user", tokenBalance: 15 }));
      if (!userProfile) return jsonResponse({ error: { status: "NOT_FOUND", message: "not found" } }, 404);
      return jsonResponse(firestoreDocument(`users/${userId}`, {
        phone: userProfile.phone ?? phone,
        role: userProfile.role ?? "user",
        mustChangePassword: userProfile.mustChangePassword ?? false,
        accountStatus: userProfile.accountStatus,
        accessMode: userProfile.accessMode,
        allowedActions: userProfile.allowedActions,
        restrictionReason: userProfile.restrictionReason,
        restrictionMessage: userProfile.restrictionMessage,
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
      data: { phone: "0712 345 678", firstName: "Mwanachama", lastName: "Test" },
    }));
    assert.ok(result && typeof result === "object");
    const outcome = result as { ok?: unknown; profileCreated?: unknown };
    assert.equal(outcome.ok, true);
    assert.equal(outcome.profileCreated, true);
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
      withWorkerEnv(env, async () => claimRegistrationPhone.handler({ auth: { uid, email: `${phone}@login.huduma-za-mtandao.local` }, data: { phone, firstName: "Mwanachama" } })),
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

test("central account restrictions deny blocked users and include their reason and support contact", async () => {
  const env = environment();
  await withMockedGoogleFetch({ accessMode: "denied", accountStatus: "blocked", restrictionReason: "Taarifa zinahitaji uhakiki." }, null, async () => {
    await assert.rejects(
      withWorkerEnv(env, () => enforceAccountRestriction(uid, "findChatUser")),
      (error: { code?: string; message?: string }) => error.code === "permission-denied" && error.message?.includes("Taarifa zinahitaji uhakiki.") === true && error.message.includes("0698232313"),
    );
    await assert.doesNotReject(withWorkerEnv(env, () => enforceAccountRestriction(uid, "syncAuthClaims")));
  });
});

test("setAccountStatus saves a custom user notice and atomically creates an in-app restriction notification", async () => {
  const env = environment();
  const targetUid = "restricted-user-99";
  const notice = "Tafadhali wasiliana nasi ili tukusaidie kurekebisha taarifa zako.";
  await withMockedGoogleFetch({ phone: "255698232313", role: "super_admin" }, null, async (calls) => {
    const result = await withWorkerEnv(env, () => setAccountStatus.handler({
      auth: { uid },
      data: { userId: targetUid, accessMode: "denied", reason: "Taarifa zinahitaji uhakiki.", restrictionMessage: notice, allowedActions: [] },
    }));
    assert.deepEqual(result, { ok: true });
    const commit = calls.find((call) => call.url.includes(":commit"));
    assert.ok(commit);
    const writes = commit.body.writes as Array<{ update?: { name?: string; fields?: Record<string, any> } }>;
    const profileWrite = writes.find((write) => write.update?.name?.endsWith(`/users/${targetUid}`));
    assert.equal(profileWrite?.update?.fields?.accessMode?.stringValue, "denied");
    assert.equal(profileWrite?.update?.fields?.accountStatus?.stringValue, "blocked");
    assert.equal(profileWrite?.update?.fields?.restrictionMessage?.stringValue, notice);
    const notificationWrite = writes.find((write) => write.update?.name?.includes("/messages/"));
    assert.equal(notificationWrite?.update?.fields?.recipientId?.stringValue, targetUid);
    assert.equal(notificationWrite?.update?.fields?.type?.stringValue, "accountRestriction");
    assert.ok(notificationWrite?.update?.fields?.body?.stringValue.includes(notice));
    assert.ok(notificationWrite?.update?.fields?.body?.stringValue.includes("Sababu: Taarifa zinahitaji uhakiki."));
    assert.ok(notificationWrite?.update?.fields?.body?.stringValue.includes("0698232313"));
  }, { [targetUid]: { phone: "255712345678", role: "user" } });
});

test("read-only accounts may use read callables but cannot submit or perform actions", async () => {
  const env = environment();
  await withMockedGoogleFetch({ accessMode: "read_only" }, null, async () => {
    await assert.doesNotReject(withWorkerEnv(env, () => enforceAccountRestriction(uid, "getLipaApplicationDocument")));
    await assert.doesNotReject(withWorkerEnv(env, () => enforceAccountRestriction(uid, "changeOwnPassword")));
    await assert.rejects(withWorkerEnv(env, () => enforceAccountRestriction(uid, "submitLipaApplication")), { code: "permission-denied" });
    await assert.rejects(withWorkerEnv(env, () => enforceAccountRestriction(uid, "consumeTokens")), { code: "permission-denied" });
  });
});

test("limited accounts can call only the selected action categories", async () => {
  const env = environment();
  await withMockedGoogleFetch({ accessMode: "limited", allowedActions: ["chat"] }, null, async () => {
    await assert.doesNotReject(withWorkerEnv(env, () => enforceAccountRestriction(uid, "findChatUser")));
    await assert.rejects(withWorkerEnv(env, () => enforceAccountRestriction(uid, "submitLipaApplication")), { code: "permission-denied" });
    await assert.rejects(withWorkerEnv(env, () => enforceAccountRestriction(uid, "createTokenPurchaseOrder")), { code: "permission-denied" });
  });
});

test("Lipa, NIDA and service admin lists use bounded newest-first timestamp-plus-document-ID pages", async () => {
  const env = environment();
  const originalFetch = globalThis.fetch;
  const calls: Array<{ body: Record<string, any>; collection: string }> = [];
  const timestamp = "2026-10-28T10:00:00.123456789Z";
  const endpoints = [
    { name: "Lipa", handler: listLipaApplications, collection: "lipaApplications", responseKey: "applications", scope: "admin:lipaApplications", timeField: "submittedAt", filterField: "status", id: "application_z" },
    { name: "NIDA", handler: listNidaRequests, collection: "nidaRequests", responseKey: "requests", scope: "admin:nidaRequests", timeField: "submittedAt", filterField: "status", id: "application_z" },
    { name: "service", handler: listServiceApplications, collection: "serviceApplications", responseKey: "applications", scope: "admin:serviceApplications", timeField: "submittedAt", filterField: "status", id: "application_z" },
    { name: "users", handler: listAdminUsers, collection: "users", responseKey: "users", scope: "admin:users", timeField: "createdAt", filterField: "accountStatus", id: "user_z" },
  ] as const;

  globalThis.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = input instanceof URL ? input.href : typeof input === "string" ? input : input.url;
    const method = init.method ?? "GET";
    if (url.includes("oauth2.googleapis.com/token")) return jsonResponse({ access_token: "test-access-token", expires_in: 3600 });
    const profileMatch = /\/documents\/users\/([^/?]+)/.exec(url);
    if (profileMatch) return jsonResponse(firestoreDocument(`users/${profileMatch[1]}`, { role: "super_admin", phone: "255698232313" }));
    if (url.includes(":runQuery")) {
      const body = typeof init.body === "string" ? JSON.parse(init.body) as Record<string, any> : {};
      const collection = String(body.structuredQuery?.from?.[0]?.collectionId ?? "");
      calls.push({ body, collection });
      if (body.structuredQuery?.startAt) return jsonResponse([]);
      const root = `projects/worker-handler-test/databases/(default)/documents/${collection}`;
      const timeField = collection === "users" ? "createdAt" : "submittedAt";
      const filterField = collection === "users" ? "accountStatus" : "status";
      const firstId = collection === "users" ? "user_z" : "application_z";
      const secondId = collection === "users" ? "user_a" : "application_a";
      return jsonResponse([
        { document: { name: `${root}/${firstId}`, fields: { [timeField]: { timestampValue: timestamp }, [filterField]: { stringValue: "PENDING" }, password: { stringValue: "must-not-leak" } } } },
        { document: { name: `${root}/${secondId}`, fields: { [timeField]: { timestampValue: timestamp }, [filterField]: { stringValue: "PENDING" }, password: { stringValue: "must-not-leak" } } } },
      ]);
    }
    throw new Error(`Unexpected mocked request: ${method} ${url}`);
  };

  try {
    await withWorkerEnv(env, async () => {
      for (const endpoint of endpoints) {
        calls.length = 0;
        const first = await endpoint.handler.handler({ auth: { uid: "admin-pagination-test" }, data: { pageSize: 1, status: "PENDING" } } as any) as Record<string, any>;
        const rows = first[endpoint.responseKey] as Array<Record<string, any>>;
        assert.equal(rows.length, 1, `${endpoint.name} returns a single bounded page`);
        assert.equal(rows[0]?.id, endpoint.id, `${endpoint.name} retains descending document-ID tie-break order`);
        if (endpoint.collection === "users") assert.equal(rows[0]?.password, undefined, "user pagination does not expose password fields");
        assert.equal(first.hasMore, true);
        assert.ok(first.nextCursor);
        const cursorData = JSON.parse(Buffer.from(first.nextCursor, "base64url").toString("utf8"));
        const { issuedAt, ...cursorPayload } = cursorData;
        assert.ok(Number.isSafeInteger(issuedAt) && issuedAt <= Date.now() && issuedAt > Date.now() - 1000);
        assert.deepEqual(cursorPayload, { version: 2, scope: `${endpoint.scope}|status=PENDING`, id: endpoint.id, timestamp });

        await endpoint.handler.handler({ auth: { uid: "admin-pagination-test" }, data: { pageSize: 1, status: "PENDING", cursor: first.nextCursor } } as any);
        assert.equal(calls.length, 2);
        for (const { body, collection } of calls) {
          assert.equal(collection, endpoint.collection);
          const query = body.structuredQuery;
          assert.equal(query.limit, 2, `${endpoint.name} fetches one lookahead row, not the full collection`);
          assert.deepEqual(query.orderBy, [
            { field: { fieldPath: endpoint.timeField }, direction: "DESCENDING" },
            { field: { fieldPath: "__name__" }, direction: "DESCENDING" },
          ]);
          assert.deepEqual(query.where?.fieldFilter, { field: { fieldPath: endpoint.filterField }, op: "EQUAL", value: { stringValue: "PENDING" } });
        }
        assert.deepEqual(calls[1]?.body.structuredQuery.startAt, { before: false, values: [
          { timestampValue: timestamp },
          { referenceValue: `projects/worker-handler-test/databases/(default)/documents/${endpoint.collection}/${endpoint.id}` },
        ] });
        const queryCount = calls.length;
        const oldCursor = Buffer.from(JSON.stringify({ version: 1, scope: `${endpoint.scope}|status=PENDING`, id: endpoint.id, timestamp }), "utf8").toString("base64url");
        await assert.rejects(
          async () => await endpoint.handler.handler({ auth: { uid: "admin-pagination-test" }, data: { pageSize: 1, status: "PENDING", cursor: oldCursor } } as any),
          (error: any) => error?.code === "invalid-argument",
          `${endpoint.name} rejects old cursor format safely`,
        );
        assert.equal(calls.length, queryCount, `${endpoint.name} rejects old cursor before runQuery`);
      }
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
