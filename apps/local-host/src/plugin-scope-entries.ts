import { PLATFORM_PLUGIN_REGISTRATIONS } from "./plugin-registry.js";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginTrust } from "@molis-ai/molis-work-contracts/platform/plugin-trust";
import { homeFixtureEntries, pluginFixtureDeclarations, storesWithFixtures, type PluginFixture } from "./home-side.js";
import { assertOwnerFilesEntries } from "./plugin-owner-files-entries.js";

const definitionOf = (fixture: PluginFixture) => "manifest" in fixture ? fixture : fixture.definition;
const dualOf = (fixture: PluginFixture) => !("manifest" in fixture) && fixture.dual_instance === true;

/** Host configuration is checked before any Home or project instance can start. */
export function assertFixtureScopes(fixtures: { home?: readonly PluginFixture[]; project?: readonly PluginFixture[] } | undefined, hasHome: boolean): void {
  const home = fixtures?.home ?? [];
  assertOwnerFilesEntries([...(hasHome ? PLATFORM_PLUGIN_REGISTRATIONS.flatMap(entry => entry.runtime ? [{ ...entry.runtime, definition: entry.runtime.create() }] : []) : []),
    ...pluginFixtureDeclarations(home)], pluginFixtureDeclarations(fixtures?.project ?? []), hasHome ? { stores: storesWithFixtures(fixtures) } : null);
  if (home.length && !hasHome) throw new Error("Home 夹具需要明确的 Home 目录");
  for (const fixture of fixtures?.project ?? []) if (dualOf(fixture)) throw new Error(`项目夹具 ${definitionOf(fixture).manifest.plugin_id} 不能自称双实例：标记只写在 Home 那一半`);
  const projectIds = new Set((fixtures?.project ?? []).map(item => definitionOf(item).manifest.plugin_id));
  for (const fixture of home) {
    const id = definitionOf(fixture).manifest.plugin_id;
    if (projectIds.has(id) !== dualOf(fixture)) {
      throw new Error(dualOf(fixture) ? `双实例插件 ${id} 在项目启动名单里没有另一半` : `插件 ${id} 不能同时在 Home 与项目启动名单里`);
    }
    if (PLATFORM_PLUGIN_REGISTRATIONS.some(entry => entry.manifest.plugin_id === id)) {
      throw new Error(`Home 夹具 ${id} 不能冒充内置插件的定义`);
    }
  }
}

/**
 * Compare the actual project's entries with the existing Home registration and its configured fixture definitions. A plugin_id on
 * both lists is refused unless the Home side (a catalog entry's `runtime.dual_instance`, or a Home fixture's) says it is a
 * dual-instance plugin and both halves ship alike (`host` trust), so that both register under one provider id; the project entry then
 * comes back marked as the project half. A project entry never marks itself, and a marked Home half must have its project half here.
 */
export function projectScopeEntries<Entry extends { definition: PluginDefinition; trust?: PluginTrust; dual_instance?: true }>(
  entries: readonly Entry[], home: string | undefined): readonly Entry[] {
  for (const entry of entries) if (entry.dual_instance) {
    throw new Error(`项目插件 ${entry.definition.manifest.plugin_id} 不能自称双实例：标记只写在 Home 那一半`);
  }
  // A shipped plugin's Home half is in the catalog whether or not this host has a Home, so its project half is marked either way.
  const homeSides = new Map<string, { dual: boolean; hostBuilt: boolean }>(PLATFORM_PLUGIN_REGISTRATIONS.filter(entry => entry.runtime?.scope === "home")
    .map(entry => [entry.manifest.plugin_id, { dual: entry.runtime!.dual_instance === true, hostBuilt: true }]));
  if (!home) return entries.map(entry => homeSides.get(entry.definition.manifest.plugin_id)?.dual ? { ...entry, dual_instance: true as const } : entry);
  for (const entry of homeFixtureEntries(home)) homeSides.set(entry.definition.manifest.plugin_id, { dual: entry.dual_instance === true, hostBuilt: false });
  const marked = entries.map(entry => {
    const id = entry.definition.manifest.plugin_id, side = homeSides.get(id);
    if (!side) return entry;
    if (!side.dual) throw new Error(`插件 ${id} 不能同时在 Home 与项目启动名单里`);
    if (side.hostBuilt !== (entry.trust?.level === "host")) throw new Error(`双实例插件 ${id} 的两半要么都随宿主发布，要么都不是`);
    return { ...entry, dual_instance: true as const };
  });
  for (const [id, side] of homeSides) if (side.dual && !entries.some(entry => entry.definition.manifest.plugin_id === id)) {
    throw new Error(`双实例插件 ${id} 在项目启动名单里没有另一半`);
  }
  return marked;
}
