import { Buffer } from "node:buffer";
import { createRemoteJWKSet, jwtVerify } from "jose";
import {
  adminDelete,
  adminWrite,
  adjustTokens,
  changeOwnPassword,
  claimRegistrationPhone,
  completeBusinessLicense,
  consumeTokens,
  createServiceApplication,
  createLipaDocumentUploadUrl,
  createTokenPurchaseOrder,
  ensureDefaultServiceCatalog,
  fimipayWebhook,
  findChatUser,
  generateBusinessLicense,
  getLipaApplicationDocument,
  getServiceApplicationDocument,
  listLipaApplications,
  markLipaApplicationViewed,
  markServiceApplicationViewed,
  reserveBusinessLicenseNumber,
  resetUserPassword,
  seedServiceCatalog,
  setAccountStatus,
  setHomepageServiceOrder,
  setLipaApplicationStatus,
  setServiceApplicationStatus,
  setServiceLock,
  submitLipaApplication,
  syncAuthClaims,
  updateUserAccess,
  verifyUser,
  enforceAccountRestriction,
} from "./handlers.js";
import { ApiError, ApiHttpResponse, type CallableRoute, type HttpRoute } from "./api-adapter.js";
import { withWorkerEnv, type WorkerEnv } from "./runtime.js";

interface Env extends WorkerEnv {}

const callableRoutes: Record<string, CallableRoute> = {
  adminDelete, adminWrite, adjustTokens, changeOwnPassword, claimRegistrationPhone, completeBusinessLicense, consumeTokens,
  createServiceApplication, createLipaDocumentUploadUrl, createTokenPurchaseOrder, ensureDefaultServiceCatalog, findChatUser,
  generateBusinessLicense, getLipaApplicationDocument, getServiceApplicationDocument,
  listLipaApplications, markLipaApplicationViewed, markServiceApplicationViewed, reserveBusinessLicenseNumber,
  resetUserPassword, seedServiceCatalog, setAccountStatus, setHomepageServiceOrder, setLipaApplicationStatus,
  setServiceApplicationStatus, setServiceLock, submitLipaApplication, syncAuthClaims, updateUserAccess, verifyUser,
};
const webhook: HttpRoute = fimipayWebhook;
function paymentFlowsEnabled(env: Env) {
  return String(env.PAYMENT_FLOWS_ENABLED ?? "").trim().toLowerCase() === "true"; // Keep payments OFF by default; enable only after live credentials/webhook verification.
}
const firebaseJwks = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));

function allowedOrigins(env: Env) {
  return new Set((env.ALLOWED_ORIGINS ?? "https://steward-tz.github.io")
    .split(",").map((origin) => origin.trim()).filter(Boolean));
}

function corsHeaders(request: Request, env: Env): Headers | null {
  const headers = new Headers({ "Vary": "Origin", "Cache-Control": "no-store" });
  const origin = request.headers.get("Origin");
  if (!origin) return headers;
  if (!allowedOrigins(env).has(origin)) return null;
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-FIMIPAY-SIGNATURE");
  headers.set("Access-Control-Max-Age", "600");
  return headers;
}

function jsonResponse(body: unknown, status: number, headers?: HeadersInit) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers: responseHeaders });
}

function statusForError(code: string) {
  const statuses: Record<string, number> = {
    "invalid-argument": 400,
    "unauthenticated": 401,
    "permission-denied": 403,
    "not-found": 404,
    "already-exists": 409,
    "failed-precondition": 412,
    "resource-exhausted": 429,
    "out-of-range": 400,
    "unavailable": 503,
    "internal": 500,
  };
  return statuses[code] ?? 500;
}

