import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ConnectorCallObservation } from "@molis-ai/molis-work-contracts/services/connector-host";

/**
 * A connection's run of failures (ASC-53, ASC-58; spec §13.2 「反复失败合并提醒」): what one use of a connection says about it, how the
 * run on its last call goes on, and when the person is told. Pure: the caller reads and writes the observation.
 */

export type FailureClass = NonNullable<ConnectorCallObservation["failure_class"]>;
export type RunFields = Pick<ConnectorCallObservation, "failures" | "failing_since" | "failure_class">;

/**
 * - `succeeded`: the service did what was asked; the run is over.
 * - `ended`: the request reached the service and was answered for its own reason (a 400, 404, 409 or 422, an MCP tool's `isError`): the
 *   connection works, so the run is over, though the call failed.
 * - `skipped`: says nothing about the connection (refused before it was sent, cancelled, a rate limit, an error of unknown kind): the run
 *   stays as it was.
 * - `failed`: a failure that is the connection's or the service's.
 */
export type ConnectionUse = { kind: "succeeded" | "ended" | "skipped" } | { kind: "failed"; failure_class: FailureClass };

const SUCCEEDED = { kind: "succeeded" } as const, ENDED = { kind: "ended" } as const, SKIPPED = { kind: "skipped" } as const;
const failed = (failure_class: FailureClass): ConnectionUse => ({ kind: "failed", failure_class });

/** A service's answer to a request sent with the connection's credential (after any refresh and the read resends). */
export function useOfStatus(status: number): ConnectionUse {
  if (status === 429) return SKIPPED;
  if (status === 401 || status === 403) return failed("denied");
  if (status >= 500) return failed("unavailable");
  return status >= 400 ? ENDED : SUCCEEDED;
}

/**
 * The service could not be reached or did not answer: a timeout, no connection or an unreadable answer (each after the read resends),
 * a write whose outcome is unknown, an MCP server that failed. A write or an MCP call that times out counts too: nothing is resent for it,
 * and it says the service is not answering just the same.
 */
const UNAVAILABLE = new Set(["connector.plugin_requests.timeout", "connector.plugin_requests.upstream", "actions.outcome_unknown", "connector.mcp.provider"]);

/** A request that threw. A refused refresh (`reauth`) is found by the caller, which knows whether the mark was there before. */
export function useOfError(error: unknown): ConnectionUse {
  if (error instanceof ActionError) {
    if (UNAVAILABLE.has(error.code)) return failed("unavailable");
    if (error.code === "connector.mcp.authorization") return failed("denied");
    return SKIPPED;
  }
  return error instanceof Error && error.name === "TimeoutError" ? failed("unavailable") : SKIPPED;
}

/** The run of a use, from the last call of the same connection version: a failure of the same class adds one, another class starts at 1. */
export function nextRun(previous: ConnectorCallObservation | undefined, revision: string, use: ConnectionUse, at: string): RunFields {
  const run = previous?.revision === revision && previous.failures && previous.failing_since && previous.failure_class
    ? { failures: previous.failures, failing_since: previous.failing_since, failure_class: previous.failure_class } : undefined;
  if (use.kind === "skipped") return run ?? {};
  if (use.kind !== "failed") return {};
  return run?.failure_class === use.failure_class ? { ...run, failures: run.failures + 1 } : { failures: 1, failing_since: at, failure_class: use.failure_class };
}

/** Whether a run on this call carries on (`skipped`) or holds the fields of a run at all. */
export const inRun = (observation: ConnectorCallObservation | undefined, revision: string): boolean =>
  observation?.revision === revision && Boolean(observation.failures);

/** At least ten minutes between the first and the latest failure of a service that could not be reached. */
const UNAVAILABLE_SPAN_MS = 10 * 60 * 1000;

/**
 * When the person is told: logging in again at once, a refused key or permission twice in a row, a service that could not be reached
 * three times in a row over at least ten minutes (each read already resent twice, so one short break never gets here).
 */
export function remindable(run: RunFields, at: string): boolean {
  if (!run.failures || !run.failure_class || !run.failing_since) return false;
  if (run.failure_class === "reauth") return true;
  if (run.failure_class === "denied") return run.failures >= 2;
  return run.failures >= 3 && Date.parse(at) - Date.parse(run.failing_since) >= UNAVAILABLE_SPAN_MS;
}

/** The last call without its run: what a check that went through leaves (the run is over, the call stays as it was). */
export function withoutRun(observation: ConnectorCallObservation): ConnectorCallObservation {
  const { failures: _failures, failing_since: _since, failure_class: _class, ...call } = observation;
  return call;
}
