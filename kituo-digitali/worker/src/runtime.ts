import { AsyncLocalStorage } from "node:async_hooks";
import { importPKCS8, SignJWT } from "jose";

export interface WorkerEnv {
  FIREBASE_PROJECT_ID: string;
  FIREBASE_STORAGE_BUCKET: string;
  FIREBASE_SERVICE_ACCOUNT_JSON: string;
  SUPER_ADMIN_PHONE?: string;
  FIMIPAY_SECRET_KEY?: string;
  FIMIPAY_WEBHOOK_SECRET?: string;
  ALLOWED_ORIGINS?: string;
  [key: string]: unknown;
}

const requestEnv = new AsyncLocalStorage<WorkerEnv>();
const tokenCache = new WeakMap<WorkerEnv, { accessToken: string; expiresAt: number }>();
const tokenInFlight = new WeakMap<WorkerEnv, Promise<string>>();
const serviceAccountCache = new WeakMap<WorkerEnv, { clientEmail: string; privateKey: string }>();

export function withWorkerEnv<T>(env: WorkerEnv, callback: () => T): T {
  return requestEnv.run(env, callback);
}

export function getWorkerEnv(): WorkerEnv {
  const env = requestEnv.getStore();
  if (!env) throw new Error("Worker environment is unavailable outside a request context.");
  return env;
}

export function getSecret(name: "FIMIPAY_SECRET_KEY" | "FIMIPAY_WEBHOOK_SECRET"): string {
  const value = getWorkerEnv()[name];
  if (typeof value !== "string" || value.length === 0) throw new Error(`Required Worker secret is not configured: ${name}`);
  return value;
}

export function getServiceAccountCredentials() {
  const env = getWorkerEnv();
  const cached = serviceAccountCache.get(env);
  if (cached) return cached;
  let parsed: { client_email?: unknown; private_key?: unknown };
  try {
    parsed = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON) as typeof parsed;
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is missing or invalid JSON.");
  }
  if (typeof parsed.client_email !== "string" || typeof parsed.private_key !== "string") {
    throw new Error("Firebase service account JSON must include client_email and private_key.");
  }
  const result = { clientEmail: parsed.client_email, privateKey: parsed.private_key };
  serviceAccountCache.set(env, result);
  return result;
}

async function requestGoogleToken(env: WorkerEnv): Promise<string> {
  const { clientEmail, privateKey } = getServiceAccountCredentials();
  const now = Math.floor(Date.now() / 1000);
  const signingKey = await importPKCS8(privateKey, "RS256");
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/devstorage.read_write https://www.googleapis.com/auth/identitytoolkit" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(clientEmail)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(signingKey);

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json().catch(() => null) as { access_token?: unknown; expires_in?: unknown } | null;
  if (!response.ok || typeof result?.access_token !== "string") {
    throw new Error("Google service-account OAuth token request failed.");
  }
  const expiresIn = Number(result.expires_in);
  tokenCache.set(env, { accessToken: result.access_token, expiresAt: Date.now() + (Number.isFinite(expiresIn) ? expiresIn : 3600) * 1000 - 60_000 });
  return result.access_token;
}

export async function getGoogleAccessToken(): Promise<string> {
  const env = getWorkerEnv();
  const cached = tokenCache.get(env);
  if (cached && cached.expiresAt > Date.now()) return cached.accessToken;
  const pending = tokenInFlight.get(env);
  if (pending) return pending;
  const request = requestGoogleToken(env).finally(() => tokenInFlight.delete(env));
  tokenInFlight.set(env, request);
  return request;
}
