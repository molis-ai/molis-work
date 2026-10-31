import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { icon } from "@molis-ai/molis-work-plugin-sdk/ui";
import { MolisWorkLocalHost, pluginInstallActions } from "@molis-ai/molis-work-app-local-host";
import { PACKAGE_PLUGIN_ID, newPublisher, signedPackage } from "./fixtures/sandbox-package.js";
import { APPROVED, SECOND_PLUGIN_ID, mac, person, ref } from "./fixtures/home-sandbox.js";
import { openTestHome, serveTestHost } from "./fixtures/test-home.js";

// BL-713 (PG-011; specs/repository-anti-corruption/slices/pg011-pg017-remaining.md §5, T-401): a signed package installed in the Home draws
// its stage in the Home: a page of its own, a stage in every project's workbench, and a place on the tool bar that follows its state.

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

/** The tool-bar entry a page draws for a package: the whole element, or none. */
const entryOf = (html: string, pluginId: string) => new RegExp(`<(a|button) [^>]*data-home-plugin-open="${pluginId.replaceAll(".", "\\.")}"[^>]*>.*?</\\1>`, "s").exec(html)?.[0];
const surfaceOf = (entry: string) => /data-work-surface-open="([^"]+)"/u.exec(entry)?.[1];
const stagesOf = (html: string) => [...html.matchAll(/<section class="desktop-work-surface pb-surface" data-work-surface="([^"]+)"[^>]* data-installed-plugin="([^"]+)"/gu)].map(match => ({ surface: match[1]!, plugin_id: match[2]! }));

test("RAC-2620 the arrival page and a project's tool bar offer a Home package beside the built-in tools, with the icon it picked and `package` when it picked none", mac, async t => {
  const h = await navHome(t);
  await h.install(PACKAGE_PLUGIN_ID, "book");
  await h.install(SECOND_PLUGIN_ID);
  const arrival = await h.page("/");
  assert.equal(arrival.status, 200);
  const first = entryOf(arrival.text, PACKAGE_PLUGIN_ID), second = entryOf(arrival.text, SECOND_PLUGIN_ID);
  assert.ok(first && second, "both packages are on the arrival page's tool bar");
  assert.ok(first.includes(icon("book")) && !first.includes(icon("package")), "the icon the package picked");
  assert.ok(second.includes(icon("package")), "no icon picked, the default");
  assert.match(first, /href="\/plugins\/io\.molis\.work\.example\.notes"/u, "it opens the package's page");
  const project = await h.page(h.projectPath);
  assert.equal(project.status, 200);
  assert.ok(entryOf(project.text, PACKAGE_PLUGIN_ID)?.includes(icon("book")), "the project's titlebar offers it too");
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
  for (const stage of stages) assert.equal(surfaceOf(entryOf(project.text, stage.plugin_id)!), stage.surface, `${stage.plugin_id}'s entry opens its own stage`);
});

test("RAC-2622 a package switched off leaves the tool bar and has no page; switched on again, it is back", mac, async t => {
  const h = await navHome(t);
  await h.install();
  assert.ok(entryOf((await h.page("/")).text, PACKAGE_PLUGIN_ID), "it runs, so it is offered");
  assert.equal((await h.home.web.post<{ disabled: boolean }>(`/api/plugins/${PACKAGE_PLUGIN_ID}/disable`, {})).disabled, true);
  assert.equal(entryOf((await h.page("/")).text, PACKAGE_PLUGIN_ID), undefined, "gone from the arrival page");
  const project = await h.page(h.projectPath);
  assert.equal(entryOf(project.text, PACKAGE_PLUGIN_ID), undefined, "gone from the project's titlebar");
  assert.deepEqual(stagesOf(project.text), [], "and its stage is not drawn");
  assert.equal((await h.page(`/plugins/${PACKAGE_PLUGIN_ID}`)).status, 404, "its page is not there");
  await h.home.web.post(`/api/plugins/${PACKAGE_PLUGIN_ID}/enable`, {});
  assert.ok(entryOf((await h.page("/")).text, PACKAGE_PLUGIN_ID), "back on the tool bar");
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
    assert.ok(entryOf((await h.page("/", served.origin)).text, PACKAGE_PLUGIN_ID), "it is still on the tool bar");
    const opened = await h.page(`/plugins/${PACKAGE_PLUGIN_ID}`, served.origin);
    assert.equal(opened.status, 200);
    assert.match(opened.text, reason, "the page says why");
    assert.ok(!opened.text.includes("<iframe"), "and does not frame the package");
    assert.match((await h.page(`/plugins/${PACKAGE_PLUGIN_ID}?frame=workbench`, served.origin)).text, reason, "the framed page is not the package's either");
    const project = await h.page(h.projectPath, served.origin);
    assert.deepEqual(stagesOf(project.text), [], "no stage is drawn for it in a project");
    assert.match(project.text, reason, "the project's placeholder says why");
  } finally { await served.close(); await host.close(); }
});

test("RAC-2624 a package that was uninstalled leaves the tool bar and has no page", mac, async t => {
  const h = await navHome(t);
  await h.install();
  assert.ok(entryOf((await h.page("/")).text, PACKAGE_PLUGIN_ID));
  await h.home.web.post(`/api/plugins/${PACKAGE_PLUGIN_ID}/uninstall`, { keep_data: false });
  assert.equal(entryOf((await h.page("/")).text, PACKAGE_PLUGIN_ID), undefined);
  assert.equal(entryOf((await h.page(h.projectPath)).text, PACKAGE_PLUGIN_ID), undefined);
  assert.equal((await h.page(`/plugins/${PACKAGE_PLUGIN_ID}`)).status, 404);
});

test("RAC-2626 the tool bar's entries are the person's page only: no action view an agent or an MCP client is shown carries them, and a plugin is shown none without a caller the Host issued", mac, async t => {
  const h = await navHome(t);
  await h.install(PACKAGE_PLUGIN_ID, "book");
  assert.ok(entryOf((await h.page("/")).text, PACKAGE_PLUGIN_ID), "the person's page has it");
  const seen = await Promise.all((["agent", "mcp"] as const).map(async audience =>
    JSON.stringify(await h.client.discover({ actor_id: "someone-else", audience, project_id: h.project.project_id, permissions: [] }))));
  for (const view of seen) assert.ok(!view.includes("home_plugin_nav") && !view.includes("data-home-plugin-open"), "no navigation data in an action view");
  // A plugin is shown nothing unless the Host issued it its caller (S-15); a context it writes itself is refused before any directory is read.
  await assert.rejects(h.client.discover({ actor_id: "someone-else", audience: "plugin", project_id: h.project.project_id, permissions: [] }), (error: unknown) => (error as { code?: string }).code === "host.plugin_caller_invalid");
});
