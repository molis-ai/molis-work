import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import { BUILTIN_PLUGIN_CATALOG, type WebLocale } from "@molis-ai/molis-work-app-workbench";
import { createTextReader, inspectLocaleSet, installTextForTest, parseLocalePack, textArgs, textKeyPrefix } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { UiLocalePack } from "@molis-ai/molis-work-contracts/platform/ui";

const ROOT = new URL("../../", import.meta.url);
const builtins = new Map(BUILTIN_PLUGIN_CATALOG.map(entry => [entry.project_plugin_id, entry.manifest]));
const manifests = new Map<string, UiLocalePack>();

/** The actual built-in locale file; nothing projects a word from an unrelated owner's dictionary. */
export function pagePack(owner: string, locale: string): UiLocalePack {
  const key = owner + "/" + locale;
  let pack = manifests.get(key);
  if (pack) return pack;
  const dir = owner === "workbench" ? "apps/workbench/resources/locales/" : "plugins/native/" + owner + "/locales/";
  const path = dir + locale + ".json", checked = parseLocalePack(readFileSync(new URL(path, ROOT), "utf8"), { file: path });
  assert.ok(checked.ok, path);
  pack = checked.value;
  assert.equal(pack.owner, owner === "workbench" ? owner : pluginIdOf(owner));
  assert.equal(pack.locale, locale);
  manifests.set(key, pack);
  return pack;
}

export const pluginIdOf = (shortName: string): string => builtins.get(shortName)!.plugin_id;

function ownedPacks(locale: string, plugins: readonly string[]) {
  return ["workbench", ...plugins].flatMap(owner => {
    const fallback = owner === "workbench" ? "zh" : builtins.get(owner)?.ui.locales?.default;
    assert.ok(fallback, owner);
    return [pagePack(owner, fallback), ...(locale === fallback ? [] : [pagePack(owner, locale)])];
  });
}

export function pageText(locale: WebLocale, ...plugins: string[]) {
  const packs = ownedPacks(locale, plugins), read = createTextReader({ locale, packs });
  return (key: string, args?: Record<string, string | number>) => {
    const prefix = key.split(".")[0];
    const owner = prefix === "common" ? "workbench" : packs.find(pack => textKeyPrefix(pack.owner) === prefix)?.owner ?? "workbench";
    return read.text({ owner, key, ...(args ? { args: textArgs(args) } : {}) });
  };
}

export function withPageText<T>(locale: WebLocale, plugins: readonly string[], render: () => T): T {
  const restore = installTextForTest({ locale, packs: ownedPacks(locale, plugins) });
  try { return render(); } finally { restore(); }
}

let browserText: string | undefined;
function browserTextScript(): string {
  browserText ??= buildSync({ stdin: { contents: `
    import { createTextReader, textArgs, textKeyPrefix, installTextForTest, t, say, format } from "@molis-ai/molis-work-plugin-sdk/ui";
    globalThis.fixtureTextReader = options => {
      const reader = createTextReader(options);
      return (key, args) => {
        const prefix = key.split(".")[0];
        const owner = prefix === "common" ? "workbench" : options.packs.find(pack => textKeyPrefix(pack.owner) === prefix)?.owner ?? "workbench";
        return reader.text({ owner, key, ...(args ? { args: textArgs(args) } : {}) });
      };
    };
    globalThis.fixturePageText = options => {
      globalThis.restoreFixtureWords?.();
      globalThis.restoreFixtureWords = installTextForTest(options);
      Object.assign(globalThis, { t, say, format });
      document.documentElement.lang = options.locale;
    };`, resolveDir: fileURLToPath(ROOT) }, bundle: true, format: "iife", platform: "browser", write: false, logLevel: "silent" }).outputFiles[0]!.text;
  return browserText;
}
export function pageTextScript(locale: WebLocale, ...plugins: string[]): string {
  return browserTextScript() + "\nfixturePageText(" + JSON.stringify({ locale, packs: ownedPacks(locale, plugins) }).replaceAll("<", "\\u003c") + ");";
}
export function pageTextReaderScript(locale: WebLocale, ...plugins: string[]): string {
  return browserTextScript() + "\nglobalThis.isolatedEditorText = fixtureTextReader(" + JSON.stringify({ locale, packs: ownedPacks(locale, plugins) }).replaceAll("<", "\\u003c") + ");";
}

/** The shipped packs cover the checked keys and share parameters and plural shapes. */
export function assertPageWords(owner: string, keys: Iterable<string>): void {
  const fallback = owner === "workbench" ? "zh" : builtins.get(owner)?.ui.locales?.default;
  assert.ok(fallback, owner);
  const packs = [pagePack(owner, fallback), ...(fallback === "en" ? [] : [pagePack(owner, "en")])];
  assert.deepEqual(inspectLocaleSet(packs, { default: fallback }), [], owner);
  for (const key of new Set(keys)) {
    const exact = key.startsWith("common.") ? [pagePack("workbench", "zh"), pagePack("workbench", "en")] : packs;
    assert.ok(exact.every(pack => Object.hasOwn(pack.messages, key)), `${owner}: ${key} is in both language files`);
  }
}
