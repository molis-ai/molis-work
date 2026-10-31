import path from "node:path";
import { projectCatalogErrors as catalogErrors } from "@molis-ai/molis-work-contracts/modules/projects";

const PROJECT_DATABASE_FILE = "molis-work.db";

/**
 * The directory of one project: `<projects directory>/<project_id>`. The catalog stores no path (W5-17): this and `projectDatabasePath` are the
 * only places one is derived, so a catalog restored into another Home points at that Home's files, and no catalog row can name a file outside
 * the projects directory. A project id that is not one plain path segment has no directory.
 */
export function projectDirectoryPath(projectsDirectory: string, projectId: string): string {
  if (!projectId || projectId === "." || projectId === ".." || /[\\/\0]/.test(projectId)) {
    throw catalogErrors.project_storage_invalid("项目 ID 不是一个普通的目录名，不能用来定位项目数据库");
  }
  return path.join(projectsDirectory, projectId);
}

export function projectDatabasePath(projectsDirectory: string, projectId: string): string {
  return path.join(projectDirectoryPath(projectsDirectory, projectId), PROJECT_DATABASE_FILE);
}
