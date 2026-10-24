import assert from "node:assert/strict";
import { readdir, readFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import { prepareGitIndexCapability, prepareGitOperationCapability, readGitOperationsCapability, readGitResultsCapability,
  writerDirectoryCapabilities, writerIntegrationCapabilities } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";

/**
 * Built-in plugins reach the product one of two ways. Plugin Runtime plugins are
 * started by the supervisor in `apps/local-host/src/project-plugins.ts` and get
 * install records, upgrade checks, crash recovery and per-install private storage.
 * Build-time composed plugins are wired by hand: a `registerProvider(...)` line in
 * `project-host.ts` and an `<plugin>-native-plugin-http.ts` route file (the catalog entry is no hand step: each plugin's
 * `src/registration.ts` writes it and `builtin-plugins.ts` is generated). The second path is frozen: the lists below may
 * only shrink as plugins move to the Runtime (`skills/molis-plugin-dev/host.md`).
 *
 * The lists match the disk exactly, both ways: a name that is no longer there has to leave the list, and a plugin the
 * Runtime starts has to be on the Runtime list (specs/repository-anti-corruption W1-05). The numbers that cannot be gamed
 * by editing this file (plugin-named Host files, registerProvider lines, hybrid plugins, names of a plugin outside its
 * package) are compared with the merge-base by `pnpm health:check` (scripts/gates/assembly.mjs).
 */
const repoRoot = fileURLToPath(new URL("..", import.meta.url));

/** Started by `createPluginPlatform` in `project-plugins.ts`; the package name proves it. */
const RUNTIME_ASSEMBLED: ReadonlyMap<string, string> = new Map([
  ["schedule", "@molis-ai/molis-work-plugin-schedule"],
  ["shelf", "@molis-ai/molis-work-plugin-shelf"],
  ["coding", "@molis-ai/molis-work-plugin-coding"],
  ["files", "@molis-ai/molis-work-plugin-files"],
  ["git", "@molis-ai/molis-work-plugin-git"],
  ["diff", "@molis-ai/molis-work-plugin-diff"],
  ["text-stats", "@molis-ai/molis-work-plugin-text-stats"],
  ["form", "@molis-ai/molis-work-plugin-form"],
  ["dataset", "@molis-ai/molis-work-plugin-dataset"],
  ["lingguang", "@molis-ai/molis-work-plugin-lingguang"],
  ["pages", "@molis-ai/molis-work-plugin-pages"],
  ["ppt", "@molis-ai/molis-work-plugin-ppt"],
  ["workflows", "@molis-ai/molis-work-plugin-workflows"],
]);

const HOME_RUNTIME_ENTRIES = BUILTIN_PLUGIN_CATALOG.filter(entry => entry.runtime?.scope === "home");
const HOME_RUNTIME_IDS = new Set(HOME_RUNTIME_ENTRIES.map(entry => entry.project_plugin_id));

/** Frozen on 2026-09-30. Remove an id here once its plugin is started by the Runtime. */
const BUILD_TIME_ASSEMBLED: ReadonlySet<string> = new Set([
  "alchemist", "artifacts", "feed", "goals",
  "inbox", "plugin-builder",
]);

/** `apps/local-host/src/<name>-native-plugin-http.ts` files that exist today. */
const NATIVE_PLUGIN_HTTP_FILES: ReadonlySet<string> = new Set([
  "alchemist", "artifact", "feed", "inbox",
]);

test("every built-in catalog entry is either Runtime-assembled or on the frozen build-time list", () => {
  const unknown = BUILTIN_PLUGIN_CATALOG
    .map(entry => entry.project_plugin_id)
    .filter(id => !RUNTIME_ASSEMBLED.has(id) && !HOME_RUNTIME_IDS.has(id) && !BUILD_TIME_ASSEMBLED.has(id));
  assert.deepEqual(unknown, [],
    `New built-in plugins must be started by the Plugin Runtime (declare a Home Runtime factory, or add a project supervisor entry and list it in RUNTIME_ASSEMBLED). Not on the build-time list: ${unknown.join(", ")}`);
});

test("a plugin listed as Runtime-assembled really is started by the supervisor", async () => {
  const source = await readFile(join(repoRoot, "apps/local-host/src/project-plugins.ts"), "utf8");
  const catalogIds = new Set(BUILTIN_PLUGIN_CATALOG.map(entry => entry.project_plugin_id));
  for (const [id, packageName] of RUNTIME_ASSEMBLED) {
    assert.ok(catalogIds.has(id), `${id} is listed as Runtime-assembled but has no catalog entry`);
    assert.ok(source.includes(`"${packageName}"`), `${id} is listed as Runtime-assembled but project-plugins.ts does not start ${packageName}`);
  }
  const overlap = [...RUNTIME_ASSEMBLED.keys(), ...HOME_RUNTIME_IDS].filter(id => BUILD_TIME_ASSEMBLED.has(id));
  assert.deepEqual(overlap, [], "an id cannot be on both lists");
});

test("no new <plugin>-native-plugin-http.ts route file appears in the Host", async () => {
  const files = await readdir(join(repoRoot, "apps/local-host/src"));
  const names = files
    .filter(name => name.endsWith("-native-plugin-http.ts"))
    .map(name => name.slice(0, -"-native-plugin-http.ts".length));
  const added = names.filter(name => !NATIVE_PLUGIN_HTTP_FILES.has(name));
  assert.deepEqual(added, [],
    `Plugin HTTP belongs to the plugin's own Manifest routes (served under /api/plugins/<plugin_id>/), not a hand-written Host file: ${added.join(", ")}`);
});

const hostSourceFiles = async (): Promise<string[]> => {
  const out: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await readdir(join(repoRoot, dir), { withFileTypes: true })) {
      if (entry.isDirectory()) await walk(`${dir}/${entry.name}`);
      else if (entry.name.endsWith(".ts")) out.push(`${dir}/${entry.name}`);
    }
  };
  await walk("apps/local-host/src");
  return out.sort();
};

