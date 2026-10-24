import { BUILTIN_PLUGIN_CATALOG, declaredStageContributionId, type UnavailablePluginStage } from "@molis-ai/molis-work-app-workbench";
import { hostLog } from "./host-log.js";
import type { LocalProjectDatabase } from "./project-database.js";
import { projectPluginProblem, type ProjectPluginState } from "./project-plugins.js";
import { L } from "./web-locale.js";

type CatalogEntry = (typeof BUILTIN_PLUGIN_CATALOG)[number];

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
    return unavailableStage(entry, projectPluginProblem(state, store, pluginId)?.reason
      ?? (running ? L("插件正在运行，但未提供页面") : L("插件没有在运行")));
  }
  const view = contribution.kind === "app" ? contribution.views?.find(item => item.descriptor.contribution_id === contributionId
    && item.descriptor.surfaces?.some(surface => surface.surface_id === "workbench")) : undefined;
  if (!view) return unavailableStage(entry, L("插件页面未注册"));
  try {
    return view.render({ contribution_id: contributionId, surface: "workbench", model: model(entry.project_plugin_id) });
  } catch (error) {
    hostLog.warn("plugins", "project_stage_failed", error, { plugin_id: pluginId });
    return unavailableStage(entry, L("插件页面读取失败"));
  }
}

function unavailableStage(entry: CatalogEntry, reason: string): UnavailablePluginStage {
  return { surface: entry.project_plugin_id, label: entry.manifest.name, reason, scope: "project" };
}
