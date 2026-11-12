import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { icon } from "@molis-ai/molis-work-plugin-sdk/ui";
import { ChromeHarness, locateTestChrome } from "@molis-ai/molis-work-test-kit/browser";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { HomeConsentLedger, LOCAL_OWNER_PERMISSIONS, MolisWorkLocalHost, pluginInstallActions } from "@molis-ai/molis-work-app-local-host";
import { PACKAGE_PLUGIN_ID, newPublisher, signedPackage } from "./fixtures/sandbox-package.js";
import { APPROVED, SECOND_PLUGIN_ID, mac, person, ref } from "./fixtures/home-sandbox.js";
import { openTestHome, serveTestHost } from "./fixtures/test-home.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";

// BL-713 (PG-011; specs/archive/repository-anti-corruption/slices/pg011-pg017-remaining.md §5, T-401): a signed package installed in the Home draws
// its stage in the Home: a page of its own, a stage in every project's workbench, and a place that follows its state. Since 07-1 S4b
// (口径 9) that place is the switcher's 个人 group and ＋'s 「个人 · 所有项目共用」 in a project, as every personal plugin's; the titlebar
// and the arrival page no longer have a personal-tool slot.
// Every case here installs a signed package and runs it in the sandbox, which only macOS has (`mac`); what needs no package (the stage markup,
// the tool bar's entries, the pages nothing registers) is in `home-plugin-stage-pages.test.ts`, which Linux CI runs.

/** A Home with one project, and installs the person confirms into it. A package has one stage view; `glyph` is the icon it picked, if any. */
async function navHome(t: TestContext) {
  const home = await openTestHome(t);
  const project = await home.createProject("Navigation");
  const client = home.host.actionClient(project.reference);
  const install = async (pluginId = PACKAGE_PLUGIN_ID, glyph?: string) => {
    const bundle = signedPackage(newPublisher(), (_files, manifest) => {
      manifest.runtime = { scope: "home" };
      if (glyph) (manifest.ui.views![0] as { icon?: string }).icon = glyph;
    }, { pluginId });
    const preview = await client.invoke(person(project.project_id), ref(pluginInstallActions.preview), { bundle }) as { preview_id: string };
    await client.invoke(person(project.project_id), ref(pluginInstallActions.confirm), { preview_id: preview.preview_id, consent: true, pin_label: "Test publisher" });
  };
  const page = async (path: string, origin = home.origin) => { const response = await fetch(origin + path); return { status: response.status, text: await response.text() }; };
  return { home, project, client, install, page, projectPath: `/projects/${encodeURIComponent(project.project_id)}/` };
}

const escaped = (pluginId: string) => pluginId.replaceAll(".", "\\.");
/** The switcher's entry a project page draws for a package (its button in the tile), or none. */
const entryOf = (html: string, pluginId: string) => new RegExp(`<button [^>]*class="immersive-plugin-link[^"]*"[^>]*data-plugin-id="${escaped(pluginId)}"[^>]*>.*?</button>`, "s").exec(html)?.[0];
/** The switcher group its tile is in. */
const groupOf = (html: string, pluginId: string) => new RegExp(`data-plugin-tile="${escaped(pluginId)}"(?: data-rail-group="([^"]+)")?`, "u").exec(html)?.[1];
/** ＋ lists from the page's directory: whether it lists the package with the person's own (07-S2 口径 8, 07-1 S4b 口径 9). */
const plusPersonal = (html: string, pluginId: string) => (JSON.parse(/<script type="application\/json" data-plugin-directory>(.*?)<\/script>/su.exec(html)?.[1] ?? "[]") as { id: string; personal?: true }[])
  .find(entry => entry.id === pluginId)?.personal === true;
const surfaceOf = (entry: string) => /data-work-surface-open="([^"]+)"/u.exec(entry)?.[1];
const stagesOf = (html: string) => [...html.matchAll(/<section class="desktop-work-surface plugin-stage-shell" data-work-surface="([^"]+)"[^>]* data-installed-plugin="([^"]+)" data-plugin-page-source="([^"]+)"[^>]* data-deferred-surface hidden><script type="application\/json" data-plugin-document>/gu)]
  .map(match => ({ surface: match[1]!, plugin_id: match[2]!, source: match[3]! }));

