import { applySqliteBaseline, homeSqlitePath, openHomeSqliteDatabase, type SqliteBaseline } from "@molis-ai/molis-work-storage";
import type { DatabaseSync } from "node:sqlite";
import {
  TODO_STATUSES,
  TODO_SUBJECT_KIND,
  type TodoActorKind,
  type TodoChange,
  type TodoEditableField,
  type TodoItem,
  type TodoLink,
  type TodoLinkKind,
  type TodoPlacement,
  type TodoRelation,
  type TodoSource,
  type TodoStatus,
  type TodoWaiting,
} from "@molis-ai/molis-work-contracts/modules/todo";
import { addDays, isTodoDate, isTodoInstant, isTodoTime } from "./dates.js";
import { TodoError } from "./error.js";

/**
 * Who is asking and what they may see. A caller inside a project sees personal, unplaced and that
 * project's todos; `everything` (the person's own Todo page) also sees other projects'.
 */
export interface TodoAccess {
  readonly projectId: string | null;
  readonly everything: boolean;
  readonly actor: TodoActorKind;
  readonly actorId: string;
}

export interface TodoFields {
  readonly title?: string;
  readonly notes?: string;
  readonly due_date?: string | null;
  readonly due_time?: string | null;
  readonly planned_date?: string | null;
  readonly remind_at?: string | null;
  readonly placement?: TodoPlacement;
  readonly important?: boolean;
  readonly waiting?: TodoWaiting | null;
}

export interface TodoCreateInput extends TodoFields {
  readonly title: string;
  readonly status?: TodoStatus;
  readonly sources?: readonly Omit<TodoSource, "source_id" | "added_at">[];
  readonly request_id?: string;
}

export type TodoBatchChange =
  | { readonly status: TodoStatus }
  | { readonly planned_date: string | null }
  | { readonly due_date: string | null }
  | { readonly shift_days: number }
  | { readonly placement: TodoPlacement }
  | { readonly archive: boolean };

export type TodoLinkInput = Omit<TodoLink, "link_id" | "added_at">;

interface ItemRow {
  id: string; title: string; notes: string; status: string; placement: string; project_id: string | null;
  due_date: string | null; due_time: string | null; planned_date: string | null; remind_at: string | null;
  important: number; reminder_acknowledged_at: string | null; waiting_json: string | null; sources_json: string; links_json: string; edited_fields_json: string;
  archived_at: string | null; completed_at: string | null; created_at: string; updated_at: string; revision: number;
}
interface ChangeRow {
  change_id: string; item_id: string; batch_id: string | null; kind: string; actor: string; at: string;
  before_json: string | null; after_json: string; revision_after: number; reverted_by: string | null;
}

const EDITABLE: readonly TodoEditableField[] = ["title", "notes", "due_date", "due_time", "planned_date", "remind_at", "placement", "important", "waiting"];
const LINK_KINDS: readonly TodoLinkKind[] = ["goal", "material", "todo", "outcome", "work"];
const RELATIONS: readonly TodoRelation[] = ["blocked_by", "blocks", "split_from", "merged", "related"];
const SOURCE_KINDS: readonly TodoSource["kind"][] = ["manual", "material", "assistant", "onboarding", "inbox", "lingguang"];
const MAX_BATCH = 200;

/**
 * What makes two requests one: who asked, from which project (or none), and the id they chose. The store is one
 * Home-wide database and callers choose their own ids, so the id alone would hand one caller another caller's todo.
 * Both the todo receipts and the organizer's batches keep requests under this key.
 */
export function todoRequestKey(access: Pick<TodoAccess, "actorId" | "projectId">, requestId: string | undefined): string | null {
  const id = requestId?.trim();
  return id ? JSON.stringify([access.actorId, access.projectId, id]) : null;
}

export class TodoStore {
  constructor(private readonly db: DatabaseSync, private readonly now: () => Date = () => new Date()) {}

  close(): void {
    this.db.close();
  }

  /** Every todo this caller may see; views and search filter from here. */
  list(access: TodoAccess): TodoItem[] {
    const rows = this.db.prepare("SELECT * FROM todo_items ORDER BY created_at").all() as unknown as ItemRow[];
    return rows.map(fromRow).filter(item => visible(item, access));
  }

  get(id: string, access: TodoAccess): TodoItem {
    const row = this.db.prepare("SELECT * FROM todo_items WHERE id = ?").get(id) as ItemRow | undefined;
    const item = row ? fromRow(row) : null;
    if (!item || !visible(item, access)) throw new TodoError("todo.not_found", "找不到这件待办，可能已被删除");
    return item;
  }

