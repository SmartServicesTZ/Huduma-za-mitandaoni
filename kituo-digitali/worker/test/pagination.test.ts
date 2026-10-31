import assert from "node:assert/strict";
import test from "node:test";
import { FirestoreTimestamp } from "../src/firestore-rest.js";
import { encodePageCursor, parsePageInput } from "../src/pagination.js";

const scope = "admin:serviceApplications|status=*";
const timestamp = "2026-10-28T10:00:00.123456789Z";

test("pagination cursor round-trips exact Firestore timestamp precision and binds endpoint/status scope", () => {
  const cursor = encodePageCursor("application_2", new FirestoreTimestamp(timestamp), scope);
  const parsed = parsePageInput({ pageSize: 30, cursor }, "admin:serviceApplications");
  assert.equal(parsed.pageSize, 30);
  assert.equal(parsed.startAfter, "application_2");
  assert.ok(parsed.startAfterTimestamp instanceof FirestoreTimestamp);
  assert.equal(parsed.startAfterTimestamp?.toFirestoreValue(), timestamp);
  assert.throws(() => parsePageInput({ cursor }, "admin:nidaRequests"), /imepitwa na wakati/);
  assert.throws(() => parsePageInput({ cursor, status: "PENDING" }, "admin:serviceApplications"), /imepitwa na wakati/);
});

test("legacy, malformed, noncanonical and stale cursors are rejected", () => {
  const oldCursor = Buffer.from(JSON.stringify({ id: "application_2", timestamp }), "utf8").toString("base64url");
  assert.throws(() => parsePageInput({ cursor: oldCursor }, "admin:serviceApplications"), /imepitwa na wakati/);
  assert.throws(() => parsePageInput({ cursor: "%%%" }, "admin:serviceApplications"), /Invalid page cursor/);
  const badId = Buffer.from(JSON.stringify({ version: 2, scope, id: "../other", timestamp }), "utf8").toString("base64url");
  assert.throws(() => parsePageInput({ cursor: badId }, "admin:serviceApplications"), /imepitwa na wakati/);
  const badTime = encodeURIComponent(JSON.stringify({ version: 2, scope, id: "application_2", timestamp: "2026-02-30T10:00:00Z" }));
  assert.throws(() => parsePageInput({ cursor: Buffer.from(decodeURIComponent(badTime)).toString("base64url") }, "admin:serviceApplications"), /imepitwa na wakati/);
  const invalidUtf8 = Buffer.from([0xff, 0xfe]).toString("base64url");
  assert.throws(() => parsePageInput({ cursor: invalidUtf8 }, "admin:serviceApplications"), /imepitwa na wakati/);
  const current = JSON.parse(Buffer.from(encodePageCursor("application_2", new FirestoreTimestamp(timestamp), scope), "base64url").toString("utf8"));
  const expiredCursor = Buffer.from(JSON.stringify({ ...current, issuedAt: Date.now() - 25 * 60 * 60 * 1000 }), "utf8").toString("base64url");
  assert.throws(() => parsePageInput({ cursor: expiredCursor }, "admin:serviceApplications"), /imepitwa na wakati/);
  const futureCursor = Buffer.from(JSON.stringify({ ...current, issuedAt: Date.now() + 10 * 60 * 1000 }), "utf8").toString("base64url");
  assert.throws(() => parsePageInput({ cursor: futureCursor }, "admin:serviceApplications"), /imepitwa na wakati/);
});

test("Firestore timestamp validation accepts offsets and up to nine fractional digits only", () => {
  assert.equal(new FirestoreTimestamp("0004-02-29T23:59:59.123456789+03:00").toFirestoreValue(), "0004-02-29T23:59:59.123456789+03:00");
  for (const value of ["0000-01-01T10:00:00Z", "2026-02-29T10:00:00Z", "2026-01-01 10:00:00Z", "2026-01-01T10:00:60Z", "2026-01-01T10:00:00.1234567890Z", "2026-01-01T10:00:00+25:00"]) {
    assert.throws(() => new FirestoreTimestamp(value));
  }
});

test("page size remains bounded to a positive maximum", () => {
  assert.equal(parsePageInput({ pageSize: 10000 }, "admin:serviceApplications").pageSize, 50);
  assert.equal(parsePageInput({ pageSize: -3 }, "admin:serviceApplications").pageSize, 1);
  assert.equal(parsePageInput({ pageSize: "nope" }, "admin:serviceApplications").pageSize, 25);
});
