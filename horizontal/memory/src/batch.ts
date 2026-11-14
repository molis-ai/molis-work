import type { AgentMemoryBatchPreview, AgentMemoryClearResult } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { MemoryBatchPreview, MemoryBatchRequest, MemoryBatchResult, MemoryLedgerPort, MemoryScope } from "@molis-ai/molis-work-contracts/services/memory";
import type { MemoryBackendPort } from "./backend.js";
import type { MemoryCaller } from "./service.js";
import { MemoryOperations } from "./operations.js";
import { MemoryScopeCommands } from "./scope-commands.js";
import { MemoryForgetting } from "./forgetting.js";
import { assertManagedMemorySession } from "./classification.js";
import { memoryErrors } from "./errors.js";
import { personOnly, placeOf } from "./places.js";

type Group = { scope: MemoryScope; owner: string; preview: AgentMemoryBatchPreview; results: MemoryBatchResult["items"] };
type Plan = { scope: MemoryScope; owner: string; action: MemoryBatchRequest["action"]; operation_id: string;
  binding: string; selection: string[]; groups: Group[]; started: boolean; complete: boolean };
const prefix = "memory-batch:";
const binding = (caller: MemoryCaller) => JSON.stringify([caller.actor_id, caller.project_id, caller.consumer, caller.current_scene ?? "common",
  ...(caller.memory_session ? [caller.memory_session] : [])]);
const finished = (outcome: string) => outcome === "completed" || outcome === "already-absent";

/** Selected-version preview, original SDK operations and their ledger closure; no second mutation engine. */
export class MemoryBatch {
  constructor(private readonly ports: { backend: MemoryBackendPort; ledger: MemoryLedgerPort; operations: MemoryOperations;
    scopes: MemoryScopeCommands; forgetting: MemoryForgetting; newId(): string; now(): Date; beforeEffect?(): void | Promise<void>;
    record(caller: MemoryCaller, item: { scope: MemoryScope; owner: string; memory_id: string; action: "disable" | "remove"; text: string; version?: number }): void }) {}

  async preview(caller: MemoryCaller, request: MemoryBatchRequest): Promise<MemoryBatchPreview> {
    personOnly(caller, "只有本人能预览记忆批量操作");
    const { signal, ...identity } = this.ports.operations.caller(caller);
    caller = Object.freeze({ ...structuredClone(identity), ...(signal ? { signal } : {}) });
    request = structuredClone(request);
    if (!["disable", "remove"].includes(request.action) || !Array.isArray(request.items) || !request.items.length || request.items.length > 100)
      throw memoryErrors.invalid("请选择不超过100条记忆并明确停用或遗忘");
    const where = placeOf(caller, request.scope), scopes = this.ports.scopes.scopesFor(caller, request.scope === "project" ? ["project", "character"] : [request.scope]);
    const groups: Group[] = [], seen = new Set<string>();
    const backend = this.ports.backend.withCaller(caller);
    for (const item of request.items) {
      if (typeof item.memory_id !== "string" || !Number.isSafeInteger(item.expected_version) || item.expected_version < 1 || seen.has(item.memory_id))
        throw memoryErrors.invalid("批量选择需要不重复的原身份和所见版本");
      seen.add(item.memory_id);
      const located = await this.ports.scopes.find(caller, item.memory_id);
      if (request.action === "disable") assertManagedMemorySession(caller, located.entry.meta);
      if (!scopes.some(one => one.scope === located.scope && one.owner === located.owner)) throw memoryErrors.scope("选中记忆不在当前管理范围");
      if (located.entry.version !== item.expected_version) throw memoryErrors.conflict("选中记忆已有新版本，请重新查看");
      let group = groups.find(one => one.scope === located.scope && one.owner === located.owner);
      if (!group) {
        group = { scope: located.scope, owner: located.owner, preview: { operation_id: this.ports.newId(), items: [],
          decision: { version: 1, binding: "", scope: located.scope === "personal" ? "user" : located.scope, owner: located.owner, items: [] } }, results: [] };
        groups.push(group);
      }
      group.preview.items.push({ memory_id: item.memory_id, version: item.expected_version });
    }
    for (const group of groups) group.preview = await backend.previewBatch({ ...group, items: group.preview.items,
      action: request.action, operation_id: group.preview.operation_id, ...(caller.signal ? { signal: caller.signal } : {}) });
    await this.ports.beforeEffect?.(); caller.signal?.throwIfAborted();
    const preview_id = this.ports.newId(), plan: Plan = { scope: where.scope, owner: where.owner, action: request.action, operation_id: caller.operation_id!,
      binding: binding(caller), selection: request.items.map(item => item.memory_id), groups, started: false, complete: false };
    this.ports.ledger.setMarker(caller.actor_id, prefix + preview_id, plan, this.ports.now().toISOString());
    return { preview_id, action: request.action, count: request.items.length };
  }

