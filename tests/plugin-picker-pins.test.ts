import assert from "node:assert/strict";
import test from "node:test";
import { renderPluginRail, renderWorkbenchBar } from "../apps/workbench/src/immersive-shell.ts";
import { DOCK_DEFAULT_PINS, RELOAD_ON_MEMBERSHIP_IDS, builtinPluginDirectory, pluginMarketCards } from "../apps/workbench/src/plugin-catalog.ts";

// The switcher lists every plugin a project could have, once, as a tile that reads the same in both states, and each tile
// carries the same two buttons (keep it in the Dock; add it to or remove it from the project) — specs/archive/plugin-picker-dock.

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
  goals: { always_on: true }, "text-stats": { companions: ["files"] }, feed: { companions: ["inbox"] },
};
const marked = () => builtinPluginDirectory().map(entry => ({ ...entry, ...HOST_MARKS[entry.id] }));

/** One tile, as written: its wrapper's open tag, its entry, and its two buttons. */
function tileOf(html: string, id: string): { wrapper: string; entry: string; pin: string; toggle: string; all: string } {
  const at = html.indexOf(`data-plugin-tile="${id}"`);
  const opening = html.lastIndexOf('<div class="plugin-rail-tile', at);
  assert.ok(at >= 0 && opening >= 0, `a tile for ${id}`);
  const end = html.indexOf("</span></div>", opening) + "</span></div>".length;
  const all = html.slice(opening, end);
  return {
    all,
    wrapper: all.slice(0, all.indexOf(">") + 1),
    entry: all.match(/<(?:button|a)[^>]*class="immersive-plugin-link plugin-rail-item"[\s\S]*?<\/(?:button|a)>/)![0],
    pin: all.match(/<button[^>]*data-dock-choice="[^"]*"[^>]*>/)?.[0] ?? "",
    toggle: all.match(/<button[^>]*data-plugin-toggle="[^"]*"[^>]*>/)?.[0] ?? "",
  };
}

test("DOCK-02 a plugin the project has opens and is in colour; one it does not have is grey and opens nothing — the same structure", () => {
  const html = renderPluginRail(primitives, ["goals", "pages"], "");
  const have = tileOf(html, "pages"), lack = tileOf(html, "schedule");
  assert.doesNotMatch(have.wrapper, /is-available/);
  assert.match(have.entry, /data-plugin-id="pages"[^>]*data-work-surface-open="pages"/);
  assert.match(lack.wrapper, /is-available/);
  assert.doesNotMatch(lack.entry, /data-plugin-id=|data-work-surface-open=/, "nothing opens, nothing can be kept");
  assert.match(lack.entry, /aria-disabled="true"[^>]*tabindex="-1"/);
  // Both read the same: glyph, name, one line, the end mark, and the two buttons — so a state change is attributes only.
  for (const tile of [have, lack]) {
    assert.match(tile.entry, /<svg[^>]*><\/svg><span>[^<]+<\/span><small class="plugin-rail-hint">[^<]+<\/small><i class="plugin-rail-mark"/);
    assert.ok(tile.pin && tile.toggle, "two buttons");
    assert.match(tile.all, /<span class="plugin-rail-ops" role="group"/);
  }
});

test("DOCK-01 every plugin the market offers is listed once, and the Dock has no second list", () => {
  const html = renderPluginRail(primitives, ["goals"], "");
  for (const card of pluginMarketCards()) {
    if (card.id === "plugin-builder") continue;
    assert.equal(html.split(`data-plugin-tile="${card.id}"`).length - 1, 1, `${card.id} is listed once`);
  }
  const bar = renderWorkbenchBar(primitives, { rail: html, projectChrome: "", enabled: ["goals"] });
  assert.doesNotMatch(bar, /data-dock-choices|class="dock-choices"|常驻在 Dock<\/p>/);
  assert.doesNotMatch(bar, /dock-settings|personal-sidebar-footer/, "and no list at the foot of the switcher");
});

test("DOCK-01 DOCK-13 the market and the plugin studio are two buttons at the head of the switcher, beside search and above the project's own entry", () => {
  const enabled = ["goals", "plugin-builder"];
  const bar = renderWorkbenchBar(primitives, { rail: renderPluginRail(primitives, enabled, ""), projectChrome: "", enabled });
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
  // Without the studio plugin there is one button, not an empty slot.
  const without = renderWorkbenchBar(primitives, { rail: renderPluginRail(primitives, ["goals"], ""), projectChrome: "", enabled: ["goals"] });
  assert.match(without, /data-plugin-id="market"/);
  assert.doesNotMatch(without, /data-plugin-id="plugin-builder"/);
});

