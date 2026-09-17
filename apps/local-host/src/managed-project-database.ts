import { LocalSqliteStorage } from "@molis-ai/molis-work-storage";
import { createExecutionQueryApi } from "@molis-ai/molis-work-module-execution";
import type { ProjectRecord as MolisWorkProjectRecord } from "@molis-ai/molis-work-contracts/modules/projects";
import type { BoardSnapshot } from "@molis-ai/molis-work-plugin-goals";
import { LocalProjectDatabase } from "./project-database.js";
import { GoalProjectApplication } from "./goal-project-application.js";
import { MolisWorkProjectCatalogError } from "./project-catalog-contract.js";

export async function initializeProjectDatabase(
  databasePath: string,
  boardId: string,
  displayName: string,
  actorId: string,
): Promise<void> {
  const store = new LocalProjectDatabase(databasePath);
  try {
    new GoalProjectApplication(store).initializeBoard({
      board_id: boardId,
      title: displayName,
      actor_id: actorId,
      idempotency_key: `project-catalog-create-${boardId}`,
    });
    store.checkpoint();
  } finally {
    store.close();
  }
}

export function validateManagedBoard(databasePath: string, expectedBoardId: string): void {
  const board = readManagedBoard(databasePath, false);
  if (board.boardId !== expectedBoardId) {
    throw new MolisWorkProjectCatalogError("catalog.legacy_invalid", "新项目数据库的 board_id 与 project_id 不一致");
  }
}

export function readManagedBoard(
  databasePath: string,
  checkpoint: boolean,
): { boardId: string; snapshot: BoardSnapshot; serializedSnapshot: string } {
  const store = new LocalProjectDatabase(databasePath);
  try {
    const boardIds = store.goalsQuery.listBoardIds();
    if (boardIds.length !== 1 || typeof boardIds[0] !== "string" || !boardIds[0]) {
      throw new MolisWorkProjectCatalogError(
        "catalog.legacy_invalid",
        `项目数据库必须恰好包含一个 Board: ${databasePath}`,
      );
    }
    const boardId = boardIds[0];
    if (!store.integrityCheck()) {
      throw new MolisWorkProjectCatalogError("catalog.legacy_invalid", `SQLite 完整性校验失败: ${databasePath}`);
    }
    const snapshot = store.snapshot(boardId);
    if (checkpoint) store.checkpoint();
    return { boardId, snapshot, serializedSnapshot: JSON.stringify(snapshot) };
  } finally {
    store.close();
  }
}

export function assertProjectHasNoActiveWork(project: MolisWorkProjectRecord): void {
    let projectDb: LocalSqliteStorage | null = null;
    try {
      projectDb = new LocalSqliteStorage(project.database_path, { readonly: true });
      const now = new Date().toISOString();
      const execution = createExecutionQueryApi(projectDb.db);
      const activeClaimCount = execution.activeClaimCount(project.board_id, now);
      const unfinishedRunCount = execution.nonterminalRunCount(project.board_id);
      if (activeClaimCount > 0 || unfinishedRunCount > 0) {
        throw new MolisWorkProjectCatalogError(
          "catalog.project_active_work",
          "项目存在有效 Claim 或未结束 Run，不能删除项目及其数据库",
        );
      }
    } catch (error) {
      if (error instanceof MolisWorkProjectCatalogError) throw error;
      throw new MolisWorkProjectCatalogError(
        "catalog.project_storage_invalid",
        `无法确认项目是否仍有进行中的工作，拒绝删除: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      projectDb?.close();
    }
  }
