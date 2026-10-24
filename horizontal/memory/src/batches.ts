import { MEMORY_BATCH_MAX_ITEMS, type MemoryBatchItem, type MemoryBatchPreview, type MemoryBatchRequest, type MemoryBatchResult,
  type MemoryChangeRequest, type MemoryChangeResult, type MemoryLedgerPort } from "@molis-ai/molis-work-contracts/services/memory";
import type { MemoryBackendPort } from "./backend.js";
import type { MemoryCaller } from "./service.js";
import { MemoryOperations, type MemorySelection } from "./operations.js";
import { MemoryScopeCommands } from "./scope-commands.js";
import { memoryErrors } from "./errors.js";
import { personOnly } from "./places.js";

interface BatchPorts {
  backend: MemoryBackendPort; ledger: MemoryLedgerPort; operations: MemoryOperations; scopes: MemoryScopeCommands;
  newId(): string; maxItems?: number; beforeEffect?(): void | Promise<void>;
  bindTarget?(target: { scope: MemoryBatchItem["scope"]; owner: string; project: string | null }): void;
  change(caller: MemoryCaller, request: MemoryChangeRequest): Promise<MemoryChangeResult>;
}

/** Fixed, body-free selections; every mutation and recovery remains owned by Service.change. */
export class MemoryBatches {
  private readonly maxItems: number;
  constructor(private readonly ports: BatchPorts) {
    this.maxItems = ports.maxItems ?? MEMORY_BATCH_MAX_ITEMS;
    if (!Number.isSafeInteger(this.maxItems) || this.maxItems < 1 || this.maxItems > MEMORY_BATCH_MAX_ITEMS)
      throw memoryErrors.invalid("批量选择上限必须为 1 到 100");
  }

  async preview(inputCaller: MemoryCaller, request: MemoryBatchRequest): Promise<MemoryBatchPreview> {
    const caller = this.ports.operations.caller(inputCaller);
    personOnly(caller, "只有本人能确认批量记忆操作");
    if (!request || !["disable", "remove"].includes(request.action) || !Array.isArray(request.items)
      || !request.items.length || request.items.length > this.maxItems) throw memoryErrors.invalid("请选择 1 到 100 条记忆并指定停用或遗忘");
    const items = request.items.map(item => {
      if (!item || !["personal", "project", "character"].includes(item.scope) || typeof item.owner !== "string" || !item.owner || item.owner.length > 200
        || typeof item.memory_id !== "string" || !item.memory_id || item.memory_id.length > 200
        || !Number.isSafeInteger(item.expected_version) || item.expected_version < 1) throw memoryErrors.invalid("选集需要原范围、所属者、身份和版本");
      return { scope: item.scope, owner: item.owner, memory_id: item.memory_id, expected_version: item.expected_version };
    });
    if (new Set(items.map(item => JSON.stringify([item.scope, item.owner, item.memory_id]))).size !== items.length)
      throw memoryErrors.invalid("同一条记忆不能重复选择");
    const previewId = caller.operation_id!;
    const previous = this.ports.operations.selection(caller, previewId);
    const selection = previous ?? { action: request.action, items, project_id: caller.project_id, children: items.map(() => this.ports.newId()) };
    if (selection.action !== request.action || JSON.stringify(selection.items) !== JSON.stringify(items))
      throw memoryErrors.conflict("同一预览操作号不能改变动作、选集或版本");
    this.assertSelection(caller, selection);
    if (!previous) for (const [index, item] of selection.items.entries()) {
      this.bind(caller, item);
      await this.previewItem({ ...caller, operation_id: selection.children[index]! }, item, selection.action);
    }
    await this.ports.beforeEffect?.(); caller.signal?.throwIfAborted();
    this.assertSelection(caller, selection);
    this.ports.operations.saveSelection(caller, previewId, selection);
    return { preview_id: previewId, action: selection.action, items: structuredClone(selection.items), max_items: this.maxItems };
  }

