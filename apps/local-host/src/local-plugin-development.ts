import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createMolisWorkLocalHost, molisWorkHostProjectReference, type MolisWorkLocalHost } from "./project-host.js";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { ActionError, defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import { SqlitePluginRuntimeRepository, SqlitePluginPrivateStorage } from "@molis-ai/molis-work-plugin-runtime";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { writeProjectRoot } from "@molis-ai/molis-work-module-projects";
import { PLUGIN_DEVELOPMENT_ACTOR_ID, refuseUnusableDevelopmentLanguage, runPluginDevelopment } from "./plugin-development.js";
import { refusePayloadIdentity } from "./management-actions.js";
import { bindProjectArtifacts } from "./declared-types.js";
import type { PluginDevelopmentInput, PluginDevelopmentResult } from "@molis-ai/molis-work-contracts/platform/tooling";
import { installHostUiText } from "./ui-text-provider.js";

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

/**
 * Why the development door refused the state directory it was given: an ordinary nonempty directory (it may be a person's own folder,
 * so nothing is written into it), or a development marker this version does not read. Neither is the plugin's Manifest.
 */
const developmentErrors = defineErrorCodes("host", {
  plugin_development_directory_occupied: "invalid",
  plugin_development_directory_unsupported: "invalid",
});

/** Development data is explicitly separate from the user's catalog and existing projects. */
export async function runLocalPluginDevelopment(input: {
  directory: string; state_directory: string; grants: string[]; allow_unsigned_development: true;
  /** The language the run renders in (`--locale`); left out, the plugin's default. */
  locale?: string;
}): Promise<PluginDevelopmentResult> {
  const directory = resolve(input.state_directory);
  const markerName = ".molis-work-plugin-development.json";
  const marker = { kind: "molis-work-plugin-development", schema_version: /* @version format.plugin.development-marker */ 1 };
  // A state directory that is already there is judged before the plugin directory is read: a nonempty ordinary directory or an unsupported
  // marker is refused without opening the plugin's code or manifest. A missing state directory is still created only after the language check,
  // so a wrong `--locale` leaves nothing behind.
  const existingNames = await readdir(directory).catch(error => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  });
  if (existingNames !== null) {
    if (existingNames.includes(markerName)) {
      const existing = JSON.parse(await readFile(join(directory, markerName), "utf8")) as typeof marker;
      if (existing.kind !== marker.kind || existing.schema_version !== marker.schema_version) throw developmentErrors.plugin_development_directory_unsupported("不是受支持的 Plugin 开发状态目录", { state_directory: directory });
    } else if (existingNames.length) throw developmentErrors.plugin_development_directory_occupied("Plugin 开发不能使用非空的普通目录或用户项目目录", { state_directory: directory });
  }
  // An existing state directory is opened before the language check too: a Home that already holds unadopted files is refused
  // (memory.unavailable) before the plugin directory is read. A new or empty directory is still made only after that check, so a wrong
  // --locale leaves no marker behind.
  let host: MolisWorkLocalHost;
  if (existingNames?.includes(markerName)) {
    host = createMolisWorkLocalHost({ homeDirectory: join(directory, "home") });
    developmentHosts.add(host);
    try { await refuseUnusableDevelopmentLanguage(input.directory, input.locale); }
    catch (error) { await host.close(); throw error; }
  } else {
    await refuseUnusableDevelopmentLanguage(input.directory, input.locale);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, markerName), JSON.stringify(marker) + "\n", { flag: "wx" });
    host = createMolisWorkLocalHost({ homeDirectory: join(directory, "home") });
    developmentHosts.add(host);
  }
  const projectId = "plugin-development";
  try {
    const reference = molisWorkHostProjectReference({ databasePath: join(directory, "development.db"), projectId });
    return await developInPrivateHost(host, reference, { directory: input.directory, project_id: projectId,
      grants: input.grants, allow_unsigned_development: input.allow_unsigned_development, ...(input.locale === undefined ? {} : { locale: input.locale }) });
  } finally { await host.close(); }
}


/** Host function for the isolated developer door; it is never a plugin capability. */
export async function developInPrivateHost(host: MolisWorkLocalHost, reference: LocalHostProjectReference, input: PluginDevelopmentInput): Promise<PluginDevelopmentResult> {
  if (!developmentHosts.has(host)) throw new ActionError("actions.forbidden", "Plugin 开发只在为开发建的隔离宿主里运行，不在普通或真实 Home 的宿主里运行");
  // The plugin's `t` reads the process's text context; this door has no web server to have installed it.
  installHostUiText();
  const request = structuredClone(input);
  if (request.project_id !== reference.project_id.trim()) throw new ActionError("actions.scope_mismatch", "Plugin 开发不属于已打开的项目");
  refusePayloadIdentity(request, ["audit_actor_id"]);
  return host.withProject(reference, async runtime => {
    if (request.project_id !== runtime.project_id) throw new ActionError("actions.scope_mismatch", "Plugin 开发不属于已打开的项目");
    // The development project has no catalog to give it a root row, so it is made here; any plugin initializes its own tables when started.
    writeProjectRoot(runtime.store.db, runtime.project_id, new Date().toISOString());
    const privateStorage = new SqlitePluginPrivateStorage(runtime.store.db);
    return runPluginDevelopment(request, { project_id: runtime.project_id, actor_id: PLUGIN_DEVELOPMENT_ACTOR_ID,
      projectLibrary: typeof runtime.store.db.name === "string" ? { db: runtime.store.db, path: runtime.store.db.name } : null,
      actions: { registry: host.actionRegistry(reference), client: { ...host.actionClient(reference), ...host.syncActionClient(reference) }, scenes: host.sceneClient(reference), project_id: runtime.project_id },
      artifacts: runtime.artifacts, processItems: runtime.processItems, ui: new UiHost(),
      repository: new SqlitePluginRuntimeRepository(runtime.store.db), bindInstallation: view => bindProjectArtifacts(runtime.store.db, view),
      privateStorageFor: (context, manifest) => privateStorage.forPlugin(context, manifest),
      deleteInstallationData: id => privateStorage.deleteInstallationData(id) });
  });
}
