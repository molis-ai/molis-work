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
  DEMO_PROJECT_ID, LocalProjectDatabase, createPluginPlatform, ensureProjectPlugins, mergePluginDirectories, openProjectVersionStores, releaseProjectPlugins, runningPluginDirectory, seedDemoBoard, seedDemoGoals, PERSONAL_PLUGIN_IDS, PROJECT_SCOPED_PLUGIN_IDS,
} from "@molis-ai/molis-work-app-local-host";
import {
  BUILTIN_PLUGIN_CATALOG, CLIENT_SCRIPT, builtinPluginDirectory, clientPluginDirectory, creatableKinds, homeStarts,
  islandEntries, pluginDirectoryFor, railEntries, renderPluginDirectoryData, sanitizePluginDirectory, scriptJson, settingsEntries, type PluginDirectoryEntry,
} from "@molis-ai/molis-work-app-workbench";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { defineWorkflowContentActions } from "@molis-ai/molis-work-plugin-sdk";
import { GoalProjectApplication } from "./fixtures/goal-application.js";
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
async function withGoal<T>(directory: readonly PluginDirectoryEntry[], run: (render: () => string) => T): Promise<T> {
  const folder = mkdtempSync(join(tmpdir(), "molis-work-directory-goal-"));
  const databasePath = join(folder, "demo.db");
  let store: LocalProjectDatabase | undefined;
  try {
    await seedDemoGoals(databasePath);
    store = new LocalProjectDatabase(databasePath);
    const base = buildMolisWorkWebView(store, new GoalProjectApplication(store), { databasePath, projectId: DEMO_PROJECT_ID, demo: true });
    const shown = { ...base, enabled_plugins: [...EVERYTHING], hidden_plugins: [], plugin_directory: directory } as MolisWorkWebView;
    return await run(() => renderMolisWorkWeb(shown, base.goals[0]!.goal.goal_id));
  } finally { store?.close(); rmSync(folder, { recursive: true, force: true }); }
}

