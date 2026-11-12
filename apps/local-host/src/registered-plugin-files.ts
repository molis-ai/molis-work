import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { pluginLocaleFilePaths, type PluginLocaleRead } from "@molis-ai/molis-work-plugin-runtime";

/** A name from the Host's build registry, not the plugin's Manifest or a browser request. */
export function registeredPackageDirectory(name: string): string {
  let directory = dirname(fileURLToPath(import.meta.resolve(name)));
  for (;;) {
    const file = join(directory, "package.json");
    if (existsSync(file) && (JSON.parse(readFileSync(file, "utf8")) as { name?: unknown }).name === name) return directory;
    const parent = dirname(directory);
    if (parent === directory) throw new Error(`找不到 ${name} 的包目录`);
    directory = parent;
  }
}

export function registeredPluginLocaleFiles(packageName: string, manifest: PluginManifest): PluginLocaleRead {
  const allowed = new Set(pluginLocaleFilePaths(manifest)), sources = new Map<string, string | null>();
  let directory: string | undefined;
  return path => {
    if (!allowed.has(path)) return null;
    if (sources.has(path)) return sources.get(path)!;
    const file = join(directory ??= registeredPackageDirectory(packageName), path);
    const source = existsSync(file) ? readFileSync(file, "utf8") : null;
    sources.set(path, source);
    return source;
  };
}
