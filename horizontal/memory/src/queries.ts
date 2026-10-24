import { MEMORY_KINDS, MEMORY_SOURCES, type MemoryCandidate, type MemoryCandidateRecord, type MemoryScope, type MemoryItem, type MemoryLedgerPort,
  type MemoryListRequest, type MemoryListResponse, type MemoryManagementItem, type MemoryManagementKind,
  type MemoryPageRequest, type MemoryPageResponse, type MemoryRecallRequest, type MemoryRecallResponse,
  type MemoryRecalled, type MemoryUseRecord, type MemoryFormalKind, type MemorySource } from "@molis-ai/molis-work-contracts/services/memory";
import type { MemoryBackendEntry, MemoryBackendPort, MemoryBackendCandidate } from "./backend.js";
import type { MemoryCaller } from "./service.js";
import { MemoryScopeCommands, type Located } from "./scope-commands.js";
import { fromEntryMeta } from "./facts.js";
import { consumerAccess, CONSUMER_LABELS } from "./prefs.js";
import { formationReadPossible, formationReferenceAllowed, type FormationSnapshot } from "./formation.js";
import { applies, isExpired, personOnly, visibleTo } from "./places.js";
import { memoryErrors } from "./errors.js";
import { keywordScore, recallKeywords } from "./text.js";
import { useTitle } from "./shapes.js";
import { EXPLICIT_SOURCES } from "./duplicates.js";

const KIND_WEIGHT: Record<MemoryFormalKind, number> = { preference: 1, convention: 1, habit: 1, "project-decision": 1, experience: 0.85, fact: 0.75 };
const SOURCE_WEIGHT: Record<MemorySource, number> = { said: 1, manual: 1, accepted: 0.95, imported: 0.9, auto: 0.85, plugin: 0.8 };
/** How much a memory counts even when no keyword of the request is in it: ways of working apply to most work. */
const STANDING: Record<MemoryFormalKind, number> = { preference: 0.45, convention: 0.45, habit: 0.45, "project-decision": 0.45, experience: 0.15, fact: 0.05 };

/** App workload configuration; scan slots do not bound Node directory enumeration. */
export interface MemoryPageLimits { defaultLimit: number; maxLimit: number; scanLimit: number }
const DEFAULT_PAGE_LIMITS: MemoryPageLimits = { defaultLimit: 40, maxLimit: 100, scanLimit: 200 };
interface QueryPorts {
  backend: MemoryBackendPort; ledger: MemoryLedgerPort; scopes: MemoryScopeCommands; now: () => Date;
  limits?: Partial<MemoryPageLimits>;
  newId(): string;
  beforeEffect?(): void | Promise<void>;
  candidates(caller: MemoryCaller, request: { scope: NonNullable<MemoryListRequest["scope"]> }): Promise<MemoryCandidate[]>;
}
interface Continuation { version: 1; binding: string; index: number; cursor?: string }

/** Current scope resolution and public projections over the single SDK read owner. */
export class MemoryQueries {
  private readonly limits: MemoryPageLimits;
  constructor(private readonly ports: QueryPorts) {
    this.limits = { ...DEFAULT_PAGE_LIMITS, ...ports.limits };
    if (Object.values(this.limits).some(value => !Number.isSafeInteger(value) || value < 1)
      || this.limits.maxLimit > 100 || this.limits.defaultLimit > this.limits.maxLimit)
      throw memoryErrors.invalid("管理页限额必须为正整数，页大小不超过 100");
  }

