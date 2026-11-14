import { BUSINESS_HOST_TOOLS } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import type { KitToolOrigin } from "@molis-ai/molis-work-contracts/platform/kit-report";
import { DELEGATION_TOOLS, GATEWAY_TOOLS, MEMORY_TOOLS } from "./adapters/prologue-action-gateway.js";
import { STEP_TOOLS } from "./execution-plan.js";

// Every tool an Agent round can be given, in one place (specs/capability-pack/contract-design.md §5): the names roles' `host_tools`
// use, where each comes from, and the runtime's own name for it. Groups already named elsewhere (the capability gateway, the step
// tools, the business tools) are read from there, not written again; a role naming anything else is refused (`agent.role_tool_unknown`).

export interface AgentToolEntry {
  /** The name roles' `host_tools` use. */
  name: string;
  origin: KitToolOrigin;
  /** The runtime's own name, for a tool the runtime runs (must be in the SDK's `SYSTEM_TOOL_NAMES`). */
  runtime_name?: string;
  /** May change files, data or the outside world. */
  writes: boolean;
  /** A runtime tool the Host lets run without asking the person each time (prologue-taskboard.ts says why). */
  unasked?: true;
  description: string;
}

/** The Agent runtime the runtime tools come from: the vendored SDK (vendor/prologue-sdk), as the AI kit names their source. */
export const AGENT_RUNTIME = { package: "@prologue/sdk", version: "0.0.0-rc.1" } as const;

/** The capability-checking tool of the plugin creation desk's code role (adapters/plugin-builder.ts). */
export const PLUGIN_CHECKS_TOOL = "plugin-checks";

const runtime = (name: string, writes: boolean, description: string, more: { runtime_name?: string; unasked?: true; origin?: KitToolOrigin } = {}): AgentToolEntry =>
  ({ name, origin: more.origin ?? "runtime", runtime_name: more.runtime_name ?? name, writes, description, ...(more.unasked ? { unasked: true } : {}) });
const host = (name: string, origin: KitToolOrigin, writes: boolean, description: string): AgentToolEntry => ({ name, origin, writes, description });

const BUSINESS: Record<(typeof BUSINESS_HOST_TOOLS)[number], { writes: boolean; description: string; unasked?: true }> = {
  "ask-user": { writes: false, description: "Ask the person a question and wait for the answer." },
  "update-todo": { writes: false, description: "Keep this round's own todo list." },
  "find-tools": { writes: false, description: "Look up the full schema of a tool offered by name only." },
  "context-remaining": { writes: false, description: "See how much context room this round has left." },
  "board-wait": { writes: false, description: "Say what this round's step waits for, and end the run.", unasked: true },
  "acknowledge-inputs": { writes: false, description: "Say how this round handles the person's supplements." },
};

const SUBAGENT: Record<string, [writes: boolean, description: string, unasked?: true]> = {
  "dispatch-subagent": [true, "Hand a sub-task to a child role of this round."],
  "await-subagents": [false, "Wait for this round's sub-tasks to finish."],
  "steer-subagent": [false, "Tell a running sub-task something more."],
  "session-send": [true, "Send a message to another session of this project.", true],
};

