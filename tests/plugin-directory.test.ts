// W5-06 remainder, slice 2 (BL-388, BL-542): the shell is drawn from the declarations of the plugins the Runtimes run in the project, one
// shape for a built-in and for a plugin installed at run time; what such a plugin declares is text from its publisher and is written
// into the page escaped.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { UI_VIEW_GROUPS } from "@molis-ai/molis-work-contracts/platform/ui";
import {
  DEMO_PROJECT_ID, GoalProjectApplication, LocalProjectDatabase, ensureProjectPlugins, mergePluginDirectories, openProjectVersionStores, releaseProjectPlugins, runningPluginDirectory, seedDemoBoard,
} from "@molis-ai/molis-work-app-local-host";
import {
  BUILTIN_PLUGIN_CATALOG, CLIENT_SCRIPT, PERSONAL_PLUGIN_IDS, PROJECT_SCOPED_PLUGIN_IDS, builtinPluginDirectory, clientPluginDirectory, creatableKinds, homeStarts,
  pluginDirectoryFor, sanitizePluginDirectory, scriptJson, type PluginDirectoryEntry,
} from "@molis-ai/molis-work-app-workbench";
import { pluginActions } from "./fixtures/plugin-actions.js";
import { buildMolisWorkWebView } from "./fixtures/web-view.js";
import { renderMolisWorkWeb, type MolisWorkWebView } from "./workbench-renderer-fixture.js";

const HOSTILE = "</script><img src=x onerror=alert(1)>&\u2028tail";
const EVERYTHING = [...PROJECT_SCOPED_PLUGIN_IDS, ...PERSONAL_PLUGIN_IDS];
const PROJECT = "project-plugin-directory";

/** A plugin that runs in the project without the project choosing it, as the Host reports it. */
function installed(id: string, over: Partial<PluginDirectoryEntry["ui"]["views"][number]> = {}, name = "Notes"): PluginDirectoryEntry {
  return { id, plugin_id: `io.molis.work.example.${id}`, name, chosen: false,
    ui: { views: [{ view_id: "main", slot: "navigator", title: name, icon: "note", ...over }] } };
}

function view(directory?: readonly PluginDirectoryEntry[]): MolisWorkWebView {
  return {
    snapshot: {
      board: { project_id: PROJECT, title: "Directory", active_goal_id: null, created_at: "2026-10-25T00:00:00.000Z", updated_at: "2026-10-25T00:00:00.000Z" },
      cursor: 0, goals: [], relations: [], goal_tree_proposals: [], planning_method_packs: [],
    },
    project: { project_id: PROJECT, display_name: "Directory" },
    projects: [{ project_id: PROJECT, display_name: "Directory" }],
    route_prefix: `/projects/${PROJECT}`,
    demo: false, active_goal_id: null, goals: [], archived_goals: [], trashed_goals: [], counts: {},
    input_bindings: [], policy_bindings: [], events: [],
    feed: { sources: [], feed_items: [], inbox_entries: [], runs: [], out_rules: [] },
    enabled_plugins: [...EVERYTHING],
    ...(directory ? { plugin_directory: directory } : {}),
  } as MolisWorkWebView;
}

/** The Demo project's view with a Goal, so the Goal's own page (its 「为这个 Goal 新建」 buttons) is drawn, and the directory laid over it. */
function withGoal<T>(directory: readonly PluginDirectoryEntry[], run: (render: () => string) => T): T {
  const folder = mkdtempSync(join(tmpdir(), "molis-work-directory-goal-"));
  const databasePath = join(folder, "demo.db");
  seedDemoBoard(databasePath);
  const store = new LocalProjectDatabase(databasePath);
  try {
    const base = buildMolisWorkWebView(store, new GoalProjectApplication(store), { databasePath, projectId: DEMO_PROJECT_ID, demo: true });
    const shown = { ...base, enabled_plugins: [...EVERYTHING], hidden_plugins: [], plugin_directory: directory } as MolisWorkWebView;
    return run(() => renderMolisWorkWeb(shown, base.goals[0]!.goal.goal_id));
  } finally { store.close(); rmSync(folder, { recursive: true, force: true }); }
}