  async list(caller: MemoryCaller, request: MemoryListRequest = {}): Promise<MemoryListResponse> {
    const scopes = this.ports.scopes.scopesFor(caller, request.scope === "all" || !request.scope ? undefined : [request.scope]);
    const items: MemoryItem[] = [], readScopes: typeof scopes = [];
    const readTargets: Array<{ where: typeof scopes[number]; target: MemoryBackendEntry["meta"] }> = [];
    let personal = 0, project = 0;
    for (const where of scopes) {
      if (!caller.person) {
        const access = consumerAccess(this.ports.scopes.prefsAt(caller.actor_id, where), caller.consumer, caller.plugin_id, caller.run_explicit ? "explicit" : "task");
        if (!access.allowed || !formationReadPossible(caller, this.ports.scopes.prefsAt(caller.actor_id, where), where.scope)) continue;
      }
      readScopes.push(where);
      for (const located of await this.ports.scopes.located(caller, where.scope, where.owner)) {
        if (!visibleTo(caller, located.meta)) continue;
        readTargets.push({ where, target: located.entry.meta });
        if (where.scope === "personal") personal += 1; else project += 1;
        const item = this.ports.scopes.item(located);
        if (request.kinds?.length && !request.kinds.some(kind => kind === item.kind)) continue;
        if (request.sources?.length && !request.sources.includes(item.source)) continue;
        if (request.states?.length && !request.states.includes(item.state)) continue;
        if (request.query?.trim() && !item.text.toLowerCase().includes(request.query.trim().toLowerCase())) continue;
        items.push(item);
      }
    }
    items.sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
    let auto_this_week: number | null = null, pending: number | null = null;
    if (caller.person) {
      const weekAgo = this.ports.now().getTime() - 7 * 24 * 60 * 60 * 1000;
      const owners = new Set(scopes.map(where => `${where.scope}:${where.owner}`));
      auto_this_week = this.ports.ledger.changes(caller.actor_id, 500).filter(change => change.kind === "auto_kept" && change.state === "active"
        && owners.has(`${change.scope}:${change.owner}`) && Date.parse(change.at) >= weekAgo).length;
      pending = (await this.ports.candidates(caller, { scope: request.scope ?? "all" })).length;
    }
    caller.signal?.throwIfAborted();
    if (!caller.person && (readScopes.some(where => !consumerAccess(this.ports.scopes.prefsAt(caller.actor_id, where), caller.consumer, caller.plugin_id, caller.run_explicit ? "explicit" : "task").allowed)
      || readTargets.some(({ where, target }) => !formationReferenceAllowed(caller, this.ports.scopes.prefsAt(caller.actor_id, where), where.scope, target, "read"))))
      throw memoryErrors.forbidden("记忆读取权限已变化，请重新查看");
    return { items, counts: { personal, project, auto_this_week, pending } };
  }


