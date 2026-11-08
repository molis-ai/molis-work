import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, opendirSync, realpathSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";

import { projectCatalogErrors as catalogErrors } from "@molis-ai/molis-work-contracts/modules/projects";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";

import { projectDirectoryPath } from "./project-paths.js";
import type { Row } from "./sqlite.js";

/** What these functions need of a connection: the catalog's, or the upgrade step's (`SqliteBaselineDatabase`). */
export interface ProjectOutputDatabase { prepare(sql: string): { get(...params: unknown[]): unknown; run(...params: unknown[]): unknown } }

/**
 * A project's default output directory (specs/shared-sources-and-surfaces §3 「默认输出目录怎么存」). Its row in `workspaces` stores no path:
 * `canonical_path` is `project-output:<project_id>`, and the folder is `<Home>/outputs/<project_id>/`, derived from the trusted Home each time
 * it is read, the way a project database is (S-102, W5-17). The folder is made the first time something writes or runs there.
 */
export const PROJECT_OUTPUT_PATH_PREFIX = "project-output:";
const OUTPUT_ID_PREFIX = "workspace-output-";

/**
 * The id the default output directory of a project gets, from the project and its earliest event. Event ids are drawn on each device and
 * never synced, so the same project has a different one on every device; a copied Home keeps it. Deterministic, so an upgrade step can
 * compute it and setting the output back to the default finds the same row again.
 */
export function projectOutputHash(projectId: string, firstEventId: string): string {
  return createHash("sha256").update(`${projectId}\0${firstEventId}`).digest("hex").slice(0, 24);
}

export const projectOutputWorkspaceId = (hash: string) => `${OUTPUT_ID_PREFIX}${hash}`;
export const projectOutputMembershipId = (hash: string) => `workspace-output-membership-${hash}`;
export const isProjectOutputWorkspaceId = (workspaceId: string) => workspaceId.startsWith(OUTPUT_ID_PREFIX);

/** The project's earliest event, by `created_at, event_id`. Every registered project has one: `register` writes it in the same transaction. */
export function firstProjectEventId(db: ProjectOutputDatabase, projectId: string): string {
  const row = db.prepare("SELECT event_id FROM project_events WHERE project_id = ? ORDER BY created_at, event_id LIMIT 1").get(projectId) as Row | undefined;
  if (!row) throw catalogErrors.project_storage_invalid("这个项目在目录库里没有任何事件，算不出它的默认输出目录");
  return String(row.event_id);
}

/** The project's default output directory id on this device. */
export function projectOutputId(db: ProjectOutputDatabase, projectId: string): string {
  return projectOutputWorkspaceId(projectOutputHash(projectId, firstProjectEventId(db, projectId)));
}

/**
 * Writes the default output directory's row and its membership, as the project's output, unless the project already has an output. Only
 * reads and writes the catalog: no Home, no folder. `register` calls it for each new project and the catalog upgrade for each existing one.
 */
export function insertProjectOutput(db: ProjectOutputDatabase, projectId: string, at: string, boundBy: string): void {
  if (db.prepare("SELECT 1 FROM workspace_project_memberships WHERE project_id = ? AND role_output = 1").get(projectId)) return;
  const hash = projectOutputHash(projectId, firstProjectEventId(db, projectId));
  db.prepare(`INSERT INTO workspaces (workspace_id, canonical_path, realpath_verified, display_name, created_at, updated_at)
    VALUES (?, ?, 0, 'project-output', ?, ?) ON CONFLICT(workspace_id) DO NOTHING`).run(projectOutputWorkspaceId(hash), `${PROJECT_OUTPUT_PATH_PREFIX}${projectId}`, at, at);
  db.prepare(`INSERT INTO workspace_project_memberships (membership_id, workspace_id, project_id, role_input, role_output, bound_by, created_at, updated_at)
    VALUES (?, ?, ?, 0, 1, ?, ?, ?)`).run(projectOutputMembershipId(hash), projectOutputWorkspaceId(hash), projectId, boundBy, at, at);
}

/** `<outputs>/<project_id>`: the project id has to be one plain path segment, by the same rule as its database directory. */
export function projectOutputDirectoryPath(outputsDirectory: string, projectId: string): string {
  return projectDirectoryPath(outputsDirectory, projectId);
}

/**
 * Checks a default output directory before anything touches it: `outputs` and `outputs/<id>` are each looked at with `lstat` and must be
 * real directories (a symbolic link, or anything else, is refused with `catalog.project_storage_invalid`), and the folder's realpath must be
 * where it was derived. `read` answers whether the folder is there and makes nothing; `write` makes what is missing, then checks again.
 */
export function prepareProjectOutputDirectory(outputsDirectory: string, projectId: string, mode: "read" | "write"): { path: string; exists: boolean } {
  const target = projectOutputDirectoryPath(outputsDirectory, projectId);
  const level = (at: string, make: boolean): boolean => {
    let found;
    try { found = lstatSync(at); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      if (!make) return false;
      mkdirSync(at, { mode: 0o700 });
      found = lstatSync(at);
    }
    if (found.isSymbolicLink() || !found.isDirectory()) throw catalogErrors.project_storage_invalid("默认输出目录或它所在的 outputs 不是普通文件夹（可能是符号链接），不会在这里读写");
    return true;
  };
  if (!level(outputsDirectory, mode === "write") || !level(target, mode === "write")) return { path: target, exists: false };
  if (realpathSync.native(target) !== path.join(realpathSync.native(outputsDirectory), path.basename(target))) {
    throw catalogErrors.project_storage_invalid("默认输出目录的真实位置不在这个 Home 的 outputs 里，不会在这里读写");
  }
  return { path: target, exists: true };
}

/**
 * What the default output directory holds, for the deletion dialog (§3 「永久删除怎么做」): `empty` when it is not there or has nothing in it,
 * `has_files` when it has one entry or more (only the first is read: nothing is counted or walked), and `unknown` when the folder or `outputs`
 * does not pass the check above (a symbolic link, say) or the id is not one plain segment.
 */
export function projectOutputContents(outputsDirectory: string, projectId: string): "empty" | "has_files" | "unknown" {
  let checked: { path: string; exists: boolean };
  try { checked = prepareProjectOutputDirectory(outputsDirectory, projectId, "read"); } catch (error) {
    if (error instanceof ActionError && error.code === "catalog.project_storage_invalid") return "unknown";
    throw error;
  }
  if (!checked.exists) return "empty";
  const entries = opendirSync(checked.path);
  try { return entries.readSync() ? "has_files" : "empty"; } finally { entries.closeSync(); }
}

/**
 * Removes a deleted project's default output directory, when the person chose to (§3 「永久删除怎么做」). The path is derived from the trusted
 * Home and the id, never read from a receipt (S-102), and checked first as for a read: when `outputs` or the folder is a symbolic link or not a
 * directory nothing is removed and `catalog.project_storage_invalid` is thrown, so the step stays to be retried. A folder that is not there is
 * done. Symbolic links inside are removed as links; what they point to stays.
 */
export async function removeProjectOutputDirectory(outputsDirectory: string, projectId: string): Promise<void> {
  const checked = prepareProjectOutputDirectory(outputsDirectory, projectId, "read");
  if (checked.exists) await rm(checked.path, { recursive: true, force: true });
}
