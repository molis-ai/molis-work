import path from "node:path";
import { closeAssistantService } from "./assistant/assistant-http.js";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { homeStoreRegistry, type HomeStore, type HomeStoreRegistry } from "@molis-ai/molis-work-storage";
import type { HostCompleteText } from "./host-complete-text.js";
import { homeStores } from "./home-stores.js";
import { HomeConsentLedger } from "./home-plugin-store.js";
import type { InProcessAdmission, PluginConsentLedger } from "@molis-ai/molis-work-plugin-runtime";
import { PLUGIN_LIBRARY_NAME } from "./plugin-database-entries.js";
import type { PluginOwnerFilesEntry } from "./plugin-owner-files-entries.js";
import type { PluginPlatformEntry } from "./plugin-platform.js";
import type { MolisWorkLocalHost, MolisWorkLocalHostOptions } from "./project-host.js";
import { ensureSystemAgentService, releaseSystemAgentService } from "./system-agent-service.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";

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
  /** What a person agreed to for the plugins of this Home, and the publishers they pinned (ac-trust): one answer for every project. */
  readonly consents: PluginConsentLedger;
}

type HomeSideOptions = Pick<MolisWorkLocalHostOptions, "completeText" | "pluginFixtures" | "workspaceFor" | "workspacesFor">;

/**
 * What each Home's Host was built with, by resolved path. A Home has one open Host at a time (its Agent service binds the
 * Home's inference once), so there is one entry per Home, and it leaves with its Host.
 */
const sides = new Map<string, { host: MolisWorkLocalHost; options: HomeSideOptions; catalog?: LocalWebCatalogRunner }>();

/** Project activations read the same catalog owner that settings commit to. */
export function bindPluginCatalog(host: MolisWorkLocalHost, home: string, catalog: LocalWebCatalogRunner): void {
  const side = sides.get(path.resolve(home));
  if (side?.host === host) side.catalog = catalog;
}

export function pluginCatalogFor(home: string): LocalWebCatalogRunner | undefined {
  return sides.get(path.resolve(home))?.catalog;
}

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
  closeAssistantService(host);
  releaseSystemAgentService(host);
  for (const [directory, side] of sides) if (side.host === host) sides.delete(directory);
}

/** The Home for a platform to be given: what it reads of the Host is looked up on each call. */
export function pluginHomeFor(homeDirectory: string): PluginPlatformHome {
  const directory = path.resolve(homeDirectory);
  return { directory, completeText: () => sides.get(directory)?.options.completeText, stores: storesWithFixtures(sides.get(directory)?.options.pluginFixtures),
    consents: new HomeConsentLedger(directory) };
}

/** The existing, single Agent runtime of this Home; never creates a second runtime for a plugin. */
export function pluginAgentRuntime(home: PluginPlatformHome) {
  const side = sides.get(home.directory);
  return side ? ensureSystemAgentService(side.host, home.directory) : undefined;
}

/**
 * The Home's stores, and the library each test fixture of this Host is given registered as that fixture's own. Only a plain
 * name no one has registered is: one the Host, a module, a shipped plugin or an earlier fixture has stays theirs, and the
 * start list's check (`assertDatabaseEntries`) refuses the fixture with the reason.
 */
export function storesWithFixtures(fixtures: HomeSideOptions["pluginFixtures"]): HomeStoreRegistry {
  const registry = homeStores(), own = new Map<string, HomeStore>();
  for (const fixture of [...fixtures?.project ?? [], ...fixtures?.home ?? []]) {
    const entry = "manifest" in fixture ? { definition: fixture } : fixture, database = entry.definition.manifest.databases?.home;
    const names = new Set([database?.store_name, entry.definition.manifest.owner_files?.store_name]);
    for (const name of names) {
      if (!name || registry.get(name) || own.has(name) || !PLUGIN_LIBRARY_NAME.test(name)) continue;
      own.set(name, { path: name, owner: entry.definition.manifest.plugin_id,
        ...(database?.store_name === name ? { library: { baseline: database, ...database.partition ? { partition: database.partition } : {} } } : {}) });
    }
  }
  return own.size ? homeStoreRegistry([...registry.stores, ...own.values()]) : registry;
}

/**
 * A plugin a Host is given for a test or a probe: a definition, or a definition with the half of a dual-instance plugin it is (what a
 * start-list entry does for a shipped plugin). Its library in the Home is the one its Manifest declares (`databases.home`).
 */
export type PluginFixture = PluginDefinition | PluginOwnerFilesEntry;

/**
 * The test fixtures the Host bound to this Home was given, as start entries for a project's platform. Never `host` trust: a
 * fixture is not a plugin the Host ships, so it registers under its installation id and no shipped plugin's id.
 */
export function projectFixtureEntries(homeDirectory: string | undefined): PluginPlatformEntry[] {
  return pluginFixtureEntries(fixtureDeclarationsFor(homeDirectory, "project"));
}

/** The same Home's fixtures, for comparing the actual two start lists. */
export function homeFixtureEntries(homeDirectory: string): PluginPlatformEntry[] {
  return pluginFixtureEntries(fixtureDeclarationsFor(homeDirectory, "home"));
}

/** Pure projection for cross-scope declaration checks; unrelated execution checks stay at the original startup entry. */
export function pluginFixtureDeclarations(fixtures: readonly PluginFixture[]): PluginPlatformEntry[] {
  return fixtures.map(fixture => "manifest" in fixture ? { definition: fixture } : { ...fixture });
}

/**
 * What a Host given test fixtures admits to its Runtimes' process without `host` trust (S-75 ⑥): the fixtures it starts, and the
 * definitions its test installs by hand (`pluginFixtures.installed`, a set the test fills before it installs). Objects, as given.
 */
export function fixtureAdmission(entries: readonly PluginPlatformEntry[], installed: ReadonlySet<PluginDefinition> | undefined): InProcessAdmission {
  const listed = new Set(entries.map(entry => entry.definition));
  return { admit: { has: definition => listed.has(definition) || installed?.has(definition) === true } };
}

/** The set of definitions the test Host bound to this Home was told it would install by hand. */
export function installedFixturesFor(homeDirectory: string | undefined): ReadonlySet<PluginDefinition> | undefined {
  return homeDirectory ? sides.get(path.resolve(homeDirectory))?.options.pluginFixtures?.installed : undefined;
}

export function fixtureDeclarationsFor(homeDirectory: string | undefined, scope: "home" | "project"): PluginPlatformEntry[] {
  return pluginFixtureDeclarations(homeDirectory ? sides.get(path.resolve(homeDirectory))?.options.pluginFixtures?.[scope] ?? [] : []);
}

/** Both scopes use the same in-process fixture, without `host` trust, declarations. */
export function pluginFixtureEntries(fixtures: readonly PluginFixture[]): PluginPlatformEntry[] {
  return pluginFixtureDeclarations(fixtures).map(entry => {
    const { definition } = entry;
    if (definition.execution === "sandbox") throw new Error(`夹具插件 ${definition.manifest.plugin_id} 是沙箱执行的；夹具是宿主自己运行的测试插件`);
    return { ...entry };
  });
}
