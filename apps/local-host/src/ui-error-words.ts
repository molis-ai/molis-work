import { platformErrorKind, type ActionErrorKind } from "@molis-ai/molis-work-contracts/platform/actions";
import type { TextArg } from "@molis-ai/molis-work-contracts/platform/ui";
import { actionErrorResponse, type ActionErrorBody } from "@molis-ai/molis-work-plugin-sdk";
import { createTextReader, say } from "@molis-ai/molis-work-plugin-sdk/ui";
import { hasHostUiText, workbenchPlatformText } from "./ui-text-provider.js";
import { activeLocale, DEFAULT_WEB_LOCALE, pageLocale, webLanguage } from "./web-locale.js";

// Centralized Host error localization & sanitization edge (single source: `apps/workbench/resources/locales/*.json`).
// Layer 1 maps structured ActionError code / kind / HTTP status to `common.error.*`.
// Layer 2 detects technical/raw/opposite-language leaks (Prologue codes, SYNC_*, AJV pointers,
// raw driver/network/OS paths, horizontal/account English messages in zh/ja, Chinese in en/ja)
// and replaces them cleanly while preserving `code`, `details`, and `call_id` / `diagnostic_id`.

const COMMON_ERROR_KEYS = [
  "common.error.invalid",
  "common.error.forbidden",
  "common.error.not-found",
  "common.error.conflict",
  "common.error.too-large",
  "common.error.rate-limited",
  "common.error.cancelled",
  "common.error.internal",
  "common.error.upstream",
  "common.error.unavailable",
  "common.error.timeout",
  "common.error.account-session-expired",
  "common.error.account-service-unavailable",
  "common.error.account-busy",
  "common.error.account-config-incomplete",
  "common.error.account-config-missing-env",
  "common.error.account-config-invalid-env",
  "common.error.account-credential-store",
  "common.error.account-changed",
  "common.error.account-not-ready",
  "common.error.account-switching",
  "common.error.account-page-expired",
  "common.error.account-local-only-disabled",
  "common.error.sync-unavailable",
  "common.error.sync-personal-required",
  "common.error.sync-quota-exceeded",
  "common.error.sync-rate-limited",
  "common.error.sync-purge-disabled",
  "common.error.sync-confirm-purge",
  "common.error.sync-read-only",
  "common.error.sync-conflict-review",
  "common.error.plugin-disabled",
  "common.error.plugin-unavailable",
  "common.error.connection-required",
  "common.error.upgrade-in-progress",
  "common.error.storage-busy",
  "common.error.storage-no-space",
  "common.error.secret-entry-unreadable",
  "common.error.outcome-unknown",
  "common.error.method-not-allowed",
  "common.error.endpoint-not-found",
  "common.error.stream-overflow",
  "common.error.service-stopping",
  "common.error.browser-no-page",
  "common.error.browser-file-too-large",
  "common.error.browser-download-missing",
  "common.error.browser-auth-failed",
  "common.error.project-rename-stale",
  "common.error.model-auth",
  "common.error.model-rate-limit",
  "common.error.model-unavailable",
  "common.error.model-network",
  "common.error.model-context-overflow",
  "common.error.model-refused",
  "common.error.model-output-truncated",
  "common.error.model-failed",
] as const;

export type CommonErrorKey = (typeof COMMON_ERROR_KEYS)[number];

const KIND_KEYS: Readonly<Record<ActionErrorKind, CommonErrorKey>> = {
  invalid: "common.error.invalid",
  forbidden: "common.error.forbidden",
  not_found: "common.error.not-found",
  conflict: "common.error.conflict",
  too_large: "common.error.too-large",
  rate_limited: "common.error.rate-limited",
  cancelled: "common.error.cancelled",
  internal: "common.error.internal",
  upstream: "common.error.upstream",
  unavailable: "common.error.unavailable",
  timeout: "common.error.timeout",
};

