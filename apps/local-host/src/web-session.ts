import fs from "node:fs";
import type { RuntimeSessionTransport } from "@molis-ai/molis-work-contracts/services/runtime-host";
import type { MolisWorkWebView, WebProjectNavigation } from "@molis-ai/molis-work-app-workbench";
import { SessionContentService, SessionDirectoryService, SessionHandoffService, SessionTuiRecorder, RegistryFallbackSessionAdapter, buildWorkSessionView, type ProjectOperationsData } from "@molis-ai/molis-work-plugin-work";
import type { MolisWorkSessionRegistry } from "@molis-ai/molis-work-module-private-work-context";
import { CodexAppServerTransport, CodexRuntimeSessionAdapter, RuntimeHostRouter } from "@molis-ai/molis-work-service-runtime-host";
import { type MolisWorkProjectCatalog, type MolisWorkWorkspaceDirectoryRecord, normalizeRuntimeWorkContext } from "./project-catalog.js";
import { SUPPORTED_RUNTIME_IDS } from "./installer/runtime-integration-contract.js";
import { openWorkSessionRegistry } from "./session-registry.js";
import { reconcileLegacySessionCatalog } from "./session-migration.js";

export interface SessionRuntimeResources {
  registry: MolisWorkSessionRegistry;
  router: RuntimeHostRouter;
  directory: SessionDirectoryService;
  content: SessionContentService;
  handoff: SessionHandoffService;
  recorder: SessionTuiRecorder;
  ownedCodexTransport: CodexAppServerTransport | null;
}

export async function desktopPanelSessionIds(
  catalog: MolisWorkProjectCatalog,
  panelIds: readonly string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (panelIds.length === 0) return result;
  const registry = await openWorkSessionRegistry({ homeDirectory: catalog.homeDirectory });
  try {
    reconcileLegacySessionCatalog(catalog, registry);
    for (const panelId of panelIds) {
      const sessionId = registry.findBySurface(panelId)?.session_id;
      if (sessionId) result.set(panelId, sessionId);
    }
    return result;
  } finally {
    registry.close();
  }
}

export async function openSessionRuntimeResources(options: { homeDirectory?: string; runtimeSessionTransport?: RuntimeSessionTransport }): Promise<SessionRuntimeResources> {
  const registry = await openWorkSessionRegistry({ homeDirectory: options.homeDirectory });
  const router = new RuntimeHostRouter(
    (runtimeId) => new RegistryFallbackSessionAdapter(runtimeId, registry),
  );
  const ownedCodexTransport = options.runtimeSessionTransport ? null : new CodexAppServerTransport();
  router.register(new CodexRuntimeSessionAdapter(options.runtimeSessionTransport ?? ownedCodexTransport!));
  const directory = new SessionDirectoryService(registry, router);
  const content = new SessionContentService(registry, router);
  return {
    registry,
    router,
    directory,
    content,
    handoff: new SessionHandoffService(registry, router, directory, content),
    recorder: new SessionTuiRecorder(registry),
    ownedCodexTransport,
  };
}

export function createSessionProjectOperations(runtimeTitle: (runtimeKind: string) => string) {
  return function sessionProjectOperationsData(
    resources: SessionRuntimeResources,
    projectId: string,
    view: MolisWorkWebView,
    projects: readonly WebProjectNavigation[] = [],
    catalogWorkspaces: readonly MolisWorkWorkspaceDirectoryRecord[] = [],
  ): ProjectOperationsData {
    return buildWorkSessionView({
      projectId,
      sessions: resources.registry,
      runtime: resources.router,
      goals: view.goals.map((item) => item.goal),
      allGoals: [...view.goals, ...view.archived_goals, ...view.trashed_goals].map((item) => item.goal),
      projects,
      catalogWorkspaces,
      supportedRuntimeIds: SUPPORTED_RUNTIME_IDS,
      runtimeTitle,
      workspaceExists: fs.existsSync,
      normalizeWorkspace: (canonicalPath) => normalizeRuntimeWorkContext({
        runtime_id: "molis-work-web",
        stable_work_context_id: null,
        host_declares_stable: false,
        workspace: { canonical_path: canonicalPath, realpath_verified: false },
      }).workspace,
    });
  };
}
