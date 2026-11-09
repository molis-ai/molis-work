import { lstatSync, readdirSync, realpathSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { homeSqlitePath } from "@molis-ai/molis-work-storage";
import { PLATFORM_PLUGIN_REGISTRATIONS } from "./plugin-registry.js";

export function artifactRowLibraryDeclarations() {
  return PLATFORM_PLUGIN_REGISTRATIONS.flatMap(({ manifest }) => {
    const library = manifest.databases?.home;
    return library?.project_rows?.artifact_join ? [{ manifest, library }] : [];
  });
}

function localDirectory(path: string): boolean {
  const found = lstatSync(path, { throwIfNoEntry: false });
  if (found?.isSymbolicLink() || found?.isDirectory() && realpathSync(path) !== path) throw recoveryRequired();
  return found?.isDirectory() === true;
}

function sidecarsAt(file: string): string[] {
  const parent = dirname(file), base = basename(file);
  if (!localDirectory(parent)) return [];
  return readdirSync(parent).filter(name => name === `${base}-journal` || name.startsWith(`${base}-mj`)).map(name => join(parent, name));
}

export const recoveryRequired = () => new ActionError("actions.conflict", "成果固定的 SQLite 日志仍待恢复，请先用正常入口启动并关闭原 Home");

/** An ordinary open cannot use the older SQLite baseline's writable fallback on a candidate with pending recovery. */
export function assertArtifactLibraryReady(file: string): void {
  if (sidecarsAt(file).length > 0) throw recoveryRequired();
}

/** Filesystem-only detection works before Catalog inspection and on an opaque restore target. These names confer no recovery authority. */
export function artifactRollbackSidecars(root: string, libraries: readonly string[]): string[] {
  const projects = join(root, "projects"), found = libraries.flatMap(name => sidecarsAt(homeSqlitePath(root, name)));
  if (localDirectory(projects)) {
    for (const entry of readdirSync(projects, { withFileTypes: true })) {
      if (entry.isDirectory() || entry.isSymbolicLink()) found.push(...sidecarsAt(join(projects, entry.name, "molis-work.db")));
    }
  }
  return found;
}
