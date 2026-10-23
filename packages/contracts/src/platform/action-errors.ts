// One error model (specs/repository-anti-corruption W3-02). An error is a code, a message, and optionally a kind and details.
// The code says whose error it is: `<owner>.<reason>`, the owner's name first. The kind says what sort of failure it is, and the
// transport (plugin SDK `actionHttpStatus`) derives its status from the kind, so no plugin keeps a status table of its own.

/** The sorts of failure, each with one HTTP status in the plugin SDK. 401, 410, 415 and 422 have no kind: they misdescribe who failed. */
export const ACTION_ERROR_KIND_NAMES = ["invalid", "forbidden", "not_found", "conflict", "too_large", "rate_limited", "cancelled", "internal", "upstream", "unavailable", "timeout"] as const;
export type ActionErrorKind = (typeof ACTION_ERROR_KIND_NAMES)[number];

export interface ActionErrorOptions {
  /** Without one, the platform table (`ACTION_ERROR_KINDS`) says what a code is; a code nobody classified is a caller mistake (`invalid`). */
  readonly kind?: ActionErrorKind;
  /** Owner data the caller may need, e.g. the current version of a record that was changed under it. Shown to the caller as is. */
  readonly details?: Readonly<Record<string, unknown>>;
  readonly cause?: unknown;
}

export class ActionError extends Error {
  // `declare`: no own field unless the error was given one, so a plain error stays `{ name, code, message }`.
  declare readonly kind?: ActionErrorKind;
  declare readonly details?: Readonly<Record<string, unknown>>;

  constructor(readonly code: string, message: string, options: ActionErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "ActionError";
    if (options.kind) this.kind = options.kind;
    if (options.details) this.details = options.details;
  }
}

/**
 * The platform's own codes (`actions.*`, and the protocol codes the helpers in this package raise) and what sort of failure each is.
 * One row for every code that exists: a row is a current code, not an alias, and goes when its last raise site goes. An owner's
 * codes are not here; the owner gives each its kind with `defineErrorCodes`.
 */
export const ACTION_ERROR_KINDS = {
  // The caller may not do this, here or at all.
  "actions.forbidden": "forbidden", "actions.scope_mismatch": "forbidden", "actions.owner_mismatch": "forbidden", "actions.plugin_permission": "forbidden",
  "actions.home_mismatch": "forbidden", "actions.plugin_disabled": "forbidden", "actions.unauthenticated": "forbidden",
  // The thing asked for is not there (any more).
  "actions.missing": "not_found", "actions.binding_missing": "not_found", "actions.scene_missing": "not_found",
  "actions.recommendation_missing": "not_found", "actions.subject_unavailable": "not_found",
  // It changed under the caller, or two things claim the same place: read again and decide again. The whole `actions.event_*` and
  // `actions.offer_*` families are here because the Home dock has always answered 409 for them.
  "actions.conflict": "conflict", "actions.subject_changed": "conflict", "actions.binding_changed": "conflict", "actions.provider_changed": "conflict", "actions.host_replaced": "conflict",
  "actions.provider_replaced": "conflict", "actions.definition_changed": "conflict", "actions.configuration_changed": "conflict", "actions.expired": "conflict",
  "actions.offer_changed": "conflict", "actions.offer_invalid": "conflict", "actions.offer_source_changed": "conflict",
  "actions.event_changed": "conflict", "actions.event_invalid": "conflict", "actions.event_source_changed": "conflict",
  "actions.mcp_name_conflict": "conflict", "actions.scene_duplicate": "conflict",
  // The input or the declaration is wrong.
  "actions.input_invalid": "invalid", "actions.version_required": "invalid", "actions.project_required": "invalid", "actions.reference_invalid": "invalid",
  "actions.binding_invalid": "invalid", "actions.transport_invalid": "invalid", "actions.usage_invalid": "invalid", "actions.schema_invalid": "invalid",
  "actions.definition_invalid": "invalid", "actions.provider_invalid": "invalid", "actions.target_invalid": "invalid", "actions.scene_incompatible": "invalid",
  "actions.scene_ambiguous": "invalid", "actions.subject_incompatible": "invalid", "actions.subject_mismatch": "invalid", "actions.subject_ambiguous": "invalid",
  "actions.recommendation_incompatible": "invalid", "actions.gateway_mismatch": "invalid", "actions.home_required": "invalid", "actions.dependency_cycle": "invalid",
  "actions.function_unpublished": "invalid", "actions.provider_ambiguous": "invalid",
  "actions.input_too_large": "too_large",
  "actions.rate_limited": "rate_limited",
  "actions.cancelled": "cancelled",
  "actions.timeout": "timeout",
  // Not available now: something it needs is off, not set up, not running, or not reachable.
  "actions.connection_required": "unavailable", "actions.unredeemed": "unavailable", "actions.plugin_unavailable": "unavailable",
  "actions.service_unavailable": "unavailable", "actions.host_closed": "unavailable", "actions.connection_unavailable": "unavailable",
  "actions.configuration_unavailable": "unavailable", "actions.dependency_unknown": "unavailable", "actions.dependency_missing": "unavailable",
  "actions.provider_stopped": "unavailable", "actions.stopped": "unavailable", "actions.source_unavailable": "unavailable",
  "actions.recommendation_unavailable": "unavailable", "actions.schema_unsupported": "unavailable", "actions.unavailable": "unavailable",
  "actions.reauthorize": "unavailable", "actions.mcp_unavailable": "unavailable", "actions.binding_disabled": "unavailable",
  "actions.binding_required": "unavailable", "actions.discovery_required": "unavailable", "actions.host_context_missing": "unavailable",
  // Something we called did not answer completely.
  "actions.delivery_unknown": "upstream",
  // Our own failure, or an outcome we cannot tell.
  "actions.execution_failed": "internal", "actions.judgment_failed": "internal",
  "actions.async_required": "internal", "actions.output_invalid": "internal", "actions.output_invalid_after_effect": "internal", "actions.outcome_unknown": "internal",
  // The protocol codes the helpers in this package raise.
  "placement.same_location": "invalid", "search.entry_duplicate": "invalid", "files.entry_duplicate": "invalid", "files.too_large": "too_large",
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
  readonly [Reason in keyof Reasons & string]: (message: string, details?: Readonly<Record<string, unknown>>) => ActionError;
};

