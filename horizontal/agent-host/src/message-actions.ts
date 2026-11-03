import { agentErrors } from "./errors.js";
import { agentHostCapabilities } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentCallPorts, Call, Register } from "./capability-ports.js";

/** Messages between the project's sessions, and their background commands, as the runtime keeps them for this project. */
export function registerMessageActions<C extends Call>(register: Register<C>, ports: AgentCallPorts<C>): Array<() => void> {
  const { pluginFor } = ports;
  return [
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
  ];
}
