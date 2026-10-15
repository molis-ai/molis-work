import type { PluginDatabaseDeclaration, PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginPlatformHome } from "./home-side.js";

/** A plugin the Host starts in a project's platform, with the library in the Home the Host gives it, if any. */
export interface PluginDatabaseEntry {
  readonly definition: PluginDefinition;
  readonly database?: PluginDatabaseDeclaration;
}

/** A plugin library's name: one directory of the Home. */
export const PLUGIN_LIBRARY_NAME = /^[a-z][a-z0-9-]*$/u;

/**
 * What the Host's own start list says about libraries, checked before anything on the list starts (a mistake in the Host's
 * composition, not in a plugin): the list is refused whole, and no library is made.
 *
 * The library is the Host's to name. It is the same service as the Home-level instances have (`openPluginDatabase`), so a
 * plugin never picks a name, a path or a version: the entry does, and the entry is code the Host ships. Sandboxed definitions
 * and platforms that reach no Home cannot be given one. The library has to be registered in the Home's store registry
 * (`home-stores.ts`, W4-11) as this plugin's own, at the baseline the entry declares: so `uninstall --purge-user-data` reaches
 * it, and a library another owner registered (the Host's, a module's, another plugin's) or any other entry of the Home
 * (`feed`, `config`, `agent-runtime`, ...) is refused.
 */
export function assertDatabaseEntries(entries: readonly PluginDatabaseEntry[], home: PluginPlatformHome | null): void {
  const taken = new Set<string>();
  for (const { definition, database } of entries) {
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
    if (taken.has(name)) throw new Error(`库 ${name} 被同一份启动名单里的两个插件声明，库归属重复`);
    taken.add(name);
    const declared = new Set(definition.manifest.permissions.map(item => item.permission));
    for (const permission of ["storage:private", database.read_permission, database.write_permission]) {
      if (!declared.has(permission)) throw new Error(`插件 ${id} 的数据库权限 ${permission} 未在清单声明`);
    }
  }
}
