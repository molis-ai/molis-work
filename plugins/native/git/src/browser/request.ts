import type {} from "@molis-ai/molis-work-plugin-sdk";
import type { GitFactoryHost, GitHost } from "./types.js";

const PAGE_ACTIONS = "/api/host/plugin-page-actions";

/** One page action of the Host: the way a page asks a plugin that is not its own for something (the page names no route). */
const action = (host: GitFactoryHost, capability: string, input: unknown, signal?: AbortSignal): Promise<unknown> =>
  molisWorkRequest(host.route(PAGE_ACTIONS), { body: { reference: { capability_id: capability, version: 1 }, input }, signal });

/** Which of Git's page actions a route stands for, where it is not the route's own name. */
const OPERATIONS: Readonly<Record<string, { readonly GET?: string; readonly POST?: string }>> = {
  "/diff": { GET: "select-diff", POST: "select-diff" },
  "/results": { GET: "results", POST: "save-result" },
  "/operations": { GET: "operations", POST: "prepare-operation" },
};

/**
 * The requests Git makes. On its own page they go to Git's routes; in Coding's panel the page is not Git's, so the same things
 * are asked as Git's page actions (the revision a page may read is the one exception, from Git's route).
 */
export function gitRequests(host: GitFactoryHost, embedded: boolean): Pick<GitHost, "request" | "diffState"> {
  const request: GitHost["request"] = (path, method = "GET", body, signal) => {
    const url = new URL(path, "https://plugin.invalid");
    if (embedded && url.pathname !== "/view-revision") {
      const operation = OPERATIONS[url.pathname]?.[method] ?? url.pathname.slice(1);
      const input = method !== "GET" ? body ?? {} : operation === "conflict" ? { path: url.searchParams.get("path") ?? "" } : {};
      return action(host, "git." + operation, input, signal);
    }
    return molisWorkRequest(host.pluginRoute(path), { method, body: method === "GET" ? undefined : body ?? {}, signal, fallback: host.translate("git.error.workspace-unreadable") });
  };
  return { request, diffState: (reference, signal) => action(host, "diff.state", { reference }, signal) };
}
