import type { TextRef, UiMessage } from "./ui-text.js";

// The files behind skins, font schemes and language packs, and the registry of what ships with the product
// (specs/font-and-skin-system/a-section-contract.md §3), published through the `platform/ui` subpath. These types say what a parser
// hands back; the parsers themselves, and every refusal, are the plugin SDK's. No value here is CSS text: the fields hold structure,
// and text positions hold names and translations that are only ever output as text.

/** The current format of each file. A parser refuses any other value; these JSON files are not `tooling/versions.json` carriers. */
export const UI_FORMAT_VERSIONS = {
  spec: /* @version format.ui.spec */ 1,
  skin: /* @version format.ui.skin */ 1,
  font: /* @version format.ui.font */ 1,
  locale: /* @version format.ui.locale */ 1,
  registry: /* @version format.ui.registry */ 1,
} as const;

/** Bytes per file (256 KiB, 64 KiB, 1 MiB), compared before parsing, and the deepest nesting a file may have. Plain numbers so the API snapshot shows them. */
export const UI_FILE_LIMITS = { spec: 262_144, skin: 65_536, font: 65_536, locale: 1_048_576, registry: 65_536, depth: 12 } as const;

/** The shapes of strings the files hold. `color` keeps a file's own letter case: a skin writes back byte for byte what it replaced. */
export const UI_FILE_PATTERNS = {
  definition_id: /^[a-z][a-z0-9-]{0,63}$/,
  color: /^(?:#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?|transparent)$/,
  system_font: /^[A-Za-z0-9 -]+$/,
} as const;

export const UI_ROLE_TYPES = ["color", "shadow", "length", "duration", "easing", "stroke", "number"] as const;
export const UI_ROLE_VARIES_BY = ["theme", "none", "terminal"] as const;
export const UI_FONT_ROLE_NAMES = ["body", "control", "title", "display", "code"] as const;
/** Only files with a path inside a package that ship with the product: first-screen styles and scripts have their own list. */
export const UI_RESOURCE_KINDS = ["spec", "skin", "font-scheme", "locale", "font", "asset"] as const;
export const UI_RESOURCE_LOADS = [
  "startup", // read once when the process starts, never sent to a browser
  "first-screen", // sent with the first screen of every page
  "fallback", // downloaded when a glyph is missing (a fallback font with a unicode-range)
  "on-open", // sent when a surface opens (a plugin's words)
  "on-select", // sent when this scheme is chosen
  "tool", // only for a development tool page
] as const;

/** The exact reference to a definition. `format_version` is the file's shape; this pair is which definition it holds. */
export interface UiDefinitionRef { readonly id: string; readonly revision: number }

/** One thing wrong with a file. Author tools and the platform show the same one, so `fix` says what to do next. */
export interface UiFileProblem {
  readonly file: string;
  readonly path: string;
  readonly code: string;
  readonly reason: string;
  readonly fix: string;
  readonly line?: number;
  readonly column?: number;
}
export type UiFileResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly problems: readonly UiFileProblem[] };

export type UiRgba = readonly [red: number, green: number, blue: number, alpha: number];

export interface UiShadowLayer {
  readonly x: number;
  readonly y: number;
  readonly blur: number;
  readonly spread?: number;
  readonly color: string | { readonly rgba: UiRgba } | { readonly role: string };
}

export type UiTokenValue =
  | string // `UI_FILE_PATTERNS.color`
  | { readonly rgba: UiRgba } // rgba(255, 255, 255, .05)
  | { readonly role: string; readonly fallback?: string } // var(--accent), var(--hue-green-fill, #4cb782)
  | { readonly mix: { readonly role: string; readonly percent: number; readonly with: "transparent" } } // color-mix(in srgb, var(--ink) 7%, transparent)
  | { readonly shadow: readonly UiShadowLayer[] }
  | { readonly px: number }
  | { readonly ms: number }
  | { readonly number: number }
  | { readonly bezier: readonly [number, number, number, number] }
  | { readonly stroke: { readonly width_px: number; readonly style: "solid"; readonly role: string } };

export type UiTokenMap = Readonly<Record<string, UiTokenValue>>;

export interface UiRoleSpec {
  /** Without `--`: `--name` is the public token name. */
  readonly name: string;
  readonly type: (typeof UI_ROLE_TYPES)[number];
  readonly varies_by: (typeof UI_ROLE_VARIES_BY)[number];
  /** The role a skin follows when it leaves this one out. */
  readonly follows?: string;
  /** A later style layer binds this role to that one, so only the baseline skin may write it: elsewhere the value would silently do nothing. */
  readonly alias_of?: string;
  /** Present means no skin may set this role. */
  readonly locked?: UiTokenValue;
}
export interface UiTokenGroup { readonly group: string; readonly roles: readonly UiRoleSpec[] }

