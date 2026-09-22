import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import type { JellyCommand, JellyWorkspace } from "@molis-ai/molis-work-contracts/modules/jelly";
import { emptyJellyWorkspace, applyJellyCalendarCommand, validateJellyWorkspace } from "./calendar.js";
import { applyJellyContentCommand, jellyHash, validateJellyContent } from "./content.js";
import { decodeJellyImport, mergeJellyImport } from "./import.js";
import { JellyError, jellyAssert } from "./error.js";

interface Row { revision: number; body: string; checksum: string }
export interface JellyPreview { confirmation_token: string; revision: number; counts: Record<string, number>; warnings: string[] }
function validate(state: JellyWorkspace): void { validateJellyWorkspace(state); validateJellyContent(state); }
function decode(row: Row): JellyWorkspace {
  try {
    jellyAssert(row && jellyHash(row.body) === row.checksum, "Jelly 数据校验失败。数据库已保留，未创建空白覆盖。", "jelly.corrupt", 500);
    const state = JSON.parse(row.body) as JellyWorkspace; validate(state); jellyAssert(state.revision === row.revision, "Jelly 版本记录不一致", "jelly.corrupt", 500); return state;
  } catch (error) { if (error instanceof JellyError && error.code === "jelly.corrupt") throw error; throw new JellyError("jelly.corrupt", `Jelly 数据无效，已保留原库：${error instanceof Error ? error.message : "无法读取"}`, 500); }
}

