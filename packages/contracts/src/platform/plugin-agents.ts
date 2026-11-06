import type { AgentRunRef, AgentSessionRef } from "../services/agent-host.js";

/** One awaited run of a role declared by this plugin. Identity and workspace paths come from the Host. */
export interface PluginAgentRunInput {
  role_id: string;
  title: string;
  task: string;
  workspace_id?: string;
  /** At most ten minutes; cancelling the enclosing action also cancels this run. */
  timeout_ms?: number;
  /**
   * The key of one of this installation's task grant subjects (`TASK_GRANT_SUBJECT_KEY_PATTERN`, `services/agent-task-grants`): the
   * round reads, through the action catalog, only what the person allowed that task. Only a role of the business workspace that
   * runs read-only may take one; the project and installation come from the Host, never from here. Without it a business role
   * gets no actions at all: a plugin's round never borrows the grants of the built-in Agent.
   */
  grant_subject?: string;
}

export interface PluginAgentRunResult {
  session: AgentSessionRef;
  run: AgentRunRef;
  text: string;
}

/** Requires agent:run, a declared role and an active concurrent command or retained background job. */
export interface PluginAgentClient {
  /** Resolves only on completion. A run needing interaction is cancelled and reported to its plugin. */
  run(input: PluginAgentRunInput): Promise<PluginAgentRunResult>;
}
