import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import type { UiViewDeclaration } from "@molis-ai/molis-work-contracts/platform/ui";
import { BUILTIN_PLUGIN_CATALOG } from "./builtin-plugins.js";
import { renderWorkbenchContribution, WORKBENCH_UI_SLOTS } from "./ui-composition.js";

/** The view that opens a plugin's stage: its `stage` view, else its directory entry. */
export function stageOpeningView(manifest: PluginManifest): UiViewDeclaration | undefined {
  const views = manifest.ui?.views ?? [];
  return views.find(view => view.slot === "stage") ?? views.find(view => view.slot === "navigator");
}

/** The contribution that draws a plugin's stage; a host path that draws the stage itself reports this id. */
export function stageContributionId(manifest: PluginManifest): string | undefined {
  const view = stageOpeningView(manifest);
  return view ? view.contribution_id ?? `${manifest.plugin_id}.${view.view_id}` : undefined;
}

/**
 * The contribution that draws a plugin's stage in the main slot: the view that opens the stage names it, and its `workbench`
 * surface declares the main slot. Undefined when the plugin has no such view or surface, so it has no declared stage.
 */
export function declaredStageContributionId(entry: PluginRegistration): string | undefined {
  const contributionId = stageContributionId(entry.manifest);
  const contribution = entry.workbench.contributions.find(item => item.descriptor.contribution_id === contributionId);
  const surface = contribution?.descriptor.surfaces?.find(item => item.surface_id === "workbench");
  return surface?.target_slot_id === WORKBENCH_UI_SLOTS.main.slot_id ? contributionId : undefined;
}

export interface DeclaredStageOptions {
  /** The plugins this project shows. */
  enabled: readonly string[];
  /** Contribution ids a host stage path has already drawn (`plugin_stage_ids`). */
  rendered: readonly string[];
  /** The model a plugin's stage is drawn with. */
  model(projectPluginId: string): unknown;
}

/**
 * Every shown plugin's stage, from its Manifest (W5-06, PRR-12): the view that opens the stage names the contribution, and the
 * contribution's `workbench` surface is mounted in the slot it declares, which must be the main slot. No per-plugin row and no
 * host branch; a plugin without such a view or surface has no stage here, and one a host path has drawn is not drawn twice.
 */
export function renderDeclaredStages({ enabled, rendered, model }: DeclaredStageOptions): string[] {
  const shown = new Set(enabled), already = new Set(rendered);
  return BUILTIN_PLUGIN_CATALOG.flatMap(entry => {
    if (!shown.has(entry.project_plugin_id)) return [];
    const contributionId = declaredStageContributionId(entry);
    if (!contributionId || already.has(contributionId)) return [];
    return [renderWorkbenchContribution(contributionId, "workbench", model(entry.project_plugin_id))];
  });
}
