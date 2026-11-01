import assert from "node:assert/strict";
import test from "node:test";
import {
  compareMigrationSnapshots,
  getD1MigrationCheckpoint,
  upsertD1MigrationCheckpoint,
  type D1CheckpointBinding,
  type D1MigrationCheckpoint,
} from "../src/d1-migration-checkpoints.js";

const row: D1MigrationCheckpoint = {
  migration_id: "users-v1",
  status: "verified",
  source_count: 2,
  target_count: 2,
  checksum: "sha256:synthetic-fixture",
  notes: "Synthetic only",
  updated_at: "2026-10-27 00:00:00",
};

function mockDb(firstResult: D1MigrationCheckpoint | null = row) {
  const calls: Array<{ sql: string; values: unknown[]; method: "first" | "run" }> = [];
  const db: D1CheckpointBinding = {
    prepare(sql) {
      return {
        bind(...values: unknown[]) {
          return {
            async first<T>() {
              calls.push({ sql, values, method: "first" });
              return firstResult as T | null;
            },
            async run() {
              calls.push({ sql, values, method: "run" });
              return { success: true };
            },
          };
        },
      };
    },
  };
  return { db, calls };
}

test("migration checkpoint upsert binds metadata and returns the persisted row", async () => {
  const { db, calls } = mockDb();
  const checkpoint = await upsertD1MigrationCheckpoint(db, {
    migrationId: " users-v1 ",
    status: "verified",
    sourceCount: 2,
    targetCount: 2,
    checksum: "sha256:synthetic-fixture",
    notes: "Synthetic only",
  });

  assert.deepEqual(checkpoint, row);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].method, "run");
  assert.deepEqual(calls[0].values, ["users-v1", "verified", 2, 2, "sha256:synthetic-fixture", "Synthetic only"]);
  assert.doesNotMatch(calls[0].sql, /users-v1|synthetic-fixture|Synthetic only/);
  assert.match(calls[0].sql, /ON CONFLICT\(migration_id\) DO UPDATE/);
  assert.match(calls[0].sql, /WHERE migration_checkpoints\.status IS NOT excluded\.status/);
  assert.equal(calls[1].method, "first");
  assert.deepEqual(calls[1].values, ["users-v1"]);
});

test("migration checkpoint read uses a bound migration ID", async () => {
  const { db, calls } = mockDb();
  assert.deepEqual(await getD1MigrationCheckpoint(db, "users-v1"), row);
  assert.equal(calls[0].method, "first");
  assert.deepEqual(calls[0].values, ["users-v1"]);
  assert.doesNotMatch(calls[0].sql, /users-v1/);
});

test("checkpoint validation rejects empty IDs, negative counts, and invalid runtime statuses", async () => {
  const { db, calls } = mockDb();
  await assert.rejects(upsertD1MigrationCheckpoint(db, { migrationId: " ", status: "started" }), /Migration ID/);
  await assert.rejects(upsertD1MigrationCheckpoint(db, { migrationId: "users-v1", status: "started", sourceCount: -1 }), /non-negative/);
  await assert.rejects(upsertD1MigrationCheckpoint(db, { migrationId: "users-v1", status: "unsafe" as "started" }), /Invalid migration status/);
  assert.equal(calls.length, 0);
});

test("reconciliation compares both record counts and caller-computed checksums", () => {
  assert.deepEqual(compareMigrationSnapshots(
    { count: 12, checksum: "sha256:abc" },
    { count: 12, checksum: "sha256:abc" },
  ), { countsMatch: true, checksumsMatch: true, matches: true });

  assert.deepEqual(compareMigrationSnapshots(
    { count: 12, checksum: "sha256:abc" },
    { count: 11, checksum: "sha256:def" },
  ), { countsMatch: false, checksumsMatch: false, matches: false });
});

test("reconciliation rejects invalid snapshot counts", () => {
  assert.throws(() => compareMigrationSnapshots(
    { count: Number.NaN, checksum: "sha256:abc" },
    { count: 1, checksum: "sha256:abc" },
  ), /non-negative safe integer/);
});
