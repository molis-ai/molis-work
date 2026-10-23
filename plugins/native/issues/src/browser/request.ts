import type { UiRequest, UiRequestFailure } from "@molis-ai/molis-work-contracts/platform/ui";
import type { Failure, IssuesHost, Scope, Translate } from "./types.js";

/** The page's one request helper (packages/ui-host request-client, W3-10): control headers, one origin, plain Errors with `code`. */
declare const molisWorkRequest: UiRequest;

const PLUGIN_ROUTES = "/api/plugins/io.molis.work.issues/";
/** The writes whose lost answer may still have happened: say so instead of inviting a blind repeat. */
const WRITES = /(update|delete|capture|discard|run|name-draft)$/;

/**
 * Requests to Issue's routes (`path` follows `/api/plugins/io.molis.work.issues/`, or is a full `/api/…` path). A request
 * with no answer is said in the person's words; a refused read says why (`host.readRefusal`); leaving the page cancels it.
 */
export function issuesRequest(host: IssuesHost, scope: Scope, L: Translate) {
  return async <T>(path: string, body?: unknown): Promise<T> => {
    const url = host.route(path[0] === "/" ? path : PLUGIN_ROUTES + path);
    try {
      return await molisWorkRequest<T>(url, { method: body === undefined ? "GET" : "POST", ...(body === undefined ? {} : { body }), scope, fallback: L("issues.error.failed") });
    } catch (error) {
      const failure = error as UiRequestFailure;
      if (scope.signal.aborted || failure.name === "AbortError") throw failure;
      if (failure.status === 0) throw new Error(L(WRITES.test(path) ? "issues.error.lost-write" : "issues.error.lost-read"));
      // A read the Host's router refuses (403) is a permission matter or a plugin turned off, not an item that is gone.
      const refusal = body === undefined ? host.readRefusal?.(failure.status, failure.code) : "";
      const shown: Failure = Object.assign(new Error(refusal || failure.message), { status: failure.status, code: failure.code });
      throw shown;
    }
  };
}
