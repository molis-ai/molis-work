import assert from "node:assert/strict";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { runningProjectPlatform } from "@molis-ai/molis-work-app-local-host";
import { PROJECT_WORKSPACE_PROVIDER_ID, projectPluginActions, type VersionedProjectPluginMembership } from "@molis-ai/molis-work-contracts/modules/projects";
import { ActionError, bindActionClient, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { SCHEDULE_PLUGIN_ID } from "@molis-ai/molis-work-plugin-schedule";
import { registration as schedule } from "@molis-ai/molis-work-plugin-schedule/registration";
import { openTestSqlite } from "@molis-ai/molis-work-test-kit/sqlite";
import { deferred, person, serveHomeRuntime } from "./fixtures/home-runtime.js";

const getMembership = { ...projectPluginActions.get, provider_id: PROJECT_WORKSPACE_PROVIDER_ID };
const setMembership = { ...projectPluginActions.set, provider_id: PROJECT_WORKSPACE_PROVIDER_ID };
const settingsPath = (id: string) => `/api/settings/projects/${encodeURIComponent(id)}/plugins`;

function membershipEvents(home: string, projectId: string) {
  const db = openTestSqlite(join(home, "projects", "catalog.db"), { readonly: true });
  try {
    return db.prepare(`SELECT type, actor_id, json_extract(payload_json, '$.plugin_id') AS plugin_id FROM project_events
      WHERE project_id = ? AND type IN ('project.plugin_added', 'project.plugin_removed') ORDER BY rowid`).all(projectId);
  } finally { db.close(); }
}

async function fromIndex(f: Awaited<ReturnType<typeof serveHomeRuntime>>, projectId: string): Promise<VersionedProjectPluginMembership> {
  const response = await f.request("/api/settings/project-plugins");
  assert.equal(response.status, 200, await response.clone().text());
  const { projects } = await response.json() as { projects: Array<VersionedProjectPluginMembership & { project_id: string }> };
  const row = projects.find(row => row.project_id === projectId);
  assert.ok(row?.revision);
  return { plugins: row.plugins, hidden: row.hidden, revision: row.revision };
}

test("SPC-C08 public membership actions and HTTP use the same observation and refuse stale or forged changes", async t => {
  const opened: string[] = [];
  const f = await serveHomeRuntime(t, { onRuntimeOpen: reference => { opened.push(reference.project_id); } });
  const project = await f.project("Membership A"), other = await f.project("Membership B");
  const observed = await fromIndex(f, project.project_id), outside = await fromIndex(f, other.project_id);
  assert.deepEqual(opened, [], "the settings index cannot wake either project runtime");
  await f.host.ensureWebCatalog(f.home, openMolisWorkProjectCatalog).withCatalog({ homeDirectory: f.home }, catalog => {
    const id = project.project_id;
    const readWithFiles = () => {
      assert.ok(catalog.projectPluginMembership(id, () => ["git"]).plugins.includes("git"));
      return ["files"];
    };
    const projected = catalog.projectPluginMembership(id, readWithFiles);
    const versioned = catalog.projectPluginMembershipWithRevision(id, readWithFiles);
    assert.ok(projected.plugins.includes("files") && !projected.plugins.includes("git"));
    assert.deepEqual(versioned.plugins, projected.plugins);
    assert.notEqual(versioned.revision, observed.revision);
    assert.deepEqual(catalog.projectPluginMembership(id), { plugins: observed.plugins, hidden: observed.hidden });
    assert.throws(() => catalog.projectPluginMembershipWithRevision(id, () => { throw new Error("fixture directory read"); }), /fixture directory read/u);
    assert.deepEqual(catalog.projectPluginMembershipWithRevision(id), observed, "scoped page directories do not leak to the next read");
  });
  const caller = { ...person(["projects:settings"], project.project_id), actor_id: "test-action-person" };
  const client = f.host.actionClient(project.reference, false), actions = bindActionClient(client, () => caller);
  const read = () => actions.invoke(getMembership, {});
  assert.deepEqual(await read(), observed);
  assert.deepEqual(await client.invoke({ ...caller, audience: "agent", permissions: [] }, getMembership, {}), observed);
  const input = { plugin_id: "schedule", enabled: false, expected_revision: observed.revision };
  for (const forbidden of [{ ...caller, permissions: [] }, { ...caller, audience: "agent" as const }]) {
    await assert.rejects(client.invoke(forbidden, setMembership, input));
  }
  await assert.rejects(client.invoke({ ...caller, project_id: other.project_id }, setMembership, input), { code: "actions.scope_mismatch" });
  await assert.rejects(client.invoke(caller, setMembership, { ...input, actor_id: "forged", project_id: other.project_id }), { code: "actions.input_invalid" });
  const post = (method: string, body: object) => f.request(settingsPath(project.project_id), { method, body });
  for (const body of [{ plugin_id: "schedule" }, { plugin_id: "schedule", expected_revision: observed.revision, project_id: other.project_id, actor_id: "forged" }]) {
    const refused = await post("DELETE", body);
    assert.equal(refused.status, 400);
    assert.equal((await refused.json()).code, "actions.input_invalid");
  }
  assert.deepEqual(await read(), observed);
  assert.deepEqual(membershipEvents(f.home, project.project_id), []);

  const disabled = await actions.invoke(setMembership, input);
  assert.equal(disabled.plugins.includes("schedule"), false);
  assert.notEqual(disabled.revision, observed.revision);
  assert.deepEqual(await fromIndex(f, project.project_id), disabled);
  const stale = await post("DELETE", { plugin_id: "schedule", expected_revision: observed.revision });
  assert.equal(stale.status, 409, "even an already-reached target requires the current revision");
  assert.equal((await stale.json()).code, "actions.conflict");
  const enabled = await post("POST", { plugin_id: "schedule", expected_revision: disabled.revision });
  assert.equal(enabled.status, 200, await enabled.clone().text());
  const current = await read();
  assert.deepEqual(await enabled.json(), { project_id: project.project_id, ...current });
  assert.equal(await f.host.withProject(project.reference, runtime => runningProjectPlatform(runtime.store, project.project_id)), null,
    "saving project settings does not start a plugin platform");
  assert.deepEqual(current.plugins, observed.plugins);
  assert.notEqual(current.revision, observed.revision, "the original observation stays stale after an ABA");
  assert.deepEqual(await fromIndex(f, other.project_id), outside);
  assert.deepEqual(membershipEvents(f.home, project.project_id), [
    { type: "project.plugin_removed", actor_id: caller.actor_id, plugin_id: "schedule" },
    { type: "project.plugin_added", actor_id: LOCAL_PERSON_ACTOR_ID, plugin_id: "schedule" },
  ]);
  assert.deepEqual(membershipEvents(f.home, other.project_id), []);
});

test("SPC-C08 the final synchronous fence refuses a membership write whose authority changed while waiting for SQLite", async t => {
  const f = await serveHomeRuntime(t), project = await f.project("Blocked membership write");
  const observed = await fromIndex(f, project.project_id);
  const catalog = await f.host.ensureWebCatalog(f.home, openMolisWorkProjectCatalog).withCatalog({ homeDirectory: f.home }, value => value);
  const blocker = openTestSqlite(join(f.home, "projects", "catalog.db"));
  const commit = catalog.commit;
  let checks = 0, revoked = false;
  t.mock.method(catalog, "commit", <T>(write: () => T, check?: () => Promise<void>) => commit(write, async () => {
    await check?.();
    if (++checks === 2) {
      // The second acquisition check follows an actual SQLITE_BUSY. Revoke after the async guard returned, before the owner transaction.
      revoked = true;
      blocker.exec("ROLLBACK");
    }
  }));
  blocker.exec("BEGIN IMMEDIATE");
  const caller = { ...person(["projects:settings"], project.project_id), assert_authority_current() {
    if (revoked) throw new ActionError("actions.forbidden", "Fixture grant revoked before commit");
  } };
  try {
    await assert.rejects(f.host.actionClient(project.reference, false).invoke(caller, setMembership,
      { plugin_id: "schedule", enabled: false, expected_revision: observed.revision }), { code: "actions.forbidden" });
  } finally { blocker.close(); }
  assert.equal(checks, 2);
  assert.deepEqual(await fromIndex(f, project.project_id), observed);
  assert.deepEqual(membershipEvents(f.home, project.project_id), []);
});

test("SPC-C08 revoking the original browser session while the membership write waits leaves no event", { timeout: 30_000 }, async t => {
  const f = await serveHomeRuntime(t), project = await f.project("Revoked browser edit");
  const initial = await fromIndex(f, project.project_id);
  const page = await fetch(f.origin + "/settings/appearance");
  assert.equal(page.status, 200);
  const proof = /<meta name="molis-work-page-session" content="([^"]+)"/.exec(await page.text())?.[1];
  const cookie = page.headers.getSetCookie().find(value => value.startsWith("molis-work-web-"))?.split(";")[0];
  assert.ok(proof && cookie);
  const headers = { cookie, "x-molis-work-page-session": proof };
  const catalog = await f.host.ensureWebCatalog(f.home, openMolisWorkProjectCatalog).withCatalog({ homeDirectory: f.home }, value => value);
  const blocker = openTestSqlite(join(f.home, "projects", "catalog.db"));
  const waiting = deferred(), finished = deferred(), commit = catalog.commit;
  let checks = 0;
  t.mock.method(catalog, "commit", <T>(write: () => T, check?: () => Promise<void>) => commit(write, async () => {
    await check?.();
    if (++checks === 2) waiting.resolve();
  }).finally(finished.resolve));
  blocker.exec("BEGIN IMMEDIATE");
  try {
    const pending = f.request(settingsPath(project.project_id), { method: "DELETE", authorized: false, headers,
      body: { plugin_id: "schedule", expected_revision: initial.revision } }).then(response => response.status, () => "disconnected");
    await Promise.race([waiting.promise, pending.then(status => assert.fail(`the write answered ${status} before waiting for the lock`))]);
    const revoked = await f.request("/api/web-session", { method: "DELETE", authorized: false, headers });
    assert.equal(revoked.status, 200);
    blocker.exec("ROLLBACK");
    assert.equal(await pending, "disconnected");
    await finished.promise;
  } finally { blocker.close(); }
  assert.deepEqual(await fromIndex(f, project.project_id), initial);
  assert.deepEqual(membershipEvents(f.home, project.project_id), []);
});

