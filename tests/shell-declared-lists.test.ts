// W5-02 PR-D (PG-073, PG-076): the shell's lists of rows, tab titles, rail order and settings data are what the plugins declare.
// The page scripts keep no row of their own for a plugin: the platform's own and the one the Feed source directory still owns are named in
// `search-rows.ts`, and a record's tab title is read from the row its plugin declared.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { AGENT_RUNTIME_CAPABILITIES, type AgentRuntimeDescriptor } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { SettingsPageModel } from "@molis-ai/molis-work-contracts/platform/ui";
import { BUILTIN_PLUGIN_CATALOG, CLIENT_SCRIPT, dockDefaultPins, extendPluginIds, findPluginSettingsNavItem, pluginSettingsDataAction, pluginWorkbenchPacks, renderPluginSettingsContribution, sanitizePluginDirectory } from "@molis-ai/molis-work-app-workbench";
import { CODING_SETTINGS_UI_CONTRIBUTION_ID, codingAgentManifest, renderCodingSettings } from "@molis-ai/molis-work-plugin-coding";
import { SHELF_SETTINGS_UI_CONTRIBUTION_ID, renderShelfSettings } from "@molis-ai/molis-work-plugin-shelf";
import { defaultShelfDeviceSettings } from "@molis-ai/molis-work-module-shelf";

const source = (path: string) => readFileSync(fileURLToPath(new URL(`../apps/workbench/src/${path}`, import.meta.url)), "utf8");
const pack = (id: string) => pluginWorkbenchPacks().find(item => item.project_plugin_id === id);

test("RAC-690 Pages finds its rows by its own attribute, not by a class that belongs to Feed's list", () => {
  assert.deepEqual(pack("pages")?.searchRow, { selector: "button[data-page-id]", idDataset: "pageId" });
  for (const item of pluginWorkbenchPacks()) {
    assert.doesNotMatch(item.searchRow?.selector ?? "", /feed-stage/u, `${item.project_plugin_id} declares a row by Feed's class`);
  }
});

test("RAC-691 the page scripts list no search row by plugin; the two outside the declarations are named in one place and still reach the page", () => {
  for (const file of ["scripts/client/tab-workspace.ts", "scripts/client/tab-workspace-layout.ts", "scripts/client/tab-workspace-menus.ts", "scripts/client/global-search.ts"]) {
    const text = source(file);
    assert.doesNotMatch(text, /"characters"|data-character-id|data-feed-task-toggle/u, `${file} lists a row by plugin`);
  }
  const named = source("search-rows.ts");
  assert.match(named, /CHARACTERS_SEARCH_ROW[^\n]*\["characters", "\[data-character-id\]", "characterId"\]/u);
  assert.match(named, /FEED_SOURCE_SEARCH_ROW[^\n]*\["feed", "\[data-feed-task-toggle\]", "feedTaskToggle"\]/u);
  assert.ok(CLIENT_SCRIPT.includes("[data-character-id]") && CLIENT_SCRIPT.includes("[data-feed-task-toggle]"), "both rows are written into the page");
});

test("RAC-692 a record's tab title is read from the row its plugin declared, not from Feed's and Inbox's selectors", () => {
  const text = ["tab-workspace.ts", "tab-workspace-layout.ts", "tab-workspace-menus.ts"].map(file => source(`scripts/client/${file}`)).join("\n");
  assert.doesNotMatch(text, /data-feed-entry-id|data-inbox-row|data-inbox-entry-id/u);
  assert.deepEqual(pack("feed")?.recordRow, { selector: "[data-feed-entry-id]", idDataset: "feedEntryId" });
  assert.deepEqual(pack("inbox")?.recordRow, { selector: "[data-inbox-row][data-inbox-entry-id]", idDataset: "inboxEntryId" });
  assert.match(text, /RECORD_ROWS\.find\(\(\[id\]\) => id === plugin\)/u);
});

test("RAC-694 the rail and the Dock keep no table of plugin names; the Manifests' views carry the backbone, the extend entry and the default pins", () => {
  for (const file of ["immersive-shell.ts", "plugin-catalog.ts", "scripts/client/navigation-presentation.ts"]) {
    assert.doesNotMatch(source(file), /RAIL_CORE_ORDER|RAIL_CORE_PLUGIN_IDS|RAIL_EXTEND_PLUGIN_IDS|DOCK_DEFAULT_PINS/u, `${file} lists plugins by name`);
  }
  const declared = (field: "rail" | "pinned_default") => BUILTIN_PLUGIN_CATALOG.flatMap(entry => (entry.manifest.ui?.views ?? [])
    .filter(view => view[field] !== undefined).map(view => [entry.project_plugin_id, view[field], view.slot, view.order] as const))
    .sort((left, right) => (left[3] ?? 100) - (right[3] ?? 100));
  assert.deepEqual(declared("rail"), [["goals", "core", "navigator", 10], ["inbox", "core", "navigator", 30], ["feed", "core", "navigator", 40], ["plugin-builder", "extend", "navigator", 57]]);
  assert.deepEqual(declared("pinned_default").map(([id]) => id), ["goals", "inbox", "feed"], "in the views' order");
  assert.deepEqual(dockDefaultPins(), ["goals", "inbox", "feed"]);
  assert.deepEqual([...extendPluginIds()], ["plugin-builder"]);
  assert.ok(CLIENT_SCRIPT.includes('const DEFAULT_PINS = ["goals","inbox","feed"];'), "the Dock script is written with the declared pins");
});

