import { verifyFirebaseIdToken } from "./firebase-auth.js";
import { ApiError } from "./api-adapter.js";
import { getFirestore, FieldValue } from "./firestore-rest.js";
import { getSecret, getWorkerEnv } from "./runtime.js";
import { normalizeTanzaniaPhone } from "../../shared/tanzaniaPhone.js";

const db = getFirestore();
const API = "https://fimipay.com/api/v1";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}
function digits(value: string) { return value.replace(/\D/g, ""); }
function statusValue(value: unknown) { return String(value ?? "").trim().toUpperCase(); }
function isPaid(value: unknown) { return ["COMPLETED", "SUCCESS"].includes(statusValue(value)); }
async function provider(path: string, body: Record<string, unknown>) {
  const response = await fetch(API + path, {
    method: "POST",
    headers: { Authorization: `Bearer ${getSecret("FIMIPAY_SECRET_KEY")}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const result = await response.json().catch(() => null) as Record<string, any> | null;
  if (!response.ok || !result) throw new Error("FimiPay request failed.");
  return result;
}
async function settle(orderId: string, status: string, amount: unknown, currency: unknown, transid?: string) {
  const orderRef = db.collection("fimipayOrders").doc(orderId);
  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(orderRef);
    if (!snapshot.exists) throw new ApiError("not-found", "Oda ya malipo haijapatikana.");
    const order = snapshot.data()!;
    if (!isPaid(status)) {
      if (status === "FAILED" || status === "CANCELLED") tx.set(orderRef, { paymentStatus: status, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return { paid: false, status, duplicate: false };
    }
    if (Number(amount) !== Number(order.amount) || String(currency ?? "").toUpperCase() !== "TZS") {
      tx.set(orderRef, { paymentStatus: "REVIEW", providerStatus: status, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      throw new ApiError("failed-precondition", "Kiasi au sarafu ya malipo haijalingana; wasiliana na msaada.");
    }
    if (order.environment === "TEST") {
      if (order.settled === true) return { paid: true, status: "COMPLETED", duplicate: true, testMode: true };
      const testLedgerRef = db.collection("fimipayTestTransactions").doc(orderId);
      tx.create(testLedgerRef, { orderId, userId: String(order.userId), tokens: Number(order.tokens), amount: Number(order.amount), currency: "TZS", createdAt: FieldValue.serverTimestamp(), status: "simulated_success" });
      tx.set(orderRef, { settled: true, paymentStatus: "COMPLETED", testVerified: true, settledAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return { paid: true, status: "COMPLETED", duplicate: false, testMode: true };
    }
    if (order.settled === true) return { paid: true, status: "COMPLETED", duplicate: true, balanceAfter: Number(order.balanceAfter ?? 0) };
    const userRef = db.collection("users").doc(String(order.userId));
    const userSnapshot = await tx.get(userRef);
    if (!userSnapshot.exists) throw new ApiError("not-found", "Akaunti ya mteja haijapatikana.");
    const profile = userSnapshot.data()!;
    const before = Number(profile.tokenBalanceOther ?? profile.tokenBalance ?? 0);
    const tokens = Number(order.tokens);
    if (!Number.isSafeInteger(before) || before < 0 || !Number.isSafeInteger(tokens) || tokens < 3) throw new ApiError("failed-precondition", "Salio la tokeni halisomeki.");
    const after = before + tokens;
    const ledgerRef = db.collection("tokenTransactions").doc("fimipay_" + orderId);
    const ledger = await tx.get(ledgerRef);
    if (ledger.exists) {
      tx.set(orderRef, { settled: true, paymentStatus: "COMPLETED", balanceAfter: Number(ledger.data()?.balanceAfter ?? after), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return { paid: true, status: "COMPLETED", duplicate: true, balanceAfter: Number(ledger.data()?.balanceAfter ?? after) };
    }
    tx.update(userRef, { tokenBalanceOther: after, tokenBalance: after, updatedAt: FieldValue.serverTimestamp() });
    tx.create(ledgerRef, { transactionId: ledgerRef.id, userId: String(order.userId), actorId: "FIMIPAY", tokenType: "huduma", type: "credit", amount: tokens, balanceBefore: before, balanceAfter: after, reason: `Ununuzi wa tokeni kupitia FimiPay (${orderId})`, serviceId: "fimipay-topup", serviceName: "Ununuzi wa tokeni", reference: transid || orderId, providerOrderId: orderId, paymentAmount: Number(order.amount), currency: "TZS", createdAt: FieldValue.serverTimestamp(), status: "completed" });
    tx.set(orderRef, { settled: true, paymentStatus: "COMPLETED", providerTransactionId: transid ?? null, balanceBefore: before, balanceAfter: after, settledAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { paid: true, status: "COMPLETED", duplicate: false, balanceAfter: after };
  });
}
async function verifyOwner(request: Request) {
  return verifyFirebaseIdToken(request, getWorkerEnv().FIREBASE_PROJECT_ID);
}
export async function createFimipayOrder(request: Request) {
  const auth = await verifyOwner(request);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const tokens = Number(body?.tokens);
  if (!Number.isSafeInteger(tokens) || tokens < 3 || tokens > 3000 || tokens % 3 !== 0) return json({ error: { message: "Chagua tokeni 3, 6, 9 ... hadi 3000." } }, 400);
  let phone = "";
  try { phone = normalizeTanzaniaPhone(String(body?.phone ?? "")) ?? ""; } catch { /* invalid phone */ }
  if (!phone) return json({ error: { message: "Namba ya simu ya Tanzania si sahihi." } }, 400);
  const userSnapshot = await db.collection("users").doc(auth.uid).get();
  if (!userSnapshot.exists) return json({ error: { message: "Akaunti haijapatikana." } }, 404);
  const profile = userSnapshot.data()!;
  if (profile.accountStatus === "blocked" || profile.accountStatus === "deleted") return json({ error: { message: "Akaunti hairuhusiwi kufanya malipo." } }, 403);
  const amount = (tokens / 3) * 500;
  const testMode = getSecret("FIMIPAY_SECRET_KEY").startsWith("sk_test_");
  const result = await provider("/payment/create_order", {
    ...(testMode ? { test_outcome: "success" } : {}),
    buyer_phone: digits(phone),
    buyer_name: String(profile.name ?? [profile.firstName, profile.lastName].filter(Boolean).join(" ") ?? "Mteja").slice(0, 100),
    amount,
    currency: "TZS",
    payment_method: "mobile",
  });
  const data = (result.data && typeof result.data === "object" ? result.data : result) as Record<string, unknown>;
  const orderId = String(data.order_id ?? "").trim();
  if (!/^[A-Za-z0-9_-]{4,180}$/.test(orderId)) throw new Error("FimiPay did not return a valid order_id.");
  await db.collection("fimipayOrders").doc(orderId).create({
    orderId, userId: auth.uid, buyerPhone: phone, tokens, amount, currency: "TZS",
    paymentStatus: statusValue(data.payment_status) || "PENDING",
    environment: testMode ? "TEST" : "LIVE",
    settled: false, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  });
  return json({ data: { order_id: orderId, payment_status: statusValue(data.payment_status) || "PENDING", amount, currency: "TZS", simulated: data.simulated === true } });
}
export async function checkFimipayOrder(request: Request) {
  const auth = await verifyOwner(request);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const orderId = String(body?.order_id ?? "").trim();
  if (!orderId || orderId.length > 180) return json({ error: { message: "Oda ya malipo si sahihi." } }, 400);
  const ref = db.collection("fimipayOrders").doc(orderId);
  const saved = await ref.get();
  if (!saved.exists || saved.data()?.userId !== auth.uid) return json({ error: { message: "Oda haijapatikana." } }, 404);
  const result = await provider("/payment/order_status", { order_id: orderId });
  const data = (result.data && typeof result.data === "object" ? result.data : result) as Record<string, unknown>;
  const status = statusValue(data.payment_status ?? data.status);
  let settled: { paid: boolean; status: string; duplicate: boolean; balanceAfter?: number } = { paid: false, status, duplicate: false };
  if (isPaid(status)) settled = await settle(orderId, status, data.amount, data.currency, typeof data.transid === "string" ? data.transid : undefined);
  else if (status === "FAILED" || status === "CANCELLED") await settle(orderId, status, data.amount ?? saved.data()?.amount, data.currency ?? "TZS");
  return json({ data: { order_id: orderId, payment_status: settled.paid ? "COMPLETED" : status, paid: settled.paid, duplicate: settled.duplicate, balance: settled.balanceAfter, test_mode: settled.testMode === true, simulated: data.simulated === true } });
}
async function validSignature(raw: string, signature: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)));
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  if (hex.length !== signature.length) return false;
  let diff = 0; for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ signature.toLowerCase().charCodeAt(i);
  return diff === 0;
}
export async function handleFimipayWebhook(request: Request) {
  const raw = await request.text();
  const signature = request.headers.get("X-Fimipay-Signature") ?? "";
  if (!signature || !(await validSignature(raw, signature, getSecret("FIMIPAY_WEBHOOK_SECRET")))) return json({ error: "Invalid signature" }, 401);
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(raw) as Record<string, unknown>; } catch { return json({ error: "Invalid JSON" }, 400); }
  const event = String(payload.event ?? "");
  if (!["payment.success", "payment.cancelled", "payment.failed"].includes(event)) return json({ received: true, ignored: true });
  const orderId = String(payload.order_id ?? "").trim();
  if (!orderId) return json({ error: "Missing order_id" }, 400);
  const status = statusValue(payload.payment_status ?? (event === "payment.success" ? "COMPLETED" : event === "payment.cancelled" ? "CANCELLED" : "FAILED"));
  await settle(orderId, status, payload.amount, payload.currency, typeof payload.transid === "string" ? payload.transid : undefined);
  return json({ received: true });
}
