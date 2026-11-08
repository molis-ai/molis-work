import { pluginErrors } from "@molis-ai/molis-work-contracts/platform/plugin";
import { readFileSync } from "node:fs";
import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { pluginLocaleFilePaths, pluginLocaleReader, type PluginLocaleManifest, type PluginLocaleReader } from "./locale-packs.js";
import { assertPluginPackagePath } from "./package-verification.js";

function assertInsideProject(root: string, file: string, what: string): void {
  const relativePath = relative(root, file);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) throw pluginErrors.package_invalid(`${what}不能逃逸项目目录`);
}

/** Caller must have explicit authority to execute local source; this is not signed-package installation. */
export async function loadDevelopmentPlugin(directory: string): Promise<PluginDefinition> {
  const root = await realpath(directory);
  const manifest = parsePluginManifest(JSON.parse(await readFile(join(root, "manifest.json"), "utf8")) as unknown);
  const entry = manifest.entrypoints.find(value => value.deployment === "local");
  if (!entry) throw pluginErrors.package_invalid("开发包没有 local entrypoint");
  const file = entry.entrypoint.replace(/^\.\//u, "");
  assertPluginPackagePath(file);
  const entryPath = await realpath(join(root, file));
  assertInsideProject(root, entryPath, "开发入口");
  const imported = await import(pathToFileURL(entryPath).href) as { default?: PluginDefinition };
  const definition = imported.default;
  if (!definition || typeof definition.start !== "function" || !isDeepStrictEqual(definition.manifest, manifest)) {
    throw pluginErrors.package_invalid("开发入口必须 default export 与 manifest.json 一致的 PluginDefinition");
  }
  return definition;
}

/**
 * The languages of a local project, from its directory. Where each file really is gets settled here, so a file that is missing or a link that leaves the project stops
 * the run when it starts, rather than when a word first asks for it. The contents are still read the first time a language is used, and a language not used is not read.
 */
export async function loadDevelopmentLocalePacks(directory: string, manifest: PluginLocaleManifest): Promise<PluginLocaleReader | null> {
  const root = await realpath(directory);
  const located = new Map<string, string>();
  for (const path of pluginLocaleFilePaths(manifest)) {
    assertPluginPackagePath(path);
    const file = await realpath(join(root, path)).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") throw pluginErrors.package_invalid(`开发包缺少 Manifest 声明的语言文件 ${path}`);
      throw error;
    });
    assertInsideProject(root, file, `语言文件 ${path} `);
    located.set(path, file);
  }
  return pluginLocaleReader(manifest, (path) => {
    const file = located.get(path);
    return file === undefined ? null : readFileSync(file, "utf8");
  });
}