const unescape = (value: string) => value.replaceAll("&quot;", '"').replaceAll("&#39;", "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
const directoryData = (html: string) => /<script type="application\/json" data-plugin-directory>([^]*?)<\/script>/u.exec(html)![1]!;
const homeStartList = (html: string) => JSON.parse(unescape(/data-work-surface="home" data-home-starts="([^"]*)"/u.exec(html)![1]!)) as Array<{ id: string; title: string; hint: string; glyph: string }>;
const createButtons = (html: string) => [...html.matchAll(/data-placement-create="([^"]*)" data-placement-create-title="([^"]*)"/gu)].map(([, station, title]) => ({ station, title: unescape(title!) }));

/** The rail's headings, top to bottom, each with the plugin tiles under it. */
function railSections(html: string): Array<{ heading: string; tiles: string[] }> {
  const start = html.indexOf('class="plugin-rail-items"');
  assert.ok(start >= 0, "the page has a rail");
  const items = html.slice(start, html.indexOf("data-rail-tools-toggle", start));
  return items.split(/<p class="plugin-rail-(?:group|subgroup)"[^>]*>/).slice(1).map(part => ({
    heading: part.slice(0, part.indexOf("</p>")),
    tiles: [...part.matchAll(/data-plugin-tile="([^"]+)"/g)].map(match => match[1]!),
  }));
}
const headingOf = (html: string, id: string) => railSections(html).find(section => section.tiles.includes(id))?.heading;

test("RAC-605 a plugin's name and declared texts come out escaped, and the directory data cannot end its script element", () => {
  const hostile = installed("evil", {
    title: HOSTILE, icon: "https://evil.example/x.svg", group: "make", accepts_objects: true,
    creates: { station: "notes", title: HOSTILE },
    start: { title: HOSTILE, hint: `${HOSTILE} hint`, icon: "<svg onload=x>" },
  }, HOSTILE);
  const html = renderMolisWorkWeb(view([hostile]));
  const data = directoryData(html);
  assert.doesNotMatch(data, /[<>&\u2028\u2029]/u, "no bare `<`, `>`, `&`, U+2028 or U+2029 in the data element");
  assert.match(data, /\\u003c\/script\\u003e\\u003cimg src=x onerror=alert\(1\)\\u003e\\u0026\\u2028tail/u);
  const parsed = JSON.parse(data) as Array<{ id: string; name: string; accepts_objects: boolean }>;
  assert.deepEqual(parsed.find(entry => entry.id === "evil"), { id: "evil", name: HOSTILE, accepts_objects: true }, "the script reads the text as it was written");
  // Nothing the plugin wrote is markup in the page: its tag is text, its icon names no artwork.
  assert.doesNotMatch(html, /<img\b[^>]*src=x/u);
  assert.doesNotMatch(html, /<svg onload/u);
  assert.doesNotMatch(html, /evil\.example/u);
  assert.match(html, /&lt;\/script&gt;&lt;img src=x onerror=alert\(1\)&gt;&amp;/u, "the interface shows the text as it was written");
  const startsOnPage = homeStartList(html).find(start => start.id === "evil");
  assert.equal(startsOnPage?.title, HOSTILE);
  assert.equal(startsOnPage?.glyph, "package", "an icon the design system does not know is the default icon, never a URL or markup");
  // The one place text becomes script JSON escapes every case.
  assert.equal(scriptJson({ text: "a</script>&\u2028\u2029" }), '{"text":"a\\u003c/script\\u003e\\u0026\\u2028\\u2029"}');
});

test("RAC-605 what is taken into the directory is held to plain keys, one line of text and the icons the design system has", () => {
  const entries = sanitizePluginDirectory([
    installed('has"quote'), installed("ok", { icon: "package" }), installed("bad-icon", { icon: "javascript:alert(1)" }),
    { ...installed("odd-view"), ui: { views: [{ view_id: "x y", slot: "navigator", title: "Odd" }, { view_id: "main", slot: "nowhere" as never, title: "Odd" }, { view_id: "okay", slot: "stage", title: "Odd" }] } },
    installed("ok", {}, "same key twice"), installed("long", {}, "n".repeat(500)),
    installed("group", { group: "elsewhere" as never }),
  ]);
  assert.deepEqual(entries.map(entry => entry.id), ["ok", "bad-icon", "odd-view", "long", "group"], "a key outside the plain pattern, and a repeated key, are dropped");
  assert.equal(entries.find(entry => entry.id === "bad-icon")!.ui.views[0]!.icon, undefined);
  assert.deepEqual(entries.find(entry => entry.id === "odd-view")!.ui.views.map(declared => declared.view_id), ["okay"], "a view the Host does not define is dropped");
  assert.equal(entries.find(entry => entry.id === "long")!.name.length, 80);
  assert.equal(entries.find(entry => entry.id === "group")!.ui.views[0]!.group, undefined);
});

test("RAC-605 the Host reads the directory from the Manifests the project's Runtime runs, built-in and installed alike", async () => {
  const home = mkdtempSync(join(tmpdir(), "plugin-directory-"));
  const database = join(home, "project.db");
  seedDemoBoard(database);
  const store = new LocalProjectDatabase(database);
  const ports = { store, ...openProjectVersionStores(store), projectId: DEMO_PROJECT_ID, actorId: "web-user", actions: pluginActions(store, DEMO_PROJECT_ID),
    escapeHtml: String, translate: (value: string) => value };
  const pluginId = "io.molis.work.example.directory-fixture";
  const definition = (name: string): PluginDefinition => ({
    manifest: { schema_version: 2, host_api_version: 2, plugin_id: pluginId, version: "1.0.0", name, kind: "app",
      publisher: { publisher_id: "example", signature: "plugin-directory" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
      permissions: [], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] },
      ui: { contributions: [`${pluginId}.main`], views: [{ view_id: "main", slot: "navigator", title: name, icon: "note", group: "make", accepts_objects: true,
        start: { title: "写一条笔记", hint: "先写下来。" } }] } },
    async start() {
      return { kind: "app", views: [{ descriptor: { contribution_id: `${pluginId}.main`, plugin_id: pluginId, kind: "primary-page" as const, label: "Directory fixture", slots: [] },
        render: () => "<section data-work-surface=\"directory-fixture\"></section>" }] };
    },
  });
  try {
    const { platform } = await ensureProjectPlugins(ports);
    assert.ok(platform);
    const report = await platform.start([{ definition: definition("Directory fixture") }]);
    assert.ok(report.running.includes(pluginId), JSON.stringify(report));
    const running = runningPluginDirectory(platform.supervisor);
    const files = running.find(entry => entry.id === "files")!;
    assert.equal(files.chosen, true, "a built-in is chosen by the project's plugin list, under the project key the catalog gives it");
    assert.deepEqual(files.ui.views, BUILTIN_PLUGIN_CATALOG.find(entry => entry.project_plugin_id === "files")!.manifest.ui.views, "it declares what its Manifest declares");
    const fixture = running.find(entry => entry.plugin_id === pluginId)!;
    assert.deepEqual([fixture.id, fixture.chosen, fixture.name], [pluginId, false, "Directory fixture"], "an installed plugin has the same shape, keyed by its Manifest id");
    // The directory the shell is given keeps every built-in's rail declarations whole once taken in.
    const taken = pluginDirectoryFor(running);
    assert.deepEqual(creatableKinds(EVERYTHING, taken), creatableKinds(EVERYTHING), "creates survive being taken in");
    assert.deepEqual(homeStarts(EVERYTHING, taken).filter(start => start.id !== pluginId), homeStarts(EVERYTHING), "starts survive being taken in");
    // RAC-609: a plugin turned off leaves the directory at the next read.
    platform.supervisor.revoke(pluginId);
    assert.equal(runningPluginDirectory(platform.supervisor).some(entry => entry.plugin_id === pluginId), false, "turned off, it has no entry");
    assert.ok(runningPluginDirectory(platform.supervisor).some(entry => entry.id === "files"), "the others stay");
  } finally {
    await releaseProjectPlugins(store, DEMO_PROJECT_ID);
    store.close();
    rmSync(home, { recursive: true, force: true });
  }
});