test("the frozen lists name exactly what exists: no id, route file or Runtime plugin is missing or left behind", async () => {
  const catalogIds = new Set(BUILTIN_PLUGIN_CATALOG.map(entry => entry.project_plugin_id as string));
  const listed = [...RUNTIME_ASSEMBLED.keys(), ...HOME_RUNTIME_IDS, ...BUILD_TIME_ASSEMBLED];
  assert.deepEqual(listed.filter(id => !catalogIds.has(id)), [],
    "an id on the Runtime or build-time list has no catalog entry any more; delete it from the list (the lists match the disk exactly)");

  const files = await readdir(join(repoRoot, "apps/local-host/src"));
  const onDisk = new Set(files.filter(name => name.endsWith("-native-plugin-http.ts")).map(name => name.slice(0, -"-native-plugin-http.ts".length)));
  assert.deepEqual([...NATIVE_PLUGIN_HTTP_FILES].filter(name => !onDisk.has(name)), [],
    "a <name>-native-plugin-http.ts route file was deleted or renamed; delete its name from NATIVE_PLUGIN_HTTP_FILES");

  // The supervisor entries in project-plugins.ts are the other half of the Runtime list.
  const supervisor = await readFile(join(repoRoot, "apps/local-host/src/project-plugins.ts"), "utf8");
  const started = new Set([...supervisor.matchAll(/"(@molis-ai\/molis-work-plugin-[a-z0-9-]+)",\s*"create[A-Za-z]+Plugin"/g)].map(match => match[1]));
  assert.deepEqual([...started].sort(), [...RUNTIME_ASSEMBLED.values()].sort(),
    "the plugins project-plugins.ts starts and RUNTIME_ASSEMBLED have to be the same set");
});

