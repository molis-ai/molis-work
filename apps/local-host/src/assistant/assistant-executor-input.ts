import { ActionError, bindActionClient, workExecutorRoleOf, type ActionDefinition, type ActionNamedSkills, type BoundActionClient, type HostOfferedOriginalInput } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { SkillRef } from "@molis-ai/molis-work-contracts/services/agent-definitions";
import { ASSISTANT_INSTALL_ID } from "@molis-ai/molis-work-contracts/services/assistant";
import { localWebActionContext } from "../local-web-actions.js";
import type { MolisWorkLocalHost } from "../project-host.js";

/** What one Assistant dispatch hands the executor beyond the action input: the person's original text, and the Skills the round named. */
export interface ExecutorHanded {
  original?: Omit<HostOfferedOriginalInput, "action">;
  /** The delegating round's frozen named list (specs/capability-pack/contract-design.md §2.3, `from: "host"`). */
  skills?: readonly SkillRef[];
}

/**
 * The person's client for one dispatch to the selected executor. The Host alone stamps, once each, what it hands over: a protected send's
 * personal original on the executor's steer (`run.control`), and the named Skills on its `run.start`, each bound to that executor's
 * installation and exact action. Every other call, and a second one, carries neither.
 */
export function executorInputActions(host: MolisWorkLocalHost, project: LocalHostProjectReference, permissions: readonly string[],
  handed: ExecutorHanded, pluginId: string): BoundActionClient {
  const original = handed.original && Object.freeze({ ...handed.original }), skills = handed.skills?.length ? structuredClone([...handed.skills]) : undefined;
  const client = host.actionClient(project), current = localWebActionContext(host, project, permissions);
  const used = { original: false, skills: false };
  /** The executor's own installation behind this action, found again in the directory: another plugin's action takes nothing. */
  const installOf = async (definition: ActionDefinition, refusal: string) => {
    const target = (await client.discover(await current)).find(view => view.capability_id === definition.capability_id
      && view.version === definition.version && view.provider.provider_id === definition.provider_id);
    if (target?.provider.plugin_id !== pluginId || workExecutorRoleOf(target.action) !== workExecutorRoleOf(definition.action) || !target.provider.plugin_install_id) {
      throw new ActionError("actions.forbidden", refusal);
    }
    return target.provider.plugin_install_id;
  };
  const exact = (definition: ActionDefinition) => ({ capability_id: definition.capability_id, version: definition.version, provider_id: definition.provider_id! });
  return {
    discover: async () => client.discover(await current),
    invoke: async (definition, input, control, transport) => {
      const caller = await current, role = workExecutorRoleOf(definition.action);
      if (role === "run.start" && skills && !used.skills) {
        const install_id = await installOf(definition, "点名的技能没有对应的执行方安装");
        used.skills = true;
        const named: ActionNamedSkills = { install_id, action: exact(definition), from: "host", refs: skills };
        return bindActionClient(client, () => ({ ...caller, named_skills: named })).invoke(definition, input, control, transport);
      }
      if (role !== "run.control" || (input as { kind?: string })?.kind !== "steer") return bindActionClient(client, () => caller).invoke(definition, input, control, transport);
      if (!original || used.original || original.install_id !== ASSISTANT_INSTALL_ID || original.written_by !== "person"
        || (input as { key?: string }).key !== `send.${original.input_id}`) throw new ActionError("actions.forbidden", "补充原件不属于这次发送");
      const install_id = await installOf(definition, "补充原件没有对应的执行方安装");
      if (used.original) throw new ActionError("actions.forbidden", "补充原件不属于这次发送");
      used.original = true;
      const stamp: HostOfferedOriginalInput = { ...original, use: "supplement", install_id, action: exact(definition) };
      return bindActionClient(client, () => ({ ...caller, original_input: stamp })).invoke(definition, input, control, transport);
    },
  };
}
