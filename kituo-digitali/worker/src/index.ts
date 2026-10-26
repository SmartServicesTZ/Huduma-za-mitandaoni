import { Buffer } from "node:buffer";
import { createRemoteJWKSet, jwtVerify } from "jose";
import {
  adminDelete,
  adminWrite,
  adjustTokens,
  claimDailyTokenBonus,
  changeOwnPassword,
  claimRegistrationPhone,
  completeBusinessLicense,
  consumeTokens,
  createPocketWifiOrder,
  createServiceApplication,
  updateServiceApplication,
  createLipaDocumentUploadUrl,
  createTokenPurchaseOrder,
  ensureDefaultServiceCatalog,
  fimipayWebhook,
  findChatUser,
  generateBusinessLicense,
  getLipaApplicationDocument,
  getServiceApplicationDocument,
  listServiceApplications, listChatMembers, replyToServiceApplication, registerFcmToken, sendPushNotification,
  listAdminUsers,
  listLipaApplications,
  markLipaApplicationViewed,
  markServiceApplicationViewed,
  reserveBusinessLicenseNumber,
  resetUserPassword,
  seedServiceCatalog,
  setAccountStatus,
  setHomepageServiceOrder,
  submitNidaRequest,
  listMyNidaRequests,
  listNidaRequests,
  setNidaRequestStatus,
  completeNidaRequest,
  setLipaApplicationStatus,
  setServiceApplicationStatus,
  setServiceLock,
  submitLipaApplication,
  syncAuthClaims,
  updateUserAccess,
  updateLipaRewardTracking,
  verifyUser,
  enforceAccountRestriction,
} from "./handlers.js";
import { ApiError, ApiHttpResponse, type CallableRoute, type HttpRoute } from "./api-adapter.js";
import { withWorkerEnv, type WorkerEnv } from "./runtime.js";
import { getStorage, uploadStorageObject } from "./storage-rest.js";
import { getFirestore } from "./firestore-rest.js";

interface Env extends WorkerEnv {}

const callableRoutes: Record<string, CallableRoute> = {
  adminDelete, adminWrite, adjustTokens, claimDailyTokenBonus, changeOwnPassword, claimRegistrationPhone, completeBusinessLicense, consumeTokens,
  createPocketWifiOrder, createServiceApplication, updateServiceApplication, createLipaDocumentUploadUrl, createTokenPurchaseOrder, ensureDefaultServiceCatalog, findChatUser, listChatMembers,
  generateBusinessLicense, getLipaApplicationDocument, getServiceApplicationDocument,
  listAdminUsers, listServiceApplications, replyToServiceApplication, registerFcmToken, sendPushNotification,
  listLipaApplications, markLipaApplicationViewed, markServiceApplicationViewed, reserveBusinessLicenseNumber,
  resetUserPassword, seedServiceCatalog, setAccountStatus, setHomepageServiceOrder, setLipaApplicationStatus,
  setServiceApplicationStatus, setServiceLock, submitLipaApplication, syncAuthClaims, updateUserAccess, updateLipaRewardTracking, verifyUser,
  submitNidaRequest, listMyNidaRequests, listNidaRequests, setNidaRequestStatus, completeNidaRequest,
};
const webhook: HttpRoute = fimipayWebhook;
function paymentFlowsEnabled(env: Env) {
  return String(env.PAYMENT_FLOWS_ENABLED ?? "").trim().toLowerCase() === "true"; // Keep payments OFF by default; enable only after live credentials/webhook verification.
}
const firebaseJwks = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));

