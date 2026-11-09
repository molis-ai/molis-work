import { pluginRequest } from "@molis-ai/molis-work-plugin-sdk/browser";
import type { TodoItem } from "../contract.js";
import type { TodoClientHost, TodoRequest, Translate } from "./types.js";

/** The todos a write's answer names, so works that relate to them read them again. */
const changedItems = (payload: unknown): TodoItem[] => {
  const answer = payload as { item?: TodoItem; items?: TodoItem[] } | null;
  return (answer?.item ? [answer.item] : answer?.items ?? []).filter((item) => item && item.id);
};

/** Requests to Todo's routes. Every write that answers with todos tells `changed` about each of them. */
export function todoRequest(host: TodoClientHost, L: Translate, changed: (item: TodoItem) => void): TodoRequest {
  const request = pluginRequest(host, { readRefusal: true, fallback: () => L("todo.error.request") });
  return async <T>(method: "GET" | "POST", path: string, body?: Record<string, unknown>) => {
    const payload = await request<T>(method, path, body);
    if (method === "POST") changedItems(payload).forEach(changed);
    return payload;
  };
}
