import { constants, fchmodSync, ftruncateSync, readSync, readdirSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { constants as bufferConstants } from "node:buffer";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import type { PluginOwnerFilesDeclaration, PluginOwnerFilesWriter } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ownerFileErrors, ownerFileHasCode, ownerFileNode, ownerFilePaths, unsafeOwnerFile, withOwnerFile } from "./plugin-owner-files-paths.js";

const bytesOf = (bytes: Uint8Array) => {
  if (!(bytes instanceof Uint8Array)) throw ownerFileErrors.owner_file_invalid("文件内容必须是字节");
  return bytes;
};
function readOwnerFile(file: string): Uint8Array {
  return withOwnerFile(file, constants.O_RDONLY, "file", fd => {
    const parts: Buffer[] = [];
    let total = 0;
    for (;;) {
      const part = Buffer.allocUnsafe(65_536), size = readSync(fd, part);
      if (!size) break;
      total += size;
      if (total > bufferConstants.MAX_LENGTH) throw ownerFileErrors.owner_file_invalid("文件超过运行环境可表示的字节长度");
      parts.push(part.subarray(0, size));
    }
    return Buffer.concat(parts, total);
  });
}

/** No retained descriptors, root creation, authority or secondary lifetime lives in this synchronous IO port. */
export function openPluginOwnerFiles(home: string, declaration: PluginOwnerFilesDeclaration): PluginOwnerFilesWriter {
  const paths = ownerFilePaths(home, declaration);
  const create = (file: string, bytes: Uint8Array) => {
    withOwnerFile(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, "file", fd => writeFileSync(fd, bytes));
  };
  return Object.freeze<PluginOwnerFilesWriter>({
    stat(relative) {
      const { stat } = paths.inspect(relative);
      return !stat ? null : stat.isFile() ? { kind: "file", byte_length: stat.size } : { kind: "directory" };
    },
    read(relative) {
      const target = paths.inspect(relative, "file");
      return target.stat ? readOwnerFile(target.path) : null;
    },
    list(relative) {
      const target = paths.inspect(relative, "directory");
      if (!target.stat) return [];
      return readdirSync(target.path).sort().map(name => {
        const stat = ownerFileNode(join(target.path, name));
        if (!stat) throw unsafeOwnerFile();
        return { name, kind: stat.isDirectory() ? "directory" as const : "file" as const };
      });
    },
    mkdir(relative) {
      const target = paths.inspect(relative, "directory");
      paths.directories(target.parts, true);
    },
    writeFile(relative, bytes, mode) {
      bytesOf(bytes);
      if (mode !== "create" && mode !== "replace") throw ownerFileErrors.owner_file_invalid("文件写入模式无效");
      const target = paths.inspect(relative, "file");
      if (mode === "create") {
        if (target.stat) throw ownerFileErrors.owner_file_exists("文件已经存在");
        paths.directories(target.parts.slice(0, -1), true);
        create(target.path, bytes);
      } else {
        withOwnerFile(target.path, constants.O_WRONLY, "file", fd => { ftruncateSync(fd); writeFileSync(fd, bytes); });
      }
    },
    replaceFileAtomic(relative, bytes) {
      bytesOf(bytes);
      const target = paths.inspect(relative, "file");
      paths.directories(target.parts.slice(0, -1), true);
      const temporary = join(dirname(target.path), `.owner-file-${randomUUID()}.tmp`);
      let created = false;
      try {
        withOwnerFile(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, "file", fd => {
          created = true; writeFileSync(fd, bytes);
        });
        // Recheck the target before rename; no promise of protection against concurrent parent replacement.
        paths.inspect(relative, "file");
        renameSync(temporary, target.path);
        created = false;
      } finally {
        if (created) {
          try { unlinkSync(temporary); }
          catch (error) { if (!ownerFileHasCode(error, "ENOENT")) throw error; }
        }
      }
    },
    copyFile(source, target) {
      const from = paths.inspect(source, "file"), to = paths.inspect(target, "file");
      if (to.stat) throw ownerFileErrors.owner_file_exists("目标文件已经存在");
      const bytes = readOwnerFile(from.path);
      paths.directories(to.parts.slice(0, -1), true);
      create(to.path, bytes);
    },
    removeTree(relative) {
      const target = paths.inspect(relative);
      if (target.parts.length === 1 && target.top === "directory") throw ownerFileErrors.owner_file_invalid("不能删除声明的顶层目录");
      const plan: { path: string; directory: boolean }[] = [];
      const visit = (file: string) => {
        const stat = ownerFileNode(file);
        if (!stat) return;
        if (stat.isDirectory()) for (const name of readdirSync(file)) visit(join(file, name));
        plan.push({ path: file, directory: stat.isDirectory() });
      };
      if (target.stat) visit(target.path);
      for (const node of plan) {
        if (node.directory) rmdirSync(node.path);
        else unlinkSync(node.path);
      }
    },
    setAccess(relative, access) {
      if (access !== "readonly" && access !== "readwrite") throw ownerFileErrors.owner_file_invalid("文件访问模式无效");
      const target = paths.inspect(relative), directory = target.stat?.isDirectory() === true;
      withOwnerFile(target.path, constants.O_RDONLY, directory ? "directory" : "file", fd => {
        // Only the user the Host runs as: no group or other bits on a plugin's files, read-only or not (V-30).
        fchmodSync(fd, directory ? access === "readonly" ? 0o500 : 0o700 : access === "readonly" ? 0o400 : 0o600);
      });
    },
  });
}
