import { readFileSync, realpathSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { BASELINE_REGISTRY } from "@molis-ai/molis-work-design-system";
import { inspectLocaleSet, parseLocalePack, parseUiLanguageCatalog } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { UiFileResult } from "@molis-ai/molis-work-contracts/platform/ui";
import type { PluginTextReader } from "@molis-ai/molis-work-ui-host";

const root = realpathSync(fileURLToPath(new URL("../", import.meta.url)));
const row = BASELINE_REGISTRY.resources.find(row => row.kind === "locale" && row.owner === "workbench");
if (row?.package !== "@molis-ai/molis-work-app-workbench") throw new Error("Workbench locale resource registration is missing");

function registeredPath(root: string, ...parts: string[]): string {
  const path = realpathSync(join(root, ...parts)), inside = relative(root, path);
  if (inside === ".." || inside.startsWith("../")) throw new Error("Language resource is outside its registered package");
  return path;
}

function mustRead<T>(result: UiFileResult<T>): T {
  if (result.ok) return result.value;
  const issue = result.problems[0];
  throw new Error(issue ? `${issue.file}: ${issue.path}: ${issue.reason}` : "Language resource is invalid");
}

const directory = registeredPath(root, row.path);
const descriptor = registeredPath(root, dirname(row.path), "languages.json");
export const WORKBENCH_LANGUAGES = mustRead(parseUiLanguageCatalog(readFileSync(descriptor, "utf8"), descriptor));
const packs = WORKBENCH_LANGUAGES.languages.map(({ tag }) => {
  const file = registeredPath(directory, tag + ".json");
  const pack = mustRead(parseLocalePack(readFileSync(file, "utf8"), { file }));
  if (pack.locale !== tag || pack.owner !== row.owner) throw new Error(file + ": wrong language or owner");
  return pack;
});
const problem = inspectLocaleSet(packs, { default: WORKBENCH_LANGUAGES.default, directory })
  .find(issue => issue.blocking || issue.code === "ui.locale_missing_key");
if (problem) throw new Error(`${problem.file}: ${problem.key ?? problem.code}: ${problem.reason}`);

export const workbenchPlatformText: PluginTextReader = {
  owner: row.owner, default: WORKBENCH_LANGUAGES.default,
  pack: tag => packs.find(pack => pack.locale === tag) ?? null,
};