test("RAC-2620 a project's switcher (its 个人 group) and ＋ offer a Home package with the personal plugins, with the icon it picked and `package` when it picked none; the arrival page has no tool slot", mac, async t => {
  const h = await navHome(t);
  await h.install(PACKAGE_PLUGIN_ID, "book");
  await h.install(SECOND_PLUGIN_ID);
  // 07-1 S4b removed the arrival page's personal-tool slot (and the titlebar's): a package is reached in a project, as every plugin is.
  const arrival = await h.page("/");
  assert.equal(arrival.status, 200);
  assert.ok(!arrival.text.includes("data-home-plugin-open"), "the arrival page has no personal-tool slot");
  const project = await h.page(h.projectPath);
  assert.equal(project.status, 200);
  assert.ok(!project.text.includes("data-home-plugin-open"), "nor does the project's titlebar");
  const first = entryOf(project.text, PACKAGE_PLUGIN_ID), second = entryOf(project.text, SECOND_PLUGIN_ID);
  assert.ok(first && second, "both packages are in the project's switcher");
  assert.ok(first.includes(icon("book")) && !first.includes(icon("package")), "the icon the package picked");
  assert.ok(second.includes(icon("package")), "no icon picked, the default");
  for (const id of [PACKAGE_PLUGIN_ID, SECOND_PLUGIN_ID]) {
    assert.equal(groupOf(project.text, id), "personal", `${id} is in the switcher's 个人 group`);
    assert.equal(plusPersonal(project.text, id), true, `${id} is in ＋'s 个人 section`);
  }
  const stageTag = (pluginId: string) => new RegExp(`<section [^>]*data-installed-plugin="${pluginId.replaceAll(".", "\\.")}"[^>]*>`, "u").exec(project.text)?.[0];
  assert.ok(stageTag(PACKAGE_PLUGIN_ID)?.includes('data-installed-plugin-icon="book"'), "BL-912: the stage tells the tab strip the icon the package picked");
  assert.ok(stageTag(SECOND_PLUGIN_ID) && !stageTag(SECOND_PLUGIN_ID)!.includes("data-installed-plugin-icon"), "BL-912: no icon picked, the tab keeps the default");
});

test("RAC-2621 a package that has only a stage view has no side tab; its entry opens its stage, which is a page of its own, and two packages open two stages", mac, async t => {
  const h = await navHome(t);
  await h.install(PACKAGE_PLUGIN_ID, "book");
  await h.install(SECOND_PLUGIN_ID);
  const sideTab = await h.page(`/plugins/${PACKAGE_PLUGIN_ID}?side=app`);
  assert.equal(sideTab.status, 404, "no side tab");
  // The page a person opens from the arrival page frames the package's own page.
  const opened = await h.page(`/plugins/${PACKAGE_PLUGIN_ID}`);
  assert.equal(opened.status, 200);
  assert.ok(opened.text.includes(`<iframe src="/plugins/${PACKAGE_PLUGIN_ID}?frame=workbench"`), "the Home page frames the package's page");
  // The framed page is the common installed-plugin renderer, whose every call goes to the package through the Home's route.
  const framed = await h.page(`/plugins/${PACKAGE_PLUGIN_ID}?frame=workbench`);
  assert.equal(framed.status, 200);
  assert.match(framed.text, /"mode":"installed"/u);
  assert.ok(framed.text.includes(`"call":"/api/plugins/${PACKAGE_PLUGIN_ID}/call"`), "calls go through the Home's route");
  // In a project the workbench draws each package's stage, and the entry opens the stage with that id.
  const project = await h.page(h.projectPath);
  const stages = stagesOf(project.text);
  assert.deepEqual(stages.map(stage => stage.plugin_id).sort(), [PACKAGE_PLUGIN_ID, SECOND_PLUGIN_ID].sort(), "both packages have a stage");
  assert.equal(new Set(stages.map(stage => stage.surface)).size, 2, "two stages, two ids");
  for (const stage of stages) {
    assert.equal(surfaceOf(entryOf(project.text, stage.plugin_id)!), stage.surface, `${stage.plugin_id}'s entry opens its own stage`);
    assert.equal(stage.source, `${h.projectPath}plugins/${stage.plugin_id}?frame=workbench`, `${stage.plugin_id}'s stage opens its own package page`);
  }
});