function allowedOrigins(env: Env) {
  return new Set((env.ALLOWED_ORIGINS ?? "https://smartservicestz.github.io,https://steward-tz.github.io")
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
    const diagnostic = error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300);
    const firestoreError = error && typeof error === "object" && "status" in error
      ? { status: Number((error as { status?: unknown }).status), statusCode: String((error as { statusCode?: unknown }).statusCode ?? "UNKNOWN") }
      : {};
    // Keep provider diagnostics in private Worker logs; never expose them to the client.
    console.error("Worker callable failed", { name, code, diagnostic, ...firestoreError });
    if (firestoreError.status === 429 || firestoreError.statusCode === "RESOURCE_EXHAUSTED") {
      return jsonResponse({ error: { code: "resource-exhausted", message: "Kikomo cha matumizi ya Firestore kimefikiwa. Data haiwezi kupakiwa mpaka kikomo kirejee au quota iongezwe kwenye Google Cloud/Firebase." } }, 429, cors);
    }
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

async function handleLipaDocumentUpload(request: Request, cors: Headers, env: Env) {
  if (request.method !== "POST") return jsonResponse({ error: { code: "invalid-argument", message: "Tumia POST." } }, 405, cors);
  const contentLength = Number(request.headers.get("Content-Length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 11 * 1024 * 1024) {
    return jsonResponse({ error: { code: "invalid-argument", message: "Picha imezidi MB 10." } }, 413, cors);
  }
  const auth = await verifyFirebaseIdToken(request, env);
  await enforceAccountRestriction(auth.uid, "submitLipaApplication");
  let form: FormData;
  try { form = await request.formData(); } catch { return jsonResponse({ error: { code: "invalid-argument", message: "Muundo wa picha si sahihi." } }, 400, cors); }
  const applicationId = String(form.get("applicationId") ?? "").trim();
  const fieldName = String(form.get("fieldName") ?? "").trim();
  const file = form.get("file");
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(applicationId)) return jsonResponse({ error: { code: "invalid-argument", message: "Namba ya ombi si sahihi." } }, 400, cors);
  if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(fieldName)) return jsonResponse({ error: { code: "invalid-argument", message: "Field ya picha si sahihi." } }, 400, cors);
  if (!(file instanceof File)) return jsonResponse({ error: { code: "invalid-argument", message: "Chagua picha kwanza." } }, 400, cors);
  if (file.size < 1 || file.size > 10 * 1024 * 1024) return jsonResponse({ error: { code: "invalid-argument", message: "Picha lazima iwe kati ya byte 1 na MB 10." } }, 400, cors);
  const contentType = file.type.toLowerCase() === "image/jpg" ? "image/jpeg" : file.type.toLowerCase();
  if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) return jsonResponse({ error: { code: "invalid-argument", message: "Picha lazima iwe JPG, PNG au WebP." } }, 400, cors);
  const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-90) || "document";
  const path = `lipaUploads/${auth.uid}/${applicationId}/${fieldName}-${crypto.randomUUID()}-${safeName}`;
  try {
    await uploadStorageObject(path, contentType, await file.arrayBuffer());
  } catch (error) {
    const detail = String(error instanceof Error ? error.message : "Unknown storage error").replace(/[\r\n]+/g, " ").slice(0, 240);
    console.error("Lipa document upload failed", { detail, code: error instanceof Error && "code" in error ? String((error as { code?: unknown }).code) : "unknown" });
    return jsonResponse({ error: { code: "unavailable", message: `Hifadhi ya picha imekataa upload: ${detail}` } }, 503, cors);
  }
  return jsonResponse({ data: { path, size: file.size, contentType } }, 200, cors);
}

