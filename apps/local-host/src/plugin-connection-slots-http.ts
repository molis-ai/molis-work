import type { IncomingMessage, ServerResponse } from "node:http";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { PluginInstanceRecord, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { MolisWorkSettingsView } from "@molis-ai/molis-work-app-workbench";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import { SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { connectorPluginSlotActions } from "./connector-plugin-slot-actions.js";
import { bindLocalWebActions } from "./local-web-actions.js";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import { installedPluginManifest } from "./plugin-installation-directory.js";
import type { MolisWorkLocalHost } from "./project-host.js";
import { readLocalWebBody, sendLocalWebJson as sendJson } from "./web-http.js";

// 服务连接 › 插件用的账号 (BL-350, S0b-2b): the installation slots that the Home's plugins and the chosen project's declare, each with
// the account the person bound to it. Choosing goes through `connectors.plugin_slot.bind@1` as the person, which checks the
// installation and its Manifest again; a `per_record` slot is chosen where its plugin shows the record, not here.

type PluginSlotRow = NonNullable<MolisWorkSettingsView["plugin_slots"]>[number];
const SLOTS_PATH = "/api/settings/connectors/plugin-slots";

/** The installations the person sees here: the Home's, then the project's; one install id once (a plugin with two instances). */
async function installationsHere(host: MolisWorkLocalHost, reference: LocalHostProjectReference | undefined) {
  const home = (host.homePlugins?.installations() ?? []).filter(record => record.state !== "uninstalled")
    .flatMap(record => { const manifest = host.homePlugins?.manifest(record.plugin_id); return manifest ? [{ record, manifest }] : []; });
  const project = reference ? await host.withProject(reference, runtime => new SqlitePluginRuntimeRepository(runtime.store.db).list()
    .filter(record => record.state !== "uninstalled").flatMap(record => installedPluginManifest(runtime.store.db, record.install_id) ?? [])) : [];
  const seen = new Set<string>();
  return [...home, ...project].filter(({ record }) => !seen.has(record.install_id) && Boolean(seen.add(record.install_id))) as Array<{ record: PluginInstanceRecord; manifest: PluginManifest }>;
}

export async function pluginSlotRows(host: MolisWorkLocalHost, reference: LocalHostProjectReference | undefined): Promise<PluginSlotRow[]> {
  const actions = bindLocalWebActions(host, reference, LOCAL_OWNER_PERMISSIONS), rows: PluginSlotRow[] = [];
  for (const { record, manifest } of await installationsHere(host, reference)) {
    for (const slot of manifest.connections?.slots ?? []) {
      if ((slot.binding ?? "installation") !== "installation") continue;
      const { connection } = await actions.invoke(connectorPluginSlotActions.read, { install_id: record.install_id, plugin_id: record.plugin_id, slot_id: slot.slot_id });
      rows.push({ install_id: record.install_id, plugin_id: record.plugin_id, plugin_name: manifest.name, slot_id: slot.slot_id, service_id: slot.service_id,
        reason: slot.reason, connection_id: connection?.connection_id ?? null });
    }
  }
  return rows;
}

/**
 * Binds or unbinds one installation slot as the person. `?project=` names the project whose installations the page listed, as every
 * settings page names its context; the Host resolves it to the project's reference, and the action checks that installation there.
 */
export async function handlePluginSlotsHttp(request: IncomingMessage, response: ServerResponse, url: URL, host: MolisWorkLocalHost,
  projectReference: (projectId: string) => Promise<LocalHostProjectReference | null>): Promise<boolean> {
  if (url.pathname !== SLOTS_PATH) return false;
  if (request.method !== "POST") { sendJson(response, 405, { error: "不支持的操作" }); return true; }
  try {
    const projectId = url.searchParams.get("project");
    const reference = projectId ? await projectReference(projectId) : undefined;
    if (reference === null) { sendJson(response, 404, { error: "找不到所选项目" }); return true; }
    // The action's schema checks every field; the page names nothing else.
    const body = await readLocalWebBody(request) as { install_id: string; plugin_id: string; slot_id: string; service_id: string; connection_id?: string | null };
    sendJson(response, 200, await bindLocalWebActions(host, reference, LOCAL_OWNER_PERMISSIONS).invoke(connectorPluginSlotActions.bind, {
      install_id: body.install_id, plugin_id: body.plugin_id, slot_id: body.slot_id, service_id: body.service_id, connection_id: body.connection_id ?? null }));
  } catch (error) { const failure = actionErrorResponse(error); sendJson(response, failure.status, failure.body); }
  return true;
}
