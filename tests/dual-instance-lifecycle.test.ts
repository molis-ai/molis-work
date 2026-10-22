import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { openDualHome } from "./fixtures/dual-home.js";

// DUAL-11 and DUAL-13 (specs/dual-instance-plugins/spec.md): each half's permissions and lifetime are its own record's. Neither half
// starts on the other's grants, stopping or restarting the Home half leaves the project half's handles as they were and never
// revives its own old ones, a deleted project takes its half with it and leaves the Home half's data, and closing the Home ends
// every Home handle. A stopped instance's handle answers `actions.forbidden`; one whose installation's grants went with its project
// (deleted, or the Home closed with it) answers `plugin.grant_denied`.

const stopped = { code: "actions.forbidden" }, revoked = { code: "plugin.grant_denied" };

test("DUAL-11 the Home record's permissions are its own: without a required one the Home half does not start, while the project half runs on its record", { timeout: 60_000 }, async t => {
  const s = await openDualHome(t), { actions } = s.dual;
  const context = await s.page();
  const platform = await s.home.host.homePlugins!.ready(), installId = s.provider();
  await platform.runtime.stop(installId);
  platform.runtime.grant(installId, s.dual.manifest.permissions.map(declared => declared.permission).filter(permission => permission !== s.dual.read));
  await assert.rejects(platform.runtime.start(installId), { code: "plugin.grant_denied" });
  const { home, project } = await s.records();
  assert.equal(home?.grants.includes(s.dual.read), false);
  assert.equal(project?.grants.includes(s.dual.read), true, "the project record holds the permission, and does not lend it");
  await assert.rejects(s.client.invoke(context, actions.home, {}), { code: "actions.missing" });
  assert.deepEqual(await s.client.invoke(context, actions.project, {}), { half: "project", project_id: s.projectId });
});

test("DUAL-13 switching the Home half off and on leaves the project half's handles working, and the Home half's old handles stay dead", { timeout: 60_000 }, async t => {
  const s = await openDualHome(t);
  await s.page();
  const oldHome = s.dual.services.home!.storage!, projectStore = s.dual.services.project!.storage!;
  oldHome.set("kept", "home");
  projectStore.set("kept", "project");
  await s.home.web.post(`/api/plugins/${s.dual.id}/disable`, {});
  assert.notEqual(s.home.host.homePlugins!.installation(s.dual.id)?.state, "running");
  assert.throws(() => oldHome.get("kept"), stopped, "a stopped Home half's handle is refused");
  assert.equal(projectStore.get("kept"), "project", "the project half is not stopped with it");

  await s.home.web.post(`/api/plugins/${s.dual.id}/enable`, {});
  assert.equal(s.home.host.homePlugins!.installation(s.dual.id)?.state, "running");
  const newHome = s.dual.services.home!.storage!;
  assert.notEqual(newHome, oldHome, "the restarted half is given new handles");
  assert.equal(newHome.get("kept"), "home", "its data outlives the stop");
  assert.throws(() => oldHome.get("kept"), stopped, "the old handle does not come back with the restart");
  assert.equal(projectStore.get("kept"), "project");
});

test("DUAL-13 deleting the project takes the project half's record and handles with it; the Home half and its data stay", { timeout: 60_000 }, async t => {
  const s = await openDualHome(t);
  await s.page();
  const homeStore = s.dual.services.home!.storage!, projectStore = s.dual.services.project!.storage!;
  homeStore.set("kept", "home");
  projectStore.set("kept", "project");
  await s.home.web.post(`/api/settings/projects/${s.projectId}/delete`, { delete_confirmed: true, idempotency_key: "dual-instance-delete" });
  assert.equal(existsSync(s.project.database_path), false, "the project half's record went with the project's database");
  assert.throws(() => projectStore.get("kept"), revoked, "the project half's handle went with it");
  assert.equal(s.home.host.homePlugins!.installation(s.dual.id)?.state, "running");
  assert.equal(homeStore.get("kept"), "home");
});

test("DUAL-13 closing the Home ends every handle of both halves", { timeout: 60_000 }, async t => {
  const s = await openDualHome(t);
  await s.page();
  const homeStore = s.dual.services.home!.storage!, projectStore = s.dual.services.project!.storage!;
  homeStore.set("kept", "home");
  await s.home.close();
  await s.home.host.close();
  assert.throws(() => homeStore.get("kept"), stopped);
  assert.throws(() => projectStore.get("kept"), revoked);
});
