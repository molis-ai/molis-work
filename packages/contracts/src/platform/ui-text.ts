import type { SandboxSchema } from "./plugin-sandbox.js";
import type { UI_FORMAT_VERSIONS } from "./ui-files.js";

// A piece of interface text as data (specs/font-and-skin-system/a-section-contract.md §2), published through the `platform/ui`
// subpath. `plugin-manifest.ts` and the other contracts that only name the shape import these types from this file.

export const TEXT_NUMBER_STYLES = ["decimal", "percent", "compact"] as const;
export const TEXT_DATE_STYLES = ["date", "time", "datetime", "relative", "weekday", "weekday-narrow", "month-day", "weekday-month-day", "year-month"] as const;

export type TextNumberStyle = (typeof TEXT_NUMBER_STYLES)[number];
export type TextDateStyle = (typeof TEXT_DATE_STYLES)[number];
/** Format the same instant in its original zone. A date without a time keeps its calendar day. */
export interface TextDateOptions { readonly time_zone?: string }

/** One argument. It keeps the raw value, never formatted text: a change of language formats it again. */
export type TextArg =
  | { readonly name: string; readonly kind: "text"; readonly text: string }
  | { readonly name: string; readonly kind: "number"; readonly number: number; readonly style?: TextNumberStyle }
  | ({ readonly name: string; readonly kind: "date"; readonly at: string; readonly style: TextDateStyle } & TextDateOptions);

/** What a declaration, an action output or a content pack writes. It has no owner: a trusted identity is never read from input. */
export type TextRef =
  | { readonly key: string; readonly args?: readonly TextArg[]; readonly fallback?: string }
  | { readonly literal: string };

/** The shape once the platform has bound the owner from its trusted catalog: what composed surfaces, stored summaries and pages hold. */
export type OwnedTextRef =
  | { readonly owner: string; readonly key: string; readonly args?: readonly TextArg[]; readonly fallback?: string }
  | { readonly literal: string };

/** `owner` is a plugin_id or a platform owner's name; 200 is the longest plugin_id the Host's install actions take (a connector's slot actions take 160, and `parsePluginManifest` holds a Manifest to 200). */
export const TEXT_REF_LIMITS = { key: 120, args: 8, arg_name: 64, arg_text: 2000, arg_at: 40, arg_time_zone: 64, literal: 2000, fallback: 2000, owner: 200 } as const;

/** A language tag. The Manifest's and the language pack's parsers both take it from here. */
export const LOCALE_TAG = /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-[A-Z]{2})?$/;

/** Selected language metadata, as validated from the platform's registered resource. */
export interface UiLanguageDescriptor {
  readonly tag: string;
  readonly html_lang: string;
  readonly direction: "ltr" | "rtl";
  readonly intl: string;
  readonly name: string;
}

export interface UiLanguageCatalog {
  readonly format_version: typeof UI_FORMAT_VERSIONS.languages;
  readonly default: string;
  readonly languages: readonly UiLanguageDescriptor[];
}

/** A selected platform language is verified against the registered language catalog at its entry point. */
export type UiLanguageTag = string;

/** The metadata a granted frame needs; the platform's whole language catalog stays in the parent. */
export type UiFrameLanguage = Pick<UiLanguageDescriptor, "tag" | "html_lang" | "intl" | "direction">;

/** The languages a plugin has words in. Each has the package's `locales/<language>.json`. */
export interface PluginLocalesDeclaration {
  readonly default: string;
  readonly available: readonly string[];
}

const TEXT_ARG_SCHEMA: SandboxSchema = {
  type: "object", additionalProperties: false, required: ["name", "kind"],
  properties: {
    name: { type: "string", minLength: 1, maxLength: TEXT_REF_LIMITS.arg_name },
    kind: { type: "string", enum: ["text", "number", "date"] },
    text: { type: "string", maxLength: TEXT_REF_LIMITS.arg_text },
    number: { type: "number" },
    at: { type: "string", maxLength: TEXT_REF_LIMITS.arg_at },
    time_zone: { type: "string", minLength: 1, maxLength: TEXT_REF_LIMITS.arg_time_zone },
    style: { type: "string", enum: [...TEXT_NUMBER_STYLES, ...TEXT_DATE_STYLES] },
  },
};

