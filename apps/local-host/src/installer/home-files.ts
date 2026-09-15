import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { MolisWorkHomeInstallError, isOwnedInstaller, isOwnedLauncherText } from "./home-contract.js";
import type { TextMutation, InstallManifest } from "./home-contract.js";

export async function ensureDirectory(directory: string): Promise<void> {
  const state = await pathState(directory);
  if (state?.isDirectory()) return;
  if (state) {
    throw new MolisWorkHomeInstallError("home.not_directory", `Molis Work 安装路径不是目录: ${directory}`);
  }
  await fs.mkdir(directory, { recursive: true });
}

export async function writeOwnedText(filePath: string, content: string, mutations: TextMutation[]): Promise<boolean> {
  const previous = await readTextIfPresent(filePath);
  if (previous === content) return false;
  if (
    previous != null
    && !isOwnedLauncherText(previous)
  ) {
    throw new MolisWorkHomeInstallError("home.unknown_file", `不会覆盖未知用户文件: ${filePath}`);
  }
  mutations.push({ filePath, previous });
  await writeAtomic(filePath, content, 0o755);
  return true;
}

export async function replaceOwnedJson(
  filePath: string,
  value: InstallManifest,
  mutations: TextMutation[],
): Promise<void> {
  const previous = await readTextIfPresent(filePath);
  if (previous != null) {
    const parsed = parseJson(previous, filePath);
    if (!isOwnedInstaller(parsed.installer)) {
      throw new MolisWorkHomeInstallError("home.unknown_file", `不会覆盖未知用户文件: ${filePath}`);
    }
  }
  mutations.push({ filePath, previous });
  await writeAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export async function readOwnedJson<T extends { installer: string }>(filePath: string): Promise<T | null> {
  const text = await readTextIfPresent(filePath);
  if (text == null) return null;
  const parsed = parseJson(text, filePath) as T;
  if (!isOwnedInstaller(parsed.installer)) {
    throw new MolisWorkHomeInstallError("home.unknown_file", `不会读取或覆盖未知用户文件: ${filePath}`);
  }
  return parsed;
}

export async function rollbackTextMutations(mutations: TextMutation[]): Promise<void> {
  for (const mutation of [...mutations].reverse()) {
    try {
      if (mutation.previous == null) await fs.rm(mutation.filePath, { force: true });
      else await writeAtomic(mutation.filePath, mutation.previous);
    } catch {
      // Preserve the original error. The next explicit install can repair owned files.
    }
  }
}

export async function pathState(filePath: string) {
  try {
    return await fs.lstat(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function readText(filePath: string, code: "source.asset_missing"): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    throw new MolisWorkHomeInstallError(code, `Molis Work 安装源缺少文件: ${filePath}`);
  }
}

export async function readTextIfPresent(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function readJsonIfPresent<T>(filePath: string): Promise<T | null> {
  const text = await readTextIfPresent(filePath);
  return text == null ? null : (parseJson(text, filePath) as T);
}

export function parseJson(text: string, filePath: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new MolisWorkHomeInstallError("release.conflict", `Molis Work 安装文件无法解析: ${filePath}`);
  }
}

export async function writeAtomic(filePath: string, content: string, mode?: number): Promise<void> {
  const temporaryPath = `${filePath}.tmp-${randomUUID()}`;
  await fs.writeFile(temporaryPath, content, mode == null ? undefined : { mode });
  try {
    await fs.rename(temporaryPath, filePath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true });
    throw error;
  }
}

