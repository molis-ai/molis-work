// W6-02 (specs/repository-anti-corruption/roadmap-2026-10-07.md §4.10; RAC-1030–RAC-1034): the lifecycle the probe walks
// (tests/probe-plugin.test.ts, W4-01), walked by the shipped plugins that run on Plugin Runtime: Todo and Jelly on the Home
// supervisor, Pages and 灵光 on each project's. Each in a one-off Home with the product's Host and web server: what the person
// wrote stays through removal from the project and adding back, through a revoked permission and its return, and through an
// upgrade; uninstalled, nothing of it is left to call, after a restart too. The upgrade a shipped plugin gets is a newer build of its package: the
// Home's installation record was written by an older build, and the next start moves the same installation onto this build.
// This delivered walk covers these four producers; Goals has migrated but its additional walk remains BL-756. Alchemist is passed over (2026-10-23).
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, projectActionAvailability, runningProjectPlatform } from "@molis-ai/molis-work-app-local-host";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import { SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { homeSqlitePath } from "@molis-ai/molis-work-storage";
import { isLocalHostHttpError } from "@molis-ai/molis-work-test-kit/local-host-http";
import { serveTestHost, type TestHostServer, type TestProject } from "./fixtures/test-home.js";

type Web = TestHostServer["web"];
/** One shipped plugin: where its supervisor runs it, and how the person writes one thing in it and reads back what is there. */
interface Shipped {
  readonly key: string;
  readonly plugin_id: string;
  readonly scope: "home" | "project";
  write(web: Web, routes: string, title: string): Promise<unknown>;
  titles(web: Web, routes: string): Promise<string[]>;
}
const day = new Date().toISOString().slice(0, 10);
const titlesOf = (items: ReadonlyArray<{ title: string }>) => items.map(item => item.title);
const SHIPPED: Record<string, Shipped> = {
  todo: { key: "todo", plugin_id: "io.molis.work.todo", scope: "home",
    write: (web, routes, title) => web.post(`${routes}/items`, { title }),
    titles: async (web, routes) => titlesOf((await web.get<{ items: Array<{ title: string }> }>(`${routes}/items?view=all`)).items) },
  jelly: { key: "jelly", plugin_id: "io.molis.work.jelly", scope: "home",
    write: async (web, routes, title) => {
      const { state } = await web.get<{ state: { revision: number } }>(`${routes}/`);
      return web.post(`${routes}/commands`, { expected_revision: state.revision, command: { type: "item.create", item: { title, start_date: day } } });
    },
    titles: async (web, routes) => titlesOf((await web.get<{ state: { items: Array<{ title: string }> } }>(`${routes}/`)).state.items) },
  pages: { key: "pages", plugin_id: "io.molis.work.pages", scope: "project",
    write: (web, routes, title) => web.post(`${routes}/pages`, { title, markdown: "第一稿" }),
    titles: async (web, routes) => titlesOf((await web.get<{ documents: Array<{ title: string }> }>(`${routes}/pages`)).documents) },
  lingguang: { key: "lingguang", plugin_id: "io.molis.work.lingguang", scope: "project",
    write: (web, routes, title) => web.post(`${routes}/sparks`, { title, body: "材料" }),
    titles: async (web, routes) => titlesOf((await web.get<{ sparks: Array<{ title: string }> }>(`${routes}/sparks`)).sparks) },
};

/** The product's Host over the product's web server, as tests/fixtures/test-home.ts makes it, here opened again on the same Home. */
async function serve(home: string) {
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null,
    workspacesFor: projectId => withMolisWorkProjectCatalog({ homeDirectory: home }, catalog => catalog.listWorkspaceDirectory(projectId)),
    actionAvailability: projectActionAvailability(withMolisWorkProjectCatalog, home) });
  const served = await serveTestHost(null, { home, host });
  return { ...served, host, async shut() { await served.close(); await host.close(); } };
}
type Served = Awaited<ReturnType<typeof serve>>;
/** What a request answered: 200, or the refusal's status and code. */
async function answer(request: Promise<unknown>): Promise<number | string> {
  try { await request; return 200; } catch (error) {
    if (isLocalHostHttpError(error)) return error.code ? `${error.status} ${error.code}` : error.status;
    throw error;
  }
}
/** The actions the build declares for the plugin, as the person's directory in a project names them. */
function declared(pluginId: string): string[] {
  const entry = BUILTIN_PLUGIN_CATALOG.find(item => item.manifest.plugin_id === pluginId);
  assert.ok(entry, pluginId);
  return (entry.manifest.actions ?? []).filter(action => action.action.audiences.includes("user")).map(action => `${action.capability_id}@${action.version}`).sort();
}