const unescape = (value: string) => value.replaceAll("&quot;", '"').replace(/&#0?39;/gu, "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
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
  // RAC-605-CLIENT-02: untrusted text still exercises the existing serializer after names leave the client projection.
  assert.match(scriptJson({ text: HOSTILE }), /\\u003c\/script\\u003e\\u003cimg src=x onerror=alert\(1\)\\u003e\\u0026\\u2028tail/u);
  const parsed = JSON.parse(data) as Array<{ id: string; accepts_objects: boolean }>;
  assert.deepEqual(parsed.find(entry => entry.id === "evil"), { id: "evil", accepts_objects: true, hue: null }, "the client receives its routing fields without the unconsumed name");
  assert.deepEqual(clientPluginDirectory([hostile]), [{ id: "evil", accepts_objects: true, hue: null }], "the direct projection also omits the display name");
  // Nothing the plugin wrote is markup in the page: its tag is text, its icon names no artwork.
  assert.doesNotMatch(html, /<img\b[^>]*src=x/u);
  assert.doesNotMatch(html, /<svg onload/u);
  assert.doesNotMatch(html, /evil\.example/u);
  assert.match(html, /&lt;\/script&gt;&lt;img src=x onerror=alert\(1\)&gt;&amp;/u, "the interface shows the text as it was written");
  assert.equal(railEntries(EVERYTHING, pluginDirectoryFor([hostile])).find(entry => entry.id === "evil")?.label, HOSTILE, "the server still keeps the rail's declared display text");
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

test("RAC-605-KEY-01 a Runtime publisher sharing a built-in Manifest id is refused to start (S-75) and its place keeps its own shell key and views and leaves the market entry intact", async () => {
  const folder = mkdtempSync(join(tmpdir(), "directory-publisher-")), database = join(folder, "project.db");
  seedDemoBoard(database); const store = new LocalProjectDatabase(database);
  const ports = { db: store.db, appendEvent: (event: Parameters<typeof store.appendEvent>[0]) => store.appendEvent(event), eventCursor: (id: string) => store.eventCursor(id) };
  const platform = createPluginPlatform({ db: store.db, project_id: DEMO_PROJECT_ID, actor_id: "tester", actions: pluginActions(store, DEMO_PROJECT_ID),
    artifacts: new ArtifactsModule(ports), processItems: new ProcessItemsModule(ports), ui: new UiHost(), home: null,
    privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }) });
  const builtin = BUILTIN_PLUGIN_CATALOG.find(entry => entry.project_plugin_id === "pages")!;
  const pluginId = builtin.manifest.plugin_id;
  const station = defineWorkflowContentActions({ id: "publisher-notes", title: "Other notes", icon: "note", subject_kind: "note", read_permissions: [], write_permissions: [], create: true });
  const stationActions = [station.list, station.read, station.receive, station.create];
  const definition: PluginDefinition = {
    manifest: { schema_version: 2, host_api_version: 2, plugin_id: pluginId, version: "1.0.0", name: "Other publisher", kind: "app",
      publisher: { publisher_id: "directory-fixture", signature: "different-publisher-signature" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
      permissions: [], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, actions: stationActions,
      ui: { contributions: [`${pluginId}.main`], views: [{ view_id: "main", slot: "navigator", title: "Other publisher", icon: "note", group: "make",
        creates: { station: "publisher-notes", title: "Other note" }, start: { title: "Start other publisher", hint: "Keep this publisher's surface" } }] } },
    async start() { return { kind: "app", actions: stationActions.map(action => ({ ...action, handle: () => assert.fail("Reading the directory must not invoke business actions") })),
      views: [{ descriptor: { contribution_id: `${pluginId}.main`, kind: "primary-page", label: "Other publisher", slots: [] }, render: () => "<section>Other publisher</section>" }] }; },
  };
  try {
    assert.notEqual(definition.manifest.publisher.signature, builtin.manifest.publisher.signature);
    // S-75: the Host's build owns its plugin ids, so the publisher's start is refused; a start that failed keeps its place in the directory.
    const report = await platform.start([{ definition }]);
    assert.deepEqual(report.failed.map(entry => [entry.plugin_id, entry.code]), [[pluginId, "plugin.id_namespace_conflict"]]);
    assert.deepEqual(report.blocked, []); assert.deepEqual(report.running, []);
    const running = runningPluginDirectory(platform.supervisor);
    assert.deepEqual(running.map(entry => [entry.id, entry.plugin_id, entry.chosen]), [[pluginId, pluginId, false]], "the real Host directory does not grant the built-in key or trust to a different publisher");
    assert.equal(running[0]!.personal, undefined); assert.equal(running[0]!.always_on, undefined);
    const directory = pluginDirectoryFor(running), market = builtinPluginDirectory().find(entry => entry.id === "pages")!;
    assert.deepEqual(directory.find(entry => entry.id === "pages"), market, "a different Runtime key does not remove the not-running built-in market entry");
    const rail = railEntries(["pages"], directory);
    assert.deepEqual(rail.filter(entry => entry.label === "Other publisher").map(entry => [entry.id, entry.surface, entry.chosen]), [[pluginId, pluginId, false]]);
    assert.deepEqual(creatableKinds(["pages"], directory).filter(entry => entry.station === "publisher-notes"), [{ id: pluginId, plugin_id: pluginId, station: "publisher-notes", title: "Other note" }]);
    const start = { id: pluginId, plugin_id: pluginId, title: "Start other publisher", hint: "Keep this publisher's surface", glyph: "note" };
    assert.deepEqual(homeStarts(["pages"], directory).find(entry => entry.title === start.title), start);
    const html = renderMolisWorkWeb({ ...view(running), enabled_plugins: ["pages"] });
    assert.ok(html.includes(`data-plugin-tile="${pluginId}"`), "the actual rail points to this publisher's shell surface");
    assert.equal(html.includes(`data-plugin-toggle="${pluginId}"`), false, "sharing a Manifest id does not turn it into a built-in project choice");
    assert.equal(headingOf(html, pluginId), "写与做");
    const { plugin_id: _drawnIn, ...pageStart } = start; // the page's start data carries the words already applied, not the plugin that supplied them
    assert.deepEqual(homeStartList(html).find(entry => entry.title === start.title), pageStart, "the real page's start data keeps the same owner key");
  } finally {
    await platform.closeCoordination();
    for (const record of platform.runtime.list()) if (record.state === "running") await platform.runtime.stop(record.install_id);
    store.close(); rmSync(folder, { recursive: true, force: true });
  }
});

