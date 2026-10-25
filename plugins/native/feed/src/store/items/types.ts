import type { AttentionCommands, AttentionQuery } from "@molis-ai/molis-work-contracts/modules/attention-resumption";
import type { ContextLedgerApi } from "@molis-ai/molis-work-contracts/modules/context-ledger";

/**
 * The Inbox entries Feed writes and reads about its own subjects (`feed_item`, `source_fault`): the part of the Attention API it uses and no more,
 * so the host's Attention Module satisfies it as it is and `services.attention`, joined to the write's transaction, can be adapted to it.
 */
export interface FeedAttentionPort {
  readonly query: Pick<AttentionQuery, "list" | "get" | "findForSubject">;
  readonly commands: Pick<AttentionCommands, "create" | "ensureFeedItem" | "setStatus" | "deleteSubject">;
}

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
