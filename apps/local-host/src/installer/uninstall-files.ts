import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { WEB_CONTROL_TOKEN_RELATIVE_PATH } from "../web-control-token.js";
import { CURRENT_LAUNCHER_NAMES, isOwnedInstaller, isOwnedLauncherText } from "./home-contract.js";
import type { MolisWorkUninstallChange } from "./uninstall-contract.js";
export async function inspectOwnedHomeAssets(homeDirectory: string): Promise<{
  ownedPaths: string[];
  snapshotPaths: string[];
  conflicts: string[];
}> {
  const ownedPaths: string[] = [];
  const snapshotPaths: string[] = [];
  const conflicts: string[] = [];
  const manifestPath = path.join(homeDirectory, "config", "installation.json");
  const controlTokenPath = path.join(homeDirectory, WEB_CONTROL_TOKEN_RELATIVE_PATH);
  const manifestText = await readText(manifestPath);
  snapshotPaths.push(manifestPath);
  snapshotPaths.push(controlTokenPath);
  if (manifestText != null) {
    const manifest = parseOwnedJson(manifestText);
    if (isOwnedInstaller(manifest?.installer)) ownedPaths.push(manifestPath);
    else conflicts.push(`安装清单不属于 Molis Work：${manifestPath}`);
  }
  const controlToken = await readText(controlTokenPath);
  if (controlToken != null) {
    const token = controlToken.trim();
    if (token.length >= 32 && token.length <= 512 && !/[\r\n]/.test(token)) ownedPaths.push(controlTokenPath);
    else conflicts.push(`Web 控制令牌文件已被修改，不会删除：${controlTokenPath}`);
  }
  for (const launcher of CURRENT_LAUNCHER_NAMES.map((name) => path.join(homeDirectory, "bin", name))) {
    const text = await readText(launcher);
    snapshotPaths.push(launcher);
    if (text == null) continue;
    if (isOwnedLauncherText(text)) ownedPaths.push(launcher);
    else conflicts.push(`启动器已被修改，不会删除：${launcher}`);
  }
  const releasesDirectory = path.join(homeDirectory, "releases");
  const entries = await fs.readdir(releasesDirectory, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const releasePath = path.join(releasesDirectory, entry.name);
    const releaseManifestPath = path.join(releasePath, "release.json");
    const releaseManifestText = entry.isDirectory() ? await readText(releaseManifestPath) : null;
    snapshotPaths.push(releaseManifestPath);
    const manifest = releaseManifestText == null ? null : parseOwnedJson(releaseManifestText);
    if (entry.isDirectory() && isOwnedInstaller(manifest?.installer)) ownedPaths.push(releasePath);
    else conflicts.push(`release 不属于 Molis Work 或已损坏，不会删除：${releasePath}`);
  }
  return { ownedPaths, snapshotPaths, conflicts };
}

export function assetKind(target: string): MolisWorkUninstallChange["kind"] {
  if (target.endsWith("installation.json")) return "install_manifest";
  if (target.includes(`${path.sep}releases${path.sep}`)) return "release";
  return "launcher";
}

export function assetKindLabel(kind: MolisWorkUninstallChange["kind"]): string {
  if (kind === "install_manifest") return "安装清单";
  if (kind === "release") return "程序 release";
  return "启动器";
}

export async function pathFingerprint(target: string): Promise<string | null> {
  try {
    const state = await fs.stat(target);
    if (state.isDirectory()) {
      const entries = await fs.readdir(target);
      return `directory:${state.mtimeMs}:${entries.sort().join("\0")}`;
    }
    return `file:${digest(await fs.readFile(target))}`;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function readText(target: string): Promise<string | null> {
  try { return await fs.readFile(target, "utf8"); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function pathExists(target: string): Promise<boolean> {
  try { await fs.stat(target); return true; } catch { return false; }
}

export async function existingPaths(paths: string[]): Promise<string[]> {
  const checks = await Promise.all(paths.map(async (target) => ({ target, exists: await pathExists(target) })));
  return checks.filter((item) => item.exists).map((item) => item.target);
}

export async function removeEmptyDirectory(target: string): Promise<boolean> {
  try {
    await fs.rmdir(target);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTEMPTY" || code === "EEXIST") return false;
    throw error;
  }
}

export function parseOwnedJson(text: string): { installer?: unknown } | null {
  try { return JSON.parse(text) as { installer?: unknown }; } catch { return null; }
}

export function digest(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
