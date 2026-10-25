import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { pluginErrors, type HomePluginDatabaseDeclaration, type PluginDefinition, type PluginProjectStatements } from "@molis-ai/molis-work-contracts/platform/plugin";
import { inspectPluginProjectSchema, type PluginInstance } from "@molis-ai/molis-work-plugin-runtime";
import { describeSqliteSchema, homeSqlitePath, listSqliteObjects, openHomeSqliteFile, type HomeStoreRegistry } from "@molis-ai/molis-work-storage";
import { openInstalledPluginLibrary, type InstalledLibraryOwner } from "./installed-plugin-libraries.js";
import { openPluginDatabase } from "./plugin-database.js";
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
  validateSandboxHomeSchema(declaration);
  const path = homeSqlitePath(home, declaration.store_name);
  let closed = false;
  const open = () => {
    // The same approved construction path as an installed native Home library; give up both Host connections before statements run.
    const created = openPluginDatabase(home, declaration, authorize, instance);
    created.close();
    const processes = new ProjectStatementProcess(path, null, limits);
    return { processes, close() { closed = true; processes.dispose(); } };
  };
  const opened = openInstalledPluginLibrary(home, owner, declaration, reserved, open);
  return { statements: isolatedProjectStatements(opened.processes, declaration, authorize, instance, () => closed), close: opened.close };
}

/** Installing a replacement can discard old files, so the same untrusted declaration must pass before that effect too. */
export function validateSandboxHomeDefinition(definition: PluginDefinition): void {
  if (definition.execution === "sandbox" && definition.manifest.databases?.home) validateSandboxHomeSchema(definition.manifest.databases.home);
}

function validateSandboxHomeSchema(declaration: HomePluginDatabaseDeclaration): void {
  // PLIB-03 checks every statement before even the scratch database executes it. Use the Home library's SQLite implementation;
  // no real library, ledger or file named by an untrusted declaration has been opened yet.
  try {
    inspectPluginProjectSchema(declaration, { scratch: () => openHomeSqliteFile(":memory:"), objects: listSqliteObjects, shape: describeSqliteSchema });
  } catch (error) {
    if (error instanceof ActionError && error.code === "plugin.project_database.declaration_invalid") throw pluginErrors.declaration_invalid(error.message);
    throw error;
  }
}
