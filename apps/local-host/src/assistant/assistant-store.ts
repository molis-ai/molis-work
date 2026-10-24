import type { ActionResultPresentation } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AssistantThreadRound } from "./assistant-thread-types.js";
import { randomUUID } from "node:crypto";
import { assistantErrors } from "./assistant-errors.js";
import { AssistantFollowUpRecords } from "./assistant-followups.js";
import { applySqliteBaseline, type openHomeSqliteDatabase, type SqliteBaseline, type HomeStoreDeclaration } from "@molis-ai/molis-work-storage";
import { CONTEXT_LEDGER_SCHEMA } from "@molis-ai/molis-work-module-context-ledger";
import { AssistantRelations } from "./assistant-relations.js";
import { AssistantUsageLedger } from "./assistant-usage-ledger.js";
import type { AssistantCharacter, AssistantContextSnapshot, AssistantUnsettledChange, AssistantNotice, AssistantRule, AssistantWorkState, AssistantExecutor, AssistantMaterial, AssistantScope, AssistantSendResult, AssistantSurfaceRef, AssistantWork, AssistantUndoable } from "@molis-ai/molis-work-contracts/services/assistant";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";

/** The Home SQLite handle, as the storage package opens it (the App boundary does not import `node:sqlite`). */
type DatabaseSync = ReturnType<typeof openHomeSqliteDatabase>;

export const ASSISTANT_STORE_NAME = "assistant";

/**
 * The Assistant's own facts: its works, the rounds the person started in them, and each Send's outcome. Conversation
 * content and run state stay in the Prologue session; business results stay with their owners. One current schema
 * (repository-anti-corruption §4.1), the relations the Assistant keeps in the context ledger included.
 *
 * `assistant_jobs` is no longer written: a job a work follows is a step on its graph (specs/prologue-adoption §6.0o).
 * It stays so every Home has the same schema, and a work's rows in it still go with the work. Dropping it is a later
 * version with a maintenance step on existing Homes, which is not done here.
 *
 * Version 3: the work body's executor is `{ kind: "plugin", plugin_id, … }` and a round's `executor` is `"plugin"`, where
 * version 2 wrote the old Coding-only kind (PG-036, C8-3). The tables are the same; a version 2 store is refused until a maintenance step
 * rewrites those two fields and the work in each finished Send's stored result (`assistant_requests.result`), because a read does not
 * translate them.
 */
export const ASSISTANT_STORE_BASELINE: SqliteBaseline = { version: 3, schema: `
CREATE TABLE assistant_works (
  work_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, revision INTEGER NOT NULL, updated_at TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0, body TEXT NOT NULL
);
CREATE INDEX assistant_works_by_actor ON assistant_works(actor_id, archived, updated_at);
CREATE TABLE assistant_rounds (
  work_id TEXT NOT NULL, run_id TEXT NOT NULL, position INTEGER NOT NULL, body TEXT NOT NULL,
  PRIMARY KEY(work_id, run_id)
);
CREATE TABLE assistant_cards (
  card_id TEXT PRIMARY KEY, work_id TEXT NOT NULL, revision INTEGER NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, body TEXT NOT NULL
);
CREATE INDEX assistant_cards_by_work ON assistant_cards(work_id, created_at);
CREATE TABLE assistant_settings (
  actor_id TEXT NOT NULL, key TEXT NOT NULL, revision INTEGER NOT NULL, value TEXT NOT NULL, PRIMARY KEY(actor_id, key)
);
CREATE TABLE assistant_notices (
  notice_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, work_id TEXT NOT NULL, kind TEXT NOT NULL, state TEXT NOT NULL,
  dedupe TEXT NOT NULL, created_at TEXT NOT NULL, body TEXT NOT NULL, UNIQUE(actor_id, dedupe)
);
CREATE INDEX assistant_notices_open ON assistant_notices(actor_id, state, created_at);
CREATE TABLE assistant_followups (
  followup_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, work_id TEXT NOT NULL, body TEXT NOT NULL
);
CREATE TABLE assistant_undos (
  undo_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, work_id TEXT NOT NULL, body TEXT NOT NULL
);
CREATE TABLE assistant_jobs (
  key TEXT PRIMARY KEY, actor_id TEXT NOT NULL, work_id TEXT NOT NULL, told INTEGER NOT NULL DEFAULT 0, body TEXT NOT NULL
);
CREATE TABLE assistant_usage (
  run_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, work_id TEXT NOT NULL, ended_at TEXT NOT NULL, input INTEGER NOT NULL, output INTEGER NOT NULL, cached INTEGER NOT NULL
);
CREATE INDEX assistant_usage_by_day ON assistant_usage(actor_id, ended_at);
CREATE TABLE assistant_unsettled (
  change_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, work_id TEXT NOT NULL, told INTEGER NOT NULL DEFAULT 0, body TEXT NOT NULL
);
CREATE TABLE assistant_observed (
  actor_id TEXT NOT NULL, work_id TEXT NOT NULL, state TEXT NOT NULL, PRIMARY KEY(actor_id, work_id)
);
CREATE TABLE assistant_requests (
  actor_id TEXT NOT NULL, request_id TEXT NOT NULL, work_id TEXT, state TEXT NOT NULL, result TEXT, created_at TEXT NOT NULL,
  PRIMARY KEY(actor_id, request_id)
);
${CONTEXT_LEDGER_SCHEMA}` };

