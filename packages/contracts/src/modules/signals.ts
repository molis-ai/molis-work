import type { ContractDescriptor } from "../platform/package.js";

export const modulesSignalsContract = {
  contractId: "io.molis.work.module.signals.v1",
  kind: "module",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "docs/modules/signals.md",
} as const satisfies ContractDescriptor;

export interface SignalAdapterRef {
  plugin_id: string;
  version: string;
}

export interface SignalDraft {
  project_id: string;
  source_id: string;
  provider_dedupe_id: string;
  kind: string;
  occurred_at: string;
  observed_at: string;
  payload: Record<string, unknown>;
  content_refs?: string[];
  raw_event_id: string;
  adapter: SignalAdapterRef;
  provenance: Record<string, unknown>;
}

export interface SignalRecord extends SignalDraft {
  signal_id: string;
  revision: number;
  content_hash: string;
  validation: "accepted";
  superseded_by: string | null;
  withdrawn_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SignalReceipt {
  signal: SignalRecord;
  created: boolean;
  changed: boolean;
  deduped: boolean;
}

export interface SignalQuery {
  get(projectId: string, signalId: string): SignalRecord;
  list(projectId: string, sourceId?: string): SignalRecord[];
}

export interface SignalCommands {
  submitDraft(draft: SignalDraft): SignalReceipt;
}

export interface SignalEvent {
  event_id: string;
  project_id: string;
  signal_id: string;
  source_id: string;
  type: "signal.accepted" | "signal.changed";
  revision: number;
  at: string;
}

export interface SignalEvents {
  list(projectId: string, sourceId?: string): SignalEvent[];
}

export interface SignalsApi {
  readonly query: SignalQuery;
  readonly commands: SignalCommands;
  readonly events: SignalEvents;
}
