import type {} from "@molis-ai/molis-work-plugin-sdk";
import type { GitFactoryHost, GitHost } from "./types.js";

const PAGE_ACTIONS = "/api/host/plugin-page-actions";

/** The version of each page action this page asks for, each with its own entry. */
const ACTION_VERSIONS: Readonly<Record<string, number>> = {
  "git.conflict": /* @version action.git.conflict */ 1,
  "git.operations": /* @version action.git.operations */ 1,
  "git.pr-support": /* @version action.git.pr-support */ 1,
  "git.prepare-index": /* @version action.git.prepare-index */ 1,
  "git.prepare-operation": /* @version action.git.prepare-operation */ 1,
  "git.results": /* @version action.git.results */ 1,
  "git.save-result": /* @version action.git.save-result */ 1,
  "git.select-diff": /* @version action.git.select-diff */ 1,
  "git.state": /* @version action.git.state */ 1,
  "git.summary": /* @version action.git.summary */ 1,
  "diff.state": /* @version action.diff.state */ 1,
};

/** One page action of the Host: the way a page asks a plugin that is not its own for something (the page names no route). */
const action = (host: GitFactoryHost, capability: string, input: unknown, signal?: AbortSignal): Promise<unknown> =>
  molisWorkRequest(host.route(PAGE_ACTIONS), { body: { reference: { capability_id: capability, version: ACTION_VERSIONS[capability] }, input }, signal });

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
