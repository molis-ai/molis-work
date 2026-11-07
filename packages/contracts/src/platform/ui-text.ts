import type { SandboxSchema } from "./plugin-sandbox.js";

// A piece of interface text as data (specs/font-and-skin-system/a-section-contract.md §2), published through the `platform/ui`
// subpath. `plugin-manifest.ts` and the other contracts that only name the shape import these types from this file.

const NUMBER_STYLES = ["decimal", "percent", "compact"] as const;
const DATE_STYLES = ["date", "time", "datetime", "relative", "weekday", "weekday-narrow", "month-day", "weekday-month-day", "year-month"] as const;

export type TextDateStyle = (typeof DATE_STYLES)[number];

/** One argument. It keeps the raw value, never formatted text: a change of language formats it again. */
export type TextArg =
  | { readonly name: string; readonly kind: "text"; readonly text: string }
  | { readonly name: string; readonly kind: "number"; readonly number: number; readonly style?: (typeof NUMBER_STYLES)[number] }
  | { readonly name: string; readonly kind: "date"; readonly at: string; readonly style: TextDateStyle };

/** What a declaration, an action output or a content pack writes. It has no owner: a trusted identity is never read from input. */
export type TextRef =
  | { readonly key: string; readonly args?: readonly TextArg[]; readonly fallback?: string }
  | { readonly literal: string };

/** The shape once the platform has bound the owner from its trusted catalog: what composed surfaces, stored summaries and pages hold. */
export type OwnedTextRef =
  | { readonly owner: string; readonly key: string; readonly args?: readonly TextArg[]; readonly fallback?: string }
  | { readonly literal: string };

/** `owner` is a plugin_id or a platform owner's name; 200 is the longest plugin_id the Host's install actions take. */
export const TEXT_REF_LIMITS = { key: 120, args: 8, arg_name: 64, arg_text: 2000, arg_at: 40, literal: 2000, fallback: 2000, owner: 200 } as const;

/** A language tag. The Manifest's and the language pack's parsers both take it from here. */
export const LOCALE_TAG = /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-[A-Z]{2})?$/;

const TEXT_ARG_SCHEMA: SandboxSchema = {
  type: "object", additionalProperties: false, required: ["name", "kind"],
  properties: {
    name: { type: "string", minLength: 1, maxLength: TEXT_REF_LIMITS.arg_name },
    kind: { type: "string", enum: ["text", "number", "date"] },
    text: { type: "string", maxLength: TEXT_REF_LIMITS.arg_text },
    number: { type: "number" },
    at: { type: "string", maxLength: TEXT_REF_LIMITS.arg_at },
    style: { type: "string", enum: [...NUMBER_STYLES, ...DATE_STYLES] },
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