const CODE_KEYS: Readonly<Record<string, CommonErrorKey>> = {
  // Platform codes (strictly validated against ACTION_ERROR_KINDS)
  "actions.input_invalid": "common.error.invalid",
  "actions.input_too_large": "common.error.too-large",
  "actions.forbidden": "common.error.forbidden",
  "actions.scope_mismatch": "common.error.forbidden",
  "actions.owner_mismatch": "common.error.forbidden",
  "actions.plugin_permission": "common.error.forbidden",
  "actions.home_mismatch": "common.error.forbidden",
  "actions.unauthenticated": "common.error.forbidden",
  "actions.plugin_disabled": "common.error.plugin-disabled",
  "actions.missing": "common.error.not-found",
  "actions.binding_missing": "common.error.not-found",
  "actions.scene_missing": "common.error.not-found",
  "actions.recommendation_missing": "common.error.not-found",
  "actions.subject_unavailable": "common.error.not-found",
  "actions.conflict": "common.error.conflict",
  "actions.subject_changed": "common.error.conflict",
  "actions.rate_limited": "common.error.rate-limited",
  "actions.cancelled": "common.error.cancelled",
  "actions.timeout": "common.error.timeout",
  "actions.connection_required": "common.error.connection-required",
  "actions.connection_unavailable": "common.error.connection-required",
  "actions.reauthorize": "common.error.connection-required",
  "actions.binding_required": "common.error.connection-required",
  "actions.binding_disabled": "common.error.connection-required",
  "actions.plugin_unavailable": "common.error.plugin-unavailable",
  "actions.service_unavailable": "common.error.unavailable",
  "actions.unavailable": "common.error.unavailable",
  "actions.host_closed": "common.error.unavailable",
  "actions.delivery_unknown": "common.error.upstream",
  "actions.outcome_unknown": "common.error.outcome-unknown",
  "actions.execution_failed": "common.error.internal",
  "files.too_large": "common.error.too-large",
  // Account & space codes (horizontal/account is upstream English — always localized at Host exit)
  "account.login_required": "common.error.account-session-expired",
  "account.invalid_configuration": "common.error.account-config-incomplete",
  "account.unavailable": "common.error.account-service-unavailable",
  "account.conflict": "common.error.conflict",
  "account.rate_limited": "common.error.rate-limited",
  "account.forbidden": "common.error.forbidden",
  "account.not_found": "common.error.not-found",
  "account.invalid_request": "common.error.invalid",
  "account.upstream_invalid": "common.error.upstream",
  "account.cancelled": "common.error.cancelled",
  "account.timeout": "common.error.timeout",
  "space.changed": "common.error.account-changed",
  "space.unavailable": "common.error.account-not-ready",
  // Storage, host, IM, sandbox, connector, sync codes
  "storage.upgrade_in_progress": "common.error.upgrade-in-progress",
  "storage.owner.busy": "common.error.storage-busy",
  "storage.upgrade_no_space": "common.error.storage-no-space",
  "storage.secret_entry_invalid": "common.error.secret-entry-unreadable",
  "storage.secret_entry_decryption_failed": "common.error.secret-entry-unreadable",
  "host.request_path_invalid": "common.error.invalid",
  "im.stopping": "common.error.service-stopping",
  "im.server.host_denied": "common.error.forbidden",
  "im.server.catalog_unavailable": "common.error.unavailable",
  "sandbox.storage_unavailable": "common.error.unavailable",
  "sandbox.storage_unsupported": "common.error.unavailable",
  "sandbox.storage_conflict": "common.error.conflict",
  "connector.check.rate_limited": "common.error.rate-limited",
  "connector.read.refused": "common.error.upstream",
  "connector.read.unreachable": "common.error.upstream",
  "connector.read.answered": "common.error.upstream",
};

const ALWAYS_LOCALIZE_CODES = new Set<string>([
  "space.changed",
  "space.unavailable",
  "storage.upgrade_in_progress",
  "storage.owner.busy",
  "storage.upgrade_no_space",
  "im.stopping",
  "im.server.host_denied",
  "im.server.catalog_unavailable",
  "sandbox.storage_unavailable",
  "sandbox.storage_unsupported",
  "sandbox.storage_conflict",
]);

function baseLanguageOf(locale: string | null | undefined): "zh" | "en" | "ja" {
  const base = locale?.trim().toLowerCase().split("-")[0];
  if (!base || base === "zh") return "zh";
  if (base === "ja") return "ja";
  return "en";
}

const fallbackReaders = new Map<string, ReturnType<typeof createTextReader>>();

function resolveWorkbenchLocale(locale: string | null | undefined): string {
  const candidate = locale?.trim();
  if (candidate) {
    if (workbenchPlatformText.pack(candidate)) return candidate;
    const lowered = candidate.toLowerCase();
    if (workbenchPlatformText.pack(lowered)) return lowered;
    const base = lowered.split("-")[0];
    if (base && workbenchPlatformText.pack(base)) return base;
  }
  return workbenchPlatformText.default;
}