  /** Host-only selection for this Run. Bodies never leave this owner; only real Context receipts record use. */
  async expand(caller: MemoryCaller, request: { list: MemoryListRequest } | { recall: MemoryRecallRequest },
    control: import("@molis-ai/molis-work-contracts/services/memory").MemoryRunReadControl): Promise<import("@molis-ai/molis-work-contracts/services/memory").MemoryRunReadResult> {
    return control.read(async allowed => {
      const reader: MemoryCaller = { ...caller, person: false, purpose: "task", run_explicit: true };
      const requested = "recall" in request ? request.recall.scopes : request.list.scope && request.list.scope !== "all" ? [request.list.scope] : undefined;
      const scopes = this.ports.scopes.scopesFor(reader, requested).filter(where => allowed.some(scope =>
        scope.scope === (where.scope === "personal" ? "user" : where.scope) && scope.owner === where.owner)
        && formationReadPossible(reader, this.ports.scopes.prefsAt(reader.actor_id, where), where.scope));
      if (!scopes.length) return [];
      const items = "recall" in request
        ? (await this.recall(reader, { ...request.recall, scopes: scopes.map(where => where.scope) }, { readMode: "explicit", selectionOnly: true })).items
        : (await Promise.all(scopes.map(where => this.list(reader, { ...request.list, scope: where.scope })))).flatMap(page => page.items);
      await this.ports.beforeEffect?.();
      reader.signal?.throwIfAborted();
      // Recheck the exact selected scopes after the asynchronous reads; SDK rechecks every ref/version again.
      if (scopes.some(where => !formationReadPossible(reader, this.ports.scopes.prefsAt(reader.actor_id, where), where.scope)))
        throw memoryErrors.forbidden("记忆读取权限已变化");
      return items.map(item => {
        const where = scopes.find(where => where.scope === item.scope)!;
        return { scope: where.scope === "personal" ? "user" as const : where.scope, owner: where.owner, memory_id: item.memory_id, version: item.version };
      });
    }, caller.signal);
  }
  /**
   * Memories that bear on a situation, for one consumer (spec §7.1): active, not expired, applicable, allowed for this
   * consumer by the person's switches, ranked by keywords × kind × recency × source, within a limit and a budget.
   * Every returned and omitted memory is recorded against the receipt.
   */
  async recall(caller: MemoryCaller, request: MemoryRecallRequest = {}, options: { beforeEffect?: () => void | Promise<void>; readMode?: "explicit" | "task"; selectionOnly?: boolean } = {}): Promise<MemoryRecallResponse> {
    const receipt_id = `recall-${this.ports.newId()}`;
    const limit = Math.max(1, Math.min(20, request.limit ?? 8)), budget = Math.max(100, Math.min(4000, request.budget_chars ?? 2000));
    const scopes = this.ports.scopes.scopesFor(caller, request.scopes);
    const keywords = recallKeywords([request.query ?? "", request.situation?.task ?? ""].join(" "));
    const now = this.ports.now();
    const offScopes: string[] = [];
    const ranked: Array<{ located: Located; score: number }> = [];
    for (const where of scopes) {
      const access = consumerAccess(this.ports.scopes.prefsAt(caller.actor_id, where), caller.consumer, caller.plugin_id, options.readMode);
      if (!access.allowed || caller.run_explicit && !formationReadPossible(caller, this.ports.scopes.prefsAt(caller.actor_id, where), where.scope)) { offScopes.push(where.scope === "personal" ? "个人记忆" : where.scope === "character" ? "角色记忆" : "项目记忆"); continue; }
      for (const located of await this.ports.scopes.located(caller, where.scope, where.owner)) {
        const meta = located.meta;
        if (meta.state !== "active" || isExpired(meta, now) || !visibleTo(caller, meta)) continue;
        if (access.kinds && !access.kinds.some(kind => kind === meta.kind)) continue;
        if (request.kinds?.length && !request.kinds.some(kind => kind === meta.kind)) continue;
        if (!applies(meta.applies, request.situation, now)) continue;
        const hits = keywordScore(keywords, `${located.entry.text} ${meta.applies.task ?? ""}`);
        if (keywords.length && hits === 0 && STANDING[meta.kind] < 0.2) continue;
        const ageDays = meta.updated_at === null ? Infinity : Math.max(0, (now.getTime() - Date.parse(meta.updated_at)) / 86_400_000);
        const recency = ageDays <= 30 ? 1 : Math.max(0.7, 1 - (ageDays - 30) / 300);
        const score = (STANDING[meta.kind] + (keywords.length ? hits : 0.3) * 0.55) * KIND_WEIGHT[meta.kind] * recency * SOURCE_WEIGHT[meta.source];
        ranked.push({ located, score: Math.round(score * 1000) / 1000 });
      }
    }
    if (!ranked.length && offScopes.length && offScopes.length === scopes.length)
      return { state: "off", reason: `你关掉了“${CONSUMER_LABELS[caller.consumer]}”使用${offScopes.join("和")}`, items: [], omitted: [], method: "keyword-cjk", receipt_id };
    ranked.sort((a, b) => b.score - a.score || (b.located.meta.updated_at ?? "").localeCompare(a.located.meta.updated_at ?? ""));
    const items: MemoryRecalled[] = [], omitted: MemoryRecallResponse["omitted"] = [];
    // Two that contradict each other (a pair the person has not settled yet): only the stronger one goes in, the other is named.
    const explicit = (one: Located) => EXPLICIT_SOURCES.includes(one.meta.source) ? 1 : 0;
    for (const pair of this.ports.ledger.pairs(caller.actor_id).filter(item => item.state === "pending" && item.kind === "conflict")) {
      const a = ranked.find(one => one.located.entry.memory_id === pair.a.memory_id), b = ranked.find(one => one.located.entry.memory_id === pair.b.memory_id);
      if (!a || !b) continue;
      const loser = explicit(a.located) !== explicit(b.located) ? (explicit(a.located) > explicit(b.located) ? b : a) : ((a.located.meta.updated_at ?? "") >= (b.located.meta.updated_at ?? "") ? b : a);
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
    if (ranked.some(({ located }) => !consumerAccess(this.ports.scopes.prefsAt(caller.actor_id, located), caller.consumer, caller.plugin_id, options.readMode).allowed))
      throw memoryErrors.off("读取期间记忆开关已改变，请按当前设置重试");
    if (!options.selectionOnly) this.ports.ledger.recordUses([
      ...items.map((item): MemoryUseRecord => ({ memory_id: item.memory_id, memory_version: item.version, receipt_id, at, consumer: caller.consumer, title, work_id, source: "recall", state: "returned" })),
      ...omitted.map((item): MemoryUseRecord => ({ memory_id: item.memory_id, receipt_id, at, consumer: caller.consumer, title, work_id, source: "recall", state: "omitted" })),
    ]);
    const partlyOff = offScopes.length ? `你关掉了“${CONSUMER_LABELS[caller.consumer]}”使用${offScopes.join("和")}` : null;
    return { state: "ok", reason: partlyOff, items, omitted, method: "keyword-cjk", receipt_id };
  }

  async policyCandidate(caller: MemoryCaller, candidateId: string | undefined, where: { scope: MemoryScope; owner: string }): Promise<MemoryBackendCandidate> {
    const existing = (await this.ports.backend.withCaller(caller).candidates.list(where.scope, where.owner)).find(item => item.candidate_id === candidateId);
    if (!existing) throw memoryErrors.not_found("没有这条建议的当前原件");
    return existing;
  }

  async page(caller: MemoryCaller, request: MemoryPageRequest = {}): Promise<MemoryPageResponse> {
    personOnly(caller, "只有本人能查看记忆管理页");
    const { signal, ...identity } = caller;
    caller = Object.freeze({ ...structuredClone(identity), ...(signal ? { signal } : {}) });
    caller.signal?.throwIfAborted();
    const characterId = request.character_id, suppliedCursor = request.cursor;
    const scope = request.scope ?? (caller.project_id ? "project" : "personal");
    if (!["personal", "project", "character"].includes(scope)) throw memoryErrors.invalid("管理页范围不支持");
    if (characterId !== undefined && (scope !== "character" || !characterId || characterId.length > 200))
      throw memoryErrors.invalid("角色筛选需要明确角色范围");
    const limit = request.limit ?? this.limits.defaultLimit;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > this.limits.maxLimit) throw memoryErrors.invalid("管理页大小超出限额");
    if (request.query !== undefined && (typeof request.query !== "string" || request.query.length > 400)) throw memoryErrors.invalid("搜索内容超出限额");
    const query = request.query?.trim().toLowerCase() ?? "";
    const filter = this.filter(request.filter);
    const targets = () => {
      const all = this.ports.scopes.scopesFor(caller, scope === "project" ? ["project", "character"] : [scope]);
      return all.filter(where => characterId === undefined || this.ports.ledger.owners(caller.project_id ?? "")
        .some(owner => owner.scope === "character" && owner.owner === where.owner && owner.subject === characterId))
        .sort((left, right) => Number(right.scope === "project") - Number(left.scope === "project") || left.owner.localeCompare(right.owner));
    };
    const scopes = targets();
    if (characterId !== undefined && scopes.length === 0) throw memoryErrors.scope("角色不属于当前项目");
    const binding = JSON.stringify({ actor: caller.actor_id, project: caller.project_id, consumer: caller.consumer, plugin: caller.plugin_id ?? null,
      session: caller.session_id ?? null, scene: caller.current_scene ?? null, purpose: caller.purpose ?? "management", character: caller.character?.id ?? null,
      scope, character_id: characterId ?? null, filter, query, limit, scopes });
    const position = this.position(suppliedCursor, binding, scopes.length);
    const where = scopes[position.index];
    if (!where) return { items: [], exhausted: true, stopped: "end", total: { kind: "exact", value: 0 }, scanned: "unknown",
      cost: { directory_entries: "unknown", directory_enumerations: "unknown", directory_traversal: "unknown", metadata_reads: "unknown", body_reads: "unknown" } };
    const { unclassified, ...sdkFilter } = filter;
    // One SDK call owns the whole request's output/scan budget, including when physical costs are hidden.
    const result = await this.ports.backend.withCaller(caller).page({ scope: where.scope, owner: where.owner, filter: sdkFilter,
      limit, scan_limit: this.limits.scanLimit, ...(position.cursor === undefined ? {} : { cursor: position.cursor }),
      ...(caller.signal ? { signal: caller.signal } : {}) });
    caller.signal?.throwIfAborted();
    if (JSON.stringify(scopes) !== JSON.stringify(targets())) throw memoryErrors.conflict("管理范围已改变，请重新查看第一页");
    const items: MemoryManagementItem[] = [];
    let omitted = false;
    const now = this.ports.now();
    for (const entry of result.items) {
      const meta = fromEntryMeta({ ...entry, scope: where.scope, owner: where.owner });
      const kind = entry.meta.kind;
      if (!meta || !visibleTo(caller, meta) || !kind || ![...MEMORY_KINDS, "habit", "project-decision"].includes(kind)
        || !MEMORY_SOURCES.includes(meta.source)) { omitted = true; continue; }
      if (unclassified !== undefined && unclassified !== (entry.meta.classification === undefined)) continue;
      if (query && !entry.text.toLowerCase().includes(query)) continue;
      const projected = this.ports.scopes.item({ ...where, entry, meta });
      items.push({ ...projected, kind: kind as MemoryManagementKind, state: meta.state, state_reason: meta.state_reason,
        classification: entry.meta.classification ?? null, expired: isExpired(meta, now) });
    }
    const next = result.exhausted ? { version: 1 as const, binding, index: position.index + 1 }
      : { version: 1 as const, binding, index: position.index, cursor: result.cursor };
    const exhausted = result.exhausted && next.index === scopes.length;
    const total = scopes.length === 1 && suppliedCursor === undefined && !query && unclassified === undefined && !omitted
      ? result.total : { kind: "unknown" as const };
    return { items, exhausted, stopped: result.exhausted && !exhausted ? "unknown" : result.stopped, total,
      scanned: result.scanned, cost: result.cost, ...(exhausted ? {} : { cursor: this.cursor(next) }) };
  }

