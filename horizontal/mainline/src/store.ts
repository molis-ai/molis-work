import { randomUUID } from "node:crypto";
import type { DatabaseSync, SQLOutputValue } from "node:sqlite";
import { ActionError, type ActionSubject } from "@molis-ai/molis-work-contracts/platform/actions";
import { MAINLINE_LIMITS, WORK_ITEM_KIND, mainlineErrors, type Mainline, type MainlineGroup, type MainlineGroupDefault, type MainlineGroupEditRequest,
  type WorkItem } from "@molis-ai/molis-work-contracts/services/mainline";
import { openBaselineHomeSqlite, type HomeStoreDeclaration, type SqliteBaseline } from "@molis-ai/molis-work-storage";

// The mainline's own store (specs/work-mainline/contract-design.md §6): each person's work items in each project, how they are
// arranged and what each holds. Only names of light items, references and the arrangement are kept (MLN-12): never an object's title,
// state or body. Every query names the owner and the project, so another person's or another project's rows are never read.

/** The store's one current schema (repository-anti-corruption §4.1). A new library: version 1. */
export const MAINLINE_BASELINE: SqliteBaseline = { version: /* @version database.mainline_baseline */ 1, schema: `
CREATE TABLE mainline_items (owner_actor_id TEXT NOT NULL, project_id TEXT NOT NULL, item_id TEXT NOT NULL,
  name TEXT, source_kind TEXT, source_id TEXT, created_at TEXT NOT NULL,
  PRIMARY KEY (owner_actor_id, project_id, item_id),
  CHECK ((name IS NULL) != (source_kind IS NULL)), CHECK ((source_kind IS NULL) = (source_id IS NULL)));
CREATE UNIQUE INDEX mainline_items_source ON mainline_items (owner_actor_id, project_id, source_kind, source_id) WHERE source_kind IS NOT NULL;
CREATE TABLE mainline_arrangements (owner_actor_id TEXT NOT NULL, project_id TEXT NOT NULL, revision TEXT NOT NULL, arrangement TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY (owner_actor_id, project_id));
CREATE TABLE mainline_holds (owner_actor_id TEXT NOT NULL, project_id TEXT NOT NULL, item_id TEXT NOT NULL, subject_kind TEXT NOT NULL, subject_id TEXT NOT NULL, added_at TEXT NOT NULL,
  PRIMARY KEY (owner_actor_id, project_id, item_id, subject_kind, subject_id));
CREATE INDEX mainline_holds_subject ON mainline_holds (owner_actor_id, project_id, subject_kind, subject_id);
` };

/** This store in the Home's store registry (W4-11): `mainline/mainline.db`. */
export const MAINLINE_HOME_STORE = { path: "mainline", library: { baseline: MAINLINE_BASELINE } } as const satisfies HomeStoreDeclaration;

export function openMainlineDatabase(homeDirectory: string): DatabaseSync {
  return openBaselineHomeSqlite(homeDirectory, MAINLINE_HOME_STORE.path, MAINLINE_BASELINE);
}

/** The project is deleted: its items, arrangements and what they hold go, whoever owns them. Inside the caller's transaction. */
export function purgeMainlineProject(db: DatabaseSync, projectId: string): void {
  for (const table of ["mainline_holds", "mainline_arrangements", "mainline_items"]) db.prepare(`DELETE FROM ${table} WHERE project_id = ?`).run(projectId);
}

/** How the items are arranged, kept as one row: the groups in order, what was put away as done (newest first, with the group it left). */
interface Arrangement {
  groups: MainlineGroup[];
  completed: Array<{ item_id: string; from: string }>;
  current: string | null;
  recent: string[];
}
const DEFAULT_GROUPS: readonly MainlineGroupDefault[] = ["now", "next", "waiting"];
const fresh = (): Arrangement => ({ groups: DEFAULT_GROUPS.map(name => ({ group_id: name, default: name, items: [] })), completed: [], current: null, recent: [] });
const conflict = (current: Mainline) => mainlineErrors.conflict("主线在别处刚改过，请看当前的排列后再试", { current });
const missing = () => mainlineErrors.item_missing("主线上没有这件事项");

