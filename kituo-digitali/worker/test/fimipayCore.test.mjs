import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  fimipayTerminalStatus,
  isConfirmedLivePayment,
  isFimipaySuccessEvent,
  isOpenTokenPurchaseStatus,
  makeTokenPurchaseOrderId,
  normalizeTanzaniaPhone,
  tokenCreditsForAmount,
  verifyFimipayWebhookSignature,
} from "../src/fimipayCore.ts";

test("only the three supported shilling packages award fixed token amounts", () => {
  assert.equal(tokenCreditsForAmount(2000), 40);
  assert.equal(tokenCreditsForAmount(5000), 100);
  assert.equal(tokenCreditsForAmount(10000), 200);
  for (const value of [0, -2000, 2500, 2000.5, "not-money", 1e20]) {
    assert.equal(tokenCreditsForAmount(value), null);
  }
});

test("Tanzania phone numbers normalize to the API international format", () => {
  assert.equal(normalizeTanzaniaPhone("0712 345 678"), "255712345678");
  assert.equal(normalizeTanzaniaPhone("712345678"), "255712345678");
  assert.equal(normalizeTanzaniaPhone("+255 712-345-678"), "255712345678");
  assert.equal(normalizeTanzaniaPhone("255612345678"), "255612345678");
  assert.equal(normalizeTanzaniaPhone("254712345678"), null);
  assert.equal(normalizeTanzaniaPhone("07123456"), null);
  assert.equal(normalizeTanzaniaPhone(undefined), null);
});

test("merchant order IDs are deterministic, scoped to user and provider length", () => {
  const first = makeTokenPurchaseOrderId("user-a", "request-123");
  assert.equal(first, makeTokenPurchaseOrderId("user-a", "request-123"));
  assert.notEqual(first, makeTokenPurchaseOrderId("user-b", "request-123"));
  assert.ok(first.length <= 64);
  assert.match(first, /^hmt_[a-f0-9]+$/);
});

test("only explicit success markers count as successful FimiPay events", () => {
  assert.equal(isFimipaySuccessEvent({ payment_status: "SUCCESS" }), true);
  assert.equal(isFimipaySuccessEvent({ status: "success" }), true);
  assert.equal(isFimipaySuccessEvent({ event: "payment.success" }), true);
  assert.equal(isFimipaySuccessEvent({ event: "payment.failed", payment_status: "PENDING" }), false);
  assert.equal(fimipayTerminalStatus({ payment_status: "USERCANCELLED" }), "USERCANCELLED");
  assert.equal(fimipayTerminalStatus({ event: "payment.failed" }), "FAILED");
  assert.equal(fimipayTerminalStatus({ payment_status: "PENDING" }), null);
});

test("only nonterminal orders block a second concurrent payment request", () => {
  for (const status of ["CREATING", "CREATE_UNKNOWN", "PENDING", "INPROGRESS"]) assert.equal(isOpenTokenPurchaseStatus(status), true);
  for (const status of ["PAID", "REJECTED", "CREATE_FAILED", "NEEDS_REVIEW", "CANCELLED"]) assert.equal(isOpenTokenPurchaseStatus(status), false);
});

test("webhook HMAC uses the exact raw body and rejects malformed or altered signatures", () => {
  const rawBody = Buffer.from('{"order_id":"fp_test_1","amount":2000}', "utf8");
  const secret = "test-webhook-secret";
  const signature = createHmac("sha256", secret).update(rawBody).digest("hex");
  assert.equal(verifyFimipayWebhookSignature(rawBody, signature, secret), true);
  assert.equal(verifyFimipayWebhookSignature(Buffer.from(`${rawBody.toString()} `), signature, secret), false);
  assert.equal(verifyFimipayWebhookSignature(rawBody, "bad-signature", secret), false);
  assert.equal(verifyFimipayWebhookSignature(rawBody, signature, "wrong-secret"), false);
});

test("production settlement requires exact order, amount, TZS, SUCCESS, and live non-simulated API verification", () => {
  const verified = { order_id: "fp_order_1", payment_status: "SUCCESS", amount: 5000, currency: "TZS", environment: "live", simulated: false };
  assert.equal(isConfirmedLivePayment(verified, "fp_order_1", 5000), true);
  for (const patch of [
    { order_id: "fp_other" },
    { amount: 10000 },
    { currency: "KES" },
    { payment_status: "PENDING" },
    { environment: "test" },
    { simulated: true },
    { simulated: undefined },
  ]) assert.equal(isConfirmedLivePayment({ ...verified, ...patch }, "fp_order_1", 5000), false);
  assert.equal(isConfirmedLivePayment(undefined, "fp_order_1", 5000), false);
});