test("RAC-606 the page carries the directory for its scripts: a plugin that declares accepts_objects opens as a tab, and the script lists none", () => {
  const html = renderMolisWorkWeb(view([installed("notes", { accepts_objects: true }), installed("plain")]));
  const parsed = JSON.parse(directoryData(html)) as Array<{ id: string; accepts_objects: boolean }>;
  assert.deepEqual(parsed.filter(entry => entry.accepts_objects).map(entry => entry.id).includes("notes"), true);
  assert.equal(parsed.find(entry => entry.id === "plain")?.accepts_objects, false);
  assert.equal(parsed.find(entry => entry.id === "pages")?.accepts_objects, true, "a built-in the Host did not list is the market's, read the same way");
  assert.deepEqual(clientPluginDirectory(builtinPluginDirectory()).map(entry => entry.id), BUILTIN_PLUGIN_CATALOG.map(entry => entry.project_plugin_id));
  assert.match(CLIENT_SCRIPT, /script\[data-plugin-directory\]/u);
  assert.doesNotMatch(CLIENT_SCRIPT, /\["artifacts",\s*"/u);
});

test("RAC-607 the rail lists an installed plugin under the group its view names, the one that names none under 更多", () => {
  const html = renderMolisWorkWeb(view([installed("makes", { group: "make" }, "Makes"), installed("plain", {}, "Plain")]));
  const sections = railSections(html);
  assert.deepEqual(sections.map(section => section.heading), [...["推进", "写与做", "个人", "研究", "编码"].slice(0, UI_VIEW_GROUPS.length), "更多"]);
  assert.equal(headingOf(html, "makes"), "写与做");
  assert.equal(headingOf(html, "plain"), "更多");
  assert.match(html, /data-plugin-tile="makes"[^>]*>[^]*?data-plugin-id="makes"/u, "it opens its own surface");
  assert.doesNotMatch(html, /data-plugin-toggle="makes"/u, "taking it out is not this list's");
  assert.deepEqual(railSections(renderMolisWorkWeb(view([installed("order-a", { order: 5 }), installed("order-b", { order: 1 })]))).find(s => s.heading === "更多")!.tiles.slice(0, 2),
    ["order-b", "order-a"], "order is the declared order");
});

test("RAC-608 creatableKinds and homeStarts read an installed plugin like a built-in one, and the Goal's page writes its declared texts escaped", () => {
  const notes = installed("notes", { creates: { station: "notes", title: "笔记" }, start: { title: "写一条笔记", hint: "先写下来。" } });
  const directory = pluginDirectoryFor([notes]);
  assert.deepEqual(creatableKinds(["goals"], directory).map(kind => [kind.id, kind.station, kind.title]), [["notes", "notes", "笔记"]]);
  assert.deepEqual(homeStarts(["goals"], directory).filter(start => start.id === "notes").map(start => [start.title, start.hint, start.glyph]), [["写一条笔记", "先写下来。", "note"]]);
  withGoal([notes], render => {
    const html = render();
    assert.ok(createButtons(html).some(button => button.station === "notes" && button.title === "笔记"), "the Goal's new buttons take it in");
    assert.ok(homeStartList(html).some(start => start.id === "notes"));
  });
  const hostile = installed("evil", { creates: { station: "notes", title: HOSTILE }, start: { title: HOSTILE, hint: HOSTILE } }, "Evil");
  withGoal([hostile], render => {
    const html = render();
    assert.deepEqual(createButtons(html).find(button => button.station === "notes")?.title, HOSTILE.slice(0, 40), "the button reads the text as it was written, cut to the 40 characters a kind's name may have");
    assert.doesNotMatch(html, /<img\b[^>]*src=x/u, "and it is text, not markup");
  });
});

test("RAC-609 a plugin not in the directory has no entry in the page; a built-in none runs stays one to add", () => {
  const html = renderMolisWorkWeb(view([]));
  assert.doesNotMatch(html, /data-plugin-tile="notes"/u);
  assert.doesNotMatch(directoryData(html), /"notes"/u);
  const without = renderMolisWorkWeb(view([installed("notes", { group: "make" })]));
  assert.equal(headingOf(without, "notes"), "写与做");
  const gone = renderMolisWorkWeb(view(mergePluginDirectories([])));
  assert.equal(headingOf(gone, "notes"), undefined, "the next read, with the plugin off, has no entry for it");
  // A built-in the Runtime does not run is the market's declaration, so it can be added again.
  assert.ok(headingOf(renderMolisWorkWeb(view([])), "pages"), "pages is listed from the market when nothing runs it");
});
