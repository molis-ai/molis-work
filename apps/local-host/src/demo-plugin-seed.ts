import { PROJECT_SCOPED_PLUGIN_IDS } from "./plugin-registry.js";
import type { ProjectsModule } from "@molis-ai/molis-work-module-projects";
import type { BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionErrorKind } from "@molis-ai/molis-work-plugin-sdk";
import { shelfActions } from "@molis-ai/molis-work-plugin-shelf";
export { DEMO_CORE_ARTIFACT_ID } from "./demo-deliverable.js";

/**
 * Plugins the demo project does **not** turn on.
 *
 * The demo exists to show what the product does, so a Plugin belongs in it only
 * once it has something to show. The workspace family starts and its ports are
 * real, but only Workspace's panel is mounted today — seeding the others would
 * give a first-time user navigation entries that open to nothing, which reads
 * as a broken product rather than as an unfinished one.
 *
 * Remove an id from here when its panel lands, not before.
 */
const DEMO_WITHHELD_PLUGIN_IDS: readonly string[] = [
  "workspace",
  "files",
  "git",
  "diff",
  "text-stats",
];

export function enableDemoProjectPlugins(
  projects: Pick<ProjectsModule, "commands" | "query">,
  projectId: string,
  actorId: string,
): void {
  for (const plugin_id of PROJECT_SCOPED_PLUGIN_IDS) {
    if (DEMO_WITHHELD_PLUGIN_IDS.includes(plugin_id)) continue;
    if (projects.query.listProjectPlugins(projectId).includes(plugin_id)) continue;
    projects.commands.addProjectPlugin({ project_id: projectId, plugin_id, actor_id: actorId });
  }
}

/**
 * The demo's sample in this Home's Shelf, put back if it was removed: Shelf's own action, called by the process that runs Shelf (the
 * resident Host) after the demo is made or rebuilt. A Shelf that is missing, off or not granted is left as it is; the demo is made
 * either way. A process without that Host (the CLI) does not call this; Shelf puts its first-run sample on the shelf itself when it
 * starts.
 */
export async function seedDemoHomeSamples(actions: Pick<BoundActionClient, "invoke">): Promise<void> {
  try {
    await actions.invoke(shelfActions.sample, {});
  } catch (error) {
    const kind = actionErrorKind(error);
    if (kind !== "not_found" && kind !== "unavailable" && kind !== "forbidden") throw error;
  }
}
