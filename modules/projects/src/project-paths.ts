import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { projectCatalogErrors as catalogErrors } from "@molis-ai/molis-work-contracts/modules/projects";
import { PERSONAL_SPACE_PROJECT_ID } from "@molis-ai/molis-work-contracts/platform/actions";

const PROJECT_DATABASE_FILE = "molis-work.db";
/** The personal space's partition root under the Home (specs/unified-partition-plugins §4.1, U1). */
export const PERSONAL_SPACE_DIRECTORY = "personal-space";
/** Where the projects' partition roots are under the Home. */
export const PROJECTS_DIRECTORY = "projects";
const STAGE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * The one place a partition's root is derived (specs/unified-partition-plugins §4.1): the personal space is `<Home>/personal-space/`, a project
 * `<Home>/projects/<project_id>/`. Its main database, its own libraries, its plugin files and its terminal state all live under it. The catalog
 * stores no path (W5-17), so a catalog restored into another Home points at that Home's files, and no catalog row can name a file outside the
 * Home. A partition id that is not one plain path segment has no root.
 */
export function partitionRoot(homeDirectory: string, partitionId: string): string {
  plainSegment(partitionId);
  return partitionId === PERSONAL_SPACE_PROJECT_ID ? path.join(homeDirectory, PERSONAL_SPACE_DIRECTORY) : path.join(homeDirectory, PROJECTS_DIRECTORY, partitionId);
}

/** A partition id used as a directory name must be one plain path segment. */
export function plainSegment(partitionId: string): string {
  if (!partitionId || partitionId === "." || partitionId === ".." || /[\\/\0]/.test(partitionId)) {
    throw catalogErrors.project_storage_invalid("项目 ID 不是一个普通的目录名，不能用来定位项目数据库");
  }
  return partitionId;
}

/** A partition's main database: `<partition root>/molis-work.db`. */
export function partitionDatabasePath(homeDirectory: string, partitionId: string): string {
  return path.join(partitionRoot(homeDirectory, partitionId), PROJECT_DATABASE_FILE);
}

/** How a descriptor or a registered path pattern names "any partition's root": the personal space or any one project. */
export const PARTITION_PATTERN = "<partition>";

/** Whether a Home-relative path matches a pattern whose `*` is one directory name and whose `<partition>` is any partition's root. */
export function matchesPartitionPattern(pattern: string, relativePath: string): boolean {
  const escape = (part: string) => part.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const source = pattern.split(PARTITION_PATTERN).map(piece => piece.split("*").map(escape).join("[^/]+"))
    .join(`(?:${escape(PERSONAL_SPACE_DIRECTORY)}|${escape(PROJECTS_DIRECTORY)}/[^/]+)`);
  return new RegExp(`^${source}$`, "u").test(relativePath);
}

/** The partition a Home-relative path is under, or none. */
export function partitionOfRelativePath(relativePath: string): string | null {
  if (relativePath === PERSONAL_SPACE_DIRECTORY || relativePath.startsWith(`${PERSONAL_SPACE_DIRECTORY}/`)) return PERSONAL_SPACE_PROJECT_ID;
  return new RegExp(`^${PROJECTS_DIRECTORY}/([^/]+)/`, "u").exec(relativePath)?.[1] ?? null;
}

/**
 * The Home and partition a main database path names, read from its shape alone (`<Home>/personal-space/molis-work.db` or
 * `<Home>/projects/<id>/molis-work.db`); anything else names none. The caller still checks that the Home is one and owns that partition.
 */
export function partitionOfDatabasePath(databasePath: string): { readonly homeDirectory: string; readonly partitionId: string } | undefined {
  if (path.basename(databasePath) !== PROJECT_DATABASE_FILE) return undefined;
  const root = path.dirname(databasePath), above = path.dirname(root);
  if (path.basename(root) === PERSONAL_SPACE_DIRECTORY) return { homeDirectory: above, partitionId: PERSONAL_SPACE_PROJECT_ID };
  const id = path.basename(root);
  if (path.basename(above) !== PROJECTS_DIRECTORY || id === PERSONAL_SPACE_PROJECT_ID || id.startsWith(".")) return undefined;
  return { homeDirectory: path.dirname(above), partitionId: id };
}

/**
 * `partitionRoot` for a holder of the Home's projects directory (`<Home>/projects`), which is all the catalog keeps: the Home is the directory
 * above it. Every caller passes that directory; none derives a partition's path by itself.
 */
export function projectDirectoryPath(projectsDirectory: string, projectId: string): string {
  return plainSegment(projectId) === PERSONAL_SPACE_PROJECT_ID ? path.join(path.dirname(projectsDirectory), PERSONAL_SPACE_DIRECTORY) : path.join(projectsDirectory, projectId);
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

/**
 * Every partition root on disk, catalog or not: the personal space if it is there, and each entry under `projects/` that is a directory or a link.
 * Only for the checks that must run before the catalog can be read (a restore target, rollback side files, uninstall of a broken Home); every
 * other loop walks `listPartitions()`. Staging and deletion directories (`.staging-*`, `.deleting-*`) are listed too: they hold partition files.
 */
export function partitionRootsOnDisk(homeDirectory: string): string[] {
  const roots: string[] = [];
  const personal = path.join(homeDirectory, PERSONAL_SPACE_DIRECTORY);
  if (existsSync(personal)) roots.push(personal);
  const projects = path.join(homeDirectory, PROJECTS_DIRECTORY);
  if (existsSync(projects)) for (const entry of readdirSync(projects, { withFileTypes: true })) {
    if (entry.isDirectory() || entry.isSymbolicLink()) roots.push(path.join(projects, entry.name));
  }
  return roots;
}
