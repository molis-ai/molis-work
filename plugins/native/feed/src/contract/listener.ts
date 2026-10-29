import type { RawEventAdapter } from "@molis-ai/molis-work-contracts/platform/plugin-source-pull";
import type { ConnectorHostApi, ConnectorRawEvent } from "@molis-ai/molis-work-contracts/services/connector-host";
import type { SignalReceipt } from "./signals.js";

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
    signal?: AbortSignal;
    /** Recheck caller authority before persisting each asynchronous result. */
    beforeEffect?(): Promise<void>;
  }): Promise<ListenerRunReceipt>;
}
