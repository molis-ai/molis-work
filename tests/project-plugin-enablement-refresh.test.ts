import assert from "node:assert/strict";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { ensureProjectPlugins, runningProjectPlatform } from "@molis-ai/molis-work-app-local-host";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { CODING_PLUGIN_ID } from "@molis-ai/molis-work-plugin-coding";
import { registration as coding } from "@molis-ai/molis-work-plugin-coding/registration";
import { GIT_PLUGIN_ID } from "@molis-ai/molis-work-plugin-git";
import { registration as git } from "@molis-ai/molis-work-plugin-git/registration";
import { HOST_BUILD_TRUST } from "@molis-ai/molis-work-plugin-runtime";
import { createSchedulePlugin, SCHEDULE_PLUGIN_ID } from "@molis-ai/molis-work-plugin-schedule";
import { registration as schedule } from "@molis-ai/molis-work-plugin-schedule/registration";
import { openTestSqlite } from "@molis-ai/molis-work-test-kit/sqlite";
import { deferred, serveHomeRuntime } from "./fixtures/home-runtime.js";

// RAC-1120 (T-007, R-70 / BL-813): the enablement refresh each project request runs used to stop every switched-off plugin it still
// counted as enabled, crashed ones included; the Runtime refused to stop an installation that was not running (`plugin.state_invalid`),
// and the refusal failed the request that ran into the refresh (the revoke before it means the next refresh no longer tries). Since
// T-034 the Runtime records a stopped crashed or never-started installation disabled and refuses only a quarantined one; the refresh
// leaves a quarantine in place and finishes recording other stopped installations as disabled.
test("RAC-1120 a project plugin that crashed and is then switched off is recorded disabled, the project's pages keep answering, and adding it back starts it", async t => {
  const { home, host, project, request } = await serveHomeRuntime(t);
  const one = await project("Crashed, then switched off");
  const page = async (path: string) => (await request(`/projects/${one.project_id}${path}`)).status;
  assert.equal(await page("/"), 200); // opening the project page starts its plugin platform
  const platform = await host.withProject(one.reference, runtime => runningProjectPlatform(runtime.store, one.project_id));
  assert.ok(platform);
  const installId = platform.supervisor.state(SCHEDULE_PLUGIN_ID)!.install_id!;
  await platform.runtime.reportCrash(installId);
  assert.equal(platform.runtime.get(installId).state, "crashed");
  assert.ok(platform.supervisor.enabledPluginIds().includes(SCHEDULE_PLUGIN_ID), "the supervisor still counts a crashed plugin enabled");

  const plugins = (change: "addProjectPlugin" | "removeProjectPlugin") => host.ensureWebCatalog(home, openMolisWorkProjectCatalog).withCatalog({ homeDirectory: home },
    catalog => { catalog[change]({ project_id: one.project_id, plugin_id: "schedule", actor_id: "test" }); });
  await plugins("removeProjectPlugin");
  for (const path of ["/", "/api/board", "/"]) assert.equal(await page(path), 200, path);
  assert.equal(platform.supervisor.enabledPluginIds().includes(SCHEDULE_PLUGIN_ID), false, "switched off");
  assert.equal(platform.runtime.get(installId).state, "disabled", "switching it off is a stop: recorded disabled, not started");

  await plugins("addProjectPlugin");
  assert.equal(await page("/"), 200);
  assert.equal(platform.supervisor.state(SCHEDULE_PLUGIN_ID)?.status, "running");
  assert.equal(platform.runtime.get(installId).state, "running", "adding it back starts the same installation");
});

