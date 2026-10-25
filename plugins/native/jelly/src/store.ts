import { randomUUID } from "node:crypto";
import { ActionError, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDatabaseTransaction, PluginSqlRow } from "@molis-ai/molis-work-contracts/platform/plugin";
import { applySqliteBaseline, homeSqlitePath, openHomeSqliteDatabase, type HomeStoreDeclaration } from "@molis-ai/molis-work-storage";
import type { JellyCommand, JellyWorkspace } from "@molis-ai/molis-work-contracts/modules/jelly";
import { emptyJellyWorkspace, applyJellyCalendarCommand, validateJellyWorkspace } from "./calendar.js";
import { applyJellyContentCommand, jellyHash, validateJellyContent } from "./content.js";
import { decodeJellyImport, mergeJellyImport } from "./import.js";
import { isJellyFailure, jellyAssert, jellyErrors } from "./error.js";
import { JELLY_DATABASE } from "./database.js";
export { JELLY_DATABASE };

export interface JellyPreview { confirmation_token: string; revision: number; counts: Record<string, number>; warnings: string[] }
function validate(state: JellyWorkspace): void { validateJellyWorkspace(state); validateJellyContent(state); }
function decode(row: PluginSqlRow | null): JellyWorkspace {
  try {
    jellyAssert(row && typeof row.body === "string" && typeof row.checksum === "string" && jellyHash(row.body) === row.checksum, "Jelly 数据校验失败。数据库已保留，未创建空白覆盖。", jellyErrors.corrupt);
    const state = JSON.parse(row.body) as JellyWorkspace; validate(state); jellyAssert(state.revision === row.revision, "Jelly 版本记录不一致", jellyErrors.corrupt); return state;
  } catch (error) { if (isJellyFailure(error) && error.code === "jelly.corrupt") throw error; throw jellyErrors.corrupt(`Jelly 数据无效，已保留原库：${error instanceof Error ? error.message : "无法读取"}`); }
}

export interface JellyStores {
  read<T>(run: (store: JellyStore) => T): T;
  write<T>(caller: ActionExecutionContext, run: (store: JellyStore) => T): Promise<T>;
}
export function ownJellyStores(withStore: <T>(run: (store: JellyStore) => T) => T): JellyStores {
  return { read: withStore, async write(caller, run) { await caller.beforeEffect(); return withStore(store => store.transaction(() => run(store))); } };
}

