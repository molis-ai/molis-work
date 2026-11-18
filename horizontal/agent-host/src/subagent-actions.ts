import { agentHostCapabilities } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentCallPorts, Call, Register } from "./capability-ports.js";
import { agentErrors } from "./errors.js";
import { waitForSubagentChange } from "./subagent-wait.js";
import { subagentExecution } from "./subagent-authority.js";

/** Same public owner for installed plugins and the Assistant's trusted Host adapter. */
export function registerSubagentActions<C extends Call>(register: Register<C>, ports: AgentCallPorts<C>): Array<() => void> {
  return [
    register(agentHostCapabilities.readSubagentConversation, async (context, [session, run, id]) => {
      await ports.requireRun(context, session, run);
      const port = ports.agentHost(context).adapter(session.runtime_id).subagents;
      if (!port?.conversation) throw agentErrors.capability_unavailable("当前运行时未接通子任务对话");
      return port.conversation(run, id);
    }),
    register(agentHostCapabilities.waitSubagentConversation, async (context, [session, run, id, since, timeoutMs]) => {
      await ports.requireRun(context, session, run);
      const caller = ports.pluginFor(context), port = ports.agentHost(context).adapter(session.runtime_id).subagents;
      if (!caller) throw ports.denied();
      if (!port) throw agentErrors.capability_unavailable("Subagent updates unavailable");
      const release = ports.waits.hold(caller.install_id);
      try {
        const answer = await waitForSubagentChange(port, run, id, since, timeoutMs, context.invocation.signal);
        await context.invocation.beforeEffect(); context.invocation.assertAuthorityCurrent();
        return answer;
      } finally { release(); }
    }),
    register(agentHostCapabilities.checkSubagentRequest, async (context, [session, run, id, request]) => {
      await ports.requireRun(context, session, run);
      const caller = ports.pluginFor(context), port = ports.agentHost(context).adapter(session.runtime_id).subagents;
      if (!caller) throw ports.denied();
      if (!port?.checkRequest) throw agentErrors.capability_unavailable("当前运行时未接通子任务原请求查询");
      return port.checkRequest(run, id, request, caller.actor_id);
    }),
    register(agentHostCapabilities.commandSubagent, async (context, [session, run, id, input]) => {
      await ports.requireRun(context, session, run);
      const caller = ports.pluginFor(context), adapter = ports.agentHost(context).adapter(session.runtime_id);
      if (!caller) throw ports.denied();
      if (!adapter.subagents?.command) throw agentErrors.capability_unavailable("当前运行时未接通子任务操作");
      const authority = await ports.authority(context), parent = await adapter.read(run), original = authority.original_input;
      if ((input.kind === "send" || input.kind === "continue") && (!original || original.install_id !== caller.install_id
        || original.written_by !== "person" || original.input_id !== input.request_id || original.text !== input.text)) {
        throw agentErrors.capability_unavailable("缺少这次子任务输入的本人原件证明");
      }
      const execution = subagentExecution(authority, session.runtime_id, parent.frozen, caller);
      return adapter.subagents.command(run, id, input, { actor_id: caller.actor_id, original_text: original?.text,
        execution: { ...execution, beforeStart: async () => { await context.invocation.beforeEffect(); await execution.beforeStart?.(); },
          assertBeforeStart: () => { context.invocation.assertAuthorityCurrent(); execution.assertBeforeStart?.(); } } });
    }),
  ];
}
