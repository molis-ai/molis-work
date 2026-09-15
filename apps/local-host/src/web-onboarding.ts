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
    if (request.method === "GET" && url.pathname === "/api/onboarding/status") {
      sendJson(response, 200, molisWorkOnboardingStatus(homeDirectory, projectCount));
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
            actor_id: "web-user",
          });
          const projectPath = `/projects/${encodeURIComponent(project.project_id)}/`;
          partialProjectPath = projectPath;
          const hostClient = localHost.client(molisWorkHostProjectReference({
            databasePath: project.database_path,
            boardId: project.board_id,
            projectId: project.project_id,
          }));
          const title = input.outcome
            .replace(/^我想(?:要)?\s*/u, "")
            .replace(/\s+/gu, " ")
            .trim()
            .slice(0, 120) || input.projectName;
          const createdGoal = (await hostClient.invoke(createGoalIntentCapability, {
            board_id: project.board_id,
            title,
            outcome: input.outcome,
            why: "把第一次表达的目标保存为可继续澄清的共同事实",
            business_logic: `${onboardingPlanningHint(input.intentFrame)} 先保存用户想看到的结果，再由用户和 Runtime 共同补全范围、拆分与验收，不把推断直接写成已确认目标树。`,
            priority: 50,
            actor_id: "web-user",
            actor_kind: "user",
            idempotency_key: `onboarding-root-goal-${project.project_id}`,
            source_kind: "onboarding",
          })).goal;
          const workspace = input.workspacePath
            ? catalog.addWorkspaceProject({
                project_id: project.project_id,
                canonical_path: input.workspacePath,
                actor_id: "web-user",
                user_confirmed: true,
              })
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
      const mode = requestedMode === "update" || (status.update_required && requestedMode !== "new-project")
        ? "update"
        : projectCount === 0
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
