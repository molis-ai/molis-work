import { randomUUID } from "node:crypto";
import { ActionError, bindActionClient, requireSynchronous, type ActionCallContext, type ActionClient, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { UiViewSelection } from "@molis-ai/molis-work-contracts/platform/ui";
import { surfaceCompositionActions, SURFACE_HOME_ORDER_LIMIT, SURFACES_PROVIDER_ID, type SurfaceHomeEnable, type SurfacePluginCard } from "@molis-ai/molis-work-contracts/services/surface-composition";
import { actionErrorResponse, canonicalJsonText, isRecord } from "@molis-ai/molis-work-plugin-sdk";
import { assertStageInstallation, installedStagePath, sameInstalledRelease } from "./installed-stage-identity.js";
import type { LocalHost } from "./local-host.js";
import { openProjectPersonContext } from "./local-web-actions.js";
import { pluginControlActions } from "./plugin-install-actions.js";
import { pluginInstallRecords } from "./plugin-install-records.js";
import { pluginPageRequest } from "./plugin-page-authority.js";
import { pluginRouteControl } from "./plugin-route-control.js";
import type { MolisWorkLocalHost, MolisWorkProjectRuntime } from "./project-host.js";
import type { HomeDirectoryEntry } from "./surface-home-directory.js";
import { withHomeSample } from "./surface-home-sample.js";
import { readLocalWebBody, sendLocalWebJson } from "./web-http.js";
import { projectRoutePrefix, type ProjectRequestContext } from "./web-project-context.js";

type Target = NonNullable<SurfacePluginCard["open" | "enable"]> | NonNullable<SurfacePluginCard["start"]>[number];
type Intent = { kind: "read"; home_order?: string[] } | { kind: "click"; owner: string; target: Record<string, unknown> };

const invalid = () => new ActionError("actions.input_invalid", "首页请求无效");
const changed = () => new ActionError("actions.provider_changed", "原首页卡片已变化，请重新读取");
const reference = (view: ActionView) => ({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id });

function homeIntent(body: Record<string, unknown>, click: boolean): Intent {
  if (!isRecord(body)) throw invalid();
  if (click) {
    if (Object.keys(body).length !== 2 || typeof body.owner_plugin_id !== "string" || !body.owner_plugin_id.length || body.owner_plugin_id.length > 200 || !isRecord(body.target)) throw invalid();
    return { kind: "click", owner: body.owner_plugin_id, target: body.target };
  }
  if (Object.keys(body).some(key => key !== "home_order")) throw invalid();
  const order = body.home_order;
  if (order === undefined) return { kind: "read" };
  if (!Array.isArray(order) || order.length > SURFACE_HOME_ORDER_LIMIT || new Set(order).size !== order.length
    || !order.every((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 200)) throw invalid();
  return { kind: "read", home_order: order };
}

function originalTarget(card: SurfacePluginCard | undefined, target: Record<string, unknown>): Target {
  const key = canonicalJsonText(target, "null");
  const accepted = [card?.open, ...card?.start ?? [], card?.enable].find(candidate => candidate && canonicalJsonText(candidate, "null") === key);
  if (!accepted) throw changed();
  return accepted;
}

function navigate(entry: HomeDirectoryEntry, target: Extract<Target, { kind: "stage" | "form" }>, prefix: string) {
  const route = entry.route;
  if (!route || route.view_id !== target.view_id) throw changed();
  const selection: UiViewSelection = { surface: route.surface, id: route.view_id, intent: "open", ...(target.kind === "form" ? { panel: target.panel } : {}) };
  return { kind: "stage", shell_key: route.shell, installation: entry.installation, selection,
    ...(route.kind === "native" ? { producer: route.owner.producer } : { frame_path: installedStagePath(prefix, entry.plugin.plugin_id, entry.installation) }) };
}

function exactClickClient(client: ActionClient, caller: ActionCallContext, view: ActionView) {
  const target = reference(view);
  return bindActionClient(client, () => ({ ...caller, permissions: view.action.permissions, allowed_actions: [target],
    user_action: { source: "web", conversation_ref: `web:${caller.project_id}`, message_ref: `web:request:${randomUUID()}` } }));
}

async function enablePackage(client: ActionClient, caller: ActionCallContext, runtime: MolisWorkProjectRuntime, entry: HomeDirectoryEntry,
  target: Extract<SurfaceHomeEnable, { kind: "project_installation" }>, view: ActionView, transport: ReturnType<typeof pluginRouteControl>,
  assertOfferCurrent: () => void, deliver: (value: unknown) => void) {
  const records = pluginInstallRecords(runtime.store.db);
  const assertCurrent = () => {
    requireSynchronous(transport.assert_authority_current?.());
    assertOfferCurrent();
    const now = records.get(target.installation.install_id);
    if (!now || now.publisher_trust !== "pinned" || now.publisher_signature !== entry.record.publisher_signature || now.plugin_id !== entry.plugin.plugin_id
      || !sameInstalledRelease(target.installation, now)) throw changed();
  };
  // The lifecycle checks disabled before its first write. After the legitimate enable it still checks this edition, which is now running.
  const result = await exactClickClient(client, caller, view).invoke({ ...pluginControlActions.enable, ...reference(view) },
    { plugin_id: entry.plugin.plugin_id, expected_installation: target.installation }, {
      ...transport, assert_authority_current: assertCurrent, async beforeEffect() { await transport.beforeEffect(); assertCurrent(); },
    });
  assertCurrent();
  if (result.state !== "running") throw new ActionError("actions.plugin_unavailable", "插件未能启动");
  deliver({ kind: "enabled" });
}

async function clickHomeCard(intent: Extract<Intent, { kind: "click" }>, sample: Awaited<ReturnType<typeof composeHome>>,
  runtime: MolisWorkProjectRuntime, caller: ActionCallContext, client: ActionClient, prefix: string, transport: ReturnType<typeof pluginRouteControl>,
  deliver: (value: unknown) => void) {
  const group = sample.description.groups.find(item => item.kind === "plugin" && item.owner_plugin_id === intent.owner);
  const target = originalTarget(group?.plugin_card, intent.target);
  const entry = sample.catalog.entries.find(item => item.plugin.plugin_id === intent.owner && target.installation.scope === item.installation.scope
    && sameInstalledRelease(target.installation, item.installation));
  if (!entry) throw changed();
  const assertCurrent = () => { requireSynchronous(transport.assert_authority_current?.()); sample.assertCurrent(); };
  assertCurrent();
  if (target.kind === "home_plugin_settings") return deliver({ kind: "settings", section: "plugins" });
  if (target.kind === "stage") return deliver(navigate(entry, target, prefix));
  const action = target.action;
  const view = [...sample.views].find(item => item.capability_id + "@" + item.version === action.ref && item.provider.provider_id === action.provider_id);
  if (!view) throw changed();
  if (target.kind === "project_installation") return enablePackage(client, caller, runtime, entry, target, view, transport, () => {
    sample.actionsCurrent?.(); sample.catalog.assertVisiblePackage(intent.owner);
  }, deliver);
  // Only the real Projects member revision/setter may expose this branch after the batch 20 join.
  if (target.kind === "project_membership") throw changed();
  assertStageInstallation(entry.installation.scope, entry.record, target.installation);
  if (view.provider.plugin_id !== intent.owner || view.provider.plugin_install_id !== entry.installation.install_id || view.action.scope !== entry.installation.scope) throw changed();
  if (target.kind === "form") return deliver(navigate(entry, target, prefix));
  const result = await exactClickClient(client, caller, view).invoke({ ...view, ...reference(view) }, {}, {
    ...transport, assert_authority_current: assertCurrent, async beforeEffect() { await transport.beforeEffect(); assertCurrent(); },
  });
  try { assertCurrent(); }
  catch (error) {
    if (view.operation !== "command") throw error;
    throw new ActionError("actions.outcome_unknown", "操作已执行，但原首页或授权已变化，请检查结果", { cause: error });
  }
  deliver({ kind: "invoked", result });
}

function composeHome(runtime: MolisWorkProjectRuntime, client: ActionClient, caller: ActionCallContext, transport: ReturnType<typeof pluginRouteControl>, intent: Intent) {
  const home_order = intent.kind === "read" ? intent.home_order : undefined;
  return withHomeSample(runtime.store, () => bindActionClient(client, () => caller).invoke({ ...surfaceCompositionActions.compose, provider_id: SURFACES_PROVIDER_ID },
    { slot: { kind: "home" }, ...(home_order ? { home_order } : {}) }, transport));
}

/** Use the inner client only while the project is already open; even metadata must not prepare its plugins. */
export function projectSurfaceHome(host: LocalHost<MolisWorkProjectRuntime>, owner: MolisWorkLocalHost) {
  return (reference: LocalHostProjectReference, intent: Intent, prefix: string, signal: AbortSignal, deliver: (value: unknown) => void) => {
    const transport = pluginRouteControl(signal, () => {
      if (owner.lifecycle() !== "running") throw new ActionError("actions.host_closed", "宿主已关闭");
    });
    return host.withExistingRuntime(reference, async runtime => {
      requireSynchronous(transport.assert_authority_current?.());
      const caller = openProjectPersonContext(owner, reference, runtime.store, signal);
      const client = host.actionClient(reference);
      const sample = await composeHome(runtime, client, caller, transport, intent);
      requireSynchronous(transport.assert_authority_current?.());
      if (intent.kind === "read") { sample.assertCurrent(); deliver(sample.description); }
      else await clickHomeCard(intent, sample, runtime, caller, client, prefix, transport, deliver);
      return true;
    });
  };
}

export async function handleSurfaceHomeHttp(context: ProjectRequestContext): Promise<boolean> {
  const { request, response, url, localHost, hostReference, options } = context;
  const click = url.pathname === "/api/host/surface-home/click";
  if (!click && url.pathname !== "/api/host/surface-home") return false;
  const disconnected = new AbortController();
  const cancel = () => { if (!response.writableEnded) disconnected.abort(new ActionError("actions.cancelled", "首页请求已结束")); };
  request.once("aborted", cancel); response.once("close", cancel);
  try {
    if (request.method !== "POST") {
      sendLocalWebJson(response, 405, { error: "请通过 POST 请求首页" }); return true;
    }
    if (pluginPageRequest(request)) throw new ActionError("actions.forbidden", "首页只向工作台本人开放");
    if (!options.project) throw new ActionError("actions.scope_mismatch", "首页需要当前项目");
    const intent = homeIntent(await readLocalWebBody(request, 64_000), click);
    const delivered = await localHost.surfaceHome(hostReference, intent, projectRoutePrefix(options), disconnected.signal, result => sendLocalWebJson(response, 200, result));
    if (!delivered) throw new ActionError("actions.unavailable", "项目还没有打开");
  } catch (error) {
    if (!response.destroyed) { const refused = actionErrorResponse(error); sendLocalWebJson(response, refused.status, refused.body); }
  } finally {
    request.removeListener("aborted", cancel); response.removeListener("close", cancel);
  }
  return true;
}
