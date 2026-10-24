import type { UiRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import type { Failure, JellyHost, Translate } from "./types.js";

/** The page's one request helper (packages/ui-host request-client, W3-10): control headers, one origin, plain Errors with `code`. */
declare const molisWorkRequest: UiRequest;

export const API = "/api/plugins/io.molis.work.jelly";
const url = (path: string): string => (document.body.dataset.routePrefix || "") + path;

export type Request = <T = Record<string, unknown>>(method: "GET" | "POST", path: string, body?: unknown) => Promise<T>;
/** A model call that reports progress while it runs (NDJSON); `onProgress` gets 0..1. */
export type Stream = <T>(path: string, body: unknown, options: { signal: AbortSignal; onProgress(progress: number): void }) => Promise<T>;

/** A refused read says why (`host.readRefusal`): a permission matter or a plugin turned off, not an item that is gone. */
export function makeRequest(host: JellyHost, L: Translate): Request {
  return async <T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> => {
    try {
      return await molisWorkRequest<T>(url(path), { method, fallback: L("jelly.error.request"), ...(method === "GET" ? {} : { body: body ?? {} }) });
    } catch (error) {
      const failure = error as Failure;
      const refusal = method === "GET" ? host.readRefusal?.(failure.status ?? 0, failure.code) : undefined;
      if (!refusal) throw failure;
      throw Object.assign(new Error(refusal), { status: failure.status, code: failure.code });
    }
  };
}

export function makeStream(L: Translate): Stream {
  return <T>(path: string, body: unknown, options: { signal: AbortSignal; onProgress(progress: number): void }): Promise<T> =>
    molisWorkRequest.stream<T>(url(path), {
      body, signal: options.signal, fallback: L("jelly.plan.failed"),
      onProgress: (event) => options.onProgress(Math.max(0, Math.min(1, event.progress || 0))),
    });
}