test("RAC-2622 a package switched off leaves the tool bar and has no page; switched on again, it is back", mac, async t => {
  const h = await navHome(t);
  await h.install();
  assert.ok(entryOf((await h.page(h.projectPath)).text, PACKAGE_PLUGIN_ID), "it runs, so it is offered");
  assert.equal((await h.home.web.post<{ disabled: boolean }>(`/api/plugins/${PACKAGE_PLUGIN_ID}/disable`, {})).disabled, true);
  const project = await h.page(h.projectPath);
  assert.equal(entryOf(project.text, PACKAGE_PLUGIN_ID), undefined, "gone from the project's switcher");
  assert.deepEqual(stagesOf(project.text), [], "and its stage is not drawn");
  assert.equal((await h.page(`/plugins/${PACKAGE_PLUGIN_ID}`)).status, 404, "its page is not there");
  await h.home.web.post(`/api/plugins/${PACKAGE_PLUGIN_ID}/enable`, {});
  assert.ok(entryOf((await h.page(h.projectPath)).text, PACKAGE_PLUGIN_ID), "back on the tool bar");
  assert.equal((await h.page(`/plugins/${PACKAGE_PLUGIN_ID}`)).status, 200, "and its page opens");
});

test("RAC-2623 a package that did not come back stays on the tool bar, and its page says why instead of framing it", mac, async t => {
  const h = await navHome(t);
  await h.install();
  // Its approval is gone, as when a Home was copied without it: the package is installed and cannot start.
  await h.home.close(); await h.home.host.close();
  const db = new DatabaseSync(join(h.home.home, "plugin-runtime", "plugin-runtime.db"));
  try { db.prepare("DELETE FROM plugin_private_values WHERE item_key = ?").run(APPROVED + PACKAGE_PLUGIN_ID); } finally { db.close(); }
  const host = new MolisWorkLocalHost({ homeDirectory: h.home.home, completeText: null });
  const served = await serveTestHost(null, { home: h.home.home, host });
  try {
    await host.homePlugins!.ready();
    const reason = /找不到此安装的批准记录/u;
    assert.match(host.homePlugins!.packageError(PACKAGE_PLUGIN_ID) ?? "", reason);
    assert.ok(entryOf((await h.page(h.projectPath, served.origin)).text, PACKAGE_PLUGIN_ID), "it is still in the switcher");
    const opened = await h.page(`/plugins/${PACKAGE_PLUGIN_ID}`, served.origin);
    assert.equal(opened.status, 200);
    assert.match(opened.text, reason, "the page says why");
    assert.ok(!opened.text.includes("<iframe"), "and does not frame the package");
    assert.match((await h.page(`/plugins/${PACKAGE_PLUGIN_ID}?frame=workbench`, served.origin)).text, reason, "the framed page is not the package's either");
    const project = await h.page(h.projectPath, served.origin);
    assert.deepEqual(stagesOf(project.text), [], "no stage is drawn for it in a project");
    assert.match(project.text, reason, "the project's placeholder says why");
    // The placeholder marks it as not started, so the switcher and the Dock draw the amber point for it (07-1 S4b).
    const surface = `data-work-surface="${escaped(PACKAGE_PLUGIN_ID)}"`, mark = "data-(?:home|project)-plugin-unavailable";
    assert.match(project.text, new RegExp(`<[^>]*(?:${surface}[^>]*${mark}|${mark}[^>]*${surface})`, "u"));
  } finally { await served.close(); await host.close(); }
});

