import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import { pluginErrors, type PluginDefinition, type PluginFilesDeclaration, type PluginOwnerFilesDeclaration, type PluginOwnerFilesWriter } from "@molis-ai/molis-work-contracts/platform/plugin";
import { fixtureDeclarationsFor, type PluginPlatformHome } from "./home-side.js";
import { PLUGIN_LIBRARY_NAME } from "./plugin-database-entries.js";
import { ownerFileSegments } from "./plugin-owner-files-paths.js";

export interface PluginOwnerFilesEntry {
  readonly definition: PluginDefinition;
  readonly files?: PluginFilesDeclaration;
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

/**
 * What a Home instance is given of its Manifest's `owner_files`: nothing when it declares none; the binding the Host's start list
 * holds for this definition object when it does. A definition that declares files and is not on the list (installed beside it) is
 * refused to start, with its own code, not started without the service.
 */
export function ownerFilesGiven(definition: PluginDefinition, given: PluginOwnerFilesBinding | undefined): PluginOwnerFilesBinding | undefined {
  const declared = definition.manifest.owner_files;
  if (declared === undefined) return undefined;
  if (given === undefined) {
    throw pluginErrors.declaration_invalid(`插件 ${definition.manifest.plugin_id} 的 Manifest 声明了文件根 ${declared.store_name}，但宿主没有把这些文件给它：不在宿主启动名单上的插件现在还没有主人文件`);
  }
  return given;
}

/** The same catalog and bound fixtures used by the Home supervisor, without starting any instance. */
export function homeOwnerFilesEntries(home: string): PluginOwnerFilesEntry[] {
  return [...BUILTIN_PLUGIN_CATALOG.flatMap(entry => entry.runtime ? [{ ...entry.runtime, definition: entry.runtime.create() }] : []),
    ...fixtureDeclarationsFor(home, "home")];
}

/**
 * Both scopes are checked together before any managed owner IO or initializer. A definition's files are what its Manifest declares
 * (`owner_files`); a project's half of a dual-instance plugin shares that Manifest and is given none, while any other project
 * plugin that declares them is refused.
 */
export function assertOwnerFilesEntries(homeEntries: readonly PluginOwnerFilesEntry[], projectEntries: readonly PluginOwnerFilesEntry[], home: Pick<PluginPlatformHome, "stores"> | null): void {
  const all = [...homeEntries, ...projectEntries], taken = new Set<string>();
  for (const entry of all) {
    const { definition, initialize_owner_files: initialize } = entry, files = definition.manifest.owner_files;
    if (initialize && !files) throw new Error("文件初始化器需要可信文件声明");
    if (!files) continue;
    const id = definition.manifest.plugin_id;
    if (projectEntries.includes(entry)) {
      if (homeEntries.some(other => other.dual_instance && other.definition.manifest.plugin_id === id)) continue;
      throw pluginErrors.declaration_invalid(`项目插件 ${id} 不能声明 Home 主人文件服务：它不是双实例插件在项目里的那一半`);
    }
    if (!home) throw new Error(`插件 ${id} 的文件服务需要 Home`);
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
