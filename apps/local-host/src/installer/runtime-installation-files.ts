import { randomUUID } from "node:crypto";
import { promises as fs, constants as fsConstants, type Stats } from "node:fs";
import path from "node:path";

export async function replaceTextFile(filePath: string, contents: string | null, mode?: number, assertCurrent: () => void = () => {}): Promise<Stats | null> {
  assertCurrent();
  if (contents == null) {
    await fs.rm(filePath, { force: true });
    return null;
  }
  return writeAtomic(filePath, contents, mode, assertCurrent);
}

export async function writeAtomic(filePath: string, contents: string, mode?: number, assertCurrent: () => void = () => {}): Promise<Stats> {
  assertCurrent();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  assertCurrent();
  const temporaryPath = `${filePath}.tmp-${randomUUID()}`;
  await fs.writeFile(temporaryPath, contents, mode == null ? undefined : { mode });
  try {
    // The creation mode passes through the process umask; a retained original permission is set exactly (BL-tests-umask).
    if (mode != null) await fs.chmod(temporaryPath, mode & 0o777);
    assertCurrent();
    const identity = await fs.lstat(temporaryPath); assertCurrent();
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

