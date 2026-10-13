import { createHash } from "node:crypto";
import { constants, promises as fs, type Stats } from "node:fs";
import path from "node:path";
import { parseFilePath } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { runWorkspaceGit } from "./workspace-git.js";

export const CONFLICT_FILE_LIMIT = 1024 * 1024;
type FileHandle = Awaited<ReturnType<typeof fs.open>>;
export interface ConflictSnapshot { name: string; absolute: string; text: string; bytes: Buffer; identity: Stats; fingerprint: string }
const identity = (state: Stats) => [state.dev, state.ino, state.mode, state.size, state.mtimeMs, state.ctimeMs];
const same = (left: Stats, right: Stats) => identity(left).every((value, index) => value === identity(right)[index]);

async function assertPath(root: string, name: string): Promise<string> {
  if (await fs.realpath(root) !== root) throw new Error("工作区目录已变化，请重新关联");
  const segments = parseFilePath(name.split("/"));
  let target = root;
  for (const [index, segment] of segments.entries()) {
    target = path.join(target, segment);
    const state = await fs.lstat(target);
    if (state.isSymbolicLink() || index < segments.length - 1 && !state.isDirectory()) throw new Error("冲突路径包含链接或非目录，原操作未执行");
  }
  if (await fs.realpath(target) !== target) throw new Error("冲突路径已变化，原操作未执行");
  return target;
}

async function readHeld(root: string, name: string, file: FileHandle): Promise<ConflictSnapshot> {
  const absolute = await assertPath(root, name), before = await file.stat();
  if (!before.isFile()) throw new Error("冲突的不是普通文件，请在终端处理");
  if (before.size > CONFLICT_FILE_LIMIT) throw new Error("文件太大，请在编辑器里解决冲突");
  const bytes = Buffer.alloc(before.size + 1);
  let used = 0;
  while (used < bytes.length) { const read = await file.read(bytes, used, bytes.length - used, used); if (!read.bytesRead) break; used += read.bytesRead; }
  const after = await file.stat(), named = await fs.lstat(await assertPath(root, name));
  if (!same(before, after) || !same(after, named) || used !== before.size) throw new Error("冲突文件在读取时变化了，请刷新");
  const body = bytes.subarray(0, used);
  if (body.includes(0)) throw new Error("二进制冲突请在编辑器里处理");
  const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(body);
  const fingerprint = createHash("sha256").update(JSON.stringify([name, identity(after)])).update(body).digest("hex");
  return { name, absolute, text, bytes: body, identity: after, fingerprint };
}

export async function readConflictSnapshot(root: string, name: string): Promise<ConflictSnapshot> {
  const absolute = await assertPath(root, name);
  const file = await fs.open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try { return await readHeld(root, name, file); }
  finally { await file.close(); }
}

/** Unreadable conflicts still appear in the summary, so abandoning a merge remains available. They cannot be resolved here. */
export async function conflictFingerprint(root: string, name: string): Promise<string> {
  try { return (await readConflictSnapshot(root, name)).fingerprint; }
  catch (error) { return `unreadable:${name}:${error instanceof Error ? error.message : String(error)}`; }
}

async function indexBytes(indexPath: string): Promise<Buffer> {
  const file = await fs.open(indexPath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try { if (!(await file.stat()).isFile()) throw new Error("暂存区不是普通文件，不能更新"); return await file.readFile(); }
  finally { await file.close(); }
}

async function writeHeld(file: FileHandle, contents: Buffer): Promise<void> {
  let written = 0;
  while (written < contents.length) {
    const result = await file.write(contents, written, contents.length - written, written);
    if (!result.bytesWritten) throw new Error("冲突正文未完整写入，请核对");
    written += result.bytesWritten;
  }
  await file.truncate(contents.length); await file.sync();
}

/** Freeze the resolved bytes in a temporary index and publish under Git's own lock, never `git add` a later path. */
export async function resolveConflict(root: string, reviewed: ConflictSnapshot, content: string, check: () => Promise<void>): Promise<void> {
  await check();
  const file = await fs.open(await assertPath(root, reviewed.name), constants.O_RDWR | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  let written = false;
  try {
    if ((await readHeld(root, reviewed.name, file)).fingerprint !== reviewed.fingerprint) throw new Error("冲突正文或文件身份在审查期间变化了，原操作未执行");
    const indexPath = path.resolve(root, (await runWorkspaceGit(root, ["rev-parse", "--git-path", "index"])).toString().trimEnd());
    const original = await indexBytes(indexPath), lockPath = indexPath + ".lock";
    let lock: FileHandle;
    try { lock = await fs.open(lockPath, "wx", 0o600); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("Git 暂存区正被其他操作使用，原操作未执行"); throw error; }
    const lockIdentity = await lock.stat();
    let temp: string | undefined, published = false;
    try {
      await check();
      if (!(await indexBytes(indexPath)).equals(original)) throw new Error("暂存区在审查期间变化了，原操作未执行");
      temp = await fs.mkdtemp(path.join(path.dirname(indexPath), "molis-resolve-"));
      const temporaryIndex = path.join(temp, "index");
      await fs.writeFile(temporaryIndex, original);
      const oid = (await runWorkspaceGit(root, ["hash-object", "-w", "--stdin"], undefined, { input: content })).toString().trim();
      const converted = (await runWorkspaceGit(root, ["hash-object", "--stdin", `--path=${reviewed.name}`], undefined, { input: content })).toString().trim();
      if (converted !== oid) throw new Error("Git 内容转换会改变审查正文，本次未写入；请在编辑器里处理");
      const mode = reviewed.identity.mode & 0o100 ? "100755" : "100644";
      await runWorkspaceGit(root, ["update-index", "-z", "--index-info"], undefined,
        { indexFile: temporaryIndex, input: `0 ${"0".repeat(oid.length)}\t${reviewed.name}\0${mode} ${oid}\t${reviewed.name}\0` });
      await check();
      if ((await readHeld(root, reviewed.name, file)).fingerprint !== reviewed.fingerprint) throw new Error("冲突正文或文件身份在审查期间变化了，原操作未执行");
      written = true;
      await writeHeld(file, Buffer.from(content));
      const after = await readHeld(root, reviewed.name, file);
      if (after.text !== content) throw new Error("写入后的冲突正文已变化，请核对");
      await lock.writeFile(await fs.readFile(temporaryIndex)); await lock.sync();
      if (!(await indexBytes(indexPath)).equals(original)) throw new Error("暂存区在写入期间变化了，请核对");
      if ((await readHeld(root, reviewed.name, file)).fingerprint !== after.fingerprint) throw new Error("冲突正文在写入期间又被修改，请核对");
      await lock.close(); await fs.rename(lockPath, indexPath); published = true;
    } finally {
      await lock.close().catch(() => undefined);
      if (!published) {
        const named = await fs.lstat(lockPath).catch(() => null);
        if (named?.dev === lockIdentity.dev && named.ino === lockIdentity.ino) await fs.rm(lockPath, { force: true });
      }
      if (temp) await fs.rm(temp, { recursive: true, force: true });
    }
  } catch (error) {
    if (written) throw Object.assign(new Error(`冲突正文已开始写入，但完成结果未确认；请核对文件与暂存区：${error instanceof Error ? error.message : String(error)}`), { code: "actions.outcome_unknown" });
    throw error;
  } finally { await file.close(); }
}
