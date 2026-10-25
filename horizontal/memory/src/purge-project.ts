import type { MemoryLedgerPort, MemoryScope } from "@molis-ai/molis-work-contracts/services/memory";
import { projectPrefsKey } from "./prefs.js";
import type { MemoryBackendPort, MemoryCaller } from "./service.js";
import type { AgentMemoryExecutionControl, AgentMemoryScopePreview, AgentMemorySourceRef, AgentMemoryPurgeQuery } from "@molis-ai/molis-work-contracts/services/agent-host";
import { memoryErrors } from "./errors.js";
import { memorySourceLinks, suppressMemorySources } from "./promotion.js";

/** The Catalog retains this original, body-free decision before any SDK Session is purged. */
export interface ProjectMemoryPurgePlan {
  project_id: string;
  actor_id: string;
  operation_id: string;
  scopes: Array<{ scope: MemoryScope; owner: string;
    memories: Array<{ memory_id: string; version: number }>;
    candidates: Array<{ candidate_id: string; version: number }>;
    sources: AgentMemorySourceRef[] }>;
}

/** The existing owner supplies exact Session bindings; evidence references never enter this selection. */
export async function previewProjectMemoryPurge(ports: { backend: MemoryBackendPort | null; ledger: MemoryLedgerPort; caller: MemoryCaller },
  projectId: string, selection: { sessions: readonly NonNullable<AgentMemoryPurgeQuery["session_ref"]>[];
    scopes?: readonly { scope: "project" | "character"; owner: string }[] }): Promise<ProjectMemoryPurgePlan> {
  const { backend, ledger, caller } = ports;
  if (!caller.operation_id || !caller.person || caller.project_id !== projectId) throw memoryErrors.forbidden("缺少原项目删除身份");
  if (!backend) throw memoryErrors.unavailable("原记忆运行时不可用，不能确认项目记忆已穷尽");
  const scopes: Array<{ scope: MemoryScope; owner: string }> = [{ scope: "project", owner: projectId }];
  for (const found of selection.scopes ?? [...ledger.owners(projectId), ...ledger.candidateOwners(projectId)]) {
    if (found.scope === "character" && !scopes.some(item => item.scope === found.scope && item.owner === found.owner)) scopes.push({ scope: found.scope, owner: found.owner });
  }
  for (const target of selection.scopes ?? []) {
    if (target.scope === "project" && target.owner !== projectId) throw memoryErrors.forbidden("原记忆范围不属于当前项目");
    if (!scopes.some(item => item.scope === target.scope && item.owner === target.owner)) scopes.push(target);
  }
  if (selection.sessions.length) scopes.push({ scope: "personal", owner: caller.actor_id });
  const plan: ProjectMemoryPurgePlan = { project_id: projectId, actor_id: caller.actor_id, operation_id: caller.operation_id, scopes: [] };
  const bound = backend.withCaller(caller);
  for (const target of scopes) {
    const item: ProjectMemoryPurgePlan["scopes"][number] = { ...target, memories: [], candidates: [], sources: [] };
    const notes = ledger.candidates(caller.actor_id).filter(note => note.scope === target.scope && note.owner === target.owner);
    const sessions = target.scope === "personal" ? selection.sessions : [undefined];
    for (const session_ref of sessions) {
      for (const kind of ["memory", "memory-candidate"] as const) {
        let cursor: string | undefined;
        do {
          caller.signal?.throwIfAborted();
          const page = await bound.previewPurge({ ...target, kind, ...(session_ref ? { session_ref } : {}),
            ...(cursor ? { cursor } : {}), ...(caller.signal ? { signal: caller.signal } : {}) });
          if (page.outcome !== "completed" || page.issues.length) throw memoryErrors.conflict("项目记忆清理范围尚未完整确认，保留原件待核对");
          for (const entry of page.items) {
            if (entry.kind !== kind || entry.identity.owner !== target.owner || entry.identity.scope !== (target.scope === "personal" ? "user" : target.scope)
              || session_ref && (entry.session_ref?.id !== session_ref.id || entry.session_ref.revision !== session_ref.revision))
              throw memoryErrors.forbidden("清理预览与原范围或会话绑定不符");
            if (entry.kind === "memory") {
              if (!item.memories.some(saved => saved.memory_id === entry.memory_id)) item.memories.push({ memory_id: entry.memory_id, version: entry.expected_version });
            } else {
              if (!item.candidates.some(saved => saved.candidate_id === entry.candidate_id)) item.candidates.push({ candidate_id: entry.candidate_id, version: entry.expected_version });
              const sources = entry.sources ?? notes.find(note => note.candidate_id === entry.candidate_id)?.source_refs;
              if (sources === undefined) throw memoryErrors.conflict("候选原来源身份未记录，不能把未知来源当作已抑制");
              item.sources.push(...sources);
            }
          }
          if (page.exhausted) break;
          if (!page.cursor || page.cursor === cursor) throw memoryErrors.conflict("项目记忆尚未穷尽，不能冻结不完整清理范围");
          cursor = page.cursor;
        } while (true);
      }
    }
      if (target.scope !== "personal" && ledger.changes(caller.actor_id, Number.MAX_SAFE_INTEGER).some(note => note.scope === target.scope && note.owner === target.owner
        && note.memory_id && !ledger.marker("", `memory-forgotten:${note.memory_id}`)
        && !item.memories.some(entry => entry.memory_id === note.memory_id)))
        throw memoryErrors.conflict("项目正式账注仍有无法读取的原件，保留待核对");
      if (target.scope !== "personal" && notes.some(note => !item.candidates.some(entry => entry.candidate_id === note.candidate_id)))
        throw memoryErrors.conflict("项目候选仍有无法读取的原件，保留待核对");
      item.sources = [...item.sources, ...notes.filter(note => item.candidates.some(entry => entry.candidate_id === note.candidate_id)).flatMap(note => note.source_refs ?? []),
        ...item.memories.flatMap(entry => memorySourceLinks(ledger, caller.actor_id, entry.memory_id))]
        .map(source => ({ event_id: source.event_id, version: source.version }));
    plan.scopes.push(item);
  }
  return plan;
}

