import { ActionError, type ActionClient, type ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostPluginCaller } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { PluginInstanceRecord, PluginManifest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { ScheduleActionOwner } from "@molis-ai/molis-work-service-scheduler";

export interface PluginSchedulerPorts {
  readonly client: ActionClient;
  readonly plugin_caller: HostPluginCaller;
  readonly provider_id: string;
  readonly record: () => PluginInstanceRecord | null;
}

/** The platform supplies identity and the action gateway; plugins only declare what may be woken. */
export function pluginSchedulerOwner(manifest: PluginManifest, context: PluginStartContext, ports: PluginSchedulerPorts, assertActive: () => void) {
  const installation = ports.record(), generation = installation?.installation_generation;
  if (!generation) throw new ActionError("actions.unredeemed", "调度服务需要当前插件安装记录");
  const declarations = structuredClone(manifest.background?.wakeups ?? []);
  const definitions = structuredClone(manifest.actions ?? []);
  const declared = (reference: ActionReference) => declarations.some(item => item.action.capability_id === reference.capability_id && item.action.version === reference.version);
  const current = (permissions: readonly string[], running = false) => {
    assertActive();
    const record = ports.record();
    if (!record || record.installation_generation !== generation || ["uninstalled", "quarantined"].includes(record.state) || (running && record.state !== "running")) {
      throw new ActionError("actions.forbidden", "调度任务所属的插件安装已经停止或改变");
    }
    for (const permission of permissions) {
      context.requireGrant(permission);
      if (!record.grants.includes(permission)) throw new ActionError("actions.forbidden", "调度任务的授权已经撤销");
    }
  };
  const definitionFor = (reference: ActionReference) => {
    const definition = definitions.find(item => item.capability_id === reference.capability_id && item.version === reference.version);
    if (!declared(reference) || !definition || definition.operation !== "command" || !definition.action.audiences.includes("plugin")) {
      throw new ActionError("actions.forbidden", "插件没有声明这个定时唤醒动作");
    }
    return definition;
  };
  const assertAction = (reference: ActionReference) => current(definitionFor(reference).action.permissions, true);
  const owner: ScheduleActionOwner = {
    plugin_id: manifest.plugin_id, install_id: context.install_id, installation_generation: generation,
    actions: declarations.map(item => item.action), assertCurrent: assertAction,
    async invoke(reference, input, control) {
      const definition = definitionFor(reference);
      const check = () => { control.beforeEffect(); assertAction(reference); };
      check();
      const result = await ports.client.invoke({ actor_id: ports.plugin_caller.actor_id, project_id: ports.plugin_caller.project_id,
        audience: "plugin", permissions: context.grants, host_plugin: ports.plugin_caller, plugin_install_id: context.install_id, signal: control.signal,
        allowed_actions: [{ ...reference, provider_id: ports.provider_id }], validate_authority: check, assert_authority_current: check,
      }, { ...definition, provider_id: ports.provider_id }, input);
      check();
      if (result === undefined) return;
      if (!result || typeof result !== "object" || Array.isArray(result)) throw new ActionError("actions.output_invalid", "定时动作没有返回有效回执");
      const reply = result as Record<string, unknown>, status = reply.status;
      if ((reply.detail !== undefined && typeof reply.detail !== "string") || (status !== undefined && status !== "ok" && status !== "failed" && status !== "plugin_unavailable")) {
        throw new ActionError("actions.output_invalid", "定时动作回执的内容或状态无效");
      }
      return { ...(typeof reply.detail === "string" ? { detail: reply.detail } : {}),
        ...(status ? { status } : {}) };
    },
  };
  return { owner, current, definitionFor, generation, declares: declared };
}