/**
 * Plugins that the Runtime starts and the Host ALSO assembles by hand: a `<plugin>-native-plugin-http.ts` route file, a
 * `<plugin>…ActionProvider` registered in project-host.ts, or Host files named after the plugin. A hybrid is neither the
 * Runtime shape (declarations only) nor the frozen build-time shape, and the name list above cannot see it. Frozen on
 * 2026-10-08; a plugin leaves this list when its Host code is gone, and none joins.
 * PG-036 C9: Coding left with coding-surface.ts. Its page and its Files/Git/Diff/Text stats companion stages are the plugins' own
 * contributions, which the Host draws through the generic stage channel (project-plugin-stages.ts).
 * W5-01-GIT-04: Git left with G5. What ran git for it in the Host is the platform's workspace Git service (workspace-git*.ts,
 * the projects.workspace.git.* and projects.workspace.writers.* actions only plugins call); the next test pins what is left.
 * RAC-70: Characters left with CHR-1: it is no plugin any more; its handlers are in modules/characters and its page is a section of
 * the Host's Settings.
 * Shelf left with S4: its actions, model calls and routes are the plugin's Runtime instances (S2, S3), and the demo puts its sample
 * back through `shelf.sample.seed` instead of opening Shelf's files in the Host.
 */
const HYBRID_RUNTIME_PLUGINS: ReadonlySet<string> = new Set<string>();

test("Runtime plugins that the Host also assembles by hand are named, and no plugin joins them", async () => {
  const sources = await hostSourceFiles();
  const projectHost = await readFile(join(repoRoot, "apps/local-host/src/project-host.ts"), "utf8");
  const camel = (name: string) => name.replace(/-([a-z0-9])/g, (_, letter: string) => letter.toUpperCase());
  const hybrid = [...RUNTIME_ASSEMBLED.keys()].filter(id => {
    const named = sources.some(file => {
      const base = file.slice(file.lastIndexOf("/") + 1);
      return base.startsWith(`${id}-`) || base === `${id}.ts`;
    });
    const registered = new RegExp(`registerProvider\\(\\s*${camel(id)}[A-Za-z]*Provider\\(`).test(projectHost);
    return named || registered;
  }).sort();
  assert.deepEqual(hybrid, [...HYBRID_RUNTIME_PLUGINS].sort(),
    `Runtime plugins with hand-written Host code. A new one joins nothing: put the code in the plugin package. One that is clean leaves HYBRID_RUNTIME_PLUGINS.`);
});