function fallbackReaderFor(locale: string) {
  let reader = fallbackReaders.get(locale);
  if (!reader) {
    const fallback = workbenchPlatformText.default;
    const packs = [...new Set([locale, fallback])].flatMap((tag) => workbenchPlatformText.pack(tag) ?? []);
    reader = createTextReader({ locale, packs, intlLocale: (tag) => webLanguage(tag)?.intl });
    fallbackReaders.set(locale, reader);
  }
  return reader;
}

/** Read any workbench locale key from its single source of truth (`apps/workbench/resources/locales/*.json`), with or without `installHostUiText()`. */
export function readWorkbenchText(key: string, localeOverride?: string | null, args?: readonly TextArg[]): string {
  const locale = resolveWorkbenchLocale(localeOverride ?? activeLocale() ?? pageLocale() ?? DEFAULT_WEB_LOCALE);
  const ref = { owner: workbenchPlatformText.owner, key, ...(args?.length ? { args } : {}) };
  if (hasHostUiText()) return say.text(ref, { locale });
  return fallbackReaderFor(locale).text(ref);
}

export function readErrorWord(key: CommonErrorKey, localeOverride?: string | null): string {
  return readWorkbenchText(key, localeOverride);
}

function statusToErrorKey(status: number): CommonErrorKey {
  if (status === 401) return "common.error.account-session-expired";
  if (status === 403) return "common.error.forbidden";
  if (status === 404) return "common.error.not-found";
  if (status === 405) return "common.error.method-not-allowed";
  if (status === 408 || status === 504) return "common.error.timeout";
  if (status === 409) return "common.error.conflict";
  if (status === 413) return "common.error.too-large";
  if (status === 429) return "common.error.rate-limited";
  if (status === 499) return "common.error.cancelled";
  if (status === 502) return "common.error.upstream";
  if (status === 503) return "common.error.unavailable";
  if (status >= 400 && status < 500) return "common.error.invalid";
  return "common.error.internal";
}

/**
 * Layer 2 detector: recognizes raw technical strings (Prologue error codes, SYNC_*, AJV schema paths,
 * raw network/driver/OS errors, stack traces, file paths, hardcoded fallback) and maps them to a warm
 * `common.error.*` key. Returns null when the message is already clean user-facing prose.
 */
