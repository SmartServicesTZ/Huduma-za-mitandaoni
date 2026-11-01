import { verifyFirebaseIdToken } from "./firebase-auth.js";
import { ApiError } from "./api-adapter.js";
import { getFirestore, FieldValue } from "./firestore-rest.js";
import { getSecret, getWorkerEnv } from "./runtime.js";
import { normalizeTanzaniaPhone } from "../../shared/tanzaniaPhone.js";
import {
  fimipayTerminalStatus,
  isConfirmedLivePayment,
  isFimipaySuccessEvent,
  fimipayCredentialMode,
  shouldCreditTokenPurchase,
  verifyFimipayWebhookSignature,
  verifyFimipayWebhookV2Signature,
} from "./fimipayCore.js";

const db = getFirestore();
const API = "https://fimipay.com/api/v1";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}
function digits(value: string) { return value.replace(/\D/g, ""); }
function statusValue(value: unknown) { return String(value ?? "").trim().toUpperCase(); }
function isPaid(value: unknown) { return ["COMPLETED", "COMPLETE", "SUCCESS"].includes(statusValue(value)); }

function fimipaySecret() {
  const secret = getSecret("FIMIPAY_SECRET_KEY");
  const environment = fimipayCredentialMode(secret, getWorkerEnv().FIMIPAY_ENV);
  if (!environment) throw new ApiError("failed-precondition", "FimiPay credentials hazijawekwa kwenye mazingira sahihi.");
  return { secret, environment };
}

