import { constants, promises as fs } from "node:fs";
import path from "node:path";
import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import { createLazyFileSecretStore, readExistingSecret } from "@molis-ai/molis-work-storage";
import { SUPPORTED_RUNTIME_IDS, type SupportedRuntimeId } from "./runtime-integration-contract.js";
import { writeAtomic } from "./runtime-installation-files.js";

export const RUNTIME_CONFIG_BACKUP_OWNER = "molis-work-runtime-config-backup-v1";
const errors = defineErrorCodes("installer.runtime_backup", {
  invalid: "invalid", missing: "not_found", key_unavailable: "unavailable", conflict: "conflict",
});
const absent = (error: unknown) => error instanceof Error && "code" in error && error.code === "ENOENT";

export interface RuntimeConfigBackupReference {
  schema_version: 1;
  owner: typeof RUNTIME_CONFIG_BACKUP_OWNER;
  runtime_id: SupportedRuntimeId;
  plan_id: string;
  auth_ref: string;
  mode: number;
}

export function runtimeConfigBackupPath(homeDirectory: string, runtimeId: SupportedRuntimeId, planId: string): string {
  if (typeof homeDirectory !== "string" || !path.isAbsolute(homeDirectory) || !SUPPORTED_RUNTIME_IDS.includes(runtimeId)
    || typeof planId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/u.test(planId)) {
    throw errors.invalid("配置备份需要明确 Home、受支持的 Runtime 和有效的计划编号");
  }
  return path.join(homeDirectory, "runtime-config-backups", runtimeId, planId + ".bak");
}

async function directory(home: string, runtimeId: SupportedRuntimeId, create: boolean): Promise<string | null> {
  let root: string;
  try { root = await fs.realpath(home); } catch (error) { if (absent(error) && !create) return null; throw error; }
  for (const name of ["runtime-config-backups", runtimeId]) {
    root = path.join(root, name);
    let stat;
    try { stat = await fs.lstat(root); }
    catch (error) {
      if (!absent(error)) throw error;
      if (!create) return null;
      try { await fs.mkdir(root, { mode: 0o700 }); }
      catch (failure) { if (!(failure instanceof Error && "code" in failure && failure.code === "EEXIST")) throw failure; }
      stat = await fs.lstat(root);
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw errors.invalid("配置备份目录不能是链接或其他文件");
  }
  return root;
}

function reference(runtimeId: SupportedRuntimeId, planId: string, mode: number): RuntimeConfigBackupReference {
  if (!Number.isInteger(mode) || mode < 0 || mode > 0o777) throw errors.invalid("配置备份的原权限无效");
  return { schema_version: 1, owner: RUNTIME_CONFIG_BACKUP_OWNER, runtime_id: runtimeId, plan_id: planId,
    auth_ref: "runtime-config-backup:" + runtimeId + ":" + planId, mode };
}

async function readReference(home: string, runtimeId: SupportedRuntimeId, planId: string): Promise<RuntimeConfigBackupReference | null> {
  runtimeConfigBackupPath(home, runtimeId, planId);
  const parent = await directory(home, runtimeId, false); if (!parent) return null;
  let handle;
  try { handle = await fs.open(path.join(parent, planId + ".bak"), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
  catch (error) { if (absent(error)) return null; throw errors.invalid("配置备份必须是普通文件，不能是链接"); }
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1) throw errors.invalid("配置备份必须是只有一个链接的普通文件");
    let parsed: unknown;
    try { parsed = JSON.parse(await handle.readFile("utf8")); } catch { throw errors.invalid("配置备份不是现行密封引用，请先在维护窗口处理原文备份"); }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw errors.invalid("配置备份的引用无效");
    const item = parsed as Record<string, unknown>;
    if (Object.keys(item).sort().join(",") !== "auth_ref,mode,owner,plan_id,runtime_id,schema_version" || item.schema_version !== 1
      || item.owner !== RUNTIME_CONFIG_BACKUP_OWNER || item.runtime_id !== runtimeId || item.plan_id !== planId || typeof item.mode !== "number"
      || !Number.isInteger(item.mode) || item.mode < 0 || item.mode > 0o777 || item.auth_ref !== reference(runtimeId, planId, item.mode).auth_ref) {
      throw errors.invalid("配置备份的引用或归属不匹配");
    }
    return parsed as RuntimeConfigBackupReference;
  } finally { await handle.close(); }
}

async function original(home: string, authRef: string): Promise<string | null> {
  try { return readExistingSecret(home, authRef); }
  catch { throw errors.key_unavailable("原配置的密文或原主密钥不可用，不会创建替代密钥"); }
}

/** The owner seals the current backup descriptor; no master material is returned. */
export async function sealRuntimeConfigBackup(home: string, runtimeId: SupportedRuntimeId, planId: string, contents: string, mode: number): Promise<RuntimeConfigBackupReference> {
  runtimeConfigBackupPath(home, runtimeId, planId);
  if (typeof contents !== "string") throw errors.invalid("原配置正文必须是文字");
  const item = reference(runtimeId, planId, mode), before = await original(home, item.auth_ref);
  if (before !== null && before !== contents) throw errors.conflict("这份配置备份已绑定另一份原文");
  if (before === null) {
    const store = createLazyFileSecretStore(home);
    if (!store.createIfAbsent(item.auth_ref, contents) && await original(home, item.auth_ref) !== contents) throw errors.conflict("配置备份在保存期间发生冲突");
  }
  return item;
}

export async function captureRuntimeConfigBackup(home: string, runtimeId: SupportedRuntimeId, planId: string, contents: string, mode = 0o600): Promise<void> {
  runtimeConfigBackupPath(home, runtimeId, planId);
  const prior = await readReference(home, runtimeId, planId);
  if (prior) {
    if (prior.mode !== mode || await original(home, prior.auth_ref) !== contents) throw errors.conflict("这份配置备份已存在，内容或权限不一致");
    return;
  }
  const item = await sealRuntimeConfigBackup(home, runtimeId, planId, contents, mode);
  const parent = await directory(home, runtimeId, true);
  await writeAtomic(path.join(parent!, planId + ".bak"), JSON.stringify(item) + "\n", 0o600);
}

/** Explicit recovery through the owner; listing/detection and ordinary integration results contain no original text. */
export async function readRuntimeConfigBackup(home: string, runtimeId: SupportedRuntimeId, planId: string): Promise<{ contents: string; mode: number }> {
  runtimeConfigBackupPath(home, runtimeId, planId);
  const item = await readReference(home, runtimeId, planId);
  if (!item) throw errors.missing("找不到这份配置备份");
  const contents = await original(home, item.auth_ref);
  if (contents === null) throw errors.key_unavailable("找不到这份原配置的密封正文，请恢复同 Home 的原存储与原密钥");
  return { contents, mode: item.mode };
}
