import { randomUUID } from "node:crypto";
import { promises as fs, constants as fsConstants } from "node:fs";
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

export async function replaceSkillLink(targetPath: string, sourcePath: string, molisWorkHome: string): Promise<void> {
  const current = await inspectSkillLink(targetPath, sourcePath, molisWorkHome);
  if (current.state === "current") return;
  if (current.state === "conflict") throw new Error(`不会覆盖未知 Skill: ${targetPath}`);
  if (current.state === "managed") await fs.unlink(targetPath);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.symlink(sourcePath, targetPath, "dir");
}

export async function removeExpectedSkillLink(targetPath: string, expectedTarget: string): Promise<void> {
  const snapshot = await inspectSkillLink(targetPath, expectedTarget, path.dirname(path.dirname(expectedTarget)));
  if (snapshot.state === "absent") return;
  if (snapshot.state !== "current") throw new Error(`Skill 已被用户修改，不会删除: ${targetPath}`);
  await fs.unlink(targetPath);
}

export async function restoreSkillSnapshot(targetPath: string, snapshot: SkillSnapshot): Promise<void> {
  try {
    const state = await fs.lstat(targetPath);
    if (state.isSymbolicLink()) await fs.unlink(targetPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (snapshot.rawLinkTarget != null) {
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.symlink(snapshot.rawLinkTarget, targetPath, "dir");
  }
}

export async function replaceTextFile(filePath: string, contents: string | null, mode?: number): Promise<void> {
  if (contents == null) {
    await fs.rm(filePath, { force: true });
    return;
  }
  await writeAtomic(filePath, contents, mode);
}

export async function writeAtomic(filePath: string, contents: string, mode?: number): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${randomUUID()}`;
  await fs.writeFile(temporaryPath, contents, mode == null ? undefined : { mode });
  try {
    await fs.rename(temporaryPath, filePath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true });
    throw error;
  }
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