test("RAC-1120 a quarantined project plugin switched off and back on stays quarantined, and the project's pages keep answering", async t => {
  const { home, host, project, request } = await serveHomeRuntime(t);
  const one = await project("Quarantined, then switched off");
  const page = async (path: string) => (await request(`/projects/${one.project_id}${path}`)).status;
  assert.equal(await page("/"), 200);
  const platform = await host.withProject(one.reference, runtime => runningProjectPlatform(runtime.store, one.project_id));
  assert.ok(platform);
  const installId = platform.supervisor.state(SCHEDULE_PLUGIN_ID)!.install_id!;
  // Every recovery counts; past the Runtime's limit (three) the next one quarantines the installation instead.
  for (let n = 0; n < 3; n++) { await platform.runtime.reportCrash(installId); await platform.runtime.recover(installId); }
  await platform.runtime.reportCrash(installId);
  await assert.rejects(platform.runtime.recover(installId), { code: "plugin.quarantined" });
  assert.equal(platform.runtime.get(installId).state, "quarantined");

  const plugins = (change: "addProjectPlugin" | "removeProjectPlugin") => host.ensureWebCatalog(home, openMolisWorkProjectCatalog).withCatalog({ homeDirectory: home },
    catalog => { catalog[change]({ project_id: one.project_id, plugin_id: "schedule", actor_id: "test" }); });
  await plugins("removeProjectPlugin");
  for (const path of ["/", "/api/board"]) assert.equal(await page(path), 200, path);
  assert.equal(platform.runtime.get(installId).state, "quarantined", "switching it off does not touch it");
  await plugins("addProjectPlugin");
  assert.equal(await page("/"), 200);
  assert.equal(platform.runtime.get(installId).state, "quarantined", "adding it back does not release it: only an explicit release does");
  assert.notEqual(platform.supervisor.state(SCHEDULE_PLUGIN_ID)?.status, "running");
});

async function projectRefreshFixture(t: TestContext, title: string) {
  const { home, host, project, request } = await serveHomeRuntime(t);
  const one = await project(title);
  const page = () => request(`/projects/${one.project_id}/`);
  assert.equal((await page()).status, 200);
  const { platform, db, state } = await host.withProject(one.reference, async runtime => ({
    platform: await runningProjectPlatform(runtime.store, one.project_id),
    db: runtime.store.db,
    state: await ensureProjectPlugins({
      store: runtime.store, artifacts: runtime.artifacts, processItems: runtime.processItems,
      projectId: one.project_id, actorId: LOCAL_PERSON_ACTOR_ID, homeDirectory: home,
      actions: { registry: host.actionRegistry(one.reference), client: host.actionClient(one.reference), project_id: one.project_id },
    }),
  }));
  assert.ok(platform && state.refreshEnablement);
  assert.equal(state.platform, platform);
  const catalog = host.ensureWebCatalog(home, openMolisWorkProjectCatalog);
  const membership = () => catalog.withCatalog({ homeDirectory: home }, value => value.projectPluginMembership(one.project_id));
  const setMember = (plugin_id: string, enabled: boolean) => catalog.withCatalog({ homeDirectory: home }, value => value.commit(() =>
    value[enabled ? "addProjectPlugin" : "removeProjectPlugin"]({ project_id: one.project_id, plugin_id, actor_id: "test" })));
  const events = () => {
    const read = openTestSqlite(join(home, "projects", "catalog.db"), { readonly: true });
    try {
      return read.prepare("SELECT event_id, type, payload_json FROM project_events WHERE project_id = ? AND type IN ('project.plugin_added', 'project.plugin_removed') ORDER BY rowid").all(one.project_id);
    } finally { read.close(); }
  };
  const installId = (pluginId: string) => {
    const id = platform.supervisor.state(pluginId)?.install_id;
    assert.ok(id);
    return id;
  };
  return { platform, db, page, refresh: state.refreshEnablement, membership, setMember, events, installId };
}

function replaceFactory(t: TestContext, entry: PluginRegistration, alter: (definition: PluginDefinition) => PluginDefinition) {
  const runtime = entry.project_runtime;
  assert.ok(runtime);
  const create = runtime.create;
  t.mock.method(runtime, "create", () => alter(create()));
}

function beforeStart(t: TestContext, entry: PluginRegistration, before: (context: PluginStartContext) => void | Promise<void>) {
  replaceFactory(t, entry, definition => ({ ...definition, async start(context) {
    await before(context);
    return definition.start(context);
  } }));
}

