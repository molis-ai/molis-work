import type { FeedContractMigrationReceiptRecord } from "@molis-ai/molis-work-contracts/modules/feed";
import type { FeedSqliteDatabase } from "./index.js";

type Row = Record<string, unknown>;

/** Schema-transition receipts, in their original persisted format. */
export class FeedReceiptStore {
  constructor(private readonly db: FeedSqliteDatabase) {}

  listContractMigrations(): FeedContractMigrationReceiptRecord[] {
    return (this.db.prepare("SELECT * FROM feed_contract_migration_receipts ORDER BY schema_version, receipt_id")
      .all() as Row[]).map(mapFeedContractMigrationReceipt);
  }
}

function mapFeedContractMigrationReceipt(row: Row): FeedContractMigrationReceiptRecord {
  return {
    receipt_id: text(row.receipt_id),
    schema_version: Number(row.schema_version ?? 0),
    preflight: json<Record<string, number>>(row.preflight_json, {}),
    postflight: json<Record<string, number>>(row.postflight_json, {}),
    rollback_strategy: "sqlite_immediate_transaction",
    applied_at: text(row.applied_at),
  };
}

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function json<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
