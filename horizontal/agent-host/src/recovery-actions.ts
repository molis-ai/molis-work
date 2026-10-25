import { agentErrors } from "./errors.js";
import { agentHostCapabilities } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentCallPorts, Call, Register } from "./capability-ports.js";

/** What a session's rounds left behind: command receipts, interrupted rounds, checkpoints to rewind to, and their reviews. */
export function registerRecoveryActions<C extends Call>(register: Register<C>, ports: AgentCallPorts<C>): Array<() => void> {
  const { readScopedSession, requireRun } = ports;
  return [
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
      await readScopedSession(context, session);
      const authority = await ports.authority(context);
      const checkpoints = ports.agentHost(context).adapter(session.runtime_id).checkpoints;
      if (!checkpoints) throw agentErrors.capability_unavailable("当前运行时未接通检查点");
      return (await checkpoints.list(session)).filter(item => item.directory?.realpath_verified && authority.authorizedDirectories.includes(item.directory.canonical_path));
    }),
    register(agentHostCapabilities.prepareRewind, async (context, [session, checkpointId, roleId]) => {
      await readScopedSession(context, session);
      const authority = await ports.authority(context);
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
  ];
}
