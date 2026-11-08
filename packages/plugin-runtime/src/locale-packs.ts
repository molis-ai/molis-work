import { pluginErrors, type PluginLocalesDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { UiFileProblem, UiLocalePack } from "@molis-ai/molis-work-contracts/platform/ui";
import { inspectLocaleSet, parseLocalePack, type LocaleSetProblem } from "@molis-ai/molis-work-plugin-sdk/ui";

// A plugin's language files, one set of rules whoever supplies the bytes (specs/font-and-skin-system/a-section-contract.md §6.2): a package's files, a project
// directory in development. A plugin's code cannot read them itself: a built-in plugin is one module and a sandbox package only holds the files of its format, so
// the platform does. `read` answers a package path's text, or `null` when there is no such file.

/** What these rules read of a Manifest: an installed one or a package's, which have different shapes around these fields. */
export interface PluginLocaleManifest {
  readonly plugin_id: string;
  readonly kind: string;
  readonly ui?: { readonly locales?: PluginLocalesDeclaration };
}

/** Reads a file of the plugin. `null` when it is not there. */
export type PluginLocaleRead = (path: string) => string | null;

/** A language's file is at a path the language gives, so adding one writes no path. */
export const pluginLocaleFilePath = (locale: string): string => `locales/${locale}.json`;

/** The files a Manifest's `ui.locales` declares. Its tags were shape-checked by the Manifest's parser, which is what keeps them inside the package. */
export function pluginLocaleFilePaths(manifest: Pick<PluginLocaleManifest, "ui">): readonly string[] {
  return (manifest.ui?.locales?.available ?? []).map(pluginLocaleFilePath);
}

/**
 * Only a content pack's words may hold `<`, `>`, `&`, `"`, `'` (§5.3), and only its parsed Manifest says so: never the language file, never a caller.
 * A sandboxed plugin's `t` has its own words in its index, so it stays strict. `PluginKind` has no `content` until batch 08's C-1 adds it, and until then no
 * parsed Manifest reaches the relaxed branch.
 */
const isContentPack = (manifest: PluginLocaleManifest): boolean => manifest.kind === "content";

const fileProblem = ({ file, path, code, reason, fix, line, column }: UiFileProblem, locale: string): LocaleSetProblem => ({
  file, locale, code, fix, key: null, blocking: true,
  reason: `${path}${line === undefined ? "" : `（第 ${line} 行第 ${column} 列）`}：${reason}`,
});

/** One language's file, with everything a single file can be wrong about: not there, not a language pack, or saying it is someone else's or another language's. */
function readLocaleFile(manifest: PluginLocaleManifest, locale: string, read: PluginLocaleRead): { readonly pack: UiLocalePack | null; readonly problems: readonly LocaleSetProblem[] } {
  const file = pluginLocaleFilePath(locale);
  const blocked = (code: string, reason: string, fix: string): LocaleSetProblem => ({ file, code, locale, key: null, reason, fix, blocking: true });
  const source = read(file);
  if (source === null) return { pack: null, problems: [blocked("ui.locale_file_missing", `Manifest 声明了 ${locale}，包里没有 ${file}`, `加上 ${file}，或从 ui.locales.available 去掉 ${locale}`)] };
  const parsed = parseLocalePack(source, { file, contentPack: isContentPack(manifest) });
  if (!parsed.ok) return { pack: null, problems: parsed.problems.map((problem) => fileProblem(problem, locale)) };
  const problems = [
    ...(parsed.value.locale === locale ? [] : [blocked("ui.locale_file_mismatch", `文件名是 ${locale}，文件里写的 locale 是 ${parsed.value.locale}`, `把 locale 改成 ${locale}`)]),
    ...(parsed.value.owner === manifest.plugin_id ? [] : [blocked("ui.locale_owner", `owner 是 ${parsed.value.owner}，Manifest 的 plugin_id 是 ${manifest.plugin_id}`, `把 owner 改成 ${manifest.plugin_id}`)]),
  ];
  return { pack: problems.length > 0 ? null : parsed.value, problems };
}

/**
 * Install, `validate` and `pack`: every declared language, read once. The ones with `blocking` refuse the package; the others (a language short of a word) are worth telling the
 * author and nothing more. A Manifest without `ui.locales` has nothing to read.
 */
export function inspectPluginLocales(manifest: PluginLocaleManifest, read: PluginLocaleRead): readonly LocaleSetProblem[] {
  const declared = manifest.ui?.locales;
  if (declared === undefined) return [];
  const files = declared.available.map((locale) => readLocaleFile(manifest, locale, read));
  if (files.some(({ problems }) => problems.length > 0)) return files.flatMap(({ problems }) => problems);
  return inspectLocaleSet(files.flatMap(({ pack }) => pack ?? []), { default: declared.default, contentPack: isContentPack(manifest) });
}

/** `inspectPluginLocales` as a refusal: says every file and what to do. Answers what is left to tell, which does not stop anything. */
export function assertPluginLocales(manifest: PluginLocaleManifest, read: PluginLocaleRead): readonly LocaleSetProblem[] {
  const problems = inspectPluginLocales(manifest, read);
  refuseLocaleProblems(problems);
  return problems;
}

/** Refuses the package over the `blocking` problems, naming every file and what to do; the one wording of that refusal for install, `validate`, `pack` and `dev`. */
export function refuseLocaleProblems(problems: readonly LocaleSetProblem[]): void {
  const blocking = problems.filter((problem) => problem.blocking);
  if (blocking.length > 0) throw pluginErrors.package_invalid(`语言文件有问题：${blocking.map(({ file, key, reason, fix }) => `${file}${key === null ? "" : ` ${key}`}：${reason}；${fix}`).join("。")}`);
}

/** The running side of a plugin's languages. A word's language may never be asked for, so its file is not read until it is. */
export interface PluginLocaleReader {
  /** The owner of the words: the plugin_id, from the Manifest and never from a file. */
  readonly owner: string;
  readonly default: string;
  readonly available: readonly string[];
  /** The language's pack, read and parsed the first time it is asked for. `null` when it is not declared or its file cannot be used: reading words never throws over a bad file. */
  pack(locale: string): UiLocalePack | null;
  /** What was wrong with the files read so far. */
  problems(): readonly LocaleSetProblem[];
}

/** The same rules as `inspectPluginLocales`, one language at a time. A language another read answered stays in memory, a language nobody asks for costs nothing. */
export function pluginLocaleReader(manifest: PluginLocaleManifest, read: PluginLocaleRead): PluginLocaleReader | null {
  const declared = manifest.ui?.locales;
  if (declared === undefined) return null;
  const loaded = new Map<string, UiLocalePack | null>();
  const found: LocaleSetProblem[] = [];
  return {
    owner: manifest.plugin_id,
    default: declared.default,
    available: declared.available,
    pack(locale) {
      if (loaded.has(locale)) return loaded.get(locale)!;
      if (!declared.available.includes(locale)) return null;
      const { pack, problems } = readLocaleFile(manifest, locale, read);
      found.push(...problems);
      loaded.set(locale, pack);
      return pack;
    },
    problems: () => [...found],
  };
}