function classifyTechnicalMessage(message: string): CommonErrorKey | null {
  const trimmed = message.trim();
  if (!trimmed || trimmed === "能力执行失败") return "common.error.internal";

  // Prologue / model codes
  if (/\bMODEL_AUTH\b/u.test(trimmed) || (/\bMODEL_HTTP_ERROR\b/u.test(trimmed) && /\b(?:401|403)\b/u.test(trimmed))) {
    return "common.error.model-auth";
  }
  if (/\bMODEL_RATE_LIMITED\b/u.test(trimmed) || (/\bMODEL_HTTP_ERROR\b/u.test(trimmed) && /\b(?:429|529)\b/u.test(trimmed))) {
    return "common.error.model-rate-limit";
  }
  if (/\b(?:MODEL_CONTEXT_OVERFLOW|CONTEXT_BUDGET_EXCEEDED)\b/u.test(trimmed)) {
    return "common.error.model-context-overflow";
  }
  if (/\bMODEL_NETWORK_FAILED\b/u.test(trimmed)) {
    return "common.error.model-network";
  }
  if (/\bMODEL_REFUSED\b/u.test(trimmed)) {
    return "common.error.model-refused";
  }
  if (/\bMODEL_OUTPUT_TRUNCATED\b/u.test(trimmed)) {
    return "common.error.model-output-truncated";
  }
  if (/\bMODEL_UNAVAILABLE\b/u.test(trimmed) || (/\bMODEL_HTTP_ERROR\b/u.test(trimmed) && /\b50[0234]\b/u.test(trimmed))) {
    return "common.error.model-unavailable";
  }
  if (/\b(?:MODEL|AGENT|CONTEXT|RUN|TOOL|EFFECT|RUNTIME)_[A-Z0-9_]+\b/u.test(trimmed) || /\bMEMORY_SCOPE_DENIED\b/u.test(trimmed)) {
    return "common.error.model-failed";
  }

  // Sync & login codes
  if (/\bSYNC_RATE_LIMITED\b/u.test(trimmed)) return "common.error.sync-rate-limited";
  if (/\b(?:SYNC_QUOTA_EXCEEDED|QUOTA_EXCEEDED)\b/u.test(trimmed)) return "common.error.sync-quota-exceeded";
  if (/\bSYNC_READ_ONLY\b/u.test(trimmed)) return "common.error.sync-read-only";
  if (/\bSYNC_[A-Z0-9_]+\b/u.test(trimmed)) return "common.error.sync-unavailable";
  if (/\bLOGIN_REQUIRED\b/u.test(trimmed)) return "common.error.account-session-expired";
  if (/\bLOGIN_CANCELLED\b/u.test(trimmed)) return "common.error.cancelled";

  // AJV JSON schema validation leaks
  if (
    trimmed.startsWith("输入不符合能力合同：")
    || /(?:^|[\s;,])\/[A-Za-z0-9_/-]+\s+(?:must|minLength|maxLength|minimum|maximum|additionalProperties|required|type|enum|format|pattern|const|oneOf|anyOf|items)\b/u.test(trimmed)
    || /\bmust (?:have required property|NOT have additional properties|match format|be (?:string|number|integer|boolean|object|array))\b/u.test(trimmed)
  ) {
    return "common.error.invalid";
  }

  // Storage / SQLite / OS / network raw driver errors
  if (/\b(?:SQLITE_BUSY|database is locked)\b/iu.test(trimmed)) return "common.error.storage-busy";
  if (/\b(?:ENOSPC|SQLITE_FULL)\b/u.test(trimmed)) return "common.error.storage-no-space";
  if (/\b(?:ECONNREFUSED|ENOTFOUND|ECONNRESET|EHOSTUNREACH|ENETUNREACH|EAI_AGAIN|fetch failed|UND_ERR_[A-Z_]+)\b/iu.test(trimmed)) {
    return "common.error.upstream";
  }
  if (/\b(?:ETIMEDOUT|AbortError|TimeoutError)\b/u.test(trimmed)) return "common.error.timeout";
  if (/\b(?:ENOENT|EACCES|EPERM|EISDIR|ENOTDIR|ERR_SQLITE_ERROR|SQLITE_[A-Z_]+)\b/u.test(trimmed)) {
    return "common.error.internal";
  }

  // Stack traces, JS native error prefixes, raw OS / file paths
  if (/\n\s*at\s+/u.test(trimmed)) return "common.error.internal";
  if (/^(?:TypeError|ReferenceError|RangeError|SyntaxError|URIError|EvalError|AssertionError):/u.test(trimmed)) {
    return "common.error.internal";
  }
  if (/(?:^|[\s(:`"'=])(?:\/Users\/|\/home\/|\/var\/|\/tmp\/|\/private\/|\/etc\/|\/opt\/|\/Library\/|file:\/\/\/|[A-Za-z]:\\)/u.test(trimmed)) {
    return "common.error.internal";
  }
  return null;
}

const QUOTED_SEGMENTS = /「[^」]*」|『[^』]*』|“[^”]*”|《[^》]*》|"[^"]*"|(?<!\w)'[^']*'(?!\w)|`[^`]*`/gu;
const NEUTRAL_PROPER_NOUNS = /\b(?:Molis Work|Molis|JSON|HTTP|HTTPS|URL|URI|API|MCP|OAuth|ID|MB|KB|GB|UTF-8|CSV|PDF|PNG|SVG|HTML|CSS|DOM|SSE|WS|tokens?|GitHub|Slack|Linear|Notion|Google|OpenAI|Anthropic|Gemini|Claude)\b/giu;
const ENGLISH_PROSE_WORD = /\b(?:is|are|was|were|be|been|being|has|have|had|do|does|did|can|could|will|would|may|might|must|not|no|can['’]t|couldn['’]t|isn['’]t|aren['’]t|wasn['’]t|weren['’]t|doesn['’]t|didn['’]t|won['’]t|don['’]t|the|a|an|this|that|these|those|your|you|it|its|for|with|from|into|by|to|in|on|of|at|as|or|and|but|if|while|when|during|before|after|already|still|yet|only|cannot|unable|failed|missing|found|updated|changed|deleted|moved|locked|expired|invalid|denied|refused|blocked|closed|stopped|canceled|cancelled|required|available|unavailable|exceeded|reached|unexpected|try|check|refresh|please)\b/iu;

/**
 * Layer 2 detector: checks whether an unquoted error sentence is written in a different language
 * than the active UI locale (e.g. raw Chinese backend text in en/ja UI, raw English in zh/ja UI),
 * while preserving localized English sentences that embed unquoted CJK user titles (e.g. project or file names).
 */
function isWrongLanguageForLocale(message: string, locale: string, status = 500): boolean {
  const core = message.replace(QUOTED_SEGMENTS, " ").replace(NEUTRAL_PROPER_NOUNS, " ").trim();
  if (!core) return false;
  const hanMatches = core.match(/\p{Script=Han}/gu);
  const kanaMatches = core.match(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu);
  const hanCount = hanMatches?.length ?? 0;
  const kanaCount = kanaMatches?.length ?? 0;
  const hasHan = hanCount > 0;
  const hasKana = kanaCount > 0;
  const latinWords = core.match(/\b[A-Za-z][A-Za-z'’]{1,}\b/gu) ?? [];
  const hasLatinWord = latinWords.length > 0;
  const base = baseLanguageOf(locale);
  if (base === "zh") {
    if (hasKana) return true;
    // Preserve clean domain/test English 4xx refusals in zh; only localize unexpected 5xx English prose.
    if (status >= 500 && !hasHan && hasLatinWord) {
      const hasCjkSentencePunct = /[。！？；，]/u.test(core);
      return !hasCjkSentencePunct && latinWords.length >= 4 && ENGLISH_PROSE_WORD.test(core);
    }
    return false;
  }
  if (base === "ja") return !hasKana && (hasHan || hasLatinWord);
  if (!hasHan && !hasKana) return false;
  const cjkCount = hanCount + kanaCount;
  const hasCjkSentencePunct = /[。！？；，]/u.test(core);
  const latinLetters = latinWords.reduce((sum, word) => sum + word.replace(/['’]/gu, "").length, 0);
  const isEnglishProse = !hasCjkSentencePunct
    && latinWords.length >= 2
    && ENGLISH_PROSE_WORD.test(core)
    && (latinLetters >= cjkCount || latinWords.length >= 3);
  return !isEnglishProse;
}

function keyForCodeAndMessage(code: string | undefined, rawMessage: string, status: number): CommonErrorKey {
  if (code) {
    if (code === "account.unavailable" && /\b(?:storage|credential|keychain)\b/iu.test(rawMessage)) {
      return "common.error.account-credential-store";
    }
    if (code === "account.conflict") {
      if (/\b(?:in progress|already)\b/iu.test(rawMessage)) return "common.error.account-busy";
      if (/\bchanged\b/iu.test(rawMessage)) return "common.error.account-changed";
    }
    if (Object.hasOwn(CODE_KEYS, code)) return CODE_KEYS[code]!;
    if (code.startsWith("account.")) return "common.error.account-service-unavailable";
    if (code.startsWith("sync_replication.") || code.startsWith("sync.")) return "common.error.sync-unavailable";
    const platformKind = platformErrorKind(code);
    if (platformKind) return KIND_KEYS[platformKind];
  }
  return statusToErrorKey(status);
}

function shouldAlwaysLocalizeCode(code: string | undefined): boolean {
  if (!code) return false;
  return code.startsWith("account.") || ALWAYS_LOCALIZE_CODES.has(code);
}

/**
 * Localize & sanitize a `{ error, code?, details?, ... }` HTTP error body without touching
 * structured fields (`code`, `details`, `call_id`, `diagnostic_id`).
 */
export function localizeWebErrorBody(status: number, value: unknown, localeOverride?: string | null): unknown {
  if (status < 400 || typeof value !== "object" || value === null || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  if (typeof record.error !== "string") return value;

  const raw = record.error;
  const code = typeof record.code === "string" ? record.code : undefined;
  const locale = localeOverride ?? activeLocale() ?? pageLocale();

  const technicalKey = classifyTechnicalMessage(raw);
  if (technicalKey) {
    const resolvedKey = code && (code.startsWith("account.") || code.startsWith("storage.") || code === "actions.outcome_unknown")
      ? keyForCodeAndMessage(code, raw, status)
      : technicalKey;
    return { ...record, error: readErrorWord(resolvedKey, locale) };
  }

  if (shouldAlwaysLocalizeCode(code)) {
    return { ...record, error: readErrorWord(keyForCodeAndMessage(code, raw, status), locale) };
  }

  if (locale && isWrongLanguageForLocale(raw, locale, status)) {
    return { ...record, error: readErrorWord(keyForCodeAndMessage(code, raw, status), locale) };
  }

  return value;
}

const GATEWAY_OS_PATH = /(?:\/Users\/|\/home\/|\/var\/|\/tmp\/|\/private\/|\/etc\/|\/opt\/|\/Library\/|file:\/\/\/|[A-Za-z]:\\)[^\s"'`,)\]]+/gu;

/**
 * Sanitize machine-gateway `{ error, code?, details?, ... }` responses (`R-07`): scrubs raw OS paths,
 * stack traces, and upstream `account.*` raw English while preserving contract schema hints and
 * uncoded resident error names (such as `ENOENT`, `W3-02-G1-01`) expected by CLI/MCP forwarding clients.
 */
export function sanitizeGatewayErrorBody(status: number, value: unknown, localeOverride?: string | null): unknown {
  if (status < 400 || typeof value !== "object" || value === null || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  if (typeof record.error !== "string") return value;
  const raw = record.error;
  const trimmed = raw.trim();
  const code = typeof record.code === "string" ? record.code : undefined;
  const locale = localeOverride ?? activeLocale() ?? pageLocale();
  if (shouldAlwaysLocalizeCode(code)) {
    return { ...record, error: readErrorWord(keyForCodeAndMessage(code, raw, status), locale) };
  }
  if (/\n\s*at\s+/u.test(trimmed)) {
    return { ...record, error: readErrorWord(keyForCodeAndMessage(code, raw, status), locale) };
  }
  if (GATEWAY_OS_PATH.test(raw)) {
    GATEWAY_OS_PATH.lastIndex = 0;
    return { ...record, error: raw.replace(GATEWAY_OS_PATH, "[path]") };
  }
  return value;
}

/** Build a localized, sanitized `{ status, body }` from any thrown failure, preserving `code` and `details`. */
export function localizeActionErrorResponse(error: unknown, localeOverride?: string | null): { status: number; body: ActionErrorBody } {
  const response = actionErrorResponse(error);
  const localized = localizeWebErrorBody(response.status, response.body, localeOverride) as ActionErrorBody;
  return { status: response.status, body: localized };
}

/** Convert any caught error into a single localized, leak-free user-facing message string. */
export function localizeWebErrorMessage(
  error: unknown,
  fallbackKey: CommonErrorKey = "common.error.internal",
  localeOverride?: string | null,
): string {
  const locale = localeOverride ?? activeLocale() ?? pageLocale();
  if (typeof error === "string") {
    const technicalKey = classifyTechnicalMessage(error);
    if (technicalKey) return readErrorWord(technicalKey, locale);
    if (locale && isWrongLanguageForLocale(error, locale)) return readErrorWord(fallbackKey, locale);
    return error.trim() || readErrorWord(fallbackKey, locale);
  }
  const response = actionErrorResponse(error);
  const raw = response.body.error;
  const code = response.body.code;
  const technicalKey = classifyTechnicalMessage(raw);
  if (technicalKey) {
    const key = code === "actions.execution_failed" && fallbackKey !== "common.error.internal" && technicalKey === "common.error.internal"
      ? fallbackKey
      : technicalKey;
    return readErrorWord(key, locale);
  }
  if (shouldAlwaysLocalizeCode(code)) {
    return readErrorWord(keyForCodeAndMessage(code, raw, response.status), locale);
  }
  if (locale && isWrongLanguageForLocale(raw, locale, response.status)) {
    const key = code === "actions.execution_failed" ? fallbackKey : keyForCodeAndMessage(code, raw, response.status);
    return readErrorWord(key, locale);
  }
  return raw;
}

/**
 * Sanitize an error message before storing/showing it in an assistant notice `{ label, original }`.
 * Keeps clean domain messages in the active locale; replaces technical leaks or opposite-language
 * strings with a warm localized sentence.
 */
export function sanitizeErrorForNotice(error: unknown, fallbackKey: CommonErrorKey = "common.error.internal"): string {
  return localizeWebErrorMessage(error, fallbackKey);
}