  /** Join the ledger's notes with the current candidate owner; reading never repairs missing facts. */
  async candidateRecords(caller: MemoryCaller, scope: MemoryScope, owner: string, options: { formation?: boolean } = {}): Promise<FormationSnapshot["pending"]> {
    const candidates = this.ports.backend.withCaller(caller).candidates;
    const held = new Map((await candidates.list(scope, owner)).map(item => [item.candidate_id, item]));
    const out: FormationSnapshot["pending"] = [];
    for (const note of this.ports.ledger.candidates(caller.actor_id).filter(item => item.scope === scope && item.owner === owner)) {
      let found = held.get(note.candidate_id);
      if (!found && options.formation && !caller.person) {
        try { found = await candidates.get({ scope, owner, candidate_id: note.candidate_id, ...(caller.signal ? { signal: caller.signal } : {}) }); }
        catch (error) {
          caller.signal?.throwIfAborted();
          if (error instanceof Error && "code" in error && error.code === "MEMORY_SCOPE_DENIED") continue;
          throw error;
        }
      }
      if (!found) throw memoryErrors.not_found("记忆建议的原记录不可读；请核对存储后继续");
      const state: MemoryCandidateRecord["state"] = found.state === "promoted" ? "accepted" : found.state;
      out.push({ note: { ...note, text: found.text, version: found.version, state, memory_id: found.memory_id ?? note.memory_id }, entry: found });
    }
    return out;
  }

