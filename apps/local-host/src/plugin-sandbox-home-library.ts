import type { HomePluginDatabaseDeclaration, PluginProjectStatements } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginInstance } from "@molis-ai/molis-work-plugin-runtime";
import { homeSqlitePath, type HomeStoreRegistry } from "@molis-ai/molis-work-storage";
import { assertPluginHomeSchema } from "@molis-ai/molis-work-plugin-runtime";
import { installedLibraryAttempt, reconcileInterruptedInstalledLibrary, type InstalledLibraryOwner } from "./installed-plugin-libraries.js";
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
export async function openSandboxHomeLibrary(home: string, owner: InstalledLibraryOwner, declaration: HomePluginDatabaseDeclaration, reserved: HomeStoreRegistry,
  authorize: (permission: string) => void, instance: PluginInstance, limits: Partial<StatementLimits> = {}): Promise<{ statements: PluginProjectStatements; close(): void }> {
  assertPluginHomeSchema(declaration.schema);
  authorize("storage:private");
  const path = homeSqlitePath(home, declaration.store_name);
  const attempt = installedLibraryAttempt(home, declaration);
  const preparation = new ProjectStatementProcess(path, null, limits);
  try {
    const result = await preparation.prepareHome({ op: "initialize-owned-home-library", home, owner, declaration,
      reserved: reserved.stores.map(({ path, owner }) => ({ path, owner })) });
    if (!result.ok) {
      if (result.interrupted) reconcileInterruptedInstalledLibrary(home, owner, declaration, reserved, attempt);
      throw result.error;
    }
    authorize("storage:private");
  } finally { preparation.dispose(); }
  let closed = false;
  const processes = new ProjectStatementProcess(path, null, limits);
  return { statements: isolatedProjectStatements(processes, declaration, authorize, instance, () => closed), close() { closed = true; processes.dispose(); } };
}

/** Preview waits for bounded scratch execution, without touching the real Home or issuing an approval ticket. */
export async function validateSandboxHomeSchema(declaration: HomePluginDatabaseDeclaration): Promise<void> {
  assertPluginHomeSchema(declaration.schema);
  const preparation = new ProjectStatementProcess("", null);
  try {
    const result = await preparation.prepareHome({ op: "validate-home-schema", declaration });
    if (!result.ok) throw result.error;
  } finally { preparation.dispose(); }
}
