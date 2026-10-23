import { BUILTIN_PLUGIN_CATALOG, declaredStageContributionId } from "@molis-ai/molis-work-app-workbench";
import { escapeHtml, renderPluginStageShell } from "@molis-ai/molis-work-design-system";
import { hostLog } from "./host-log.js";
import type { LocalProjectDatabase } from "./project-database.js";
import { projectPluginProblem, type ProjectPluginState } from "./project-plugins.js";

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
  options: ProjectRuntimeStageOptions): { html: string[]; ids: string[] } {
  const runs = new Set(state.plugins ?? []), shown = new Set(options.shown), drawn = new Set(options.drawn);
  const html: string[] = [], ids: string[] = [];
  for (const entry of BUILTIN_PLUGIN_CATALOG) {
    if (entry.runtime?.scope === "home" || !runs.has(entry.manifest.plugin_id) || !shown.has(entry.project_plugin_id)) continue;
    const contributionId = declaredStageContributionId(entry);
    if (!contributionId || drawn.has(contributionId)) continue;
    ids.push(contributionId);
    html.push(runtimeStage(state, store, entry, contributionId, options.model));
  }
  return { html, ids };
}

function runtimeStage(state: ProjectPluginState, store: LocalProjectDatabase, entry: CatalogEntry, contributionId: string,
  model: ProjectRuntimeStageOptions["model"]): string {
  const pluginId = entry.manifest.plugin_id;
  const contribution = state.platform?.supervisor.contribution(pluginId);
  if (!contribution) return unavailableStage(entry, projectPluginProblem(state, store, pluginId)?.reason ?? "插件没有在运行");
  const view = contribution.kind === "app" ? contribution.views?.find(item => item.descriptor.contribution_id === contributionId
    && item.descriptor.surfaces?.some(surface => surface.surface_id === "workbench")) : undefined;
  if (!view) return unavailableStage(entry, "插件页面未注册");
  try {
    return view.render({ contribution_id: contributionId, surface: "workbench", model: model(entry.project_plugin_id) });
  } catch (error) {
    hostLog.warn("plugins", "project_stage_failed", error, { plugin_id: pluginId });
    return unavailableStage(entry, "插件页面读取失败");
  }
}

function unavailableStage(entry: CatalogEntry, reason: string): string {
  return renderPluginStageShell({ surface: entry.project_plugin_id, label: entry.manifest.name, dataset: "project-plugin-unavailable",
    body: `<div class="mw-empty" role="alert"><h2>${escapeHtml(entry.manifest.name)} 暂不可用</h2><p>${escapeHtml(reason)}</p><p>请检查插件状态后重新打开。</p></div>` });
}
