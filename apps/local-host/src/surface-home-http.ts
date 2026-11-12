import { randomUUID } from "node:crypto";
import { ActionError, actionResultSubject, bindActionClient, requireSynchronous, type ActionCallContext, type ActionClient, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { SURFACE_HOME_ORDER_LIMIT, type SurfaceHomeEnable, type SurfacePluginCard } from "@molis-ai/molis-work-contracts/services/surface-composition";
import { actionErrorResponse, canonicalJsonText, isRecord } from "@molis-ai/molis-work-plugin-sdk";
import { startSurfaceRead } from "@molis-ai/molis-work-service-surfaces";
import { assertStageInstallation, sameInstalledRelease } from "./installed-stage-identity.js";
import type { LocalHost } from "./local-host.js";
import { pluginControlActions } from "./plugin-install-actions.js";
import { PROJECT_WORKSPACE_PROVIDER_ID, projectPluginActions } from "@molis-ai/molis-work-contracts/modules/projects";
import { invokeLocalWebCatalogAction } from "./local-web-actions.js";
import { PLATFORM_PLUGIN_REGISTRATIONS } from "./plugin-registry.js";
import { pluginInstallRecords } from "./plugin-install-records.js";
import { pluginPageRequest, pluginPagesFor } from "./plugin-page-authority.js";
import { grantSurfaceHomeText } from "./surface-home-text.js";
import { pluginRouteControl } from "./plugin-route-control.js";
import type { MolisWorkLocalHost, MolisWorkProjectRuntime } from "./project-host.js";
import type { HomeDirectoryEntry, SurfaceHomeCatalogReader } from "./surface-home-directory.js";
import { homeReference as reference, ownerReader, projectHomeDisplay, projectHomePeek, type HomeReadSample } from "./surface-home-display.js";
import { assertHomeDisplayReader, homeObjectClick, openHomeObject, openProvedHomeObject, stageNavigation } from "./surface-home-open.js";
import { homeFormDiscovery } from "./surface-home-form-authority.js";
import { composeSurface, displayValues, preparePositionPlacement, projectSurfaceContext } from "./surface-project-read.js";
import { readLocalWebBody, sendLocalWebJson } from "./web-http.js";
import { projectRoutePrefix, type ProjectRequestContext } from "./web-project-context.js";
import { attentionPositionGuard, correctSurfacePosition, positionCorrection } from "./surface-position-correction.js";
import { confirmPositionOffer, positionOfferScope } from "./surface-position-http.js";
import { positionOfferIntent, takePositionOffer, withPositionOfferWindow, type OfferWindow } from "./surface-position-offers.js";
import { isPlacementKind } from "./surface-placement.js";

type Target = NonNullable<SurfacePluginCard["open" | "enable"]> | NonNullable<SurfacePluginCard["start"]>[number];
type Intent = { kind: "read"; home_order?: string[] } | { kind: "click"; owner: string; target: Record<string, unknown> }
  | { kind: "correct"; home_order?: string[]; correction: NonNullable<ReturnType<typeof positionCorrection>> };

const invalid = () => new ActionError("actions.input_invalid", "首页请求无效");
const changed = () => new ActionError("actions.provider_changed", "原首页卡片已变化，请重新读取");
const unknown = (cause: unknown) => new ActionError("actions.outcome_unknown", "操作已执行，但原首页或授权已变化，请检查结果", { cause });

/** One home card click: who clicked in which project and runtime, the request's transport fence, and where the answer goes. */
interface HomeClick {
  owner: MolisWorkLocalHost; project: LocalHostProjectReference; runtime: MolisWorkProjectRuntime; caller: ActionCallContext; client: ActionClient;
  prefix: string; transport: ReturnType<typeof pluginRouteControl>; deliver(value: unknown): void;
}
function homeIntent(body: Record<string, unknown>, click: boolean): Intent {
  if (!isRecord(body)) throw invalid();
  if (click) {
    if (Object.keys(body).length !== 2 || typeof body.owner_plugin_id !== "string" || !body.owner_plugin_id.length || body.owner_plugin_id.length > 200 || !isRecord(body.target)) throw invalid();
    return { kind: "click", owner: body.owner_plugin_id, target: body.target };
  }
  if (Object.keys(body).some(key => key !== "home_order" && key !== "correct")) throw invalid();
  const order = body.home_order;
  if (order !== undefined && (!Array.isArray(order) || order.length > SURFACE_HOME_ORDER_LIMIT || new Set(order).size !== order.length
    || !order.every((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 200))) throw invalid();
  const correction = positionCorrection(body.correct);
  return correction ? { kind: "correct", correction, home_order: order } : { kind: "read", home_order: order };
}

function originalTarget(card: SurfacePluginCard | undefined, target: Record<string, unknown>): Target {
  const key = canonicalJsonText(target, "null");
  const accepted = [card?.open, ...card?.start ?? [], card?.enable].find(candidate => candidate && canonicalJsonText(candidate, "null") === key);
  if (!accepted) throw changed();
  return accepted;
}

function exactClickClient(client: ActionClient, caller: ActionCallContext, view: ActionView) {
  const target = reference(view);
  if (!view.action.permissions.every(permission => caller.permissions.includes(permission)) || !caller.allowed_actions?.some(action =>
    action.capability_id === target.capability_id && action.version === target.version && action.provider_id === target.provider_id))
    throw new ActionError("actions.forbidden", "这项首页操作没有本人执行权限");
  return bindActionClient(client, () => ({ ...caller, permissions: view.action.permissions, allowed_actions: [target],
    user_action: { source: "web", conversation_ref: `web:${caller.project_id}`, message_ref: `web:request:${randomUUID()}` } }));
}

async function enablePackage({ client, caller, runtime, transport, deliver }: HomeClick, entry: HomeDirectoryEntry,
  target: Extract<SurfaceHomeEnable, { kind: "project_installation" }>, view: ActionView, assertOfferCurrent: () => void) {
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

/**
 * A removed native plugin returns through Projects' own membership setter (batch 20) with the revision this card showed. Until the
 * member is saved, the card and the exact disabled installation it named must still be current; Projects checks the revision in its
 * transaction. Once the member is shown again only the edition is checked: the Runtime may already be starting it, and a member someone
 * else saved meanwhile has moved the revision, which Projects refuses.
 */
async function enableMembership({ owner, project, runtime, transport, deliver }: HomeClick, entry: HomeDirectoryEntry,
  target: Extract<SurfaceHomeEnable, { kind: "project_membership" }>, card: { assertCurrent(): void; isShownMember(member: string): boolean }) {
  const member = PLATFORM_PLUGIN_REGISTRATIONS.find(item => item.manifest.plugin_id === entry.plugin.plugin_id && item.project_runtime)?.project_plugin_id;
  if (!member) throw changed();
  const records = pluginInstallRecords(runtime.store.db);
  const assertCurrent = () => {
    requireSynchronous(transport.assert_authority_current?.());
    const now = records.get(target.installation.install_id);
    if (!now || now.plugin_id !== entry.plugin.plugin_id || now.publisher_trust !== "host" || now.publisher_signature !== entry.record.publisher_signature
      || !sameInstalledRelease(target.installation, now)) throw changed();
    if (card.isShownMember(member)) return;
    card.assertCurrent();
    if (now.state !== "disabled") throw changed();
  };
  await transport.beforeEffect();
  // Saved even when the Runtime switch then fails: that 503 is Projects' receipt, passed on as it is, and a retry with this card is stale.
  await invokeLocalWebCatalogAction(owner, async () => project, { ...projectPluginActions.set, provider_id: PROJECT_WORKSPACE_PROVIDER_ID },
    { plugin_id: member, enabled: true, expected_revision: target.expected_revision }, { signal: transport.signal!, sessionCurrent: assertCurrent });
  requireSynchronous(transport.assert_authority_current?.());
  deliver({ kind: "enabled" });
}

async function clickHomeCard(intent: Extract<Intent, { kind: "click" }>, sample: HomeReadSample, click: HomeClick) {
  const { runtime, caller, client, prefix, transport, deliver } = click;
  const object = homeObjectClick(intent.target, intent.owner, sample);
  if (object) {
    const fallback = object.item && assertHomeDisplayReader(sample, object.entry, object.item);
    if (fallback) {
      if (sample.attention?.some(entry => entry.owner_plugin_id === intent.owner && entry.subject.kind === object.subject.kind && entry.subject.id === object.subject.id))
        attentionPositionGuard(sample, { runtime }, intent.owner, object.subject)();
      const stage = openProvedHomeObject(sample.catalog, object.entry, fallback, prefix);
      sample.assertCurrent();
      return deliver(stage);
    }
    if (isPlacementKind(object.kind)) throw changed();
    if (object.kind === "peek" && object.item) {
      const row = await projectHomePeek(sample, object.item, transport.signal!, displayValues(sample, client, caller, transport));
      sample.assertCurrent();
      return deliver({ kind: "peek", row });
    }
    const reader = ownerReader(sample, object.entry, object.subject);
    if (!reader) throw changed();
    const opened = await openHomeObject(sample, object.entry, reader, object.subject, client, caller, transport, prefix);
    sample.assertCurrent();
    return deliver(opened);
  }
  const group = sample.description.groups.find(item => item.kind === "plugin" && item.owner_plugin_id === intent.owner);
  const target = originalTarget(group?.plugin_card, intent.target);
  const entry = sample.catalog.entries.find(item => item.plugin.plugin_id === intent.owner && target.installation.scope === item.installation.scope
    && sameInstalledRelease(target.installation, item.installation));
  if (!entry) throw changed();
  const assertCurrent = () => { requireSynchronous(transport.assert_authority_current?.()); sample.assertCurrent(); };
  assertCurrent();
  if (target.kind === "home_plugin_settings") return deliver({ kind: "settings", section: "plugins" });
  if (target.kind === "stage") return deliver(stageNavigation(entry, target, prefix));
  const action = target.action;
  const view = [...sample.views].find(item => item.capability_id + "@" + item.version === action.ref && item.provider.provider_id === action.provider_id);
  if (!view) throw changed();
  if (target.kind === "project_installation") return enablePackage(click, entry, target, view, () => {
    sample.actionsCurrent?.(); sample.catalog.assertVisiblePackage(intent.owner);
  });
  if (target.kind === "project_membership") return enableMembership(click, entry, target, {
    assertCurrent() { sample.actionsCurrent?.(); sample.catalog.assertCurrent(); }, isShownMember: member => sample.catalog.isShownMember(member),
  });
  assertStageInstallation(entry.installation.scope, entry.record, target.installation);
  if (view.provider.plugin_id !== intent.owner || view.provider.plugin_install_id !== entry.installation.install_id || view.action.scope !== entry.installation.scope) throw changed();
  if (target.kind === "form") return deliver(stageNavigation(entry, target, prefix));
  const result = await exactClickClient(client, caller, view).invoke({ ...view, ...reference(view) }, {}, {
    ...transport, assert_authority_current: assertCurrent, async beforeEffect() { await transport.beforeEffect(); assertCurrent(); },
  });
  try { assertCurrent(); }
  catch (error) {
    if (view.operation !== "command") throw error;
    throw unknown(error);
  }
  const created = view.action.result_subject ? actionResultSubject(view.action, {}, result) : null;
  if (!created) return deliver({ kind: "invoked", result });
  const retry_open = { kind: "open_result", subject: created.subject, installation: entry.installation };
  const reader = ownerReader(sample, entry, created.subject);
  let stage;
  try {
    if (reader) {
      const opened = await openHomeObject(sample, entry, reader, created.subject, client, caller, transport, prefix);
      sample.assertCurrent();
      stage = opened;
    }
  } catch {
    // The command returned its result. A changed reader cannot roll it back or justify calling the command again.
    try {
      requireSynchronous(transport.assert_authority_current?.());
      requireSynchronous(caller.assert_authority_current?.(reference(view), view.action.permissions));
      sample.catalog.assertCurrent();
    } catch (error) { throw unknown(error); }
  }
  deliver({ kind: "invoked", result, ...(stage ? { stage } : {}), retry_open });
}

/** Use the inner client only while the project is already open; even metadata must not prepare its plugins. */
export function projectSurfaceHome(host: LocalHost<MolisWorkProjectRuntime>, owner: MolisWorkLocalHost, homeDirectory: string | undefined, readCatalog: SurfaceHomeCatalogReader) {
  const project = projectSurfaceContext(host, owner, homeDirectory, readCatalog);
  return (reference: LocalHostProjectReference, intent: Intent, prefix: string, signal: AbortSignal, deliver: (value: unknown) => void, window?: OfferWindow) => {
    return project(reference, signal, undefined, async context => {
      const { runtime, transport, caller, metadata, catalog, client } = context;
      const discovery = homeFormDiscovery(caller, metadata, catalog.entries);
      const deadline = intent.kind !== "click" || intent.target.kind === "peek" ? startSurfaceRead(signal) : undefined;
      try {
        const home_order = intent.kind === "click" ? undefined : intent.home_order;
        const sample = await composeSurface({ ...context, caller: discovery.caller }, { slot: { kind: "home" }, ...(home_order ? { home_order } : {}) }, deadline, discovery.formOnly);
        requireSynchronous(transport.assert_authority_current?.());
        const deliverCurrent = (result: unknown) => { requireSynchronous(transport.assert_authority_current?.()); deliver(result); };
        if (intent.kind === "read") {
          const display = await projectHomeDisplay(sample, signal, displayValues(sample, client, caller, transport));
          sample.assertCurrent();
          const words = homeDirectory ? grantSurfaceHomeText(sample, display, { home: homeDirectory, project_id: reference.project_id, actor_id: caller.actor_id,
            record: installation => installation.scope === "home" ? owner.homePlugins?.installation(installation.install_id)
              : pluginInstallRecords(runtime.store.db).get(installation.install_id) }) : undefined;
          try { deliverCurrent(words?.text.length ? { ...display, surface_text: words.text } : display); }
          catch (error) { words?.release(); throw error; }
        } else if (intent.kind === "correct") {
          deliverCurrent(await correctSurfacePosition(sample, context, { kind: "home" }, sample.description.groups, intent.correction,
            displayValues(sample, client, caller, transport)));
        } else if (isPlacementKind(intent.target.kind)) {
          const object = homeObjectClick(intent.target, intent.owner, sample);
          if (!window || !object?.item || !object.revision) throw changed();
          const current = () => { requireSynchronous(transport.assert_authority_current?.()); sample.assertCurrent(); };
          const result = await preparePositionPlacement(sample, context, object.item, intent.target.kind, object.revision, { window }, current);
          current(); deliverCurrent(result);
        } else await clickHomeCard(intent, sample, { owner, project: reference, runtime, caller, client, prefix, transport, deliver: deliverCurrent });
        return true;
      } finally { deadline?.dispose(); }
    }, window);
  };
}

const HOME_SURFACE_PATH = "/api/host/surface-home";
const HOME_SURFACE_CLICK_PATH = HOME_SURFACE_PATH + "/click";
export const isSurfaceHomePath = (pathname: string) => pathname === HOME_SURFACE_PATH || pathname === HOME_SURFACE_CLICK_PATH;

export async function handleSurfaceHomeHttp(context: ProjectRequestContext): Promise<boolean> {
  const { request, response, url, localHost, hostReference, options } = context;
  if (!isSurfaceHomePath(url.pathname)) return false;
  const click = url.pathname === HOME_SURFACE_CLICK_PATH;
  const disconnected = new AbortController();
  const cancel = () => { if (!response.writableEnded) disconnected.abort(new ActionError("actions.cancelled", "首页请求已结束")); };
  request.once("aborted", cancel); response.once("close", cancel);
  try {
    if (request.method !== "POST") {
      sendLocalWebJson(response, 405, { error: "请通过 POST 请求首页" }); return true;
    }
    if (pluginPageRequest(request)) throw new ActionError("actions.forbidden", "首页只向工作台本人开放");
    if (!options.project) throw new ActionError("actions.scope_mismatch", "首页需要当前项目");
    const body = await readLocalWebBody(request, 64_000), scope = positionOfferScope(hostReference.project_id, "home");
    if (!click && Object.keys(body).length === 1 && Object.hasOwn(body, "offer")) {
      const offer = positionOfferIntent(body.offer);
      if (!offer) throw invalid();
      const claimed = takePositionOffer(scope, offer);
      if (!claimed) { sendLocalWebJson(response, 200, { closed: true }); return true; }
      try { if (!await confirmPositionOffer(localHost, hostReference, disconnected.signal, undefined, claimed, response)) throw changed(); }
      finally { claimed.window.close(); }
      return true;
    }
    if (!click && Object.keys(body).length === 1 && Object.hasOwn(body, "release_text")) {
      const ids = body.release_text;
      if (!Array.isArray(ids) || ids.length > 256 || ids.some(id => typeof id !== "string")) throw invalid();
      if (context.serverOptions.homeDirectory) pluginPagesFor(context.serverOptions.homeDirectory).releaseText(ids as string[], hostReference.project_id);
      sendLocalWebJson(response, 200, { released: true }); return true;
    }
    const intent = homeIntent(body, click);
    const delivered = await withPositionOfferWindow(scope, intent.kind === "click" && isPlacementKind(intent.target.kind), window =>
      localHost.surfaceHome(hostReference, intent, projectRoutePrefix(options), disconnected.signal, result => sendLocalWebJson(response, 200, result), window));
    if (!delivered) throw new ActionError("actions.unavailable", "项目还没有打开");
  } catch (error) {
    if (!response.destroyed) { const refused = actionErrorResponse(error); sendLocalWebJson(response, refused.status, refused.body); }
  } finally {
    request.removeListener("aborted", cancel); response.removeListener("close", cancel);
  }
  return true;
}
