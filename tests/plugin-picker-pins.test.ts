import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { installTextForTest, parseLocalePack } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderImmersiveHeader, renderPluginRail } from "../apps/workbench/src/immersive-shell.ts";
import { RELOAD_ON_MEMBERSHIP_IDS, builtinPluginDirectory, extendPluginIds, pluginMarketCards } from "../apps/workbench/src/plugin-catalog.ts";

// The switcher lists every plugin a project could have, once, as a tile that reads the same in both states, and each tile
// carries the same two buttons (open it beside; add it to or remove it from the project) — specs/archive/plugin-picker-dock. The
// keep pin that once kept a plugin in the Dock is gone: the top strip keeps no plugins of its own (specs/screen-polish §3 方案 C).

// The bar's Assistant says stable keys (`t`) since K3 (unified input): the Workbench's own words, as the Host installs them when it starts.
const workbenchWords = parseLocalePack(readFileSync(new URL("../apps/workbench/resources/locales/zh.json", import.meta.url), "utf8"));
if (!workbenchWords.ok) throw new Error(`the Workbench's words do not read: ${JSON.stringify(workbenchWords.problems)}`);
installTextForTest({ packs: [workbenchWords.value], locale: "zh" });

const primitives = {
  L: (value: string) => value,
  escapeHtml: (value: unknown) => String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;"),
  icon: (name: string) => `<svg data-icon="${name}"></svg>`,
};

/**
 * The directory as the Host writes it (W5-02 B1): its own registry puts the marks on the chosen entries, and the switcher only reads
 * them. Goals is 常开; Text Stats comes with Files and Feed with Inbox.
 */
const HOST_MARKS: Readonly<Record<string, { always_on?: true; companions?: readonly string[] }>> = {
  goals: { always_on: true }, feed: { companions: ["inbox"] },
};
const marked = () => builtinPluginDirectory().map(entry => ({ ...entry, ...HOST_MARKS[entry.id] }));

/** One tile, as written: its wrapper's open tag, its entry, and its two buttons. */
function tileOf(html: string, id: string): { wrapper: string; entry: string; beside: string; toggle: string; all: string } {
  const at = html.indexOf(`data-plugin-tile="${id}"`);
  const opening = html.lastIndexOf('<div class="plugin-rail-tile', at);
  assert.ok(at >= 0 && opening >= 0, `a tile for ${id}`);
  const end = html.indexOf("</span></div>", opening) + "</span></div>".length;
  const all = html.slice(opening, end);
  return {
    all,
    wrapper: all.slice(0, all.indexOf(">") + 1),
    entry: all.match(/<(?:button|a)[^>]*class="immersive-plugin-link plugin-rail-item"[\s\S]*?<\/(?:button|a)>/)![0],
    beside: all.match(/<button[^>]*data-rail-beside="[^"]*"[^>]*>/)?.[0] ?? "",
    toggle: all.match(/<button[^>]*data-plugin-toggle="[^"]*"[^>]*>/)?.[0] ?? "",
  };
}

test("DOCK-02 a plugin the project has opens and is in colour; one it does not have is grey and opens nothing — the same structure", () => {
  const html = renderPluginRail(primitives, ["goals", "pages"]);
  const have = tileOf(html, "pages"), lack = tileOf(html, "schedule");
  assert.doesNotMatch(have.wrapper, /is-available/);
  assert.match(have.entry, /data-plugin-id="pages"[^>]*data-work-surface-open="pages"/);
  assert.match(lack.wrapper, /is-available/);
  assert.doesNotMatch(lack.entry, /data-plugin-id=|data-work-surface-open=/, "nothing opens");
  assert.match(lack.entry, /aria-disabled="true"[^>]*tabindex="-1"/);
  // Both read the same: glyph, name, one line, the line a removal asks in, and the two buttons — so a state change is attributes only.
  for (const tile of [have, lack]) {
    assert.match(tile.entry, /<svg[^>]*><\/svg><span>[^<]+<\/span><small class="plugin-rail-hint">[^<]+<\/small><small class="plugin-rail-confirm"/);
    assert.ok(tile.beside && tile.toggle, "two buttons");
    assert.match(tile.all, /<span class="plugin-rail-ops" role="group"/);
  }
});

test("DOCK-01 every plugin the market offers is listed once, and the Dock has no second list", () => {
  const html = renderPluginRail(primitives, ["goals"]);
  for (const card of pluginMarketCards()) {
    if (card.id === "plugin-builder") continue;
    assert.equal(html.split(`data-plugin-tile="${card.id}"`).length - 1, 1, `${card.id} is listed once`);
  }
  const bar = renderImmersiveHeader(primitives, false, [], { rail: html, projectChrome: "", enabled: ["goals"] });
  assert.doesNotMatch(bar, /data-dock-choices|class="dock-choices"|常驻在 Dock<\/p>/);
  assert.doesNotMatch(bar, /dock-settings|personal-sidebar-footer/, "and no list at the foot of the switcher");
});

