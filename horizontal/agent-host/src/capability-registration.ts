import { agentErrors } from "./errors.js";
import { requireSynchronous, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { withAgentEffect } from "./invocation-effects.js";
import { installationWaits } from "./run-wait.js";
import type { AgentCallPorts } from "./capability-ports.js";
import { registerLibraryActions } from "./library-actions.js";
import { registerMessageActions } from "./message-actions.js";
import { registerRecoveryActions } from "./recovery-actions.js";
import { registerRunActions } from "./run-actions.js";
import { registerSessionActions } from "./session-actions.js";
import { registerWriteCheckerActions } from "./write-checker-actions.js";
import type { HostCapabilityInvocation, HostPluginCaller } from "@molis-ai/molis-work-contracts/platform/app-host";
import { agentHostCapabilities, type AgentMcpLibrary, type AgentSessionRef, type AgentRunRef, type AgentSkillOwner, type AgentWriteCheckerStore } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";

import { type AgentHost, type AgentStartAuthority } from "./index.js";

/**
 * Registers the Agent Host's actions with a Host registry: every one is offered to plugins only (R8).
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
    definition: ActionDefinition<Input, Output>,
    handler: (context: Context, input: Input, invocation: HostCapabilityInvocation) => Output | Promise<Output>,
  ): () => void;
}

export interface AgentCapabilityPorts<Context> {
  /** Protected original of the current plugin Action; never read from capability arguments. */
  originalInput?(context: Context, caller?: HostPluginCaller): import("@molis-ai/molis-work-contracts/platform/actions").HostOfferedOriginalInput | undefined;
  /** The Agent Host serving this context. */
  agentHost(context: Context): AgentHost;
  /**
   * Start authority for the Plugin making this call: its own Agent Manifest,
   * the directories the Host authorized for it, and its Prompt bodies.
   *
   * May be async: the authorized directory comes from the project catalog,
   * which is opened per call rather than held open.
   */
  authority(context: Context, pluginId: string, caller?: HostPluginCaller): AgentStartAuthority | Promise<AgentStartAuthority>;
  /** The board this context belongs to, used to scope the review queue. */
  projectId(context: Context): string;
  /**
   * After an owner's MCP servers were listed, saved or connected/disconnected: what they offer now may be republished
   * (the Host's action directory follows it), for that owner alone and idempotently. `check` is the call's final authority
   * check, run again right before anything is written. A failure here never undoes the change itself.
   */
  mcpChanged?(context: Context, runtimeId: string, library: AgentMcpLibrary, owner: AgentSkillOwner, check: () => void): void | Promise<void>;
  /** The project's workspaces as the catalog reads them now, and where the runtime keeps their after-write checkers. */
  writeCheckers?(context: Context): Promise<{ workspaces: readonly ProjectWorkspaceRef[]; store: AgentWriteCheckerStore }>;
}

