import type { ContextLedgerApi } from "@molis-ai/molis-work-contracts/modules/context-ledger";

/** The statement surface the Feed tables need from a SQLite handle. */
type Statement = {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): { changes: number | bigint };
};
export interface FeedSqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): Statement;
  transaction<T>(operation: () => T): (() => T) & { immediate(): T };
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
