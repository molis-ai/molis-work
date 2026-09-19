import type {
  AgentCapabilitySupport,
  AgentCheckpoint,
  AgentSubagentState,
  AgentSubagentView,
} from "@molis-ai/molis-work-contracts/services/agent-host";

/**
 * Subagents and checkpoints, as the user sees them.
 *
 * One separation runs through both: **the Runtime owns what happened, this
 * Plugin owns what the user made of it.** A child run that finished is the
 * Runtime's fact; whether its result is good enough is the user's, and it is
 * stored here. Folding the two together would let a completed run read as an
 * accepted one.
 */

/** The user's verdict on a child run's result. Absent means not judged yet. */
export type ChildAcceptance = "accepted" | "needs-work";

export interface SubagentRow {
  subagent_id: string;
  role_id: string;
  task: string;
  /** What the Runtime reports. Never derived from the user's verdict. */
  state: AgentSubagentState;
  result: string | null;
  workspace_path: string | null;
  /** The user's verdict, or undefined when they have not judged it. */
  acceptance?: ChildAcceptance;
  acceptance_notes?: string;
  /** Only a child that is still running can be cancelled. */
  can_cancel: boolean;
}

export interface CodingSubagentsView {
  available: boolean;
  unavailable_reason?: string;
  rows: SubagentRow[];
  /** Children that finished but nobody has judged yet. */
  awaiting_acceptance: number;
}

export interface SubagentsProjectionInput {
  support: AgentCapabilitySupport;
  children: readonly AgentSubagentView[];
  /** The user's stored verdicts, keyed by subagent id. */
  verdicts: Readonly<Record<string, { status: ChildAcceptance; notes: string }>>;
}

export function projectSubagents(input: SubagentsProjectionInput): CodingSubagentsView {
  if (input.support === "unsupported") {
    return {
      available: false,
      unavailable_reason: "这个运行时不支持子代理",
      rows: [],
      awaiting_acceptance: 0,
    };
  }
  const rows: SubagentRow[] = input.children.map((child) => {
    const verdict = input.verdicts[child.subagent_id];
    return {
      subagent_id: child.subagent_id,
      role_id: child.role_id,
      task: child.task,
      state: child.state,
      result: child.result,
      workspace_path: child.workspace_path,
      ...(verdict === undefined
        ? {}
        : { acceptance: verdict.status, acceptance_notes: verdict.notes }),
      can_cancel: child.state === "running",
    };
  });
  return {
    available: true,
    rows,
    // Completed is not accepted. A child that finished still needs a person to
    // say whether the work is good, and this count is what surfaces that.
    awaiting_acceptance: rows.filter((row) =>
      row.state === "completed" && row.acceptance === undefined).length,
  };
}

export type CheckpointsPhase = "unavailable" | "ready" | "empty";

export interface CheckpointRow extends AgentCheckpoint {
  /** True once this checkpoint has been restored in this session. */
  restored: boolean;
}

export interface CodingCheckpointsView {
  phase: CheckpointsPhase;
  unavailable_reason?: string;
  items: CheckpointRow[];
  /**
   * Whether a rewind may be started right now.
   *
   * False while a run is in flight: rewinding underneath a running agent would
   * change the ground it is standing on.
   */
  can_rewind: boolean;
  /** Why rewind is blocked, when it is. */
  blocked_reason?: string;
}

export interface CheckpointsProjectionInput {
  support: AgentCapabilitySupport;
  items: readonly AgentCheckpoint[];
  restored: readonly string[];
  run_in_flight: boolean;
}

export function projectCheckpoints(input: CheckpointsProjectionInput): CodingCheckpointsView {
  if (input.support === "unsupported") {
    return {
      phase: "unavailable",
      unavailable_reason: "这个运行时不支持检查点",
      items: [],
      can_rewind: false,
    };
  }
  const restored = new Set(input.restored);
  const items: CheckpointRow[] = input.items.map((item) => ({
    ...item,
    restored: restored.has(item.checkpoint_id),
  }));
  return {
    phase: items.length === 0 ? "empty" : "ready",
    items,
    can_rewind: items.length > 0 && !input.run_in_flight,
    ...(input.run_in_flight
      ? { blocked_reason: "这一轮还在跑，跑完才能回退" }
      : items.length === 0
        ? { blocked_reason: "还没有检查点" }
        : {}),
  };
}