/** Where the plugin is, for one Host: its routes in the project, the person's directory, and its installation. */
function viewOf(served: Served, project: TestProject, plugin: Shipped) {
  const routes = `/projects/${encodeURIComponent(project.project_id)}/api/plugins/${plugin.plugin_id}`;
  const platform = async () => plugin.scope === "home" ? await served.host.homePlugins!.ready()
    : await served.host.withProject(project.reference, runtime => runningProjectPlatform(runtime.store, project.project_id));
  return {
    routes,
    platform: async () => { const running = await platform(); assert.ok(running, `${plugin.key}: the ${plugin.scope} platform runs`); return running; },
    /** The plugin's actions the person may call in the project now. */
    async callable() {
      const views = await served.host.actionClient(project.reference).discover(await served.host.localPersonContext(project.reference));
      return views.filter(view => view.provider.plugin_id === plugin.plugin_id && view.availability.available).map(view => `${view.capability_id}@${view.version}`).sort();
    },
    async installation() {
      const record = (await platform())?.runtime.list().find(item => item.plugin_id === plugin.plugin_id);
      return record ? { install_id: record.install_id, state: record.state, version: record.version, trust: record.publisher_trust, grants: [...record.grants] } : null;
    },
  };
}

async function walk(plugin: Shipped) {
  const home = await mkdtemp(join(tmpdir(), `shipped-lifecycle-${plugin.key}-`));
  const build = BUILTIN_PLUGIN_CATALOG.find(item => item.manifest.plugin_id === plugin.plugin_id)!.manifest.version;
  let served = await serve(home);
  try {
    const project = await served.createProject("Lifecycle");
    const settings = `/api/settings/projects/${encodeURIComponent(project.project_id)}/plugins`;
    let at = viewOf(served, project, plugin);

    // Shipped and personal: in every project from the start, run by its supervisor with the Host build's trust.
    // What the person may call: the actions it declares for them, but those that need a model (this Home has none).
    const callable = await at.callable();
    assert.ok(callable.length > 0 && callable.every(action => declared(plugin.plugin_id).includes(action)), `${plugin.key}: its own actions, for the person`);
    await plugin.write(served.web, at.routes, "first");
    assert.deepEqual(await plugin.titles(served.web, at.routes), ["first"]);
    const first = await at.installation();
    assert.ok(first);
    assert.deepEqual({ state: first.state, version: first.version, trust: first.trust }, { state: "running", version: build, trust: "host" });

    // Taken out of the project: its routes and actions there are refused; the installation (shared, or the project's) keeps running.
    assert.equal(await answer(served.web.delete(settings, { plugin_id: plugin.key })), 200);
    assert.equal(await answer(plugin.titles(served.web, at.routes)), "403 actions.plugin_disabled", `${plugin.key}: removed from the project`);
    assert.deepEqual(await at.callable(), [], `${plugin.key}: nothing of it to call in the project`);
    assert.equal((await at.installation())?.state, "running");
    // Added back: what was written is there.
    assert.equal(await answer(served.web.post(settings, { plugin_id: plugin.key })), 200);
    assert.deepEqual(await plugin.titles(served.web, at.routes), ["first"], `${plugin.key}: added back, with its data`);
    assert.deepEqual(await at.callable(), callable);

    // A permission it requires taken back: it does not start, and nothing of it is called; given back, it runs with its data.
    const running = await at.platform();
    await running.runtime.stop(first.install_id);
    running.runtime.grant(first.install_id, first.grants.filter(permission => permission !== "storage:private"));
    await assert.rejects(running.runtime.start(first.install_id), { code: "plugin.grant_denied" });
    assert.equal(await answer(plugin.titles(served.web, at.routes)), "503 actions.plugin_unavailable", `${plugin.key}: revoked`);
    assert.deepEqual(await at.callable(), []);
    assert.equal((await at.installation())?.state, "disabled");
    running.runtime.grant(first.install_id, first.grants);
    await running.runtime.start(first.install_id);
    assert.deepEqual(await plugin.titles(served.web, at.routes), ["first"], `${plugin.key}: the permission given back`);

    // Upgrade: the Home last ran an older build of the plugin. The next start moves the same installation onto this build.
    await served.shut();
    const db = new DatabaseSync(plugin.scope === "home" ? homeSqlitePath(home, "plugin-runtime") : project.database_path);
    try {
      const records = new SqlitePluginRuntimeRepository(db), stored = records.get(first.install_id);
      assert.ok(stored);
      records.save({ ...stored, version: "0.2.0", manifest_digest: "sha256:an-older-build" });
    } finally { db.close(); }
    served = await serve(home);
    at = viewOf(served, project, plugin);
    assert.deepEqual(await plugin.titles(served.web, at.routes), ["first"], `${plugin.key}: the upgrade keeps its data`);
    assert.deepEqual(await at.installation(), { ...first, state: "running", version: build }, `${plugin.key}: the same installation, at this build`);
    assert.deepEqual(await at.callable(), callable);

    // Uninstalled: no route, no action, the record says so.
    const upgraded = await at.platform();
    await upgraded.runtime.stop(first.install_id);
    await upgraded.runtime.uninstall(first.install_id, { retain_private_data: false });
    assert.equal((await at.installation())?.state, "uninstalled");
    assert.equal(await answer(plugin.titles(served.web, at.routes)), "404 actions.missing", `${plugin.key}: uninstalled, its route says so`);
    assert.deepEqual(await at.callable(), []);

    // Neither supervisor installs it again on the next start (W3-06-F-06 for the Home's, BL-755 for a project's).
    await served.shut();
    served = await serve(home);
    at = viewOf(served, project, plugin);
    assert.equal(await answer(plugin.titles(served.web, at.routes)), "404 actions.missing", `${plugin.key}: not there after a restart`);
    assert.equal((await at.installation())?.state, "uninstalled", `${plugin.key}: still uninstalled after a restart`);
    assert.deepEqual(await at.callable(), []);
  } finally {
    await served.shut();
    await rm(home, { recursive: true, force: true });
  }
}

