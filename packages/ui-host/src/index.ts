import type {
  UiContribution,
  UiContributionDescriptor,
  UiHostApi,
  UiMountRequest,
  UiMountResult,
  UiRenderRequest,
} from "@molis-ai/molis-work-contracts/platform/ui";

export { createPluginUiClient, PluginUiAccessError } from "./plugin-client.js";
export { UiViewRegistry } from "./view-registry.js";
export type { UiPlacedView, UiViewRegistryInput } from "./view-registry.js";

export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-ui-host",
  packagePath: "packages/ui-host",
  kind: "foundation",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/platform/ui",
  migrationGoals: ["goal-reorg-f2", "goal-reorg-fd4", "goal-reorg-ap3"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["ui.contribution.registry.v1", "ui.surface.render.v1", "ui.slot.mount.v1"],
} as const;

export type MolisWorkPackageDescriptor = typeof packageDescriptor;

export class UiContributionError extends Error {
  constructor(
    readonly code:
      | "ui_contribution_conflict"
      | "ui_contribution_not_found"
      | "ui_slot_incompatible"
      | "ui_surface_invalid",
    message: string,
  ) {
    super(message);
    this.name = "UiContributionError";
  }
}

/**
 * Host-owned registry. It routes a surface to its owning Plugin but never
 * interprets Feed, Goal, Artifact, or other product state.
 */
export class UiHost implements UiHostApi {
  private readonly contributions = new Map<string, UiContribution<unknown>>();

  register<TModel>(contribution: UiContribution<TModel>): void {
    const contributionId = contribution.descriptor.contribution_id.trim();
    if (!contributionId) {
      throw new UiContributionError("ui_surface_invalid", "UI Contribution 必须声明稳定 ID");
    }
    if (this.contributions.has(contributionId)) {
      throw new UiContributionError(
        "ui_contribution_conflict",
        `UI Contribution ${contributionId} 已注册`,
      );
    }
    this.contributions.set(contributionId, contribution as UiContribution<unknown>);
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
      throw new UiContributionError(
        "ui_contribution_not_found",
        `找不到 UI Contribution ${request.contribution_id}`,
      );
    }
    return contribution.render(request as UiRenderRequest<unknown>);
  }

  mount<TModel>(request: UiMountRequest<TModel>): UiMountResult {
    const contribution = this.contributions.get(request.contribution.contribution_id);
    if (!contribution) {
      throw new UiContributionError(
        "ui_contribution_not_found",
        `找不到 UI Contribution ${request.contribution.contribution_id}`,
      );
    }
    const surface = contribution.descriptor.surfaces?.find(
      (candidate) => candidate.surface_id === request.contribution.surface,
    );
    if (!surface) {
      throw new UiContributionError(
        "ui_surface_invalid",
        `UI Contribution ${request.contribution.contribution_id} 未声明 surface ${request.contribution.surface}`,
      );
    }
    if (
      surface.target_slot_id !== request.slot.slot_id ||
      !request.slot.accepts.includes(surface.format)
    ) {
      throw new UiContributionError(
        "ui_slot_incompatible",
        `surface ${surface.surface_id} 不能挂载到 slot ${request.slot.slot_id}`,
      );
    }
    return {
      slot_id: request.slot.slot_id,
      contribution_id: contribution.descriptor.contribution_id,
      surface: surface.surface_id,
      html: contribution.render(request.contribution as UiRenderRequest<unknown>),
    };
  }
}
