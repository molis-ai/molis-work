import { BUILTIN_PLUGIN_CATALOG, declaredStageContributionId, type PluginRestartOffer, type UnavailablePluginStage } from "@molis-ai/molis-work-app-workbench";
import type { UiContribution, UiSlotDescriptor } from "@molis-ai/molis-work-contracts/platform/ui";
import type { PluginSupervisorState } from "@molis-ai/molis-work-plugin-runtime";
import { hostLog } from "./host-log.js";
import type { LocalProjectDatabase } from "./project-database.js";
import type { ProjectPluginHttpPorts } from "./project-plugin-http.js";
import { projectPluginProblem, type ProjectPluginState } from "./project-plugins.js";
import { L } from "./web-locale.js";

type CatalogEntry = (typeof BUILTIN_PLUGIN_CATALOG)[number];

/** What a project page's plugin surfaces are drawn with: the project plugin services plus the page's escape. */
export interface ProjectPluginSurfacePorts extends ProjectPluginHttpPorts {
  escapeHtml(value: unknown): string;
}

export interface ProjectRuntimeStageOptions {
  /** The plugins this project shows. */
  shown: readonly string[];
  /** Contribution ids another stage path has already drawn (`plugin_stage_ids`). */
  drawn: readonly string[];
  /** The model a plugin's stage is drawn with: the one the shell would give the same stage. */
  model(projectPluginId: string): unknown;
}

/**
 * W5-06 (PG-060): the stage of a built-in plugin this project's Runtime runs is drawn by its running instance, not from the build
 * catalog, so a stopped, failed or refused instance does not come back on the page from the catalog; it gets the unavailable
 * shell in its stage instead. Each stage drawn here is reported by its contribution id, so the shell's declared stages do not draw
 * it again. A Home plugin's stage, a dual-instance plugin's included, is the Home's (`renderHomePluginStages`).
 */
export function renderProjectRuntimeStages(state: ProjectPluginState, store: LocalProjectDatabase,
  options: ProjectRuntimeStageOptions): { html: string[]; ids: string[]; unavailable: UnavailablePluginStage[] } {
  const runs = new Set(state.plugins ?? []), shown = new Set(options.shown), drawn = new Set(options.drawn);
  const html: string[] = [], ids: string[] = [];
  const unavailable: UnavailablePluginStage[] = [];
  for (const entry of BUILTIN_PLUGIN_CATALOG) {
    if (entry.runtime?.scope === "home" || !runs.has(entry.manifest.plugin_id) || !shown.has(entry.project_plugin_id)) continue;
    const contributionId = declaredStageContributionId(entry);
    if (!contributionId || drawn.has(contributionId)) continue;
    ids.push(contributionId);
    const stage = runtimeStage(state, store, entry, contributionId, options.model);
    if (typeof stage === "string") html.push(stage); else unavailable.push(stage);
  }
  return { html, ids, unavailable };
}

function runtimeStage(state: ProjectPluginState, store: LocalProjectDatabase, entry: CatalogEntry, contributionId: string,
  model: ProjectRuntimeStageOptions["model"]): string | UnavailablePluginStage {
  const pluginId = entry.manifest.plugin_id;
  const contribution = state.platform?.supervisor.contribution(pluginId);
  if (!contribution) {
    const active = state.platform?.supervisor.state(pluginId);
    const running = active?.status === "running" && active.install_id && state.platform?.runtime.get(active.install_id).state === "running";
    return unavailableStage(state, entry, projectPluginProblem(state, store, pluginId)?.reason
      ?? (running ? L("插件正在运行，但未提供页面") : L("插件没有在运行")));
  }
  const view = contribution.kind === "app" ? contribution.views?.find(item => item.descriptor.contribution_id === contributionId
    && item.descriptor.surfaces?.some(surface => surface.surface_id === "workbench")) : undefined;
  if (!view) return unavailableStage(state, entry, L("插件页面未注册"));
  try {
    const own = model(entry.project_plugin_id), nested = nestedContent(state, entry, view, own);
    return view.render({ contribution_id: contributionId, surface: "workbench", model: nested ? { ...own as Record<string, unknown>, nested } : own });
  } catch (error) {
    hostLog.warn("plugins", "project_stage_failed", error, { plugin_id: pluginId });
    return unavailableStage(state, entry, L("插件页面读取失败"));
  }
}

/**
 * The placeholder says why (the supervisor's status, code and message) and, when the person can do something about it, offers it
 * (W5-06 余项 3, BL-430). The Host decides the offer from the instance, never from the page: the shell's button only names it.
 */
function unavailableStage(state: ProjectPluginState, entry: CatalogEntry, reason: string): UnavailablePluginStage {
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
function nestedContent(state: ProjectPluginState, entry: CatalogEntry, view: UiContribution, model: unknown): Readonly<Record<string, string>> | undefined {
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
      try { return [view.render({ contribution_id: view.descriptor.contribution_id, surface: surface.surface_id, model })]; }
      catch (error) { hostLog.warn("plugins", "embedded_surface_failed", error, { plugin_id: embeddedId, surface: surface.surface_id }); return []; }
    }));
}