  /** Other todos whose links point at this one, so the relation reads from both ends. */
  backlinks(id: string, access: TodoAccess): { item: TodoItem; link: TodoLink }[] {
    return this.list(access).flatMap(item => item.links
      .filter(link => link.kind === "todo" && link.subject.id === id)
      .map(link => ({ item, link })));
  }

  history(id: string, access: TodoAccess): TodoChange[] {
    this.get(id, access);
    const rows = this.db.prepare("SELECT * FROM todo_changes WHERE item_id = ? ORDER BY at DESC, rowid DESC LIMIT 100").all(id) as unknown as ChangeRow[];
    return rows.map(changeFromRow);
  }

  create(input: TodoCreateInput, access: TodoAccess, batchId: string | null = null): { item: TodoItem; change_id: string; replayed: boolean } {
    const requestKey = todoRequestKey(access, input.request_id);
    if (requestKey) {
      const seen = this.db.prepare("SELECT item_id FROM todo_requests WHERE request_id = ?").get(requestKey) as { item_id: string } | undefined;
      if (seen) {
        const change = this.db.prepare("SELECT change_id FROM todo_changes WHERE item_id = ? AND kind = 'create'").get(seen.item_id) as { change_id: string } | undefined;
        return { item: this.get(seen.item_id, access), change_id: change?.change_id ?? "", replayed: true };
      }
    }
    const at = this.now().toISOString();
    const fields = normalizeFields(input, null, access);
    const status = input.status ?? (fields.waiting ? "waiting" : "open");
    if (!TODO_STATUSES.includes(status)) throw invalid("状态无效");
    const sources = normalizeSources(input.sources, access, at);
    const item: TodoItem = {
      id: crypto.randomUUID(),
      title: fields.title ?? "",
      notes: fields.notes ?? "",
      status,
      placement: fields.placement ?? (access.projectId ? "unassigned" : "personal"),
      project_id: fields.project_id ?? null,
      due_date: fields.due_date ?? null,
      due_time: fields.due_time ?? null,
      planned_date: fields.planned_date ?? null,
      remind_at: fields.remind_at ?? null,
      reminder_acknowledged_at: null,
      important: fields.important ?? false,
      waiting: fields.waiting ?? null,
      sources,
      links: [],
      edited_fields: [],
      archived_at: null,
      completed_at: status === "done" ? at : null,
      created_at: at,
      updated_at: at,
      revision: 1,
    };
    if (!item.title) throw invalid("请写下要做什么");
    if (item.due_time && !item.due_date) throw invalid("有截止时间时要同时有截止日期");
    const changeId = crypto.randomUUID();
    this.transaction(() => {
      this.insert(item);
      this.record({ change_id: changeId, item_id: item.id, batch_id: batchId, kind: "create", actor: access.actor, at, before: null,
        after: { title: item.title }, revision_after: 1 });
      if (requestKey) this.db.prepare("INSERT INTO todo_requests (request_id, item_id, created_at) VALUES (?, ?, ?)").run(requestKey, item.id, at);
    });
    return { item, change_id: changeId, replayed: false };
  }

  update(id: string, patch: TodoFields, expectedRevision: number | undefined, access: TodoAccess, batchId: string | null = null): { item: TodoItem; change_id: string | null } {
    let result!: { item: TodoItem; change_id: string | null };
    this.transaction(() => { result = this.applyUpdate(id, patch, expectedRevision, access, batchId); });
    return result;
  }

  /**
   * Moves a todo on the person's word from the placement panel: into a project (any, by id) or back to the personal
   * space (`null`; an unplaced todo stays unplaced). Recorded like an edit, so it shows in the history and can be undone.
   */
  move(id: string, toProjectId: string | null, access: TodoAccess): { item: TodoItem; change_id: string | null } {
    let result!: { item: TodoItem; change_id: string | null };
    this.transaction(() => { result = this.applyUpdate(id, {}, undefined, access, null, { to: toProjectId }); });
    return result;
  }

  setStatus(id: string, status: TodoStatus, expectedRevision: number | undefined, access: TodoAccess, batchId: string | null = null): { item: TodoItem; change_id: string | null } {
    let result!: { item: TodoItem; change_id: string | null };
    this.transaction(() => { result = this.applyStatus(id, status, expectedRevision, access, batchId); });
    return result;
  }

  setArchived(id: string, archived: boolean, expectedRevision: number | undefined, access: TodoAccess): { item: TodoItem; change_id: string | null } {
    let result!: { item: TodoItem; change_id: string | null };
    this.transaction(() => { result = this.applyArchive(id, archived, expectedRevision, access, null); });
    return result;
  }

