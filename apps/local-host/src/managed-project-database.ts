import { listProjectRoots, writeProjectRoot } from "@molis-ai/molis-work-module-projects";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { LocalProjectDatabase } from "./project-database.js";
import { catalogErrors } from "./project-catalog-contract.js";
import type { MolisWorkLocalHost } from "./project-host.js";

/**
 * A new project's library: the platform's root row and nothing of any plugin's. Goals makes its own board when the project is
 * first opened (the Host's Goals assembly today, its `start()` after S9), so a library is a project before Goals has run in it (S8, PG-021).
 */
export async function initializeProjectDatabase(databasePath: string, projectId: string): Promise<void> {
  const store = new LocalProjectDatabase(databasePath);
  try {
    writeProjectRoot(store.db, projectId, new Date().toISOString());
    store.checkpoint();
  } finally {
    store.close();
  }
}

/** The library is the project's: exactly one root row, the project it is recorded for, and a library SQLite finds sound. */
export function validateManagedProject(databasePath: string, expectedProjectId: string): void {
  const store = new LocalProjectDatabase(databasePath);
  try {
    const roots = listProjectRoots(store.db);
    if (roots.length !== 1) {
      throw catalogErrors.database_invalid(`项目数据库必须恰好有一行项目根记录: ${databasePath}`);
    }
    if (roots[0]?.project_id !== expectedProjectId) {
      throw catalogErrors.database_invalid("新项目数据库的 project_id 与 project_id 不一致");
    }
    if (!store.integrityCheck()) {
      throw catalogErrors.database_invalid(`SQLite 完整性校验失败: ${databasePath}`);
    }
  } finally {
    store.close();
  }
}

/**
 * `molis-work v1 init` and the management `initialize` on a database no catalog made (docs/cli-and-development.md: the database is created
 * at PATH): the library is a project once it has its root row, which is the platform's and not Goals', so the entry writes it before
 * Goals' action makes the board. A project the catalog made already has it, and a second write leaves it as it is.
 */
export async function ensureStandaloneProjectRoot(host: MolisWorkLocalHost, reference: LocalHostProjectReference): Promise<void> {
  await host.withProject(reference, runtime => { writeProjectRoot(runtime.store.db, reference.project_id, new Date().toISOString()); });
}
