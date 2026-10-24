import type {} from "@molis-ai/molis-work-plugin-sdk";
import type { CogniaApi, CogniaClientHost } from "./types.js";

/**
 * Requests to Cognia's library routes through the page's one request helper. A failure is the helper's plain Error with the
 * Host's `code` and `status`, and its message is what the person reads (translated where the Host's message has an English).
 */
export function cogniaApi(host: CogniaClientHost): CogniaApi {
  return <T>(path: string, body?: unknown) =>
    molisWorkRequest<T>(libraryUrl(host, path), { method: body === undefined ? "GET" : "POST", ...(body === undefined ? {} : { body }) });
}

/** The address of one library route (also what a download link points at). */
export const libraryUrl = (host: CogniaClientHost, path: string): string => host.pluginRoute("/library" + path);

/** The Host's answer to "may Cognia read a folder of this machine": a grant to scan, or the person's cancel. */
export interface DirectoryGrant { status?: string; grant_id?: string }

export function grantDirectory(host: CogniaClientHost, fallback: string): Promise<DirectoryGrant> {
  return molisWorkRequest<DirectoryGrant>(host.route("/api/host/directory-grants"), { method: "POST", body: { plugin_id: host.pluginId }, fallback });
}
