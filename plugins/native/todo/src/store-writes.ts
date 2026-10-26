import { TODO_STATUSES, TODO_SUBJECT_KIND, type TodoItem, type TodoLink, type TodoSource, type TodoStatus } from "./contract.js";
import { todoErrors } from "./error.js";
import { TodoStoreBase } from "./store-base.js";
import { EDITABLE, LINK_KINDS, RELATIONS, normalizeFields, normalizeOpen, normalizeSources, stripProject } from "./store-normalize.js";
import { assertRevision, conflict, invalid, text } from "./store-support.js";
import { todoRequestKey, type TodoAccess, type TodoCreateInput, type TodoFields, type TodoLinkInput } from "./store-types.js";

/** The single-todo writes: each is one change on one todo, recorded in its history. */
export abstract class TodoStoreWrites extends TodoStoreBase {
  create(input: TodoCreateInput, access: TodoAccess, batchId: string | null = null): { item: TodoItem; change_id: string; replayed: boolean } {
    const requestKey = todoRequestKey(access, input.request_id);
    if (requestKey) {
      const seen = this.db.get("SELECT item_id FROM todo_requests WHERE request_id = ?", [requestKey]) as { item_id: string } | undefined;
      if (seen) {
        const change = this.db.get("SELECT change_id FROM todo_changes WHERE item_id = ? AND kind = 'create'", [seen.item_id]) as { change_id: string } | undefined;
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
      if (requestKey) this.db.run("INSERT INTO todo_requests (request_id, item_id, created_at) VALUES (?, ?, ?)", [requestKey, item.id, at]);
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

  /** Permanent: the item, its history and the request receipts that pointed at it are removed. */
  delete(id: string, expectedRevision: number | undefined, access: TodoAccess): void {
    const current = this.get(id, access);
    assertRevision(current, expectedRevision);
    this.transaction(() => {
      this.db.run("DELETE FROM todo_changes WHERE item_id = ?", [id]);
      this.db.run("DELETE FROM todo_requests WHERE item_id = ?", [id]);
      const removed = this.db.run("DELETE FROM todo_items WHERE id = ? AND revision = ?", [id, current.revision]);
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
      if (duplicate) throw todoErrors.invalid("已经关联过了");
      if (links.length >= 50) throw invalid("一件待办最多关联 50 项");
      links.push(link);
      before = { link_removed: null };
      after = { link_added: link };
    } else if (change.remove_link_id) {
      const link = links.find(existing => existing.link_id === change.remove_link_id);
      if (!link) throw todoErrors.not_found("这项关联已经不在了");
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

  protected applyUpdate(id: string, patch: TodoFields, expectedRevision: number | undefined, access: TodoAccess, batchId: string | null,
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

  protected applyStatus(id: string, status: TodoStatus, expectedRevision: number | undefined, access: TodoAccess, batchId: string | null): { item: TodoItem; change_id: string | null } {
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

  protected applyArchive(id: string, archived: boolean, expectedRevision: number | undefined, access: TodoAccess, batchId: string | null): { item: TodoItem; change_id: string | null } {
    const current = this.get(id, access);
    assertRevision(current, expectedRevision);
    if ((current.archived_at !== null) === archived) return { item: current, change_id: null };
    if (archived && current.status !== "done" && current.status !== "cancelled") throw todoErrors.invalid(`「${current.title}」还没完成或取消，不能归档`);
    const at = this.now().toISOString();
    const next: TodoItem = { ...current, archived_at: archived ? at : null, updated_at: at, revision: current.revision + 1 };
    const changeId = crypto.randomUUID();
    this.write(current, next);
    this.record({ change_id: changeId, item_id: id, batch_id: batchId, kind: archived ? "archive" : "unarchive", actor: access.actor, at,
      before: { archived_at: current.archived_at }, after: { archived_at: next.archived_at }, revision_after: next.revision });
    return { item: next, change_id: changeId };
  }

  protected normalizeLink(input: TodoLinkInput, ownerId: string, access: TodoAccess): TodoLink {
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
}
