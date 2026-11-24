import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { assertPluginLocales, pluginLocaleFilePaths } from "@molis-ai/molis-work-plugin-runtime";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import type { LocaleSetProblem } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { packageFileReader, readLocaleFileOrNull } from "./package-files.js";

/** Read data only. Validation must never import or execute a Plugin entrypoint. */
export async function validatePluginManifestFile(filePath: string): Promise<PluginManifest> {
  return parsePluginManifest(JSON.parse(await readFile(filePath, "utf8")) as unknown);
}

/** Validates every language file declared in `ui.locales.available` (e.g. en/zh/ja) beside a Manifest under packaging rules. Refuses blocking issues and returns non-blocking notes. */
export async function validatePluginLocaleFiles(filePath: string, manifest: PluginManifest): Promise<readonly LocaleSetProblem[]> {
  const paths = pluginLocaleFilePaths(manifest);
  if (paths.length === 0) return [];
  const read = await packageFileReader(dirname(filePath));
  const texts = new Map(await Promise.all(paths.map(async (path) => [path, (await readLocaleFileOrNull(read, path))?.toString("utf8") ?? null] as const)));
  return assertPluginLocales(manifest, (path) => texts.get(path) ?? null);
}