test("RAC-2624 a package that was uninstalled leaves the tool bar and has no page", mac, async t => {
  const h = await navHome(t);
  await h.install();
  assert.ok(entryOf((await h.page(h.projectPath)).text, PACKAGE_PLUGIN_ID));
  await h.home.web.post(`/api/plugins/${PACKAGE_PLUGIN_ID}/uninstall`, { keep_data: false });
  assert.equal(entryOf((await h.page(h.projectPath)).text, PACKAGE_PLUGIN_ID), undefined);
  assert.equal(entryOf((await h.page(h.projectPath)).text, PACKAGE_PLUGIN_ID), undefined);
  assert.equal((await h.page(`/plugins/${PACKAGE_PLUGIN_ID}`)).status, 404);
});

test("RAC-2626 the tool bar's entries are the person's page only: no action view an agent, an MCP client or a workflow is shown carries them, and a plugin is shown none without a caller the Host issued", mac, async t => {
  const h = await navHome(t);
  await h.install(PACKAGE_PLUGIN_ID, "book");
  assert.ok(entryOf((await h.page(h.projectPath)).text, PACKAGE_PLUGIN_ID), "the person's page has it");
  // The person's own permissions are the widest view there is: if the entries were in any action view, it would be this one.
  const seen = await Promise.all((["agent", "mcp", "workflow"] as const).map(async audience =>
    JSON.stringify(await h.client.discover({ actor_id: LOCAL_PERSON_ACTOR_ID, audience, project_id: h.project.project_id, permissions: LOCAL_OWNER_PERMISSIONS }))));
  for (const view of seen) {
    assert.ok(view.includes("notes.add"), "the view is the full one: it lists the package's own actions");
    assert.ok(!view.includes("home_plugin_nav") && !view.includes("data-home-plugin-open") && !view.includes("data-work-surface-open"), "no navigation data in an action view");
  }
  // A plugin is shown nothing unless the Host issued it its caller (S-15); a context it writes itself is refused before any directory is read.
  await assert.rejects(h.client.discover({ actor_id: "someone-else", audience: "plugin", project_id: h.project.project_id, permissions: [] }), (error: unknown) => (error as { code?: string }).code === "host.plugin_caller_invalid");
});

test("RAC-2622.1 a package whose publisher was taken back leaves the tool bar and has no page or stage", mac, async t => {
  const h = await navHome(t);
  await h.install();
  assert.ok(entryOf((await h.page(h.projectPath)).text, PACKAGE_PLUGIN_ID), "it runs, so it is offered");
  await h.home.web.post("/api/settings/plugin-publishers/revoke", { key_id: new HomeConsentLedger(h.home.home).publishers()[0]!.key_id });
  await h.home.host.homePlugins!.reconcilePublishers();
  assert.equal(entryOf((await h.page(h.projectPath)).text, PACKAGE_PLUGIN_ID), undefined, "stopped by the Home, it is no longer offered");
  assert.equal((await h.page(`/plugins/${PACKAGE_PLUGIN_ID}`)).status, 404, "and has no page");
  assert.deepEqual(stagesOf((await h.page(h.projectPath)).text), [], "no stage is drawn for it in a project");
});

test("RAC-2621.1 the first request after a start can be a package's page: the Home registers its packages once it has started", mac, async t => {
  const h = await navHome(t);
  await h.install();
  await h.home.close(); await h.home.host.close();
  const host = new MolisWorkLocalHost({ homeDirectory: h.home.home, completeText: null });
  const served = await serveTestHost(null, { home: h.home.home, host });
  try {
    // Nothing has asked the Home to start yet: refreshing the package's page, or opening the window again after a restart, is the first request.
    const opened = await h.page(`/plugins/${PACKAGE_PLUGIN_ID}`, served.origin);
    assert.equal(opened.status, 200);
    assert.ok(opened.text.includes(`<iframe src="/plugins/${PACKAGE_PLUGIN_ID}?frame=workbench"`), "the page frames the package");
  } finally { await served.close(); await host.close(); }
});

