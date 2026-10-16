import path from "node:path";
import type { PluginDatabaseDeclaration, PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { homeStoreRegistry, type HomeStore, type HomeStoreRegistry } from "@molis-ai/molis-work-storage";
import type { HostCompleteText } from "./host-complete-text.js";
import { homeStores } from "./home-stores.js";
import { PLUGIN_LIBRARY_NAME } from "./plugin-database-entries.js";
import type { PluginPlatformEntry } from "./plugin-platform.js";
import type { MolisWorkLocalHost, MolisWorkLocalHostOptions } from "./project-host.js";
import { ensureSystemAgentService, releaseSystemAgentService } from "./system-agent-service.js";

/**
 * What a plugin platform is given of the Home it runs in. A platform that reaches no Home in this process is given `null`
 * instead (a generated plugin's platform, a test that has no Home): a platform cannot be built without saying which.
 */
export interface PluginPlatformHome {
  readonly directory: string;
  /**
   * The Host's model injection, read when a call needs it and never kept: a function stands in for the model (tests), `null`
   * says there is none, `undefined` says the Host was given nothing to inject. A project's platform can be started from the
   * Host or from the web path, whichever comes first, and both read the same injection here.
   */
  completeText(): HostCompleteText | null | undefined;
  /** The Home's stores (W4-11): a plugin is given a library only when the library is registered here as its own. */
  readonly stores: HomeStoreRegistry;
}

type HomeSideOptions = Pick<MolisWorkLocalHostOptions, "completeText" | "pluginFixtures" | "workspaceFor" | "workspacesFor">;

/**
 * What each Home's Host was built with, by resolved path. A Home has one open Host at a time (its Agent service binds the
 * Home's inference once), so there is one entry per Home, and it leaves with its Host.
 */
const sides = new Map<string, { host: MolisWorkLocalHost; options: HomeSideOptions }>();

/**
 * Binds a Host to its Home when it is built: the Home's Agent service, as before, and what a plugin platform reads of this Host
 * (its model injection, the fixtures it was given). Platforms read it when they start or when a call needs it, not here.
 */
export function bindHomeSide(host: MolisWorkLocalHost, homeDirectory: string, options: HomeSideOptions): void {
  ensureSystemAgentService(host, homeDirectory, undefined, { workspaceFor: options.workspaceFor, workspacesFor: options.workspacesFor });
  sides.set(path.resolve(homeDirectory), { host, options });
}

/** A closing Host stops offering its Home's inference at once (its successor can bind before teardown finishes) and leaves the Home side. */
export function releaseHomeSide(host: MolisWorkLocalHost): void {
  releaseSystemAgentService(host);
  for (const [directory, side] of sides) if (side.host === host) sides.delete(directory);
}

/** The Home for a platform to be given: what it reads of the Host is looked up on each call. */
export function pluginHomeFor(homeDirectory: string): PluginPlatformHome {
  const directory = path.resolve(homeDirectory);
  return { directory, completeText: () => sides.get(directory)?.options.completeText, stores: storesWithFixtures(sides.get(directory)?.options.pluginFixtures) };
}

/**
 * The Home's stores, and the library each test fixture of this Host is given registered as that fixture's own. Only a plain
 * name no one has registered is: one the Host, a module, a shipped plugin or an earlier fixture has stays theirs, and the
 * start list's check (`assertDatabaseEntries`) refuses the fixture with the reason.
 */
function storesWithFixtures(fixtures: HomeSideOptions["pluginFixtures"]): HomeStoreRegistry {
  const registry = homeStores(), own = new Map<string, HomeStore>();
  for (const fixture of [...fixtures?.project ?? [], ...fixtures?.home ?? []]) {
    if ("manifest" in fixture) continue;
    const name = fixture.database.store_name;
    if (registry.get(name) || own.has(name) || !PLUGIN_LIBRARY_NAME.test(name)) continue;
    own.set(name, { path: name, owner: fixture.definition.manifest.plugin_id, library: { baseline: fixture.database } });
  }
  return own.size ? homeStoreRegistry([...registry.stores, ...own.values()]) : registry;
}

/**
 * A plugin a Host is given for a test or a probe: a definition, or a definition with the library in the Home the Host gives it
 * (what a start-list entry does for a shipped plugin, `PluginPlatformEntry.database`; the definition itself declares none).
 */
export type PluginFixture = PluginDefinition | { readonly definition: PluginDefinition; readonly database: PluginDatabaseDeclaration };

/**
 * The test fixtures the Host bound to this Home was given, as start entries for a project's platform. Never `bundled`: a
 * fixture is not a plugin the Host ships, so it registers under its installation id and no shipped plugin's id.
 */
export function projectFixtureEntries(homeDirectory: string | undefined): PluginPlatformEntry[] {
  return pluginFixtureEntries(homeDirectory ? sides.get(path.resolve(homeDirectory))?.options.pluginFixtures?.project ?? [] : []);
}

/** The same Home's fixtures, for comparing the actual two start lists. */
export function homeFixtureEntries(homeDirectory: string): PluginPlatformEntry[] {
  return pluginFixtureEntries(sides.get(path.resolve(homeDirectory))?.options.pluginFixtures?.home ?? []);
}

/** Both scopes use the same unbundled, in-process fixture declarations. */
export function pluginFixtureEntries(fixtures: readonly PluginFixture[]): PluginPlatformEntry[] {
  return fixtures.map(fixture => {
    const { definition, database } = "manifest" in fixture ? { definition: fixture, database: undefined } : fixture;
    if (definition.execution === "sandbox") throw new Error(`夹具插件 ${definition.manifest.plugin_id} 是沙箱执行的；夹具是宿主自己运行的测试插件`);
    return { definition, ...(database ? { database } : {}) };
  });
}