interface ItemRow extends Record<string, SQLOutputValue> { item_id: string; name: string | null; source_kind: string | null; source_id: string | null; created_at: string }
const itemOf = (row: ItemRow): WorkItem => ({ item_id: row.item_id, ...(row.name !== null ? { name: row.name } : {}),
  ...(row.source_kind !== null ? { source: { kind: row.source_kind, id: row.source_id! } } : {}), created_at: row.created_at });

/** One person's mainline in one project. */
export class MainlineStore {
  constructor(private readonly db: DatabaseSync, private readonly actorId: string, private readonly projectId: string,
    private readonly now: () => string = () => new Date().toISOString()) {
    if (!actorId || !projectId) throw new ActionError("actions.scope_mismatch", "主线要在一个项目里，以本人身份读写");
  }

  // ---- reading ----------------------------------------------------------------------------------------------------------------------

  private arrangement(): { revision: string; arrangement: Arrangement } {
    const row = this.db.prepare("SELECT revision, arrangement FROM mainline_arrangements WHERE owner_actor_id = ? AND project_id = ?")
      .get(this.actorId, this.projectId) as { revision: string; arrangement: string } | undefined;
    return row ? { revision: row.revision, arrangement: JSON.parse(row.arrangement) as Arrangement } : { revision: "0", arrangement: fresh() };
  }

  item(itemId: string): WorkItem | null {
    const row = this.db.prepare("SELECT item_id, name, source_kind, source_id, created_at FROM mainline_items WHERE owner_actor_id = ? AND project_id = ? AND item_id = ?")
      .get(this.actorId, this.projectId, itemId) as ItemRow | undefined;
    return row ? itemOf(row) : null;
  }

  /** Resolve the name before a conversion asks the source owner to create anything. */
  readConversionName(expected: string, itemId: string): string {
    const name = this.lightItemName(itemId);
    this.requireRevision(expected, this.arrangement().revision);
    return name;
  }

  private lightItemName(itemId: string): string {
    const item = this.item(itemId);
    if (!item) throw missing();
    if (!item.name) throw new ActionError("actions.input_invalid", "这件事项已经由对象变成，不能再变");
    return item.name;
  }

  /** The item an object became, if it became one. */
  itemOf(source: ActionSubject): WorkItem | null {
    const row = this.db.prepare("SELECT item_id, name, source_kind, source_id, created_at FROM mainline_items WHERE owner_actor_id = ? AND project_id = ? AND source_kind = ? AND source_id = ?")
      .get(this.actorId, this.projectId, source.kind, source.id) as ItemRow | undefined;
    return row ? itemOf(row) : null;
  }

  /** The mainline as a reader gets it: the default three groups on a first read, nothing written. */
  read(): Mainline {
    const { revision, arrangement } = this.arrangement();
    const completed = arrangement.completed.slice(0, MAINLINE_LIMITS.completed_read).map(entry => entry.item_id);
    const named = new Set([...arrangement.groups.flatMap(group => group.items.map(entry => entry.item_id)), ...completed]);
    const items = (this.db.prepare("SELECT item_id, name, source_kind, source_id, created_at FROM mainline_items WHERE owner_actor_id = ? AND project_id = ? ORDER BY created_at, item_id")
      .all(this.actorId, this.projectId) as ItemRow[]).filter(row => named.has(row.item_id)).map(itemOf);
    return { revision, items, groups: arrangement.groups, completed, completed_total: arrangement.completed.length, current: arrangement.current, recent: arrangement.recent };
  }

  /** The objects an item holds, in the order they went in. */
  held(itemId: string): ActionSubject[] {
    if (!this.item(itemId)) throw missing();
    return (this.db.prepare("SELECT subject_kind, subject_id FROM mainline_holds WHERE owner_actor_id = ? AND project_id = ? AND item_id = ? ORDER BY added_at, subject_kind, subject_id")
      .all(this.actorId, this.projectId, itemId) as Array<{ subject_kind: string; subject_id: string }>).map(row => ({ kind: row.subject_kind, id: row.subject_id }));
  }

