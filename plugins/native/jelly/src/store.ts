import { randomUUID } from "node:crypto";
import { ActionError, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDatabaseTransaction, PluginSqlRow } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { JellyCommand, JellyWorkspace } from "./contract.js";
import { emptyJellyWorkspace, editJellyCalendarCommand, validateJellyWorkspace } from "./calendar.js";
import { editJellyContentCommand, jellyHash, validateJellyContent } from "./content.js";
import { decodeJellyImport, mergeJellyImport } from "./import.js";
import { isJellyFailure, jellyAssert, jellyErrors } from "./error.js";
import { JELLY_DATABASE } from "./database.js";
import { JellyWorkspaceEdit, validateJellyEdit } from "./workspace-edit.js";
export { JELLY_DATABASE };

export interface JellyPreview { confirmation_token: string; revision: number; counts: Record<string, number>; warnings: string[] }
function validate(state: JellyWorkspace): void { validateJellyWorkspace(state); validateJellyContent(state); }
function decode(row: PluginSqlRow): { state: JellyWorkspace; body: string } {
  try {
    const { body, checksum, revision } = row;
    jellyAssert(typeof body === "string" && typeof checksum === "string" && jellyHash(body) === checksum, "Jelly 数据校验失败。数据库已保留，未创建空白覆盖。", jellyErrors.corrupt);
    const state: JellyWorkspace = JSON.parse(body);
    validate(state);
    jellyAssert(state.revision === revision, "Jelly 版本记录不一致", jellyErrors.corrupt);
    return { state, body };
  } catch (error) {
    if (isJellyFailure(error) && error.code === "jelly.corrupt") throw error;
    throw jellyErrors.corrupt(`Jelly 数据无效，已保留原库：${error instanceof Error ? error.message : "无法读取"}`);
  }
}

const WORKSPACE_QUERY = "SELECT revision, body, checksum FROM jelly_workspace WHERE singleton = 1";

export interface JellyStores {
  read<T>(run: (store: JellyStore) => T): T;
  write<T>(caller: ActionExecutionContext, run: (store: JellyStore) => T): Promise<T>;
}

