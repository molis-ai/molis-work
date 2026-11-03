import type { MemoryLedgerPort, MemoryScope } from "@molis-ai/molis-work-contracts/services/memory";
import { projectPrefsKey } from "./prefs.js";
import type { MemoryBackendPort, MemoryCaller } from "./service.js";
import type { AgentMemoryScopePreview } from "@molis-ai/molis-work-contracts/services/agent-host";
import { memoryErrors } from "./errors.js";

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
  const scopes: Array<{ scope: MemoryScope; owner: string }> = [{ scope: "project", owner: projectId }];
  for (const found of [...ledger.owners(projectId), ...ledger.candidateOwners(projectId)]) {
    if (found.scope === "character" && !scopes.some(target => target.scope === "character" && target.owner === found.owner)) scopes.push({ scope: "character", owner: found.owner });
  }
  const forgotten = new Set<string>();
  if (backend) {
    if (!ports.caller?.operation_id) throw memoryErrors.forbidden("删除项目记忆必须由宿主提供当前本人授权和稳定操作号");
    const bound = backend.withCaller(ports.caller);
    for (const target of scopes) await purgeScope(bound, ledger, ports.caller, target, forgotten);
  }
  ledger.transaction(() => {
    for (const id of forgotten) ledger.forget(id);
    ledger.forgetScopes({ scopes, project_id: projectId, prefs_keys: [projectPrefsKey(projectId)],
      signal_prefixes: scopes.map(target => `${target.scope}|${target.owner}|`), marker_keys: scopes.map(target => `tidy:${target.scope}:${target.owner}`) });
  });
  return { removed: forgotten.size };
}

/** The deletion receipt retries the original SDK preview and candidate versions, never a new list of targets. */
async function purgeScope(backend: MemoryBackendPort, ledger: MemoryLedgerPort, caller: MemoryCaller,
  target: { scope: MemoryScope; owner: string }, forgotten: Set<string>): Promise<void> {
  const key = `memory-project-clear:${caller.operation_id}:${target.scope}:${target.owner}`;
  let plan = ledger.marker(caller.actor_id, key)?.body as { preview: AgentMemoryScopePreview; candidates: Array<{ candidate_id: string; version: number }> } | undefined;
  if (!plan) {
    plan = { preview: await backend.previewScope(target.scope, target.owner),
      candidates: (await backend.candidates.list(target.scope, target.owner)).map(item => ({ candidate_id: item.candidate_id, version: item.version })) };
    ledger.setMarker(caller.actor_id, key, plan, new Date().toISOString());
  }
  // A reserved candidate refuses purge until its original decision is explicitly reconciled by the current owner.
  for (const candidate of plan.candidates) await backend.candidates.purge({ ...target, candidate_id: candidate.candidate_id,
    expected_version: candidate.version, operation_id: `${plan.preview.operation_id}:candidate:${candidate.candidate_id}`,
    ...(caller.signal ? { signal: caller.signal } : {}) });
  const result = await backend.clearScope({ ...target, preview: plan.preview, operation_id: plan.preview.operation_id,
    ...(caller.signal ? { signal: caller.signal } : {}) });
  for (const item of result.items) if (item.outcome === "completed" || item.outcome === "already-absent") forgotten.add(item.memory_id);
  ledger.transaction(() => { for (const id of forgotten) ledger.forget(id); });
  if (result.items.some(item => item.outcome !== "completed" && item.outcome !== "already-absent")) {
    throw memoryErrors.conflict("项目记忆只完成了部分清理；保留原操作号与预览后重试，未知结果需要对账");
  }
}
