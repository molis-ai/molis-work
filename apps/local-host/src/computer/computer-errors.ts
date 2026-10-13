import { ActionError, defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import { isHostSurfaceRefusal, type HostSurfaceRefusal, type HostSurfaceRefusalError } from "@molis-ai/molis-work-contracts/services/ui-surfaces";

/**
 * Computer Use's own failures (repository-anti-corruption W3-02). Each code is `computer.<reason>` and carries a kind;
 * HTTP status, where one is needed, comes from that kind. A refusal still carries Prologue's `refusal` so the Agent Host
 * can map it. The helper process speaks its own wire codes (`helper.*`, `app.gone`, `capture.password`); those are
 * relayed as they arrived and are not declared here.
 */
export const computerErrors = defineErrorCodes("computer", {
  not_found: "not_found",
  closed: "unavailable",
  unsupported: "unavailable",
  missing: "unavailable",
  start_failed: "unavailable",
  crashed: "unavailable",
  restarting_too_often: "unavailable",
  timeout: "timeout",
  failed: "internal",
  driver_unavailable: "unavailable",
  person_present: "cancelled",
  screen_locked: "unavailable",
  outside_target: "forbidden",
});

const REFUSAL = {
  "driver-unavailable": computerErrors.driver_unavailable,
  "person-present": computerErrors.person_present,
  "screen-locked": computerErrors.screen_locked,
  "outside-target": computerErrors.outside_target,
} as const;

/** A desktop refusal: an owned error plus the reason Prologue reads. */
export function refused(refusal: HostSurfaceRefusal, message: string, partial = false): HostSurfaceRefusalError {
  return Object.assign(REFUSAL[refusal](message), { refusal, partial });
}

export const isRefused = isHostSurfaceRefusal;

/** Marks an error as coming from the helper connection, including a wire code the helper process chose. */
export function markHelper(error: ActionError): ActionError {
  error.name = "HelperError";
  return error;
}

/** A failure whose code arrived from the helper process, not from this owner's table. */
export function helperFailure(code: string, message: string): ActionError {
  return markHelper(new ActionError(code, message, { kind: "unavailable" }));
}

export function isHelperFailure(error: unknown): error is ActionError {
  return error instanceof ActionError && error.name === "HelperError";
}