export class JellyStore {
  constructor(private readonly db: DatabaseSync) {}
  read(): JellyWorkspace { const row = this.db.prepare("SELECT revision, body, checksum FROM jelly_workspace WHERE singleton = 1").get() as unknown as Row; return decode(row); }
  export(): JellyWorkspace { return this.read(); }
  close(): void { this.db.close(); }
  previewImport(source: unknown): JellyPreview {
    const state = this.read(), imported = decodeJellyImport(source), merged = mergeJellyImport(state, imported.workspace);
    const counts: Record<string, number> = {};
    for (const key of ["categories", "items", "series", "notes", "inspirations", "relations", "task_links"] as const) counts[key] = merged[key].length - state[key].length;
    return this.savePreview("workspace.import", imported.source_hash, state.revision, counts, imported.warnings);
  }
  previewDelete(id: string): JellyPreview {
    const state = this.read(), note = state.notes.find(n => n.id === id); jellyAssert(note, "笔记不存在", "jelly.not_found", 404); jellyAssert(note.archived_at, "请先归档，再永久删除笔记");
    return this.savePreview("note.delete", id, state.revision, { notes: 1, relations: state.relations.filter(r => r.note_id === id).length, task_links: state.task_links.filter(l => l.note_id === id).length }, ["笔记及其关联将删除；已排期的日历事项保留。可通过撤销恢复。"]);
  }
  previewDeleteInspiration(id: string): JellyPreview {
    const state = this.read(), inspiration = state.inspirations.find(entry => entry.id === id);
    jellyAssert(inspiration, "灵感不存在", "jelly.not_found", 404); jellyAssert(inspiration.archived_at, "请先归档，再永久删除灵感");
    return this.savePreview("inspiration.delete", id, state.revision, { inspirations: 1, notes: 0 }, ["灵感和其中的素材摘要将删除；已经转成的笔记会保留。可通过撤销恢复。"]);
  }
  private savePreview(type: string, fingerprint: string, revision: number, counts: Record<string, number>, warnings: string[]): JellyPreview {
    const token = randomUUID(); this.db.prepare("DELETE FROM jelly_previews WHERE expires_at < ?").run(Date.now());
    this.db.prepare("INSERT INTO jelly_previews (token, type, fingerprint, revision, expires_at) VALUES (?, ?, ?, ?, ?)").run(token, type, fingerprint, revision, Date.now() + 30 * 60_000);
    return { confirmation_token: token, revision, counts, warnings };
  }
  execute(command: JellyCommand, expectedRevision?: number): JellyWorkspace {
    jellyAssert(command && typeof command.type === "string", "缺少命令类型");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const previous = this.read();
      jellyAssert(expectedRevision === undefined || expectedRevision === previous.revision, "Jelly 已在其他窗口修改，请重新载入后重试", "jelly.conflict", 409);
      let next = structuredClone(previous), history: { id: number; before_body: string; after_body: string; before_checksum: string; after_checksum: string } | undefined;
      if (command.type === "undo" || command.type === "redo") {
        const query = command.type === "undo" ? "SELECT * FROM jelly_history WHERE undone = 0 ORDER BY id DESC LIMIT 1" : "SELECT * FROM jelly_history WHERE undone = 1 ORDER BY id ASC LIMIT 1";
        history = this.db.prepare(query).get() as unknown as typeof history;
        jellyAssert(history, command.type === "undo" ? "没有可撤销的操作" : "没有可重做的操作", "jelly.no_history", 409);
        const body = command.type === "undo" ? history.before_body : history.after_body, checksum = command.type === "undo" ? history.before_checksum : history.after_checksum;
        jellyAssert(jellyHash(body) === checksum, "历史快照校验失败，未恢复", "jelly.corrupt", 500); next = JSON.parse(body) as JellyWorkspace; validate(next);
      } else if (command.type === "workspace.import") {
        const imported = decodeJellyImport(command.source); this.requirePreview(command, imported.source_hash, previous.revision); next = mergeJellyImport(previous, imported.workspace);
      } else {
        if (command.type === "note.delete" || command.type === "inspiration.delete") this.requirePreview(command, String(command.id), previous.revision);
        const now = new Date().toISOString();
        jellyAssert(applyJellyContentCommand(next, command, now) || applyJellyCalendarCommand(next, command, now), "不支持的 Jelly 命令");
      }
      validate(next);
      if (history) for (const note of next.notes) {
        const high = this.db.prepare("SELECT revision FROM jelly_note_versions WHERE id = ?").get(note.id) as { revision: number } | undefined;
        note.revision = Math.max(note.revision, high?.revision ?? -1) + 1; note.updated_at = new Date().toISOString();
      }
      if (JSON.stringify(next) === JSON.stringify(previous)) { this.db.exec("COMMIT"); return previous; }
      next.revision = previous.revision + 1;
      const before = JSON.stringify(previous), after = JSON.stringify(next);
      const changed = this.db.prepare("UPDATE jelly_workspace SET revision = ?, body = ?, checksum = ? WHERE singleton = 1 AND revision = ?").run(next.revision, after, jellyHash(after), previous.revision);
      jellyAssert(changed.changes === 1, "Jelly 版本冲突", "jelly.conflict", 409);
      if (history) this.db.prepare("UPDATE jelly_history SET undone = ? WHERE id = ?").run(command.type === "undo" ? 1 : 0, history.id);
      else { this.db.prepare("DELETE FROM jelly_history WHERE undone = 1").run(); this.db.prepare("INSERT INTO jelly_history (command, before_body, after_body, before_checksum, after_checksum, undone) VALUES (?, ?, ?, ?, ?, 0)").run(command.type, before, after, jellyHash(before), jellyHash(after)); }
      for (const note of next.notes) this.db.prepare("INSERT INTO jelly_note_versions (id, revision) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET revision = MAX(revision, excluded.revision)").run(note.id, note.revision);
      // Read back from SQLite while still in the transaction; bad serialization never becomes committed state.
      decode(this.db.prepare("SELECT revision, body, checksum FROM jelly_workspace WHERE singleton = 1").get() as unknown as Row);
      this.db.exec("COMMIT"); return structuredClone(next);
    } catch (error) { this.db.exec("ROLLBACK"); if (error instanceof JellyError) throw error; throw new JellyError("jelly.invalid", error instanceof Error ? error.message : "Jelly 操作失败"); }
  }
  private requirePreview(command: JellyCommand, fingerprint: string, revision: number): void {
    jellyAssert(typeof command.confirmation_token === "string", "请先预览并确认此操作", "jelly.confirmation_required", 409);
    const row = this.db.prepare("SELECT * FROM jelly_previews WHERE token = ?").get(command.confirmation_token) as { type: string; fingerprint: string; revision: number; expires_at: number } | undefined;
    jellyAssert(row && row.type === command.type && row.fingerprint === fingerprint && row.revision === revision && row.expires_at > Date.now(), "预览已过期或内容已变更，请重新预览", "jelly.stale_preview", 409);
    this.db.prepare("DELETE FROM jelly_previews WHERE token = ?").run(command.confirmation_token);
  }
}
export function openJellyStore(home: string): JellyStore {
  const db = openHomeSqliteDatabase(home, "jelly");
  try {
    db.exec(`PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS jelly_workspace (singleton INTEGER PRIMARY KEY CHECK(singleton = 1), revision INTEGER NOT NULL, body TEXT NOT NULL, checksum TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS jelly_note_versions (id TEXT PRIMARY KEY, revision INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS jelly_history (id INTEGER PRIMARY KEY AUTOINCREMENT, command TEXT NOT NULL, before_body TEXT NOT NULL, after_body TEXT NOT NULL, before_checksum TEXT NOT NULL, after_checksum TEXT NOT NULL, undone INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS jelly_previews (token TEXT PRIMARY KEY, type TEXT NOT NULL, fingerprint TEXT NOT NULL, revision INTEGER NOT NULL, expires_at INTEGER NOT NULL);`);
    const existing = db.prepare("SELECT singleton FROM jelly_workspace WHERE singleton = 1").get();
    jellyAssert(existing || Number(db.prepare("SELECT count(*) AS count FROM jelly_history").get()?.count ?? 0) === 0, "Jelly 工作区记录缺失，历史数据已保留，未创建空白覆盖。", "jelly.corrupt", 500);
    const initial = emptyJellyWorkspace(), body = JSON.stringify(initial); db.prepare("INSERT OR IGNORE INTO jelly_workspace (singleton, revision, body, checksum) VALUES (1, 0, ?, ?)").run(body, jellyHash(body));
    const store = new JellyStore(db); const saved = store.read(); for (const note of saved.notes) db.prepare("INSERT INTO jelly_note_versions (id, revision) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET revision = MAX(revision, excluded.revision)").run(note.id, note.revision); return store;
  } catch (error) { db.close(); throw error; }
}
