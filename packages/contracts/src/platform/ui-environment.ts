import type { UiDefinitionRef, UiTextDirection } from "./ui-files.js";

// What is on show for one page (specs/font-and-skin-system/a-section-contract.md §4), published through the `platform/ui` subpath.
//
// Precedence is a fixed chain of four layers, and the SDK's resolver is what applies it: the common spec (`locked`, `follows`), then the chosen
// skin, then the chosen or recommended font, then the entry's light or dark, density, language and hard accessibility rules. One value of a
// skin resolves from its own value, then the role `follows` points at, then the baseline skin. Language changes only text and glyph
// fallback, never which skin or font is chosen.

export interface UiDevicePreferences {
  readonly theme: "light" | "dark" | "system";
  readonly resolved_theme: "light" | "dark";
  readonly density: "standard" | "compact";
  readonly terminal_theme: "auto" | "light" | "dark";
  readonly resolved_terminal_theme: "light" | "dark";
  readonly reduced_motion: boolean;
}

export interface UiEnvironmentProblem { readonly code: string; readonly subject: string; readonly detail?: string }

/**
 * Identities and problems only, never token values or translations: this goes into the first-screen HTML and the iframe configuration,
 * where bytes would move the CSS and the dictionaries to a place nothing measures.
 */
export interface UiEnvironmentSnapshot {
  /** Built from the references below and not from `device`: the same choices give the same value. */
  readonly revision: string;
  readonly spec: UiDefinitionRef;
  readonly skin: UiDefinitionRef;
  readonly font: { readonly scheme: UiDefinitionRef; readonly policy: "follow-skin" | "pinned"; readonly mono: UiDefinitionRef };
  readonly locale: {
    readonly tag: string;
    readonly direction: UiTextDirection;
    readonly source: "explicit" | "system" | "default";
    /** The full tag for `Intl`: en-US, zh-CN. */
    readonly formatting: string;
  };
  /** A server cannot read it: `null` until the browser merges it in. */
  readonly device: UiDevicePreferences | null;
  readonly problems: readonly UiEnvironmentProblem[];
}
