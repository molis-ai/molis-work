import { BUILTIN_PLUGIN_CATALOG, createWorkbenchLocale, withPluginWords, type WebLocale } from "@molis-ai/molis-work-app-workbench";

/** The id of a built-in Plugin by the short name its directory entry has (`"coding"`). */
export const pluginIdOf = (shortName: string): string => BUILTIN_PLUGIN_CATALOG.find(entry => entry.project_plugin_id === shortName)!.manifest.plugin_id;

/**
 * The translator a page gets in one language: what a renderer's `text` primitive is when the Host draws it. With `plugins` it is
 * the translator while those Plugins' own surfaces are drawn: their `ui.translations` apply after the Host's English, as the page
 * applies them to a contribution it draws (PG-071), the first Plugin that has the word first.
 */
export const pageText = (locale: WebLocale, ...plugins: string[]) => {
  const { L } = createWorkbenchLocale(() => locale);
  if (plugins.length === 0) return L;
  const ids = plugins.map(pluginIdOf);
  return (key: string, values?: Record<string, string | number>): string => {
    const owner = ids.find(id => withPluginWords(id, () => L(key)) !== L(key));
    return owner === undefined ? L(key, values) : withPluginWords(owner, () => L(key, values));
  };
};

/**
 * The same translator for a page under test: a script that defines `globalThis.L` the way the Host's pages get it. With `plugin`, the
 * page is that Plugin's frame: its own words are in the catalog, as the frame is handed them.
 */
export const pageTextScript = (locale: WebLocale, plugin?: string) => {
  const script = createWorkbenchLocale(() => locale).clientI18nScript();
  return plugin === undefined ? script : `${script}\nglobalThis.MOLIS_WORK_MESSAGES = { ...globalThis.MOLIS_WORK_PLUGIN_WORDS?.[${JSON.stringify(pluginIdOf(plugin))}], ...globalThis.MOLIS_WORK_MESSAGES };`;
};