test("RAC-2621.2 a framed page is the page of a package running in this Home and nothing else: not a switched-off or removed one", mac, async t => {
  const h = await navHome(t);
  await h.install(PACKAGE_PLUGIN_ID);
  await h.install(SECOND_PLUGIN_ID);
  await h.home.web.post(`/api/plugins/${SECOND_PLUGIN_ID}/disable`, {});
  const gone = "io.molis.work.example.gone";
  await h.install(gone);
  await h.home.web.post(`/api/plugins/${gone}/uninstall`, { keep_data: false });
  // The running package answers, so the marker below is known to be what a framed page carries.
  const running = await h.page(`/plugins/${PACKAGE_PLUGIN_ID}?frame=workbench`);
  assert.equal(running.status, 200);
  assert.match(running.text, /"mode":"installed"/u);
  // The keys nothing registers (absent, forged, a built-in's) need no package: `home-plugin-stage-pages.test.ts`.
  for (const [what, key] of Object.entries({ "switched off": SECOND_PLUGIN_ID, uninstalled: gone })) {
    const framed = await h.page(`/plugins/${key}?frame=workbench`);
    assert.ok(!framed.text.includes('"mode":"installed"'), `${what}: the answer is not an installed package's page`);
    assert.ok(!framed.text.includes("page_id"), `${what}: no page token is given out`);
    assert.equal(framed.status, 404, `${what}: there is no such page`);
  }
});

test("RAC-2621.3 the framed page carries the Home page's policy and a project opens its installed stage in the opaque Workbench frame", mac, async t => {
  const h = await navHome(t);
  await h.install();
  const framed = await fetch(`${h.home.origin}/plugins/${PACKAGE_PLUGIN_ID}?frame=workbench`);
  assert.equal(framed.status, 200);
  assert.match(framed.headers.get("content-security-policy") ?? "", /frame-ancestors 'self'/u, "only this origin frames it");
  assert.equal(framed.headers.get("x-frame-options"), "SAMEORIGIN");
  const outer = /<iframe src="\/plugins\/[^"]*\?frame=workbench"[^>]*>/u.exec((await h.page(`/plugins/${PACKAGE_PLUGIN_ID}`)).text)?.[0];
  assert.ok(outer, "the Home page embeds the package document");
  assert.doesNotMatch(outer, /\bsandbox\b/u, "the Home package page is itself isolated");
  const stage = stagesOf((await h.page(h.projectPath)).text).find(item => item.plugin_id === PACKAGE_PLUGIN_ID);
  assert.ok(stage, "the project carries the package stage as an inert document");
  assert.equal(stage.source, `${h.projectPath}plugins/${PACKAGE_PLUGIN_ID}?frame=workbench`);
  const chrome = locateTestChrome();
  await t.test("the workbench mounts the signed package's real controls in an opaque document", { skip: !chrome }, async check => {
    assert.ok(chrome);
    const browser = await ChromeHarness.start(h.home.home, { executable: chrome });
    try {
      const page = await browser.page();
      const child = await pluginFrameBrowser(check, { sessionId: page.sessionId, command: browser.command.bind(browser),
        on: browser.on.bind(browser), evaluate: page.evaluate.bind(page) }, stage.surface);
      await page.command("Page.navigate", { url: `${h.home.origin}${h.projectPath}?openSurface=${encodeURIComponent(stage.surface)}` });
      await child.waitFor("globalThis.__molisPluginReady === true");
      assert.equal(await child.evaluate(`document.querySelector('[data-field=text]')?.form.querySelector('[type=submit]').textContent.trim()`), "添加");
      const frame = `iframe[data-plugin-frame=${JSON.stringify(stage.surface)}]`;
      assert.deepEqual(await page.evaluate(`(() => {const frame = document.querySelector(${JSON.stringify(frame)});
        return [frame.sandbox.contains('allow-scripts'), frame.sandbox.contains('allow-same-origin'), frame.contentDocument];})()`), [true, false, null]);
    } finally { await browser.close(); }
  });
});
