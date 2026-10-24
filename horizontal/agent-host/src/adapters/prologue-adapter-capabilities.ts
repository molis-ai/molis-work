import { agentErrors } from "../errors.js";
import type {
  AgentCheckpointsCapability,
  AgentRecoveryCapability,
  AgentRunRef,
  AgentRuntimeCapabilityMatrix,
  AgentRuntimeDescriptor,
  AgentSubagentsCapability,
} from "@molis-ai/molis-work-contracts/services/agent-host";
import { emptyCapabilityMatrix } from "../capabilities.js";
import type { PrologueAdapterOptions, PrologueRuntimePort } from "./prologue-ports.js";
import { isEnded, type PrologueRunStore } from "./prologue-run-store.js";

export const PROLOGUE_RUNTIME_ID = "prologue";

/** Writes require the Host approval owner; commands additionally require durable receipts. */
function currentCapabilities(approvalsAttached: boolean, receiptsAttached: boolean): AgentRuntimeCapabilityMatrix {
  const matrix = emptyCapabilityMatrix();
  if (approvalsAttached) matrix["text-edit"] = "supported";
  if (receiptsAttached) matrix["command.receipts"] = "supported";
  if (approvalsAttached && receiptsAttached) matrix.command = "supported";
  matrix["session.create"] = "supported";
  matrix["session.read"] = "supported";
  matrix["run.start"] = "supported";
  matrix["run.observe"] = "supported";
  matrix["run.control"] = "supported";
  // A compactor must be installed before advertising context compaction.
  matrix.compaction = "unsupported";
  matrix.usage = "supported";
  return matrix;
}

/** What this runtime says it supports: only what its composition really attached, narrowed further by the options. */
export function prologueDescriptor(options: PrologueAdapterOptions): AgentRuntimeDescriptor {
  const capabilities = currentCapabilities(options.approvals !== undefined, options.runtime.readCommandOutput !== undefined);
  if (options.runtime.mcpLibrary && options.approvals) capabilities.mcp = "partial";
  if (options.runtime.checkpoints) capabilities.checkpoint = "supported";
  if (options.runtime.compaction) capabilities.compaction = "supported";
  if (options.runtime.inlineMethods) capabilities.skills = "partial";
  if (options.runtime.subagents) capabilities.subagents = "partial";
  if (options.runtime.sessions.restore) capabilities["session.resume"] = "partial";
  const rank = { unsupported: 0, partial: 1, supported: 2 };
  for (const key of Object.keys(options.capabilities ?? {}) as Array<keyof AgentRuntimeCapabilityMatrix>) {
    const requested = options.capabilities![key];
    if (requested && rank[requested] < rank[capabilities[key]]) capabilities[key] = requested;
  }
  return {
    runtime_id: PROLOGUE_RUNTIME_ID,
    ...(options.runtime.workspaceNone ? { supports_workspace_none: true } : {}),
    ...(options.runtime.workspaceBusiness && options.runtime.actionTools ? { supports_workspace_business: true } : {}),
    ...(options.runtime.actionTools ? { supports_action_tools: true } : {}),
    display_name: "Prologue",
    provider_version: options.providerVersion ?? "0.0.0-rc.1",
    capabilities,
  };
}

/** A round's children, read only after the round itself is read (and so held to its session). */
export function guardedSubagents(subagents: AgentSubagentsCapability, read: (run: AgentRunRef) => Promise<unknown>): AgentSubagentsCapability {
  return {
    ...(subagents.workspaces ? { workspaces: true as const } : {}),
    list: async run => { await read(run); return subagents.list(run); },
    cancel: async (run, id, actor) => { await read(run); await subagents.cancel(run, id, actor); },
  };
}

/** Closing an interrupted round: one of this session's (or a subtask's it lists), only while nothing else runs or rewinds in it. */
export function guardedRecovery(store: PrologueRunStore, runtime: PrologueRuntimePort & { recovery: AgentRecoveryCapability }): AgentRecoveryCapability {
  return {
    inspect: async session => { await store.loadSession(session.session_id); return runtime.recovery.inspect(session); },
    close: async (session, runId, expectedVersion) => {
      const held = await store.loadSession(session.session_id);
      // One of this session's rounds, or a subtask's interrupted round that this session's recovery lists as its own.
      if (!held.runs.some(run => run.run_id === runId)
        && !(await runtime.recovery.inspect(session)).runs.some(run => run.run_id === runId && run.subagent)) {
        throw agentErrors.run_unknown("这轮执行不属于当前会话");
      }
      const latest = held.runs.at(-1);
      const phase = latest && store.requireRun(latest.run_id).view.phase;
      if (store.startingSessions.has(session.session_id) || runtime.checkpoints?.busy?.(session)
        || phase && phase !== "reconcile-required" && !isEnded(phase)) throw agentErrors.session_busy("会话仍在执行或回退，不能关闭中断轮次");
      store.startingSessions.add(session.session_id);
      try {
        const report = await runtime.recovery.close(session, runId, expectedVersion);
        store.sessions.delete(session.session_id);
        await store.loadSession(session.session_id);
        return report;
      } finally { store.startingSessions.delete(session.session_id); }
    },
  };
}

/** Rewinding files: only while the session has no round running, no rewind under way and nothing left to check. */
export function guardedCheckpoints(store: PrologueRunStore, checkpoints: AgentCheckpointsCapability): AgentCheckpointsCapability {
  return {
    busy: session => checkpoints.busy?.(session) ?? false,
    list: async session => { await store.loadSession(session.session_id); return checkpoints.list(session); },
    prepareRewind: async (session, checkpointId) => {
      const held = await store.loadSession(session.session_id);
      if (held.recovery || store.startingSessions.has(session.session_id) || checkpoints.busy?.(session)
        || !store.latestEnded(held)) throw agentErrors.session_busy("会话仍有执行、回退或待核对结果，不能回退文件");
      store.startingSessions.add(session.session_id);
      try { return await checkpoints.prepareRewind(session, checkpointId); }
      finally { store.startingSessions.delete(session.session_id); }
    },
  };
}
