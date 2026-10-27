import assert from "node:assert/strict";
import test from "node:test";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { ApiError } from "../src/api-adapter.js";
import { verifyFirebaseIdToken } from "../src/firebase-auth.js";

const projectId = "huduma-test-project";
const issuer = `https://securetoken.google.com/${projectId}`;
const keyId = "synthetic-firebase-test-key";
const { privateKey, publicKey } = await generateKeyPair("RS256");
const publicJwk = { ...await exportJWK(publicKey), kid: keyId, alg: "RS256", use: "sig" };
const localJwks = createLocalJWKSet({ keys: [publicJwk] });

type TokenOptions = {
  sub?: string | null;
  audience?: string;
  tokenIssuer?: string;
  expired?: boolean;
  email?: string;
};

async function makeToken(options: TokenOptions = {}, signingKey = privateKey) {
  const token = new SignJWT(options.email === undefined ? {} : { email: options.email })
    .setProtectedHeader({ alg: "RS256", kid: keyId });
  if (options.sub !== null) token.setSubject(options.sub ?? "synthetic-user-123");
  token.setAudience(options.audience ?? projectId);
  token.setIssuer(options.tokenIssuer ?? issuer);
  if (options.expired) token.setIssuedAt(1).setExpirationTime(2);
  else token.setIssuedAt().setExpirationTime("5m");
  return token.sign(signingKey);
}

function tokenRequest(token: string) {
  return new Request("https://worker.test/call/submitLipaApplication", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function assertUnauthenticated(promise: Promise<unknown>) {
  await assert.rejects(promise, (error: unknown) => error instanceof ApiError && error.code === "unauthenticated");
}

test("Firebase verifier accepts a signed token for the configured project and returns only auth identity fields", async () => {
  const token = await makeToken({ email: "synthetic@example.test" });
  assert.deepEqual(await verifyFirebaseIdToken(tokenRequest(token), projectId, localJwks), {
    uid: "synthetic-user-123",
    email: "synthetic@example.test",
  });
});

test("Firebase verifier rejects missing bearer credentials and malformed JWTs", async () => {
  const missing = new Request("https://worker.test/call/submitLipaApplication", { method: "POST" });
  await assertUnauthenticated(verifyFirebaseIdToken(missing, projectId, localJwks));
  await assertUnauthenticated(verifyFirebaseIdToken(tokenRequest("not-a-jwt"), projectId, localJwks));
});

test("Firebase verifier rejects wrong audience, wrong issuer, expired tokens, and missing or out-of-range UIDs", async () => {
  const rejectedCases: TokenOptions[] = [
    { audience: "another-project" },
    { tokenIssuer: "https://securetoken.google.com/another-project" },
    { expired: true },
    { sub: null },
    { sub: "x".repeat(129) },
  ];
  for (const options of rejectedCases) {
    await assertUnauthenticated(verifyFirebaseIdToken(tokenRequest(await makeToken(options)), projectId, localJwks));
  }
});

test("Firebase verifier rejects a correctly shaped token signed by an untrusted key", async () => {
  const untrusted = await generateKeyPair("RS256");
  const token = await makeToken({}, untrusted.privateKey);
  await assertUnauthenticated(verifyFirebaseIdToken(tokenRequest(token), projectId, localJwks));
});

test("Firebase verifier reports missing project configuration without attempting token verification", async () => {
  const token = await makeToken();
  await assert.rejects(verifyFirebaseIdToken(tokenRequest(token), undefined, localJwks), /Firebase project is not configured/);
});
