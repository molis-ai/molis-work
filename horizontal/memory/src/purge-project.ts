import type { MemoryLedgerPort, MemoryScope } from "@molis-ai/molis-work-contracts/services/memory";
import { projectPrefsKey } from "./prefs.js";
import type { MemoryBackendPort, MemoryCaller } from "./service.js";
import type { AgentMemoryScopePreview } from "@molis-ai/molis-work-contracts/services/agent-host";
import { memoryErrors } from "./errors.js";
import { randomUUID } from "node:crypto";
import { MemoryForgetting } from "./forgetting.js";
import { MemoryOperations } from "./operations.js";
import { memoryPromotionSources } from "./promotion.js";
import { isDeepStrictEqual } from "node:util";

function projectScopes(ledger: MemoryLedgerPort, projectId: string): Array<{ scope: MemoryScope; owner: string }> {
  const scopes: Array<{ scope: MemoryScope; owner: string }> = [{ scope: "project", owner: projectId }];
  for (const found of [...ledger.owners(projectId), ...ledger.candidateOwners(projectId)]) {
    if (found.scope === "character" && !scopes.some(target => target.scope === "character" && target.owner === found.owner)) scopes.push({ scope: "character", owner: found.owner });
  }
  return [scopes[0]!, ...scopes.slice(1).sort((a, b) => a.owner.localeCompare(b.owner))];
}

/**
 * The project is deleted: its memories and those of its Characters go from the store, every candidate waiting in their
 * boxes with them, and the ledger forgets them with their history (earlier texts, uses, changes, held candidates, pairs,
 * the project's switches and interface counts). No confirmation step: deleting the project was the person's confirmation.
 * Safe to run again; a scope written to between listing and clearing makes the store refuse, and the call fails so the
 * deletion's receipt retries it.
 *
 * A Character's scope is found from the owners the ledger noted for the project and from the notes on candidates held in
 * it (a suggestion made before its owner was noted still names its scope). `backend` is null where the Home has no Agent
 * runtime, so no store: only the ledger has anything to forget.
 */
export async function purgeProjectMemories(ports: { backend: MemoryBackendPort | null; ledger: MemoryLedgerPort; caller?: MemoryCaller }, projectId: string): Promise<{ removed: number }> {
  const { backend, ledger } = ports;
  if (!ports.caller?.operation_id) throw memoryErrors.forbidden("删除项目记忆必须由宿主提供当前本人授权和稳定操作号");
  const caller = ports.caller, now = () => new Date(), operations = new MemoryOperations(ledger, randomUUID, now);
  const scopeKey = `memory-project-clear:${caller.operation_id}`;
  const scopePlan = ledger.marker(caller.actor_id, scopeKey)?.body as { scopes: Array<{ scope: MemoryScope; owner: string }>; complete?: boolean } | undefined;
  if (scopePlan?.complete) return { removed: 0 };
  let scopes = scopePlan?.scopes;
  if (!scopes) {
    scopes = projectScopes(ledger, projectId);
    ledger.setMarker(caller.actor_id, scopeKey, { scopes }, now().toISOString());
  }
  const assertCurrent = () => {
    if (projectScopes(ledger, projectId).some(one => !scopes!.some(old => isDeepStrictEqual(old, one))))
      throw memoryErrors.conflict("项目记忆范围在固定选择后已变化，请核对原删除回执");
  };
  const forgetting = new MemoryForgetting({ backend, ledger, operations, promotions: memoryPromotionSources(ledger, now), assertCurrent });
  const forgotten = new Set<string>();
  const accepted = new Map<string, readonly { memory_id: string }[]>();
  // Freeze every scope's original SDK preview before the first irreversible acceptance or cleanup.
  if (backend) for (const target of scopes) await scopePlanFor(backend.withCaller(caller), ledger, caller, target);
  // Accept every fixed scope before any physical cleanup can fail and strand a later scope without restore protection.
  for (const target of scopes) {
    const scopeCaller = operations.child(caller, `project-delete:${target.scope}:${target.owner}`);
    try {
      const plan = backend ? await scopePlanFor(backend.withCaller(scopeCaller), ledger, caller, target) : undefined;
      const decision = await forgetting.prepareProjectScope(scopeCaller, target, plan?.preview.items ?? [], plan?.candidates ?? []);
      accepted.set(scopeCaller.operation_id!, decision?.memories ?? []);
    } catch (error) { forgetting.failed(scopeCaller, error); }
  }
  for (const target of scopes) {
    const scopeCaller = operations.child(caller, `project-delete:${target.scope}:${target.owner}`);
    try {
      const memories = accepted.get(scopeCaller.operation_id!)!;
      if (backend) await purgeScope(backend.withCaller(scopeCaller), ledger, caller, target, forgotten, memories);
      else for (const one of memories) forgotten.add(one.memory_id);
    } catch (error) { forgetting.failed(scopeCaller, error); }
  }
  // Demo reset keeps the project live. A later, unselected write must not lose its ledger projection in forgetScopes.
  let unchanged: (() => void) | undefined;
  if (backend) {
    const bound = backend.withCaller(caller);
    unchanged = await bound.observeWrites();
    for (const target of scopes) {
      if ((await bound.list(target.scope, target.owner)).length || (await bound.candidates.list(target.scope, target.owner)).length)
        throw memoryErrors.conflict("固定选择清理后出现其它记忆身份，不能按旧回执清空新记录");
    }
  }
  caller.signal?.throwIfAborted();
  unchanged?.();
  assertCurrent();
  ledger.transaction(() => {
    for (const id of forgotten) ledger.forget(id, "related");
    ledger.forgetScopes({ scopes, project_id: projectId, prefs_keys: [projectPrefsKey(projectId)],
      signal_prefixes: scopes.map(target => `${target.scope}|${target.owner}|`), marker_keys: scopes.map(target => `tidy:${target.scope}:${target.owner}`) });
    ledger.setMarker(caller.actor_id, scopeKey, { scopes, complete: true }, now().toISOString());
  });
  return { removed: forgotten.size };
}