test("RAC-1030 W6-02 Todo on the Home supervisor: added, removed and added back in a project, revoked, upgraded and uninstalled", { timeout: 180_000 }, () => walk(SHIPPED.todo!));
test("RAC-1031 W6-02 Jelly on the Home supervisor: added, removed and added back in a project, revoked, upgraded and uninstalled", { timeout: 180_000 }, () => walk(SHIPPED.jelly!));
test("RAC-1032 W6-02 Pages on a project's supervisor: added, removed and added back, revoked, upgraded and uninstalled", { timeout: 180_000 }, () => walk(SHIPPED.pages!));
test("RAC-1033 W6-02 灵光 on a project's supervisor: added, removed and added back, revoked, upgraded and uninstalled", { timeout: 180_000 }, () => walk(SHIPPED.lingguang!));

test("RAC-1034 W6-02 BL-755 a project's supervisor keeps uninstall, restarts a legacy disabled personal plugin, and still refuses revoked grants", { timeout: 180_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "shipped-lifecycle-restart-"));
  let served = await serve(home);
  try {
    const project = await served.createProject("Restart");
    const settings = `/api/settings/projects/${encodeURIComponent(project.project_id)}/plugins`;
    // Schedule is in a new project by its plugin list (not personal); Pages is personal.
    const schedule: Shipped = { key: "schedule", plugin_id: "io.molis.work.schedule", scope: "project", write: async () => undefined, titles: async () => [] };
    const pages = SHIPPED.pages!;
    let scheduleAt = viewOf(served, project, schedule), pagesAt = viewOf(served, project, pages);
    assert.ok((await scheduleAt.callable()).length > 0, "the project's plugins have started");
    const scheduleInstall = await scheduleAt.installation(), pagesInstall = await pagesAt.installation();
    assert.ok(scheduleInstall && pagesInstall);
    assert.deepEqual([scheduleInstall.state, pagesInstall.state], ["running", "running"]);
    await pages.write(served.web, pagesAt.routes, "kept through restart");
    const pagesCallable = await pagesAt.callable();
    assert.ok(pagesCallable.length > 0 && pagesCallable.every(action => declared(pages.plugin_id).includes(action)), 'Pages offers its declared actions that this Home can use');
    const noModel = async () => {
      const views = await served.host.actionClient(project.reference).discover(await served.host.localPersonContext(project.reference));
      const modelActions = views.filter(view => view.provider.plugin_id === pages.plugin_id && ["pages.ai", "pages.generate"].includes(view.capability_id));
      assert.equal(modelActions.length, 2);
      for (const view of modelActions) {
        assert.equal(view.availability.available, false, 'this fixture explicitly has no model');
        assert.match(view.availability.reason ?? '', /模型|model/i, 'the refusal is the actual model availability boundary');
      }
    };
    await noModel();
    const running = await scheduleAt.platform();
    await running.runtime.stop(scheduleInstall.install_id);
    await running.runtime.uninstall(scheduleInstall.install_id, { retain_private_data: false });
    // Root choice A: reproduce the disabled record old project shutdown left; this is not a project-side user disable entry.
    await running.runtime.stop(pagesInstall.install_id);

    await served.shut();
    served = await serve(home);
    scheduleAt = viewOf(served, project, schedule); pagesAt = viewOf(served, project, pages);
    assert.equal(await answer(served.web.get(`${scheduleAt.routes}/list`)), "404 actions.missing", "Schedule: not installed again by the start");
    assert.equal((await scheduleAt.installation())?.state, "uninstalled");
    assert.deepEqual(await scheduleAt.callable(), []);
    assert.equal(await answer(pages.titles(served.web, pagesAt.routes)), 200, "Pages: a legacy disabled record restarts normally");
    assert.equal((await pagesAt.installation())?.state, "running");
    assert.deepEqual(await pagesAt.callable(), pagesCallable, 'a restart restores the same callable actions, without inventing a model');
    await noModel();

    // POLICY 7.8: the Host build keeps required grants; an optional permission the person withdrew stays off across a restart.
    assert.equal(BUILTIN_PLUGIN_CATALOG.find(entry => entry.manifest.plugin_id === pages.plugin_id)!.manifest.permissions
      .find(permission => permission.permission === "pages:read")?.required, false);
    const narrowedGrants = pagesInstall.grants.filter(permission => permission !== "pages:read");
    const reopened = await pagesAt.platform();
    await reopened.runtime.stop(pagesInstall.install_id);
    reopened.runtime.grant(pagesInstall.install_id, narrowedGrants);
    await served.shut();
    served = await serve(home);
    scheduleAt = viewOf(served, project, schedule); pagesAt = viewOf(served, project, pages);
    assert.equal(await answer(pages.titles(served.web, pagesAt.routes)), "400 plugin.grant_denied", "Pages: the route's Host client refuses its withdrawn read grant before action dispatch");
    assert.deepEqual(await pagesAt.installation(), { ...pagesInstall, state: "running", grants: narrowedGrants }, "the same installation runs without silently returning the optional grant");
    const person = await served.host.localPersonContext(project.reference);
    const isRead = (view: { provider: { plugin_id?: string }; capability_id: string }) => view.provider.plugin_id === pages.plugin_id && view.capability_id === "pages.list";
    assert.equal((await served.host.actionClient(project.reference).discover(person)).some(isRead), false, "the person's actual directory hides a read that this installation no longer grants");
    // Composition inspection exposes registered availability, without borrowing permissions or granting an invocation.
    const read = (await served.host.inspectActions(person, project.reference)).find(isRead);
    assert.ok(read);
    assert.equal(read.availability.available, false);
    assert.equal(read.availability.code, "actions.plugin_permission");
    const denied = await pagesAt.platform();
    await denied.runtime.stop(pagesInstall.install_id);
    denied.runtime.grant(pagesInstall.install_id, pagesInstall.grants);
    await denied.runtime.start(pagesInstall.install_id);
    assert.equal(await answer(pages.titles(served.web, pagesAt.routes)), 200, "Pages: explicitly returning grants restores execution");
    assert.deepEqual(await pages.titles(served.web, pagesAt.routes), ["kept through restart"], "the original content survives both restarts and the permission's return");
    assert.deepEqual(await pagesAt.installation(), pagesInstall, "restoring permission does not replace the installation");
    assert.deepEqual(await pagesAt.callable(), pagesCallable);

    // Taken out of the project and added back: the list does not install it again either.
    assert.equal(await answer(served.web.delete(settings, { plugin_id: "schedule" })), 200);
    assert.equal(await answer(served.web.post(settings, { plugin_id: "schedule" })), 200);
    assert.equal(await answer(served.web.get(`${scheduleAt.routes}/list`)), "404 actions.missing", "Schedule: the project's list does not install it again");
    assert.equal((await scheduleAt.installation())?.state, "uninstalled");
  } finally {
    await served.shut();
    await rm(home, { recursive: true, force: true });
  }
});