export class JellyStore {
  constructor(private readonly db: PluginDatabaseTransaction, private readonly atomically: <T>(run: () => T) => T = run => run(), private readonly release: () => void = () => {}) {}
  read(): JellyWorkspace {
    const row = this.db.get("SELECT revision, body, checksum FROM jelly_workspace WHERE singleton = 1");
    if (row) return decode(row);
    jellyAssert(Number(this.db.get("SELECT count(*) AS count FROM jelly_history")?.count ?? 0) === 0, "Jelly 工作区记录缺失，历史数据已保留，未创建空白覆盖。", jellyErrors.corrupt);
    return emptyJellyWorkspace();
  }
  transaction<T>(run: () => T): T { return this.atomically(run); }
  /** First authorized write seeds an empty library; a read never changes personal data. */
  initialize(): void {
    const state = this.read(), body = JSON.stringify(state);
    this.db.run("INSERT OR IGNORE INTO jelly_workspace (singleton, revision, body, checksum) VALUES (1, 0, ?, ?)", [body, jellyHash(body)]);
    for (const note of state.notes) this.db.run("INSERT INTO jelly_note_versions (id, revision) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET revision = MAX(revision, excluded.revision)", [note.id, note.revision]);
  }
  export(): JellyWorkspace { return this.read(); }
  close(): void { this.release(); }
  previewImport(source: unknown): JellyPreview {
    const state = this.read(), imported = decodeJellyImport(source), merged = mergeJellyImport(state, imported.workspace);
    const counts: Record<string, number> = {};
    for (const key of ["categories", "items", "series", "notes", "relations", "task_links"] as const) counts[key] = merged[key].length - state[key].length;
    return this.savePreview("workspace.import", imported.source_hash, state.revision, counts, imported.warnings);
  }
  previewDelete(id: string): JellyPreview {
    const state = this.read(), note = state.notes.find(n => n.id === id); jellyAssert(note, "笔记不存在", jellyErrors.not_found); jellyAssert(note.archived_at, "请先归档，再永久删除笔记");
    return this.savePreview("note.delete", id, state.revision, { notes: 1, relations: state.relations.filter(r => r.note_id === id).length, task_links: state.task_links.filter(l => l.note_id === id).length }, ["笔记及其关联将删除；已排期的日历事项保留。可通过撤销恢复。"]);
  }
  private savePreview(type: string, fingerprint: string, revision: number, counts: Record<string, number>, warnings: string[]): JellyPreview {
    const token = randomUUID(); this.db.run("DELETE FROM jelly_previews WHERE expires_at < ?", [Date.now()]);
    this.db.run("INSERT INTO jelly_previews (token, type, fingerprint, revision, expires_at) VALUES (?, ?, ?, ?, ?)", [token, type, fingerprint, revision, Date.now() + 30 * 60_000]);
    return { confirmation_token: token, revision, counts, warnings };
  }
  execute(command: JellyCommand, expectedRevision?: number): JellyWorkspace {
    jellyAssert(command && typeof command.type === "string", "缺少命令类型");
    return this.atomically(() => {
    try {
      this.initialize();
      const previous = this.read();
      jellyAssert(expectedRevision === undefined || expectedRevision === previous.revision, "Jelly 已在其他窗口修改，请重新载入后重试", jellyErrors.conflict);
      let next = structuredClone(previous), history: { id: number; before_body: string; after_body: string; before_checksum: string; after_checksum: string } | undefined;
      if (command.type === "undo" || command.type === "redo") {
        const query = command.type === "undo" ? "SELECT * FROM jelly_history WHERE undone = 0 ORDER BY id DESC LIMIT 1" : "SELECT * FROM jelly_history WHERE undone = 1 ORDER BY id ASC LIMIT 1";
        history = this.db.get(query) as typeof history;
        jellyAssert(history, command.type === "undo" ? "没有可撤销的操作" : "没有可重做的操作", jellyErrors.no_history);
        const body = command.type === "undo" ? history.before_body : history.after_body, checksum = command.type === "undo" ? history.before_checksum : history.after_checksum;
        jellyAssert(jellyHash(body) === checksum, "历史快照校验失败，未恢复", jellyErrors.corrupt); next = JSON.parse(body) as JellyWorkspace; validate(next);
      } else if (command.type === "workspace.import") {
        const imported = decodeJellyImport(command.source); this.requirePreview(command, imported.source_hash, previous.revision); next = mergeJellyImport(previous, imported.workspace);
      } else {
        if (command.type === "note.delete") this.requirePreview(command, String(command.id), previous.revision);
        const now = new Date().toISOString();
        jellyAssert(applyJellyContentCommand(next, command, now) || applyJellyCalendarCommand(next, command, now), "不支持的 Jelly 命令");
      }
      validate(next);
      if (history) for (const note of next.notes) {
        const high = this.db.get("SELECT revision FROM jelly_note_versions WHERE id = ?", [note.id]) as { revision: number } | undefined;
        note.revision = Math.max(note.revision, high?.revision ?? -1) + 1; note.updated_at = new Date().toISOString();
      }
      if (JSON.stringify(next) === JSON.stringify(previous)) return previous;
      next.revision = previous.revision + 1;
      const before = JSON.stringify(previous), after = JSON.stringify(next);
      const changed = this.db.run("UPDATE jelly_workspace SET revision = ?, body = ?, checksum = ? WHERE singleton = 1 AND revision = ?", [next.revision, after, jellyHash(after), previous.revision]);
      jellyAssert(changed.changes === 1, "Jelly 版本冲突", jellyErrors.conflict);
      if (history) this.db.run("UPDATE jelly_history SET undone = ? WHERE id = ?", [command.type === "undo" ? 1 : 0, history.id]);
      else { this.db.run("DELETE FROM jelly_history WHERE undone = 1"); this.db.run("INSERT INTO jelly_history (command, before_body, after_body, before_checksum, after_checksum, undone) VALUES (?, ?, ?, ?, ?, 0)", [command.type, before, after, jellyHash(before), jellyHash(after)]); }
      for (const note of next.notes) this.db.run("INSERT INTO jelly_note_versions (id, revision) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET revision = MAX(revision, excluded.revision)", [note.id, note.revision]);
      // Read back from SQLite while still in the transaction; bad serialization never becomes committed state.
      decode(this.db.get("SELECT revision, body, checksum FROM jelly_workspace WHERE singleton = 1"));
      return structuredClone(next);
    } catch (error) { if (error instanceof ActionError || isJellyFailure(error)) throw error; throw jellyErrors.invalid(error instanceof Error ? error.message : "Jelly 操作失败"); }
    });
  }
  private requirePreview(command: JellyCommand, fingerprint: string, revision: number): void {
    jellyAssert(typeof command.confirmation_token === "string", "请先预览并确认此操作", jellyErrors.confirmation_required);
    const row = this.db.get("SELECT * FROM jelly_previews WHERE token = ?", [command.confirmation_token]) as { type: string; fingerprint: string; revision: number; expires_at: number } | undefined;
    jellyAssert(row && row.type === command.type && row.fingerprint === fingerprint && row.revision === revision && row.expires_at > Date.now(), "预览已过期或内容已变更，请重新预览", jellyErrors.stale_preview);
    this.db.run("DELETE FROM jelly_previews WHERE token = ?", [command.confirmation_token]);
  }
}

export function openJellyStore(home: string): JellyStore {
  const db = openHomeSqliteDatabase(home, JELLY_HOME_STORE.path);
  try {
    db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
    applySqliteBaseline(db, homeSqlitePath(home, JELLY_HOME_STORE.path), JELLY_DATABASE);
    const sql: PluginDatabaseTransaction = {
      get: (query, parameters = []) => db.prepare(query).get(...parameters) ?? null,
      all: (query, parameters = []) => db.prepare(query).all(...parameters),
      run: (query, parameters = []) => db.prepare(query).run(...parameters),
      savepoint: <T>(body: () => { readonly keep: boolean; readonly value: T }): T => {
        const name = "jelly_savepoint";
        db.exec(`SAVEPOINT ${name}`);
        try {
          const result = body();
          if (!result.keep) db.exec(`ROLLBACK TO ${name}`);
          db.exec(`RELEASE ${name}`);
          return result.value;
        } catch (error) { db.exec(`ROLLBACK TO ${name}`); db.exec(`RELEASE ${name}`); throw error; }
      },
    };
    const atomically = <T>(run: () => T): T => {
      if (db.isTransaction) return run();
      db.exec("BEGIN IMMEDIATE");
      try { const result = run(); db.exec("COMMIT"); return result; }
      catch (error) { db.exec("ROLLBACK"); throw error; }
    };
    const store = new JellyStore(sql, atomically, () => db.close());
    atomically(() => store.initialize());
    return store;
  } catch (error) { db.close(); throw error; }
}

/** This plugin's store in the Home's store registry (W4-11): `jelly/jelly.db` at its one baseline. */
export const JELLY_HOME_STORE: HomeStoreDeclaration = { path: "jelly", library: { baseline: JELLY_DATABASE } };
