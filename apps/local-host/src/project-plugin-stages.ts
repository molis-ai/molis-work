import { declaredStageContributionId, stageContributionId, stageDataAction, stageObjectAction, stageSurfaceDescriptors, renderStagePage, withoutPagePublisher, type RenderedStagePage, type PluginRestartOffer, type UnavailablePluginStage } from "@molis-ai/molis-work-app-workbench";
import { PLATFORM_PLUGIN_REGISTRATIONS, runsOnlyInHome } from "./plugin-registry.js";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ActionError, actionEffect, type ActionDefinition, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginRuntime, PluginSupervisor } from "@molis-ai/molis-work-plugin-runtime";
import { optionalPluginQuery } from "./web-view.js";
import type { UiContribution, UiRenderRequest, UiSlotDescriptor } from "@molis-ai/molis-work-contracts/platform/ui";
import type { PluginSupervisorState } from "@molis-ai/molis-work-plugin-runtime";
import { hostLog } from "./host-log.js";
import type { HomePluginHost } from "./home-plugins.js";
import type { LocalProjectDatabase } from "./project-database.js";
import type { ProjectPluginHttpPorts } from "./project-plugin-http.js";
import { projectPluginProblem, type ProjectPluginState } from "./project-plugins.js";
import { L } from "./web-locale.js";

/** A plugin whose stage the project page draws: a catalog registration, or a Home dual-instance plugin outside the build. */
export type StageEntry = { readonly project_plugin_id: string; readonly manifest: PluginManifest };

/** What a project page's plugin surfaces are drawn with: the project plugin services plus the page's escape. */
export interface ProjectPluginSurfacePorts extends ProjectPluginHttpPorts {
  escapeHtml(value: unknown): string;
  /** The Home's plugins: a dual-instance plugin's Home half decides, with its project half, which of them draws the stage. */
  homePlugins?: HomePluginHost;
}

/** One half of a dual-instance plugin as its stage sees it: whether it runs, and whether it offers that stage's own view. */
export interface StageHalf { readonly running: boolean; readonly view: boolean }

/** The Home halves of dual-instance plugins, read for one project page (`homeStageHalves`). */
export interface HomeStageHalves {
  /** The Home's dual-instance plugins that are not the build's registrations (a fixture), by their Home key and Manifest. */
  readonly outsideCatalog: readonly StageEntry[];
  readonly entries: readonly StageEntry[];
  owner(entry: StageEntry): RuntimeStageOwner | undefined;
  dualInstance(pluginId: string): boolean;
  half(pluginId: string, contributionId: string): StageHalf;
  /** The Home's placeholder for the plugin's stage, saying why the Home half does not draw it. */
  unavailable(entry: StageEntry): UnavailablePluginStage;
}

/**
 * Which half of a dual-instance plugin draws its stage, from the two halves as they are now and never from whether the build ships
 * the plugin (T-127). Exactly one half offers the stage's view (DUAL-14), and the half that offers it draws it. A running half
 * without the view proves the view is the other half's, and that half answers with its placeholder. With both halves stopped the
 * project answers: its placeholder is the one that can offer a restart, and once a half runs again the page settles on the owner.
 * Both running and neither offering the view is the Home's, the placeholder the Home has always shown then.
 */
export function dualStageOwner(home: StageHalf, project: StageHalf): "home" | "project" {
  if (home.view) return "home";
  if (project.view) return "project";
  return project.running ? "home" : "project";
}

export interface ProjectRuntimeStageOptions {
  page_owner?: string;
  /** The plugins this project shows. */
  shown: readonly string[];
  /** Contribution ids another stage path has already drawn (`plugin_stage_ids`). */
  drawn: ReadonlyArray<Pick<UiRenderRequest, "contribution_id" | "surface">>;
  /** Prepared once before reads; each wrapper retains its actual running owner. */
  views?: Readonly<Record<string, UiContribution | null>>;
  /** The model a plugin's stage is drawn with: the one the shell would give the same stage. */
  model(projectPluginId: string): unknown;
  /** The Home halves of dual-instance plugins; without them every stage here is its project half's, as on a page with no Home. */
  home?: HomeStageHalves;
}

