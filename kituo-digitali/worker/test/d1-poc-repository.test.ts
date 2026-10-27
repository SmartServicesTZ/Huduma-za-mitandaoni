import { test } from "node:test";
import assert from "node:assert/strict";
import { getD1TokenBalance, getD1User, listD1VisibleServices, type D1ReadBinding } from "../src/d1-poc-repository.js";

function mockDb(firstResult: unknown = null, allResult: unknown[] = []) {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const db: D1ReadBinding = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          calls.push({ sql, values });
          return {
            async first<T>() { return firstResult as T | null; },
            async all<T>() { return { results: allResult as T[], success: true }; },
          };
        },
      };
    },
  };
  return { db, calls };
}

test("getD1User uses a bound UID and selects only expected fields", async () => {
  const row = { uid: "user-1", phone: null, display_name: "Test", role: "user", active: 1, created_at: "now", updated_at: "now" };
  const { db, calls } = mockDb(row);
  assert.deepEqual(await getD1User(db, " user-1 "), row);
  assert.deepEqual(calls[0].values, ["user-1"]);
  assert.match(calls[0].sql, /WHERE uid = \?/);
});

test("getD1User rejects empty UID before querying", async () => {
  const { db, calls } = mockDb();
  await assert.rejects(() => getD1User(db, "  "), /valid user ID/);
  assert.equal(calls.length, 0);
});

test("listD1VisibleServices filters and orders visible services", async () => {
  const rows = [{ id: "svc-1", title: "Test", category: null, description: null, price_tzs: 0, visible: 1, sort_order: 1, payload_json: "{}", updated_at: "now" }];
  const { db, calls } = mockDb(null, rows);
  assert.deepEqual(await listD1VisibleServices(db), rows);
  assert.match(calls[0].sql, /WHERE visible = 1 ORDER BY sort_order ASC/);
});

test("getD1TokenBalance uses a bound UID and performs a read-only query", async () => {
  const row = { uid: "user-1", nida_tokens: 2, service_tokens: 5, updated_at: "now" };
  const { db, calls } = mockDb(row);
  assert.deepEqual(await getD1TokenBalance(db, "user-1"), row);
  assert.match(calls[0].sql, /^SELECT/);
  assert.deepEqual(calls[0].values, ["user-1"]);
});
