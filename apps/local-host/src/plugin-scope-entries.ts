import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { homeFixtureEntries, type PluginFixture } from "./home-side.js";

const definitionOf = (fixture: PluginFixture) => "manifest" in fixture ? fixture : fixture.definition;

/** Host configuration is checked before any Home or project instance can start. */
export function assertFixtureScopes(fixtures: { home?: readonly PluginFixture[]; project?: readonly PluginFixture[] } | undefined, hasHome: boolean): void {
  const home = fixtures?.home ?? [];
  if (home.length && !hasHome) throw new Error("Home 夹具需要明确的 Home 目录");
  const projectIds = new Set((fixtures?.project ?? []).map(item => definitionOf(item).manifest.plugin_id));
  for (const fixture of home) {
    const id = definitionOf(fixture).manifest.plugin_id;
    if (projectIds.has(id)) throw new Error(`插件 ${id} 不能同时在 Home 与项目启动名单里`);
    if (BUILTIN_PLUGIN_CATALOG.some(entry => entry.manifest.plugin_id === id)) {
      throw new Error(`Home 夹具 ${id} 不能冒充内置插件的定义`);
    }
  }
}

/** Compare the actual project's entries with the existing Home registration and its configured fixture definitions. */
export function projectScopeEntries<Entry extends { definition: PluginDefinition }>(entries: readonly Entry[], home: string | undefined): readonly Entry[] {
  if (!home) return entries;
  const homeIds = new Set(BUILTIN_PLUGIN_CATALOG.filter(entry => entry.runtime?.scope === "home").map(entry => entry.manifest.plugin_id));
  for (const entry of homeFixtureEntries(home)) homeIds.add(entry.definition.manifest.plugin_id);
  for (const entry of entries) if (homeIds.has(entry.definition.manifest.plugin_id)) {
    throw new Error(`插件 ${entry.definition.manifest.plugin_id} 不能同时在 Home 与项目启动名单里`);
  }
  return entries;
}