/** A work as stored: the public record plus the project reference its actions and sessions are bound to. */
export interface StoredWork extends Omit<AssistantWork, "state" | "delegated_by"> {
  actor_id: string;
  thread_round?: AssistantThreadRound;
  /** What the next plugin round is told of the work so far, once, after the Assistant handed it over. Never shown as the work. */
  handover_brief?: string;
  /** Present for project work: the project it was started in, never the page it is later viewed from. */
  project_ref?: LocalHostProjectReference;
  /** The work's own task graph (its rounds and the parts it hands out stand on it), from its first round on. */
  graph_id?: string;
  /**
   * On a delegated work: the step it was handed out as on its delegating work's graph, that work's title when it asked,
   * what it was asked to deliver, and when the person took it back. Which work asked and its follow-ups are on the graph.
   */
  delegated_by?: { graph_id: string; node_id: string; title: string; acceptance: string; taken_back_at?: string };
  /** Half-written answers to the questions its rounds wait on, by pending id, as the question card's fields hold them. Never shown as the work. */
  question_drafts?: Record<string, Record<string, unknown>>;
  /** The person's explicit choice to hold automatic continuation; the SDK still owns the actual wait. */
  continuation_hold?: "paused" | "stopped";
}

/** A change that can be taken back: the public view plus the exact undo to run. */
interface StoredUndo extends AssistantUndoable {
  work_id: string;
  reference: { capability_id: string; version: number; provider_id: string };
  input: Record<string, unknown>;
  /** Told to the next round once undone. */
  told?: boolean;
}

/** A notice as stored: the public facts plus whether the person still has to see it. */
interface StoredNotice extends Omit<AssistantNotice, "held"> { state: "new" | "seen" | "dismissed" | "resolved" }

export interface StoredRound {
  run_id: string;
  /** Set for a round run in the work's plugin session; the others ran in the Assistant's own session. */
  executor?: "plugin";
  /** The Character that carried it, as frozen at its start. */
  character?: AssistantCharacter;
  /** Who wrote `text` when it was not the person: the Host (a timed round: its wrapper and the standing request), the Assistant (a sub-task's brief, a follow-up to it) or a page (what the bottom bar composes itself, or a plugin's page sends for them). Absent: the person typed it. Only what they typed is their words (memory's “you said”, what learning draws on). */
  written_by?: "host" | "assistant" | "page";
  text: string;
  materials: AssistantMaterial[];
  context: AssistantContextSnapshot | null;
  started_at: string;
  /** The work's cap in force when the round started, when there was one: a stop at its token limit is that cap. */
  work_budget?: number;
  /** The platform memory's recall receipt for this round: what it was given and what did not fit. */
  memory_receipt?: string;
}


