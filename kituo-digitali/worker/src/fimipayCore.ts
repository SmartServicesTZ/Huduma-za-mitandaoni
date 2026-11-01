import { createHmac, timingSafeEqual } from "node:crypto";

/** SmartServicesTZ test pricing: every TZS 100 purchases exactly 1 service token. */
export function tokenCreditsForAmount(amount: unknown): number | null {
  const value = Number(amount);
  if (!Number.isSafeInteger(value) || value < 500 || value % 500 !== 0) return null;
  const tokens = (value / 500) * 3;
  return Number.isSafeInteger(tokens) ? tokens : null;
}

function decodeSignature(value: unknown): Uint8Array | null {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/i.test(value)) return null;
  return Uint8Array.from(value.match(/.{2}/g) ?? [], (pair) => Number.parseInt(pair, 16));
}

function safeEqual(expected: Uint8Array, supplied: Uint8Array | null) {
  return Boolean(supplied && supplied.length === expected.length && timingSafeEqual(expected, supplied));
}

/** Legacy V1: HMAC-SHA256 over the exact raw HTTP body bytes. */
export function verifyFimipayWebhookSignature(rawBody: Uint8Array, signatureHeader: unknown, secret: string) {
  if (!secret || !(rawBody instanceof Uint8Array)) return false;
  const supplied = decodeSignature(signatureHeader);
  if (!supplied) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  return safeEqual(expected, supplied);
}

/** V3 V2: HMAC-SHA256(timestamp + "." + nonce + "." + path + "." + exact raw body). */
export function verifyFimipayWebhookV2Signature(
  rawBody: Uint8Array,
  signatureHeader: unknown,
  secret: string,
  timestamp: unknown,
  nonce: unknown,
  path: unknown,
  nowMs = Date.now(),
  toleranceMs = 5 * 60 * 1000,
) {
  if (!secret || !(rawBody instanceof Uint8Array)) return false;
  if (typeof timestamp !== "string" || !/^\d{10,13}$/.test(timestamp)) return false;
  if (typeof nonce !== "string" || !/^[A-Za-z0-9._~-]{8,200}$/.test(nonce)) return false;
  if (typeof path !== "string" || !path.startsWith("/") || path.includes("?") || path.includes("#")) return false;

  const numericTimestamp = Number(timestamp);
  const timestampMs = timestamp.length <= 10 ? numericTimestamp * 1000 : numericTimestamp;
  if (!Number.isSafeInteger(timestampMs) || Math.abs(nowMs - timestampMs) > toleranceMs) return false;

  const supplied = decodeSignature(signatureHeader);
  if (!supplied) return false;
  // Preserve the exact request bytes after the signed metadata prefix.
  const prefix = new TextEncoder().encode(`${timestamp}.${nonce}.${path}.`);
  const expected = createHmac("sha256", secret).update(prefix).update(rawBody).digest();
  return safeEqual(expected, supplied);
}

export function isFimipaySuccessEvent(event: Record<string, unknown>) {
  return String(event.event ?? "").toLowerCase() === "payment.success"
    || [event.payment_status, event.status].some((value) => ["SUCCESS", "COMPLETED"].includes(String(value ?? "").toUpperCase()));
}

export function fimipayTerminalStatus(event: Record<string, unknown>) {
  const statuses = [event.payment_status, event.status].map((value) => String(value ?? "").toUpperCase());
  const terminal = statuses.find((status) => ["FAILED", "CANCELLED", "USER_CANCELLED", "REJECTED", "EXPIRED"].includes(status));
  if (terminal) return terminal;
  const type = String(event.event ?? "").toLowerCase();
  if (type === "payment.failed") return "FAILED";
  if (type === "payment.cancelled" || type === "payment.canceled") return "CANCELLED";
  return null;
}

export function isConfirmedLivePayment(
  order: Record<string, unknown> | undefined,
  orderId: string,
  amount: number,
  currency = "TZS",
) {
  const status = [order?.payment_status, order?.status].map((value) => String(value ?? "").toUpperCase());
  return Boolean(order)
    && String(order?.order_id ?? "") === orderId
    && status.some((value) => value === "SUCCESS" || value === "COMPLETED")
    && Number(order?.amount) === amount
    && String(order?.currency ?? "").toUpperCase() === currency
    && order?.simulated === false
    && ["", "live", "production"].includes(String(order?.environment ?? "").trim().toLowerCase());
}

export function fimipayCredentialMode(secret: unknown, environment: unknown): "LIVE" | "TEST" | null {
  if (typeof secret !== "string") return null;
  if (secret.startsWith("sk_live_")) return "LIVE";
  if (secret.startsWith("sk_test_") && String(environment ?? "").trim().toLowerCase() === "test") return "TEST";
  return null;
}

export function shouldCreditTokenPurchase(input: {
  orderStatus: unknown;
  settled: unknown;
  ledgerExists: boolean;
  ledgerMatches: boolean;
}): "CREDIT" | "DUPLICATE" | "REVIEW" {
  if (input.ledgerExists) return input.ledgerMatches ? "DUPLICATE" : "REVIEW";
  if (String(input.orderStatus ?? "").toUpperCase() === "PAID" || input.settled === true) return "REVIEW";
  return "CREDIT";
}
