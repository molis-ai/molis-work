import type { HomePluginDatabaseDeclaration, PluginProjectStatements } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginInstance } from "@molis-ai/molis-work-plugin-runtime";
import { homeSqlitePath, openBaselineHomeSqlite, type HomeStoreRegistry } from "@molis-ai/molis-work-storage";
import { openInstalledPluginLibrary, type InstalledLibraryOwner } from "./installed-plugin-libraries.js";
import { isolatedProjectStatements } from "./plugin-project-isolation.js";
import { ProjectStatementProcess, type StatementLimits } from "./project-statement-process.js";

/**
 * A sandboxed package's library in the Home (`services.database_statements`, PG-017 BL-490). The package declares it in its Manifest
 * (`databases.home`) like any installed plugin, and gets the same ledger (`openInstalledPluginLibrary`: the name is free, the publisher is
 * the install record's, the version and schema are the recorded ones); what differs is who runs its statements. The Host makes the file
 * and then holds no connection to it: the statements run in a process of their own that the Host kills when one runs too long or takes
 * too much memory (`ProjectStatementProcess`, S-59), with the checks of the Host's own client (`isolatedProjectStatements`). A library
 * partitioned by project is refused by the ledger, as it is for every installed plugin.
 */
export function openSandboxHomeLibrary(home: string, owner: InstalledLibraryOwner, declaration: HomePluginDatabaseDeclaration, reserved: HomeStoreRegistry,
  authorize: (permission: string) => void, instance: PluginInstance, limits: Partial<StatementLimits> = {}): { statements: PluginProjectStatements; close(): void } {
  const path = homeSqlitePath(home, declaration.store_name);
  let closed = false;
  const open = () => {
    // Made here, with its schema, and let go: SQLite's write-ahead log is the library's mode, so the process's connections share the file with it.
    const created = openBaselineHomeSqlite(home, declaration.store_name, declaration);
    try { created.exec("PRAGMA journal_mode = WAL"); } finally { created.close(); }
    const processes = new ProjectStatementProcess(path, null, limits);
    return { processes, close() { closed = true; processes.dispose(); } };
  };
  const opened = openInstalledPluginLibrary(home, owner, declaration, reserved, open);
  return { statements: isolatedProjectStatements(opened.processes, declaration, authorize, instance, () => closed), close: opened.close };
}