async function handleServiceDocumentUpload(request: Request, cors: Headers, env: Env) {
  if (request.method !== "POST") return jsonResponse({ error: { code: "invalid-argument", message: "Tumia POST." } }, 405, cors);
  const contentLength = Number(request.headers.get("Content-Length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 6 * 1024 * 1024) return jsonResponse({ error: { code: "invalid-argument", message: "Picha imezidi MB 5." } }, 413, cors);
  const auth = await verifyFirebaseIdToken(request, env);
  await enforceAccountRestriction(auth.uid, "createServiceApplication");
  if (!env.LIPA_DOCUMENTS) return jsonResponse({ error: { code: "unavailable", message: "Hifadhi ya picha haijasanidiwa." } }, 503, cors);
  let form: FormData;
  try { form = await request.formData(); } catch { return jsonResponse({ error: { code: "invalid-argument", message: "Muundo wa picha si sahihi." } }, 400, cors); }
  const applicationId = String(form.get("applicationId") ?? "").trim();
  const fieldName = String(form.get("fieldName") ?? "").trim();
  const file = form.get("file");
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(applicationId)) return jsonResponse({ error: { code: "invalid-argument", message: "Namba ya ombi si sahihi." } }, 400, cors);
  if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(fieldName)) return jsonResponse({ error: { code: "invalid-argument", message: "Field ya picha si sahihi." } }, 400, cors);
  if (!(file instanceof File)) return jsonResponse({ error: { code: "invalid-argument", message: "Chagua picha kwanza." } }, 400, cors);
  if (file.size < 1 || file.size > 5 * 1024 * 1024) return jsonResponse({ error: { code: "invalid-argument", message: "Picha lazima iwe kati ya byte 1 na MB 5." } }, 400, cors);
  const contentType = file.type.toLowerCase() === "image/jpg" ? "image/jpeg" : file.type.toLowerCase();
  if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) return jsonResponse({ error: { code: "invalid-argument", message: "Picha lazima iwe JPG, PNG au WebP." } }, 400, cors);
  const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-90) || "document";
  const path = `serviceUploads/${auth.uid}/${applicationId}/${fieldName}-${crypto.randomUUID()}-${safeName}`;
  try { await uploadStorageObject(path, contentType, await file.arrayBuffer()); }
  catch (error) {
    const detail = String(error instanceof Error ? error.message : "Unknown storage error").replace(/[\\r\\n]+/g, " ").slice(0, 240);
    console.error("Service document upload failed", { detail });
    return jsonResponse({ error: { code: "unavailable", message: `Picha haikuhifadhiwa: ${detail}` } }, 503, cors);
  }
  return jsonResponse({ data: { path, size: file.size, contentType } }, 200, cors);
}

async function handleServiceDocumentDelete(request: Request, cors: Headers, env: Env) {
  if (request.method !== "POST") return jsonResponse({ error: { code: "invalid-argument", message: "Tumia POST." } }, 405, cors);
  const auth = await verifyFirebaseIdToken(request, env);
  if (!env.LIPA_DOCUMENTS) return jsonResponse({ data: { ok: true } }, 200, cors);
  const body = await request.json().catch(() => null) as { path?: unknown } | null;
  const path = String(body?.path ?? "");
  if (!path.startsWith(`serviceUploads/${auth.uid}/`) || path.includes("..")) throw new ApiError("permission-denied", "Huna ruhusa ya kufuta picha hii.");
  await env.LIPA_DOCUMENTS.delete(path);
  return jsonResponse({ data: { ok: true } }, 200, cors);
}

async function handleServiceDocumentDownload(request: Request, cors: Headers, env: Env) {
  if (request.method !== "GET") return jsonResponse({ error: { code: "invalid-argument", message: "Tumia GET." } }, 405, cors);
  const auth = await verifyFirebaseIdToken(request, env);
  const query = new URL(request.url).searchParams;
  const applicationId = query.get("applicationId")?.trim() ?? "";
  const fieldName = query.get("fieldName")?.trim() ?? "";
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(applicationId) || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(fieldName)) throw new ApiError("invalid-argument", "Taarifa za faili si sahihi.");
  const snapshot = await getFirestore().collection("serviceApplications").doc(applicationId).get();
  if (!snapshot.exists) throw new ApiError("not-found", "Ombi halikupatikana.");
  const application = snapshot.data() as { userId?: unknown; applicantData?: Record<string, unknown> };
  const profile = await getFirestore().collection("users").doc(auth.uid).get();
  const actor = profile.data() as { role?: unknown; permissions?: Record<string, unknown> } | undefined;
  const isOwner = String(application.userId ?? "") === auth.uid;
  const isAdmin = actor?.role === "super_admin" || actor?.role === "admin" || actor?.permissions?.manageServices === true;
  if (!isOwner && !isAdmin) throw new ApiError("permission-denied", "Huna ruhusa ya kuona picha hii.");
  const path = String(application.applicantData?.[fieldName] ?? "");
  const allowed = path.startsWith(`serviceUploads/${String(application.userId ?? "")}/${applicationId}/`) || path.startsWith(`serviceApplications/${applicationId}/documents/`);
  if (!allowed) throw new ApiError("not-found", "Faili halikupatikana.");
  const headers = new Headers(cors);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Content-Disposition", "inline");
  if (env.LIPA_DOCUMENTS && (path.startsWith("serviceUploads/") || path.startsWith("serviceApplications/"))) {
    const object = await env.LIPA_DOCUMENTS.get(path);
    if (object) {
      headers.set("Content-Type", object.httpMetadata?.contentType ?? "application/octet-stream");
      return new Response(object.body, { status: 200, headers });
    }
  }
  try {
    const [legacyUrl] = await getStorage().bucket().file(path).getSignedUrl({ action: "read", expires: Date.now() + 60_000 });
    return Response.redirect(legacyUrl, 302);
  } catch {
    throw new ApiError("not-found", "Faili halikupatikana kwenye hifadhi.");
  }
}

