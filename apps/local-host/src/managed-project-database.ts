import type { BoardSnapshot } from "@molis-ai/molis-work-plugin-goals";
import { LocalProjectDatabase } from "./project-database.js";
import { GoalProjectApplication } from "./goal-project-application.js";
import { MolisWorkProjectCatalogError } from "./project-catalog-contract.js";

export async function initializeProjectDatabase(
  databasePath: string,
  projectId: string,
  displayName: string,
  actorId: string,
): Promise<void> {
  const store = new LocalProjectDatabase(databasePath);
  try {
    new GoalProjectApplication(store).initializeBoard({
      project_id: projectId,
      title: displayName,
      actor_id: actorId,
      idempotency_key: `project-catalog-create-${projectId}`,
    });
    store.checkpoint();
  } finally {
    store.close();
  }
}

export function validateManagedBoard(databasePath: string, expectedProjectId: string): void {
  const board = readManagedBoard(databasePath, false);
  if (board.projectId !== expectedProjectId) {
    throw new MolisWorkProjectCatalogError("catalog.database_invalid", "新项目数据库的 project_id 与 project_id 不一致");
  }
}

export function readManagedBoard(
  databasePath: string,
  checkpoint: boolean,
): { projectId: string; snapshot: BoardSnapshot; serializedSnapshot: string } {
  const store = new LocalProjectDatabase(databasePath);
  try {
    const projectIds = store.goalsQuery.listProjectIds();
    if (projectIds.length !== 1 || typeof projectIds[0] !== "string" || !projectIds[0]) {
      throw new MolisWorkProjectCatalogError(
        "catalog.database_invalid",
        `项目数据库必须恰好包含一个 Board: ${databasePath}`,
      );
    }
    const projectId = projectIds[0];
    if (!store.integrityCheck()) {
      throw new MolisWorkProjectCatalogError("catalog.database_invalid", `SQLite 完整性校验失败: ${databasePath}`);
    }
    const snapshot = store.snapshot(projectId);
    if (checkpoint) store.checkpoint();
    return { projectId, snapshot, serializedSnapshot: JSON.stringify(snapshot) };
  } finally {
    store.close();
  }
}
