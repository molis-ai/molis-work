import { PLUGIN_LOCALE_LIMITS, type PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { LOCALE_TAG } from "@molis-ai/molis-work-contracts/platform/ui";
import { keyOwnerProblem } from "./ui/text-keys.js";

// Checks of `ui.locales` (specs/font-and-skin-system/a-section-contract.md §6.1). A tag is also a file name, `locales/<tag>.json`,
// so the shape check is what keeps a declared language inside the package. The files themselves are read by the platform, not here.

const TAG_PROBLEM = "不是语言标记（如 zh、en、zh-Hant、pt-BR，大小写和连字符照这样写）";

const isLocaleTag = (value: unknown): value is string => typeof value === "string" && LOCALE_TAG.test(value);

function availableProblems(available: readonly unknown[]): string[] {
  if (available.length > PLUGIN_LOCALE_LIMITS.available) return [`ui.locales.available 最多 ${PLUGIN_LOCALE_LIMITS.available} 种语言`];
  const tags = available.filter(isLocaleTag);
  const repeated = [...new Set(tags.filter((tag, index) => tags.indexOf(tag) !== index))];
  return [
    ...available.flatMap((tag, index) => isLocaleTag(tag) ? [] : [`ui.locales.available[${index}] ${TAG_PROBLEM}`]),
    ...(repeated.length > 0 ? [`ui.locales.available 里有重复的语言：${repeated.join("、")}`] : []),
  ];
}

function defaultProblems(defaultLocale: unknown, available: readonly unknown[]): string[] {
  if (defaultLocale === undefined) return ["缺少 ui.locales.default"];
  if (!isLocaleTag(defaultLocale)) return [`ui.locales.default ${TAG_PROBLEM}`];
  return available.includes(defaultLocale) ? [] : [`ui.locales.default ${defaultLocale} 必须列在 ui.locales.available 里`];
}

function localeListProblems(declared: unknown): string[] {
  if (declared === null || typeof declared !== "object" || Array.isArray(declared)) return ["ui.locales 必须为对象"];
  const { default: defaultLocale, available, ...rest } = declared as { default?: unknown; available?: unknown };
  const stray = Object.keys(rest)[0];
  return [
    ...(stray === undefined ? [] : [`ui.locales 只能写 default、available，不认识 ${stray.slice(0, 40)}`]),
    ...(Array.isArray(available) ? [...availableProblems(available), ...defaultProblems(defaultLocale, available)] : ["ui.locales.available 必须为数组"]),
  ];
}

export function localeDeclarationProblems(manifest: PluginManifest): string[] {
  const { locales } = manifest.ui;
  return locales === undefined ? [] : ownerLocaleProblems(manifest.plugin_id, locales);
}

function ownerLocaleProblems(owner: string, locales: unknown): string[] {
  const ownerProblem = keyOwnerProblem(owner);
  return [...(ownerProblem === null ? [] : [`ui.locales 写不了键：${ownerProblem}`]), ...localeListProblems(locales)];
}

/** An executable sandbox contract may only declare the same locale shape its Manifest carries. */
export function sandboxLocaleProblems(contract: { readonly pluginId: string; readonly ui?: unknown }): string[] {
  const ui = contract.ui;
  if (ui === undefined) return [];
  if (ui === null || typeof ui !== "object" || Array.isArray(ui) || Object.keys(ui).some(key => key !== "locales") || !("locales" in ui)) {
    return ["合同的 ui 只声明 locales"];
  }
  return ownerLocaleProblems(contract.pluginId, ui.locales);
}
