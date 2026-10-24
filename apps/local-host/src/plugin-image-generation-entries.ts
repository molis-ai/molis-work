import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginPlatformHome } from "./home-side.js";
import { PLUGIN_LIBRARY_NAME } from "./plugin-database-entries.js";

/** A definition's connections are what its Manifest declares (`image_generation`); the store registry says whether the namespace is its own. */
export function assertImageGenerationEntries(entries: readonly { definition: PluginDefinition }[], home: PluginPlatformHome | null): void {
  const taken = new Set<string>();
  for (const { definition } of entries) {
    const declaration = definition.manifest.image_generation;
    if (!declaration) continue;
    if (!home || definition.execution === "sandbox") throw new Error("图片生成服务只供有 Home 的原生插件");
    const id = definition.manifest.plugin_id, name = declaration.store_name;
    if (!PLUGIN_LIBRARY_NAME.test(name) || home.stores.get(name)?.owner !== id) throw new Error(`图片连接命名空间 ${name} 不属于插件 ${id}`);
    if (taken.has(name)) throw new Error(`图片连接命名空间 ${name} 重复声明`);
    taken.add(name);
    const permissions = new Set(definition.manifest.permissions.map(entry => entry.permission));
    for (const permission of [declaration.read_permission, declaration.write_permission, declaration.generate_permission, "model:invoke"]) {
      if (!permission || !permissions.has(permission)) throw new Error(`插件 ${id} 未声明图片服务权限 ${permission}`);
    }
  }
}
