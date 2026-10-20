// The checks a person keeps for after a write in one authorized workspace of a project, and the two actions that read and
// save them (specs/prologue-adoption §6.0p.2). Read through `services/agent-host`.
import type { ActionDefinition } from "../platform/actions.js";

/**
 * One command the Host runs after a write to a file it applies to, through the SDK's command review. Not the checkers a
 * waiting step looks at (`agent-host` adapters' condition checkers): those look at something outside the runtime.
 */
export interface AgentWriteChecker {
  checker_id: string;
  display_name: string;
  /** A bare executable name, found on the Host's PATH (S-38: the Host runs no paths); run without a shell. */
  executable: string;
  /** Exactly one element is the whole string `{file}`: the written path, relative to the checker's `cwd`, as one argument. */
  args: string[];
  /** The extensions it checks, with the dot (`[".js", ".mjs"]`). */
  applies_to: string[];
  /** Relative to the workspace root, never inside `.git`, `node_modules` or `.prologue`; `.` when left out. */
  cwd?: string;
  /** 1,000–60,000; 30,000 when left out. */
  timeout_ms?: number;
}

/** One workspace's checkers as kept, the defaults filled in; `version` counts saves from 1, and 0 means none was saved. */
export interface AgentWriteCheckerList {
  workspace_id: string;
  version: number;
  checkers: Array<Required<AgentWriteChecker>>;
}

/** What the person saves for one workspace: the whole list, against the version they read. */
export interface AgentWriteCheckerSave {
  workspace_id: string;
  expected_version: number;
  checkers: AgentWriteChecker[];
}

/**
 * Which checker and version of its workspace's list answered one after-write check, kept by the Agent Host under the SDK's
 * key for that check: what the review card and the timeline name. The command itself is in the SDK's review and receipt.
 */
export interface AgentWriteCheckNote {
  checker_id: string;
  display_name: string;
  version: number;
  /** The write it checks, when that write has a call id (its receipt is the SDK's `<call id>:diagnostics`). */
  write_call_id?: string;
}

/** Where the lists are kept: one per project and workspace. Only the Agent Host reads and writes it. */
export interface AgentWriteCheckerStore {
  read(projectId: string, workspaceId: string): Promise<AgentWriteCheckerList>;
  /** Refused when `expectedVersion` is not the version kept now. */
  save(projectId: string, workspaceId: string, expectedVersion: number, checkers: Array<Required<AgentWriteChecker>>): Promise<AgentWriteCheckerList>;
}

const text = (max: number) => ({ type: "string", minLength: 1, maxLength: max, pattern: "^[^\\u0000-\\u001f]+$" }) as const;
const workspaceId = { type: "string", minLength: 1, maxLength: 200 } as const;
const checker = { type: "object", required: ["checker_id", "display_name", "executable", "args", "applies_to"], additionalProperties: false, properties: {
  checker_id: { type: "string", pattern: "^[a-z0-9][a-z0-9._-]{0,63}$" },
  display_name: text(80),
  executable: text(255),
  args: { type: "array", maxItems: 64, items: { type: "string", maxLength: 4096, pattern: "^[^\\u0000]*$" } },
  applies_to: { type: "array", minItems: 1, maxItems: 32, uniqueItems: true, items: { type: "string", pattern: "^\\.[A-Za-z0-9][A-Za-z0-9_-]{0,15}$" } },
  cwd: text(1024),
  timeout_ms: { type: "integer", minimum: 1000, maximum: 60_000 },
} } as const;
const list = { type: "object", required: ["workspace_id", "version", "checkers"], additionalProperties: false, properties: {
  workspace_id: workspaceId, version: { type: "integer", minimum: 0 }, checkers: { type: "array", items: checker } } } as const;

/**
 * Only the person, in the project's settings next to the workspace authorization, changes what runs after a write: no model, MCP client, workflow or other plugin
 * can, and the operator comes from the call, never from the input. A list is kept only for a workspace the project has
 * authorized, with its real path verified, at the moment it is read or saved.
 */
export const agentWriteCheckerActions = {
  list: {
    capability_id: "agent.write_checkers.list.v1", version: 2, operation: "query",
    action: { title: "写后检查器", description: "列出当前项目每个已授权工作区的写后检查器与版本：写入文件后，由人配置的检查命令", kind: "query", scope: "project",
      audiences: ["user"], permissions: [], subject_kinds: ["project"],
      input_schema: { type: "object", additionalProperties: false, properties: {} },
      output_schema: { type: "object", required: ["lists"], additionalProperties: false, properties: { lists: { type: "array", items: list } } } },
  } as ActionDefinition<Record<string, never>, { lists: AgentWriteCheckerList[] }>,
  save: {
    capability_id: "agent.write_checkers.save.v1", version: 2, operation: "command",
    action: { title: "保存写后检查器", description: "替换一个已授权工作区的整份写后检查器清单；带上读取时的版本，版本过时就不保存", kind: "operation", scope: "project",
      audiences: ["user"], permissions: ["projects:settings"], subject_kinds: ["project"],
      input_schema: { type: "object", required: ["workspace_id", "expected_version", "checkers"], additionalProperties: false, properties: {
        workspace_id: workspaceId, expected_version: { type: "integer", minimum: 0 }, checkers: { type: "array", maxItems: 20, items: checker } } },
      output_schema: list },
  } as ActionDefinition<AgentWriteCheckerSave, AgentWriteCheckerList>,
} as const;
