import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginPlatformHome } from "./home-side.js";
import { PLUGIN_LIBRARY_NAME } from "./plugin-database-entries.js";

/** Check the start list before any plugin starts or receives a configuration port; a definition's settings are what its Manifest declares (`model_configuration`). */
export function assertModelConfigurationEntries(entries: readonly { definition: PluginDefinition }[], home: PluginPlatformHome | null): void {
  const files = new Set<string>(), providers = new Set<string>();
  for (const { definition } of entries) {
    const declaration = definition.manifest.model_configuration;
    if (!declaration) continue;
    const id = definition.manifest.plugin_id;
    if (!home || definition.execution === "sandbox") throw new Error(`插件 ${id} 的模型设置需要宿主执行与 Home`);
    const { store_name, file_name } = declaration.preference;
    if (!PLUGIN_LIBRARY_NAME.test(store_name) || !/^[a-z][a-z0-9-]*\.json$/u.test(file_name)) throw new Error("模型偏好只接受普通库名与单层 JSON 文件名");
    if (home.stores.get(store_name)?.owner !== id) throw new Error(`模型偏好目录 ${store_name} 未登记为插件 ${id} 所有`);
    const { provider_id, display_name } = declaration.custom_provider;
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/u.test(provider_id) || !display_name.trim()) throw new Error("模型设置的专用供应商声明无效");
    const file = `${store_name}/${file_name}`;
    if (files.has(file) || providers.has(provider_id)) throw new Error("模型设置偏好文件或专用供应商在启动名单中重复");
    files.add(file); providers.add(provider_id);
    const permissions = new Set(definition.manifest.permissions.map(item => item.permission));
    for (const permission of ["storage:private", "model:invoke"]) {
      if (!permissions.has(permission)) throw new Error(`插件 ${id} 的模型设置权限 ${permission} 未在清单声明`);
    }
    for (const kind of ["read", "save"] as const) {
      const reference = declaration.actions[kind];
      const actions = definition.manifest.actions?.filter(action => action.capability_id === reference.capability_id && action.version === reference.version) ?? [];
      const action = actions[0];
      if (actions.length !== 1 || !action || action.operation !== (kind === "read" ? "query" : "command")
        || !action.action.permissions.length || action.action.permissions.some(permission => !permissions.has(permission))) {
        throw new Error(`插件 ${id} 的模型设置 ${kind} 必须指向自己的唯一动作并声明权限`);
      }
    }
  }
}
