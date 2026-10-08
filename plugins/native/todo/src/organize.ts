import type { DatabaseSync } from "node:sqlite";
import type { TodoBatch, TodoBatchMaterial, TodoCandidate, TodoItem, TodoPlacement, TodoSource } from "@molis-ai/molis-work-contracts/modules/todo";
import { TODO_SUBJECT_KIND } from "@molis-ai/molis-work-contracts/modules/todo";
import { isTodoDate, isTodoTime } from "./dates.js";
import { TodoError } from "./error.js";
import { normalizeForMatch, TODO_ORGANIZE_MATERIAL_CHARS, type TodoCandidateDraft, type TodoOrganizeMaterial } from "./organize-model.js";
import { todoRequestKey, type TodoAccess, type TodoFields, type TodoStore } from "./store.js";

/** What the person chose for one candidate in the review. */
export interface TodoCandidateDecision {
  readonly candidate_id: string;
  readonly action: "add" | "merge" | "update" | "complete" | "reopen" | "ignore";
  /** Their edits before adding: title, dates, placement, notes. */
  readonly edits?: { readonly title?: string; readonly due_date?: string | null; readonly due_time?: string | null; readonly planned_date?: string | null;
    readonly placement?: TodoPlacement; readonly notes?: string };
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
interface BatchRow { batch_id: string; project_id: string | null; origin: string; method: string; title: string; body_json: string; status: string; created_at: string; updated_at: string; revision: number }
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

const fingerprint = (title: string) => normalizeForMatch(title).slice(0, 120);

/**
 * Organizing results beside the todos: each batch holds candidates until the person decides, and a small memory of
 * what came from which material, so importing the same material again does not bring back what was handled or ignored.
 */
export class TodoOrganizer {
  private readonly db: DatabaseSync;

  constructor(private readonly store: TodoStore) {
    // Its tables are part of the Todo store's baseline (TODO_STORE_BASELINE).
    this.db = store.database();
  }

  list(access: TodoAccess, status: "open" | "all" = "open"): TodoBatch[] {
    const rows = this.db.prepare("SELECT * FROM todo_batches ORDER BY created_at DESC LIMIT 50").all() as unknown as BatchRow[];
    return rows.filter(row => visible(row, access)).map(row => this.live(row, access)).filter(batch => status === "all" || batch.status === "open");
  }

  get(id: string, access: TodoAccess): TodoBatch {
    const row = this.db.prepare("SELECT * FROM todo_batches WHERE batch_id = ?").get(id) as BatchRow | undefined;
    const batch = row ? this.live(row, access) : null;
    if (!batch || !visible(batch, access)) throw new TodoError("todo.not_found", "找不到这份整理结果");
    return batch;
  }

  /**
   * The batch as it stands now: a candidate whose added todo was undone is undecided again (the batch reopens if it was only
   * closed by decisions), and an undecided candidate for an existing todo is read against that todo as it is today.
   */
  private live(row: BatchRow, access: TodoAccess): TodoBatch {
    const batch = fromRow(row);
    let reopened = false;
    const candidates = batch.candidates.map(candidate => {
      const added = candidate.decision?.action === "added" ? candidate.decision.item_id : null;
      if (added && !this.db.prepare("SELECT 1 FROM todo_items WHERE id = ?").get(added)) {
        reopened = true;
        return { ...candidate, decision: null };
      }
      return this.asOfNow(candidate, access);
    });
    return reopened ? { ...batch, candidates, status: "open" } : { ...batch, candidates };
  }

  /** An undecided candidate for an existing todo, with what it asks checked against the todo as it is now. */
  private asOfNow(candidate: TodoCandidate, access: TodoAccess): TodoCandidate {
    if (candidate.decision || !candidate.existing) return candidate;
    let item: TodoItem;
    try { item = this.store.get(candidate.existing.item_id, access); } catch { return candidate; }
    const existing = currentExisting(candidate.existing, item);
    return { ...candidate, existing, selected: existing.relation === "conflict" ? false : candidate.selected };
  }

