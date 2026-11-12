import { isDeepStrictEqual } from "node:util";
import { ActionError, platformErrorKind } from "@molis-ai/molis-work-contracts/platform/actions";
import type { MemoryForgettingDecision, MemoryLedgerPort, MemoryScope, MemorySessionBinding, MemorySessionClearItem, MemorySessionClearPreview,
  MemorySessionClearResult, MemorySessionPurgeSelection, MemorySessionPurgeTarget } from "@molis-ai/molis-work-contracts/services/memory";
import type { MemoryBackendPort } from "./backend.js";
import type { MemoryCaller } from "./service.js";
import type { MemoryScopeCommands } from "./scope-commands.js";
import type { MemoryForgetting } from "./forgetting.js";
import { personOnly } from "./places.js";
import { memoryErrors } from "./errors.js";
import { learnedInSession, memorySources, type MemorySourceSession } from "./session-links.js";

export const MEMORY_SESSION_CLEAR_PREFIX = "memory-session-clear:";
/** The long-term memories and waiting suggestions learned in the session, fixed at preview; removed through the ordinary paths. */
const LINKED_PREFIX = "memory-session-learned:";
interface LinkedPlan { binding: MemorySessionBinding; memories: MemoryLinkedTarget[]; candidates: Array<{ scope: MemoryScope; owner: string; candidate_id: string; version: number }> }
export interface MemoryLinkedTarget { scope: MemoryScope; owner: string; memory_id: string; version: number }
interface Group { scope: MemoryScope; owner: string; operation_id: string;
  memories: Array<{ memory_id: string; version: number }>; candidates: Array<{ candidate_id: string; version: number }> }
export interface MemorySessionClearPlan {
  version: /* @version format.memory.session-clear-plan */ 1; actor_id: string; operation_id: string; binding: MemorySessionBinding;
  groups: Group[]; targets: MemorySessionPurgeTarget[]; started: boolean; complete: boolean; done: number;
}
const key = (item: Pick<MemorySessionPurgeTarget, "scope" | "owner" | "kind" | "id">) => JSON.stringify([item.scope, item.owner, item.kind, item.id]);
const order = (a: MemorySessionPurgeTarget, b: MemorySessionPurgeTarget) => a.scope.localeCompare(b.scope) || a.owner.localeCompare(b.owner)
  || Number(a.kind !== "memory") - Number(b.kind !== "memory") || a.id.localeCompare(b.id);
const id = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= 200;
const fields = (value: object, allowed: readonly string[]) => Object.keys(value).length === allowed.length && Object.keys(value).every(field => allowed.includes(field));

/** Strict original plans only. Missing or altered selection is reconciliation, never permission to scan again. */
export function isMemorySessionClearPlan(value: unknown): value is MemorySessionClearPlan {
  if (!value || typeof value !== "object") return false;
  const plan = value as MemorySessionClearPlan, binding = plan.binding;
  if (!fields(plan, ["version", "actor_id", "operation_id", "binding", "groups", "targets", "started", "complete", "done"]) || plan.version !== /* @version format.memory.session-clear-plan */ 1
    || !id(plan.actor_id) || !id(plan.operation_id) || !binding || !["coding", "assistant"].includes(binding.current_scene)
    || !binding.session || !id(binding.session.session_id) || binding.session.runtime_id !== "prologue" || !binding.target || !id(binding.target.id)
    || binding.target.kind !== binding.current_scene || !(binding.target.project_id === null || id(binding.target.project_id))
    || !Array.isArray(plan.targets) || !plan.targets.length || !Array.isArray(plan.groups) || !plan.groups.length
    || typeof plan.started !== "boolean" || typeof plan.complete !== "boolean" || !Number.isSafeInteger(plan.done) || plan.done < 0 || plan.done > plan.targets.length
    || plan.complete && plan.done !== plan.targets.length) return false;
  const seen = new Set<string>(), operations = new Set<string>();
  for (const item of plan.targets) {
    if (!item || !fields(item, ["kind", "id", "scope", "owner", "version", "operation_id", "selection"]) || !["memory", "memory-candidate"].includes(item.kind)
      || !["personal", "project", "character"].includes(item.scope) || !id(item.id) || !id(item.owner) || !id(item.operation_id)
      || !Number.isSafeInteger(item.version) || item.version < 1 || !isDeepStrictEqual(item.selection, {
        session_ref: { kind: "session", id: binding.session.session_id, revision: 1 }, operation_id: plan.operation_id })
      || seen.has(key(item)) || operations.has(item.operation_id)) return false;
    seen.add(key(item)); operations.add(item.operation_id);
  }
  if (!isDeepStrictEqual(plan.targets, [...plan.targets].sort(order))) return false;
  const selected = new Set<string>();
  for (const group of plan.groups) {
    if (!group || !fields(group, ["scope", "owner", "operation_id", "memories", "candidates"]) || !id(group.operation_id) || operations.has(group.operation_id)) return false;
    operations.add(group.operation_id);
    const targets = plan.targets.filter(item => item.scope === group.scope && item.owner === group.owner);
    if (!targets.length || selected.has(JSON.stringify([group.scope, group.owner]))
      || !isDeepStrictEqual(group.memories, targets.filter(item => item.kind === "memory").map(item => ({ memory_id: item.id, version: item.version })))
      || !isDeepStrictEqual(group.candidates, targets.filter(item => item.kind === "memory-candidate").map(item => ({ candidate_id: item.id, version: item.version })))) return false;
    selected.add(JSON.stringify([group.scope, group.owner]));
  }
  return plan.targets.every(item => selected.has(JSON.stringify([item.scope, item.owner])));
}

