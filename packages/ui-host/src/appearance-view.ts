import type { UiAppearanceSelection, UiDefinitionRef, UiEnvironmentSnapshot } from "@molis-ai/molis-work-contracts/platform/ui";

export interface WorkbenchAppearance {
  readonly snapshot: UiEnvironmentSnapshot;
  readonly selection_revision: number | null;
  readonly selection: UiAppearanceSelection;
  readonly stylesheet: string | null;
}

interface NamedAppearance { readonly ref: UiDefinitionRef; readonly name: string }
export interface WorkbenchAppearanceChoices {
  readonly baseline: { readonly skin: UiDefinitionRef; readonly font: UiDefinitionRef };
  readonly skins: readonly (NamedAppearance & { readonly recommended_font: UiDefinitionRef })[];
  readonly fonts: readonly NamedAppearance[];
  readonly stylesheet: string;
}

export interface WorkbenchAppearancePorts {
  current(): WorkbenchAppearance;
  choices(): WorkbenchAppearanceChoices;
}
