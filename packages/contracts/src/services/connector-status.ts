import type { ActionReference, ActionSchema } from "../platform/actions.js";

/** Technical observations carry no credentials, arguments, response body or business content. */
export interface ConnectorCheckObservation {
  at: string; revision: string; outcome: "connected" | "failed";
  authorization: "verified" | "not-required" | "unknown" | "required";
  scopes?: string[]; code?: string; account?: { login: string; account_id?: string };
  /** The service asked to be left alone until then (HTTP 429 with `Retry-After`); the connection is not at fault. */
  retry_at?: string;
  /**
   * What was checked when it is not the connection alone: a model provider checks its own address and model with the connection's key.
   * Such a check counts toward the connection's own state only when it passed or the key was refused; any other failure is the provider's.
   */
  subject?: { kind: "model-provider"; id: string; revision: string };
}
export interface ConnectorCallObservation {
  at: string; revision: string; outcome: "succeeded" | "failed" | "unknown";
  action: ActionReference; actor_id: string; project_id: string | null; call_id?: string;
  /**
   * How many uses of this connection version in a row have failed for the same `failure_class`. Absent once a use succeeds or the version
   * changes (a passing check ends only a `reauth` run); a failure of another class, or one more than a day after the run's last recorded
   * use, starts a new run at 1. Only failures that are the connection's or the service's count. A use that reached the service and was
   * answered for its own reason (400, 404, 409, 422, an MCP tool's `isError` or a JSON-RPC error) does not count and ends the run;
   * its `outcome` is still `failed`, which is the call's result, not part of the run. A request refused before it was sent (connection
   * disabled, disconnected, unbound, wrong origin, call cancelled) or rate limited (429) neither counts nor ends a run: when such a use writes
   * this observation it carries the run's three fields over unchanged, so they then describe the run, not this call. Counted by the Host;
   * it decides when the person is told (ASC-58), not this field.
   */
  failures?: number;
  /** When the first failure of the current run happened; unchanged while the run lasts, so one run is one problem. Set with `failures`. */
  failing_since?: string;
  /**
   * What the run is: `reauth` the account must be logged in again (its refresh was refused), `denied` the service refused the key or the
   * permission (401 after any refresh, or 403), `unavailable` the service could not be reached or kept failing (timeout, no connection, 5xx,
   * each after the read resends). Set with `failures`.
   */
  failure_class?: "reauth" | "denied" | "unavailable";
}
export interface ConnectorObservations { check?: ConnectorCheckObservation; call?: ConnectorCallObservation }

/** A projection for one caller and configuration revision, not a second connection record. */
export interface ConnectorConnectionStatus {
  configuration: { state: "complete" | "incomplete"; enabled: boolean; revision: string; source: string };
  connectivity: {
    state: "disconnected" | "unchecked" | "connected" | "failed" | "unknown";
    source: string; observed_at?: string; last_check?: ConnectorCheckObservation; current?: boolean;
    /**
     * Set while the service is rate limiting this connection: the check failed for the service's reason, and is worth trying again after
     * this time. Projected from `last_check.retry_at` (at most an hour ahead), not written apart.
     */
    retry_at?: string;
  };
  authorization: {
    service: { state: ConnectorCheckObservation["authorization"]; scopes: string[] | null; scope_state: "reported" | "unknown" };
    work: { state: "allowed" | "partial" | "blocked" | "unknown"; missing_permissions: string[]; source: string; note: string };
  };
  capabilities: {
    state: "none-discovered" | "callable" | "partial" | "blocked";
    entries: Array<{ capability_id: string; version: number; provider_id: string; title: string; operation: string;
      input_schema: ActionSchema; permissions: readonly string[]; available: boolean; reason?: string }>;
    coverage: string; note: string;
  };
  last_call?: ConnectorCallObservation & { current_revision: boolean };
}