export const AGENT_TOOLS: readonly AgentToolEntry[] = [
  runtime("read-file", false, "Read a file in the round's directory.", { runtime_name: "read" }),
  runtime("list", false, "List a directory in the round's directory."),
  runtime("search", false, "Search the files of the round's directory."),
  runtime("write", true, "Write a file in the round's directory."),
  runtime("edit-file", true, "Edit part of a file in the round's directory.", { runtime_name: "edit" }),
  runtime("run-command", true, "Run a command in the round's directory and wait for it."),
  runtime("start-command", true, "Start a command in the background."),
  runtime("command-output", false, "Read a background command's output.", { unasked: true }),
  runtime("command-stop", true, "Stop a background command."),
  runtime("await-commands", false, "Wait for background commands to finish.", { unasked: true }),
  runtime("list-mcp-resources", false, "List the resources the round's MCP servers offer."),
  runtime("read-mcp-resource", false, "Read one resource of the round's MCP servers."),
  // 代码理解：官方编码包声明的工具，执行器由宿主按人配置的语言服务器提供（code-intelligence）。
  runtime("find-symbol", false, "Find a symbol's definition and references, or list a file's top-level definitions.", { runtime_name: "coding.find-symbol" }),
  // Skill 的两件只读入口：找只回元数据，读按精确版本取正文或某一份参考/脚本。
  runtime("find-skills", false, "List the skills this round may use, by their metadata only."),
  runtime("read-skill", false, "Read a registered skill's body or one of its own references or scripts."),
  ...Object.entries(BUSINESS).map(([name, entry]) => runtime(name, entry.writes, entry.description, { origin: "business", ...(entry.unasked ? { unasked: true } : {}) })),
  ...Object.entries(SUBAGENT).map(([name, [writes, description, unasked]]) => runtime(name, writes, description, { origin: "subagent", ...(unasked ? { unasked } : {}) })),
  ...STEP_TOOLS.map(name => runtime(name, name !== "board-read", name === "board-read" ? "Read the steps of the round's confirmed plan." : "Report progress on the round's own plan steps.",
    { origin: "plan-step", ...(name === "board-read" ? {} : { unasked: true as const }) })),
  host(GATEWAY_TOOLS.find, "gateway", false, "Search the business capabilities in this work's scope."),
  host(GATEWAY_TOOLS.read, "gateway", false, "Run a capability that only reads."),
  host(GATEWAY_TOOLS.change, "gateway", true, "Run a capability that changes data; the person reviews it first."),
  host(GATEWAY_TOOLS.direct, "gateway", true, "Run a reversible change the person lets run without asking."),
  host(GATEWAY_TOOLS.suggest, "gateway", false, "Offer the person a ready-to-run action as a button; nothing runs until they click it."),
  host(DELEGATION_TOOLS.start, "gateway", true, "Hand a sub-task to a separate work."),
  host(DELEGATION_TOOLS.check, "gateway", false, "Check a delegated work."),
  host(DELEGATION_TOOLS.follow, "gateway", true, "Tell a delegated work something more."),
  host(DELEGATION_TOOLS.stop, "gateway", true, "Stop a delegated work."),
  host(MEMORY_TOOLS.remember, "gateway", true, "Keep a memory for the person."),
  host(MEMORY_TOOLS.list, "gateway", false, "List the person's memories."),
  host(MEMORY_TOOLS.forget, "gateway", true, "Forget one of the person's memories."),
  host(MEMORY_TOOLS.propose, "gateway", false, "Suggest a memory for the person to keep."),
  host(PLUGIN_CHECKS_TOOL, "builder", false, "Run the Host's checks on the plugin being built."),
];

/** SDK tools the Host does not offer as a role's tool, each with why. */
export const RUNTIME_TOOLS_NOT_OFFERED: ReadonlyArray<{ runtime_name: string; why: string }> = [
  ...["surface-list", "surface-observe", "surface-act"].map(runtime_name => ({ runtime_name,
    why: "The side panel's browser: given by the surface the person opened, judged per site (prologue-surfaces.ts), not by a role." })),
  ...["read-image", "fetch-page", "web-search", "generate-image", "speak", "transcribe"].map(runtime_name => ({ runtime_name,
    why: "Not offered yet: no role needs it, and its reach outside the round has no Host policy." })),
  ...["bounded-script", "run-script", "invoke-skill"].map(runtime_name => ({ runtime_name,
    why: "Skill scripts do not run yet: the Node Host has no command sandbox (SKP-09, BL-skill-scripts-sandbox)." })),
  ...["hand-off", "session-list", "session-create", "session-fork", "session-wait", "session-archive", "session-inject"].map(runtime_name => ({ runtime_name,
    why: "Sessions are the plugin's to open and close; a round only messages another one (session-send)." })),
  ...["leave-plan", "board-plan", "board-revise"].map(runtime_name => ({ runtime_name,
    why: "The person confirms a plan; a round reports on its steps (board-report) and never rewrites them." })),
  { runtime_name: "command-input", why: "A background command takes no typed input from the model." },
  { runtime_name: "sleep", why: "A round waits on something (board-wait, await-commands), never on time alone." },
];

const BY_NAME = new Map(AGENT_TOOLS.map(entry => [entry.name, entry]));

export function isAgentTool(name: string): boolean {
  return BY_NAME.has(name);
}

/**
 * The Runtime's names of the tools that can change a file of the round's directory: the Runtime's own writing tools (a command
 * included: what it runs is not known) and handing work to a child. A business capability changes its owner's data, not these files.
 */
const FILE_WRITING_TOOLS: ReadonlySet<string> = new Set([
  ...AGENT_TOOLS.filter(entry => entry.origin === "runtime" && entry.writes).flatMap(entry => [entry.name, entry.runtime_name ?? entry.name]),
  "dispatch-subagent",
]);

/** Whether a tool call, by the name its activity carries, may have changed a file of the round's directory. */
export function mayWriteFiles(name: string): boolean {
  return FILE_WRITING_TOOLS.has(name);
}

/** The tools whose work goes on after the call returns: a background command, and a child handed a sub-task. */
const OUTLASTING_TOOLS: ReadonlySet<string> = new Set(["start-command", "dispatch-subagent"]);

/** Whether what a tool call started may still be writing files after later calls of the round, whenever it was made. */
export function mayKeepWriting(name: string): boolean {
  return OUTLASTING_TOOLS.has(name);
}

/** The entry for a role's tool name; none for a name outside the set. */
export function agentTool(name: string): AgentToolEntry | undefined {
  return BY_NAME.get(name);
}
