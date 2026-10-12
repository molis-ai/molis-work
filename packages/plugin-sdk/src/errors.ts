import { ACTION_ERROR_CODE, ACTION_ERROR_KIND_NAMES, ActionError, isActionErrorKind, platformErrorKind, type ActionErrorKind } from "@molis-ai/molis-work-contracts/platform/actions";

// One error model (specs/repository-anti-corruption W3-02): the transport derives the status from the failure's kind, and every
// entry writes the same body, { error, code, details? }. Failures are read by shape, never by `instanceof`: a Runtime bundle or the
// Studio iframe can hold its own copy of the ActionError class.

/** The one HTTP status of each kind, and the only place that holds these numbers. */
const KIND_STATUS: Readonly<Record<ActionErrorKind, number>> = {
  invalid: 400, forbidden: 403, not_found: 404, conflict: 409, too_large: 413, rate_limited: 429,
  cancelled: 499, internal: 500, upstream: 502, unavailable: 503, timeout: 504,
};
const STATUS_KIND = new Map(ACTION_ERROR_KIND_NAMES.map(kind => [KIND_STATUS[kind], kind] as const));
/** The code of a failure that has none of ours: it is a bug or an outage, not a mistake of the caller. */
const FALLBACK_CODE = "actions.execution_failed";
const FALLBACK_MESSAGE = "能力执行失败";

export interface ActionErrorBody {
  /** The message, in the language the exit's `translate` hook gives it (none by default). */
  readonly error: string;
  readonly code: string;
  /** Owner data about the failure; the only place an owner puts anything. */
  readonly details?: Readonly<Record<string, unknown>>;
  /** The Host's diagnostic number of the call, stamped by the Host's exits, never by this SDK. */
  readonly call_id?: string;
}

export interface ActionErrorBodyOptions {
  /** Where the Host translates a message server-side today (the artifact edge); every other exit passes nothing. */
  translate?(message: string): string;
}

interface CodedFailure {
  readonly code: string;
  readonly message: string;
  readonly kind?: unknown;
  readonly details?: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** A code of ours: `<owner>.<reason>`. A system or driver code (`ENOENT`, `ERR_SQLITE_ERROR`) is not, whoever raised it. */
const isModelCode = (code: unknown): code is string => typeof code === "string" && ACTION_ERROR_CODE.test(code);

/** A failure that carries a code of ours and a message, whichever class made it. Anything else is read as having no code at all, so its kind,
 * its body code and its details cannot disagree about whether the failure is ours. */
function codedFailure(error: unknown): CodedFailure | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const { code, message } = error as Record<string, unknown>;
  return isModelCode(code) && typeof message === "string" ? error as CodedFailure : undefined;
}

/**
 * What sort of failure this is: the failure's own kind, else what the platform table says its code is. A code of ours
 * (`<owner>.<reason>`) that nobody classified is a caller's mistake; anything else (no code, a system error code, a thrown string) is internal.
 * A failure of the second kind answers with the code `actions.execution_failed` and its message; its own code and details are not passed on.
 */
export function actionErrorKind(error: unknown): ActionErrorKind {
  const failure = codedFailure(error);
  if (!failure) return "internal";
  if (isActionErrorKind(failure.kind)) return failure.kind;
  return platformErrorKind(failure.code) ?? "invalid";
}

export function actionHttpStatus(error: unknown): number {
  return KIND_STATUS[actionErrorKind(error)];
}

export function actionErrorBody(error: unknown, options: ActionErrorBodyOptions = {}): ActionErrorBody {
  const failure = codedFailure(error);
  const message = failure?.message || (error instanceof Error && error.message) || FALLBACK_MESSAGE;
  return {
    error: options.translate ? options.translate(message) : message,
    code: failure?.code ?? FALLBACK_CODE,
    ...(failure && isRecord(failure.details) ? { details: { ...failure.details } } : {}),
  };
}

export function actionErrorResponse(error: unknown, options: ActionErrorBodyOptions = {}): { status: number; body: ActionErrorBody } {
  return { status: actionHttpStatus(error), body: actionErrorBody(error, options) };
}

/** The failure a response stands for, so a caller on the other side of HTTP sees the same code, kind and details. */
export function actionErrorFromResponse(status: number, body: unknown): ActionError {
  const answer = isRecord(body) ? body : {};
  const kind = STATUS_KIND.get(status) ?? (status >= 400 && status < 500 ? "invalid" : "internal");
  const code = isModelCode(answer.code) ? answer.code : FALLBACK_CODE;
  const message = typeof answer.error === "string" && answer.error !== "" ? answer.error : FALLBACK_MESSAGE;
  return new ActionError(code, message, { kind, ...(isRecord(answer.details) ? { details: answer.details } : {}) });
}
