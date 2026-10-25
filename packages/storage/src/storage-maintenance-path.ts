import { lstatSync, type Stats } from "node:fs";
import { dirname, isAbsolute, join, parse, resolve } from "node:path";

const invalid = (): never => { throw Object.assign(new Error("维护目标路径不存在、已替换或包含链接"), { code: "storage.maintenance_path" }); };
function stat(path: string): Stats | undefined {
  try { return lstatSync(path); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}
type Identity = { path: string; dev: number; ino: number };
/** Read-only inspection of the actual ancestors and selected node; never resolves a link into another target. */
function nodes(path: string, kind: "file" | "directory"): { present: boolean; identities: Identity[] } {
  if (!isAbsolute(path) || resolve(path) !== path) invalid();
  const identities: Identity[] = [];
  let at = parse(path).root;
  const parts = path.slice(at.length).split("/");
  for (let index = 0; index < parts.length; index++) {
    at = join(at, parts[index]!);
    const found = stat(at);
    if (!found) return { present: false, identities };
    const directory = index < parts.length - 1 || kind === "directory";
    if (found.isSymbolicLink() || (directory ? !found.isDirectory() : !found.isFile() || found.nlink !== 1)) invalid();
    identities.push({ path: at, dev: found.dev, ino: found.ino });
  }
  return { present: true, identities };
}

/** Fixed physical path for one existing-file maintenance operation; missing stays missing until a new attempt. */
export interface ExistingStoragePath {
  readonly exists: boolean;
  assertCurrent(): void;
}
export function inspectExistingStoragePath(path: string, kind: "file" | "directory"): ExistingStoragePath {
  const original = nodes(path, kind);
  return { exists: original.present, assertCurrent() {
    const found = nodes(path, kind);
    if (found.present !== original.present || found.identities.length !== original.identities.length || original.identities.some((node, index) => {
      const now = found.identities[index]; return !now || now.path !== node.path || now.dev !== node.dev || now.ino !== node.ino;
    })) invalid();
  } };
}

/** SQLite owns sidecar creation/removal; every sidecar that exists must still be a regular unaliased file. */
export function inspectExistingSqlitePath(path: string): ExistingStoragePath {
  const database = inspectExistingStoragePath(path, "file");
  const sidecars = () => {
    // Inspect the complete path again: a dangling ancestor link is not an absent database.
    nodes(dirname(path), "directory");
    for (const suffix of ["-wal", "-shm", "-journal"]) {
      const found = nodes(path + suffix, "file");
      if (found.present && !database.exists) invalid();
    }
  };
  sidecars();
  return { exists: database.exists, assertCurrent() { database.assertCurrent(); sidecars(); } };
}