export type UiFontRoleName = (typeof UI_FONT_ROLE_NAMES)[number];
export interface UiFontRoleSpec {
  readonly name: UiFontRoleName;
  readonly tokens: { readonly family?: string; readonly weight?: string; readonly tracking?: string };
}

/** `resources/ui-spec.json`: every role, its type and what may vary. */
export interface UiSpecFile {
  readonly format_version: typeof UI_FORMAT_VERSIONS.spec;
  readonly id: string;
  readonly revision: number;
  /** A left-out role fills from this one baseline: there is no chain of skins inheriting from skins. */
  readonly baseline_skin: UiDefinitionRef;
  readonly baseline_font: UiDefinitionRef;
  /** The order here is the output order. */
  readonly groups: readonly UiTokenGroup[];
  readonly font_roles: readonly UiFontRoleSpec[];
}

export interface UiSkinFile {
  readonly format_version: typeof UI_FORMAT_VERSIONS.skin;
  readonly id: string;
  readonly revision: number;
  readonly spec: UiDefinitionRef;
  /** Built-in skins write a key, a skin a person named writes a literal. */
  readonly name: TextRef;
  readonly recommended_font: UiDefinitionRef;
  readonly light: UiTokenMap;
  readonly dark: UiTokenMap;
  readonly shared: UiTokenMap;
  /** The third axis: `unset` is `:root` with no terminal theme chosen, the other two follow `data-resolved-terminal-theme`. */
  readonly terminal: { readonly unset?: UiTokenMap; readonly light?: UiTokenMap; readonly dark?: UiTokenMap };
}

/** `system` takes only ASCII letters, digits, spaces and hyphens (`UI_FILE_PATTERNS.system_font`); `face` names a `UiFontFace.family`. */
export type UiFontFamily = { readonly system: string } | { readonly face: string };
export interface UiFontRole {
  readonly families?: readonly UiFontFamily[];
  readonly weight?: number;
  readonly tracking_em?: number;
}
export interface UiFontFace {
  readonly family: string;
  readonly weight: number | readonly [number, number];
  readonly unicode_range: readonly string[];
  /** The id of a registry row, never a path. */
  readonly resource: string;
}
export interface UiFontSchemeFile {
  readonly format_version: typeof UI_FORMAT_VERSIONS.font;
  readonly id: string;
  readonly revision: number;
  readonly name: TextRef;
  readonly roles: Readonly<Record<UiFontRoleName, UiFontRole>>;
  readonly faces: readonly UiFontFace[];
}

export type UiTextDirection = "ltr" | "rtl";

/** One owner's words in one language. */
export interface UiLocalePack {
  readonly format_version: typeof UI_FORMAT_VERSIONS.locale;
  /** The file's own statement, only compared with the owner from the trusted catalog and used for import and export. It grants no identity. */
  readonly owner: string;
  /** `LOCALE_TAG`. */
  readonly locale: string;
  /** Left out means `ltr`. */
  readonly direction?: UiTextDirection;
  /** Not written in a file that ships in a package: only a managed copy in a Home increments it. */
  readonly revision?: number;
  readonly messages: Readonly<Record<string, UiMessage>>;
}

interface UiResourceFields {
  /** What font schemes and the budget refer to, such as `font.inter-latin-variable`. */
  readonly id: string;
  readonly owner: string;
  readonly package: string;
  /** Relative to the package; the language directory for a `locale`. */
  readonly path: string;
  readonly load: (typeof UI_RESOURCE_LOADS)[number];
  /** The path of a file served as is. `fontFaceRules` writes its `src: url(…)` from this. */
  readonly route?: string;
}
export interface UiResourceLicense { readonly spdx: string; readonly source: string; readonly notice_path?: string }
export type UiResourceKind = (typeof UI_RESOURCE_KINDS)[number];
/**
 * Holds no byte count, and no digest of our own JSON: those are second copies of a fact of the file, and every pull request that changes a
 * word would collide on the same row. A third party's binary is the exception, where a replaced file has to show.
 */
export type UiResourceRow =
  | (UiResourceFields & { readonly kind: Exclude<UiResourceKind, "font" | "asset"> })
  | (UiResourceFields & { readonly kind: "font" | "asset"; readonly sha256: string; readonly license: UiResourceLicense });
export interface UiResourceRegistry {
  readonly format_version: typeof UI_FORMAT_VERSIONS.registry;
  readonly resources: readonly UiResourceRow[];
}