  async apply(caller: MemoryCaller, previewId: string): Promise<MemoryBatchResult> {
    personOnly(caller, "只有本人能执行批量记忆操作");
    if (typeof previewId !== "string" || !previewId || previewId.length > 200) throw memoryErrors.invalid("需要原预览身份");
    const selection = this.ports.operations.selection(caller, previewId);
    if (!selection) throw memoryErrors.not_found("找不到本人的原预览，请重新选择");
    this.assertSelection(caller, selection);
    const items: MemoryBatchResult["items"] = [];
    let stopped = false;
    for (const [index, item] of selection.items.entries()) {
      if (stopped || caller.signal?.aborted) { stopped = true; items.push({ ...item, outcome: "not-executed" }); continue; }
      const child = { ...caller, operation_id: selection.children[index]! };
      try {
        this.assertSelection(caller, selection);
        this.bind(caller, item);
        await this.ports.beforeEffect?.(); caller.signal?.throwIfAborted();
        const kind = selection.action === "disable" ? "disabled" : "removed";
        const receipt = this.ports.ledger.change("change-" + child.operation_id + ":" + kind + ":" + item.memory_id);
        if (receipt) {
          if (receipt.actor_id !== caller.actor_id || receipt.scope !== item.scope || receipt.owner !== item.owner
            || receipt.memory_id !== item.memory_id || receipt.operation_id !== child.operation_id || receipt.kind !== kind)
            throw memoryErrors.conflict("原完成回执不属于这个目标");
          items.push({ ...item, outcome: "completed", change_id: receipt.change_id });
          continue;
        }
        // The existing child marker is necessary to reconcile an interrupted SDK step.
        if (!this.ports.operations.find(child, (selection.action === "disable" ? "disabled:" : "purge:") + item.memory_id)
          && !(selection.action === "disable" && this.ports.operations.find(child, "facts:" + item.memory_id)))
          await this.previewItem(child, item, selection.action);
        await this.ports.beforeEffect?.(); caller.signal?.throwIfAborted();
        this.assertSelection(caller, selection);
        const request = { action: selection.action, memory_id: item.memory_id, expected_version: item.expected_version };
        this.ports.operations.changeRequest(child, request, { scope: item.scope, owner: item.owner, version: item.expected_version });
        const result = await this.ports.change(child, request);
        items.push({ ...item, outcome: "completed", change_id: result.change.change_id });
      } catch (error) {
        const code = error !== null && typeof error === "object" && "code" in error ? error.code : undefined;
        const outcome = code === "memory.conflict" || code === "agent.memory_conflict" || code === "STORAGE_CONFLICT" ? "conflict"
          : ["memory.forbidden", "memory.scope", "MEMORY_SCOPE_DENIED"].includes(String(code)) ? "refused" : "unknown";
        items.push({ ...item, outcome });
        // A grant failure may happen after partial cleanup; it is not a zero-effect claim.
        if (outcome === "unknown" || caller.signal?.aborted) stopped = true;
      }
    }
    return { preview_id: previewId, action: selection.action, complete: items.every(item => item.outcome === "completed"), items };
  }

  private assertSelection(caller: MemoryCaller, selection: MemorySelection): void {
    if (selection.project_id !== caller.project_id) throw memoryErrors.scope("原预览不属于当前项目");
    if (!selection.items.length || selection.items.length > this.maxItems || selection.children.length !== selection.items.length)
      throw memoryErrors.conflict("原预览不完整或超过本次限额");
    const scopes = this.ports.scopes.scopesFor(caller, undefined, true);
    if (selection.items.some(item => !scopes.some(scope => scope.scope === item.scope && scope.owner === item.owner)))
      throw memoryErrors.scope("原选集不在本次管理范围内");
  }

  private bind(caller: MemoryCaller, item: MemoryBatchItem): void {
    this.ports.bindTarget?.({ scope: item.scope, owner: item.owner, project: item.scope === "personal" ? null : caller.project_id });
  }

  private async previewItem(caller: MemoryCaller, item: MemoryBatchItem, action: MemoryBatchRequest["action"]): Promise<void> {
    caller.signal?.throwIfAborted();
    await this.ports.backend.withCaller(caller).previewMutation({ ...item,
      operation_id: caller.operation_id + ":" + (action === "disable" ? "disabled" : "purge") + ":" + item.memory_id,
      ...(caller.signal ? { signal: caller.signal } : {}),
      mutation: action === "disable" ? { kind: "disable", reason: "你停用了" } : { kind: "purge" } });
  }
}
