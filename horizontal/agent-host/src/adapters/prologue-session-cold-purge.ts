import { isDeepStrictEqual } from "node:util";
import type { NodeRecoveryInspection, NodeRecoveryMaintenance } from "@prologue/sdk/node";
import type { AgentSessionLifecycleReceipt, AgentSessionRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import { agentErrors } from "../errors.js";
import { createSessionIndexStore } from "./prologue-session-index.js";
import { originalSessionPurge, purgeIndexedSession, sessionConflict, sessionPurgePreview } from "./prologue-session-purge.js";
import { assertColdSessionObservation, inspectColdSessionTarget, verifyColdSessionIndexes, type ColdSessionPurgeTarget, type fixedColdSessionTargets } from "./prologue-project-session-cold.js";

/** Cold assembly uses the real SDK inspection and fixed maintenance writer, never a Runtime substitute. */
export function createColdSessionPurge(maintenance: NodeRecoveryMaintenance, appId: string,
  fixed: ReturnType<typeof fixedColdSessionTargets>, inspectSession: NodeRecoveryInspection["inspectSession"], current: () => void): (session: AgentSessionRef) => Promise<AgentSessionLifecycleReceipt> {
  const index = createSessionIndexStore({ storage: maintenance.storage }, appId);
  const reader = { storage: maintenance.storage, inspectSession };
  const raw = async (target: ColdSessionPurgeTarget, check: () => void, checkpoint: () => Promise<void>): Promise<AgentSessionLifecycleReceipt> => {
    const preview = sessionPurgePreview(target);
    const before = await inspectSession({ ref: preview.sessionRef }); check(); assertColdSessionObservation(target, before);
    await checkpoint();
    if (before.state !== "purged" || before.termination.phase !== "complete") {
      check(); await maintenance.purgeSession({ ref: preview.sessionRef }); await checkpoint();
    }
    const after = await inspectSession({ ref: preview.sessionRef }); check(); assertColdSessionObservation(target, after, undefined, true);
    await checkpoint();
    if (after.state !== "purged") throw sessionConflict();
    return { scope: "agent-host-session", session: structuredClone(target.session), operation_id: target.decision.operation_id,
      action: "purge", state: "purged", version: after.termination.version };
  };
  return async requested => {
    const session = structuredClone(requested);
    const target = fixed.targets.find(target => isDeepStrictEqual(target.session, session));
    current();
    if (!target) throw agentErrors.capability_unavailable("会话不在本次固定清除集合内");
    const preview = sessionPurgePreview(target), mutation = { action: "purge" as const, operation_id: target.decision.operation_id };
    const related = fixed.projects.filter(plan => plan.sessions.some(item => isDeepStrictEqual(item.session, session)));
    const members = [...new Map(related.flatMap(plan => plan.sessions).map(item => [item.session.session_id, item])).values()];
    const execute = async () => {
      const check = () => { current(); index.assertLifecycle(session.session_id, mutation); };
      const versions = new Map<string, number | undefined>();
      const checkpoint = () => verifyColdSessionIndexes(reader, appId, versions, check);
      for (const item of members) {
        versions.set(item.session.session_id, await inspectColdSessionTarget(reader, appId, item, check));
        await checkpoint();
      }
      if (!target.indexed) return raw(target, check, checkpoint);
      return index.lifecycle(session.session_id, async (value, save) => {
        await checkpoint();
        const held = originalSessionPurge(value, target);
        // A new reader for each attempt: its remembered version must not span our own purge writes.
        const observed = await inspectSession({ ref: preview.sessionRef });
        check(); assertColdSessionObservation(target, observed, held); await checkpoint();
        const result = await purgeIndexedSession(value, async next => {
          await checkpoint(); await save(next);
          // The existing Host CAS advances exactly one version; never refresh foreign observations after a write.
          const version = versions.get(session.session_id);
          if (version !== undefined) versions.set(session.session_id, version + 1);
          await checkpoint();
        }, target, {
          current: check,
          preview: async () => {
            await checkpoint();
            if (observed.state !== "present") throw sessionConflict();
            return { preview: observed.preview, state: observed.sessionState };
          },
          purge: async () => {
            await checkpoint(); const receipt = await maintenance.purgeSession({ ref: preview.sessionRef });
            await checkpoint(); return receipt;
          },
        });
        await checkpoint();
        if (!("scope" in result)) throw sessionConflict();
        return result;
      }, mutation);
    };
    // Hold logical projects in stable order; shared exact members are claimed once, with their original owners unchanged.
    const projects = [...new Set(related.map(plan => plan.project_id))].sort();
    const holdRelated = (position: number): Promise<AgentSessionLifecycleReceipt> => position === projects.length ? execute()
      : index.holdProject(projects[position]!, position === 0 ? members.map(item => item.session.session_id) : [], hold =>
        position === 0 ? hold.purge(session.session_id, target.decision.operation_id, () => holdRelated(position + 1)) : holdRelated(position + 1));
    return projects.length ? holdRelated(0) : index.holdSession(session.session_id, target.decision.operation_id, execute);
  };
}
