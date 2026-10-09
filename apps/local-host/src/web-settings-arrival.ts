import type { IncomingMessage, ServerResponse } from "node:http";
import { markProjectOpened, pruneProjectArrival } from "./project-arrival.js";
import { isTopLevelNavigation } from "./web-http.js";

/**
 * Settings, 能力 among them, are part of the workbench (specs/artifact-positioning S6, S6b). A settings address opened
 * directly (the address bar, a bookmark, a reload) opens the project's workbench with that page in its settings; the
 * workbench itself and its scripts read the same addresses with `fetch`, which a page request never is.
 */
const SETTINGS_PATH = /^\/settings(\/|$)/;
const GLOBAL_SETTINGS_PATH = /^\/(?:settings|capabilities)(\/|$)/;

/** `settingsPrefix` is the project's prefix for one of its own settings pages, empty for a global one. On a 能力 page
 * `project` is the scope it shows, so it stays in the page's address. */
function sendToWorkbench(response: ServerResponse, routePrefix: string, settingsPrefix: string, asked: URL, desktop: boolean): void {
  if (!asked.pathname.startsWith("/capabilities")) asked.searchParams.delete("project");
  asked.searchParams.delete("desktop");
  const settingsPath = encodeURIComponent(settingsPrefix + asked.pathname + asked.search + asked.hash);
  response.writeHead(302, { location: `${routePrefix}/?settingsPath=${settingsPath}${desktop ? "&desktop=1" : ""}`, "cache-control": "no-store" });
  response.end();
}

/** A person arriving at one of a project's pages: its own page is what the chooser remembers it by; one of its settings
 * pages opens in its workbench. True when the response was sent. */
export function arriveAtProjectPage(request: IncomingMessage, response: ServerResponse, url: URL,
  project: { project_id: string; routePrefix: string } | null, homeDirectory: string | undefined, desktop: boolean): boolean {
  if (!project) return false;
  if (request.method === "GET" && url.pathname === "/" && !url.searchParams.has("workbenchPane") && url.searchParams.get("embed") !== "1"
    && (request.headers["sec-fetch-dest"] ?? "document") === "document") markProjectOpened(homeDirectory, project.project_id);
  if (!isTopLevelNavigation(request) || !SETTINGS_PATH.test(url.pathname) || url.searchParams.get("embed") === "1") return false;
  sendToWorkbench(response, project.routePrefix, project.routePrefix, new URL(url), desktop);
  return true;
}

/** Global settings addresses that lead elsewhere. MCP, connectors and Functions moved to 能力. A settings page opened
 * directly opens in the workbench of the project it names, or else the one last opened; with no project yet there is
 * no workbench, and the page itself is shown. True when the response was sent. */
export async function redirectSettingsAddress(request: IncomingMessage, response: ServerResponse, url: URL,
  homeDirectory: string | undefined, projects: () => Promise<readonly { project_id: string }[]>, desktop: boolean): Promise<boolean> {
  const capability = url.pathname === "/settings/mcp" ? "access" : url.pathname === "/settings/connectors" || url.pathname === "/settings/functions" ? "connections" : null;
  if (request.method === "GET" && capability) {
    if (url.pathname === "/settings/functions") url.searchParams.set("connector", "typesafe");
    response.writeHead(302, { location: `/capabilities/${capability}${url.search}`, "cache-control": "no-store" });
    response.end();
    return true;
  }
  if (!homeDirectory || !isTopLevelNavigation(request) || !GLOBAL_SETTINGS_PATH.test(url.pathname)) return false;
  const known = await projects();
  const last = pruneProjectArrival(homeDirectory, new Set(known.map((project) => project.project_id))).last_project_id;
  const target = known.find((project) => project.project_id === url.searchParams.get("project"))
    ?? known.find((project) => project.project_id === last) ?? known[0];
  if (!target) return false;
  sendToWorkbench(response, `/projects/${encodeURIComponent(target.project_id)}`, "", new URL(url), desktop);
  return true;
}
