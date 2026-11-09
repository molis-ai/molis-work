import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { UiLanguageTag } from "@molis-ai/molis-work-contracts/platform/ui";
import { WORKBENCH_LANGUAGES, workbenchPlatformText } from "./platform-languages.js";
import { workbenchLanguageAssetTag } from "./language-asset.js";

interface LanguageAsset { readonly href: string; readonly body: string; readonly etag: string }
const built = new Map<UiLanguageTag, LanguageAsset>();
let client: string | undefined;

/** The same registered Workbench words the server uses, with only the selected language in a cacheable resource. */
function languageAsset(tag: UiLanguageTag): LanguageAsset | null {
  const prior = built.get(tag);
  if (prior) return prior;
  const pack = workbenchPlatformText.pack(tag);
  if (!pack) return null;
  client ??= readFileSync(new URL("./language-client.js", import.meta.url), "utf8");
  const body = client + "\nglobalThis.molisWorkLanguageAsset(" + JSON.stringify({ pack, catalog: WORKBENCH_LANGUAGES }).replaceAll("<", "\\u003c") + ");";
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

/** Only the exact version named by the document can be served; there is no route for an arbitrary owner, language or disk path. */
export function workbenchLanguageResource(pathname: string): LanguageAsset | null {
  const tag = workbenchLanguageAssetTag(pathname), asset = tag ? languageAsset(tag) : null;
  return asset?.href === pathname ? asset : null;
}
