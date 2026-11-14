import assert from "node:assert/strict";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import vm from "node:vm";
import { MolisWorkLocalHost, builtinMarketDirectory, homePluginDirectory, installedStageSection } from "@molis-ai/molis-work-app-local-host";
import { CLIENT_SCRIPT, clientPluginDirectory, isPersonalPlugin, pluginDirectoryFor, railEntries, type PluginDirectoryEntry } from "@molis-ai/molis-work-app-workbench";
import { openTestHome, serveTestHost } from "./fixtures/test-home.js";
import { openDualHome } from "./fixtures/dual-home.js";
import { dualPlugin } from "./fixtures/dual-plugin.js";
import { pluginDocuments } from "./fixtures/plugin-documents.js";

// BL-713 (PG-011; specs/archive/repository-anti-corruption/slices/pg011-pg017-remaining.md §5, T-401): the parts of a Home package's stage that need
// no sandbox, so they run on Linux CI as well. `home-plugin-stage-navigation.test.ts` installs a signed package and runs it in the macOS
// sandbox, which only a Mac has.

// 07-1 S4b removed the titlebar's and the arrival page's personal-tool slot, and with it `HomePluginHost.navigation()` and
// `renderHomePluginNavigation`: a Home package is offered by the plugin directory the Host gives every page, as every plugin is, in the
// switcher's 个人 group and ＋'s 「个人 · 所有项目共用」 (口径 9). The cases below read that directory instead.

/** The Home directory's entry for a plugin, or none. */
const homeEntry = async (host: MolisWorkLocalHost, pluginId: string) => (await homePluginDirectory(host.homePlugins)).find(entry => entry.plugin_id === pluginId);

test("RAC-2682 a dual plugin is never offered as the person's own, whichever half supplies its stage and whether it runs, stopped or failed", async t => {
  for (const mode of ["home", "project", "wrong-contribution", "wrong-target"] as const) await t.test(mode, async t => {
    const dual = dualPlugin(`nav-${mode}`, false, mode === "project" ? "project" : "home");
    const expected = dual.view;
    dual.stage.descriptor.surfaces = [{ surface_id: "workbench", target_slot_id: mode === "wrong-target" ? "workbench.overlay" : "workbench.main", format: "declarative-html" }];
    if (mode === "wrong-contribution") dual.stage.descriptor.contribution_id += ".other";
    const manifest = { ...dual.manifest, ui: { ...dual.manifest.ui, contributions: [...new Set([expected, dual.stage.descriptor.contribution_id])],
      views: [...dual.manifest.ui.views ?? [], ...(mode === "wrong-contribution"
        ? [{ view_id: "other", slot: "side" as const, title: "Other", contribution_id: dual.stage.descriptor.contribution_id }] : [])] } };
    let fail = false;
    const originalStart = dual.home.start;
    const home = { ...dual.home, manifest, start: (...args: Parameters<typeof originalStart>) => {
      if (fail) throw new Error("Home navigation start failure");
      return originalStart(...args);
    } };
    const h = await openDualHome(t, probe => probe.project, { ...dual, manifest, home, project: { ...dual.project, manifest } });
    await h.page();
    const host = h.home.host.homePlugins!, platform = await host.ready();
    assert.equal(platform.supervisor.state(dual.id)?.status, "running", JSON.stringify(platform.supervisor.state(dual.id)));
    // Before 07-1 S4b the titlebar offered a dual plugin's Home stage as a Home tool when that half supplied it. There is no Home tool
    // any more: a dual plugin is reached as a project plugin, and the Home directory never marks it the person's.
    const own = async () => { const entry = await homeEntry(h.home.host, dual.id); return entry ? isPersonalPlugin(entry) : false; };
    assert.equal(await own(), false, `${mode}: running, not the person's own`);
    await platform.runtime.stop(h.provider());
    assert.equal(await own(), false, `${mode}: stopped, not the person's own`);
    fail = true;
    assert.equal((await platform.supervisor.restart(dual.id)).status, "failed");
    assert.equal(await own(), false, `${mode}: failed, not the person's own`);
  });
});

