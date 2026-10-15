import { randomUUID } from "node:crypto";
import { promises as fs, constants as fsConstants, type Stats } from "node:fs";
import path from "node:path";
import type { SkillSnapshot } from "./runtime-integration-contract.js";

export async function inspectSkillLink(targetPath: string, desiredTarget: string | null, molisWorkHome: string): Promise<SkillSnapshot> {
  let state: Awaited<ReturnType<typeof fs.lstat>> | null;
  try {
    state = await fs.lstat(targetPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { state: "absent", signature: "absent", rawLinkTarget: null, resolvedLinkTarget: null };
    }
    throw error;
  }
  if (!state.isSymbolicLink()) {
    return { state: "conflict", signature: `conflict:${state.mode}:${state.size}`, rawLinkTarget: null, resolvedLinkTarget: null };
  }
  const rawLinkTarget = await fs.readlink(targetPath);
  const resolvedLinkTarget = path.resolve(path.dirname(targetPath), rawLinkTarget);
  const current = desiredTarget != null && resolvedLinkTarget === path.resolve(desiredTarget);
  const managed = isInside(molisWorkHome, resolvedLinkTarget)
    && path.basename(resolvedLinkTarget) === "goal-advance"
    && path.basename(path.dirname(resolvedLinkTarget)) === "skills";
  return {
    state: current ? "current" : managed ? "managed" : "conflict",
    signature: `symlink:${rawLinkTarget}`,
    rawLinkTarget,
    resolvedLinkTarget,
  };
}

export async function replaceSkillLink(targetPath: string, sourcePath: string, molisWorkHome: string): Promise<Stats> {
  const current = await inspectSkillLink(targetPath, sourcePath, molisWorkHome);
  if (current.state === "current") return fs.lstat(targetPath);
  if (current.state === "conflict") throw new Error(`不会覆盖未知 Skill: ${targetPath}`);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const temporaryPath = `${targetPath}.tmp-${randomUUID()}`;
  await fs.symlink(sourcePath, temporaryPath, "dir");
  try {
    const identity = await fs.lstat(temporaryPath);
    if ((await inspectSkillLink(targetPath, sourcePath, molisWorkHome)).signature !== current.signature) {
      throw new Error(`Skill 已被用户修改，不会覆盖: ${targetPath}`);
    }
    await fs.rename(temporaryPath, targetPath);
    return identity;
  } finally {
    await fs.rm(temporaryPath, { force: true });
  }
}

export async function removeExpectedSkillLink(targetPath: string, expectedTarget: string): Promise<void> {
  const snapshot = await inspectSkillLink(targetPath, expectedTarget, path.dirname(path.dirname(expectedTarget)));
  if (snapshot.state === "absent") return;
  if (snapshot.state !== "current") throw new Error(`Skill 已被用户修改，不会删除: ${targetPath}`);
  await fs.unlink(targetPath);
}

export async function restoreSkillSnapshot(targetPath: string, snapshot: SkillSnapshot, expectedTarget: string | null, identity: Stats | null): Promise<boolean> {
  if (!await skillWriteMatches(targetPath, expectedTarget, identity)) return false;
  if (identity) await fs.unlink(targetPath);
  if (snapshot.rawLinkTarget != null) {
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    try { await fs.symlink(snapshot.rawLinkTarget, targetPath, "dir"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") return false; throw error; }
  }
  return true;
}

export async function replaceTextFile(filePath: string, contents: string | null, mode?: number): Promise<Stats | null> {
  if (contents == null) {
    await fs.rm(filePath, { force: true });
    return null;
  }
  return writeAtomic(filePath, contents, mode);
}

export async function writeAtomic(filePath: string, contents: string, mode?: number): Promise<Stats> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${randomUUID()}`;
  await fs.writeFile(temporaryPath, contents, mode == null ? undefined : { mode });
  try {
    const identity = await fs.lstat(temporaryPath);
    await fs.rename(temporaryPath, filePath);
    return identity;
  } catch (error) {
    await fs.rm(temporaryPath, { force: true });
    throw error;
  }
}

function sameFile(left: Stats, right: Stats): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.mode === right.mode
    && left.size === right.size && left.mtimeMs === right.mtimeMs;
}

async function entryState(filePath: string): Promise<Stats | null> {
  try { return await fs.lstat(filePath); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}

export async function skillWriteMatches(filePath: string, expectedTarget: string | null, identity: Stats | null): Promise<boolean> {
  const state = await entryState(filePath);
  if (!identity) return !state;
  return Boolean(state?.isSymbolicLink() && sameFile(state, identity) && await fs.readlink(filePath) === expectedTarget);
}

export async function textWriteMatches(filePath: string, contents: string | null, identity: Stats | null): Promise<boolean> {
  const state = await entryState(filePath);
  if (contents === null) return !state;
  if (!state?.isFile() || !identity || !sameFile(state, identity)) return false;
  let file;
  try { file = await fs.open(filePath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW); }
  catch (error) { if (["ENOENT", "ELOOP"].includes((error as NodeJS.ErrnoException).code ?? "")) return false; throw error; }
  try {
    if (!sameFile(await file.stat(), identity) || await file.readFile("utf8") !== contents) return false;
    const named = await entryState(filePath);
    return Boolean(named && sameFile(named, identity));
  } finally { await file.close(); }
}

export async function restoreTextSnapshot(filePath: string, before: string | null, after: string | null, identity: Stats | null): Promise<boolean> {
  if (!await textWriteMatches(filePath, after, identity)) return false;
  await replaceTextFile(filePath, before, identity?.mode);
  return true;
}

export async function readTextOrNull(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function fileModeOrUndefined(filePath: string): Promise<number | undefined> {
  try {
    return (await fs.stat(filePath)).mode;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export async function pathState(filePath: string): Promise<Awaited<ReturnType<typeof fs.stat>> | null> {
  try {
    return await fs.stat(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function anyPathExists(paths: readonly string[]): Promise<boolean> {
  const states = await Promise.all(paths.map((filePath) => pathState(filePath)));
  return states.some((state) => state != null);
}

export async function canExecute(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

