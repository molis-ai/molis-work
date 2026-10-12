import type { PluginDatabaseDeclaration, PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { PERSONAL_HOME_SQLITE_STORES } from "@molis-ai/molis-work-storage";
import type { PluginPlatformHome } from "./home-side.js";

/** A plugin the Host starts in a project's platform, with the library in the Home the Host gives it, if any. */
export interface PluginDatabaseEntry {
  readonly definition: PluginDefinition;
  readonly database?: PluginDatabaseDeclaration;
}

/**
 * The libraries on the uninstall purge list (`PERSONAL_HOME_SQLITE_STORES`) that are not a plugin's to be given: the Host keeps
 * them for itself (docs/system/HOME-DATA.md section 3), and `issues` is the Issue plugin's, which the Host opens through its Home
 * catalog entry. TEMPORARY: a name in the Host's own start list that is one of these is a mistake in the Host's composition
 * (the library would be opened under another structure), which the baseline check at open would only catch when the library
 * already exists. The Home store registry of W4-11 replaces this with "refuse a name another owner has registered"; delete it
 * then. `tests/plugin-project-database.test.ts` fails when a name is added to the purge list without being classified.
 */
const HOST_LIBRARY_NAMES: ReadonlySet<string> = new Set([
  "functions", "connectors", "context-onboarding", "search", "memory", "server", "plugin-runtime", "issues",
]);

/**
 * What the Host's own start list says about libraries, checked before anything on the list starts (a mistake in the Host's
 * composition, not in a plugin): the list is refused whole, and no library is made.
 *
 * The library is the Host's to name. It is the same service as the Home-level instances have (`openPluginDatabase`), so a
 * plugin never picks a name, a path or a version: the entry does, and the entry is code the Host ships. Sandboxed definitions
 * and platforms that reach no Home cannot be given one. The name has to be on the uninstall purge list, so that
 * `uninstall --purge-user-data` reaches the library (docs/system/HOME-DATA.md section 11) and every other top-level directory
 * of the Home (`feed`, `config`, `agent-runtime`, ...) is refused by that alone; of the names on it, the Host's own libraries
 * are refused (`HOST_LIBRARY_NAMES`). Whether a name is also used by a Home-level entry is not checked here: that list is the
 * catalog's (`HomePluginHost.start` checks its own), and two baselines under one name are refused when the library is opened.
 */
export function assertDatabaseEntries(entries: readonly PluginDatabaseEntry[], home: PluginPlatformHome | null): void {
  const taken = new Set<string>();
  for (const { definition, database } of entries) {
    if (!database) continue;
    const id = definition.manifest.plugin_id;
    if (home === null) throw new Error(`插件 ${id} 声明了 Home 库，但这个插件平台没有 Home`);
    if (definition.execution === "sandbox") throw new Error(`沙箱插件 ${id} 不能有 Home 库：库是宿主进程里的服务，沙箱里的代码拿不到`);
    const name = database.store_name;
    if (!/^[a-z][a-z0-9-]*$/u.test(name)) throw new Error(`库名 ${JSON.stringify(name)} 必须是一个目录名（小写字母开头，只含小写字母、数字和连字符）`);
    if (!(PERSONAL_HOME_SQLITE_STORES as readonly string[]).includes(name)) {
      throw new Error(`库名 ${name} 不在卸载清除清单（PERSONAL_HOME_SQLITE_STORES）里：先把它加进清单，uninstall --purge-user-data 才清得到`);
    }
    if (HOST_LIBRARY_NAMES.has(name)) throw new Error(`库名 ${name} 是宿主自己的库，插件不能用`);
    if (taken.has(name)) throw new Error(`库 ${name} 被同一份启动名单里的两个插件声明，库归属重复`);
    taken.add(name);
    const declared = new Set(definition.manifest.permissions.map(item => item.permission));
    for (const permission of ["storage:private", database.read_permission, database.write_permission]) {
      if (!declared.has(permission)) throw new Error(`插件 ${id} 的数据库权限 ${permission} 未在清单声明`);
    }
  }
}
