import { ActionError, bindActionClient, workExecutorRoleOf, type BoundActionClient, type HostOfferedOriginalInput } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { ASSISTANT_INSTALL_ID } from "@molis-ai/molis-work-contracts/services/assistant";
import { localWebActionContext } from "../local-web-actions.js";
import type { MolisWorkLocalHost } from "../project-host.js";

/** One protected Assistant send may relay its personal original to the selected executor installation, once. */
export function executorInputActions(host: MolisWorkLocalHost, project: LocalHostProjectReference, permissions: readonly string[],
  offered: Omit<HostOfferedOriginalInput, "action">, pluginId: string): BoundActionClient {
  const original = Object.freeze({ ...offered }), client = host.actionClient(project);
  const current = localWebActionContext(host, project, permissions);
  let ended = false;
  return {
    discover: async () => client.discover(await current),
    invoke: async (definition, input, control, transport) => {
      const caller = await current;
      if (workExecutorRoleOf(definition.action) !== "run.control" || (input as { kind?: string })?.kind !== "steer") {
        return bindActionClient(client, () => caller).invoke(definition, input, control, transport);
      }
      if (ended || original.install_id !== ASSISTANT_INSTALL_ID || original.written_by !== "person"
        || (input as { key?: string }).key !== `send.${original.input_id}`) throw new ActionError("actions.forbidden", "补充原件不属于这次发送");
      const target = (await client.discover(caller)).find(view => view.capability_id === definition.capability_id
        && view.version === definition.version && view.provider.provider_id === definition.provider_id);
      if (ended || target?.provider.plugin_id !== pluginId || workExecutorRoleOf(target.action) !== "run.control" || !target.provider.plugin_install_id) {
        throw new ActionError("actions.forbidden", "补充原件没有对应的执行方安装");
      }
      ended = true;
      const stamp: HostOfferedOriginalInput = { ...original, use: "supplement", install_id: target.provider.plugin_install_id,
        action: { capability_id: definition.capability_id, version: definition.version, provider_id: definition.provider_id } };
      return bindActionClient(client, () => ({ ...caller, original_input: stamp })).invoke(definition, input, control, transport);
    },
  };
}
