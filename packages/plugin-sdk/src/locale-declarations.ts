import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { LOCALE_TAG } from "@molis-ai/molis-work-contracts/platform/ui";

// Checks of `ui.locales` (specs/font-and-skin-system/a-section-contract.md §6.1). A tag is also a file name, `locales/<tag>.json`,
// so the shape check is what keeps a declared language inside the package. The files themselves are read by the platform, not here.

const TAG_PROBLEM = "不是语言标记（如 zh、en、zh-Hant、pt-BR）";

const isLocaleTag = (value: unknown): value is string => typeof value === "string" && LOCALE_TAG.test(value);

function localeListProblems(declared: unknown): string[] {
  if (declared === null || typeof declared !== "object" || Array.isArray(declared)) return ["ui.locales 必须为对象"];
  const { default: defaultLocale, available } = declared as { default?: unknown; available?: unknown };
  if (!Array.isArray(available)) return ["ui.locales.available 必须为数组"];
  const problems = available.flatMap((tag, index) => isLocaleTag(tag) ? [] : [`ui.locales.available[${index}] ${TAG_PROBLEM}`]);
  if (new Set(available).size !== available.length) problems.push("ui.locales.available 不能有重复的语言");
  if (!isLocaleTag(defaultLocale)) problems.push(`ui.locales.default ${TAG_PROBLEM}`);
  else if (!available.includes(defaultLocale)) problems.push(`ui.locales.default ${defaultLocale} 必须列在 ui.locales.available 里`);
  return problems;
}

/** One Plugin brings its words one way: a Manifest with `ui.locales` that also writes the older fields would need a translator reading both. */
export function localeDeclarationProblems(manifest: PluginManifest): string[] {
  const { locales, messages, translations } = manifest.ui;
  if (locales === undefined) return [];
  const bothRoads = messages !== undefined || translations !== undefined;
  return [...(bothRoads ? ["ui.locales 不能和 ui.messages、ui.translations 写在同一个 Manifest 里"] : []), ...localeListProblems(locales)];
}
