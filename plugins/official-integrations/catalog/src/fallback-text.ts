import { existsSync, readFileSync } from "node:fs";
import type { TextArgs } from "@molis-ai/molis-work-contracts/platform/ui";
import { createTextReader, pluginLocaleReader, textArgs, type PluginLocaleReader } from "@molis-ai/molis-work-plugin-sdk/ui";

const CATALOG_OWNER = "io.molis.work.integration.catalog";
const CATALOG_LOCALES = { default: "zh", available: ["zh", "en", "ja"] } as const;

let cachedReader: PluginLocaleReader | null | undefined;

function catalogReader(): PluginLocaleReader | null {
  if (cachedReader !== undefined) return cachedReader;
  cachedReader = pluginLocaleReader(
    { plugin_id: CATALOG_OWNER, kind: "integration", ui: { locales: CATALOG_LOCALES } },
    (path) => {
      const url = new URL(`../${path}`, import.meta.url);
      return existsSync(url) ? readFileSync(url, "utf8") : null;
    },
  );
  return cachedReader;
}

/** Resolve a localized fallback title from the catalog package's trilingual locale packs. */
export function catalogFallback(key: string, args?: TextArgs, locale?: string | null): string {
  const reader = catalogReader();
  if (!reader) return key;
  const target = locale ?? reader.default;
  const packs = [...new Set([reader.default, target])].flatMap((tag) => reader.pack(tag) ?? []);
  if (packs.length === 0) return key;
  const say = createTextReader({ packs, locale: target });
  return say.text({ owner: CATALOG_OWNER, key, ...(args === undefined ? {} : { args: textArgs(args) }) });
}
