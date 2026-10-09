import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";

/**
 * Built-in plugins reach the product one of two ways. Plugin Runtime plugins are
 * started by the supervisor in `apps/local-host/src/project-plugins.ts` and get
 * install records, upgrade checks, crash recovery and per-install private storage.
 * Build-time composed plugins are wired by hand: a `registerProvider(...)` line in
 * `project-host.ts`, an `<plugin>-native-plugin-http.ts` route file, and a
 * `builtin-plugins.ts` catalog entry. The second path is frozen: the lists below may
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
  ["characters", "@molis-ai/molis-work-plugin-characters"],
  ["shelf", "@molis-ai/molis-work-plugin-shelf"],
  ["coding", "@molis-ai/molis-work-plugin-coding"],
  ["files", "@molis-ai/molis-work-plugin-files"],
  ["git", "@molis-ai/molis-work-plugin-git"],
  ["diff", "@molis-ai/molis-work-plugin-diff"],
  ["text-stats", "@molis-ai/molis-work-plugin-text-stats"],
]);

/** Frozen on 2026-09-30. Remove an id here once its plugin is started by the Runtime. */
const BUILD_TIME_ASSEMBLED: ReadonlySet<string> = new Set([
  "alchemist", "artifacts", "cognia", "dataset", "experiments", "feed", "form", "goals", "images",
  "inbox", "jelly", "lingguang", "pages", "plugin-builder", "ppt", "schedule", "sessions", "workflows",
  // PR #98 (system assistant) adds Todo on the build-time path; listed so it can land, then migrate.
  "todo",
]);

/** `apps/local-host/src/<name>-native-plugin-http.ts` files that exist today, plus Todo from PR #98. */
const NATIVE_PLUGIN_HTTP_FILES: ReadonlySet<string> = new Set([
  "alchemist", "artifact", "cognia", "dataset", "experiments", "feed", "form", "images", "inbox", "jelly",
  "lingguang", "pages", "personal", "ppt", "schedule", "shelf", "todo", "workflows",
]);

test("every built-in catalog entry is either Runtime-assembled or on the frozen build-time list", () => {
  const unknown = BUILTIN_PLUGIN_CATALOG
    .map(entry => entry.project_plugin_id)
    .filter(id => !RUNTIME_ASSEMBLED.has(id) && !BUILD_TIME_ASSEMBLED.has(id));
  assert.deepEqual(unknown, [],
    `New built-in plugins must be started by the Plugin Runtime (add a supervisor entry in apps/local-host/src/project-plugins.ts and list the id in RUNTIME_ASSEMBLED). Not on the build-time list: ${unknown.join(", ")}`);
});

test("a plugin listed as Runtime-assembled really is started by the supervisor", async () => {
  const source = await readFile(join(repoRoot, "apps/local-host/src/project-plugins.ts"), "utf8");
  const catalogIds = new Set(BUILTIN_PLUGIN_CATALOG.map(entry => entry.project_plugin_id));
  for (const [id, packageName] of RUNTIME_ASSEMBLED) {
    assert.ok(catalogIds.has(id), `${id} is listed as Runtime-assembled but has no catalog entry`);
    assert.ok(source.includes(`"${packageName}"`), `${id} is listed as Runtime-assembled but project-plugins.ts does not start ${packageName}`);
  }
  const overlap = [...RUNTIME_ASSEMBLED.keys()].filter(id => BUILD_TIME_ASSEMBLED.has(id));
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
const stemsOf = (id: string): string[] => [id, ...(id === "characters" ? ["character"] : [])];

test("the frozen lists name exactly what exists: no id, route file or Runtime plugin is missing or left behind", async () => {
  const catalogIds = new Set(BUILTIN_PLUGIN_CATALOG.map(entry => entry.project_plugin_id as string));
  const listed = [...RUNTIME_ASSEMBLED.keys(), ...BUILD_TIME_ASSEMBLED];
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
 *  - shelf: shelf-native-plugin-http.ts, shelf-actions.ts, shelf-ai.ts, and shelfActionProvider / shelfProjectActionProvider
 *  - characters: characters-host.ts and character-*.ts. Decision 26 (2026-10-08): Characters is no longer a Runtime plugin
 *    long-term; its code merges into the Host or a Module and its interface stays a section of Settings (a wave 4 slice)
 *  - coding, git: the workspace surface adapters in the Host (coding-*.ts, git-*.ts), the part R-03 asks to move behind
 *    declarations
 */
const HYBRID_RUNTIME_PLUGINS: ReadonlySet<string> = new Set(["characters", "coding", "git", "shelf"]);

test("Runtime plugins that the Host also assembles by hand are named, and no plugin joins them", async () => {
  const sources = await hostSourceFiles();
  const projectHost = await readFile(join(repoRoot, "apps/local-host/src/project-host.ts"), "utf8");
  const camel = (name: string) => name.replace(/-([a-z0-9])/g, (_, letter: string) => letter.toUpperCase());
  const hybrid = [...RUNTIME_ASSEMBLED.keys()].filter(id => {
    const stems = stemsOf(id);
    const named = sources.some(file => {
      const base = file.slice(file.lastIndexOf("/") + 1);
      return stems.some(stem => base.startsWith(`${stem}-`) || base === `${stem}.ts`);
    });
    const registered = stems.some(stem => new RegExp(`registerProvider\\(\\s*${camel(stem)}[A-Za-z]*Provider\\(`).test(projectHost));
    return named || registered;
  }).sort();
  assert.deepEqual(hybrid, [...HYBRID_RUNTIME_PLUGINS].sort(),
    `Runtime plugins with hand-written Host code. A new one joins nothing: put the code in the plugin package. One that is clean leaves HYBRID_RUNTIME_PLUGINS.`);
});
