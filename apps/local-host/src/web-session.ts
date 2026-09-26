import type { BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
export type { SessionRuntimeResources } from "./session-runtime-resources.js";
import fs from "node:fs";
import type { MolisWorkWebView, WebProjectNavigation } from "@molis-ai/molis-work-app-workbench";
import { buildWorkSessionView, workActions, type ProjectOperationsData } from "@molis-ai/molis-work-plugin-work";
import { type MolisWorkProjectCatalog, type MolisWorkWorkspaceDirectoryRecord, normalizeRuntimeWorkContext } from "./project-catalog.js";
import { openWorkSessionRegistry } from "./session-registry.js";
import { reconcileLegacySessionCatalog } from "./session-migration.js";


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


export function createSessionProjectOperations(runtimeTitle: (runtimeKind: string) => string) {
  return async function sessionProjectOperationsData(
    actions: BoundActionClient,
    projectId: string,
    view: MolisWorkWebView,
    projects: readonly WebProjectNavigation[] = [],
    catalogWorkspaces: readonly MolisWorkWorkspaceDirectoryRecord[] = [],
  ): Promise<ProjectOperationsData> {
    const directory = await actions.invoke(workActions.directory, {});
    const byId = new Map(directory.records.map(row => [row.session.session_id, row]));
    const runtimes = new Map(directory.runtimes.map(row => [row.runtime_id, row.capabilities]));
    return buildWorkSessionView({
      projectId,
      sessions: { list: () => directory.records.map(row => row.session), goalHistory: id => byId.get(id)!.goal_history,
        eventCount: id => byId.get(id)!.event_count },
      runtime: { capabilities: id => runtimes.get(id)! },
      goals: view.goals.map((item) => item.goal),
      allGoals: [...view.goals, ...view.archived_goals, ...view.trashed_goals].map((item) => item.goal),
      projects,
      catalogWorkspaces,
      supportedRuntimeIds: directory.runtimes.map(row => row.runtime_id),
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
