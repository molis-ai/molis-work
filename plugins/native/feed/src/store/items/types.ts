import type { ContextLedgerApi } from "@molis-ai/molis-work-contracts/modules/context-ledger";

/** The project journal's record of an item change; the journal keeps its own event names. */
export interface FeedJournalEvent {
  project_id: string;
  item_id: string;
  type: string;
  reason: string;
  payload: Record<string, unknown>;
  at: string;
}

export interface FeedModuleOptions {
  ledger: ContextLedgerApi;
  now?: () => Date;
  eventSink?: (event: FeedJournalEvent) => void;
}
