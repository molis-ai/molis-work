import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createMolisWorkLocalHost, molisWorkHostProjectReference, type MolisWorkLocalHost } from "./project-host.js";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { SqlitePluginRuntimeRepository, SqlitePluginPrivateStorage } from "@molis-ai/molis-work-plugin-runtime";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { PLUGIN_DEVELOPMENT_ACTOR_ID, runPluginDevelopment } from "./plugin-development.js";
import { refusePayloadIdentity } from "./goals-actions.js";
import type { PluginDevelopmentInput, PluginDevelopmentResult } from "@molis-ai/molis-work-contracts/platform/tooling";

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
  const host = createMolisWorkLocalHost();
  const projectId = "plugin-development";
  try {
    const reference = molisWorkHostProjectReference({ databasePath: join(directory, "development.db"), projectId });
    return await developInPrivateHost(host, reference, { directory: input.directory, project_id: projectId,
      grants: input.grants, allow_unsigned_development: input.allow_unsigned_development });
  } finally { await host.close(); }
}


/** Host function for the isolated developer door; it is never a plugin capability. */
export async function developInPrivateHost(host: MolisWorkLocalHost, reference: LocalHostProjectReference, input: PluginDevelopmentInput): Promise<PluginDevelopmentResult> {
  const request = structuredClone(input);
  if (request.project_id !== reference.project_id.trim()) throw new ActionError("actions.scope_mismatch", "Plugin 开发不属于已打开的项目");
  refusePayloadIdentity(request, ["audit_actor_id"]);
  return host.withProject(reference, runtime => {
    if (request.project_id !== runtime.project_id) throw new ActionError("actions.scope_mismatch", "Plugin 开发不属于已打开的项目");
    runtime.coordinator.initializeBoard({ project_id: runtime.project_id,
      actor_id: PLUGIN_DEVELOPMENT_ACTOR_ID, idempotency_key: "plugin-development-board" });
    const privateStorage = new SqlitePluginPrivateStorage(runtime.store.db);
    return runPluginDevelopment(request, { project_id: runtime.project_id, actor_id: PLUGIN_DEVELOPMENT_ACTOR_ID,
      actions: { registry: host.actionRegistry(reference), client: { ...host.actionClient(reference), ...host.syncActionClient(reference) }, project_id: runtime.project_id },
      artifacts: runtime.artifacts, processItems: runtime.processItems, ui: new UiHost(),
      repository: new SqlitePluginRuntimeRepository(runtime.store.db),
      privateStorageFor: (context, manifest) => privateStorage.forPlugin(context, manifest),
      deleteInstallationData: id => privateStorage.deleteInstallationData(id) });
  });
}
