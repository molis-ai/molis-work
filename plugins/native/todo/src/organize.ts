import { ActionError, sameCarriedRecord, type PlacementExport, type PlacementRecord } from "@molis-ai/molis-work-contracts/platform/actions";
import { TODO_BATCH_SUBJECT_KIND } from "./batch-kind.js";
import type { TodoBatch, TodoBatchMaterial, TodoCandidate, TodoItem, TodoSource } from "./contract.js";
import { TODO_ORGANIZE_MATERIAL_CHARS, TODO_SUBJECT_KIND } from "./contract.js";
import { isTodoDate, isTodoTime } from "./dates.js";
import { todoErrors } from "./error.js";
import { materialReadText, normalizeForMatch, type TodoCandidateDraft, type TodoOrganizeMaterial } from "./organize-model.js";
import { todoRequestKey, type TodoAccess, type TodoFields, type TodoSql, type TodoStore } from "./store.js";

/** What the person chose for one candidate in the review. */
export interface TodoCandidateDecision {
  readonly candidate_id: string;
  readonly action: "add" | "merge" | "update" | "complete" | "reopen" | "ignore";
  /** Their edits before adding: title, dates, notes. */
  readonly edits?: { readonly title?: string; readonly due_date?: string | null; readonly due_time?: string | null; readonly planned_date?: string | null;
    readonly notes?: string };
  /** Protected fields the person chose to take from the material anyway. */
  readonly accept_protected?: readonly string[];
  readonly ignore_reason?: string;
}

export interface TodoApplyResult {
  readonly batch: TodoBatch;
  /** Every todo change this apply made shares one id; undo it with `todo.changes.revert`. */
  readonly change_batch_id: string;
  readonly results: readonly { readonly candidate_id: string; readonly action: string; readonly item_id: string | null }[];
}

interface StoredMaterial extends TodoBatchMaterial { readonly source_key: string }
interface BatchRow { batch_id: string; origin: string; method: string; title: string; body_json: string; status: string; created_at: string; updated_at: string; revision: number; request_id?: string | null }
interface BatchBody { materials: StoredMaterial[]; candidates: TodoCandidate[]; reference_only: TodoBatch["reference_only"]; notes: string[] }

/** FNV-1a, enough to recognise the same pasted text again. */
function hash(value: string): string {
  let h = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) h = Math.imul(h ^ value.charCodeAt(index), 0x01000193) >>> 0;
  return h.toString(36) + value.length.toString(36);
}

/** A material's identity across imports: its owner's object when known, else its text. */
export function materialSourceKey(material: Pick<TodoOrganizeMaterial, "subject" | "text">): string {
  return material.subject ? `s:${material.subject.kind}:${material.subject.id}` : `t:${hash(normalizeForMatch(material.text).slice(0, 4000))}`;
}

const fingerprint = (title: string) => [...normalizeForMatch(title)].slice(0, 120).join("");

/**
 * Organizing results beside the todos: each batch holds candidates until the person decides, and a small memory of
 * what came from which material, so importing the same material again does not bring back what was handled or ignored.
 */
export class TodoOrganizer {
  private readonly db: TodoSql;

  constructor(private readonly store: TodoStore) {
    // Its tables are part of the Todo library's schema (TODO_DATABASE).
    this.db = store.database();
  }

  list(access: TodoAccess, status: "open" | "all" = "open"): TodoBatch[] {
    // A completed batch reopens when undo removed one of its adopted items (see afterUndo).
    const rows = this.db.all(`SELECT * FROM todo_batches
      WHERE (? = 'all' OR status = 'open' OR EXISTS (
          SELECT 1 FROM json_each(todo_batches.body_json, '$.candidates') AS candidate
          WHERE candidate.value ->> '$.decision.action' = 'added'
            AND candidate.value ->> '$.decision.item_id' IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM todo_items WHERE id = candidate.value ->> '$.decision.item_id')
        ))
      ORDER BY created_at DESC, batch_id DESC LIMIT 50`, [status]) as unknown as BatchRow[];
    return rows.map(row => this.live(row, access));
  }

