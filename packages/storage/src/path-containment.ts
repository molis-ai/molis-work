import { realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

function canonicalizePath(targetPath: string): string | null {
  if (!targetPath || targetPath.includes("\0")) return null;
  const resolved = resolve(targetPath);
  try {
    return realpathSync.native(resolved);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | null)?.code;
    if (code !== "ENOENT" && code !== "ENOTDIR") return null;
  }
  const missing: string[] = [];
  let current = resolved;
  while (true) {
    const parent = dirname(current);
    if (parent === current) return null;
    missing.unshift(current.slice(parent.endsWith(sep) ? parent.length : parent.length + sep.length));
    current = parent;
    try {
      const ancestor = realpathSync.native(current);
      return resolve(ancestor, join(...missing));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | null)?.code;
      if (code !== "ENOENT" && code !== "ENOTDIR") return null;
    }
  }
}

/**
 * Whether `candidatePath` lies at or inside `rootPath` after resolving symlinks (`realpathSync.native`)
 * and normalizing relative segments. Fails closed on NUL bytes, broken permissions, symlink loops,
 * sibling prefix collisions (`/root-evil`), or escaping symlinks.
 */
export function isPathInsideRoot(rootPath: string, candidatePath: string): boolean {
  const canonicalRoot = canonicalizePath(rootPath);
  const canonicalCandidate = canonicalizePath(candidatePath);
  if (canonicalRoot === null || canonicalCandidate === null) return false;
  const rel = relative(canonicalRoot, canonicalCandidate);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}
