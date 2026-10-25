import { HOST_ARTIFACT_PRODUCERS } from "./artifact-type-registry.js";
import { PLATFORM_PLUGIN_REGISTRATIONS } from "./plugin-registry.js";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";

type Declares = { artifacts: Pick<PluginManifest["artifacts"], "produces">; process_items?: PluginManifest["process_items"] };
let producers: ReadonlyMap<string, Declares> | undefined;

/**
 * A built-in plugin writes only the types its Manifest declares, to the store it declares them for (specs/artifact-positioning
 * A7): 成果 under `artifacts.produces`, process items under `process_items.produces`. Installed plugins are held to their
 * Manifests by the Plugin Runtime's own clients, so a producer this catalog does not know passes here. A producer that is part of
 * the Host (Characters) is held to its entry in the Host's producer table the same way; it writes no process items.
 */
export function builtinTypeDeclared(producer: { plugin_id: string }, type: { artifact_type_id: string; schema_version: number }, kind: "artifact" | "process_item"): string | null {
  producers ??= new Map<string, Declares>([...PLATFORM_PLUGIN_REGISTRATIONS.map(entry => [entry.manifest.plugin_id, entry.manifest] as const),
    ...HOST_ARTIFACT_PRODUCERS.map(host => [host.plugin_id, { artifacts: { produces: host.produces } }] as const)]);
  const manifest = producers.get(producer.plugin_id);
  if (!manifest) return null;
  const field = kind === "artifact" ? "artifacts.produces" : "process_items.produces";
  const list = kind === "artifact" ? manifest.artifacts.produces : manifest.process_items?.produces ?? [];
  return list.some(item => item.artifact_type_id === type.artifact_type_id && item.schema_version === type.schema_version) ? null
    : `${producer.plugin_id} 没有在 ${field} 声明 ${type.artifact_type_id}@${type.schema_version}，不能写入${kind === "artifact" ? "成果库" : "过程项"}`;
}