  get(id: string, access: TodoAccess): TodoBatch {
    return this.live(this.visibleRow(id, access), access);
  }

  private visibleRow(id: string, _access: TodoAccess): BatchRow {
    const row = this.db.get("SELECT * FROM todo_batches WHERE batch_id = ?", [id]) as BatchRow | undefined;
    if (!row) throw todoErrors.not_found("找不到这份整理结果");
    return row;
  }

  /** Undo of an addition makes its candidate undecided again, without changing other choices. */
  private afterUndo(candidate: TodoCandidate): TodoCandidate {
    const added = candidate.decision?.action === "added" ? candidate.decision.item_id : null;
    return added && !this.db.get("SELECT 1 FROM todo_items WHERE id = ?", [added]) ? { ...candidate, decision: null } : candidate;
  }

  /**
   * The batch as it stands now: a candidate whose added todo was undone is undecided again (the batch reopens if it was only
   * closed by decisions), and an undecided candidate for an existing todo is read against that todo as it is today.
   */
  private live(row: BatchRow, access: TodoAccess): TodoBatch {
    const body = decodeBody(row);
    const candidates = body.candidates.map(candidate => this.afterUndo(candidate));
    const reopened = candidates.some((candidate, index) => candidate !== body.candidates[index]);
    return { ...fromRow(row, body), candidates: candidates.map(candidate => this.asOfNow(candidate, access)),
      status: reopened ? "open" : row.status as TodoBatch["status"] };
  }

  /** An undecided candidate for an existing todo, with what it asks checked against the todo as it is now. */
  private asOfNow(candidate: TodoCandidate, access: TodoAccess): TodoCandidate {
    if (candidate.decision || !candidate.existing) return candidate;
    let item: TodoItem;
    try { item = this.store.get(candidate.existing.item_id, access); } catch (error) {
      if (error instanceof ActionError && error.code === "todo.not_found") return candidate;
      throw error;
    }
    const existing = currentExisting(candidate.existing, item);
    return { ...candidate, existing, selected: existing.relation === "conflict" ? false : candidate.selected };
  }

  /** The batch an earlier request with this id created, so a retried request never organizes twice. */
  byRequest(requestId: string, access: TodoAccess): TodoBatch | null {
    const key = todoRequestKey(access, requestId);
    const seen = key ? this.db.get("SELECT batch_id FROM todo_batches WHERE request_id = ?", [key]) as { batch_id: string } | undefined : undefined;
    return seen ? this.get(seen.batch_id, access) : null;
  }