test("RAC-605-KEY-02 equal Manifest ids retain each entry's slots, chosen state, view identity and the original ordering", () => {
  const pluginId = "io.molis.work.example.shared";
  const entry = (id: string, chosen: boolean, order: number): PluginDirectoryEntry => ({ id, plugin_id: pluginId, name: id, chosen, ui: { views: [
    { view_id: "main", slot: "navigator", title: `${id} nav`, order },
    { view_id: "island", slot: "island", title: `${id} island`, order },
    { view_id: "details", slot: "side", title: `${id} details`, order },
    { view_id: "preferences", slot: "settings", title: `${id} settings`, order },
  ] } });
  const alpha = entry("alpha", false, 4), beta = entry("beta", true, 2);
  const stage: PluginDirectoryEntry = { id: "stage-runtime", plugin_id: pluginId, name: "Stage runtime", chosen: false,
    ui: { views: [{ view_id: "main", slot: "stage", title: "Stage view", order: 0 }] } };
  const other = installed("other", { order: 3 });
  const directory = pluginDirectoryFor([alpha, stage, other, beta]);
  const rail = railEntries(["beta"], directory);
  assert.deepEqual(rail.map(item => [item.id, item.label, item.chosen]), [["beta", "beta nav", true], ["other", "Notes", false], ["alpha", "alpha nav", false], ["stage-runtime", "Stage runtime", false]]);
  assert.deepEqual(railEntries([], directory).map(item => item.id), ["other", "alpha", "stage-runtime"], "only chosen entries need membership; other running entries still open their own stage");
  assert.deepEqual(islandEntries(["beta"], directory).map(item => [item.id, item.label]), [["beta", "beta island"], ["alpha", "alpha island"]]);
  assert.deepEqual(settingsEntries(["beta"], directory).map(item => [item.plugin_title, item.plugin_id, item.view_id, item.contribution_id]),
    [["beta", pluginId, "preferences", `${pluginId}.preferences`], ["alpha", pluginId, "preferences", `${pluginId}.preferences`]], "shell keys do not rewrite Manifest or contribution identity");
  const tie = pluginDirectoryFor([entry("z-first", false, 1), entry("a-second", false, 1)]);
  assert.deepEqual(railEntries([], tie).map(item => item.id), ["z-first", "a-second"], "equal order, Manifest id and view id retain declaration order, rather than sorting by shell key");
  const copied: PluginDirectoryEntry = { ...entry("copied-runtime", false, 1), name: "Same name", ui: { views: [{ view_id: "main", slot: "navigator", title: "Same title", order: 1 }] } };
  assert.deepEqual(railEntries(["copied-market"], pluginDirectoryFor([copied, { ...copied, id: "copied-market", chosen: true }])).map(item => item.id),
    ["copied-runtime", "copied-market"], "identical untrusted names and view declarations still belong to their own shell keys");
});

test("RAC-605-KEY-03 only a sanitized Runtime entry overrides its matching market key", () => {
  const market = builtinPluginDirectory().find(entry => entry.id === "pages")!;
  const valid: PluginDirectoryEntry = { ...market, name: "Running pages", ui: { views: [{ view_id: "main", slot: "navigator", title: "Running pages" }] } };
  const invalid: PluginDirectoryEntry = { ...valid, plugin_id: 'bad"id' };
  assert.deepEqual(pluginDirectoryFor([invalid]).find(entry => entry.id === "pages"), market, "a rejected entry cannot hide the valid market fallback");
  const directory = pluginDirectoryFor([invalid, valid, { ...valid, name: "Duplicate" }]);
  assert.deepEqual(directory.filter(entry => entry.id === "pages"), [valid], "the first valid Runtime declaration wins over duplicate keys and market data");
  assert.equal(railEntries(["pages"], directory).find(entry => entry.id === "pages")?.label, "Running pages");
  assert.equal(railEntries([], directory).some(entry => entry.id === "pages"), false);
});

