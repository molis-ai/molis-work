import type { PluginDefinition, PluginFilesDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginPlatformHome } from "./home-side.js";
import { PLUGIN_LIBRARY_NAME } from "./plugin-database-entries.js";

/** Validate the whole trusted start list before any plugin or directory is opened. */
export function assertFilesEntries(entries: readonly { definition: PluginDefinition; files?: PluginFilesDeclaration }[], home: PluginPlatformHome | null): void {
  const taken = new Set<string>();
  for (const { definition, files } of entries) {
    if (!files) continue;
    const id = definition.manifest.plugin_id;
    if (!home) throw new Error(`插件 ${id} 声明了私有文件，但这个插件平台没有 Home`);
    if (definition.execution === "sandbox") throw new Error(`沙箱插件 ${id} 不能有宿主私有文件服务`);
    if (!PLUGIN_LIBRARY_NAME.test(files.store_name) || !PLUGIN_LIBRARY_NAME.test(files.directory)) throw new Error("私有文件声明只接受两个普通目录名");
    const owner = home.stores.get(files.store_name)?.owner;
    if (owner !== id) throw new Error(`私有文件目录 ${files.store_name} 未登记为插件 ${id} 所有`);
    if (!Number.isSafeInteger(files.max_file_bytes) || files.max_file_bytes < 1) throw new Error("私有文件上限必须为正整数字节");
    const key = `${files.store_name}/${files.directory}`;
    if (taken.has(key)) throw new Error(`私有文件目录 ${key} 在启动名单中重复`);
    taken.add(key);
    const permissions = new Set(definition.manifest.permissions.map(item => item.permission));
    for (const permission of ["storage:private", files.read_permission, files.write_permission]) {
      if (!permission || !permissions.has(permission)) throw new Error(`插件 ${id} 的文件权限 ${permission} 未在清单声明`);
    }
  }
}