test("DOCK-01 DOCK-13 the market and the plugin studio are two buttons at the head of the switcher, beside search and above the project's own entry", () => {
  // 47-1 C: the studio is the platform's framed surface, offered whenever the page carries the host surfaces, not a plugin the project picks.
  const enabled = ["goals"];
  const bar = renderImmersiveHeader(primitives, false, [], { rail: renderPluginRail(primitives, enabled), projectChrome: "", enabled, hostSurfaces: true });
  const head = bar.slice(bar.indexOf('<div class="plugin-picker-head">'), bar.indexOf('class="plugin-rail-items"'));
  assert.match(head, /data-global-search-open[\s\S]*<div class="plugin-picker-extend" data-global-menu[^>]*>[\s\S]*data-plugin-id="market"[\s\S]*data-plugin-id="plugin-builder"/, "search, then the market, then the studio");
  for (const id of ["market", "plugin-builder"]) {
    const button = head.match(new RegExp(`<button[^>]*data-plugin-id="${id}"[^>]*>`))?.[0] ?? "";
    assert.match(button, /class="mw-btn mw-btn--secondary mw-btn--sm plugin-picker-extend-btn"/, `${id} is a design-system button`);
    assert.match(button, /data-work-surface-open="[^"]+"/, `${id} opens its page`);
  }
  assert.match(head, /data-plugin-id="market"[\s\S]*?data-market-update-count hidden[^>]*><\/b><\/button>/, "the market's update count is inside its button");
  assert.ok(bar.indexOf('class="plugin-picker-extend"') < bar.indexOf('data-plugin-id="home"'), "above the project's own entry");
  assert.doesNotMatch(bar, /dock-settings|personal-sidebar-footer/, "nothing at the foot");
  // Without the host surfaces there is one button, not an empty slot.
  const without = renderImmersiveHeader(primitives, false, [], { rail: renderPluginRail(primitives, ["goals"]), projectChrome: "", enabled: ["goals"] });
  assert.match(without, /data-plugin-id="market"/);
  assert.doesNotMatch(without, /data-plugin-id="plugin-builder"/);
});

test("DOCK-04 方案 C: no tile keeps a plugin in the top strip — no pin, no kept mark — its two buttons are 在旁边打开 and the plus or trash can; Shelf has no tile", () => {
  const html = renderPluginRail(primitives, ["goals", "pages", "shelf", "lingguang"]);
  assert.doesNotMatch(html, /data-dock-choice|dock-keep|is-kept|plugin-rail-mark/);
  for (const id of ["goals", "pages", "lingguang"]) {
    const tile = tileOf(html, id);
    assert.match(tile.beside, new RegExp(`data-rail-beside="${id}"`)); assert.doesNotMatch(tile.beside, / disabled/);
    assert.equal(tile.all.match(/<button[^>]*class="[^"]*mw-btn/g)?.length, 2, `${id}: two buttons`);
  }
  // A plugin the project does not have cannot be opened beside.
  assert.match(tileOf(html, "schedule").beside, / disabled/);
  // Shelf is a 常开插件, a tab of the side panel: no tile.
  assert.doesNotMatch(html, /data-plugin-id="shelf"/);
});

/** A plugin that runs in the project without being one of the project's chosen plugins, as the Host reports it. */
const installed = (id: string, name: string) => ({ id, plugin_id: `io.molis.work.generated.${id}`, name, chosen: false,
  ui: { views: [{ view_id: "app", slot: "stage" as const, title: name }] } });

test("a plugin the project installed at run time opens beside like any other, and is not this list's to remove", () => {
  const html = renderPluginRail(primitives, ["goals"], [installed("app-notes", "笔记")]);
  const own = tileOf(html, "app-notes");
  assert.match(own.entry, /data-plugin-id="app-notes"/);
  assert.match(own.beside, /data-rail-beside="app-notes"/);
  assert.equal(own.toggle, "", "taking it out of the project is whoever installed it");
});

test("names and glyphs come out escaped", () => {
  const html = renderPluginRail(primitives, ["goals"], [installed("app-x", "<b>笔记</b>")]);
  assert.doesNotMatch(html, /<b>笔记<\/b>/);
  assert.match(html, /&lt;b>笔记/);
});

// ---- W5-02 PR-D (PG-074): the rail's backbone and its extend entry are what the views declare ----------

/** A plugin whose one navigator view says `over`, as a Manifest would. */
const probe = (id: string, over: Record<string, unknown>, chosen = true) => ({ id, plugin_id: `io.molis.work.probe.${id}`, name: id, chosen,
  ui: { views: [{ view_id: "directory", slot: "navigator" as const, title: id, icon: "note", order: 20, ...over }] } });
