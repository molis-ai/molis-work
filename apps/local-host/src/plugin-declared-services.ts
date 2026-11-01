import { pluginErrors, type PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";

/**
 * What a Home instance is given of a service its Manifest declares: nothing when it declares none; what the Host's start list holds
 * for this definition object when it does. A definition that declares one and is not on the list (installed beside it) is refused
 * to start, with its own code, not started without the service.
 */
export function givenService<Given>(definition: PluginDefinition, declared: unknown, given: Given | undefined, service: string): Given | undefined {
  if (declared === undefined) return undefined;
  if (given === undefined) {
    throw pluginErrors.declaration_invalid(`插件 ${definition.manifest.plugin_id} 的 Manifest 声明了${service}，但宿主没有把它给这个插件：不在宿主启动名单上的插件现在还没有${service}`);
  }
  return given;
}

const HOME_ONLY = [
  ["owner_files", "Home 主人文件服务"], ["model_configuration", "模型设置服务"], ["image_generation", "图片生成服务"], ["local_tools", "本机工具服务"],
] as const;

/**
 * Files, model settings and image generation are a Home instance's: a project plugin that declares one is refused, unless it is the
 * project half of a dual-instance plugin, which shares its Manifest with the Home half and is given none of them.
 */
export function assertHomeOnlyDeclarations(homeEntries: readonly { definition: PluginDefinition; dual_instance?: true }[], projectEntries: readonly { definition: PluginDefinition }[]): void {
  for (const { definition } of projectEntries) {
    const id = definition.manifest.plugin_id;
    if (homeEntries.some(other => other.dual_instance && other.definition.manifest.plugin_id === id)) continue;
    for (const [field, service] of HOME_ONLY) {
      // Sandbox files use the existing installation-scoped port in either scope, never the native Home root.
      if (field === "owner_files" && definition.execution === "sandbox") continue;
      if (definition.manifest[field] !== undefined) throw pluginErrors.declaration_invalid(`项目插件 ${id} 不能声明${service}：它不是双实例插件在项目里的那一半`);
    }
  }
}
