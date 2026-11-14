import { randomUUID } from "node:crypto";
import type { ActionSubject } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDatabaseReader, PluginDatabaseTransaction, PluginSqlRow } from "@molis-ai/molis-work-contracts/platform/plugin";
import { riskErrors } from "./error.js";
import { RISK_EDIT_FIELDS, RISK_LIMITS, type RiskEditField, type RiskEvent, type RiskEventKind, type RiskLevel, type RiskLink, type RiskListFilter,
  type RiskRecord, type RiskRow, type RiskStatus } from "./model.js";

const ITEM_COLUMNS = "risk_id, title, statement, impact, likelihood, treatment, owner_name, status, revision, created_by, created_at, updated_at, closed_at";

const text = (row: PluginSqlRow, key: string) => String(row[key]);
const maybe = (row: PluginSqlRow, key: string) => (row[key] === null ? null : String(row[key]));
function recordOf(row: PluginSqlRow): RiskRecord {
  return { risk_id: text(row, "risk_id"), title: text(row, "title"), statement: text(row, "statement"), impact: text(row, "impact") as RiskLevel,
    likelihood: text(row, "likelihood") as RiskLevel, treatment: text(row, "treatment"), owner_name: maybe(row, "owner_name"), status: text(row, "status") as RiskStatus,
    revision: Number(row.revision), created_by: text(row, "created_by"), created_at: text(row, "created_at"), updated_at: text(row, "updated_at"),
    closed_at: maybe(row, "closed_at") };
}
/** How many risks one page of the overview holds. */
export const RISK_PAGE = { default: 100, max: 200 } as const;

function cursorOf(cursor: string): [string, string] {
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (Array.isArray(value) && value.length === 2 && value.every(part => typeof part === "string")) return [value[0], value[1]];
  } catch { /* falls through to the refusal below */ }
  throw riskErrors.invalid("翻页标记无效", { field: "cursor" });
}
const subjectOf = (row: PluginSqlRow): ActionSubject => ({ kind: text(row, "subject_kind"), id: text(row, "subject_id") });

/** What a person or an Agent writes into a risk; the limits are the same whoever writes. */
export interface RiskFields {
  title: string;
  statement: string;
  impact: RiskLevel;
  likelihood: RiskLevel;
  treatment: string;
  owner_name: string | null;
}

function checked(fields: RiskFields): RiskFields {
  const title = fields.title.trim();
  if (!title) throw riskErrors.invalid("请写风险的标题");
  for (const key of ["title", "statement", "treatment", "owner_name"] as const) {
    const value = fields[key];
    if (value !== null && [...value].length > RISK_LIMITS[key]) throw riskErrors.invalid(`${key} 超出 ${RISK_LIMITS[key]} 字`, { field: key });
  }
  const owner = fields.owner_name?.trim() || null;
  return { ...fields, title, owner_name: owner };
}

/**
 * Risk's reads and writes over its own tables in the project's library. Reads go through the read-only connection; each write is
 * one step inside the caller's transaction (`services.project_database.transaction`), so a write and its history row commit together.
 */
export class RiskStore {
  constructor(private readonly db: PluginDatabaseReader, private readonly projectId: string) {}

  /**
   * One page of the overview: one statement for the risks and one for their links, never one request per risk (N42–N56). Newest
   * change first; `cursor` is the last row of the page before (`next_cursor`), so a page stays put while risks are added.
   */
  list(filter: RiskListFilter = {}, page: { limit?: number; cursor?: string } = {}): { risks: RiskRow[]; next_cursor: string | null } {
    const where = ["project_id = ?"], parameters: (string | number)[] = [this.projectId];
    const status = filter.status ?? "open";
    if (status === "open") where.push("status <> 'closed'");
    else if (status === "closed") where.push("status = 'closed'");
    if (filter.impact) { where.push("impact = ?"); parameters.push(filter.impact); }
    if (filter.owner_name) { where.push("owner_name = ?"); parameters.push(filter.owner_name); }
    if (filter.linked) { where.push("risk_id IN (SELECT risk_id FROM risk_links WHERE subject_kind = ? AND subject_id = ?)"); parameters.push(filter.linked.kind, filter.linked.id); }
    if (filter.unlinked !== undefined) where.push(`${filter.unlinked ? "NOT " : ""}EXISTS (SELECT 1 FROM risk_links WHERE risk_links.risk_id = risk_items.risk_id)`);
    if (page.cursor) {
      const [updatedAt, riskId] = cursorOf(page.cursor);
      where.push("(updated_at < ? OR (updated_at = ? AND risk_id > ?))"); parameters.push(updatedAt, updatedAt, riskId);
    }
    const limit = Math.min(RISK_PAGE.max, Math.max(1, Math.trunc(page.limit ?? RISK_PAGE.default)));
    const rows = this.db.all(`SELECT ${ITEM_COLUMNS} FROM risk_items WHERE ${where.join(" AND ")} ORDER BY updated_at DESC, risk_id LIMIT ?`, [...parameters, limit + 1]).map(recordOf);
    const more = rows.length > limit, shown = rows.slice(0, limit);
    if (shown.length === 0) return { risks: [], next_cursor: null };
    const links = new Map<string, ActionSubject[]>();
    for (const row of this.db.all(`SELECT risk_id, subject_kind, subject_id FROM risk_links WHERE risk_id IN (${shown.map(() => "?").join(", ")})
        ORDER BY added_at, subject_kind, subject_id`, shown.map(risk => risk.risk_id))) {
      const id = text(row, "risk_id");
      links.set(id, [...links.get(id) ?? [], subjectOf(row)]);
    }
    const last = shown[shown.length - 1]!;
    return { risks: shown.map(risk => ({ ...risk, links: links.get(risk.risk_id) ?? [] })),
      next_cursor: more ? Buffer.from(JSON.stringify([last.updated_at, last.risk_id])).toString("base64url") : null };
  }

