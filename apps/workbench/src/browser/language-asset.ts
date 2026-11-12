import type { UiLanguageCatalog, UiLocalePack } from "@molis-ai/molis-work-contracts/platform/ui";
import { parseLocalePack, parseUiLanguageCatalog, t } from "@molis-ai/molis-work-plugin-sdk/ui";
import { workbenchLanguageAssetTag } from "../language-asset.js";

interface Asset { readonly catalog: UiLanguageCatalog; readonly pack: UiLocalePack }
export const assetOf = (page: ParentNode) => page.querySelector<HTMLScriptElement>("script[data-ui-language-resource]")?.getAttribute("src") ?? undefined;
const scriptSource = () => document.currentScript?.getAttribute("src") ?? "";
const loadFailed = () => new Error(t.text("workbench.language.load-failed"));

declare global {
  var molisWorkLanguageAsset: ((asset: Asset) => void) | undefined;
  var molisWorkLanguageCatalog: (() => UiLanguageCatalog) | undefined;
}

/** Preparation caches by the exact script selected by the new representation, never just its language tag. */
export function installLanguageAssets(install: (asset: Asset) => void) {
  if (globalThis.molisWorkLanguageAsset) return;
  const assets = new Map<string, Asset>();
  const read = (source: string, data: Asset): Asset | undefined => {
    const tag = workbenchLanguageAssetTag(source);
    if (!tag || !data?.pack || !data.catalog) return undefined;
    const checked = parseUiLanguageCatalog(JSON.stringify(data.catalog), source);
    const pack = parseLocalePack(JSON.stringify(data.pack), { file: source });
    if (!checked.ok || !pack.ok || pack.value.owner !== "workbench" || pack.value.locale !== tag || !checked.value.languages.some(row => row.tag === tag)) return undefined;
    return { catalog: checked.value, pack: pack.value };
  };
  globalThis.molisWorkLanguageAsset = data => {
    const source = scriptSource(), asset = read(source, data);
    if (!asset) return;
    assets.set(source, asset);
    if (assetOf(document) === source && assets.size === 1) install(asset);
  };
  return async (locale: string, source: string | undefined, signal: AbortSignal): Promise<Asset> => {
    if (!source || workbenchLanguageAssetTag(source) !== locale) throw loadFailed();
    const cached = assets.get(source);
    if (cached) return cached;
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script"); script.src = source;
      const end = (error?: unknown) => {
        script.remove(); clearTimeout(deadline); signal.removeEventListener("abort", abort);
        if (error === undefined) resolve(); else reject(error);
      };
      const fail = () => end(loadFailed());
      const abort = () => end(signal.reason);
      const deadline = setTimeout(fail, 10_000);
      script.onload = () => end(); script.onerror = fail;
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) { abort(); return; }
      document.head.append(script);
    });
    const answer = assets.get(source);
    if (!answer) throw loadFailed();
    return answer;
  };
}
