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
