import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { buildSync } from "esbuild";
import { createTextReader, installTextForTest, parseLocalePack, textArgs, textKeyPrefix } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { UiLocalePack } from "@molis-ai/molis-work-contracts/platform/ui";

const ROOT = new URL("../../", import.meta.url);
const cache = new Map<string, UiLocalePack>();

/** Real packs for source-level tests that cannot also load the built Workbench and its plugin registry. */
export function shippedPagePack(owner: string, locale: string): UiLocalePack {
  const key = owner + "/" + locale;
  const found = cache.get(key);
  if (found) return found;
  const dir = owner === "workbench" ? "apps/workbench/resources/locales/" : "plugins/native/" + owner + "/locales/";
  const path = dir + locale + ".json", checked = parseLocalePack(readFileSync(new URL(path, ROOT), "utf8"), { file: path });
  assert.ok(checked.ok, path);
  assert.equal(textKeyPrefix(checked.value.owner), owner);
  assert.equal(checked.value.locale, locale);
  cache.set(key, checked.value);
  return checked.value;
}

export const chinesePagePacks = (...plugins: string[]) => ["workbench", ...plugins].map(owner => shippedPagePack(owner, "zh"));

export function pageTextForPacks(locale: string, packs: readonly UiLocalePack[]) {
  const read = createTextReader({ locale, packs });
  return (key: string, args?: Record<string, string | number>) => {
    const prefix = key.split(".")[0];
    const owner = prefix === "common" ? "workbench" : packs.find(pack => textKeyPrefix(pack.owner) === prefix)?.owner ?? "workbench";
    return read.text({ owner, key, ...(args ? { args: textArgs(args) } : {}) });
  };
}

export function withPagePacks<T>(locale: string, packs: readonly UiLocalePack[], render: () => T): T {
  const restore = installTextForTest({ locale, packs });
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
export function pageTextScriptForPacks(locale: string, packs: readonly UiLocalePack[]): string {
  return browserTextScript() + "\nfixturePageText(" + JSON.stringify({ locale, packs }).replaceAll("<", "\\u003c") + ");";
}
/** A fake browser uses the real SDK globals in its own realm, so it can coexist with a Host provider. */
export function installPageClientText(locale: string, packs: readonly UiLocalePack[]): () => void {
  const context = { document: { documentElement: {} } };
  const words = runInNewContext(pageTextScriptForPacks(locale, packs) + "\n({ t, say, format })", context) as
    Pick<typeof import("@molis-ai/molis-work-plugin-sdk/ui"), "t" | "say" | "format">;
  const saved = (["t", "say", "format"] as const).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  Object.assign(globalThis, words);
  return () => {
    for (const [key, prior] of saved) {
      if (prior) Object.defineProperty(globalThis, key, prior);
      else Reflect.deleteProperty(globalThis, key);
    }
  };
}

export function pageTextReaderScriptForPacks(locale: string, packs: readonly UiLocalePack[]): string {
  return browserTextScript() + "\nglobalThis.isolatedEditorText = fixtureTextReader(" + JSON.stringify({ locale, packs }).replaceAll("<", "\\u003c") + ");";
}