/** The plugins drawn in one zone of the rail, in the order they are drawn (the project home's own entry is not a plugin). */
const zoneOf = (html: string, zone: string) => [...html.matchAll(new RegExp(`<button data-rail-zone="${zone}"[^>]*data-plugin-id="([^"]+)"`, "g"))].map(match => match[1]!).filter(id => id !== "home");

test("RAC-694 the tables are gone: the backbone and the extend entry come out as before, read from the views", () => {
  // 47-1 C: the studio left the catalog for a platform package, so no shipped plugin declares an extend place now.
  assert.deepEqual([...extendPluginIds()], []);
  const html = renderPluginRail(primitives, ["goals", "inbox", "feed", "plugin-builder", "pages"]);
  assert.deepEqual(zoneOf(html, "core"), ["goals", "inbox", "feed"], "the backbone, in the views' order");
  assert.ok(!zoneOf(html, "tool").includes("plugin-builder") && !html.includes('data-plugin-tile="plugin-builder"'), "the studio is not among the tools");
});

test("RAC-695 a new plugin takes a backbone place and an extend place by declaring them, and nothing else", () => {
  // A view's `pinned_default` is still a Manifest field, but the workbench no longer reads it (specs/screen-polish §3 方案 C).
  const directory = [...builtinPluginDirectory(), probe("probe", { rail: "core", pinned_default: true })];
  const html = renderPluginRail(primitives, ["goals", "inbox", "feed", "probe"], directory);
  assert.deepEqual(zoneOf(html, "core"), ["goals", "probe", "inbox", "feed"], "by its view's order, between Goals (10) and Inbox (30)");
  assert.doesNotMatch(tileOf(html, "probe").all, /is-kept|data-dock-choice/);
  // An extend entry is offered from the Dock menu and the switcher's head, never listed among the tools or offered to add.
  const extend = [...builtinPluginDirectory(), probe("studio-two", { rail: "extend" })];
  assert.ok(extendPluginIds(extend).has("studio-two"));
  const bare = renderPluginRail(primitives, ["goals", "studio-two"], extend);
  assert.ok(!bare.includes('data-plugin-tile="studio-two"'), "not a tile");
  const plain = [...builtinPluginDirectory(), probe("plain", {})];
  assert.ok(tileOf(renderPluginRail(primitives, ["goals", "plain"], plain), "plain").wrapper.includes("plugin-rail-tile"), "an undeclared plugin is an ordinary tool");
  assert.deepEqual(zoneOf(renderPluginRail(primitives, ["goals", "plain"], plain), "core"), ["goals"]);
});

test("RAC-695 a directory that marks a plugin installed at run time as the backbone or an extend entry is not believed", () => {
  const rogue = probe("rogue", { rail: "core", pinned_default: true }, false);
  assert.equal(extendPluginIds([probe("rogue", { rail: "extend" }, false)]).size, 0);
  assert.deepEqual(zoneOf(renderPluginRail(primitives, ["goals"], [rogue]), "core"), [], "no backbone place");
});

/** RAC-1821 (replaces RAC-1461): the rail's third argument is the directory; the nav opens on the rail's own items, with no island slot before them and no account footer after them. */
test("RAC-1821 the rail's third argument is the directory: the nav opens on its own items, with no island slot before them and no account footer after them", () => {
  const html = renderPluginRail(primitives, ["goals", "pages"], marked());
  assert.match(html, /<nav [^>]*data-plugin-strip[^>]*>\s*<div class="plugin-rail-items"/, "the nav opens on the rail's own items");
  assert.doesNotMatch(html, /\[object Object\]|assistant-island/, "the directory is read as a directory, and no island slot is written");
  assert.match(tileOf(html, "goals").toggle, / disabled/, "and it is the directory given that is read: its marks make Goals 常开");
  assert.doesNotMatch(html, /personal-sidebar-footer/, "no account footer section is written");
  assert.doesNotMatch(html, /account-global-items/, "and no placeholder for its items");
  assert.match(html, /<\/div>\s*<\/nav>\s*$/, "the rail's nav closes right after its own content");
});

/** RAC-1822: only the project home has a label of its own; an entry of the directory named market is a plugin like any other. */
test("RAC-1822 an entry the directory calls market gets the same switch-to label as any plugin; only the project home is told apart", () => {
  const directory = [...builtinPluginDirectory(), probe("market", {})];
  const html = renderPluginRail(primitives, ["goals", "market"], directory);
  assert.match(html, /data-plugin-id="market"[^>]*aria-label="切换到插件：[^"]+"/, "the market entry is labelled like the others");
  assert.match(html, /data-plugin-id="home"[^>]*aria-label="项目主页"/, "the project home keeps its own label");
});