  async ownCandidate(caller: MemoryCaller, candidateId: string): Promise<MemoryCandidateRecord> {
    const note = this.ports.ledger.candidates(caller.actor_id).find(item => item.candidate_id === candidateId);
    if (!note) throw memoryErrors.not_found("没有这条建议");
    const holder = caller.person && caller.project_id === null ? { ...caller, project_id: note.project_id } : caller;
    const record = (await this.candidateRecords(holder, note.scope, note.owner)).find(item => item.note.candidate_id === candidateId)?.note;
    if (!record) throw memoryErrors.not_found("没有这条建议");
    return record;
  }

  private filter(input: MemoryPageRequest["filter"] = {}): NonNullable<MemoryPageRequest["filter"]> {
    const out: NonNullable<MemoryPageRequest["filter"]> = {};
    for (const key of ["scenes", "kinds", "lifecycles", "states", "sources"] as const) {
      const values = input[key];
      if (values !== undefined) {
        if (!Array.isArray(values) || values.length > 20 || values.some(value => typeof value !== "string" || !value || value.length > 200))
          throw memoryErrors.invalid("管理筛选超出限额");
        Object.assign(out, { [key]: [...new Set(values)].sort() });
      }
    }
    for (const key of ["expired", "unclassified"] as const) if (input[key] !== undefined) {
      if (typeof input[key] !== "boolean") throw memoryErrors.invalid("管理筛选需要明确的是或否");
      out[key] = input[key];
    }
    return out;
  }

  private position(value: string | undefined, binding: string, scopes: number): Continuation {
    if (value === undefined) return { version: 1, binding, index: 0 };
    if (typeof value !== "string" || value.length > 65536) throw memoryErrors.invalid("分页游标超出限额");
    let parsed: unknown;
    try { parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")); } catch { throw memoryErrors.invalid("分页游标无效"); }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw memoryErrors.invalid("分页游标无效");
    const token = parsed as Partial<Continuation>;
    if (token.version !== 1 || token.binding !== binding || !Number.isSafeInteger(token.index) || token.index === undefined || token.index < 0 || token.index >= scopes
      || token.cursor !== undefined && (typeof token.cursor !== "string" || !token.cursor)) throw memoryErrors.conflict("分页范围或筛选已改变，请重新查看第一页");
    return { version: 1, binding, index: token.index, ...(token.cursor === undefined ? {} : { cursor: token.cursor }) };
  }

  private cursor(value: Continuation): string {
    const cursor = Buffer.from(JSON.stringify(value)).toString("base64url");
    if (cursor.length > 65536) throw memoryErrors.limit("管理范围的分页标识超出限额");
    return cursor;
  }
}
