import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
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
  type MemoryPair,
  type MemoryUpkeepReport,
  type MemoryKind,
  type MemoryLedgerPort,
  type MemoryListRequest,
  type MemoryListResponse,
  type MemoryMetaRecord,
  type MemoryPrefs,
  type MemoryPrefsView,
  type MemoryPreset,
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
import { consumerAccess, CONSUMER_LABELS } from "./prefs.js";
import { MemoryPreferences } from "./preferences.js";
import { MemoryOperations } from "./operations.js";
import { automaticMemoryHold, MEMORY_GATE_POLICY, MEMORY_GATE_VERSION, MEMORY_GATE_RULE } from "./policy.js";
import { memoryErrors } from "./errors.js";
import { applies, disownAutomatic, isExpired, personOnly, placeOf, visibleTo } from "./places.js";
import { MAX_TEXT, candidateView, changeView, revisionView, pairKey, useTitle } from "./shapes.js";
import { UNCHECKED, UNSAID, quotedFrom, theirWords } from "./spoken.js";
import { keywordScore, looksLikeInstruction, looksLikeSecret, recallKeywords, sameText, sameWords, similarity } from "./text.js";
import { fromEntryMeta, toEntryMeta } from "./facts.js";
import { newMemoryClassification } from "./classification.js";
import { MemoryScopeCommands, type Located } from "./scope-commands.js";
import type { AgentMemoryMeta, AgentRecalledMemory } from "@molis-ai/molis-work-contracts/services/agent-host";

export { applies, characterOwner } from "./places.js";

export type { MemoryBackendEntry, MemoryBackendPort, MemoryBackendCandidate, MemoryCandidatePort } from "./backend.js";
import type { MemoryBackendEntry, MemoryBackendPort, MemoryBackendCandidate } from "./backend.js";

/** Who is asking, from the trusted Host context. Never read from input. */
export interface MemoryCaller {
  actor_id: string;
  /** A trusted logical invocation; retries retain it, child operations use fixed suffixes. */
  operation_id?: string;
  signal?: AbortSignal;
  session_id?: string;
  current_scene?: string;
  purpose?: "management" | "task";
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
  /** A waiting suggestion the model thinks says the same thing: a pointer only; the gate ties by the words (the same text), never by this. */
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

export interface MemoryServicePorts {
  backend: MemoryBackendPort;
  ledger: MemoryLedgerPort;
  now?: () => Date;
  newId?: () => string;
  timeZone?: string;
  projectTitle?(projectId: string): Promise<string | null>;
}

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
const EXPLICIT_SOURCES: readonly MemorySource[] = ["said", "manual", "accepted", "imported"];
/** Written by a policy rather than by the person: what an automatic change may take back. */
const AUTOMATIC_SOURCES: readonly MemorySource[] = ["auto", "plugin"];
/** Two memories at least this alike (character pairs) may be about the same thing: upkeep's bar for putting the pair to the person. */
const RELATED_TEXT = 0.3;
const KIND_WEIGHT: Record<MemoryKind, number> = { preference: 1, convention: 1, experience: 0.85, fact: 0.75 };
const SOURCE_WEIGHT: Record<MemorySource, number> = { said: 1, manual: 1, accepted: 0.95, imported: 0.9, auto: 0.85, plugin: 0.8 };
/** How much a memory counts even when no keyword of the request is in it: ways of working apply to most work. */
const STANDING: Record<MemoryKind, number> = { preference: 0.45, convention: 0.45, experience: 0.15, fact: 0.05 };


export class MemoryService {
  private readonly now: () => Date;
  private readonly newId: () => string;
  private readonly preferences: MemoryPreferences;
  private readonly operations: MemoryOperations;
  private readonly scopeCommands: MemoryScopeCommands;

  constructor(private readonly ports: MemoryServicePorts) {
    this.preferences = new MemoryPreferences(ports.ledger);
    this.now = ports.now ?? (() => new Date());
    this.newId = ports.newId ?? (() => randomUUID());
    this.operations = new MemoryOperations(ports.ledger, this.newId, this.now);
    this.scopeCommands = new MemoryScopeCommands({ backend: ports.backend, ledger: ports.ledger, preferences: this.preferences, operations: this.operations,
      now: this.now, newId: this.newId, timeZone: ports.timeZone,
      importEntry: (caller, scope, item, origin) => this.commit(caller, { scope, text: item.text, kind: item.kind, applies: item.applies,
        expires_at: item.expires_at, source: "imported", basis: item.basis, evidence: [], approved_by: { by: "person" }, origin,
        retainedMeta: { classification: item.classification, session_ref: item.session_ref, namespace: item.namespace } }),
      recordClear: (caller, scope, owner, removed, complete) => { this.recordChange(caller, { kind: "cleared", scope, owner, memory_id: null,
        text: "", by: "person", rule: null, reason: `${complete ? "清空" : "部分清空"}了 ${removed} 条`, undo: null }); },
    });
  }

  /* ---- switches ---- */

  prefsFor(actorId: string, scope: MemoryScope, projectId: string | null): MemoryPrefs { return this.preferences.prefsFor(actorId, scope, projectId); }
  prefs(caller: MemoryCaller, scope?: MemoryScope): MemoryPrefsView { return this.preferences.prefs(caller, scope); }
  savePrefs(caller: MemoryCaller, scope: MemoryScope | undefined, input: Partial<MemoryPrefs> | MemoryPreset): MemoryPrefsView {
    return this.preferences.savePrefs(caller, scope, input);
  }
  assistantPrefs(actorId: string) { return this.preferences.assistantPrefs(actorId); }
  saveAssistantPrefs(actorId: string, input: Parameters<MemoryPreferences["saveAssistantPrefs"]>[1]) { return this.preferences.saveAssistantPrefs(actorId, input); }

  /* ---- reading ---- */