test("SPC-C08 a failed membership enable recovers on the existing project page, leaving an unrelated crash alone", async t => {
  let failStart = false;
  beforeStart(t, schedule, () => { if (failStart) throw new Error("test Schedule start failure"); });
  const f = await projectRefreshFixture(t, "Retry enablement");
  const installId = f.installId(SCHEDULE_PLUGIN_ID);
  await f.setMember("git", true);
  await f.setMember("schedule", false);
  assert.deepEqual(await f.refresh(), []);
  const unrelated = f.installId(GIT_PLUGIN_ID);
  await f.platform.runtime.reportCrash(unrelated);

  failStart = true;
  await f.setMember("schedule", true);
  assert.deepEqual(await f.refresh(), [{
    plugin_id: SCHEDULE_PLUGIN_ID, desired_enabled: true, reason: "Plugin entrypoint 启动失败，已记录为 crashed",
  }]);
  assert.equal(f.platform.runtime.get(installId).state, "crashed");
  assert.ok(f.platform.supervisor.enabledPluginIds().includes(SCHEDULE_PLUGIN_ID));
  assert.equal(f.platform.runtime.get(unrelated).state, "crashed");
  const saved = await f.membership(), events = f.events();
  assert.ok(saved.plugins.includes("schedule"));

  failStart = false;
  assert.equal((await f.page()).status, 200);
  assert.equal(f.platform.runtime.get(installId).state, "running");
  assert.equal(f.platform.runtime.get(unrelated).state, "crashed");
  assert.deepEqual(await f.membership(), saved);
  assert.deepEqual(f.events(), events);
});

test("SPC-C08 a real failure of the explicitly awaited stop remains resumable after revoke", async t => {
  const f = await projectRefreshFixture(t, "Retry disablement");
  const installId = f.installId(SCHEDULE_PLUGIN_ID);
  const stop = f.platform.runtime.stop.bind(f.platform.runtime);
  const failedStops: string[] = [];
  t.mock.method(f.platform.runtime, "stop", async (...args: Parameters<typeof stop>) => {
    try { return await stop(...args); }
    catch (error) { if (args[0] === installId) failedStops.push(String(error)); throw error; }
  });
  // Fail the actual persistence from both the revoke's queued stop and the refresh's explicitly awaited stop.
  f.db.exec(`CREATE TEMP TRIGGER fail_schedule_disable BEFORE UPDATE ON plugin_runtime_installs
    WHEN json_extract(NEW.record_json, '$.plugin_id') = '${SCHEDULE_PLUGIN_ID}' AND json_extract(NEW.record_json, '$.state') = 'disabled'
    BEGIN SELECT RAISE(ABORT, 'test Schedule disabled write'); END`);
  await f.setMember("schedule", false);
  const saved = await f.membership(), events = f.events();
  assert.equal(saved.plugins.includes("schedule"), false);
  try {
    assert.deepEqual(await f.refresh(), [{ plugin_id: SCHEDULE_PLUGIN_ID, desired_enabled: false, reason: "插件停用未完成" }]);
    assert.equal(failedStops.length, 2, "the explicitly awaited stop must fail as well as the background stop");
    for (const failure of failedStops) assert.match(failure, /test Schedule disabled write/u);
    assert.equal(f.platform.supervisor.enabledPluginIds().includes(SCHEDULE_PLUGIN_ID), false);
    assert.equal(f.platform.runtime.get(installId).state, "running", "the disabled record was refused");
    assert.equal((await f.page()).status, 200, "other project content remains available during failure");
  } finally { f.db.exec("DROP TRIGGER fail_schedule_disable"); }

  assert.equal((await f.page()).status, 200);
  assert.equal(f.platform.runtime.get(installId).state, "disabled");
  assert.deepEqual(await f.membership(), saved);
  assert.deepEqual(f.events(), events);
});