async function provider(path: string, body: Record<string, unknown>) {
  const credentials = fimipaySecret();
  const response = await fetch(API + path, {
    method: "POST",
    headers: { Authorization: `Bearer ${credentials.secret}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const result = await response.json().catch(() => null) as Record<string, any> | null;
  const data = result?.data && typeof result.data === "object" ? result.data as Record<string, unknown> : result;
  console.info("FimiPay provider response", {
    path, httpStatus: response.status, providerStatus: result?.status,
    orderId: typeof data?.order_id === "string" ? data.order_id : undefined,
    paymentStatus: data?.payment_status ?? data?.status,
    simulated: data?.simulated === true,
    environment: credentials.environment,
  });
  if (!response.ok || !result) throw new Error("FimiPay request failed.");
  return { result, data: data ?? {}, environment: credentials.environment };
}

async function readPurchase(orderId: string) {
  const canonical = await db.collection("tokenPurchaseOrders").doc(orderId).get();
  if (canonical.exists) return { order: canonical.data()!, canonical: true };
  const legacy = await db.collection("fimipayOrders").doc(orderId).get();
  if (legacy.exists) return { order: legacy.data()!, canonical: false };
  return null;
}

async function markTerminalStatus(orderId: string, status: string) {
  const canonicalRef = db.collection("tokenPurchaseOrders").doc(orderId);
  const legacyRef = db.collection("fimipayOrders").doc(orderId);
  await db.runTransaction(async (tx) => {
    const canonical = await tx.get(canonicalRef);
    const legacy = await tx.get(legacyRef);
    const now = FieldValue.serverTimestamp();
    if (canonical.exists && canonical.data()?.status !== "PAID") {
      tx.set(canonicalRef, { status, paymentStatus: status, updatedAt: now }, { merge: true });
    }
    if (legacy.exists && legacy.data()?.settled !== true) {
      tx.set(legacyRef, { paymentStatus: status, updatedAt: now }, { merge: true });
    }
  });
}

async function markNeedsReview(orderId: string, reason: string) {
  const canonicalRef = db.collection("tokenPurchaseOrders").doc(orderId);
  const legacyRef = db.collection("fimipayOrders").doc(orderId);
  await db.runTransaction(async (tx) => {
    const canonical = await tx.get(canonicalRef);
    const legacy = await tx.get(legacyRef);
    const now = FieldValue.serverTimestamp();
    if (canonical.exists && canonical.data()?.status !== "PAID") tx.set(canonicalRef, { status: "NEEDS_REVIEW", reviewReason: reason, updatedAt: now }, { merge: true });
    if (legacy.exists && legacy.data()?.settled !== true) tx.set(legacyRef, { paymentStatus: "NEEDS_REVIEW", reviewReason: reason, updatedAt: now }, { merge: true });
    if (!canonical.exists && !legacy.exists) tx.set(db.collection("fimipayWebhookReviews").doc(orderId), {
      orderId, status: "NEEDS_REVIEW", reason, updatedAt: now, createdAt: now,
    }, { merge: true });
  });
}

async function settle(orderId: string, providerOrder: Record<string, unknown>, transid?: string) {
  const canonicalRef = db.collection("tokenPurchaseOrders").doc(orderId);
  const legacyRef = db.collection("fimipayOrders").doc(orderId);
  const ledgerRef = db.collection("tokenTransactions").doc(orderId);
  const legacyLedgerRef = db.collection("tokenTransactions").doc("fimipay_" + orderId);

  return db.runTransaction(async (tx) => {
    const canonicalSnapshot = await tx.get(canonicalRef);
    const legacySnapshot = await tx.get(legacyRef);
    const ledgerSnapshot = await tx.get(ledgerRef);
    const legacyLedgerSnapshot = await tx.get(legacyLedgerRef);

    if (!canonicalSnapshot.exists && !legacySnapshot.exists) {
      tx.set(db.collection("fimipayWebhookReviews").doc(orderId), {
        orderId, status: "NEEDS_REVIEW", reason: "Original customer order was not found",
        updatedAt: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return { paid: false, review: true, duplicate: false };
    }

    const order = (canonicalSnapshot.exists ? canonicalSnapshot.data() : legacySnapshot.data())!;
    const userId = String(order.userId ?? "");
    const amount = Number(order.amount);
    const tokens = Number(order.tokens ?? order.tokenAmount);
    const providerStatus = statusValue(providerOrder.payment_status ?? providerOrder.status);
    const providerAmount = Number(providerOrder.amount);
    const currency = String(providerOrder.currency ?? "").toUpperCase();
    const providerId = String(providerOrder.order_id ?? "");
    const environment = String(order.environment ?? order.providerEnvironment ?? "").toUpperCase();

    const markReviewInTransaction = (reason: string) => {
      console.warn("FimiPay settlement requires review", { orderId, reason, providerStatus, providerAmount, amount, currency, providerId, environment, simulatedOrder: order.simulated === true, simulatedProvider: providerOrder.simulated === true, userIdPresent: Boolean(userId) });
      const now = FieldValue.serverTimestamp();
      if (canonicalSnapshot.exists && order.status !== "PAID") tx.set(canonicalRef, { status: "NEEDS_REVIEW", reviewReason: reason, updatedAt: now }, { merge: true });
      if (legacySnapshot.exists && order.settled !== true) tx.set(legacyRef, { paymentStatus: "NEEDS_REVIEW", reviewReason: reason, updatedAt: now }, { merge: true });
      return { paid: false, review: true, duplicate: false };
    };

    if (providerId !== orderId || !isPaid(providerStatus) || providerAmount !== amount || currency !== "TZS"
      || providerOrder.simulated === true || String(providerOrder.environment ?? "").toLowerCase() === "test"
      || order.simulated === true || environment !== "LIVE"
      || !Number.isSafeInteger(tokens) || tokens < 1 || (amount !== tokens * 200 && amount !== tokens * 100 && amount !== (tokens / 3) * 500)) {
      return markReviewInTransaction("Provider/order amount, currency, environment, status, or token integrity mismatch");
    }

    const userRef = db.collection("users").doc(userId);
    const userSnapshot = await tx.get(userRef);
    if (!userId || !userSnapshot.exists) return markReviewInTransaction("Original customer account is missing");

    const verifyLedger = (data: Record<string, unknown> | undefined) => data !== undefined
      && String(data.userId ?? "") === userId
      && Number(data.amount) === tokens
      && (String(data.reference ?? "") === orderId || String(data.providerOrderId ?? "") === orderId);

    const ledgerExists = ledgerSnapshot.exists || legacyLedgerSnapshot.exists;
    const ledger = ledgerSnapshot.exists ? ledgerSnapshot.data() : legacyLedgerSnapshot.data();
    const ledgerMatches = verifyLedger(ledger);
    const settlementDecision = shouldCreditTokenPurchase({
      orderStatus: order.status ?? order.paymentStatus,
      settled: order.settled,
      ledgerExists,
      ledgerMatches,
    });
    if (settlementDecision === "REVIEW") return markReviewInTransaction(ledgerExists
      ? "Existing token ledger has conflicting ownership or amount"
      : "Order is already marked paid but its token ledger is missing");
    if (settlementDecision === "DUPLICATE") {
      const now = FieldValue.serverTimestamp();
      tx.set(canonicalRef, { ...order, orderId, userId, amount, currency: "TZS", tokens, tokenAmount: tokens, status: "PAID", settled: true, paymentStatus: "COMPLETED", creditedAt: now, updatedAt: now }, { merge: true });
      if (legacySnapshot.exists) tx.set(legacyRef, { settled: true, paymentStatus: "COMPLETED", updatedAt: now }, { merge: true });
      return { paid: true, status: "COMPLETED", duplicate: true, balanceAfter: Number(ledger?.balanceAfter ?? order.balanceAfter ?? 0) };
    }

    const user = userSnapshot.data()!;
    const before = Number(user.tokenBalanceOther ?? user.tokenBalance ?? 0);
    if (!Number.isSafeInteger(before) || before < 0 || !Number.isSafeInteger(before + tokens)) return markReviewInTransaction("Customer token balance failed integrity validation");
    const after = before + tokens;
    const now = FieldValue.serverTimestamp();
    const transactionData = {
      transactionId: orderId, userId, actorId: "FIMIPAY", tokenType: "huduma", type: "credit",
      amount: tokens, balanceBefore: before, balanceAfter: after,
      reason: `Ununuzi wa tokeni kupitia FimiPay (${orderId})`,
      serviceId: "fimipay-topup", serviceName: "Ununuzi wa tokeni",
      reference: orderId, providerOrderId: orderId, providerTransactionId: transid ?? null,
      paymentAmount: amount, currency: "TZS", createdAt: now, status: "completed",
    };

    tx.update(userRef, { tokenBalanceOther: after, tokenBalance: after, updatedAt: now });
    tx.create(ledgerRef, transactionData);
    tx.set(canonicalRef, { ...order, orderId, userId, amount, currency: "TZS", tokens, tokenAmount: tokens, status: "PAID", settled: true, paymentStatus: "COMPLETED", providerTransactionId: transid ?? null, balanceBefore: before, balanceAfter: after, creditedAt: now, updatedAt: now }, { merge: true });
    if (legacySnapshot.exists) tx.set(legacyRef, { settled: true, paymentStatus: "COMPLETED", providerTransactionId: transid ?? null, balanceBefore: before, balanceAfter: after, updatedAt: now }, { merge: true });
    tx.create(db.collection("messages").doc(), {
      recipientId: userId, subject: "Malipo ya tokeni yamepokelewa",
      body: `Malipo yako ya TZS ${amount.toLocaleString("en-US")} yamethibitishwa. Tokeni ${tokens} zimeongezwa kwenye akaunti yako.`,
      type: "tokenPurchasePaid", orderId, createdAt: now,
    });
    tx.create(db.collection("auditLogs").doc(), {
      action: "FIMIPAY_TOKEN_PURCHASE_CREDITED", actorId: "FIMIPAY", userId, orderId,
      amount, currency: "TZS", tokens, balanceBefore: before, balanceAfter: after, createdAt: now,
    });
    return { paid: true, status: "COMPLETED", duplicate: false, balanceAfter: after };
  });
}

async function verifyProviderOrder(orderId: string, expectedAmount: number) {
  const credentials = fimipaySecret();
  if (credentials.environment !== "LIVE") throw new ApiError("failed-precondition", "Uthibitishaji wa malipo ya production unahitaji FimiPay LIVE key.");
  const { result, data } = await provider("/payment/order_status", { order_id: orderId });
  const status = statusValue(data.payment_status ?? data.status);
  const verificationChecks = {
    providerRequestSucceeded: result.status === "success",
    orderIdMatches: String(data.order_id ?? "") === orderId,
    amountMatches: Number(data.amount) === expectedAmount,
    currencyMatches: String(data.currency ?? "").toUpperCase() === "TZS",
    simulated: data.simulated === true,
    providerEnvironment: String(data.environment ?? ""),
    paymentStatus: status,
  };
  console.info("FimiPay order verification checks", { orderId, ...verificationChecks });
  if (result.status !== "success" || !isConfirmedLivePayment(data, orderId, expectedAmount)) {
    return { confirmed: false, status, data };
  }
  return { confirmed: true, status, data };
}

async function verifyOwner(request: Request) {
  return verifyFirebaseIdToken(request, getWorkerEnv().FIREBASE_PROJECT_ID);
}

export async function listFimipayOrders(request: Request) {
  const auth = await verifyOwner(request);
  const snapshot = await db.collection("tokenPurchaseOrders").where("userId", "==", auth.uid).limit(50).get();
  const orders = snapshot.docs.map((item) => {
    const order = item.data()!;
    const createdAt = order.createdAt instanceof Date ? order.createdAt.toISOString() : "";
    return { order_id: item.id, payment_status: statusValue(order.status ?? order.paymentStatus) || "PENDING", amount: Number(order.amount ?? 0), tokens: Number(order.tokens ?? order.tokenAmount ?? 0), created_at: createdAt };
  }).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 20);
  return json({ data: { orders } });
}

export async function createFimipayOrder(request: Request) {
  const auth = await verifyOwner(request);
  const credentials = fimipaySecret();
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const tokens = Number(body?.tokens);
  if (!Number.isSafeInteger(tokens) || tokens < 1 || tokens > 3000) return json({ error: { message: "Chagua tokeni 1 hadi 3000." } }, 400);
  let phone = "";
  try { phone = normalizeTanzaniaPhone(String(body?.phone ?? "")) ?? ""; } catch { /* invalid phone */ }
  if (!phone) return json({ error: { message: "Namba ya simu ya Tanzania si sahihi." } }, 400);
  const userSnapshot = await db.collection("users").doc(auth.uid).get();
  if (!userSnapshot.exists) return json({ error: { message: "Akaunti haijapatikana." } }, 404);
  const profile = userSnapshot.data()!;
  if (profile.accountStatus === "blocked" || profile.accountStatus === "deleted") return json({ error: { message: "Akaunti hairuhusiwi kufanya malipo." } }, 403);
  const amount = tokens * 200;
  const result = await provider("/payment/create_order", {
    buyer_phone: digits(phone),
    buyer_name: String(profile.name ?? [profile.firstName, profile.lastName].filter(Boolean).join(" ") ?? "Mteja").slice(0, 100),
    amount, currency: "TZS", payment_method: "mobile",
  });
  const data = (result.result.data && typeof result.result.data === "object" ? result.result.data : result.result) as Record<string, unknown>;
  const orderId = String(data.order_id ?? "").trim();
  if (!/^[A-Za-z0-9_-]{4,180}$/.test(orderId)) throw new Error("FimiPay did not return a valid order_id.");
  const purchase = {
    orderId, providerOrderId: orderId, userId: auth.uid, buyerPhone: phone, tokens, tokenAmount: tokens,
    amount, currency: "TZS", paymentStatus: statusValue(data.payment_status) || "PENDING",
    status: "PENDING", environment: credentials.environment, settled: false,
    simulated: data.simulated === true, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  };
  await db.runTransaction(async (tx) => {
    const canonicalRef = db.collection("tokenPurchaseOrders").doc(orderId);
    const legacyRef = db.collection("fimipayOrders").doc(orderId);
    const [canonical, legacy] = await Promise.all([tx.get(canonicalRef), tx.get(legacyRef)]);
    if (canonical.exists || legacy.exists) throw new ApiError("already-exists", "FimiPay imerudisha order ID iliyotumika tayari.");
    tx.create(canonicalRef, purchase);
    tx.create(legacyRef, purchase);
  });
  return json({ data: { order_id: orderId, payment_status: purchase.paymentStatus, amount, currency: "TZS", test_mode: credentials.environment === "TEST", simulated: data.simulated === true } });
}

export async function checkFimipayOrder(request: Request) {
  const auth = await verifyOwner(request);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const orderId = String(body?.order_id ?? "").trim();
  if (!orderId || orderId.length > 180) return json({ error: { message: "Oda ya malipo si sahihi." } }, 400);
  const saved = await readPurchase(orderId);
  if (!saved || saved.order.userId !== auth.uid) return json({ error: { message: "Oda haijapatikana." } }, 404);
  if (String(saved.order.environment ?? "").toUpperCase() !== "LIVE") return json({ error: { message: "Oda hii si ya mazingira ya LIVE." } }, 409);
  const expectedAmount = Number(saved.order.amount);
  const verification = await verifyProviderOrder(orderId, expectedAmount);
  if (!verification.confirmed) {
    if (["FAILED", "CANCELLED", "USER_CANCELLED", "REJECTED", "EXPIRED"].includes(verification.status)) {
      await markTerminalStatus(orderId, verification.status);
      return json({ data: { order_id: orderId, payment_status: verification.status, paid: false, duplicate: false } });
    }
    if (["SUCCESS", "COMPLETED", "COMPLETE"].includes(verification.status)) {
      await markNeedsReview(orderId, "Provider reports a completed payment, but the LIVE order verification did not satisfy the order integrity checks.");
      return json({ data: { order_id: orderId, payment_status: "NEEDS_REVIEW", paid: false, duplicate: false } });
    }
    return json({ data: { order_id: orderId, payment_status: verification.status, paid: false, duplicate: false } });
  }
  const settled = await settle(orderId, verification.data, typeof verification.data.transid === "string" ? verification.data.transid : undefined);
  return json({ data: { order_id: orderId, payment_status: settled.paid ? "COMPLETED" : "NEEDS_REVIEW", paid: settled.paid, duplicate: settled.duplicate, balance: settled.balanceAfter } });
}

 
export async function createTillPaymentOrder(request: Request) {
  const auth = await verifyOwner(request);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const applicationId = String(body?.application_id ?? "").trim();
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(applicationId)) throw new ApiError("invalid-argument", "Namba ya ombi si sahihi.");
  const applicationRef = db.collection("serviceApplications").doc(applicationId);
  const applicationSnapshot = await applicationRef.get();
  if (!applicationSnapshot.exists) throw new ApiError("not-found", "Ombi la Till halikupatikana.");
  const application = applicationSnapshot.data()!;
  if (String(application.userId ?? "") !== auth.uid || String(application.serviceSlug ?? "") !== "pata-till-mitandao-yote") throw new ApiError("permission-denied", "Huna ruhusa ya kulipia ombi hili.");
  const applicant = application.applicantData && typeof application.applicantData === "object" ? application.applicantData as Record<string, unknown> : {};
  const network = statusValue(applicant.network);
  const amount = network === "AIRTEL" ? 5000 : network === "VODACOM" ? 40000 : 0;
  if (!amount) throw new ApiError("failed-precondition", "Mtandao huu hauna malipo ya Till kupitia mfumo huu.");
  if (statusValue(applicant.paymentStatus) === "PAID" || String(application.status) !== "AWAITING_PAYMENT") throw new ApiError("failed-precondition", "Ombi hili halisubiri malipo.");
  const existing = await db.collection("servicePaymentOrders").where("applicationId", "==", applicationId).where("userId", "==", auth.uid).where("status", "==", "PENDING").limit(1).get();
  if (!existing.empty) {
    const saved = existing.docs[0]!;
    return json({ data: { order_id: saved.id, payment_status: "PENDING", amount, currency: "TZS", reused: true } });
  }
  const profileSnapshot = await db.collection("users").doc(auth.uid).get();
  if (!profileSnapshot.exists) throw new ApiError("not-found", "Akaunti haikupatikana.");
  const profile = profileSnapshot.data()!;
  if (profile.accountStatus === "blocked" || profile.accountStatus === "deleted") throw new ApiError("permission-denied", "Akaunti hairuhusiwi kufanya malipo.");
  const phone = normalizeTanzaniaPhone(String(body?.phone ?? profile.phone ?? ""));
  if (!phone) throw new ApiError("invalid-argument", "Namba ya simu ya malipo si sahihi.");
  const credentials = fimipaySecret();
  const result = await provider("/payment/create_order", {
    buyer_phone: digits(phone),
    buyer_name: String(profile.name ?? [profile.firstName, profile.lastName].filter(Boolean).join(" ") ?? "Mteja").slice(0, 100),
    amount, currency: "TZS", payment_method: "mobile",
  });
  const data = (result.result.data && typeof result.result.data === "object" ? result.result.data : result.result) as Record<string, unknown>;
  const orderId = String(data.order_id ?? "").trim();
  if (!/^[A-Za-z0-9_-]{4,180}$/.test(orderId)) throw new Error("FimiPay did not return a valid order_id.");
  await db.collection("servicePaymentOrders").doc(orderId).create({
    orderId, userId: auth.uid, applicationId, serviceSlug: "pata-till-mitandao-yote",
    network, amount, currency: "TZS", buyerPhone: phone,
    paymentStatus: statusValue(data.payment_status) || "PENDING", status: "PENDING",
    environment: credentials.environment, simulated: data.simulated === true,
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  });
  return json({ data: { order_id: orderId, payment_status: statusValue(data.payment_status) || "PENDING", amount, currency: "TZS", test_mode: credentials.environment === "TEST", simulated: data.simulated === true } });
}

async function settleTillPayment(orderId: string, providerOrder: Record<string, unknown>, expectedAmount: number) {
  const orderRef = db.collection("servicePaymentOrders").doc(orderId);
  return db.runTransaction(async (tx) => {
    const orderSnapshot = await tx.get(orderRef);
    if (!orderSnapshot.exists) throw new ApiError("not-found", "Oda ya malipo haikupatikana.");
    const order = orderSnapshot.data()!;
    const appRef = db.collection("serviceApplications").doc(String(order.applicationId ?? ""));
    const appSnapshot = await tx.get(appRef);
    if (!appSnapshot.exists) throw new ApiError("not-found", "Ombi la Till halikupatikana.");
    const application = appSnapshot.data()!;
    const providerStatus = statusValue(providerOrder.payment_status ?? providerOrder.status);
    const verified = isConfirmedLivePayment(providerOrder, orderId, expectedAmount)
      && providerStatus === "COMPLETED";
    if (!verified || Number(order.amount) !== expectedAmount || String(order.currency).toUpperCase() !== "TZS"
      || String(order.userId) !== String(application.userId) || String(order.applicationId) !== String(application.applicationId)) {
      throw new ApiError("failed-precondition", "Uthibitisho wa malipo haujalingana na ombi.");
    }
    if (String(order.status) === "COMPLETED" || String(application.applicantData?.paymentStatus).toUpperCase() === "PAID") {
      return { paid: true, duplicate: true };
    }
    const applicant = application.applicantData && typeof application.applicantData === "object"
      ? application.applicantData as Record<string, unknown> : {};
    if (String(application.status) !== "AWAITING_PAYMENT" || String(applicant.paymentStatus).toUpperCase() !== "UNPAID") {
      throw new ApiError("failed-precondition", "Ombi hili haliko kwenye hali ya kusubiri malipo.");
    }
    const now = FieldValue.serverTimestamp();
    tx.set(appRef, {
      status: "PENDING",
      applicantData: { ...applicant, paymentStatus: "PAID", paymentOrderId: orderId, paymentTransactionId: String(providerOrder.transid ?? "") },
      updatedAt: now,
    }, { merge: true });
    tx.set(orderRef, { status: "COMPLETED", paymentStatus: "COMPLETED", providerTransactionId: String(providerOrder.transid ?? ""), paidAt: now, updatedAt: now }, { merge: true });
    tx.create(db.collection("messages").doc(), {
      recipientId: String(application.userId), subject: "Malipo ya ombi la Till yamethibitishwa",
      body: "Malipo yako yamethibitishwa. Ombi lako la Till sasa linasubiri hatua za Admin.",
      type: "serviceApplicationPayment", applicationId: String(application.applicationId), orderId, createdAt: now,
    });
    tx.create(db.collection("auditLogs").doc(), {
      action: "FIMIPAY_TILL_APPLICATION_PAID", actorId: "FIMIPAY", userId: String(application.userId),
      applicationId: String(application.applicationId), orderId, amount: expectedAmount, currency: "TZS", createdAt: now,
    });
    return { paid: true, duplicate: false };
  });
}

export async function checkTillPaymentOrder(request: Request) {
  const auth = await verifyOwner(request);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const orderId = String(body?.order_id ?? "").trim();
  if (!orderId || orderId.length > 180) throw new ApiError("invalid-argument", "Oda ya malipo si sahihi.");
  const orderSnapshot = await db.collection("servicePaymentOrders").doc(orderId).get();
  if (!orderSnapshot.exists || String(orderSnapshot.data()?.userId ?? "") !== auth.uid) throw new ApiError("not-found", "Oda ya malipo haikupatikana.");
  const order = orderSnapshot.data()!;
  if (String(order.environment ?? "").toUpperCase() !== "LIVE") throw new ApiError("failed-precondition", "Oda hii si ya mazingira ya LIVE.");
  if (String(order.status) === "COMPLETED") return json({ data: { order_id: orderId, payment_status: "COMPLETED", paid: true, duplicate: true } });
  const expectedAmount = Number(order.amount);
  const verification = await verifyProviderOrder(orderId, expectedAmount);
  if (!verification.confirmed) {
    if (["FAILED", "CANCELLED", "USER_CANCELLED", "REJECTED", "EXPIRED"].includes(verification.status)) {
      await db.collection("servicePaymentOrders").doc(orderId).set({ status: verification.status, paymentStatus: verification.status, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    return json({ data: { order_id: orderId, payment_status: verification.status, paid: false, duplicate: false } });
  }
  const settled = await settleTillPayment(orderId, verification.data, expectedAmount);
  return json({ data: { order_id: orderId, payment_status: settled.paid ? "COMPLETED" : "PENDING", paid: settled.paid, duplicate: settled.duplicate } });
}

export async function handleFimipayWebhook(request: Request) {
  const rawBody = new Uint8Array(await request.arrayBuffer());
  if (rawBody.length === 0 || rawBody.length > 65536) return json({ error: "Invalid payload" }, 400);
  const secret = getSecret("FIMIPAY_WEBHOOK_SECRET");
  const signatureV2 = request.headers.get("X-Fimipay-Signature-V2");
  const signatureValid = signatureV2 !== null
    ? verifyFimipayWebhookV2Signature(rawBody, signatureV2, secret, request.headers.get("X-Fimipay-Timestamp"), request.headers.get("X-Fimipay-Nonce"), new URL(request.url).pathname)
    : verifyFimipayWebhookSignature(rawBody, request.headers.get("X-Fimipay-Signature"), secret);
  if (!signatureValid) return json({ error: "Invalid signature" }, 401);

  let payload: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawBody));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid payload");
    payload = parsed as Record<string, unknown>;
  } catch { return json({ error: "Invalid JSON" }, 400); }

  const orderId = String(payload.order_id ?? "").trim();
  if (!orderId || orderId.length > 180) return json({ error: "Missing order_id" }, 400);
  const saved = await readPurchase(orderId);
  if (!saved) {
    await markNeedsReview(orderId, "Webhook arrived without a matching stored customer order");
    return json({ received: true, review: true });
  }

  const terminal = fimipayTerminalStatus(payload);
  if (!isFimipaySuccessEvent(payload)) {
    if (terminal) await markTerminalStatus(orderId, terminal);
    return json({ received: true, pending: !terminal });
  }
  if (String(saved.order.environment ?? "").toUpperCase() !== "LIVE") {
    await markNeedsReview(orderId, "Webhook order is not marked LIVE");
    return json({ received: true, review: true });
  }

  try {
    const verification = await verifyProviderOrder(orderId, Number(saved.order.amount));
    if (!verification.confirmed) {
      if (["PENDING", "INPROGRESS"].includes(verification.status)) return json({ received: false, pending: true }, 503);
      await markNeedsReview(orderId, `FimiPay LIVE order_status did not confirm payment: ${verification.status}`);
      return json({ received: true, review: true });
    }
    const settled = await settle(orderId, verification.data, typeof verification.data.transid === "string" ? verification.data.transid : undefined);
    return json({ received: true, paid: settled.paid, duplicate: settled.duplicate, review: settled.review === true });
  } catch (error) {
    console.error("FimiPay webhook reconciliation failed", {
      orderId, code: error instanceof Error ? error.name : "unknown",
      message: error instanceof Error ? error.message.slice(0, 180) : "unknown",
    });
    return json({ received: false }, 503);
  }
}
