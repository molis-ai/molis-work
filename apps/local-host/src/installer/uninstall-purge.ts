import { promises as fs } from "node:fs";
import path from "node:path";
import { assertStorageOwner, hasOnlyStorageOwnerFiles, type StorageOwner } from "@molis-ai/molis-work-storage";
import { agentRuntimeDirectory } from "../agent-runtime-paths.js";
import type { HomeSnapshotStoreRegistry } from "../home-store-snapshot.js";
import { installerErrors } from "./errors.js";
import { pathFingerprint } from "./uninstall-files.js";

// The exact retained paths of the existing owner protocol; not a general exemption for technical-looking files.
const ownerFiles = new Set([
  ".molis-runtime-owner.db", ".molis-runtime-owner.db-journal", ".molis-runtime-owner.db-wal", ".molis-runtime-owner.db-shm",
]);

/** Preview staleness only. Cross-store consistency comes from the actual Home owner, not these metadata checks. */
export function purgePathFingerprint(home: string, target: string, registry: HomeSnapshotStoreRegistry): Promise<string | null> {
  const store = registry.get(path.relative(home, target).split(path.sep).join("/"));
  if (!store) return pathFingerprint(target);
  return pathFingerprint(target, (name, info) => {
    if (!info.isFile() || info.nlink !== 1) return false;
    if (target === agentRuntimeDirectory(home) && ownerFiles.has(name)) return true;
    const sidecar = /^(.*)-(shm|wal)$/u.exec(name);
    if (!sidecar || sidecar[2] === "wal" && info.size !== 0) return false;
    const file = sidecar[1]!;
    const libraryFile = store.library?.file ?? store.path + ".db";
    const library = store.library && (store.library.partition === "project"
      ? file.split("/").length === 3 && file.startsWith("projects/") && file.endsWith("/" + libraryFile) : file === libraryFile);
    return Boolean(store.snapshot.database?.(file)) || Boolean(library);
  });
}

/** Unknown root/config/bin content is protected. Registered data directories and owned release directories are removed whole. */
export async function inspectPurgeInventory(home: string, planned: readonly string[], receipt: string): Promise<string[]> {
  const runtime = agentRuntimeDirectory(home), roots = new Set(["config", "bin", "releases"]), conflicts: string[] = [];
  const covered = [...planned, receipt];
  const visit = async (target: string): Promise<void> => {
    const info = await fs.lstat(target);
    if (target === runtime) {
      if (!info.isDirectory() || info.isSymbolicLink()) { conflicts.push("Agent 锁目录不是普通目录"); return; }
      for (const name of await fs.readdir(runtime)) {
        const item = await fs.lstat(path.join(runtime, name));
        if (ownerFiles.has(name)) {
          if (!item.isFile() || item.nlink !== 1) conflicts.push(`锁骨架路径不是普通单链接文件：agent-runtime/${name}`);
        } else if (!planned.includes(runtime)) conflicts.push(`预览之外出现 Agent 数据：agent-runtime/${name}`);
      }
      return;
    }
    if (covered.some(owned => target === owned || target.startsWith(owned + path.sep))) return;
    if (roots.has(path.relative(home, target)) && info.isDirectory() && !info.isSymbolicLink()) {
      for (const name of await fs.readdir(target)) await visit(path.join(target, name));
      return;
    }
    conflicts.push(`Home 有未归属或预览之外的条目，未执行永久清除：${path.relative(home, target)}`);
  };
  const entries = await fs.readdir(home).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  for (const name of entries) await visit(path.join(home, name));
  return conflicts;
}

/** Keep the original lock inode and directory while deleting every SDK/business entry beside it. */
export async function purgeRegisteredPath(home: string, target: string, owner: StorageOwner): Promise<string[]> {
  if (target !== agentRuntimeDirectory(home)) {
    await fs.rm(target, { recursive: true, force: true });
    return [target];
  }
  assertStorageOwner(target, owner);
  const removed: string[] = [];
  for (const name of await fs.readdir(target)) {
    if (ownerFiles.has(name)) continue;
    assertStorageOwner(target, owner);
    const file = path.join(target, name);
    await fs.rm(file, { recursive: true, force: true });
    removed.push(file);
  }
  if (!hasOnlyStorageOwnerFiles(target, owner)) throw installerErrors["installer.uninstall.conflict"]("Agent 锁目录仍有业务数据，不能报告清除成功");
  return removed;
}

export async function assertPurgeComplete(home: string, owner: StorageOwner): Promise<void> {
  const runtime = agentRuntimeDirectory(home);
  assertStorageOwner(runtime, owner);
  if ((await fs.readdir(home)).some(name => name !== "agent-runtime")
    || (await fs.readdir(runtime)).some(name => !ownerFiles.has(name)) || !hasOnlyStorageOwnerFiles(runtime, owner)) {
    throw installerErrors["installer.uninstall.conflict"]("Home 仍有锁骨架清单之外的内容，不能报告清除成功");
  }
}
