import type { AgentRunRef, AgentSessionRef } from "../services/agent-host.js";

/** One awaited run of a role declared by this plugin. Identity and workspace paths come from the Host. */
export interface PluginAgentRunInput {
  role_id: string;
  title: string;
  task: string;
  workspace_id?: string;
  /** At most ten minutes; cancelling the enclosing action also cancels this run. */
  timeout_ms?: number;
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