  /**
   * Save an organizing pass. Candidates the person already handled or ignored from the same material are left out,
   * the same thing seen twice is merged, and a note says what was left out and why.
   */
  create(input: { title: string; origin: TodoBatch["origin"]; method: string; materials: readonly TodoOrganizeMaterial[]; candidates: readonly TodoCandidateDraft[];
    reference_only: TodoBatch["reference_only"]; unverified: number; request_id?: string }, access: TodoAccess): { batch: TodoBatch; replayed: boolean } {
    const requestKey = todoRequestKey(access, input.request_id);
    if (requestKey) {
      const seen = this.db.get("SELECT batch_id FROM todo_batches WHERE request_id = ?", [requestKey]) as { batch_id: string } | undefined;
      if (seen) return { batch: this.get(seen.batch_id, access), replayed: true };
    }
    const at = this.store.clock().toISOString();
    const materials: StoredMaterial[] = input.materials.map((material, index) => ({
      index: index + 1, title: [...material.title].slice(0, 200).join("") || `材料 ${index + 1}`, subject: material.subject ?? null, open: material.open ?? null,
      received_at: material.received_at ?? null,
      read: material.read === "failed" ? "failed" : material.read === "truncated" || materialReadText(material.text) !== material.text ? "truncated" : "read",
      note: material.note ?? (materialReadText(material.text) !== material.text ? `只读了前 ${TODO_ORGANIZE_MATERIAL_CHARS} 字` : ""),
      source_key: materialSourceKey(material),
    }));
    const visibleItems = new Map(this.store.list(access).map(item => [item.id, item]));
    let ignoredAgain = 0, handledAgain = 0;
    const byFingerprint = new Map<string, TodoCandidateDraft>();
    for (const draft of input.candidates) {
      const print = fingerprint(draft.title);
      const keys = [...new Set(draft.evidence.map(entry => materials[entry.material - 1]?.source_key).filter((key): key is string => Boolean(key)))];
      const memory = keys.map(key => this.db.get("SELECT * FROM todo_source_memory WHERE source_key = ? AND fingerprint = ?", [key, print]) as
        { decision: string; item_id: string | null } | undefined).find(Boolean);
      if (memory?.decision === "ignored") { ignoredAgain += 1; continue; }
      let candidate = draft;
      const handled = memory?.item_id ? visibleItems.get(memory.item_id) : undefined;
      if (handled && !candidate.existing) candidate = { ...candidate, existing: { item_id: handled.id, title: handled.title, relation: "same", changes: {}, protected: [], reason: "这份材料之前整理过" } };
      if (candidate.existing && ["same", "conflict"].includes(candidate.existing.relation) && !Object.keys(candidate.existing.changes).length) {
        const item = visibleItems.get(candidate.existing.item_id);
        const alreadyThere = item && keys.every(key => item.sources.some(source => sourceKeyOf(source) === key));
        if (alreadyThere && candidate.existing.relation === "same") { handledAgain += 1; continue; }
      }
      const twin = byFingerprint.get(print);
      if (twin) { byFingerprint.set(print, { ...twin, evidence: [...twin.evidence, ...candidate.evidence].slice(0, 5) }); continue; }
      byFingerprint.set(print, candidate);
    }
    const ids = new Map<string, string>();
    for (const draft of byFingerprint.values()) ids.set(draft.ref, crypto.randomUUID());
    const candidates: TodoCandidate[] = [...byFingerprint.values()].map(draft => {
      const { ref, ...rest } = draft;
      return { ...rest, candidate_id: ids.get(ref)!, depends_on: rest.depends_on.flatMap(other => ids.has(other) ? [ids.get(other)!] : []),
        selected: rest.kind !== "suggestion" && rest.existing?.relation !== "conflict", decision: null };
    });
    const notes = [
      ...(ignoredAgain ? [`你之前忽略过的 ${ignoredAgain} 条没有再列出`] : []),
      ...(handledAgain ? [`已经在待办里的 ${handledAgain} 条没有再列出`] : []),
      ...(input.unverified ? [`${input.unverified} 条在原文里找不到依据，已略去`] : []),
      ...materials.filter(material => material.read !== "read").map(material => `「${material.title}」${material.read === "failed" ? "没读成" : "没读完"}${material.note ? "：" + material.note : ""}`),
    ];
    const batch: TodoBatch = { batch_id: crypto.randomUUID(), title: [...input.title].slice(0, 120).join("") || `整理 ${materials.length} 份材料`, origin: input.origin,
      method: input.method, materials: materials.map(strip), candidates, reference_only: input.reference_only, notes, status: candidates.length ? "open" : "done",
      created_at: at, updated_at: at, revision: 1 };
    this.db.run(`INSERT INTO todo_batches (batch_id, origin, method, title, body_json, status, created_at, updated_at, revision, request_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [batch.batch_id, batch.origin, batch.method, batch.title,
      JSON.stringify({ materials, candidates, reference_only: batch.reference_only, notes } satisfies BatchBody), batch.status, at, at, 1, requestKey]);
    return { batch, replayed: false };
  }

  /**
   * A batch as placement carries it between partitions (batch 108; onboarding drafts in the personal space and the platform moves each
   * batch into the new project before keeping it): its row without the id.
   */
  exportBatch(id: string): PlacementExport {
    const row = this.db.get("SELECT * FROM todo_batches WHERE batch_id = ?", [id]) as BatchRow | undefined;
    if (!row) throw todoErrors.not_found("找不到这份整理结果");
    return { subject: { kind: TODO_BATCH_SUBJECT_KIND, id }, revision: String(row.revision), record: batchRecord(row) };
  }

  /**
   * Writes a carried batch here: under its id for a move, as a new batch for a copy (the same request, the same copy). Only a batch none of
   * whose drafts was kept yet travels (what was kept is a todo where it was), and a draft's match with a todo there is let go: that todo is
   * not here, so the draft reads as a new one.
   */
  putBatch(record: PlacementRecord, requestId: string, targetId?: string): TodoBatch {
    const row = carriedBatch(record);
    let id = targetId;
    if (id === undefined) {
      const key = `copy:${requestId}`;
      const seen = this.db.get("SELECT batch_id FROM todo_batches WHERE request_id = ?", [key]) as { batch_id: string } | undefined;
      if (seen) return this.get(seen.batch_id, { actor: "other", actorId: "" });
      id = crypto.randomUUID();
      row.request_id = key;
    }
    const here = this.db.get("SELECT * FROM todo_batches WHERE batch_id = ?", [id]) as BatchRow | undefined;
    if (here) {
      if (sameCarriedRecord(batchRecord(here), batchRecord({ ...row, batch_id: id }))) return this.get(id, { actor: "other", actorId: "" });
      throw todoErrors.conflict("目标位置已经有这份整理结果，而且内容不同；没有覆盖它");
    }
    this.db.run(`INSERT INTO todo_batches (batch_id, origin, method, title, body_json, status, created_at, updated_at, revision, request_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, row.origin, row.method, row.title, row.body_json, row.status, row.created_at, row.updated_at, row.revision, row.request_id ?? null]);
    return this.get(id, { actor: "other", actorId: "" });
  }

