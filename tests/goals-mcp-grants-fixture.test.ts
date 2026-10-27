import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { readMcpToolPreference } from "@molis-ai/molis-work-app-local-host";
import { FEED_PLUGIN_ID, feedItemActions } from "@molis-ai/molis-work-plugin-feed";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { grantMcpAction, readMcpActionAccess } from "@molis-ai/molis-work-test-kit/local-host-http";
import { grantGoalsMcp } from "./fixtures/goals-mcp-grants.js";
import { openTestHome } from "./fixtures/test-home.js";

const CLIENT = "runtime:fixture";

test("the Goals grant fixture saves what the access settings save, for the actions a model's client may hold", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t);
  const project = await home.createProject("授权夹具");
  const rows = await grantGoalsMcp(home, project, CLIENT);
  const granted = new Set(rows.map(row => row.capability_id));
  const forModels = Object.values(goalsActions).filter(action => action.action.audiences.includes("mcp"));
  assert.ok(forModels.length > 10 && forModels.every(action => granted.has(action.capability_id)), "every Goals action offered to a model's client is granted");
  assert.ok(Object.values(goalsActions).some(action => !action.action.audiences.includes("mcp")), "Goals has actions that are the person's alone");
  for (const action of Object.values(goalsActions).filter(action => !action.action.audiences.includes("mcp"))) {
    assert.equal(granted.has(action.capability_id), false, `${action.capability_id} is the person's alone and is never granted to a client`);
  }
  const access = await readMcpActionAccess(home.web, { clientId: CLIENT, projectId: project.project_id });
  assert.deepEqual(access.grants.map(row => row.capability_id).sort(), [...granted].sort(), "what the fixture reports is what the Host holds");
  assert.ok(access.entries.filter(entry => granted.has(entry.capability_id)).every(entry => entry.status === "enabled"));
});

test("a project that is not in the catalog gets no grant, as on the access page", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t);
  await assert.rejects(grantGoalsMcp(home, { project_id: "never-created" }, CLIENT), /No Goals action is offered to runtime:fixture in project never-created/);
  assert.deepEqual((await readMcpActionAccess(home.web, { clientId: CLIENT, projectId: "never-created" })).grants, [], "a refused request leaves no record");
});

test("an action the project cannot use is refused until its plugin is installed there", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t);
  const bare = await home.createProject("没有 Feed");
  // Feed runs in a project's Runtime only where it is installed: a project without it has no Feed action to offer, and the Host refuses
  // a grant that names one anyway.
  await assert.rejects(grantGoalsMcp(home, bare, CLIENT, [feedItemActions.promote]), (error: Error) => error.message.startsWith(`${feedItemActions.promote.capability_id} is not offered`));
  await assert.rejects(grantMcpAction(home.web, { clientId: CLIENT, projectId: bare.project_id,
    action: { capability_id: feedItemActions.promote.capability_id, version: feedItemActions.promote.version, provider_id: FEED_PLUGIN_ID } }), { status: 404, code: "actions.missing" });
  assert.deepEqual((await readMcpActionAccess(home.web, { clientId: CLIENT, projectId: bare.project_id })).grants, [], "a refused grant leaves no record");
  const withFeed = await home.createProject("有 Feed", ["feed"]);
  const rows = await grantGoalsMcp(home, withFeed, CLIENT, [feedItemActions.promote]);
  const ids = rows.map(row => row.capability_id);
  assert.ok(ids.includes(feedItemActions.promote.capability_id));
  assert.ok(ids.indexOf(goalsActions.create.capability_id) < ids.indexOf(feedItemActions.promote.capability_id), "the Goals actions it writes through are saved first");
});

test("an action the client is not offered is an error, not a skipped line", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t);
  const project = await home.createProject("缺少的动作");
  await assert.rejects(grantGoalsMcp(home, project, CLIENT, [{ capability_id: "no.such.action" }]), /no\.such\.action is not offered/);
  await assert.rejects(grantGoalsMcp(home, project, CLIENT, [goalsActions.decide]), (error: Error) => error.message.startsWith(`${goalsActions.decide.capability_id} is not offered`));
});

test("a Home directory is served by a short-lived Host assembled the product's way, which is closed again", { timeout: 60_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), "goals-grants-home-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: directory });
  t.after(async () => { catalog.close(); await rm(directory, { recursive: true, force: true }); });
  const project = await catalog.createProject({ display_name: "短暂的宿主", actor_id: "user" });
  const rows = await grantGoalsMcp(directory, project, CLIENT);
  assert.ok(rows.length > 10);
  const saved = (await readMcpToolPreference(directory)).action_grants;
  assert.deepEqual(saved.map(row => row.capability_id).sort(), rows.map(row => row.capability_id).sort(), "the grants are in the Home that was named");
  // A Home has one open Host at a time: a second call works only because the first one's Host is closed.
  assert.equal((await grantGoalsMcp(directory, project, "runtime:second")).length, rows.length);
  const elsewhere = await mkdtemp(join(tmpdir(), "goals-grants-elsewhere-"));
  t.after(() => rm(elsewhere, { recursive: true, force: true }));
  await assert.rejects(grantGoalsMcp(elsewhere, project, CLIENT), /No Goals action is offered/);
});
