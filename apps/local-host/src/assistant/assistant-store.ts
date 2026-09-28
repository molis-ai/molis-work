import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { AssistantContextSnapshot, AssistantExecutor, AssistantMaterial, AssistantScope, AssistantSendResult, AssistantSurfaceRef, AssistantWork } from "@molis-ai/molis-work-contracts/services/assistant";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";

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
CREATE TABLE IF NOT EXISTS assistant_requests (
  actor_id TEXT NOT NULL, request_id TEXT NOT NULL, work_id TEXT, state TEXT NOT NULL, result TEXT, created_at TEXT NOT NULL,
  PRIMARY KEY(actor_id, request_id)
);`;

/** A work as stored: the public record plus the project reference its actions and sessions are bound to. */
export interface StoredWork extends Omit<AssistantWork, "state"> {
  actor_id: string;
  /** Present for project work: the project it was started in, never the page it is later viewed from. */
  project_ref?: LocalHostProjectReference;
}

export interface StoredRound {
  run_id: string;
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
  constructor(private readonly db: DatabaseSync, private readonly now = () => new Date()) {
    db.exec(SCHEMA);
  }

  create(input: { actor_id: string; title: string; scope: AssistantScope; scope_title?: string; origin: AssistantSurfaceRef | null; project_ref?: LocalHostProjectReference; executor?: AssistantExecutor }): StoredWork {
    const at = this.now().toISOString();
    const work: StoredWork = { work_id: `work-${randomUUID()}`, revision: 1, title: input.title, scope: structuredClone(input.scope), origin: input.origin ? structuredClone(input.origin) : null,
      ...(input.scope_title ? { scope_title: input.scope_title } : {}),
      executor: input.executor ?? { kind: "assistant" },
      session_id: null, draft: "", created_at: at, updated_at: at, archived: false, actor_id: input.actor_id,
      ...(input.project_ref ? { project_ref: structuredClone(input.project_ref) } : {}) };
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
  update(actorId: string, workId: string, expected: number | null, patch: Partial<Pick<StoredWork, "title" | "session_id" | "draft" | "archived" | "executor">>, touch = true): StoredWork {
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

  releaseRequest(actorId: string, requestId: string): void {
    this.db.prepare("DELETE FROM assistant_requests WHERE actor_id=? AND request_id=? AND state='pending'").run(actorId, requestId);
  }
}
