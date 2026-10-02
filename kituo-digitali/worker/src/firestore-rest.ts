import { getGoogleAccessToken, getWorkerEnv } from "./runtime.js";

export type DocumentData = Record<string, unknown>;
type ServerTimestampSentinel = { readonly __serverTimestamp: true };
const SERVER_TIMESTAMP: ServerTimestampSentinel = Object.freeze({ __serverTimestamp: true });

export const FieldValue = {
  serverTimestamp(): ServerTimestampSentinel {
    return SERVER_TIMESTAMP;
  },
};

export class FirestoreRestError extends Error {
  constructor(message: string, readonly status: number, readonly statusCode: string) {
    super(message);
    this.name = "FirestoreRestError";
  }
}

function projectId() {
  const id = getWorkerEnv().FIREBASE_PROJECT_ID;
  if (!id) throw new Error("FIREBASE_PROJECT_ID is not configured.");
  return id;
}

function documentName(path: string) {
  const segments = path.split("/").filter(Boolean);
  if (!segments.length || segments.length % 2 !== 0) throw new Error("Invalid Firestore document path.");
  return `projects/${projectId()}/databases/(default)/documents/${segments.map(encodeURIComponent).join("/")}`;
}

function collectionUrl(path: string) {
  const segments = path.split("/").filter(Boolean);
  if (!segments.length || segments.length % 2 !== 1) throw new Error("Invalid Firestore collection path.");
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId())}/databases/(default)/documents/${segments.map(encodeURIComponent).join("/")}`;
}

function fieldPath(value: string) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value)
    ? value
    : `\`${value.replace(/\\/g, "\\\\").replace(/`/g, "\\`")}\``;
}

function encodeValue(value: unknown): Record<string, unknown> {
  if (value === SERVER_TIMESTAMP) throw new Error("Server timestamp transforms must be top-level fields.");
  if (value === null) return { nullValue: "NULL_VALUE" };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Firestore does not accept non-finite numbers.");
    return Number.isSafeInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (value instanceof Uint8Array) return { bytesValue: Buffer.from(value).toString("base64") };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === "object" && value !== null) return { mapValue: { fields: encodeFields(value as DocumentData).fields } };
  throw new Error(`Unsupported Firestore value type: ${typeof value}`);
}

function encodeFields(data: DocumentData) {
  const fields: Record<string, unknown> = {};
  const transforms: Array<Record<string, unknown>> = [];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    if (value === SERVER_TIMESTAMP) {
      transforms.push({ fieldPath: fieldPath(key), setToServerValue: "REQUEST_TIME" });
    } else {
      fields[key] = encodeValue(value);
    }
  }
  return { fields, transforms, keys: Object.keys(data).filter((key) => data[key] !== undefined) };
}

function decodeValue(value: Record<string, any>): unknown {
  if ("nullValue" in value) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("timestampValue" in value) return new Date(value.timestampValue);
  if ("bytesValue" in value) return Buffer.from(value.bytesValue, "base64");
  if ("arrayValue" in value) return (value.arrayValue.values ?? []).map(decodeValue);
  if ("mapValue" in value) return decodeFields(value.mapValue.fields ?? {});
  if ("referenceValue" in value) return value.referenceValue;
  if ("geoPointValue" in value) return value.geoPointValue;
  return undefined;
}

function decodeFields(fields: Record<string, Record<string, any>> = {}): DocumentData {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]));
}

export class DocumentSnapshot {
  readonly id: string;
  readonly exists: boolean;
  private readonly value: DocumentData | undefined;

  constructor(readonly ref: DocumentReference, document?: { name?: string; fields?: Record<string, Record<string, any>> }) {
    this.exists = Boolean(document);
    this.id = ref.id;
    this.value = document ? decodeFields(document.fields ?? {}) : undefined;
  }

  data() {
    return this.value;
  }
}

export class QuerySnapshot {
  constructor(readonly docs: DocumentSnapshot[]) {}
  get empty() {
    return this.docs.length === 0;
  }
}

export class DocumentReference {
  readonly id: string;
  readonly parent: CollectionReference;

  constructor(private readonly client: FirestoreRest, readonly path: string) {
    const segments = path.split("/").filter(Boolean);
    this.id = segments.at(-1) ?? "";
    this.parent = new CollectionReference(client, segments.slice(0, -1).join("/"));
  }

  async get(transactionId?: string) {
    return this.client.getDocument(this, transactionId);
  }

  async create(data: DocumentData) {
    await this.client.commit([makeUpdateWrite(this.path, data, "create")]);
  }

