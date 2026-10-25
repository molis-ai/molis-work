import { agentSessionLifecycleActions, type AgentSessionLifecycle, type AgentSessionOwner } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostPluginCaller } from "@molis-ai/molis-work-contracts/platform/app-host";
import { agentErrors } from "./errors.js";

/** The existing registration supplies the current plugin/install/actor and the invocation's effect fence. */
export function registerSessionLifecycleActions<C>(register: <I, O>(definition: ActionDefinition<I, O>, handler: (call: C, input: I) => Promise<O>) => () => void,
  ports: { pluginFor(call: C): (HostPluginCaller & { project_id: string }) | undefined; projectId(call: C): string; lifecycle(call: C, runtimeId: string): AgentSessionLifecycle | undefined }): Array<() => void> {
  const bound = (call: C, runtimeId: string) => {
    const caller = ports.pluginFor(call), port = ports.lifecycle(call, runtimeId);
    if (!caller || caller.project_id !== ports.projectId(call)) throw agentErrors.session_unknown("会话生命周期需要当前业务主人的可信调用身份");
    if (!port) throw agentErrors.capability_unavailable("当前运行时没有会话生命周期能力");
    const owner: AgentSessionOwner = { project_id: caller.project_id, plugin_id: caller.plugin_id, install_id: caller.install_id, actor_id: caller.actor_id };
    return { port, owner };
  };
  return [
    register(agentSessionLifecycleActions.read, async (call, input) => { const { port, owner } = bound(call, input.session.runtime_id); return port.read(input.session, owner); }),
    register(agentSessionLifecycleActions.previewPurge, async (call, input) => { const { port, owner } = bound(call, input.session.runtime_id); return port.previewPurge(input.session, owner); }),
    register(agentSessionLifecycleActions.preparePurge, async (call, input) => { const { port, owner } = bound(call, input.session.runtime_id); return port.preparePurge(input.session, input.decision, input.preview, owner); }),
    register(agentSessionLifecycleActions.purgeWaits, async (call, input) => { const { port, owner } = bound(call, input.session.runtime_id); return port.purgeWaits(input.session, input.decision, input.page, owner); }),
    register(agentSessionLifecycleActions.archive, async (call, input) => { const { port, owner } = bound(call, input.session.runtime_id); return port.archive(input.session, input.decision, owner); }),
    register(agentSessionLifecycleActions.unarchive, async (call, input) => { const { port, owner } = bound(call, input.session.runtime_id); return port.unarchive(input.session, input.decision, owner); }),
    register(agentSessionLifecycleActions.purge, async (call, input) => { const { port, owner } = bound(call, input.session.runtime_id); return port.purge(input.session, input.decision, input.preview, owner); }),
  ];
}