for (const changed of ["membership reversed", "uninstalled", "reinstalled"] as const) {
  test(`SPC-C08 an incomplete enable does not start a plugin after ${changed}`, async t => {
    let starts = 0, failStart = false;
    let pauseGit = false;
    const entered = deferred(), release = deferred();
    beforeStart(t, schedule, () => { starts++; if (failStart) throw new Error("test Schedule start failure"); });
    if (changed === "membership reversed") beforeStart(t, git, async () => {
      if (pauseGit) { entered.resolve(); await release.promise; }
    });
    const f = await projectRefreshFixture(t, changed);
    const installId = f.installId(SCHEDULE_PLUGIN_ID);
    if (changed === "membership reversed") await f.setMember("git", false);
    await f.setMember("schedule", false);
    assert.deepEqual(await f.refresh(), []);
    failStart = true;
    await f.setMember("schedule", true);
    const unfinished = await f.refresh();
    assert.equal(unfinished?.some(change => change.plugin_id === SCHEDULE_PLUGIN_ID && change.desired_enabled), true);
    assert.equal(f.platform.runtime.get(installId).state, "crashed");

    const prior = f.platform.runtime.get(installId);
    if (changed === "membership reversed") {
      // The round initially reads Schedule as enabled, then awaits Git before reaching Schedule's retry.
      pauseGit = true;
      await f.setMember("git", true);
      const round = f.refresh();
      await Promise.race([entered.promise, round.then(() => assert.fail("the first switch never reached its start hook"))]);
      try { await f.setMember("schedule", false); }
      finally { release.resolve(); }
      assert.deepEqual(await round, []);
    } else await f.platform.runtime.uninstall(installId);
    if (changed === "reinstalled") {
      const { install } = f.platform.runtime.install({ definition: createSchedulePlugin(), trust: HOST_BUILD_TRUST, deployment: "local" });
      assert.equal(install.install_id, installId);
      assert.notEqual(install.installation_generation, prior.installation_generation);
    }
    failStart = false;
    const attempts = starts, events = f.events();
    assert.equal((await f.page()).status, 200);
    const expected = changed === "membership reversed" ? "disabled" : changed === "uninstalled" ? "uninstalled" : "installed";
    assert.equal(f.platform.runtime.get(installId).state, expected);
    assert.equal(starts, attempts);
    assert.deepEqual(f.events(), events);
  });
}

test("SPC-C08 a permission withdrawn while enablement is in flight stays withdrawn on recovery", async t => {
  const entered = deferred(), release = deferred();
  let waitAndFail = false;
  let lastGrants: readonly string[] = [];
  beforeStart(t, coding, async context => {
    lastGrants = context.grants;
    if (!waitAndFail) return;
    entered.resolve();
    await release.promise;
    throw new Error("test Coding start failure");
  });
  const f = await projectRefreshFixture(t, "Withdraw while enabling");
  await f.setMember("coding", true);
  assert.deepEqual(await f.refresh(), []);
  const installId = f.installId(CODING_PLUGIN_ID);
  assert.ok(lastGrants.includes("model:invoke"));
  await f.setMember("coding", false);
  assert.deepEqual(await f.refresh(), []);

  waitAndFail = true;
  await f.setMember("coding", true);
  const attempt = f.refresh();
  await Promise.race([entered.promise, attempt.then(() => assert.fail("the real start never reached its hook"))]);
  const withdrawn = f.platform.runtime.regrant(installId, "model:invoke", false);
  release.resolve();
  const [unfinished, receipt] = await Promise.all([attempt, withdrawn]);
  assert.equal(unfinished?.some(change => change.plugin_id === CODING_PLUGIN_ID && change.desired_enabled), true);
  assert.equal(receipt.install.grants.includes("model:invoke"), false);

  waitAndFail = false;
  assert.equal((await f.page()).status, 200);
  assert.equal(f.platform.runtime.get(installId).state, "running");
  assert.equal(lastGrants.includes("model:invoke"), false);
  assert.equal(f.platform.runtime.get(installId).grants.includes("model:invoke"), false);
});

test("SPC-C08 a blocked plugin stays unavailable and is reported without failing the project page", async t => {
  replaceFactory(t, schedule, definition => ({
    ...definition,
    manifest: { ...definition.manifest, requires: [{ capability_id: "test.missing.provider", version: 1, reason: "Missing test dependency" }] },
    async start() { assert.fail("an unresolved dependency must prevent activation"); },
  }));
  const f = await projectRefreshFixture(t, "Blocked dependency");
  await f.setMember("schedule", false);
  assert.deepEqual(await f.refresh(), []);
  await f.setMember("schedule", true);
  assert.deepEqual(await f.refresh(), [{
    plugin_id: SCHEDULE_PLUGIN_ID, desired_enabled: true, reason: "必需依赖 test.missing.provider@1 没有提供者：Missing test dependency",
  }]);
  assert.equal(f.platform.supervisor.state(SCHEDULE_PLUGIN_ID)?.status, "blocked");
  assert.equal((await f.page()).status, 200);
  assert.equal(f.platform.runtime.list().some(install => install.plugin_id === SCHEDULE_PLUGIN_ID), false);
});