// Git's exit from the hybrid list (G5, privileges.md PG-035, PG-044, PG-061, PG-099): the Host runs git for plugins as the platform's
// workspace Git service and keeps no Git wiring of its own. The hybrid check above sees only file names and providers; these see the
// imports, the supervisor entry and the typed registry.
test("W5-01-GIT-01..03: the Host keeps no Git wiring of its own; its workspace Git service imports no plugin and registers actions only", async () => {
  const sources = await hostSourceFiles();
  const text = new Map(await Promise.all(sources.map(async file => [file, await readFile(join(repoRoot, file), "utf8")] as const)));
  // W5-01-GIT-01: only the supervisor starts Git; its companion stage in Coding's page is Git's own contribution (PG-036 C9).
  const importsGit = sources.filter(file => /["']@molis-ai\/molis-work-plugin-git["']/.test(text.get(file)!));
  assert.deepEqual(importsGit, ["apps/local-host/src/project-plugins.ts"],
    "a Host file imports the Git plugin; Git is started by the supervisor and reached through its declarations");
  const supervisor = text.get("apps/local-host/src/project-plugins.ts")!;
  assert.deepEqual([...supervisor.matchAll(/createGitPlugin\(([^)]*)\)/g)].map(match => match[1]), [""], "the supervisor starts Git with no Host ports");
  assert.match(supervisor, /"createGitPlugin",\s*factory => factory\(\)\)/, "and builds its release artifact the same way");
  assert.deepEqual(sources.filter(file => /\bgitPorts\b|observeGitOperations/.test(text.get(file)!)), [], "no Host-written Git port");
  // W5-01-GIT-02: the workspace Git service is the platform's, so it depends on no plugin package. The SDK, Runtime and sandbox
  // share the prefix but are the platform's own packages: the porcelain parse comes from the SDK, as it does for the Git plugin.
  const service = sources.filter(file => /\/workspace-git[a-z-]*\.ts$/.test(file));
  assert.ok(service.length >= 7, `the workspace Git service files are found: ${service.join(", ")}`);
  const platformPackages = new Set(["sdk", "runtime", "sandbox"]);
  assert.deepEqual(service.filter(file => [...text.get(file)!.matchAll(/["']@molis-ai\/molis-work-plugin-([a-z0-9-]+)/g)]
    .some(match => !platformPackages.has(match[1]!))), [], "a workspace Git file imports a plugin package");
  // W5-01-GIT-03: Git's and the parallel writers' Host side are plugin-only actions, none a typed capability.
  const home = await mkdtemp(join(tmpdir(), "git-host-wiring-")), host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  try {
    const registered = host.status().capabilities;
    assert.deepEqual(registered.filter(row => !row.action && /^projects\.workspace\.(git|writers)\./.test(row.capability_id)).map(row => row.capability_id), [],
      "a workspace Git entry is registered as a typed capability");
    for (const definition of [prepareGitIndexCapability, prepareGitOperationCapability, readGitOperationsCapability, readGitResultsCapability,
      ...Object.values(writerDirectoryCapabilities), ...Object.values(writerIntegrationCapabilities)]) {
      const row = registered.find(entry => entry.capability_id === definition.capability_id);
      assert.deepEqual(row?.action?.audiences, ["plugin"], `${definition.capability_id} is an action only plugins call`);
    }
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});

// RAC-44 (Cognia moved to a Home Runtime, specs/repository-anti-corruption): Cognia reaches the product only through its
// catalog entry's Home Runtime declaration and the public plugin contract; the old Host wiring is gone and none comes back.
// The hybrid check above reads the project supervisor's list only, so the Host side is asserted here for Cognia: no Host
// file named after it, no provider registered for it, no Host source that imports its package. That it really starts
// from the declaration is the next test.
test("RAC-44: the Host keeps no Cognia wiring of its own; Cognia is assembled only from its Home Runtime declaration", async () => {
  const runtime = BUILTIN_PLUGIN_CATALOG.find(entry => entry.project_plugin_id === "cognia")?.runtime;
  assert.ok(runtime, "Cognia's catalog entry declares a Home Runtime");
  assert.equal(runtime.scope, "home");
  assert.equal(runtime.package_name, "@molis-ai/molis-work-plugin-cognia");
  assert.ok(!BUILD_TIME_ASSEMBLED.has("cognia") && !NATIVE_PLUGIN_HTTP_FILES.has("cognia"));
  const sources = await hostSourceFiles();
  assert.deepEqual(sources.filter(file => file.slice(file.lastIndexOf("/") + 1).startsWith("cognia")), [], "no Host file is named after Cognia");
  const importing: string[] = [];
  for (const file of sources) if ((await readFile(join(repoRoot, file), "utf8")).includes("@molis-ai/molis-work-plugin-cognia")) importing.push(file);
  assert.deepEqual(importing, [], "no Host source imports the Cognia package; it is reached through the catalog and the Runtime");
  assert.doesNotMatch(await readFile(join(repoRoot, "apps/local-host/src/project-host.ts"), "utf8"), /registerProvider\(\s*cognia/i);
});

// A catalog declaration only counts as Runtime assembly when the real Home supervisor activates its exact factory.
test("Home Runtime declarations resolve shipped factories and start once without a project", async () => {
  const home = await mkdtemp(join(tmpdir(), "home-assembly-")), host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  try {
    const platform = await host.homePlugins!.ready();
    for (const entry of HOME_RUNTIME_ENTRIES) {
      const declaration = entry.runtime!;
      const module = await import(declaration.package_name);
      assert.equal(module[declaration.factory_export], declaration.create);
      assert.deepEqual(declaration.create().manifest, entry.manifest);
      assert.equal(platform.supervisor.state(entry.manifest.plugin_id)?.status, "running");
      assert.equal(host.homePlugins!.installations().filter(row => row.plugin_id === entry.manifest.plugin_id).length, 1);
    }
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});
