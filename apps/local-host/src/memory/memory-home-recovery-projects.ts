import { isDeepStrictEqual } from "node:util";
import type { MemoryHomeRecoveryDecision } from "@molis-ai/molis-work-contracts/services/memory";
import type { ProjectSessionDeletionPlan } from "@molis-ai/molis-work-service-agent-host";
import { memoryErrors } from "@molis-ai/molis-work-service-memory";
import { openProjectDeletionRecoveryInspection } from "../project-deletion-recovery-inspection.js";
import { openProjectDeletionRecoveryTarget, type ProjectDeletionCatalogSnapshot } from "../project-deletion-recovery-target.js";
import type { ProjectDeletedOwner } from "../project-deleted-hooks.js";
import type { ProjectDeletionPreparation } from "../project-deletion-recovery.js";
import type { SessionBusinessPurgeOwner } from "../session-business-purge.js";
import { openAssistantMemoryRelations } from "../assistant/assistant-memory-relations.js";
import { createColdMemoryProjectOwner } from "./memory-cold-project-owner.js";
import type { MemoryOwnerCoverage } from "./memory-owner-coverage.js";
import { recoveryNextCursor } from "./memory-home-recovery-source.js";
import { recoverySdkResources, retainRecoveryFailure, type MemoryHomeRecoveryFrame } from "./memory-home-recovery-resources.js";

export type MemoryHomeRecoveryPlatform = Parameters<typeof openProjectDeletionRecoveryTarget>[1];
const invalid = () => memoryErrors.conflict("项目恢复必须沿原 Catalog 计划及完整当前归属继续");
type Input = { frame: MemoryHomeRecoveryFrame; homeDirectory: string; sourceDirectory: string;
  decision: MemoryHomeRecoveryDecision; source: ProjectDeletionCatalogSnapshot; coverage: MemoryOwnerCoverage;
  business: SessionBusinessPurgeOwner; platform: MemoryHomeRecoveryPlatform };

/** The original Catalog supplies every project decision. This adapter only binds its current SDK interval. */
function projectMemory(input: Input) {
  const { frame, decision } = input;
  let sdk: ReturnType<typeof recoverySdkResources> | undefined;
  const knownScopes = decision.known_scopes.map(item => ({ ...item, scope: item.scope === "personal" ? "user" as const : item.scope }));
  const sourcePlan = (request: ProjectDeletionPreparation): ProjectSessionDeletionPlan => {
    if (request.original?.kind === "runtime") return request.original.sessions;
    const group = decision.project_groups.find(item => item.project_id === request.project_id);
    const sourceId = group?.targets.find(item => item.target_deletion_id === request.operation_id)?.source_deletion_id;
    const source = input.source.receipts.find(item => item.deletion_id === sourceId);
    if (!source || source.project_id !== request.project_id) throw invalid();
    return source.recovery.kind === "runtime" ? source.recovery.sessions
      : { project_id: request.project_id, operation_id: request.operation_id, sessions: [] };
  };
  const original = createColdMemoryProjectOwner({ homeDirectory: input.homeDirectory, assertCurrent: frame.current,
    ledgerExpected: () => frame.expected().snapshot, ledgerCommitted: frame.ledgerCommitted,
    async prepareProject(request) {
      if (!sdk) throw invalid();
      const source = sourcePlan(request);
      let assistant: ReturnType<typeof openAssistantMemoryRelations>;
      try { assistant = openAssistantMemoryRelations({ homeDirectory: input.homeDirectory, assertCurrent: frame.current }); }
      catch (error) { return retainRecoveryFailure(frame, error); }
      const closeAssistant = frame.retain(assistant);
      try {
        for (const relation of assistant.projectSessions(request.project_id)) {
          if (!source.sessions.some(item => isDeepStrictEqual(item.session, relation.session) && isDeepStrictEqual(item.owner, relation.owner))) throw invalid();
        }
      } finally { await closeAssistant(); }
      const sessions = await sdk.inspect(async reader => {
        let cursor: string | undefined;
        do {
          frame.current(); const page = await reader.inspectSessionIndexes({ ...(cursor ? { cursor } : {}) }); frame.current();
          for (const item of page.facts) {
            const held = source.sessions.find(target => target.session.session_id === item.sessionRef.id);
            if (item.owner.project_id === request.project_id && !held || held && !isDeepStrictEqual(held.owner, item.owner)) throw invalid();
          }
          cursor = recoveryNextCursor(page, cursor);
        } while (cursor !== undefined);
        return request.original?.kind === "runtime" ? structuredClone(request.original.sessions)
          : reader.prepareProjectSessionPurge({ sourcePlan: source, operationId: request.operation_id });
      });
      return { knownScopes, scopes: input.coverage.forProject(request.project_id), sessions };
    },
    withInspection: work => { if (!sdk) throw invalid(); return sdk.inspect(work); },
    withWriter: (selection, work) => {
      if (!sdk) throw invalid();
      return sdk.write({ memoryPurges: selection.memoryPurges, projectSessionPurges: [selection.sessionPlan] }, work);
    },
  });
  const withRecovery: NonNullable<ProjectDeletedOwner["withRecovery"]> = async (request, work) => {
    if (sdk) throw invalid();
    const fixed = structuredClone(request), plan = sourcePlan(fixed);
    sdk = recoverySdkResources(frame, input.homeDirectory, knownScopes, fixed.operation_id, plan.sessions.map(item => item.session));
    try { return await original.withRecovery!(fixed, work); }
    finally { sdk = undefined; }
  };
  return { ...original, withRecovery };
}

