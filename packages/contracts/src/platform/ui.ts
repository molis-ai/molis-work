import type { ContractDescriptor } from "./package.js";

export const platformUiContract = {
  contractId: "io.molis.work.platform.ui.v1",
  kind: "platform",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "docs/platform/UI-PLATFORM.md",
} as const satisfies ContractDescriptor;

export type UiContributionKind = "primary-page" | "embedded" | "overlay" | "settings-page";

export interface UiSlotDescriptor {
  readonly slot_id: string;
  readonly version: number;
  readonly accepts: readonly string[];
}

export interface UiSurfaceDescriptor {
  readonly surface_id: string;
  readonly target_slot_id: string;
  readonly format: string;
}

export interface UiContributionDescriptor {
  readonly contribution_id: string;
  readonly plugin_id: string;
  readonly kind: UiContributionKind;
  readonly navigation_id?: string;
  readonly label: string;
  /** Surfaces this contribution can mount into Workbench-owned slots. */
  readonly surfaces?: readonly UiSurfaceDescriptor[];
  /** Slots this contribution opens for nested content from other Plugins. */
  readonly slots: readonly UiSlotDescriptor[];
}

export interface UiRenderRequest<TModel = unknown> {
  readonly contribution_id: string;
  readonly surface: string;
  readonly model: TModel;
}

export interface UiMountRequest<TModel = unknown> {
  readonly slot: UiSlotDescriptor;
  readonly contribution: UiRenderRequest<TModel>;
}

export interface UiMountResult {
  readonly slot_id: string;
  readonly contribution_id: string;
  readonly surface: string;
  readonly html: string;
}

export interface UiContribution<TModel = unknown> {
  readonly descriptor: UiContributionDescriptor;
  render(request: UiRenderRequest<TModel>): string;
}

export interface UiHostApi {
  register<TModel>(contribution: UiContribution<TModel>): void;
  unregister(contributionId: string): void;
  list(): readonly UiContributionDescriptor[];
  render<TModel>(request: UiRenderRequest<TModel>): string;
  mount<TModel>(request: UiMountRequest<TModel>): UiMountResult;
}

export interface WorkbenchDocumentRenderRequest {
  readonly lang: string;
  readonly title: string;
  readonly preamble_html?: string;
  readonly head_before_title_html?: string;
  readonly head_html?: string;
  readonly body_attributes?: Readonly<Record<string, string | boolean | null | undefined>>;
  readonly body_html: string;
}
