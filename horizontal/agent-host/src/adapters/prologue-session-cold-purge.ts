import { isDeepStrictEqual } from "node:util";
import type { NodeRecoveryInspection, NodeRecoveryMaintenance } from "@prologue/sdk/node";
import type { AgentSessionLifecycleReceipt, AgentSessionRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import { agentErrors } from "../errors.js";
import { createSessionIndexStore } from "./prologue-session-index.js";
import { originalSessionPurge, purgeIndexedSession, sessionConflict, sessionPurgePreview } from "./prologue-session-purge.js";
import { assertColdSessionObservation, assertRawSessionIndexAbsent, inspectColdSessionTarget, type ColdSessionPurgeTarget, type fixedColdSessionTargets } from "./prologue-project-session-cold.js";
import { sessionIndexKind } from "./prologue-session-index-reader.js";

/** Cold assembly uses the real SDK inspection and fixed maintenance writer, never a Runtime substitute. */
export function createColdSessionPurge(maintenance: NodeRecoveryMaintenance, appId: string,
  fixed: ReturnType<typeof fixedColdSessionTargets>, inspectSession: NodeRecoveryInspection["inspectSession"], current: () => void): (session: AgentSessionRef) => Promise<AgentSessionLifecycleReceipt> {
  const index = createSessionIndexStore({ storage: maintenance.storage }, appId), kind = sessionIndexKind(appId);
  const reader = { storage: maintenance.storage, inspectSession };
  const raw = async (target: ColdSessionPurgeTarget, check: () => void): Promise<AgentSessionLifecycleReceipt> => {
    const preview = sessionPurgePreview(target);
    await assertRawSessionIndexAbsent(maintenance.storage, kind, target.session.session_id, check);
    const before = await inspectSession({ ref: preview.sessionRef }); check(); assertColdSessionObservation(target, before);
    await assertRawSessionIndexAbsent(maintenance.storage, kind, target.session.session_id, check);
    if (before.state !== "purged" || before.termination.phase !== "complete") {
      check(); await maintenance.purgeSession({ ref: preview.sessionRef }); check();
    }
    const after = await inspectSession({ ref: preview.sessionRef }); check(); assertColdSessionObservation(target, after, undefined, true);
    await assertRawSessionIndexAbsent(maintenance.storage, kind, target.session.session_id, check);
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
    return index.holdSession(session.session_id, target.decision.operation_id, async () => {
      const check = () => { current(); index.assertLifecycle(session.session_id, mutation); };
      const related = fixed.projects.filter(plan => plan.sessions.some(item => isDeepStrictEqual(item.session, session)));
      const checked = new Set<string>();
      for (const plan of related) for (const item of plan.sessions) {
        if (checked.has(item.session.session_id)) continue;
        await inspectColdSessionTarget(reader, appId, item, check); checked.add(item.session.session_id); check();
      }
      if (!target.indexed) return raw(target, check);
      return index.lifecycle(session.session_id, async (value, save) => {
        current();
        const held = originalSessionPurge(value, target);
        // A new reader for each attempt: its remembered version must not span our own purge writes.
        const observed = await inspectSession({ ref: preview.sessionRef });
        current(); assertColdSessionObservation(target, observed, held);
        const result = await purgeIndexedSession(value, save, target, {
          current,
          preview: async () => {
            current();
            if (observed.state !== "present") throw sessionConflict();
            return { preview: observed.preview, state: observed.sessionState };
          },
          purge: () => maintenance.purgeSession({ ref: preview.sessionRef }),
        });
        current();
        if (!("scope" in result)) throw sessionConflict();
        return result;
      }, mutation);
    });
  };
}
