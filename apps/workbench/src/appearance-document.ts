import { readFileSync } from "node:fs";
import type { UiAppearanceSelection, UiDefinitionRef, UiEnvironmentSnapshot } from "@molis-ai/molis-work-contracts/platform/ui";
import { LOOK_FADE_CLIENT_SCRIPT } from "@molis-ai/molis-work-design-system";
import { escapeHtml } from "@molis-ai/molis-work-plugin-sdk/ui";

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

export const appearanceJson = (value: unknown): string => JSON.stringify(value).replaceAll("<", "\\u003c");

/** The stylesheet follows the base sheet in the head and participates in the first paint. */
export function appearanceHead(current: WorkbenchAppearance | undefined): string {
  if (!current) return "";
  const ref = ({ id, revision }: UiDefinitionRef) => `${id}@${revision}`;
  const { skin, font } = current.snapshot;
  const scopes = { uiSkin: ref(skin), uiFont: ref(font.scheme), uiMono: ref(font.mono) };
  return `<script type="application/json" id="ui-environment" data-selection-revision="${current.selection_revision ?? ""}" data-selection="${escapeHtml(appearanceJson(current.selection))}" data-stylesheet="${escapeHtml(current.stylesheet ?? "")}">${appearanceJson(current.snapshot)}</script>`
    + `<script>Object.assign(document.documentElement.dataset,${appearanceJson(scopes)})</script>`
    + (current.stylesheet ? `<link rel="stylesheet" data-ui-appearance-sheet href="${escapeHtml(current.stylesheet)}">` : "");
}

const APPEARANCE_CLIENT_SCRIPT = LOOK_FADE_CLIENT_SCRIPT + readFileSync(new URL("../dist/appearance-client.js", import.meta.url), "utf8");

export function appearanceClientSource(): string {
  return APPEARANCE_CLIENT_SCRIPT;
}

export const appearanceClientTag = (current: WorkbenchAppearance | undefined): string => current ? `<script>${APPEARANCE_CLIENT_SCRIPT}</script>` : "";
