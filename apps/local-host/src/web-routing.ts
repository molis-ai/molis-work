import type { ServerResponse } from "node:http";
import type { MolisWorkProjectRecord } from "./project-catalog.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";
import { projectNavigation } from "./web-project-presentation.js";
import type { WebServerOptions, ResolvedWebBoardOptions, ResolvedWebRequest } from "./web-types.js";

export function fixtureWebBoardOptions(options: WebServerOptions): ResolvedWebBoardOptions | null {
  if (!options.databasePath) return null;
  return {
    databasePath: options.databasePath,
    projectId: options.projectId ?? "default",
    demo: options.demo,
    projectRoot: options.projectRoot,
    project: null,
    projects: [],
    routePrefix: "",
    homeDirectory: options.homeDirectory,
  };
}

/**
 * Resolving a Web request is deliberately read-only. In particular, opening a
 * project in the browser must not create, bind, or rebind a Runtime Session.
 */
export async function resolveWebRequest(
  serverOptions: WebServerOptions,
  pathname: string,
  withMolisWorkProjectCatalog: LocalWebCatalogRunner,
): Promise<ResolvedWebRequest> {
  const fixture = fixtureWebBoardOptions(serverOptions);
  if (fixture) return { kind: "board", pathname, options: fixture };

  return withMolisWorkProjectCatalog({ homeDirectory: serverOptions.homeDirectory }, (catalog) => {
    const records = catalog.listProjects();
    const projects = records.map(projectNavigation);
    if (
      pathname === "/"
      || pathname === "/onboarding"
      || pathname === "/health"
      || pathname === "/api"
      || pathname.startsWith("/api/")
      || pathname === "/__ui/catalog"
      || pathname === "/__ui/catalog/bar"
      || pathname === "/__ui/catalog/conditions"
      || pathname === "/__ui/catalog/assistant"
      || pathname === "/settings"
      || pathname.startsWith("/settings/")
      || pathname === "/capabilities"
      || pathname.startsWith("/capabilities/")
      || pathname.startsWith("/desktop/")
    ) {
      return { kind: "catalog_index", projects };
    }
    const match = pathname.match(/^\/projects\/([^/]+)(\/.*)?$/);
    if (!match) return { kind: "project_not_found" };

    let projectId: string;
    try {
      projectId = decodeURIComponent(match[1]);
    } catch {
      return { kind: "project_not_found" };
    }
    let project: MolisWorkProjectRecord;
    try {
      project = catalog.getProject(projectId);
    } catch {
      return { kind: "project_not_found" };
    }
    return {
      kind: "board",
      pathname: match[2] || "/",
      options: {
        databasePath: project.database_path,
        projectId: project.project_id,
        projectRoot: serverOptions.projectRoot,
        project: projectNavigation(project),
        projects,
        routePrefix: `/projects/${encodeURIComponent(project.project_id)}`,
        demo: project.data_class === "regenerable_demo",
        homeDirectory: serverOptions.homeDirectory,
      },
    };
  });
}

/** Preserve project and item context when opening the system rules page. */
export function redirectFunctionsPage(method: string | undefined, response: ServerResponse, url: URL, resolved: ResolvedWebRequest): boolean {
  if (method === "GET" && resolved.kind !== "project_not_found"
    && (resolved.kind === "board" ? resolved.pathname === "/" : url.pathname === "/")
    && (url.searchParams.get("openPlugin") === "functions" || url.searchParams.get("panePlugin") === "functions")) {
    const next = new URL("/capabilities/rules", url.origin);
    if (resolved.kind === "board" && resolved.options.project) next.searchParams.set("project", resolved.options.project.project_id);
    const rule = url.searchParams.get("openItem") ?? url.searchParams.get("paneItem");
    if (rule) next.searchParams.set("rule", rule);
    if (url.searchParams.get("desktop") === "1") next.searchParams.set("desktop", "1");
    response.writeHead(302, { location: next.pathname + next.search, "cache-control": "no-store" });
    response.end();
    return true;
  }
  return false;
}