/** Same deletion kernel, actual panel adapter and actual resource holder; no ordinary App Runtime is started. */
export async function restoreRecoveryProjects(input: Input): Promise<void> {
  const { frame, decision, business } = input;
  const memory = projectMemory(input), closeMemory = frame.retain(memory);
  let source: Awaited<ReturnType<typeof openProjectDeletionRecoveryInspection>>;
  try { source = await openProjectDeletionRecoveryInspection({ homeDirectory: input.sourceDirectory, assertCurrent: frame.current }); }
  catch (error) { return retainRecoveryFailure(frame, error); }
  frame.retain(source);
  const projectRuntime: ProjectDeletedOwner = { id: "project-runtime", label: null, priority: -10,
    async clear(projectId, deletion, control) {
      frame.current(); control?.assertCurrent();
      if (!deletion || deletion.project_id !== projectId || !decision.project_groups.some(group => group.project_id === projectId
        && group.targets.some(target => target.target_deletion_id === deletion.deletion_id))) throw invalid();
      // This owner actually owns this cold composition's project business connections. Their close may still fail.
      await business.close(); frame.current(); control?.assertCurrent();
    } };
  let target: Awaited<ReturnType<typeof openProjectDeletionRecoveryTarget>>;
  try {
    target = await openProjectDeletionRecoveryTarget({ homeDirectory: input.homeDirectory, source, groups: decision.project_groups,
      memory, projectRuntime, assertCurrent: frame.current, catalogCommitted: frame.catalogCommitted,
      async recordTargets() { throw invalid(); } }, input.platform);
  } catch (error) { return retainRecoveryFailure(frame, error); }
  const closeTarget = frame.retain(target);
  try {
    for (const group of decision.project_groups) {
      const order = [group.disposal.primary_target, ...group.disposal.dependent_targets,
        ...group.targets.map(item => item.target_deletion_id)].filter((id, index, all): id is string => id !== null && all.indexOf(id) === index);
      for (const id of order) {
        frame.current();
        const sourceId = group.targets.find(item => item.target_deletion_id === id)?.source_deletion_id;
        if (!sourceId) throw invalid();
        const result = await target.restore(sourceId); frame.current();
        if (result.cleanup_state !== "complete") throw invalid();
      }
    }
  } finally { await closeTarget(); await closeMemory(); }
}