/** A card as stored: the public view's facts plus the exact reference and input it runs. */
export interface StoredCard {
  card_id: string;
  work_id: string;
  revision: number;
  run_id: string | null;
  title: string;
  summary: string;
  provider: string;
  capability_title: string;
  effect: "read" | "write" | "irreversible";
  reference: { capability_id: string; version: number; provider_id: string };
  input: unknown;
  input_schema: Record<string, unknown>;
  editable: string[];
  missing: Array<{ field: string; question: string }>;
  status: "ready" | "needs-input" | "running" | "done" | "failed" | "unknown" | "stale" | "dismissed";
  outcome?: string;
  presentation?: ActionResultPresentation;
  /** Set when the person clicked; the one execution this card may have. */
  request_id?: string;
  /** The object the card would change, as it was when suggested; a card whose object moved on is no longer offered. */
  target?: { kind: string; id: string; revision: string; title: string };
  /** A card a page prepared from the person's selection: which page, what the selection came from, and the selected text. */
  from?: { surface: string; title?: string };
  source_object?: { kind: string; id: string; version?: number | string | null; title?: string };
  materials?: Array<{ title: string; text: string }>;
  /** The step of the background job it started (specs/prologue-adoption §6.0o): it stays running until that job ends. */
  job_step?: { graph_id: string; node_id: string };
  created_at: string;
  updated_at: string;
}

export class AssistantStore {
  /** What each work started from, used, produced and handed to: Context Ledger edges in this same database. */
  readonly relations: AssistantRelations;
  /** Each finished round's reported usage. */
  readonly usage: AssistantUsageLedger;
  /** The person's timed rounds on their works (the follow-ups collaborator's table). */
  readonly followUps: AssistantFollowUpRecords;

  /** Who hears that a work's stored facts changed (record, rounds, cards, follow-ups, jobs, undos, usage): the page's wait. */
  readonly #changes = new Set<(workId: string) => void>();

