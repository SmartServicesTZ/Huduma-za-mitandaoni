import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const TOKEN_PACKAGES = {
  500: 3,
  2000: 40,
  5000: 100,
  10000: 200,
} as const;

export type TokenPackageAmount = keyof typeof TOKEN_PACKAGES;

export function tokenCreditsForAmount(amount: unknown): number | null {
  const value = Number(amount);
  return Number.isSafeInteger(value) && Object.hasOwn(TOKEN_PACKAGES, value)
    ? TOKEN_PACKAGES[value as TokenPackageAmount]
    : null;
}

export function makeTokenPurchaseOrderId(uid: string, requestId: string) {
  const digest = createHash("sha256").update(`${uid}:${requestId}`).digest("hex");
  return `hmt_${digest.slice(0, 60)}`;
}

export function normalizeTanzaniaPhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const digits = value.replace(/\D/g, "");
  if (/^255[67]\d{8}$/.test(digits)) return digits;
  if (/^0[67]\d{8}$/.test(digits)) return `255${digits.slice(1)}`;
  if (/^[67]\d{8}$/.test(digits)) return `255${digits}`;
  return null;
}

export function verifyFimipayWebhookSignature(rawBody: Buffer, signatureHeader: unknown, secret: string) {
  if (!secret || typeof signatureHeader !== "string") return false;
  const signature = signatureHeader.trim();
  if (!/^[a-f\d]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const supplied = Buffer.from(signature, "hex");
  return supplied.length === expected.length && timingSafeEqual(expected, supplied);
}

export function verifyFimipayWebhookV2Signature(rawBody: Buffer, signatureHeader: unknown, secret: string, timestamp: unknown, nonce: unknown, path = "/webhooks/fimipay", nowMs = Date.now()) {
  if (!secret || typeof timestamp !== "string" || typeof nonce !== "string") return false;
  const timestampText = timestamp.trim();
  const nonceText = nonce.trim();
  if (!timestampText || nonceText.length < 8 || nonceText.length > 200) return false;
  const parsedTimestamp = /^\d+$/.test(timestampText) ? Number(timestampText) : Date.parse(timestampText);
  const timestampMs = parsedTimestamp < 10_000_000_000 ? parsedTimestamp * 1000 : parsedTimestamp;
  if (!Number.isFinite(timestampMs) || Math.abs(nowMs - timestampMs) > 5 * 60 * 1000) return false;
  if (typeof signatureHeader !== "string" || !/^[a-f\d]{64}$/i.test(signatureHeader.trim())) return false;
  const signingText = `${timestampText}.${nonceText}.${path}.${new TextDecoder().decode(rawBody)}`;
  const expected = createHmac("sha256", secret).update(signingText, "utf8").digest();
  const supplied = Buffer.from(signatureHeader.trim(), "hex");
  return supplied.length === expected.length && timingSafeEqual(expected, supplied);
}

export function isFimipaySuccessEvent(event: Record<string, unknown>) {
  return ["SUCCESS", "COMPLETED"].includes(String(event.payment_status ?? event.status ?? "").toUpperCase())
    || String(event.event ?? "").toLowerCase() === "payment.success";
}

export function fimipayTerminalStatus(event: Record<string, unknown>) {
  const status = String(event.payment_status ?? event.status ?? "").toUpperCase();
  if (["CANCELLED", "USERCANCELLED", "REJECTED", "FAILED", "EXPIRED"].includes(status)) return status;
  const type = String(event.event ?? "").toLowerCase();
  if (type === "payment.failed") return "FAILED";
  if (type === "payment.cancelled" || type === "payment.canceled") return "CANCELLED";
  return null;
}

export function isOpenTokenPurchaseStatus(status: unknown) {
  return ["CREATING", "CREATE_UNKNOWN", "PENDING", "INPROGRESS"].includes(String(status ?? "").toUpperCase());
}

export function isConfirmedLivePayment(order: Record<string, unknown> | undefined, orderId: string, amount: number) {
  const status = String(order?.payment_status ?? order?.status ?? "").toUpperCase();
  return Boolean(order)
    && String(order?.order_id ?? "") === orderId
    && ["SUCCESS", "COMPLETED"].includes(status)
    && Number(order?.amount) === amount
    && String(order?.currency ?? "").toUpperCase() === "TZS"
    && (order?.simulated === false || order?.simulated === undefined)
    && (order?.environment === undefined || String(order?.environment).toLowerCase() === "live");
}
