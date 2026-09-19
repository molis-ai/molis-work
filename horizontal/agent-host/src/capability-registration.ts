import type { HostCapabilityDefinition } from "@molis-ai/molis-work-contracts/platform/app-host";
import { agentHostCapabilities } from "@molis-ai/molis-work-contracts/services/agent-host";

import type { AgentHost, AgentStartAuthority } from "./index.js";

/**
 * Registers the Agent Host's Capabilities with a Host registry.
 *
 * Plugins reach the Agent Host only through these, never by holding it. The
 * Host resolves start authority from the calling Plugin's own declarations, so
 * a Plugin cannot name a role or a directory that is not already its own.
 *
 * Deciding an approval is deliberately absent: that is a user action in the
 * Host's review surface, and exposing it as a Capability would let a Plugin
 * approve its own effect.
 */
export interface AgentCapabilityRegistrar<Context> {
  register<Input, Output>(
    definition: HostCapabilityDefinition<Input, Output>,
    handler: (context: Context, input: Input) => Output | Promise<Output>,
  ): () => void;
}

export interface AgentCapabilityPorts<Context> {
  /** The Agent Host serving this context. */
  agentHost(context: Context): AgentHost;
  /**
   * Start authority for the Plugin making this call: its own Agent Manifest,
   * the directories the Host authorized for it, and its Prompt bodies.
   */
  authority(context: Context, pluginId: string): AgentStartAuthority;
  /** The board this context belongs to, used to scope the review queue. */
  boardId(context: Context): string;
}

export function registerAgentHostCapabilities<Context>(
  registrar: AgentCapabilityRegistrar<Context>,
  ports: AgentCapabilityPorts<Context>,
): () => void {
  const disposers = [
    registrar.register(agentHostCapabilities.listRuntimes, (context) =>
      ports.agentHost(context).descriptors()),

    registrar.register(agentHostCapabilities.availableRoles, (context, [runtimeId, pluginId]) =>
      // Role availability is read from that Plugin's own declarations, which are
      // public Manifest data; naming the Plugin keeps the answer unambiguous.
      ports.agentHost(context).availableRoles(
        runtimeId,
        ports.authority(context, pluginId).manifest,
      )),

    registrar.register(agentHostCapabilities.createSession, async (context, [runtimeId, input]) =>
      await ports.agentHost(context).adapter(runtimeId).createSession(input)),

    registrar.register(agentHostCapabilities.readSession, async (context, [session]) =>
      await ports.agentHost(context).adapter(session.runtime_id).readSession(session)),

    registrar.register(agentHostCapabilities.startRun, async (context, [runtimeId, request]) =>
      await ports.agentHost(context).start(
        runtimeId,
        request,
        ports.authority(context, request.plugin_id),
      )),

    registrar.register(agentHostCapabilities.readRun, async (context, [session, run]) =>
      await ports.agentHost(context).adapter(session.runtime_id).read(run)),

    registrar.register(agentHostCapabilities.controlRun, async (context, [session, run, control]) => {
      await ports.agentHost(context).adapter(session.runtime_id).control(run, control);
    }),

    // A receipt of a command already run, never a way to run one. When the
    // Runtime reports `command` as unsupported the adapter throws, which is the
    // honest answer: the Plugin sees unavailable, not an empty transcript.
    registrar.register(agentHostCapabilities.readCommandOutput, async (context, [session, ref]) =>
      await ports.agentHost(context).adapter(session.runtime_id).readCommandOutput(session, ref)),

    registrar.register(agentHostCapabilities.listReviews, (context, [boardId, status]) => {
      const scoped = ports.boardId(context);
      // A Plugin reads the queue of the project it is running in, not another's.
      return ports.agentHost(context).reviews.list(
        scoped === boardId ? boardId : scoped,
        status,
      );
    }),
  ];
  return () => {
    for (const dispose of disposers) dispose();
  };
}
