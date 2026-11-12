import { LOCALE_TAG } from "@molis-ai/molis-work-contracts/platform/ui";
import type { LocalizedAgentBody } from "@molis-ai/molis-work-contracts/platform/model-prompts";

/** Read a shipped body from the declaring package. Only declared translations are read; a caller's language is never a file path. */
export function readLocalizedMarkdown(directory: URL, id: string, locales: readonly string[], read: (file: URL) => string): LocalizedAgentBody {
  if (!/^[a-z0-9][a-z0-9.-]*$/u.test(id) || locales.some(locale => !LOCALE_TAG.test(locale)) || new Set(locales).size !== locales.length) {
    throw new Error("长正文的标识或语言声明无效");
  }
  const body = (suffix: string) => {
    const file = new URL(id + suffix + ".md", directory);
    const text = read(file).trimEnd();
    if (!text.trim() || text.length > 20_000) throw new Error("长正文为空或超过 20000 字符：" + file.pathname);
    return text;
  };
  return { body: body(""), body_by_locale: Object.freeze(Object.fromEntries(locales.map(locale => [locale, body("." + locale)]))) };
}
