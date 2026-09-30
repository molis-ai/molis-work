import { randomUUID } from "node:crypto";
import {
  MEMORY_KINDS,
  memoryAppliesText,
  type MemoryApplies,
  type MemoryApproval,
  type MemoryBasis,
  type MemoryCandidate,
  type MemoryCandidateRecord,
  type MemoryChange,
  type MemoryChangeKind,
  type MemoryChangeRecord,
  type MemoryChangeRequest,
  type MemoryChangeResult,
  type MemoryConsumer,
  type MemoryEvidence,
  type MemoryExportPackage,
  type MemoryItem,
  type MemoryPair,
  type MemoryUpkeepReport,
  type MemoryKind,
  type MemoryLedgerPort,
  type MemoryListRequest,
  type MemoryListResponse,
  type MemoryMetaRecord,
  type MemoryPrefs,
  type MemoryPrefsView,
  type MemoryRecallRequest,
  type MemoryRecallResponse,
  type MemoryRecalled,
  type MemoryRevision,
  type MemoryScope,
  type MemorySignalReport,
  type MemorySignalResult,
  type MemorySource,
  type MemoryUndoPlan,
  type MemoryUseRecord,
  type MemoryWriteRequest,
  type MemoryWriteResult,
} from "@molis-ai/molis-work-contracts/services/memory";
import { completePrefs, consumerAccess, CONSUMER_LABELS, PERSONAL_PREFS_KEY, PROJECT_DEFAULT_PREFS_KEY, projectPrefsKey } from "./prefs.js";
import { keywordScore, looksLikeInstruction, looksLikeSecret, normalized, recallKeywords, sameText, similarity } from "./text.js";
import { fromEntryMeta, pauseReason, toEntryMeta } from "./facts.js";
import type { AgentMemoryMeta } from "@molis-ai/molis-work-contracts/services/agent-host";

/** One entry as Prologue Memory holds it, with the facts the platform keeps on it (spec §8.2 S3). */
export interface MemoryBackendEntry {
  memory_id: string;
  text: string;
  origin: string;
  tags: string[];
  version: number;
  meta: AgentMemoryMeta;
  paused?: { reason: string; at_ms: number };
  created_at_ms: number;
  updated_at_ms: number;
}

/**
 * Prologue Memory through the Agent Host: the only place memory text, versions, tombstones and scope isolation live.
 * `remove` purges: the entry is gone from the store and its hot cache.
 */
export interface MemoryBackendPort {
  list(scope: MemoryScope, owner: string): Promise<MemoryBackendEntry[]>;
  write(input: { scope: MemoryScope; owner: string; text: string; origin: string; tags: string[]; meta: AgentMemoryMeta }): Promise<MemoryBackendEntry>;
  update(input: { scope: MemoryScope; owner: string; memory_id: string; text: string }): Promise<MemoryBackendEntry>;
  /** Replaces the facts on the entry; its text and version stay. */
  setMeta(input: { scope: MemoryScope; owner: string; memory_id: string; meta: AgentMemoryMeta }): Promise<MemoryBackendEntry>;
  /** Kept, never recalled (switched off, or what it rests on is gone), until resumed. */
  pause(input: { scope: MemoryScope; owner: string; memory_id: string; reason: string }): Promise<MemoryBackendEntry>;
  resume(input: { scope: MemoryScope; owner: string; memory_id: string }): Promise<MemoryBackendEntry>;
  remove(input: { scope: MemoryScope; owner: string; memory_id: string }): Promise<void>;
  /** Prologue's persistent, scoped candidate box (spec §8.2 S4). */
  candidates: MemoryCandidatePort;
  /** Prologue's `screenInbound` (instruction-like) and `redactText` (credentials, absolute paths). */
  screen?(text: string): Promise<{ hold: boolean; reasons: string[]; redacted: string }>;
  previewScope?(scope: MemoryScope, owner: string): Promise<{ count: number; fingerprint: string; memory_ids: string[] }>;
  /** Refused when the scope changed since the preview; every entry purged otherwise. */
  clearScope?(input: { scope: MemoryScope; owner: string; fingerprint: string }): Promise<string[]>;
}

export interface MemoryBackendCandidate {
  candidate_id: string;
  text: string;
  state: "pending" | "accepted" | "promoted" | "discarded" | "expired";
  memory_id?: string;
}

export interface MemoryCandidatePort {
  propose(input: { scope: MemoryScope; owner: string; text: string; origin: string; tags: string[]; meta: AgentMemoryMeta }): Promise<MemoryBackendCandidate>;
  list(scope: MemoryScope, owner: string): Promise<MemoryBackendCandidate[]>;
  /** The person accepts: a new entry, the person as approver. */
  accept(input: { scope: MemoryScope; owner: string; candidate_id: string; text: string; origin: string; meta: AgentMemoryMeta }): Promise<MemoryBackendEntry>;
  /** The Host's write gate promotes: a new entry, the gate's policy and version as approver. */
  promote(input: { scope: MemoryScope; owner: string; candidate_id: string; policy: string; version: number; origin: string; meta: AgentMemoryMeta }): Promise<MemoryBackendEntry>;
  /** Settled into an existing entry the Host already updated (a correction). */
  settleInto(input: { scope: MemoryScope; owner: string; candidate_id: string; memory_id: string; by: MemoryApproval }): Promise<MemoryBackendEntry>;
  discard(input: { scope: MemoryScope; owner: string; candidate_id: string }): Promise<void>;
  expire(input: { scope: MemoryScope; owner: string; candidate_id: string }): Promise<void>;
  /** Gone for good, with its text (the memory it became was deleted). */
  purge(input: { scope: MemoryScope; owner: string; candidate_id: string }): Promise<void>;
}

/** Who is asking, from the trusted Host context. Never read from input. */
export interface MemoryCaller {
  actor_id: string;
  project_id: string | null;
  consumer: MemoryConsumer;
  plugin_id?: string | null;
  /** The work on whose behalf it asks (the Assistant's work, an Agent run), for provenance and 最近用于. */
  work?: { work_id: string; title: string } | null;
  /** The person acting directly (settings, the panel's buttons) rather than a model on their behalf. */
  person?: boolean;
  /** The Character carrying this work, when one does: its own memories are used, and only by it. */
  character?: { id: string; title: string } | null;
}

/** One thing a work's drawing-out proposes (the model's output shape). Nothing here is trusted: the gate checks it all. */
export interface MemoryProposal {
  text: string;
  kind: MemoryKind;
  scope: MemoryScope;
  applies_when?: string | null;
  basis: "explicit" | "inferred";
  /** The person's own words it rests on, verbatim. */
  quote: string;
  /** A waiting suggestion that says the same thing. */
  same_as?: string | null;
  /** A kept memory this corrects. */
  supersedes?: string | null;
}

export interface MemoryLearned {
  text: string;
  outcome: MemoryWriteResult["outcome"] | "skipped";
  reason: string;
  candidate_id: string | null;
  memory_id: string | null;
}

/** The first version's state (the Assistant's own tables, spec §2.1.1), folded in once per person. */
export interface LegacyMemoryState {
  /** Only what the person had actually saved; null when they never changed the switches. */
  prefs: { form?: boolean; use_personal?: boolean; use_project?: boolean; learn_personal?: boolean; learn_project?: boolean } | null;
  disabled: string[];
  candidates: Array<{ candidate_id: string; work_id: string; work_title: string; scope: MemoryScope; project_id?: string; text: string; why: string; applies: string;
    state: MemoryCandidate["state"]; created_at: string; memory_id?: string }>;
}

export interface MemoryServicePorts {
  backend: MemoryBackendPort;
  ledger: MemoryLedgerPort;
  now?: () => Date;
  newId?: () => string;
  timeZone?: string;
  projectTitle?(projectId: string): Promise<string | null>;
}

export type MemoryErrorCode = "memory.invalid" | "memory.not_found" | "memory.forbidden" | "memory.scope" | "memory.limit" | "memory.conflict" | "memory.off";
export class MemoryError extends Error {
  constructor(readonly code: MemoryErrorCode, message: string) { super(message); this.name = "MemoryError"; }
}

