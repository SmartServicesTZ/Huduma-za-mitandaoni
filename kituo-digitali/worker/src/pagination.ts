import { Buffer } from "node:buffer";
import { FirestoreTimestamp, isValidFirestoreDocumentId } from "./firestore-rest.js";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 50;
const MAX_CURSOR_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_CURSOR_FUTURE_SKEW_MS = 5 * 60 * 1000;

export type PageInput = {
  pageSize: number;
  startAfter?: string;
  startAfterTimestamp?: FirestoreTimestamp;
  status?: string;
  cursorScope: string;
};

type CursorPayload = { version: 2; scope: string; id: string; timestamp: string; issuedAt: number };

export function encodePageCursor(id: string, timestamp: unknown, scope: string) {
  if (!isValidFirestoreDocumentId(id)) throw new Error("Invalid page cursor document ID.");
  const exactTimestamp = timestamp instanceof FirestoreTimestamp
    ? timestamp.toFirestoreValue()
    : timestamp instanceof Date && Number.isFinite(timestamp.getTime())
      ? timestamp.toISOString()
      : typeof timestamp === "string"
        ? new FirestoreTimestamp(timestamp).toFirestoreValue()
        : null;
  if (!exactTimestamp) throw new Error("Invalid page cursor timestamp.");
  const payload: CursorPayload = { version: 2, scope, id, timestamp: exactTimestamp, issuedAt: Date.now() };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function parsePageInput(value: unknown, scope: string): PageInput {
  const data = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const rawSize = Number(data.pageSize ?? DEFAULT_PAGE_SIZE);
  const pageSize = Number.isInteger(rawSize) ? Math.min(MAX_PAGE_SIZE, Math.max(1, rawSize)) : DEFAULT_PAGE_SIZE;
  const status = typeof data.status === "string" && data.status.trim() ? data.status.trim().slice(0, 80) : undefined;
  const cursorScope = `${scope}|status=${status ?? "*"}`;
  const cursor = data.cursor === undefined || data.cursor === null || data.cursor === "" ? undefined : data.cursor;
  let startAfter: string | undefined;
  let startAfterTimestamp: FirestoreTimestamp | undefined;

  if (cursor !== undefined) {
    if (typeof cursor !== "string" || cursor.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error("Invalid page cursor.");
    try {
      const decoded = Buffer.from(cursor, "base64url").toString("utf8");
      if (Buffer.from(decoded, "utf8").toString("base64url") !== cursor) throw new Error("invalid base64");
      const parsed = JSON.parse(decoded) as Partial<CursorPayload>;
      const now = Date.now();
      if (parsed.version !== 2 || parsed.scope !== cursorScope || !isValidFirestoreDocumentId(parsed.id) || typeof parsed.timestamp !== "string" || !Number.isSafeInteger(parsed.issuedAt) || (parsed.issuedAt as number) > now + MAX_CURSOR_FUTURE_SKEW_MS || now - (parsed.issuedAt as number) > MAX_CURSOR_AGE_MS) throw new Error("invalid or stale cursor");
      startAfterTimestamp = new FirestoreTimestamp(parsed.timestamp);
      startAfter = parsed.id;
    } catch {
      throw new Error("Cursor ya ukurasa si sahihi au imepitwa na wakati. Fungua ukurasa tena.");
    }
  }

  return { pageSize, startAfter, startAfterTimestamp, status, cursorScope };
}
