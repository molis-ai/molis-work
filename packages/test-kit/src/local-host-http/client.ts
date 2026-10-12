import { randomUUID } from "node:crypto";

/**
 * A request the Host's local HTTP interface refused: its status, the stable `code` when the reply carries one, and its own words.
 * Made with `localHostHttpError`, recognised with `isLocalHostHttpError` (a plain `Error` with these fields; the gates allow no new
 * Error subclass, and an owner's failures are codes, which a refusal of the Host's own already carries).
 */
export interface LocalHostHttpError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly method: string;
  readonly path: string;
}

const REFUSAL = Symbol.for("molis-work.test-kit.local-host-http-refusal");

export function localHostHttpError(status: number, code: string | undefined, message: string, method: string, path: string): LocalHostHttpError {
  return Object.assign(new Error(message), { name: "LocalHostHttpError", status, code, method, path, [REFUSAL]: true as const });
}

export function isLocalHostHttpError(error: unknown): error is LocalHostHttpError {
  return error instanceof Error && (error as { [REFUSAL]?: unknown })[REFUSAL] === true;
}

export interface LocalHostHttpOptions {
  /** The Host's own origin, for example `http://127.0.0.1:4173`. */
  readonly origin: string;
  /** The control token of that Host's Home. */
  readonly controlToken: string;
  /** Defaults to the `fetch` of the moment the client is made; see `LocalHostHttpClient`. */
  readonly fetch?: typeof fetch;
}

/**
 * The person's side of the Host's local HTTP interface, as the settings pages call it. Every mutating request carries what the
 * Host's gate asks for: its own origin, JSON, the Home's control token and a fresh one-time key. Reads carry none of them.
 * The client keeps the `fetch` it was made with, so a test that later replaces `globalThis.fetch` to stand in for an upstream
 * service does not intercept its requests to the Host.
 */
export class LocalHostHttpClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: LocalHostHttpOptions) {
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  get origin(): string { return this.options.origin; }

  get<T = unknown>(path: string): Promise<T> { return this.send<T>("GET", path); }
  post<T = unknown>(path: string, body: unknown): Promise<T> { return this.send<T>("POST", path, body); }
  delete<T = unknown>(path: string, body?: unknown): Promise<T> { return this.send<T>("DELETE", path, body); }

  private async send<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { accept: "application/json" };
    if (method !== "GET") {
      headers.origin = this.options.origin;
      headers["content-type"] = "application/json";
      headers["x-molis-work-control-token"] = this.options.controlToken;
      headers["x-molis-work-idempotency-key"] = randomUUID();
    }
    const response = await this.fetchImpl(this.options.origin + path, {
      method, headers, redirect: "error", ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    let reply: unknown;
    try { reply = text === "" ? undefined : JSON.parse(text); } catch { reply = undefined; }
    if (!response.ok) {
      const refusal = reply && typeof reply === "object" ? reply as { error?: unknown; code?: unknown } : {};
      throw localHostHttpError(response.status, typeof refusal.code === "string" ? refusal.code : undefined,
        typeof refusal.error === "string" ? refusal.error : `HTTP ${response.status} ${method} ${path}`, method, path);
    }
    return reply as T;
  }
}
