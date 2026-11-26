import { existsSync, lstatSync, rmSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { OVERVIEW_KINDS, OVERVIEW_MAIN_TABLE, OVERVIEW_ROW_LIMIT, OVERVIEW_TABLE, type OverviewKind } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { OverviewIndexLibrary, OverviewIndexPort, OverviewIndexStoredRow, OverviewTableRow } from "@molis-ai/molis-work-contracts/services/search";
import { homeSqlitePath, openHomeSqliteDatabase, openHomeSqliteFile } from "../home-sqlite.js";
import { TEXT_SEARCH_STORE } from "./text-search-index.js";

/**
 * The overview index's storage (specs/unified-partition-plugins §6.1, batch 106): two tables beside the search index in the Home's
 * rebuildable `search/search.db`, with their own version in `overview_meta`, so an outdated layout is dropped and every library read
 * again. Like the search index it is a cache, never a second copy of a fact: the plugins' overview tables are the owners, read here on a
 * read-only connection (`SQLITE_OPEN_READONLY`) that runs nothing of the plugin.
 */
const OVERVIEW_INDEX_VERSION = /* @version database.search.overview-index "{version}" */ "1";
type Row = Record<string, unknown>;

export function openOverviewIndex(options: { readonly homeDirectory: string }): OverviewIndexPort {
  const dbPath = homeSqlitePath(options.homeDirectory, TEXT_SEARCH_STORE);
  const open = (): DatabaseSync => {
    const handle = openHomeSqliteDatabase(options.homeDirectory, TEXT_SEARCH_STORE);
    try {
      handle.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;");
      const check = handle.prepare("PRAGMA quick_check").all() as Row[];
      if (!check.every(row => Object.values(row).every(value => value === "ok"))) throw new Error("overview index failed integrity check");
      return handle;
    } catch (error) {
      try { handle.close(); } catch { /* closing failed handle */ }
      throw error;
    }
  };
  let db: DatabaseSync;
  try { db = open(); }
  catch {
    for (const suffix of ["", "-wal", "-shm"]) if (existsSync(dbPath + suffix)) rmSync(dbPath + suffix, { force: true });
    db = open();
  }
  const transaction = (run: () => void) => {
    db.exec("BEGIN IMMEDIATE");
    try {
      run();
      db.exec("COMMIT");
    } catch (error) {
      try { db.exec("ROLLBACK"); } catch { /* already rolled back */ }
      throw error;
    }
  };
  transaction(() => {
    db.exec("CREATE TABLE IF NOT EXISTS overview_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    const version = (db.prepare("SELECT value FROM overview_meta WHERE key = 'schema'").get() as Row | undefined)?.value;
    if (version !== OVERVIEW_INDEX_VERSION) {
      db.exec(`DROP TABLE IF EXISTS overview_rows; DROP TABLE IF EXISTS overview_libraries;
        CREATE TABLE overview_libraries (partition_id TEXT NOT NULL, install_id TEXT NOT NULL, plugin_id TEXT NOT NULL,
          dirty INTEGER NOT NULL CHECK (dirty IN (0, 1)), refreshed_at TEXT, PRIMARY KEY (partition_id, install_id));
        CREATE TABLE overview_rows (partition_id TEXT NOT NULL, install_id TEXT NOT NULL, plugin_id TEXT NOT NULL, kind TEXT NOT NULL,
          row_id TEXT NOT NULL, fields_json TEXT NOT NULL, sort_at TEXT, PRIMARY KEY (partition_id, install_id, kind, row_id));
        CREATE INDEX overview_rows_kind ON overview_rows (kind, sort_at);`);
      db.prepare("INSERT OR REPLACE INTO overview_meta (key, value) VALUES ('schema', ?)").run(OVERVIEW_INDEX_VERSION);
    }
  });
  const removeWhere = (where: string, parameters: readonly string[]) => transaction(() => {
    for (const table of ["overview_rows", "overview_libraries"]) db.prepare(`DELETE FROM ${table} WHERE ${where}`).run(...parameters);
  });
  const track = (library: OverviewIndexLibrary) => {
    db.prepare(`INSERT INTO overview_libraries (partition_id, install_id, plugin_id, dirty) VALUES (?, ?, ?, 1)
      ON CONFLICT (partition_id, install_id) DO UPDATE SET plugin_id = excluded.plugin_id`).run(library.partition_id, library.install_id, library.plugin_id);
  };

  return {
    state(partitionId, installId) {
      const row = db.prepare("SELECT dirty FROM overview_libraries WHERE partition_id = ? AND install_id = ?").get(partitionId, installId) as Row | undefined;
      return row ? { dirty: Number(row.dirty) === 1 } : null;
    },
    track,
    markDirty(partitionId, installId) {
      if (installId === undefined) db.prepare("UPDATE overview_libraries SET dirty = 1 WHERE partition_id = ?").run(partitionId);
      else db.prepare("UPDATE overview_libraries SET dirty = 1 WHERE partition_id = ? AND install_id = ?").run(partitionId, installId);
    },
    readLibrary(library) {
      // The attention projection is its owner module's read (OverviewService's `readAttention`), never a table this index names.
      if (library.table === "attention") return null;
      const kinds = library.kinds.filter(kind => (OVERVIEW_KINDS as readonly string[]).includes(kind));
      try {
        lstatSync(library.path);
      } catch (error) {
        // Only a library file that does not exist yet holds nothing; any other error (EACCES, EMFILE, broken parent) leaves the index as it was.
        return (error as NodeJS.ErrnoException | null)?.code === "ENOENT" ? [] : null;
      }
      let source: DatabaseSync;
      try {
        source = openHomeSqliteFile(library.path, { readOnly: true });
      } catch {
        return null;
      }
      try {
        const main = library.table === "main", name = main ? OVERVIEW_MAIN_TABLE : OVERVIEW_TABLE;
        const table = source.prepare("SELECT 1 AS found FROM sqlite_schema WHERE type = 'table' AND name = ?").get(name);
        if (!table) return [];
        const rows: OverviewTableRow[] = [];
        // In the main database every plugin's rows share the table: only this installation's are read, and the column naming it is not kept.
        const select = main ? source.prepare(`SELECT * FROM ${name} WHERE install_id = ? AND kind = ? ORDER BY row_id LIMIT ?`)
          : source.prepare(`SELECT * FROM ${name} WHERE kind = ? ORDER BY row_id LIMIT ?`);
        for (const kind of kinds) {
          const read = (main ? select.all(library.install_id, kind, OVERVIEW_ROW_LIMIT) : select.all(kind, OVERVIEW_ROW_LIMIT)) as Record<string, string | number | null>[];
          rows.push(...read.map(({ install_id: _install, ...columns }) => columns));
        }
        return rows;
      } catch {
        return null;
      } finally {
        source.close();
      }
    },
    replace(library, rows, sortAt) {
      transaction(() => {
        track(library);
        db.prepare("DELETE FROM overview_rows WHERE partition_id = ? AND install_id = ?").run(library.partition_id, library.install_id);
        const insert = db.prepare("INSERT OR REPLACE INTO overview_rows VALUES (?, ?, ?, ?, ?, ?, ?)");
        rows.forEach((row, index) => insert.run(library.partition_id, library.install_id, library.plugin_id, row.kind, row.row_id, JSON.stringify(row.fields), sortAt[index] ?? null));
        db.prepare("UPDATE overview_libraries SET dirty = 0, refreshed_at = ? WHERE partition_id = ? AND install_id = ?")
          .run(new Date().toISOString(), library.partition_id, library.install_id);
      });
    },
    removeInstall(installId, partitionId) {
      if (partitionId === undefined) removeWhere("install_id = ?", [installId]);
      else removeWhere("install_id = ? AND partition_id = ?", [installId, partitionId]);
    },
    removePartition(partitionId) {
      removeWhere("partition_id = ?", [partitionId]);
    },
    rows(query) {
      if (!query.partitions.length || !query.kinds.length) return [];
      const marks = (values: readonly unknown[]) => values.map(() => "?").join(", ");
      return (db.prepare(`SELECT * FROM overview_rows WHERE partition_id IN (${marks(query.partitions)}) AND kind IN (${marks(query.kinds)})
        ORDER BY sort_at IS NULL, sort_at, partition_id, row_id LIMIT ?`).all(...query.partitions, ...query.kinds, query.limit) as Row[])
        .map((row): OverviewIndexStoredRow => ({ partition_id: String(row.partition_id), install_id: String(row.install_id), plugin_id: String(row.plugin_id),
          kind: row.kind as OverviewKind, row_id: String(row.row_id), fields: JSON.parse(String(row.fields_json)) as Record<string, unknown> }));
    },
    close() {
      db.close();
    },
  };
}
