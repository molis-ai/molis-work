import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostCapabilityInvocation, HostPluginCaller } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { AgentMcpLibrary, AgentRunRef, AgentSessionRef, AgentSessionView, AgentSkillOwner } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentHost, AgentStartAuthority } from "./index.js";
import type { installationWaits } from "./run-wait.js";

export type Call = { invocation: HostCapabilityInvocation };
/** The registration helper, for actions only: each of these is in the action directory, never a typed-only capability. */
export type Register<C extends Call> = <Input, Output>(definition: ActionDefinition<Input, Output>, handler: (call: C, input: Input) => Output | Promise<Output>) => () => void;

/**
 * What the Agent Host's registration resolves for every call (capability-registration.ts), shared by the families of
 * actions it registers: who calls, in which project, with which start authority, and whether a session or round is the caller's.
 */
export interface AgentCallPorts<C extends Call> {
  /** The calling plugin, held to this project and still active; absent for a call made without one. */
  pluginFor(call: C): (HostPluginCaller & { readonly project_id: string }) | undefined;
  /** The refusal for a caller that is not the owner (or no plugin at all). */
  denied(): Error;
  agentHost(call: C): AgentHost;
  projectId(call: C): string;
  /** The calling plugin's own start authority, checked current again before it is returned. */
  authority(call: C): Promise<AgentStartAuthority>;
  /** After an owner's MCP servers changed: republished for that owner alone, never undoing the change. */
  mcpChanged(call: C, runtimeId: string, library: AgentMcpLibrary, owner: AgentSkillOwner): Promise<void>;
  /** The session is in this project and is the caller's own (its plugin, installation and person). */
  readScopedSession(call: C, session: AgentSessionRef): Promise<AgentSessionView>;
  /** As readScopedSession, and the round is one of that session's own. */
  requireRun(call: C, session: AgentSessionRef, run: AgentRunRef): Promise<AgentSessionView>;
  /** Places one installation may wait at once (run-wait.ts). */
  waits: ReturnType<typeof installationWaits>;
}