  /**
   * Reminders whose time has come and that the person has not acknowledged, for todos still open. A reminder
   * older than the stale window is not delivered late; `late` marks one that passed while nobody was looking.
   */
  dueReminders(access: TodoAccess, now: Date = this.now(), staleHours = 48): { item: TodoItem; late: boolean }[] {
    const at = now.getTime();
    return this.list(access)
      .filter(item => item.remind_at && item.reminder_acknowledged_at === null && item.archived_at === null
        && ["open", "doing", "waiting"].includes(item.status))
      .map(item => ({ item, time: Date.parse(item.remind_at!) }))
      .filter(entry => entry.time <= at && entry.time >= at - staleHours * 3_600_000)
      .sort((a, b) => a.time - b.time)
      .map(entry => ({ item: entry.item, late: entry.time < at - 30 * 60_000 }));
  }

  /** “知道了”: this reminder stops showing. Not a change to the todo itself, so its revision stays. */
  acknowledgeReminder(id: string, access: TodoAccess): TodoItem {
    const current = this.get(id, access);
    if (!current.remind_at) throw new TodoError("todo.invalid", "这件待办没有提醒");
    if (current.reminder_acknowledged_at) return current;
    const at = this.now().toISOString();
    this.db.prepare("UPDATE todo_items SET reminder_acknowledged_at = ? WHERE id = ? AND revision = ?").run(at, id, current.revision);
    return { ...current, reminder_acknowledged_at: at };
  }

  /** Permanent: the item, its history and the request receipts that pointed at it are removed. */
  delete(id: string, expectedRevision: number | undefined, access: TodoAccess): void {
    const current = this.get(id, access);
    assertRevision(current, expectedRevision);
    this.transaction(() => {
      this.db.prepare("DELETE FROM todo_changes WHERE item_id = ?").run(id);
      this.db.prepare("DELETE FROM todo_requests WHERE item_id = ?").run(id);
      const removed = this.db.prepare("DELETE FROM todo_items WHERE id = ? AND revision = ?").run(id, current.revision);
      if (removed.changes !== 1) throw conflict();
    });
  }

  link(id: string, change: { add?: TodoLinkInput; remove_link_id?: string }, expectedRevision: number | undefined, access: TodoAccess, batchId: string | null = null): { item: TodoItem; change_id: string } {
    const current = this.get(id, access);
    assertRevision(current, expectedRevision);
    let links = [...current.links];
    let after: Record<string, unknown>;
    let before: Record<string, unknown>;
    if (change.add) {
      const link = this.normalizeLink(change.add, id, access);
      const duplicate = links.find(existing => existing.kind === link.kind && existing.subject.kind === link.subject.kind && existing.subject.id === link.subject.id);
      if (duplicate) throw new TodoError("todo.invalid", "已经关联过了");
      if (links.length >= 50) throw invalid("一件待办最多关联 50 项");
      links.push(link);
      before = { link_removed: null };
      after = { link_added: link };
    } else if (change.remove_link_id) {
      const link = links.find(existing => existing.link_id === change.remove_link_id);
      if (!link) throw new TodoError("todo.not_found", "这项关联已经不在了");
      links = links.filter(existing => existing.link_id !== change.remove_link_id);
      before = { link_added: link };
      after = { link_removed: link.link_id };
    } else throw invalid("要添加或去掉一项关联");
    const at = this.now().toISOString();
    const next: TodoItem = { ...current, links, updated_at: at, revision: current.revision + 1 };
    const changeId = crypto.randomUUID();
    this.transaction(() => {
      this.write(current, next);
      this.record({ change_id: changeId, item_id: id, batch_id: batchId, kind: "link", actor: access.actor, at, before, after, revision_after: next.revision });
    });
    return { item: next, change_id: changeId };
  }

  /** A further source for a todo that already exists (the same thing, seen again elsewhere). */
  addSource(id: string, source: Omit<TodoSource, "source_id" | "added_at">, access: TodoAccess, batchId: string | null = null): { item: TodoItem; change_id: string } {
    const current = this.get(id, access);
    const at = this.now().toISOString();
    const [added] = normalizeSources([source], access, at);
    if (current.sources.length >= 50) throw invalid("一件待办最多记 50 个来源");
    const next: TodoItem = { ...current, sources: [...current.sources, added!], updated_at: at, revision: current.revision + 1 };
    const changeId = crypto.randomUUID();
    this.transaction(() => {
      this.write(current, next);
      this.record({ change_id: changeId, item_id: id, batch_id: batchId, kind: "source", actor: access.actor, at, before: { source_removed: null }, after: { source_added: added }, revision_after: next.revision });
    });
    return { item: next, change_id: changeId };
  }

