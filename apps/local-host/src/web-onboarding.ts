import { bindActionClient, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { createContextOnboardingHttp } from "./web-context-onboarding.js";
import { resolveConfiguredHome } from "./product-home.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createGoalIntentCapability } from "@molis-ai/molis-work-plugin-goals";
import { onboardingPlanningHint } from "@molis-ai/molis-work-app-workbench";
import { molisWorkHostProjectReference, type MolisWorkLocalHost } from "./project-host.js";
import { molisWorkOnboardingStatus, dismissMolisWorkOnboarding, completeMolisWorkOnboarding } from "./onboarding.js";
import { projectNavigation } from "./web-project-presentation.js";
import { webOnboardingInitializationInput, type WebOnboardingInitializationInput, type OnboardingRuntimePorts } from "./web-onboarding-input.js";
import { sendLocalWebJson as sendJson, readLocalWebBody as readBody } from "./web-http.js";
import { L } from "./web-locale.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";
import type { createLocalHostWorkbenchRenderer } from "./workbench-renderer.js";

interface OnboardingHttpPorts extends OnboardingRuntimePorts {
  withCatalog: LocalWebCatalogRunner;
  renderOnboarding: ReturnType<typeof createLocalHostWorkbenchRenderer>["renderMolisWorkOnboarding"];
  isDesktopShellRequest(request: IncomingMessage, url: URL): boolean;
  pageCsp: string;
}

export function createLocalOnboardingHttp(ports: OnboardingHttpPorts) {
  return async function handleOnboarding(request: IncomingMessage, response: ServerResponse, url: URL, homeDirectory: string | undefined, projectCount: number, localHost: MolisWorkLocalHost, controlToken: string): Promise<boolean> {
    if (await createContextOnboardingHttp({ ...ports, actions: async (home, projectId) => {
      const project = await ports.withCatalog({ homeDirectory: home }, catalog => catalog.getProject(projectId));
      const reference = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
      return bindActionClient(localHost.actionClient(reference), () => ({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project.project_id, audience: "user", permissions: ["pages:write", "artifacts:read", "artifacts:write", "todo:read", "todo:write"] }));
    }, homeActions: (_home, signal) => bindActionClient(localHost.homeActionClient(), () => ({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, audience: "user",
      permissions: ["todo:read", "todo:write", "model:invoke"], signal })) })(request, response, url, homeDirectory ?? resolveConfiguredHome())) return true;
    if (request.method === "GET" && url.pathname === "/api/onboarding/status") {
      sendJson(response, 200, molisWorkOnboardingStatus(homeDirectory, projectCount));
      return true;
    }
    // “空白开始”不必先建项目：进入个人空间，之后随时建项目、把内容移过去。
    if (request.method === "POST" && url.pathname === "/api/onboarding/personal") {
      try {
        const space = await ports.withCatalog({ homeDirectory }, catalog => catalog.ensurePersonalSpace());
        completeMolisWorkOnboarding(homeDirectory, space.project_id);
        sendJson(response, 200, { project: projectNavigation(space), path: `/projects/${encodeURIComponent(space.project_id)}/` });
      } catch (error) {
        sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
      }
      return true;
    }
    if (request.method === "POST" && url.pathname === "/api/onboarding/dismiss") {
      const body = await readBody(request);
      const kind = body.kind === "first_run" || body.kind === "update" ? body.kind : null;
      if (!kind || body.user_confirmed !== true) {
        sendJson(response, 400, { error: L("请明确确认要关闭哪一段引导") });
        return true;
      }
      try {
        sendJson(response, 200, {
          state: dismissMolisWorkOnboarding(homeDirectory, kind),
        });
      } catch (error) {
        sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
      }
      return true;
    }
    if (request.method === "POST" && url.pathname === "/api/onboarding/initialize") {
      let input: WebOnboardingInitializationInput;
      try {
        input = webOnboardingInitializationInput(await readBody(request), ports);
      } catch (error) {
        sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
        return true;
      }
      let partialProjectPath: string | null = null;
      try {
        await ports.withCatalog({ homeDirectory }, async (catalog) => {
          const project = await catalog.createProject({
            display_name: input.projectName,
            actor_id: LOCAL_PERSON_ACTOR_ID,
          });
          const projectPath = `/projects/${encodeURIComponent(project.project_id)}/`;
          partialProjectPath = projectPath;
          const hostClient = localHost.client(molisWorkHostProjectReference({
            databasePath: project.database_path,
            projectId: project.project_id,
          }));
          const title = input.outcome
            .replace(/^我想(?:要)?\s*/u, "")
            .replace(/\s+/gu, " ")
            .trim()
            .slice(0, 120) || input.projectName;
          const createdGoal = (await hostClient.invoke(createGoalIntentCapability, {
            project_id: project.project_id,
            title,
            outcome: input.outcome,
            why: "把第一次表达的目标保存为可继续澄清的共同事实",
            business_logic: `${onboardingPlanningHint(input.intentFrame)} 先保存用户想看到的结果，再由用户和 Runtime 共同补全范围、拆分与验收，不把推断直接写成已确认目标树。`,
            priority: 50,
            idempotency_key: `onboarding-root-goal-${project.project_id}`,
            source_kind: "onboarding",
          })).goal;
          const workspace = input.workspacePath
            ? await catalog.commit(() => catalog.addWorkspaceProject({
                project_id: project.project_id,
                canonical_path: input.workspacePath!,
                actor_id: LOCAL_PERSON_ACTOR_ID,
                user_confirmed: true,
              }))
            : null;
          let journeyWarning: string | null = null;
          try {
            completeMolisWorkOnboarding(homeDirectory, project.project_id);
          } catch (error) {
            journeyWarning = error instanceof Error ? error.message : String(error);
          }
          sendJson(response, 201, {
            project: projectNavigation(project),
            project_path: projectPath,
            goal: {
              goal_id: createdGoal.goal_id,
              title: createdGoal.title,
            },
            goal_id: createdGoal.goal_id,
            goal_path: `${projectPath}goals/${encodeURIComponent(createdGoal.goal_id)}`,
            workspace: workspace
              ? {
                  workspace_id: workspace.workspace_id,
                  display_name: workspace.display_name,
                  canonical_path: workspace.canonical_path,
                }
              : null,
            runtime_autofill: Boolean(input.runtimeKind),
            ...(journeyWarning ? { journey_warning: journeyWarning } : {}),
          });
        });
      } catch (error) {
        sendJson(response, partialProjectPath ? 500 : 400, {
          error: partialProjectPath
            ? `项目已经创建，但初始化未完成：${error instanceof Error ? error.message : String(error)}`
            : error instanceof Error ? error.message : String(error),
          ...(partialProjectPath ? { recovery_path: partialProjectPath } : {}),
        });
      }
      return true;
    }
    if (request.method === "GET" && url.pathname === "/onboarding") {
      const status = molisWorkOnboardingStatus(homeDirectory, projectCount);
      const requestedMode = url.searchParams.get("mode");
      // The first run is for a person who has not met the product yet: one who put it off or finished it and has no project
      // right now begins a new project the way anyone does, without the opening and Welcome again.
      const mode = requestedMode === "update" || (status.update_required && requestedMode !== "new-project")
        ? "update"
        : status.first_run_required
          ? "first_run"
          : "new_project";
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "content-security-policy": ports.pageCsp,
      });
      response.end(ports.renderOnboarding({
        mode,
        currentVersion: status.current_version,
        controlToken,
        desktopShell: ports.isDesktopShellRequest(request, url),
        cliAvailability: ports.cliAvailability(),
      }));
      return true;
    }
    return false;
  };
}
