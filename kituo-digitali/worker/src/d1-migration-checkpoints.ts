/**
 * Isolated D1 bookkeeping primitives for resumable migration rehearsal.
 * This module does not read Firestore, copy application records, or participate in production handlers.
 */
export interface D1CheckpointBinding {
  prepare(query: string): {
    bind(...values: unknown[]): {
      first<T = Record<string, unknown>>(): Promise<T | null>;
      run(): Promise<{ success?: boolean }>;
    };
  };
}

export type D1MigrationStatus = "started" | "verified" | "failed";

export interface D1MigrationCheckpoint {
  migration_id: string;
  status: D1MigrationStatus;
  source_count: number | null;
  target_count: number | null;
  checksum: string | null;
  notes: string | null;
  updated_at: string;
}

export interface D1MigrationCheckpointInput {
  migrationId: string;
  status: D1MigrationStatus;
  sourceCount?: number | null;
  targetCount?: number | null;
  checksum?: string | null;
  notes?: string | null;
}

function requiredMigrationId(value: string): string {
  const id = value.trim();
  if (!id || id.length > 128) throw new Error("Migration ID must contain 1 to 128 characters.");
  return id;
}

function nullableCount(value: number | null | undefined, field: string): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${field} must be a non-negative safe integer.`);
  return value;
}

function nullableText(value: string | null | undefined, field: string, maxLength: number): string | null {
  if (value === null || value === undefined) return null;
  if (value.length > maxLength) throw new Error(`${field} exceeds ${maxLength} characters.`);
  return value;
}

/** Store one checkpoint with bound values; repeating the same input is state-idempotent. */
export async function upsertD1MigrationCheckpoint(
  db: D1CheckpointBinding,
  input: D1MigrationCheckpointInput,
): Promise<D1MigrationCheckpoint> {
  const migrationId = requiredMigrationId(input.migrationId);
  if (!["started", "verified", "failed"].includes(input.status)) throw new Error("Invalid migration status.");
  const sourceCount = nullableCount(input.sourceCount, "sourceCount");
  const targetCount = nullableCount(input.targetCount, "targetCount");
  const checksum = nullableText(input.checksum, "checksum", 256);
  const notes = nullableText(input.notes, "notes", 1000);

  const write = await db.prepare(`
    INSERT INTO migration_checkpoints
      (migration_id, status, source_count, target_count, checksum, notes)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(migration_id) DO UPDATE SET
      status = excluded.status,
      source_count = excluded.source_count,
      target_count = excluded.target_count,
      checksum = excluded.checksum,
      notes = excluded.notes,
      updated_at = CURRENT_TIMESTAMP
    WHERE migration_checkpoints.status IS NOT excluded.status
       OR migration_checkpoints.source_count IS NOT excluded.source_count
       OR migration_checkpoints.target_count IS NOT excluded.target_count
       OR migration_checkpoints.checksum IS NOT excluded.checksum
       OR migration_checkpoints.notes IS NOT excluded.notes
  `).bind(migrationId, input.status, sourceCount, targetCount, checksum, notes).run();
  if (write.success === false) throw new Error("D1 migration checkpoint write failed.");
  const checkpoint = await getD1MigrationCheckpoint(db, migrationId);
  if (!checkpoint) throw new Error("D1 migration checkpoint was not persisted.");
  return checkpoint;
}

export async function getD1MigrationCheckpoint(
  db: D1CheckpointBinding,
  migrationId: string,
): Promise<D1MigrationCheckpoint | null> {
  return db.prepare(`
    SELECT migration_id, status, source_count, target_count, checksum, notes, updated_at
    FROM migration_checkpoints
    WHERE migration_id = ?
    LIMIT 1
  `).bind(requiredMigrationId(migrationId)).first<D1MigrationCheckpoint>();
}

export interface MigrationSnapshot {
  count: number;
  checksum: string;
}

export interface MigrationReconciliation {
  countsMatch: boolean;
  checksumsMatch: boolean;
  matches: boolean;
}

/** Compare already-computed source/target snapshots; no records are read or changed here. */
export function compareMigrationSnapshots(source: MigrationSnapshot, target: MigrationSnapshot): MigrationReconciliation {
  nullableCount(source.count, "source.count");
  nullableCount(target.count, "target.count");
  nullableText(source.checksum, "source.checksum", 256);
  nullableText(target.checksum, "target.checksum", 256);
  const countsMatch = source.count === target.count;
  const checksumsMatch = source.checksum === target.checksum;
  return { countsMatch, checksumsMatch, matches: countsMatch && checksumsMatch };
}
