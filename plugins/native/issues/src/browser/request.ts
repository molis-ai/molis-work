import type {} from "@molis-ai/molis-work-plugin-sdk";
import type { UiRequestFailure } from "@molis-ai/molis-work-contracts/platform/ui";
import type { IssuesHost, Scope, Translate } from "./types.js";

/** The writes whose lost answer may still have happened: say so instead of inviting a blind repeat. */
const WRITES = /(update|delete|capture|discard|run|name-draft)$/;

/**
 * Requests to Issue's routes (`path` is relative to its Host-provided plugin route, or is a full `/api/…` path). A request
 * with no answer is said in the person's words; a refused read says why (`host.readRefusal`); leaving the page cancels it.
 */
export function issuesRequest(host: IssuesHost, scope: Scope, L: Translate) {
  return async <T>(path: string, body?: unknown): Promise<T> => {
    const url = path.startsWith("/api/") ? host.route(path) : host.pluginRoute("/" + path);
    try {
      return await molisWorkRequest<T>(url, { method: body === undefined ? "GET" : "POST", ...(body === undefined ? {} : { body }), scope, fallback: L("issues.error.failed") });
    } catch (error) {
      const failure = error as UiRequestFailure;
      if (scope.signal.aborted || failure.name === "AbortError") throw failure;
      const write = body !== undefined && WRITES.test(path);
      if (failure.status === 0 || (write && failure.code === "ui_host.invalid_response")) {
        failure.message = L(write ? "issues.error.lost-write" : "issues.error.lost-read");
      } else {
        // A refused read (403) is a permission matter or a disabled plugin, not a deleted item.
        const refusal = body === undefined ? host.readRefusal(failure.status, failure.code) : "";
        failure.message = refusal || L(failure.message);
      }
      throw failure;
    }
  };
}
