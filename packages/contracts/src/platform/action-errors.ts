// One error model (specs/archive/repository-anti-corruption W3-02). An error is a code, a message, and optionally a kind and details.
// The code says whose error it is: `<owner>.<reason>`, the owner's name first. The kind says what sort of failure it is, and the
// transport (plugin SDK `actionHttpStatus`) derives its status from the kind, so no plugin keeps a status table of its own.

/** The sorts of failure, each with one HTTP status in the plugin SDK. 401, 410, 415 and 422 have no kind: they misdescribe who failed. */
export const ACTION_ERROR_KIND_NAMES = ["invalid", "forbidden", "not_found", "conflict", "too_large", "rate_limited", "cancelled", "internal", "upstream", "unavailable", "timeout"] as const;
export type ActionErrorKind = (typeof ACTION_ERROR_KIND_NAMES)[number];

export interface ActionErrorText {
  readonly key: string;
  readonly args?: Readonly<Record<string, string | number>>;
}

export interface ActionErrorOptions {
  /** Without one, the platform table (`ACTION_ERROR_KINDS`) says what a code is; a code nobody classified is a caller mistake (`invalid`). */
  readonly kind?: ActionErrorKind;
  /** Owner data the caller may need, e.g. the current version of a record that was changed under it. Shown to the caller as is. */
  readonly details?: Readonly<Record<string, unknown>>;
  /** Optional platform/workbench locale key resolved at the Host error edge in the active language. */
  readonly text_key?: string;
  /** Optional placeholder values for `text_key` (plain string or number arguments). */
  readonly text_args?: Readonly<Record<string, string | number>>;
  readonly cause?: unknown;
}

export class ActionError extends Error {
  // `declare`: no own field unless the error was given one, so a plain error stays `{ name, code, message }`.
  declare readonly kind?: ActionErrorKind;
  declare readonly details?: Readonly<Record<string, unknown>>;
  declare readonly text_key?: string;
  declare readonly text_args?: Readonly<Record<string, string | number>>;

  constructor(readonly code: string, message: string, options: ActionErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "ActionError";
    if (options.kind) this.kind = options.kind;
    if (options.details) this.details = options.details;
    if (options.text_key) this.text_key = options.text_key;
    if (options.text_args) this.text_args = options.text_args;
  }
}

const [K_INVALID, K_FORBIDDEN, K_NOT_FOUND, K_CONFLICT, K_TOO_LARGE, K_RATE_LIMITED, K_CANCELLED, K_INTERNAL, K_UPSTREAM, K_UNAVAILABLE, K_TIMEOUT] = ACTION_ERROR_KIND_NAMES;

/**
 * The platform's own codes (`actions.*`, and the protocol codes the helpers in this package raise) and what sort of failure each is.
 * One row for every code that exists: a row is a current code, not an alias, and goes when its last raise site goes. An owner's
 * codes are not here; the owner gives each its kind with `defineErrorCodes`.
 */
export const ACTION_ERROR_KINDS = {
  // The caller may not do this, here or at all.
  "actions.forbidden": K_FORBIDDEN, "actions.scope_mismatch": K_FORBIDDEN, "actions.owner_mismatch": K_FORBIDDEN, "actions.plugin_permission": K_FORBIDDEN,
  "actions.home_mismatch": K_FORBIDDEN, "actions.plugin_disabled": K_FORBIDDEN, "actions.unauthenticated": K_FORBIDDEN,
  // The thing asked for is not there (any more).
  "actions.missing": K_NOT_FOUND, "actions.binding_missing": K_NOT_FOUND, "actions.scene_missing": K_NOT_FOUND,
  "actions.recommendation_missing": K_NOT_FOUND, "actions.subject_unavailable": K_NOT_FOUND,
  // It changed under the caller, or two things claim the same place: read again and decide again. The whole `actions.event_*` and
  // `actions.offer_*` families are here because the Home dock has always answered 409 for them.
  "actions.conflict": K_CONFLICT, "actions.subject_changed": K_CONFLICT, "actions.binding_changed": K_CONFLICT, "actions.provider_changed": K_CONFLICT, "actions.host_replaced": K_CONFLICT,
  "actions.provider_replaced": K_CONFLICT, "actions.definition_changed": K_CONFLICT, "actions.configuration_changed": K_CONFLICT, "actions.expired": K_CONFLICT,
  "actions.offer_changed": K_CONFLICT, "actions.offer_invalid": K_CONFLICT, "actions.offer_source_changed": K_CONFLICT,
  "actions.event_changed": K_CONFLICT, "actions.event_invalid": K_CONFLICT, "actions.event_source_changed": K_CONFLICT,
  "actions.mcp_name_conflict": K_CONFLICT, "actions.scene_duplicate": K_CONFLICT,
  // The input or the declaration is wrong.
  "actions.input_invalid": K_INVALID, "actions.version_required": K_INVALID, "actions.project_required": K_INVALID, "actions.reference_invalid": K_INVALID,
  "actions.binding_invalid": K_INVALID, "actions.transport_invalid": K_INVALID, "actions.usage_invalid": K_INVALID, "actions.schema_invalid": K_INVALID,
  "actions.definition_invalid": K_INVALID, "actions.provider_invalid": K_INVALID, "actions.target_invalid": K_INVALID, "actions.scene_incompatible": K_INVALID,
  "actions.scene_ambiguous": K_INVALID, "actions.subject_incompatible": K_INVALID, "actions.subject_mismatch": K_INVALID, "actions.subject_ambiguous": K_INVALID,
  "actions.recommendation_incompatible": K_INVALID, "actions.gateway_mismatch": K_INVALID, "actions.home_required": K_INVALID, "actions.dependency_cycle": K_INVALID,
  "actions.function_unpublished": K_INVALID, "actions.provider_ambiguous": K_INVALID,
  "actions.input_too_large": K_TOO_LARGE,
  "actions.rate_limited": K_RATE_LIMITED,
  "actions.cancelled": K_CANCELLED,
  "actions.timeout": K_TIMEOUT,
  // Not available now: something it needs is off, not set up, not running, or not reachable.
  "actions.connection_required": K_UNAVAILABLE, "actions.unredeemed": K_UNAVAILABLE, "actions.plugin_unavailable": K_UNAVAILABLE,
  "actions.service_unavailable": K_UNAVAILABLE, "actions.host_closed": K_UNAVAILABLE, "actions.connection_unavailable": K_UNAVAILABLE,
  "actions.configuration_unavailable": K_UNAVAILABLE, "actions.dependency_unknown": K_UNAVAILABLE, "actions.dependency_missing": K_UNAVAILABLE,
  "actions.provider_stopped": K_UNAVAILABLE, "actions.stopped": K_UNAVAILABLE, "actions.source_unavailable": K_UNAVAILABLE,
  "actions.recommendation_unavailable": K_UNAVAILABLE, "actions.schema_unsupported": K_UNAVAILABLE, "actions.unavailable": K_UNAVAILABLE,
  "actions.reauthorize": K_UNAVAILABLE, "actions.mcp_unavailable": K_UNAVAILABLE, "actions.binding_disabled": K_UNAVAILABLE,
  "actions.binding_required": K_UNAVAILABLE, "actions.discovery_required": K_UNAVAILABLE, "actions.host_context_missing": K_UNAVAILABLE,
  // Something we called did not answer completely.
  "actions.delivery_unknown": K_UPSTREAM,
  // Our own failure, or an outcome we cannot tell.
  "actions.execution_failed": K_INTERNAL, "actions.judgment_failed": K_INTERNAL,
  "actions.async_required": K_INTERNAL, "actions.output_invalid": K_INTERNAL, "actions.output_invalid_after_effect": K_INTERNAL, "actions.outcome_unknown": K_INTERNAL,
  // The protocol codes the helpers in this package raise.
  "placement.same_location": K_INVALID, "search.entry_duplicate": K_INVALID, "files.entry_duplicate": K_INVALID, "files.too_large": K_TOO_LARGE,
} as const satisfies Readonly<Record<string, ActionErrorKind>>;