test("DOCK-04 the pin: grey while not kept, graphite while kept, out of reach until the plugin is in; 灵光's is an ordinary pin and Shelf has no tile", () => {
  const html = renderPluginRail(primitives, ["goals", "pages", "shelf", "lingguang"], "");
  const kept = tileOf(html, "goals"), loose = tileOf(html, "pages"), grey = tileOf(html, "schedule");
  assert.ok(DOCK_DEFAULT_PINS.includes("goals") && !DOCK_DEFAULT_PINS.includes("pages"));
  assert.match(kept.pin, /mw-btn--primary/); assert.match(kept.pin, /aria-pressed="true"/); assert.doesNotMatch(kept.pin, / disabled/);
  assert.match(kept.wrapper, /is-kept/);
  assert.match(loose.pin, /mw-btn--secondary/); assert.match(loose.pin, /aria-pressed="false"/); assert.doesNotMatch(loose.pin, / disabled/);
  assert.doesNotMatch(loose.wrapper, /is-kept/);
  assert.match(grey.pin, / disabled/);
  // The bar no longer keeps 灵光 as a resident (side-shelf §7: the bar has only the side panel's button), so its pin is like
  // any other: in the project, not kept unless the person keeps it. Shelf is a 常开插件, a tab of the side panel: no tile.
  assert.doesNotMatch(html, /data-plugin-id="shelf"/);
  for (const id of ["lingguang"]) {
    const plain = tileOf(html, id);
    assert.doesNotMatch(plain.pin, /data-resident/); assert.doesNotMatch(plain.pin, / disabled/); assert.match(plain.pin, /aria-pressed="false"/);
    assert.doesNotMatch(plain.wrapper, /is-kept/);
  }
});

test("DOCK-05 DOCK-06 one button, two states: a plus while the plugin is not in the project, a trash can once it is; a 常开 plugin (Goals) cannot be removed", () => {
  const html = renderPluginRail(primitives, ["goals", "pages"], "", "", marked());
  const have = tileOf(html, "pages"), lack = tileOf(html, "schedule"), core = tileOf(html, "goals");
  assert.match(have.toggle, /data-state="added"/); assert.match(have.toggle, /mw-btn--secondary/); assert.doesNotMatch(have.toggle, / disabled/);
  assert.match(lack.toggle, /data-state="available"/); assert.match(lack.toggle, /mw-btn--primary/);
  assert.match(core.toggle, / disabled/); assert.match(core.toggle, /常开插件不能从项目移除/);
  // Both glyphs are in the button either way, so a change of state is the tile's class only: the stylesheet shows the one that fits.
  for (const tile of [have, lack, core]) assert.match(tile.all, /<button[^>]*data-plugin-toggle[\s\S]*?<svg class="plugin-toggle-add"[^>]*><use href="#icon-plus"><\/use><\/svg><svg class="plugin-toggle-remove"[^>]*><use href="#icon-trash"><\/use><\/svg>/);
});

test("DOCK-06 what adding adds along, and what removing takes with it, is written on the tile", () => {
  // Text Stats comes with Files; Feed with Inbox (the Projects service applies both, and the other way round on removal).
  // Text Stats is offered to add only in developer mode (W2-18 decision 5); a project that has it shows it in either.
  const missing = renderPluginRail(primitives, ["goals"], "", "", marked(), { developerMode: true });
  assert.match(tileOf(missing, "text-stats").wrapper, /data-along="Files"/);
  assert.match(tileOf(missing, "text-stats").toggle, /添加会同时添加：Files/);
  assert.match(tileOf(missing, "feed").wrapper, /data-along="Inbox"/);
  const all = renderPluginRail(primitives, ["goals", "files", "text-stats", "inbox", "feed"], "", "", marked());
  assert.match(tileOf(all, "files").wrapper, /data-dependents="Text Stats"/, "removing Files takes Text Stats with it");
  assert.match(tileOf(all, "inbox").wrapper, /data-dependents="Feed"/, "removing Inbox takes Feed with it");
  assert.doesNotMatch(tileOf(all, "text-stats").wrapper, /data-dependents|data-along/, "nothing depends on Text Stats, and it is already in");
});

test("DOCK-08 no plugin brings the page back: the list of those that cannot change in place is empty, and the switcher carries it for the client", () => {
  const html = renderPluginRail(primitives, ["goals"], "");
  assert.match(html, new RegExp(`<div class="plugin-rail-items" data-reload-plugins="${RELOAD_ON_MEMBERSHIP_IDS.join(" ")}">`));
  // Feed's source directory and Coding's settings row both attach and detach live (specs/archive/plugin-picker-dock); a plugin that
  // cannot would be named here, and the client would save the page's state and load it again for that one only.
  assert.deepEqual([...RELOAD_ON_MEMBERSHIP_IDS], []);
});

/** A plugin that runs in the project without being one of the project's chosen plugins, as the Host reports it. */
const installed = (id: string, name: string) => ({ id, plugin_id: `io.molis.work.generated.${id}`, name, chosen: false,
  ui: { views: [{ view_id: "app", slot: "stage" as const, title: name }] } });

test("a plugin the project installed at run time can be kept in the Dock, and is not this list's to remove", () => {
  const html = renderPluginRail(primitives, ["goals"], "", "", [installed("app-notes", "笔记")]);
  const own = tileOf(html, "app-notes");
  assert.match(own.entry, /data-plugin-id="app-notes"/);
  assert.match(own.pin, /data-dock-choice="app-notes"/);
  assert.equal(own.toggle, "", "taking it out of the project is whoever installed it");
});

test("names and glyphs come out escaped", () => {
  const html = renderPluginRail(primitives, ["goals"], "", "", [installed("app-x", "<b>笔记</b>")]);
  assert.doesNotMatch(html, /<b>笔记<\/b>/);
  assert.match(html, /&lt;b>笔记/);
});
