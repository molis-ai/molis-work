// The product half of the action-contract snapshot (scripts/gates/action-contract-snapshot.mjs): the built-in Manifests, and the
// action directory of a Host that has every built-in plugin enabled. Kept apart from the snapshot code so that code stays a pure
// function of the data it is given, which is what its mutation tests exercise.
//
// THE HOST RUNS ON A THROWAWAY HOME. `withIsolatedHome` points HOME and MOLIS_WORK_HOME at a fresh temporary directory, the secret
// store at its file backend and clears the encryption key for the duration, and `collectHost` refuses to start unless it finds
// exactly that (`assertThrowawayHome`: the Home is inside the temporary directory, HOME and MOLIS_WORK_HOME both name it,
// MOLIS_WORK_SECRET_BACKEND is `file`, MOLIS_WORK_ENCRYPTION_KEY is empty). Without it, code that resolves the Home by default
// would reach the person's real one (~/.molis-work), and outside NODE_ENV=test on macOS any other backend setting would reach the
// machine-wide keychain. Nothing real is opened here.
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
const refuse = () => new Error("refusing to start a Host: HOME and MOLIS_WORK_HOME must both be the throwaway Home inside the temporary directory, with MOLIS_WORK_SECRET_BACKEND=file and an empty MOLIS_WORK_ENCRYPTION_KEY");
/** Throws unless the environment is exactly the one `withIsolatedHome` sets up for `home`. Opens nothing. */
export const assertThrowawayHome = (home) => {
  const resolved = (name) => (process.env[name] ? realpathSync(process.env[name]) : null);
  let throwaway;
  try {
    const real = realpathSync(home);
    throwaway = inside(real, realpathSync(tmpdir())) && resolved("MOLIS_WORK_HOME") === real && resolved("HOME") === real
      && process.env.MOLIS_WORK_SECRET_BACKEND === "file" && !process.env.MOLIS_WORK_ENCRYPTION_KEY;
  } catch {
    throwaway = false; // a path that cannot be resolved is not the throwaway Home either
  }
  if (!throwaway) throw refuse();
};

/**
 * What a Host registers when every project-scoped built-in plugin is enabled in a project, as the directories list it to each
 * audience in the project and at Home level. Returns `{ hostViews, hostScenes }`: `hostViews` are plain `ActionView` fields (one
 * registration appears several times), `hostScenes` the ids and provider of each consumer scene. Only inside `withIsolatedHome`.
 */
export const collectHost = async (home) => {
  assertThrowawayHome(home);
  const { MolisWorkLocalHost, molisWorkHostProjectReference } = await import("@molis-ai/molis-work-app-local-host");
  const { openMolisWorkProjectCatalog } = await import("@molis-ai/molis-work-app-desktop");
  const { PROJECT_SCOPED_PLUGIN_IDS, BUILTIN_PLUGIN_CATALOG } = await import("@molis-ai/molis-work-app-workbench");
  const { projectActionAvailability } = await import(new URL("../../apps/local-host/dist/project-action-availability.js", import.meta.url).href);
  // A scene is listed to a caller who holds its permissions, so the scene caller holds every permission a built-in scene asks for.
  const scenePermissions = [...new Set(BUILTIN_PLUGIN_CATALOG.flatMap((entry) => (entry.manifest.action_scenes ?? []).flatMap((scene) => [...scene.permissions, ...(scene.configuration_permissions ?? [])])))].sort();
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  let host;
  try {
    const project = await catalog.createProject({ display_name: "Action contract snapshot", actor_id: "owner" });
    for (const pluginId of PROJECT_SCOPED_PLUGIN_IDS) catalog.addProjectPlugin({ project_id: project.project_id, plugin_id: pluginId, actor_id: "owner" });
    host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, workspaceFor: async () => null,
      actionAvailability: projectActionAvailability(async (_options, operation) => operation(catalog), home) });
    const reference = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
    const providerOf = (provider) => ({ provider_id: provider.provider_id, ...(provider.plugin_id ? { plugin_id: provider.plugin_id } : {}) });
    const read = async () => {
      const hostViews = [], hostScenes = [];
      for (const audience of AUDIENCES) {
        for (const [scope, projectId] of [[reference, project.project_id], [undefined, null]]) {
          const caller = { actor_id: "owner", project_id: projectId, audience, permissions: [] };
          for (const view of await host.inspectActions(caller, scope)) {
            hostViews.push({ capability_id: view.capability_id, version: view.version, operation: view.operation, action: view.action, provider: providerOf(view.provider) });
          }
          for (const scene of await host.sceneClient(scope).discoverScenes({ ...caller, permissions: scenePermissions })) {
            hostScenes.push({ definition: { scene_id: scene.definition.scene_id, version: scene.definition.version }, provider: providerOf(scene.provider) });
          }
        }
      }
      return { hostViews, hostScenes };
    };
    // A plugin that is still starting would make a directory shorter than it is; two reads in a row must agree.
    const names = ({ hostViews, hostScenes }) => [...hostViews.map((view) => `${view.capability_id}@${view.version} ${view.provider.provider_id}`),
      ...hostScenes.map((scene) => `scene ${scene.definition.scene_id}@${scene.definition.version} ${scene.provider.provider_id}`)].sort().join("\n");
    let seen = await read();
    for (let attempt = 0; attempt < 5; attempt++) {
      const again = await read();
      if (names(again) === names(seen)) {
        if (!again.hostViews.length) throw new Error("the Host listed no action at all");
        return again;
      }
      seen = again;
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

/** Everything the snapshot is built from: `{ manifests, effectOf, hostViews, hostScenes }`. Even the imports happen inside the throwaway Home. */
export const loadProduct = () => withIsolatedHome(async (home) => ({ ...(await loadManifests()), ...(await collectHost(home)) }));
