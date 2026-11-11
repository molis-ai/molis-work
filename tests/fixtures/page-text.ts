import assert from "node:assert/strict";
import { BUILTIN_PLUGIN_CATALOG, type WebLocale } from "@molis-ai/molis-work-app-workbench";
import { inspectLocaleSet } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { UiLocalePack } from "@molis-ai/molis-work-contracts/platform/ui";
import { pageTextForPacks, pageTextReaderScriptForPacks, pageTextScriptForPacks, shippedPagePack, withPagePacks } from "./page-text-packs.js";

const builtins = new Map(BUILTIN_PLUGIN_CATALOG.map(entry => [entry.project_plugin_id, entry.manifest]));

/** The actual built-in locale file; nothing projects a word from an unrelated owner's dictionary. */
export function pagePack(owner: string, locale: string): UiLocalePack {
  const pack = shippedPagePack(owner, locale);
  assert.equal(pack.owner, owner === "workbench" ? owner : pluginIdOf(owner));
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
  return pageTextForPacks(locale, ownedPacks(locale, plugins));
}

export function withPageText<T>(locale: WebLocale, plugins: readonly string[], render: () => T): T {
  return withPagePacks(locale, ownedPacks(locale, plugins), render);
}

export function pageTextScript(locale: WebLocale, ...plugins: string[]): string {
  return pageTextScriptForPacks(locale, ownedPacks(locale, plugins));
}
export function pageTextReaderScript(locale: WebLocale, ...plugins: string[]): string {
  return pageTextReaderScriptForPacks(locale, ownedPacks(locale, plugins));
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