  /** Run several store operations as one transaction (organizing applies a person's choices this way). */
  inTransaction<T>(run: () => T): T {
    let result!: T;
    this.transaction(() => { result = run(); });
    return result;
  }

  /** The same database, for the organizing records that live beside the todos. */
  database(): DatabaseSync {
    return this.db;
  }

  clock(): Date {
    return this.now();
  }

  /** One change applied to several todos, all or nothing; undone together through its batch id. */
  batch(ids: readonly string[], change: TodoBatchChange, expected: Readonly<Record<string, number>> | undefined, access: TodoAccess): { items: TodoItem[]; batch_id: string } {
    const unique = [...new Set(ids)];
    if (!unique.length) throw invalid("先选中要处理的待办");
    if (unique.length > MAX_BATCH) throw invalid(`一次最多处理 ${MAX_BATCH} 件`);
    const batchId = crypto.randomUUID();
    const items: TodoItem[] = [];
    this.transaction(() => {
      for (const id of unique) {
        const revision = expected?.[id];
        if ("status" in change) items.push(this.applyStatus(id, change.status, revision, access, batchId).item);
        else if ("archive" in change) items.push(this.applyArchive(id, change.archive, revision, access, batchId).item);
        else if ("shift_days" in change) {
          if (!Number.isInteger(change.shift_days) || Math.abs(change.shift_days) > 366) throw invalid("推后的天数无效");
          const current = this.get(id, access);
          const from = current.planned_date ?? current.due_date;
          if (!from) { items.push(current); continue; }
          const patch: TodoFields = current.planned_date ? { planned_date: addDays(current.planned_date, change.shift_days) } : { due_date: addDays(from, change.shift_days) };
          items.push(this.applyUpdate(id, patch, revision, access, batchId).item);
        } else items.push(this.applyUpdate(id, change, revision, access, batchId).item);
      }
    });
    return { items, batch_id: batchId };
  }

  /**
   * Undo one change, or every change of a batch. Refused when the todo changed afterwards, so an undo
   * never throws away a later edit. Undoing a create removes the todo it created.
   */
  revert(target: { change_id?: string; batch_id?: string }, access: TodoAccess): { items: TodoItem[]; removed_ids: string[] } {
    const rows = target.batch_id
      ? this.db.prepare("SELECT * FROM todo_changes WHERE batch_id = ? ORDER BY rowid").all(target.batch_id) as unknown as ChangeRow[]
      : this.db.prepare("SELECT * FROM todo_changes WHERE change_id = ?").all(target.change_id ?? "") as unknown as ChangeRow[];
    if (!rows.length) throw new TodoError("todo.not_found", "找不到要撤销的修改");
    const changes = rows.map(changeFromRow);
    if (changes.some(change => change.reverted_by)) throw new TodoError("todo.conflict", "这次修改已经撤销过了");
    if (changes.some(change => change.kind === "revert")) throw invalid("撤销本身不能再撤销，请直接修改");
    // One todo may have several changes in a batch (created, then linked); they are undone together, newest first.
    const groups = new Map<string, TodoChange[]>();
    for (const change of changes) groups.set(change.item_id, [...(groups.get(change.item_id) ?? []), change]);
    const items: TodoItem[] = [];
    const removed: string[] = [];
    this.transaction(() => {
      for (const [itemId, group] of groups) {
        const current = this.get(itemId, access);
        const latest = Math.max(...group.map(change => change.revision_after));
        if (current.revision !== latest) throw new TodoError("todo.conflict", `「${current.title}」之后又被改过，不能撤销这次修改`);
        if (group.some(change => change.kind === "create")) {
          this.db.prepare("DELETE FROM todo_changes WHERE item_id = ?").run(current.id);
          this.db.prepare("DELETE FROM todo_requests WHERE item_id = ?").run(current.id);
          this.db.prepare("DELETE FROM todo_items WHERE id = ?").run(current.id);
          removed.push(current.id);
          continue;
        }
        const at = this.now().toISOString();
        let next = current;
        for (const change of [...group].reverse()) next = restore(next, change, at);
        this.write(current, next);
        const revertId = crypto.randomUUID();
        this.record({ change_id: revertId, item_id: current.id, batch_id: null, kind: "revert", actor: access.actor, at,
          before: Object.assign({}, ...group.map(change => change.after)), after: Object.assign({}, ...[...group].reverse().map(change => change.before ?? {})), revision_after: next.revision });
        for (const change of group) this.db.prepare("UPDATE todo_changes SET reverted_by = ? WHERE change_id = ?").run(revertId, change.change_id);
        items.push(next);
      }
    });
    return { items, removed_ids: removed };
  }

