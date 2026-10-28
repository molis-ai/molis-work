import type { ProjectSessionDeletionPlan, PrologueMemoryAdoptionBridge, PrologueMemoryAdoptionInput,
  PrologueMemoryAdoptionScope } from "@molis-ai/molis-work-service-agent-host";
import { memoryErrors, type MemoryBackendPort, type ProjectMemoryPurgePlan } from "@molis-ai/molis-work-service-memory";
import { prologueMemoryScope } from "./memory-backend.js";

export type ColdProjectMemoryInspection = Pick<PrologueMemoryAdoptionBridge, "inspectMemory" | "previewMemoryPurge" | "verifyPurgeCoverage" | "verifyProjectSessionPurge">;
export type ColdProjectMemoryWriter = Pick<PrologueMemoryAdoptionBridge, "purgeMemoryTarget" | "purgeSessionTarget"> & ColdProjectMemoryInspection;
export type ColdProjectMemoryPurgeTarget = NonNullable<PrologueMemoryAdoptionInput["memoryPurges"]>[number];

/** Selection pages can cross scopes. Validate every entry and issue before choosing the App scope. */
export function coldProjectMemoryReads(reader: ColdProjectMemoryInspection, fixed: {
  operationId: string; scopes: readonly PrologueMemoryAdoptionScope[]; current(): void;
}): Pick<MemoryBackendPort, "previewPurge" | "verifyPurgeCoverage"> {
  return {
    async verifyPurgeCoverage({ operation_id, known_scopes, ...page }) {
      fixed.current();
      const result = await reader.verifyPurgeCoverage({ ...page, operationId: operation_id, knownScopes: known_scopes });
      fixed.current(); return result;
    },
    async previewPurge({ scope, owner, session_ref, ...query }) {
      const sdkScope = prologueMemoryScope(scope);
      fixed.current();
      const page = await reader.previewMemoryPurge({ ...query, ...(session_ref
        ? { selection: { kind: "session", sessionRef: session_ref, operationId: fixed.operationId } }
        : { scope: sdkScope, owner }) });
      fixed.current();
      if (page.outcome !== "completed" || page.issues.length) throw memoryErrors.conflict("原会话记忆预览尚未完整确认");
      for (const item of page.items) {
        if (item.kind !== query.kind || !fixed.scopes.some(allowed => allowed.scope === item.identity.scope && allowed.owner === item.identity.owner)
          || session_ref && (item.sessionRef?.id !== session_ref.id || item.sessionRef.revision !== session_ref.revision)
          || !session_ref && (item.identity.scope !== sdkScope || item.identity.owner !== owner))
          throw memoryErrors.forbidden("记忆预览超出固定范围或原会话选集");
      }
      return { ...page, issues: [...page.issues], items: page.items.filter(item => item.identity.scope === sdkScope && item.identity.owner === owner).map(item => {
        const common = { identity: { scope: sdkScope, owner }, expected_version: item.expectedVersion,
          ...(item.sessionRef ? { session_ref: { ...item.sessionRef } } : {}) };
        return item.kind === "memory" ? { ...common, kind: item.kind, memory_id: item.ref.id, state: item.state }
          : { ...common, kind: item.kind, candidate_id: item.ref.id, state: item.state,
            sources: item.sources?.map(source => ({ event_id: source.eventId, version: source.version })) ?? null };
      }) };
    },
  };
}

/** Existing Catalog IDs/version remain the decision. Only a present exact original can supply its canonical Session ref. */
export async function inspectColdProjectMemoryTargets(reader: Pick<ColdProjectMemoryInspection, "inspectMemory">,
  plan: ProjectMemoryPurgePlan, sessions: ProjectSessionDeletionPlan, current: () => void, original = false) {
  const targets: ColdProjectMemoryPurgeTarget[] = [], cleared = new Set<string>();
  for (const scope of plan.scopes) {
    const identity = { scope: prologueMemoryScope(scope.scope), owner: scope.owner };
    const entries = [...scope.memories.map(item => ({ kind: "memory" as const, id: item.memory_id, version: item.version })),
      ...scope.candidates.map(item => ({ kind: "memory-candidate" as const, id: item.candidate_id, version: item.version }))];
    for (const item of entries) {
      const ref = { kind: item.kind, id: item.id, revision: 1 } as const;
      current(); const result = await reader.inspectMemory({ ref, identity }); current();
      if (result.state === "cleared") { cleared.add(`${item.kind}:${item.id}`); continue; }
      if (original || result.state !== "present") throw memoryErrors.conflict("原记忆尚未清除或原件身份不明");
      const target = result.target;
      if (target.ref.id !== item.id || target.ref.revision !== ref.revision || target.kind !== item.kind || target.expectedVersion !== item.version
        || target.identity.scope !== identity.scope || target.identity.owner !== identity.owner)
        throw memoryErrors.conflict("原记忆版本或归属已变化");
      if (scope.scope === "personal" && (!target.sessionRef || target.sessionRef.revision !== 1
        || !sessions.sessions.some(session => session.session.session_id === target.sessionRef!.id)))
        throw memoryErrors.forbidden("个人记忆不属于原会话删除计划");
      targets.push({ ref, identity, expectedVersion: item.version,
        operationId: `${plan.operation_id}:${item.kind === "memory" ? "memory" : "candidate"}:${item.id}`,
        ...(scope.scope === "personal" ? { selection: { kind: "session", sessionRef: target.sessionRef!, operationId: plan.operation_id } } : {}) });
    }
  }
  return { targets, cleared };
}