/** The write gate's rules. The version is written into every automatic change's provenance (spec §6.3). */
export const MEMORY_GATE_POLICY = "memory.write-gate";
export const MEMORY_GATE_VERSION = 1;
export const MEMORY_GATE_RULE = `自动记住 · 规则 v${MEMORY_GATE_VERSION}`;
/** Interface signals: at least this many, from at least this many different occasions, before a candidate is made. */
export const SIGNAL_THRESHOLD = { count: 3, distinct: 2 } as const;
const CANDIDATE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const PENDING_PER_WORK = 3;
/** What Prologue's `redactText` puts where a credential was. */
const REDACTED_CREDENTIAL = "[redacted]";
/** “Don't remember this”: this work forms nothing (spec §11); it does not delete what the work already holds. */
const DO_NOT_REMEMBER = /(?:不要|别|不用|无需|不必)(?:帮我)?(?:记|记住|记下|记录)(?!得)|(?:don['’]?t|do not|never) (?:remember|save|store)/i;
/** Words of a standing wish, a correction or a lesson: only rounds with one are worth a model call. */
const STANDING_WISH = /以后|今后|往后|每次|每回|总是|一律|一直|都要|都用|都别|都不|别再|不要再|下次|下回|记住|习惯|偏好|喜欢|讨厌|统一|规范|约定|规定|改成|应该|不对|always|never|from now on|every time|prefer|going forward|next time/i;
const MAX_TEXT = 400;
const LEGACY_SOURCE = "assistant-p8";
const EXPLICIT_SOURCES: readonly MemorySource[] = ["said", "manual", "accepted", "imported"];
const KIND_WEIGHT: Record<MemoryKind, number> = { preference: 1, convention: 1, experience: 0.85, fact: 0.75 };
const SOURCE_WEIGHT: Record<MemorySource, number> = { said: 1, manual: 1, accepted: 0.95, imported: 0.9, auto: 0.85, plugin: 0.8 };
/** How much a memory counts even when no keyword of the request is in it: ways of working apply to most work. */
const STANDING: Record<MemoryKind, number> = { preference: 0.45, convention: 0.45, experience: 0.15, fact: 0.05 };

interface Located { scope: MemoryScope; owner: string; entry: MemoryBackendEntry; meta: MemoryMetaRecord; /** The project a Character's memory belongs to. */ project?: string | null }

export class MemoryService {
  private readonly now: () => Date;
  private readonly newId: () => string;

  constructor(private readonly ports: MemoryServicePorts) {
    this.now = ports.now ?? (() => new Date());
    this.newId = ports.newId ?? (() => randomUUID());
  }

  /* ---- switches ---- */

  prefsFor(actorId: string, scope: MemoryScope, projectId: string | null): MemoryPrefs {
    if (scope === "personal") return completePrefs("personal", this.ports.ledger.prefs(actorId, PERSONAL_PREFS_KEY));
    return completePrefs("project", this.ports.ledger.prefs(actorId, PROJECT_DEFAULT_PREFS_KEY), projectId ? this.ports.ledger.prefs(actorId, projectPrefsKey(projectId)) : null);
  }

  prefs(caller: MemoryCaller, scope: MemoryScope = caller.project_id ? "project" : "personal"): MemoryPrefsView {
    const where = this.where(caller, scope);
    return { scope, project_id: scope === "project" ? where.owner : null, prefs: this.prefsFor(caller.actor_id, scope, scope === "project" ? where.owner : null) };
  }

  savePrefs(caller: MemoryCaller, scope: MemoryScope | undefined, input: Partial<MemoryPrefs>): MemoryPrefsView {
    this.personOnly(caller, "只有本人能改记忆开关");
    const target = scope ?? (caller.project_id ? "project" : "personal");
    const where = this.where(caller, target);
    const current = this.prefsFor(caller.actor_id, target, target === "project" ? where.owner : null);
    const next = completePrefs(target, current, input as Partial<MemoryPrefs>);
    // Plugin rules replace one plugin at a time; a plugin not named keeps its rule.
    if (input.plugins) for (const [pluginId, rule] of Object.entries(input.plugins)) if (rule && typeof rule.allowed === "boolean" && !Array.isArray(rule.kinds))
      next.plugins[pluginId] = { allowed: rule.allowed, kinds: current.plugins[pluginId]?.kinds ?? next.plugins[pluginId]!.kinds };
    this.ports.ledger.savePrefs(caller.actor_id, target === "personal" ? PERSONAL_PREFS_KEY : projectPrefsKey(where.owner), next);
    return { scope: target, project_id: target === "project" ? where.owner : null, prefs: next };
  }

  /**
   * The five switches of the Assistant's first settings section, read from and written to the platform switches
   * (personal, and the project default), until that section becomes a summary with a link here.
   */
  assistantPrefs(actorId: string): { form: boolean; use_personal: boolean; use_project: boolean; learn_personal: boolean; learn_project: boolean } {
    const personal = this.prefsFor(actorId, "personal", null), projects = completePrefs("project", this.ports.ledger.prefs(actorId, PROJECT_DEFAULT_PREFS_KEY));
    return { form: personal.form, use_personal: personal.consumers.assistant, use_project: projects.consumers.assistant, learn_personal: personal.learn_from_work, learn_project: projects.learn_from_work };
  }

  saveAssistantPrefs(actorId: string, input: Partial<{ form: boolean; use_personal: boolean; use_project: boolean; learn_personal: boolean; learn_project: boolean }>): ReturnType<MemoryService["assistantPrefs"]> {
    const personal = this.prefsFor(actorId, "personal", null), projects = completePrefs("project", this.ports.ledger.prefs(actorId, PROJECT_DEFAULT_PREFS_KEY));
    if (typeof input.form === "boolean") { personal.form = input.form; projects.form = input.form; }
    if (typeof input.use_personal === "boolean") personal.consumers.assistant = input.use_personal;
    if (typeof input.use_project === "boolean") projects.consumers.assistant = input.use_project;
    if (typeof input.learn_personal === "boolean") personal.learn_from_work = input.learn_personal;
    if (typeof input.learn_project === "boolean") projects.learn_from_work = input.learn_project;
    this.ports.ledger.transaction(() => {
      this.ports.ledger.savePrefs(actorId, PERSONAL_PREFS_KEY, personal);
      this.ports.ledger.savePrefs(actorId, PROJECT_DEFAULT_PREFS_KEY, projects);
    });
    return this.assistantPrefs(actorId);
  }

  /* ---- reading ---- */

  async list(caller: MemoryCaller, request: MemoryListRequest = {}): Promise<MemoryListResponse> {
    const scopes = this.scopesFor(caller, request.scope === "all" || !request.scope ? undefined : [request.scope]);
    const items: MemoryItem[] = [];
    let personal = 0, project = 0;
    for (const where of scopes) {
      if (!caller.person) {
        const access = consumerAccess(this.prefsAt(caller.actor_id, where), caller.consumer, caller.plugin_id);
        if (!access.allowed) continue;
      }
      for (const located of await this.located(caller, where.scope, where.owner)) {
        if (!this.visibleTo(caller, located.meta)) continue;
        if (where.scope === "personal") personal += 1; else project += 1;
        const item = this.item(located);
        if (request.kinds?.length && !request.kinds.includes(item.kind)) continue;
        if (request.sources?.length && !request.sources.includes(item.source)) continue;
        if (request.states?.length && !request.states.includes(item.state)) continue;
        if (request.query?.trim() && !item.text.toLowerCase().includes(request.query.trim().toLowerCase())) continue;
        items.push(item);
      }
    }
    items.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    const weekAgo = this.now().getTime() - 7 * 24 * 60 * 60 * 1000;
    const owners = new Set(scopes.map(where => `${where.scope}:${where.owner}`));
    const auto_this_week = this.ports.ledger.changes(caller.actor_id, 500).filter(change => change.kind === "auto_kept" && change.state === "active"
      && owners.has(`${change.scope}:${change.owner}`) && Date.parse(change.at) >= weekAgo).length;
    const pending = (await this.candidates(caller, { scope: request.scope ?? "all" })).length;
    return { items, counts: { personal, project, auto_this_week, pending } };
  }

  async history(caller: MemoryCaller, memoryId: string): Promise<{ memory_id: string; revisions: MemoryRevision[] }> {
    const located = await this.find(caller, memoryId);
    return { memory_id: located.entry.memory_id, revisions: this.ports.ledger.revisions(located.entry.memory_id) };
  }

  /**
   * Memories that bear on a situation, for one consumer (spec §7.1): active, not expired, applicable, allowed for this
   * consumer by the person's switches, ranked by keywords × kind × recency × source, within a limit and a budget.
   * Every returned and omitted memory is recorded against the receipt.
   */
  async recall(caller: MemoryCaller, request: MemoryRecallRequest = {}): Promise<MemoryRecallResponse> {
    const receipt_id = `recall-${this.newId()}`;
    const limit = Math.max(1, Math.min(20, request.limit ?? 8)), budget = Math.max(100, Math.min(4000, request.budget_chars ?? 2000));
    const scopes = this.scopesFor(caller, request.scopes);
    const keywords = recallKeywords([request.query ?? "", request.situation?.task ?? ""].join(" "));
    const now = this.now();
    const offScopes: string[] = [];
    const ranked: Array<{ located: Located; score: number }> = [];
    for (const where of scopes) {
      const access = consumerAccess(this.prefsAt(caller.actor_id, where), caller.consumer, caller.plugin_id);
      if (!access.allowed) { offScopes.push(where.scope === "personal" ? "个人记忆" : where.scope === "character" ? "角色记忆" : "项目记忆"); continue; }
      for (const located of await this.located(caller, where.scope, where.owner)) {
        const meta = located.meta;
        if (meta.state !== "active" || this.expired(meta, now) || !this.visibleTo(caller, meta)) continue;
        if (access.kinds && !access.kinds.includes(meta.kind)) continue;
        if (request.kinds?.length && !request.kinds.includes(meta.kind)) continue;
        if (!applies(meta.applies, request.situation, now)) continue;
        const hits = keywordScore(keywords, `${located.entry.text} ${meta.applies.task ?? ""}`);
        if (keywords.length && hits === 0 && STANDING[meta.kind] < 0.2) continue;
        const ageDays = Math.max(0, (now.getTime() - Date.parse(meta.updated_at)) / 86_400_000);
        const recency = ageDays <= 30 ? 1 : Math.max(0.7, 1 - (ageDays - 30) / 300);
        const score = (STANDING[meta.kind] + (keywords.length ? hits : 0.3) * 0.55) * KIND_WEIGHT[meta.kind] * recency * SOURCE_WEIGHT[meta.source];
        ranked.push({ located, score: Math.round(score * 1000) / 1000 });
      }
    }
    if (!ranked.length && offScopes.length && offScopes.length === scopes.length)
      return { state: "off", reason: `你关掉了“${CONSUMER_LABELS[caller.consumer]}”使用${offScopes.join("和")}`, items: [], omitted: [], method: "keyword-cjk", receipt_id };
    ranked.sort((a, b) => b.score - a.score || b.located.meta.updated_at.localeCompare(a.located.meta.updated_at));
    const items: MemoryRecalled[] = [], omitted: MemoryRecallResponse["omitted"] = [];
    // Two that contradict each other (a pair the person has not settled yet): only the stronger one goes in, the other is named.
    const explicit = (one: Located) => EXPLICIT_SOURCES.includes(one.meta.source) ? 1 : 0;
    for (const pair of this.ports.ledger.pairs(caller.actor_id).filter(item => item.state === "pending" && item.kind === "conflict")) {
      const a = ranked.find(one => one.located.entry.memory_id === pair.a.memory_id), b = ranked.find(one => one.located.entry.memory_id === pair.b.memory_id);
      if (!a || !b) continue;
      const loser = explicit(a.located) !== explicit(b.located) ? (explicit(a.located) > explicit(b.located) ? b : a) : (a.located.meta.updated_at >= b.located.meta.updated_at ? b : a);
      ranked.splice(ranked.indexOf(loser), 1);
      omitted.push({ memory_id: loser.located.entry.memory_id, scope: loser.located.scope, reason: "conflict" });
    }
    let used = 0;
    for (const { located, score } of ranked) {
      const scope = located.scope;
      if (items.length >= limit) { omitted.push({ memory_id: located.entry.memory_id, scope, reason: "limit" }); continue; }
      const cost = located.entry.text.length + located.entry.origin.length + 8;
      if (used + cost > budget) { omitted.push({ memory_id: located.entry.memory_id, scope, reason: "budget" }); continue; }
      used += cost;
      items.push({ memory_id: located.entry.memory_id, version: located.entry.version, scope, kind: located.meta.kind, text: located.entry.text, source: located.meta.source,
        origin: located.entry.origin, applies: located.meta.applies, score });
    }
    const title = this.useTitle(caller, request.used_for);
    const at = now.toISOString(), work_id = caller.work?.work_id ?? null;
    this.ports.ledger.recordUses([
      ...items.map((item): MemoryUseRecord => ({ memory_id: item.memory_id, receipt_id, at, consumer: caller.consumer, title, work_id, state: "used" })),
      ...omitted.map((item): MemoryUseRecord => ({ memory_id: item.memory_id, receipt_id, at, consumer: caller.consumer, title, work_id, state: "omitted" })),
    ]);
    const partlyOff = offScopes.length ? `你关掉了“${CONSUMER_LABELS[caller.consumer]}”使用${offScopes.join("和")}` : null;
    return { state: "ok", reason: partlyOff, items, omitted, method: "keyword-cjk", receipt_id };
  }

  /** What one recall or one work used and left out, for 用到的记忆. Deleted memories are not listed. */
  uses(filter: { receipt_id?: string; work_id?: string }): MemoryUseRecord[] {
    return this.ports.ledger.uses({ ...filter, limit: 200 });
  }

  /**
   * A run's own facts settle its receipt (spec §8.2 S5): what the runtime left out for room, or found gone at start,
   * was not used — 最近用于 follows what really went into the work.
   */
  settleUses(receiptId: string, fact: { injected: readonly string[]; omitted: readonly string[]; unavailable: readonly string[] }): void {
    const uses = this.ports.ledger.uses({ receipt_id: receiptId, limit: 200 });
    const changed = uses.filter(use => fact.omitted.includes(use.memory_id) || fact.unavailable.includes(use.memory_id)).map(use => ({ ...use, state: "omitted" as const }));
    if (changed.length) this.ports.ledger.recordUses(changed);
  }

  /**
   * The memories one Agent run is given (spec §7.2): the recall for its consumer, as exact entries for the runtime to
   * re-read and inject as data. Null when this consumer may not use memories here or nothing applies.
   */
  async forRun(caller: MemoryCaller, request: MemoryRecallRequest): Promise<{ pinned: Array<{ scope: "user" | "project" | "character"; owner: string; memory_id: string }>; budget_chars: number; receipt_id: string;
    omitted: Array<{ memory_id: string; reason: "budget" | "limit" | "conflict" }> } | null> {
    const budget = request.budget_chars ?? 3000;
    const recalled = await this.recall(caller, { ...request, budget_chars: budget });
    if (recalled.state !== "ok" || !recalled.items.length) return null;
    return { pinned: recalled.items.map(item => ({ scope: item.scope === "personal" ? "user" as const : item.scope === "character" ? "character" as const : "project" as const,
      owner: this.where(caller, item.scope).owner, memory_id: item.memory_id })), budget_chars: budget, receipt_id: recalled.receipt_id,
      omitted: recalled.omitted.map(item => ({ memory_id: item.memory_id, reason: item.reason })) };
  }

  /* ---- writing ---- */

  /**
   * The unified write entry (spec §6.2). An agent must bring the person's own words; the person in the settings adds
   * by hand. Everything passes the gate: switches, secrets, instruction-like text, scope, sameness and conflicts.
   */
  async write(caller: MemoryCaller, request: MemoryWriteRequest): Promise<MemoryWriteResult> {
    const said = typeof request.said === "string" ? request.said.trim() : "";
    // A plugin keeps things in its own namespace under the grant the person gave it at install; nobody else reads them.
    if (caller.consumer === "plugin") {
      if (!caller.plugin_id) throw new MemoryError("memory.forbidden", "插件写记忆必须由宿主确认插件身份");
      const prefs = this.prefsAt(caller.actor_id, this.where(caller, request.scope));
      const rule = prefs.plugins[caller.plugin_id];
      if (!prefs.consumers.plugin || rule?.allowed === false) throw new MemoryError("memory.forbidden", "用户没有允许这个插件使用记忆");
      return this.commit(caller, { scope: request.scope, text: request.text, kind: request.kind ?? "preference", applies: request.applies ?? {}, expires_at: request.expires_at ?? null,
        source: "plugin", basis: "explicit", evidence: [], approved_by: { by: "policy", policy: `plugin:${caller.plugin_id}`, version: 1 } });
    }
    if (!caller.person && !said) throw new MemoryError("memory.invalid", "记住一件事要附上用户的原话（said）；用户没有明确要求时，用建议（等用户认可）而不是直接记");
    return this.commit(caller, {
      scope: request.scope, text: request.text, kind: request.kind ?? (request.scope === "project" ? "convention" : "preference"), applies: request.applies ?? {}, expires_at: request.expires_at ?? null,
      source: caller.person ? "manual" : "said", basis: "explicit",
      evidence: [...(said ? [{ kind: "said" as const, text: said.slice(0, 200), at: this.now().toISOString() }] : []),
        ...(request.rests_on ? [{ kind: "object" as const, ref: { kind: String(request.rests_on.kind).slice(0, 200), id: String(request.rests_on.id).slice(0, 200), project_id: request.scope === "project" ? caller.project_id : null },
          at: this.now().toISOString() }] : [])],
      approved_by: { by: "person" }, ...(request.replaces ? { replaces: request.replaces } : {}), said,
    });
  }

  /**
   * What the write gate decides for something drawn out of work (spec §6.2 table). Repeated explicit requests of
   * low-risk kinds are written automatically (undoable) when 自动记住 is on; everything else waits for the person.
   */
  async offer(caller: MemoryCaller, input: { scope: MemoryScope; text: string; kind: MemoryKind; applies?: MemoryApplies; basis: MemoryBasis; why: string;
    evidence?: MemoryEvidence[]; from: MemoryCandidate["from"]; supersedes?: string | null; candidate_id?: string }): Promise<MemoryWriteResult> {
    return this.commit(caller, { scope: input.scope, text: input.text, kind: input.kind, applies: input.applies ?? {}, expires_at: null, source: "auto", basis: input.basis,
      evidence: input.evidence ?? [], approved_by: { by: "policy", policy: MEMORY_GATE_POLICY, version: MEMORY_GATE_VERSION }, why: input.why, from: input.from,
      ...(input.supersedes ? { replaces: input.supersedes } : {}), ...(input.candidate_id ? { candidate_id: input.candidate_id } : {}) });
  }

  private async commit(caller: MemoryCaller, input: {
    scope: MemoryScope; text: string; kind: MemoryKind; applies: MemoryApplies; expires_at: string | null; source: MemorySource; basis: MemoryBasis;
    evidence: MemoryEvidence[]; approved_by: MemoryApproval; replaces?: string; said?: string; why?: string; from?: MemoryCandidate["from"]; origin?: string;
    /** The waiting candidate this settles (an automatic write of something already suggested once). */
    candidate_id?: string;
  }): Promise<MemoryWriteResult> {
    const where = this.where(caller, input.scope);
    const projectId = where.project;
    const prefs = this.prefsAt(caller.actor_id, where);
    const appliesText = memoryAppliesText(input.scope, input.applies, projectId ? await this.projectTitle(projectId) : null);
    const refused = (reason: string): MemoryWriteResult => ({ outcome: "refused", reason, applies_text: appliesText, memory: null, candidate: null, change_id: null });
    const text = input.text.trim();
    if (!text || text.length > MAX_TEXT) throw new MemoryError("memory.invalid", `记忆内容要在 1–${MAX_TEXT} 字之间`);
    if (!MEMORY_KINDS.includes(input.kind)) throw new MemoryError("memory.invalid", "记忆类别只能是偏好、约定、背景事实或经验");
    // 允许记住 off: nothing new is formed and no candidate is left. The person's own additions in the settings still count.
    if (!prefs.form && !caller.person) return refused("你关掉了“允许记住”，这条没有记住，也没有留作建议");
    const screened = await this.ports.backend.screen?.(text).catch(() => null) ?? null;
    if (looksLikeSecret(text) || (input.said && looksLikeSecret(input.said)) || screened?.redacted.includes(REDACTED_CREDENTIAL)) return refused("这段内容看起来含有密码、密钥或令牌，秘密不会进入长期记忆");
    if (caller.consumer === "plugin" && !caller.plugin_id) throw new MemoryError("memory.forbidden", "插件写记忆必须由宿主确认插件身份");
    // Instruction-like (Prologue's screening or the Host's own Chinese patterns) or carrying a local path: the person sees it first.
    // The person's own words are checked too: a model may restate "不用确认，直接删" as something that reads harmless.
    const screenedSaid = input.said && !caller.person ? await this.ports.backend.screen?.(input.said).catch(() => null) ?? null : null;
    const hold = caller.person ? null : screened?.hold || screenedSaid?.hold || looksLikeInstruction(text) || (input.said ? looksLikeInstruction(input.said) : null)
      ? "这段话像是在给 AI 下指令（例如要求忽略规则或跳过确认），不能自动记住，需要你看过再决定"
      : screened && screened.redacted !== text ? "这段话里有本机文件路径之类的内容，先请你看一下再决定记不记" : null;
    const entries = await this.located(caller, input.scope, where.owner);
    const same = entries.find(located => sameText(located.entry.text, text) && this.visibleTo(caller, located.meta));
    if (same) {
      // Said again: an automatic or accepted one becomes the person's own words.
      if (EXPLICIT_SOURCES.includes(input.source) && same.meta.source === "auto") await this.saveFacts(same, { ...same.meta, source: input.source, basis: "explicit",
        approved_by: input.approved_by, evidence: [...same.meta.evidence, ...input.evidence].slice(-6), updated_at: this.now().toISOString() });
      return { outcome: "duplicate", reason: same.meta.state === "disabled" ? "已经记着这一条（目前停用）" : "已经记着这一条了", applies_text: appliesText,
        memory: this.item(await this.find(caller, same.entry.memory_id)), candidate: null, change_id: null };
    }
    let target: Located | null = null;
    if (input.replaces) {
      target = entries.find(located => located.entry.memory_id === input.replaces) ?? null;
      if (!target) throw new MemoryError("memory.not_found", "要替换的那条记忆不在这个范围里（可能已删除，或属于别的范围）");
    }
    const asCandidate = async (why: string): Promise<MemoryWriteResult> => {
      // Already waiting (suggested once before): it keeps waiting, now saying why it was not kept automatically.
      const waiting = input.candidate_id ? this.ports.ledger.candidates(caller.actor_id).find(item => item.candidate_id === input.candidate_id) : undefined;
      if (waiting) {
        const held: MemoryCandidateRecord = { ...waiting, hold_reason: why, ...(input.why ? { why: input.why.slice(0, 300) } : {}) };
        this.ports.ledger.saveCandidate(held);
        return { outcome: "candidate", reason: why, applies_text: appliesText, memory: null, candidate: candidateView(held), change_id: null };
      }
      const candidate = await this.propose(caller, { scope: input.scope, text, kind: input.kind, applies: input.applies, basis: input.basis, why: input.why ?? why,
        from: input.from ?? "gate", hold_reason: why, supersedes: target?.entry.memory_id ?? null }, { gate: true });
      return { outcome: "candidate", reason: why, applies_text: appliesText, memory: null, candidate, change_id: null };
    };
    if (hold) return asCandidate(hold);
    if (target && input.basis === "inferred" && EXPLICIT_SOURCES.includes(target.meta.source)) return asCandidate("推断出来的内容不能覆盖你明确说过的，先请你看一下");
    if (input.source === "auto") {
      if (input.basis !== "repeated") return asCandidate("只是从工作里推断出来的，需要你认可才会生效");
      if (input.kind === "fact") return asCandidate("背景事实以原资料为准，自动记住容易过时，先请你看一下");
      if (!prefs.auto) return asCandidate("你关掉了“自动记住”，所以先请你认可");
    }
    const at = this.now().toISOString();
    // Approved by a policy rather than the person: the write gate's (automatic) or a plugin's install-time grant (its own namespace).
    const automatic = input.source === "auto" || input.source === "plugin";
    const policy = input.approved_by.by === "policy" ? input.approved_by : { by: "policy" as const, policy: MEMORY_GATE_POLICY, version: MEMORY_GATE_VERSION };
    const rule = input.source === "plugin" ? `插件「${caller.plugin_id ?? "?"}」记下` : MEMORY_GATE_RULE;
    if (where.scope === "character" && caller.character) this.ports.ledger.noteOwner({ scope: "character", owner: where.owner, project_id: where.project, title: caller.character.title });
    if (target) {
      const before = target.entry.version;
      const updated = await this.ports.backend.update({ scope: input.scope, owner: where.owner, memory_id: target.entry.memory_id, text });
      const meta: MemoryMetaRecord = { ...target.meta, kind: input.kind, applies: input.applies, source: input.source, basis: input.basis, approved_by: input.approved_by,
        evidence: [...target.meta.evidence, ...input.evidence].slice(-6), expires_at: input.expires_at ?? target.meta.expires_at, state: "active", state_reason: null, updated_at: at };
      this.ports.ledger.transaction(() => {
        this.ensureRevision(target!, before);
        this.ports.ledger.addRevision(updated.memory_id, { version: updated.version, text, kind: input.kind, applies: input.applies, change: "replaced", by: automatic ? "policy" : "person", at });
      });
      await this.saveFacts({ ...target, entry: updated }, meta);
      // The gate's approval of a correction is recorded by Prologue's candidate box on the corrected entry itself.
      if (automatic) await this.settleByPolicy(caller, { ...input, policy }, where, updated, text, meta);
      const change = this.recordChange(caller, { kind: automatic ? "auto_replaced" : "replaced", scope: input.scope, owner: where.owner, memory_id: updated.memory_id, text,
        by: automatic ? "policy" : "person", rule: automatic ? rule : null, reason: input.why ? `依据：${input.why}` : null,
        undo: automatic ? { action: "restore", version: before } : null });
      return { outcome: "replaced", reason: "已替换旧的那条，旧版本保留在历史里", applies_text: appliesText,
        memory: this.item({ scope: input.scope, owner: where.owner, project: where.project, entry: updated, meta }), candidate: null, change_id: change.change_id };
    }
    const origin = input.origin ?? await this.originFor(caller, input.scope, input.source, { said: input.said, why: input.why });
    const facts = { kind: input.kind, source: input.source, basis: input.basis, evidence: input.evidence.slice(-6), applies: input.applies, expires_at: input.expires_at,
      approved_by: input.approved_by, plugin_id: caller.consumer === "plugin" ? caller.plugin_id ?? null : null };
    // The text and its facts go into Prologue in one write: there is never an entry without them. An automatic one goes
    // in only as a promotion by the gate's policy (Prologue records the approver): the model never approves itself.
    const entry = automatic
      ? await this.ports.backend.candidates.promote({ scope: input.scope, owner: where.owner, candidate_id: input.candidate_id ?? (await this.ports.backend.candidates.propose({
          scope: input.scope, owner: where.owner, text, origin, tags: [input.source, input.kind], meta: toEntryMeta(facts) })).candidate_id,
        policy: policy.policy, version: policy.version, origin, meta: toEntryMeta(facts) })
      : await this.ports.backend.write({ scope: input.scope, owner: where.owner, text, origin, tags: [input.source, input.kind], meta: toEntryMeta(facts) });
    if (automatic && input.candidate_id) this.markCandidateKept(caller.actor_id, input.candidate_id, entry.memory_id);
    const meta: MemoryMetaRecord = { memory_id: entry.memory_id, scope: input.scope, owner: where.owner, ...facts, state: "active", state_reason: null, created_at: at, updated_at: at };
    try {
      this.ports.ledger.addRevision(entry.memory_id, { version: entry.version, text, kind: input.kind, applies: input.applies, change: "created", by: automatic ? "policy" : "person", at });
    } catch (error) {
      // No half memory: without its facts the entry goes too.
      await this.ports.backend.remove({ scope: input.scope, owner: where.owner, memory_id: entry.memory_id }).catch(() => undefined);
      throw error;
    }
    const kind: MemoryChangeKind = automatic ? "auto_kept" : input.source === "accepted" ? "accepted" : input.source === "imported" ? "imported" : "kept";
    const change = this.recordChange(caller, { kind, scope: input.scope, owner: where.owner, memory_id: entry.memory_id, text, by: automatic ? "policy" : "person",
      rule: automatic ? rule : null, reason: input.why ? `依据：${input.why}` : input.said ? `你说：“${input.said.slice(0, 80)}”` : null,
      undo: automatic ? { action: "remove" } : null });
    return { outcome: "written", reason: automatic ? `${input.source === "plugin" ? rule : `自动记住（${rule}）`}，可以撤销` : "已记住", applies_text: appliesText,
      memory: this.item({ scope: input.scope, owner: where.owner, project: where.project, entry, meta }), candidate: null, change_id: change.change_id };
  }

  /** Change, switch off, restore, move or delete one memory (spec §6.5). */
  async change(caller: MemoryCaller, request: MemoryChangeRequest): Promise<MemoryChangeResult> {
    const located = await this.find(caller, String(request.memory_id ?? ""));
    const { scope, owner, project } = located;
    const at = this.now().toISOString();
    // The Assistant forgets or changes one only when the person asked it to: either way it is the person's change.
    const by = "person" as const;
    switch (request.action) {
      case "update": {
        let entry = located.entry;
        const text = typeof request.text === "string" ? request.text.trim() : null;
        if (text !== null && (!text || text.length > MAX_TEXT)) throw new MemoryError("memory.invalid", `记忆内容要在 1–${MAX_TEXT} 字之间`);
        if (text && looksLikeSecret(text)) throw new MemoryError("memory.invalid", "这段内容看起来含有密码、密钥或令牌，秘密不会进入长期记忆");
        if (request.kind && !MEMORY_KINDS.includes(request.kind)) throw new MemoryError("memory.invalid", "记忆类别只能是偏好、约定、背景事实或经验");
        const meta: MemoryMetaRecord = { ...located.meta, ...(request.kind ? { kind: request.kind } : {}), ...(request.applies ? { applies: request.applies } : {}),
          ...(request.expires_at !== undefined ? { expires_at: request.expires_at } : {}), updated_at: at };
        if (text && text !== entry.text) {
          const before = entry.version;
          entry = await this.ports.backend.update({ scope, owner, memory_id: entry.memory_id, text });
          this.ports.ledger.transaction(() => {
            this.ensureRevision(located, before);
            this.ports.ledger.addRevision(entry.memory_id, { version: entry.version, text, kind: meta.kind, applies: meta.applies, change: "edited", by, at });
          });
        }
        await this.saveFacts({ scope, owner, entry }, meta, located.meta);
        const change = this.recordChange(caller, { kind: "edited", scope, owner, memory_id: entry.memory_id, text: entry.text, by, rule: null, reason: null, undo: null });
        return { memory: this.item({ scope, owner, project, entry, meta }), change: changeView(change) };
      }
      case "disable": case "enable": {
        const meta: MemoryMetaRecord = { ...located.meta, state: request.action === "disable" ? "disabled" : "active", state_reason: request.action === "disable" ? "你停用了" : null, updated_at: at };
        await this.saveFacts(located, meta, located.meta);
        const change = this.recordChange(caller, { kind: request.action === "disable" ? "disabled" : "enabled", scope, owner, memory_id: located.entry.memory_id, text: located.entry.text,
          by, rule: null, reason: null, undo: null });
        return { memory: this.item({ ...located, meta }), change: changeView(change) };
      }
      case "remove": {
        await this.purge(located);
        const change = this.recordChange(caller, { kind: "removed", scope, owner, memory_id: located.entry.memory_id, text: "", by, rule: null, reason: null, undo: null });
        return { memory: null, change: changeView(change) };
      }
      case "restore": {
        const revision = this.ports.ledger.revisions(located.entry.memory_id).find(one => one.version === request.version);
        if (!revision) throw new MemoryError("memory.not_found", "没有这个历史版本");
        const before = located.entry.version;
        const entry = await this.ports.backend.update({ scope, owner, memory_id: located.entry.memory_id, text: revision.text });
        const meta: MemoryMetaRecord = { ...located.meta, kind: revision.kind, applies: revision.applies, updated_at: at };
        this.ports.ledger.transaction(() => {
          this.ensureRevision(located, before);
          this.ports.ledger.addRevision(entry.memory_id, { version: entry.version, text: revision.text, kind: revision.kind, applies: revision.applies, change: "restored", by, at });
        });
        await this.saveFacts({ scope, owner, entry }, meta, located.meta);
        const change = this.recordChange(caller, { kind: "restored", scope, owner, memory_id: entry.memory_id, text: entry.text, by, rule: null, reason: `回到第 ${revision.version} 版`, undo: null });
        return { memory: this.item({ scope, owner, project, entry, meta }), change: changeView(change) };
      }
      case "move": {
        const to = request.to;
        if (to !== "personal" && to !== "project") throw new MemoryError("memory.invalid", "只能改为个人记忆或项目记忆");
        if (to === scope) throw new MemoryError("memory.invalid", to === "project" ? "它已经是项目记忆" : "它已经是个人记忆");
        const target = this.where(caller, to);
        const date = this.date();
        // A personal memory travels to every project: it keeps no project's objects or work names.
        const origin = to === "personal" ? `${date} · 由项目记忆改为个人记忆` : `${date} · 由个人记忆改为项目记忆`;
        const moved = { ...located.meta, evidence: to === "personal" ? located.meta.evidence.filter(item => item.kind === "said") : located.meta.evidence };
        let entry = await this.ports.backend.write({ scope: to, owner: target.owner, text: located.entry.text, origin, tags: [located.meta.source, located.meta.kind], meta: toEntryMeta(moved) });
        const meta: MemoryMetaRecord = { ...moved, memory_id: entry.memory_id, scope: to, owner: target.owner, updated_at: at };
        // Switched off stays switched off where it moves to.
        if (meta.state !== "active") entry = await this.ports.backend.pause({ scope: to, owner: target.owner, memory_id: entry.memory_id, reason: pauseReason(meta.state, meta.state_reason) });
        this.ports.ledger.addRevision(entry.memory_id, { version: entry.version, text: entry.text, kind: meta.kind, applies: meta.applies, change: "created", by, at });
        await this.purge(located);
        const change = this.recordChange(caller, { kind: "moved", scope: to, owner: target.owner, memory_id: entry.memory_id, text: entry.text, by, rule: null,
          reason: to === "personal" ? "改为个人记忆" : "改为项目记忆", undo: null });
        return { memory: this.item({ scope: to, owner: target.owner, entry, meta }), change: changeView(change) };
      }
      default: throw new MemoryError("memory.invalid", "不支持的操作");
    }
  }

  /* ---- candidates ---- */

  /**
   * Waiting candidates in the caller's scopes; `anywhere` (the person only): in every project they have candidates in.
   * Prologue's candidate box holds each candidate and its state; the Host keeps what explains it (why, from which work,
   * why it was held back, what it would replace). Left alone for 14 days, a suggestion goes quietly: it was never in effect.
   */
  async candidates(caller: MemoryCaller, filter: { scope?: MemoryScope | "all"; work_id?: string; anywhere?: boolean } = {}): Promise<MemoryCandidate[]> {
    const stale = this.now().getTime() - CANDIDATE_TTL_MS;
    const anywhere = filter.anywhere === true && caller.person === true;
    const owners = new Map(this.scopesFor(caller, filter.scope && filter.scope !== "all" ? [filter.scope] : undefined, true).map(where => [`${where.scope}:${where.owner}`, where]));
    if (anywhere) for (const note of this.ports.ledger.candidates(caller.actor_id)) owners.set(`${note.scope}:${note.owner}`, { scope: note.scope, owner: note.owner, project: note.project_id });
    const out: MemoryCandidate[] = [];
    for (const where of owners.values()) {
      for (const record of await this.candidateRecords(caller.actor_id, where.scope, where.owner)) {
        if (record.state !== "pending") continue;
        if (filter.work_id && record.work?.work_id !== filter.work_id) continue;
        if (Date.parse(record.created_at) < stale) { await this.settleCandidate(record, "expired"); continue; }
        out.push(candidateView(record));
      }
    }
    return out.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  /**
   * Suggest keeping something the person did not ask for (spec §6.1): a candidate only, until they accept it. The
   * first version's rules hold: one suggestion of the same text ever, at most three waiting per work, never what is kept.
   */
  async propose(caller: MemoryCaller, input: { scope: MemoryScope; text: string; kind: MemoryKind; applies?: MemoryApplies; basis: MemoryBasis; why: string;
    from: MemoryCandidate["from"]; hold_reason?: string | null; supersedes?: string | null; evidence?: MemoryEvidence[] }, options: { gate?: boolean } = {}): Promise<MemoryCandidate> {
    const where = this.where(caller, input.scope);
    const prefs = this.prefsAt(caller.actor_id, where);
    if (!prefs.form) throw new MemoryError("memory.off", "用户关掉了“允许记住”，不要提出记忆建议");
    if (!options.gate) {
      if ((input.from === "work" || input.from === "extraction") && !prefs.learn_from_work)
        throw new MemoryError("memory.forbidden", input.scope === "project" ? "用户没有允许从项目工作里提出项目约定" : "用户没有允许从工作里提出个人偏好");
      if (input.from === "signal" && !prefs.learn_from_ui) throw new MemoryError("memory.forbidden", "用户没有允许从界面操作里学习");
    }
    const text = input.text.trim();
    if (!text || text.length > MAX_TEXT) throw new MemoryError("memory.invalid", `记忆内容要在 1–${MAX_TEXT} 字之间`);
    if (looksLikeSecret(text)) throw new MemoryError("memory.invalid", "这段内容看起来含有密码、密钥或令牌，秘密不会进入长期记忆");
    const earlier = await this.candidateRecords(caller.actor_id, input.scope, where.owner);
    const work = caller.work ?? null;
    // The same suggestion, or nearly the same one already waiting from this work (a reworded second try), is not taken twice.
    if (earlier.some(item => item.state !== "expired" && (sameText(item.text, text)
      || (item.state === "pending" && work !== null && item.work?.work_id === work.work_id && similarity(item.text, text) >= 0.6))))
      throw new MemoryError("memory.invalid", "这条已经建议过了（用户认可、拒绝或还在等），不要再提");
    if ((await this.located(caller, input.scope, where.owner)).some(located => sameText(located.entry.text, text))) throw new MemoryError("memory.invalid", "已经记着这一条了");
    if (work && earlier.filter(item => item.work?.work_id === work.work_id && item.state === "pending").length >= PENDING_PER_WORK)
      throw new MemoryError("memory.limit", `这项工作已有 ${PENDING_PER_WORK} 条建议在等用户，先不要再提`);
    const at = this.now().toISOString();
    const evidence = input.evidence ?? [{ kind: "work" as const, text: input.why.trim().slice(0, 200), ...(work ? { ref: { kind: "work", id: work.work_id } } : {}), at }];
    const facts = { kind: input.kind, source: "accepted" as MemorySource, basis: input.basis, evidence, applies: input.applies ?? {}, expires_at: null, approved_by: { by: "person" } as MemoryApproval,
      plugin_id: caller.consumer === "plugin" ? caller.plugin_id ?? null : null };
    const held = await this.ports.backend.candidates.propose({ scope: input.scope, owner: where.owner, text, origin: `建议 · ${input.from}`, tags: [input.from, input.kind], meta: toEntryMeta(facts) });
    const record: MemoryCandidateRecord = { candidate_id: held.candidate_id, actor_id: caller.actor_id, owner: where.owner, scope: input.scope,
      project_id: where.project, kind: input.kind, text, applies: input.applies ?? {}, basis: input.basis, why: input.why.trim().slice(0, 300),
      // Instruction-like text says so however it came in, so the person sees why before accepting.
      from: input.from, work, hold_reason: input.hold_reason ?? looksLikeInstruction(text), supersedes: input.supersedes ?? null, state: "pending", created_at: at, memory_id: null };
    this.ports.ledger.saveCandidate(record);
    return candidateView(record);
  }

  /**
   * The person keeps a suggestion (as it was, or reworded). It goes in through Prologue's candidate box with the person
   * as approver; one that corrects an existing memory updates that memory (its history keeps the old version).
   */
  async accept(caller: MemoryCaller, candidateId: string, input: { text?: string } = {}): Promise<{ candidate: MemoryCandidate; memory: MemoryItem | null }> {
    this.personOnly(caller, "只有本人能认可记忆建议");
    const record = await this.ownCandidate(caller, candidateId);
    if (record.state !== "pending") throw new MemoryError("memory.invalid", record.state === "accepted" ? "这条已经记住了" : "这条建议已经不在了");
    const text = typeof input.text === "string" && input.text.trim() ? input.text.trim() : record.text;
    if (text.length > MAX_TEXT) throw new MemoryError("memory.invalid", `记忆内容要在 ${MAX_TEXT} 字以内`);
    if (looksLikeSecret(text)) throw new MemoryError("memory.invalid", "这段内容看起来含有密码、密钥或令牌，秘密不会进入长期记忆");
    const holder: MemoryCaller = { ...caller, project_id: record.project_id ?? caller.project_id, work: record.work };
    const date = this.date();
    const origin = record.scope === "project" && record.work ? `你认可的建议 · 工作「${record.work.title.slice(0, 40)}」· ${date} · 依据：${record.why.slice(0, 120)}`
      : `你认可的建议 · ${date} · 依据：${record.why.slice(0, 120)}`;
    const at = this.now().toISOString();
    const facts = { kind: record.kind, source: "accepted" as MemorySource, basis: record.basis,
      evidence: [{ kind: "work" as const, text: record.why.slice(0, 200), ...(record.work ? { ref: { kind: "work", id: record.work.work_id } } : {}), at }],
      applies: record.applies, expires_at: null, approved_by: { by: "person" } as MemoryApproval, plugin_id: null };
    const entries = await this.located(holder, record.scope, record.owner);
    const target = (record.supersedes ? entries.find(located => located.entry.memory_id === record.supersedes) : undefined)
      ?? entries.find(located => sameText(located.entry.text, text));
    let located: Located, change: MemoryChangeKind;
    if (target) {
      // It corrects (or repeats) one already kept: that one changes, keeping its history.
      const before = target.entry.version;
      const entry = sameText(target.entry.text, text) ? target.entry : await this.ports.backend.update({ scope: record.scope, owner: record.owner, memory_id: target.entry.memory_id, text });
      const meta: MemoryMetaRecord = { ...target.meta, ...facts, evidence: [...target.meta.evidence, ...facts.evidence].slice(-6), state: "active", state_reason: null, updated_at: at };
      if (entry.version !== before) this.ports.ledger.transaction(() => {
        this.ensureRevision(target, before);
        this.ports.ledger.addRevision(entry.memory_id, { version: entry.version, text, kind: meta.kind, applies: meta.applies, change: "replaced", by: "person", at });
      });
      await this.saveFacts({ ...target, entry }, meta, target.meta);
      await this.ports.backend.candidates.settleInto({ scope: record.scope, owner: record.owner, candidate_id: record.candidate_id, memory_id: entry.memory_id, by: { by: "person" } });
      located = { scope: record.scope, owner: record.owner, entry, meta };
      change = entry.version !== before ? "replaced" : "accepted";
    } else {
      const entry = await this.ports.backend.candidates.accept({ scope: record.scope, owner: record.owner, candidate_id: record.candidate_id, text, origin, meta: toEntryMeta(facts) });
      this.ports.ledger.addRevision(entry.memory_id, { version: entry.version, text, kind: record.kind, applies: record.applies, change: "created", by: "person", at });
      located = { scope: record.scope, owner: record.owner, entry, meta: { memory_id: entry.memory_id, scope: record.scope, owner: record.owner, ...facts, state: "active", state_reason: null, created_at: at, updated_at: at } };
      change = "accepted";
    }
    this.recordChange(holder, { kind: change, scope: record.scope, owner: record.owner, memory_id: located.entry.memory_id, text: located.entry.text, by: "person", rule: null,
      reason: `依据：${record.why.slice(0, 120)}`, undo: null });
    const kept: MemoryCandidateRecord = { ...record, text, state: "accepted", memory_id: located.entry.memory_id };
    this.ports.ledger.saveCandidate(kept);
    return { candidate: candidateView(kept), memory: this.item(located) };
  }

  async discard(caller: MemoryCaller, candidateId: string): Promise<{ candidate: MemoryCandidate }> {
    this.personOnly(caller, "只有本人能拒绝记忆建议");
    const record = await this.ownCandidate(caller, candidateId);
    if (record.state !== "pending") throw new MemoryError("memory.invalid", "这条建议已经不在了");
    return { candidate: candidateView(await this.settleCandidate(record, "discarded")) };
  }

  /** The Host's notes joined with Prologue's candidates of one scope; notes of earlier versions are moved into the box once. */
  private async candidateRecords(actorId: string, scope: MemoryScope, owner: string): Promise<MemoryCandidateRecord[]> {
    const held = new Map((await this.ports.backend.candidates.list(scope, owner)).map(item => [item.candidate_id, item]));
    const out: MemoryCandidateRecord[] = [];
    for (const note of this.ports.ledger.candidates(actorId).filter(item => item.scope === scope && item.owner === owner)) {
      const found = held.get(note.candidate_id);
      // Accepted before candidates lived in Prologue: kept only as the record that it was suggested and kept.
      if (!found && note.state === "accepted") { out.push(note); continue; }
      if (!found) {
        // A note from before candidates lived in Prologue: moved in once (with its state), then keyed by the box's id.
        const moved = await this.ports.backend.candidates.propose({ scope, owner, text: note.text, origin: `建议 · ${note.from}`, tags: [note.from, note.kind],
          meta: toEntryMeta({ kind: note.kind, source: "accepted", basis: note.basis, evidence: [], applies: note.applies, expires_at: null, approved_by: { by: "person" }, plugin_id: null }) });
        if (note.state === "discarded") await this.ports.backend.candidates.discard({ scope, owner, candidate_id: moved.candidate_id });
        if (note.state === "expired") await this.ports.backend.candidates.expire({ scope, owner, candidate_id: moved.candidate_id });
        this.ports.ledger.transaction(() => {
          this.ports.ledger.dropCandidate(note.candidate_id);
          this.ports.ledger.saveCandidate({ ...note, candidate_id: moved.candidate_id });
        });
        out.push({ ...note, candidate_id: moved.candidate_id });
        continue;
      }
      const state: MemoryCandidateRecord["state"] = found.state === "promoted" ? "accepted" : found.state;
      out.push({ ...note, state, memory_id: found.memory_id ?? note.memory_id });
    }
    return out;
  }

  private async settleCandidate(record: MemoryCandidateRecord, state: "discarded" | "expired"): Promise<MemoryCandidateRecord> {
    const where = { scope: record.scope, owner: record.owner, candidate_id: record.candidate_id };
    if (state === "discarded") await this.ports.backend.candidates.discard(where); else await this.ports.backend.candidates.expire(where);
    const next: MemoryCandidateRecord = { ...record, state };
    this.ports.ledger.saveCandidate(next);
    return next;
  }

  /* ---- recent changes ---- */

  changes(caller: MemoryCaller, filter: { scope?: MemoryScope | "all"; work_id?: string; limit?: number } = {}): MemoryChange[] {
    const owners = new Set(this.scopesFor(caller, filter.scope && filter.scope !== "all" ? [filter.scope] : undefined, true).map(where => `${where.scope}:${where.owner}`));
    return this.ports.ledger.changes(caller.actor_id, Math.max(1, Math.min(200, filter.limit ?? 50)) * (filter.work_id ? 4 : 1))
      .filter(change => owners.has(`${change.scope}:${change.owner}`) && (!filter.work_id || change.work?.work_id === filter.work_id))
      .slice(0, filter.limit ?? 50).map(changeView);
  }

  /** Take an automatic change back: a written one is deleted, a replaced one goes back, a switched-off one comes back. */
  async undo(caller: MemoryCaller, changeId: string): Promise<{ change: MemoryChange }> {
    this.personOnly(caller, "只有本人能撤销记忆变动");
    const record = this.ports.ledger.change(changeId);
    if (!record || record.actor_id !== caller.actor_id) throw new MemoryError("memory.not_found", "没有这次变动");
    if (record.state === "undone") return { change: changeView(record) };
    if (!record.undoable || !record.undo || (!record.memory_id && record.undo.action !== "recreate")) throw new MemoryError("memory.invalid", "这次变动不能撤销");
    const holder: MemoryCaller = { ...caller, project_id: record.scope === "project" ? record.owner : caller.project_id };
    const located = record.memory_id ? await this.find(holder, record.memory_id).catch(() => null) : null;
    const plan: MemoryUndoPlan = record.undo;
    if (plan.action === "recreate") {
      // Undoing a merge brings back the one merged away, as it was.
      await this.commit({ ...holder, person: true }, { scope: record.scope, text: plan.text, kind: plan.kind, applies: plan.applies, expires_at: null, source: plan.source === "auto" ? "manual" : plan.source,
        basis: plan.basis, evidence: [], approved_by: { by: "person" }, origin: `${this.date()} · 撤销合并后恢复` });
    } else if (located) {
      const memoryId = located.entry.memory_id;
      if (plan.action === "remove") await this.purge(located);
      else if (plan.action === "restore") await this.change({ ...holder, person: true }, { memory_id: memoryId, action: "restore", version: plan.version });
      else if (plan.action === "enable" && plan.clear_expiry) {
        await this.change({ ...holder, person: true }, { memory_id: memoryId, action: "update", expires_at: null });
        await this.change({ ...holder, person: true }, { memory_id: memoryId, action: "enable" });
      } else await this.change({ ...holder, person: true }, { memory_id: memoryId, action: plan.action });
    }
    const undone: MemoryChangeRecord = { ...(this.ports.ledger.change(changeId) ?? record), state: "undone", undoable: false, ...(plan.action === "remove" ? { text: "" } : {}) };
    this.ports.ledger.saveChange(undone);
    return { change: changeView(undone) };
  }

  /* ---- learning from work (spec §6.1 item 2, §6.2) ---- */

  /**
   * Whether a finished round is worth drawing memories out of: forming and learning from work are on in a scope it may
   * write, the person did not say not to remember, and they said something that reads like a standing wish or a lesson.
   * Deterministic, so most rounds cost no model call at all (spec §15).
   */
  worthLearning(caller: MemoryCaller, said: readonly string[]): boolean {
    const latest = said.at(-1) ?? "";
    if (!latest.trim() || said.some(text => DO_NOT_REMEMBER.test(text))) return false;
    const scopes = this.scopesFor(caller, undefined, true);
    const allowed = scopes.some(where => { const prefs = this.prefsAt(caller.actor_id, where); return prefs.form && prefs.learn_from_work; });
    return allowed && STANDING_WISH.test(latest);
  }

  /** What the drawing-out sees besides the person's words: memories already kept and suggestions waiting (so it can say "the same"). */
  async learningContext(caller: MemoryCaller): Promise<{ existing: Array<{ memory_id: string; scope: MemoryScope; kind: MemoryKind; text: string }>;
    pending: Array<{ candidate_id: string; scope: MemoryScope; kind: MemoryKind; text: string; work_title: string | null }> }> {
    const existing: Array<{ memory_id: string; scope: MemoryScope; kind: MemoryKind; text: string }> = [];
    for (const where of this.scopesFor(caller, undefined, true)) {
      for (const located of await this.located(caller, where.scope, where.owner)) existing.push({ memory_id: located.entry.memory_id, scope: where.scope, kind: located.meta.kind, text: located.entry.text.slice(0, 200) });
    }
    const pending = (await this.candidates({ ...caller, person: true }, { scope: "all" })).map(item => ({ candidate_id: item.candidate_id, scope: item.scope, kind: item.kind,
      text: item.text.slice(0, 200), work_title: item.work?.title ?? null }));
    return { existing: existing.slice(-30), pending: pending.slice(-20) };
  }

  /**
   * The write gate over what a work's drawing-out proposed (spec §6.2). The model only proposes; this decides, the same
   * way every time: its quote must really be in what the person said this time, or it is only an inference; said in two
   * different works it counts as repeated and low-risk kinds are kept automatically (undoable); anything else waits.
   */
  async learnFromWork(caller: MemoryCaller, input: { said: readonly string[]; proposals: readonly MemoryProposal[] }): Promise<MemoryLearned[]> {
    const out: MemoryLearned[] = [];
    if (input.said.some(text => DO_NOT_REMEMBER.test(text))) return out;
    const spoken = normalized(input.said.join("\n"));
    for (const proposal of input.proposals.slice(0, 3)) {
      const text = String(proposal.text ?? "").trim();
      const skip = (reason: string) => { out.push({ text, outcome: "skipped", reason, candidate_id: null, memory_id: null }); };
      if (!text || text.length > MAX_TEXT || !MEMORY_KINDS.includes(proposal.kind)) { skip("提议不合形状"); continue; }
      const scope: MemoryScope = proposal.scope === "project" && caller.project_id ? "project" : "personal";
      const where = this.where(caller, scope);
      const prefs = this.prefsAt(caller.actor_id, where);
      if (!prefs.form || !prefs.learn_from_work) { skip("这个范围没有允许从工作里学习"); continue; }
      // Only what is really in the person's own words counts as theirs; anything else is an inference.
      const quote = String(proposal.quote ?? "").trim().slice(0, 200);
      const verified = quote.length >= 2 && spoken.includes(normalized(quote));
      const basis: MemoryBasis = verified && proposal.basis === "explicit" ? "explicit" : "inferred";
      const applies: MemoryApplies = proposal.applies_when?.trim() ? { task: proposal.applies_when.trim().slice(0, 200) } : {};
      if ((await this.located(caller, scope, where.owner)).some(located => sameText(located.entry.text, text))) { skip("已经记着这一条了"); continue; }
      const work = caller.work ?? null;
      const records = await this.candidateRecords(caller.actor_id, scope, where.owner);
      // The same wish, suggested before in another work from the person's own words: now it is repeated.
      const earlier = records.find(item => item.state === "pending" && item.basis === "explicit" && item.from === "extraction"
        && (item.candidate_id === proposal.same_as || sameText(item.text, text)) && item.work?.work_id !== work?.work_id);
      if (records.some(item => item.state === "pending" && sameText(item.text, text) && item.work?.work_id === work?.work_id)) { skip("这项工作里已经提过"); continue; }
      const at = this.now().toISOString();
      const evidence: MemoryEvidence[] = verified ? [{ kind: "said", text: quote, ...(work ? { ref: { kind: "work", id: work.work_id } } : {}), at }] : [];
      const supersedes = proposal.supersedes && (await this.located(caller, scope, where.owner)).some(located => located.entry.memory_id === proposal.supersedes) ? proposal.supersedes : null;
      // A personal memory travels to every project, so what explains it never names a project's works (spec §11).
      const named = scope !== "personal";
      if (earlier && basis === "explicit") {
        const works = [earlier.work?.title, work?.title].filter(Boolean).map(title => `「${title}」`).join("和");
        const result = await this.offer({ ...caller, work }, { scope, text: earlier.text, kind: earlier.kind, applies: earlier.applies, basis: "repeated",
          why: named ? `你在工作${works}里都这样要求` : "你在两项不同的工作里都这样要求", evidence: [...evidence], from: "extraction", supersedes: earlier.supersedes ?? supersedes, candidate_id: earlier.candidate_id });
        out.push({ text: earlier.text, outcome: result.outcome, reason: result.reason, candidate_id: result.candidate?.candidate_id ?? earlier.candidate_id, memory_id: result.memory?.memory_id ?? null });
        continue;
      }
      try {
        const candidate = await this.propose({ ...caller, work }, { scope, text, kind: proposal.kind, applies, basis, from: "extraction", supersedes, evidence: evidence.length ? evidence : undefined,
          why: verified ? `你在${named && work ? `工作「${work.title}」` : "一项工作"}里说：“${quote}”` : `从${named && work ? `工作「${work.title}」` : "一项工作"}里推断`,
          hold_reason: basis === "explicit"
            ? "只在一项工作里出现过：在另一项工作里再这样要求会自动记住，也可以现在就认可"
            : "只是推断出来的，需要你认可才会生效" });
        out.push({ text, outcome: "candidate", reason: candidate.hold_reason ?? "等你认可", candidate_id: candidate.candidate_id, memory_id: null });
      } catch (error) {
        skip(error instanceof Error ? error.message : String(error));
      }
    }
    return out;
  }

  /* ---- interface signals ---- */

  /** Count one interface event (spec §6.1 item 3). A single event never forms a memory; enough of them only suggest one. */
  async signal(caller: MemoryCaller, report: MemorySignalReport): Promise<MemorySignalResult> {
    const scope = report.scope ?? "personal";
    const where = this.where(caller, scope);
    const prefs = this.prefsAt(caller.actor_id, where);
    const threshold = { ...SIGNAL_THRESHOLD };
    if (!prefs.form || !prefs.learn_from_ui) return { state: "off", count: 0, distinct: 0, candidate_id: null, threshold };
    const situation = report.situation ?? {};
    const key = [scope, where.owner, report.signal, report.subject.capability_id, situation.plugin_id ?? "", situation.object_kind ?? ""].join("|");
    const counted = this.ports.ledger.countSignal({ actor_id: caller.actor_id, key, event_id: report.event_id, occurrence: report.occurrence ?? report.event_id, at: this.now().toISOString() });
    let candidate_id: string | null = null;
    if (counted.state === "counted" && counted.count >= threshold.count && counted.distinct >= threshold.distinct) {
      const place = situation.label?.trim().slice(0, 40) || [situation.plugin_id, situation.object_kind].filter(Boolean).join(" · ");
      const label = report.subject.label.trim().slice(0, 80);
      const text = report.signal === "accepted" || report.signal === "rewritten"
        ? `${place ? `在 ${place} 里` : ""}常用「${label}」${report.signal === "rewritten" ? "（通常会先改一改再用）" : ""}`
        : `${place ? `在 ${place} 里` : ""}一般不需要「${label}」这个建议`;
      const candidate = await this.propose({ ...caller, work: null }, { scope, text, kind: "preference", basis: "inferred", from: "signal",
        why: `界面操作：${counted.count} 次，来自 ${counted.distinct} 个不同场合`, applies: situation.plugin_id ? { plugin_ids: [situation.plugin_id] } : {},
        hold_reason: "只是从界面操作推断的，需要你认可才会生效" }).catch(() => null);
      candidate_id = candidate?.candidate_id ?? null;
    }
    return { state: counted.state, count: counted.count, distinct: counted.distinct, candidate_id, threshold };
  }

  /* ---- upkeep: keeping memories from going stale (spec §6.4) ---- */

  /**
   * One pass over every scope: expired and long-unused automatic ones are switched off, automatic duplicates are merged,
   * ones whose object is gone are paused (and resume when it is back), and pairs that may repeat or contradict each
   * other go to the person — upkeep never chooses between the person's own words. Every change is undoable in
   * recent changes; nothing is ever deleted for good here.
   */
  async upkeep(caller: MemoryCaller, options: { projects: readonly string[];
    tidy?: (entries: Array<{ memory_id: string; text: string; kind: MemoryKind; source: MemorySource }>) => Promise<{ duplicates: Array<[string, string]>; conflicts: Array<{ a: string; b: string; why: string }> } | null>;
    objectState?: (ref: { kind: string; id: string; project_id: string | null }) => Promise<"ok" | "missing" | "unknown">;
  }): Promise<MemoryUpkeepReport> {
    const now = this.now(), at = now.toISOString(), day = 86_400_000;
    const report: MemoryUpkeepReport = { at, expired: 0, unused: 0, merged: 0, paused: 0, resumed: 0, pairs: 0, tidied: false };
    // The person's, each project's, and each project's Characters' (kept per project).
    const scopes: Array<{ scope: MemoryScope; owner: string; project: string | null }> = [{ scope: "personal", owner: caller.actor_id, project: null },
      ...[...new Set(options.projects)].flatMap(id => [{ scope: "project" as const, owner: id, project: id },
        ...this.ports.ledger.owners(id).filter(owner => owner.scope === "character").map(owner => ({ scope: "character" as const, owner: owner.owner, project: id }))])];
    for (const where of scopes) {
      const holder: MemoryCaller = { ...caller, project_id: where.project ?? caller.project_id, person: true };
      let located = await this.located(holder, where.scope, where.owner);
      if (!located.length) continue;
      const turnOff = async (one: Located, state: "disabled" | "paused", reason: string, kind: MemoryChangeKind, undo: MemoryUndoPlan) => {
        const meta: MemoryMetaRecord = { ...one.meta, state, state_reason: reason, updated_at: at };
        await this.saveFacts(one, meta, one.meta);
        this.recordChange(holder, { kind, scope: where.scope, owner: where.owner, memory_id: one.entry.memory_id, text: one.entry.text, by: "maintenance", rule: "整理", reason, undo });
        one.meta = meta;
      };
      for (const one of located) {
        if (one.meta.state === "active" && one.meta.expires_at && Date.parse(one.meta.expires_at) <= now.getTime()) {
          await turnOff(one, "disabled", `已于 ${one.meta.expires_at.slice(0, 10)} 到期`, "auto_disabled", { action: "enable", clear_expiry: true }); report.expired += 1; continue;
        }
        // What it rests on: an object deleted or no longer readable pauses it; back again, it resumes.
        const object = one.meta.evidence.find(item => item.kind === "object" && item.ref)?.ref;
        if (object && options.objectState) {
          const state = await options.objectState({ kind: object.kind, id: object.id, project_id: object.project_id ?? where.project }).catch(() => "unknown" as const);
          if (state === "missing" && one.meta.state === "active") { await turnOff(one, "paused", `依据已不存在（${object.kind} ${object.id}）`, "paused", { action: "enable" }); report.paused += 1; }
          else if (state === "ok" && one.meta.state === "paused" && (one.meta.state_reason ?? "").startsWith("依据已不存在")) {
            const meta: MemoryMetaRecord = { ...one.meta, state: "active", state_reason: null, updated_at: at };
            await this.saveFacts(one, meta, one.meta);
            this.recordChange(holder, { kind: "resumed", scope: where.scope, owner: where.owner, memory_id: one.entry.memory_id, text: one.entry.text, by: "maintenance", rule: "整理", reason: "依据又能读到了", undo: null });
            one.meta = meta; report.resumed += 1;
          }
        }
      }
      // Duplicates: two automatic ones merge (the older keeps both provenances); anything involving the person's words goes to them.
      const pairsRaised = new Set(this.ports.ledger.pairs(caller.actor_id).map(pair => pairKey(pair.a.memory_id, pair.b.memory_id, pair.kind)));
      const raise = (a: Located, b: Located, kind: MemoryPair["kind"], why: string) => {
        const key = pairKey(a.entry.memory_id, b.entry.memory_id, kind);
        if (pairsRaised.has(key)) return;
        pairsRaised.add(key);
        this.ports.ledger.savePair(caller.actor_id, { pair_id: `pair-${this.newId()}`, kind, scope: where.scope, project_id: where.project, owner: where.owner,
          a: { memory_id: a.entry.memory_id, text: a.entry.text, source: a.meta.source }, b: { memory_id: b.entry.memory_id, text: b.entry.text, source: b.meta.source }, why, created_at: at, state: "pending" });
        report.pairs += 1;
      };
      const merge = async (keep: Located, drop: Located) => {
        const meta: MemoryMetaRecord = { ...keep.meta, evidence: [...keep.meta.evidence, ...drop.meta.evidence].slice(-6), updated_at: at };
        await this.saveFacts(keep, meta, keep.meta);
        await this.purge(drop);
        this.recordChange(holder, { kind: "merged", scope: where.scope, owner: where.owner, memory_id: keep.entry.memory_id, text: keep.entry.text, by: "maintenance", rule: "整理",
          reason: `合并了意思相同的「${drop.entry.text.slice(0, 60)}」`, undo: { action: "recreate", text: drop.entry.text, kind: drop.meta.kind, source: drop.meta.source, basis: drop.meta.basis, applies: drop.meta.applies } });
        report.merged += 1;
      };
      const active = () => located.filter(one => one.meta.state === "active");
      const mergedAway = new Set<string>();
      const handleDuplicate = async (a: Located, b: Located, why: string) => {
        if (mergedAway.has(a.entry.memory_id) || mergedAway.has(b.entry.memory_id)) return;
        if (a.meta.source === "auto" && b.meta.source === "auto" && a.meta.kind === b.meta.kind) {
          const [keep, drop] = a.meta.created_at <= b.meta.created_at ? [a, b] : [b, a];
          await merge(keep, drop); mergedAway.add(drop.entry.memory_id);
        } else raise(a, b, "duplicate", why);
      };
      const list = active();
      for (let i = 0; i < list.length; i += 1) for (let j = i + 1; j < list.length; j += 1) {
        if (list[i]!.meta.kind === list[j]!.meta.kind && similarity(list[i]!.entry.text, list[j]!.entry.text) >= 0.85) await handleDuplicate(list[i]!, list[j]!, "两条几乎一字不差");
      }
      located = located.filter(one => !mergedAway.has(one.entry.memory_id));
      // The model only finds candidates for the person, and only when this scope changed since it last looked.
      const fingerprint = located.map(one => `${one.entry.memory_id}:${one.entry.version}:${one.meta.state}`).sort().join("|");
      const tidyKey = `tidy:${where.scope}:${where.owner}`;
      if (options.tidy && active().length >= 2 && (this.ports.ledger.migration(caller.actor_id, tidyKey)?.body as { fingerprint?: string } | undefined)?.fingerprint !== fingerprint) {
        const byId = new Map(active().map(one => [one.entry.memory_id, one]));
        const found = await options.tidy(active().slice(-60).map(one => ({ memory_id: one.entry.memory_id, text: one.entry.text.slice(0, 200), kind: one.meta.kind, source: one.meta.source }))).catch(() => null);
        if (found) {
          report.tidied = true;
          for (const [x, y] of found.duplicates.slice(0, 20)) { const a = byId.get(x), b = byId.get(y); if (a && b && a !== b && similarity(a.entry.text, b.entry.text) >= 0.3) await handleDuplicate(a, b, "意思相同"); }
          for (const conflict of found.conflicts.slice(0, 20)) { const a = byId.get(conflict.a), b = byId.get(conflict.b); if (a && b && a !== b) raise(a, b, "conflict", conflict.why.slice(0, 200) || "两条说法相反"); }
          this.ports.ledger.markMigration(caller.actor_id, tidyKey, { fingerprint: located.filter(one => !mergedAway.has(one.entry.memory_id)).map(one => `${one.entry.memory_id}:${one.entry.version}:${one.meta.state}`).sort().join("|") }, at);
        }
      }
      // Automatic ones not used for 90 days are switched off (after merging, so a merged one counts its provenances once).
      for (const one of located.filter(item => !mergedAway.has(item.entry.memory_id) && item.meta.state === "active" && item.meta.source === "auto")) {
        const used = this.ports.ledger.lastUse(one.entry.memory_id)?.at ?? one.meta.created_at;
        if (now.getTime() - Date.parse(used) > 90 * day) { await turnOff(one, "disabled", "90 天没有用到", "auto_disabled", { action: "enable" }); report.unused += 1; }
      }
    }
    this.ports.ledger.markMigration(caller.actor_id, "upkeep", report, at);
    return report;
  }

  /** When upkeep last ran, and what it did. */
  lastUpkeep(actorId: string): MemoryUpkeepReport | null {
    return (this.ports.ledger.migration(actorId, "upkeep")?.body as MemoryUpkeepReport | undefined) ?? null;
  }

  /** Pairs waiting for the person in the caller's scopes: both still there and in effect. */
  async pairs(caller: MemoryCaller, filter: { scope?: MemoryScope | "all" } = {}): Promise<MemoryPair[]> {
    const owners = new Set(this.scopesFor(caller, filter.scope && filter.scope !== "all" ? [filter.scope] : undefined, true).map(where => `${where.scope}:${where.owner}`));
    const out: MemoryPair[] = [];
    for (const pair of this.ports.ledger.pairs(caller.actor_id)) {
      if (pair.state !== "pending" || !owners.has(`${pair.scope}:${pair.owner}`)) continue;
      const live = new Map((await this.located({ ...caller, project_id: pair.project_id ?? caller.project_id }, pair.scope, pair.owner)).map(one => [one.entry.memory_id, one]));
      const a = live.get(pair.a.memory_id), b = live.get(pair.b.memory_id);
      if (!a || !b || a.meta.state !== "active" || b.meta.state !== "active") { this.ports.ledger.savePair(caller.actor_id, { ...pair, state: "resolved" }); continue; }
      const { owner: _owner, state: _state, ...view } = pair;
      out.push({ ...view, a: { ...pair.a, text: a.entry.text }, b: { ...pair.b, text: b.entry.text } });
    }
    return out;
  }

  /** The person keeps one (the other is switched off, recoverable) or both (the pair is not raised again). */
  async resolvePair(caller: MemoryCaller, pairId: string, keep: "a" | "b" | "both"): Promise<{ resolved: boolean }> {
    this.personOnly(caller, "只有本人能决定保留哪条");
    const pair = this.ports.ledger.pairs(caller.actor_id).find(item => item.pair_id === pairId);
    if (!pair) throw new MemoryError("memory.not_found", "没有这一对");
    if (pair.state !== "pending") return { resolved: true };
    const holder: MemoryCaller = { ...caller, project_id: pair.project_id ?? caller.project_id };
    if (keep !== "both") {
      const other = keep === "a" ? pair.b : pair.a;
      await this.change(holder, { memory_id: other.memory_id, action: "disable" }).catch(error => { if (!(error instanceof MemoryError && error.code === "memory.not_found")) throw error; });
    }
    this.ports.ledger.savePair(caller.actor_id, { ...pair, state: "resolved" });
    return { resolved: true };
  }

  /* ---- clearing, export and import (spec §6, §8.1, §10.1 数据) ---- */

  /** Clearing a scope, step one: how many would go, and the fingerprint the confirmation must bring back. */
  async previewScope(caller: MemoryCaller, scope: MemoryScope): Promise<{ scope: MemoryScope; project_id: string | null; count: number; fingerprint: string }> {
    this.personOnly(caller, "只有本人能清空记忆");
    const where = this.where(caller, scope);
    const parts = await this.clearPreviews(caller, scope);
    return { scope, project_id: scope === "project" ? where.owner : null, count: parts.reduce((sum, part) => sum + part.count, 0), fingerprint: joinedFingerprint(parts) };
  }

  /**
   * Step two: exactly what was previewed goes — anything written since makes Prologue refuse and nothing is removed.
   * Everything the ledger knew about them goes too. A project's page holds its Characters' memories, so clearing the
   * project clears those as well (each Prologue scope checked against its own preview).
   */
  async clearScope(caller: MemoryCaller, scope: MemoryScope, fingerprint: string): Promise<{ removed: number }> {
    this.personOnly(caller, "只有本人能清空记忆");
    const where = this.where(caller, scope);
    const parts = await this.clearPreviews(caller, scope);
    const changed = () => new MemoryError("memory.conflict", "预览之后又有记忆变动，没有删除任何一条；请重新预览后再确认");
    if (joinedFingerprint(parts) !== fingerprint) throw changed();
    const removed: string[] = [];
    for (const part of parts) {
      try { removed.push(...await this.ports.backend.clearScope!({ scope: part.scope, owner: part.owner, fingerprint: part.fingerprint })); }
      catch (error) {
        if (String((error as { code?: string }).code ?? (error as Error).message).includes("MEMORY_SCOPE_CHANGED")) { if (!removed.length) throw changed(); break; }
        throw error;
      }
    }
    for (const id of removed) this.ports.ledger.forget(id);
    this.recordChange(caller, { kind: "cleared", scope, owner: where.owner, memory_id: null, text: "", by: "person", rule: null, reason: `清空了 ${removed.length} 条`, undo: null });
    return { removed: removed.length };
  }

  private async clearPreviews(caller: MemoryCaller, scope: MemoryScope): Promise<Array<{ scope: MemoryScope; owner: string; count: number; fingerprint: string }>> {
    if (!this.ports.backend.previewScope || !this.ports.backend.clearScope) throw new MemoryError("memory.off", "当前运行时的记忆不支持按范围清空");
    const where = this.where(caller, scope);
    const targets = [{ scope, owner: where.owner }, ...(scope === "project"
      ? this.ports.ledger.owners(where.owner).filter(owner => owner.scope === "character").map(owner => ({ scope: "character" as const, owner: owner.owner })) : [])];
    const parts = [];
    for (const target of targets) parts.push({ ...target, ...await this.ports.backend.previewScope(target.scope, target.owner) });
    return parts;
  }

  /**
   * One scope's memories as a versioned package: text and provenance with credentials and absolute paths taken out
   * (Prologue's `redactText`), the facts that make them usable elsewhere, and what was taken out by kind and count.
   * The person's quoted words (evidence) stay behind.
   */
  async exportScope(caller: MemoryCaller, scope: MemoryScope): Promise<MemoryExportPackage> {
    this.personOnly(caller, "只有本人能导出记忆");
    const where = this.where(caller, scope);
    const redactions = new Map<string, number>();
    const clean = async (text: string) => {
      const redacted = (await this.ports.backend.screen?.(text).catch(() => null))?.redacted ?? text;
      for (const [kind, token] of [["credential", "[redacted]"], ["absolute-path", "[path]"]] as const) {
        const hits = redacted.split(token).length - 1 - (text.split(token).length - 1);
        if (hits > 0) redactions.set(kind, (redactions.get(kind) ?? 0) + hits);
      }
      return redacted;
    };
    const entries: MemoryExportPackage["entries"] = [];
    for (const located of await this.located(caller, scope, where.owner)) {
      entries.push({ text: await clean(located.entry.text), kind: located.meta.kind, source: located.meta.source, basis: located.meta.basis, applies: located.meta.applies,
        origin: await clean(located.entry.origin), expires_at: located.meta.expires_at });
    }
    return { format: "molis.memory", version: 1, exported_at: this.now().toISOString(), scope, entries, redactions: [...redactions].map(([kind, count]) => ({ kind, count })) };
  }

  /**
   * Bring a package in. Unknown format or version, or any malformed entry, and nothing is written; the same text is
   * skipped (importing twice adds nothing); each entry goes through the gate; a failure half-way takes back this import.
   */
  async importScope(caller: MemoryCaller, scope: MemoryScope, pack: unknown): Promise<{ written: number; skipped: number; refused: number }> {
    this.personOnly(caller, "只有本人能导入记忆");
    const entries = readPackage(pack);
    const where = this.where(caller, scope);
    const written: string[] = [];
    let skipped = 0, refused = 0;
    try {
      for (const item of entries) {
        const origin = `${this.date()} · 导入 · 原出处：${item.origin.slice(0, 120)}`;
        const result = await this.commit(caller, { scope, text: item.text, kind: item.kind, applies: item.applies, expires_at: item.expires_at, source: "imported",
          basis: item.basis === "inferred" ? "inferred" : "explicit", evidence: [], approved_by: { by: "person" }, origin });
        if (result.outcome === "written" && result.memory) written.push(result.memory.memory_id);
        else if (result.outcome === "duplicate") skipped += 1;
        else refused += 1;
      }
    } catch (error) {
      for (const id of written) {
        await this.ports.backend.remove({ scope, owner: where.owner, memory_id: id }).catch(() => undefined);
        this.ports.ledger.forget(id);
      }
      throw error;
    }
    return { written: written.length, skipped, refused };
  }

  /* ---- the first version, folded in once ---- */

  /**
   * The Assistant's first-version switches, switched-off list and candidates (spec §2.1.1), moved here once per person.
   * Safe to repeat: a person already moved is left alone. Memory text stays where it is (Prologue Memory).
   */
  migrateLegacy(actorId: string, legacy: LegacyMemoryState): { migrated: boolean; prefs: boolean; disabled: number; candidates: number } {
    if (this.ports.ledger.migration(actorId, LEGACY_SOURCE)) return { migrated: false, prefs: false, disabled: 0, candidates: 0 };
    return this.ports.ledger.transaction(() => {
      const saved = legacy.prefs;
      if (saved) {
        const personal = completePrefs("personal", this.ports.ledger.prefs(actorId, PERSONAL_PREFS_KEY));
        const projects = completePrefs("project", this.ports.ledger.prefs(actorId, PROJECT_DEFAULT_PREFS_KEY));
        if (typeof saved.form === "boolean") { personal.form = saved.form; projects.form = saved.form; }
        if (typeof saved.use_personal === "boolean") personal.consumers.assistant = saved.use_personal;
        if (typeof saved.use_project === "boolean") projects.consumers.assistant = saved.use_project;
        if (typeof saved.learn_personal === "boolean") personal.learn_from_work = saved.learn_personal;
        if (typeof saved.learn_project === "boolean") projects.learn_from_work = saved.learn_project;
        this.ports.ledger.savePrefs(actorId, PERSONAL_PREFS_KEY, personal);
        this.ports.ledger.savePrefs(actorId, PROJECT_DEFAULT_PREFS_KEY, projects);
      }
      for (const old of legacy.candidates) {
        const owner = old.scope === "project" ? old.project_id ?? "" : actorId;
        if (!owner) continue;
        this.ports.ledger.saveCandidate({ candidate_id: old.candidate_id, actor_id: actorId, owner, scope: old.scope, project_id: old.scope === "project" ? owner : null,
          kind: old.scope === "project" ? "convention" : "preference", text: old.text, applies: old.applies ? { task: old.applies.slice(0, 200) } : {}, basis: "inferred",
          why: old.why, from: "work", work: { work_id: old.work_id, title: old.work_title }, hold_reason: null, supersedes: null, state: old.state,
          created_at: old.created_at, memory_id: old.memory_id ?? null });
      }
      const body = { disabled: [...new Set(legacy.disabled)], prefs: saved, candidates: legacy.candidates.length };
      this.ports.ledger.markMigration(actorId, LEGACY_SOURCE, body, this.now().toISOString());
      return { migrated: true, prefs: !!saved, disabled: body.disabled.length, candidates: legacy.candidates.length };
    });
  }

  /* ---- internals ---- */

  /** An automatic correction: the approver (the gate's policy) is recorded by Prologue's candidate box on the entry. */
  private async settleByPolicy(caller: MemoryCaller, input: { candidate_id?: string; kind: MemoryKind; source: MemorySource; policy: { policy: string; version: number } }, where: { scope: MemoryScope; owner: string },
    entry: MemoryBackendEntry, text: string, meta: MemoryMetaRecord): Promise<void> {
    const candidateId = input.candidate_id ?? (await this.ports.backend.candidates.propose({ scope: where.scope, owner: where.owner, text, origin: `${MEMORY_GATE_RULE} · 纠正`,
      tags: [input.source, input.kind], meta: toEntryMeta(meta) })).candidate_id;
    await this.ports.backend.candidates.settleInto({ scope: where.scope, owner: where.owner, candidate_id: candidateId, memory_id: entry.memory_id,
      by: { by: "policy", policy: input.policy.policy, version: input.policy.version } });
    if (input.candidate_id) this.markCandidateKept(caller.actor_id, input.candidate_id, entry.memory_id);
  }

  private markCandidateKept(actorId: string, candidateId: string, memoryId: string): void {
    const note = this.ports.ledger.candidates(actorId).find(item => item.candidate_id === candidateId);
    if (note) this.ports.ledger.saveCandidate({ ...note, state: "accepted", memory_id: memoryId });
  }

  private personOnly(caller: MemoryCaller, message: string): void {
    if (!caller.person) throw new MemoryError("memory.forbidden", message);
  }

  /** The Prologue owner of a scope for this caller: the person, or the caller's own project. */
  /** The Prologue owner of a scope for this caller, and the project whose switches govern it. */
  private where(caller: MemoryCaller, scope: MemoryScope): { scope: MemoryScope; owner: string; project: string | null } {
    if (scope === "personal") return { scope, owner: caller.actor_id, project: null };
    if (scope === "character") {
      if (!caller.character) throw new MemoryError("memory.scope", "这一轮不是由某个角色承担的，没有角色记忆");
      if (!caller.project_id) throw new MemoryError("memory.scope", "角色记忆属于某个项目里的角色；这里没有项目");
      return { scope, owner: characterOwner(caller.project_id, caller.character.id), project: caller.project_id };
    }
    if (scope !== "project") throw new MemoryError("memory.invalid", "记忆范围只能是个人、项目或角色");
    if (!caller.project_id) throw new MemoryError("memory.scope", "这是个人工作，没有项目；只能用个人记忆");
    return { scope, owner: caller.project_id, project: caller.project_id };
  }

  /** A scope's switches: the person's own, or the project's (a Character's memories follow its project's). */
  private prefsAt(actorId: string, where: { scope: MemoryScope; owner: string; project?: string | null }): MemoryPrefs {
    return where.scope === "personal" ? this.prefsFor(actorId, "personal", null) : this.prefsFor(actorId, "project", where.scope === "project" ? where.owner : where.project ?? null);
  }

  /** Personal always; the caller's project when it has one. A person's scopes for listings include the project too. */
  private scopesFor(caller: MemoryCaller, requested?: readonly MemoryScope[], lenient = false): Array<{ scope: MemoryScope; owner: string; project: string | null }> {
    const wanted = requested?.length ? requested : (["personal", "project", "character"] as MemoryScope[]);
    const out: Array<{ scope: MemoryScope; owner: string; project: string | null }> = [];
    for (const scope of new Set(wanted)) {
      if (scope === "project" && !caller.project_id) { if (lenient || !requested?.length) continue; throw new MemoryError("memory.scope", "这里没有项目，只能用个人记忆"); }
      if (scope === "character" && !caller.character) {
        // The person in a project's settings sees every Character's memories there; a work sees only its own Character's.
        if (caller.person && caller.project_id) { for (const owner of this.ports.ledger.owners(caller.project_id).filter(item => item.scope === "character")) out.push({ scope: "character", owner: owner.owner, project: caller.project_id }); continue; }
        if (lenient || !requested?.length) continue;
        throw new MemoryError("memory.scope", "这一轮不是由某个角色承担的，没有角色记忆");
      }
      out.push(this.where(caller, scope));
    }
    return out;
  }

  /** A plugin's own memories are read only by that plugin; everyone else's are shared. */
  private visibleTo(caller: MemoryCaller, meta: MemoryMetaRecord): boolean {
    return !meta.plugin_id || caller.person === true || (caller.consumer === "plugin" && caller.plugin_id === meta.plugin_id);
  }

  private expired(meta: MemoryMetaRecord, now: Date): boolean {
    return !!meta.expires_at && Date.parse(meta.expires_at) <= now.getTime();
  }

  private async located(caller: MemoryCaller, scope: MemoryScope, owner: string): Promise<Located[]> {
    const entries = await this.ports.backend.list(scope, owner);
    const project = scope === "project" ? owner : scope === "character" ? caller.project_id : null;
    return Promise.all(entries.map(async entry => ({ scope, owner, entry, project, meta: await this.metaFor(caller.actor_id, scope, owner, entry) })));
  }

  private async find(caller: MemoryCaller, memoryId: string): Promise<Located> {
    for (const where of this.scopesFor(caller, undefined, true)) {
      const found = (await this.located(caller, where.scope, where.owner)).find(located => located.entry.memory_id === memoryId);
      if (found && this.visibleTo(caller, found.meta)) return found;
    }
    throw new MemoryError("memory.not_found", "这条记忆不在这里（可能已删除，或属于别的项目）");
  }

  /**
   * An entry's facts, from the entry itself. One written before the facts moved onto entries gets them once: from the
   * Host ledger where this service kept them first (M1), or, for the first version's entries, from its tags and the
   * old switched-off list.
   */
  private async metaFor(actorId: string, scope: MemoryScope, owner: string, entry: MemoryBackendEntry): Promise<MemoryMetaRecord> {
    const own = fromEntryMeta({ memory_id: entry.memory_id, scope, owner, meta: entry.meta, ...(entry.paused ? { paused: entry.paused } : {}),
      created_at_ms: entry.created_at_ms, updated_at_ms: entry.updated_at_ms }, this.now());
    if (own) return own;
    let meta = this.ports.ledger.meta(entry.memory_id);
    const at = this.now().toISOString();
    if (!meta) {
      const legacy = this.ports.ledger.migration(actorId, LEGACY_SOURCE)?.body as { disabled?: string[] } | undefined;
      const disabled = !!legacy?.disabled?.includes(entry.memory_id);
      const source: MemorySource = entry.tags.includes("accepted-suggestion") ? "accepted" : (MEMORY_SOURCE_TAGS.find(tag => entry.tags.includes(tag)) ?? "said");
      const kind: MemoryKind = MEMORY_KINDS.find(tag => entry.tags.includes(tag)) ?? (scope === "project" ? "convention" : "preference");
      const said = /你说：“(.+)”$/.exec(entry.origin)?.[1];
      meta = { memory_id: entry.memory_id, scope, owner, kind, source, basis: source === "auto" ? "repeated" : "explicit",
        evidence: said ? [{ kind: "said", text: said, at }] : [], applies: {}, state: disabled ? "disabled" : "active", state_reason: disabled ? "你停用了" : null,
        expires_at: null, approved_by: { by: "person" }, plugin_id: null, created_at: at, updated_at: at };
    }
    await this.ports.backend.setMeta({ scope, owner, memory_id: entry.memory_id, meta: toEntryMeta(meta) });
    if (meta.state !== "active") await this.ports.backend.pause({ scope, owner, memory_id: entry.memory_id, reason: pauseReason(meta.state, meta.state_reason) });
    if (!this.ports.ledger.revisions(entry.memory_id).length) this.ports.ledger.addRevision(entry.memory_id, { version: entry.version, text: entry.text, kind: meta.kind, applies: meta.applies, change: "created", by: "person", at });
    return meta;
  }

  /** Keep changed facts on the entry: its metadata, and paused or not. */
  private async saveFacts(located: { scope: MemoryScope; owner: string; entry: MemoryBackendEntry }, meta: MemoryMetaRecord, before?: MemoryMetaRecord): Promise<void> {
    const where = { scope: located.scope, owner: located.owner, memory_id: located.entry.memory_id };
    await this.ports.backend.setMeta({ ...where, meta: toEntryMeta(meta) });
    const was = before?.state ?? (located.entry.paused ? "paused" : "active");
    if (meta.state === "active" && was !== "active") await this.ports.backend.resume(where);
    else if (meta.state !== "active" && (was !== meta.state || before?.state_reason !== meta.state_reason)) await this.ports.backend.pause({ ...where, reason: pauseReason(meta.state, meta.state_reason) });
  }

  /** History holds every version; an entry that predates the ledger gets its current version recorded before it changes. */
  private ensureRevision(located: Located, version: number): void {
    if (this.ports.ledger.revisions(located.entry.memory_id).some(one => one.version === version)) return;
    this.ports.ledger.addRevision(located.entry.memory_id, { version, text: located.entry.text, kind: located.meta.kind, applies: located.meta.applies, change: "created", by: "person", at: located.meta.created_at });
  }

  private async purge(located: Located): Promise<void> {
    await this.ports.backend.remove({ scope: located.scope, owner: located.owner, memory_id: located.entry.memory_id });
    // The candidate it came in through holds the same words: that goes too (spec §11: no path brings a deleted one back).
    for (const item of await this.ports.backend.candidates.list(located.scope, located.owner)) {
      if (item.memory_id === located.entry.memory_id) await this.ports.backend.candidates.purge({ scope: located.scope, owner: located.owner, candidate_id: item.candidate_id });
    }
    this.ports.ledger.forget(located.entry.memory_id);
  }

  private item(located: Located): MemoryItem {
    const meta = located.meta, use = this.ports.ledger.lastUse(located.entry.memory_id);
    const expired = meta.state === "active" && this.expired(meta, this.now());
    return { memory_id: located.entry.memory_id, version: located.entry.version, scope: located.scope,
      project_id: located.scope === "project" ? located.owner : located.scope === "character" ? located.project ?? null : null, character_id: located.scope === "character" ? characterOf(located.owner) : null,
      character_title: located.scope === "character" ? this.ports.ledger.owners(located.project ?? "").find(owner => owner.scope === "character" && owner.owner === located.owner)?.title ?? null : null,
      kind: meta.kind, text: located.entry.text, source: meta.source, basis: meta.basis, origin: located.entry.origin, evidence: meta.evidence, applies: meta.applies,
      state: expired ? "disabled" : meta.state, state_reason: expired ? `已于 ${meta.expires_at!.slice(0, 10)} 到期` : meta.state_reason, expires_at: meta.expires_at,
      approved_by: meta.approved_by, plugin_id: meta.plugin_id, created_at: meta.created_at, updated_at: meta.updated_at,
      last_used: use ? { at: use.at, consumer: use.consumer, title: use.title, ...(use.work_id ? { work_id: use.work_id } : {}) } : null };
  }

  private async ownCandidate(caller: MemoryCaller, candidateId: string): Promise<MemoryCandidateRecord> {
    const note = this.ports.ledger.candidates(caller.actor_id).find(item => item.candidate_id === candidateId);
    if (!note) throw new MemoryError("memory.not_found", "没有这条建议");
    const record = (await this.candidateRecords(caller.actor_id, note.scope, note.owner)).find(item => item.candidate_id === candidateId);
    if (!record) throw new MemoryError("memory.not_found", "没有这条建议");
    return record;
  }

  private recordChange(caller: MemoryCaller, input: { kind: MemoryChangeKind; scope: MemoryScope; owner: string; memory_id: string | null; text: string;
    by: MemoryChange["by"]; rule: string | null; reason: string | null; undo: MemoryUndoPlan | null }): MemoryChangeRecord {
    const record: MemoryChangeRecord = { change_id: `change-${this.newId()}`, actor_id: caller.actor_id, owner: input.owner, kind: input.kind, memory_id: input.memory_id,
      scope: input.scope, project_id: input.scope === "project" ? input.owner : null, text: input.text, by: input.by, rule: input.rule, reason: input.reason,
      work: caller.work ?? null, at: this.now().toISOString(), undoable: !!input.undo, state: "active", undo: input.undo };
    this.ports.ledger.saveChange(record);
    return record;
  }

  private useTitle(caller: MemoryCaller, usedFor?: string): string {
    const label = typeof usedFor === "string" ? usedFor.replace(/\s+/g, " ").trim().slice(0, 80) : "";
    if (caller.work) return `工作「${caller.work.title.slice(0, 40)}」`;
    if (label) return label;
    return caller.consumer === "plugin" && caller.plugin_id ? `插件 ${caller.plugin_id}` : CONSUMER_LABELS[caller.consumer];
  }

  private async projectTitle(projectId: string): Promise<string | null> {
    return this.ports.projectTitle ? await this.ports.projectTitle(projectId).catch(() => null) : null;
  }

  private date(): string {
    return new Intl.DateTimeFormat("zh-CN", { timeZone: this.ports.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone, dateStyle: "medium" }).format(this.now());
  }

  /** Provenance in words. A personal memory's names no work of a project, only the person's own words. */
  private async originFor(caller: MemoryCaller, scope: MemoryScope, source: MemorySource, input: { said?: string; why?: string }): Promise<string> {
    const date = this.date(), work = scope !== "personal" && caller.work ? `工作「${caller.work.title.slice(0, 40)}」· ` : "";
    switch (source) {
      case "said": return `${work}${date} · 你说：“${(input.said ?? "").slice(0, 120)}”`;
      case "manual": return `${date} · 你在设置里添加`;
      case "imported": return `${date} · 导入`;
      case "auto": return `${MEMORY_GATE_RULE} · ${work}${date} · 依据：${(input.why ?? "").slice(0, 120)}`;
      case "accepted": return `你认可的建议 · ${work}${date} · 依据：${(input.why ?? "").slice(0, 120)}`;
      case "plugin": return `插件「${caller.plugin_id ?? "?"}」记下 · ${date}`;
    }
  }
}

const MEMORY_SOURCE_TAGS: readonly MemorySource[] = ["said", "manual", "accepted", "imported", "auto"];

/** One fingerprint for what a clear will remove across its Prologue scopes (a single scope keeps Prologue's own). */
function joinedFingerprint(parts: ReadonlyArray<{ scope: MemoryScope; owner: string; count: number; fingerprint: string }>): string {
  const counted = parts.filter((part, index) => index === 0 || part.count > 0);
  return counted.length === 1 ? counted[0]!.fingerprint : counted.map(part => `${part.scope}:${part.owner}=${part.fingerprint}`).join("|");
}

/**
 * A Character's memories are kept per project (Prologue scope `character`, owner = project + Character): what it learned
 * in one project's work never reaches the same Character's work in another project (spec §5 isolation).
 */
export function characterOwner(projectId: string, characterId: string): string { return `${projectId}/${characterId}`; }
function characterOf(owner: string): string { const at = owner.indexOf("/"); return at < 0 ? owner : owner.slice(at + 1); }

/** Whether a memory applies in a situation: every limit it has must be met (spec §4.1 适用). */
export function applies(limit: MemoryApplies, situation: MemoryRecallRequest["situation"], now: Date): boolean {
  if (limit.from && Date.parse(limit.from) > now.getTime()) return false;
  if (limit.until && Date.parse(limit.until) < now.getTime()) return false;
  if (limit.plugin_ids?.length && !(situation?.plugin_id && limit.plugin_ids.includes(situation.plugin_id))) return false;
  if (limit.object_kinds?.length && !(situation?.object_kind && limit.object_kinds.includes(situation.object_kind))) return false;
  if (limit.goal_ids?.length && !(situation?.goal_id && limit.goal_ids.includes(situation.goal_id))) return false;
  return true;
}

function candidateView(record: MemoryCandidateRecord): MemoryCandidate {
  const { actor_id: _actor, owner: _owner, ...view } = record;
  return view;
}

function changeView(record: MemoryChangeRecord): MemoryChange {
  const { actor_id: _actor, owner: _owner, undo: _undo, ...view } = record;
  return view;
}

/** A package is read whole before anything is written: one malformed entry and the whole import is refused. */
function readPackage(pack: unknown): MemoryExportPackage["entries"] {
  const refuse = (why: string): never => { throw new MemoryError("memory.invalid", `记忆包无法导入：${why}；没有写入任何一条`); };
  if (!pack || typeof pack !== "object") refuse("不是记忆包");
  const value = pack as Partial<MemoryExportPackage>;
  if (value.format !== "molis.memory") refuse("格式不认识");
  if (value.version !== 1) refuse(`版本 ${String(value.version)} 不认识`);
  if (!Array.isArray(value.entries) || value.entries.length > 2000) refuse("条目缺失或太多");
  return value.entries!.map((item, index) => {
    const at = `第 ${index + 1} 条`;
    if (!item || typeof item !== "object") refuse(`${at}损坏`);
    if (typeof item.text !== "string" || !item.text.trim() || item.text.length > MAX_TEXT) refuse(`${at}的内容不合格`);
    if (!MEMORY_KINDS.includes(item.kind)) refuse(`${at}的类别不认识`);
    if (typeof item.origin !== "string") refuse(`${at}缺少出处`);
    if (item.applies !== undefined && (typeof item.applies !== "object" || item.applies === null || Array.isArray(item.applies))) refuse(`${at}的适用情境损坏`);
    if (item.expires_at !== null && item.expires_at !== undefined && (typeof item.expires_at !== "string" || !Number.isFinite(Date.parse(item.expires_at)))) refuse(`${at}的有效期损坏`);
    return { text: item.text.trim(), kind: item.kind, source: "imported", basis: item.basis === "inferred" ? "inferred" : "explicit", applies: item.applies ?? {}, origin: item.origin, expires_at: item.expires_at ?? null };
  });
}

function pairKey(a: string, b: string, kind: string): string {
  return [kind, ...[a, b].sort()].join("|");
}
