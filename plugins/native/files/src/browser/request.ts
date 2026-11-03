import type {} from "@molis-ai/molis-work-plugin-sdk";
import type { FilesFactoryHost, FilesHost } from "./types.js";

const PAGE_ACTIONS = "/api/host/plugin-page-actions";

/** One page action of the Host: the way a page asks a plugin that is not its own for something (the page names no route). */
const action = (host: FilesFactoryHost, capability: string, input: unknown, signal?: AbortSignal): Promise<unknown> =>
  molisWorkRequest(host.route(PAGE_ACTIONS), { body: { reference: { capability_id: capability, version: 1 }, input }, signal });

/**
 * The requests Files makes. On its own page they go to Files' routes; in Coding's panel the page is not Files', so the same
 * things are asked as Files' page actions (the revision a page may read is the one exception, from Files' route).
 */
export function filesRequests(host: FilesFactoryHost, embedded: boolean): Pick<FilesHost, "request" | "companionState"> {
  const request: FilesHost["request"] = (path, method = "GET", body, signal) => {
    const url = new URL(path, "https://plugin.invalid");
    if (embedded && url.pathname !== "/view-revision") {
      const operation = url.pathname.slice(1);
      const input = method !== "GET" ? body ?? {}
        : operation === "directory" ? { workspace_id: url.searchParams.get("workspace_id"), path: JSON.parse(url.searchParams.get("path") ?? "[]") } : {};
      return action(host, "files." + operation, input, signal);
    }
    return molisWorkRequest(host.pluginRoute(path), { method, body: method === "GET" ? undefined : body ?? {}, signal, fallback: host.translate("files.error.workspace-unreadable") });
  };
  return { request, companionState: (plugin, signal) => action(host, plugin + ".state", {}, signal) };
}