  /** Lets a batch that went to another partition go from here, only while it is still the revision carried. */
  removeCarriedBatch(id: string, revision: string): boolean {
    const row = this.db.get("SELECT revision FROM todo_batches WHERE batch_id = ?", [id]) as { revision: number } | undefined;
    if (!row) return false;
    if (String(row.revision) !== revision) throw todoErrors.conflict("这份整理结果刚被处理过，请重新打开后再移动");
    return Number(this.db.run("DELETE FROM todo_batches WHERE batch_id = ? AND revision = ?", [id, row.revision]).changes) === 1;
  }

  /** Apply the person's choices, all or nothing. Candidates not mentioned stay open for later. */
  apply(batchId: string, decisions: readonly TodoCandidateDecision[], expectedRevision: number | undefined, access: TodoAccess): TodoApplyResult {
    const row = this.visibleRow(batchId, access);
    if (expectedRevision !== undefined && row.revision !== expectedRevision) throw todoErrors.conflict("这份整理结果已在别处处理过，请重新打开");
    const body = decodeBody(row);
    body.candidates = body.candidates.map(candidate => this.afterUndo(candidate));
    if (!decisions.length) throw todoErrors.invalid("先选要怎么处理");
    const changeBatch = crypto.randomUUID();
    const at = this.store.clock().toISOString();
    const results: { candidate_id: string; action: string; item_id: string | null }[] = [];
    const adopted = new Set<string>();
    this.store.inTransaction(() => {
      for (const decision of decisions) {
        const index = body.candidates.findIndex(candidate => candidate.candidate_id === decision.candidate_id);
        const candidate = body.candidates[index];
        if (!candidate) throw todoErrors.not_found("整理结果里没有这一项");
        if (candidate.decision) throw todoErrors.conflict(`「${candidate.title}」已经处理过了`);
        const sources = candidate.evidence.map(entry => this.sourceFor(body.materials[entry.material - 1]!, entry.excerpt, candidate, row.origin as TodoBatch["origin"]));
        const keys = [...new Set(candidate.evidence.map(entry => body.materials[entry.material - 1]!.source_key))];
        let itemId: string | null = null;
        let record = candidate.existing;
        let outcome: NonNullable<TodoCandidate["decision"]>["action"];
        if (decision.action === "ignore") {
          outcome = "ignored";
        } else if (decision.action === "add") {
          const edits = decision.edits ?? {};
          const fields: TodoFields = {
            title: edits.title ?? candidate.title,
            notes: edits.notes ?? candidate.why,
            due_date: edits.due_date !== undefined ? edits.due_date : candidate.due_date,
            due_time: edits.due_time !== undefined ? edits.due_time : candidate.due_time,
            planned_date: edits.planned_date !== undefined ? edits.planned_date : null,
            waiting: candidate.kind === "waiting" && candidate.waiting ? { who: candidate.waiting.who, what: candidate.waiting.what, follow_up_on: null } : undefined,
          };
          const created = this.store.create({ ...fields, title: fields.title!, status: candidate.kind === "waiting" ? "waiting" : "open", sources }, access, changeBatch);
          itemId = created.item.id;
          outcome = "added";
        } else {
          if (!candidate.existing) throw todoErrors.invalid(`「${candidate.title}」没有对应的已有待办`);
          const target = this.store.get(candidate.existing.item_id, access);
          itemId = target.id;
          // Protection is read from the todo as it is at this moment, not as it was when the batch was made; what is written
          // and what the candidate keeps as its record come from the same reading.
          record = settled(currentExisting(candidate.existing, target), decision.action, decision.accept_protected ?? []);
          if (decision.action === "update" || decision.action === "reopen") {
            if (Object.keys(record.changes).length) this.store.update(target.id, record.changes as TodoFields, undefined, access, changeBatch);
            if (decision.action === "reopen") this.store.setStatus(target.id, "open", undefined, access, changeBatch);
          }
          if (decision.action === "complete") this.store.setStatus(target.id, "done", undefined, access, changeBatch);
          for (const source of sources) {
            const current = this.store.get(target.id, access);
            if (!current.sources.some(existing => sourceKeyOf(existing) === sourceKeyOf(source) && existing.excerpt === source.excerpt)) this.store.addSource(target.id, source, access, changeBatch);
          }
          outcome = decision.action === "merge" ? "merged" : "updated";
        }
        const reason = [...decision.ignore_reason ?? ""].slice(0, 100).join("");
        for (const key of keys) {
          this.db.run(`INSERT INTO todo_source_memory (source_key, fingerprint, decision, item_id, reason, at) VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT (source_key, fingerprint) DO UPDATE SET decision = excluded.decision, item_id = excluded.item_id, reason = excluded.reason, at = excluded.at`, [key, fingerprint(candidate.title), outcome === "ignored" ? "ignored" : "handled", itemId, reason, at]);
        }
        if (itemId) adopted.add(candidate.candidate_id);
        body.candidates[index] = { ...candidate, existing: record, decision: { action: outcome, item_id: itemId, reason, at } };
        results.push({ candidate_id: candidate.candidate_id, action: outcome, item_id: itemId });
      }
      // A todo added from a candidate that waits for another one waits for that todo.
      const decisionsById = new Map(body.candidates.map(candidate => [candidate.candidate_id, candidate.decision]));
      for (const candidate of body.candidates) {
        const ownItem = candidate.decision?.item_id;
        if (!ownItem || candidate.decision?.action !== "added") continue;
        for (const other of new Set(candidate.depends_on)) {
          if (!adopted.has(candidate.candidate_id) && !adopted.has(other)) continue;
          const otherItem = decisionsById.get(other)?.item_id;
          if (!otherItem || ownItem === otherItem) continue;
          if (this.store.get(ownItem, access).links.some(link => link.kind === "todo" && link.subject.id === otherItem)) continue;
          const target = this.store.get(otherItem, access);
          this.store.link(ownItem, { add: { kind: "todo", subject: { kind: TODO_SUBJECT_KIND, id: otherItem }, title: target.title, relation: "blocked_by", outcome: null, open: null } }, undefined, access, changeBatch);
        }
      }
      const status = body.candidates.every(candidate => candidate.decision) ? "done" : "open";
      const updated = this.db.run("UPDATE todo_batches SET body_json = ?, status = ?, updated_at = ?, revision = revision + 1 WHERE batch_id = ? AND revision = ?", [JSON.stringify(body), status, at, batchId, row.revision]);
      if (updated.changes !== 1) throw todoErrors.conflict("这份整理结果已在别处处理过，请重新打开");
    });
    return { batch: this.get(batchId, access), change_batch_id: changeBatch, results };
  }