  /** The batch an earlier request with this id created, so a retried request never organizes twice. */
  byRequest(requestId: string, access: TodoAccess): TodoBatch | null {
    const key = todoRequestKey(access, requestId);
    const seen = key ? this.db.prepare("SELECT batch_id FROM todo_batches WHERE request_id = ?").get(key) as { batch_id: string } | undefined : undefined;
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
      const seen = this.db.prepare("SELECT batch_id FROM todo_batches WHERE request_id = ?").get(requestKey) as { batch_id: string } | undefined;
      if (seen) return { batch: this.get(seen.batch_id, access), replayed: true };
    }
    const at = this.store.clock().toISOString();
    const materials: StoredMaterial[] = input.materials.map((material, index) => ({
      index: index + 1, title: material.title.slice(0, 200) || `材料 ${index + 1}`, subject: material.subject ?? null, open: material.open ?? null,
      received_at: material.received_at ?? null,
      read: material.read === "failed" ? "failed" : material.read === "truncated" || material.text.length > TODO_ORGANIZE_MATERIAL_CHARS ? "truncated" : "read",
      note: material.note ?? (material.text.length > TODO_ORGANIZE_MATERIAL_CHARS ? `只读了前 ${TODO_ORGANIZE_MATERIAL_CHARS} 字` : ""),
      source_key: materialSourceKey(material),
    }));
    const visibleItems = new Map(this.store.list(access).map(item => [item.id, item]));
    let ignoredAgain = 0, handledAgain = 0;
    const byFingerprint = new Map<string, TodoCandidateDraft>();
    for (const draft of input.candidates) {
      const print = fingerprint(draft.title);
      const keys = [...new Set(draft.evidence.map(entry => materials[entry.material - 1]?.source_key).filter((key): key is string => Boolean(key)))];
      const memory = keys.map(key => this.db.prepare("SELECT * FROM todo_source_memory WHERE source_key = ? AND fingerprint = ?").get(key, print) as
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
    const batch: TodoBatch = { batch_id: crypto.randomUUID(), title: input.title.slice(0, 120) || `整理 ${materials.length} 份材料`, origin: input.origin, project_id: access.projectId,
      method: input.method, materials: materials.map(strip), candidates, reference_only: input.reference_only, notes, status: candidates.length ? "open" : "done",
      created_at: at, updated_at: at, revision: 1 };
    this.db.prepare(`INSERT INTO todo_batches (batch_id, project_id, origin, method, title, body_json, status, created_at, updated_at, revision, request_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(batch.batch_id, batch.project_id, batch.origin, batch.method, batch.title,
      JSON.stringify({ materials, candidates, reference_only: batch.reference_only, notes } satisfies BatchBody), batch.status, at, at, 1, requestKey);
    return { batch, replayed: false };
  }

  /** Apply the person's choices, all or nothing. Candidates not mentioned stay open for later. */
  apply(batchId: string, decisions: readonly TodoCandidateDecision[], expectedRevision: number | undefined, access: TodoAccess): TodoApplyResult {
    const row = this.db.prepare("SELECT * FROM todo_batches WHERE batch_id = ?").get(batchId) as BatchRow | undefined;
    if (!row || !visible(fromRow(row), access)) throw new TodoError("todo.not_found", "找不到这份整理结果");
    if (expectedRevision !== undefined && row.revision !== expectedRevision) throw new TodoError("todo.conflict", "这份整理结果已在别处处理过，请重新打开");
    const body = JSON.parse(row.body_json) as BatchBody;
    const current = this.live(row, access);
    body.candidates = body.candidates.map(candidate => ({ ...candidate, decision: current.candidates.find(entry => entry.candidate_id === candidate.candidate_id)?.decision ?? null }));
    if (!decisions.length) throw new TodoError("todo.invalid", "先选要怎么处理");
    const changeBatch = crypto.randomUUID();
    const at = this.store.clock().toISOString();
    const results: { candidate_id: string; action: string; item_id: string | null }[] = [];
    const itemFor = new Map<string, string>();
    this.store.inTransaction(() => {
      for (const decision of decisions) {
        const index = body.candidates.findIndex(candidate => candidate.candidate_id === decision.candidate_id);
        const candidate = body.candidates[index];
        if (!candidate) throw new TodoError("todo.not_found", "整理结果里没有这一项");
        if (candidate.decision) throw new TodoError("todo.conflict", `「${candidate.title}」已经处理过了`);
        const sources = candidate.evidence.map(entry => this.sourceFor(body.materials[entry.material - 1]!, entry.excerpt, candidate, row.origin as TodoBatch["origin"]));
        const keys = [...new Set(candidate.evidence.map(entry => body.materials[entry.material - 1]!.source_key))];
        let itemId: string | null = null;
        let record = candidate.existing;
        let outcome: NonNullable<TodoCandidate["decision"]>["action"];
        if (decision.action === "ignore") {
          outcome = "ignored";
        } else if (decision.action === "add") {
          const edits = decision.edits ?? {};
          const placement = edits.placement ?? candidate.placement;
          const fields: TodoFields = {
            title: edits.title ?? candidate.title,
            notes: edits.notes ?? candidate.why,
            due_date: edits.due_date !== undefined ? edits.due_date : candidate.due_date,
            due_time: edits.due_time !== undefined ? edits.due_time : candidate.due_time,
            planned_date: edits.planned_date !== undefined ? edits.planned_date : null,
            placement: placement === "project" && !access.projectId ? "unassigned" : placement,
            waiting: candidate.kind === "waiting" && candidate.waiting ? { who: candidate.waiting.who, what: candidate.waiting.what, follow_up_on: null } : undefined,
          };
          const created = this.store.create({ ...fields, title: fields.title!, status: candidate.kind === "waiting" ? "waiting" : "open", sources }, access, changeBatch);
          itemId = created.item.id;
          outcome = "added";
        } else {
          if (!candidate.existing) throw new TodoError("todo.invalid", `「${candidate.title}」没有对应的已有待办`);
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
        for (const key of keys) {
          this.db.prepare(`INSERT INTO todo_source_memory (source_key, fingerprint, decision, item_id, reason, at) VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT (source_key, fingerprint) DO UPDATE SET decision = excluded.decision, item_id = excluded.item_id, reason = excluded.reason, at = excluded.at`)
            .run(key, fingerprint(candidate.title), outcome === "ignored" ? "ignored" : "handled", itemId, decision.ignore_reason?.slice(0, 100) ?? "", at);
        }
        if (itemId) itemFor.set(candidate.candidate_id, itemId);
        body.candidates[index] = { ...candidate, existing: record, decision: { action: outcome, item_id: itemId, reason: decision.ignore_reason?.slice(0, 100) ?? "", at } };
        results.push({ candidate_id: candidate.candidate_id, action: outcome, item_id: itemId });
      }
      // A todo added from a candidate that waits for another one waits for that todo.
      for (const decision of decisions) {
        if (decision.action !== "add") continue;
        const candidate = body.candidates.find(entry => entry.candidate_id === decision.candidate_id)!;
        for (const other of candidate.depends_on) {
          const otherItem = itemFor.get(other) ?? body.candidates.find(entry => entry.candidate_id === other)?.decision?.item_id;
          const ownItem = itemFor.get(candidate.candidate_id);
          if (!otherItem || !ownItem) continue;
          const target = this.store.get(otherItem, access);
          this.store.link(ownItem, { add: { kind: "todo", subject: { kind: TODO_SUBJECT_KIND, id: otherItem }, title: target.title, relation: "blocked_by", outcome: null, open: null } }, undefined, access, changeBatch);
        }
      }
      const status = body.candidates.every(candidate => candidate.decision) ? "done" : "open";
      const updated = this.db.prepare("UPDATE todo_batches SET body_json = ?, status = ?, updated_at = ?, revision = revision + 1 WHERE batch_id = ? AND revision = ?")
        .run(JSON.stringify(body), status, at, batchId, row.revision);
      if (updated.changes !== 1) throw new TodoError("todo.conflict", "这份整理结果已在别处处理过，请重新打开");
    });
    return { batch: this.get(batchId, access), change_batch_id: changeBatch, results };
  }

  /** Put a batch away with its undecided candidates left as they are. */
  close(batchId: string, access: TodoAccess): TodoBatch {
    const batch = this.get(batchId, access);
    if (batch.status === "done") return batch;
    this.db.prepare("UPDATE todo_batches SET status = 'done', updated_at = ?, revision = revision + 1 WHERE batch_id = ?").run(this.store.clock().toISOString(), batchId);
    return this.get(batchId, access);
  }

  private sourceFor(material: StoredMaterial, excerpt: string, candidate: TodoCandidate, origin: TodoBatch["origin"]): Omit<TodoSource, "source_id" | "added_at"> {
    return { kind: origin === "onboarding" ? "onboarding" : "material", title: material.title, excerpt, reason: candidate.why.slice(0, 500),
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

function visible(batch: Pick<TodoBatch, "project_id">, access: TodoAccess): boolean {
  return access.everything || batch.project_id === null || batch.project_id === access.projectId;
}

function strip(material: StoredMaterial): TodoBatchMaterial {
  const { source_key: _key, ...rest } = material;
  return rest;
}

function fromRow(row: BatchRow): TodoBatch {
  const body = JSON.parse(row.body_json) as BatchBody;
  return { batch_id: row.batch_id, title: row.title, origin: row.origin as TodoBatch["origin"], project_id: row.project_id, method: row.method,
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