  private applyUpdate(id: string, patch: TodoFields, expectedRevision: number | undefined, access: TodoAccess, batchId: string | null,
    move?: { readonly to: string | null }): { item: TodoItem; change_id: string | null } {
    const current = this.get(id, access);
    assertRevision(current, expectedRevision);
    const fields = normalizeFields(patch, current, access);
    let next: TodoItem = { ...current, ...stripProject(fields), project_id: fields.placement !== undefined ? fields.project_id ?? null : current.project_id };
    if (move) next = move.to ? { ...next, placement: "project", project_id: move.to } : { ...next, placement: current.placement === "project" ? "personal" : current.placement, project_id: null };
    if (!next.title) throw invalid("请写下要做什么");
    if (next.due_time && !next.due_date) throw invalid("有截止时间时要同时有截止日期");
    const before: Record<string, unknown> = {}, after: Record<string, unknown> = {};
    for (const field of [...EDITABLE, "project_id"] as const) {
      if (JSON.stringify(current[field]) !== JSON.stringify(next[field])) { before[field] = current[field]; after[field] = next[field]; }
    }
    if (!Object.keys(after).length) return { item: current, change_id: null };
    // A new reminder time is a new reminder: the person has not seen it yet.
    if ("remind_at" in after) next = { ...next, reminder_acknowledged_at: null };
    const edited = access.actor === "user"
      ? [...new Set([...current.edited_fields, ...EDITABLE.filter(field => field in after)])]
      : current.edited_fields;
    const at = this.now().toISOString();
    const saved: TodoItem = { ...next, edited_fields: edited, updated_at: at, revision: current.revision + 1 };
    const changeId = crypto.randomUUID();
    this.write(current, saved);
    this.record({ change_id: changeId, item_id: id, batch_id: batchId, kind: "update", actor: access.actor, at, before, after, revision_after: saved.revision });
    return { item: saved, change_id: changeId };
  }

  private applyStatus(id: string, status: TodoStatus, expectedRevision: number | undefined, access: TodoAccess, batchId: string | null): { item: TodoItem; change_id: string | null } {
    if (!TODO_STATUSES.includes(status)) throw invalid("状态无效");
    const current = this.get(id, access);
    assertRevision(current, expectedRevision);
    if (current.status === status) return { item: current, change_id: null };
    const at = this.now().toISOString();
    const closed = status === "done" || status === "cancelled";
    const next: TodoItem = { ...current, status, completed_at: status === "done" ? at : null,
      archived_at: closed ? current.archived_at : null, updated_at: at, revision: current.revision + 1 };
    const changeId = crypto.randomUUID();
    this.write(current, next);
    this.record({ change_id: changeId, item_id: id, batch_id: batchId, kind: "status", actor: access.actor, at,
      before: { status: current.status, completed_at: current.completed_at, archived_at: current.archived_at },
      after: { status, completed_at: next.completed_at, archived_at: next.archived_at }, revision_after: next.revision });
    return { item: next, change_id: changeId };
  }

  private applyArchive(id: string, archived: boolean, expectedRevision: number | undefined, access: TodoAccess, batchId: string | null): { item: TodoItem; change_id: string | null } {
    const current = this.get(id, access);
    assertRevision(current, expectedRevision);
    if ((current.archived_at !== null) === archived) return { item: current, change_id: null };
    if (archived && current.status !== "done" && current.status !== "cancelled") throw new TodoError("todo.invalid", `「${current.title}」还没完成或取消，不能归档`);
    const at = this.now().toISOString();
    const next: TodoItem = { ...current, archived_at: archived ? at : null, updated_at: at, revision: current.revision + 1 };
    const changeId = crypto.randomUUID();
    this.write(current, next);
    this.record({ change_id: changeId, item_id: id, batch_id: batchId, kind: archived ? "archive" : "unarchive", actor: access.actor, at,
      before: { archived_at: current.archived_at }, after: { archived_at: next.archived_at }, revision_after: next.revision });
    return { item: next, change_id: changeId };
  }

