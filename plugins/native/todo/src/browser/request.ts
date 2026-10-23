import type { UiRequest, UiRequestFailure } from "@molis-ai/molis-work-contracts/platform/ui";
import type { TodoItem } from "@molis-ai/molis-work-contracts/modules/todo";
import type { TodoClientHost, TodoRequest, Translate } from "./types.js";

/** The page's one request helper (packages/ui-host request-client, W3-10): control headers, one origin, plain Errors with `code`. */
declare const molisWorkRequest: UiRequest;

const PLUGIN_ROUTES = "/api/plugins/io.molis.work.todo";

/** The todos a write's answer names, so works that relate to them read them again. */
const changedItems = (payload: unknown): TodoItem[] => {
  const answer = payload as { item?: TodoItem; items?: TodoItem[] } | null;
  return (answer?.item ? [answer.item] : answer?.items ?? []).filter((item) => item && item.id);
};

/**
 * Requests to Todo's routes. A failure is the helper's plain Error with the Host's `code` and `status`; a refused read says why
 * in the person's words (`host.readRefusal`). Every write that answers with todos tells `changed` about each of them.
 */
export function todoRequest(host: TodoClientHost, L: Translate, changed: (item: TodoItem) => void): TodoRequest {
  return async <T>(method: "GET" | "POST", path: string, body?: Record<string, unknown>) => {
    const url = host.route(path.startsWith("/api/") ? path : PLUGIN_ROUTES + path);
    try {
      const payload = await molisWorkRequest<T>(url, { method, ...(body === undefined || method === "GET" ? {} : { body }), fallback: L("todo.error.request") });
      if (method === "POST") changedItems(payload).forEach(changed);
      return payload;
    } catch (error) {
      const failure = error as UiRequestFailure;
      const refusal = method === "GET" ? host.readRefusal?.(failure.status, failure.code) : "";
      if (refusal) failure.message = refusal;
      throw failure;
    }
  };
}
