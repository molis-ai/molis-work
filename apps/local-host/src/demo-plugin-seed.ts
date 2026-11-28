import { PLATFORM_PLUGIN_REGISTRATIONS } from "./plugin-registry.js";
import type { ProjectsModule } from "@molis-ai/molis-work-module-projects";
import type { BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionErrorKind } from "@molis-ai/molis-work-plugin-sdk";
import { shelfActions } from "@molis-ai/molis-work-module-shelf/surface";
export { DEMO_CORE_ARTIFACT_ID } from "./demo-deliverable.js";

/**
 * Enable built-in plugins in the demo project unless their registration opts out (`demo_seed: false`) because they have
 * no seeded demo content to show yet.
 */
export function enableDemoProjectPlugins(
  projects: Pick<ProjectsModule, "commands" | "query">,
  projectId: string,
  actorId: string,
): void {
  for (const entry of PLATFORM_PLUGIN_REGISTRATIONS) {
    if (entry.demo_seed === false) continue;
    const plugin_id = entry.project_plugin_id;
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
