// W6-02 (specs/repository-anti-corruption/roadmap-2026-10-07.md §4.10; RAC-1030–RAC-1034): the lifecycle the probe walks
// (tests/probe-plugin.test.ts, W4-01), walked by the shipped plugins that run on Plugin Runtime: Todo and Jelly on the Home
// supervisor, Pages and 灵光 on each project's. The walk itself is tests/fixtures/shipped-lifecycle.ts (the other plugins' files
// use it too: tests/shipped-plugin-lifecycle-*.test.ts); this file keeps the four producers it was written for and RAC-1034.
// Goals has migrated too (its walk is RAC-1230 below, BL-756): 常开, and its Home half is another installation. Alchemist is passed over (2026-10-23).
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import { answer, declared, serve, titlesOf, viewOf, walk, type Shipped } from "./fixtures/shipped-lifecycle.js";

const day = new Date().toISOString().slice(0, 10);
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
  // Goals 常开: the project cannot take it out, the walk takes the Home agreement back to uninstall, and each project's own half is
  // the installation this walk follows while the Home half keeps running (a second installation of the same plugin).
  goals: { key: "goals", plugin_id: "io.molis.work.goals", scope: "project", always_on: true, dual: "project",
    write: (web, routes, title) => web.post(`${routes}/goals`, { title }),
    titles: async (web, routes) => titlesOf((await web.get<{ goals: Array<{ title: string }> }>(`${routes}/goals/directory`)).goals) },
};

test("RAC-1030 W6-02 Todo on the Home supervisor: added, removed and added back in a project, revoked, upgraded and uninstalled", { timeout: 180_000 }, () => walk(SHIPPED.todo!));
test("RAC-1031 W6-02 Jelly on the Home supervisor: added, removed and added back in a project, revoked, upgraded and uninstalled", { timeout: 180_000 }, () => walk(SHIPPED.jelly!));
test("RAC-1032 W6-02 Pages on a project's supervisor: added, removed and added back, revoked, upgraded and uninstalled", { timeout: 180_000 }, () => walk(SHIPPED.pages!));
test("RAC-1033 W6-02 灵光 on a project's supervisor: added, removed and added back, revoked, upgraded and uninstalled", { timeout: 180_000 }, () => walk(SHIPPED.lingguang!));

test("RAC-1230 W6-02 Goals on a project's supervisor: 常开, the Home half is another installation, the data stays through the uninstall and the restart", { timeout: 180_000 }, () => walk(SHIPPED.goals!));

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
    // Inspection keeps the same caller: Kernel visibility refuses its withdrawn action before the plugin's own availability check.
    const read = (await served.host.inspectActions(person, project.reference)).find(isRead);
    assert.ok(read);
    assert.equal(read.availability.available, false);
    assert.equal(read.availability.code, "actions.forbidden");
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
