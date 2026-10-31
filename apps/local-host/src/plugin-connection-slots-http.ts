import type { IncomingMessage, ServerResponse } from "node:http";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { PluginInstanceRecord, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { CONNECTOR_REQUEST_SERVICES } from "@molis-ai/molis-work-contracts/services/connector-host";
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
const RECORD_PATH = `${SLOTS_PATH}/record`;
// The record path takes exactly these: a name more (an `install_id` the page made up, say) is refused, not ignored.
const RECORD_QUERY = ["project", "plugin_id", "slot_id", "record_key"], RECORD_BODY = ["plugin_id", "slot_id", "service_id", "record_key", "connection_id"];

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
        reason: slot.reason, connection_id: connection?.connection_id ?? null, tenant: Boolean(CONNECTOR_REQUEST_SERVICES[slot.service_id]?.tenant) });
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
  if (url.pathname === RECORD_PATH) return await handleRecordSlotHttp(request, response, url, host, projectReference);
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

const exactly = (names: readonly string[], allowed: readonly string[]) => names.length === allowed.length && allowed.every(name => names.includes(name));
type Refusal = { status: number; error: string };

/**
 * The installation of a plugin in the project the page names: the project's own record, else the Home's. Two live installations of the
 * same plugin there are refused rather than one picked, since the page cannot say which record it showed.
 */
async function recordSlotInstallation(host: MolisWorkLocalHost, reference: LocalHostProjectReference, plugin_id: string): Promise<string | Refusal> {
  const live = (record: PluginInstanceRecord) => record.plugin_id === plugin_id && record.state !== "uninstalled";
  const project = await host.withProject(reference, runtime => new SqlitePluginRuntimeRepository(runtime.store.db).list().filter(live));
  const found = project.length ? project : (host.homePlugins?.installations() ?? []).filter(live);
  if (found.length > 1) return { status: 409, error: "这个项目里同一个插件有多个安装，无法确定是哪一个" };
  return found[0]?.install_id ?? { status: 404, error: "这个项目没有安装这个插件" };
}

/**
 * 插件按记录用的账号 (T-121, FI-7b): where a plugin shows one of its records, the person reads (`GET`) or chooses (`POST`) the account bound
 * to that record's `per_record` slot, through `connectors.plugin_slot.read@2` / `bind@2` as the person. `?project=` names the project the
 * page is in; the installation is the Host's to find there, never the page's to say. The actions check the slot's declaration again.
 */
async function handleRecordSlotHttp(request: IncomingMessage, response: ServerResponse, url: URL, host: MolisWorkLocalHost,
  projectReference: (projectId: string) => Promise<LocalHostProjectReference | null>): Promise<true> {
  const refuse = (refusal: Refusal): true => { sendJson(response, refusal.status, { error: refusal.error }); return true; };
  if (request.method !== "GET" && request.method !== "POST") return refuse({ status: 405, error: "不支持的操作" });
  const names = [...url.searchParams.keys()];
  if (new Set(names).size !== names.length || !exactly(names, request.method === "GET" ? RECORD_QUERY : ["project"])) return refuse({ status: 400, error: "请求参数无效" });
  try {
    const reference = await projectReference(url.searchParams.get("project") ?? "");
    if (!reference) return refuse({ status: 404, error: "找不到所选项目" });
    const actions = bindLocalWebActions(host, reference, LOCAL_OWNER_PERMISSIONS);
    if (request.method === "GET") {
      const plugin_id = url.searchParams.get("plugin_id") ?? "", install_id = await recordSlotInstallation(host, reference, plugin_id);
      if (typeof install_id !== "string") return refuse(install_id);
      sendJson(response, 200, await actions.invoke(connectorPluginSlotActions.readRecord, { install_id, plugin_id,
        slot_id: url.searchParams.get("slot_id") ?? "", record_key: url.searchParams.get("record_key") ?? "" }));
      return true;
    }
    // The action's schema checks each value; the names are checked here, since a name the action does not take would otherwise be dropped.
    const body = await readLocalWebBody(request, 4_096);
    if (!exactly(Object.keys(body), RECORD_BODY)) return refuse({ status: 400, error: "请求内容无效" });
    const input = body as { plugin_id: string; slot_id: string; service_id: string; record_key: string; connection_id: string | null };
    const install_id = await recordSlotInstallation(host, reference, String(input.plugin_id));
    if (typeof install_id !== "string") return refuse(install_id);
    sendJson(response, 200, await actions.invoke(connectorPluginSlotActions.bindRecord, { install_id,
      plugin_id: input.plugin_id, slot_id: input.slot_id, service_id: input.service_id, record_key: input.record_key, connection_id: input.connection_id }));
  } catch (error) { const failure = actionErrorResponse(error); sendJson(response, failure.status, failure.body); }
  return true;
}
