/**
 * Isolated D1 repository primitives for the SmartServicesTZ migration POC.
 * This module is deliberately not wired into production request handlers.
 */
export interface D1ReadBinding {
  prepare(query: string): {
    bind(...values: unknown[]): {
      first<T = Record<string, unknown>>(): Promise<T | null>;
      all<T = Record<string, unknown>>(): Promise<{ results: T[]; success?: boolean }>;
    };
  };
}

export interface D1UserRow {
  uid: string;
  phone: string | null;
  display_name: string | null;
  role: "user" | "admin" | "super_admin";
  active: number;
  created_at: string;
  updated_at: string;
}

export interface D1ServiceRow {
  id: string;
  title: string;
  category: string | null;
  description: string | null;
  price_tzs: number;
  visible: number;
  sort_order: number;
  payload_json: string;
  updated_at: string;
}

export interface D1TokenBalanceRow {
  uid: string;
  nida_tokens: number;
  service_tokens: number;
  updated_at: string;
}

export interface D1TokenLedgerRow {
  id: string;
  uid: string;
  token_type: "nida" | "service";
  delta: number;
  reason: string;
  reference_id: string | null;
  idempotency_key: string;
  actor_uid: string | null;
  created_at: string;
}

function assertUid(uid: string): string {
  const normalized = uid.trim();
  if (!normalized || normalized.length > 256) throw new Error("A valid user ID is required.");
  return normalized;
}

/** Fetch only the requested user's public account fields. */
export async function getD1User(db: D1ReadBinding, uid: string): Promise<D1UserRow | null> {
  return db.prepare(
    "SELECT uid, phone, display_name, role, active, created_at, updated_at FROM users WHERE uid = ? LIMIT 1",
  ).bind(assertUid(uid)).first<D1UserRow>();
}

/** List visible services in their configured display order. */
export async function listD1VisibleServices(db: D1ReadBinding): Promise<D1ServiceRow[]> {
  const result = await db.prepare(
    "SELECT id, title, category, description, price_tzs, visible, sort_order, payload_json, updated_at FROM services WHERE visible = 1 ORDER BY sort_order ASC, title ASC",
  ).bind().all<D1ServiceRow>();
  if (result.success === false) throw new Error("D1 service query failed.");
  return result.results;
}

/** Read token balances without mutating the ledger or balances. */
export async function getD1TokenBalance(db: D1ReadBinding, uid: string): Promise<D1TokenBalanceRow | null> {
  return db.prepare(
    "SELECT uid, nida_tokens, service_tokens, updated_at FROM token_balances WHERE uid = ? LIMIT 1",
  ).bind(assertUid(uid)).first<D1TokenBalanceRow>();
}

/** Read permissions for one user; authorization decisions remain outside this PoC repository. */
export async function listD1UserPermissions(db: D1ReadBinding, uid: string): Promise<string[]> {
  const result = await db.prepare(
    "SELECT permission FROM user_permissions WHERE uid = ? ORDER BY permission ASC",
  ).bind(assertUid(uid)).all<{ permission: string }>();
  if (result.success === false) throw new Error("D1 permission query failed.");
  return result.results.map((row) => row.permission);
}

/** Read a bounded token ledger page; this method never mutates balances or ledger rows. */
export async function listD1TokenLedger(db: D1ReadBinding, uid: string, limit = 50): Promise<D1TokenLedgerRow[]> {
  const boundedLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 1), 100) : 50;
  const result = await db.prepare(
    "SELECT id, uid, token_type, delta, reason, reference_id, idempotency_key, actor_uid, created_at FROM token_ledger WHERE uid = ? ORDER BY created_at DESC, id DESC LIMIT ?",
  ).bind(assertUid(uid), boundedLimit).all<D1TokenLedgerRow>();
  if (result.success === false) throw new Error("D1 token ledger query failed.");
  return result.results;
}
