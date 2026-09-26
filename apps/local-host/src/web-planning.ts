import type { IncomingMessage, ServerResponse } from "node:http";
import type { PlanningMethodPack, PlanningMethodPackInput } from "@molis-ai/molis-work-contracts/modules/goals";
import type { BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { goalsActions, personalPlanningActions, matchGoalsPlanningRoute } from "@molis-ai/molis-work-plugin-goals";
import { renderWorkbenchPlanningRequest, type MolisWorkWebView, type WebProjectNavigation } from "@molis-ai/molis-work-app-workbench";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";
import type { createLocalHostWorkbenchRenderer } from "./workbench-renderer.js";
import { sendLocalWebJson as sendJson, readLocalWebBody as readBody } from "./web-http.js";
import { L } from "./web-locale.js";

/** Older HTTP editors may submit a returned pack; provenance remains owned by Catalog. */
function personalMethodInput(method: PlanningMethodPackInput): PlanningMethodPackInput {
  const { scope: _scope, created_at: _created, updated_at: _updated, overridden_scopes: _overrides, ...input } =
    method as PlanningMethodPackInput & { scope?: unknown; created_at?: unknown; updated_at?: unknown; overridden_scopes?: unknown };
  return input;
}

export function createLocalPlanningHttp(ports: {
  withCatalog: LocalWebCatalogRunner;
  renderer: Pick<ReturnType<typeof createLocalHostWorkbenchRenderer>, "renderMolisWorkPlanningLibrary" | "renderMolisWorkPlanningMethodPage" | "renderMolisWorkPlanningSettings">;
  isDesktopShellRequest(request: IncomingMessage, url: URL): boolean;
  pageCsp: string;
}) {
  const { withCatalog: withMolisWorkProjectCatalog, isDesktopShellRequest, pageCsp: PAGE_CSP } = ports;
  const { renderMolisWorkPlanningLibrary, renderMolisWorkPlanningMethodPage, renderMolisWorkPlanningSettings } = ports.renderer;
  async function personal(request: IncomingMessage, response: ServerResponse, url: URL, homeDirectory: string | undefined,
    projects: WebProjectNavigation[], controlToken: string, homeActions: BoundActionClient,
  ): Promise<boolean> {
    const contextProjectId = url.searchParams.get("project");
    const contextProject = contextProjectId
      ? projects.find((project) => project.project_id === contextProjectId) ?? null : null;
    const planningDocument = request.method === "GET" && url.pathname.startsWith("/settings/planning");
    const enabledPlugins = planningDocument && contextProject && homeDirectory
      ? await withMolisWorkProjectCatalog({ homeDirectory }, (catalog) => catalog.listProjectPlugins(contextProject.project_id))
      : [];
    const route = request.method === "GET" ? matchGoalsPlanningRoute(url.pathname, "personal") : null;
    let methods: PlanningMethodPack[] = [];
    if (route && !(route.kind === "method" && route.method_id === "new")) {
      try { methods = (await homeActions.invoke(personalPlanningActions.list, {})).methods; }
      catch (error) { sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) }); return true; }
    }
    const globalPlanningPage = renderWorkbenchPlanningRequest(request.method, url.pathname, "personal", () => {
      return {
        methods,
        library: () => renderMolisWorkPlanningLibrary(methods, contextProject, controlToken, isDesktopShellRequest(request, url), projects, enabledPlugins),
        method: (method, mode) => renderMolisWorkPlanningMethodPage(
          method, mode, "personal", contextProject, controlToken, isDesktopShellRequest(request, url), projects, enabledPlugins),
      };
    }, L);
    if (globalPlanningPage) {
      if ("error" in globalPlanningPage) { sendJson(response, globalPlanningPage.status, { error: globalPlanningPage.error }); return true; }
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "content-security-policy": PAGE_CSP,
      });
      response.end(globalPlanningPage.html);
      return true;
    }
    if (request.method === "GET" && url.pathname === "/api/settings/planning-methods") {
      try { sendJson(response, 200, await homeActions.invoke(personalPlanningActions.list, {})); }
      catch (error) { sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) }); }
      return true;
    }
    if (request.method === "POST" && url.pathname === "/api/settings/planning-methods") {
      const body = await readBody(request);
      const method = body.method && typeof body.method === "object" && !Array.isArray(body.method)
        ? body.method as PlanningMethodPackInput
        : null;
      if (body.scope !== "personal" || !method) {
        sendJson(response, 400, { error: L("个人方法内容无效") });
        return true;
      }
      try {
        sendJson(response, 200, await homeActions.invoke(personalPlanningActions.save, { method: personalMethodInput(method) }));
      } catch (error) {
        sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
      }
      return true;
    }
    return false;
  }
  async function project(request: IncomingMessage, response: ServerResponse, url: URL,
    controlToken: string, readWebView: () => MolisWorkWebView | Promise<MolisWorkWebView>, actions: BoundActionClient, homeActions: BoundActionClient,
  ): Promise<boolean> {
    const route = request.method === "GET" ? matchGoalsPlanningRoute(url.pathname, "project") : null;
    let pageMethods: PlanningMethodPack[] = [];
    if (route && !(route.kind === "method" && route.method_id === "new")) {
      try { pageMethods = (await actions.invoke(goalsActions.planningRead, {})).methods; }
      catch (error) { sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) }); return true; }
    }
    const pageView = route ? await readWebView() : null;
    const projectPlanningPage = renderWorkbenchPlanningRequest(request.method, url.pathname, "project", () => {
      const view = pageView!;
      const methods = pageMethods;
      return {
        methods,
        library: () => renderMolisWorkPlanningSettings(view, methods, controlToken, isDesktopShellRequest(request, url)),
        method: (method, mode) => renderMolisWorkPlanningMethodPage(
          method, mode, "project", view.project, controlToken, isDesktopShellRequest(request, url), view.projects),
      };
    }, L);
    if (projectPlanningPage) {
      if ("error" in projectPlanningPage) { sendJson(response, projectPlanningPage.status, { error: projectPlanningPage.error }); return true; }
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "content-security-policy": PAGE_CSP,
      });
      response.end(projectPlanningPage.html);
      return true;
    }
    if (request.method === "GET" && url.pathname === "/api/settings/planning-methods") {
      try { sendJson(response, 200, await actions.invoke(goalsActions.planningRead, {})); }
      catch (error) { sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) }); }
      return true;
    }
    if (request.method === "POST" && url.pathname === "/api/settings/planning-methods/apply") {
      const body = await readBody(request);
      const methodId = typeof body.method_id === "string" ? body.method_id.trim() : "";
      try {
        sendJson(response, 200, await actions.invoke(goalsActions.planningApply, {
          method_id: methodId,
          user_confirmed: body.user_confirmed === true,
        }));
      } catch (error) {
        sendJson(response, error && typeof error === "object" && "code" in error && error.code === "planning_method.not_found" ? 404 : 400,
          { error: error instanceof Error ? error.message : String(error) });
      }
      return true;
    }
    if (request.method === "POST" && url.pathname === "/api/settings/planning-methods") {
      const body = await readBody(request);
      const scope = body.scope === "personal" ? "personal" : body.scope === "project" ? "project" : null;
      const method = body.method && typeof body.method === "object" && !Array.isArray(body.method)
        ? body.method as PlanningMethodPackInput
        : null;
      if (!scope || !method) {
        sendJson(response, 400, { error: L("保存范围或方法内容无效") });
        return true;
      }
      try {
        if (scope === "project") {
          const saved = await actions.invoke(goalsActions.planningSave, {
            method,
            user_confirmed: true,
          });
          sendJson(response, 200, saved);
        } else {
          sendJson(response, 200, await homeActions.invoke(personalPlanningActions.save, { method: personalMethodInput(method) }));
        }
      } catch (error) {
        sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
      }
      return true;
    }
    return false;
  }
  return { personal, project };
}
