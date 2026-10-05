import type { WorkSessionPanelInput } from "@molis-ai/molis-work-contracts/modules/private-work-context";
import type { MolisWorkDesktopPanelRecord } from "./project-catalog.js";
import { normalizeRuntimeWorkContext } from "./project-catalog.js";
import { openWorkSessionRegistry } from "./session-registry.js";

/** A panel as its Session records it, with the workspace normalized like every other Session's. */
export function panelSessionInput(panel: MolisWorkDesktopPanelRecord): WorkSessionPanelInput {
  const workspace = panel.cwd
    ? normalizeRuntimeWorkContext({
        runtime_id: panel.runtime_kind,
        stable_work_context_id: null,
        host_declares_stable: false,
        workspace: { canonical_path: panel.cwd, realpath_verified: false },
      }).workspace
    : undefined;
  return {
    panel_id: panel.panel_id,
    project_id: panel.project_id,
    goal_id: panel.goal_id,
    runtime_id: panel.runtime_kind,
    work_context_id: panel.work_context_id,
    host_session_id: panel.host_session_id,
    workspace_id: workspace?.workspace_id ?? null,
    workspace_path: workspace?.canonical_path ?? null,
    title: panel.title,
    status: panel.status,
    created_at: panel.created_at,
    updated_at: panel.updated_at,
  };
}

/** Panels write their Sessions when they are written; returns each panel's Session id. */
export async function recordDesktopPanelSessions(homeDirectory: string, panels: readonly MolisWorkDesktopPanelRecord[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (panels.length === 0) return result;
  const registry = await openWorkSessionRegistry({ homeDirectory });
  try {
    for (const panel of panels) result.set(panel.panel_id, registry.recordPanelSession(panelSessionInput(panel)).session_id);
    return result;
  } finally { registry.close(); }
}
