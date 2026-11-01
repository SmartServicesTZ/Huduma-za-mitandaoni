import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  fimipayTerminalStatus,
  isConfirmedLivePayment,
  fimipayCredentialMode,
  shouldCreditTokenPurchase,
  isFimipaySuccessEvent,
  tokenCreditsForAmount,
  verifyFimipayWebhookSignature,
  verifyFimipayWebhookV2Signature,
} from "../src/fimipayCore.ts";

const secret = "unit-test-webhook-secret";
const path = "/webhooks/fimipay";
const now = 1_798_000_000_000;
const timestamp = String(Math.floor(now / 1000));
const nonce = "nonce_12345678";

function v2(raw: Uint8Array, ts = timestamp, n = nonce, p = path) {
  const body = new TextDecoder().decode(raw);
  return createHmac("sha256", secret).update(`${ts}.${n}.${p}.${body}`).digest("hex");
}

test("V1 accepts exact raw body signature and rejects invalid signatures", () => {
  const raw = Buffer.from('{"order_id":"fp_1","amount":500}', "utf8");
  const sig = createHmac("sha256", secret).update(raw).digest("hex");
  assert.equal(verifyFimipayWebhookSignature(raw, sig, secret), true);
  assert.equal(verifyFimipayWebhookSignature(raw, "bad", secret), false);
  assert.equal(verifyFimipayWebhookSignature(Buffer.from(raw.toString() + " "), sig, secret), false);
});

test("V2 accepts exact raw body bytes", () => {
  const raw = Buffer.from('{ "order_id" : "fp_1", "amount":500 }', "utf8");
  assert.equal(verifyFimipayWebhookV2Signature(raw, v2(raw), secret, timestamp, nonce, path, now), true);
  assert.equal(verifyFimipayWebhookV2Signature(Buffer.from('{"order_id":"fp_1","amount":500}'), v2(raw), secret, timestamp, nonce, path, now), false);
});

test("V2 rejects invalid signature, wrong path and wrong nonce", () => {
  const raw = Buffer.from('{"event":"payment.success"}');
  const sig = v2(raw);
  assert.equal(verifyFimipayWebhookV2Signature(raw, "0".repeat(64), secret, timestamp, nonce, path, now), false);
  assert.equal(verifyFimipayWebhookV2Signature(raw, sig, secret, timestamp, nonce, "/wrong", now), false);
  assert.equal(verifyFimipayWebhookV2Signature(raw, sig, secret, timestamp, "nonce_wrong_1234", path, now), false);
});

test("V2 rejects missing, expired and future timestamps and missing nonce", () => {
  const raw = Buffer.from("{}");
  const old = String(Math.floor((now - 301_000) / 1000));
  const future = String(Math.floor((now + 301_000) / 1000));
  assert.equal(verifyFimipayWebhookV2Signature(raw, v2(raw), secret, undefined, nonce, path, now), false);
  assert.equal(verifyFimipayWebhookV2Signature(raw, v2(raw, old), secret, old, nonce, path, now), false);
  assert.equal(verifyFimipayWebhookV2Signature(raw, v2(raw, future), secret, future, nonce, path, now), false);
  assert.equal(verifyFimipayWebhookV2Signature(raw, v2(raw), secret, timestamp, "", path, now), false);
});

test("V2 rejects malformed signature and invalid UTF-8 body", () => {
  assert.equal(verifyFimipayWebhookV2Signature(Buffer.from("{}"), "not-hex", secret, timestamp, nonce, path, now), false);
  assert.equal(verifyFimipayWebhookV2Signature(Uint8Array.from([0xff, 0xfe]), "a".repeat(64), secret, timestamp, nonce, path, now), false);
});

test("success event and provider status markers are recognized without accepting pending", () => {
  assert.equal(isFimipaySuccessEvent({ event: "payment.success" }), true);
  assert.equal(isFimipaySuccessEvent({ payment_status: "SUCCESS" }), true);
  assert.equal(isFimipaySuccessEvent({ status: "COMPLETED" }), true);
  for (const status of ["PENDING", "INPROGRESS", "FAILED", "CANCELLED", "USER_CANCELLED", "REJECTED", "EXPIRED"]) {
    assert.equal(isFimipaySuccessEvent({ status }), false);
  }
  assert.equal(fimipayTerminalStatus({ status: "USER_CANCELLED" }), "USER_CANCELLED");
  assert.equal(fimipayTerminalStatus({ status: "PENDING" }), null);
});

test("TZS 500 maps to 3 tokens and existing package mappings remain unchanged", () => {
  assert.equal(tokenCreditsForAmount(500), 3);
  assert.equal(tokenCreditsForAmount(2000), 40);
  assert.equal(tokenCreditsForAmount(5000), 100);
  assert.equal(tokenCreditsForAmount(10000), 200);
  assert.equal(tokenCreditsForAmount(1000), null);
});

test("LIVE provider validation requires exact order, amount, currency and rejects simulated/test", () => {
  const good = { order_id: "fp_1", status: "SUCCESS", amount: 500, currency: "TZS", simulated: false, environment: "live" };
  assert.equal(isConfirmedLivePayment(good, "fp_1", 500), true);
  for (const patch of [
    { order_id: "fp_other" }, { amount: 501 }, { currency: "KES" },
    { status: "PENDING" }, { simulated: true }, { environment: "test" },
  ]) assert.equal(isConfirmedLivePayment({ ...good, ...patch }, "fp_1", 500), false);
  assert.equal(isConfirmedLivePayment(undefined, "fp_1", 500), false);
});

test("production rejects test credentials and test credentials require explicit test environment", () => {
  assert.equal(fimipayCredentialMode("sk_live_example", "production"), "LIVE");
  assert.equal(fimipayCredentialMode("sk_test_example", "production"), null);
  assert.equal(fimipayCredentialMode("sk_test_example", "test"), "TEST");
  assert.equal(fimipayCredentialMode("invalid", "test"), null);
});

test("settlement is idempotent: existing matching ledger never credits balance again", () => {
  assert.equal(shouldCreditTokenPurchase({ orderStatus: "PENDING", settled: false, ledgerExists: false, ledgerMatches: false }), "CREDIT");
  assert.equal(shouldCreditTokenPurchase({ orderStatus: "PAID", settled: true, ledgerExists: true, ledgerMatches: true }), "DUPLICATE");
  assert.equal(shouldCreditTokenPurchase({ orderStatus: "PENDING", settled: false, ledgerExists: true, ledgerMatches: true }), "DUPLICATE");
  assert.equal(shouldCreditTokenPurchase({ orderStatus: "PENDING", settled: false, ledgerExists: true, ledgerMatches: false }), "REVIEW");
  assert.equal(shouldCreditTokenPurchase({ orderStatus: "PAID", settled: true, ledgerExists: false, ledgerMatches: false }), "REVIEW");
});