  /** Put a batch away with its undecided candidates left as they are. */
  close(batchId: string, access: TodoAccess): TodoBatch {
    return this.store.inTransaction(() => {
      const row = this.visibleRow(batchId, access), body = decodeBody(row);
      const candidates = body.candidates.map(candidate => this.afterUndo(candidate));
      if (row.status === "done" && candidates.every((candidate, index) => candidate === body.candidates[index])) return this.get(batchId, access);
      body.candidates = candidates;
      const changed = this.db.run(`UPDATE todo_batches SET body_json = ?, status = 'done', updated_at = ?,
        revision = revision + 1 WHERE batch_id = ? AND revision = ?`, [JSON.stringify(body), this.store.clock().toISOString(), batchId, row.revision]);
      if (changed.changes !== 1) throw todoErrors.conflict("这份整理结果已在别处处理过，请重新打开");
      return this.get(batchId, access);
    });
  }

  private sourceFor(material: StoredMaterial, excerpt: string, candidate: TodoCandidate, origin: TodoBatch["origin"]): Omit<TodoSource, "source_id" | "added_at"> {
    return { kind: origin === "onboarding" ? "onboarding" : "material", title: material.title, excerpt, reason: [...candidate.why].slice(0, 500).join(""),
      subject: material.subject, open: material.open };
  }
}

