import type { HostCapabilityDefinition, HostCapabilityInvocation, HostPluginCaller } from "@molis-ai/molis-work-contracts/platform/app-host";
import { agentHostCapabilities, type AgentSessionRef, type AgentRunRef, type AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";

import { AgentHostError, type AgentHost, type AgentStartAuthority } from "./index.js";

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
  boardId(context: Context): string;
  /** Explicit historical owner, never inferred from a request. */
  legacyActorId?(context: Context): string | undefined;
}

/** A cheap, stable mark of what a surface would draw differently: phase, text growth, tool progress, questions, usage. */
export function runViewVersion(view: AgentRunView): string {
  const last = view.turns[view.turns.length - 1];
  return [view.phase, view.turns.length, last?.text.length ?? 0, view.activity.length,
    view.activity.map(item => item.state[0] + (item.output?.length ?? 0)).join(""), view.awaiting_input.length,
    view.usage.tokens.input + view.usage.tokens.output, view.step_board?.version ?? 0].join(":");
}

export function registerAgentHostCapabilities<Context>(
  registrar: AgentCapabilityRegistrar<Context>,
  owners: AgentCapabilityPorts<Context>,
): () => void {
  type Call = { source: Context; invocation: HostCapabilityInvocation };
  const denied = () => new AgentHostError("agent.session_unknown", "调用身份与插件或会话归属不一致");
  const pluginFor = (call: Call, pluginId?: string): HostPluginCaller | undefined => {
    const caller = call.invocation.plugin;
    if (call.invocation.consumer === "plugin" && !caller) throw denied();
    if (caller) {
      caller.assertActive();
      if (caller.board_id !== owners.boardId(call.source) || pluginId !== undefined && caller.plugin_id !== pluginId) throw denied();
    }
    return caller;
  };
  const ports = {
    agentHost: (call: Call) => owners.agentHost(call.source),
    boardId: (call: Call) => owners.boardId(call.source),
    authority: async (call: Call, pluginId: string): Promise<AgentStartAuthority> => {
      const caller = pluginFor(call, pluginId);
      const authority = await owners.authority(call.source, caller?.plugin_id ?? pluginId, caller);
      await call.invocation.beforeEffect();
      return { ...authority,
        beforeStart: async () => { await authority.beforeStart?.(); await call.invocation.beforeEffect(); },
        beforeDispatch: async () => { caller?.assertActive(); await authority.beforeDispatch?.(); caller?.assertActive(); },
      };
    },
  };
  const register = <Input, Output>(definition: HostCapabilityDefinition<Input, Output>, handler: (call: Call, input: Input) => Output | Promise<Output>) =>
    registrar.register(definition, async (source, input, invocation = { beforeEffect: async () => {} }) => {
      // Plugin hooks can run at every await. Validate and execute the same data,
      // even if a hook mutates the original request after its owner was checked.
      const snapshot = structuredClone(input);
      const call = { source, invocation };
      pluginFor(call);
      await invocation.beforeEffect();
      return handler(call, snapshot);
    });
  const assertInputOwner = (call: Call, input: { board_id?: string; plugin_id: string; install_id?: string; actor_id?: string }) => {
    const caller = pluginFor(call, input.plugin_id);
    if (caller && (input.board_id !== caller.board_id || input.install_id !== caller.install_id || input.actor_id !== caller.actor_id)) throw denied();
    return caller;
  };
  const readScopedSession = async (context: Call, session: AgentSessionRef) => {
    const view = await ports.agentHost(context).adapter(session.runtime_id).readSession(session);
    if (view.owner?.board_id !== ports.boardId(context)) throw new AgentHostError("agent.session_unknown", "当前项目找不到这条会话");
    const caller = pluginFor(context);
    if (caller && (view.owner.plugin_id !== caller.plugin_id || view.owner.install_id !== caller.install_id
      || (view.owner.actor_id ?? owners.legacyActorId?.(context.source)) !== caller.actor_id)) throw denied();
    await context.invocation.beforeEffect();
    return view;
  };
  const requireRun = async (context: Call, session: AgentSessionRef, run: AgentRunRef) => {
    const view = await readScopedSession(context, session);
    if (run.session_id !== session.session_id || !view.runs.some(entry => entry.run_id === run.run_id && entry.session_id === session.session_id)) {
      throw new AgentHostError("agent.run_unknown", "当前会话找不到这一轮执行");
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
    register(agentHostCapabilities.listRuntimes, (context) =>
      ports.agentHost(context).descriptors()),

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
      return library.list(owner);
    }),
    register(agentHostCapabilities.saveMcp, async (context, [runtimeId, pluginId, input]) => {
      const authority = await ports.authority(context, pluginId);
      if (input.transport === "stdio" && (!input.directory?.realpath_verified || !authority.authorizedDirectories.includes(input.directory.canonical_path))) throw new AgentHostError("agent.directory_unauthorized", "MCP 进程目录必须是当前项目的授权工作区");
      const { library, owner } = ports.agentHost(context).mcpLibrary(runtimeId, authority);
      return library.save(owner, input);
    }),
    register(agentHostCapabilities.controlMcp, async (context, [runtimeId, pluginId, id, action]) => {
      const authority = await ports.authority(context, pluginId);
      const { library, owner } = ports.agentHost(context).mcpLibrary(runtimeId, authority);
      if (action === "connect") {
        const server = (await library.list(owner)).find(item => item.id === id);
        if (server?.transport === "stdio" && !authority.authorizedDirectories.includes(server.directory?.canonical_path ?? "")) throw new AgentHostError("agent.directory_unauthorized", "MCP 的原工作区已不可用，请重新配置");
      }
      await context.invocation.beforeEffect();
      return library.control(owner, id, action);
    }),

    register(agentHostCapabilities.createSession, async (context, [runtimeId, input]) => {
      const caller = assertInputOwner(context, input);
      if (input.board_id !== ports.boardId(context)) throw new AgentHostError("agent.session_unknown", "不能为其他项目创建会话");
      const authority = await ports.authority(context, input.plugin_id);
      await context.invocation.beforeEffect();
      return ports.agentHost(context).createSession(runtimeId, { ...input,
        ...(caller ? { board_id: caller.board_id, plugin_id: caller.plugin_id, install_id: caller.install_id, actor_id: caller.actor_id } : {}) }, authority);
    }),

    register(agentHostCapabilities.readSession, async (context, [session]) =>
      await readScopedSession(context, session)),

    register(agentHostCapabilities.readSessionStatuses, async (context, [runtimeId, sessionIds]) => {
      if (!Array.isArray(sessionIds) || sessionIds.length > 1000 || sessionIds.some(id => typeof id !== "string" || !id)) throw new AgentHostError("agent.session_unknown", "会话列表无效");
      const adapter = ports.agentHost(context).adapter(runtimeId), board = ports.boardId(context), caller = pluginFor(context);
      return Promise.all(sessionIds.map(async session_id => {
        const session = { runtime_id: runtimeId, session_id };
        try {
          if (adapter.readSessionStatus) {
            const { owner, status } = await adapter.readSessionStatus(session);
            if (owner?.board_id !== board) throw new AgentHostError("agent.session_unknown", "当前项目找不到这条会话");
            // The fast path answers the same caller check as a full scoped read.
            if (caller && (owner.plugin_id !== caller.plugin_id || owner.install_id !== caller.install_id
              || (owner.actor_id ?? owners.legacyActorId?.(context.source)) !== caller.actor_id)) throw denied();
            return status;
          }
          const view = await readScopedSession(context, session);
          return { session_id, latest_phase: view.latest_run?.phase ?? null, recovery: Boolean(view.recovery), checkpoint_busy: view.checkpoint_busy === true };
        } catch (error) {
          return { session_id, error: error instanceof Error ? error.message : "会话暂不可读" };
        }
      }));
    }),

    register(agentHostCapabilities.startRun, async (context, [runtimeId, request]) => {
      const caller = assertInputOwner(context, request);
      const authority = await ports.authority(context, request.plugin_id);
      const view = await readScopedSession(context, request.session);
      if (request.board_id !== ports.boardId(context) || runtimeId !== request.session.runtime_id || request.plugin_id !== view.owner.plugin_id || request.install_id !== view.owner.install_id || view.owner.actor_id !== undefined && request.actor_id !== view.owner.actor_id) {
        throw new AgentHostError("agent.session_unknown", "执行请求与会话归属不一致");
      }
      return ports.agentHost(context).start(
        runtimeId,
        { ...request, ...(caller ? { board_id: caller.board_id, plugin_id: caller.plugin_id, install_id: caller.install_id, actor_id: caller.actor_id } : {}) },
        authority,
      );
    }),

    register(agentHostCapabilities.readRun, async (context, [session, run]) => {
      await requireRun(context, session, run);
      return ports.agentHost(context).adapter(session.runtime_id).read(run);
    }),

    // Following a live round: wake on the first change, gather the deltas that arrive within 40 ms, answer with the latest.
    register(agentHostCapabilities.waitRun, async (context, [session, run, since, timeoutMs]) => {
      await requireRun(context, session, run);
      const adapter = ports.agentHost(context).adapter(session.runtime_id);
      const limit = Math.min(Math.max(Number(timeoutMs) || 0, 0), 25_000);
      return new Promise<{ version: string; view: AgentRunView }>((resolve, reject) => {
        let latest: AgentRunView | undefined, gather: ReturnType<typeof setTimeout> | undefined, stop: (() => void) | undefined, finished = false;
        // The published view only names pending questions; a full read resolves them into something a person can answer.
        const finish = () => { if (finished) return; finished = true; clearTimeout(timer); clearTimeout(gather); stop?.();
          const version = runViewVersion(latest!);
          if (!latest!.awaiting_input.length) { resolve({ version, view: latest! }); return; }
          adapter.read(run).then(view => resolve({ version, view }), () => resolve({ version, view: latest! })); };
        const timer = setTimeout(finish, limit);
        try {
          stop = adapter.observe(run, view => { latest = view; if (runViewVersion(view) !== since && !gather) gather = setTimeout(finish, 40); });
          if (finished) stop();
        } catch (error) { clearTimeout(timer); reject(error); }
      });
    }),
    register(agentHostCapabilities.listSubagents, async (context, [session, run]) => {
      await requireRun(context, session, run);
      const port = ports.agentHost(context).adapter(session.runtime_id).subagents;
      if (!port) throw new AgentHostError("agent.capability_unavailable", "当前运行时未接通子代理");
      return port.list(run);
    }),
    register(agentHostCapabilities.cancelSubagent, async (context, [session, run, childId, actorId]) => {
      await requireRun(context, session, run);
      const port = ports.agentHost(context).adapter(session.runtime_id).subagents;
      if (!port) throw new AgentHostError("agent.capability_unavailable", "当前运行时未接通子代理");
      const caller = pluginFor(context);
      if (caller && caller.actor_id !== actorId) throw denied();
      await context.invocation.beforeEffect();
      await port.cancel(run, childId, caller?.actor_id ?? actorId);
    }),
    register(agentHostCapabilities.amendStepBoard, async (context, [session, run, amendment, expectedVersion]) => {
      const view = await requireRun(context, session, run);
      const adapter = ports.agentHost(context).adapter(session.runtime_id);
      if (!adapter.amendStepBoard) throw new AgentHostError("agent.capability_unavailable", "当前运行时不能调整计划图");
      await context.invocation.beforeEffect();
      // The person deciding: the calling plugin's actor, else the session's owner.
      const actor = pluginFor(context)?.actor_id ?? view.owner.actor_id ?? owners.legacyActorId?.(context.source) ?? "user";
      return adapter.amendStepBoard(run, amendment, expectedVersion, actor);
    }),
    register(agentHostCapabilities.controlRun, async (context, [session, run, control]) => {
      await requireRun(context, session, run);
      await context.invocation.beforeEffect();
      await ports.agentHost(context).adapter(session.runtime_id).control(run, control);
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
      if (!recovery) throw new AgentHostError("agent.capability_unavailable", "当前运行时未接通中断核对");
      return recovery.inspect(session);
    }),
    register(agentHostCapabilities.recoverRun, async (context, [session, run, expectedVersion]) => {
      const view = await readScopedSession(context, session);
      const recovery = ports.agentHost(context).adapter(session.runtime_id).recovery;
      if (!recovery) throw new AgentHostError("agent.capability_unavailable", "当前运行时未接通中断恢复");
      // The session's own round, or the interrupted round of one of its subtasks as this session's recovery lists it.
      const own = run.session_id === session.session_id && view.runs.some(entry => entry.run_id === run.run_id && entry.session_id === session.session_id);
      if (!own && (run.session_id !== session.session_id || !(await recovery.inspect(session)).runs.some(entry => entry.run_id === run.run_id && entry.subagent))) {
        throw new AgentHostError("agent.run_unknown", "当前会话找不到这一轮执行");
      }
      await context.invocation.beforeEffect();
      return recovery.close(session, run.run_id, expectedVersion);
    }),
    register(agentHostCapabilities.listCheckpoints, async (context, [session]) => {
      const view = await readScopedSession(context, session);
      const authority = await ports.authority(context, view.owner.plugin_id);
      const checkpoints = ports.agentHost(context).adapter(session.runtime_id).checkpoints;
      if (!checkpoints) throw new AgentHostError("agent.capability_unavailable", "当前运行时未接通检查点");
      return (await checkpoints.list(session)).filter(item => item.directory?.realpath_verified && authority.authorizedDirectories.includes(item.directory.canonical_path));
    }),
    register(agentHostCapabilities.prepareRewind, async (context, [session, checkpointId, roleId]) => {
      const view = await readScopedSession(context, session);
      const authority = await ports.authority(context, view.owner.plugin_id);
      const role = authority.manifest.roles.find(role => role.role_id === roleId);
      if (!role || !["text-edit", "workspace-write"].includes(role.execution ?? "read-only")) throw new AgentHostError("agent.capability_unavailable", "当前方式不能回退文件，请选择修改文件或执行");
      const checkpoints = ports.agentHost(context).adapter(session.runtime_id).checkpoints;
      if (!checkpoints) throw new AgentHostError("agent.capability_unavailable", "当前运行时未接通检查点回退");
      const checkpoint = (await checkpoints.list(session)).find(item => item.checkpoint_id === checkpointId);
      if (!checkpoint?.directory?.realpath_verified || !authority.authorizedDirectories.includes(checkpoint.directory.canonical_path)) throw new AgentHostError("agent.directory_unauthorized", "检查点不属于当前授权工作区");
      await context.invocation.beforeEffect();
      return checkpoints.prepareRewind(session, checkpointId);
    }),

    register(agentHostCapabilities.readRunReviews, async (context, [session, run]) => {
      await requireRun(context, session, run);
      const view = await readScopedSession(context, session);
      const queue = ports.agentHost(context).reviews, boardId = ports.boardId(context);
      await queue.refresh(boardId);
      return queue.list(boardId).filter(request => request.run?.session_id === run.session_id
        && request.run.run_id === run.run_id && request.plugin_id === view.owner.plugin_id)
        .map(request => ({ request, receipt: queue.receipt(request.review_id) }));
    }),

    register(agentHostCapabilities.listReviews, async (context, [boardId, status]) => {
      const scoped = ports.boardId(context), host = ports.agentHost(context), caller = pluginFor(context);
      const requests = host.reviews.list(scoped === boardId ? boardId : scoped, status);
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
      await context.invocation.beforeEffect();
      return visible;
    }),
  ];
  return () => {
    for (const dispose of disposers) dispose();
  };
}