test("RAC-2620.1 SCS-11 installed stages defer the frame of their exact installation, and Home packages keep their personal directory entry and icon", () => {
  const pluginId = "io.molis.work.generated.00000000-0000-4000-8000-000000000000";
  const installation = { scope: "project", install_id: "install", installation_generation: "generation", version: "1.0.0", manifest_digest: "digest" } as const;
  const stage = installedStageSection({ pluginId, surface: "app-b1", label: "Notes & <Tasks>", prefix: "/projects/p", installation });
  assert.match(stage, /data-work-surface="app-b1" data-work-surface-label="Notes &amp; &lt;Tasks&gt;"/u);
  assert.ok(stage.includes(`data-installed-plugin="${pluginId}" data-plugin-page-source="/projects/p/plugins/${pluginId}?frame=workbench&amp;installation=${encodeURIComponent(JSON.stringify(installation))}" data-deferred-surface hidden`));
  assert.doesNotMatch(stage, /<iframe\b/u, "the package is loaded when its surface opens");
  assert.deepEqual(pluginDocuments(stage), [
    '<link rel="stylesheet" href="/assets/molis-work-plugins/plugin-builder.css"><main class="as-preview-page" data-installed-plugin="' + pluginId + '"></main>',
  ]);
  // The Host's directory entries for two packages installed in the Home (marked personal and home) and one a project runs.
  const pkg = (id: string, name: string, marks: Partial<PluginDirectoryEntry>, glyph?: string): PluginDirectoryEntry => ({ id, plugin_id: id, name, chosen: false, ...marks,
    ui: { views: [{ view_id: "app", slot: "stage", title: name, ...glyph ? { icon: glyph } : {} }] } } as PluginDirectoryEntry);
  const notes = "io.molis.work.example.notes", books = "io.molis.work.example.books", local = "io.molis.work.example.local";
  const directory = pluginDirectoryFor([pkg(notes, "Notes <1>", { personal: true, home: true }), pkg(books, "Books", { personal: true, home: true }, "book"), pkg(local, "Local", {})]);
  const rail = railEntries([], directory), entry = (id: string) => rail.find(item => item.id === id);
  assert.deepEqual({ group: entry(notes)?.group, glyph: entry(notes)?.glyph, label: entry(notes)?.label, surface: entry(notes)?.surface },
    { group: "personal", glyph: "package", label: "Notes <1>", surface: notes }, "the default icon; the name is escaped where the switcher writes it");
  assert.deepEqual({ group: entry(books)?.group, glyph: entry(books)?.glyph }, { group: "personal", glyph: "book" }, "the icon the package picked");
  assert.equal(entry(local)?.group, null, "a package a project runs is not the person's own");
  const plus = clientPluginDirectory(directory);
  assert.deepEqual([notes, books, local].map(id => plus.find(item => item.id === id)?.personal === true), [true, true, false], "＋ lists the two Home packages with the person's own");
  // The built-ins by the same rule, from the Host's own registrations (registered personal and run in the Home), as the coordinator
  // listed them for 07-1 S4b: Cognia, Images, Issue, Jelly, Shelf and Todo are the person's own; Goals and Feed (dual, not personal)
  // and 灵光, Pages, PPT, Dataset, Forms, Workflows, Alchemist and the studio (personal, but per project) are not.
  const own = builtinMarketDirectory().filter(isPersonalPlugin).map(item => item.id).sort();
  assert.deepEqual(own, ["cognia", "images", "issues", "jelly", "shelf", "todo"]);
});

