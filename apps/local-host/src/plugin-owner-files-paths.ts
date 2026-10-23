import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, realpathSync, type Stats } from "node:fs";
import { join } from "node:path";
import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginOwnerFilesDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import { PLUGIN_LIBRARY_NAME } from "./plugin-database-entries.js";

export const ownerFileErrors = defineErrorCodes("host", {
  owner_file_invalid: "invalid", owner_file_unsafe: "forbidden", owner_file_exists: "conflict",
});
export const ownerFileHasCode = (error: unknown, code: string) => error instanceof Error && "code" in error && error.code === code;
export const unsafeOwnerFile = () => ownerFileErrors.owner_file_unsafe("文件必须位于声明目录内，不能使用链接或特殊节点");

export function ownerFileSegments(relative: string): string[] {
  if (typeof relative !== "string" || /[\\\u0000]/u.test(relative) || /^[a-z]:/iu.test(relative)) throw ownerFileErrors.owner_file_invalid("文件路径必须是严格相对路径");
  const parts = relative.split("/");
  if (parts.some(part => !part || part === "." || part === "..")) throw ownerFileErrors.owner_file_invalid("文件路径不能包含空段或点段");
  return parts;
}

export function ownerFileNode(file: string): Stats | null {
  let stat: Stats;
  try { stat = lstatSync(file); }
  catch (error) { if (ownerFileHasCode(error, "ENOENT")) return null; throw error; }
  assertOwnerFileNode(stat);
  return stat;
}

function assertOwnerFileNode(stat: Stats): void {
  if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile()) || (stat.isFile() && stat.nlink > 1)) throw unsafeOwnerFile();
}

/** NOFOLLOW and fstat precede every read, truncation, write and chmod. */
export function withOwnerFile<Result>(file: string, flags: number, kind: "file" | "directory", run: (fd: number, stat: Stats) => Result): Result {
  const fd = openSync(file, flags | constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o600);
  try {
    const stat = fstatSync(fd);
    assertOwnerFileNode(stat);
    if (kind === "file" ? !stat.isFile() : !stat.isDirectory()) throw unsafeOwnerFile();
    return run(fd, stat);
  } finally { closeSync(fd); }
}

/** Binding is read-only. Only an authorized writer asks for directory creation. */
export function ownerFilePaths(home: string, declaration: PluginOwnerFilesDeclaration) {
  if (!PLUGIN_LIBRARY_NAME.test(declaration.store_name)) throw ownerFileErrors.owner_file_invalid("文件根名称无效");
  const root = realpathSync(home);
  const entries = new Map(declaration.entries.map(entry => [entry.name, entry.kind]));
  const parse = (relative: string, kind?: "file" | "directory") => {
    const parts = ownerFileSegments(relative), top = entries.get(parts[0]!);
    if (!top || (top === "file" && parts.length > 1) || (parts.length === 1 && kind && top !== kind)) {
      throw ownerFileErrors.owner_file_invalid("路径或节点类型不在文件声明中");
    }
    return { parts, path: join(root, declaration.store_name, ...parts), top };
  };
  const directories = (parts: readonly string[], create: boolean): boolean => {
    let current = root;
    for (const part of [declaration.store_name, ...parts]) {
      current = join(current, part);
      let stat = ownerFileNode(current);
      if (!stat && create) {
        try { mkdirSync(current, { mode: 0o700 }); }
        catch (error) { if (!ownerFileHasCode(error, "EEXIST")) throw error; }
        stat = ownerFileNode(current);
      }
      if (!stat) return false;
      if (!stat.isDirectory()) throw unsafeOwnerFile();
    }
    return true;
  };
  const inspect = (relative: string, kind?: "file" | "directory") => {
    const target = parse(relative, kind);
    const stat = directories(target.parts.slice(0, -1), false) ? ownerFileNode(target.path) : null;
    const expected = kind ?? (target.parts.length === 1 ? target.top : undefined);
    if (stat && expected && (expected === "file" ? !stat.isFile() : !stat.isDirectory())) throw unsafeOwnerFile();
    return { ...target, stat };
  };
  return { inspect, directories };
}
