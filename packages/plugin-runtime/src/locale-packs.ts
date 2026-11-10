import { pluginErrors } from "@molis-ai/molis-work-contracts/platform/plugin";
import { inspectPluginLocales, type LocaleSetProblem, type PluginLocaleManifest, type PluginLocaleRead } from "@molis-ai/molis-work-plugin-sdk/ui";

export { inspectPluginLocales, pluginLocaleFilePaths, pluginLocaleReader, type PluginLocaleManifest, type PluginLocaleRead, type PluginLocaleReader } from "@molis-ai/molis-work-plugin-sdk/ui";

/** `inspectPluginLocales` as a refusal: says every file and what to do. Answers what is left to tell, which does not stop anything. */
export function assertPluginLocales(manifest: PluginLocaleManifest, read: PluginLocaleRead): readonly LocaleSetProblem[] {
  const problems = inspectPluginLocales(manifest, read);
  refuseLocaleProblems(problems);
  return problems;
}

/** Refuses the package over the `blocking` problems, naming every file and what to do; the one wording of that refusal for `validate`, `pack` (through `assertPluginLocales`) and `dev`. */
export function refuseLocaleProblems(problems: readonly LocaleSetProblem[]): void {
  const blocking = problems.filter((problem) => problem.blocking);
  if (blocking.length > 0) throw pluginErrors.package_invalid(`语言文件有问题：${blocking.map(({ file, key, reason, fix }) => `${file}${key === null ? "" : ` ${key}`}：${reason}；${fix}`).join("。")}`);
}
