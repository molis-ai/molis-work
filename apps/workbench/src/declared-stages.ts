import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import type { StagePagePresentation, UiContribution, UiRenderRequest, UiViewDeclaration } from "@molis-ai/molis-work-contracts/platform/ui";
import { BUILTIN_PLUGIN_CATALOG } from "./builtin-plugins.js";
import { renderWorkbenchContribution, WORKBENCH_UI_SLOTS } from "./ui-composition.js";

/** The contribution a Manifest view names, or its existing plugin-and-view default. Kept inside the workbench package. */
export function viewContributionId(manifest: PluginManifest, view: UiViewDeclaration): string {
  return view.contribution_id ?? `${manifest.plugin_id}.${view.view_id}`;
}

/** The view that opens a plugin's stage: its `stage` view, else its directory entry. */
export function stageOpeningView(manifest: PluginManifest): UiViewDeclaration | undefined {
  const views = manifest.ui?.views ?? [];
  return views.find(view => view.slot === "stage") ?? views.find(view => view.slot === "navigator");
}

/**
 * The read action a plugin's stage is drawn from: the Manifest's own action its stage-opening view names (`stage_data`, T-133). The SDK
 * has checked it is a query for the person that only reads; the Host calls it by this definition and knows no plugin by name for it.
 */
export function stageDataAction(manifest: PluginManifest): ActionDefinition | undefined {
  const declared = stageOpeningView(manifest)?.stage_data?.action;
  return declared ? manifest.actions?.find(item => item.capability_id === declared) : undefined;
}

/** The request parameters the stage-opening view names in `stage_data.input` (T-116): the only part of a request its stage is given. */
export function stageDataInput(manifest: PluginManifest): readonly string[] | undefined {
  return stageOpeningView(manifest)?.stage_data?.input;
}

/** The contribution that draws a plugin's stage; a host path that draws the stage itself reports this id. */
export function stageContributionId(manifest: PluginManifest): string | undefined {
  const view = stageOpeningView(manifest);
  return view ? viewContributionId(manifest, view) : undefined;
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
  /** Trusted owner of the matched page route, not a value from the request. */
  page_owner?: string;
}

/** A successful page owner's main content and its finite presentation, ready for the shell's existing anchors. */
export interface RenderedStagePage {
  readonly owner: string;
  readonly html: string;
  readonly parts: StagePagePresentation;
  readonly before_global_search: string;
  readonly after_global_search: string;
}

/** A foreign embedded owner never inherits the enclosing page's publisher. */
export function withoutPagePublisher(model: unknown): unknown {
  if (!model || typeof model !== "object" || !("page" in model)) return model;
  const { page: _page, ...own } = model;
  return own;
}

/** Draw once, then adopt a page publication only if the main surface and same-contribution overlays all succeeded. */
export function renderStagePage(contribution: UiContribution, model: unknown, owner: string, pageOwner: boolean,
  draw: (request: UiRenderRequest) => string = request => contribution.render(request)): { html: string; page?: RenderedStagePage } {
  if (!contribution.descriptor.surfaces?.some(surface => surface.surface_id === "workbench"
    && surface.target_slot_id === "workbench.main" && surface.format === "declarative-html")) {
    throw new Error(`Stage main surface is not declared by ${contribution.descriptor.contribution_id}`);
  }
  const own = withoutPagePublisher(model);
  let active = pageOwner, parts: StagePagePresentation | undefined;
  const page = { publish(value: StagePagePresentation) {
    if (active) parts = { ...value, body_attributes: value.body_attributes ? { ...value.body_attributes } : undefined,
      workspace_classes: value.workspace_classes ? [...value.workspace_classes] : undefined,
      bootstrap: value.bootstrap ? { id: value.bootstrap.id, value: structuredClone(value.bootstrap.value) } : undefined,
      overlays: value.overlays ? { ...value.overlays } : undefined };
  } };
  const scoped = pageOwner && own && typeof own === "object" ? { ...own, page } : own;
  const contribution_id = contribution.descriptor.contribution_id;
  let html: string;
  try { html = draw({ contribution_id, surface: "workbench", model: scoped }); }
  finally { active = false; }
  if (!parts) return { html };
  const overlay = (surface: string | undefined): string => {
    if (!surface) return "";
    if (!contribution.descriptor.surfaces?.some(item => item.surface_id === surface && item.target_slot_id === "workbench.overlay" && item.format === "declarative-html")) {
      throw new Error(`Page overlay is not declared by ${contribution_id}: ${surface}`);
    }
    return draw({ contribution_id, surface, model: own });
  };
  return { html, page: { owner, html, parts,
    before_global_search: overlay(parts.overlays?.before_global_search),
    after_global_search: overlay(parts.overlays?.after_global_search) } };
}

/**
 * Every shown plugin's stage, from its Manifest (W5-06, PRR-12): the view that opens the stage names the contribution, and the
 * contribution's `workbench` surface is mounted in the slot it declares, which must be the main slot. No per-plugin row and no
 * host branch; a plugin without such a view or surface has no stage here, and one a host path has drawn is not drawn twice.
 */
export function renderDeclaredStages({ enabled, rendered, model, page_owner }: DeclaredStageOptions): { html: string[]; page?: RenderedStagePage } {
  const shown = new Set(enabled), already = new Set(rendered);
  let page: RenderedStagePage | undefined;
  const html = BUILTIN_PLUGIN_CATALOG.flatMap(entry => {
    if (!shown.has(entry.project_plugin_id)) return [];
    const contributionId = declaredStageContributionId(entry);
    if (!contributionId || already.has(contributionId)) return [];
    const contribution = entry.workbench.contributions.find(item => item.descriptor.contribution_id === contributionId)!;
    const result = renderStagePage(contribution, model(entry.project_plugin_id), entry.project_plugin_id, page_owner === entry.manifest.plugin_id,
      request => renderWorkbenchContribution(request.contribution_id, request.surface, request.model));
    if (result.page) { page = result.page; return []; }
    return [result.html];
  });
  return { html, ...(page ? { page } : {}) };
}