  private normalizeLink(input: TodoLinkInput, ownerId: string, access: TodoAccess): TodoLink {
    if (!LINK_KINDS.includes(input.kind)) throw invalid("关联种类无效");
    const subject = input.subject;
    if (!subject || !text(subject.kind, 80) || !text(subject.id, 200)) throw invalid("关联对象无效");
    const title = String(input.title ?? "").trim();
    if (!title || title.length > 200) throw invalid("关联要有 1 到 200 字的名称");
    if (input.kind === "todo") {
      if (subject.kind !== TODO_SUBJECT_KIND) throw invalid("关联待办时对象种类要是待办");
      if (subject.id === ownerId) throw invalid("不能关联自己");
      this.get(subject.id, access);
    }
    const relation = input.kind === "todo" ? input.relation ?? "related" : null;
    if (relation !== null && !RELATIONS.includes(relation)) throw invalid("关系无效");
    const outcome = input.kind === "outcome" ? input.outcome ?? "draft" : null;
    if (outcome !== null && outcome !== "draft" && outcome !== "done") throw invalid("产出状态无效");
    return { link_id: crypto.randomUUID(), kind: input.kind, subject: { kind: subject.kind, id: subject.id }, title, relation, outcome,
      open: normalizeOpen(input.open), added_at: this.now().toISOString() };
  }