const hostSource = (path: string) => readFileSync(fileURLToPath(new URL(`../apps/local-host/src/${path}`, import.meta.url)), "utf8");
const primitives = {
  escape: (value: unknown) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"),
  text: (value: string) => value,
};
const runtime = (id: string, off: readonly string[] = []): AgentRuntimeDescriptor => ({ runtime_id: id, display_name: `运行时 ${id}`, provider_version: "1",
  capabilities: Object.fromEntries(AGENT_RUNTIME_CAPABILITIES.map(name => [name, off.includes(name) ? "unsupported" : "supported"])) as AgentRuntimeDescriptor["capabilities"] });

test("RAC-697 the Host has one route for a plugin's settings page: no plugin is a branch of it, and it imports neither plugin for it", () => {
  const text = ["web-catalog.ts", "web-catalog-routes.ts", "web-catalog-settings.ts"].map(hostSource).join("\n");
  assert.doesNotMatch(text, /plugin-shelf|plugin-coding|SHELF_|CODING_|codingAgentManifest|shelfActions/u);
  assert.match(text, /pluginSettingsDataAction\(pluginSettings\.contribution_id\)/u);
  const view = (id: string) => BUILTIN_PLUGIN_CATALOG.find(entry => entry.project_plugin_id === id)?.manifest.ui?.views?.find(item => item.slot === "settings");
  assert.deepEqual(view("shelf")?.settings_data, { action: "shelf.snapshot" });
  assert.equal(view("coding")?.settings_data, undefined, "Coding's page needs only the platform's context");
  assert.equal(pluginSettingsDataAction(SHELF_SETTINGS_UI_CONTRIBUTION_ID)?.capability_id, "shelf.snapshot");
  assert.equal(pluginSettingsDataAction(CODING_SETTINGS_UI_CONTRIBUTION_ID), undefined);
  assert.equal(view("coding")?.settings_runtimes, true);
  assert.equal(findPluginSettingsNavItem("coding-settings")?.settings_runtimes, true);
  assert.equal(view("shelf")?.settings_runtimes, undefined);
  assert.equal(findPluginSettingsNavItem("shelf")?.settings_runtimes, false);
});

test("RAC-698 the Shelf and Coding settings pages come out as before when drawn from the platform's context and the declared data", () => {
  const settings = defaultShelfDeviceSettings();
  const context = { projects: [{ project_id: "p1", name: "项目一" }, { project_id: "p2", name: "项目二" }],
    project: { project_id: "p1", name: "项目一", href: "/projects/p1/" }, runtimes: [runtime("r-write"), runtime("r-read", ["text-edit", "command"])] };
  const shelf = renderPluginSettingsContribution(SHELF_SETTINGS_UI_CONTRIBUTION_ID, { context, primitives,
    data: { settings, runtime: undefined, ai: undefined, root: "/tmp/shelf-root" } } satisfies SettingsPageModel<{ settings: typeof settings; runtime: undefined; ai: undefined; root: string }>);
  assert.equal(shelf, renderShelfSettings({ settings, runtime: undefined, ai: undefined, storage_path: "/tmp/shelf-root", primitives }));
  const coding = renderPluginSettingsContribution(CODING_SETTINGS_UI_CONTRIBUTION_ID, { context, primitives } satisfies SettingsPageModel);
  assert.equal(coding, renderCodingSettings({
    roles: codingAgentManifest.roles.map(role => ({ ...role, execution: role.execution ?? "read-only" })),
    runtimes: context.runtimes.map(item => ({ ...item, can_write: item.capabilities["text-edit"] !== "unsupported", can_command: item.capabilities.command !== "unsupported", methods: item.capabilities.skills })),
    methods: codingAgentManifest.skills ?? [], projects: context.projects, project_name: "项目一", project_href: "/projects/p1/", primitives }));
  assert.match(coding, /data-coding-settings/);
  assert.ok(coding.includes("运行时 r-write") && coding.includes("/projects/p1/"));
});

test("RAC-695 the directory the shell takes in drops a backbone place, an extend place and a default pin from a plugin installed at run time", () => {
  const entry = (id: string, chosen: boolean) => ({ id, plugin_id: `io.molis.work.probe.${id}`, name: id, chosen,
    ui: { views: [{ view_id: "directory", slot: "navigator" as const, title: id, order: 20, rail: "core" as const, pinned_default: true as const }] } });
  const cleaned = sanitizePluginDirectory([entry("rogue", false), entry("kept", true)]);
  const view = (id: string) => cleaned.find(item => item.id === id)!.ui.views[0]!;
  assert.equal(view("rogue").rail, undefined);
  assert.equal(view("rogue").pinned_default, undefined);
  assert.equal(view("kept").rail, "core", "a chosen entry keeps what its view declares");
  assert.equal(view("kept").pinned_default, true);
  assert.deepEqual(dockDefaultPins(cleaned), ["kept"]);
});
