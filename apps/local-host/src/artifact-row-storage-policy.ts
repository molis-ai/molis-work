import { lstatSync, readdirSync, realpathSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { listProjectRoots } from "@molis-ai/molis-work-module-projects";
import { homeSqlitePath, readDatabaseSpace, snapshotFileStat, type SqliteDatabase, type StorageSpace } from "@molis-ai/molis-work-storage";
import { PLATFORM_PLUGIN_REGISTRATIONS } from "./plugin-registry.js";

export function artifactRowLibraryDeclarations() {
  return PLATFORM_PLUGIN_REGISTRATIONS.flatMap(({ manifest }) => {
    const library = manifest.databases?.home;
    return library?.project_rows?.artifact_join ? [{ manifest, library }] : [];
  });
}

function localDirectory(path: string): boolean {
  const found = lstatSync(path, { throwIfNoEntry: false });
  if (!found) {
    const parent = dirname(path);
    if (parent !== path) localDirectory(parent);
    return false;
  }
  if (!found.isDirectory() || realpathSync(path) !== path) throw recoveryRequired();
  return true;
}

function sidecarsAt(file: string): string[] {
  const parent = dirname(file), base = basename(file);
  if (!localDirectory(parent)) return [];
  return readdirSync(parent).filter(name => name === `${base}-journal` || name.startsWith(`${base}-mj`)).map(name => join(parent, name));
}

export const recoveryRequired = () => new ActionError("actions.conflict", "成果固定的 SQLite 日志仍待恢复，请先用正常入口启动并关闭原 Home");
export const wrongArtifactSpace = () => new ActionError("actions.home_mismatch", "成果固定的库与当前 Home 空间不一致");

export function assertArtifactProjectIdentity(db: SqliteDatabase, space: StorageSpace, project: string): void {
  if (JSON.stringify(readDatabaseSpace(db)) !== JSON.stringify(space)) throw wrongArtifactSpace();
  const roots = listProjectRoots(db);
  if (roots.length !== 1 || roots[0]?.project_id !== project) throw recoveryRequired();
}

/** Even a read-only SQLite WAL connection can update SHM. Check its exact files before opening it. */
export function assertArtifactDatabaseFiles(file: string): void {
  if (!localDirectory(dirname(file))) return;
  for (const suffix of ["", "-wal", "-shm"]) {
    const path = file + suffix;
    if (lstatSync(path, { throwIfNoEntry: false })) snapshotFileStat(path);
  }
}

/** An ordinary open cannot use the older SQLite baseline's writable fallback on a candidate with pending recovery. */
export function assertArtifactLibraryReady(file: string): void {
  assertArtifactDatabaseFiles(file);
  if (sidecarsAt(file).length > 0) throw recoveryRequired();
}

/** Filesystem-only detection works before Catalog inspection and on an opaque restore target. These names confer no recovery authority. */
export function artifactRollbackSidecars(root: string, libraries: readonly string[], registeredProjects?: readonly string[]): string[] {
  const found = libraries.flatMap(name => sidecarsAt(homeSqlitePath(root, name)));
  if (registeredProjects) return [...found, ...registeredProjects.flatMap(path => sidecarsAt(join(root, path)))];
  const projects = join(root, "projects");
  if (localDirectory(projects)) {
    for (const entry of readdirSync(projects, { withFileTypes: true })) {
      if (entry.isDirectory() || entry.isSymbolicLink()) found.push(...sidecarsAt(join(projects, entry.name, "molis-work.db")));
    }
  }
  return found;
}