test("RAC-619 the Host's marks (personal, always_on, companions) are kept only as exact values on a chosen entry", () => {
  const marked = (id: string, chosen: boolean, marks: Record<string, unknown>): PluginDirectoryEntry => ({ ...installed(id), chosen, ...marks } as PluginDirectoryEntry);
  const [kept, notChosen, loose, many] = sanitizePluginDirectory([
    marked("kept", true, { personal: true, always_on: true, companions: ["inbox", "feed", "inbox", 'bad"key', 7] }),
    marked("not-chosen", false, { personal: true, always_on: true, companions: ["inbox"] }),
    marked("loose", true, { personal: "yes", always_on: 1, companions: "inbox" }),
    marked("many", true, { companions: Array.from({ length: 50 }, (_, index) => `p${index}`) }),
  ]) as PluginDirectoryEntry[];
  assert.deepEqual([kept!.personal, kept!.always_on, kept!.companions], [true, true, ["inbox", "feed"]], "a plain key is kept once; a repeated one, a key outside the pattern and a non-string are dropped");
  assert.deepEqual(Object.keys(notChosen!).sort(), ["chosen", "id", "name", "plugin_id", "ui"], "an entry the project does not choose carries no mark");
  assert.deepEqual(Object.keys(loose!).filter(name => ["personal", "always_on", "companions"].includes(name)), [], "only true counts as a flag, only an array as companions");
  assert.equal(many!.companions!.length, 32);
  assert.doesNotMatch(renderPluginDirectoryData([kept!]), /personal|always_on|companions/u, "the page's scripts get none of them");
  // RAC-619-CLIENT-03: the marked server entry exposes only the two routing fields, with no display or Host fields.
  assert.deepEqual(JSON.parse(directoryData(renderPluginDirectoryData([kept!]))), [{ id: "kept", accepts_objects: false, hue: null }]);
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
      return { kind: "app", views: [{ descriptor: { contribution_id: `${pluginId}.main`, kind: "primary-page" as const, label: "Directory fixture", slots: [] },
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

test("RAC-609-BLOCK-01 an installed plugin blocked by a missing dependency leaves the real Host directory and page while its sibling remains", async () => {
  const folder = mkdtempSync(join(tmpdir(), "directory-blocked-")), database = join(folder, "project.db");
  seedDemoBoard(database); const store = new LocalProjectDatabase(database);
  const ports = { db: store.db, appendEvent: (event: Parameters<typeof store.appendEvent>[0]) => store.appendEvent(event), eventCursor: (id: string) => store.eventCursor(id) };
  const platform = createPluginPlatform({ db: store.db, project_id: DEMO_PROJECT_ID, actor_id: "tester", actions: pluginActions(store, DEMO_PROJECT_ID),
    artifacts: new ArtifactsModule(ports), processItems: new ProcessItemsModule(ports), ui: new UiHost(), home: null,
    privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }) });
  const blockedId = "io.molis.work.example.directory-blocked", siblingId = "io.molis.work.example.directory-sibling", starts: string[] = [];
  const definition = (pluginId: string, missing = false): PluginDefinition => ({
    manifest: { schema_version: 2, host_api_version: 2, plugin_id: pluginId, version: "1.0.0", name: pluginId, kind: "app",
      publisher: { publisher_id: "directory-fixture", signature: pluginId }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
      permissions: [], capabilities: { provides: [], consumes: missing ? ["directory.missing.v1"] : [] }, artifacts: { produces: [], consumes: [] },
      ...(missing ? { requires: [{ capability_id: "directory.missing.v1", version: 1, reason: "Directory regression" }] } : {}),
      ui: { contributions: [`${pluginId}.main`], views: [{ view_id: "main", slot: "navigator", title: pluginId,
        start: { title: `Start ${pluginId}`, hint: "An actual Runtime entry" } }] } },
    async start() { starts.push(pluginId); return { kind: "app", views: [{ descriptor: { contribution_id: `${pluginId}.main`, kind: "primary-page", label: pluginId, slots: [] },
      render: () => "<section>Directory fixture</section>" }] }; },
  });
  try {
    const blocked = definition(blockedId, true);
    const installed = platform.runtime.install({ definition: blocked, trust: { level: "unsigned" }, deployment: "local" });
    assert.equal(platform.runtime.get(installed.install.install_id).state, "installed", "the blocked case has a real installation record");
    const report = await platform.start([{ definition: blocked }, { definition: definition(siblingId) }]);
    assert.deepEqual(report.running, [siblingId]); assert.deepEqual(report.failed, []);
    assert.deepEqual(report.blocked.map(state => [state.plugin_id, state.status, state.code]), [[blockedId, "blocked", "plugin.capability_missing"]]);
    assert.equal(platform.supervisor.state(blockedId)?.status, "blocked");
    assert.equal(platform.runtime.get(installed.install.install_id).state, "installed", "dependency refusal does not pretend the installation was removed");
    assert.deepEqual(starts, [siblingId], "the blocked factory never executes, while the independent sibling really runs");
    const directory = runningPluginDirectory(platform.supervisor);
    assert.deepEqual(directory.map(entry => entry.id), [siblingId], "the actual Host directory excludes the blocked install without hiding its running sibling");
    const html = renderMolisWorkWeb(view(directory));
    assert.equal((JSON.parse(directoryData(html)) as Array<{ id: string }>).some(entry => entry.id === blockedId), false);
    assert.equal(headingOf(html, blockedId), undefined); assert.ok(headingOf(html, siblingId));
    assert.equal(homeStartList(html).some(entry => entry.id === blockedId), false);
    assert.equal(homeStartList(html).some(entry => entry.id === siblingId), true);
  } finally {
    await platform.closeCoordination();
    for (const record of platform.runtime.list()) if (record.state === "running") await platform.runtime.stop(record.install_id);
    store.close(); rmSync(folder, { recursive: true, force: true });
  }
});

test("RAC-606 the page carries the directory for its scripts: a plugin that declares accepts_objects opens as a tab, and the script lists none", () => {
  const html = renderMolisWorkWeb(view([installed("notes", { accepts_objects: true }), installed("plain")]));
  const parsed = JSON.parse(directoryData(html)) as Array<{ id: string; accepts_objects: boolean }>;
  // RAC-606-CLIENT-01: both Runtime entries and market fallbacks use exactly the fields the real script consumes.
  for (const entry of parsed) assert.deepEqual(Object.keys(entry).sort(), ["accepts_objects", "hue", "id"]);
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

test("RAC-608 creatableKinds and homeStarts read an installed plugin like a built-in one, and the Goal's page writes its declared texts escaped", async () => {
  const notes = installed("notes", { creates: { station: "notes", title: "笔记" }, start: { title: "写一条笔记", hint: "先写下来。" } });
  const directory = pluginDirectoryFor([notes]);
  assert.deepEqual(creatableKinds(["goals"], directory).map(kind => [kind.id, kind.station, kind.title]), [["notes", "notes", "笔记"]]);
  assert.deepEqual(homeStarts(["goals"], directory).filter(start => start.id === "notes").map(start => [start.title, start.hint, start.glyph]), [["写一条笔记", "先写下来。", "note"]]);
  await withGoal([notes], render => {
    const html = render();
    assert.ok(createButtons(html).some(button => button.station === "notes" && button.title === "笔记"), "the Goal's new buttons take it in");
    assert.ok(homeStartList(html).some(start => start.id === "notes"));
  });
  const hostile = installed("evil", { creates: { station: "notes", title: HOSTILE }, start: { title: HOSTILE, hint: HOSTILE } }, "Evil");
  await withGoal([hostile], render => {
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
