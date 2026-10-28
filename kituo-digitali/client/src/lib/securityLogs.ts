import {
  collection,
  documentId,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase";

export const SECURITY_LOG_PAGE_SIZE = 100;
export type SecurityLog = { id: string; createdAt?: unknown; [key: string]: unknown };
type SecurityLogCursor = {
  dated: QueryDocumentSnapshot<DocumentData> | null;
  undated: QueryDocumentSnapshot<DocumentData> | null;
  datedHasMore: boolean;
  undatedHasMore: boolean;
};
export type SecurityLogPage = {
  rows: SecurityLog[];
  cursor: SecurityLogCursor | null;
  hasMore: boolean;
};

/**
 * Read security events in bounded pages. Timestamped events are newest-first;
 * legacy events lacking createdAt are scanned separately by document ID so the
 * createdAt ordering does not silently make them inaccessible.
 */
export async function getRecentSecurityLogs(
  name: "adminActions" | "auditLogs",
  cursor?: SecurityLogCursor | null,
): Promise<SecurityLogPage> {
  const timestampQuery = query(
    collection(firestore, name),
    orderBy("createdAt", "desc"),
    ...(cursor?.dated ? [startAfter(cursor.dated)] : []),
    limit(SECURITY_LOG_PAGE_SIZE),
  );
  const timestampSnapshot = await getDocs(timestampQuery);
  const datedRows = timestampSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  let rows: SecurityLog[] = [...datedRows];
  let datedCursor = timestampSnapshot.docs.at(-1) ?? cursor?.dated ?? null;
  let datedHasMore = timestampSnapshot.size === SECURITY_LOG_PAGE_SIZE;
  let undatedCursor = cursor?.undated ?? null;
  let undatedHasMore = cursor?.undatedHasMore ?? true;

  // Fill short dated pages with legacy rows; continue this cursor on later pages
  // until every no-createdAt document can be reached, without changing the old data.
  if (rows.length < SECURITY_LOG_PAGE_SIZE && undatedHasMore) {
    const undatedQuery = query(
      collection(firestore, name),
      orderBy(documentId(), "asc"),
      ...(undatedCursor ? [startAfter(undatedCursor)] : []),
      limit(SECURITY_LOG_PAGE_SIZE),
    );
    const undatedSnapshot = await getDocs(undatedQuery);
    undatedHasMore = undatedSnapshot.size === SECURITY_LOG_PAGE_SIZE;
    const datedIds = new Set(rows.map((row) => row.id));
    for (const item of undatedSnapshot.docs) {
      undatedCursor = item;
      const data = item.data();
      if (data.createdAt != null || datedIds.has(item.id)) continue;
      rows.push({ id: item.id, ...data });
      if (rows.length === SECURITY_LOG_PAGE_SIZE) break;
    }
    if (undatedSnapshot.empty) undatedHasMore = false;
  }

  const hasMore = datedHasMore || undatedHasMore;
  return {
    rows,
    cursor: hasMore ? { dated: datedCursor, undated: undatedCursor, datedHasMore, undatedHasMore } : null,
    hasMore,
  };
}
