import type { ContractDescriptor } from "./package.js";

export const platformUiContract = {
  contractId: "io.molis.work.platform.ui.v1",
  kind: "platform",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "docs/platform/UI-PLATFORM.md",
} as const satisfies ContractDescriptor;

export type UiContributionKind = "primary-page" | "embedded" | "overlay" | "settings-page";

/**
 * Where a Plugin view is placed. The Host owns the shell; a view declares the
 * region it belongs to and never positions itself.
 *
 * These are exactly the regions the Workbench has today: the directory column,
 * the tabbed work area, the global settings directory, and the personal island
 * above the project card. A new region is a shell change first and a slot
 * second, never a slot a Plugin can target before anywhere exists to put it.
 */
export const UI_VIEW_SLOTS = ["navigator", "stage", "settings", "island"] as const;

export type UiViewSlot = (typeof UI_VIEW_SLOTS)[number];

/** Placement declaration. Rendering stays with `UiContribution.render`. */
export interface UiViewDeclaration {
  readonly view_id: string;
  readonly slot: UiViewSlot;
  readonly title: string;
  /** Contribution that renders this view. Defaults to `<plugin_id>.<view_id>`. */
  readonly contribution_id?: string;
  /**
   * Icon name from the Host's own catalog. The Host resolves it and falls back
   * to a default when it does not know the name; a Plugin never ships artwork
   * into the shell.
   */
  readonly icon?: string;
  /** The view can host bounded objects opened from elsewhere. */
  readonly accepts_objects?: boolean;
  /** Lower sorts earlier inside its slot. Ties fall back to view_id order. */
  readonly order?: number;
}

export const UI_COMMAND_INPUT_KINDS = ["current", "object", "agent-session", "artifacts"] as const;

export type UiCommandInputKind = (typeof UI_COMMAND_INPUT_KINDS)[number];

export interface UiCommandDeclaration {
  readonly command_id: string;
  readonly title: string;
  readonly input_kinds: readonly UiCommandInputKind[];
  readonly opens_view_id: string;
}

export type UiCommandAvailability =
  | { readonly available: true }
  | { readonly available: false; readonly reason: string };

export interface UiViewObjectRef {
  readonly view_id: string;
  readonly object_id: string;
}

export interface UiOpenedObjectView {
  readonly ref: UiViewObjectRef;
  readonly title: string;
}

/** One command as the Host presents it, with the owning Plugin resolved. */
export interface UiWorkspaceCommand {
  readonly plugin_id: string;
  readonly plugin_title: string;
  readonly declaration: UiCommandDeclaration;
  readonly availability: UiCommandAvailability;
}

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