  private load(caller: MemoryCaller, preview_id: string): { plan: Plan; at: string } {
    const stored = this.ports.ledger.marker(caller.actor_id, prefix + preview_id), plan = stored?.body as Plan | undefined;
    if (!plan || !["disable", "remove"].includes(plan.action) || plan.binding !== binding(caller) || !Array.isArray(plan.groups) || !plan.groups.length
      || !Array.isArray(plan.selection) || typeof plan.started !== "boolean" || typeof plan.complete !== "boolean" || typeof plan.operation_id !== "string"
      || Object.keys(plan).some(key => !["scope", "owner", "action", "operation_id", "binding", "selection", "groups", "started", "complete"].includes(key)))
      throw memoryErrors.conflict("原批量预览不可核验，请核对原操作");
    const scopes = this.ports.scopes.scopesFor(caller, plan.scope === "project" ? ["project", "character"] : [plan.scope]);
    const ids = new Set<string>();
    for (const group of plan.groups) {
      if (!scopes.some(one => one.scope === group.scope && one.owner === group.owner)) throw memoryErrors.scope("原批量操作不在当前范围");
      const preview = group.preview;
      if (!Array.isArray(group.results) || !preview || !Array.isArray(preview.items) || !Array.isArray(preview.decision?.items) || preview.items.length !== preview.decision.items.length
        || preview.decision.owner !== group.owner || preview.decision.scope !== (group.scope === "personal" ? "user" : group.scope))
        throw memoryErrors.conflict("原批量预览缺少完整固定选择");
      for (const [index, item] of preview.items.entries()) {
        const decision = preview.decision.items[index];
        if (!item || !Number.isSafeInteger(item.version) || item.version < 1 || ids.has(item.memory_id)
          || decision?.ref.id !== item.memory_id || decision.ref.kind !== "memory" || decision.ref.revision !== 1
          || decision.expectedVersion !== item.version || decision.operationId !== `${preview.operation_id}:${item.memory_id}`
          || decision.mutation.kind !== (plan.action === "remove" ? "purge" : "disable")) throw memoryErrors.conflict("原批量目标或操作已不一致");
        ids.add(item.memory_id);
      }
    }
    if (plan.selection.length !== ids.size || new Set(plan.selection).size !== ids.size || plan.selection.some(id => !ids.has(id)))
      throw memoryErrors.conflict("原批量选择顺序缺失或不一致");
    return { plan: structuredClone(plan), at: stored!.at };
  }

  private result(caller: MemoryCaller, plan: Plan): MemoryBatchResult {
    const accepted = this.ports.ledger.forgetting.read().decisions;
    const items = plan.groups.flatMap(group => group.preview.items.map(item => group.results.find(one => one.memory_id === item.memory_id)
      ?? { memory_id: item.memory_id, outcome: "not-executed" as const,
        forgetting: accepted.some(one => one.actor_id === caller.actor_id && one.operation_id === group.preview.operation_id) ? "accepted" as const : "not-accepted" as const,
        cleanup: "pending" as const }));
    items.sort((left, right) => plan.selection.indexOf(left.memory_id) - plan.selection.indexOf(right.memory_id));
    return { complete: items.every(item => finished(item.outcome) && item.cleanup === "complete"), items };
  }

