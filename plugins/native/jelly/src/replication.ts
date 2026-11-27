import { syncError } from "./sync-errors.js";
import type { PluginSyncCollectionDefinition } from "@molis-ai/molis-work-contracts/platform/plugin-sync";
import type { PluginSyncDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import { removeJellyOverview, writeJellyOverview } from "./overview.js";
import { decodeJellyRow, encodeJellyRow, JELLY_TABLES, jellyRowColumns, validateJellyRow, type JellyRowKind, type JellyRows } from "./store.js";

const KINDS = Object.keys(JELLY_TABLES) as JellyRowKind[];
const LIMIT = 1_000_000;
/** One synced key per row: `["jelly", <kind>, <id>]`, so a note and an entry travel, conflict and arrive on their own. */
export const jellyTracking: PluginSyncCollectionDefinition["tracking"] = KINDS.map(kind => ({ table: JELLY_TABLES[kind], key: [{ literal: "jelly" }, { literal: kind }, { column: "id" }] }));

function parse(key: string): { kind: JellyRowKind; id: string } {
  let parts: unknown;
  try { parts = JSON.parse(key); } catch { invalid(); }
  if (!Array.isArray(parts) || parts.length !== 3 || parts[0] !== "jelly" || !KINDS.includes(parts[1]) || typeof parts[2] !== "string" || !parts[2] || parts[2].length > 200) invalid();
  return { kind: parts[1] as JellyRowKind, id: parts[2] };
}
function invalid(message = "Jelly 同步数据不合法", code: Parameters<typeof syncError>[0] = "invalid"): never { throw syncError(code, message); }

/** Only the row travels; the platform's tracking observes owner writes. An arriving row is a new revision here, so a page holding the old one sees a conflict. */
export const jellyCollection: PluginSyncCollectionDefinition = {
  tracking: jellyTracking,
  create(db, context) {
    const local = (kind: JellyRowKind, id: string) => db.prepare(`SELECT * FROM ${JELLY_TABLES[kind]} WHERE id = ?`).get(id);
    // An entry's overview row is written beside it, as the store writes it, so an entry synced from another device shows in the overview too.
    const overview = { get: (sql: string, parameters: readonly (string | number | null)[] = []) => db.prepare(sql).get(...parameters),
      run: (sql: string, parameters: readonly (string | number | null)[] = []) => db.prepare(sql).run(...parameters) };
    return {
      authorizeKey(key) { parse(key); context.authorize(); },
      belongsToProject(key) { parse(key); return false; },
      read(key) {
        const { kind, id } = parse(key), row = local(kind, id);
        if (!row) return null;
        const record = decodeJellyRow(kind, row);
        return { format: /* @version format.jelly.row */ 1, spaceId: context.spaceId, kind, record };
      },
      apply(key, value) {
        const { kind, id } = parse(key), table = JELLY_TABLES[kind];
        if (value === null) {
          db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
          if (kind === "item") removeJellyOverview(overview, id);
          return;
        }
        if (Buffer.byteLength(JSON.stringify(value)) > LIMIT) invalid("Jelly 的一条记录超过同步上限，原记录仍保留在本机", "limit");
        if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
        const wire = value as Record<string, unknown>;
        if (Object.keys(wire).sort().join(",") !== "format,kind,record,spaceId" || wire.format !== /* @version format.jelly.row */ 1 || wire.kind !== kind) invalid();
        if (wire.spaceId !== context.spaceId) invalid("同步空间不匹配", "scope");
        const record = wire.record as JellyRows[typeof kind];
        const columns = jellyRowColumns(kind);
        if (!record || typeof record !== "object" || Object.keys(record).sort().join(",") !== [...columns].sort().join(",") || record.id !== id) invalid();
        try { validateJellyRow(kind, record); } catch { invalid("Jelly 同步记录无效"); }
        const revision = Math.max(Number(local(kind, id)?.revision ?? 0), record.revision) + 1;
        const values = encodeJellyRow(kind, { ...record, revision } as JellyRows[typeof kind]);
        db.prepare(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")}) ON CONFLICT(id) DO UPDATE SET ${columns.filter(column => column !== "id").map(column => `${column} = excluded.${column}`).join(", ")}`).run(...values);
        const stored = local(kind, id);
        if (kind === "item" && stored) writeJellyOverview(overview, decodeJellyRow("item", stored));
      },
    };
  },
};

export const jellySync: PluginSyncDeclaration = {
  protocol_version: /* @version sync.protocol */ 1,
  collections: [{ id: "entries", title: "Jelly 日程与随手记", schema_version: /* @version sync.collection.jelly.entries */ 1, requires: [], tracking: jellyTracking }],
};
