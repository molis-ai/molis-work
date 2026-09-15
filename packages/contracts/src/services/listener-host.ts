import type { SignalDraft, SignalReceipt } from "../modules/signals.js";
import type { ContractDescriptor } from "../platform/package.js";
import type { ConnectorHostApi, ConnectorRawEvent } from "./connector-host.js";

export const servicesListenerHostContract = {
  contractId: "io.molis.work.service.listener-host.v1",
  kind: "service",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "docs/horizontal/listener-host.md",
} as const satisfies ContractDescriptor;

export interface RawEventAdapter {
  readonly adapter: { plugin_id: string; version: string };
  toSignalDraft(
    event: ConnectorRawEvent,
    context: { project_id: string; source_id: string },
  ): Omit<SignalDraft, "project_id" | "source_id" | "provider_dedupe_id" | "raw_event_id" | "adapter">;
}

export interface ListenerCheckpoint {
  project_id: string;
  source_id: string;
  cursor: unknown;
  state: "idle" | "listening" | "retry_wait" | "quarantined";
  attempt: number;
  retry_at: string | null;
  last_error_code: string | null;
  updated_at: string;
}

export interface ListenerRunRecord {
  run_id: string;
  operation_id: string;
  project_id: string;
  source_id: string;
  phase: "running" | "terminal" | "interrupted";
  outcome: string | null;
  created_count: number;
  deduped_count: number;
  recovery_count: number;
  empty: boolean;
  error_code: string | null;
  connector_receipt: Record<string, unknown> | null;
  started_at: string;
  completed_at: string | null;
  updated_at: string;
}

export interface ListenerRunReceipt extends ListenerRunRecord {
  replayed: boolean;
  accepted: Array<{ event: ConnectorRawEvent; receipt: SignalReceipt }>;
}

export interface ListenerHostApi {
  readonly connector: ConnectorHostApi;
  checkpoint(projectId: string, sourceId: string): ListenerCheckpoint;
  getRunByOperationId(projectId: string, operationId: string): ListenerRunRecord | null;
  listRuns(projectId: string): ListenerRunRecord[];
  recoverInterruptedRuns(projectId: string): number;
  run(input: {
    project_id: string;
    source_id: string;
    connection_id: string;
    operation_id: string;
    adapter: RawEventAdapter;
    intent?: Record<string, unknown>;
  }): Promise<ListenerRunReceipt>;
}

export class ListenerHostError extends Error {
  constructor(
    readonly code:
      | "listener_lease_busy"
      | "listener_delivery_failed"
      | "listener_delivery_quarantined"
      | "listener_connector_failed",
    message: string,
  ) {
    super(message);
    this.name = "ListenerHostError";
  }
}
