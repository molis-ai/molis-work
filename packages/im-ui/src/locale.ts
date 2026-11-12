import { readdirSync, readFileSync } from "node:fs";
import { LOCALE_TAG, type TextArgs, type UiFrameLanguage, type UiLocalePack } from "@molis-ai/molis-work-contracts/platform/ui";
import { BASELINE_REGISTRY } from "@molis-ai/molis-work-design-system";
import { createTextReader, matchLocale, pluginLocaleReader, textArgs, type PluginLocaleReader } from "@molis-ai/molis-work-plugin-sdk/ui";
import { IM_DEFAULT_LOCALE, IM_TEXT_OWNER, imIntlLocale, type ImLanguageProjection } from "./locale-owner.js";

let words: PluginLocaleReader | undefined;
function imWords(): PluginLocaleReader {
  if (words) return words;
  const registration = BASELINE_REGISTRY.resources.find(row => row.kind === "locale" && row.owner === IM_TEXT_OWNER);
  if (!registration) throw new Error("Discussion locale directory is not registered");
  const directory = new URL("../" + registration.path + "/", import.meta.url);
  const available = readdirSync(directory).flatMap(file => {
    const tag = file.endsWith(".json") ? file.slice(0, -5) : "";
    return LOCALE_TAG.test(tag) ? [tag] : [];
  });
  words = pluginLocaleReader({ plugin_id: IM_TEXT_OWNER, kind: "service", ui: { locales: { default: IM_DEFAULT_LOCALE, available } } }, file => {
    try { return readFileSync(new URL(file.slice(file.lastIndexOf("/") + 1), directory), "utf8"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  })!;
  return words;
}

function packsFor(language: UiFrameLanguage): UiLocalePack[] {
  const reader = imWords(), fallback = reader.pack(reader.default);
  if (!fallback) throw new Error("Cannot read the default discussion locale");
  const compatible = reader.available.flatMap(tag => tag !== reader.default && matchLocale(language.tag, [tag], reader.default) === tag
    ? reader.pack(tag) ?? [] : []);
  const messages = Object.fromEntries(Object.entries(fallback.messages).filter(([key]) =>
    !compatible.some(pack => Object.hasOwn(pack.messages, key))));
  return [{ ...fallback, messages }, ...compatible];
}

export type ImReadText = (key: string, args?: TextArgs) => string;

/** Standalone and embedded discussion read the same shipped words, including the owner's own fallback. */
export function imPageWords(language: UiFrameLanguage): { projection: ImLanguageProjection; readText: ImReadText } {
  const packs = packsFor(language);
  const reader = createTextReader({ locale: language.tag, packs, intlLocale: imIntlLocale(language) });
  return { projection: { language, packs }, readText: (key, args) => reader.text({ owner: IM_TEXT_OWNER, key, ...(args ? { args: textArgs(args) } : {}) }) };
}
