import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { AgentRuntimeCapability, AgentRuntimeDescriptor } from "@molis-ai/molis-work-contracts/services/agent-host";

/**
 * Which Runtime this project's sessions run on (PG-054). The platform's runtime directory (`agent.runtimes`) says which Runtimes
 * exist and what each one supports; Coding names none of them. A new session, and the methods and MCP servers the project keeps,
 * use the Runtime chosen for the project, or, when none was chosen, the first one in the directory that can host a session.
 */
export const codingRuntimeErrors = defineErrorCodes("coding", { runtime_unavailable: "unavailable" });

/** The project's choice, kept in the plugin's private storage for this project; absent while the person has not chosen. */
const SELECTED = "runtime:selected";

/** The directory's own word for a capability: anything but "unsupported" is offered, and "partial" is shown as partial by the page. */
export const supports = (runtime: AgentRuntimeDescriptor, capability: AgentRuntimeCapability) => runtime.capabilities[capability] !== "unsupported";
/** A session can be made on this Runtime and a round can run in it. */
const hostsSessions = (runtime: AgentRuntimeDescriptor) => supports(runtime, "session.create") && supports(runtime, "run.start");

export function selectedRuntimeId(context: PluginStartContext): string | null {
  const saved = context.services?.storage?.get(SELECTED);
  return typeof saved === "string" && saved ? saved : null;
}

export type ProjectRuntime =
  | { readonly runtime: AgentRuntimeDescriptor }
  | { readonly runtime: null; readonly reason: string };

/**
 * The Runtime for this project: the chosen one, which is never replaced by another when it is gone or cannot host a session (the
 * choice stays visible and the person changes it), else the first available one in the directory's order.
 */
export function projectRuntime(context: PluginStartContext, runtimes: readonly AgentRuntimeDescriptor[]): ProjectRuntime {
  const chosen = selectedRuntimeId(context);
  if (chosen) {
    const runtime = runtimes.find(entry => entry.runtime_id === chosen);
    return runtime && hostsSessions(runtime) ? { runtime }
      : { runtime: null, reason: `项目选定的运行时「${chosen}」当前不可用，请改选或清除选择` };
  }
  const first = runtimes.find(hostsSessions);
  return first ? { runtime: first } : { runtime: null, reason: "宿主还没有可用的运行时" };
}

/** The Runtime a new session is made on. */
export function requireProjectRuntime(context: PluginStartContext, runtimes: readonly AgentRuntimeDescriptor[]): AgentRuntimeDescriptor {
  const choice = projectRuntime(context, runtimes);
  if (!choice.runtime) throw codingRuntimeErrors.runtime_unavailable(choice.reason);
  return choice.runtime;
}

/** The Runtime that holds the project's methods or MCP servers: the project's Runtime, and only when its own matrix offers them. */
export function libraryRuntime(context: PluginStartContext, runtimes: readonly AgentRuntimeDescriptor[], capability: "skills" | "mcp"): AgentRuntimeDescriptor {
  const runtime = requireProjectRuntime(context, runtimes);
  if (!supports(runtime, capability)) throw codingRuntimeErrors.runtime_unavailable(`项目的运行时「${runtime.display_name ?? runtime.runtime_id}」不支持${capability === "mcp" ? " MCP 服务" : "方法"}`);
  return runtime;
}

/** Keeps the choice, or clears it with `null`. A Runtime that is not in the directory, or cannot host a session, is not kept. */
export function keepRuntimeChoice(context: PluginStartContext, runtimes: readonly AgentRuntimeDescriptor[], runtimeId: string | null): void {
  const storage = context.services?.storage;
  if (!storage) throw codingRuntimeErrors.runtime_unavailable("这个项目没有可用的私有存储");
  if (runtimeId === null) { storage.delete(SELECTED); return; }
  const runtime = runtimes.find(entry => entry.runtime_id === runtimeId);
  if (!runtime || !hostsSessions(runtime)) throw codingRuntimeErrors.runtime_unavailable(`运行时「${runtimeId}」当前不可用`);
  storage.set(SELECTED, runtimeId);
}
