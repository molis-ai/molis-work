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
  type MemoryItem,
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
import { keywordScore, looksLikeInstruction, looksLikeSecret, recallKeywords, sameText } from "./text.js";
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
const MAX_TEXT = 400;
const LEGACY_SOURCE = "assistant-p8";
const EXPLICIT_SOURCES: readonly MemorySource[] = ["said", "manual", "accepted", "imported"];
const KIND_WEIGHT: Record<MemoryKind, number> = { preference: 1, convention: 1, experience: 0.85, fact: 0.75 };
const SOURCE_WEIGHT: Record<MemorySource, number> = { said: 1, manual: 1, accepted: 0.95, imported: 0.9, auto: 0.85 };
/** How much a memory counts even when no keyword of the request is in it: ways of working apply to most work. */
const STANDING: Record<MemoryKind, number> = { preference: 0.45, convention: 0.45, experience: 0.15, fact: 0.05 };

interface Located { scope: MemoryScope; owner: string; entry: MemoryBackendEntry; meta: MemoryMetaRecord }

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
        const access = consumerAccess(this.prefsFor(caller.actor_id, where.scope, where.scope === "project" ? where.owner : null), caller.consumer, caller.plugin_id);
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
      const access = consumerAccess(this.prefsFor(caller.actor_id, where.scope, where.scope === "project" ? where.owner : null), caller.consumer, caller.plugin_id);
      if (!access.allowed) { offScopes.push(where.scope === "personal" ? "个人记忆" : "项目记忆"); continue; }
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
  async forRun(caller: MemoryCaller, request: MemoryRecallRequest): Promise<{ pinned: Array<{ scope: "user" | "project"; owner: string; memory_id: string }>; budget_chars: number; receipt_id: string } | null> {
    const budget = request.budget_chars ?? 3000;
    const recalled = await this.recall(caller, { ...request, budget_chars: budget });
    if (recalled.state !== "ok" || !recalled.items.length) return null;
    return { pinned: recalled.items.map(item => ({ scope: item.scope === "personal" ? "user" as const : "project" as const,
      owner: item.scope === "personal" ? caller.actor_id : caller.project_id!, memory_id: item.memory_id })), budget_chars: budget, receipt_id: recalled.receipt_id };
  }

  /* ---- writing ---- */

  /**
   * The unified write entry (spec §6.2). An agent must bring the person's own words; the person in the settings adds
   * by hand. Everything passes the gate: switches, secrets, instruction-like text, scope, sameness and conflicts.
   */
  async write(caller: MemoryCaller, request: MemoryWriteRequest): Promise<MemoryWriteResult> {
    const said = typeof request.said === "string" ? request.said.trim() : "";
    if (!caller.person && !said) throw new MemoryError("memory.invalid", "记住一件事要附上用户的原话（said）；用户没有明确要求时，用建议（等用户认可）而不是直接记");
    return this.commit(caller, {
      scope: request.scope, text: request.text, kind: request.kind ?? (request.scope === "project" ? "convention" : "preference"), applies: request.applies ?? {}, expires_at: request.expires_at ?? null,
      source: caller.person ? "manual" : "said", basis: "explicit",
      evidence: said ? [{ kind: "said", text: said.slice(0, 200), at: this.now().toISOString() }] : [],
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
    const projectId = input.scope === "project" ? where.owner : null;
    const prefs = this.prefsFor(caller.actor_id, input.scope, projectId);
    const appliesText = memoryAppliesText(input.scope, input.applies, projectId ? await this.projectTitle(projectId) : null);
    const refused = (reason: string): MemoryWriteResult => ({ outcome: "refused", reason, applies_text: appliesText, memory: null, candidate: null, change_id: null });
    const text = input.text.trim();
    if (!text || text.length > MAX_TEXT) throw new MemoryError("memory.invalid", `记忆内容要在 1–${MAX_TEXT} 字之间`);
    if (!MEMORY_KINDS.includes(input.kind)) throw new MemoryError("memory.invalid", "记忆类别只能是偏好、约定、背景事实或经验");
    // 允许记住 off: nothing new is formed and no candidate is left. The person's own additions in the settings still count.
    if (!prefs.form && !caller.person) return refused("你关掉了“允许记住”，这条没有记住，也没有留作建议");
    if (looksLikeSecret(text) || (input.said && looksLikeSecret(input.said))) return refused("这段内容看起来含有密码、密钥或令牌，秘密不会进入长期记忆");
    if (caller.consumer === "plugin" && !caller.plugin_id) throw new MemoryError("memory.forbidden", "插件写记忆必须由宿主确认插件身份");
    const hold = caller.person ? null : looksLikeInstruction(text);
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
    const automatic = input.source === "auto";
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
      if (automatic) await this.settleByPolicy(caller, input, where, updated, text, meta);
      const change = this.recordChange(caller, { kind: automatic ? "auto_replaced" : "replaced", scope: input.scope, owner: where.owner, memory_id: updated.memory_id, text,
        by: automatic ? "policy" : "person", rule: automatic ? MEMORY_GATE_RULE : null, reason: input.why ? `依据：${input.why}` : null,
        undo: automatic ? { action: "restore", version: before } : null });
      return { outcome: "replaced", reason: "已替换旧的那条，旧版本保留在历史里", applies_text: appliesText,
        memory: this.item({ scope: input.scope, owner: where.owner, entry: updated, meta }), candidate: null, change_id: change.change_id };
    }
    const origin = input.origin ?? await this.originFor(caller, input.scope, input.source, { said: input.said, why: input.why });
    const facts = { kind: input.kind, source: input.source, basis: input.basis, evidence: input.evidence.slice(-6), applies: input.applies, expires_at: input.expires_at,
      approved_by: input.approved_by, plugin_id: caller.consumer === "plugin" ? caller.plugin_id ?? null : null };
    // The text and its facts go into Prologue in one write: there is never an entry without them. An automatic one goes
    // in only as a promotion by the gate's policy (Prologue records the approver): the model never approves itself.
    const entry = automatic
      ? await this.ports.backend.candidates.promote({ scope: input.scope, owner: where.owner, candidate_id: input.candidate_id ?? (await this.ports.backend.candidates.propose({
          scope: input.scope, owner: where.owner, text, origin, tags: [input.source, input.kind], meta: toEntryMeta(facts) })).candidate_id,
        policy: MEMORY_GATE_POLICY, version: MEMORY_GATE_VERSION, origin, meta: toEntryMeta(facts) })
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
      rule: automatic ? MEMORY_GATE_RULE : null, reason: input.why ? `依据：${input.why}` : input.said ? `你说：“${input.said.slice(0, 80)}”` : null,
      undo: automatic ? { action: "remove" } : null });
    return { outcome: "written", reason: automatic ? `自动记住（${MEMORY_GATE_RULE}），可以撤销` : "已记住", applies_text: appliesText,
      memory: this.item({ scope: input.scope, owner: where.owner, entry, meta }), candidate: null, change_id: change.change_id };
  }

  /** Change, switch off, restore, move or delete one memory (spec §6.5). */
  async change(caller: MemoryCaller, request: MemoryChangeRequest): Promise<MemoryChangeResult> {
    const located = await this.find(caller, String(request.memory_id ?? ""));
    const { scope, owner } = located;
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
        return { memory: this.item({ scope, owner, entry, meta }), change: changeView(change) };
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
        return { memory: this.item({ scope, owner, entry, meta }), change: changeView(change) };
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
    if (anywhere) for (const note of this.ports.ledger.candidates(caller.actor_id)) owners.set(`${note.scope}:${note.owner}`, { scope: note.scope, owner: note.owner });
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
    const prefs = this.prefsFor(caller.actor_id, input.scope, input.scope === "project" ? where.owner : null);
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
    if (earlier.some(item => item.state !== "expired" && sameText(item.text, text)))
      throw new MemoryError("memory.invalid", "这条已经建议过了（用户认可、拒绝或还在等），不要再提");
    if ((await this.located(caller, input.scope, where.owner)).some(located => sameText(located.entry.text, text))) throw new MemoryError("memory.invalid", "已经记着这一条了");
    const work = caller.work ?? null;
    if (work && earlier.filter(item => item.work?.work_id === work.work_id && item.state === "pending").length >= PENDING_PER_WORK)
      throw new MemoryError("memory.limit", `这项工作已有 ${PENDING_PER_WORK} 条建议在等用户，先不要再提`);
    const at = this.now().toISOString();
    const evidence = input.evidence ?? [{ kind: "work" as const, text: input.why.trim().slice(0, 200), ...(work ? { ref: { kind: "work", id: work.work_id } } : {}), at }];
    const facts = { kind: input.kind, source: "accepted" as MemorySource, basis: input.basis, evidence, applies: input.applies ?? {}, expires_at: null, approved_by: { by: "person" } as MemoryApproval,
      plugin_id: caller.consumer === "plugin" ? caller.plugin_id ?? null : null };
    const held = await this.ports.backend.candidates.propose({ scope: input.scope, owner: where.owner, text, origin: `建议 · ${input.from}`, tags: [input.from, input.kind], meta: toEntryMeta(facts) });
    const record: MemoryCandidateRecord = { candidate_id: held.candidate_id, actor_id: caller.actor_id, owner: where.owner, scope: input.scope,
      project_id: input.scope === "project" ? where.owner : null, kind: input.kind, text, applies: input.applies ?? {}, basis: input.basis, why: input.why.trim().slice(0, 300),
      from: input.from, work, hold_reason: input.hold_reason ?? null, supersedes: input.supersedes ?? null, state: "pending", created_at: at, memory_id: null };
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
    if (!record.undoable || !record.undo || !record.memory_id) throw new MemoryError("memory.invalid", "这次变动不能撤销");
    const holder: MemoryCaller = { ...caller, project_id: record.scope === "project" ? record.owner : caller.project_id };
    const located = await this.find(holder, record.memory_id).catch(() => null);
    const plan: MemoryUndoPlan = record.undo;
    if (located) {
      if (plan.action === "remove") await this.purge(located);
      else if (plan.action === "restore") await this.change({ ...holder, person: true }, { memory_id: record.memory_id, action: "restore", version: plan.version });
      else await this.change({ ...holder, person: true }, { memory_id: record.memory_id, action: plan.action });
    }
    const undone: MemoryChangeRecord = { ...(this.ports.ledger.change(changeId) ?? record), state: "undone", undoable: false, ...(plan.action === "remove" ? { text: "" } : {}) };
    this.ports.ledger.saveChange(undone);
    return { change: changeView(undone) };
  }

  /* ---- interface signals ---- */

  /** Count one interface event (spec §6.1 item 3). A single event never forms a memory; enough of them only suggest one. */
  async signal(caller: MemoryCaller, report: MemorySignalReport): Promise<MemorySignalResult> {
    const scope = report.scope ?? "personal";
    const where = this.where(caller, scope);
    const prefs = this.prefsFor(caller.actor_id, scope, scope === "project" ? where.owner : null);
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
  private async settleByPolicy(caller: MemoryCaller, input: { candidate_id?: string; kind: MemoryKind; source: MemorySource }, where: { scope: MemoryScope; owner: string },
    entry: MemoryBackendEntry, text: string, meta: MemoryMetaRecord): Promise<void> {
    const candidateId = input.candidate_id ?? (await this.ports.backend.candidates.propose({ scope: where.scope, owner: where.owner, text, origin: `${MEMORY_GATE_RULE} · 纠正`,
      tags: [input.source, input.kind], meta: toEntryMeta(meta) })).candidate_id;
    await this.ports.backend.candidates.settleInto({ scope: where.scope, owner: where.owner, candidate_id: candidateId, memory_id: entry.memory_id,
      by: { by: "policy", policy: MEMORY_GATE_POLICY, version: MEMORY_GATE_VERSION } });
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
  private where(caller: MemoryCaller, scope: MemoryScope): { scope: MemoryScope; owner: string } {
    if (scope === "personal") return { scope, owner: caller.actor_id };
    if (scope !== "project") throw new MemoryError("memory.invalid", "记忆范围只能是个人或项目");
    if (!caller.project_id) throw new MemoryError("memory.scope", "这是个人工作，没有项目；只能用个人记忆");
    return { scope, owner: caller.project_id };
  }

  /** Personal always; the caller's project when it has one. A person's scopes for listings include the project too. */
  private scopesFor(caller: MemoryCaller, requested?: readonly MemoryScope[], lenient = false): Array<{ scope: MemoryScope; owner: string }> {
    const wanted = requested?.length ? requested : (["personal", "project"] as MemoryScope[]);
    const out: Array<{ scope: MemoryScope; owner: string }> = [];
    for (const scope of new Set(wanted)) {
      if (scope === "project" && !caller.project_id) { if (lenient || !requested?.length) continue; throw new MemoryError("memory.scope", "这里没有项目，只能用个人记忆"); }
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
    return Promise.all(entries.map(async entry => ({ scope, owner, entry, meta: await this.metaFor(caller.actor_id, scope, owner, entry) })));
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
    this.ports.ledger.forget(located.entry.memory_id);
  }

  private item(located: Located): MemoryItem {
    const meta = located.meta, use = this.ports.ledger.lastUse(located.entry.memory_id);
    const expired = meta.state === "active" && this.expired(meta, this.now());
    return { memory_id: located.entry.memory_id, version: located.entry.version, scope: located.scope, project_id: located.scope === "project" ? located.owner : null,
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
    const date = this.date(), work = scope === "project" && caller.work ? `工作「${caller.work.title.slice(0, 40)}」· ` : "";
    switch (source) {
      case "said": return `${work}${date} · 你说：“${(input.said ?? "").slice(0, 120)}”`;
      case "manual": return `${date} · 你在设置里添加`;
      case "imported": return `${date} · 导入`;
      case "auto": return `${MEMORY_GATE_RULE} · ${work}${date} · 依据：${(input.why ?? "").slice(0, 120)}`;
      case "accepted": return `你认可的建议 · ${work}${date} · 依据：${(input.why ?? "").slice(0, 120)}`;
    }
  }
}

const MEMORY_SOURCE_TAGS: readonly MemorySource[] = ["said", "manual", "accepted", "imported", "auto"];

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
