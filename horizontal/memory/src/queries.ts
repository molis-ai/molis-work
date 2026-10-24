import { MEMORY_KINDS, MEMORY_SOURCES, type MemoryCandidate, type MemoryCandidateRecord, type MemoryScope, type MemoryItem, type MemoryLedgerPort,
  type MemoryListRequest, type MemoryListResponse, type MemoryManagementItem, type MemoryManagementKind,
  type MemoryChange, type MemoryHistoryResponse, type MemoryPageRequest, type MemoryPageResponse } from "@molis-ai/molis-work-contracts/services/memory";
import type { MemoryBackendEntry, MemoryBackendPort } from "./backend.js";
import type { MemoryCaller } from "./service.js";
import { MemoryScopeCommands } from "./scope-commands.js";
import { fromEntryMeta } from "./facts.js";
import { consumerAccess } from "./prefs.js";
import { formationReferenceAllowed, type FormationSnapshot } from "./formation.js";
import { isExpired, personOnly, visibleTo } from "./places.js";
import { changeView, revisionView } from "./shapes.js";
import { memoryErrors } from "./errors.js";

/** App workload configuration; scan slots do not bound Node directory enumeration. */
export interface MemoryPageLimits { defaultLimit: number; maxLimit: number; scanLimit: number }
const DEFAULT_PAGE_LIMITS: MemoryPageLimits = { defaultLimit: 40, maxLimit: 100, scanLimit: 200 };
interface QueryPorts {
  backend: MemoryBackendPort; ledger: MemoryLedgerPort; scopes: MemoryScopeCommands; now: () => Date;
  limits?: Partial<MemoryPageLimits>;
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

  async history(caller: MemoryCaller, memoryId: string): Promise<MemoryHistoryResponse> {
    const located = await this.ports.scopes.find(caller, memoryId);
    return { memory_id: located.entry.memory_id, revisions: this.ports.ledger.revisions(located.entry.memory_id).map(revisionView) };
  }

  changes(caller: MemoryCaller, filter: { scope?: MemoryScope | "all"; work_id?: string; limit?: number } = {}): MemoryChange[] {
    const owners = new Set(this.ports.scopes.scopesFor(caller, filter.scope && filter.scope !== "all" ? [filter.scope] : undefined, true).map(where => `${where.scope}:${where.owner}`));
    return this.ports.ledger.changes(caller.actor_id, Math.max(1, Math.min(200, filter.limit ?? 50)) * (filter.work_id ? 4 : 1))
      .filter(change => owners.has(`${change.scope}:${change.owner}`) && (!filter.work_id || change.work?.work_id === filter.work_id))
      .slice(0, filter.limit ?? 50).map(changeView);
  }

  async list(caller: MemoryCaller, request: MemoryListRequest = {}): Promise<MemoryListResponse> {
    const scopes = this.ports.scopes.scopesFor(caller, request.scope === "all" || !request.scope ? undefined : [request.scope]);
    const items: MemoryItem[] = [], readScopes: typeof scopes = [];
    const readTargets: Array<{ where: typeof scopes[number]; target: MemoryBackendEntry["meta"] }> = [];
    let personal = 0, project = 0;
    for (const where of scopes) {
      if (!caller.person) {
        const access = consumerAccess(this.ports.scopes.prefsAt(caller.actor_id, where), caller.consumer, caller.plugin_id);
        if (!access.allowed) continue;
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
    if (!caller.person && (readScopes.some(where => !consumerAccess(this.ports.scopes.prefsAt(caller.actor_id, where), caller.consumer, caller.plugin_id).allowed)
      || readTargets.some(({ where, target }) => !formationReferenceAllowed(caller, this.ports.scopes.prefsAt(caller.actor_id, where), where.scope, target, "read"))))
      throw memoryErrors.forbidden("记忆读取权限已变化，请重新查看");
    return { items, counts: { personal, project, auto_this_week, pending } };
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
      items.push({ ...projected, owner: where.owner, kind: kind as MemoryManagementKind, state: meta.state, state_reason: meta.state_reason,
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
