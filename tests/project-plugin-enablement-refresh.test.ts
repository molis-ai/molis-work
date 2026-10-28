import assert from "node:assert/strict";
import test from "node:test";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { runningProjectPlatform } from "@molis-ai/molis-work-app-local-host";
import { SCHEDULE_PLUGIN_ID } from "@molis-ai/molis-work-plugin-schedule";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";

// RAC-1120 (T-007, R-70 / BL-813): the enablement refresh each project request runs used to stop every switched-off plugin it still
// counted as enabled, crashed ones included; the Runtime refuses to stop an installation that is not running (`plugin.state_invalid`),
// and the refusal failed the request that ran into the refresh (the revoke before it means the next refresh no longer tries). The
// refresh now takes that one refusal as "left as it is" and throws every other failure. The same refusal covers a running plugin whose
// stop, queued by the revoke, fails in its stop hook and leaves it crashed before the refresh's own stop runs; no case here has such
// a hook, so that window rests on the refresh accepting only `plugin.state_invalid` (a failing stop hook itself is `plugin.executor_failed`).
test("RAC-1120 a project plugin that crashed and is then switched off stays as it is, the project's pages keep answering, and adding it back starts it", async t => {
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

  const plugins = (change: "addProjectPlugin" | "removeProjectPlugin") => withMolisWorkProjectCatalog({ homeDirectory: home },
    catalog => { catalog[change]({ project_id: one.project_id, plugin_id: "schedule", actor_id: "test" }); });
  await plugins("removeProjectPlugin");
  for (const path of ["/", "/api/board", "/"]) assert.equal(await page(path), 200, path);
  assert.equal(platform.supervisor.enabledPluginIds().includes(SCHEDULE_PLUGIN_ID), false, "switched off");
  assert.equal(platform.runtime.get(installId).state, "crashed", "left as it was: not stopped, not started");

  await plugins("addProjectPlugin");
  assert.equal(await page("/"), 200);
  assert.equal(platform.supervisor.state(SCHEDULE_PLUGIN_ID)?.status, "running");
  assert.equal(platform.runtime.get(installId).state, "running", "adding it back recovers and starts the same installation");
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

  const plugins = (change: "addProjectPlugin" | "removeProjectPlugin") => withMolisWorkProjectCatalog({ homeDirectory: home },
    catalog => { catalog[change]({ project_id: one.project_id, plugin_id: "schedule", actor_id: "test" }); });
  await plugins("removeProjectPlugin");
  for (const path of ["/", "/api/board"]) assert.equal(await page(path), 200, path);
  assert.equal(platform.runtime.get(installId).state, "quarantined", "switching it off does not touch it");
  await plugins("addProjectPlugin");
  assert.equal(await page("/"), 200);
  assert.equal(platform.runtime.get(installId).state, "quarantined", "adding it back does not release it: only an explicit release does");
  assert.notEqual(platform.supervisor.state(SCHEDULE_PLUGIN_ID)?.status, "running");
});
