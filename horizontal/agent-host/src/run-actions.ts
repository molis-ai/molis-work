import { agentErrors } from "./errors.js";
import { agentHostCapabilities } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentCallPorts, Call, Register } from "./capability-ports.js";
import { projectWorkScope } from "./project-work-scope.js";
import { awaitOwnContinuations, waitForRunChange } from "./run-wait.js";

/**
 * Following, waiting on and controlling the caller's own rounds, their subtasks, and the project's queued work as far as it
 * is the caller's. Every wait is one of the installation's limited places, and its answer is dropped if the caller lost its
 * authority while it waited.
 */
export function registerRunActions<C extends Call>(register: Register<C>, ports: AgentCallPorts<C>): Array<() => void> {
  const { pluginFor, denied, readScopedSession, requireRun, waits } = ports;
  return [
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
    // Like waitRun: one of the caller's places to wait, only its own sessions' continuations. Another plugin's that are ready
    // join `exclude` and the wait goes on, so they neither show nor end the wait early.
    register(agentHostCapabilities.awaitContinuations, async (context, [runtimeId, timeoutMs, exclude = []]) => {
      const caller = pluginFor(context), adapter = ports.agentHost(context).adapter(runtimeId);
      if (!caller) throw denied();
      if (!adapter.collaboration) throw agentErrors.capability_unavailable("当前运行时没有等待与接续");
      const collaboration = adapter.collaboration, release = waits.hold(caller.install_id);
      try {
        const own = await awaitOwnContinuations((left, skipped, signal) => collaboration.awaitReady(ports.projectId(context), left, skipped, signal),
          view => readScopedSession(context, { runtime_id: runtimeId, session_id: view.session_id }).then(() => true, () => false), timeoutMs, exclude, context.invocation.signal);
        await context.invocation.beforeEffect(); context.invocation.assertAuthorityCurrent();
        return own;
      } finally { release(); }
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
  ];
}
