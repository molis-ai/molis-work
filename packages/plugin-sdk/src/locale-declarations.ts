import { PLUGIN_LOCALE_LIMITS, type PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { LOCALE_TAG } from "@molis-ai/molis-work-contracts/platform/ui";
import { isRecord } from "./json-value.js";
import { DIRECTORY_WORD_LIMITS, staticDirectoryTextRefProblem } from "./ui/directory-words.js";
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

const SANDBOX_READ_GROUP_FIELDS = new Set(["group_id", "title", "title_text", "description", "description_text", "operations"]);

function sandboxLocalizedTextProblems(contract: {
  readonly pluginId: string;
  readonly operations?: readonly unknown[];
  readonly permission_reasons?: unknown;
  readonly read_groups?: unknown;
}, hasLocales: boolean): string[] {
  const problems: string[] = [];
  const check = (field: string, value: unknown, limit: number) => {
    const problem = staticDirectoryTextRefProblem(field, value, contract.pluginId, limit, hasLocales);
    if (problem !== null) problems.push(problem);
  };
  if (contract.permission_reasons !== undefined) {
    if (!isRecord(contract.permission_reasons)) problems.push("permission_reasons 必须为对象");
    else for (const [permission, ref] of Object.entries(contract.permission_reasons)) {
      if (permission.trim() === "") problems.push("permission_reasons 的权限名不能为空");
      else check(`权限 ${permission} 的 reason_text`, ref, DIRECTORY_WORD_LIMITS.permissionReason);
    }
  }
  const operationIds = new Set<string>();
  if (Array.isArray(contract.operations)) {
    for (const operation of contract.operations) {
      if (!isRecord(operation)) continue;
      const id = typeof operation.id === "string" ? operation.id : "?";
      if (typeof operation.id === "string") operationIds.add(operation.id);
      if (operation.title_text !== undefined) check(`操作 ${id} 的 title_text`, operation.title_text, DIRECTORY_WORD_LIMITS.actionTitle);
      if (operation.description_text !== undefined) check(`操作 ${id} 的 description_text`, operation.description_text, DIRECTORY_WORD_LIMITS.actionDescription);
    }
  }
  if (contract.read_groups !== undefined) {
    if (!Array.isArray(contract.read_groups) || contract.read_groups.length === 0) {
      problems.push("read_groups 至少要声明一组，不分组就不要写这一项");
    } else {
      for (const [index, group] of contract.read_groups.entries()) {
        if (!isRecord(group)) {
          problems.push("read_groups 的每一项都必须是对象");
          continue;
        }
        const extra = Object.keys(group).filter(field => !SANDBOX_READ_GROUP_FIELDS.has(field));
        if (extra.length > 0) problems.push(`read_groups 不认这些字段：${extra.join("、")}`);
        const name = typeof group.group_id === "string" && group.group_id.trim() ? group.group_id : `第 ${index + 1} 组`;
        if (group.title_text !== undefined) check(`读取分组 ${name} 的 title_text`, group.title_text, DIRECTORY_WORD_LIMITS.readGroupTitle);
        if (group.description_text !== undefined) check(`读取分组 ${name} 的 description_text`, group.description_text, DIRECTORY_WORD_LIMITS.readGroupDescription);
        if (!Array.isArray(group.operations) || group.operations.length === 0 || group.operations.some(op => typeof op !== "string" || !operationIds.has(op))) {
          problems.push(`读取分组 ${name} 的 operations 必须列本合同声明的操作`);
        }
      }
    }
  }
  return problems;
}

/** An executable sandbox contract may only declare the same locale and localized-text shape its Manifest carries. */
export function sandboxLocaleProblems(contract: {
  readonly pluginId: string;
  readonly ui?: unknown;
  readonly operations?: readonly unknown[];
  readonly permission_reasons?: unknown;
  readonly read_groups?: unknown;
}): string[] {
  const ui = contract.ui;
  const uiProblems: string[] = [];
  let hasLocales = false;
  if (ui !== undefined) {
    if (ui === null || typeof ui !== "object" || Array.isArray(ui) || Object.keys(ui).some(key => key !== "locales") || !("locales" in ui)) {
      uiProblems.push("合同的 ui 只声明 locales");
    } else {
      uiProblems.push(...ownerLocaleProblems(contract.pluginId, ui.locales));
      hasLocales = uiProblems.length === 0;
    }
  }
  return [...uiProblems, ...sandboxLocalizedTextProblems(contract, hasLocales)];
}
