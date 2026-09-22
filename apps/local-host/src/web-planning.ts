import type { IncomingMessage, ServerResponse } from "node:http";
import { resolvePlanningMethodPacks } from "@molis-ai/molis-work-module-goals";
import type { GoalsPlanningApi, PlanningMethodPackInput } from "@molis-ai/molis-work-contracts/modules/goals";
import { renderWorkbenchPlanningRequest, type MolisWorkWebView, type WebProjectNavigation } from "@molis-ai/molis-work-app-workbench";
import { readPersonalPlanningMethodPacks } from "./personal-planning-methods.js";
import type { MolisWorkLocalHost } from "./project-host.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";
import type { createLocalHostWorkbenchRenderer } from "./workbench-renderer.js";
import { sendLocalWebJson as sendJson, readLocalWebBody as readBody } from "./web-http.js";
import { L } from "./web-locale.js";

export function createLocalPlanningHttp(ports: {
  withCatalog: LocalWebCatalogRunner;
  renderer: Pick<ReturnType<typeof createLocalHostWorkbenchRenderer>, "renderMolisWorkPlanningLibrary" | "renderMolisWorkPlanningMethodPage" | "renderMolisWorkPlanningSettings">;
  isDesktopShellRequest(request: IncomingMessage, url: URL): boolean;
  pageCsp: string;
}) {
  const { withCatalog: withMolisWorkProjectCatalog, isDesktopShellRequest, pageCsp: PAGE_CSP } = ports;
  const { renderMolisWorkPlanningLibrary, renderMolisWorkPlanningMethodPage, renderMolisWorkPlanningSettings } = ports.renderer;
  async function personal(request: IncomingMessage, response: ServerResponse, url: URL, homeDirectory: string | undefined,
    projects: WebProjectNavigation[], controlToken: string, localHost: MolisWorkLocalHost, clearFeedSchedulers: () => void,
  ): Promise<boolean> {
    const contextProjectId = url.searchParams.get("project");
    const contextProject = contextProjectId
      ? projects.find((project) => project.project_id === contextProjectId) ?? null : null;
    const planningDocument = request.method === "GET" && url.pathname.startsWith("/settings/planning");
    const enabledPlugins = planningDocument && contextProject && homeDirectory
      ? await withMolisWorkProjectCatalog({ homeDirectory }, (catalog) => catalog.listProjectPlugins(contextProject.project_id))
      : [];
    const globalPlanningPage = renderWorkbenchPlanningRequest(request.method, url.pathname, "personal", () => {
      const methods = resolvePlanningMethodPacks(readPersonalPlanningMethodPacks(homeDirectory));
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
      sendJson(response, 200, { methods: resolvePlanningMethodPacks(readPersonalPlanningMethodPacks(homeDirectory)) });
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
        const saved = await withMolisWorkProjectCatalog({ homeDirectory: homeDirectory }, (catalog) => {
          const saved = catalog.personalPlanningMethods.save(method, new Date().toISOString());
          return saved;
        });
        // Personal planning methods are constructor inputs for every
        // Project runtime. Reopen them through the Host instead of letting
        // each entrypoint rebuild its own Coordinator.
        await Promise.all(localHost.status().projects.map((project) =>
          localHost.closeProject(project.storage_key)));
        clearFeedSchedulers();
        sendJson(response, 200, { method: saved });
      } catch (error) {
        sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
      }
      return true;
    }
    return false;
  }
  async function project(request: IncomingMessage, response: ServerResponse, url: URL, homeDirectory: string | undefined,
    boardId: string, controlToken: string, readWebView: () => MolisWorkWebView, planning: GoalsPlanningApi,
  ): Promise<boolean> {
    const projectPlanningPage = renderWorkbenchPlanningRequest(request.method, url.pathname, "project", route => {
      const view = readWebView();
      const methods = route.kind === "method" && route.method_id === "new"
        ? [] : planning.effectiveMethods(boardId);
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
      sendJson(response, 200, {
        methods: planning.effectiveMethods(boardId),
        composition: planning.projectComposition(boardId),
      });
      return true;
    }
    if (request.method === "POST" && url.pathname === "/api/settings/planning-methods/apply") {
      const body = await readBody(request);
      const methodId = typeof body.method_id === "string" ? body.method_id.trim() : "";
      const source = methodId
        ? resolvePlanningMethodPacks(readPersonalPlanningMethodPacks(homeDirectory))
          .find((method) => method.method_id === methodId && method.scope !== "project") ?? null
        : null;
      if (!source) {
        sendJson(response, 404, { error: L("找不到可选的规划方法") });
        return true;
      }
      const method: PlanningMethodPackInput = {
        method_id: source.method_id,
        version: source.version,
        kind: source.kind,
        name: source.name,
        summary: source.summary,
        instructions: source.instructions,
        applies_to: source.applies_to,
        domain_tags: source.domain_tags,
        steps: source.steps,
        required_coverage: source.required_coverage,
        dependency_rules: source.dependency_rules,
        evidence_requirements: source.evidence_requirements,
        completion_checks: source.completion_checks,
        failure_modes: source.failure_modes,
        source_refs: source.source_refs,
        confidence: source.confidence,
        enabled: true,
      };
      try {
        sendJson(response, 200, planning.saveProjectMethod({
          board_id: boardId,
          method,
          actor_id: "web-user",
          user_confirmed: body.user_confirmed === true,
        }));
      } catch (error) {
        sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
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
          const saved = planning.saveProjectMethod({
            board_id: boardId,
            method,
            actor_id: "web-user",
            user_confirmed: true,
          });
          sendJson(response, 200, saved);
        } else {
          await withMolisWorkProjectCatalog({ homeDirectory: homeDirectory }, (catalog) => {
            const saved = catalog.personalPlanningMethods.save(method, new Date().toISOString());
            sendJson(response, 200, { method: saved });
          });
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