test("BL-912 an installed stage tells the tab strip the icon its package picked, and says nothing when it picked none", () => {
  const base = { pluginId: "io.molis.work.example.books", surface: "io.molis.work.example.books", label: "Books", prefix: "", installation: { scope: "home" as const, install_id: "books", installation_generation: "generation", version: "1.0.0", manifest_digest: "digest" } };
  assert.match(installedStageSection({ ...base, icon: "book" }), /data-installed-plugin="io\.molis\.work\.example\.books"[^>]*data-installed-plugin-icon="book" data-deferred-surface hidden>/u);
  assert.ok(!installedStageSection(base).includes("data-installed-plugin-icon"), "no icon picked, no attribute");
  assert.match(installedStageSection({ ...base, icon: 'a"b' }), /data-installed-plugin-icon="a&quot;b"/u, "the value is escaped like the others");
  // The tab strip's own line, taken from the shipped workbench program: the picked icon wins, a built-in plugin's icon and `package` stay.
  const line = /document\.querySelectorAll\("\[data-work-surface\]"\)\.forEach\(\(surface\) => \{\s*const id = surface\.dataset\.workSurface;[\s\S]*?\n\s*\}\);/u.exec(CLIENT_SCRIPT)?.[0];
  assert.ok(line, "the shipped program names the tabs of installed stages");
  const surfaces = [
    { dataset: { workSurface: "app-1", installedPluginIcon: "book" } },
    { dataset: { workSurface: "app-2" } },
    { dataset: { workSurface: "mine", pluginClient: "goals", installedPluginIcon: "chart" } },
    { dataset: { workSurface: "built-in", pluginClient: "goals" } },
  ];
  const icons: Record<string, string> = { goals: "target" }, titles: Record<string, string> = {};
  vm.runInNewContext(line, { document: { querySelectorAll: () => surfaces }, PLUGIN_TAB_ICON: icons, PLUGIN_TAB_TITLES: titles });
  assert.deepEqual(icons, { goals: "target", "app-1": "book", "app-2": "package", mine: "chart", "built-in": "target" });
});

test("RAC-2621.4 a page key nothing registers has no page, framed or not, even as the first request after a start; a built-in Home plugin's key frames no package", async t => {
  const first = await openTestHome(t);
  await first.close(); await first.host.close();
  const host = new MolisWorkLocalHost({ homeDirectory: first.home, completeText: null });
  const served = await serveTestHost(null, { home: first.home, host });
  try {
    for (const key of ["io.molis.work.example.absent", "io.molis.work.generated.00000000-0000-4000-8000-000000000000"]) {
      for (const query of ["", "?frame=workbench"]) {
        // The first of these is the first request this Host has served: it asks the Home to start and still answers 404.
        const response = await fetch(`${served.origin}/plugins/${key}${query}`);
        const text = await response.text();
        assert.equal(response.status, 404, `${key}${query}: there is no such page`);
        assert.ok(!text.includes('"mode":"installed"') && !text.includes("page_id"), `${key}${query}: no installed page and no page token is given out`);
      }
    }
    // A built-in Home plugin answers with its own page, which has its own page token and frames no package.
    const builtin = await (await fetch(`${served.origin}/plugins/todo?frame=workbench`)).text();
    assert.ok(!builtin.includes('"mode":"installed"') && !builtin.includes("?frame=workbench"), "the answer is not an installed package's page");
  } finally { await served.close(); await host.close(); }
});

test("RAC-2621.5 a Home whose plugin library breaks after it started offers no package in its directory, and the directory's read does not throw", async t => {
  const first = await openTestHome(t);
  await first.close(); await first.host.close();
  const host = new MolisWorkLocalHost({ homeDirectory: first.home, completeText: null });
  try {
    const homePlugins = host.homePlugins!;
    await homePlugins.ready();
    const packages = async () => (await homePluginDirectory(homePlugins)).filter(entry => !entry.chosen);
    assert.deepEqual(await packages(), [], "a Home that started and holds no package offers none");
    // The library breaks while the Home runs: the next read of its installations fails, and the tool bar has nothing to offer for them.
    const library = new DatabaseSync(join(first.home, "plugin-runtime", "plugin-runtime.db"));
    const away = (from: string, to: string) => library.exec(`ALTER TABLE ${from} RENAME TO ${to}`);
    try {
      away("plugin_runtime_installs", "plugin_runtime_installs_away");
      assert.throws(() => homePlugins.registered(), "the library really is unreadable now");
      assert.deepEqual(await packages(), []);
    } finally { away("plugin_runtime_installs_away", "plugin_runtime_installs"); library.close(); }
  } finally { await host.close(); }
});