  private insert(item: TodoItem): void {
    this.db.prepare(`INSERT INTO todo_items (id, title, notes, status, placement, project_id, due_date, due_time, planned_date, remind_at, important,
      waiting_json, sources_json, links_json, edited_fields_json, archived_at, completed_at, created_at, updated_at, revision, reminder_acknowledged_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(...toRow(item));
  }

  private write(current: TodoItem, next: TodoItem): void {
    const values = toRow(next);
    const result = this.db.prepare(`UPDATE todo_items SET id = ?, title = ?, notes = ?, status = ?, placement = ?, project_id = ?, due_date = ?, due_time = ?,
      planned_date = ?, remind_at = ?, important = ?, waiting_json = ?, sources_json = ?, links_json = ?, edited_fields_json = ?, archived_at = ?,
      completed_at = ?, created_at = ?, updated_at = ?, revision = ?, reminder_acknowledged_at = ? WHERE id = ? AND revision = ?`).run(...values, current.id, current.revision);
    if (result.changes !== 1) throw conflict();
  }

  private record(change: Omit<TodoChange, "reverted_by">): void {
    this.db.prepare(`INSERT INTO todo_changes (change_id, item_id, batch_id, kind, actor, at, before_json, after_json, revision_after)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(change.change_id, change.item_id, change.batch_id, change.kind, change.actor, change.at,
      change.before === null ? null : JSON.stringify(change.before), JSON.stringify(change.after), change.revision_after);
  }

  private transaction(run: () => void): void {
    if (this.db.isTransaction) { run(); return; }
    this.db.exec("BEGIN IMMEDIATE");
    try { run(); this.db.exec("COMMIT"); }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
}

/**
 * The Todo store's one current schema (repository-anti-corruption §4.1), the organizer's tables included: new stores are
 * created from it, existing ones must already be at its version.
 */
export const TODO_STORE_BASELINE: SqliteBaseline = { version: 1, schema: `
  CREATE TABLE todo_items (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    placement TEXT NOT NULL,
    project_id TEXT,
    due_date TEXT,
    due_time TEXT,
    planned_date TEXT,
    remind_at TEXT,
    important INTEGER NOT NULL DEFAULT 0,
    waiting_json TEXT,
    sources_json TEXT NOT NULL DEFAULT '[]',
    links_json TEXT NOT NULL DEFAULT '[]',
    edited_fields_json TEXT NOT NULL DEFAULT '[]',
    archived_at TEXT,
    completed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    revision INTEGER NOT NULL,
    reminder_acknowledged_at TEXT
  );
  CREATE INDEX todo_items_project ON todo_items (project_id);
  CREATE TABLE todo_changes (
    change_id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    batch_id TEXT,
    kind TEXT NOT NULL,
    actor TEXT NOT NULL,
    at TEXT NOT NULL,
    before_json TEXT,
    after_json TEXT NOT NULL,
    revision_after INTEGER NOT NULL,
    reverted_by TEXT
  );
  CREATE INDEX todo_changes_item ON todo_changes (item_id);
  CREATE INDEX todo_changes_batch ON todo_changes (batch_id) WHERE batch_id IS NOT NULL;
  CREATE TABLE todo_requests (
    request_id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  -- The organizer's review batches and what it remembers about sources (organize.ts).
  CREATE TABLE todo_batches (
    batch_id TEXT PRIMARY KEY, project_id TEXT, origin TEXT NOT NULL, method TEXT NOT NULL, title TEXT NOT NULL,
    body_json TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, revision INTEGER NOT NULL,
    request_id TEXT UNIQUE
  );
  CREATE TABLE todo_source_memory (
    source_key TEXT NOT NULL, fingerprint TEXT NOT NULL, decision TEXT NOT NULL, item_id TEXT, reason TEXT NOT NULL, at TEXT NOT NULL,
    PRIMARY KEY (source_key, fingerprint)
  );
` };

export function openTodoStore(homeDirectory: string, now?: () => Date): TodoStore {
  const db = openHomeSqliteDatabase(homeDirectory, "todo");
  db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  applySqliteBaseline(db, homeSqlitePath(homeDirectory, "todo"), TODO_STORE_BASELINE);
  return new TodoStore(db, now);
}

function visible(item: TodoItem, access: TodoAccess): boolean {
  return access.everything || item.project_id === null || item.project_id === access.projectId;
}

type NormalizedFields = Partial<Omit<TodoItem, "project_id">> & { project_id?: string | null };

function normalizeFields(patch: TodoFields, current: TodoItem | null, access: TodoAccess): NormalizedFields {
  const out: { -readonly [K in keyof NormalizedFields]: NormalizedFields[K] } = {};
  if (patch.title !== undefined) {
    const title = String(patch.title).replace(/\s+/gu, " ").trim();
    if (!title || title.length > 200) throw invalid("标题须为 1 到 200 个字");
    out.title = title;
  }
  if (patch.notes !== undefined) {
    if (String(patch.notes).length > 10_000) throw invalid("说明最多 10000 字");
    out.notes = String(patch.notes);
  }
  for (const field of ["due_date", "planned_date"] as const) {
    const value = patch[field];
    if (value === undefined) continue;
    if (value !== null && !isTodoDate(value)) throw invalid(field === "due_date" ? "截止日期无效" : "计划日期无效");
    out[field] = value;
  }
  if (patch.due_time !== undefined) {
    if (patch.due_time !== null && !isTodoTime(patch.due_time)) throw invalid("截止时间要写成 HH:MM");
    out.due_time = patch.due_time;
  }
  if (patch.due_date === null && patch.due_time === undefined && current?.due_time) out.due_time = null;
  if (patch.remind_at !== undefined) {
    if (patch.remind_at !== null && !isTodoInstant(patch.remind_at)) throw invalid("提醒时间要带时区，例如 2026-10-02T09:00:00+08:00");
    out.remind_at = patch.remind_at === null ? null : new Date(patch.remind_at).toISOString();
  }
  if (patch.important !== undefined) {
    if (typeof patch.important !== "boolean") throw invalid("重要标记无效");
    if (access.actor !== "user" && patch.important !== (current?.important ?? false)) throw new TodoError("todo.forbidden", "重要标记只能由你自己设置");
    out.important = patch.important;
  }
  if (patch.waiting !== undefined) {
    if (patch.waiting === null) out.waiting = null;
    else {
      const who = String(patch.waiting.who ?? "").trim(), what = String(patch.waiting.what ?? "").trim();
      const follow = patch.waiting.follow_up_on ?? null;
      if (who.length > 80 || what.length > 200) throw invalid("等待对象最多 80 字，等待内容最多 200 字");
      if (follow !== null && !isTodoDate(follow)) throw invalid("跟进日期无效");
      out.waiting = { who, what, follow_up_on: follow };
    }
  }
  if (patch.placement !== undefined) {
    if (patch.placement === "project") {
      if (!access.projectId) throw new TodoError("actions.project_required", "要放进项目，请在那个项目里操作");
      // "Into the project" means the project the caller is in; other projects are not addressable by id.
      // A todo already in some project stays there, so resending the same placement never moves it silently.
      out.placement = "project";
      out.project_id = current?.placement === "project" && current.project_id ? current.project_id : access.projectId;
    } else if (patch.placement === "personal" || patch.placement === "unassigned") {
      out.placement = patch.placement;
      out.project_id = null;
    } else throw invalid("归属无效");
  }
  return out;
}

const stripProject = (fields: NormalizedFields): Partial<TodoItem> => {
  const { project_id: _ignored, ...rest } = fields;
  return rest;
};

function normalizeSources(input: TodoCreateInput["sources"], access: TodoAccess, at: string): TodoSource[] {
  const manual: TodoSource = { source_id: crypto.randomUUID(), kind: access.actor === "assistant" ? "assistant" : "manual",
    title: access.actor === "assistant" ? "助理按你的要求创建" : "你手动记下", excerpt: "", reason: "", subject: null, open: null, added_at: at };
  if (!input?.length) return [manual];
  if (input.length > 20) throw invalid("来源最多 20 项");
  return input.map(source => {
    if (!SOURCE_KINDS.includes(source.kind)) throw invalid("来源种类无效");
    const title = String(source.title ?? "").trim();
    if (!title || title.length > 200) throw invalid("来源要有 1 到 200 字的名称");
    const excerpt = String(source.excerpt ?? ""), reason = String(source.reason ?? "");
    if (excerpt.length > 2000 || reason.length > 500) throw invalid("依据最多 2000 字，形成原因最多 500 字");
    const subject = source.subject ? { kind: String(source.subject.kind), id: String(source.subject.id) } : null;
    if (subject && (!text(subject.kind, 80) || !text(subject.id, 200))) throw invalid("来源对象无效");
    return { source_id: crypto.randomUUID(), kind: source.kind, title, excerpt, reason, subject, open: normalizeOpen(source.open), added_at: at };
  });
}

function normalizeOpen(value: { surface: string; id: string } | null | undefined): { surface: string; id: string } | null {
  if (!value) return null;
  if (!/^[a-z0-9_-]{1,40}$/u.test(String(value.surface)) || !text(value.id, 200)) throw invalid("打开位置无效");
  return { surface: value.surface, id: value.id };
}

/** Put back the fields a change touched, as they were before it. */
function restore(current: TodoItem, change: TodoChange, at: string): TodoItem {
  const before = (change.before ?? {}) as Record<string, unknown>;
  if (change.kind === "source") {
    const added = (change.after as { source_added?: TodoSource }).source_added;
    return { ...current, sources: added ? current.sources.filter(source => source.source_id !== added.source_id) : current.sources, updated_at: at, revision: current.revision + 1 };
  }
  if (change.kind === "link") {
    const added = (change.after as { link_added?: TodoLink }).link_added;
    const removed = before.link_added as TodoLink | undefined;
    const links = added ? current.links.filter(link => link.link_id !== added.link_id) : removed ? [...current.links, removed] : current.links;
    return { ...current, links, updated_at: at, revision: current.revision + 1 };
  }
  const restored = { ...current, ...(before as Partial<TodoItem>), updated_at: at, revision: current.revision + 1 };
  return "remind_at" in before ? { ...restored, reminder_acknowledged_at: null } : restored;
}

function assertRevision(item: TodoItem, expected: number | undefined): void {
  if (expected !== undefined && item.revision !== expected) throw conflict(item.title);
}

const text = (value: unknown, max: number) => typeof value === "string" && value.trim().length > 0 && value.length <= max;
const invalid = (message: string) => new TodoError("todo.invalid", message);
const conflict = (title?: string) => new TodoError("todo.conflict", title ? `「${title}」已在别处修改，请重新读取后再改` : "待办已在别处修改，请重新读取后再改");

function fromRow(row: ItemRow): TodoItem {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    status: row.status as TodoStatus,
    placement: row.placement as TodoPlacement,
    project_id: row.project_id,
    due_date: row.due_date,
    due_time: row.due_time,
    planned_date: row.planned_date,
    remind_at: row.remind_at,
    reminder_acknowledged_at: row.reminder_acknowledged_at ?? null,
    important: row.important === 1,
    waiting: row.waiting_json ? JSON.parse(row.waiting_json) as TodoWaiting : null,
    sources: JSON.parse(row.sources_json) as TodoSource[],
    links: JSON.parse(row.links_json) as TodoLink[],
    edited_fields: JSON.parse(row.edited_fields_json) as TodoEditableField[],
    archived_at: row.archived_at,
    completed_at: row.completed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    revision: row.revision,
  };
}

function toRow(item: TodoItem): (string | number | null)[] {
  return [item.id, item.title, item.notes, item.status, item.placement, item.project_id, item.due_date, item.due_time, item.planned_date, item.remind_at,
    item.important ? 1 : 0, item.waiting ? JSON.stringify(item.waiting) : null, JSON.stringify(item.sources), JSON.stringify(item.links),
    JSON.stringify(item.edited_fields), item.archived_at, item.completed_at, item.created_at, item.updated_at, item.revision, item.reminder_acknowledged_at];
}

function changeFromRow(row: ChangeRow): TodoChange {
  return { change_id: row.change_id, item_id: row.item_id, batch_id: row.batch_id, kind: row.kind as TodoChange["kind"], actor: row.actor as TodoActorKind,
    at: row.at, before: row.before_json ? JSON.parse(row.before_json) : null, after: JSON.parse(row.after_json), revision_after: row.revision_after, reverted_by: row.reverted_by };
}