export class JellyStore {
  constructor(private readonly db: PluginDatabaseTransaction, private readonly atomically: <T>(run: () => T) => T = run => run(), private readonly release: () => void = () => {}) {}
  private load(): { state: JellyWorkspace; body: string | null } {
    const row = this.db.get(WORKSPACE_QUERY);
    if (row) return decode(row);
    jellyAssert(Number(this.db.get("SELECT count(*) AS count FROM jelly_history")?.count ?? 0) === 0, "Jelly 工作区记录缺失，历史数据已保留，未创建空白覆盖。", jellyErrors.corrupt);
    return { state: emptyJellyWorkspace(), body: null };
  }
  read(): JellyWorkspace { return this.load().state; }
  transaction<T>(run: () => T): T { return this.atomically(run); }
  /** First authorized write seeds an empty library; a read never changes personal data. */
  initialize(): void {
    const { state, body } = this.load();
    if (body === null) this.seedWorkspace(JSON.stringify(state));
    for (const note of state.notes) this.recordNoteVersion(note.id, note.revision);
  }
  private seedWorkspace(body: string): void {
    this.db.run("INSERT OR IGNORE INTO jelly_workspace (singleton, revision, body, checksum) VALUES (1, 0, ?, ?)", [body, jellyHash(body)]);
  }
  private recordNoteVersion(id: string, revision: number): void {
    this.db.run("INSERT INTO jelly_note_versions (id, revision) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET revision = MAX(revision, excluded.revision)", [id, revision]);
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
    return this.atomically(() => {
      try {
        const { state, body } = this.load();
        const revision = state.revision;
        jellyAssert(expectedRevision === undefined || expectedRevision === revision, "Jelly 已在其他窗口修改，请重新载入后重试", jellyErrors.conflict);
        const before = JSON.stringify(state);
        const noteVersions = new Map(state.notes.map(note => [note.id, note.revision]));
        if (body === null) this.seedWorkspace(before);

        let next = state;
        let historyId: number | undefined;
        if (command.type === "undo" || command.type === "redo") {
          const history = this.loadHistory(command.type);
          next = history.state;
          historyId = history.id;
          for (const note of next.notes) {
            const high = this.db.get("SELECT revision FROM jelly_note_versions WHERE id = ?", [note.id])?.revision;
            jellyAssert(high === undefined || (typeof high === "number" && Number.isSafeInteger(high) && high >= 0), "笔记版本记录无效", jellyErrors.corrupt);
            note.revision = Math.max(note.revision, noteVersions.get(note.id) ?? -1, high ?? -1) + 1;
            note.updated_at = new Date().toISOString();
          }
        } else if (command.type === "workspace.import") {
          const imported = decodeJellyImport(command.source);
          this.requirePreview(command, imported.source_hash, revision);
          next = mergeJellyImport(state, imported.workspace);
        } else {
          if (command.type === "note.delete") this.requirePreview(command, String(command.id), revision);
          const now = new Date().toISOString();
          const edit = new JellyWorkspaceEdit();
          // Own the command's nested values as well as the parsed database state.
          const input = structuredClone(command);
          jellyAssert(editJellyContentCommand(next, input, now, edit) || editJellyCalendarCommand(next, input, now, edit), "不支持的 Jelly 命令");
          validateJellyEdit(next, edit);
        }

        if (JSON.stringify(next) === before) return JSON.parse(body ?? before);
        next.revision = revision + 1;
        jellyAssert(Number.isSafeInteger(next.revision), "Jelly 数据无效，已保留原库：工作区版本无效", jellyErrors.corrupt);
        const after = JSON.stringify(next), checksum = jellyHash(after);
        if (historyId !== undefined || command.type === "workspace.import") decode({ revision: next.revision, body: after, checksum });

        const changed = this.db.run("UPDATE jelly_workspace SET revision = ?, body = ?, checksum = ? WHERE singleton = 1 AND revision = ?", [next.revision, after, checksum, revision]);
        jellyAssert(changed.changes === 1, "Jelly 版本冲突", jellyErrors.conflict);
        if (historyId !== undefined) this.db.run("UPDATE jelly_history SET undone = ? WHERE id = ?", [command.type === "undo" ? 1 : 0, historyId]);
        else {
          this.db.run("DELETE FROM jelly_history WHERE undone = 1");
          this.db.run("INSERT INTO jelly_history (command, before_body, after_body, before_checksum, after_checksum, undone) VALUES (?, ?, ?, ?, ?, 0)", [command.type, before, after, jellyHash(before), checksum]);
        }
        for (const note of next.notes) {
          if (noteVersions.get(note.id) !== note.revision) this.recordNoteVersion(note.id, note.revision);
          noteVersions.delete(note.id);
        }
        // Preserve the revision of removed notes for restoration, even if the old row was missing.
        for (const [id, version] of noteVersions) this.recordNoteVersion(id, version);
        const stored = this.db.get(WORKSPACE_QUERY);
        jellyAssert(stored?.revision === next.revision && stored.body === after && stored.checksum === checksum, "Jelly 数据校验失败。数据库已保留，未创建空白覆盖。", jellyErrors.corrupt);
        return next;
      } catch (error) {
        if (error instanceof ActionError || isJellyFailure(error)) throw error;
        throw jellyErrors.invalid(error instanceof Error ? error.message : "Jelly 操作失败");
      }
    });
  }
  private loadHistory(type: "undo" | "redo"): { state: JellyWorkspace; id: number } {
    const query = type === "undo" ? "SELECT * FROM jelly_history WHERE undone = 0 ORDER BY id DESC LIMIT 1" : "SELECT * FROM jelly_history WHERE undone = 1 ORDER BY id ASC LIMIT 1";
    const history = this.db.get(query);
    jellyAssert(history, type === "undo" ? "没有可撤销的操作" : "没有可重做的操作", jellyErrors.no_history);
    const body = type === "undo" ? history.before_body : history.after_body;
    const checksum = type === "undo" ? history.before_checksum : history.after_checksum;
    jellyAssert(typeof body === "string" && typeof history.id === "number" && jellyHash(body) === checksum, "历史快照校验失败，未恢复", jellyErrors.corrupt);
    const state: JellyWorkspace = JSON.parse(body);
    validate(state);
    return { state, id: history.id };
  }
  private requirePreview(command: JellyCommand, fingerprint: string, revision: number): void {
    jellyAssert(typeof command.confirmation_token === "string", "请先预览并确认此操作", jellyErrors.confirmation_required);
    const row = this.db.get("SELECT * FROM jelly_previews WHERE token = ?", [command.confirmation_token]) as { type: string; fingerprint: string; revision: number; expires_at: number } | undefined;
    jellyAssert(row && row.type === command.type && row.fingerprint === fingerprint && row.revision === revision && row.expires_at > Date.now(), "预览已过期或内容已变更，请重新预览", jellyErrors.stale_preview);
    this.db.run("DELETE FROM jelly_previews WHERE token = ?", [command.confirmation_token]);
  }
}
