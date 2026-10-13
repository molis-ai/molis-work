import type { MolisWorkLocalHost } from "./project-host.js";
import { projectDeletedHooksFor } from "./project-deleted-hooks.js";

/**
 * A deleted project's open runtime is closed first, whichever way the project was deleted (the Web page closes it
 * before asking; MCP and the demo's remove and rebuild do not). Closing stops what the project's runtime runs
 * (generated plugins, Plugin Studio's runners) and lets go of its database, so a project made again under the same path
 * never meets the old, unlinked database through a runtime that was left open.
 */
export function registerProjectRuntimeOwner(host: MolisWorkLocalHost, home: string): () => void {
  return projectDeletedHooksFor(home).register({
    id: "project-runtime",
    label: null,
    priority: -10,
    alive: () => host.lifecycle() === "running",
    async clear(projectId) {
      for (const runtime of host.status().projects.filter(row => row.project_id === projectId)) await host.closeProject(runtime.storage_key);
    },
  });
}