async function handleLipaDocumentDownload(request: Request, cors: Headers, env: Env) {
  if (request.method !== "GET") return jsonResponse({ error: { code: "invalid-argument", message: "Tumia GET." } }, 405, cors);
  const auth = await verifyFirebaseIdToken(request, env);
  const query = new URL(request.url).searchParams;
  const applicationId = query.get("applicationId")?.trim() ?? "";
  const fieldName = query.get("fieldName")?.trim() ?? "";
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(applicationId) || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(fieldName)) throw new ApiError("invalid-argument", "Taarifa za faili si sahihi.");
  const snapshot = await getFirestore().collection("lipaApplications").doc(applicationId).get();
  if (!snapshot.exists) throw new ApiError("not-found", "Ombi halikupatikana.");
  const application = snapshot.data() as { userId?: unknown; applicantData?: Record<string, unknown> };
  const profile = await getFirestore().collection("users").doc(auth.uid).get();
  const actor = profile.data() as { role?: unknown; permissions?: Record<string, unknown> } | undefined;
  const isOwner = String(application.userId ?? "") == auth.uid;
  const isAdmin = actor?.role === "super_admin" || actor?.permissions?.manageLipaApplications === true;
  if (!isOwner && !isAdmin) throw new ApiError("permission-denied", "Huna ruhusa ya kuona picha hii.");
  const storagePath = String(application.applicantData?.[fieldName] ?? "");
  const allowedPath = storagePath.startsWith(`lipaUploads/${String(application.userId ?? "")}/${applicationId}/`) || storagePath.startsWith(`lipaApplications/${applicationId}/documents/`);
  if (!allowedPath || !env.LIPA_DOCUMENTS) throw new ApiError("not-found", "Faili halikupatikana.");
  const headers = new Headers(cors);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Content-Disposition", "inline");
  const object = await env.LIPA_DOCUMENTS.get(storagePath);
  if (object) {
    headers.set("Content-Type", object.httpMetadata?.contentType ?? "application/octet-stream");
    return new Response(object.body, { status: 200, headers });
  }
  // Existing uploads may still live in Firebase Storage from before R2 was enabled.
  // Read those legacy objects securely after the same application ownership/admin check above.
  try {
    const [legacyUrl] = await getStorage().bucket().file(storagePath).getSignedUrl({ action: "read", expires: Date.now() + 60_000 });
    const legacyResponse = await fetch(legacyUrl, { signal: AbortSignal.timeout(20000) });
    if (!legacyResponse.ok || !legacyResponse.body) throw new Error("Legacy object not found.");
    headers.set("Content-Type", legacyResponse.headers.get("Content-Type") ?? "application/octet-stream");
    return new Response(legacyResponse.body, { status: 200, headers });
  } catch {
    throw new ApiError("not-found", "Faili halikupatikana kwenye R2 wala hifadhi ya zamani.");
  }
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
    if (url.pathname === "/upload/service-document") {
      return withWorkerEnv(env, () => handleServiceDocumentUpload(request, cors, env).catch((error) => {
        if (error instanceof ApiError) return jsonResponse({ error: { code: error.code, message: error.message } }, statusForError(error.code), cors);
        console.error("Service upload proxy failed", { code: error instanceof Error ? error.name : "unknown" });
        return jsonResponse({ error: { code: "internal", message: "Picha haikupakiwa kwa sasa. Jaribu tena." } }, 500, cors);
      }));
    }
    if (url.pathname === "/delete/service-document") {
      return withWorkerEnv(env, () => handleServiceDocumentDelete(request, cors, env).catch((error) => {
        if (error instanceof ApiError) return jsonResponse({ error: { code: error.code, message: error.message } }, statusForError(error.code), cors);
        console.error("Service upload delete failed", { code: error instanceof Error ? error.name : "unknown" });
        return jsonResponse({ error: { code: "internal", message: "Picha haikufutwa." } }, 500, cors);
      }));
    }
    if (url.pathname === "/download/service-document") {
      return withWorkerEnv(env, () => handleServiceDocumentDownload(request, cors, env).catch((error) => {
        if (error instanceof ApiError) return jsonResponse({ error: { code: error.code, message: error.message } }, statusForError(error.code), cors);
        console.error("Service download proxy failed", { code: error instanceof Error ? error.name : "unknown" });
        return jsonResponse({ error: { code: "internal", message: "Picha haikupatikana kwa sasa." } }, 500, cors);
      }));
    }
    if (url.pathname === "/upload/lipa") {
      return withWorkerEnv(env, () => handleLipaDocumentUpload(request, cors, env).catch((error) => {
        if (error instanceof ApiError) return jsonResponse({ error: { code: error.code, message: error.message } }, statusForError(error.code), cors);
        console.error("Lipa upload proxy failed", { code: error instanceof Error ? error.name : "unknown" });
        return jsonResponse({ error: { code: "internal", message: "Picha haikupakiwa kwa sasa. Jaribu tena." } }, 500, cors);
      }));
    }
    if (url.pathname === "/download/lipa") {
      return withWorkerEnv(env, () => handleLipaDocumentDownload(request, cors, env).catch((error) => {
        if (error instanceof ApiError) return jsonResponse({ error: { code: error.code, message: error.message } }, statusForError(error.code), cors);
        console.error("Lipa download proxy failed", { code: error instanceof Error ? error.name : "unknown" });
        return jsonResponse({ error: { code: "internal", message: "Picha haikupatikana kwa sasa." } }, 500, cors);
      }));
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
    if (url.pathname === "/turn/credentials") {
      if (request.method !== "GET") return jsonResponse({ error: { code: "invalid-argument", message: "Tumia GET." } }, 405, cors);
      return withWorkerEnv(env, async () => {
        try {
          await verifyFirebaseIdToken(request, env);
          const keyId = typeof env.CLOUDFLARE_TURN_KEY_ID === "string" ? env.CLOUDFLARE_TURN_KEY_ID.trim() : "";
          const keySecret = typeof env.CLOUDFLARE_TURN_KEY_SECRET === "string" ? env.CLOUDFLARE_TURN_KEY_SECRET.trim() : "";
          if (!keyId || !keySecret) return jsonResponse({ error: { code: "failed-precondition", message: "TURN relay bado haijasanidiwa kwenye seva." } }, 412, cors);
          const upstream = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`, {
            method: "POST",
            headers: { Authorization: `Bearer ${keySecret}`, "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ ttl: 3600 }),
            signal: AbortSignal.timeout(12000),
          });
          const payload = await upstream.json().catch(() => null) as { iceServers?: unknown } | null;
          if (!upstream.ok || !Array.isArray(payload?.iceServers) || payload.iceServers.length === 0) {
            console.error("Cloudflare TURN credential generation failed", { status: upstream.status });
            return jsonResponse({ error: { code: "unavailable", message: "TURN relay haikupatikana kwa sasa." } }, 503, cors);
          }
          return jsonResponse({ iceServers: payload.iceServers, expiresIn: 3600 }, 200, cors);
        } catch (error) {
          if (error instanceof ApiError) return jsonResponse({ error: { code: error.code, message: error.message } }, statusForError(error.code), cors);
          console.error("TURN credentials endpoint failed", { code: error instanceof Error ? error.name : "unknown" });
          return jsonResponse({ error: { code: "unavailable", message: "Imeshindwa kupata TURN relay kwa sasa." } }, 503, cors);
        }
      });
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
