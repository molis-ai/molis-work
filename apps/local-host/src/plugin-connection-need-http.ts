import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { ActionError, defineErrorCodes, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginImageTarget } from "@molis-ai/molis-work-contracts/platform/plugin";
import { isPluginConnectionRecordKey, PLUGIN_CONNECTIONS_PERMISSION, type PluginConnectionSlotDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin-connections";
import { UI_CONNECTION_NEED_REASON_MAX, type UiConnectionNeedTarget } from "@molis-ai/molis-work-contracts/platform/ui";
import type { ConnectorConnectionView } from "@molis-ai/molis-work-contracts/services/connector-host";
import { activateConnectorConnection } from "./connector-activation.js";
import { lastConnectorCheck, withConnectorConnections } from "./connector-connection-store.js";
import { listConnectorSettingsCards } from "./connector-directory.js";
import { connectorManagementActions } from "./connector-management-actions.js";
import { connectorPluginSlotActions, connectorPluginSlotSwitch } from "./connector-plugin-slot-actions.js";
import { pinnedToAnother } from "./connector-plugin-requests.js";
import { shownState } from "./connector-refresh-refusals.js";
import { connectorSetupAction } from "./connector-setup.js";
import { checkCandidateKey, rememberCandidateCheck } from "./connector-candidate-check.js";
import { connectionChoice, pageOwnerClient, trustedPluginPage } from "./plugin-connection-slots-http.js";
import { imageBaseUrl, imageConnectionSnapshot, imageConnectionViews } from "./plugin-image-connections.js";
import { createPluginImageGenerationPort } from "./plugin-image-generation-service.js";
import type { WebRequestContext } from "./web-route-table.js";

// 原处的连接卡的宿主路由（specs/assistant-service-connections/spec.md §13.5 C2）. Only the trusted shell calls it, with the outer document's
// `x-molis-context-page` (the transport guard refuses the child's `x-molis-plugin-page`). The body names one target of this page's
// installation and, for some operations, the account the person chose or the key the person typed; the installation, the plugin, the
// project, the person and the service come from the page's authority and the Manifest. Each write asks the page again (`beforeEffect`),
// and a target the installation has not been granted is refused before anything is read.

export const connectionNeedErrors = defineErrorCodes("host.connection_need", {
  target_undeclared: "forbidden", not_granted: "forbidden", account_bound: "conflict", account_unusable: "conflict",
  nothing_bound: "conflict", switch_refused: "conflict", operation_unsupported: "invalid",
});

/** Each operation and the fields it takes besides `operation` and `target`; a name more is refused, never dropped. */
const OPERATIONS: Record<string, { required: readonly string[]; optional: readonly string[] }> = {
  read: { required: [], optional: [] }, prepare: { required: [], optional: ["connection_id"] }, bind: { required: ["connection_id"], optional: [] },
  switch: { required: ["connection_id"], optional: [] }, enable: { required: [], optional: [] }, save_key: { required: ["api_key"], optional: [] },
};
const CONNECTION_ID = /^[a-z0-9-]{1,100}$/u, SLOT_ID = /^[a-z][a-z0-9-]{0,63}$/u;
const invalid = (message: string) => new ActionError("actions.input_invalid", message);

type NeedRequest = { operation: string; target: UiConnectionNeedTarget; connection_id?: string; api_key?: string };
type Resolved = { install_id: string; plugin_id: string } & (
  | { kind: "slot"; slot: PluginConnectionSlotDeclaration; record_key?: string }
  | { kind: "image"; namespace: string; image: PluginImageTarget; origin: string });

function needTarget(value: unknown): UiConnectionNeedTarget {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid("连接目标无效");
  const target = value as Record<string, unknown>, keys = Object.keys(target);
  if (target.kind === "slot" && keys.every(key => ["kind", "slot_id", "record_key"].includes(key)) && typeof target.slot_id === "string" && SLOT_ID.test(target.slot_id)
    && (target.record_key === undefined || isPluginConnectionRecordKey(target.record_key)))
    return { kind: "slot", slot_id: target.slot_id, ...(target.record_key === undefined ? {} : { record_key: target.record_key as string }) };
  if (target.kind === "image" && keys.length === 3 && keys.every(key => ["kind", "slot_id", "base_url"].includes(key))
    && typeof target.slot_id === "string" && target.slot_id.trim() && target.slot_id.length <= 128 && typeof target.base_url === "string" && target.base_url.length <= 2048)
    return { kind: "image", slot_id: target.slot_id.trim(), base_url: target.base_url };
  throw invalid("连接目标无效");
}

function needRequest(body: unknown): NeedRequest {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw invalid("连接卡请求无效");
  const value = body as Record<string, unknown>, shape = typeof value.operation === "string" ? OPERATIONS[value.operation] : undefined;
  if (!shape || Object.keys(value).some(key => !["operation", "target", ...shape.required, ...shape.optional].includes(key))
    || shape.required.some(key => value[key] === undefined)) throw invalid("连接卡请求无效");
  if (value.connection_id !== undefined && (typeof value.connection_id !== "string" || !CONNECTION_ID.test(value.connection_id))) throw invalid("账号无效");
  if (value.api_key !== undefined && (typeof value.api_key !== "string" || !value.api_key.trim() || value.api_key.length > 4096)) throw invalid("密钥无效");
  return { operation: value.operation as string, target: needTarget(value.target),
    ...(value.connection_id === undefined ? {} : { connection_id: value.connection_id as string }), ...(value.api_key === undefined ? {} : { api_key: value.api_key as string }) };
}

/** The target as this installation declares it and holds the grant for (S-57; the image write permission); anything else is no card. */
function resolveTarget(page: ReturnType<typeof trustedPluginPage>["page"], target: UiConnectionNeedTarget): Resolved {
  const installation = page.connectionInstallation(), own = { install_id: installation.install_id, plugin_id: installation.plugin_id };
  if (target.kind === "slot") {
    const slot = installation.manifest.connections?.slots?.find(item => item.slot_id === target.slot_id);
    // A `per_record` slot names its record, an installation slot none (S-71).
    if (!slot || ((slot.binding ?? "installation") === "per_record") !== (target.record_key !== undefined)) throw connectionNeedErrors.target_undeclared("这个插件没有声明这个连接用途");
    if (!installation.granted(PLUGIN_CONNECTIONS_PERMISSION)) throw connectionNeedErrors.not_granted("这个插件还没有获准使用服务连接");
    return { ...own, kind: "slot", slot, ...(target.record_key === undefined ? {} : { record_key: target.record_key }) };
  }
  const declaration = installation.image_generation;
  if (!declaration) throw connectionNeedErrors.target_undeclared("这个插件没有图片生成服务");
  if (!installation.granted(declaration.write_permission)) throw connectionNeedErrors.not_granted("这个插件还没有获准设置图片连接");
  const base_url = imageBaseUrl(target.base_url);
  return { ...own, kind: "image", namespace: declaration.store_name, image: { slot_id: target.slot_id, base_url }, origin: new URL(base_url).origin };
}

/** The connection the target uses now, as the person's own reads see it; an image target's is usable only when its key may go to this origin. */
async function bound(home: string, client: BoundActionClient, target: Resolved): Promise<ConnectorConnectionView | null> {
  if (target.kind === "image") {
    const snapshot = imageConnectionSnapshot(home, target.namespace, target.image);
    const view = snapshot.connection_id ? imageConnectionViews(home).find(row => row.connection_id === snapshot.connection_id) : undefined;
    return view ? { ...view, state: snapshot.available ? "connected" : view.state === "connected" ? "disconnected" : view.state } : null;
  }
  const slot = { install_id: target.install_id, plugin_id: target.plugin_id, slot_id: target.slot.slot_id };
  return (target.record_key === undefined ? await client.invoke(connectorPluginSlotActions.read, slot)
    : await client.invoke(connectorPluginSlotActions.readRecord, { ...slot, record_key: target.record_key })).connection;
}

/** An account the person may put on a slot here: this service's, connected now, and not made for another installation's package (T-134). */
function assertUsable(home: string, target: Resolved & { kind: "slot" }, connectionId: string): void {
  withConnectorConnections(home, store => {
    const connection = store.get(connectionId);
    if (!connection || connection.service_id !== target.slot.service_id || pinnedToAnother(store, connectionId, target.install_id)
      || shownState(home, connection, store.state(connection), lastConnectorCheck(store, connectionId)) !== "connected")
      throw connectionNeedErrors.account_unusable("这个账号现在不能用在这里");
  });
}

async function slotBind(client: BoundActionClient, target: Resolved & { kind: "slot" }, connection_id: string) {
  const slot = { install_id: target.install_id, plugin_id: target.plugin_id, slot_id: target.slot.slot_id, service_id: target.slot.service_id, connection_id };
  if (target.record_key === undefined) await client.invoke(connectorPluginSlotActions.bind, slot);
  else await client.invoke(connectorPluginSlotActions.bindRecord, { ...slot, record_key: target.record_key });
}

/**
 * The person moves this one place to another account (S-108). An installation slot is one use, so `connectors.plugin_slot.switch@1` with
 * the `usage_id` the Host derives from (installation, plugin, slot). A record's use covers every record of the slot in the project, so one
 * record is moved by binding it alone (`connectors.plugin_slot.record.bind@1`, S-71); the other records keep their account.
 */
async function slotSwitch(client: BoundActionClient, target: Resolved & { kind: "slot" }, from: string, to: string) {
  if (target.record_key !== undefined) { await slotBind(client, target, to); return; }
  const usage_id = JSON.stringify([target.install_id, target.plugin_id, target.slot.slot_id, null]);
  const result = await client.invoke(connectorPluginSlotSwitch, { from_connection_id: from, to_connection_id: to, usage_ids: [usage_id] });
  if (!result.switched.includes(usage_id)) throw connectionNeedErrors.switch_refused(`没有换过去（${result.refused[0]?.code ?? "unknown"}）`);
}

async function prepare(home: string, client: BoundActionClient, target: Resolved & { kind: "slot" }, current: ConnectorConnectionView | null, connectionId: string | undefined) {
  // Logging in again is for the account this place already uses, never one the page names (§13.5 三第 3 条).
  if (connectionId !== undefined && current?.connection_id !== connectionId) throw connectionNeedErrors.account_bound("只能重新登录这里正在用的账号");
  const service_id = target.slot.service_id;
  const input = connectionId !== undefined
    ? withConnectorConnections(home, store => { const previous = store.require(connectionId, service_id);
      return { service_id, method: previous.auth_method, display_name: previous.display_name, connection_id: connectionId, expected_revision: previous.updated_at }; })
    : await (async () => {
      const entry = (await listConnectorSettingsCards(home)).find(row => row.connector_id === service_id);
      const options = entry?.method_options ?? [], method = options.find(row => row.kind === "oauth" && row.support === "in_app") ?? options.find(row => ["in_app", "paste"].includes(row.support));
      return { service_id, method: method?.kind ?? "oauth", display_name: entry?.title ?? service_id, expected_revision: null };
    })();
  const output = await client.invoke(connectorSetupAction, input) as { authorization_id: string; status: string; url: string };
  return { authorization_id: output.authorization_id, status: output.status, url: output.url, method: input.method };
}

/**
 * A key the person typed on the card: checked before it is saved, as the connections page saves one (④d, `checkCandidateKey`, BL-1058),
 * then saved, pinned to this origin and put on this target in one pass. A key the check refuses, a request the page leaves while the
 * check runs, or a page that is no longer current after it, writes nothing: no connection, no pin, no binding, no check record; the key
 * the target had stays as it was. (An image key is one the check cannot ask a service about today; it is then checked where it is used,
 * by the first generation, as on the connections page.)
 */
async function saveImageKey(home: string, target: Resolved & { kind: "image" }, key: string, assertCurrent: () => void, signal: AbortSignal): Promise<void> {
  const token = key.trim(), checked = await checkCandidateKey(home, { serviceId: "image-api", token }, { signal });
  signal.throwIfAborted(); assertCurrent();
  const saved = activateConnectorConnection(home, { kind: "token", input: { serviceId: "image-api", displayName: `图像模型 API · ${new URL(target.origin).host}`, token, accountLabel: null } });
  createPluginImageGenerationPort(home, target.namespace).bind(target.image, saved.connection_id);
  if (checked) rememberCandidateCheck(home, saved.connection_id, checked);
}

/**
 * What only the trusted shell reads (never the frame): the service and its name, the slot's Manifest reason the card quotes as the plugin's
 * words, an image target's origin, and the account here with whether the person disabled it.
 */
async function respond(home: string, client: BoundActionClient, target: Resolved, extra: Record<string, unknown> = {}) {
  const connection = await bound(home, client, target), service_id = target.kind === "slot" ? target.slot.service_id : "image-api";
  const title = target.kind === "slot" ? (await listConnectorSettingsCards(home)).find(row => row.connector_id === service_id)?.title ?? service_id : "图像模型";
  const disabled = connection && withConnectorConnections(home, store => store.get(connection.connection_id)?.enabled === false);
  return { service_id, service_title: title, ...(target.kind === "slot" && target.slot.reason ? { reason: [...target.slot.reason].slice(0, UI_CONNECTION_NEED_REASON_MAX).join("") } : {}),
    ...(target.kind === "image" ? { origin: target.origin } : {}), connection: connectionChoice(connection), ...(disabled ? { disabled: true } : {}), ...extra };
}

/** A request the page leaves (its connection closes before the answer) is a cancelled call: a check under way stops, nothing is written after it. */
function requestSignal(context: WebRequestContext): AbortSignal {
  const controller = new AbortController(), { request, response } = context;
  const cancel = () => controller.abort(new ActionError("actions.cancelled", "这次设置操作已经结束"));
  request.once("aborted", cancel); response.once("close", () => { if (!response.writableEnded) cancel(); });
  return controller.signal;
}

/** `POST /api/host/plugin-page-connection`: read, connect, choose, switch, enable or key one connection card's target (§13.5 三第 4 条). */
export async function pageConnectionNeed(context: WebRequestContext, reference: LocalHostProjectReference | undefined, body: Record<string, unknown>) {
  const { page, project } = trustedPluginPage(context, reference);
  const home = context.serverOptions.homeDirectory;
  if (!home) throw new ActionError("actions.unavailable", "连接卡需要 Home");
  const request = needRequest(body), target = resolveTarget(page, request.target);
  await page.beforeEffect();
  const client = await pageOwnerClient(context, project, page), current = await bound(home, client, target);
  const chosen = request.connection_id;
  switch (request.operation) {
    case "read": return respond(home, client, target);
    case "prepare": {
      if (target.kind !== "slot") throw connectionNeedErrors.operation_unsupported("图片目标只填一把密钥");
      await page.beforeEffect();
      return respond(home, client, target, { authorization: await prepare(home, client, target, current, chosen) });
    }
    case "bind": {
      if (current && current.connection_id === chosen && current.state === "connected") return respond(home, client, target);
      // A working account is changed with `switch`; an image target whose key no longer works may take another.
      if (current && (target.kind === "slot" || current.state === "connected")) throw connectionNeedErrors.account_bound("这里已经接着一个账号；要换，用「换一个」");
      if (target.kind === "slot") assertUsable(home, target, chosen!);
      await page.beforeEffect();
      if (target.kind === "slot") await slotBind(client, target, chosen!);
      else { page.assertCurrent(); createPluginImageGenerationPort(home, target.namespace).bind(target.image, chosen!); }
      return respond(home, client, target);
    }
    case "switch": {
      if (target.kind !== "slot") throw connectionNeedErrors.operation_unsupported("图片目标换密钥用「填一把新的」");
      if (!current) throw connectionNeedErrors.nothing_bound("这里还没有接着账号");
      if (current.connection_id === chosen) return respond(home, client, target);
      assertUsable(home, target, chosen!);
      await page.beforeEffect();
      await slotSwitch(client, target, current.connection_id, chosen!);
      return respond(home, client, target);
    }
    case "enable": {
      if (!current) throw connectionNeedErrors.nothing_bound("这里还没有接着账号");
      const { connection_id } = current, record = withConnectorConnections(home, store => store.require(connection_id));
      if (record.enabled) return respond(home, client, target);
      await page.beforeEffect();
      await client.invoke(connectorManagementActions.control, { connection_id: record.connection_id, expected_revision: record.updated_at, action: "enable" });
      return respond(home, client, target);
    }
    case "save_key": {
      if (target.kind !== "image") throw connectionNeedErrors.operation_unsupported("这个服务不在卡里填密钥");
      if (current?.state === "connected") throw connectionNeedErrors.account_bound("这里的密钥还能用");
      await page.beforeEffect();
      await saveImageKey(home, target, request.api_key!, page.assertCurrent, requestSignal(context));
      return respond(home, client, target);
    }
  }
  throw invalid("连接卡请求无效");
}