  async set(data: DocumentData, options?: { merge?: boolean }) {
    await this.client.commit([makeUpdateWrite(this.path, data, options?.merge ? "merge" : "replace")]);
  }

  async update(data: DocumentData) {
    await this.client.commit([makeUpdateWrite(this.path, data, "update")]);
  }

  async delete() {
    await this.client.commit([{ delete: documentName(this.path) }]);
  }
}

export class Query {
  constructor(
    protected readonly client: FirestoreRest,
    readonly collectionPath: string,
    protected readonly filter?: { field: string; value: unknown },
    protected readonly maxResults?: number,
  ) {}

  where(field: string, operation: "==", value: unknown) {
    if (operation !== "==") throw new Error("The Worker Firestore adapter currently supports equality queries only.");
    return new Query(this.client, this.collectionPath, { field, value }, this.maxResults);
  }

  limit(count: number) {
    if (!Number.isInteger(count) || count < 1 || count > 1000) throw new Error("Invalid Firestore query limit.");
    return new Query(this.client, this.collectionPath, this.filter, count);
  }

  async get(transactionId?: string) {
    return this.client.runQuery(this, transactionId);
  }

  get queryFilter() {
    return this.filter;
  }

  get queryLimit() {
    return this.maxResults;
  }
}

export class CollectionReference extends Query {
  readonly id: string;

  constructor(client: FirestoreRest, collectionPath: string) {
    super(client, collectionPath);
    this.id = collectionPath.split("/").filter(Boolean).at(-1) ?? "";
  }

  doc(id?: string) {
    const documentId = id ?? crypto.randomUUID().replaceAll("-", "");
    if (!documentId || documentId.includes("/")) throw new Error("Invalid Firestore document ID.");
    return new DocumentReference(this.client, `${this.collectionPath}/${documentId}`);
  }

  async add(data: DocumentData) {
    const ref = this.doc();
    await ref.create(data);
    return ref;
  }
}

export class Transaction {
  readonly writes: Array<Record<string, unknown>> = [];

  constructor(private readonly client: FirestoreRest, readonly id: string) {}

  get(target: DocumentReference): Promise<DocumentSnapshot>;
  get(target: Query): Promise<QuerySnapshot>;
  async get(target: DocumentReference | Query): Promise<DocumentSnapshot | QuerySnapshot> {
    if (target instanceof DocumentReference) return this.client.getDocument(target, this.id);
    return target.get(this.id);
  }

  create(ref: DocumentReference, data: DocumentData) {
    this.writes.push(makeUpdateWrite(ref.path, data, "create"));
  }

  set(ref: DocumentReference, data: DocumentData, options?: { merge?: boolean }) {
    this.writes.push(makeUpdateWrite(ref.path, data, options?.merge ? "merge" : "replace"));
  }

  update(ref: DocumentReference, data: DocumentData) {
    this.writes.push(makeUpdateWrite(ref.path, data, "update"));
  }

  delete(ref: DocumentReference) {
    this.writes.push({ delete: documentName(ref.path) });
  }
}

type WriteMode = "create" | "merge" | "replace" | "update";
function makeUpdateWrite(path: string, data: DocumentData, mode: WriteMode) {
  const encoded = encodeFields(data);
  const write: Record<string, unknown> = { update: { name: documentName(path), fields: encoded.fields } };
  if (mode === "create") write.currentDocument = { exists: false };
  if (mode === "update") write.currentDocument = { exists: true };
  if (mode === "merge" || mode === "update") {
    const nonTransformKeys = encoded.keys.filter((key) => !encoded.transforms.some((transform) => transform.fieldPath === fieldPath(key)));
    if (nonTransformKeys.length) write.updateMask = { fieldPaths: nonTransformKeys.map(fieldPath) };
  }
  if (encoded.transforms.length) write.updateTransforms = encoded.transforms;
  return write;
}

export class FirestoreRest {
  private readonly root = () => `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId())}/databases/(default)/documents`;

  collection(path: string) {
    return new CollectionReference(this, path);
  }

