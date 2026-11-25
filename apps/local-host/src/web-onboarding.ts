import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { PERSONAL_SPACE_PROJECT_ID, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { bindLocalWebAction, bindLocalWebActions, bindLocalWebProjectAiActions } from "./local-web-actions.js";
import { SESSIONS_HISTORY_PERMISSION, SESSIONS_READ_PERMISSION } from "@molis-ai/molis-work-contracts/services/sessions";
import { onboardingTakers, type OnboardingMaterialKind } from "./onboarding-takers.js";
import { createContextOnboardingHttp } from "./web-context-onboarding.js";
import { resolveConfiguredHome } from "./product-home.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { molisWorkHostProjectReference, type MolisWorkLocalHost } from "./project-host.js";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import { assertOnboardingWritable, molisWorkOnboardingStatus, dismissMolisWorkOnboarding, completeMolisWorkOnboarding } from "./onboarding.js";
import { projectNavigation } from "./web-project-presentation.js";
import { sendLocalWebJson as sendJson, readLocalWebBody as readBody } from "./web-http.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";
import type { createLocalHostWorkbenchRenderer } from "./workbench-renderer.js";

interface OnboardingHttpPorts {
  cliAvailability(): Record<string, boolean>;
  withCatalog: LocalWebCatalogRunner;
  renderOnboarding: ReturnType<typeof createLocalHostWorkbenchRenderer>["renderMolisWorkOnboarding"];
  isDesktopShellRequest(request: IncomingMessage, url: URL): boolean;
  pageCsp: string;
}

/**
 * The blank start below makes the personal space and then writes down that onboarding is done. A record this build
 * may not replace is answered with its refusal before the space is made (upgrade-chain-design §2.6), by the same check as the context journey's.
 */
function refusedBeforeMaking(response: ServerResponse, homeDirectory: string | undefined): boolean {
  try { assertOnboardingWritable(homeDirectory); return false; }
  catch (error) { const refusal = actionErrorResponse(error); sendJson(response, refusal.status, refusal.body); return true; }
}

/** Who takes a code folder is what Manifests declare; each is called with its own declared action's permissions only (batch12-design §7.7 C1). */
function takePorts(ports: OnboardingHttpPorts, localHost: MolisWorkLocalHost) {
  return {
    takers: (kind: OnboardingMaterialKind) => onboardingTakers(kind),
    take: async (home: string, projectId: string, definition: ActionDefinition) => {
      const project = await ports.withCatalog({ homeDirectory: home }, catalog => catalog.getProject(projectId));
      return bindLocalWebAction(localHost, molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id }), definition);
    },
  };
}

export function createLocalOnboardingHttp(ports: OnboardingHttpPorts) {
  return async function handleOnboarding(request: IncomingMessage, response: ServerResponse, url: URL, homeDirectory: string | undefined, projectCount: number, localHost: MolisWorkLocalHost, controlToken: string): Promise<boolean> {
    if (await createContextOnboardingHttp({ ...ports, actions: async (home, projectId, original_file) => {
      const project = await ports.withCatalog({ homeDirectory: home }, catalog => catalog.getProject(projectId));
      const reference = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
      // The 成果库's imports, by what the person holds (PG-008); a taker's own action is bound by itself (`take`), with its own permissions.
      return bindLocalWebActions(localHost, reference, ["artifacts:read", "artifacts:write"], original_file ? { original_file } : {});
    }, sessions: async (home, projectId, signal) => {
      const project = await ports.withCatalog({ homeDirectory: home }, catalog => catalog.getProject(projectId));
      return bindLocalWebProjectAiActions(localHost, molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id }), [SESSIONS_READ_PERMISSION, SESSIONS_HISTORY_PERMISSION], { signal });
    }, ...takePorts(ports, localHost), takeAtHome: (definition, signal) => bindLocalWebAction(localHost, undefined, definition, { signal }) }, localHost)(request, response, url, homeDirectory ?? resolveConfiguredHome())) return true;
    if (request.method === "GET" && url.pathname === "/api/onboarding/status") {
      sendJson(response, 200, molisWorkOnboardingStatus(homeDirectory, projectCount));
      return true;
    }
    // “空白开始”不必先建项目：进入个人空间，之后随时建项目、把内容移过去。
    if (request.method === "POST" && url.pathname === "/api/onboarding/personal") {
      if (refusedBeforeMaking(response, homeDirectory)) return true;
      try {
        // Every Home has the personal space from the catalog's first open (batch 106): this reads it, never makes it.
        const space = await ports.withCatalog({ homeDirectory }, catalog => catalog.getProject(PERSONAL_SPACE_PROJECT_ID));
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
        sendJson(response, 400, { error: uiText.text("workbench.onboarding.confirm-which-onboarding-section-want-dismiss") });
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
