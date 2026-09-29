import { randomUUID } from "node:crypto";
import type { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { AssistantRelations } from "./assistant-relations.js";
import type { AssistantBackgroundJob, AssistantCharacter, AssistantContextSnapshot, AssistantFollowUp, AssistantMemoryPrefs, AssistantUnsettledChange, AssistantNotice, AssistantRule, AssistantWorkState, AssistantExecutor, AssistantMaterial, AssistantScope, AssistantSendResult, AssistantSurfaceRef, AssistantWork } from "@molis-ai/molis-work-contracts/services/assistant";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";

/** The Home SQLite handle, as the storage package opens it (the App boundary does not import `node:sqlite`). */
type DatabaseSync = ReturnType<typeof openHomeSqliteDatabase>;

export const ASSISTANT_STORE_NAME = "assistant";

/**
 * The Assistant's own facts: its works, the rounds the person started in them, and each Send's outcome. Conversation
 * content and run state stay in the Prologue session; business results stay with their owners.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS assistant_works (
  work_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, revision INTEGER NOT NULL, updated_at TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0, body TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS assistant_works_by_actor ON assistant_works(actor_id, archived, updated_at);
CREATE TABLE IF NOT EXISTS assistant_rounds (
  work_id TEXT NOT NULL, run_id TEXT NOT NULL, position INTEGER NOT NULL, body TEXT NOT NULL,
  PRIMARY KEY(work_id, run_id)
);
CREATE TABLE IF NOT EXISTS assistant_cards (
  card_id TEXT PRIMARY KEY, work_id TEXT NOT NULL, revision INTEGER NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, body TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS assistant_cards_by_work ON assistant_cards(work_id, created_at);
CREATE TABLE IF NOT EXISTS assistant_settings (
  actor_id TEXT NOT NULL, key TEXT NOT NULL, revision INTEGER NOT NULL, value TEXT NOT NULL, PRIMARY KEY(actor_id, key)
);
CREATE TABLE IF NOT EXISTS assistant_notices (
  notice_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, work_id TEXT NOT NULL, kind TEXT NOT NULL, state TEXT NOT NULL,
  dedupe TEXT NOT NULL, created_at TEXT NOT NULL, body TEXT NOT NULL, UNIQUE(actor_id, dedupe)
);
CREATE INDEX IF NOT EXISTS assistant_notices_open ON assistant_notices(actor_id, state, created_at);
CREATE TABLE IF NOT EXISTS assistant_followups (
  followup_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, work_id TEXT NOT NULL, body TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS assistant_jobs (
  key TEXT PRIMARY KEY, actor_id TEXT NOT NULL, work_id TEXT NOT NULL, told INTEGER NOT NULL DEFAULT 0, body TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS assistant_usage (
  run_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, work_id TEXT NOT NULL, ended_at TEXT NOT NULL, input INTEGER NOT NULL, output INTEGER NOT NULL, cached INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS assistant_usage_by_day ON assistant_usage(actor_id, ended_at);
CREATE TABLE IF NOT EXISTS assistant_unsettled (
  change_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, work_id TEXT NOT NULL, told INTEGER NOT NULL DEFAULT 0, body TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS assistant_observed (
  actor_id TEXT NOT NULL, work_id TEXT NOT NULL, state TEXT NOT NULL, PRIMARY KEY(actor_id, work_id)
);
CREATE TABLE IF NOT EXISTS assistant_requests (
  actor_id TEXT NOT NULL, request_id TEXT NOT NULL, work_id TEXT, state TEXT NOT NULL, result TEXT, created_at TEXT NOT NULL,
  PRIMARY KEY(actor_id, request_id)
);`;

/** A work as stored: the public record plus the project reference its actions and sessions are bound to. */
export interface StoredWork extends Omit<AssistantWork, "state"> {
  actor_id: string;
  /** What the next Coding round is told of the work so far, once, after the Assistant handed it over. Never shown as the work. */
  handover_brief?: string;
  /** Present for project work: the project it was started in, never the page it is later viewed from. */
  project_ref?: LocalHostProjectReference;
  /** On a delegated work: follow-ups its delegating work sent it. */
  follow_ups?: number;
}

/** A background job being followed: the public view plus how to read its state. */
export interface StoredJob extends AssistantBackgroundJob {
  key: string;
  status: { capability_id: string; version: number; provider_id: string };
  input: string;
  path: string;
  done: string[];
  failed: string[];
  checks: number;
  told?: boolean;
}

/** A notice as stored: the public facts plus whether the person still has to see it. */
export interface StoredNotice extends Omit<AssistantNotice, "held"> { state: "new" | "seen" | "dismissed" | "resolved" }

export interface StoredRound {
  run_id: string;
  /** Set for a round run in the work's Coding session; the others ran in the Assistant's own session. */
  executor?: "coding";
  /** The Character that carried it, as frozen at its start. */
  character?: AssistantCharacter;
  text: string;
  materials: AssistantMaterial[];
  context: AssistantContextSnapshot | null;
  started_at: string;
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
  /** Set when the person clicked; the one execution this card may have. */
  request_id?: string;
  /** The object the card would change, as it was when suggested; a card whose object moved on is no longer offered. */
  target?: { kind: string; id: string; revision: string; title: string };
  created_at: string;
  updated_at: string;
}

export class AssistantStoreError extends Error {
  constructor(readonly code: "assistant.not_found" | "assistant.conflict" | "assistant.pending_request", message: string) {
    super(message);
    this.name = "AssistantStoreError";
  }
}

export class AssistantStore {
  /** What each work started from, used, produced and handed to: Context Ledger edges in this same database. */
  readonly relations: AssistantRelations;

  constructor(private readonly db: DatabaseSync, private readonly now = () => new Date()) {
    db.exec(SCHEMA);
    this.relations = new AssistantRelations(db, now);
  }

  create(input: { actor_id: string; title: string; scope: AssistantScope; scope_title?: string; origin: AssistantSurfaceRef | null; project_ref?: LocalHostProjectReference; executor?: AssistantExecutor;
    delegated_by?: AssistantWork["delegated_by"] }): StoredWork {
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
    if (!row) throw new AssistantStoreError("assistant.not_found", "找不到这项工作，可能已被删除");
    const work = JSON.parse(String(row.body)) as StoredWork;
    return work.executor ? work : { ...work, executor: { kind: "assistant" } };
  }

  list(actorId: string, options: { archived?: boolean; limit?: number } = {}): StoredWork[] {
    return this.db.prepare("SELECT body FROM assistant_works WHERE actor_id=? AND archived=? ORDER BY updated_at DESC LIMIT ?")
      .all(actorId, options.archived ? 1 : 0, options.limit ?? 50).map(row => JSON.parse(String(row.body)) as StoredWork)
      .map(work => work.executor ? work : { ...work, executor: { kind: "assistant" as const } });
  }

  /** Optimistic: a caller holding an older revision gets a conflict instead of overwriting a newer change. */
  update(actorId: string, workId: string, expected: number | null, patch: Partial<Pick<StoredWork, "title" | "session_id" | "draft" | "archived" | "executor" | "handover_brief" | "character" | "follow_ups" | "delegated_by">>, touch = true): StoredWork {
    const current = this.get(actorId, workId);
    if (expected !== null && current.revision !== expected) throw new AssistantStoreError("assistant.conflict", "这项工作已在别处更新，请刷新后再改");
    const next: StoredWork = { ...current, ...patch, revision: current.revision + 1, updated_at: touch ? this.now().toISOString() : current.updated_at };
    const changed = this.db.prepare("UPDATE assistant_works SET revision=?, updated_at=?, archived=?, body=? WHERE work_id=? AND actor_id=? AND revision=?")
      .run(next.revision, next.updated_at, next.archived ? 1 : 0, JSON.stringify(next), workId, actorId, current.revision).changes;
    if (!changed) throw new AssistantStoreError("assistant.conflict", "这项工作已在别处更新，请刷新后再改");
    return next;
  }

  addRound(workId: string, round: StoredRound): void {
    const position = Number((this.db.prepare("SELECT COALESCE(MAX(position),0)+1 AS next FROM assistant_rounds WHERE work_id=?").get(workId) as { next: number }).next);
    this.db.prepare("INSERT INTO assistant_rounds(work_id,run_id,position,body) VALUES (?,?,?,?)").run(workId, round.run_id, position, JSON.stringify(round));
  }

  rounds(workId: string): StoredRound[] {
    return this.db.prepare("SELECT body FROM assistant_rounds WHERE work_id=? ORDER BY position").all(workId).map(row => JSON.parse(String(row.body)) as StoredRound);
  }

  /**
   * Claim one Send. A repeat of a finished Send returns its outcome; a repeat while the first is still in flight is
   * refused rather than run twice. A Send that failed before it did anything is released so it can be tried again.
   */
  claimRequest(actorId: string, requestId: string): { claimed: true } | { claimed: false; result: AssistantSendResult } {
    if (!/^[A-Za-z0-9-]{8,80}$/.test(requestId)) throw new AssistantStoreError("assistant.conflict", "发送标识无效，请重新发送");
    const inserted = this.db.prepare("INSERT OR IGNORE INTO assistant_requests(actor_id,request_id,state,created_at) VALUES (?,?,'pending',?)")
      .run(actorId, requestId, this.now().toISOString()).changes;
    if (inserted) return { claimed: true };
    const row = this.db.prepare("SELECT state, result FROM assistant_requests WHERE actor_id=? AND request_id=?").get(actorId, requestId) as { state: string; result: string | null };
    if (row.state !== "done" || !row.result) throw new AssistantStoreError("assistant.pending_request", "这次发送还在处理，不会重复提交");
    return { claimed: false, result: { ...(JSON.parse(row.result) as AssistantSendResult), outcome: "repeated" } };
  }

  finishRequest(actorId: string, requestId: string, result: AssistantSendResult): void {
    this.db.prepare("UPDATE assistant_requests SET state='done', work_id=?, result=? WHERE actor_id=? AND request_id=?")
      .run(result.work.work_id, JSON.stringify(result), actorId, requestId);
  }

  addCard(card: StoredCard): StoredCard {
    this.db.prepare("INSERT INTO assistant_cards(card_id,work_id,revision,status,created_at,body) VALUES (?,?,?,?,?,?)")
      .run(card.card_id, card.work_id, card.revision, card.status, card.created_at, JSON.stringify(card));
    return card;
  }

  cards(workId: string): StoredCard[] {
    return this.db.prepare("SELECT body FROM assistant_cards WHERE work_id=? ORDER BY created_at").all(workId).map(row => JSON.parse(String(row.body)) as StoredCard);
  }

  card(workId: string, cardId: string): StoredCard {
    const row = this.db.prepare("SELECT body FROM assistant_cards WHERE work_id=? AND card_id=?").get(workId, cardId);
    if (!row) throw new AssistantStoreError("assistant.not_found", "找不到这个建议，可能已被移除");
    return JSON.parse(String(row.body)) as StoredCard;
  }

  /** Compare-and-set on the card's revision: two clicks, two tabs or a retry after a restart claim it once. */
  updateCard(card: StoredCard, expected: number, patch: Partial<StoredCard>): StoredCard {
    const next: StoredCard = { ...card, ...patch, revision: expected + 1, updated_at: this.now().toISOString() };
    const changed = this.db.prepare("UPDATE assistant_cards SET revision=?, status=?, body=? WHERE card_id=? AND revision=?")
      .run(next.revision, next.status, JSON.stringify(next), card.card_id, expected).changes;
    if (!changed) throw new AssistantStoreError("assistant.conflict", "这个建议已在别处处理，已刷新为最新状态");
    return next;
  }

  /** Actions the person switched off for the Assistant, by exact capability, version and provider. */
  disabledActions(actorId: string): Set<string> {
    const row = this.db.prepare("SELECT value FROM assistant_settings WHERE actor_id=? AND key='disabled_actions'").get(actorId);
    return new Set(row ? JSON.parse(String(row.value)) as string[] : []);
  }

  setActionEnabled(actorId: string, key: string, enabled: boolean): Set<string> {
    const current = this.disabledActions(actorId);
    if (enabled) current.delete(key); else current.add(key);
    this.db.prepare(`INSERT INTO assistant_settings(actor_id,key,revision,value) VALUES (?, 'disabled_actions', 1, ?)
      ON CONFLICT(actor_id,key) DO UPDATE SET revision=assistant_settings.revision+1, value=excluded.value`).run(actorId, JSON.stringify([...current].sort()));
    return current;
  }

  /** Raise a notice once: the same dedupe key never raises a second (a repeated or retried event stays one notice). */
  raiseNotice(actorId: string, notice: Omit<StoredNotice, "notice_id" | "state" | "created_at">, dedupe: string): StoredNotice | null {
    const stored: StoredNotice = { ...notice, notice_id: randomUUID(), state: "new", created_at: this.now().toISOString() };
    const changed = this.db.prepare("INSERT OR IGNORE INTO assistant_notices(notice_id,actor_id,work_id,kind,state,dedupe,created_at,body) VALUES (?,?,?,?,?,?,?,?)")
      .run(stored.notice_id, actorId, stored.work_id, stored.kind, stored.state, dedupe, stored.created_at, JSON.stringify(stored)).changes;
    return changed ? stored : null;
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

  followUps(actorId: string, workId?: string): AssistantFollowUp[] {
    const rows = workId ? this.db.prepare("SELECT body FROM assistant_followups WHERE actor_id=? AND work_id=?").all(actorId, workId)
      : this.db.prepare("SELECT body FROM assistant_followups WHERE actor_id=?").all(actorId);
    return rows.map(row => JSON.parse(String(row.body)) as AssistantFollowUp).sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  saveFollowUp(actorId: string, followUp: AssistantFollowUp): void {
    this.db.prepare("INSERT INTO assistant_followups(followup_id,actor_id,work_id,body) VALUES (?,?,?,?) ON CONFLICT(followup_id) DO UPDATE SET body=excluded.body")
      .run(followUp.followup_id, actorId, followUp.work_id, JSON.stringify(followUp));
  }

  /** Changes left running when a round ended, newest last; `untold` only those the next round has not been told of. */
  unsettled(actorId: string, workId: string, untold = false): AssistantUnsettledChange[] {
    return this.db.prepare(`SELECT body FROM assistant_unsettled WHERE actor_id=? AND work_id=?${untold ? " AND told=0" : ""} ORDER BY rowid`).all(actorId, workId)
      .map(row => JSON.parse(String(row.body)) as AssistantUnsettledChange);
  }

  saveUnsettled(actorId: string, change: AssistantUnsettledChange): void {
    this.db.prepare("INSERT INTO assistant_unsettled(change_id,actor_id,work_id,body) VALUES (?,?,?,?) ON CONFLICT(change_id) DO UPDATE SET body=excluded.body")
      .run(change.change_id, actorId, change.work_id, JSON.stringify(change));
  }

  markUnsettledTold(actorId: string, changeIds: readonly string[]): void {
    for (const id of changeIds) this.db.prepare("UPDATE assistant_unsettled SET told=1 WHERE actor_id=? AND change_id=?").run(actorId, id);
  }

  removeFollowUp(actorId: string, followupId: string): boolean {
    return Number(this.db.prepare("DELETE FROM assistant_followups WHERE actor_id=? AND followup_id=?").run(actorId, followupId).changes) > 0;
  }

  /** A plain per-person value the Assistant keeps for itself (e.g. how far it has looked for new material). */
  setting(actorId: string, key: string): string | null {
    const row = this.db.prepare("SELECT value FROM assistant_settings WHERE actor_id=? AND key=?").get(actorId, key);
    return row ? String(row.value) : null;
  }

  setSetting(actorId: string, key: string, value: string): void {
    this.db.prepare(`INSERT INTO assistant_settings(actor_id,key,revision,value) VALUES (?, ?, 1, ?)
      ON CONFLICT(actor_id,key) DO UPDATE SET revision=assistant_settings.revision+1, value=excluded.value`).run(actorId, key, value);
  }

  jobs(actorId: string, workId?: string): StoredJob[] {
    const rows = workId ? this.db.prepare("SELECT body, told FROM assistant_jobs WHERE actor_id=? AND work_id=? ORDER BY rowid").all(actorId, workId)
      : this.db.prepare("SELECT body, told FROM assistant_jobs WHERE actor_id=? ORDER BY rowid").all(actorId);
    return rows.map(row => ({ ...JSON.parse(String(row.body)) as StoredJob, told: Number(row.told) === 1 }));
  }

  saveJob(actorId: string, job: StoredJob): void {
    const { told: _told, ...body } = job;
    this.db.prepare("INSERT INTO assistant_jobs(key,actor_id,work_id,body) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET body=excluded.body")
      .run(job.key, actorId, job.work_id, JSON.stringify(body));
  }

  markJobsTold(actorId: string, keys: readonly string[]): void {
    for (const key of keys) this.db.prepare("UPDATE assistant_jobs SET told=1 WHERE actor_id=? AND key=?").run(actorId, key);
  }

  /** One finished round's reported usage, kept once. */
  recordUsage(actorId: string, usage: { work_id: string; run_id: string; ended_at: string; input: number; output: number; cached: number }): void {
    this.db.prepare("INSERT OR IGNORE INTO assistant_usage(run_id,actor_id,work_id,ended_at,input,output,cached) VALUES (?,?,?,?,?,?,?)")
      .run(usage.run_id, actorId, usage.work_id, usage.ended_at, usage.input, usage.output, usage.cached);
  }

  usageSince(actorId: string, since: string): { input: number; output: number; cached_input: number; rounds: number } {
    const row = this.db.prepare("SELECT COALESCE(SUM(input),0) AS input, COALESCE(SUM(output),0) AS output, COALESCE(SUM(cached),0) AS cached, COUNT(*) AS rounds FROM assistant_usage WHERE actor_id=? AND ended_at>=?").get(actorId, since) as { input: number; output: number; cached: number; rounds: number };
    return { input: Number(row.input), output: Number(row.output), cached_input: Number(row.cached), rounds: Number(row.rounds) };
  }

  /** Rounds of this person's works started since then, with the work they belong to (most recent 500). */
  roundsSince(actorId: string, since: string): Array<{ work_id: string; round: StoredRound }> {
    return this.db.prepare("SELECT r.work_id, r.body FROM assistant_rounds r JOIN assistant_works w ON w.work_id=r.work_id WHERE w.actor_id=? ORDER BY r.rowid DESC LIMIT 500").all(actorId)
      .map(row => ({ work_id: String(row.work_id), round: JSON.parse(String(row.body)) as StoredRound })).filter(item => item.round.started_at >= since);
  }

  memoryPrefs(actorId: string): AssistantMemoryPrefs {
    const saved = this.setting(actorId, "memory_prefs");
    return { form: true, use_personal: true, use_project: true, ...(saved ? JSON.parse(saved) as Partial<AssistantMemoryPrefs> : {}) };
  }

  setMemoryPrefs(actorId: string, prefs: AssistantMemoryPrefs): void { this.setSetting(actorId, "memory_prefs", JSON.stringify(prefs)); }

  disabledMemories(actorId: string): Set<string> {
    const saved = this.setting(actorId, "memory_disabled");
    return new Set(saved ? JSON.parse(saved) as string[] : []);
  }

  setMemoryDisabled(actorId: string, memoryId: string, disabled: boolean): void {
    const current = this.disabledMemories(actorId);
    if (disabled) current.add(memoryId); else current.delete(memoryId);
    this.setSetting(actorId, "memory_disabled", JSON.stringify([...current].sort()));
  }

  rules(actorId: string): AssistantRule[] {
    const row = this.db.prepare("SELECT value FROM assistant_settings WHERE actor_id=? AND key='attention_rules'").get(actorId);
    return row ? JSON.parse(String(row.value)) as AssistantRule[] : [];
  }

  setRules(actorId: string, rules: readonly AssistantRule[]): void {
    this.db.prepare(`INSERT INTO assistant_settings(actor_id,key,revision,value) VALUES (?, 'attention_rules', 1, ?)
      ON CONFLICT(actor_id,key) DO UPDATE SET revision=assistant_settings.revision+1, value=excluded.value`).run(actorId, JSON.stringify(rules));
  }

  /** The works a work delegated, oldest first. */
  delegatedBy(actorId: string, workId: string): StoredWork[] {
    return this.list(actorId, { limit: 500 }).filter(work => work.delegated_by?.work_id === workId).sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  releaseRequest(actorId: string, requestId: string): void {
    this.db.prepare("DELETE FROM assistant_requests WHERE actor_id=? AND request_id=? AND state='pending'").run(actorId, requestId);
  }
}
