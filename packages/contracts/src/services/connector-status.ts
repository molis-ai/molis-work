import type { ActionReference, ActionSchema } from "../platform/actions.js";

/** Technical observations carry no credentials, arguments, response body or business content. */
export interface ConnectorCheckObservation {
  at: string; revision: string; outcome: "connected" | "failed";
  authorization: "verified" | "not-required" | "unknown" | "required";
  scopes?: string[]; code?: string; account?: { login: string; account_id?: string };
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
