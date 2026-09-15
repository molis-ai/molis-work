import type { FeedImportReceiptRecord, FeedContractMigrationReceiptRecord } from "@molis-ai/molis-work-contracts/modules/feed";
import type { FeedSqliteDatabase } from "./index.js";
type Row = Record<string, unknown>;
export function migrateFeedImportReceipts(db: FeedSqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS feed_import_receipts (
      board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
      receipt_id TEXT NOT NULL,
      source_fingerprint TEXT NOT NULL,
      summary_json TEXT NOT NULL,
      credentials_status TEXT NOT NULL CHECK (credentials_status IN ('migrated', 'unavailable', 'not_requested')),
      content_status TEXT NOT NULL CHECK (content_status IN ('migrated', 'partial', 'unavailable', 'not_requested')),
      completed_at TEXT NOT NULL,
      PRIMARY KEY (board_id, receipt_id)
    );
    CREATE INDEX IF NOT EXISTS feed_import_receipts_board_completed_idx
      ON feed_import_receipts(board_id, completed_at DESC);
  `);
}
/** Feed import and schema-transition receipts, in their original persisted format. */
export class FeedReceiptStore {
  constructor(private readonly db: FeedSqliteDatabase) {}
  listImports(boardId: string): FeedImportReceiptRecord[] {
    return (this.db.prepare("SELECT * FROM feed_import_receipts WHERE board_id = ? ORDER BY completed_at DESC, receipt_id")
      .all(boardId) as Row[]).map(mapFeedImportReceipt);
  }
  listContractMigrations(): FeedContractMigrationReceiptRecord[] {
    return (this.db.prepare("SELECT * FROM feed_contract_migration_receipts ORDER BY schema_version, receipt_id")
      .all() as Row[]).map(mapFeedContractMigrationReceipt);
  }
  putImportReceipt(receipt: FeedImportReceiptRecord): void {
    this.db.prepare(`
      INSERT INTO feed_import_receipts (
        board_id, receipt_id, source_fingerprint, summary_json,
        credentials_status, content_status, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(board_id, receipt_id) DO UPDATE SET
        source_fingerprint = excluded.source_fingerprint,
        summary_json = excluded.summary_json,
        credentials_status = excluded.credentials_status,
        content_status = excluded.content_status,
        completed_at = excluded.completed_at
    `).run(
      receipt.board_id,
      receipt.receipt_id,
      receipt.source_fingerprint,
      JSON.stringify(receipt.summary),
      receipt.credentials_status,
      receipt.content_status,
      receipt.completed_at,
    );
  }
}
function mapFeedImportReceipt(row: Row): FeedImportReceiptRecord {
  return {
    board_id: text(row.board_id),
    receipt_id: text(row.receipt_id),
    source_fingerprint: text(row.source_fingerprint),
    summary: json<Record<string, unknown>>(row.summary_json, {}),
    credentials_status: text(row.credentials_status) as FeedImportReceiptRecord["credentials_status"],
    content_status: text(row.content_status) as FeedImportReceiptRecord["content_status"],
    completed_at: text(row.completed_at),
  };
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
