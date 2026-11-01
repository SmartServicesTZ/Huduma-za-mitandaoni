import assert from "node:assert/strict";
import test from "node:test";
import {
  migrateFirestoreCollection,
  type BackfillCheckpoint,
  type BackfillCheckpointStore,
  type FirestoreExportPage,
  type FirestorePageReader,
  type IdempotentMigrationTarget,
} from "../src/firestore-d1-backfill.js";

function fixtureHarness(pages: FirestoreExportPage[]) {
  const checkpoints = new Map<string, BackfillCheckpoint>();
  const writes: Array<{ collection: string; id: string; values: Record<string, unknown>; idempotencyKey: string; recordChecksum: string }> = [];
  const reads: Array<{ collection: string; cursor: string | null; pageSize: number }> = [];
  const reader: FirestorePageReader = {
    async readPage(input) {
      reads.push(input);
      const index = input.cursor === null ? 0 : Number(input.cursor);
      const page = pages[index];
      if (!page) throw new Error("Unexpected synthetic page request.");
      return page;
    },
  };
  const target: IdempotentMigrationTarget = {
    async upsert(input) { writes.push(input); },
  };
  const store: BackfillCheckpointStore = {
    async load(migrationId, collection) {
      return checkpoints.get(`${migrationId}:${collection}`) ?? null;
    },
    async save(checkpoint) {
      checkpoints.set(`${checkpoint.migrationId}:${checkpoint.collection}`, checkpoint);
    },
  };
  return { reader, target, store, checkpoints, writes, reads };
}

test("backfill processes synthetic pages and records a completed checkpoint", async () => {
  const h = fixtureHarness([
    { documents: [{ id: "b", data: { name: "B" } }, { id: "a", data: { name: "A" } }], nextCursor: "1" },
    { documents: [{ id: "c", data: { name: "C" } }], nextCursor: null },
  ]);
  const result = await migrateFirestoreCollection({
    migrationId: "synthetic-users-v1",
    collection: "users",
    pageSize: 2,
    reader: h.reader,
    target: h.target,
    checkpoints: h.store,
    mapDocument: (doc) => ({ targetId: doc.id, values: { profile: doc.data } }),
  });

  assert.equal(result.processedCount, 3);
  assert.equal(result.checksum.length, 64);
  assert.equal(h.writes.length, 3);
  assert.deepEqual(h.writes.map((write) => write.id), ["a", "b", "c"]);
  assert.equal(new Set(h.writes.map((write) => write.idempotencyKey)).size, 3);
  assert.equal(h.checkpoints.get("synthetic-users-v1:users")?.status, "completed");
  assert.equal(h.checkpoints.get("synthetic-users-v1:users")?.processedCount, 3);
});

test("completed migration is not read or written again when resumed", async () => {
  const h = fixtureHarness([{ documents: [{ id: "a", data: {} }], nextCursor: null }]);
  h.checkpoints.set("synthetic-v1:services", {
    migrationId: "synthetic-v1",
    collection: "services",
    cursor: null,
    processedCount: 4,
    rollingChecksum: "a".repeat(64),
    status: "completed",
  });

  const result = await migrateFirestoreCollection({
    migrationId: "synthetic-v1",
    collection: "services",
    reader: h.reader,
    target: h.target,
    checkpoints: h.store,
    mapDocument: (doc) => ({ targetId: doc.id, values: doc.data }),
  });

  assert.equal(result.processedCount, 4);
  assert.equal(result.checksum, "a".repeat(64));
  assert.equal(h.reads.length, 0);
  assert.equal(h.writes.length, 0);
});

test("retrying an uncheckpointed page uses stable idempotency keys", async () => {
  const h = fixtureHarness([{ documents: [{ id: "u1", data: { b: 2, a: 1 } }], nextCursor: null }]);
  const options = {
    migrationId: "synthetic-retry-v1",
    collection: "users",
    reader: h.reader,
    target: h.target,
    checkpoints: h.store,
    mapDocument: (doc: { id: string; data: Record<string, unknown> }) => ({
      targetId: doc.id,
      values: { profile: doc.data },
    }),
  };
  const first = await migrateFirestoreCollection(options);
  h.checkpoints.delete("synthetic-retry-v1:users");
  const second = await migrateFirestoreCollection(options);

  assert.equal(first.checksum, second.checksum);
  assert.equal(h.writes[0].idempotencyKey, h.writes[1].idempotencyKey);
});

test("invalid page sizes and duplicate source IDs fail closed", async () => {
  const h = fixtureHarness([{ documents: [{ id: "dup", data: {} }, { id: "dup", data: {} }], nextCursor: null }]);
  const options = {
    migrationId: "synthetic-invalid-v1",
    collection: "users",
    reader: h.reader,
    target: h.target,
    checkpoints: h.store,
    mapDocument: (doc: { id: string; data: Record<string, unknown> }) => ({ targetId: doc.id, values: doc.data }),
  };
  await assert.rejects(migrateFirestoreCollection({ ...options, pageSize: 501 }), /pageSize/);
  await assert.rejects(migrateFirestoreCollection(options), /duplicate document IDs/);
  assert.equal(h.writes.length, 0);
});

test("mapping must return JSON-compatible values before any target write", async () => {
  const h = fixtureHarness([{ documents: [{ id: "u1", data: {} }], nextCursor: null }]);
  await assert.rejects(migrateFirestoreCollection({
    migrationId: "synthetic-invalid-json-v1",
    collection: "users",
    reader: h.reader,
    target: h.target,
    checkpoints: h.store,
    mapDocument: (doc) => ({ targetId: doc.id, values: { bad: undefined } }),
  }), /JSON-compatible/);
  assert.equal(h.writes.length, 0);
});
