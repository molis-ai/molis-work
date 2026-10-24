import { HOST_WORKSPACE_CHANGED_EVENT } from "@molis-ai/molis-work-contracts/platform/plugin";
import { hostLog } from "./host-log.js";
import type { LocalProjectDatabase } from "./project-database.js";
import { runningProjectPlatform } from "./project-plugins.js";

/**
 * The project's folder settings changed (BL-521): a folder was linked, repaired or unlinked, or the browsing folder was chosen. It goes
 * out as `host.workspace.changed@1` with `cause: "workspace-settings"` to the installations of this project that subscribe and hold
 * `workspace:read`, the way an Agent's approved write does (`review-settlement-events.ts`), so a plugin holding the old folder's
 * files reads again. It uses the project platform's own `hostEvents` and only while that platform runs: the event is not stored and
 * never starts a plugin or a platform. A failed announcement is logged, not the action's failure: the change is already committed.
 */
export async function announceWorkspaceSettingsChange(store: LocalProjectDatabase, projectId: string, workspaceId: string): Promise<void> {
  try {
    const platform = await runningProjectPlatform(store, projectId);
    platform?.hostEvents.broadcast({ event_type_id: HOST_WORKSPACE_CHANGED_EVENT, type_version: 1, payload: { workspace_id: workspaceId, cause: "workspace-settings" } });
  } catch (error) { hostLog.warn("workspace-settings", "announce_failed", error, { project_id: projectId, workspace_id: workspaceId }); }
}
