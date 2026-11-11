import { MEMORY_KINDS, MEMORY_SOURCES, type MemoryChange, type MemoryScope, type MemoryLedgerPort, type MemoryManagementItem, type MemoryManagementKind, type MemoryPageRequest, type MemoryPageResponse } from "@molis-ai/molis-work-contracts/services/memory";
import type { MemoryBackendPort } from "./backend.js";
import type { MemoryCaller, MemoryService } from "./service.js";
import { MemoryScopeCommands } from "./scope-commands.js";
import { changeView } from "./shapes.js";
import { fromEntryMeta } from "./facts.js";
import { isExpired, personOnly, visibleTo } from "./places.js";
import { memoryErrors } from "./errors.js";
import { belongsToMemorySession } from "./classification.js";

/** Workload limits do not promise a bounded filesystem directory enumeration. */
export interface MemoryPageLimits { defaultLimit: number; maxLimit: number; scanLimit: number }
const DEFAULT_PAGE_LIMITS: MemoryPageLimits = { defaultLimit: 40, maxLimit: 100, scanLimit: 200 };
interface PagePorts { backend: MemoryBackendPort; ledger: MemoryLedgerPort; scopes: MemoryScopeCommands; isForgotten: MemoryService["isForgotten"]; now(): Date; limits?: Partial<MemoryPageLimits> }
interface Continuation { version: /* @version format.memory.page-cursor */ 1; binding: string; index: number; cursor?: string }

/** One bounded page over current authorized owners; it never reads the full formal list. */
export class MemoryManagementPages {
  private readonly limits: MemoryPageLimits;
  constructor(private readonly ports: PagePorts) {
    this.limits = { ...DEFAULT_PAGE_LIMITS, ...ports.limits };
    if (Object.values(this.limits).some(value => !Number.isSafeInteger(value) || value < 1)
      || this.limits.maxLimit > 100 || this.limits.defaultLimit > this.limits.maxLimit)
      throw memoryErrors.invalid("管理页限额必须为正整数，页大小不超过 100");
  }
  /** Changes in a bound page are selected by current canonical identities, not historical ledger text. */
  async changes(caller: MemoryCaller, filter: { scope?: MemoryScope | "all"; work_id?: string; limit?: number } = {}): Promise<MemoryChange[]> {
    const scopes = this.ports.scopes.scopesFor(caller, filter.scope && filter.scope !== "all" ? [filter.scope] : undefined, true);
    const owners = new Set(scopes.map(where => `${where.scope}:${where.owner}`));
    const changes = this.ports.ledger.changes(caller.actor_id, Math.max(1, Math.min(200, filter.limit ?? 50)) * (filter.work_id ? 4 : 1))
      .filter(change => owners.has(`${change.scope}:${change.owner}`) && (!filter.work_id || change.work?.work_id === filter.work_id));
    if (!caller.memory_session) return changes.slice(0, filter.limit ?? 50).map(changeView);
    const unchanged = await this.ports.backend.withCaller(caller).observeWrites(), identities = new Set<string>();
    for (const where of scopes) for (const located of await this.ports.scopes.located(caller, where.scope, where.owner))
      identities.add(JSON.stringify([where.scope, where.owner, located.entry.memory_id]));
    caller.signal?.throwIfAborted(); unchanged();
    return changes.filter(change => change.memory_id && identities.has(JSON.stringify([change.scope, change.owner, change.memory_id])))
      .slice(0, filter.limit ?? 50).map(changeView);
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
    const filter = pageFilter(request.filter);
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
      memory_session: caller.memory_session ?? null,
      scope, character_id: characterId ?? null, filter, query, limit, scopes });
    const position = pagePosition(suppliedCursor, binding, scopes.length);
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
      if (!belongsToMemorySession(caller, entry.meta)) { omitted = true; continue; }
      // SDK management authority is also needed to finish physical cleanup; public pages must apply the accepted facts after the final wait.
      if (this.ports.isForgotten(where.scope, where.owner, "memory", entry.memory_id)) { omitted = true; continue; }
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
    const next = result.exhausted ? { version: /* @version format.memory.page-cursor */ 1 as const, binding, index: position.index + 1 }
      : { version: /* @version format.memory.page-cursor */ 1 as const, binding, index: position.index, cursor: result.cursor };
    const exhausted = result.exhausted && next.index === scopes.length;
    const total = scopes.length === 1 && suppliedCursor === undefined && !query && unclassified === undefined && !omitted
      ? result.total : { kind: "unknown" as const };
    return { items, exhausted, stopped: result.exhausted && !exhausted ? "unknown" : result.stopped, total,
      scanned: result.scanned, cost: result.cost, ...(exhausted ? {} : { cursor: pageCursor(next) }) };
  }

}

function pageFilter(input: MemoryPageRequest["filter"] = {}): NonNullable<MemoryPageRequest["filter"]> {
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

function pagePosition(value: string | undefined, binding: string, scopes: number): Continuation {
  if (value === undefined) return { version: /* @version format.memory.page-cursor */ 1, binding, index: 0 };
  if (typeof value !== "string" || value.length > 65536) throw memoryErrors.invalid("分页游标超出限额");
  let parsed: unknown;
  try { parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")); } catch { throw memoryErrors.invalid("分页游标无效"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw memoryErrors.invalid("分页游标无效");
  const token = parsed as Partial<Continuation>;
  if (token.version !== /* @version format.memory.page-cursor */ 1 || token.binding !== binding || !Number.isSafeInteger(token.index) || token.index === undefined || token.index < 0 || token.index >= scopes
    || token.cursor !== undefined && (typeof token.cursor !== "string" || !token.cursor)) throw memoryErrors.conflict("分页范围或筛选已改变，请重新查看第一页");
  return { version: /* @version format.memory.page-cursor */ 1, binding, index: token.index, ...(token.cursor === undefined ? {} : { cursor: token.cursor }) };
}

function pageCursor(value: Continuation): string {
  const cursor = Buffer.from(JSON.stringify(value)).toString("base64url");
  if (cursor.length > 65536) throw memoryErrors.limit("管理范围的分页标识超出限额");
  return cursor;
}