async function verifyFirebaseIdToken(request: Request, env: Env) {
  const authorization = request.headers.get("Authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match) throw new ApiError("unauthenticated", "Ingia kwanza.");
  const projectId = env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error("Firebase project is not configured.");
  try {
    const verified = await jwtVerify(match[1], firebaseJwks, {
      algorithms: ["RS256"],
      audience: projectId,
      issuer: `https://securetoken.google.com/${projectId}`,
    });
    const uid = verified.payload.sub;
    if (typeof uid !== "string" || uid.length < 1 || uid.length > 128) throw new Error("invalid sub");
    const email = typeof verified.payload.email === "string" ? verified.payload.email : undefined;
    return { uid, email };
  } catch {
    throw new ApiError("unauthenticated", "Kikao cha kuingia kimeisha au si sahihi. Ingia tena.");
  }
}

async function handleCallable(request: Request, name: string, cors: Headers, env: Env) {
  const descriptor = callableRoutes[name];
  if (!descriptor) return jsonResponse({ error: { code: "not-found", message: "Huduma ya API haikupatikana." } }, 404, cors);
  if (request.method !== "POST") return jsonResponse({ error: { code: "invalid-argument", message: "Tumia POST." } }, 405, cors);
  const contentLength = Number(request.headers.get("Content-Length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 1024 * 1024) return jsonResponse({ error: { code: "invalid-argument", message: "Ombi limezidi ukubwa unaoruhusiwa." } }, 413, cors);
  const auth = await verifyFirebaseIdToken(request, env);
  let body: unknown;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > 1024 * 1024) return jsonResponse({ error: { code: "invalid-argument", message: "Ombi limezidi ukubwa unaoruhusiwa." } }, 413, cors);
    body = JSON.parse(text);
  } catch {
    return jsonResponse({ error: { code: "invalid-argument", message: "JSON ya ombi si sahihi." } }, 400, cors);
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return jsonResponse({ error: { code: "invalid-argument", message: "Muundo wa ombi si sahihi." } }, 400, cors);
  const data = (body as { data?: unknown }).data ?? {};
  try {
    await enforceAccountRestriction(auth.uid, name);
    const result = await descriptor.handler({ auth, data });
    return jsonResponse({ data: result }, 200, cors);
  } catch (error) {
    if (error instanceof ApiError) return jsonResponse({ error: { code: error.code, message: error.message, ...(error.details === undefined ? {} : { details: error.details }) } }, statusForError(error.code), cors);
    const code = error instanceof Error ? error.name : "unknown";
    console.error("Worker callable failed", { name, code });
    return jsonResponse({ error: { code: "internal", message: "Ombi halijakamilika kwa sasa. Jaribu tena baadaye." } }, 500, cors);
  }
}

async function handleWebhook(request: Request, cors: Headers) {
  if (request.method !== "POST") return jsonResponse({ error: { code: "invalid-argument", message: "Tumia POST." } }, 405, cors);
  const contentLength = Number(request.headers.get("Content-Length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 65536) return jsonResponse({ error: { code: "invalid-argument", message: "Webhook imezidi ukubwa unaoruhusiwa." } }, 413, cors);
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.byteLength === 0 || body.byteLength > 65536) return jsonResponse({ error: { code: "invalid-argument", message: "Webhook haikubaliki." } }, 400, cors);
  const incoming = request.clone();
  const compatRequest = {
    method: incoming.method,
    rawBody: Buffer.from(body),
    get: (headerName: string) => incoming.headers.get(headerName) ?? undefined,
  };
  const response = new ApiHttpResponse();
  await webhook.handler(compatRequest, response);
  return response.toResponse(cors);
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(request, env);
    if (!cors) return jsonResponse({ error: { code: "permission-denied", message: "Origin haijaidhinishwa." } }, 403, { "Vary": "Origin", "Cache-Control": "no-store" });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET") return jsonResponse({ ok: true }, 200, cors);
    if (url.pathname === "/ready" && request.method === "GET") {
      let validServiceAccount = false;
      try {
        const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON) as { client_email?: unknown; private_key?: unknown };
        validServiceAccount = typeof serviceAccount.client_email === "string"
          && serviceAccount.client_email.endsWith(".iam.gserviceaccount.com")
          && typeof serviceAccount.private_key === "string"
          && serviceAccount.private_key.includes("-----BEGIN PRIVATE KEY-----");
      } catch { /* Report only the missing binding name below. */ }
      const missing = [
        ...(!validServiceAccount ? ["FIREBASE_SERVICE_ACCOUNT_JSON"] : []),
      ];
      return jsonResponse({ ready: missing.length === 0, missing }, missing.length === 0 ? 200 : 503, cors);
    }
    if (url.pathname === "/webhooks/fimipay") {
      if (!paymentFlowsEnabled(env)) {
        return jsonResponse({ error: { code: "unavailable", message: "Malipo yamesitishwa kwa muda." } }, 503, cors);
      }
      return withWorkerEnv(env, () => handleWebhook(request, cors).catch((error) => {
        const code = error instanceof Error ? error.name : "unknown";
        console.error("Worker webhook failed", { code });
        return jsonResponse({ error: { code: "internal", message: "Webhook haijakamilika." } }, 500, cors);
      }));
    }
    const match = /^\/call\/([A-Za-z][A-Za-z0-9]*)$/.exec(url.pathname);
    if (match) {
      if (match[1] === "createTokenPurchaseOrder" && !paymentFlowsEnabled(env)) {
        return jsonResponse({ error: { code: "unavailable", message: "Ununuzi wa tokeni umesitishwa kwa muda." } }, 503, cors);
      }
      return withWorkerEnv(env, () => handleCallable(request, match[1], cors, env).catch((error) => {
        if (error instanceof ApiError) return jsonResponse({ error: { code: error.code, message: error.message } }, statusForError(error.code), cors);
        const code = error instanceof Error ? error.name : "unknown";
        console.error("Worker request failed", { code });
        return jsonResponse({ error: { code: "internal", message: "Ombi halijakamilika kwa sasa. Jaribu tena baadaye." } }, 500, cors);
      }));
    }
    return jsonResponse({ error: { code: "not-found", message: "Njia ya API haikupatikana." } }, 404, cors);
  },
};

export default worker;