export function registerAgentHostCapabilities<Context>(
  registrar: AgentCapabilityRegistrar<Context>,
  owners: AgentCapabilityPorts<Context>,
): () => void {
  type Call = { source: Context; invocation: HostCapabilityInvocation };
  const denied = () => agentErrors.session_unknown("调用身份与插件或会话归属不一致");
  const waits = installationWaits(8);
  const pluginFor = (call: Call): (HostPluginCaller & { readonly project_id: string }) | undefined => {
    const caller = call.invocation.plugin;
    if (call.invocation.consumer === "plugin" && !caller) throw denied();
    if (!caller) return undefined;
    caller.assertActive();
    if (caller.project_id === null || caller.project_id !== owners.projectId(call.source)) throw denied();
    return { ...caller, project_id: caller.project_id };
  };
  const ports = {
    agentHost: (call: Call) => owners.agentHost(call.source),
    projectId: (call: Call) => owners.projectId(call.source),
    // After the call's last check, and checked again before anything is written: a cancelled, revoked or stopped call republishes nothing.
    mcpChanged: async (call: Call, runtimeId: string, library: AgentMcpLibrary, owner: AgentSkillOwner) => {
      const check = () => call.invocation.assertAuthorityCurrent();
      await call.invocation.beforeEffect(); check();
      try { await owners.mcpChanged?.(call.source, runtimeId, library, owner, check); }
      catch {
        // The change itself succeeded; whoever follows it catches up on the next list. A call no longer current is refused, though.
        check();
      }
    },
    /** The calling plugin's own start authority: its declarations and grants, never a plugin an input names (R8 rule 1). */
    authority: async (call: Call): Promise<AgentStartAuthority> => {
      const caller = pluginFor(call);
      if (!caller) throw denied();
      const authority = await owners.authority(call.source, caller.plugin_id, caller);
      await call.invocation.beforeEffect(); call.invocation.assertAuthorityCurrent();
      return invocationAuthority(authority, call.invocation, caller);
    },
  };
  const register = <Input, Output>(definition: ActionDefinition<Input, Output>, handler: (call: Call, input: Input) => Output | Promise<Output>) =>
    registrar.register(definition, async (source, input, invocation = { beforeEffect: async () => {}, assertAuthorityCurrent: () => {} }) => {
      // Plugin hooks can run at every await. Validate and execute the same data,
      // even if a hook mutates the original request after its owner was checked.
      const snapshot = structuredClone(input);
      const call = { source, invocation };
      pluginFor(call);
      await invocation.beforeEffect(); invocation.assertAuthorityCurrent();
      const result = await withAgentEffect(owners.agentHost(source), invocation, async () => handler(call, snapshot)); invocation.assertAuthorityCurrent(); return result;
    });
  /** Who a session or round is for: the calling plugin's installation and person, never an input (R8 rule 1). */
  const ownerOf = (call: Call) => {
    const caller = pluginFor(call);
    if (!caller) throw denied();
    return { caller, owner: { project_id: caller.project_id, plugin_id: caller.plugin_id, install_id: caller.install_id, actor_id: caller.actor_id } };
  };
  const readScopedSession = async (context: Call, session: AgentSessionRef) => {
    const view = await ports.agentHost(context).adapter(session.runtime_id).readSession(session);
    if (view.owner?.project_id !== ports.projectId(context)) throw agentErrors.session_unknown("当前项目找不到这条会话");
    const caller = pluginFor(context);
    if (caller && (view.owner.plugin_id !== caller.plugin_id || view.owner.install_id !== caller.install_id
      || view.owner.actor_id !== caller.actor_id)) throw denied();
    await context.invocation.beforeEffect(); context.invocation.assertAuthorityCurrent();
    return view;
  };
  const requireRun = async (context: Call, session: AgentSessionRef, run: AgentRunRef) => {
    const view = await readScopedSession(context, session);
    if (run.session_id !== session.session_id || !view.runs.some(entry => entry.run_id === run.run_id && entry.session_id === session.session_id)) {
      throw agentErrors.run_unknown("当前会话找不到这一轮执行");
    }
    return view;
  };
  const calls: AgentCallPorts<Call> = { ...ports, pluginFor, denied, readScopedSession, requireRun, waits };
  const disposers = [
    register(agentHostCapabilities.listActions, async (context, [runtimeId]) => {
      const authority = await ports.authority(context);
      if (!ports.agentHost(context).adapter(runtimeId).descriptor.supports_action_tools || !authority.actions) return [];
      return (await authority.actions(runtimeId)).discover();
    }),
    register(agentHostCapabilities.listRuntimes, (context) => { if (!pluginFor(context)) throw denied(); return ports.agentHost(context).descriptors(); }),
    // Read from the caller's own declarations, which are public Manifest data.
    register(agentHostCapabilities.availableRoles, async (context, [runtimeId]) =>
      ports.agentHost(context).availableRoles(runtimeId, (await ports.authority(context)).manifest)),

    register(agentHostCapabilities.createSession, async (context, [runtimeId, input]) => {
      const { owner } = ownerOf(context), authority = await ports.authority(context);
      await context.invocation.beforeEffect(); context.invocation.assertAuthorityCurrent();
      return ports.agentHost(context).createSession(runtimeId, { ...input, ...owner }, authority);
    }),

    register(agentHostCapabilities.readSession, async (context, [session]) =>
      await readScopedSession(context, session)),

    register(agentHostCapabilities.readSessionStatuses, async (context, [runtimeId, sessionIds]) => {
      if (!Array.isArray(sessionIds) || sessionIds.length > 1000 || sessionIds.some(id => typeof id !== "string" || !id)) throw agentErrors.session_unknown("会话列表无效");
      const adapter = ports.agentHost(context).adapter(runtimeId), board = ports.projectId(context), caller = pluginFor(context);
      return Promise.all(sessionIds.map(async session_id => {
        const session = { runtime_id: runtimeId, session_id };
        try {
          if (adapter.readSessionStatus) {
            const { owner, status } = await adapter.readSessionStatus(session);
            if (owner?.project_id !== board) throw agentErrors.session_unknown("当前项目找不到这条会话");
            // The fast path answers the same caller check as a full scoped read.
            if (caller && (owner.plugin_id !== caller.plugin_id || owner.install_id !== caller.install_id
              || owner.actor_id !== caller.actor_id)) throw denied();
            return status;
          }
          const view = await readScopedSession(context, session);
          return { session_id, latest_phase: view.latest_run?.phase ?? null, recovery: Boolean(view.recovery), checkpoint_busy: view.checkpoint_busy === true };
        } catch (error) {
          return { session_id, error: error instanceof Error ? error.message : "会话暂不可读" };
        }
      }));
    }),

    // The round is the caller's, in a session that is the caller's (readScopedSession), on the runtime that session is on.
    register(agentHostCapabilities.startRun, async (context, [runtimeId, input]) => {
      const { owner } = ownerOf(context);
      if (runtimeId !== input.session.runtime_id) throw agentErrors.session_unknown("执行请求与会话所在的运行时不一致");
      const authority = await ports.authority(context);
      await readScopedSession(context, input.session);
      return ports.agentHost(context).start(runtimeId, { ...input, ...owner }, authority);
    }),

    ...registerLibraryActions(register, calls),
    ...registerRunActions(register, calls),
    ...registerMessageActions(register, calls),
    // What this project's sessions wait for and how they go on, and what a plugin tells one of their rounds (session-actions), and the person's after-write checkers (write-checker-actions).
    ...registerSessionActions(register, { pluginFor, originalInput: call => owners.originalInput?.(call.source, pluginFor(call)), adapter: (call, runtimeId) => ports.agentHost(call).adapter(runtimeId), projectId: ports.projectId, requireRun,
      ownsSession: (call, session) => readScopedSession(call, session).then(() => true, () => false), actions: async (call, runtimeId, session) => { const authority = await ports.authority(call); return authority.actions ? authority.actions(runtimeId, undefined, session) : undefined; } }),
    ...registerWriteCheckerActions(register, { pluginFor, projectId: ports.projectId, writeCheckers: call => owners.writeCheckers?.(call.source) ?? Promise.reject(agentErrors.capability_unavailable("宿主没有接通写后检查器")) }),
    ...registerRecoveryActions(register, calls),
  ];
  return () => {
    for (const dispose of disposers) dispose();
  };
}

function invocationAuthority(authority: AgentStartAuthority, invocation: HostCapabilityInvocation, caller?: HostPluginCaller): AgentStartAuthority {
  return { ...authority,
    beforeStart: async () => { await authority.beforeStart?.(); await invocation.beforeEffect(); },
    assertBeforeStart: () => { requireSynchronous(authority.assertBeforeStart?.(), "最终授权检查必须同步完成"); invocation.assertAuthorityCurrent(); },
    beforeDispatch: async () => { caller?.assertActive(); await authority.beforeDispatch?.(); caller?.assertActive(); },
  };
}