/** One fixed Session cleanup: complete scans, all durable acceptances, original SDK tuples, then ledger closure. */
export class MemorySessionClear {
  constructor(private readonly ports: { ledger: MemoryLedgerPort; backend: MemoryBackendPort; scopes: MemoryScopeCommands; forgetting: MemoryForgetting;
    newId(): string; now(): Date; beforeEffect?(): void | Promise<void>; assertCurrent?(): void; sourceSession?: MemorySourceSession;
    /** The ordinary removal of one formal memory (the same forgetting as deleting it in settings), and the ordinary dismissal of one suggestion. */
    removeLearned?(caller: MemoryCaller, target: MemoryLinkedTarget): Promise<void>;
    dismissLearned?(caller: MemoryCaller, target: LinkedPlan["candidates"][number]): Promise<void> }) {}

  /** What was learned from this session but kept long-term (or still waiting): it is the session's to clear too. */
  private async learned(caller: MemoryCaller, scopes: readonly { scope: MemoryScope; owner: string }[]): Promise<Omit<LinkedPlan, "binding">> {
    const out: Omit<LinkedPlan, "binding"> = { memories: [], candidates: [] };
    if (!this.ports.sourceSession || !this.ports.removeLearned || !this.ports.dismissLearned) return out;
    const plain: MemoryCaller = { ...caller, memory_session: undefined };
    for (const where of scopes) {
      for (const one of await this.ports.scopes.located(plain, where.scope, where.owner))
        if (learnedInSession(caller, one.entry.meta, memorySources(this.ports.ledger, caller.actor_id, one.entry.memory_id), this.ports.sourceSession))
          out.memories.push({ scope: where.scope, owner: where.owner, memory_id: one.entry.memory_id, version: one.entry.version });
      const notes = new Set(this.ports.ledger.candidates(caller.actor_id).filter(note => note.scope === where.scope && note.owner === where.owner).map(note => note.candidate_id));
      for (const one of await this.ports.backend.withCaller(plain).candidates.list(where.scope, where.owner))
        if (one.state === "pending" && notes.has(one.candidate_id) && !this.ports.forgetting.hidden(where, "memory-candidate", one.candidate_id)
          && learnedInSession(caller, one.meta, one.sources ?? [], this.ports.sourceSession))
          out.candidates.push({ scope: where.scope, owner: where.owner, candidate_id: one.candidate_id, version: one.version });
    }
    return out;
  }

