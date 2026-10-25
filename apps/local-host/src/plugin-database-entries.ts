import { pluginErrors, type HomePluginDatabaseDeclaration, type PluginDefinition, type PluginInstanceRecord } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { InstalledLibraryOwner } from "./installed-plugin-libraries.js";
import type { PluginPlatformHome } from "./home-side.js";
import { assertProjectRowsEntries, projectRowsStatements, sandboxRefusal } from "./plugin-project-rows.js";

/** A plugin on the Host's start list; the library in the Home it is given, if any, is the one its Manifest declares (`databases.home`). */
interface PluginDatabaseEntry {
  readonly definition: PluginDefinition;
}

/** A plugin library's name: one directory of the Home. */
export const PLUGIN_LIBRARY_NAME = /^[a-z][a-z0-9-]*$/u;

/**
 * What the Host's own start list says about libraries, checked before anything on the list starts (a mistake in the Host's
 * composition, not in a plugin): the list is refused whole, and no library is made.
 *
 * The library is the plugin's own declaration (`databases.home` in its Manifest), but only a plugin on the Host's start list is
 * given it, and only if the Home's store registry (`home-stores.ts`, W4-11) holds that library as this plugin's own at the same
 * baseline: so `uninstall --purge-user-data` reaches it, and a library another owner registered (the Host's, a module's, another
 * plugin's) or any other entry of the Home (`feed`, `config`, `agent-runtime`, ...) is refused. It is the same service as the
 * Home-level instances have (`openPluginDatabase`). Sandboxed definitions and platforms that reach no Home cannot be given one.
 *
 * A library partitioned by project (`partition: "project"`) is only for a Home-level plugin (`scope`): a project's plugin keeps its
 * data in that project already. The Manifest and the registry have to agree on it, so the files uninstall and project deletion
 * remove are the ones the plugin writes.
 */
export function assertDatabaseEntries(entries: readonly PluginDatabaseEntry[], home: PluginPlatformHome | null, scope: "home" | "project"): void {
  assertProjectRowsEntries(entries);
  const taken = new Set<string>();
  for (const { definition } of entries) {
    const database = definition.manifest.databases?.home;
    if (!database) continue;
    const id = definition.manifest.plugin_id;
    if (home === null) throw new Error(`插件 ${id} 声明了 Home 库，但这个插件平台没有 Home`);
    if (definition.execution === "sandbox") throw new Error(`沙箱插件 ${id} 不能有 Home 库：库是宿主进程里的服务，沙箱里的代码拿不到`);
    const name = database.store_name;
    if (!PLUGIN_LIBRARY_NAME.test(name)) throw new Error(`库名 ${JSON.stringify(name)} 必须是一个目录名（小写字母开头，只含小写字母、数字和连字符）`);
    const store = home.stores.get(name);
    if (!store) throw new Error(`库 ${name} 没有登记在 Home 的存储登记里（home-stores.ts）：先登记，uninstall --purge-user-data 才清得到`);
    if (!store.library) throw new Error(`Home 里的 ${name} 归 ${store.owner}，不是库`);
    if (store.owner !== id) throw new Error(`库 ${name} 登记的主人是 ${store.owner}，插件 ${id} 不能用`);
    if (store.library.baseline.version !== database.version || store.library.baseline.schema !== database.schema) {
      throw new Error(`插件 ${id} 声明的库 ${name} 与登记的基线不同`);
    }
    if (database.partition !== undefined && (scope !== "home" || database.partition !== "project")) {
      throw new Error(`插件 ${id} 的库只有 Home 级插件能按项目分开：项目里的插件本来就把数据放在项目里`);
    }
    if (store.library.partition !== database.partition) throw new Error(`插件 ${id} 声明的库 ${name} 与登记的分区方式不同`);
    if (taken.has(name)) throw new Error(`库 ${name} 被同一份启动名单里的两个插件声明，库归属重复`);
    taken.add(name);
    const declared = new Set(definition.manifest.permissions.map(item => item.permission));
    for (const permission of ["storage:private", database.read_permission, database.write_permission]) {
      if (!declared.has(permission)) throw new Error(`插件 ${id} 的数据库权限 ${permission} 未在清单声明`);
    }
  }
}

/** What a running definition is given: the library its Manifest declares, and, for a plugin the Host did not ship, the install record's owner. */
export interface HomeLibraryGrant {
  readonly declaration: HomePluginDatabaseDeclaration;
  /** Set for an installed plugin: its library is made and checked through the ledger (`openInstalledPluginLibrary`), not the registry. */
  readonly installed?: InstalledLibraryOwner;
}

/**
 * The library a running definition is given, `given` being what the Host's start list holds for it (`pluginEntryIdentity`) and `record`
 * its install record. None when its Manifest declares none. A plugin on the list gets the library the registry holds as its own. One
 * that is not on it, run by the Host (not sandboxed), gets its declared library under the ledger, with the publisher the install
 * record fixed at install time (`openInstalledPluginLibrary`); a sandboxed one has none, and does not start without the service it
 * declared.
 */
export function homeLibraryFor(definition: PluginDefinition, given: HomePluginDatabaseDeclaration | undefined, record: PluginInstanceRecord | null): HomeLibraryGrant | undefined {
  const declared = definition.manifest.databases?.home, id = definition.manifest.plugin_id;
  if (declared === undefined) return undefined;
  if (given !== undefined) return { declaration: given };
  if (declared.project_rows && definition.execution === "sandbox") throw sandboxRefusal(definition);
  if (definition.execution === "sandbox") {
    throw pluginErrors.declaration_invalid(`沙箱插件 ${id} 声明了 Home 库 ${declared.store_name}，沙箱里的代码拿不到宿主进程里的库`);
  }
  if (record === null || record.plugin_id !== id) {
    throw pluginErrors.declaration_invalid(`插件 ${id} 声明了 Home 库 ${declared.store_name}，但没有它的安装记录：库的发布者取自安装记录`);
  }
  projectRowsStatements(declared, id);
  return { declaration: declared, installed: { plugin_id: record.plugin_id, publisher_signature: record.publisher_signature } };
}