/** No re-list or new decision on retry. Source suppression remains outside the ledger's removable marker set. */
export async function applyProjectMemoryPurge(ports: { backend: MemoryBackendPort | null; ledger: MemoryLedgerPort; caller: MemoryCaller; control: AgentMemoryExecutionControl;
  verifyScopeCleanup(): Promise<void> },
  submitted: ProjectMemoryPurgePlan): Promise<void> {
  const plan = structuredClone(submitted), { ledger, caller } = ports;
  if (plan.actor_id !== caller.actor_id || plan.project_id !== caller.project_id || plan.operation_id !== caller.operation_id || !caller.person)
    throw memoryErrors.forbidden("项目记忆清理不属于原删除决定");
  if (!ports.backend) throw memoryErrors.unavailable("原记忆运行时不可用，保留原目标等待恢复");
  const bound = ports.backend.withCaller(caller);
  const current = () => { caller.signal?.throwIfAborted(); ports.control.assert_current(); };
  for (const target of plan.scopes) {
    await ports.control.beforeEffect(); current();
    suppressMemorySources(ledger, caller.actor_id, target.scope, target.owner, target.sources, new Date().toISOString());
    for (const entry of target.candidates) {
      await bound.candidates.purge({ scope: target.scope, owner: target.owner, candidate_id: entry.candidate_id,
        expected_version: entry.version, operation_id: `${plan.operation_id}:candidate:${entry.candidate_id}`, ...(caller.signal ? { signal: caller.signal } : {}) });
      await ports.control.beforeEffect(); current();
      ledger.dropCandidate(entry.candidate_id);
    }
    for (const entry of target.memories) {
      await bound.remove({ scope: target.scope, owner: target.owner, memory_id: entry.memory_id, expected_version: entry.version,
        operation_id: `${plan.operation_id}:memory:${entry.memory_id}`, ...(caller.signal ? { signal: caller.signal } : {}) });
      await ports.control.beforeEffect(); current();
      ledger.forget(entry.memory_id);
    }
  }
  // Preserve unselected ledger evidence until the owner proves the whole scope can close.
  await ports.verifyScopeCleanup(); current();
  // A personal scope is a fixed Session-bound selection, never the person's entire library.
  const scopes = plan.scopes.filter(item => item.scope !== "personal").map(({ scope, owner }) => ({ scope, owner }));
  await ports.control.beforeEffect(); current();
  ledger.forgetScopes({ scopes, project_id: plan.project_id, prefs_keys: [projectPrefsKey(plan.project_id)],
    signal_prefixes: scopes.map(item => `${item.scope}|${item.owner}|`), marker_keys: scopes.map(item => `tidy:${item.scope}:${item.owner}`) });
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
