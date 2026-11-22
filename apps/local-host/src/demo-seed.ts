import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { writeProjectRoot } from "@molis-ai/molis-work-module-projects";
import { registerDemoDeliverable } from "./demo-deliverable.js";
import { DEMO_PROJECT_ID } from "./demo-project-id.js";
import { acceptDemoProjectRequirements, runDemoPluginSeed } from "./plugin-demo-seed.js";
import { LocalProjectDatabase } from "./project-database.js";
import { runningProjectPlatform } from "./project-plugins.js";

export { DEMO_PROJECT_ID };

const DEMO_ACTOR = "demo-user";

/**
 * A new project's library for the sample: the platform's root row and nothing of any plugin's.
 * Each plugin creates its own tables when the project is first opened, and writes its sample via `manifest.demo_seed`.
 */
export function seedDemoBoard(databasePath: string, projectId = DEMO_PROJECT_ID): void {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const store = new LocalProjectDatabase(databasePath);
  try {
    writeProjectRoot(store.db, projectId, new Date().toISOString());
    store.checkpoint();
  } finally {
    store.close();
  }
}

/**
 * Seeds project-scoped plugin samples into a new project database through a disposable Host, invoking each running
 * project-scoped plugin's declared `manifest.demo_seed` action without naming any specific plugin.
 * Home-scoped plugins (`manifest.runtime?.scope`) seed on first open in the real Home via `initializeDemoPlugins`.
 */
export async function seedDemoProject(databasePath: string, projectId = DEMO_PROJECT_ID): Promise<void> {
  seedDemoBoard(databasePath, projectId);
  registerDemoDeliverable(databasePath, projectId);
  // Loaded lazily: the Host imports the catalog, which imports this seed.
  const { MolisWorkLocalHost, molisWorkHostProjectReference } = await import("./project-host.js");
  const home = await fs.promises.mkdtemp(path.join(os.tmpdir(), "molis-work-demo-seed-"));
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  try {
    const project = molisWorkHostProjectReference({ projectId, databasePath });
    const assertCurrent = () => { if (host.lifecycle() !== "running") throw new ActionError("actions.host_closed", "示例项目的宿主已关闭"); };
    await host.inspectActions({ actor_id: DEMO_ACTOR, actor_kind: "user", audience: "user", project_id: projectId, permissions: [] }, project);
    const platform = await host.withProject(project, ({ store }) => runningProjectPlatform(store, projectId));
    if (!platform) return;
    const client = host.actionClient(project);
    for (const state of platform.supervisor.states()) {
      if (state.status !== "running" || !state.install_id) continue;
      const manifest = platform.supervisor.manifest(state.plugin_id);
      if (!manifest?.demo_seed || manifest.runtime?.scope) continue;
      const ref = manifest.demo_seed;
      const definition = manifest.actions?.find(action => action.capability_id === ref.capability_id && action.version === ref.version);
      if (!definition) continue;
      const installId = state.install_id;
      const meta = host.inspectActionMetadata(
        { actor_id: DEMO_ACTOR, project_id: projectId, audience: "workflow", permissions: [...definition.action.permissions] },
        project,
      ).find(row => row.capability_id === ref.capability_id && row.version === ref.version && row.provider.plugin_install_id === installId);
      const providerId = meta?.provider.provider_id ?? state.plugin_id;
      await runDemoPluginSeed({
        projectId,
        actorId: DEMO_ACTOR,
        client,
        entry: {
          manifest,
          providerId,
          current: () => platform.supervisor.state(state.plugin_id)?.status === "running" && platform.supervisor.state(state.plugin_id)?.install_id === installId,
        },
        assertCurrent,
        assertSyncCurrent: assertCurrent,
        acceptDemoRequirements: items => acceptDemoProjectRequirements(host, project, items, DEMO_ACTOR),
      });
    }
  } finally {
    await host.close();
    await fs.promises.rm(home, { recursive: true, force: true });
  }
}

/** Backwards-compatible alias kept for existing catalog/test imports; delegates to plugin-neutral `seedDemoProject`. */
export const seedDemoGoals = seedDemoProject;

/**
 * Starts the sample board of a demo fixture whose library is not there yet, and answers when it is written (null when there is nothing to
 * seed). Plugin demo seed actions take a moment, so the first request waits for it; a failure answers that request, like any other.
 */
export function startDemoSeed(fixture: { readonly demo?: boolean; readonly databasePath: string } | null | undefined): Promise<void> | null {
  if (!fixture?.demo || fs.existsSync(fixture.databasePath)) return null;
  const seeding = seedDemoProject(fixture.databasePath);
  seeding.catch(() => undefined);
  return seeding;
}
