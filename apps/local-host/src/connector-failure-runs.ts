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
 * a write whose outcome is unknown, a record read that found no service. A write or an MCP call that times out counts too: nothing is
 * resent for it, and it says the service is not answering just the same.
 */
const UNAVAILABLE = new Set(["connector.plugin_requests.timeout", "connector.plugin_requests.upstream", "actions.outcome_unknown", "connector.read.unreachable"]);

/** JSON-RPC codes the MCP client gives a request the server never answered (the connection closed, the request timed out). */
const MCP_UNANSWERED = new Set([-32000, -32001]);

/**
 * An MCP failure by what the server did: an HTTP status is read like any other answer; a JSON-RPC error the server sent is an answer for
 * the request's own reason (the run ends), except the client's own codes for no answer at all; anything else (no connection, a transport
 * that broke) is a server that could not be reached.
 */
function useOfMcp(details: Readonly<Record<string, unknown>> | undefined): ConnectionUse {
  if (typeof details?.http_status === "number") return useOfStatus(details.http_status);
  if (typeof details?.jsonrpc_code === "number") return MCP_UNANSWERED.has(details.jsonrpc_code) ? failed("unavailable") : ENDED;
  return failed("unavailable");
}

/** A request that threw. A refused refresh (`reauth`) is found by the caller, which knows whether the mark was there before. */
export function useOfError(error: unknown): ConnectionUse {
  if (error instanceof ActionError) {
    if (UNAVAILABLE.has(error.code)) return failed("unavailable");
    if (error.code === "connector.mcp.provider") return useOfMcp(error.details);
    if (error.code === "connector.mcp.authorization" || error.code === "connector.read.refused") return failed("denied");
    if (error.code === "connector.read.answered") return ENDED;
    return SKIPPED;
  }
  return error instanceof Error && error.name === "TimeoutError" ? failed("unavailable") : SKIPPED;
}

/** Failures this far apart are not one problem: a failure a day after the run's last recorded use starts a new run at 1. */
const RUN_GAP_MS = 24 * 60 * 60 * 1000;

/**
 * The run of a use, from the last call of the same connection version: a failure of the same class adds one, another class starts at 1,
 * and so does one more than a day after the run's last recorded use (`previous.at`, a failure or a use that carried the run on).
 */
export function nextRun(previous: ConnectorCallObservation | undefined, revision: string, use: ConnectionUse, at: string): RunFields {
  const run = previous?.revision === revision && previous.failures && previous.failing_since && previous.failure_class
    && Date.parse(at) - Date.parse(previous.at) <= RUN_GAP_MS
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

/**
 * What a check that went through leaves of the last call (ASC-58 §13.2 ⑫): it ends a run of `reauth` (the account answers again) and
 * one of `unavailable` (the service answers again), but not one of `denied`: an account read passes while the permission a call needs
 * is gone, so only a call that goes through ends that. `whileCalling` is the tool listing an MCP call makes just before its call: that
 * the list came back says nothing about the calls that keep failing, so it ends only `reauth`.
 */
export function afterPassedCheck(observation: ConnectorCallObservation, whileCalling = false): ConnectorCallObservation {
  if (observation.failure_class !== "reauth" && (observation.failure_class !== "unavailable" || whileCalling)) return observation;
  const { failures: _failures, failing_since: _since, failure_class: _class, ...call } = observation;
  return call;
}
