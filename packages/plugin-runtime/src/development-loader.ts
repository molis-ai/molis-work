import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { parsePluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { assertPluginPackagePath, PluginPackageError } from "./package-verification.js";

/** Caller must have explicit authority to execute local source; this is not signed-package installation. */
export async function loadDevelopmentPlugin(directory: string): Promise<PluginDefinition> {
  const root = await realpath(directory);
  const manifest = parsePluginManifest(JSON.parse(await readFile(join(root, "manifest.json"), "utf8")) as unknown);
  const entry = manifest.entrypoints.find(value => value.deployment === "local");
  if (!entry) throw new PluginPackageError("plugin_package_invalid", "开发包没有 local entrypoint");
  const file = entry.entrypoint.replace(/^\.\//u, "");
  assertPluginPackagePath(file);
  const entryPath = await realpath(join(root, file));
  const relativePath = relative(root, entryPath);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) throw new PluginPackageError("plugin_package_invalid", "开发入口不能逃逸项目目录");
  const imported = await import(pathToFileURL(entryPath).href) as { default?: PluginDefinition };
  const definition = imported.default;
  if (!definition || typeof definition.start !== "function" || !isDeepStrictEqual(definition.manifest, manifest)) {
    throw new PluginPackageError("plugin_package_invalid", "开发入口必须 default export 与 manifest.json 一致的 PluginDefinition");
  }
  return definition;
}