  /** The items an object is in. */
  holding(subject: ActionSubject): string[] {
    return (this.db.prepare("SELECT item_id FROM mainline_holds WHERE owner_actor_id = ? AND project_id = ? AND subject_kind = ? AND subject_id = ? ORDER BY added_at, item_id")
      .all(this.actorId, this.projectId, subject.kind, subject.id) as Array<{ item_id: string }>).map(row => row.item_id);
  }

  // ---- writing ----------------------------------------------------------------------------------------------------------------------

  private transaction<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = work(); this.db.exec("COMMIT"); return result; } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }

  private requireRevision(expected: string | undefined, revision: string): void {
    if (expected !== undefined && expected !== revision) throw conflict(this.read());
  }

  /** One write: the arrangement as read, checked against `expected` when given, changed and saved under a new revision. */
  private write<T>(expected: string | undefined, change: (arrangement: Arrangement) => T): T {
    return this.transaction(() => {
      const { revision, arrangement } = this.arrangement();
      this.requireRevision(expected, revision);
      const result = change(arrangement);
      const next = `${Number(revision.split(".")[0]) + 1}.${randomUUID()}`, at = this.now();
      this.db.prepare(`INSERT INTO mainline_arrangements (owner_actor_id, project_id, revision, arrangement, updated_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (owner_actor_id, project_id) DO UPDATE SET revision = excluded.revision, arrangement = excluded.arrangement, updated_at = excluded.updated_at`)
        .run(this.actorId, this.projectId, next, JSON.stringify(arrangement), at);
      return result;
    });
  }

  private place(arrangement: Arrangement, itemId: string, groupId?: string): void {
    const open = arrangement.groups.reduce((total, group) => total + group.items.length, 0);
    if (open >= MAINLINE_LIMITS.open_items) throw mainlineErrors.limit(`一条主线最多 ${MAINLINE_LIMITS.open_items} 件未完成的事项`);
    const group = groupId === undefined ? arrangement.groups[0] : arrangement.groups.find(candidate => candidate.group_id === groupId);
    if (!group) throw mainlineErrors.item_missing("主线上没有这一组");
    group.items.push({ item_id: itemId, pinned: false });
  }

  private insert(item: WorkItem): void {
    this.db.prepare("INSERT INTO mainline_items (owner_actor_id, project_id, item_id, name, source_kind, source_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(this.actorId, this.projectId, item.item_id, item.name ?? null, item.source?.kind ?? null, item.source?.id ?? null, item.created_at);
  }

  /** A light item named so, at the end of the group (the first by default). */
  createLight(name: string, groupId?: string): WorkItem {
    const item: WorkItem = { item_id: randomUUID(), name: checkedName(name), created_at: this.now() };
    return this.write(undefined, arrangement => { this.place(arrangement, item.item_id, groupId); this.insert(item); return item; });
  }

  /** An object made into an item; one it already became is given back, wherever it is. */
  createFromSource(source: ActionSubject, groupId?: string): { item: WorkItem; created: boolean } {
    if (source.kind === WORK_ITEM_KIND) throw new ActionError("actions.input_invalid", "事项不能再设为事项");
    const existing = this.itemOf(source);
    if (existing) return { item: existing, created: false };
    const item: WorkItem = { item_id: randomUUID(), source: { kind: source.kind, id: source.id }, created_at: this.now() };
    return this.write(undefined, arrangement => {
      if (this.itemOf(source)) return { item: this.itemOf(source)!, created: false };
      this.place(arrangement, item.item_id, groupId); this.insert(item);
      return { item, created: true };
    });
  }

  /** A light item becomes the object made for it: what it holds stays; its name is read from the source from now on. */
  convert(expected: string, itemId: string, source: ActionSubject): WorkItem {
    return this.write(expected, () => {
      this.lightItemName(itemId);
      if (this.itemOf(source)) throw mainlineErrors.conflict("这个对象已经是另一件事项", { current: this.read() });
      this.db.prepare("UPDATE mainline_items SET name = NULL, source_kind = ?, source_id = ? WHERE owner_actor_id = ? AND project_id = ? AND item_id = ?")
        .run(source.kind, source.id, this.actorId, this.projectId, itemId);
      return this.item(itemId)!;
    });
  }

  rename(expected: string, itemId: string, name: string): void {
    this.write(expected, () => {
      const item = this.item(itemId);
      if (!item) throw missing();
      if (item.source) throw new ActionError("actions.input_invalid", "由对象变成的事项，名字向来源读，不在这里改");
      this.db.prepare("UPDATE mainline_items SET name = ? WHERE owner_actor_id = ? AND project_id = ? AND item_id = ?").run(checkedName(name), this.actorId, this.projectId, itemId);
    });
  }

  /** To `index` of the group among its own kind: a pinned item among the pinned ones, the others after them. */
  move(expected: string, itemId: string, groupId: string, index: number, pinned?: boolean): void {
    this.write(expected, arrangement => {
      const from = arrangement.groups.find(group => group.items.some(entry => entry.item_id === itemId));
      const to = arrangement.groups.find(group => group.group_id === groupId);
      if (!from) throw this.item(itemId) ? new ActionError("actions.input_invalid", "已完成的事项要先放回，才能移动") : missing();
      if (!to) throw mainlineErrors.item_missing("主线上没有这一组");
      const entry = from.items.splice(from.items.findIndex(candidate => candidate.item_id === itemId), 1)[0]!;
      const moved = { item_id: itemId, pinned: pinned ?? entry.pinned }, pins = to.items.filter(candidate => candidate.pinned).length;
      const at = moved.pinned ? Math.min(index, pins) : pins + Math.min(index, to.items.length - pins);
      to.items.splice(at, 0, moved);
    });
  }

  /** Put away as done, or back where it came from (its group, else the first). */
  complete(expected: string, itemId: string, completed: boolean): void {
    this.write(expected, arrangement => {
      if (!this.item(itemId)) throw missing();
      const group = arrangement.groups.find(candidate => candidate.items.some(entry => entry.item_id === itemId));
      const done = arrangement.completed.findIndex(entry => entry.item_id === itemId);
      if (completed) {
        if (!group) return;
        group.items = group.items.filter(entry => entry.item_id !== itemId);
        arrangement.completed.unshift({ item_id: itemId, from: group.group_id });
        arrangement.recent = arrangement.recent.filter(id => id !== itemId);
        if (arrangement.current === itemId) arrangement.current = null;
      } else {
        if (done < 0) return;
        const [entry] = arrangement.completed.splice(done, 1);
        this.place(arrangement, itemId, arrangement.groups.some(candidate => candidate.group_id === entry!.from) ? entry!.from : undefined);
      }
    });
  }

  /** The container and what it holds go; the objects it held and its source object stay with their owners (MLN-10). */
  remove(expected: string, itemId: string): void {
    this.write(expected, arrangement => {
      if (!this.item(itemId)) throw missing();
      for (const group of arrangement.groups) group.items = group.items.filter(entry => entry.item_id !== itemId);
      arrangement.completed = arrangement.completed.filter(entry => entry.item_id !== itemId);
      arrangement.recent = arrangement.recent.filter(id => id !== itemId);
      if (arrangement.current === itemId) arrangement.current = null;
      this.db.prepare("DELETE FROM mainline_holds WHERE owner_actor_id = ? AND project_id = ? AND item_id = ?").run(this.actorId, this.projectId, itemId);
      this.db.prepare("DELETE FROM mainline_items WHERE owner_actor_id = ? AND project_id = ? AND item_id = ?").run(this.actorId, this.projectId, itemId);
    });
  }

  /** A group deleted gives its items to the group before it (else after it), none lost (MLN-04); the last group is never deleted. */
  editGroups(request: MainlineGroupEditRequest): void {
    this.write(request.expected_revision, arrangement => {
      const at = "group_id" in request ? arrangement.groups.findIndex(group => group.group_id === request.group_id) : -1;
      if ("group_id" in request && at < 0) throw mainlineErrors.item_missing("主线上没有这一组");
      if (request.op === "add") {
        if (arrangement.groups.length >= MAINLINE_LIMITS.groups) throw mainlineErrors.limit(`一条主线最多 ${MAINLINE_LIMITS.groups} 组`);
        arrangement.groups.splice(Math.min(request.index ?? arrangement.groups.length, arrangement.groups.length), 0, { group_id: randomUUID(), name: checkedName(request.name), items: [] });
      } else if (request.op === "rename") {
        arrangement.groups[at] = { ...arrangement.groups[at]!, name: checkedName(request.name) };
      } else if (request.op === "delete") {
        if (arrangement.groups.length === 1) throw new ActionError("actions.input_invalid", "至少要留一组");
        const [gone] = arrangement.groups.splice(at, 1), heir = arrangement.groups[Math.max(0, at - 1)]!;
        const pinnedFirst = (entries: MainlineGroup["items"]) => [...entries.filter(entry => entry.pinned), ...entries.filter(entry => !entry.pinned)];
        heir.items = pinnedFirst([...heir.items, ...gone!.items]);
        for (const entry of arrangement.completed) if (entry.from === gone!.group_id) entry.from = heir.group_id;
      } else {
        const [group] = arrangement.groups.splice(at, 1);
        arrangement.groups.splice(Math.min(request.index, arrangement.groups.length), 0, group!);
      }
    });
  }

  /** The current item, or none; the latest switched to first among the recent, at most three, none completed. */
  switchTo(itemId: string | null): void {
    this.write(undefined, arrangement => {
      if (itemId !== null) {
        if (!arrangement.groups.some(group => group.items.some(entry => entry.item_id === itemId))) {
          throw this.item(itemId) ? new ActionError("actions.input_invalid", "已完成的事项要先放回，才能切到它") : missing();
        }
        arrangement.recent = [itemId, ...arrangement.recent.filter(id => id !== itemId)].slice(0, MAINLINE_LIMITS.recent);
      }
      arrangement.current = itemId;
    });
  }

  // ---- what an item holds (`holds`) ----------------------------------------------------------------------------------------------

  /** Put in; an object already in the item stays as it was. The arrangement is not touched, so its revision stays. */
  hold(itemId: string, subject: ActionSubject): void {
    this.transaction(() => this.insertHold(itemId, subject));
  }

  private insertHold(itemId: string, subject: ActionSubject): void {
    if (subject.kind === WORK_ITEM_KIND) throw new ActionError("actions.input_invalid", "事项不能装进事项");
    if (!this.item(itemId)) throw missing();
    if (this.holding(subject).includes(itemId)) return;
    const count = (this.db.prepare("SELECT COUNT(*) AS n FROM mainline_holds WHERE owner_actor_id = ? AND project_id = ? AND item_id = ?").get(this.actorId, this.projectId, itemId) as { n: number }).n;
    if (count >= MAINLINE_LIMITS.held) throw mainlineErrors.limit(`一件事项最多装 ${MAINLINE_LIMITS.held} 个对象`);
    this.db.prepare("INSERT INTO mainline_holds (owner_actor_id, project_id, item_id, subject_kind, subject_id, added_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(this.actorId, this.projectId, itemId, subject.kind, subject.id, this.now());
  }

  /** Change the task's single placement in one transaction. A rejected destination leaves its existing holds intact. */
  placeOnly(itemId: string | null, subject: ActionSubject): ActionSubject[] {
    return this.transaction(() => {
      if (itemId !== null) this.insertHold(itemId, subject);
      this.db.prepare("DELETE FROM mainline_holds WHERE owner_actor_id = ? AND project_id = ? AND subject_kind = ? AND subject_id = ? AND (? IS NULL OR item_id != ?)")
        .run(this.actorId, this.projectId, subject.kind, subject.id, itemId, itemId);
      return this.holding(subject).map(id => ({ kind: WORK_ITEM_KIND, id }));
    });
  }

  release(itemId: string, subject: ActionSubject): void {
    this.transaction(() => {
      if (!this.item(itemId)) throw missing();
      this.db.prepare("DELETE FROM mainline_holds WHERE owner_actor_id = ? AND project_id = ? AND subject_kind = ? AND subject_id = ? AND item_id = ?")
        .run(this.actorId, this.projectId, subject.kind, subject.id, itemId);
    });
  }
}

function checkedName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > MAINLINE_LIMITS.name) throw mainlineErrors.limit(`名字不能为空，最多 ${MAINLINE_LIMITS.name} 字`);
  return trimmed;
}
