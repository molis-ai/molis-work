import { agentErrors } from "./errors.js";
import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostCapabilityInvocation, HostPluginCaller } from "@molis-ai/molis-work-contracts/platform/app-host";
import { agentCollaborationActions } from "@molis-ai/molis-work-contracts/services/agent-collaboration";
import type { AgentRunRef, AgentRuntimeAdapter, AgentSessionRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import { agentInputActions } from "@molis-ai/molis-work-contracts/services/agent-inputs";

type Call = { invocation: HostCapabilityInvocation };
/** The registration helper, for actions only: each of these is in the action directory, never a typed-only capability. */
type Register<C extends Call> = <Input, Output>(definition: ActionDefinition<Input, Output>, handler: (call: C, input: Input) => Output | Promise<Output>) => () => void;

/** What the Agent Host's registration already resolves for every call: who calls, in which project, through which runtime. */
export interface SessionActionPorts<C extends Call> {
  pluginFor(call: C): HostPluginCaller | undefined;
  adapter(call: C, runtimeId: string): AgentRuntimeAdapter;
  projectId(call: C): string;
  /** The round belongs to this session, and the session to the caller's project and plugin. */
  requireRun(call: C, session: AgentSessionRef, run: AgentRunRef): Promise<unknown>;
}

/**
 * The Agent Host's unified actions about a session's rounds: what its sessions wait for and how they go on, and what a
 * plugin tells a round. Every write checks the call is still current right before it, and once more before a supplement
 * that found its round ended is kept in the session: a cancelled or revoked call writes nothing.
 */
export function registerSessionActions<C extends Call>(register: Register<C>, ports: SessionActionPorts<C>): Array<() => void> {
  const fresh = async (call: C) => { await call.invocation.beforeEffect(); call.invocation.assertAuthorityCurrent(); };
  return [
    // The task graph keeps the waits and continuations; these only read and ask it.
    register(agentCollaborationActions.read, async (call, input) => {
      ports.pluginFor(call);
      const adapter = ports.adapter(call, input.runtime_id);
      return { sessions: adapter.collaboration ? await adapter.collaboration.read(ports.projectId(call), input.session_id) : [] };
    }),
    register(agentCollaborationActions.control, async (call, input) => {
      const caller = ports.pluginFor(call);
      const adapter = ports.adapter(call, input.runtime_id);
      if (!adapter.collaboration) throw agentErrors.capability_unavailable("当前运行时没有等待与接续");
      await fresh(call);
      const { runtime_id: _runtime, ...control } = input;
      return { session: await adapter.collaboration.control(ports.projectId(call), control, caller?.actor_id ?? "user") };
    }),
    register(agentInputActions.send, async (call, input) => {
      const { runtime_id, session_id, run_id, ...send } = input;
      const run = { session_id, run_id };
      await ports.requireRun(call, { runtime_id, session_id }, run);
      const adapter = ports.adapter(call, runtime_id);
      if (!adapter.inputs) throw agentErrors.capability_unavailable("当前运行时不能向一轮补充要求");
      await fresh(call);
      return adapter.inputs.send(run, send, () => call.invocation.assertAuthorityCurrent());
    }),
  ];
}
