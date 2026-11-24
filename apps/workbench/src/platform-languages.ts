import { readdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { BASELINE_REGISTRY, registerCatalogBoardText } from "@molis-ai/molis-work-design-system";
import { createTextReader, inspectLocaleSet, matchLocale, parseLocalePack, parseUiLanguageCatalog, textArgs } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { UiFileResult, UiLanguageTag, UiLocalePack } from "@molis-ai/molis-work-contracts/platform/ui";
import type { PluginTextReader } from "@molis-ai/molis-work-ui-host";

const root = realpathSync(fileURLToPath(new URL("../", import.meta.url)));
const row = BASELINE_REGISTRY.resources.find(row => row.kind === "locale" && row.owner === "workbench");
if (row?.package !== "@molis-ai/molis-work-app-workbench") throw new Error("Workbench locale resource registration is missing");

function registeredPath(root: string, ...parts: string[]): string {
  const path = realpathSync(join(root, ...parts)), inside = relative(root, path);
  if (inside === ".." || inside.startsWith("../")) throw new Error("Language resource is outside its registered package");
  return path;
}

function mustRead<T>(result: UiFileResult<T>): T {
  if (result.ok) return result.value;
  const issue = result.problems[0];
  throw new Error(issue ? `${issue.file}: ${issue.path}: ${issue.reason}` : "Language resource is invalid");
}

const directory = registeredPath(root, row.path);
const descriptor = registeredPath(root, dirname(row.path), "languages.json");
export const WORKBENCH_LANGUAGES = mustRead(parseUiLanguageCatalog(readFileSync(descriptor, "utf8"), descriptor));
const { owner } = row;

function readPacks(directory: string, files: readonly string[]) {
  const packs = files.map(name => {
    const file = registeredPath(directory, name);
    const pack = mustRead(parseLocalePack(readFileSync(file, "utf8"), { file }));
    if (name !== pack.locale + ".json" || pack.owner !== owner || !WORKBENCH_LANGUAGES.languages.some(({ tag }) => tag === pack.locale)) {
      throw new Error(file + ": wrong language or owner");
    }
    return pack;
  });
  const problem = inspectLocaleSet(packs, { default: WORKBENCH_LANGUAGES.default, directory })
    .find(issue => issue.blocking || issue.code === "ui.locale_missing_key");
  if (problem) throw new Error(`${problem.file}: ${problem.key ?? problem.code}: ${problem.reason}`);
  return packs;
}

const packs = readPacks(directory, WORKBENCH_LANGUAGES.languages.map(({ tag }) => tag + ".json"));
export const workbenchPlatformText: PluginTextReader = {
  owner, default: WORKBENCH_LANGUAGES.default,
  pack: tag => packs.find(pack => pack.locale === tag) ?? null,
};

const sceneDirectory = registeredPath(directory, "scene");
const scenePacks = readPacks(sceneDirectory, readdirSync(sceneDirectory));
const sceneLocales = scenePacks.map(pack => pack.locale);

/** Scene results inline these fixed labels, with the base or default wording for additional UI languages. */
export const sceneOwnerStatusPacks = WORKBENCH_LANGUAGES.languages.map(({ tag, direction }) => {
  const source = matchLocale(tag, sceneLocales, WORKBENCH_LANGUAGES.default);
  return { ...scenePacks.find(pack => pack.locale === source)!, locale: tag, direction };
});

const catalogDirectory = registeredPath(directory, "catalog");
const catalogPacks = readPacks(catalogDirectory, readdirSync(catalogDirectory).filter(name => name.endsWith(".json")).sort());
const catalogLocales = catalogPacks.map(pack => pack.locale);
const catalogMerged = new Map<string, UiLocalePack>();

function catalogPackFor(tag: UiLanguageTag): UiLocalePack {
  const matched = WORKBENCH_LANGUAGES.languages.find(row => row.tag === tag || row.html_lang === tag)?.tag ?? tag;
  const source = matchLocale(matched, catalogLocales, WORKBENCH_LANGUAGES.default);
  return catalogPacks.find(item => item.locale === source)!;
}

/** On-demand component board reader (`/__ui/catalog*` only): merges the catalog sub-pack without touching production startup packs. */
export const catalogBoardText: PluginTextReader = {
  owner, default: WORKBENCH_LANGUAGES.default,
  pack(tag) {
    const cached = catalogMerged.get(tag);
    if (cached) return cached;
    const base = workbenchPlatformText.pack(tag), extra = catalogPackFor(tag);
    const merged = base ? { ...base, messages: { ...base.messages, ...extra.messages } } : { ...extra, locale: tag };
    catalogMerged.set(tag, merged);
    return merged;
  },
};

/** Inline page text payload for `/__ui/catalog*` documents so browser live switching resolves `workbench.catalog-board.*` with +0 B production cost. */
export function catalogInlinePageText(tag: UiLanguageTag): { readonly slot: string; readonly producer: string; readonly packs: readonly UiLocalePack[] } {
  const matched = WORKBENCH_LANGUAGES.languages.find(row => row.tag === tag || row.html_lang === tag)?.tag ?? WORKBENCH_LANGUAGES.default;
  const pack = catalogPackFor(matched);
  return { slot: "catalog:workbench", producer: owner, packs: [pack.locale === matched ? pack : { ...pack, locale: matched }] };
}

const UI_TEXT_PROVIDER = Symbol.for("molis.work.ui-text.v1");

const catalogOnlyReaders = new Map(
  WORKBENCH_LANGUAGES.languages.map(({ tag }) => {
    const selected = catalogPackFor(tag);
    const set = selected.locale === WORKBENCH_LANGUAGES.default ? [selected] : [catalogPackFor(WORKBENCH_LANGUAGES.default), { ...selected, locale: tag }];
    return [tag, createTextReader({ locale: tag, packs: set })] as const;
  }),
);
const catalogDefaultMessages = catalogPackFor(WORKBENCH_LANGUAGES.default).messages;

function activeCatalogLocale(): UiLanguageTag {
  const provider = Reflect.get(globalThis, UI_TEXT_PROVIDER) as { locale?(): string | null } | undefined;
  const current = provider?.locale?.();
  if (typeof current === "string" && current) {
    return WORKBENCH_LANGUAGES.languages.find(row => row.tag === current || row.html_lang === current)?.tag
      ?? matchLocale(current, catalogLocales, WORKBENCH_LANGUAGES.default);
  }
  return WORKBENCH_LANGUAGES.default;
}

/** Plain-text catalog reader for standalone specimen renders (such as unit tests outside `/__ui/catalog` HTTP). */
export function catalogBoardSay(tag: UiLanguageTag): (key: string, values?: Readonly<Record<string, string | number>>) => string {
  const matched = WORKBENCH_LANGUAGES.languages.find(row => row.tag === tag || row.html_lang === tag)?.tag ?? WORKBENCH_LANGUAGES.default;
  const set = [...new Set([matched, WORKBENCH_LANGUAGES.default])].flatMap(locale => catalogBoardText.pack(locale) ?? []);
  const reader = createTextReader({ locale: matched, packs: set });
  return (key, values) => {
    const args = values ? textArgs(values) : undefined;
    return reader.text({ owner, key, ...(args?.length ? { args } : {}) });
  };
}

registerCatalogBoardText((key, values) => {
  if (!Object.hasOwn(catalogDefaultMessages, key)) return null;
  const tag = activeCatalogLocale();
  const reader = catalogOnlyReaders.get(tag) ?? catalogOnlyReaders.get(WORKBENCH_LANGUAGES.default)!;
  const args = values ? textArgs(values) : undefined;
  return reader.text({ owner, key, ...(args?.length ? { args } : {}) });
});
