import { importPKCS8 } from "jose";
import { getGoogleAccessToken, getServiceAccountCredentials, getWorkerEnv } from "./runtime.js";

interface StorageMetadata {
  name?: string;
  size?: string;
  contentType?: string;
  metadata?: Record<string, string>;
  generation?: string;
  timeCreated?: string;
  updated?: string;
  [key: string]: unknown;
}

const signingKeys = new WeakMap<object, Promise<CryptoKey>>();
const encoder = new TextEncoder();

function bucketName() {
  const bucket = getWorkerEnv().FIREBASE_STORAGE_BUCKET;
  if (!bucket) throw new Error("FIREBASE_STORAGE_BUCKET is not configured.");
  return bucket;
}

function r2BucketForPath(objectPath: string) {
  const isLipaPath = objectPath.startsWith("lipaUploads/") || objectPath.startsWith("lipaApplications/");
  const isServiceDocumentPath = objectPath.startsWith("serviceUploads/") || objectPath.startsWith("serviceApplications/");
  return isLipaPath || isServiceDocumentPath ? getWorkerEnv().LIPA_DOCUMENTS : undefined;
}

function objectApiUrl(bucket: string, objectPath: string) {
  return `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectPath)}`;
}

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function encodeObjectPath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function signingKey() {
  const env = getWorkerEnv();
  let pending = signingKeys.get(env);
  if (!pending) {
    const { privateKey } = getServiceAccountCredentials();
    pending = importPKCS8(privateKey, "RS256");
    signingKeys.set(env, pending);
  }
  return pending;
}

export async function signStorageUrl(action: "read" | "write", objectPath: string, expiresAt: number) {
  const env = getWorkerEnv();
  const bucket = bucketName();
  const { clientEmail } = getServiceAccountCredentials();
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = timestamp.slice(0, 8);
  const expiresSeconds = Math.floor((expiresAt - now.getTime()) / 1000);
  if (expiresSeconds < 1 || expiresSeconds > 604800) throw new Error("Signed URL expiry must be between 1 second and 7 days.");

  const credential = `${clientEmail}/${date}/auto/storage/goog4_request`;
  const params: Array<[string, string]> = [
    ["X-Goog-Algorithm", "GOOG4-RSA-SHA256"],
    ["X-Goog-Credential", credential],
    ["X-Goog-Date", timestamp],
    ["X-Goog-Expires", String(expiresSeconds)],
    ["X-Goog-SignedHeaders", "host"],
  ];
  const canonicalQuery = params.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).sort().join("&");
  const canonicalUri = `/${encodeURIComponent(bucket)}/${encodeObjectPath(objectPath)}`;
  const canonicalRequest = [
    action.toUpperCase(),
    canonicalUri,
    canonicalQuery,
    "host:storage.googleapis.com\n",
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const requestHash = hex(await crypto.subtle.digest("SHA-256", encoder.encode(canonicalRequest)));
  const stringToSign = ["GOOG4-RSA-SHA256", timestamp, `${date}/auto/storage/goog4_request`, requestHash].join("\n");
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "RSASSA-PKCS1-v1_5" }, await signingKey(), encoder.encode(stringToSign)));
  const signatureHex = [...signature].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `https://storage.googleapis.com${canonicalUri}?${canonicalQuery}&X-Goog-Signature=${signatureHex}`;
}

async function storageFetch(url: string, init: RequestInit = {}) {
  const token = await getGoogleAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");
  const response = await fetch(url, { ...init, headers, signal: init.signal ?? AbortSignal.timeout(20000) });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: { message?: unknown; code?: unknown } } | null;
    const message = String(payload?.error?.message ?? `Cloud Storage request failed (${response.status}).`).slice(0, 300);
    throw Object.assign(new Error(message), { code: response.status === 404 ? 404 : response.status });
  }
  return response;
}

