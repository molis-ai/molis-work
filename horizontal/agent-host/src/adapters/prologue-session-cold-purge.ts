import { isDeepStrictEqual } from "node:util";
import { openNodeRecoveryInspection, type NodeRecoveryInspectionInput, type NodeRecoveryMaintenance } from "@prologue/sdk/node";
import type { AgentSessionLifecycleReceipt, AgentSessionRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import { agentErrors } from "../errors.js";
import { createSessionIndexStore } from "./prologue-session-index.js";
import { originalSessionPurge, purgeIndexedSession, sessionConflict, sessionPurgePreview, type PrologueSessionPurgeTarget } from "./prologue-session-purge.js";

/** Cold assembly uses the real SDK inspection and fixed maintenance writer, never a Runtime substitute. */
export function createColdSessionPurge(maintenance: NodeRecoveryMaintenance, input: NodeRecoveryInspectionInput,
  targets: readonly PrologueSessionPurgeTarget[], current: () => void): (session: AgentSessionRef) => Promise<AgentSessionLifecycleReceipt> {
  const index = createSessionIndexStore({ storage: maintenance.storage }, input.app.appId);
  return async requested => {
    const session = structuredClone(requested);
    const target = targets.find(target => isDeepStrictEqual(target.session, session));
    current();
    if (!target) throw agentErrors.capability_unavailable("会话不在本次固定清除集合内");
    const preview = sessionPurgePreview(target), mutation = { action: "purge" as const, operation_id: target.decision.operation_id };
    return index.holdSession(session.session_id, target.decision.operation_id, () => index.lifecycle(session.session_id, async (value, save) => {
      current();
      const held = originalSessionPurge(value, target);
      // A new reader for each attempt: its remembered version must not span our own purge writes.
      const inspection = await openNodeRecoveryInspection(input);
      const observed = await (async () => {
        try { return await inspection.inspectSession({ ref: preview.sessionRef }); }
        finally { await inspection.close(); }
      })();
      current();
      if (observed.state === "absent") throw sessionConflict();
      if (observed.state === "present") {
        if (held && held.phase !== "prepared" || observed.sessionState !== target.decision.expected_state
          || !isDeepStrictEqual(observed.preview, preview)) throw sessionConflict();
      } else {
        if (!held || !isDeepStrictEqual(observed.termination.preview, preview)
          || held.phase !== "prepared" && (observed.termination.phase !== "complete" || observed.termination.version !== held.receipt?.version)) throw sessionConflict();
      }
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
    }, mutation));
  };
}