  async runTransaction<T>(work: (transaction: Transaction) => Promise<T>, maxAttempts = 5): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const transactionId = await this.beginTransaction();
      const transaction = new Transaction(this, transactionId);
      try {
        const result = await work(transaction);
        if (transaction.writes.length) await this.commit(transaction.writes, transactionId);
        else await this.rollback(transactionId);
        return result;
      } catch (error) {
        lastError = error;
        await this.rollback(transactionId).catch(() => undefined);
        if (!this.isAborted(error) || attempt + 1 >= maxAttempts) throw error;
      }
    }
    throw lastError;
  }

  async getDocument(ref: DocumentReference, transactionId?: string) {
    const url = new URL(`${this.root()}/${ref.path.split("/").filter(Boolean).map(encodeURIComponent).join("/")}`);
    if (transactionId) url.searchParams.set("transaction", transactionId);
    let response: Response;
    try {
      response = await this.fetchGoogle(url.toString());
    } catch (error) {
      if (error instanceof FirestoreRestError && error.status === 404) return new DocumentSnapshot(ref);
      throw error;
    }
    const document = await this.readJson(response) as { name?: string; fields?: Record<string, Record<string, any>> };
    return new DocumentSnapshot(ref, document);
  }

  async runQuery(query: Query, transactionId?: string) {
    const collectionId = query.collectionPath.split("/").filter(Boolean).at(-1);
    if (!collectionId) throw new Error("Invalid Firestore collection path.");
    const structuredQuery: Record<string, unknown> = { from: [{ collectionId }] };
    if (query.queryFilter) {
      structuredQuery.where = {
        fieldFilter: {
          field: { fieldPath: fieldPath(query.queryFilter.field) },
          op: "EQUAL",
          value: encodeValue(query.queryFilter.value),
        },
      };
    }
    if (query.queryLimit !== undefined) structuredQuery.limit = query.queryLimit;
    const body: Record<string, unknown> = { structuredQuery };
    if (transactionId) body.transaction = transactionId;
    const response = await this.fetchGoogle(`${this.root()}:runQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const rows = await this.readStream(response) as Array<{ document?: { name?: string; fields?: Record<string, Record<string, any>> } }>;
    const documents = rows.filter((row) => row.document).map((row) => {
      const name = row.document!.name ?? "";
      const suffix = name.split("/documents/")[1] ?? "";
      const path = suffix.split("/").map(decodeURIComponent).join("/");
      return new DocumentSnapshot(new DocumentReference(this, path), row.document);
    });
    return new QuerySnapshot(documents);
  }

  async commit(writes: Array<Record<string, unknown>>, transactionId?: string) {
    if (!writes.length) return;
    const body: Record<string, unknown> = { writes };
    if (transactionId) body.transaction = transactionId;
    const response = await this.fetchGoogle(`${this.root()}:commit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await this.readJson(response);
  }

  private async beginTransaction() {
    const response = await this.fetchGoogle(`${this.root()}:beginTransaction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ options: { readWrite: {} } }),
    });
    const result = await this.readJson(response) as { transaction?: unknown };
    if (typeof result.transaction !== "string") throw new Error("Firestore did not return a transaction ID.");
    return result.transaction;
  }

  private async rollback(transactionId: string) {
    const response = await this.fetchGoogle(`${this.root()}:rollback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transaction: transactionId }),
    });
    if (!response.ok) await this.readJson(response);
  }

  private async fetchGoogle(url: string, init: RequestInit = {}) {
    const token = await getGoogleAccessToken();
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    headers.set("Accept", "application/json");
    const response = await fetch(url, { ...init, headers, signal: init.signal ?? AbortSignal.timeout(20000) });
    if (!response.ok) {
      const result = await response.json().catch(() => null) as { error?: { message?: unknown; status?: unknown } } | null;
      const message = String(result?.error?.message ?? `Firestore request failed (${response.status}).`).slice(0, 500);
      const statusCode = String(result?.error?.status ?? "UNKNOWN");
      throw new FirestoreRestError(message, response.status, statusCode);
    }
    return response;
  }

  private async readJson(response: Response) {
    const text = await response.text();
    if (!response.ok) {
      let result: { error?: { message?: unknown; status?: unknown } } = {};
      try { result = JSON.parse(text) as typeof result; } catch { /* Keep a bounded generic error. */ }
      throw new FirestoreRestError(String(result.error?.message ?? `Firestore request failed (${response.status}).`).slice(0, 500), response.status, String(result.error?.status ?? "UNKNOWN"));
    }
    return text ? JSON.parse(text) as unknown : {};
  }

  private async readStream(response: Response) {
    if (!response.ok) return this.readJson(response);
    const text = await response.text();
    if (!text.trim()) return [];
    try {
      const parsed = JSON.parse(text) as unknown;
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as unknown);
    }
  }

  private isAborted(error: unknown) {
    return error instanceof FirestoreRestError && [409, 503].includes(error.status) && /ABORTED|UNAVAILABLE/.test(error.statusCode);
  }
}

const firestore = new FirestoreRest();
export function getFirestore() {
  return firestore;
}
