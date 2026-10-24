import { errorMessage } from "../dom.js";
import type { Page } from "./page.js";

/** The answer of the Host to a refused request: the Host's `code`, the HTTP `status`, and what it said. */
export interface Refusal extends Error {
  readonly code?: string;
  readonly status?: number;
  readonly body?: unknown;
}

const refusalOf = (error: unknown): Refusal | null =>
  error !== null && typeof error === "object" && "message" in error && "status" in error ? error as Refusal : null;

/** One request to the Coding routes (the path is under the plugin's own route). A read goes with the view's signal while it is on show. */
export async function api<Answer = unknown>(page: Page, path: string, method = "GET", body?: unknown, requestSignal?: AbortSignal): Promise<Answer> {
  const { L, host, lifetime } = page;
  const { s } = page;
  const signal = requestSignal || (method === "GET" && lifetime.visible && !s.viewSignal?.aborted ? s.viewSignal : undefined);
  try {
    return await molisWorkRequest<Answer>(host.pluginRoute(path), { method, body: method === "GET" ? undefined : body ?? {}, signal, scope: lifetime, fallback: L("coding.error.request") });
  } catch (error) {
    const refused = refusalOf(error);
    const said = method === "GET" && refused ? host.readRefusal?.(refused.status ?? 0, refused.code) : undefined;
    if (said && refused) throw Object.assign(new Error(said), { code: refused.code, status: refused.status, body: refused.body });
    throw error instanceof Error ? error : new Error(errorMessage(error));
  }
}

/** The path of a session, or of one of its rounds. */
export function sessionPath(id: string, run?: string): string {
  return "/sessions/" + encodeURIComponent(id) + (run === undefined ? "" : "/runs/" + encodeURIComponent(run));
}

/** Says something under the header; an error is marked as one. */
export function status(page: Page, message: string, error = false): void {
  const { lifetime, q } = page;
  if (!lifetime.alive) return;
  const node = q("[data-coding-status]");
  node.textContent = message;
  node.dataset.error = String(error);
}
