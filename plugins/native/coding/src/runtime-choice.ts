import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentRuntimeCapability, AgentRuntimeDescriptor } from "@molis-ai/molis-work-contracts/services/agent-host";

/**
 * Which Runtime this project's sessions run on (PG-054). The platform's runtime directory (`agent.runtimes`) says which Runtimes
 * exist and what each one supports; Coding names none of them. A new session, and the methods and MCP servers the project keeps,
 * use the first Runtime in the directory's order that can host a session. There is no per-project choice: which Runtime a project
 * picks is decided when a second Runtime exists.
 */
export const codingRuntimeErrors = defineErrorCodes("coding", { runtime_unavailable: "unavailable" });

/** The directory's own word for a capability: anything but "unsupported" is offered, and "partial" is shown as partial by the page. */
export const supports = (runtime: AgentRuntimeDescriptor, capability: AgentRuntimeCapability) => runtime.capabilities[capability] !== "unsupported";
/** A session can be made on this Runtime and a round can run in it. */
const hostsSessions = (runtime: AgentRuntimeDescriptor) => supports(runtime, "session.create") && supports(runtime, "run.start");

export type ProjectRuntime =
  | { readonly runtime: AgentRuntimeDescriptor }
  | { readonly runtime: null; readonly reason: string };

/** The Runtime for this project: the first one in the directory's order that can host a session, or why there is none. */
export function projectRuntime(runtimes: readonly AgentRuntimeDescriptor[]): ProjectRuntime {
  const first = runtimes.find(hostsSessions);
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
