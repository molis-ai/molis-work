import { ActionError, bindActionClient, type BoundActionClient, type HostOfferedOriginalInput } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { ASSISTANT_INSTALL_ID } from "@molis-ai/molis-work-contracts/services/assistant";
import { localWebActionContext } from "../local-web-actions.js";
import type { MolisWorkLocalHost } from "../project-host.js";

/** One protected Assistant send may relay its personal original to the actual Coding installation, once. */
export function codingInputActions(host: MolisWorkLocalHost, project: LocalHostProjectReference, permissions: readonly string[],
  offered: Omit<HostOfferedOriginalInput, "action">): BoundActionClient {
  const original = Object.freeze({ ...offered }), client = host.actionClient(project);
  const current = localWebActionContext(host, project, permissions);
  let ended = false;
  return {
    discover: async () => client.discover(await current),
    invoke: async (definition, input, control, transport) => {
      const caller = await current;
      if (definition.capability_id !== "coding.runs.control" || (input as { kind?: string })?.kind !== "steer") {
        return bindActionClient(client, () => caller).invoke(definition, input, control, transport);
      }
      if (ended || original.install_id !== ASSISTANT_INSTALL_ID || original.written_by !== "person"
        || (input as { key?: string }).key !== `send.${original.input_id}`) throw new ActionError("actions.forbidden", "补充原件不属于这次发送");
      const target = (await client.discover(caller)).find(view => view.capability_id === definition.capability_id
        && view.version === definition.version && view.provider.provider_id === definition.provider_id);
      if (ended || target?.provider.plugin_id !== "io.molis.work.coding" || !target.provider.plugin_install_id) {
        throw new ActionError("actions.forbidden", "补充原件没有对应的 Coding 安装");
      }
      ended = true;
      const stamp: HostOfferedOriginalInput = { ...original, use: "supplement", install_id: target.provider.plugin_install_id,
        action: { capability_id: definition.capability_id, version: definition.version, provider_id: definition.provider_id } };
      return bindActionClient(client, () => ({ ...caller, original_input: stamp })).invoke(definition, input, control, transport);
    },
  };
}
