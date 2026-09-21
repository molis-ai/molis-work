import type { ContractDescriptor } from "../platform/package.js";

export const servicesConnectorHostContract = {
  contractId: "io.molis.work.service.connector-host.v1",
  kind: "service",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "docs/horizontal/connector-host.md",
} as const satisfies ContractDescriptor;

export interface ConnectorRawEvent {
  raw_event_id: string;
  provider_dedupe_id: string;
  occurred_at: string;
  observed_at: string;
  payload: Record<string, unknown>;
  /** Only set at a safe provider checkpoint; Listener advances it after Signal acceptance. */
  cursor_after?: unknown;
}

export interface ConnectorHealth {
  ok: boolean;
  status: "connected" | "disconnected" | "error" | "needs_auth";
  message: string;
  action?: string;
}

export type ConnectorFailureKind =
  | "needs_auth"
  | "configuration"
  | "network"
  | "provider"
  | "rate_limited"
  | "stale_history";

export type ConnectorPollResult =
  | {
      ok: true;
      mode: "live" | "fixture";
      events: ConnectorRawEvent[];
      cursor_after: unknown;
    }
  | {
      ok: false;
      mode: "live";
      failure: ConnectorFailureKind;
      message: string;
      action?: string;
      http_status?: number;
      retry_after_at?: string;
    };

export interface ConnectorDriver {
  readonly driver_id: string;
  health(): Promise<ConnectorHealth>;
  poll(input: { cursor: unknown; intent?: Record<string, unknown> }): Promise<ConnectorPollResult>;
}

export interface ConnectorReceipt {
  receipt_id: string;
  connection_id: string;
  driver_id: string;
  started_at: string;
  completed_at: string;
  result: ConnectorPollResult;
}

export interface ConnectorHostApi {
  registerDriver(driver: ConnectorDriver): void;
  connect(input: { connection_id: string; driver_id: string }): void;
  test(connectionId: string): Promise<ConnectorHealth>;
  invoke(input: {
    connection_id: string;
    cursor: unknown;
    intent?: Record<string, unknown>;
  }): Promise<ConnectorReceipt>;
  revoke(connectionId: string): void;
}

/** Machine-level account card shown on Host Connectors settings. Not a Feed source. */
export type ConnectorAccountState = "connected" | "disconnected" | "reauth_required";
export type ConnectorDirectoryAvailability = "live" | "placeholder";
export type ConnectorAuthKind = "github" | "gmail" | "none";
export type ConnectorDirectoryGroupId =
  | "mail"
  | "files"
  | "chat"
  | "code"
  | "work"
  | "design"
  | "crm"
  | "social";

export interface ConnectorDirectoryEntry {
  readonly connector_id: string;
  readonly title: string;
  readonly availability: ConnectorDirectoryAvailability;
  readonly auth_kind: ConnectorAuthKind;
  readonly group_id: ConnectorDirectoryGroupId;
  readonly summary: string;
  readonly unavailable_reason?: string;
  readonly outbound_note?: string;
}