  async list(caller: MemoryCaller, request: MemoryListRequest = {}): Promise<MemoryListResponse> {
    const scopes = this.scopeCommands.scopesFor(caller, request.scope === "all" || !request.scope ? undefined : [request.scope]);
    const items: MemoryItem[] = [];
    let personal = 0, project = 0;
    for (const where of scopes) {
      if (!caller.person) {
        const access = consumerAccess(this.scopeCommands.prefsAt(caller.actor_id, where), caller.consumer, caller.plugin_id);
        if (!access.allowed) continue;
      }
      for (const located of await this.scopeCommands.located(caller, where.scope, where.owner)) {
        if (!visibleTo(caller, located.meta)) continue;
        if (where.scope === "personal") personal += 1; else project += 1;
        const item = this.scopeCommands.item(located);
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
    const located = await this.scopeCommands.find(caller, memoryId);
    return { memory_id: located.entry.memory_id, revisions: this.ports.ledger.revisions(located.entry.memory_id).map(revisionView) };
  }

  /**
   * Memories that bear on a situation, for one consumer (spec §7.1): active, not expired, applicable, allowed for this
   * consumer by the person's switches, ranked by keywords × kind × recency × source, within a limit and a budget.
   * Every returned and omitted memory is recorded against the receipt.
   */
  async recall(caller: MemoryCaller, request: MemoryRecallRequest = {}, options: { beforeEffect?: () => void | Promise<void>; readMode?: "explicit" | "task" } = {}): Promise<MemoryRecallResponse> {
    const receipt_id = `recall-${this.newId()}`;
    const limit = Math.max(1, Math.min(20, request.limit ?? 8)), budget = Math.max(100, Math.min(4000, request.budget_chars ?? 2000));
    const scopes = this.scopeCommands.scopesFor(caller, request.scopes);
    const keywords = recallKeywords([request.query ?? "", request.situation?.task ?? ""].join(" "));
    const now = this.now();
    const offScopes: string[] = [];
    const ranked: Array<{ located: Located; score: number }> = [];
    for (const where of scopes) {
      const access = consumerAccess(this.scopeCommands.prefsAt(caller.actor_id, where), caller.consumer, caller.plugin_id, options.readMode);
      if (!access.allowed) { offScopes.push(where.scope === "personal" ? "个人记忆" : where.scope === "character" ? "角色记忆" : "项目记忆"); continue; }
      for (const located of await this.scopeCommands.located(caller, where.scope, where.owner)) {
        const meta = located.meta;
        if (meta.state !== "active" || isExpired(meta, now) || !visibleTo(caller, meta)) continue;
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
    const title = useTitle(caller, request.used_for);
    const at = now.toISOString(), work_id = caller.work?.work_id ?? null;
    // The receipts are this call's only effect, and it waited for the store: a call stopped or revoked meanwhile records none.
    await options.beforeEffect?.();
    if (ranked.some(({ located }) => !consumerAccess(this.scopeCommands.prefsAt(caller.actor_id, located), caller.consumer, caller.plugin_id, options.readMode).allowed))
      throw memoryErrors.off("读取期间记忆开关已改变，请按当前设置重试");
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

  /** Build a trusted recipe without reading memory bodies or recording unconfirmed use. */
  async forRun(caller: MemoryCaller, request: MemoryRecallRequest, options: { skip?: boolean; budgetTokens?: number } = {}): Promise<(AgentRecalledMemory & {
    receipt_id: string; omitted: Array<{ memory_id: string; reason: "budget" | "limit" | "conflict" }>;
  }) | null> {
    const places = this.scopeCommands.scopesFor(caller, request.scopes);
    const automatic = !options.skip && places.some(where => consumerAccess(this.scopeCommands.prefsAt(caller.actor_id, where), caller.consumer, caller.plugin_id, "task").allowed);
    const plugin = caller.plugin_id ?? request.situation?.plugin_id;
    const facts = { ...(plugin ? { plugins: [plugin] } : {}),
      ...(request.situation?.object_kind ? { object_kinds: [request.situation.object_kind] } : {}),
      ...(request.situation?.goal_id ? { goals: [request.situation.goal_id] } : {}) };
    return { pinned: [], consumer: caller.consumer,
      current_scene: caller.current_scene ?? (caller.plugin_id === "io.molis.work.coding" ? "coding" : caller.consumer === "assistant" ? "assistant" : "common"),
      scopes: places.map(where => ({ scope: where.scope === "personal" ? "user" : where.scope, owner: where.owner })),
      task: automatic, skip: !automatic, budget_tokens: options.budgetTokens ?? 800,
      budget_chars: Math.max(100, Math.min(4000, request.budget_chars ?? 3000)),
      ...(Object.keys(facts).length ? { facts } : {}), receipt_id: `recall-${this.newId()}`, omitted: [] };
  }

  /* ---- writing ---- */

  /**
   * The unified write entry (spec §6.2). An agent must bring the person's own words; the person in the settings adds
   * by hand. Everything passes the gate: switches, secrets, instruction-like text, scope, sameness and conflicts.
   */
  async write(caller: MemoryCaller, request: MemoryWriteRequest, options: { /** The messages the person typed, as the Host saved them (possibly none): “they said it” holds only when the text is the whole of one of them. Without it nothing is theirs, whatever the agent's `said` is: it wrote that itself. Only the Host's own code passes it, never an action. */ originals?: readonly string[] } = {}): Promise<MemoryWriteResult> {
    caller = this.operations.caller(caller);
    const place = placeOf(caller, request.scope);
    const stamp = this.operations.begin(caller, "write", { kind: "write", scope: request.scope, owner: place.owner });
    const said = typeof request.said === "string" ? request.said.trim() : "";
    // A plugin keeps things in its own namespace under the grant the person gave it at install; nobody else reads them.
    if (caller.consumer === "plugin") {
      if (!caller.plugin_id) throw memoryErrors.forbidden("插件写记忆必须由宿主确认插件身份");
      const prefs = this.scopeCommands.prefsAt(caller.actor_id, placeOf(caller, request.scope));
      const rule = prefs.plugins[caller.plugin_id];
      if (!prefs.consumers.plugin || rule?.allowed === false) throw memoryErrors.forbidden("用户没有允许这个插件使用记忆");
      return this.commit(caller, { scope: request.scope, text: request.text, kind: request.kind ?? "preference", applies: request.applies ?? {}, expires_at: request.expires_at ?? null,
        classificationMeta: newMemoryClassification(caller, request.expires_at ?? null), source: "plugin", basis: "explicit", evidence: [], approved_by: { by: "policy", policy: `plugin:${caller.plugin_id}`, version: 1 } });
    }
    if (!caller.person && !said) throw memoryErrors.invalid("记住一件事要附上用户的原话（said）；用户没有明确要求时，用建议（等用户认可）而不是直接记");
    return this.commit(caller, {
      scope: request.scope, text: request.text, kind: request.kind ?? (request.scope === "project" ? "convention" : "preference"), applies: request.applies ?? {}, expires_at: request.expires_at ?? null,
      classificationMeta: newMemoryClassification(caller, request.expires_at ?? null),
      source: caller.person ? "manual" : "said", basis: "explicit",
      evidence: [...(said ? [{ kind: "said" as const, text: said.slice(0, 200), at: stamp.at }] : []),
        ...(request.rests_on ? [{ kind: "object" as const, ref: { kind: String(request.rests_on.kind).slice(0, 200), id: String(request.rests_on.id).slice(0, 200), project_id: request.scope === "project" ? caller.project_id : null },
          at: stamp.at }] : [])],
      approved_by: { by: "person" }, ...(request.replaces ? { replaces: request.replaces } : {}), said, ...(options.originals ? { originals: options.originals } : {}),
    });
  }

  /**
   * What the write gate decides for something drawn out of work (spec §6.2 table). Repeated explicit requests of
   * low-risk kinds are written automatically (undoable) when 自动记住 is on; everything else waits for the person.
   */
  async offer(caller: MemoryCaller, input: { scope: MemoryScope; text: string; kind: MemoryKind; applies?: MemoryApplies; basis: MemoryBasis; why: string;
    evidence?: MemoryEvidence[]; from: MemoryCandidate["from"]; supersedes?: string | null; candidate_id?: string }): Promise<MemoryWriteResult> {
    caller = this.operations.caller(caller);
    return this.commit(caller, { scope: input.scope, text: input.text, kind: input.kind, applies: input.applies ?? {}, expires_at: null, source: "auto", basis: input.basis,
      classificationMeta: newMemoryClassification(caller, null),
      evidence: input.evidence ?? [], approved_by: { by: "policy", policy: MEMORY_GATE_POLICY, version: MEMORY_GATE_VERSION }, why: input.why, from: input.from,
      ...(input.supersedes ? { replaces: input.supersedes } : {}), ...(input.candidate_id ? { candidate_id: input.candidate_id } : {}) });
  }

  private async commit(caller: MemoryCaller, input: {
    scope: MemoryScope; text: string; kind: MemoryKind; applies: MemoryApplies; expires_at: string | null; source: MemorySource; basis: MemoryBasis;
    evidence: MemoryEvidence[]; approved_by: MemoryApproval; replaces?: string; said?: string; /** The messages the person typed, as the Host saved them. */ originals?: readonly string[]; why?: string; from?: MemoryCandidate["from"]; origin?: string;
    /** The waiting candidate this settles (an automatic write of something already suggested once). */
    candidate_id?: string;
    /** Prepared only for new App inputs; old imports and undo reconstruction must not acquire a guessed class. */
    classificationMeta?: Pick<AgentMemoryMeta, "classification" | "session_ref">;
    /** Existing authorized snapshot or validated import fields, never new-input defaults. */
    retainedMeta?: AgentMemoryMeta;
  }): Promise<MemoryWriteResult> {
    caller = this.operations.caller(caller);
    const where = placeOf(caller, input.scope), projectId = where.project;
    const retrying = this.operations.find(caller, "commit") !== undefined;
    const commitMark = this.operations.begin(caller, "commit", { kind: "commit", scope: input.scope, owner: where.owner,
      ...(input.replaces ? { memory_id: input.replaces } : {}) });
    const at = commitMark.at;
    this.preferences.assertEnabled(caller.actor_id, where);
    let prefs = this.scopeCommands.prefsAt(caller.actor_id, where);
    const projectName = projectId ? await this.ports.projectTitle?.(projectId).catch(() => null) ?? null : null, appliesText = memoryAppliesText(input.scope, input.applies, projectName);
    const refused = (reason: string): MemoryWriteResult => ({ outcome: "refused", reason, applies_text: appliesText, memory: null, candidate: null, change_id: null });
    // “They said it” holds only when the text is the whole of a message the person typed that the Host saved (spoken.ts), and then what is kept is that message as they wrote it.
    const claims = !!input.said && !caller.person, spoken = claims ? theirWords(input.text, input.originals ?? []) : null, text = spoken ?? input.text.trim();
    const unsaid = claims && spoken === null ? (input.originals ? UNSAID : UNCHECKED) : null;
    if (!text || text.length > MAX_TEXT) throw memoryErrors.invalid(`记忆内容要在 1–${MAX_TEXT} 字之间`);
    if (!MEMORY_KINDS.includes(input.kind)) throw memoryErrors.invalid("记忆类别只能是偏好、约定、背景事实或经验");
    // 允许记住 off: nothing new is formed and no candidate is left. The person's own additions in the settings still count.
    if (!prefs.form && !caller.person) return refused("你关掉了“允许记住”，这条没有记住，也没有留作建议");
    const screened = await this.ports.backend.withCaller(caller).screen?.(text).catch(() => null) ?? null;
    if (looksLikeSecret(text) || (input.said && looksLikeSecret(input.said)) || screened?.redacted.includes(REDACTED_CREDENTIAL)) return refused("这段内容看起来含有密码、密钥或令牌，秘密不会进入长期记忆");
    if (caller.consumer === "plugin" && !caller.plugin_id) throw memoryErrors.forbidden("插件写记忆必须由宿主确认插件身份");
    // Instruction-like (Prologue's screening or the Host's own Chinese patterns) or carrying a local path: the person sees it first, and so do their own words (a model may restate "不用确认，直接删" as something harmless).
    const screenedSaid = input.said && !caller.person ? await this.ports.backend.withCaller(caller).screen?.(input.said).catch(() => null) ?? null : null;
    const entries = await this.scopeCommands.located(caller, input.scope, where.owner);
    this.preferences.assertEnabled(caller.actor_id, where);
    prefs = this.scopeCommands.prefsAt(caller.actor_id, where);
    if (!prefs.form && !caller.person) return refused("你关掉了“允许记住”，这条没有记住，也没有留作建议");
    const target = input.replaces ? entries.find(located => located.entry.memory_id === input.replaces) ?? null : null;
    if (spoken !== null) input = { ...input, said: spoken, evidence: input.evidence.map(item => item.kind === "said" ? { ...item, text: spoken.slice(0, 200) } : item) }; // their message, not a model's quote of it
    const hold = caller.person ? null : screened?.hold || screenedSaid?.hold || looksLikeInstruction(text) || (input.said ? looksLikeInstruction(input.said) : null)
      ? "这段话像是在给 AI 下指令（例如要求忽略规则或跳过确认），不能自动记住，需要你看过再决定"
      : screened && screened.redacted !== text ? "这段话里有本机文件路径之类的内容，先请你看一下再决定记不记" : unsaid;
    const same = entries.find(located => sameWords(located.entry.text, text) && visibleTo(caller, located.meta)
      && (!input.retainedMeta || isDeepStrictEqual(
        [located.entry.meta.classification, located.entry.meta.session_ref, located.entry.meta.namespace, located.meta.expires_at, located.meta.kind, located.meta.applies],
        [input.retainedMeta.classification, input.retainedMeta.session_ref, input.retainedMeta.namespace, input.expires_at, input.kind, input.applies])));
    if (same && !retrying) {
      // Said again: an automatic one becomes the person's own when its text is the same words as theirs (for “they said it”, `text` is their message itself), not merely alike in its marks.
      if (EXPLICIT_SOURCES.includes(input.source) && same.meta.source === "auto" && !unsaid) {
        await this.saveFacts(caller,same, { ...same.meta, source: input.source, basis: input.basis,
          approved_by: input.approved_by, evidence: [...same.meta.evidence, ...input.evidence].slice(-6), updated_at: this.now().toISOString() });
        disownAutomatic(this.ports.ledger, same.entry.memory_id);
      }
      return { outcome: "duplicate", reason: same.meta.state === "disabled" ? "已经记着这一条（目前停用）" : "已经记着这一条了", applies_text: appliesText,
        memory: this.scopeCommands.item(await this.scopeCommands.find(caller, same.entry.memory_id)), candidate: null, change_id: null };
    }
    if (input.replaces && !target) throw memoryErrors.not_found("要替换的那条记忆不在这个范围里（可能已删除，或属于别的范围）");
    const asCandidate = async (why: string, basis: MemoryBasis = input.basis): Promise<MemoryWriteResult> => {
      // Already waiting (suggested once before): it keeps waiting, now saying why it was not kept automatically.
      const waiting = input.candidate_id ? this.ports.ledger.candidates(caller.actor_id).find(item => item.candidate_id === input.candidate_id) : undefined;
      if (waiting) {
        const held: MemoryCandidateRecord = { ...waiting, hold_reason: why, ...(input.why ? { why: input.why.slice(0, 300) } : {}) };
        this.ports.ledger.saveCandidate(held);
        return { outcome: "candidate", reason: why, applies_text: appliesText, memory: null, candidate: candidateView(held), change_id: null };
      }
      const candidate = await this.propose(caller, { scope: input.scope, text, kind: input.kind, applies: input.applies, basis, why: input.why ?? why,
        from: input.from ?? "gate", hold_reason: why, supersedes: target?.entry.memory_id ?? null }, { gate: true, classificationMeta: target?.entry.meta ?? input.retainedMeta ?? input.classificationMeta ?? {},
        formal_expires_at: input.expires_at ?? target?.meta.expires_at ?? null });
      return { outcome: "candidate", reason: why, applies_text: appliesText, memory: null, candidate, change_id: null };
    };
    if (hold) return asCandidate(hold, hold === unsaid ? "inferred" : input.basis);
    if (target && input.basis === "inferred" && EXPLICIT_SOURCES.includes(target.meta.source)) return asCandidate("推断出来的内容不能覆盖你明确说过的，先请你看一下");
    if (input.source === "auto") {
      const reason = automaticMemoryHold(input.kind, input.basis, prefs.auto);
      if (reason) return asCandidate(reason);
    }
    // Approved by a policy rather than the person: the write gate's (automatic) or a plugin's install-time grant (its own namespace).
    const automatic = input.source === "auto" || input.source === "plugin";
    const policy = input.approved_by.by === "policy" ? input.approved_by : { by: "policy" as const, policy: MEMORY_GATE_POLICY, version: MEMORY_GATE_VERSION };
    const rule = input.source === "plugin" ? `插件「${caller.plugin_id ?? "?"}」记下` : MEMORY_GATE_RULE;
    if (where.scope === "character" && caller.character) this.ports.ledger.noteOwner({ scope: "character", owner: where.owner, project_id: where.project, title: caller.character.title, subject: caller.character.id });
    if (target) {
      const before = this.operations.formal(caller, target, "replace").expected_version;
      const meta: MemoryMetaRecord = { ...target.meta, kind: input.kind, applies: input.applies, source: input.source, basis: input.basis, approved_by: input.approved_by,
        evidence: [...new Map([...target.meta.evidence, ...input.evidence].map(item => [JSON.stringify(item), item])).values()].slice(-6), expires_at: input.expires_at ?? target.meta.expires_at, updated_at: at };
      const updated = automatic
        ? await this.settleByPolicy(caller, { ...input, policy }, where, target.entry, text, meta)
        : await this.ports.backend.withCaller(caller).update({ scope: input.scope, owner: where.owner, memory_id: target.entry.memory_id,
          ...this.operations.formal(caller, target, "replace"), change: { text, meta: toEntryMeta(meta, target.entry.meta) } });
      const change = this.ports.ledger.transaction(() => {
        this.operations.committed(caller, commitMark, { memory_id: updated.memory_id, version: updated.version });
        this.ports.ledger.addRevision(updated.memory_id, { version: updated.version, text: updated.text, kind: input.kind, applies: input.applies,
          snapshot: { origin: updated.origin, meta: updated.meta }, change: "replaced", by: automatic ? "policy" : "person", at });
        if (!automatic) disownAutomatic(this.ports.ledger, updated.memory_id);
        return this.recordChange(caller, { kind: automatic ? "auto_replaced" : "replaced", scope: input.scope, owner: where.owner, memory_id: updated.memory_id, text,
          applied_version: updated.version, by: automatic ? "policy" : "person", rule: automatic ? rule : null, reason: input.why ? `依据：${input.why}` : null,
          undo: automatic ? { action: "restore", version: before } : null });
      });
      return { outcome: "replaced", reason: "已替换旧的那条，旧版本保留在历史里", applies_text: appliesText,
        memory: this.scopeCommands.item({ scope: input.scope, owner: where.owner, project: where.project, entry: updated, meta }), candidate: null, change_id: change.change_id };
    }
    const origin = input.origin ?? await this.originFor(caller, input.scope, input.source, { said: input.said, why: input.why, at });
    const facts = { kind: input.kind, source: input.source, basis: input.basis, evidence: input.evidence.slice(-6), applies: input.applies, expires_at: input.expires_at,
      approved_by: input.approved_by, plugin_id: input.retainedMeta?.namespace ?? (caller.consumer === "plugin" ? caller.plugin_id ?? null : null) };
    // The text and its facts go into Prologue in one write: there is never an entry without them. An automatic one goes
    // in only as a promotion by the gate's policy (Prologue records the approver): the model never approves itself.
    const creation = this.operations.begin(caller, "append", { kind: "append", scope: input.scope, owner: where.owner });
    const candidate = automatic ? await this.policyCandidate(caller, input, where, text, origin, toEntryMeta(facts, input.retainedMeta ?? input.classificationMeta)) : undefined;
    const entry = candidate
      ? await this.ports.backend.withCaller(caller).candidates.promote({ scope: input.scope, owner: where.owner, candidate_id: candidate.candidate_id,
        ...this.operations.condition(caller, `promote:${candidate.candidate_id}`, { kind: "promote", scope: input.scope, owner: where.owner,
          candidate_id: candidate.candidate_id, expected_version: candidate.version }),
        policy: policy.policy, version: policy.version, origin, meta: toEntryMeta(facts, candidate.meta) })
      : await this.ports.backend.withCaller(caller).write({ scope: input.scope, owner: where.owner, text, origin, tags: [input.source, input.kind], meta: toEntryMeta(facts, input.retainedMeta ?? input.classificationMeta),
        operation_id: creation.operation_id, ...(caller.signal ? { signal: caller.signal } : {}) });
    if (entry.version !== 1 && !creation.result) throw memoryErrors.conflict("原创建已被后继版本覆盖，不能把当前正文当作初始历史；请核对原操作");
    const meta = fromEntryMeta({ ...entry, scope: input.scope, owner: where.owner }, this.now());
    if (!meta) throw memoryErrors.conflict("提交后的记忆事实不可确认，请使用原操作对账");
    const kind: MemoryChangeKind = automatic ? "auto_kept" : input.source === "accepted" ? "accepted" : input.source === "imported" ? "imported" : "kept";
    const change = this.ports.ledger.transaction(() => {
      this.operations.committed(caller, creation, { memory_id: entry.memory_id, version: creation.result?.version ?? entry.version });
      this.operations.committed(caller, commitMark, { memory_id: entry.memory_id, version: creation.result?.version ?? entry.version });
      if (entry.version === 1) this.ports.ledger.addRevision(entry.memory_id, { version: 1, text: entry.text, kind: input.kind, applies: input.applies,
        snapshot: { origin: entry.origin, meta: entry.meta }, change: "created", by: automatic ? "policy" : "person", at });
      if (automatic && input.candidate_id) this.markCandidateKept(caller.actor_id, input.candidate_id, entry.memory_id);
      return this.recordChange(caller, { kind, scope: input.scope, owner: where.owner, memory_id: entry.memory_id, text,
        applied_version: creation.result?.version ?? entry.version, by: automatic ? "policy" : "person", rule: automatic ? rule : null,
        reason: input.why ? `依据：${input.why}` : input.said ? `你说：“${input.said.slice(0, 80)}”` : null, undo: automatic ? { action: "remove" } : null });
    });
    return { outcome: "written", reason: automatic ? `${input.source === "plugin" ? rule : `自动记住（${rule}）`}，可以撤销` : "已记住", applies_text: appliesText,
      memory: this.scopeCommands.item({ scope: input.scope, owner: where.owner, project: where.project, entry, meta }), candidate: null, change_id: change.change_id };

  }

  /**
   * Change, switch off, restore, move or delete one memory (spec §6.5). The person does all of it; the Assistant only
   * switches one off on their request (its own change, which they can take back). `undoing` is undo's own: taking a
   * change back is not the person editing, so it leaves the automatic records alone.
   */
  async change(caller: MemoryCaller, request: MemoryChangeRequest, undoing = false): Promise<MemoryChangeResult> {
    caller = this.operations.caller(caller);
    if (!caller.person && request.action !== "disable") throw memoryErrors.forbidden("助理只能停用记忆；修改和彻底删除只有本人能在记忆设置里做");
    const located = await this.scopeCommands.find(caller, String(request.memory_id ?? "")).catch(async error => {
      const old = this.operations.find(caller, `purge:${request.memory_id}`);
      if (request.action !== "remove" || !old || (error as { code?: string }).code !== "memory.not_found") throw error;
      await this.ports.backend.withCaller(caller).remove({ scope: old.scope, owner: old.owner, memory_id: request.memory_id,
        expected_version: old.expected_version!, operation_id: old.operation_id, ...(caller.signal ? { signal: caller.signal } : {}) });
      this.ports.ledger.forget(request.memory_id);
      return undefined;
    });
    if (!located) {
      const old = this.operations.find(caller, `purge:${request.memory_id}`)!;
      const change = this.recordChange(caller, { kind: "removed", scope: old.scope, owner: old.owner, memory_id: request.memory_id,
        text: "", by: "person", rule: null, reason: null, undo: null });
      return { memory: null, change: changeView(change) };
    }
    if (request.expected_version !== undefined && request.expected_version !== located.entry.version && !this.operations.find(caller, `change:${located.entry.memory_id}`)) throw memoryErrors.conflict("记忆已变化，请重新查看后再决定");
    const { scope, owner, project } = located;
    if (request.action !== "remove") this.preferences.assertEnabled(caller.actor_id, located);
    const stamp = this.operations.begin(caller, `change:${request.memory_id}`, { kind: request.action, scope, owner, memory_id: located.entry.memory_id, expected_version: request.expected_version ?? located.entry.version, original_state: located.meta.state });
    if (request.expected_version !== undefined && request.expected_version !== stamp.expected_version) throw memoryErrors.conflict("重试不能改变原先确认的记忆版本");
    const at = stamp.at;
    const by = "person" as const;
    switch (request.action) {
      case "update": {
        let entry = located.entry;
        const text = typeof request.text === "string" ? request.text.trim() : null;
        if (text !== null && (!text || text.length > MAX_TEXT)) throw memoryErrors.invalid(`记忆内容要在 1–${MAX_TEXT} 字之间`);
        if (text && looksLikeSecret(text)) throw memoryErrors.invalid("这段内容看起来含有密码、密钥或令牌，秘密不会进入长期记忆");
        if (request.kind && !MEMORY_KINDS.includes(request.kind)) throw memoryErrors.invalid("记忆类别只能是偏好、约定、背景事实或经验");
        const meta: MemoryMetaRecord = { ...located.meta, ...(request.kind ? { kind: request.kind } : {}), ...(request.applies ? { applies: request.applies } : {}),
          ...(request.expires_at !== undefined ? { expires_at: request.expires_at } : {}), updated_at: at };
        entry = await this.ports.backend.withCaller(caller).update({ scope, owner, memory_id: entry.memory_id,
          ...this.operations.formal(caller, located, "update"), change: { text: text ?? entry.text, meta: toEntryMeta(meta, entry.meta) } });
        const mark = this.operations.find(caller, `update:${entry.memory_id}`)!;
        const change = this.ports.ledger.transaction(() => {
          this.operations.committed(caller, mark, { memory_id: entry.memory_id, version: entry.version });
          this.ports.ledger.addRevision(entry.memory_id, { version: entry.version, text: entry.text, kind: meta.kind, applies: meta.applies,
            snapshot: { origin: entry.origin, meta: entry.meta }, change: "edited", by, at });
          if (!undoing) disownAutomatic(this.ports.ledger, entry.memory_id);
          return this.recordChange(caller, { kind: "edited", scope, owner, memory_id: entry.memory_id, text: entry.text, by, rule: null, reason: null, undo: null });
        });
        return { memory: this.scopeCommands.item({ scope, owner, project, entry, meta: fromEntryMeta({ ...entry, scope, owner }, this.now())! }), change: changeView(change) };
      }
      case "disable": case "enable": {
        // Asked by the person through the Assistant: switched off in the Assistant's name, and the person can switch it back on.
        const assistant = !caller.person;
        const meta: MemoryMetaRecord = { ...located.meta, state: request.action === "disable" ? "disabled" : "active",
          state_reason: request.action === "disable" ? (assistant ? "助理按你的要求停用了" : "你停用了") : null, updated_at: at };
        const entry = await this.saveFacts(caller, located, meta, located.meta);
        const change = this.recordChange(caller, { kind: request.action === "disable" ? "disabled" : "enabled", scope, owner, memory_id: located.entry.memory_id, text: located.entry.text,
          applied_version: entry.version, by: assistant ? "assistant" : by, rule: null, reason: assistant ? "助理按你的要求停用，可以撤销" : null,
          undo: assistant && stamp.original_state === "active" ? { action: "enable" } : null });
        return { memory: this.scopeCommands.item({ ...located, entry, meta }), change: changeView(change) };
      }
      case "remove": {
        await this.purge(caller,located);
        const change = this.recordChange(caller, { kind: "removed", scope, owner, memory_id: located.entry.memory_id, text: "", by, rule: null, reason: null, undo: null });
        return { memory: null, change: changeView(change) };
      }
      case "restore": {
        const revision = this.ports.ledger.revisions(located.entry.memory_id).find(one => one.version === request.version);
        if (!revision) throw memoryErrors.not_found("没有这个历史版本");
        const meta: MemoryMetaRecord = { ...located.meta, kind: revision.kind, applies: revision.applies, updated_at: at };
        const entry = await this.ports.backend.withCaller(caller).update({ scope, owner, memory_id: located.entry.memory_id,
          ...this.operations.formal(caller, located, "restore"), change: { text: revision.text,
            ...(revision.snapshot ? { origin: revision.snapshot.origin } : {}), meta: revision.snapshot?.meta ?? toEntryMeta(meta, located.entry.meta) } });
        const mark = this.operations.find(caller, `restore:${entry.memory_id}`)!;
        const change = this.ports.ledger.transaction(() => {
          this.operations.committed(caller, mark, { memory_id: entry.memory_id, version: entry.version });
          this.ports.ledger.addRevision(entry.memory_id, { version: entry.version, text: entry.text, kind: revision.kind, applies: revision.applies,
            snapshot: { origin: entry.origin, meta: entry.meta }, change: "restored", by, at });
          if (!undoing) disownAutomatic(this.ports.ledger, entry.memory_id);
          return this.recordChange(caller, { kind: "restored", scope, owner, memory_id: entry.memory_id, text: entry.text, by, rule: null, reason: `回到第 ${revision.version} 版`, undo: null });
        });
        return { memory: this.scopeCommands.item({ scope, owner, project, entry, meta: fromEntryMeta({ ...entry, scope, owner }, this.now())! }), change: changeView(change) };
      }
      case "move": {
        const to = request.to;
        if (to !== "personal" && to !== "project") throw memoryErrors.invalid("只能改为个人记忆或项目记忆");
        if (to === scope) throw memoryErrors.invalid(to === "project" ? "它已经是项目记忆" : "它已经是个人记忆");
        const target = placeOf(caller, to);
        this.preferences.assertEnabled(caller.actor_id, target);
        const date = this.date(at);
        // A personal memory travels to every project: it keeps no project's objects or work names.
        const origin = to === "personal" ? `${date} · 由项目记忆改为个人记忆` : `${date} · 由个人记忆改为项目记忆`;
        const moved = { ...located.meta, evidence: to === "personal" ? located.meta.evidence.filter(item => item.kind === "said") : located.meta.evidence };
        const move = this.operations.begin(caller, "move-create", { kind: "append", scope: to, owner: target.owner });
        let entry = await this.ports.backend.withCaller(caller).write({ scope: to, owner: target.owner, text: located.entry.text, origin, tags: [located.meta.source, located.meta.kind],
          meta: toEntryMeta(moved, located.entry.meta), operation_id: move.operation_id, ...(caller.signal ? { signal: caller.signal } : {}) });
        const meta: MemoryMetaRecord = { ...moved, memory_id: entry.memory_id, scope: to, owner: target.owner, updated_at: at };
        // Switched off stays switched off where it moves to.
        if (meta.state !== "active") {
          const request = { scope: to, owner: target.owner, memory_id: entry.memory_id,
            ...this.operations.formal(caller, { scope: to, owner: target.owner, entry }, `move-${meta.state}`), reason: meta.state_reason ?? "保留原停用状态" };
          entry = meta.state === "disabled" ? await this.ports.backend.withCaller(caller).disable(request) : await this.ports.backend.withCaller(caller).pause(request);
        }
        this.ports.ledger.addRevision(entry.memory_id, { version: entry.version, text: entry.text, kind: meta.kind, applies: meta.applies,
          snapshot: { origin: entry.origin, meta: entry.meta }, change: "created", by, at });
        await this.purge(caller,located);
        const change = this.recordChange(caller, { kind: "moved", scope: to, owner: target.owner, memory_id: entry.memory_id, text: entry.text, by, rule: null,
          reason: to === "personal" ? "改为个人记忆" : "改为项目记忆", undo: null });
        return { memory: this.scopeCommands.item({ scope: to, owner: target.owner, entry, meta }), change: changeView(change) };
      }
      default: throw memoryErrors.invalid("不支持的操作");
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
    const owners = new Map(this.scopeCommands.scopesFor(caller, filter.scope && filter.scope !== "all" ? [filter.scope] : undefined, true).map(where => [`${where.scope}:${where.owner}`, where]));
    if (anywhere) for (const note of this.ports.ledger.candidates(caller.actor_id)) owners.set(`${note.scope}:${note.owner}`, { scope: note.scope, owner: note.owner, project: note.project_id });
    const out: MemoryCandidate[] = [];
    for (const where of owners.values()) {
      if (!caller.person && !consumerAccess(this.scopeCommands.prefsAt(caller.actor_id, where), caller.consumer, caller.plugin_id).allowed) continue;
      for (const record of await this.candidateRecords(caller, where.scope, where.owner)) {
        if (record.state !== "pending") continue;
        if (filter.work_id && record.work?.work_id !== filter.work_id) continue;
        if (Date.parse(record.created_at) < stale) { await this.settleCandidate(caller,record, "expired"); continue; }
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
    from: MemoryCandidate["from"]; hold_reason?: string | null; supersedes?: string | null; evidence?: MemoryEvidence[] }, options: { gate?: boolean; classificationMeta?: Pick<AgentMemoryMeta, "classification" | "session_ref" | "namespace">; formal_expires_at?: string | null } = {}): Promise<MemoryCandidate> {
    caller = this.operations.caller(caller);
    const where = placeOf(caller, input.scope);
    this.preferences.assertFormation(caller.actor_id, where, input.from, options.gate === true);
    const text = input.text.trim();
    if (!text || text.length > MAX_TEXT) throw memoryErrors.invalid(`记忆内容要在 1–${MAX_TEXT} 字之间`);
    if (looksLikeSecret(text)) throw memoryErrors.invalid("这段内容看起来含有密码、密钥或令牌，秘密不会进入长期记忆");
    const earlier = await this.candidateRecords(caller, input.scope, where.owner);
    const work = caller.work ?? null;
    // The same suggestion, or nearly the same one already waiting from this work (a reworded second try), is not taken twice.
    if (!this.operations.find(caller, "propose") && earlier.some(item => item.state !== "expired" && (sameText(item.text, text)
      || (item.state === "pending" && work !== null && item.work?.work_id === work.work_id && similarity(item.text, text) >= 0.6))))
      throw memoryErrors.invalid("这条已经建议过了（用户认可、拒绝或还在等），不要再提");
    if (!this.operations.find(caller, "propose") && (await this.scopeCommands.located(caller, input.scope, where.owner)).some(located => sameWords(located.entry.text, text))) throw memoryErrors.invalid("已经记着这一条了");
    if (!this.operations.find(caller, "propose") && work && earlier.filter(item => item.work?.work_id === work.work_id && item.state === "pending").length >= PENDING_PER_WORK)
      throw memoryErrors.limit(`这项工作已有 ${PENDING_PER_WORK} 条建议在等用户，先不要再提`);
    const target = input.supersedes ? (await this.scopeCommands.located(caller, input.scope, where.owner)).find(item => item.entry.memory_id === input.supersedes) : undefined;
    const formalExpiry = options.formal_expires_at === undefined ? target?.meta.expires_at ?? null : options.formal_expires_at;
    if (formalExpiry !== null && !Number.isFinite(Date.parse(formalExpiry))) throw memoryErrors.invalid("候选的正式期限不合格");
    const retained: AgentMemoryMeta = options.classificationMeta ?? target?.entry.meta ?? newMemoryClassification(caller, formalExpiry);
    const mark = this.operations.begin(caller, "propose", { kind: "propose", scope: input.scope, owner: where.owner, expected_version: 0,
      ...(input.supersedes ? { memory_id: input.supersedes } : {}), formal_expires_at: formalExpiry });
    const at = mark.at;
    const evidence = input.evidence ?? [{ kind: "work" as const, text: input.why.trim().slice(0, 200), ...(work ? { ref: { kind: "work", id: work.work_id } } : {}), at }];
    const facts = { kind: input.kind, source: "accepted" as MemorySource, basis: input.basis, evidence, applies: input.applies ?? {}, expires_at: null, approved_by: { by: "person" } as MemoryApproval,
      plugin_id: caller.consumer === "plugin" ? caller.plugin_id ?? null : null };
    this.preferences.assertFormation(caller.actor_id, where, input.from, options.gate === true);
    const classified = toEntryMeta({ ...facts, plugin_id: retained.namespace ?? facts.plugin_id }, retained);
    const held = await this.ports.backend.withCaller(caller).candidates.propose({ scope: input.scope, owner: where.owner, text, origin: `建议 · ${input.from}`, tags: [input.from, input.kind], meta: { ...classified, expires_at_ms: Math.min(formalExpiry ? Date.parse(formalExpiry) : Infinity, Date.parse(at) + CANDIDATE_TTL_MS) },
      expected_version: 0, operation_id: mark.operation_id, ...(caller.signal ? { signal: caller.signal } : {}) });
    const record: MemoryCandidateRecord = { candidate_id: held.candidate_id, version: held.version, actor_id: caller.actor_id, owner: where.owner, scope: input.scope,
      project_id: where.project, formal_expires_at: formalExpiry, kind: input.kind, text, applies: input.applies ?? {}, basis: input.basis, why: input.why.trim().slice(0, 300),
      // Instruction-like text says so however it came in, so the person sees why before accepting.
      from: input.from, work, hold_reason: input.hold_reason ?? looksLikeInstruction(text), supersedes: input.supersedes ?? null, state: held.state === "promoted" ? "accepted" : held.state, created_at: at, memory_id: held.memory_id ?? null };
    this.ports.ledger.transaction(() => { this.ports.ledger.saveCandidate(record); this.operations.committed(caller, mark, { candidate_id: held.candidate_id, version: held.version }); });
    return candidateView(record);
  }

  /**
   * The person keeps a suggestion (as it was, or reworded). It goes in through Prologue's candidate box with the person
   * as approver; one that corrects an existing memory updates that memory (its history keeps the old version).
   */
  async accept(caller: MemoryCaller, candidateId: string, input: { text?: string; expected_version?: number } = {}): Promise<{ candidate: MemoryCandidate; memory: MemoryItem | null }> {
    caller = this.operations.caller(caller);
    personOnly(caller, "只有本人能认可记忆建议");
    const record = await this.ownCandidate(caller, candidateId);
    this.preferences.assertEnabled(caller.actor_id, { ...record, project: record.project_id });
    if (record.state !== "pending" && !this.operations.find(caller, `accept:${candidateId}`)) throw memoryErrors.invalid(record.state === "accepted" ? "这条已经记住了" : "这条建议已经不在了");
    const text = typeof input.text === "string" && input.text.trim() ? input.text.trim() : record.text;
    if (text.length > MAX_TEXT) throw memoryErrors.invalid(`记忆内容要在 ${MAX_TEXT} 字以内`);
    if (looksLikeSecret(text)) throw memoryErrors.invalid("这段内容看起来含有密码、密钥或令牌，秘密不会进入长期记忆");
    const holder: MemoryCaller = { ...caller, project_id: record.project_id ?? caller.project_id, work: record.work };
    const original = this.operations.find(caller, `accept:${candidateId}`);
    const entries = await this.scopeCommands.located(holder, record.scope, record.owner);
    this.preferences.assertEnabled(caller.actor_id, { ...record, project: record.project_id });
    const target = original
      ? (original.memory_id ? entries.find(located => located.entry.memory_id === original.memory_id) : undefined)
      : (record.supersedes ? entries.find(located => located.entry.memory_id === record.supersedes) : undefined)
        ?? entries.find(located => sameWords(located.entry.text, text));
    if (original?.memory_id && !target) throw memoryErrors.conflict("原候选决定的目标已不可读，请核对原操作");
    const decision = this.operations.begin(caller, `accept:${candidateId}`, { kind: "accept", scope: record.scope, owner: record.owner,
      candidate_id: candidateId, ...(target ? { memory_id: target.entry.memory_id } : {}), expected_version: input.expected_version ?? record.version });
    if (input.expected_version !== undefined && input.expected_version !== decision.expected_version) throw memoryErrors.conflict("重试不能改变原候选版本");
    const date = this.date(decision.at);
    const origin = record.scope === "project" && record.work ? `你认可的建议 · 工作「${record.work.title.slice(0, 40)}」· ${date} · 依据：${record.why.slice(0, 120)}`
      : `你认可的建议 · ${date} · 依据：${record.why.slice(0, 120)}`;
    const at = decision.at;
    const candidate = (await this.ports.backend.withCaller(holder).candidates.list(record.scope, record.owner)).find(item => item.candidate_id === candidateId);
    if (!candidate) throw memoryErrors.conflict("候选原件已不可读，不能重建其分类或来源");
    if (!target && record.formal_expires_at === undefined) throw memoryErrors.invalid("这条建议未记录正式期限，请明确分类与期限后重新决定");
    const formalExpiry = record.formal_expires_at === undefined ? target?.meta.expires_at ?? null : record.formal_expires_at;
    const facts = { kind: record.kind, source: "accepted" as MemorySource, basis: record.basis,
      evidence: [{ kind: "work" as const, text: record.why.slice(0, 200), ...(record.work ? { ref: { kind: "work", id: record.work.work_id } } : {}), at }],
      applies: record.applies, expires_at: formalExpiry, approved_by: { by: "person" } as MemoryApproval, plugin_id: target?.meta.plugin_id ?? candidate.meta.namespace ?? null };
    let located: Located, change: MemoryChangeKind, revision: MemoryRevision;
    if (target) {
      const meta: MemoryMetaRecord = { ...target.meta, ...facts,
        evidence: [...new Map([...target.meta.evidence, ...facts.evidence].map(item => [JSON.stringify(item), item])).values()].slice(-6), updated_at: at };
      const targetCondition = this.operations.formal(caller, target, `accept-target:${candidateId}`);
      const entry = await this.ports.backend.withCaller(holder).candidates.settleInto({ scope: record.scope, owner: record.owner, candidate_id: candidateId,
        candidate_expected_version: decision.expected_version!, operation_id: decision.operation_id, ...(caller.signal ? { signal: caller.signal } : {}),
        target: { memory_id: target.entry.memory_id, expected_version: targetCondition.expected_version, change: { text, meta: toEntryMeta(meta, target.entry.meta) } }, by: { by: "person" } });
      revision = { version: entry.version, text: entry.text, kind: meta.kind, applies: meta.applies,
        snapshot: { origin: entry.origin, meta: entry.meta }, change: "replaced", by: "person", at };
      located = { scope: record.scope, owner: record.owner, entry, meta };
      change = "replaced";
    } else {
      const entry = await this.ports.backend.withCaller(holder).candidates.accept({ scope: record.scope, owner: record.owner, candidate_id: candidateId,
        expected_version: decision.expected_version!, operation_id: decision.operation_id, ...(caller.signal ? { signal: caller.signal } : {}), text, origin, meta: toEntryMeta(facts, candidate.meta) });
      if (entry.version !== 1) throw memoryErrors.conflict("候选接受后的正式记忆已有后继版本，不能把当前正文补作原接受历史");
      revision = { version: entry.version, text: entry.text, kind: record.kind, applies: record.applies,
        snapshot: { origin: entry.origin, meta: entry.meta }, change: "created", by: "person", at };
      located = { scope: record.scope, owner: record.owner, entry, meta: { memory_id: entry.memory_id, scope: record.scope, owner: record.owner, ...facts, state: "active", state_reason: null, created_at: at, updated_at: at } };
      change = "accepted";
    }
    const accepted = (await this.ports.backend.withCaller(holder).candidates.list(record.scope, record.owner)).find(item => item.candidate_id === candidateId);
    if (!accepted) throw memoryErrors.conflict("候选提交后的关联不可确认，请使用原操作对账");
    const kept: MemoryCandidateRecord = { ...record, version: accepted.version, text, state: "accepted", memory_id: located.entry.memory_id };
    this.ports.ledger.transaction(() => {
      this.operations.committed(caller, decision, { memory_id: located.entry.memory_id, candidate_id: candidateId, version: accepted.version });
      this.ports.ledger.addRevision(located.entry.memory_id, revision);
      if (change === "replaced") disownAutomatic(this.ports.ledger, located.entry.memory_id);
      this.recordChange(holder, { kind: change, scope: record.scope, owner: record.owner, memory_id: located.entry.memory_id, text: located.entry.text,
        applied_version: located.entry.version, by: "person", rule: null, reason: `依据：${record.why.slice(0, 120)}`, undo: null });
      this.ports.ledger.saveCandidate(kept);
    });
    return { candidate: candidateView(kept), memory: this.scopeCommands.item(located) };
  }

  async discard(caller: MemoryCaller, candidateId: string, expectedVersion?: number): Promise<{ candidate: MemoryCandidate }> {
    caller = this.operations.caller(caller);
    personOnly(caller, "只有本人能拒绝记忆建议");
    const record = await this.ownCandidate(caller, candidateId);
    if (record.state !== "pending" && !this.operations.find(caller, `discarded:${candidateId}`)) throw memoryErrors.invalid("这条建议已经不在了");
    const original = this.operations.find(caller, `discarded:${candidateId}`);
    if (expectedVersion !== undefined && expectedVersion !== (original?.expected_version ?? record.version)) throw memoryErrors.conflict("建议已变化，请重新查看后再决定");
    return { candidate: candidateView(await this.settleCandidate(caller,record, "discarded")) };
  }

  /** Join the ledger's notes with the current candidate owner; reading never repairs missing facts. */
  private async candidateRecords(caller: MemoryCaller, scope: MemoryScope, owner: string): Promise<MemoryCandidateRecord[]> {
    const held = new Map((await this.ports.backend.withCaller(caller).candidates.list(scope, owner)).map(item => [item.candidate_id, item]));
    const out: MemoryCandidateRecord[] = [];
    for (const note of this.ports.ledger.candidates(caller.actor_id).filter(item => item.scope === scope && item.owner === owner)) {
      const found = held.get(note.candidate_id);
      if (!found) throw memoryErrors.not_found("记忆建议的原记录不可读；请核对存储后继续");
      const state: MemoryCandidateRecord["state"] = found.state === "promoted" ? "accepted" : found.state;
      out.push({ ...note, version: found.version, state, memory_id: found.memory_id ?? note.memory_id });
    }
    return out;
  }

  private async settleCandidate(caller: MemoryCaller, record: MemoryCandidateRecord, state: "discarded" | "expired"): Promise<MemoryCandidateRecord> {
    caller = this.operations.caller(caller);
    const where = { scope: record.scope, owner: record.owner, candidate_id: record.candidate_id, ...this.operations.candidate(caller, record, state) };
    const settled = state === "discarded" ? await this.ports.backend.withCaller(caller).candidates.discard(where) : await this.ports.backend.withCaller(caller).candidates.expire(where);
    const next: MemoryCandidateRecord = { ...record, state, version: settled.version };
    this.ports.ledger.saveCandidate(next);
    return next;
  }

  /* ---- recent changes ---- */

  changes(caller: MemoryCaller, filter: { scope?: MemoryScope | "all"; work_id?: string; limit?: number } = {}): MemoryChange[] {
    const owners = new Set(this.scopeCommands.scopesFor(caller, filter.scope && filter.scope !== "all" ? [filter.scope] : undefined, true).map(where => `${where.scope}:${where.owner}`));
    return this.ports.ledger.changes(caller.actor_id, Math.max(1, Math.min(200, filter.limit ?? 50)) * (filter.work_id ? 4 : 1))
      .filter(change => owners.has(`${change.scope}:${change.owner}`) && (!filter.work_id || change.work?.work_id === filter.work_id))
      .slice(0, filter.limit ?? 50).map(changeView);
  }

  /**
   * Take an automatic change back: a written one is deleted, a replaced one goes back, a switched-off one comes back.
   * A written or replaced one is taken back only while the entry is still the gate's own: once the person has said,
   * accepted or edited it, undoing the automatic write would delete or overwrite their words.
   */
  async undo(caller: MemoryCaller, changeId: string): Promise<{ change: MemoryChange }> {
    caller = this.operations.caller(caller);
    personOnly(caller, "只有本人能撤销记忆变动");
    const record = this.ports.ledger.change(changeId);
    if (!record || record.actor_id !== caller.actor_id) throw memoryErrors.not_found("没有这次变动");
    if (record.state === "undone") return { change: changeView(record) };
    if (!record.undoable || !record.undo || (!record.memory_id && record.undo.action !== "recreate")) throw memoryErrors.invalid("这次变动不能撤销");
    const holder: MemoryCaller = { ...caller, project_id: record.scope === "project" ? record.owner : caller.project_id };
    const located = record.memory_id ? await this.scopeCommands.find(holder, record.memory_id).catch(error => {
      if ((error as { code?: string }).code !== "memory.not_found") throw error;
      return null;
    }) : null;
    const plan: MemoryUndoPlan = record.undo;
    if (plan.action === "enable" && (plan.clear_expiry || located?.meta.expires_at && Date.parse(located.meta.expires_at) <= this.now().getTime()))
      throw memoryErrors.invalid("记忆已到期，请先明确新的期限；撤销不会清除或延长原期限");
    const priorUndo = this.operations.find(holder, `undo:${changeId}`);
    if (located && record.applied_version !== undefined && located.entry.version !== record.applied_version && !priorUndo)
      throw memoryErrors.conflict("记忆在这次变动之后已有新版本，不能把旧撤销决定套到后来编辑上");
    const undoMark = located ? this.operations.begin(holder, `undo:${changeId}`, { kind: "undo", scope: located.scope, owner: located.owner,
      memory_id: located.entry.memory_id, expected_version: record.applied_version ?? located.entry.version }) : undefined;
    if (plan.action !== "remove") this.preferences.assertEnabled(caller.actor_id, { ...record, project: holder.project_id });
    if (located && (plan.action === "remove" || plan.action === "restore") && !AUTOMATIC_SOURCES.includes(located.meta.source)) {
      this.ports.ledger.saveChange({ ...record, undoable: false, undo: null });
      throw memoryErrors.invalid("这条现在是你自己的记忆（你说过、认可过或改过），不能再按自动记住撤销；要删除请到记忆设置里删");
    }
    if (plan.action === "recreate") {
      // Undoing a merge brings back the one merged away, as it was.
      if (!plan.snapshot?.meta.classification) throw memoryErrors.invalid("原变动缺少分类快照，请明确分类后恢复，不能推断旧记忆用途");
      await this.commit({ ...holder, person: true }, { scope: record.scope, text: plan.text, kind: plan.kind, applies: plan.applies,
        expires_at: plan.snapshot.meta.expires_at_ms === undefined ? null : new Date(plan.snapshot.meta.expires_at_ms).toISOString(),
        retainedMeta: plan.snapshot.meta, source: plan.source === "auto" ? "manual" : plan.source,
        basis: plan.basis, evidence: [], approved_by: { by: "person" }, origin: plan.snapshot.origin });
    } else if (located) {
      const memoryId = located.entry.memory_id;
      if (plan.action === "remove") await this.purge(caller,located);
      else if (plan.action === "restore") await this.change({ ...holder, person: true }, { memory_id: memoryId, action: "restore", version: plan.version, expected_version: undoMark!.expected_version }, true);
      else await this.change({ ...holder, person: true }, { memory_id: memoryId, action: plan.action, expected_version: undoMark!.expected_version }, true);
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
    const scopes = this.scopeCommands.scopesFor(caller, undefined, true);
    const allowed = scopes.some(where => { const prefs = this.scopeCommands.prefsAt(caller.actor_id, where); return prefs.enabled && prefs.form && prefs.learn_from_work; });
    return allowed && STANDING_WISH.test(latest);
  }

  /** What the drawing-out sees besides the person's words: memories already kept and suggestions waiting (so it can say "the same"). */
  async learningContext(caller: MemoryCaller): Promise<{ existing: Array<{ memory_id: string; scope: MemoryScope; kind: MemoryKind; text: string }>;
    pending: Array<{ candidate_id: string; scope: MemoryScope; kind: MemoryKind; text: string; work_title: string | null }> }> {
    const existing: Array<{ memory_id: string; scope: MemoryScope; kind: MemoryKind; text: string }> = [];
    for (const where of this.scopeCommands.scopesFor(caller, undefined, true)) {
      const prefs = this.scopeCommands.prefsAt(caller.actor_id, where);
      if (!prefs.enabled || !prefs.form || !prefs.learn_from_work) continue;
      for (const located of await this.scopeCommands.located(caller, where.scope, where.owner)) existing.push({ memory_id: located.entry.memory_id, scope: where.scope, kind: located.meta.kind, text: located.entry.text.slice(0, 200) });
    }
    const pending = (await this.candidates({ ...caller, person: true }, { scope: "all" })).filter(item => {
      const prefs = this.prefsFor(caller.actor_id, item.scope, item.project_id);
      return prefs.enabled && prefs.form && prefs.learn_from_work;
    }).map(item => ({ candidate_id: item.candidate_id, scope: item.scope, kind: item.kind,
      text: item.text.slice(0, 200), work_title: item.work?.title ?? null }));
    return { existing: existing.slice(-30), pending: pending.slice(-20) };
  }

  /**
   * The write gate over what a work's drawing-out proposed (spec §6.2). The model only proposes; this decides, the same
   * way every time: its quote must really be in what the person said this time, or it is only an inference; said in two
   * different works it counts as repeated and low-risk kinds are kept automatically (undoable); anything else waits.
   */
  async learnFromWork(caller: MemoryCaller, input: { said: readonly string[]; proposals: readonly MemoryProposal[] }): Promise<MemoryLearned[]> {
    caller = this.operations.caller(caller);
    const out: MemoryLearned[] = [];
    if (input.said.some(text => DO_NOT_REMEMBER.test(text))) return out;
    for (const [index, proposal] of input.proposals.slice(0, 3).entries()) {
      const child = { ...caller, operation_id: `${caller.operation_id}:proposal:${index}` };
      const text = String(proposal.text ?? "").trim();
      const skip = (reason: string) => { out.push({ text, outcome: "skipped", reason, candidate_id: null, memory_id: null }); };
      if (!text || text.length > MAX_TEXT || !MEMORY_KINDS.includes(proposal.kind)) { skip("提议不合形状"); continue; }
      const scope: MemoryScope = proposal.scope === "project" && caller.project_id ? "project" : "personal";
      const where = placeOf(caller, scope);
      const prefs = this.scopeCommands.prefsAt(caller.actor_id, where);
      if (!prefs.enabled || !prefs.form || !prefs.learn_from_work) { skip("这个范围没有允许从工作里学习"); continue; }
      // Only what is really in the person's own words counts as theirs; anything else is an inference.
      const quote = String(proposal.quote ?? "").trim().slice(0, 200);
      const verified = quotedFrom(quote, input.said);
      const basis: MemoryBasis = verified && proposal.basis === "explicit" ? "explicit" : "inferred";
      const applies: MemoryApplies = proposal.applies_when?.trim() ? { task: proposal.applies_when.trim().slice(0, 200) } : {};
      if ((await this.scopeCommands.located(caller, scope, where.owner)).some(located => sameWords(located.entry.text, text))) { skip("已经记着这一条了"); continue; }
      const work = caller.work ?? null;
      const records = await this.candidateRecords(caller, scope, where.owner);
      // The same wish, suggested before in another work from the person's own words, is now repeated. Tied by the same text alone:
      // same_as only points, and wishes that share wording ("…都用要点列表" / "…都用中文") differ; unsure, both wait for the person.
      const waitingElsewhere = (item: MemoryCandidateRecord) => item.state === "pending" && item.work?.work_id !== work?.work_id;
      const earlier = records.find(item => waitingElsewhere(item) && item.basis === "explicit" && item.from === "extraction" && sameText(item.text, text));
      const pointed = earlier ? undefined : records.find(item => waitingElsewhere(item) && item.candidate_id === proposal.same_as);
      if (records.some(item => item.state === "pending" && sameText(item.text, text) && item.work?.work_id === work?.work_id)) { skip("这项工作里已经提过"); continue; }
      const at = this.now().toISOString();
      const evidence: MemoryEvidence[] = verified ? [{ kind: "said", text: quote, ...(work ? { ref: { kind: "work", id: work.work_id } } : {}), at }] : [];
      const supersedes = proposal.supersedes && (await this.scopeCommands.located(caller, scope, where.owner)).some(located => located.entry.memory_id === proposal.supersedes) ? proposal.supersedes : null;
      // A personal memory travels to every project, so what explains it never names a project's works (spec §11).
      const named = scope !== "personal";
      if (earlier && basis === "explicit") {
        const works = [earlier.work?.title, work?.title].filter(Boolean).map(title => `「${title}」`).join("和");
        const result = await this.offer({ ...child, work }, { scope, text: earlier.text, kind: earlier.kind, applies: earlier.applies, basis: "repeated",
          why: named ? `你在工作${works}里都这样要求` : "你在两项不同的工作里都这样要求", evidence: [...evidence], from: "extraction", supersedes: earlier.supersedes ?? supersedes, candidate_id: earlier.candidate_id });
        out.push({ text: earlier.text, outcome: result.outcome, reason: result.reason, candidate_id: result.candidate?.candidate_id ?? earlier.candidate_id, memory_id: result.memory?.memory_id ?? null });
        continue;
      }
      try {
        const candidate = await this.propose({ ...child, work }, { scope, text, kind: proposal.kind, applies, basis, from: "extraction", supersedes, evidence: evidence.length ? evidence : undefined,
          why: verified ? `你在${named && work ? `工作「${work.title}」` : "一项工作"}里说：“${quote}”` : `从${named && work ? `工作「${work.title}」` : "一项工作"}里推断`,
          hold_reason: basis === "explicit"
            ? `${automaticMemoryHold(proposal.kind, "repeated", prefs.auto) ?? "只在一项工作里出现过：在另一项工作里再这样要求会自动记住，也可以现在就认可"}${pointed ? `；它可能和另一条等你认可的建议「${pointed.text.slice(0, 40)}」是一回事，但意思不一定相同，所以两条都留给你看` : ""}`
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
    const where = placeOf(caller, scope);
    const prefs = this.scopeCommands.prefsAt(caller.actor_id, where);
    const threshold = { ...SIGNAL_THRESHOLD };
    if (!prefs.enabled || !prefs.form || !prefs.learn_from_ui) return { state: "off", count: 0, distinct: 0, candidate_id: null, threshold };
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
    caller = this.operations.caller(caller);
    const now = this.now(), at = now.toISOString(), day = 86_400_000;
    const report: MemoryUpkeepReport = { at, expired: 0, unused: 0, merged: 0, paused: 0, resumed: 0, pairs: 0, tidied: false };
    // The person's, each project's, and each project's Characters' (kept per project).
    const scopes: Array<{ scope: MemoryScope; owner: string; project: string | null }> = [{ scope: "personal", owner: caller.actor_id, project: null },
      ...[...new Set(options.projects)].flatMap(id => [{ scope: "project" as const, owner: id, project: id },
        ...this.ports.ledger.owners(id).filter(owner => owner.scope === "character").map(owner => ({ scope: "character" as const, owner: owner.owner, project: id }))])];
    for (const where of scopes) {
      if (!this.scopeCommands.prefsAt(caller.actor_id, where).enabled) continue;
      const holder: MemoryCaller = { ...caller, project_id: where.project ?? caller.project_id, person: true };
      let located = await this.scopeCommands.located(holder, where.scope, where.owner);
      if (!located.length) continue;
      const turnOff = async (one: Located, state: "disabled" | "paused", reason: string, kind: MemoryChangeKind, undo: MemoryUndoPlan) => {
        const meta: MemoryMetaRecord = { ...one.meta, state, state_reason: reason, updated_at: at };
        await this.saveFacts(holder,one, meta, one.meta);
        this.recordChange(holder, { kind, scope: where.scope, owner: where.owner, memory_id: one.entry.memory_id, text: one.entry.text, applied_version: one.entry.version, by: "maintenance", rule: "整理", reason, undo });
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
          if (state === "missing" && one.meta.state === "active") { await turnOff(one, "paused", `依据已不存在或读不到了（${object.kind} ${object.id}）`, "paused", { action: "enable" }); report.paused += 1; }
          else if (state === "ok" && one.meta.state === "paused" && (one.meta.state_reason ?? "").startsWith("依据已不存在")) {
            const meta: MemoryMetaRecord = { ...one.meta, state: "active", state_reason: null, updated_at: at };
            await this.saveFacts(holder,one, meta, one.meta);
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
        await this.saveFacts(holder,keep, meta, keep.meta);
        await this.purge(holder,drop);
        this.recordChange(holder, { kind: "merged", scope: where.scope, owner: where.owner, memory_id: keep.entry.memory_id, text: keep.entry.text, by: "maintenance", rule: "整理",
          reason: `合并了意思相同的「${drop.entry.text.slice(0, 60)}」`, undo: { action: "recreate", text: drop.entry.text, kind: drop.meta.kind, source: drop.meta.source, basis: drop.meta.basis, applies: drop.meta.applies,
            snapshot: { origin: drop.entry.origin, meta: drop.entry.meta } } });
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
      if (options.tidy && active().length >= 2 && (this.ports.ledger.marker(caller.actor_id, tidyKey)?.body as { fingerprint?: string } | undefined)?.fingerprint !== fingerprint) {
        const byId = new Map(active().map(one => [one.entry.memory_id, one]));
        const found = await options.tidy(active().slice(-60).map(one => ({ memory_id: one.entry.memory_id, text: one.entry.text.slice(0, 200), kind: one.meta.kind, source: one.meta.source }))).catch(() => null);
        if (found) {
          report.tidied = true;
          for (const [x, y] of found.duplicates.slice(0, 20)) { const a = byId.get(x), b = byId.get(y); if (a && b && a !== b && similarity(a.entry.text, b.entry.text) >= RELATED_TEXT) await handleDuplicate(a, b, "意思相同"); }
          for (const conflict of found.conflicts.slice(0, 20)) { const a = byId.get(conflict.a), b = byId.get(conflict.b); if (a && b && a !== b) raise(a, b, "conflict", conflict.why.slice(0, 200) || "两条说法相反"); }
          this.ports.ledger.setMarker(caller.actor_id, tidyKey, { fingerprint: located.filter(one => !mergedAway.has(one.entry.memory_id)).map(one => `${one.entry.memory_id}:${one.entry.version}:${one.meta.state}`).sort().join("|") }, at);
        }
      }
      // Automatic ones not used for 90 days are switched off (after merging, so a merged one counts its provenances once).
      for (const one of located.filter(item => !mergedAway.has(item.entry.memory_id) && item.meta.state === "active" && item.meta.source === "auto")) {
        const used = this.ports.ledger.lastUse(one.entry.memory_id)?.at ?? one.meta.created_at;
        if (now.getTime() - Date.parse(used) > 90 * day) { await turnOff(one, "disabled", "90 天没有用到", "auto_disabled", { action: "enable" }); report.unused += 1; }
      }
    }
    this.ports.ledger.setMarker(caller.actor_id, "upkeep", report, at);
    return report;
  }

  /** When upkeep last ran, and what it did. */
  lastUpkeep(actorId: string): MemoryUpkeepReport | null {
    return (this.ports.ledger.marker(actorId, "upkeep")?.body as MemoryUpkeepReport | undefined) ?? null;
  }

  /** Pairs waiting for the person in the caller's scopes: both still there and in effect. */
  async pairs(caller: MemoryCaller, filter: { scope?: MemoryScope | "all" } = {}): Promise<MemoryPair[]> {
    const owners = new Set(this.scopeCommands.scopesFor(caller, filter.scope && filter.scope !== "all" ? [filter.scope] : undefined, true).map(where => `${where.scope}:${where.owner}`));
    const out: MemoryPair[] = [];
    for (const pair of this.ports.ledger.pairs(caller.actor_id)) {
      if (pair.state !== "pending" || !owners.has(`${pair.scope}:${pair.owner}`)) continue;
      const live = new Map((await this.scopeCommands.located({ ...caller, project_id: pair.project_id ?? caller.project_id }, pair.scope, pair.owner)).map(one => [one.entry.memory_id, one]));
      const a = live.get(pair.a.memory_id), b = live.get(pair.b.memory_id);
      if (!a || !b || a.meta.state !== "active" || b.meta.state !== "active") { this.ports.ledger.savePair(caller.actor_id, { ...pair, state: "resolved" }); continue; }
      const { owner: _owner, state: _state, ...view } = pair;
      out.push({ ...view, a: { ...pair.a, text: a.entry.text }, b: { ...pair.b, text: b.entry.text } });
    }
    return out;
  }

  /** The person keeps one (the other is switched off, recoverable) or both (the pair is not raised again). */
  async resolvePair(caller: MemoryCaller, pairId: string, keep: "a" | "b" | "both"): Promise<{ resolved: boolean }> {
    personOnly(caller, "只有本人能决定保留哪条");
    const pair = this.ports.ledger.pairs(caller.actor_id).find(item => item.pair_id === pairId);
    if (!pair) throw memoryErrors.not_found("没有这一对");
    if (pair.state !== "pending") return { resolved: true };
    this.preferences.assertEnabled(caller.actor_id, { ...pair, project: pair.project_id });
    const holder: MemoryCaller = { ...caller, project_id: pair.project_id ?? caller.project_id };
    if (keep !== "both") {
      const other = keep === "a" ? pair.b : pair.a;
      await this.change(holder, { memory_id: other.memory_id, action: "disable" }).catch(error => { if (!(error instanceof ActionError && error.code === "memory.not_found")) throw error; });
    }
    this.ports.ledger.savePair(caller.actor_id, { ...pair, state: "resolved" });
    return { resolved: true };
  }

  previewScope(caller: MemoryCaller, scope: MemoryScope) { return this.scopeCommands.previewScope(caller, scope); }
  clearScope(caller: MemoryCaller, scope: MemoryScope, fingerprint: string) { return this.scopeCommands.clearScope(caller, scope, fingerprint); }
  exportScope(caller: MemoryCaller, scope: MemoryScope) { return this.scopeCommands.exportScope(caller, scope); }
  importScope(caller: MemoryCaller, scope: MemoryScope, pack: unknown) { return this.scopeCommands.importScope(caller, scope, pack); }

  /* ---- internals ---- */

  private async policyCandidate(caller: MemoryCaller, input: { candidate_id?: string; kind: MemoryKind; source: MemorySource },
    where: { scope: MemoryScope; owner: string }, text: string, origin: string, meta: AgentMemoryMeta): Promise<MemoryBackendCandidate> {
    if (input.candidate_id) {
      const existing = (await this.ports.backend.withCaller(caller).candidates.list(where.scope, where.owner)).find(item => item.candidate_id === input.candidate_id);
      if (!existing) throw memoryErrors.not_found("没有这条建议的当前原件");
      return existing;
    }
    const mark = this.operations.begin(caller, "policy-propose", { kind: "propose", ...where, expected_version: 0 });
    return this.ports.backend.withCaller(caller).candidates.propose({ ...where, text, origin, tags: [input.source, input.kind],
      meta: { ...meta, expires_at_ms: Math.min(meta.expires_at_ms ?? Infinity, Date.parse(mark.at) + CANDIDATE_TTL_MS) },
      expected_version: 0, operation_id: mark.operation_id, ...(caller.signal ? { signal: caller.signal } : {}) });
  }

  /** Both the formal replacement and candidate association use the SDK's single conditional decision. */
  private async settleByPolicy(caller: MemoryCaller, input: { candidate_id?: string; kind: MemoryKind; source: MemorySource; policy: { policy: string; version: number } }, where: { scope: MemoryScope; owner: string },
    entry: MemoryBackendEntry, text: string, meta: MemoryMetaRecord): Promise<MemoryBackendEntry> {
    const candidate = await this.policyCandidate(caller, input, where, text, `${MEMORY_GATE_RULE} · 纠正`, toEntryMeta(meta, entry.meta));
    const mark = this.operations.begin(caller, `policy-settle:${candidate.candidate_id}`, { kind: "settleInto", ...where,
      candidate_id: candidate.candidate_id, memory_id: entry.memory_id, expected_version: entry.version, candidate_expected_version: candidate.version });
    const updated = await this.ports.backend.withCaller(caller).candidates.settleInto({ ...where, candidate_id: candidate.candidate_id,
      candidate_expected_version: mark.candidate_expected_version!, operation_id: mark.operation_id, ...(caller.signal ? { signal: caller.signal } : {}),
      target: { memory_id: entry.memory_id, expected_version: mark.expected_version!, change: { text, meta: toEntryMeta(meta, entry.meta) } },
      by: { by: "policy", policy: input.policy.policy, version: input.policy.version } });
    if (input.candidate_id) this.markCandidateKept(caller.actor_id, input.candidate_id, updated.memory_id);
    return updated;
  }

  private markCandidateKept(actorId: string, candidateId: string, memoryId: string): void {
    const note = this.ports.ledger.candidates(actorId).find(item => item.candidate_id === candidateId);
    if (note) this.ports.ledger.saveCandidate({ ...note, state: "accepted", memory_id: memoryId });
  }

  /** Metadata edits preserve current classification/session and state; explicit state changes use their own CAS. */
  private async saveFacts(caller: MemoryCaller, located: { scope: MemoryScope; owner: string; entry: MemoryBackendEntry }, meta: MemoryMetaRecord, before?: MemoryMetaRecord): Promise<MemoryBackendEntry> {
    caller = this.operations.caller(caller);
    const where = { scope: located.scope, owner: located.owner, memory_id: located.entry.memory_id };
    const nextMeta = toEntryMeta(meta, located.entry.meta);
    if (!isDeepStrictEqual(nextMeta, located.entry.meta) || this.operations.find(caller, `facts:${located.entry.memory_id}`)) {
      located.entry = await this.ports.backend.withCaller(caller).update({ ...where, ...this.operations.formal(caller, located, "facts"), change: { text: located.entry.text, meta: nextMeta } });
    }
    const was = before?.state ?? (located.entry.disabled ? "disabled" : located.entry.paused ? "paused" : "active");
    if (meta.state === "active" && (was !== "active" || this.operations.find(caller, `resume:${located.entry.memory_id}`))) {
      located.entry = await this.ports.backend.withCaller(caller).resume({ ...where, ...this.operations.formal(caller, located, "resume") });
    } else if (meta.state !== "active" && (was !== meta.state || before?.state_reason !== meta.state_reason || this.operations.find(caller, `${meta.state}:${located.entry.memory_id}`))) {
      const request = { ...where, ...this.operations.formal(caller, located, meta.state), reason: meta.state_reason ?? (meta.state === "disabled" ? "你停用了" : "依据当前不可用") };
      located.entry = meta.state === "disabled" ? await this.ports.backend.withCaller(caller).disable(request) : await this.ports.backend.withCaller(caller).pause(request);
    }
    return located.entry;
  }

  private async purge(caller: MemoryCaller, located: Located): Promise<void> {
    caller = this.operations.caller(caller);
    const backend = this.ports.backend.withCaller(caller), where = { scope: located.scope, owner: located.owner };
    const notes = this.ports.ledger.candidates(caller.actor_id);
    const related = (await backend.candidates.list(where.scope, where.owner)).filter(item => item.memory_id === located.entry.memory_id
      || notes.some(note => note.candidate_id === item.candidate_id && note.supersedes === located.entry.memory_id));
    for (const item of related) {
      await backend.candidates.purge({ ...where, candidate_id: item.candidate_id,
        ...this.operations.condition(caller, `candidate-purge:${item.candidate_id}`, { kind: "purge", ...where, candidate_id: item.candidate_id, expected_version: item.version }) });
    }
    await backend.remove({ ...where, memory_id: located.entry.memory_id, ...this.operations.formal(caller, located, "purge") });
    this.ports.ledger.transaction(() => {
      for (const item of related) this.ports.ledger.dropCandidate(item.candidate_id);
      this.ports.ledger.forget(located.entry.memory_id);
    });
  }

  private async ownCandidate(caller: MemoryCaller, candidateId: string): Promise<MemoryCandidateRecord> {
    const note = this.ports.ledger.candidates(caller.actor_id).find(item => item.candidate_id === candidateId);
    if (!note) throw memoryErrors.not_found("没有这条建议");
    const record = (await this.candidateRecords(caller, note.scope, note.owner)).find(item => item.candidate_id === candidateId);
    if (!record) throw memoryErrors.not_found("没有这条建议");
    return record;
  }

  private recordChange(caller: MemoryCaller, input: { kind: MemoryChangeKind; scope: MemoryScope; owner: string; memory_id: string | null; text: string;
    by: MemoryChange["by"]; rule: string | null; reason: string | null; undo: MemoryUndoPlan | null; applied_version?: number }): MemoryChangeRecord {
    const record: MemoryChangeRecord = { change_id: caller.operation_id ? `change-${caller.operation_id}:${input.kind}:${input.memory_id ?? input.scope}` : `change-${this.newId()}`,
      ...(caller.operation_id ? { operation_id: caller.operation_id } : {}), ...(input.applied_version !== undefined ? { applied_version: input.applied_version } : {}), actor_id: caller.actor_id, owner: input.owner, kind: input.kind, memory_id: input.memory_id,
      scope: input.scope, project_id: input.scope === "project" ? input.owner : null, text: input.text, by: input.by, rule: input.rule, reason: input.reason,
      work: caller.work ?? null, at: this.now().toISOString(), undoable: !!input.undo, state: "active", undo: input.undo };
    const existing = this.ports.ledger.change(record.change_id);
    if (existing && input.kind !== "cleared") return existing;
    this.ports.ledger.saveChange(record);
    return record;
  }

  private date(at?: string): string {
    return new Intl.DateTimeFormat("zh-CN", { timeZone: this.ports.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone, dateStyle: "medium" }).format(at ? new Date(at) : this.now());
  }

  /** Provenance in words. A personal memory's names no work of a project, only the person's own words. */
  private async originFor(caller: MemoryCaller, scope: MemoryScope, source: MemorySource, input: { said?: string; why?: string; at?: string }): Promise<string> {
    const date = this.date(input.at), work = scope !== "personal" && caller.work ? `工作「${caller.work.title.slice(0, 40)}」· ` : "";
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