/**
 * What a candidate asks of an existing todo, against the todo as it is now. The candidate was written when the batch was
 * made; a field the person has edited by hand since is theirs, so it moves from `changes` to `protected` (taken only when
 * they choose), and what the todo already says needs no asking. An update left with nothing to change reads as a conflict
 * (something is held back) or as the same thing.
 */
function currentExisting(existing: NonNullable<TodoCandidate["existing"]>, item: TodoItem): NonNullable<TodoCandidate["existing"]> {
  const edited: readonly string[] = item.edited_fields;
  const held = existing.protected.filter(entry => item[entry.field] !== entry.value);
  const changes: Partial<Record<TodoChangeField, string | null>> = {};
  for (const [field, value] of Object.entries(existing.changes) as [TodoChangeField, string | null][]) {
    if (item[field] === value) continue;
    if (!edited.includes(field)) changes[field] = value;
    else if (!held.some(entry => entry.field === field)) held.push({ field, value });
  }
  const relation = existing.relation === "update" && !Object.keys(changes).length ? (held.length ? "conflict" : "same") : existing.relation;
  return { ...existing, relation, changes, protected: held };
}

type TodoChangeField = NonNullable<TodoCandidate["existing"]>["protected"][number]["field"];

/**
 * What a decided candidate keeps of its ask, for the review to read back: the changes actually written (a protected field
 * the person took counts, and only update and reopen write any) and the fields left as theirs. Its relation follows what
 * came of it, so a change that was held back or never written does not read as done.
 */
