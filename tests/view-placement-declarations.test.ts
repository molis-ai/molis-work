// Where a plugin is listed, made new and started from is its Manifest's (W5-06 2b): a view names its rail `group`, what it
// `creates` and its project home `start`, and a settings view its `icon`. The SDK refuses a declaration the workbench could
// not honour; the workbench reads the declarations and keeps only the group names and their order.
import assert from "node:assert/strict";
import test from "node:test";
import { UI_VIEW_GROUPS, UI_VIEW_HUES, type UiContributionDeclaration } from "@molis-ai/molis-work-contracts/platform/ui";
import {
  BUILTIN_PLUGIN_CATALOG, creatableKinds, findPluginSettingsNavItem, homeStarts, listPluginSettingsNavItems, pluginSettingsNavItemsFrom,
} from "@molis-ai/molis-work-app-workbench";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { defineWorkflowContentActions, parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { DECLARATION_PLUGIN_ID, declarationManifest, manifestProblems } from "./fixtures/declaration-manifest.js";
import { renderMolisWorkWeb, type MolisWorkWebView } from "./workbench-renderer-fixture.js";
import { PERSONAL_PLUGIN_IDS, PROJECT_SCOPED_PLUGIN_IDS, shownProjectPlugins } from "@molis-ai/molis-work-app-local-host";

type Part = Record<string, unknown>;

const STATION = { id: "notes", title: "Notes", icon: "note", subject_kind: "note", read_permissions: [], write_permissions: [] };
const creating = defineWorkflowContentActions({ ...STATION, create: true });
const listing = defineWorkflowContentActions(STATION);
const CREATES = [creating.list, creating.read, creating.receive, creating.create];
const GROUPS = `（${UI_VIEW_GROUPS.join("、")}）`;
const HUES = `（${UI_VIEW_HUES.join("、")}）`;

/** A Manifest with one view, `main`, in the navigator, laid over by `over`; its actions are a station that can create `notes`. */
function placed(over: Part = {}, actions: unknown = CREATES): Record<string, unknown> {
  return declarationManifest({
    actions,
    ui: { contributions: [`${DECLARATION_PLUGIN_ID}.main`], views: [{ view_id: "main", slot: "navigator", title: "Main", icon: "note", ...over }] },
  });
}

test("SH1303-02 public Manifest parsing retains colour names and refuses non-string hues", () => {
  for (const hue of UI_VIEW_HUES) assert.equal(parsePluginManifest(placed({ hue })).ui?.views?.[0]?.hue, hue);
  for (const hue of [7, ["indigo"], [["indigo"]], null, true, {}]) {
    assert.throws(() => parsePluginManifest(placed({ hue })), (error: unknown) => {
      assert.ok(error instanceof ActionError);
      assert.equal(error.code, "plugin.declaration_invalid");
      assert.equal(error.kind, "invalid");
      assert.equal(error.message, `视图 main 的 hue ${String(hue)} 不是设计系统的颜色名${HUES}`);
      return true;
    }, "reject " + JSON.stringify(hue));
  }
});

const RULES: ReadonlyArray<{ rule: string; manifest: Record<string, unknown>; expected: string }> = [
  { rule: "a view that declares none of them", manifest: placed(), expected: "" },
  { rule: "a navigator view that declares all of them", manifest: placed({ group: "make", creates: { station: "notes", title: "笔记" }, start: { title: "写一条笔记", hint: "先写下来。", icon: "note" } }), expected: "" },
  { rule: "an island view with a group and a start", manifest: placed({ slot: "island", group: "personal", start: { title: "记下来", hint: "以后再整理。" } }), expected: "" },
  // icon
  { rule: "an icon that is not a name", manifest: placed({ icon: 3 }), expected: "视图 main 的 icon 必须是图标名" },
  { rule: "a blank icon", manifest: placed({ icon: " " }), expected: "视图 main 的 icon 必须是图标名" },
  // hue (RAC-701): any view may name its plugin's tab-strip colour, and only by a design-system colour name
  { rule: "a design-system hue on a navigator view", manifest: placed({ hue: "indigo" }), expected: "" },
  { rule: "a design-system hue on a side view", manifest: placed({ slot: "side", hue: "slate" }), expected: "" },
  { rule: "a hue the design system does not have", manifest: placed({ hue: "magenta" }), expected: `视图 main 的 hue magenta 不是设计系统的颜色名${HUES}` },
  { rule: "a colour value in place of a name", manifest: placed({ hue: "#ff0000" }), expected: `视图 main 的 hue #ff0000 不是设计系统的颜色名${HUES}` },
  // group
  { rule: "a group the workbench does not have", manifest: placed({ group: "tools" }), expected: `视图 main 的 group tools 不是工作台的分组${GROUPS}` },
  { rule: "a group that is not a name", manifest: placed({ group: 7 }), expected: `视图 main 的 group 7 不是工作台的分组${GROUPS}` },
  { rule: "a group on a stage view", manifest: placed({ slot: "stage", group: "make" }), expected: "视图 main 的 group 只用于 navigator 或 island 视图" },
  { rule: "an unknown group on a settings view", manifest: placed({ slot: "settings", group: "tools" }),
    expected: `视图 main 的 group 只用于 navigator 或 island 视图；视图 main 的 group tools 不是工作台的分组${GROUPS}` },
  // creates
  { rule: "creates on a settings view", manifest: placed({ slot: "settings", creates: { station: "notes", title: "笔记" } }), expected: "视图 main 的 creates 只用于 navigator 或 island 视图" },
  { rule: "creates without a title", manifest: placed({ creates: { station: "notes" } }), expected: "视图 main 的 creates 必须写明 station 与 title" },
  { rule: "creates without a station", manifest: placed({ creates: { title: "笔记" } }), expected: "视图 main 的 creates 必须写明 station 与 title" },
  { rule: "creates that is not an object", manifest: placed({ creates: "notes" }), expected: "视图 main 的 creates 必须写明 station 与 title" },
  { rule: "creates naming a station the Manifest does not have", manifest: placed({ creates: { station: "drafts", title: "草稿" } }),
    expected: "视图 main 的 creates 指向 drafts，本 Manifest 没有这个能新建的工作流内容站" },
  { rule: "creates naming a station that cannot create", manifest: placed({ creates: { station: "notes", title: "笔记" } }, [listing.list, listing.read, listing.receive]),
    expected: "视图 main 的 creates 指向 notes，本 Manifest 没有这个能新建的工作流内容站" },
  { rule: "creates in a Manifest without actions", manifest: { ...placed({ creates: { station: "notes", title: "笔记" } }), actions: undefined },
    expected: "视图 main 的 creates 指向 notes，本 Manifest 没有这个能新建的工作流内容站" },
  // start
  { rule: "start on a side view", manifest: placed({ slot: "side", start: { title: "写", hint: "先写下来。" } }), expected: "视图 main 的 start 只用于 navigator 或 island 视图" },
  { rule: "start without a hint", manifest: placed({ start: { title: "写" } }), expected: "视图 main 的 start 必须写明 title 与 hint" },
  { rule: "start with a blank title", manifest: placed({ start: { title: " ", hint: "先写下来。" } }), expected: "视图 main 的 start 必须写明 title 与 hint" },
  { rule: "start that is not an object", manifest: placed({ start: true }), expected: "视图 main 的 start 必须写明 title 与 hint" },
  { rule: "a start icon that is not a name", manifest: placed({ start: { title: "写", hint: "先写下来。", icon: 1 } }), expected: "视图 main 的 start.icon 必须是图标名" },
];

for (const { rule, manifest, expected } of RULES) {
  test(`RAC-75 W5-06-PLACE-01 view placement: ${rule}`, () => {
    assert.equal(manifestProblems(manifest), expected);
  });
}

// W5-02 PR-D (PG-074, RAC-693): a navigator view alone says its plugin is part of the backbone or an extend entry, and is pinned by default.
const RAIL_RULES: ReadonlyArray<{ rule: string; manifest: Record<string, unknown>; expected: string }> = [
  { rule: "a navigator view with a backbone place and a default pin", manifest: placed({ rail: "core", pinned_default: true }), expected: "" },
  { rule: "a navigator view that is an extend entry", manifest: placed({ rail: "extend" }), expected: "" },
  { rule: "rail on an island view", manifest: placed({ slot: "island", rail: "core" }), expected: "视图 main 的 rail 只用于 navigator 视图" },
  { rule: "pinned_default on a settings view", manifest: placed({ slot: "settings", pinned_default: true }), expected: "视图 main 的 pinned_default 只用于 navigator 视图" },
  { rule: "a rail place the workbench does not have", manifest: placed({ rail: "top" }), expected: "视图 main 的 rail top 不是 core 或 extend" },
  { rule: "pinned_default that is not true", manifest: placed({ pinned_default: false }), expected: "视图 main 的 pinned_default 只能是 true" },
];

for (const { rule, manifest, expected } of RAIL_RULES) {
  test(`RAC-693 view placement: ${rule}`, () => {
    assert.equal(manifestProblems(manifest), expected);
  });
}

// W5-02 PR-D (PG-072, RAC-696): a settings view alone names the read action its page gets its data with, and the SDK refuses one
// the Host could not call as the person (a command, a write, an action for others, an action the Manifest does not have).
const readAction = (over: Part = {}, id = "notes.snapshot", version = 1) => ({ capability_id: id, version, operation: "query", action: {
  title: "读取", description: "读取设置页的数据", kind: "query", scope: "home", audiences: ["user"], permissions: [], subject_kinds: [],
  input_schema: { type: "object" }, output_schema: { type: "object" }, ...over } });
const settingsView = (over: Part = {}, actions: unknown[] = [readAction()]) =>
  placed({ slot: "settings", settings_data: { action: "notes.snapshot" }, ...over }, [...CREATES, ...actions]);
const NO_ACTION = "视图 main 的 settings_data 指向 notes.snapshot，本 Manifest 没有这个只读、面向用户（audience user）、只有一个版本的查询动作";

const DATA_RULES: ReadonlyArray<{ rule: string; manifest: Record<string, unknown>; expected: string }> = [
  { rule: "a settings view that names a read action of its own for the person", manifest: settingsView(), expected: "" },
  { rule: "a settings view that names none", manifest: placed({ slot: "settings" }), expected: "" },
  { rule: "settings_data on a navigator view", manifest: placed({ settings_data: { action: "notes.snapshot" } }, [...CREATES, readAction()]), expected: "视图 main 的 settings_data 只用于 settings 视图" },
  { rule: "settings_data without an action", manifest: settingsView({ settings_data: {} }), expected: "视图 main 的 settings_data 必须写明 action" },
  { rule: "settings_data that is not an object", manifest: settingsView({ settings_data: "notes.snapshot" }), expected: "视图 main 的 settings_data 必须写明 action" },
  { rule: "an action the Manifest does not have", manifest: settingsView({ settings_data: { action: "notes.other" } }),
    expected: "视图 main 的 settings_data 指向 notes.other，本 Manifest 没有这个只读、面向用户（audience user）、只有一个版本的查询动作" },
  { rule: "a command", manifest: settingsView({}, [{ ...readAction(), operation: "command", action: { ...readAction().action, kind: "operation" } }]), expected: NO_ACTION },
  { rule: "a query that writes", manifest: settingsView({}, [readAction({ effect: "write" })]), expected: NO_ACTION },
  { rule: "an action that is not for the person", manifest: settingsView({}, [readAction({ audiences: ["workflow", "agent"] })]), expected: NO_ACTION },
  { rule: "an action declared in two versions", manifest: settingsView({}, [readAction(), readAction({}, "notes.snapshot", 2)]), expected: NO_ACTION },
];

for (const { rule, manifest, expected } of DATA_RULES) {
  test(`RAC-696 settings data: ${rule}`, () => {
    assert.equal(manifestProblems(manifest), expected);
  });
}

test("FIX-4 a settings view can request runtimes with or without a data action", () => {
  assert.equal(manifestProblems(settingsView({ settings_runtimes: true })), "");
  assert.equal(manifestProblems(settingsView({ settings_data: undefined, settings_runtimes: true })), "");
});

for (const slot of ["navigator", "stage", "side", "island"]) {
  test(`FIX-4 the SDK refuses a runtime-list request on ${slot}`, () => {
    assert.equal(manifestProblems(placed({ slot, settings_runtimes: true })), "视图 main 的 settings_runtimes 只用于 settings 视图");
  });
}

for (const value of [false, null, "true", 1, {}, []]) {
  test(`FIX-4 the SDK refuses settings_runtimes=${JSON.stringify(value)}`, () => {
    assert.equal(manifestProblems(settingsView({ settings_runtimes: value })), "视图 main 的 settings_runtimes 只能是 true");
  });
}

test("RAC-75 W5-06-PLACE-01 every bundled Manifest's placement declarations pass", () => {
  for (const entry of BUILTIN_PLUGIN_CATALOG) assert.equal(manifestProblems(entry.manifest), "", entry.project_plugin_id);
});

// ---- the rail -----------------------------------------------------------------------------------------------------------

const PROJECT = "project-view-placement";
const HEADINGS: Readonly<Record<(typeof UI_VIEW_GROUPS)[number], string>> = { advance: "推进", make: "写与做", personal: "个人", research: "研究", code: "编码" };
const BACKBONE = new Set(["goals", "inbox", "feed", "sessions"]);

function projectView(enabled: readonly string[]): MolisWorkWebView {
  return {
    snapshot: {
      board: { project_id: PROJECT, title: "Placement", active_goal_id: null, created_at: "2026-10-23T00:00:00.000Z", updated_at: "2026-10-23T00:00:00.000Z" },
      cursor: 0, goals: [], relations: [], goal_tree_proposals: [], planning_method_packs: [],
    },
    project: { project_id: PROJECT, display_name: "Placement" },
    projects: [{ project_id: PROJECT, display_name: "Placement" }],
    route_prefix: `/projects/${PROJECT}`,
    demo: false, active_goal_id: null, goals: [], archived_goals: [], trashed_goals: [], counts: {},
    input_bindings: [], policy_bindings: [], events: [],
    feed: { sources: [], feed_items: [], inbox_entries: [], runs: [], out_rules: [] },
    enabled_plugins: [...enabled],
  } as MolisWorkWebView;
}

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

/** The group each plugin's rail view names, or null. */
const declaredGroups = new Map(BUILTIN_PLUGIN_CATALOG.flatMap(entry => (entry.manifest.ui?.views ?? [])
  .filter(view => view.slot === "navigator" || view.slot === "island")
  .map(view => [entry.project_plugin_id, view.group ?? null] as const)));

test("RAC-76 W5-06-PLACE-02 the rail lists each plugin under the group its view names, the rest under 更多", () => {
  const sections = railSections(renderMolisWorkWeb(projectView([...PROJECT_SCOPED_PLUGIN_IDS, ...PERSONAL_PLUGIN_IDS])));
  assert.deepEqual(sections.map(section => section.heading), [...UI_VIEW_GROUPS.map(group => HEADINGS[group]), "更多"], "the Host keeps the names and their order");
  for (const { heading, tiles } of sections) {
    for (const tile of tiles.filter(id => !BACKBONE.has(id))) {
      const group = declaredGroups.get(tile);
      assert.equal(heading, group ? HEADINGS[group] : "更多", `${tile} sits under the group its view names`);
    }
  }
  // The declarations keep the groups the shell used to list by name. Within a group an island comes first (灵光 leads 个人),
  // then the views by their `order`, then by plugin id (UiViewRegistry): Workflows (25) before Schedule (35), and Artifacts
  // before Images at 60 — as main drew them, since the old table's ids only chose the members.
  const members = (heading: string) => sections.find(section => section.heading === heading)!.tiles.filter(id => !BACKBONE.has(id));
  assert.deepEqual(members("推进"), ["workflows", "schedule"]);
  assert.deepEqual(members("写与做"), ["pages", "form", "dataset", "ppt", "artifacts", "images"]);
  assert.deepEqual(members("个人"), ["lingguang", "todo", "jelly", "cognia"]);
  assert.deepEqual(members("研究"), ["alchemist"]);
  assert.deepEqual(members("编码"), ["coding"]);
  assert.ok(members("更多").includes("files"), "a plugin whose view names no group is under 更多");
});

// ---- settings icons -----------------------------------------------------------------------------------------------------

test("RAC-77 W5-06-PLACE-03 a settings page's icon is its view's, also when found by its own URL", () => {
  const icons = Object.fromEntries(listPluginSettingsNavItems(shownProjectPlugins(["goals", "coding"])).map(item => [item.section_id, item.icon]));
  assert.deepEqual(icons, { shelf: "library", planning: "workflow", "coding-settings": "code" });
  assert.equal(findPluginSettingsNavItem("coding-settings")?.icon, "code", "a project that does not show Coding still finds its page with its icon");
  assert.equal(findPluginSettingsNavItem("shelf")?.icon, "library");
  const page: UiContributionDeclaration = {
    contribution_id: "io.molis.work.native.example.settings.v1", kind: "settings-page",
    navigation_id: "example", label: "Example", slots: [],
    surfaces: [{ surface_id: "settings", target_slot_id: "workbench.settings", format: "declarative-html" }],
  };
  assert.equal(pluginSettingsNavItemsFrom([page])[0]?.icon, "settings", "a page whose view names no icon the Host knows shows the settings icon");
});

// ---- making new and starting --------------------------------------------------------------------------------------------

test("RAC-78 W5-06-PLACE-04 what a project can make new comes from the views that declare it, directory views by order, then islands", () => {
  const all = [...PROJECT_SCOPED_PLUGIN_IDS, ...PERSONAL_PLUGIN_IDS];
  assert.deepEqual(creatableKinds(all), [
    { id: "pages", station: "pages", title: "文档" },
    { id: "form", station: "form", title: "问卷" },
    { id: "dataset", station: "dataset", title: "数据表" },
    { id: "ppt", station: "ppt", title: "演示稿" },
  ]);
  assert.deepEqual(creatableKinds(["goals", "ppt"]).map(kind => kind.id), ["ppt"], "only the plugins the project shows");
  assert.deepEqual(creatableKinds(["goals"]), []);
});

test("RAC-78 W5-06-PLACE-04 the project home's ways to start come from the views that declare them, in the same order", () => {
  const all = [...PROJECT_SCOPED_PLUGIN_IDS, ...PERSONAL_PLUGIN_IDS];
  assert.deepEqual(homeStarts(all), [
    { id: "goals", title: "推进一个目标", hint: "明确要做成什么，接着往下走。", glyph: "target" },
    { id: "pages", title: "写一份文档", hint: "把思路写下来，逐步整理成作品。", glyph: "file" },
    { id: "lingguang", title: "记下一点灵感", hint: "还没想清楚，也可以先留下。", glyph: "idea" },
  ]);
  assert.deepEqual(homeStarts(["goals", "lingguang"]).map(start => start.id), ["goals", "lingguang"], "only the plugins the project shows");
});