  /** Every risk of the project, closed ones too, for the search source (which pages them itself). */
  all(): RiskRecord[] {
    return this.db.all(`SELECT ${ITEM_COLUMNS} FROM risk_items WHERE project_id = ? ORDER BY updated_at DESC, risk_id`, [this.projectId]).map(recordOf);
  }

  /** The names people have given as owners in this project, for the overview's filter. */
  owners(): string[] {
    return this.db.all("SELECT DISTINCT owner_name FROM risk_items WHERE project_id = ? AND owner_name IS NOT NULL ORDER BY owner_name", [this.projectId])
      .map(row => text(row, "owner_name"));
  }

  find(riskId: string, reader: PluginDatabaseReader = this.db): RiskRecord | null {
    const row = reader.get(`SELECT ${ITEM_COLUMNS} FROM risk_items WHERE project_id = ? AND risk_id = ?`, [this.projectId, riskId]);
    return row ? recordOf(row) : null;
  }

  get(riskId: string, reader: PluginDatabaseReader = this.db): RiskRecord {
    const risk = this.find(riskId, reader);
    if (!risk) throw riskErrors.not_found("这条风险已不存在", { risk_id: riskId });
    return risk;
  }

  links(riskId: string, reader: PluginDatabaseReader = this.db): RiskLink[] {
    return reader.all("SELECT subject_kind, subject_id, added_by, added_at FROM risk_links WHERE risk_id = ? ORDER BY added_at, subject_kind, subject_id", [riskId])
      .map(row => ({ subject: subjectOf(row), added_by: text(row, "added_by"), added_at: text(row, "added_at") }));
  }

  events(riskId: string): RiskEvent[] {
    return this.db.all("SELECT event_id, kind, detail_json, actor_id, at FROM risk_events WHERE risk_id = ? ORDER BY at DESC, event_id DESC", [riskId])
      .map(row => ({ event_id: text(row, "event_id"), kind: text(row, "kind") as RiskEventKind, detail: JSON.parse(text(row, "detail_json")) as RiskEvent["detail"],
        actor_id: text(row, "actor_id"), at: text(row, "at") }));
  }

  create(tx: PluginDatabaseTransaction, input: RiskFields & { links: readonly ActionSubject[] }, actorId: string, now: string): RiskRecord {
    const fields = checked(input);
    const riskId = `risk-${randomUUID()}`;
    tx.run(`INSERT INTO risk_items (${ITEM_COLUMNS}, project_id) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', 1, ?, ?, ?, NULL, ?)`,
      [riskId, fields.title, fields.statement, fields.impact, fields.likelihood, fields.treatment, fields.owner_name, actorId, now, now, this.projectId]);
    this.event(tx, riskId, "created", {}, actorId, now);
    for (const subject of unique(input.links)) this.link(tx, riskId, subject, actorId, now, false);
    return this.get(riskId, tx);
  }

  /** Changes the fields given, at the revision the caller read; a closed risk is refused, and a stale revision gets the current one back. */
  update(tx: PluginDatabaseTransaction, riskId: string, expectedRevision: number, changes: Partial<RiskFields>, actorId: string, now: string): RiskRecord {
    const current = this.current(tx, riskId, expectedRevision);
    if (current.status === "closed") throw riskErrors.closed("这条风险已关闭，重新打开后才能修改");
    const next = checked({ ...current, ...changes });
    const fields = RISK_EDIT_FIELDS.filter(key => next[key] !== current[key]);
    if (fields.length === 0) return current;
    tx.run(`UPDATE risk_items SET title = ?, statement = ?, impact = ?, likelihood = ?, treatment = ?, owner_name = ?, revision = revision + 1, updated_at = ?
      WHERE project_id = ? AND risk_id = ?`, [next.title, next.statement, next.impact, next.likelihood, next.treatment, next.owner_name, now, this.projectId, riskId]);
    this.event(tx, riskId, "updated", { fields }, actorId, now);
    return this.get(riskId, tx);
  }

