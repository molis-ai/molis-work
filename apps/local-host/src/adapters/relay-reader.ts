import { LocalSqliteStorage, type SqliteDatabase } from "@molis-ai/molis-work-storage";
import { GMAIL_INSTALLATIONS_SETTINGS_KEY } from "@molis-ai/molis-work-integration-gmail";
import type { RelayImportData, RelaySourceRow, RelayItemRow, RelayMaterialRow, RelayRunRow, RelayConnectorRow, RelayCursorRow } from "@molis-ai/molis-work-plugin-feed";

const REQUIRED_TABLES = ["items", "inbox_sources", "evidence_refs"] as const;
const REQUIRED_COLUMNS: Record<(typeof REQUIRED_TABLES)[number], readonly string[]> = {
  inbox_sources: [
    "id", "definition_id", "kind", "name", "description", "status", "enabled",
    "item_count", "last_sync_at", "last_outcome", "last_error_code", "updated_at",
  ],
  items: [
    "id", "kind", "title", "summary", "body", "source", "source_label", "external_id",
    "url", "status", "priority", "tags_json", "author", "created_at", "updated_at",
  ],
  evidence_refs: [
    "id", "item_id", "canonical_url", "title", "source_name", "published_at", "preview",
    "content_hash", "provenance_json", "selected_for_context", "last_seen_at",
  ],
};

export class RelayLegacyReader {
  private readonly storage: LocalSqliteStorage;
  constructor(databasePath: string) { this.storage = new LocalSqliteStorage(databasePath, { readonly: true }); }
  inspect() {
    const db = this.storage.db;
    const tables = tableNames(db);
    const missing = REQUIRED_TABLES.filter((name) => !tables.has(name));
    if (missing.length) throw new Error(`Relay 数据库缺少表：${missing.join("、")}`);
    const missingColumns = REQUIRED_TABLES.flatMap((table) => {
      const columns = tableColumns(db!, table);
      return REQUIRED_COLUMNS[table]
        .filter((column) => !columns.has(column))
        .map((column) => `${table}.${column}`);
    });
    if (missingColumns.length) throw new Error(`Relay 数据库缺少列：${missingColumns.join("、")}`);
    return {
      source_count: Number((db.prepare("SELECT COUNT(*) AS count FROM inbox_sources").get() as { count: number }).count),
      item_count: Number((db.prepare("SELECT COUNT(*) AS count FROM items").get() as { count: number }).count),
      material_count: Number((db.prepare("SELECT COUNT(*) AS count FROM evidence_refs").get() as { count: number }).count),
    };
  }
  read(): RelayImportData {
    const relay = this.storage.db;
    const tables = tableNames(relay);
    const sources = relay.prepare("SELECT * FROM inbox_sources ORDER BY updated_at, id").all() as RelaySourceRow[];
    const items = relay.prepare("SELECT * FROM items ORDER BY updated_at, id").all() as RelayItemRow[];
    const materials = relay.prepare("SELECT * FROM evidence_refs ORDER BY last_seen_at, id").all() as RelayMaterialRow[];
    const sourceRuns = tables.has("inbox_source_runs")
      ? relay.prepare("SELECT * FROM inbox_source_runs ORDER BY created_at, id").all() as RelayRunRow[]
      : [];
    const connectorRows = tables.has("connectors")
      ? relay.prepare("SELECT * FROM connectors ORDER BY id").all() as RelayConnectorRow[]
      : [];
    const cursorRows = tables.has("connector_cursors")
      ? relay.prepare("SELECT * FROM connector_cursors ORDER BY connector_id").all() as RelayCursorRow[]
      : [];
    const gmailInstallations = tables.has("settings")
      ? readRelayGmailInstallations(relay)
      : [];
    return { sources, items, materials, sourceRuns, connectorRows, cursorRows, gmailInstallations };
  }
  close(): void { this.storage.close(); }
}

function tableNames(db: SqliteDatabase): Set<string> {
  return new Set((db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
  ).all() as Array<{ name: string }>).map((row) => row.name));
}

function tableColumns(db: SqliteDatabase, table: string): Set<string> {
  return new Set((db.prepare(
    "SELECT name FROM pragma_table_info(?) ORDER BY cid",
  ).all(table) as Array<{ name: string }>).map((row) => row.name));
}

function readRelayGmailInstallations(db: SqliteDatabase): RelayImportData["gmailInstallations"] {
  const row = db.prepare("SELECT value_json FROM settings WHERE key = ?")
    .get(GMAIL_INSTALLATIONS_SETTINGS_KEY) as { value_json?: unknown } | undefined;
  const raw = parsedJson<unknown>(row?.value_json, []);
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry): RelayImportData["gmailInstallations"] => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const record = entry as Record<string, unknown>;
    const id = optionalText(record.id);
    const status = text(record.status);
    if (!id || !["connected", "error", "disconnected", "mock"].includes(status)) return [];
    return [{
      id,
      ...(optionalText(record.email) ? { email: text(record.email) } : {}),
      status: status as RelayImportData["gmailInstallations"][number]["status"],
      ...(optionalText(record.lastSyncAt) ? { lastSyncAt: text(record.lastSyncAt) } : {}),
      itemCount: Number.isFinite(Number(record.itemCount)) ? Number(record.itemCount) : 0,
    }];
  });
}

function text(value: unknown): string { return value == null ? "" : String(value); }
function optionalText(value: unknown): string | null { return text(value) || null; }
function parsedJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}
