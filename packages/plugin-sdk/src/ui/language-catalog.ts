import { LOCALE_TAG, UI_FILE_LIMITS, UI_FORMAT_VERSIONS, type UiFileResult, type UiFrameLanguage, type UiLanguageCatalog, type UiLanguageDescriptor } from "@molis-ai/molis-work-contracts/platform/ui";
import { checkFormatVersion, childPath, finishFile, isObject, readObject, readStrictJson } from "./file-reader.js";

const safeLabel = (value: unknown): boolean => typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= 80 && !/[<>&"'\p{C}]/u.test(value);
const language = (value: unknown): value is string => typeof value === "string" && LOCALE_TAG.test(value);
const supportedIntl = (value: unknown): boolean => {
  if (!language(value)) return false;
  try { return Intl.DateTimeFormat.supportedLocalesOf([value]).length === 1; } catch { return false; }
};

/** A platform catalog of selectable languages. A plugin's own language files do not add platform languages. */
export function parseUiLanguageCatalog(source: string, file = "languages.json"): UiFileResult<UiLanguageCatalog> {
  const read = readStrictJson(source, file, UI_FILE_LIMITS.registry);
  if (!read.ok) return read;
  const { value, sink } = read, catalog = readObject(sink, value, "$", ["format_version", "default", "languages"]);
  if (!catalog) return finishFile(sink, value);
  checkFormatVersion(sink, catalog, UI_FORMAT_VERSIONS.languages);
  const tags = new Set<string>(), html = new Set<string>();
  if (!Array.isArray(catalog.languages) || !catalog.languages.length) sink.add("$.languages", "ui.language_list", "语言清单必须是非空数组", "至少登记默认语言");
  for (const [index, raw] of (Array.isArray(catalog.languages) ? catalog.languages : []).entries()) {
    const path = "$.languages[" + index + "]", row = readObject(sink, raw, path, ["tag", "html_lang", "intl", "direction", "name"]);
    if (!row) continue;
    if (!language(row.tag) || tags.has(row.tag)) sink.add(childPath(path, "tag"), "ui.language_tag", "语言标记无效或重复", "写唯一的 BCP 47 语言标记");
    else tags.add(row.tag);
    if (!language(row.html_lang) || html.has(row.html_lang)) sink.add(childPath(path, "html_lang"), "ui.language_tag", "HTML 语言无效或重复", "写唯一的 BCP 47 语言标记");
    else html.add(row.html_lang);
    if (!supportedIntl(row.intl)) sink.add(childPath(path, "intl"), "ui.language_intl", "Intl 不支持这个语言标记", "写可用于日期、数字的语言标记");
    if (row.direction !== "ltr" && row.direction !== "rtl") sink.add(childPath(path, "direction"), "ui.language_direction", "文字方向无效", "写 ltr 或 rtl");
    if (!safeLabel(row.name)) sink.add(childPath(path, "name"), "ui.language_name", "语言名称不能为空、过长或含标记", "写语言自己的可读名称");
  }
  if (!language(catalog.default) || !tags.has(catalog.default)) sink.add("$.default", "ui.language_default", "默认语言不在清单中", "从 languages 中选择一个 tag");
  const checked = finishFile<UiLanguageCatalog>(sink, value);
  if (!checked.ok) return checked;
  return { ok: true, value: Object.freeze({ ...checked.value, languages: Object.freeze(checked.value.languages.map(row => Object.freeze(row))) }) };
}

/** Match the system's language list in priority order, keeping exact region/script preferences before the base. */
export function preferredUiLanguage(catalog: UiLanguageCatalog, requested: readonly string[]): UiLanguageDescriptor | undefined {
  for (const value of requested) {
    const parts = value.toLowerCase().split("-");
    const match = (key: string) => catalog.languages.find(item => item.tag.toLowerCase() === key)
      ?? catalog.languages.find(item => item.html_lang.toLowerCase() === key || item.intl.toLowerCase() === key);
    for (; parts.length; parts.pop()) {
      const selected = match(parts.join("-"));
      if (selected) return selected;
    }
  }
  return undefined;
}

/** A projection from a checked catalog, or the exact closed shape expected on the frame channel. */
export function frameUiLanguage({ tag, html_lang, intl, direction }: UiLanguageDescriptor): UiFrameLanguage {
  return { tag, html_lang, intl, direction };
}

export function isFrameUiLanguage(value: unknown): value is UiFrameLanguage {
  return isObject(value) && Object.keys(value).length === 4 && language(value.tag) && language(value.html_lang) && supportedIntl(value.intl)
    && (value.direction === "ltr" || value.direction === "rtl");
}
