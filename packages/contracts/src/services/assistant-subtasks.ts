import type { AgentRunRef } from "./agent-host.js";
import type { AssistantExecutorChoice, AssistantSendResult, AssistantWork } from "./assistant.js";

/** Issued from original Work/delegation facts; never a permission grant. */
export interface AssistantSubtaskBinding {
  work_id: string;
  parent_work_id: string;
  graph_id: string;
  node_id: string;
  executor: AssistantExecutorChoice;
  /** The executor's business session when a plugin carries this Work. */
  executor_session_id?: string;
  run: AgentRunRef;
}

export type AssistantSubtaskAnswer = Omit<import("./agent-interaction.js").AgentAnswerControl, "kind"> & {
  request_id: string; subtask: AssistantSubtaskBinding; pending_revision: number;
};
export interface AssistantSubtaskResumeAnswer {
  request_id: string; subtask: AssistantSubtaskBinding; pending_id: string; queued_input_id: string;
}


/** Stored in the existing request owner; the original Send result remains its current branch. */
export type AssistantRequestResult = AssistantSendResult | { outcome: "stopped"; work: AssistantWork; run_id: string };