  private binding(caller: MemoryCaller): MemorySessionBinding {
    personOnly(caller, "只有本人能清除会话记忆");
    if (!caller.memory_session || caller.memory_session.session.session_id !== caller.session_id || caller.memory_session.target.project_id !== caller.project_id)
      throw memoryErrors.forbidden("会话清理需要原业务入口的当前绑定");
    return caller.memory_session;
  }
  private load(actor: string, preview_id: string, binding: MemorySessionBinding): MemorySessionClearPlan {
    const value = this.ports.ledger.marker(actor, MEMORY_SESSION_CLEAR_PREFIX + preview_id)?.body;
    if (!id(preview_id) || !isMemorySessionClearPlan(value) || value.actor_id !== actor || value.operation_id !== preview_id)
      throw memoryErrors.conflict("原会话清理计划不可核验，请核对原操作", { cleanup: "needs-reconcile" });
    if (!isDeepStrictEqual(value.binding, binding)) throw memoryErrors.forbidden("这份预览不属于当前业务会话");
    return value;
  }
  private accepted(plan: MemorySessionClearPlan): Map<string, boolean> {
    const facts = this.ports.ledger.forgetting.read().decisions;
    return new Map(plan.groups.map(group => {
      const decision = facts.find(one => one.actor_id === plan.actor_id && one.operation_id === group.operation_id);
      if (decision && !this.matches(group, decision)) throw memoryErrors.conflict("原会话清理决定与固定计划不一致", { cleanup: "needs-reconcile" });
      return [group.operation_id, !!decision];
    }));
  }
  private matches(group: Group, decision: MemoryForgettingDecision): boolean {
    return decision.selection_mode === "exact-identities" && decision.scope === group.scope && decision.owner === group.owner
      && isDeepStrictEqual(decision.memories, group.memories) && isDeepStrictEqual(decision.candidates, group.candidates) && decision.source_event_ids.length === 0;
  }
  acceptedBinding(actor: string, preview_id: string, binding: MemorySessionBinding): boolean {
    const plan = this.load(actor, preview_id, binding);
    return plan.started && [...this.accepted(plan).values()].every(Boolean);
  }
  authorizePurge(caller: Pick<MemoryCaller, "actor_id" | "memory_session">, target: MemorySessionPurgeTarget): boolean {
    if (!caller.memory_session) return false;
    const plan = this.load(caller.actor_id, target.selection.operation_id, caller.memory_session);
    return plan.started && [...this.accepted(plan).values()].every(Boolean) && plan.targets.some(item => isDeepStrictEqual(item, target));
  }
  async preview(caller: MemoryCaller): Promise<MemorySessionClearPreview> {
    const binding = this.binding(caller), backend = this.ports.backend.withCaller(caller);
    if (!backend.previewSessionPurge || !backend.purgeSessionTarget) throw memoryErrors.unavailable("当前运行时不能完整清理会话记忆");
    await this.ports.beforeEffect?.(); caller.signal?.throwIfAborted();
    const unchanged = await backend.observeWrites(), preview_id = this.ports.newId();
    const selection: MemorySessionPurgeSelection = { session_ref: { kind: "session", id: binding.session.session_id, revision: 1 }, operation_id: preview_id };
    const scopes = this.ports.scopes.scopesFor(caller, undefined, true), targets: MemorySessionPurgeTarget[] = [], seen = new Set<string>();
    for (const kind of ["memory", "memory-candidate"] as const) {
      let cursor: string | undefined; const cursors = new Set<string>();
      do {
        const page = await backend.previewSessionPurge({ kind, selection, ...(cursor ? { cursor } : {}), ...(caller.signal ? { signal: caller.signal } : {}) });
        if (page.outcome !== "completed" || page.issues.length) throw memoryErrors.unavailable("会话记忆扫描不完整，没有保存清理计划");
        for (const item of page.items) {
          if (item.kind !== kind || !id(item.id) || !Number.isSafeInteger(item.version) || item.version < 1
            || !scopes.some(where => where.scope === item.scope && where.owner === item.owner) || !isDeepStrictEqual(item.session_ref, selection.session_ref))
            throw memoryErrors.forbidden("会话记忆包含不可核验的固定身份，没有保存清理计划");
          const target: MemorySessionPurgeTarget = { kind, id: item.id, scope: item.scope as MemoryScope, owner: item.owner, version: item.version,
            selection, operation_id: this.ports.newId() };
          if (seen.has(key(target))) throw memoryErrors.conflict("会话扫描出现重复身份，没有保存清理计划");
          seen.add(key(target)); targets.push(target);
        }
        if (page.exhausted) break;
        if (!page.cursor || cursors.has(page.cursor)) throw memoryErrors.unavailable("会话扫描未完成，没有保存清理计划");
        cursor = page.cursor; cursors.add(cursor);
      } while (true);
    }
    const learned = await this.learned(caller, scopes);
    await this.ports.beforeEffect?.(); caller.signal?.throwIfAborted(); unchanged(); this.ports.assertCurrent?.();
    const counts = { memory_count: targets.filter(item => item.kind === "memory").length + learned.memories.length,
      candidate_count: targets.filter(item => item.kind === "memory-candidate").length + learned.candidates.length };
    if (!targets.length && !learned.memories.length && !learned.candidates.length) return { preview_id: null, memory_count: 0, candidate_count: 0 };
    if (learned.memories.length || learned.candidates.length)
      this.ports.ledger.setMarker(caller.actor_id, LINKED_PREFIX + preview_id, { binding: structuredClone(binding), ...learned } satisfies LinkedPlan, this.ports.now().toISOString());
    if (!targets.length) return { preview_id, ...counts };
    targets.sort(order);
    const groups: Group[] = [];
    for (const item of targets) {
      let group = groups.find(one => one.scope === item.scope && one.owner === item.owner);
      if (!group) { group = { scope: item.scope, owner: item.owner, operation_id: this.ports.newId(), memories: [], candidates: [] }; groups.push(group); }
      if (item.kind === "memory") group.memories.push({ memory_id: item.id, version: item.version });
      else group.candidates.push({ candidate_id: item.id, version: item.version });
    }
    const plan: MemorySessionClearPlan = { version: /* @version format.memory.session-clear-plan */ 1, actor_id: caller.actor_id, operation_id: preview_id, binding: structuredClone(binding),
      groups, targets, started: false, complete: false, done: 0 };
    this.ports.ledger.setMarker(caller.actor_id, MEMORY_SESSION_CLEAR_PREFIX + preview_id, plan, this.ports.now().toISOString());
    return { preview_id, ...counts };
  }
  private result(plan: MemorySessionClearPlan, accepted: Map<string, boolean>, failed?: number, conflict = false): MemorySessionClearResult {
    return { complete: plan.complete, items: plan.targets.map((target, index): MemorySessionClearItem => {
      const group = plan.groups.find(one => one.scope === target.scope && one.owner === target.owner)!;
      return { ...(target.kind === "memory" ? { kind: "memory" as const, memory_id: target.id } : { kind: "memory-candidate" as const, candidate_id: target.id }),
        outcome: index < plan.done ? "completed" : index === failed ? conflict ? "conflict" : "unknown" : "not-executed",
        forgetting: accepted.get(group.operation_id) ? "accepted" : "not-accepted", cleanup: index < plan.done ? "complete" : "pending" };
    }) };
  }
  async apply(caller: MemoryCaller, preview_id: string): Promise<MemorySessionClearResult> {
    const binding = this.binding(caller), body = id(preview_id) ? this.ports.ledger.marker(caller.actor_id, LINKED_PREFIX + preview_id)?.body as LinkedPlan | undefined : undefined;
    if (body && !isDeepStrictEqual(body.binding, binding)) throw memoryErrors.forbidden("这份预览不属于当前业务会话");
    const exact = !body || this.ports.ledger.marker(caller.actor_id, MEMORY_SESSION_CLEAR_PREFIX + preview_id) ? await this.applyExact(caller, preview_id) : { complete: true, items: [] };
    if (!body) return exact;
    const items = [...exact.items];
    let complete = exact.complete;
    const fail = (error: unknown): MemorySessionClearItem["outcome"] => {
      if (caller.signal?.aborted || error instanceof ActionError && (error.kind ?? platformErrorKind(error.code)) === "forbidden") throw error;
      complete = false;
      return error instanceof ActionError && (error.kind ?? platformErrorKind(error.code)) === "conflict" ? "conflict" : "unknown";
    };
    const plain: MemoryCaller = { ...caller, memory_session: undefined };
    for (const one of body.memories) {
      if (!complete) { items.push({ kind: "memory", memory_id: one.memory_id, outcome: "not-executed", forgetting: "not-accepted", cleanup: "pending" }); continue; }
      try {
        await this.ports.removeLearned!({ ...plain, operation_id: `${preview_id}:learned:${one.memory_id}` }, one);
        items.push({ kind: "memory", memory_id: one.memory_id, outcome: "completed", forgetting: "accepted", cleanup: "complete" });
      } catch (error) {
        const absent = error instanceof ActionError && error.code === "memory.not_found";
        items.push({ kind: "memory", memory_id: one.memory_id, outcome: absent ? "already-absent" : fail(error), forgetting: absent ? "accepted" : "not-accepted", cleanup: absent ? "complete" : "pending" });
      }
    }
    for (const one of body.candidates) {
      if (!complete) { items.push({ kind: "memory-candidate", candidate_id: one.candidate_id, outcome: "not-executed", forgetting: "not-accepted", cleanup: "pending" }); continue; }
      try {
        await this.ports.dismissLearned!({ ...plain, operation_id: `${preview_id}:learned:${one.candidate_id}` }, one);
        items.push({ kind: "memory-candidate", candidate_id: one.candidate_id, outcome: "completed", forgetting: "accepted", cleanup: "complete" });
      } catch (error) {
        // Forgetting a learned memory also forgets what shares its sources, so the suggestion may already be gone.
        const absent = error instanceof ActionError && error.code === "memory.not_found";
        items.push({ kind: "memory-candidate", candidate_id: one.candidate_id, outcome: absent ? "already-absent" : fail(error),
          forgetting: absent ? "accepted" : "not-accepted", cleanup: absent ? "complete" : "pending" });
      }
    }
    return { complete, items };
  }

