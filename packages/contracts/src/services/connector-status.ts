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
