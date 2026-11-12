import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { UiLanguageTag, UiLocalePack, UiMessage } from "@molis-ai/molis-work-contracts/platform/ui";
import { WORKBENCH_LANGUAGES, workbenchPlatformText } from "./platform-languages.js";
import { workbenchLanguageAssetTag } from "./language-asset.js";

interface LanguageAsset { readonly href: string; readonly body: string; readonly etag: string }
const built = new Map<UiLanguageTag, LanguageAsset>();
let client: string | undefined;

const languageScriptJson = (value: unknown): string => JSON.stringify(value).replaceAll("<", "\\u003c");
const KEY_FRAGMENT = /[a-z0-9]{3,}/gu;
// These are outside stable keys, exclude the separator, and need no JSON escaping.
const KEY_FRAGMENT_MARKERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ!#$%&()*+,/:;=>?@^{}~";

function sharedStringIndices(messages: UiLocalePack["messages"]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of Object.values(messages)) {
    if (typeof value === "string") counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const indices = new Map<string, number>();
  for (const [value, count] of counts) {
    if (count < 2) continue;
    const bytes = Buffer.byteLength(languageScriptJson(value), "utf8");
    const index = indices.size;
    // Charge a separator even for the first table entry.
    if ((count - 1) * bytes > 1 + count * String(index).length) indices.set(value, index);
  }
  return indices;
}

function keyFragmentMarkers(suffixGroups: readonly string[]): Map<string, string> {
  const counts = new Map<string, number>();
  for (const suffixes of suffixGroups) {
    for (const [fragment] of suffixes.matchAll(KEY_FRAGMENT)) counts.set(fragment, (counts.get(fragment) ?? 0) + 1);
  }
  // A dictionary entry costs the fragment plus quotes, marker, colon, and a comma.
  const candidates = Array.from(counts, ([fragment, count]) => ({ fragment, bytes: count * (fragment.length - 1) - (fragment.length + 7) }))
    .filter(({ bytes }) => bytes > 0).sort((left, right) => right.bytes - left.bytes);
  return new Map(candidates.slice(0, KEY_FRAGMENT_MARKERS.length).map(({ fragment }, index) => [fragment, KEY_FRAGMENT_MARKERS.charAt(index)]));
}

function languagePackScript(pack: UiLocalePack): string {
  const { messages, ...metadata } = pack;
  const shared = sharedStringIndices(messages);
  const groups = new Map<string, { suffixes: string[]; values: (UiMessage | number)[] }>();
  for (const [key, message] of Object.entries(messages)) {
    // Two-segment keys have no region prefix to remove.
    const prefixEnd = key.indexOf(".", key.indexOf(".") + 1) + 1;
    const prefix = key.slice(0, prefixEnd);
    let group = groups.get(prefix);
    if (!group) groups.set(prefix, group = { suffixes: [], values: [] });
    group.suffixes.push(key.slice(prefixEnd));
    group.values.push(typeof message === "string" ? shared.get(message) ?? message : message);
  }
  // The locale pack validator excludes "|" from every stable key.
  const rows = Array.from(groups, ([prefix, { suffixes, values }]) => [prefix, suffixes.join("|"), values] as const);
  const markers = keyFragmentMarkers(rows.map(([, suffixes]) => suffixes));
  const fragments = Object.fromEntries(Array.from(markers, ([fragment, marker]) => [marker, fragment]));
  const payload = languageScriptJson({
    catalog: WORKBENCH_LANGUAGES, pack: metadata, strings: [...shared.keys()], fragments,
    groups: rows.map(([prefix, suffixes, values]) => [prefix, suffixes.replace(KEY_FRAGMENT, fragment => markers.get(fragment) ?? fragment), values]),
  });
  return `
{
  const { catalog, pack, strings, fragments, groups } = ${payload};
  const messages = Object.create(null);
  for (const [prefix, suffixes, values] of groups) {
    const keys = suffixes.split("|");
    for (let index = 0; index < keys.length; index++) {
      const key = keys[index].replace(/[^a-z0-9_.-]/g, marker => fragments[marker]);
      const value = values[index];
      messages[prefix + key] = typeof value === "number" ? strings[value] : value;
    }
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