export async function uploadStorageObject(objectPath: string, contentType: string, body: ArrayBuffer) {
  const bucket = r2BucketForPath(objectPath);
  if (bucket) {
    await bucket.put(objectPath, body, { httpMetadata: { contentType, cacheControl: "private, no-store" } });
    return;
  }
  const firebaseBucket = bucketName();
  const url = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(firebaseBucket)}/o?uploadType=media&name=${encodeURIComponent(objectPath)}`;
  return storageFetch(url, {
    method: "POST",
    headers: { "Content-Type": contentType, "Content-Length": String(body.byteLength) },
    body,
  });
}

export class StorageFile {
  constructor(readonly name: string) {}

  async getSignedUrl(options: { action: "read" | "write"; expires: number }) {
    return [await signStorageUrl(options.action, this.name, options.expires)] as [string];
  }

  async getMetadata() {
    const r2 = r2BucketForPath(this.name);
    if (r2) {
      const object = await r2.head(this.name);
      if (object) return [{ name: this.name, size: String(object.size), contentType: object.httpMetadata?.contentType, uploaded: object.uploaded.toISOString() } as StorageMetadata] as [StorageMetadata];
      // Older clients may have used Firebase Storage as a fallback while the same
      // lipaUploads/ path is now routed to R2. Check the legacy bucket before failing.
    }
    const response = await storageFetch(`${objectApiUrl(bucketName(), this.name)}?fields=name,size,contentType,metadata,generation,timeCreated,updated`);
    return [await response.json() as StorageMetadata] as [StorageMetadata];
  }

  async delete() {
    const r2 = r2BucketForPath(this.name);
    if (r2) {
      const object = await r2.head(this.name);
      if (object) {
        await r2.delete(this.name);
        return;
      }
      // If the object was uploaded through the legacy Firebase fallback, remove it there.
    }
    await storageFetch(objectApiUrl(bucketName(), this.name), { method: "DELETE" });
  }

  async copy(destination: StorageFile) {
    const r2 = r2BucketForPath(this.name) ?? r2BucketForPath(destination.name);
    if (r2) {
      const source = await r2.get(this.name);
      if (source) {
        await r2.put(destination.name, source.body, { httpMetadata: source.httpMetadata, customMetadata: source.customMetadata });
        return [destination] as [StorageFile];
      }
      // Backward compatibility: an upload can be in Firebase Storage when the
      // browser used its fallback, even though lipaUploads/ paths now target R2.
      const [metadata] = await this.getMetadata();
      const legacyObject = await storageFetch(`${objectApiUrl(bucketName(), this.name)}?alt=media`);
      await r2.put(destination.name, await legacyObject.arrayBuffer(), {
        httpMetadata: { contentType: String(metadata.contentType ?? "application/octet-stream"), cacheControl: "private, no-store" },
      });
      return [destination] as [StorageFile];
    }
    const bucket = bucketName();
    let url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(this.name)}/rewriteTo/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(destination.name)}`;
    for (let count = 0; count < 100; count += 1) {
      const response = await storageFetch(url, { method: "POST" });
      const result = await response.json() as { done?: boolean; rewriteToken?: string };
      if (result.done) return [destination] as [StorageFile];
      if (!result.rewriteToken) throw new Error("Cloud Storage rewrite did not return a continuation token.");
      const next = new URL(url);
      next.searchParams.set("rewriteToken", result.rewriteToken);
      url = next.toString();
    }
    throw new Error("Cloud Storage rewrite exceeded the continuation limit.");
  }
}

export class StorageBucket {
  file(objectPath: string) {
    if (!objectPath || objectPath.startsWith("/") || objectPath.split("/").some((part) => part === "..")) {
      throw new Error("Invalid Cloud Storage object path.");
    }
    return new StorageFile(objectPath);
  }
}

export class StorageRest {
  bucket() {
    return new StorageBucket();
  }
}

const storage = new StorageRest();
export function getStorage() {
  return storage;
}