  async apply(caller: MemoryCaller, preview_id: string): Promise<MemoryBatchResult> {
    personOnly(caller, "只有本人能执行记忆批量操作");
    const { signal, ...identity } = caller;
    caller = Object.freeze({ ...structuredClone(identity), ...(signal ? { signal } : {}) });
    caller.signal?.throwIfAborted();
    const { plan, at } = this.load(caller, preview_id);
    if (plan.complete) return this.result(caller, plan);
    if (plan.action === "disable") for (const group of plan.groups) {
      const current = await this.ports.backend.withCaller(caller).list(group.scope, group.owner);
      for (const target of group.preview.items) {
        const entry = current.find(one => one.memory_id === target.memory_id);
        if (entry) assertManagedMemorySession(caller, entry.meta);
      }
    }
    const save = () => this.ports.ledger.setMarker(caller.actor_id, prefix + preview_id, plan, at);
    await this.ports.beforeEffect?.(); caller.signal?.throwIfAborted();
    plan.started = true; save();
    if (plan.action === "remove") for (const group of plan.groups) {
      try { await this.ports.forgetting.accept({ ...caller, operation_id: group.preview.operation_id }, { scope: group.scope, owner: group.owner }, group.preview.items); }
      catch (error) { caller.signal?.throwIfAborted(); this.ports.forgetting.failed({ ...caller, operation_id: group.preview.operation_id }, error); }
    }
    for (const group of plan.groups) {
      if (group.results.length === group.preview.items.length && group.results.every(item => finished(item.outcome) && item.cleanup === "complete")) continue;
      const child = { ...caller, operation_id: group.preview.operation_id }, backend = this.ports.backend.withCaller(child);
      try {
        if (plan.action === "remove") await this.ports.forgetting.prepare(child, { scope: group.scope, owner: group.owner }, group.preview.items);
        const result = await backend.applyBatch({ preview: group.preview, ...(caller.signal ? { signal: caller.signal } : {}) });
        await this.closeGroup(child, plan.action, group, result, backend, () => { plan.complete = this.result(caller, plan).complete; save(); });
        if (result.items.some(item => item.outcome === "unknown")) break;
      } catch (error) {
        caller.signal?.throwIfAborted();
        if (plan.action === "remove") this.ports.forgetting.failed(child, error);
        throw error;
      }
    }
    return this.result(caller, plan);
  }

  private async closeGroup(caller: MemoryCaller, action: Plan["action"], group: Group, result: AgentMemoryClearResult,
    backend: MemoryBackendPort, save: () => void): Promise<void> {
    const entries = action === "disable" ? await backend.list(group.scope, group.owner) : [];
    const closed: MemoryBatchResult["items"] = [];
    for (const original of group.preview.items) {
      const item = result.items.find(one => one.memory_id === original.memory_id);
      if (!item) throw memoryErrors.conflict("SDK批量回执没有覆盖原选择，尚需对账");
      let known = action === "remove";
      if (action === "disable" && item.outcome === "completed") {
        const entry = entries.find(one => one.memory_id === original.memory_id && one.version === item.version);
        const revision = this.ports.ledger.revisions(original.memory_id).find(one => one.version === original.version);
        known = entry !== undefined || revision !== undefined;
      }
      closed.push({ memory_id: item.memory_id, outcome: item.outcome, forgetting: action === "remove" ? "accepted" : "not-accepted",
        cleanup: finished(item.outcome) ? known ? "complete" : "needs-reconcile" : "pending" });
    }
    await this.ports.beforeEffect?.(); caller.signal?.throwIfAborted();
    this.ports.ledger.transaction(() => {
      for (const item of closed) if (finished(item.outcome) && item.cleanup === "complete") {
        const actual = result.items.find(one => one.memory_id === item.memory_id)!;
        if (action === "remove") this.ports.ledger.forget(item.memory_id, "related");
        const original = group.preview.items.find(one => one.memory_id === item.memory_id)!;
        const entry = entries.find(one => one.memory_id === item.memory_id && one.version === actual.version);
        const revision = this.ports.ledger.revisions(item.memory_id).find(one => one.version === original.version);
        this.ports.record(caller, { scope: group.scope, owner: group.owner, memory_id: item.memory_id, action,
          text: action === "remove" ? "" : entry?.text ?? revision!.text, ...(actual.version === undefined ? {} : { version: actual.version }) });
      }
      group.results = closed; save();
    });
  }
}
