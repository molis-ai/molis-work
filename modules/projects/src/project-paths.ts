import path from "node:path";
import { projectCatalogErrors as catalogErrors } from "@molis-ai/molis-work-contracts/modules/projects";

const PROJECT_DATABASE_FILE = "molis-work.db";
const STAGE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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

/** Where a deletion moves a project's directory until it is removed: `<projects directory>/.deleting-<project_id>-<uuid>`. */
export function stagedProjectDirectoryPath(projectsDirectory: string, projectId: string, uuid: string): string {
  projectDirectoryPath(projectsDirectory, projectId);
  return path.join(projectsDirectory, `.deleting-${projectId}-${uuid}`);
}

/**
 * The staged directory a deletion receipt stands for, in this Home. The receipt records a whole path, and a catalog can be edited, restored or copied
 * with its Home while a deletion is under way, so the directories in that value count for nothing: its last segment must be a name this project's
 * deletion gives, and the directory above it is always this Home's projects directory. Anything else is refused, and no part of the clean-up may run for
 * it: ask this before the first step.
 */
export function recordedStagedProjectDirectoryPath(projectsDirectory: string, projectId: string, recorded: string): string {
  const name = path.basename(recorded), prefix = `.deleting-${projectId}-`;
  if (!name.startsWith(prefix) || !STAGE_UUID.test(name.slice(prefix.length))) {
    throw catalogErrors.project_storage_invalid("这条删除记录写的暂存目录不是这个项目删除时留下的，这次清理什么也没有动。从备份恢复目录库后再重试清理");
  }
  return stagedProjectDirectoryPath(projectsDirectory, projectId, name.slice(prefix.length));
}
