import { Buffer } from "node:buffer";
import { getSecret } from "./runtime.js";

export interface ApiRequest<T = unknown> {
  data: T;
  auth?: { uid: string };
}

export interface WorkerHttpRequest {
  method: string;
  rawBody: Buffer;
  get(headerName: string): string | undefined;
}

export class ApiHttpResponse {
  private statusCode = 200;
  private readonly headers = new Headers();
  private body: BodyInit | null = null;

  set(name: string, value: string) {
    this.headers.set(name, value);
    return this;
  }

  status(statusCode: number) {
    this.statusCode = statusCode;
    return this;
  }

  send(body: string | Uint8Array) {
    this.body = typeof body === "string" ? body : Buffer.from(body);
    return this;
  }

  json(body: unknown) {
    this.headers.set("Content-Type", "application/json; charset=utf-8");
    this.body = JSON.stringify(body);
    return this;
  }

  toResponse(extraHeaders?: HeadersInit) {
    const headers = new Headers(this.headers);
    new Headers(extraHeaders).forEach((value, name) => headers.set(name, value));
    return new Response(this.body, { status: this.statusCode, headers });
  }
}

export type CallableRoute = {
  handler: (request: ApiRequest) => Promise<unknown> | unknown;
};

export type HttpRoute = {
  handler: (request: WorkerHttpRequest, response: ApiHttpResponse) => Promise<void> | void;
};

type ApiHandler = (request: ApiRequest) => Promise<unknown> | unknown;
type WorkerHttpHandler = (request: WorkerHttpRequest, response: ApiHttpResponse) => Promise<void> | void;

export function callable(handler: ApiHandler): CallableRoute {
  return { handler };
}

export function httpEndpoint(handler: WorkerHttpHandler): HttpRoute {
  return { handler };
}

export class ApiError extends Error {
  constructor(readonly code: string, message: string, readonly details?: unknown) {
    super(message);
    this.name = "ApiError";
  }
}

export function defineWorkerSecret(name: "FIMIPAY_SECRET_KEY" | "FIMIPAY_WEBHOOK_SECRET") {
  return { value: () => getSecret(name) };
}