  setStatus(tx: PluginDatabaseTransaction, riskId: string, expectedRevision: number, status: RiskStatus, note: string | null, actorId: string, now: string): RiskRecord {
    const current = this.current(tx, riskId, expectedRevision);
    if (current.status === status) return current;
    tx.run("UPDATE risk_items SET status = ?, closed_at = ?, revision = revision + 1, updated_at = ? WHERE project_id = ? AND risk_id = ?",
      [status, status === "closed" ? now : null, now, this.projectId, riskId]);
    this.event(tx, riskId, "status", { status, previous_status: current.status, ...(note ? { text: limitedNote(note) } : {}) }, actorId, now);
    return this.get(riskId, tx);
  }

  addNote(tx: PluginDatabaseTransaction, riskId: string, note: string, actorId: string, now: string): RiskEvent {
    this.get(riskId, tx);
    const text = limitedNote(note);
    if (!text.trim()) throw riskErrors.invalid("进展不能是空的");
    const eventId = this.event(tx, riskId, "note", { text }, actorId, now);
    tx.run("UPDATE risk_items SET revision = revision + 1, updated_at = ? WHERE project_id = ? AND risk_id = ?", [now, this.projectId, riskId]);
    return { event_id: eventId, kind: "note", detail: { text }, actor_id: actorId, at: now };
  }

  /** Links an object; linking one already there changes nothing. A closed risk keeps its links as they were. */
  link(tx: PluginDatabaseTransaction, riskId: string, subject: ActionSubject, actorId: string, now: string, touch = true): void {
    const risk = this.get(riskId, tx);
    if (touch && risk.status === "closed") throw riskErrors.closed("这条风险已关闭，重新打开后才能改关联");
    if (this.links(riskId, tx).some(link => sameSubject(link.subject, subject))) return;
    if (this.links(riskId, tx).length >= RISK_LIMITS.links) throw riskErrors.invalid(`一条风险最多关联 ${RISK_LIMITS.links} 个对象`);
    tx.run("INSERT INTO risk_links (risk_id, subject_kind, subject_id, added_by, added_at) VALUES (?, ?, ?, ?, ?)", [riskId, subject.kind, subject.id, actorId, now]);
    if (!touch) return;
    this.event(tx, riskId, "linked", { subject }, actorId, now);
    tx.run("UPDATE risk_items SET revision = revision + 1, updated_at = ? WHERE project_id = ? AND risk_id = ?", [now, this.projectId, riskId]);
  }

  unlink(tx: PluginDatabaseTransaction, riskId: string, subject: ActionSubject, actorId: string, now: string): void {
    const risk = this.get(riskId, tx);
    if (risk.status === "closed") throw riskErrors.closed("这条风险已关闭，重新打开后才能改关联");
    const removed = tx.run("DELETE FROM risk_links WHERE risk_id = ? AND subject_kind = ? AND subject_id = ?", [riskId, subject.kind, subject.id]).changes;
    if (Number(removed) === 0) return;
    this.event(tx, riskId, "unlinked", { subject }, actorId, now);
    tx.run("UPDATE risk_items SET revision = revision + 1, updated_at = ? WHERE project_id = ? AND risk_id = ?", [now, this.projectId, riskId]);
  }

  private current(tx: PluginDatabaseTransaction, riskId: string, expectedRevision: number): RiskRecord {
    const current = this.get(riskId, tx);
    if (current.revision !== expectedRevision) throw riskErrors.conflict("这条风险刚被别处改过", { current });
    return current;
  }

  private event(tx: PluginDatabaseTransaction, riskId: string, kind: RiskEventKind, detail: RiskEvent["detail"], actorId: string, now: string): string {
    const eventId = `riskevt-${randomUUID()}`;
    tx.run("INSERT INTO risk_events (event_id, risk_id, kind, detail_json, actor_id, at) VALUES (?, ?, ?, ?, ?, ?)", [eventId, riskId, kind, JSON.stringify(detail), actorId, now]);
    return eventId;
  }
}

export const sameSubject = (a: ActionSubject, b: ActionSubject) => a.kind === b.kind && a.id === b.id;
function unique(subjects: readonly ActionSubject[]): ActionSubject[] {
  return subjects.filter((subject, index) => subjects.findIndex(other => sameSubject(other, subject)) === index);
}
function limitedNote(note: string): string {
  if ([...note].length > RISK_LIMITS.note) throw riskErrors.invalid(`进展超出 ${RISK_LIMITS.note} 字`);
  return note;
}
export type { RiskEditField };
