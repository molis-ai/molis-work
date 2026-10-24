import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import type { PluginDefinition, PluginFilesDeclaration, PluginOwnerFilesDeclaration, PluginOwnerFilesWriter } from "@molis-ai/molis-work-contracts/platform/plugin";
import { fixtureDeclarationsFor, type PluginPlatformHome } from "./home-side.js";
import { PLUGIN_LIBRARY_NAME } from "./plugin-database-entries.js";
import { ownerFileSegments } from "./plugin-owner-files-paths.js";

export interface PluginOwnerFilesEntry {
  readonly definition: PluginDefinition;
  readonly files?: PluginFilesDeclaration;
  readonly owner_files?: PluginOwnerFilesDeclaration;
  readonly initialize_owner_files?: (writer: PluginOwnerFilesWriter) => void;
  /**
   * On a Home fixture: this is the Home half of a dual-instance plugin, and the project fixture of the same plugin_id is its other
   * half (`PluginRegistration.runtime.dual_instance` for a shipped plugin). A project entry never says it; the scope check does.
   */
  readonly dual_instance?: true;
}
export interface PluginOwnerFilesBinding {
  readonly declaration: PluginOwnerFilesDeclaration;
  readonly initialize?: (writer: PluginOwnerFilesWriter) => void;
}

/** The same catalog and bound fixtures used by the Home supervisor, without starting any instance. */
export function homeOwnerFilesEntries(home: string): PluginOwnerFilesEntry[] {
  return [...BUILTIN_PLUGIN_CATALOG.flatMap(entry => entry.runtime ? [{ ...entry.runtime, definition: entry.runtime.create() }] : []),
    ...fixtureDeclarationsFor(home, "home")];
}

/** Both scopes are checked together before any managed owner IO or initializer. */
export function assertOwnerFilesEntries(homeEntries: readonly PluginOwnerFilesEntry[], projectEntries: readonly PluginOwnerFilesEntry[], home: Pick<PluginPlatformHome, "stores"> | null): void {
  const all = [...homeEntries, ...projectEntries], taken = new Set<string>();
  for (const entry of all) {
    const { definition, owner_files: files, initialize_owner_files: initialize } = entry;
    if (initialize && !files) throw new Error("文件初始化器需要可信文件声明");
    if (!files) continue;
    const id = definition.manifest.plugin_id;
    if (!home) throw new Error(`插件 ${id} 的文件服务需要 Home`);
    if (projectEntries.includes(entry)) throw new Error(`项目插件 ${id} 不能声明 Home 主人文件服务`);
    if (definition.execution === "sandbox") throw new Error(`沙箱插件 ${id} 不能声明主人文件服务`);
    if (!PLUGIN_LIBRARY_NAME.test(files.store_name)) throw new Error("主人文件根必须是普通目录名");
    const store = home.stores.get(files.store_name);
    if (store?.owner !== id) throw new Error(`主人文件根 ${files.store_name} 未登记为插件 ${id} 所有`);
    if (store.library || all.some(other => other.definition.manifest.databases?.home?.store_name === files.store_name || other.files?.store_name === files.store_name)) {
      throw new Error(`主人文件根 ${files.store_name} 不能同时用于数据库或旧文件服务`);
    }
    if (taken.has(files.store_name)) throw new Error(`主人文件根 ${files.store_name} 在启动名单中重复`);
    taken.add(files.store_name);
    const permissions = new Set(definition.manifest.permissions.map(item => item.permission));
    for (const permission of ["storage:private", files.read_permission, files.write_permission]) {
      if (!permission || !permissions.has(permission)) throw new Error(`插件 ${id} 未声明文件权限 ${permission}`);
    }
    if (!Array.isArray(files.entries) || !files.entries.length) throw new Error("主人文件声明至少需要一个顶层条目");
    const names = new Set<string>();
    for (const item of files.entries) {
      if (ownerFileSegments(item.name).length !== 1 || !["file", "directory"].includes(item.kind) || names.has(item.name)) {
        throw new Error("主人文件条目必须是名称唯一的顶层普通文件或目录");
      }
      names.add(item.name);
    }
  }
}
