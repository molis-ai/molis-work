import type { AgentRoleExecution } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import { agentErrors } from "./errors.js";

/**
 * What a child role may hold, written once because both places that freeze one need it: the Host checks the declaration
 * before the runtime is asked (`run-start.ts`), and the Prologue adapter makes the character from the frozen input later
 * (`adapters/prologue-run.ts`). A child in the main workspace never writes files; it may run commands (each reviewed) only
 * when its own execution allows them; it may read and wait on the parent's background commands when the parent holds that.
 */
export function childRoleTools(execution: AgentRoleExecution, hasOwnWorkspace: boolean, parentTools: readonly string[]): readonly string[] {
  return ["read-file", "list", "search", "context-remaining",
    ...(hasOwnWorkspace && execution !== "read-only" ? ["write", "edit-file"] : []),
    ...(execution === "workspace-write" ? ["run-command"] : []),
    ...(parentTools.includes("await-commands") ? ["command-output", "await-commands"] : [])];
}

/** Refuse a child role that reaches past what its own workspace and its parent's tools allow (BL-305: one cap, one message). */
export function assertChildRoleTools(execution: AgentRoleExecution, tools: readonly string[], hasOwnWorkspace: boolean, parentTools: readonly string[]): void {
  const allowed = childRoleTools(execution, hasOwnWorkspace, parentTools);
  if (!hasOwnWorkspace && execution === "text-edit" || tools.some(tool => !allowed.includes(tool) || !hasOwnWorkspace && !parentTools.includes(tool))) {
    throw agentErrors.role_execution_exceeded("子角色请求了当前父任务未开放的工具与目录");
  }
}