/**
 * W5-06 (PG-060): the stage of a built-in plugin this project's Runtime runs is drawn by its running instance, not from the build
 * catalog, so a stopped, failed or refused instance does not come back on the page from the catalog; it gets the unavailable
 * shell in its stage instead. Each stage drawn here is reported by its contribution id, so the shell's declared stages do not draw
 * it again. A Home plugin's stage is the Home's (`renderHomePluginStages`). A dual-instance plugin's is the half `dualStageOwner`
 * names: one the Home half drew is skipped here, and the rest are drawn here, the Home's placeholder included. That holds for the
 * Home's dual-instance plugins outside the build too, which the project reaches through the half it runs.
 */
export function renderProjectRuntimeStages(state: ProjectPluginState, store: LocalProjectDatabase,
  options: ProjectRuntimeStageOptions) {
  const runs = new Set(state.plugins ?? []), shown = new Set(options.shown), home = options.home;
  const html: string[] = [], overlays: string[] = [], panels: Record<string, string> = {};
  const surfaces: Array<Pick<UiRenderRequest, "contribution_id" | "surface">> = [];
  let page: RenderedStagePage | undefined;
  const unavailable: UnavailablePluginStage[] = [];
  const candidates = [
    ...PLATFORM_PLUGIN_REGISTRATIONS.filter(entry => !runsOnlyInHome(entry) && shown.has(entry.project_plugin_id))
      .map(entry => ({ entry: entry as StageEntry, contributionId: declaredStageContributionId(entry) })),
    ...(home?.outsideCatalog ?? []).filter(entry => shown.has(entry.project_plugin_id)).map(entry => ({ entry, contributionId: stageContributionId(entry.manifest) })),
  ];
  for (const { entry, contributionId } of candidates) {
    const pluginId = entry.manifest.plugin_id;
    if (!runs.has(pluginId) || !contributionId) continue;
    const key = `project:${entry.project_plugin_id}`;
    if (options.views && !Object.hasOwn(options.views, key)) continue;
    if (!options.views && home?.dualInstance(pluginId)) {
      const half = home.half(pluginId, contributionId);
      if (dualStageOwner(half, { running: Boolean(state.platform?.supervisor.contribution(pluginId)), view: Boolean(stageView(state, pluginId, contributionId)) }) === "home") {
        if (!half.view) unavailable.push(home.unavailable(entry));
        continue;
      }
    }
    const prepared = options.views ? options.views[key] : undefined;
    const stage = runtimeStage(state, store, entry, contributionId, options.model, options.page_owner === pluginId, options.drawn, prepared);
    if ("html" in stage) {
      if (stage.page) page = stage.page;
      if (stage.html) html.push(stage.html);
      if (stage.panels) panels[entry.project_plugin_id] = stage.panels;
      if (stage.overlays) overlays.push(stage.overlays);
      surfaces.push(...stage.surfaces);
    } else unavailable.push(stage);
  }
  return { html, panels, overlays, surfaces, unavailable, ...(page ? { page } : {}) };
}

/** The view of the project instance that draws this stage: the contribution the Manifest names, with its `workbench` surface. */
function stageView(state: ProjectPluginState, pluginId: string, contributionId: string): UiContribution | undefined {
  const contribution = state.platform?.supervisor.contribution(pluginId);
  return contribution?.kind === "app" ? contribution.views?.find(item => item.descriptor.contribution_id === contributionId
    && item.descriptor.surfaces?.some(surface => surface.surface_id === "workbench")) : undefined;
}

