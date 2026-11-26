import { agentErrors } from "./errors.js";
import { agentHostCapabilities, type AgentRuntimeAdapter, type AgentSessionView } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentCallPorts, Call, Register } from "./capability-ports.js";

interface MessageCaller {
  readonly project_id: string;
  readonly plugin_id: string;
  readonly install_id: string;
  readonly actor_id: string;
}

function ownerMatches(owner: AgentSessionView["owner"] | undefined, caller: MessageCaller): boolean {
  return owner?.project_id === caller.project_id
    && owner.plugin_id === caller.plugin_id
    && owner.install_id === caller.install_id
    && owner.actor_id === caller.actor_id;
}

/** Per-call cached session ownership check: only sessions belonging to the caller's (project, plugin, install, actor) (R8 rules 3, 4). */
function messageScope(adapter: AgentRuntimeAdapter, runtimeId: string, caller: MessageCaller) {
  const owners = new Map<string, Promise<boolean>>();
  const owns = (session_id: string): Promise<boolean> => {
    let found = owners.get(session_id);
    if (!found) {
      const session = { runtime_id: runtimeId, session_id };
      const read = adapter.sessionLifecycle?.readOwner
        ? adapter.sessionLifecycle.readOwner(session)
        : adapter.readSessionStatus
          ? adapter.readSessionStatus(session).then(view => view.owner)
          : adapter.readSession(session).then(view => view.owner);
      found = read.then(owner => ownerMatches(owner, caller), () => false);
      owners.set(session_id, found);
    }
    return found;
  };
  return {
    owns,
    async require(session_id: string): Promise<void> {
      if (!(await owns(session_id))) throw agentErrors.session_unknown("当前项目找不到这条会话");
    },
    async ownsLetter(letter: { from_session: string; to_session: string }): Promise<boolean> {
      return (await owns(letter.from_session)) && (await owns(letter.to_session));
    },
  };
}

/** Messages between the project's sessions, and their background commands, scoped strictly to the calling plugin's own sessions (R8 rules 3, 4). */
export function registerMessageActions<C extends Call>(register: Register<C>, ports: AgentCallPorts<C>): Array<() => void> {
  const { pluginFor, denied } = ports;
  const fresh = async (context: C) => { await context.invocation.beforeEffect(); context.invocation.assertAuthorityCurrent(); };
  const callerOf = (context: C): MessageCaller => {
    const caller = pluginFor(context);
    if (!caller) throw denied();
    return { project_id: ports.projectId(context), plugin_id: caller.plugin_id, install_id: caller.install_id, actor_id: caller.actor_id };
  };
  return [
    register(agentHostCapabilities.readMessages, async (context, [runtimeId, sessionId]) => {
      const caller = callerOf(context);
      const adapter = ports.agentHost(context).adapter(runtimeId);
      const scope = messageScope(adapter, runtimeId, caller);
      if (sessionId !== undefined) await scope.require(sessionId);
      if (!adapter.messages) return [];
      const letters = await adapter.messages.read(caller.project_id, sessionId);
      const kept = await Promise.all(letters.map(letter => scope.ownsLetter(letter)));
      await fresh(context);
      return letters.filter((_letter, index) => kept[index]);
    }),
    register(agentHostCapabilities.prioritizeSession, async (context, [runtimeId, sessionId]) => {
      const caller = callerOf(context);
      const adapter = ports.agentHost(context).adapter(runtimeId);
      await messageScope(adapter, runtimeId, caller).require(sessionId);
      if (!adapter.messages?.prioritize) throw agentErrors.capability_unavailable("当前运行时不能标记优先");
      await fresh(context);
      return adapter.messages.prioritize(caller.project_id, sessionId, caller.actor_id);
    }),
    register(agentHostCapabilities.sendPeopleMessage, async (context, [runtimeId, input]) => {
      const caller = callerOf(context);
      const adapter = ports.agentHost(context).adapter(runtimeId);
      const scope = messageScope(adapter, runtimeId, caller);
      await scope.require(input.from_session);
      await scope.require(input.to_session);
      if (!adapter.messages?.sendForPeople) throw agentErrors.capability_unavailable("当前运行时不能发会话间的信");
      if (input.in_reply_to !== undefined) {
        const parent = (await adapter.messages.read(caller.project_id)).find(letter => letter.message_id === input.in_reply_to);
        if (!parent || !(await scope.ownsLetter(parent))) throw agentErrors.session_unknown("当前项目找不到这封信");
      }
      await fresh(context);
      return adapter.messages.sendForPeople(caller.project_id, input, caller.actor_id);
    }),
    register(agentHostCapabilities.actOnPeopleMessage, async (context, [runtimeId, messageId, action, detail]) => {
      const caller = callerOf(context);
      const adapter = ports.agentHost(context).adapter(runtimeId);
      if (!adapter.messages?.act) throw agentErrors.capability_unavailable("当前运行时不能处理会话间的信");
      const scope = messageScope(adapter, runtimeId, caller);
      const letter = (await adapter.messages.read(caller.project_id)).find(entry => entry.message_id === messageId);
      if (!letter || !(await scope.ownsLetter(letter))) throw agentErrors.session_unknown("当前项目找不到这封信");
      await fresh(context);
      return adapter.messages.act(caller.project_id, messageId, action, detail ?? {}, caller.actor_id);
    }),
    register(agentHostCapabilities.cancelMessage, async (context, [runtimeId, messageId]) => {
      const caller = callerOf(context);
      const adapter = ports.agentHost(context).adapter(runtimeId);
      if (!adapter.messages) throw agentErrors.capability_unavailable("当前运行时没有会话间的信");
      const scope = messageScope(adapter, runtimeId, caller);
      const letter = (await adapter.messages.read(caller.project_id)).find(entry => entry.message_id === messageId);
      if (!letter || !(await scope.ownsLetter(letter))) throw agentErrors.session_unknown("当前项目找不到这封信");
      await fresh(context);
      await adapter.messages.cancel(caller.project_id, messageId);
    }),
    register(agentHostCapabilities.readBackground, async (context, [runtimeId, sessionId]) => {
      const caller = callerOf(context);
      const adapter = ports.agentHost(context).adapter(runtimeId);
      const scope = messageScope(adapter, runtimeId, caller);
      if (sessionId !== undefined) await scope.require(sessionId);
      if (!adapter.background) return [];
      const tasks = await adapter.background.read(caller.project_id, sessionId);
      const kept = await Promise.all(tasks.map(task => scope.owns(task.session_id)));
      await fresh(context);
      return tasks.filter((_task, index) => kept[index]);
    }),
    register(agentHostCapabilities.stopBackground, async (context, [runtimeId, taskId]) => {
      const caller = callerOf(context);
      const adapter = ports.agentHost(context).adapter(runtimeId);
      if (!adapter.background) throw agentErrors.capability_unavailable("当前运行时没有后台命令");
      const scope = messageScope(adapter, runtimeId, caller);
      const task = (await adapter.background.read(caller.project_id)).find(entry => entry.task_id === taskId);
      if (!task || !(await scope.owns(task.session_id))) throw agentErrors.session_unknown("当前项目找不到这条后台命令");
      await fresh(context);
      return adapter.background.stop(caller.project_id, taskId);
    }),
  ];
}
