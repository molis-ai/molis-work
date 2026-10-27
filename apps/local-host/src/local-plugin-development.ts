import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createMolisWorkLocalHost, molisWorkHostProjectReference, type MolisWorkLocalHost } from "./project-host.js";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { goalEntryActions } from "@molis-ai/molis-work-contracts/modules/goal-actions";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { SqlitePluginRuntimeRepository, SqlitePluginPrivateStorage } from "@molis-ai/molis-work-plugin-runtime";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { writeProjectRoot } from "@molis-ai/molis-work-module-projects";
import { PLUGIN_DEVELOPMENT_ACTOR_ID, runPluginDevelopment } from "./plugin-development.js";
import { bindGoalsManagementActions, refusePayloadIdentity } from "./goal-callers.js";
import { bindProjectArtifacts } from "./declared-types.js";
import type { PluginDevelopmentInput, PluginDevelopmentResult } from "@molis-ai/molis-work-contracts/platform/tooling";
import { withPluginWords } from "@molis-ai/molis-work-app-workbench";

/**
 * The Hosts made for the developer door (BL-588, S-75 ⑥) have no Home, or only the validated development state's own Home; each is closed when its run ends. The door runs
 * the developer's own unsigned code in the Host's process, so it takes only a Host made for that, never an ordinary Host or the Host of a person's Home.
 */
const developmentHosts = new WeakSet<MolisWorkLocalHost>();

/** A Host for `developInPrivateHost` alone: no Home, nothing of the person's, the caller closes it. */
export function createPrivateDevelopmentHost(): MolisWorkLocalHost {
  const host = createMolisWorkLocalHost();
  developmentHosts.add(host);
  return host;
}

/** Development data is explicitly separate from the user's catalog and existing projects. */
export async function runLocalPluginDevelopment(input: {
  directory: string; state_directory: string; grants: string[]; allow_unsigned_development: true;
}): Promise<PluginDevelopmentResult> {
  const directory = resolve(input.state_directory);
  const markerName = ".molis-work-plugin-development.json";
  const marker = { kind: "molis-work-plugin-development", schema_version: 1 };
  await mkdir(directory, { recursive: true });
  const names = await readdir(directory);
  if (names.includes(markerName)) {
    const existing = JSON.parse(await readFile(join(directory, markerName), "utf8")) as typeof marker;
    if (existing.kind !== marker.kind || existing.schema_version !== marker.schema_version) throw new Error("不是受支持的 Plugin 开发状态目录");
  } else {
    if (names.length) throw new Error("Plugin 开发不能使用非空的普通目录或用户项目目录");
    await writeFile(join(directory, markerName), JSON.stringify(marker) + "\n", { flag: "wx" });
  }
  const host = createMolisWorkLocalHost({ homeDirectory: join(directory, "home") });
  developmentHosts.add(host);
  const projectId = "plugin-development";
  try {
    const reference = molisWorkHostProjectReference({ databasePath: join(directory, "development.db"), projectId });
    return await developInPrivateHost(host, reference, { directory: input.directory, project_id: projectId,
      grants: input.grants, allow_unsigned_development: input.allow_unsigned_development });
  } finally { await host.close(); }
}


/** The development project's board through the Goals action, as the management entry; a board Goals already made at its start is left as it is. */
async function ensureBoard(host: MolisWorkLocalHost, reference: LocalHostProjectReference): Promise<void> {
  try {
    await bindGoalsManagementActions(host.actionClient(reference), reference).invoke(goalEntryActions.initialize, { idempotency_key: "plugin-development-board" });
  } catch (error) {
    if (!(error instanceof ActionError && error.code === "goals.board.exists")) throw error;
  }
}

/** Host function for the isolated developer door; it is never a plugin capability. */
export async function developInPrivateHost(host: MolisWorkLocalHost, reference: LocalHostProjectReference, input: PluginDevelopmentInput): Promise<PluginDevelopmentResult> {
  if (!developmentHosts.has(host)) throw new ActionError("actions.forbidden", "Plugin 开发只在为开发建的隔离宿主里运行，不在普通或真实 Home 的宿主里运行");
  const request = structuredClone(input);
  if (request.project_id !== reference.project_id.trim()) throw new ActionError("actions.scope_mismatch", "Plugin 开发不属于已打开的项目");
  refusePayloadIdentity(request, ["audit_actor_id"]);
  return host.withProject(reference, async runtime => {
    if (request.project_id !== runtime.project_id) throw new ActionError("actions.scope_mismatch", "Plugin 开发不属于已打开的项目");
    // The development project has no catalog to give it a root row, so it is made here; the board is Goals' to make (its start does, or this call).
    writeProjectRoot(runtime.store.db, runtime.project_id, new Date().toISOString());
    await ensureBoard(host, reference);
    const privateStorage = new SqlitePluginPrivateStorage(runtime.store.db);
    return runPluginDevelopment(request, { project_id: runtime.project_id, actor_id: PLUGIN_DEVELOPMENT_ACTOR_ID,
      actions: { registry: host.actionRegistry(reference), client: { ...host.actionClient(reference), ...host.syncActionClient(reference) }, scenes: host.sceneClient(reference), project_id: runtime.project_id },
      artifacts: runtime.artifacts, processItems: runtime.processItems, ui: new UiHost({ drawingAs: withPluginWords }),
      repository: new SqlitePluginRuntimeRepository(runtime.store.db), bindInstallation: view => bindProjectArtifacts(runtime.store.db, view),
      privateStorageFor: (context, manifest) => privateStorage.forPlugin(context, manifest),
      deleteInstallationData: id => privateStorage.deleteInstallationData(id) });
  });
}
