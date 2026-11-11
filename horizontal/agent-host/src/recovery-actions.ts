import { agentErrors } from "./errors.js";
import { agentHostCapabilities } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentCallPorts, Call, Register } from "./capability-ports.js";
import type { AgentStartAuthority } from "./index.js";
import { mayKeepWriting, mayWriteFiles } from "./tool-catalog.js";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";

/**
 * The directories a checkpoint may be in: the output, and the Host's worktrees of it when a checkpoint is elsewhere (a writing child's).
 * Read once per call, and only when needed: reading the worktrees runs Git.
 */
function checkpointPlaces(authority: AgentStartAuthority): (path: string) => Promise<boolean> {
  let trees: Promise<readonly string[]> | undefined;
  return async path => authority.authorizedDirectories.includes(path)
    || (await (trees ??= authority.worktrees ? authority.worktrees().then(list => list.map(tree => tree.canonical_path)) : Promise.resolve([]))).includes(path);
}

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

    // Evidence another owner cites (a Goal's requirement report): only of the session the Host bound this caller's round to, so a
    // round can cite what its own session ran and nothing else. A plugin, a person or a workflow of its own has no such session.
    register(agentHostCapabilities.checkEvidence, async (context, input) => {
      const sessionId = context.invocation.runtime_session_id, host = ports.agentHost(context);
      if (!sessionId || context.invocation.plugin) throw ports.denied();
      let found: { session: { runtime_id: string; session_id: string }; owner_plugin_id: string } | undefined, unread: unknown;
      for (const { runtime_id } of host.descriptors()) {
        const session = { runtime_id, session_id: sessionId };
        // Only "this runtime has no such session" lets the search go on. A read that failed says nothing about whose round it is,
        // and is never answered as "not this session's": the asker would take that for another worker's round.
        const view = await host.adapter(runtime_id).readSession(session).catch((error: unknown) => {
          if (!(error instanceof ActionError && error.code === "agent.session_unknown")) unread ??= error;
          return undefined;
        });
        if (view?.owner?.project_id !== ports.projectId(context) || !view.runs.some(run => run.run_id === input.run_id && run.session_id === sessionId)) continue;
        found = { session, owner_plugin_id: view.owner.plugin_id };
        break;
      }
      if (!found && unread !== undefined) throw agentErrors.capability_unavailable("读不到调用方的会话，无法核对这一轮执行");
      if (!found) throw agentErrors.run_unknown("调用方自己的会话里找不到这一轮执行");
      const adapter = host.adapter(found.session.runtime_id), run = await adapter.read({ session_id: sessionId, run_id: input.run_id });
      const kept = new Set((run.command_outputs ?? []).map(output => output.call_id)), cited = new Set(input.command_call_ids);
      const commands = await Promise.all(input.command_call_ids.map(async call_id => {
        const unknown = { call_id, recorded: false, exit_code: null, timed_out: false, cancelled: false, changed_after: true };
        if (!kept.has(call_id)) return unknown;
        const receipt = await adapter.readCommandOutput(found.session, { run_id: input.run_id, call_id }).catch(() => undefined);
        if (!receipt) return unknown;
        // Without the call's own position nothing says what came after it, so it is not taken as "nothing did".
        const at = run.activity.find(item => item.call_id === call_id)?.sequence;
        // The other cited commands are the check itself; anything else after it that may write a file means it did not see what was left.
        // A background command or a child started earlier may still be writing: nothing here says when its work ended.
        const changed_after = at === undefined || run.activity.some(item => !cited.has(item.call_id) && item.state !== "failed"
          && (mayKeepWriting(item.name) || mayWriteFiles(item.name) && (item.sequence ?? Infinity) > at))
          || (run.turn_changes ?? []).some(change => change.sequence > at);
        return { call_id, recorded: true, exit_code: receipt.exit_code, timed_out: receipt.timed_out === true || receipt.stop_reason === "timed-out",
          cancelled: receipt.cancelled === true || receipt.stop_reason === "cancelled", changed_after };
      }));
      await context.invocation.beforeEffect(); context.invocation.assertAuthorityCurrent();
      return { owner_plugin_id: found.owner_plugin_id, run: { session_id: sessionId, run_id: input.run_id }, commands };
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
      const allowed = checkpointPlaces(authority), listed = await checkpoints.list(session);
      const kept = await Promise.all(listed.map(async item => Boolean(item.directory?.realpath_verified && await allowed(item.directory.canonical_path))));
      return listed.filter((_item, index) => kept[index]);
    }),
    register(agentHostCapabilities.prepareRewind, async (context, [session, checkpointId, roleId]) => {
      await readScopedSession(context, session);
      const authority = await ports.authority(context);
      const role = authority.manifest.roles.find(role => role.role_id === roleId);
      if (!role || !["text-edit", "workspace-write"].includes(role.execution ?? "read-only")) throw agentErrors.capability_unavailable("当前方式不能回退文件，请选择修改文件或执行");
      const checkpoints = ports.agentHost(context).adapter(session.runtime_id).checkpoints;
      if (!checkpoints) throw agentErrors.capability_unavailable("当前运行时未接通检查点回退");
      const checkpoint = (await checkpoints.list(session)).find(item => item.checkpoint_id === checkpointId);
      if (!checkpoint?.directory?.realpath_verified || !await checkpointPlaces(authority)(checkpoint.directory.canonical_path)) throw agentErrors.directory_unauthorized("检查点不属于当前授权工作区");
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
