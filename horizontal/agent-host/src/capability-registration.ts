import { agentErrors } from "./errors.js";
import { requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import { withAgentEffect } from "./invocation-effects.js";
import { projectWorkScope } from "./project-work-scope.js";
import { installationWaits, waitForRunChange } from "./run-wait.js";
import { registerSessionActions } from "./session-actions.js";
import { registerWriteCheckerActions } from "./write-checker-actions.js";
import type { HostCapabilityDefinition, HostCapabilityInvocation, HostPluginCaller } from "@molis-ai/molis-work-contracts/platform/app-host";
import { agentHostCapabilities, type AgentMcpLibrary, type AgentSessionRef, type AgentRunRef, type AgentSkillOwner, type AgentWriteCheckerStore } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";

import { type AgentHost, type AgentStartAuthority } from "./index.js";

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
    handler: (context: Context, input: Input, invocation: HostCapabilityInvocation) => Output | Promise<Output>,
  ): () => void;
}

export interface AgentCapabilityPorts<Context> {
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
   * (the Host's action directory follows it). A failure here never undoes the change itself.
   */
  mcpChanged?(context: Context, runtimeId: string, pluginId: string, library: AgentMcpLibrary, owner: AgentSkillOwner): void | Promise<void>;
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
  const pluginFor = (call: Call, pluginId?: string): (HostPluginCaller & { readonly project_id: string }) | undefined => {
    const caller = call.invocation.plugin;
    if (call.invocation.consumer === "plugin" && !caller) throw denied();
    if (!caller) return undefined;
    caller.assertActive();
    if (caller.project_id === null || caller.project_id !== owners.projectId(call.source) || pluginId !== undefined && caller.plugin_id !== pluginId) throw denied();
    return { ...caller, project_id: caller.project_id };
  };
  const ports = {
    agentHost: (call: Call) => owners.agentHost(call.source),
    projectId: (call: Call) => owners.projectId(call.source),
    mcpChanged: async (call: Call, runtimeId: string, pluginId: string, library: AgentMcpLibrary, owner: AgentSkillOwner) => {
      try { await owners.mcpChanged?.(call.source, runtimeId, pluginId, library, owner); }
      catch { /* The change itself succeeded; whoever follows it catches up on the next list. */ }
    },
    authority: async (call: Call, pluginId: string): Promise<AgentStartAuthority> => {
      const caller = pluginFor(call, pluginId);
      const authority = await owners.authority(call.source, caller?.plugin_id ?? pluginId, caller);
      await call.invocation.beforeEffect(); call.invocation.assertAuthorityCurrent();
      return invocationAuthority(authority, call.invocation, caller);
    },
  };
  const register = <Input, Output>(definition: HostCapabilityDefinition<Input, Output>, handler: (call: Call, input: Input) => Output | Promise<Output>) =>
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
  const disposers = [
    register(agentHostCapabilities.listActions, async (context, [runtimeId, pluginId]) => {
      if (!ports.agentHost(context).adapter(runtimeId).descriptor.supports_action_tools) return [];
      const authority = await ports.authority(context, pluginId);
      if (!authority.actions) return [];
      return (await authority.actions(runtimeId)).discover();
    }),
    register(agentHostCapabilities.listRuntimes, (context) => ports.agentHost(context).descriptors()),

    register(agentHostCapabilities.availableRoles, async (context, [runtimeId, pluginId]) =>
      // Role availability is read from that Plugin's own declarations, which are
      // public Manifest data; naming the Plugin keeps the answer unambiguous.
      ports.agentHost(context).availableRoles(
        runtimeId,
        (await ports.authority(context, pluginId)).manifest,
      )),

    register(agentHostCapabilities.listSkills, async (context, [runtimeId, pluginId]) =>
      ports.agentHost(context).skillCatalog(runtimeId, await ports.authority(context, pluginId))),
    register(agentHostCapabilities.readSkill, async (context, [runtimeId, pluginId, ref]) =>
      ports.agentHost(context).readSkill(runtimeId, await ports.authority(context, pluginId), ref)),
    register(agentHostCapabilities.discoverSkills, async (context, [runtimeId, pluginId, directory, path]) =>
      ports.agentHost(context).discoverSkills(runtimeId, await ports.authority(context, pluginId), directory, path)),
    register(agentHostCapabilities.installSkill, async (context, [runtimeId, pluginId, candidateId]) =>
      ports.agentHost(context).installSkill(runtimeId, await ports.authority(context, pluginId), candidateId)),

    register(agentHostCapabilities.listMcp, async (context, [runtimeId, pluginId]) => {
      const { library, owner } = ports.agentHost(context).mcpLibrary(runtimeId, await ports.authority(context, pluginId));
      const servers = await library.list(owner);
      await ports.mcpChanged(context, runtimeId, pluginId, library, owner);
      return servers;
    }),
    register(agentHostCapabilities.saveMcp, async (context, [runtimeId, pluginId, input]) => {
      const authority = await ports.authority(context, pluginId);
      if (input.transport === "stdio" && (!input.directory?.realpath_verified || !authority.authorizedDirectories.includes(input.directory.canonical_path))) throw agentErrors.directory_unauthorized("MCP 进程目录必须是当前项目的授权工作区");
      const { library, owner } = ports.agentHost(context).mcpLibrary(runtimeId, authority);
      const saved = await library.save(owner, input);
      await ports.mcpChanged(context, runtimeId, pluginId, library, owner);
      return saved;
    }),
    register(agentHostCapabilities.controlMcp, async (context, [runtimeId, pluginId, id, action]) => {
      const authority = await ports.authority(context, pluginId);
      const { library, owner } = ports.agentHost(context).mcpLibrary(runtimeId, authority);
      if (action === "connect") {
        const server = (await library.list(owner)).find(item => item.id === id);
        if (server?.transport === "stdio" && !authority.authorizedDirectories.includes(server.directory?.canonical_path ?? "")) throw agentErrors.directory_unauthorized("MCP 的原工作区已不可用，请重新配置");
      }
      await context.invocation.beforeEffect(); context.invocation.assertAuthorityCurrent();
      await library.control(owner, id, action);
      await ports.mcpChanged(context, runtimeId, pluginId, library, owner);
    }),

    register(agentHostCapabilities.createSession, async (context, [runtimeId, input]) => {
      const { owner } = ownerOf(context), authority = await ports.authority(context, owner.plugin_id);
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
      const authority = await ports.authority(context, owner.plugin_id);
      await readScopedSession(context, input.session);
      return ports.agentHost(context).start(runtimeId, { ...input, ...owner }, authority);
    }),

    register(agentHostCapabilities.readRun, async (context, [session, run]) => {
      await requireRun(context, session, run);
      return ports.agentHost(context).adapter(session.runtime_id).read(run);
    }),

    // Following a live round (run-wait.ts). The answer is dropped if the caller lost its authority while it waited.
    register(agentHostCapabilities.waitRun, async (context, [session, run, since, timeoutMs]) => {
      const caller = pluginFor(context);
      if (!caller) throw denied();
      await requireRun(context, session, run);
      const release = waits.hold(caller.install_id);
      try {
        const answer = await waitForRunChange(ports.agentHost(context).adapter(session.runtime_id), run, since, timeoutMs, context.invocation.signal);
        await context.invocation.beforeEffect(); context.invocation.assertAuthorityCurrent();
        return answer;
      } finally { release(); }
    }),
    register(agentHostCapabilities.listSubagents, async (context, [session, run]) => {
      await requireRun(context, session, run);
      const port = ports.agentHost(context).adapter(session.runtime_id).subagents;
      if (!port) throw agentErrors.capability_unavailable("当前运行时未接通子代理");
      return port.list(run);
    }),
    // Who stops it is the caller, never an input: requireRun has already held the session to the caller's own.
    register(agentHostCapabilities.cancelSubagent, async (context, [session, run, childId]) => {
      await requireRun(context, session, run);
      const caller = pluginFor(context), port = ports.agentHost(context).adapter(session.runtime_id).subagents;
      if (!caller) throw denied();
      if (!port) throw agentErrors.capability_unavailable("当前运行时未接通子代理");
      await context.invocation.beforeEffect(); context.invocation.assertAuthorityCurrent();
      await port.cancel(run, childId, caller.actor_id);
    }),
    // The project's work and its release, as far as it is the caller's own (project-work-scope.ts); no one else's.
    register(agentHostCapabilities.readProjectWork, async (context, [runtimeId, probe]) => {
      const caller = pluginFor(context), adapter = ports.agentHost(context).adapter(runtimeId);
      if (!caller) throw denied();
      return adapter.projectWork ? projectWorkScope(adapter, runtimeId, ports.projectId(context), caller).read(probe) : { items: [], overlaps: [] };
    }),
    register(agentHostCapabilities.readMessages, async (context, [runtimeId, sessionId]) => {
      pluginFor(context);
      const adapter = ports.agentHost(context).adapter(runtimeId);
      if (!adapter.messages) return [];
      return adapter.messages.read(ports.projectId(context), sessionId);
    }),
    register(agentHostCapabilities.prioritizeSession, async (context, [runtimeId, sessionId]) => {
      const caller = pluginFor(context);
      const adapter = ports.agentHost(context).adapter(runtimeId);
      if (!adapter.messages?.prioritize) throw agentErrors.capability_unavailable("当前运行时不能标记优先");
      await context.invocation.beforeEffect(); context.invocation.assertAuthorityCurrent();
      return adapter.messages.prioritize(ports.projectId(context), sessionId, caller?.actor_id ?? "user");
    }),
    register(agentHostCapabilities.sendPeopleMessage, async (context, [runtimeId, input]) => {
      const caller = pluginFor(context);
      const adapter = ports.agentHost(context).adapter(runtimeId);
      if (!adapter.messages?.sendForPeople) throw agentErrors.capability_unavailable("当前运行时不能发会话间的信");
      await context.invocation.beforeEffect(); context.invocation.assertAuthorityCurrent();
      return adapter.messages.sendForPeople(ports.projectId(context), input, caller?.actor_id ?? "user");
    }),
    register(agentHostCapabilities.actOnPeopleMessage, async (context, [runtimeId, messageId, action, detail]) => {
      const caller = pluginFor(context);
      const adapter = ports.agentHost(context).adapter(runtimeId);
      if (!adapter.messages?.act) throw agentErrors.capability_unavailable("当前运行时不能处理会话间的信");
      await context.invocation.beforeEffect(); context.invocation.assertAuthorityCurrent();
      return adapter.messages.act(ports.projectId(context), messageId, action, detail ?? {}, caller?.actor_id ?? "user");
    }),
    register(agentHostCapabilities.cancelMessage, async (context, [runtimeId, messageId]) => {
      pluginFor(context);
      const adapter = ports.agentHost(context).adapter(runtimeId);
      if (!adapter.messages) throw agentErrors.capability_unavailable("当前运行时没有会话间的信");
      await context.invocation.beforeEffect(); context.invocation.assertAuthorityCurrent();
      await adapter.messages.cancel(ports.projectId(context), messageId);
    }),
    // What this project's sessions wait for and how they go on, and what a plugin tells one of their rounds (session-actions), and the person's after-write checkers (write-checker-actions).
    ...registerSessionActions(register, { pluginFor, adapter: (call, runtimeId) => ports.agentHost(call).adapter(runtimeId), projectId: ports.projectId, requireRun, actions: async (call, pluginId, runtimeId, session) => { const authority = await ports.authority(call, pluginId); return authority.actions ? authority.actions(runtimeId, undefined, session) : undefined; } }),
    ...registerWriteCheckerActions(register, { pluginFor, projectId: ports.projectId, writeCheckers: call => owners.writeCheckers?.(call.source) ?? Promise.reject(agentErrors.capability_unavailable("宿主没有接通写后检查器")) }),
    register(agentHostCapabilities.awaitContinuations, async (context, [runtimeId, timeoutMs, exclude]) => {
      pluginFor(context);
      const adapter = ports.agentHost(context).adapter(runtimeId);
      if (!adapter.collaboration) throw agentErrors.capability_unavailable("当前运行时没有等待与接续");
      return adapter.collaboration.awaitReady(ports.projectId(context), Math.min(Math.max(Number(timeoutMs) || 0, 0), 25_000), Array.isArray(exclude) ? exclude.map(String).slice(0, 200) : [], context.invocation.signal);
    }),
    register(agentHostCapabilities.readBackground, async (context, [runtimeId, sessionId]) => {
      pluginFor(context);
      const adapter = ports.agentHost(context).adapter(runtimeId);
      if (!adapter.background) return [];
      return adapter.background.read(ports.projectId(context), sessionId);
    }),
    register(agentHostCapabilities.stopBackground, async (context, [runtimeId, taskId]) => {
      pluginFor(context);
      const adapter = ports.agentHost(context).adapter(runtimeId);
      if (!adapter.background) throw agentErrors.capability_unavailable("当前运行时没有后台命令");
      await context.invocation.beforeEffect(); context.invocation.assertAuthorityCurrent();
      return adapter.background.stop(ports.projectId(context), taskId);
    }),
    register(agentHostCapabilities.queueProjectRound, async (context, [runtimeId, input]) => {
      if (input.session.runtime_id !== runtimeId) throw agentErrors.session_unknown("排队请求与会话所在的运行时不一致");
      const view = await readScopedSession(context, input.session), adapter = ports.agentHost(context).adapter(runtimeId);
      if (!adapter.projectWork) throw agentErrors.capability_unavailable("当前运行时不能安排等待");
      await context.invocation.beforeEffect(); context.invocation.assertAuthorityCurrent();
      return adapter.projectWork.queue(ports.projectId(context), input, pluginFor(context)?.actor_id ?? view.owner.actor_id);
    }),
    register(agentHostCapabilities.releaseProjectRound, async (context, [runtimeId, workId, note]) => {
      const caller = pluginFor(context), adapter = ports.agentHost(context).adapter(runtimeId);
      if (!caller) throw denied();
      if (!adapter.projectWork) throw agentErrors.capability_unavailable("当前运行时不能安排等待");
      await projectWorkScope(adapter, runtimeId, ports.projectId(context), caller).requireOwn(workId);
      await context.invocation.beforeEffect(); context.invocation.assertAuthorityCurrent();
      await adapter.projectWork.release(ports.projectId(context), workId, caller.actor_id, note);
    }),
    register(agentHostCapabilities.controlRun, async (context, [session, run, control]) => {
      await requireRun(context, session, run);
      const adapter = ports.agentHost(context).adapter(session.runtime_id);
      await context.invocation.beforeEffect(); context.invocation.assertAuthorityCurrent();
      if (control.kind === "switch-model" && !adapter.withEffect) throw agentErrors.capability_unavailable("当前运行时不能在原调用授权下切换模型");
      await adapter.control(run, control);
    }),

    // A receipt of a command already run, never a way to run one. When the
    // Runtime reports `command` as unsupported the adapter throws, which is the
    // honest answer: the Plugin sees unavailable, not an empty transcript.
    register(agentHostCapabilities.readCommandOutput, async (context, [session, ref]) => {
      await readScopedSession(context, session);
      return ports.agentHost(context).adapter(session.runtime_id).readCommandOutput(session, ref);
    }),

    register(agentHostCapabilities.inspectRecovery, async (context, [session]) => {
      await readScopedSession(context, session);
      const recovery = ports.agentHost(context).adapter(session.runtime_id).recovery;
      if (!recovery) throw agentErrors.capability_unavailable("当前运行时未接通中断核对");
      return recovery.inspect(session);
    }),
    register(agentHostCapabilities.recoverRun, async (context, [session, run, expectedVersion]) => {
      const view = await readScopedSession(context, session);
      const recovery = ports.agentHost(context).adapter(session.runtime_id).recovery;
      if (!recovery) throw agentErrors.capability_unavailable("当前运行时未接通中断恢复");
      // The session's own round, or the interrupted round of one of its subtasks as this session's recovery lists it.
      const own = run.session_id === session.session_id && view.runs.some(entry => entry.run_id === run.run_id && entry.session_id === session.session_id);
      if (!own && (run.session_id !== session.session_id || !(await recovery.inspect(session)).runs.some(entry => entry.run_id === run.run_id && entry.subagent))) {
        throw agentErrors.run_unknown("当前会话找不到这一轮执行");
      }
      await context.invocation.beforeEffect(); context.invocation.assertAuthorityCurrent();
      return recovery.close(session, run.run_id, expectedVersion);
    }),
    register(agentHostCapabilities.listCheckpoints, async (context, [session]) => {
      const view = await readScopedSession(context, session);
      const authority = await ports.authority(context, view.owner.plugin_id);
      const checkpoints = ports.agentHost(context).adapter(session.runtime_id).checkpoints;
      if (!checkpoints) throw agentErrors.capability_unavailable("当前运行时未接通检查点");
      return (await checkpoints.list(session)).filter(item => item.directory?.realpath_verified && authority.authorizedDirectories.includes(item.directory.canonical_path));
    }),
    register(agentHostCapabilities.prepareRewind, async (context, [session, checkpointId, roleId]) => {
      const view = await readScopedSession(context, session);
      const authority = await ports.authority(context, view.owner.plugin_id);
      const role = authority.manifest.roles.find(role => role.role_id === roleId);
      if (!role || !["text-edit", "workspace-write"].includes(role.execution ?? "read-only")) throw agentErrors.capability_unavailable("当前方式不能回退文件，请选择修改文件或执行");
      const checkpoints = ports.agentHost(context).adapter(session.runtime_id).checkpoints;
      if (!checkpoints) throw agentErrors.capability_unavailable("当前运行时未接通检查点回退");
      const checkpoint = (await checkpoints.list(session)).find(item => item.checkpoint_id === checkpointId);
      if (!checkpoint?.directory?.realpath_verified || !authority.authorizedDirectories.includes(checkpoint.directory.canonical_path)) throw agentErrors.directory_unauthorized("检查点不属于当前授权工作区");
      await context.invocation.beforeEffect(); context.invocation.assertAuthorityCurrent();
      return checkpoints.prepareRewind(session, checkpointId);
    }),

    register(agentHostCapabilities.readRunReviews, async (context, [session, run]) => {
      await requireRun(context, session, run);
      const view = await readScopedSession(context, session);
      const queue = ports.agentHost(context).reviews, projectId = ports.projectId(context);
      await queue.refresh(projectId);
      return queue.list(projectId).filter(request => request.run?.session_id === run.session_id
        && request.run.run_id === run.run_id && request.plugin_id === view.owner.plugin_id)
        .map(request => ({ request, receipt: queue.receipt(request.review_id) }));
    }),

    register(agentHostCapabilities.listReviews, async (context, [projectId, status]) => {
      const scoped = ports.projectId(context), host = ports.agentHost(context), caller = pluginFor(context);
      const requests = host.reviews.list(scoped === projectId ? projectId : scoped, status);
      if (!caller) return requests;
      const visible = [];
      for (const request of requests) {
        const sessionId = request.run?.session_id ?? (request.operation?.kind === "checkpoint-rewind" ? request.operation.session_id : undefined);
        if (request.plugin_id !== caller.plugin_id || !sessionId) continue;
        for (const runtime of host.descriptors()) {
          try {
            const session = await readScopedSession(context, { runtime_id: runtime.runtime_id, session_id: sessionId });
            if (!request.run || session.runs.some(run => run.run_id === request.run!.run_id && run.session_id === sessionId)) visible.push(request);
            break;
          } catch { /* A foreign or unavailable session is not part of this plugin's queue. */ }
        }
      }
      await context.invocation.beforeEffect(); context.invocation.assertAuthorityCurrent();
      return visible;
    }),
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
