import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import { defaultAgentRuntime, type AgentRuntimeCapability, type AgentRuntimeDescriptor } from "@molis-ai/molis-work-contracts/services/agent-host";

/**
 * Which Runtime this project's sessions run on (PG-054). The platform's runtime directory (`agent.runtimes`) says which Runtimes
 * exist and what each one supports; Coding names none of them. A new session, and the methods and MCP servers the project keeps,
 * use the Home default: the first Runtime in the directory's order that can host a session (`defaultAgentRuntime`, the one rule
 * Characters' action catalog reads too). Whether a Character may run on a Runtime is the Runtime's own declaration
 * (`supports_character_limits`), never its id.
 */
const codingRuntimeErrors = defineErrorCodes("coding", { runtime_unavailable: "unavailable" });

/** The directory's own word for a capability: anything but "unsupported" is offered, and "partial" is shown as partial by the page. */
export const supports = (runtime: AgentRuntimeDescriptor, capability: AgentRuntimeCapability) => runtime.capabilities[capability] !== "unsupported";

type ProjectRuntime =
  | { readonly runtime: AgentRuntimeDescriptor }
  | { readonly runtime: null; readonly reason: string };

/** The Runtime for this project: the Home default, or why there is none. */
export function projectRuntime(runtimes: readonly AgentRuntimeDescriptor[]): ProjectRuntime {
  const first = defaultAgentRuntime(runtimes);
  return first ? { runtime: first } : { runtime: null, reason: "宿主还没有可用的运行时" };
}

/** The Runtime a new session is made on; with none available the new session is refused, with the reason, before anything is created. */
export function requireProjectRuntime(runtimes: readonly AgentRuntimeDescriptor[]): AgentRuntimeDescriptor {
  const choice = projectRuntime(runtimes);
  if (!choice.runtime) throw codingRuntimeErrors.runtime_unavailable(choice.reason);
  return choice.runtime;
}

/** The Runtime that holds the project's methods or MCP servers: the project's Runtime, and only when its own matrix offers them. */
export function libraryRuntime(runtimes: readonly AgentRuntimeDescriptor[], capability: "skills" | "mcp"): AgentRuntimeDescriptor {
  const runtime = requireProjectRuntime(runtimes);
  if (!supports(runtime, capability)) throw codingRuntimeErrors.runtime_unavailable(`项目的运行时「${runtime.display_name ?? runtime.runtime_id}」不支持${capability === "mcp" ? " MCP 服务" : "方法"}`);
  return runtime;
}

/** Whether the Runtime a session runs on has verified a Character's tool limits (its own declaration, not its id). */
export const limitsCharacters = (runtimes: readonly AgentRuntimeDescriptor[], runtimeId: string): boolean =>
  runtimes.find(runtime => runtime.runtime_id === runtimeId)?.supports_character_limits === true;