function settled(existing: NonNullable<TodoCandidate["existing"]>, action: TodoCandidateDecision["action"], taken: readonly string[]): NonNullable<TodoCandidate["existing"]> {
  const writes = action === "update" || action === "reopen";
  const accepted = writes ? existing.protected.filter(entry => taken.includes(entry.field)) : [];
  const changes = writes ? { ...existing.changes, ...Object.fromEntries(accepted.map(entry => [entry.field, entry.value])) } : {};
  const held = existing.protected.filter(entry => !accepted.includes(entry));
  const asked = existing.relation === "update" || existing.relation === "conflict";
  const relation = !asked ? existing.relation : Object.keys(changes).length ? "update" : held.length ? "conflict" : "same";
  return { ...existing, relation, changes, protected: held };
}

function sourceKeyOf(source: Pick<TodoSource, "subject" | "excerpt">): string {
  return source.subject ? `s:${source.subject.kind}:${source.subject.id}` : `t:${hash(normalizeForMatch(source.excerpt))}`;
}

function strip(material: StoredMaterial): TodoBatchMaterial {
  const { source_key: _key, ...rest } = material;
  return rest;
}

const BATCH_COLUMNS = ["origin", "method", "title", "body_json", "status", "created_at", "updated_at", "revision", "request_id"] as const;

function batchRecord(row: BatchRow): PlacementRecord {
  return Object.fromEntries(BATCH_COLUMNS.map(column => [column, row[column] ?? null]));
}

/** The row a carried batch makes here, checked as Todo checks its own (see `putBatch`). */
function carriedBatch(record: PlacementRecord): BatchRow {
  const keys = Object.keys(record).sort(), expected = [...BATCH_COLUMNS].sort();
  const invalid = () => todoErrors.invalid("带来的整理结果不完整，没有放进来");
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) throw invalid();
  const row = { batch_id: "carried", ...record } as unknown as BatchRow;
  if (!["assistant", "onboarding", "manual"].includes(row.origin) || typeof row.method !== "string" || row.method.length > 200 || typeof row.title !== "string"
    || [...row.title].length > 120 || !["open", "done"].includes(row.status) || typeof row.created_at !== "string" || typeof row.updated_at !== "string"
    || !Number.isSafeInteger(row.revision) || row.revision < 1 || (row.request_id !== null && typeof row.request_id !== "string") || typeof row.body_json !== "string") throw invalid();
  let body: BatchBody;
  try { body = JSON.parse(row.body_json) as BatchBody; } catch { throw invalid(); }
  if (!body || !Array.isArray(body.materials) || !Array.isArray(body.candidates) || !Array.isArray(body.notes) || body.candidates.length > 2000) throw invalid();
  if (body.candidates.some(candidate => candidate?.decision?.item_id)) throw todoErrors.conflict("这份整理结果里已经有加进待办的，留在原处");
  const candidates = body.candidates.map(candidate => candidate.existing ? { ...candidate, existing: null, selected: candidate.kind !== "suggestion" } : candidate);
  return { ...row, body_json: JSON.stringify({ ...body, candidates }) };
}

function decodeBody(row: BatchRow): BatchBody {
  try { return JSON.parse(row.body_json) as BatchBody; }
  catch { throw new Error(`Cannot decode todo_batches.body_json for batch ${row.batch_id}`); }
}

function fromRow(row: BatchRow, body: BatchBody): TodoBatch {
  return { batch_id: row.batch_id, title: row.title, origin: row.origin as TodoBatch["origin"], method: row.method,
    materials: body.materials.map(strip), candidates: body.candidates, reference_only: body.reference_only, notes: body.notes,
    status: row.status as TodoBatch["status"], created_at: row.created_at, updated_at: row.updated_at, revision: row.revision };
}

/** Re-check a person's date edits before they reach the store. */
export function validEdits(edits: TodoCandidateDecision["edits"]): boolean {
  if (!edits) return true;
  return (edits.due_date === undefined || edits.due_date === null || isTodoDate(edits.due_date))
    && (edits.planned_date === undefined || edits.planned_date === null || isTodoDate(edits.planned_date))
    && (edits.due_time === undefined || edits.due_time === null || isTodoTime(edits.due_time));
}
