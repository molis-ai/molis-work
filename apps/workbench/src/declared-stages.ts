import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import type { StagePagePresentation, UiContribution, UiRenderRequest, UiSurfaceDescriptor, UiViewDeclaration } from "@molis-ai/molis-work-contracts/platform/ui";
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

/** One object's read is declared independently of the stage read, but belongs to the same Manifest. */
export function stageObjectAction(manifest: PluginManifest): ActionDefinition | undefined {
  const declared = stageOpeningView(manifest)?.stage_data?.object_action;
  return declared ? manifest.actions?.find(item => item.capability_id === declared) : undefined;
}

/** Finite automatic mounts: explicit main surfaces, then directory/overlay surfaces in descriptor order. */
export function stageSurfaceDescriptors(manifest: PluginManifest, contribution: UiContribution): readonly UiSurfaceDescriptor[] {
  const names = stageOpeningView(manifest)?.stage_surfaces ?? ["workbench"];
  const declared = contribution.descriptor.surfaces ?? [];
  const main = names.map(name => {
    const found = declared.find(surface => surface.surface_id === name && surface.target_slot_id === "workbench.main" && surface.format === "declarative-html");
    if (!found) throw new Error(`Stage main surface is not declared by ${contribution.descriptor.contribution_id}: ${name}`);
    return found;
  });
  const seen = new Set(main.map(surface => surface.surface_id));
  return [...main, ...declared.filter(surface => ["workbench.directory", "workbench.overlay"].includes(surface.target_slot_id)
    && surface.format === "declarative-html" && !seen.has(surface.surface_id))];
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
  /** Exact contribution/surface pairs already drawn by a Host path. */
  rendered: ReadonlyArray<Pick<UiRenderRequest, "contribution_id" | "surface">>;
  unavailable?: readonly string[];
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
  draw: (request: UiRenderRequest) => string = request => contribution.render(request),
  options?: { manifest?: PluginManifest; rendered?: ReadonlyArray<Pick<UiRenderRequest, "contribution_id" | "surface">> }) {
  const contribution_id = contribution.descriptor.contribution_id;
  const selected = options?.manifest ? stageSurfaceDescriptors(options.manifest, contribution)
    : (contribution.descriptor.surfaces ?? []).filter(surface => surface.surface_id === "workbench");
  if (!selected.some(surface => surface.surface_id === "workbench" && surface.target_slot_id === "workbench.main" && surface.format === "declarative-html")) {
    throw new Error(`Stage main surface is not declared by ${contribution_id}`);
  }
  const prior = new Set((options?.rendered ?? []).filter(item => item.contribution_id === contribution_id).map(item => item.surface));
  const surfaces: Array<Pick<UiRenderRequest, "contribution_id" | "surface">> = [];
  const own = withoutPagePublisher(model);
  let active = false, parts: StagePagePresentation | undefined;
  const page = { publish(value: StagePagePresentation) {
    if (active) parts = { ...value, body_attributes: value.body_attributes ? { ...value.body_attributes } : undefined,
      workspace_classes: value.workspace_classes ? [...value.workspace_classes] : undefined,
      bootstrap: value.bootstrap ? { id: value.bootstrap.id, value: structuredClone(value.bootstrap.value) } : undefined,
      overlays: value.overlays ? { ...value.overlays } : undefined };
  } };
  const scoped = pageOwner && own && typeof own === "object" ? { ...own, page } : own;
  const once = (surface: string, publishing = false): string => {
    if (prior.has(surface)) return "";
    prior.add(surface); active = publishing;
    try {
      const html = draw({ contribution_id, surface, model: publishing ? scoped : own });
      surfaces.push({ contribution_id, surface });
      return html;
    } finally { active = false; }
  };
  const main: string[] = [];
  let mainPage = "";
  for (const surface of selected.filter(item => item.target_slot_id === "workbench.main")) {
    const html = once(surface.surface_id, pageOwner && surface.surface_id === "workbench");
    if (surface.surface_id === "workbench") mainPage = html;
    else main.push(html);
  }
  const overlay = (surface: string | undefined): string => {
    if (!surface) return "";
    if (!contribution.descriptor.surfaces?.some(item => item.surface_id === surface && item.target_slot_id === "workbench.overlay" && item.format === "declarative-html")) {
      throw new Error(`Page overlay is not declared by ${contribution_id}: ${surface}`);
    }
    return once(surface);
  };
  let renderedPage: RenderedStagePage | undefined;
  if (parts) renderedPage = { owner, html: mainPage, parts,
    before_global_search: overlay(parts.overlays?.before_global_search), after_global_search: overlay(parts.overlays?.after_global_search) };
  const panels = selected.filter(item => item.target_slot_id === "workbench.directory").map(item => once(item.surface_id)).join("");
  const overlays = selected.filter(item => item.target_slot_id === "workbench.overlay").map(item => once(item.surface_id)).join("");
  return { html: (renderedPage ? main : [mainPage, ...main]).join(""), panels, overlays, surfaces, ...(renderedPage ? { page: renderedPage } : {}) };
}

/**
 * Every shown plugin's stage, from its Manifest (W5-06, PRR-12): the view that opens the stage names the contribution, and the
 * contribution's `workbench` surface is mounted in the slot it declares, which must be the main slot. No per-plugin row and no
 * host branch; a plugin without such a view or surface has no stage here, and one a host path has drawn is not drawn twice.
 */
export function renderDeclaredStages({ enabled, rendered, model, page_owner, unavailable = [] }: DeclaredStageOptions) {
  const shown = new Set(enabled), refused = new Set(unavailable);
  let page: RenderedStagePage | undefined;
  const panels: Record<string, string> = {}, overlays: string[] = [], surfaces: Array<Pick<UiRenderRequest, "contribution_id" | "surface">> = [];
  const html = BUILTIN_PLUGIN_CATALOG.flatMap(entry => {
    if (!shown.has(entry.project_plugin_id) || refused.has(entry.project_plugin_id)) return [];
    const contributionId = declaredStageContributionId(entry);
    if (!contributionId) return [];
    const contribution = entry.workbench.contributions.find(item => item.descriptor.contribution_id === contributionId)!;
    const selected = stageSurfaceDescriptors(entry.manifest, contribution);
    if (selected.every(item => rendered.some(prior => prior.contribution_id === contributionId && prior.surface === item.surface_id))) return [];
    const result = renderStagePage(contribution, model(entry.project_plugin_id), entry.project_plugin_id, page_owner === entry.manifest.plugin_id,
      request => renderWorkbenchContribution(request.contribution_id, request.surface, request.model), { manifest: entry.manifest, rendered });
    if (result.page) page = result.page;
    if (result.panels) panels[entry.project_plugin_id] = result.panels;
    if (result.overlays) overlays.push(result.overlays);
    surfaces.push(...result.surfaces);
    return result.html ? [result.html] : [];
  });
  return { html, panels, overlays, surfaces, ...(page ? { page } : {}) };
}