  private async applyExact(caller: MemoryCaller, preview_id: string): Promise<MemorySessionClearResult> {
    const plan = this.load(caller.actor_id, preview_id, this.binding(caller)), backend = this.ports.backend.withCaller(caller);
    if (!backend.purgeSessionTarget) throw memoryErrors.unavailable("当前运行时不能继续原会话清理");
    const save = () => this.ports.ledger.setMarker(caller.actor_id, MEMORY_SESSION_CLEAR_PREFIX + preview_id, plan, this.ports.now().toISOString());
    await this.ports.beforeEffect?.(); caller.signal?.throwIfAborted();
    if (!plan.started) { plan.started = true; save(); }
    let currentGroup: Group | undefined;
    try {
      for (const group of plan.groups) {
        currentGroup = group;
        await this.ports.forgetting.acceptExact({ ...caller, operation_id: group.operation_id }, group, group);
      }
    } catch (error) {
      if (caller.signal?.aborted || error instanceof ActionError && ((error.kind ?? platformErrorKind(error.code)) === "forbidden" || error.details?.cleanup === "needs-reconcile" || error.details?.forgetting === "unknown")) throw error;
      let accepted: Map<string, boolean>;
      try { accepted = this.accepted(plan); }
      catch (readError) {
        if (readError instanceof ActionError && readError.details?.cleanup === "needs-reconcile") throw readError;
        throw memoryErrors.unavailable("原会话清理接受结果不可确认，请保留原预览核对", { operation_id: preview_id, forgetting: "unknown", cleanup: "pending" });
      }
      const failed = plan.targets.findIndex(target => target.scope === currentGroup?.scope && target.owner === currentGroup.owner);
      return this.result(plan, accepted, failed, error instanceof ActionError && error.kind === "conflict");
    }
    const accepted = this.accepted(plan);
    for (let index = plan.done; index < plan.targets.length; index++) {
      const target = plan.targets[index]!;
      try {
        await this.ports.beforeEffect?.(); caller.signal?.throwIfAborted();
        await backend.purgeSessionTarget({ ...target, ...(caller.signal ? { signal: caller.signal } : {}) });
        await this.ports.beforeEffect?.(); caller.signal?.throwIfAborted();
        this.ports.ledger.transaction(() => {
          if (target.kind === "memory") this.ports.ledger.forget(target.id, "exact-identities");
          else this.ports.ledger.dropCandidate(target.id);
          const next = { ...plan, done: index + 1, complete: index + 1 === plan.targets.length };
          this.ports.ledger.setMarker(caller.actor_id, MEMORY_SESSION_CLEAR_PREFIX + preview_id, next, this.ports.now().toISOString());
        });
        plan.done = index + 1; plan.complete = plan.done === plan.targets.length;
      } catch (error) {
        if (caller.signal?.aborted || error instanceof ActionError && (error.kind ?? platformErrorKind(error.code)) === "forbidden") throw error;
        return this.result(plan, accepted, index, error instanceof ActionError && error.kind === "conflict");
      }
    }
    return this.result(plan, accepted);
  }
}