  constructor(private readonly db: DatabaseSync, private readonly now = () => new Date()) {
    applySqliteBaseline(db, ASSISTANT_STORE_NAME, ASSISTANT_STORE_BASELINE);
    this.relations = new AssistantRelations(db, now);
    this.usage = new AssistantUsageLedger(db);
    this.followUps = new AssistantFollowUpRecords(db, workId => this.#changed(workId));
  }

  onChange(listener: (workId: string) => void): () => void {
    this.#changes.add(listener);
    return () => { this.#changes.delete(listener); };
  }

  #changed(workId: string): void {
    for (const listener of this.#changes) { try { listener(workId); } catch { /* a listener never fails a write */ } }
  }

  create(input: { actor_id: string; title: string; scope: AssistantScope; scope_title?: string; origin: AssistantSurfaceRef | null; project_ref?: LocalHostProjectReference; executor?: AssistantExecutor;
    delegated_by?: StoredWork["delegated_by"] }): StoredWork {
    const at = this.now().toISOString();
    const work: StoredWork = { work_id: `work-${randomUUID()}`, revision: 1, title: input.title, scope: structuredClone(input.scope), origin: input.origin ? structuredClone(input.origin) : null,
      ...(input.scope_title ? { scope_title: input.scope_title } : {}),
      executor: input.executor ?? { kind: "assistant" },
      session_id: null, draft: "", created_at: at, updated_at: at, archived: false, actor_id: input.actor_id,
      ...(input.project_ref ? { project_ref: structuredClone(input.project_ref) } : {}),
      ...(input.delegated_by ? { delegated_by: { ...input.delegated_by } } : {}) };
    this.db.prepare("INSERT INTO assistant_works(work_id,actor_id,revision,updated_at,archived,body) VALUES (?,?,?,?,0,?)")
      .run(work.work_id, work.actor_id, work.revision, work.updated_at, JSON.stringify(work));
    return work;
  }

  get(actorId: string, workId: string): StoredWork {
    const row = this.db.prepare("SELECT body FROM assistant_works WHERE work_id=? AND actor_id=?").get(workId, actorId);
    if (!row) throw assistantErrors.not_found("找不到这项工作，可能已被删除");
    const work = JSON.parse(String(row.body)) as StoredWork;
    return work.executor ? work : { ...work, executor: { kind: "assistant" } };
  }

  list(actorId: string, options: { archived?: boolean | "any"; limit?: number } = {}): StoredWork[] {
    const [low, high] = options.archived === "any" ? [0, 1] : options.archived ? [1, 1] : [0, 0];
    return this.db.prepare("SELECT body FROM assistant_works WHERE actor_id=? AND archived BETWEEN ? AND ? ORDER BY updated_at DESC LIMIT ?")
      .all(actorId, low, high, options.limit ?? 50).map(row => JSON.parse(String(row.body)) as StoredWork)
      .map(work => work.executor ? work : { ...work, executor: { kind: "assistant" as const } });
  }

  /** Optimistic: a caller holding an older revision gets a conflict instead of overwriting a newer change. */
  update(actorId: string, workId: string, expected: number | null, patch: Partial<Pick<StoredWork, "title" | "session_id" | "draft" | "archived" | "executor" | "handover_brief" | "character" | "graph_id" | "delegated_by" | "budget_tokens" | "question_drafts" | "reply_target" | "thread_round" | "continuation_hold">>, touch = true): StoredWork {
    const current = this.get(actorId, workId);
    if (expected !== null && current.revision !== expected) throw assistantErrors.conflict("这项工作已在别处更新，请刷新后再改");
    const next: StoredWork = { ...current, ...patch, revision: current.revision + 1, updated_at: touch ? this.now().toISOString() : current.updated_at };
    const changed = this.db.prepare("UPDATE assistant_works SET revision=?, updated_at=?, archived=?, body=? WHERE work_id=? AND actor_id=? AND revision=?")
      .run(next.revision, next.updated_at, next.archived ? 1 : 0, JSON.stringify(next), workId, actorId, current.revision).changes;
    if (!changed) throw assistantErrors.conflict("这项工作已在别处更新，请刷新后再改");
    this.#changed(workId);
    return next;
  }

  addRound(workId: string, round: StoredRound): void {
    const position = Number((this.db.prepare("SELECT COALESCE(MAX(position),0)+1 AS next FROM assistant_rounds WHERE work_id=?").get(workId) as { next: number }).next);
    this.db.prepare("INSERT INTO assistant_rounds(work_id,run_id,position,body) VALUES (?,?,?,?)").run(workId, round.run_id, position, JSON.stringify(round));
    this.#changed(workId);
  }

  rounds(workId: string): StoredRound[] {
    return this.db.prepare("SELECT body FROM assistant_rounds WHERE work_id=? ORDER BY position").all(workId).map(row => JSON.parse(String(row.body)) as StoredRound);
  }

  /**
   * Claim one Send. A repeat of a finished Send returns its outcome; a repeat while the first is still in flight is
   * refused rather than run twice. A Send that failed before it did anything is released so it can be tried again.
   */
  claimRequest(actorId: string, requestId: string): { claimed: true } | { claimed: false; result: AssistantSendResult } {
    if (!/^[A-Za-z0-9-]{8,80}$/.test(requestId)) throw assistantErrors.conflict("发送标识无效，请重新发送");
    const inserted = this.db.prepare("INSERT OR IGNORE INTO assistant_requests(actor_id,request_id,state,created_at) VALUES (?,?,'pending',?)")
      .run(actorId, requestId, this.now().toISOString()).changes;
    if (inserted) return { claimed: true };
    const row = this.db.prepare("SELECT state, result FROM assistant_requests WHERE actor_id=? AND request_id=?").get(actorId, requestId) as { state: string; result: string | null };
    if (row.state !== "done" || !row.result) throw assistantErrors.pending_request("这次发送还在处理，不会重复提交");
    return { claimed: false, result: { ...(JSON.parse(row.result) as AssistantSendResult), outcome: "repeated" } };
  }

  finishRequest(actorId: string, requestId: string, result: AssistantSendResult): void {
    this.db.prepare("UPDATE assistant_requests SET state='done', work_id=?, result=? WHERE actor_id=? AND request_id=?")
      .run(result.work.work_id, JSON.stringify(result), actorId, requestId);
  }

  addCard(card: StoredCard): StoredCard {
    this.db.prepare("INSERT INTO assistant_cards(card_id,work_id,revision,status,created_at,body) VALUES (?,?,?,?,?,?)")
      .run(card.card_id, card.work_id, card.revision, card.status, card.created_at, JSON.stringify(card));
    this.#changed(card.work_id);
    return card;
  }

  cards(workId: string): StoredCard[] {
    return this.db.prepare("SELECT body FROM assistant_cards WHERE work_id=? ORDER BY created_at").all(workId).map(row => JSON.parse(String(row.body)) as StoredCard);
  }

  card(workId: string, cardId: string): StoredCard {
    const row = this.db.prepare("SELECT body FROM assistant_cards WHERE work_id=? AND card_id=?").get(workId, cardId);
    if (!row) throw assistantErrors.not_found("找不到这个建议，可能已被移除");
    return JSON.parse(String(row.body)) as StoredCard;
  }

  /** Compare-and-set on the card's revision: two clicks, two tabs or a retry after a restart claim it once. */
  updateCard(card: StoredCard, expected: number, patch: Partial<StoredCard>): StoredCard {
    const next: StoredCard = { ...card, ...patch, revision: expected + 1, updated_at: this.now().toISOString() };
    const changed = this.db.prepare("UPDATE assistant_cards SET revision=?, status=?, body=? WHERE card_id=? AND revision=?")
      .run(next.revision, next.status, JSON.stringify(next), card.card_id, expected).changes;
    if (!changed) throw assistantErrors.conflict("这个建议已在别处处理，已刷新为最新状态");
    this.#changed(card.work_id);
    return next;
  }

  /** Actions the person switched off for the Assistant, by exact capability, version and provider. */
  disabledActions(actorId: string): Set<string> {
    return new Set(JSON.parse(this.setting(actorId, "disabled_actions") ?? "[]") as string[]);
  }

  setActionEnabled(actorId: string, key: string, enabled: boolean): Set<string> {
    const current = this.disabledActions(actorId);
    if (enabled) current.delete(key); else current.add(key);
    this.setSetting(actorId, "disabled_actions", JSON.stringify([...current].sort()));
    return current;
  }

  /** Raise a notice once: the same dedupe key never raises a second (a repeated or retried event stays one notice). */
  raiseNotice(actorId: string, notice: Omit<StoredNotice, "notice_id" | "state" | "created_at">, dedupe: string): StoredNotice | null {
    const stored: StoredNotice = { ...notice, notice_id: randomUUID(), state: "new", created_at: this.now().toISOString() };
    const changed = this.db.prepare("INSERT OR IGNORE INTO assistant_notices(notice_id,actor_id,work_id,kind,state,dedupe,created_at,body) VALUES (?,?,?,?,?,?,?,?)")
      .run(stored.notice_id, actorId, stored.work_id, stored.kind, stored.state, dedupe, stored.created_at, JSON.stringify(stored)).changes;
    return changed ? stored : null;
  }

  /** Whether a notice was raised under `dedupe`, whatever became of it since. */
  noticeRaised(actorId: string, dedupe: string): boolean {
    return this.db.prepare("SELECT 1 FROM assistant_notices WHERE actor_id=? AND dedupe=?").get(actorId, dedupe) !== undefined;
  }

  openNotices(actorId: string): StoredNotice[] {
    return this.db.prepare("SELECT body, state FROM assistant_notices WHERE actor_id=? AND state='new' ORDER BY created_at DESC LIMIT 50").all(actorId)
      .map(row => ({ ...JSON.parse(String(row.body)) as StoredNotice, state: String(row.state) as StoredNotice["state"] }));
  }

  /** Mark notices seen, dismissed or resolved: one, or every open one of a work (optionally only of some kinds). */
  settleNotices(actorId: string, target: { notice_id?: string; work_id?: string; kinds?: readonly string[] }, state: Exclude<StoredNotice["state"], "new">): number {
    if (target.notice_id) return Number(this.db.prepare("UPDATE assistant_notices SET state=? WHERE actor_id=? AND notice_id=? AND state='new'").run(state, actorId, target.notice_id).changes);
    if (!target.work_id) return 0;
    const kinds = target.kinds?.length ? target.kinds : null;
    return Number(this.db.prepare(`UPDATE assistant_notices SET state=? WHERE actor_id=? AND work_id=? AND state='new'${kinds ? ` AND kind IN (${kinds.map(() => "?").join(",")})` : ""}`)
      .run(state, actorId, target.work_id, ...(kinds ?? [])).changes);
  }

  /** The state the Host last saw a work in (kept apart from the work, so noticing never conflicts with the person's edits). */
  observed(actorId: string, workId: string): AssistantWorkState | null {
    const row = this.db.prepare("SELECT state FROM assistant_observed WHERE actor_id=? AND work_id=?").get(actorId, workId);
    return row ? String(row.state) as AssistantWorkState : null;
  }

  observe(actorId: string, workId: string, state: AssistantWorkState): void {
    this.db.prepare("INSERT INTO assistant_observed(actor_id,work_id,state) VALUES (?,?,?) ON CONFLICT(actor_id,work_id) DO UPDATE SET state=excluded.state").run(actorId, workId, state);
  }

  /** Changes left running when a round ended, newest last; `untold` only those the next round has not been told of. */
  unsettled(actorId: string, workId: string, untold = false): AssistantUnsettledChange[] {
    return this.db.prepare(`SELECT body FROM assistant_unsettled WHERE actor_id=? AND work_id=?${untold ? " AND told=0" : ""} ORDER BY rowid`).all(actorId, workId)
      .map(row => JSON.parse(String(row.body)) as AssistantUnsettledChange);
  }

  saveUnsettled(actorId: string, change: AssistantUnsettledChange): void {
    this.db.prepare("INSERT INTO assistant_unsettled(change_id,actor_id,work_id,body) VALUES (?,?,?,?) ON CONFLICT(change_id) DO UPDATE SET body=excluded.body")
      .run(change.change_id, actorId, change.work_id, JSON.stringify(change));
    this.#changed(change.work_id);
  }

  /** A plain per-person value the Assistant keeps for itself (e.g. how far it has looked for new material). */
  setting(actorId: string, key: string): string | null {
    const row = this.db.prepare("SELECT value FROM assistant_settings WHERE actor_id=? AND key=?").get(actorId, key);
    return row ? String(row.value) : null;
  }

  /** The title last seen for an object with this identifier, whatever its kind (titles are kept as `object-title:<kind>:<id>`). */
  objectTitleById(actorId: string, id: string): string | null {
    if (!id || id.length > 200) return null;
    const escaped = id.replace(/[\\%_]/g, character => `\\${character}`);
    const row = this.db.prepare("SELECT value FROM assistant_settings WHERE actor_id=? AND key LIKE ? ESCAPE '\\' LIMIT 1").get(actorId, `object-title:%:${escaped}`);
    return row ? String(row.value) : null;
  }

  setSetting(actorId: string, key: string, value: string): void {
    this.db.prepare(`INSERT INTO assistant_settings(actor_id,key,revision,value) VALUES (?, ?, 1, ?)
      ON CONFLICT(actor_id,key) DO UPDATE SET revision=assistant_settings.revision+1, value=excluded.value`).run(actorId, key, value);
  }

  /**
   * Whether any of the person's works changed, or a card of theirs was run or settled, since `at`: a job one of them
   * started may still be followed only then (it is followed for a bounded time).
   */
  activeSince(actorId: string, at: string): boolean {
    return Boolean(this.db.prepare("SELECT 1 FROM assistant_works WHERE actor_id=? AND updated_at>? LIMIT 1").get(actorId, at)
      ?? this.db.prepare("SELECT 1 FROM assistant_cards c JOIN assistant_works w ON w.work_id=c.work_id WHERE w.actor_id=? AND json_extract(c.body,'$.updated_at')>? LIMIT 1").get(actorId, at));
  }

  undos(actorId: string, workId: string): StoredUndo[] {
    return this.db.prepare("SELECT body FROM assistant_undos WHERE actor_id=? AND work_id=? ORDER BY rowid").all(actorId, workId).map(row => JSON.parse(String(row.body)) as StoredUndo);
  }

  saveUndo(actorId: string, undo: StoredUndo): void {
    this.db.prepare("INSERT INTO assistant_undos(undo_id,actor_id,work_id,body) VALUES (?,?,?,?) ON CONFLICT(undo_id) DO UPDATE SET body=excluded.body").run(undo.undo_id, actorId, undo.work_id, JSON.stringify(undo));
    this.#changed(undo.work_id);
  }

  /** Capabilities (action keys) the person wants confirmed each time even though they could be undone. */
  confirmAlways(actorId: string): Set<string> {
    return new Set(JSON.parse(this.setting(actorId, "confirm_always") ?? "[]") as string[]);
  }

  setConfirmAlways(actorId: string, key: string, on: boolean): void {
    const keys = this.confirmAlways(actorId);
    if (on) keys.add(key); else keys.delete(key);
    this.setSetting(actorId, "confirm_always", JSON.stringify([...keys]));
  }

  /** What a round that has started was told: those undone changes and settled changes are not told again. */
  markTold(actorId: string, told: { undos?: readonly string[]; unsettled?: readonly string[] }): void {
    for (const id of told.undos ?? []) this.db.prepare("UPDATE assistant_undos SET body=json_set(body,'$.told',json('true')) WHERE actor_id=? AND undo_id=? AND json_extract(body,'$.state')='undone'").run(actorId, id);
    for (const id of told.unsettled ?? []) this.db.prepare("UPDATE assistant_unsettled SET told=1 WHERE actor_id=? AND change_id=?").run(actorId, id);
  }

  /** A work whose first round could not start is dropped with what was kept for it; one that has a round is never dropped. */
  discard(actorId: string, workId: string): void {
    if (this.rounds(workId).length) return;
    for (const table of ["works", "observed", "notices", "followups", "undos", "jobs", "unsettled"]) this.db.prepare(`DELETE FROM assistant_${table} WHERE actor_id=? AND work_id=?`).run(actorId, workId);
  }

  /** Rounds of this person's works started since then, with the work they belong to (most recent 500). */
  roundsSince(actorId: string, since: string): Array<{ work_id: string; round: StoredRound }> {
    return this.db.prepare("SELECT r.work_id, r.body FROM assistant_rounds r JOIN assistant_works w ON w.work_id=r.work_id WHERE w.actor_id=? ORDER BY r.rowid DESC LIMIT 500").all(actorId)
      .map(row => ({ work_id: String(row.work_id), round: JSON.parse(String(row.body)) as StoredRound })).filter(item => item.round.started_at >= since);
  }

  rules(actorId: string): AssistantRule[] {
    return JSON.parse(this.setting(actorId, "attention_rules") ?? "[]") as AssistantRule[];
  }

  setRules(actorId: string, rules: readonly AssistantRule[]): void {
    this.setSetting(actorId, "attention_rules", JSON.stringify(rules));
  }

  /** The works a work delegated (each a step on its graph), oldest first; those put away only when asked for ("any"): they still count toward its budget, limit and stop. */
  delegatedBy(actorId: string, parent: Pick<StoredWork, "graph_id">, archived: boolean | "any" = false): StoredWork[] {
    return this.list(actorId, { archived, limit: 500 }).filter(work => parent.graph_id !== undefined && work.delegated_by?.graph_id === parent.graph_id).sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  releaseRequest(actorId: string, requestId: string): void {
    this.db.prepare("DELETE FROM assistant_requests WHERE actor_id=? AND request_id=? AND state='pending'").run(actorId, requestId);
  }
}

/** This store in the Home's store registry (W4-11). */
export const ASSISTANT_HOME_STORE: HomeStoreDeclaration = { path: ASSISTANT_STORE_NAME, library: { baseline: ASSISTANT_STORE_BASELINE } };
