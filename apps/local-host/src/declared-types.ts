import { artifactProducerRetired, artifactProducerSources } from "./artifact-type-registry.js";

/**
 * A producer that is part of this Host or an installed plugin writes only the types its Manifest declares, to the store it
 * declares them for (specs/artifact-positioning A7): 成果 under `artifacts.produces`, process items under `process_items.produces`
 * (S-69.1). The Host holds an installed plugin to this itself, whatever the plugin's own client does; a plugin that is no longer in
 * effect (disabled, uninstalled) writes nothing (S-70.4). A producer the Host has no Manifest for and has not installed (a person's
 * import, say) is not a plugin and passes.
 */
export function producerTypeDeclared(producer: { plugin_id: string }, type: { artifact_type_id: string; schema_version: number }, kind: "artifact" | "process_item"): string | null {
  if (artifactProducerRetired(producer.plugin_id)) return `${producer.plugin_id} 已停用或已卸载，不能写入${kind === "artifact" ? "成果库" : "过程项"}`;
  const source = artifactProducerSources().find(item => item.plugin_id === producer.plugin_id);
  if (!source) return null;
  const field = kind === "artifact" ? "artifacts.produces" : "process_items.produces";
  const list = kind === "artifact" ? source.artifacts.produces : source.process_items?.produces ?? [];
  return list.some(item => item.artifact_type_id === type.artifact_type_id && item.schema_version === type.schema_version) ? null
    : `${producer.plugin_id} 没有在 ${field} 声明 ${type.artifact_type_id}@${type.schema_version}，不能写入${kind === "artifact" ? "成果库" : "过程项"}`;
}
