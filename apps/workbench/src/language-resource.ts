import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { UiLanguageTag, UiLocalePack, UiMessage } from "@molis-ai/molis-work-contracts/platform/ui";
import { WORKBENCH_LANGUAGES, workbenchPlatformText } from "./platform-languages.js";
import { workbenchLanguageAssetTag } from "./language-asset.js";

interface LanguageAsset { readonly href: string; readonly body: string; readonly etag: string }
const built = new Map<UiLanguageTag, LanguageAsset>();
let client: string | undefined;

function languagePackScript(pack: UiLocalePack): string {
  const { messages, ...metadata } = pack;
  const groups = new Map<string, UiMessage[]>();
  for (const [key, message] of Object.entries(messages)) {
    // Two-segment keys have no region prefix to remove.
    const prefixEnd = key.indexOf(".", key.indexOf(".") + 1) + 1;
    const prefix = key.slice(0, prefixEnd);
    let words = groups.get(prefix);
    if (!words) groups.set(prefix, words = []);
    words.push(key.slice(prefixEnd), message);
  }
  const payload = JSON.stringify({ catalog: WORKBENCH_LANGUAGES, pack: metadata, groups: [...groups] }).replaceAll("<", "\\u003c");
  return `
{
  const { catalog, pack, groups } = ${payload};
  const messages = Object.create(null);
  for (const [prefix, words] of groups) {
    for (let index = 0; index < words.length; index += 2) messages[prefix + words[index]] = words[index + 1];
  }
  globalThis.molisWorkLanguageAsset({ catalog, pack: { ...pack, messages } });
}`;
}

/** The same registered Workbench words the server uses, with only the selected language in a cacheable resource. */
function languageAsset(tag: UiLanguageTag): LanguageAsset | null {
  const prior = built.get(tag);
  if (prior) return prior;
  const pack = workbenchPlatformText.pack(tag);
  if (!pack) return null;
  client ??= readFileSync(new URL("./language-client.js", import.meta.url), "utf8");
  const body = client + languagePackScript(pack);
  const digest = createHash("sha256").update(body).digest("hex").slice(0, 24);
  const asset = { href: `/assets/locale/workbench.${tag}.${digest}.js`, body, etag: '"' + digest + '"' };
  built.set(tag, asset);
  return asset;
}

export function renderLanguageHead(htmlLang: string): string {
  const language = WORKBENCH_LANGUAGES.languages.find(row => row.html_lang === htmlLang || row.tag === htmlLang);
  const asset = language && languageAsset(language.tag);
  return asset ? `<script data-ui-language-resource src="${asset.href}"></script>` : "";
}

export interface InlinePageText { readonly slot: string; readonly producer: string; readonly packs: readonly UiLocalePack[] }

export function renderInlinePageText(pages: readonly InlinePageText[]): string {
  return pages.length ? '<script type="application/json" data-ui-page-text>' + JSON.stringify(pages).replaceAll("<", "\\u003c") + '</script>' : "";
}

/** Only the exact version named by the document can be served; there is no route for an arbitrary owner, language or disk path. */
export function workbenchLanguageResource(pathname: string): LanguageAsset | null {
  const tag = workbenchLanguageAssetTag(pathname), asset = tag ? languageAsset(tag) : null;
  return asset?.href === pathname ? asset : null;
}
