import type { MemoryChangeRecord, MemoryChangeRequest, MemoryChangeResult, MemoryLedgerPort, MemoryScope } from "@molis-ai/molis-work-contracts/services/memory";
import type { MemoryCaller } from "./service.js";
import type { MemoryBackendPort } from "./backend.js";
import { MemoryOperations, type MemoryPurgeTarget } from "./operations.js";
import type { MemoryPreferences } from "./preferences.js";
import type { Located, MemoryScopeCommands } from "./scope-commands.js";
import { fromEntryMeta, toEntryMeta } from "./facts.js";
import { memoryErrors } from "./errors.js";
import { assertManagedMemorySession } from "./classification.js";
import { placeOf } from "./places.js";
import { changeView } from "./shapes.js";

interface Ports {
  backend: MemoryBackendPort;
  ledger: MemoryLedgerPort;
  operations: MemoryOperations;
  scopes: MemoryScopeCommands;
  preferences: MemoryPreferences;
  date(at: string): string;
  bindTarget?(target: { scope: MemoryScope; owner: string; project: string | null }): void;
  purge(caller: MemoryCaller, target: MemoryPurgeTarget, version: number): Promise<void>;
  record(caller: MemoryCaller, target: Located): MemoryChangeRecord;
}

/** Cross-scope moves retain one creation identity, then finish the original source cleanup. */
export class MemoryMoves {
  constructor(private readonly ports: Ports) {}

  async change(caller: MemoryCaller, request: MemoryChangeRequest): Promise<MemoryChangeResult> {
    const to = request.to;
    if (to !== "personal" && to !== "project") throw memoryErrors.invalid("只能改为个人记忆或项目记忆");
    const { operations, scopes, preferences, ledger } = this.ports;
    const located = await scopes.find(caller, request.memory_id).catch(error => {
      if ((error as { code?: string }).code !== "memory.not_found") throw error;
      return undefined;
    });
    let source: MemoryPurgeTarget;
    if (located) assertManagedMemorySession(caller, located.entry.meta);
    if (located) {
      const previous = operations.find(caller, `change:${request.memory_id}`);
      if (request.expected_version !== undefined && request.expected_version !== located.entry.version && !previous)
        throw memoryErrors.conflict("记忆已变化，请重新查看后再决定");
      source = located;
    } else source = operations.purgeRecovery(caller, request.memory_id, `change:${request.memory_id}`, "move",
      scopes.scopesFor(caller, undefined, true), request.expected_version);
    if (source.scope === to) throw memoryErrors.invalid(to === "project" ? "它已经是项目记忆" : "它已经是个人记忆");
    this.ports.bindTarget?.({ scope: source.scope, owner: source.owner, project: source.scope === "project" ? source.owner : located?.project ?? null });
    const target = placeOf(caller, to);
    const stamp = located ? operations.begin(caller, `change:${request.memory_id}`, { kind: "move", scope: source.scope, owner: source.owner,
      memory_id: request.memory_id, expected_version: request.expected_version ?? located.entry.version, original_state: located.meta.state })
      : operations.find(caller, `change:${request.memory_id}`)!;
    if (request.expected_version !== undefined && request.expected_version !== stamp.expected_version
      || located && located.entry.version !== stamp.expected_version)
      throw memoryErrors.conflict("重试不能改变原先确认的记忆版本");
    const previous = operations.find(caller, "move-create");
    if (!located && !previous) throw memoryErrors.conflict("原移动缺少目标创建身份，不能重建目标");
    const move = previous ?? operations.begin(caller, "move-create", { kind: "append", scope: to, owner: target.owner });
    if (move.kind !== "append" || move.scope !== to || move.owner !== target.owner || move.phase === "closed")
      throw memoryErrors.conflict("原移动目标已关闭或与本次目标不一致");
    let destination: Located;
    if (move.result?.memory_id) {
      const found = (await scopes.located(caller, to, target.owner)).find(item => item.entry.memory_id === move.result!.memory_id);
      if (!found || found.entry.version !== move.result.version) throw memoryErrors.conflict("移动目标已有变化，不能把后来版本当成原移动结果");
      destination = found;
    } else {
      if (!located) throw memoryErrors.conflict("原移动缺少目标创建回执，源记忆已不可用；请核对现有目标，本操作不能自动继续");
      preferences.assertEnabled(caller.actor_id, { ...source, project: located.project ?? caller.project_id });
      preferences.assertEnabled(caller.actor_id, target);
      destination = await this.create(caller, located, to, target.owner, stamp.at, move.operation_id);
      caller.signal?.throwIfAborted();
      ledger.transaction(() => {
        operations.committed(caller, move, { memory_id: destination.entry.memory_id, version: destination.entry.version });
        ledger.addRevision(destination.entry.memory_id, { version: destination.entry.version, text: destination.entry.text,
          kind: destination.meta.kind, applies: destination.meta.applies, snapshot: { origin: destination.entry.origin, meta: destination.entry.meta },
          change: "created", by: "person", at: stamp.at });
      });
    }
    await this.ports.purge(caller, source, stamp.expected_version!);
    caller.signal?.throwIfAborted();
    const change = this.ports.record(caller, destination);
    return { memory: scopes.item(destination), change: changeView(change) };
  }

  private async create(caller: MemoryCaller, original: Located, scope: "personal" | "project", owner: string,
    at: string, operation_id: string): Promise<Located> {
    const date = this.ports.date(at), backend = this.ports.backend.withCaller(caller);
    const origin = scope === "personal" ? `${date} · 由项目记忆改为个人记忆` : `${date} · 由个人记忆改为项目记忆`;
    const moved = { ...original.meta, evidence: scope === "personal" ? original.meta.evidence.filter(item => item.kind === "said") : original.meta.evidence };
    let entry = await backend.write({ scope, owner, text: original.entry.text, origin, tags: [moved.source, moved.kind],
      meta: toEntryMeta(moved, original.entry.meta), operation_id, ...(caller.signal ? { signal: caller.signal } : {}) });
    // An append replay can return a later edit. It must never be recorded as the original creation.
    if (entry.version !== 1 && !this.ports.operations.find(caller, `move-${moved.state}:${entry.memory_id}`))
      throw memoryErrors.conflict("移动目标已有后来版本，不能补造创建历史");
    if (moved.state !== "active") {
      const input = { scope, owner, memory_id: entry.memory_id,
        ...this.ports.operations.formal(caller, { scope, owner, entry }, `move-${moved.state}`), reason: moved.state_reason ?? "保留原停用状态" };
      entry = moved.state === "disabled" ? await backend.disable(input) : await backend.pause(input);
    }
    const meta = fromEntryMeta({ ...entry, scope, owner });
    if (!meta || meta.state !== moved.state) throw memoryErrors.conflict("移动目标状态与原决定不一致");
    return { scope, owner, entry, meta, project: scope === "project" ? owner : null };
  }
}