function declaredCode(prefix: string, reason: string, kind: unknown): string {
  if (!ERROR_REASON.test(reason)) throw new TypeError(`错误原因 ${JSON.stringify(reason)} 不合规：用小写字母开头的单词，可含数字和下划线，不含点（reason）`);
  const code = `${prefix}.${reason}`;
  if (!isActionErrorKind(kind)) throw new TypeError(`错误码 ${code} 的 kind ${JSON.stringify(kind)} 不是已知的类别：${ACTION_ERROR_KIND_NAMES.join("、")}`);
  if (platformErrorKind(code)) throw new TypeError(`${code} 是平台自己的错误码，主人不能再声明一次`);
  return code;
}

/**
 * An owner declares its codes once, `defineErrorCodes("todo", { not_found: "not_found" })`; each entry raises an `ActionError` with the code
 * `<prefix>.<reason>` and that kind. The prefix is the owner's name (a second word after it groups a family: `goals.event`); `actions`
 * is the platform's, and a platform code cannot be declared again. Which package may use which owner name is for tooling/gates/error-owners.json to say (scripts/gates/error-owners.mjs).
 */
export function defineErrorCodes<const Reasons extends Readonly<Record<string, ActionErrorKind>>>(prefix: string, reasons: Reasons): ErrorCodeRaisers<Reasons> {
  if (!OWNER_PREFIX.test(prefix)) throw new TypeError(`错误码前缀 ${JSON.stringify(prefix)} 不合规：写主人的名字，小写字母开头，可含数字和下划线，用点接子段（prefix）`);
  if (prefix.split(".")[0] === "actions") throw new TypeError(`错误码前缀 ${JSON.stringify(prefix)} 不合规：actions 是平台自己的，主人要用自己的名字开头`);
  const raise = (code: string, kind: ActionErrorKind) => (message: string, details?: Readonly<Record<string, unknown>>) =>
    new ActionError(code, message, { kind, ...(details ? { details } : {}) });
  return Object.fromEntries(Object.entries(reasons).map(([reason, kind]) => [reason, raise(declaredCode(prefix, reason, kind), kind)])) as ErrorCodeRaisers<Reasons>;
}