function runtimeStage(state: ProjectPluginState, store: LocalProjectDatabase, entry: StageEntry, contributionId: string,
  model: ProjectRuntimeStageOptions["model"], pageOwner: boolean, drawn: ProjectRuntimeStageOptions["drawn"], prepared?: UiContribution | null): ReturnType<typeof renderStagePage> | UnavailablePluginStage {
  const pluginId = entry.manifest.plugin_id;
  const contribution = state.platform?.supervisor.contribution(pluginId);
  if (!contribution) {
    const active = state.platform?.supervisor.state(pluginId);
    const running = active?.status === "running" && active.install_id && state.platform?.runtime.get(active.install_id).state === "running";
    return unavailableStage(state, entry, projectPluginProblem(state, store, pluginId)?.reason
      ?? (running ? L("插件正在运行，但未提供页面") : L("插件没有在运行")));
  }
  const view = prepared === undefined ? stageView(state, pluginId, contributionId) : prepared;
  if (!view) return unavailableStage(state, entry, L("插件页面未注册"));
  try {
    const own = model(entry.project_plugin_id), nested = nestedContent(state, entry, view, own);
    const manifest = state.platform?.supervisor.manifest(pluginId) ?? entry.manifest;
    return renderStagePage(view, nested ? { ...own as Record<string, unknown>, nested } : own, entry.project_plugin_id, pageOwner,
      request => view.render(request), { manifest, rendered: drawn });
  } catch (error) {
    hostLog.warn("plugins", "project_stage_failed", error, { plugin_id: pluginId });
    return unavailableStage(state, entry, L("插件页面读取失败"));
  }
}

/**
 * The placeholder says why (the supervisor's status, code and message) and, when the person can do something about it, offers it
 * (W5-06 余项 3, BL-430). The Host decides the offer from the instance, never from the page: the shell's button only names it.
 */
function unavailableStage(state: ProjectPluginState, entry: StageEntry, reason: string): UnavailablePluginStage {
  const pluginId = entry.manifest.plugin_id, active = state.platform?.supervisor.state(pluginId);
  return { surface: entry.project_plugin_id, label: entry.manifest.name, reason, scope: "project", plugin_id: pluginId,
    ...(active && active.status !== "running" && active.code !== "plugin.revoked" ? { status: active.status, code: active.code } : {}), restart: restartOffer(state, active) };
}

/**
 * An instance that failed or crashed is started again; a quarantined one is released first (the supervisor's own restart takes each
 * of these states). A plugin the person switched off or whose consent was withdrawn (`plugin.revoked`), one the Runtime blocks, one
 * that was only stopped and one that was uninstalled get no button: a restart must never turn a switched-off plugin back on.
 */
function restartOffer(state: ProjectPluginState, active: PluginSupervisorState | null | undefined): PluginRestartOffer | null {
  if (!state.platform || !active?.install_id || active.status === "blocked" || active.code === "plugin.revoked") return null;
  const installed = state.platform.runtime.get(active.install_id).state;
  if (installed === "quarantined") return "release-quarantine";
  return installed !== "uninstalled" && (installed === "crashed" || active.status === "failed") ? "restart" : null;
}

/**
 * The slots a stage's view opens (`descriptor.slots`) filled by the plugins its Manifest embeds (`ui.embedded_plugins`): each running
 * embedded plugin's surfaces that target the slot are drawn, with the page's own model, and joined in the Manifest's order. An
 * embedded plugin that is not running, or whose surface fails, leaves its place empty and the stage still draws.
 */
function nestedContent(state: ProjectPluginState, entry: StageEntry, view: UiContribution, model: unknown): Readonly<Record<string, string>> | undefined {
  const nested: Record<string, string> = {};
  for (const slot of view.descriptor.slots) {
    const html = (entry.manifest.ui.embedded_plugins ?? []).flatMap(embeddedId => embeddedFragments(state, embeddedId, slot, model)).join("");
    if (html) nested[slot.slot_id] = html;
  }
  return Object.keys(nested).length ? nested : undefined;
}

