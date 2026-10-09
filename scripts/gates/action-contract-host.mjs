// The product half of the action-contract snapshot (scripts/gates/action-contract-snapshot.mjs): the built-in Manifests, and the
// action directory of a Host that has every built-in plugin enabled. Kept apart from the snapshot code so that code stays a pure
// function of the data it is given, which is what its mutation tests exercise.
//
// THE HOST RUNS ON A THROWAWAY HOME. `withIsolatedHome` points HOME and MOLIS_WORK_HOME at a fresh temporary directory and the
// secret store at its file backend for the duration, and `collectHostViews` refuses to start unless it finds exactly that. Without
// it, code that resolves the Home by default would reach the person's real one (~/.molis-work). Nothing real is opened here.
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ENVIRONMENT = ["HOME", "MOLIS_WORK_HOME", "MOLIS_WORK_SECRET_BACKEND", "MOLIS_WORK_ENCRYPTION_KEY"];
const AUDIENCES = ["user", "agent", "workflow", "plugin", "mcp"];

/** Runs `operation(home)` with the environment pointed at a new temporary Home, and puts the environment back. */
export const withIsolatedHome = async (operation) => {
  const home = mkdtempSync(path.join(tmpdir(), "action-contract-home-"));
  const saved = Object.fromEntries(ENVIRONMENT.map((name) => [name, process.env[name]]));
  Object.assign(process.env, { HOME: home, MOLIS_WORK_HOME: home, MOLIS_WORK_SECRET_BACKEND: "file", MOLIS_WORK_ENCRYPTION_KEY: "" });
  try {
    return await operation(home);
  } finally {
    for (const name of ENVIRONMENT) { if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name]; }
    rmSync(home, { recursive: true, force: true });
  }
};

const inside = (child, parent) => { const relative = path.relative(parent, child); return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative); };
const refuse = () => new Error("refusing to start a Host: MOLIS_WORK_HOME and HOME must both be the throwaway Home inside the temporary directory");
const assertThrowawayHome = (home) => {
  let real, configured;
  try {
    real = realpathSync(home);
    configured = process.env.MOLIS_WORK_HOME ? realpathSync(process.env.MOLIS_WORK_HOME) : "";
    if (!inside(real, realpathSync(tmpdir())) || configured !== real || process.env.HOME !== home) throw refuse();
  } catch (error) {
    throw error.message.startsWith("refusing") ? error : refuse();
  }
};

/**
 * The actions a Host registers when every project-scoped built-in plugin is enabled in a project, as the action directory lists
 * them to each audience in the project and at Home level (a plain array of `ActionView` fields; one registration appears
 * several times). Only inside `withIsolatedHome`.
 */
export const collectHostViews = async (home) => {
  assertThrowawayHome(home);
  const { MolisWorkLocalHost, molisWorkHostProjectReference } = await import("@molis-ai/molis-work-app-local-host");
  const { openMolisWorkProjectCatalog } = await import("@molis-ai/molis-work-app-desktop");
  const { PROJECT_SCOPED_PLUGIN_IDS } = await import("@molis-ai/molis-work-app-workbench");
  const { projectActionAvailability } = await import(new URL("../../apps/local-host/dist/project-action-availability.js", import.meta.url).href);
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  let host;
  try {
    const project = await catalog.createProject({ display_name: "Action contract snapshot", actor_id: "owner" });
    for (const pluginId of PROJECT_SCOPED_PLUGIN_IDS) catalog.addProjectPlugin({ project_id: project.project_id, plugin_id: pluginId, actor_id: "owner" });
    host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, workspaceFor: async () => null,
      actionAvailability: projectActionAvailability(async (_options, operation) => operation(catalog), home) });
    const reference = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
    const read = async () => {
      const views = [];
      for (const audience of AUDIENCES) {
        for (const [scope, projectId] of [[reference, project.project_id], [undefined, null]]) {
          const caller = { actor_id: "owner", project_id: projectId, audience, permissions: [] };
          for (const view of await host.inspectActions(caller, scope)) {
            views.push({ capability_id: view.capability_id, version: view.version, operation: view.operation, action: view.action,
              provider: { provider_id: view.provider.provider_id, ...(view.provider.plugin_id ? { plugin_id: view.provider.plugin_id } : {}) } });
          }
        }
      }
      return views;
    };
    // A plugin that is still starting would make the directory shorter than it is; two reads in a row must agree.
    const names = (views) => views.map((view) => `${view.capability_id}@${view.version} ${view.provider.provider_id}`).sort().join("\n");
    let views = await read();
    for (let attempt = 0; attempt < 5; attempt++) {
      const again = await read();
      if (names(again) === names(views)) {
        if (!again.length) throw new Error("the Host listed no action at all");
        return again;
      }
      views = again;
    }
    throw new Error("the Host's action directory kept changing between reads; a plugin did not finish starting");
  } finally {
    await host?.close();
    catalog.close();
  }
};

/** The built-in Manifests (the workbench's catalog) and the effect rule of the contracts package. */
export const loadManifests = async () => {
  const { BUILTIN_PLUGIN_CATALOG } = await import("@molis-ai/molis-work-app-workbench");
  const { actionEffect } = await import("@molis-ai/molis-work-contracts/platform/actions");
  return { manifests: BUILTIN_PLUGIN_CATALOG.map((entry) => entry.manifest), effectOf: (meta, capabilityId) => actionEffect(meta, capabilityId) };
};

/** Everything the snapshot is built from: `{ manifests, effectOf, hostViews }`. Even the imports happen inside the throwaway Home. */
export const loadProduct = () => withIsolatedHome(async (home) => ({ ...(await loadManifests()), hostViews: await collectHostViews(home) }));
