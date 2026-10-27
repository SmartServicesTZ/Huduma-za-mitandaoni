/**
 * Adapter-neutral, resumable Firestore -> D1 backfill orchestration.
 *
 * This module deliberately contains no Firebase credentials, network adapter, D1 SQL,
 * production binding, or implicit domain mapping. Callers must supply an approved
 * source reader, explicit mapper, target upsert implementation, and checkpoint store.
 * Tests use synthetic fixtures only.
 */

export interface FirestoreExportDocument {
  id: string;
  data: Record<string, unknown>;
}

export interface FirestoreExportPage {
  documents: FirestoreExportDocument[];
  nextCursor: string | null;
}

export interface FirestorePageReader {
  readPage(input: {
    collection: string;
    cursor: string | null;
    pageSize: number;
  }): Promise<FirestoreExportPage>;
}

export interface MappedMigrationRecord {
  targetId: string;
  values: Record<string, unknown>;
}

export interface IdempotentMigrationTarget {
  upsert(input: {
    collection: string;
    id: string;
    values: Record<string, unknown>;
    idempotencyKey: string;
    recordChecksum: string;
  }): Promise<void>;
}

export type BackfillStatus = "started" | "completed";

export interface BackfillCheckpoint {
  migrationId: string;
  collection: string;
  cursor: string | null;
  processedCount: number;
  rollingChecksum: string;
  status: BackfillStatus;
}

export interface BackfillCheckpointStore {
  load(migrationId: string, collection: string): Promise<BackfillCheckpoint | null>;
  save(checkpoint: BackfillCheckpoint): Promise<void>;
}

export interface CollectionMigrationOptions {
  migrationId: string;
  collection: string;
  pageSize?: number;
  resume?: boolean;
  reader: FirestorePageReader;
  target: IdempotentMigrationTarget;
  checkpoints: BackfillCheckpointStore;
  mapDocument(document: FirestoreExportDocument): MappedMigrationRecord;
}

export interface CollectionMigrationResult {
  migrationId: string;
  collection: string;
  processedCount: number;
  checksum: string;
  resumedFromCursor: boolean;
}

const MAX_PAGE_SIZE = 500;
const EMPTY_CHECKSUM = "0".repeat(64);

function requireLabel(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 160) {
    throw new Error(`${name} must contain 1 to 160 characters.`);
  }
  return normalized;
}

function requirePageSize(value: number | undefined): number {
  const size = value ?? 100;
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_PAGE_SIZE) {
    throw new Error(`pageSize must be an integer from 1 to ${MAX_PAGE_SIZE}.`);
  }
  return size;
}

function jsonScalar(value: null | string | boolean | number): string {
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error("Migration values must be JSON-compatible.");
  return encoded;
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return jsonScalar(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Migration values cannot contain non-finite numbers.");
    return jsonScalar(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(",")}}`;
  }
  throw new Error("Migration values must be JSON-compatible.");
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Backfill one explicitly mapped collection. A checkpoint is committed only after
 * every document in a page has been idempotently upserted, so a failed page can
 * safely be replayed. The reader must provide a stable, deterministic page order.
 */
export async function migrateFirestoreCollection(
  options: CollectionMigrationOptions,
): Promise<CollectionMigrationResult> {
  const migrationId = requireLabel(options.migrationId, "migrationId");
  const collection = requireLabel(options.collection, "collection");
  const pageSize = requirePageSize(options.pageSize);

  let checkpoint = options.resume === false
    ? null
    : await options.checkpoints.load(migrationId, collection);

  if (checkpoint && (checkpoint.migrationId !== migrationId || checkpoint.collection !== collection)) {
    throw new Error("Checkpoint identity does not match the requested migration.");
  }
  if (checkpoint?.status === "completed") {
    return {
      migrationId,
      collection,
      processedCount: checkpoint.processedCount,
      checksum: checkpoint.rollingChecksum,
      resumedFromCursor: checkpoint.cursor !== null,
    };
  }

  let cursor = checkpoint?.cursor ?? null;
  let processedCount = checkpoint?.processedCount ?? 0;
  let rollingChecksum = checkpoint?.rollingChecksum ?? EMPTY_CHECKSUM;
  const resumedFromCursor = cursor !== null;

  await options.checkpoints.save({
    migrationId, collection, cursor, processedCount, rollingChecksum, status: "started",
  });

  while (true) {
    const page = await options.reader.readPage({ collection, cursor, pageSize });
    if (!Array.isArray(page.documents)) throw new Error("Source page has no documents array.");
    if (page.nextCursor !== null && (typeof page.nextCursor !== "string" || page.nextCursor.length === 0)) {
      throw new Error("Source page cursor must be a non-empty string or null.");
    }
    if (page.documents.length > pageSize) throw new Error("Source page exceeds the requested page size.");

    const ids = new Set<string>();
    const orderedDocuments = [...page.documents].sort((a, b) => a.id.localeCompare(b.id));
    // Validate the whole page before any target write, so malformed pages fail closed.
    for (const document of orderedDocuments) {
      const sourceId = requireLabel(document.id, "source document ID");
      if (ids.has(sourceId)) throw new Error("Source page contains duplicate document IDs.");
      ids.add(sourceId);
    }

    for (const document of orderedDocuments) {
      const sourceId = document.id.trim();
      const mapped = options.mapDocument(document);
      const targetId = requireLabel(mapped.targetId, "target document ID");
      const recordChecksum = await sha256(canonicalize({ id: targetId, values: mapped.values }));
      const idempotencyKey = await sha256(`${migrationId}\n${collection}\n${sourceId}\n${recordChecksum}`);

      await options.target.upsert({
        collection,
        id: targetId,
        values: mapped.values,
        idempotencyKey,
        recordChecksum,
      });
      rollingChecksum = await sha256(`${rollingChecksum}\n${sourceId}\n${recordChecksum}`);
      processedCount += 1;
    }

    // Save cursor only after every upsert in the page has succeeded.
    cursor = page.nextCursor;
    const completed = cursor === null;
    await options.checkpoints.save({
      migrationId, collection, cursor, processedCount, rollingChecksum,
      status: completed ? "completed" : "started",
    });

    if (completed) {
      return { migrationId, collection, processedCount, checksum: rollingChecksum, resumedFromCursor };
    }
  }
}