function embeddedFragments(state: ProjectPluginState, embeddedId: string, slot: UiSlotDescriptor, model: unknown): string[] {
  const contribution = state.platform?.supervisor.contribution(embeddedId);
  if (contribution?.kind !== "app") return [];
  return (contribution.views ?? []).flatMap(view => (view.descriptor.surfaces ?? [])
    .filter(surface => surface.target_slot_id === slot.slot_id && slot.accepts.includes(surface.format))
    .flatMap(surface => {
      try { return [view.render({ contribution_id: view.descriptor.contribution_id, surface: surface.surface_id, model: withoutPagePublisher(model) })]; }
      catch (error) { hostLog.warn("plugins", "embedded_surface_failed", error, { plugin_id: embeddedId, surface: surface.surface_id }); return []; }
    }));
}


/** An actual running stage owner, retained for one request only. */
export interface RuntimeStageOwner {
  readonly scope: "home" | "project";
  readonly entry: StageEntry;
  readonly install_id: string;
  readonly view: UiContribution;
  assertCurrent(): void;
}

/** Capture the running Manifest, contribution, installation generation and permissions together. */
export function captureRuntimeStageOwner(platform: { runtime: PluginRuntime; supervisor: PluginSupervisor } | undefined | null,
  scope: RuntimeStageOwner["scope"], entry: StageEntry): RuntimeStageOwner | undefined {
  if (!platform) return undefined;
  const pluginId = entry.manifest.plugin_id, active = platform.supervisor.state(pluginId), manifest = platform.supervisor.manifest(pluginId);
  if (active?.status !== "running" || !active.install_id || !manifest) return undefined;
  const record = platform.runtime.get(active.install_id), contribution = platform.supervisor.contribution(pluginId);
  if (record.state !== "running" || contribution?.kind !== "app") return undefined;
  const id = stageContributionId(manifest), view = contribution.views?.find(item => item.descriptor.contribution_id === id);
  if (!view) return undefined;
  const identity = { install_id: record.install_id, installation_generation: record.installation_generation, version: record.version, manifest_digest: record.manifest_digest };
  const descriptor = JSON.stringify(view.descriptor), declaration = JSON.stringify({ ui: manifest.ui, actions: manifest.actions }), render = view.render, grants = [...record.grants].sort().join("\0");
  const assertCurrent = () => {
    const now = platform.supervisor.state(pluginId), installed = platform.runtime.get(record.install_id);
    if (now?.status !== "running" || now.install_id !== identity.install_id || installed.state !== "running"
      || installed.installation_generation !== identity.installation_generation || installed.version !== identity.version || installed.manifest_digest !== identity.manifest_digest
      || [...installed.grants].sort().join("\0") !== grants || platform.supervisor.manifest(pluginId) !== manifest
      || JSON.stringify({ ui: manifest.ui, actions: manifest.actions }) !== declaration
      || platform.supervisor.contribution(pluginId) !== contribution || !contribution.views?.includes(view) || view.render !== render
      || JSON.stringify(view.descriptor) !== descriptor) throw new ActionError("actions.provider_changed", "原舞台实例、声明或授权已变化，请重新读取");
  };
  assertCurrent();
  return { scope, entry: { project_plugin_id: entry.project_plugin_id, manifest }, install_id: record.install_id, view, assertCurrent };
}

/** The chosen half, without reading either half's data or rendering it. */
export function runtimeStageOwner(state: ProjectPluginState, entry: StageEntry, home?: HomeStageHalves): { scope: RuntimeStageOwner["scope"]; owner?: RuntimeStageOwner } {
  const project = captureRuntimeStageOwner(state.platform, "project", entry), fromHome = home?.owner(entry);
  if (home?.dualInstance(entry.manifest.plugin_id)) {
    const id = stageContributionId(entry.manifest) ?? "";
    const scope = dualStageOwner(home.half(entry.manifest.plugin_id, id), { running: Boolean(state.platform?.supervisor.contribution(entry.manifest.plugin_id)), view: Boolean(project) });
    return { scope, owner: scope === "home" ? fromHome : project };
  }
  return project ? { scope: "project", owner: project } : fromHome ? { scope: "home", owner: fromHome }
    : { scope: entry.manifest.runtime?.scope === "home" ? "home" : "project" };
}