function failingScheduleStart(t: TestContext, fail: () => void) {
  const declaration = schedule.project_runtime!;
  const create = declaration.create;
  t.mock.method(declaration, "create", () => {
    const definition = create();
    return { ...definition, async start(context: Parameters<typeof definition.start>[0]) { fail(); return definition.start(context); } };
  });
}

test("SPC-C08 HTTP reports both failed runtime switches after commit and reopening repairs only the runtime", async t => {
  let failStart = false, failReadback = false;
  failingScheduleStart(t, () => {
    if (!failStart) return;
    failReadback = true;
    throw new Error("fixture Schedule start failed");
  });
  const f = await serveHomeRuntime(t), project = await f.project("Runtime refresh receipts");
  const page = () => f.request(`/projects/${project.project_id}/`);
  assert.equal((await page()).status, 200);
  const { platform, db } = await f.host.withProject(project.reference, async runtime => ({
    platform: await runningProjectPlatform(runtime.store, project.project_id), db: runtime.store.db,
  }));
  assert.ok(platform);
  const installId = platform.supervisor.state(SCHEDULE_PLUGIN_ID)?.install_id;
  assert.ok(installId);
  const switchSchedule = (method: "POST" | "DELETE", revision: string) => f.request(settingsPath(project.project_id), {
    method, body: { plugin_id: "schedule", expected_revision: revision },
  });
  const receipt = async (response: Response) => {
    assert.equal(response.status, 503, await response.clone().text());
    const answer = await response.json() as { code: string; details: { committed: boolean; membership?: VersionedProjectPluginMembership; committed_membership?: VersionedProjectPluginMembership } };
    assert.equal(answer.code, "host.project_plugins_refresh_failed");
    assert.equal(answer.details.committed, true);
    return answer.details;
  };
  const stop = platform.runtime.stop.bind(platform.runtime);
  const failedStops: string[] = [];
  t.mock.method(platform.runtime, "stop", async (...args: Parameters<typeof stop>) => {
    try { return await stop(...args); }
    catch (error) { if (args[0] === installId) failedStops.push(String(error)); throw error; }
  });
  const initial = await fromIndex(f, project.project_id);
  db.exec(`CREATE TEMP TRIGGER refuse_schedule_stop BEFORE UPDATE ON plugin_runtime_installs
    WHEN json_extract(NEW.record_json, '$.plugin_id') = '${SCHEDULE_PLUGIN_ID}' AND json_extract(NEW.record_json, '$.state') = 'disabled'
    BEGIN SELECT RAISE(ABORT, 'fixture Schedule stop failed'); END`);
  let disabled: VersionedProjectPluginMembership;
  try {
    const details = await receipt(await switchSchedule("DELETE", initial.revision));
    disabled = await fromIndex(f, project.project_id);
    assert.deepEqual(details.membership, disabled);
    assert.equal(details.committed_membership, undefined);
    assert.notEqual(disabled.revision, initial.revision);
    assert.equal(disabled.plugins.includes("schedule"), false);
    assert.equal(failedStops.length, 2, "the background revoke and the explicitly awaited stop both failed");
    for (const error of failedStops) assert.match(error, /fixture Schedule stop failed/u);
    assert.equal(platform.runtime.get(installId).state, "running");
    assert.equal(platform.supervisor.enabledPluginIds().includes(SCHEDULE_PLUGIN_ID), false);
  } finally { db.exec("DROP TRIGGER refuse_schedule_stop"); }
  assert.equal(membershipEvents(f.home, project.project_id).length, 1);
  assert.equal((await page()).status, 200);
  assert.equal(platform.runtime.get(installId).state, "disabled");
  assert.deepEqual(await fromIndex(f, project.project_id), disabled);
  assert.equal(membershipEvents(f.home, project.project_id).length, 1);

  const catalog = await f.host.ensureWebCatalog(f.home, openMolisWorkProjectCatalog).withCatalog({ homeDirectory: f.home }, value => value);
  const read = catalog.projectPluginMembershipWithRevision.bind(catalog);
  t.mock.method(catalog, "projectPluginMembershipWithRevision", (...args: Parameters<typeof read>) => {
    if (failReadback) throw new Error("fixture versioned readback failed");
    return read(...args);
  });
  failStart = true;
  const details = await receipt(await switchSchedule("POST", disabled.revision));
  assert.equal(details.membership, undefined, "the failed readback must not be called the latest observation");
  assert.equal(platform.runtime.get(installId).state, "crashed");
  assert.equal(membershipEvents(f.home, project.project_id).length, 2);
  failReadback = false;
  const enabled = await fromIndex(f, project.project_id);
  assert.deepEqual(details.committed_membership, enabled);
  assert.equal(enabled.plugins.includes("schedule"), true);
  assert.notEqual(enabled.revision, disabled.revision);
  const repeated = await switchSchedule("POST", enabled.revision);
  assert.equal(repeated.status, 200, await repeated.clone().text());
  assert.equal(membershipEvents(f.home, project.project_id).length, 2, "a current no-op neither refreshes nor writes an event");
  const unrelated = await f.request(settingsPath(project.project_id), { method: "POST", body: { plugin_id: "git", expected_revision: enabled.revision } });
  assert.equal(unrelated.status, 200, await unrelated.clone().text());
  assert.ok((await unrelated.json()).plugins.includes("git"));
  assert.equal(platform.runtime.get(installId).state, "crashed", "an unrelated pending failure must not turn this save into a 503");
  failReadback = false;
  const beforeRecovery = await fromIndex(f, project.project_id), events = membershipEvents(f.home, project.project_id);
  failStart = false;
  assert.equal((await page()).status, 200);
  assert.equal(platform.runtime.get(installId).state, "running");
  assert.deepEqual(await fromIndex(f, project.project_id), beforeRecovery);
  assert.deepEqual(membershipEvents(f.home, project.project_id), events);
});
