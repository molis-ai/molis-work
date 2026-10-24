import { projectSettingsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import { agentHostCapabilities as agent, resolveProjectRuntime, type AgentRuntimeCapability, type AgentRuntimeDescriptor } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { Capabilities } from "./route-activation.js";
import { unlessMissing } from "./route-selections.js";

/**
 * Which Runtime this project's sessions run on (PG-054). The platform's runtime directory (`agent.runtimes`) says which Runtimes
 * exist and what each one supports; Coding names none of them. A new session, and the methods and MCP servers the project keeps,
 * use the Runtime the person picked in the project's settings, else the Home default: the first Runtime in the directory's order
 * that can host a session (`resolveProjectRuntime`, the one rule Characters' action catalog reads too). A pick that is not
 * offered any more refuses, with the Runtime named and a pointer to the project's settings; no other Runtime takes its place.
 * Whether a Character may run on a Runtime is the Runtime's own declaration (`supports_character_limits`), never its id.
 */
const codingRuntimeErrors = defineErrorCodes("coding", { runtime_unavailable: "unavailable" });

/** The directory's own word for a capability: anything but "unsupported" is offered, and "partial" is shown as partial by the page. */
export const supports = (runtime: AgentRuntimeDescriptor, capability: AgentRuntimeCapability) => runtime.capabilities[capability] !== "unsupported";

/** The Runtime directory with the project's pick (null: the Home default), as every Runtime-bound step of the project reads them. */
export interface RuntimeDirectory { readonly runtimes: readonly AgentRuntimeDescriptor[]; readonly picked: string | null }

export async function runtimeDirectory(api: Capabilities): Promise<RuntimeDirectory> {
  const runtimes = await api.invoke(agent.listRuntimes, []);
  return { runtimes, picked: await unlessMissing(api.invoke(projectSettingsCapabilities.runtime, []), null) };
}

/** The Runtime for this project: the picked one, or the Home default, or why there is none. */
export const projectRuntime = ({ runtimes, picked }: RuntimeDirectory) => resolveProjectRuntime(runtimes, picked);

/** The Runtime a new session is made on; with none available the new session is refused, with the reason, before anything is created. */
export function requireProjectRuntime(directory: RuntimeDirectory): AgentRuntimeDescriptor {
  const choice = projectRuntime(directory);
  if (!choice.runtime) throw codingRuntimeErrors.runtime_unavailable(choice.reason);
  return choice.runtime;
}

/** The Runtime that holds the project's methods or MCP servers: the project's Runtime, and only when its own matrix offers them. */
export function libraryRuntime(directory: RuntimeDirectory, capability: "skills" | "mcp"): AgentRuntimeDescriptor {
  const runtime = requireProjectRuntime(directory);
  if (!supports(runtime, capability)) throw codingRuntimeErrors.runtime_unavailable(`项目的运行时「${runtime.display_name ?? runtime.runtime_id}」不支持${capability === "mcp" ? " MCP 服务" : "方法"}`);
  return runtime;
}

/** Whether the Runtime a session runs on has verified a Character's tool limits (its own declaration, not its id). */
export const limitsCharacters = (runtimes: readonly AgentRuntimeDescriptor[], runtimeId: string): boolean =>
  runtimes.find(runtime => runtime.runtime_id === runtimeId)?.supports_character_limits === true;
