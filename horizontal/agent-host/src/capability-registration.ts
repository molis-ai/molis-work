import type { HostCapabilityDefinition } from "@molis-ai/molis-work-contracts/platform/app-host";
import { agentHostCapabilities, type AgentSessionRef, type AgentRunRef } from "@molis-ai/molis-work-contracts/services/agent-host";

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
    handler: (context: Context, input: Input) => Output | Promise<Output>,
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
  authority(context: Context, pluginId: string): AgentStartAuthority | Promise<AgentStartAuthority>;
  /** The board this context belongs to, used to scope the review queue. */
  boardId(context: Context): string;
}

export function registerAgentHostCapabilities<Context>(
  registrar: AgentCapabilityRegistrar<Context>,
  ports: AgentCapabilityPorts<Context>,
): () => void {
  const readScopedSession = async (context: Context, session: AgentSessionRef) => {
    const view = await ports.agentHost(context).adapter(session.runtime_id).readSession(session);
    if (view.owner?.board_id !== ports.boardId(context)) throw new AgentHostError("agent.session_unknown", "当前项目找不到这条会话");
    return view;
  };
  const requireRun = async (context: Context, session: AgentSessionRef, run: AgentRunRef) => {
    const view = await readScopedSession(context, session);
    if (run.session_id !== session.session_id || !view.runs.some(entry => entry.run_id === run.run_id && entry.session_id === session.session_id)) {
      throw new AgentHostError("agent.run_unknown", "当前会话找不到这一轮执行");
    }
  };
  const disposers = [
    registrar.register(agentHostCapabilities.listRuntimes, (context) =>
      ports.agentHost(context).descriptors()),

    registrar.register(agentHostCapabilities.availableRoles, async (context, [runtimeId, pluginId]) =>
      // Role availability is read from that Plugin's own declarations, which are
      // public Manifest data; naming the Plugin keeps the answer unambiguous.
      ports.agentHost(context).availableRoles(
        runtimeId,
        (await ports.authority(context, pluginId)).manifest,
      )),

    registrar.register(agentHostCapabilities.listSkills, async (context, [runtimeId, pluginId]) =>
      ports.agentHost(context).skillCatalog(runtimeId, await ports.authority(context, pluginId))),
    registrar.register(agentHostCapabilities.readSkill, async (context, [runtimeId, pluginId, ref]) =>
      ports.agentHost(context).readSkill(runtimeId, await ports.authority(context, pluginId), ref)),
    registrar.register(agentHostCapabilities.discoverSkills, async (context, [runtimeId, pluginId, directory, path]) =>
      ports.agentHost(context).discoverSkills(runtimeId, await ports.authority(context, pluginId), directory, path)),
    registrar.register(agentHostCapabilities.installSkill, async (context, [runtimeId, pluginId, candidateId]) =>
      ports.agentHost(context).installSkill(runtimeId, await ports.authority(context, pluginId), candidateId)),

    registrar.register(agentHostCapabilities.listMcp, async (context, [runtimeId, pluginId]) => {
      const { library, owner } = ports.agentHost(context).mcpLibrary(runtimeId, await ports.authority(context, pluginId));
      return library.list(owner);
    }),
    registrar.register(agentHostCapabilities.saveMcp, async (context, [runtimeId, pluginId, input]) => {
      const authority = await ports.authority(context, pluginId);
      if (input.transport === "stdio" && (!input.directory?.realpath_verified || !authority.authorizedDirectories.includes(input.directory.canonical_path))) throw new AgentHostError("agent.directory_unauthorized", "MCP 进程目录必须是当前项目的授权工作区");
      const { library, owner } = ports.agentHost(context).mcpLibrary(runtimeId, authority);
      return library.save(owner, input);
    }),
    registrar.register(agentHostCapabilities.controlMcp, async (context, [runtimeId, pluginId, id, action]) => {
      const authority = await ports.authority(context, pluginId);
      const { library, owner } = ports.agentHost(context).mcpLibrary(runtimeId, authority);
      if (action === "connect") {
        const server = (await library.list(owner)).find(item => item.id === id);
        if (server?.transport === "stdio" && !authority.authorizedDirectories.includes(server.directory?.canonical_path ?? "")) throw new AgentHostError("agent.directory_unauthorized", "MCP 的原工作区已不可用，请重新配置");
      }
      return library.control(owner, id, action);
    }),

    registrar.register(agentHostCapabilities.createSession, async (context, [runtimeId, input]) => {
      if (input.board_id !== ports.boardId(context)) throw new AgentHostError("agent.session_unknown", "不能为其他项目创建会话");
      const authority = await ports.authority(context, input.plugin_id);
      if (!input.directory.realpath_verified || !authority.authorizedDirectories.includes(input.directory.canonical_path)) {
        throw new AgentHostError("agent.directory_unauthorized", "这个目录没有被授权给当前项目");
      }
      return ports.agentHost(context).adapter(runtimeId).createSession(input);
    }),

    registrar.register(agentHostCapabilities.readSession, async (context, [session]) =>
      await readScopedSession(context, session)),

    registrar.register(agentHostCapabilities.startRun, async (context, [runtimeId, request]) => {
      const authority = await ports.authority(context, request.plugin_id);
      if (!request.directory.realpath_verified || !authority.authorizedDirectories.includes(request.directory.canonical_path)) {
        throw new AgentHostError("agent.directory_unauthorized", "这个目录没有被授权给当前项目");
      }
      const view = await readScopedSession(context, request.session);
      if (request.board_id !== ports.boardId(context) || runtimeId !== request.session.runtime_id || request.plugin_id !== view.owner.plugin_id || request.install_id !== view.owner.install_id) {
        throw new AgentHostError("agent.session_unknown", "执行请求与会话归属不一致");
      }
      return ports.agentHost(context).start(
        runtimeId,
        request,
        authority,
      );
    }),

    registrar.register(agentHostCapabilities.readRun, async (context, [session, run]) => {
      await requireRun(context, session, run);
      return ports.agentHost(context).adapter(session.runtime_id).read(run);
    }),

    registrar.register(agentHostCapabilities.listSubagents, async (context, [session, run]) => {
      await requireRun(context, session, run);
      const port = ports.agentHost(context).adapter(session.runtime_id).subagents;
      if (!port) throw new AgentHostError("agent.capability_unavailable", "当前运行时未接通子代理");
      return port.list(run);
    }),
    registrar.register(agentHostCapabilities.cancelSubagent, async (context, [session, run, childId, actorId]) => {
      await requireRun(context, session, run);
      const port = ports.agentHost(context).adapter(session.runtime_id).subagents;
      if (!port) throw new AgentHostError("agent.capability_unavailable", "当前运行时未接通子代理");
      await port.cancel(run, childId, actorId);
    }),
    registrar.register(agentHostCapabilities.amendStepBoard, async (context, [session, run, amendment, expectedVersion]) => {
      await requireRun(context, session, run);
      const adapter = ports.agentHost(context).adapter(session.runtime_id);
      if (!adapter.amendStepBoard) throw new AgentHostError("agent.capability_unavailable", "当前运行时不能调整计划图");
      return adapter.amendStepBoard(run, amendment, expectedVersion);
    }),
    registrar.register(agentHostCapabilities.controlRun, async (context, [session, run, control]) => {
      await requireRun(context, session, run);
      await ports.agentHost(context).adapter(session.runtime_id).control(run, control);
    }),

    // A receipt of a command already run, never a way to run one. When the
    // Runtime reports `command` as unsupported the adapter throws, which is the
    // honest answer: the Plugin sees unavailable, not an empty transcript.
    registrar.register(agentHostCapabilities.readCommandOutput, async (context, [session, ref]) => {
      await readScopedSession(context, session);
      return ports.agentHost(context).adapter(session.runtime_id).readCommandOutput(session, ref);
    }),

    registrar.register(agentHostCapabilities.inspectRecovery, async (context, [session]) => {
      await readScopedSession(context, session);
      const recovery = ports.agentHost(context).adapter(session.runtime_id).recovery;
      if (!recovery) throw new AgentHostError("agent.capability_unavailable", "当前运行时未接通中断核对");
      return recovery.inspect(session);
    }),
    registrar.register(agentHostCapabilities.recoverRun, async (context, [session, run, expectedVersion]) => {
      await requireRun(context, session, run);
      const recovery = ports.agentHost(context).adapter(session.runtime_id).recovery;
      if (!recovery) throw new AgentHostError("agent.capability_unavailable", "当前运行时未接通中断恢复");
      return recovery.close(session, run.run_id, expectedVersion);
    }),
    registrar.register(agentHostCapabilities.listCheckpoints, async (context, [session]) => {
      const view = await readScopedSession(context, session);
      const authority = await ports.authority(context, view.owner.plugin_id);
      const checkpoints = ports.agentHost(context).adapter(session.runtime_id).checkpoints;
      if (!checkpoints) throw new AgentHostError("agent.capability_unavailable", "当前运行时未接通检查点");
      return (await checkpoints.list(session)).filter(item => item.directory?.realpath_verified && authority.authorizedDirectories.includes(item.directory.canonical_path));
    }),
    registrar.register(agentHostCapabilities.prepareRewind, async (context, [session, checkpointId, roleId]) => {
      const view = await readScopedSession(context, session);
      const authority = await ports.authority(context, view.owner.plugin_id);
      const role = authority.manifest.roles.find(role => role.role_id === roleId);
      if (!role || !["text-edit", "workspace-write"].includes(role.execution ?? "read-only")) throw new AgentHostError("agent.capability_unavailable", "当前方式不能回退文件，请选择修改文件或执行");
      const checkpoints = ports.agentHost(context).adapter(session.runtime_id).checkpoints;
      if (!checkpoints) throw new AgentHostError("agent.capability_unavailable", "当前运行时未接通检查点回退");
      const checkpoint = (await checkpoints.list(session)).find(item => item.checkpoint_id === checkpointId);
      if (!checkpoint?.directory?.realpath_verified || !authority.authorizedDirectories.includes(checkpoint.directory.canonical_path)) throw new AgentHostError("agent.directory_unauthorized", "检查点不属于当前授权工作区");
      return checkpoints.prepareRewind(session, checkpointId);
    }),

    registrar.register(agentHostCapabilities.readRunReviews, async (context, [session, run]) => {
      await requireRun(context, session, run);
      const view = await readScopedSession(context, session);
      const queue = ports.agentHost(context).reviews, boardId = ports.boardId(context);
      await queue.refresh(boardId);
      return queue.list(boardId).filter(request => request.run?.session_id === run.session_id
        && request.run.run_id === run.run_id && request.plugin_id === view.owner.plugin_id)
        .map(request => ({ request, receipt: queue.receipt(request.review_id) }));
    }),

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