/** `<prefix>.<reason>`: lower-case words joined by dots, the owner's name first. */
export const ACTION_ERROR_CODE = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/u;
const OWNER_PREFIX = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/u;
const ERROR_REASON = /^[a-z][a-z0-9_]*$/u;

export function isActionErrorKind(value: unknown): value is ActionErrorKind {
  return typeof value === "string" && (ACTION_ERROR_KIND_NAMES as readonly string[]).includes(value);
}

/** What sort of failure a platform code is, or nothing when the code is an owner's. */
export function platformErrorKind(code: string): ActionErrorKind | undefined {
  return Object.hasOwn(ACTION_ERROR_KINDS, code) ? ACTION_ERROR_KINDS[code as keyof typeof ACTION_ERROR_KINDS] : undefined;
}

/** What `defineErrorCodes` gives back: one function per declared reason, each raising that code's `ActionError`. */
export type ErrorCodeRaisers<Reasons extends Readonly<Record<string, ActionErrorKind>>> = {
  readonly [Reason in keyof Reasons & string]: (
    message: string,
    details?: Readonly<Record<string, unknown>>,
    text?: ActionErrorText,
  ) => ActionError;
};

function declaredCode(prefix: string, reason: string, kind: unknown): string {
  if (!ERROR_REASON.test(reason)) throw new TypeError(`错误原因 ${JSON.stringify(reason)} 不合规：用小写字母开头的单词，可含数字和下划线，不含点（reason）`);
  const code = `${prefix}.${reason}`;
  if (!isActionErrorKind(kind)) throw new TypeError(`错误码 ${code} 的 kind ${JSON.stringify(kind)} 不是已知的类别：${ACTION_ERROR_KIND_NAMES.join("、")}`);
  if (platformErrorKind(code)) throw new TypeError(`${code} 是平台自己的错误码，主人不能再声明一次`);
  return code;
}

/**
 * An owner declares its codes once, `defineErrorCodes("notes", { not_found: "not_found" })`; each entry raises an `ActionError` with the code
 * `<prefix>.<reason>` and that kind. The prefix is the owner's name (a second word after it groups a family: `notes.event`); `actions`
 * is the platform's, and a platform code cannot be declared again. Which package may use which owner name is for tooling/gates/error-owners.json to say (scripts/gates/error-owners.mjs).
 */
export function defineErrorCodes<const Reasons extends Readonly<Record<string, ActionErrorKind>>>(prefix: string, reasons: Reasons): ErrorCodeRaisers<Reasons> {
  if (!OWNER_PREFIX.test(prefix)) throw new TypeError(`错误码前缀 ${JSON.stringify(prefix)} 不合规：写主人的名字，小写字母开头，可含数字和下划线，用点接子段（prefix）`);
  if (prefix.split(".")[0] === "actions") throw new TypeError(`错误码前缀 ${JSON.stringify(prefix)} 不合规：actions 是平台自己的，主人要用自己的名字开头`);
  const raise = (code: string, kind: ActionErrorKind) => (
    message: string,
    details?: Readonly<Record<string, unknown>>,
    text?: ActionErrorText,
  ) => new ActionError(code, message, { kind, details, text_key: text?.key, text_args: text?.args });
  return Object.fromEntries(Object.entries(reasons).map(([reason, kind]) => [reason, raise(declaredCode(prefix, reason, kind), kind)])) as ErrorCodeRaisers<Reasons>;
}