/** Invoke exactly this actual owner's declaration and pin the provider of its selected half. */
export async function readRuntimeStageOwner(owner: RuntimeStageOwner, bind: (action: ActionDefinition) => BoundActionClient,
  input: Readonly<Record<string, string>>, object = false): Promise<unknown> {
  owner.assertCurrent();
  const manifest = owner.entry.manifest, action = object ? stageObjectAction(manifest) : stageDataAction(manifest);
  if (!action) { if (object) throw new ActionError("actions.missing", "插件未声明对象读取"); return undefined; }
  if (manifest.actions?.filter(item => item.capability_id === action.capability_id).length !== 1 || action.operation !== "query"
    || actionEffect(action.action, action.capability_id) !== "read" || !action.action.audiences.includes("user")) throw new ActionError("actions.input_invalid", "舞台读取必须是本 Manifest 唯一的本人只读查询");
  const client = bind(action), matches = (await client.discover()).filter(view => view.capability_id === action.capability_id && view.version === action.version
    && view.provider.plugin_install_id === owner.install_id && (owner.scope === "home" ? !view.provider.project_id : Boolean(view.provider.project_id)));
  owner.assertCurrent();
  if (matches.length !== 1) throw new ActionError("actions.forbidden", "原舞台的读取提供方不再唯一可用");
  const pinned = { ...action, provider_id: matches[0]!.provider.provider_id };
  const result = object ? await client.invoke(pinned, input) : await optionalPluginQuery(client, pinned, input);
  owner.assertCurrent();
  return result;
}

/** Choose once, read once, and keep only request-local guarded view references for later synchronous rendering. */
export async function readRuntimeStageData(state: ProjectPluginState, shown: readonly string[], home: HomeStageHalves | undefined,
  bind: (action: ActionDefinition) => BoundActionClient, requests: Readonly<Record<string, Readonly<Record<string, string>>>> = {}) {
  const showing = new Set(shown), data: Record<string, unknown> = {}, views: Record<string, UiContribution | null> = {};
  const entries = [...PLATFORM_PLUGIN_REGISTRATIONS.filter(entry => showing.has(entry.project_plugin_id)),
    ...(home?.entries ?? []).filter(entry => showing.has(entry.project_plugin_id) && !PLATFORM_PLUGIN_REGISTRATIONS.some(item => item.project_plugin_id === entry.project_plugin_id))];
  for (const entry of entries) {
    if (!stageContributionId(entry.manifest)) continue;
    const selected = runtimeStageOwner(state, entry, home), key = `${selected.scope}:${entry.project_plugin_id}`, owner = selected.owner;
    views[key] = null;
    if (!owner) continue;
    try { stageSurfaceDescriptors(owner.entry.manifest, owner.view); }
    catch (error) { hostLog.warn("plugins", "stage_surface_invalid", error, { plugin_id: entry.manifest.plugin_id }); continue; }
    try {
      const result = await readRuntimeStageOwner(owner, bind, requests[entry.project_plugin_id] ?? {});
      owner.assertCurrent();
      if (result === undefined && stageDataAction(owner.entry.manifest)) continue;
      if (result !== undefined) data[entry.project_plugin_id] = result;
      views[key] = { get descriptor() { owner.assertCurrent(); return owner.view.descriptor; }, render: request => { owner.assertCurrent(); return owner.view.render(request); } };
    } catch (error) {
      if (!(error instanceof ActionError) || !["actions.forbidden", "actions.plugin_disabled", "actions.missing", "actions.provider_changed"].includes(error.code)) throw error;
    }
  }
  return { data, views };
}
