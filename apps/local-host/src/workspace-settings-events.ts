import { projectSettingsCapabilities, type ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import { HOST_WORKSPACE_CHANGED_EVENT } from "@molis-ai/molis-work-contracts/platform/plugin";
import { hostLog } from "./host-log.js";
import type { PluginPlatform } from "./plugin-platform.js";
import type { LocalProjectDatabase } from "./project-database.js";
import { projectCallCaller } from "./project-call-caller.js";
import { runningProjectPlatform, type ProjectPluginPorts } from "./project-plugins.js";

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

const opened = new WeakMap<PluginPlatform, Promise<void>>();

/**
 * The project's plugin platform has just been opened through the Host's web entry (BL-521). A change to the folder settings is
 * announced only to the platform that runs (`announceWorkspaceSettingsChange`), so one made while none ran was heard by nobody.
 * Once successfully per platform, before its first plugin route is answered, the Host broadcasts `host.workspace.changed@1` with
 * `cause: "project-opened"` and the folder the project browses (empty when it has none); a plugin that holds files of an earlier
 * folder looks again, and the route waits for the deliveries to finish so a plugin that reads its outputs does not read the old
 * ones. Starting a platform headlessly (discovering actions) reads and sends nothing: only this entry does, because only it is
 * followed by a person's reads. The folder is the one `projectSettingsCapabilities.browsingWorkspace` answers, asked through the Host's
 * own action client as the Host itself (`local-host`, the person's audience, as `host.client` asks) for the project this entry was
 * opened for, within this request's operation: the folders come from whatever owns them for this Host, a failed or missing read leaves
 * its row under the request's id, and a successful one leaves none. A failed announcement is logged, not the route's failure; the next
 * route can try again.
 */
export function announceProjectOpened(platform: PluginPlatform, ports: Pick<ProjectPluginPorts, "projectId" | "actions">): Promise<void> {
  const earlier = opened.get(platform);
  if (earlier) return earlier;
  const announcing: Promise<void> = Promise.resolve().then(async () => {
    const selected = await ports.actions.client.invoke(projectCallCaller(ports.projectId, () => ({})), projectSettingsCapabilities.browsingWorkspace, []) as ProjectWorkspaceRef | null;
    platform.hostEvents.broadcast({ event_type_id: HOST_WORKSPACE_CHANGED_EVENT, type_version: 1, payload: { workspace_id: selected?.workspace_id ?? "", cause: "project-opened" } });
    await platform.hostEvents.drain();
  }).catch(error => {
    if (opened.get(platform) === announcing) opened.delete(platform);
    hostLog.warn("workspace-settings", "opened_announce_failed", error, { project_id: ports.projectId });
  });
  opened.set(platform, announcing);
  return announcing;
}