async function scopePlanFor(backend: MemoryBackendPort, ledger: MemoryLedgerPort, caller: MemoryCaller, target: { scope: MemoryScope; owner: string }) {
  const key = `memory-project-clear:${caller.operation_id}:${target.scope}:${target.owner}`;
  let plan = ledger.marker(caller.actor_id, key)?.body as { preview: AgentMemoryScopePreview; candidates: Array<{ candidate_id: string; version: number }> } | undefined;
  if (!plan) {
    plan = { preview: await backend.previewScope(target.scope, target.owner),
      candidates: (await backend.candidates.list(target.scope, target.owner)).map(item => ({ candidate_id: item.candidate_id, version: item.version })) };
    ledger.setMarker(caller.actor_id, key, plan, new Date().toISOString());
  }
  return plan;
}

/** The deletion receipt retries the original SDK preview and candidate versions, never a new list of targets. */
async function purgeScope(backend: MemoryBackendPort, ledger: MemoryLedgerPort, caller: MemoryCaller,
  target: { scope: MemoryScope; owner: string }, forgotten: Set<string>, accepted: readonly { memory_id: string }[]): Promise<void> {
  const plan = await scopePlanFor(backend, ledger, caller, target);
  // A reserved candidate refuses purge until its original decision is explicitly reconciled by the current owner.
  for (const candidate of plan.candidates) await backend.candidates.purge({ ...target, candidate_id: candidate.candidate_id,
    expected_version: candidate.version, operation_id: `${plan.preview.operation_id}:candidate:${candidate.candidate_id}`,
    ...(caller.signal ? { signal: caller.signal } : {}) });
  const result = await backend.clearScope({ ...target, preview: plan.preview, operation_id: plan.preview.operation_id,
    ...(caller.signal ? { signal: caller.signal } : {}) });
  for (const item of result.items) if (item.outcome === "completed" || item.outcome === "already-absent") forgotten.add(item.memory_id);
  ledger.transaction(() => { for (const id of forgotten) ledger.forget(id, "related"); });
  if (result.items.some(item => item.outcome !== "completed" && item.outcome !== "already-absent")) {
    throw memoryErrors.conflict("项目记忆只完成了部分清理；保留原操作号与预览后重试，未知结果需要对账");
  }
  for (const one of accepted) forgotten.add(one.memory_id);
}
