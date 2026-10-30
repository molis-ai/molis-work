import { uiHostErrors } from "./ui-errors.js";
import type {
  OwnedUiContribution,
  UiContributionDescriptor,
  UiHostApi,
  UiMountRequest,
  UiMountResult,
  UiRenderRequest,
  UiSlotDescriptor,
} from "@molis-ai/molis-work-contracts/platform/ui";

export { createPluginUiClient } from "./plugin-client.js";
export { createSurfaceRenderer, createSurfaceRenderers } from "./surface-renderers.js";
export type { UiDeclaredMountHost, UiSurfaceCallModel } from "./surface-renderers.js";
export { UiViewRegistry } from "./view-registry.js";
export { UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT } from "./client-lifecycle.js";
export { shortCallId } from "./call-id.js";
export { createUiFailureView, createUiRequest, UI_REQUEST_CLIENT_SCRIPT } from "./request-client.js";
export type { UiFailureViewPorts, UiFetchInit, UiRequestPorts, UiTranslate, UiViewDocument, UiViewElement } from "./request-client.js";
export type { UiPlacedView, UiViewRegistryInput, UiViewRegistryManifest } from "./view-registry.js";



/**
 * Host-owned registry. It routes a surface to its owning Plugin but never
 * interprets Feed, Goal, Artifact, or other product state.
 */
export class UiHost implements UiHostApi {
  private readonly contributions = new Map<string, OwnedUiContribution<unknown>>();
  private readonly slots: ReadonlyMap<string, UiSlotDescriptor>;
  private readonly drawingAs: (owner: string, draw: () => string) => string;

  /**
   * `slots` are the places this host offers; `mountDeclared` puts a surface in the one its contribution names. `drawingAs` wraps
   * each contribution's rendering with the plugin that owns it (the platform filled that in from the Manifest), so the page can
   * apply that plugin's own settings to what the plugin draws and to nothing else.
   */
  constructor(options: { readonly slots?: readonly UiSlotDescriptor[]; readonly drawingAs?: (owner: string, draw: () => string) => string } = {}) {
    this.slots = new Map((options.slots ?? []).map((slot) => [slot.slot_id, slot]));
    this.drawingAs = options.drawingAs ?? ((_owner, draw) => draw());
  }

  register<TModel>(contribution: OwnedUiContribution<TModel>): void {
    const contributionId = contribution.descriptor.contribution_id.trim();
    if (!contributionId) {
      throw uiHostErrors.surface_invalid("UI Contribution 必须声明稳定 ID");
    }
    if (this.contributions.has(contributionId)) {
      throw uiHostErrors.contribution_conflict(`UI Contribution ${contributionId} 已注册`);
    }
    this.contributions.set(contributionId, contribution as OwnedUiContribution<unknown>);
  }

  unregister(contributionId: string): void {
    this.contributions.delete(contributionId);
  }

  list(): readonly UiContributionDescriptor[] {
    return [...this.contributions.values()]
      .map((contribution) => contribution.descriptor)
      .sort((left, right) => left.contribution_id.localeCompare(right.contribution_id));
  }

  render<TModel>(request: UiRenderRequest<TModel>): string {
    const contribution = this.contributions.get(request.contribution_id);
    if (!contribution) {
      throw uiHostErrors.contribution_not_found(`找不到 UI Contribution ${request.contribution_id}`);
    }
    return this.drawingAs(contribution.descriptor.plugin_id, () => contribution.render(request as UiRenderRequest<unknown>));
  }

  mount<TModel>(request: UiMountRequest<TModel>): UiMountResult {
    const contribution = this.contributions.get(request.contribution.contribution_id);
    if (!contribution) {
      throw uiHostErrors.contribution_not_found(`找不到 UI Contribution ${request.contribution.contribution_id}`);
    }
    const surface = contribution.descriptor.surfaces?.find(
      (candidate) => candidate.surface_id === request.contribution.surface,
    );
    if (!surface) {
      throw uiHostErrors.surface_invalid(`UI Contribution ${request.contribution.contribution_id} 未声明 surface ${request.contribution.surface}`);
    }
    if (
      surface.target_slot_id !== request.slot.slot_id ||
      !request.slot.accepts.includes(surface.format)
    ) {
      throw uiHostErrors.slot_incompatible(`surface ${surface.surface_id} 不能挂载到 slot ${request.slot.slot_id}`);
    }
    return {
      slot_id: request.slot.slot_id,
      contribution_id: contribution.descriptor.contribution_id,
      surface: surface.surface_id,
      html: this.drawingAs(contribution.descriptor.plugin_id, () => contribution.render(request.contribution as UiRenderRequest<unknown>)),
    };
  }

  /**
   * W5-06: mount a surface in the slot its contribution declares (`target_slot_id`), so a caller names only the
   * contribution and surface and keeps no surface→slot table. The same checks as `mount` then run.
   */
  mountDeclared<TModel>(request: UiRenderRequest<TModel>): UiMountResult {
    const contribution = this.contributions.get(request.contribution_id);
    if (!contribution) {
      throw uiHostErrors.contribution_not_found(`找不到 UI Contribution ${request.contribution_id}`);
    }
    const surface = contribution.descriptor.surfaces?.find((candidate) => candidate.surface_id === request.surface);
    if (!surface) {
      throw uiHostErrors.surface_invalid(`UI Contribution ${request.contribution_id} 未声明 surface ${request.surface}`);
    }
    const slot = this.slots.get(surface.target_slot_id);
    if (!slot) {
      throw uiHostErrors.slot_incompatible(`surface ${surface.surface_id} 声明的 slot ${surface.target_slot_id} 不在这个宿主上`);
    }
    return this.mount({ slot, contribution: request });
  }
}