/**
 * Flat fields, because `SandboxSchema` has no union, no map and no least property count: which fields go together is checked in code.
 * `additionalProperties: false` is what refuses an output that names its own `owner`. A sandboxed plugin's action output can use it too.
 */
export const TEXT_REF_SCHEMA: SandboxSchema = {
  type: "object", additionalProperties: false, required: [],
  properties: {
    key: { type: "string", minLength: 3, maxLength: TEXT_REF_LIMITS.key },
    args: { type: "array", maxItems: TEXT_REF_LIMITS.args, items: TEXT_ARG_SCHEMA },
    fallback: { type: "string", maxLength: TEXT_REF_LIMITS.fallback },
    literal: { type: "string", maxLength: TEXT_REF_LIMITS.literal },
  },
};

/** `owner` is optional because a bound `literal` has none. */
export const OWNED_TEXT_REF_SCHEMA: SandboxSchema = {
  ...TEXT_REF_SCHEMA,
  properties: { ...TEXT_REF_SCHEMA.properties, owner: { type: "string", minLength: 1, maxLength: TEXT_REF_LIMITS.owner } },
};

/** What business code writes as one argument. Spelled out by branch: `Omit<TextArg, "name">` flattens the union, and `{ kind: "number" }` without a value would pass. */
export type TextArgValue =
  | string
  | number // a plain number, not grouped
  | { readonly kind: "number"; readonly number: number; readonly style?: TextNumberStyle }
  | ({ readonly kind: "date"; readonly at: string; readonly style: TextDateStyle } & TextDateOptions);
export type TextArgs = Readonly<Record<string, TextArgValue>>;

export interface UiTextTool {
  /** The result can go straight into HTML text and attributes. */
  (key: string, args?: TextArgs): string;
  /** The same sentence with string arguments not escaped: for `textContent`, `new Option` and widgets that escape for themselves. */
  text(key: string, args?: TextArgs): string;
}

export interface UiSayOptions {
  /** Arguments the page adds to a stored reference, such as the title of "the same thing". */
  readonly extra?: readonly TextArg[];
  /** Platform services only: an explicit language, where `null` asks for the owner's default. Business code does not write it. */
  readonly locale?: string | null;
}
export interface UiSayTool {
  (ref: OwnedTextRef, options?: UiSayOptions): string;
  text(ref: OwnedTextRef, options?: UiSayOptions): string;
}

export interface UiFormatTool {
  date(at: string, style: TextDateStyle, options?: TextDateOptions): string;
  /** No style means `decimal`, which groups digits. */
  number(value: number, style?: TextNumberStyle): string;
}

/** One entry of a language pack. A plural has a sentence per form; `other` is required because every language can fall back to it. */
export type UiMessage =
  | string
  | { readonly plural_arg: string; readonly forms: Readonly<Partial<Record<Intl.LDMLPluralRule, string>>> & { readonly other: string } };

/** The context the platform installs. The SDK itself holds no language and no translation. */
export interface UiTextProvider {
  /** The current language; `null` where there is no page and the platform entry gave none. */
  locale(): string | null;
  /** The registered platform's Intl locale for a language tag, if it differs from that tag. */
  intlLocale?(tag: string): string | undefined;
  /** What to do when the language is `null`: production uses `"default"`, because throwing could take the whole Host down; development paths and tests use `"throw"`. */
  noContext(): "default" | "throw";
  /** For `t`: the full owner behind the first segment of a key. */
  ownerOfPrefix(prefix: string): string | null;
  /** `owner` is always the full owner: a plugin_id or a platform owner's name. */
  message(owner: string, key: string, locale: string): UiMessage | null;
  /** The owner's default language, for `locale: null` and for production with no language. */
  defaultLocale(owner: string): string | null;
  /** Records a word not found, a missing language or a bad date. */
  problem?(problem: { readonly code: string; readonly owner?: string; readonly key?: string; readonly locale?: string }): void;
  /** Only a browser gives this: remembers which sentence a result is, for a change of language in place. */
  produced?(output: string, ref: OwnedTextRef): void;
}
