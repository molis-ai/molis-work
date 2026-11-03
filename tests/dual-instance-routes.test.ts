import assert from "node:assert/strict";
import test from "node:test";
import { dualPlugin } from "./fixtures/dual-plugin.js";
import { homeProbe, serveHomeRuntime } from "./fixtures/home-runtime.js";

// DUAL-09 (specs/dual-instance-plugins/spec.md) and security invariant S-31 (docs/system/SECURITY-INVARIANTS.md): a dual-instance plugin's
// routes are split between its halves. Of the routes the Manifest declares, the Home answers those its running half binds and leaves the
// others to the project's instance next in the request chain; a path the Manifest does not declare stays the Home's. Under a project's path
// each half runs in that project, whose id comes from the path alone; without the prefix only the Home half's routes are there, in no
// project. A plugin the Host's list does not mark keeps the Home's own answer.

async function serveDual(t: test.TestContext) {
  const dual = dualPlugin();
  const served = await serveHomeRuntime(t, { pluginFixtures: { home: [{ definition: dual.home, dual_instance: true }], project: [dual.project] } });
  const current = await served.project("双实例路由");
  const call = async (path: string, init: { method?: string; body?: unknown } = {}) => {
    const response = await served.request(path, init);
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  };
  return { ...served, dual, current, call, base: `/api/plugins/${dual.id}`, inProject: `/projects/${current.project_id}/api/plugins/${dual.id}` };
}

test("DUAL-09 S-31 under a project's path each half answers its own route in that project; without the prefix only the Home half's is there", { timeout: 60_000 }, async t => {
  const s = await serveDual(t);
  const home = await s.call(`${s.inProject}/home`);
  assert.equal(home.status, 200, JSON.stringify(home.body));
  assert.deepEqual(home.body, { half: "home", project_id: s.current.project_id }, "the Home half runs in the project its path names");
  const project = await s.call(`${s.inProject}/project`);
  assert.equal(project.status, 200, JSON.stringify(project.body));
  assert.deepEqual(project.body, { half: "project", project_id: s.current.project_id }, "the project half answers the route the Home half does not bind");
  const forged = await s.call(`${s.inProject}/home?project_id=forged`);
  assert.equal(forged.body.project_id, s.current.project_id, "a project in the query is not read");

  const personal = await s.call(`${s.base}/home?project_id=${encodeURIComponent(s.current.project_id)}`);
  assert.equal(personal.status, 200, JSON.stringify(personal.body));
  assert.deepEqual(personal.body, { half: "home", project_id: null }, "without the prefix the Home half runs in no project");
  // Without a project the request goes where every project route without one goes: the person is asked to choose a project.
  const outside = await s.call(`${s.base}/project`);
  assert.equal(outside.status, 400, JSON.stringify(outside.body));
  assert.equal(outside.body.half, undefined, "no project instance answers a route that names no project");

  for (const path of [`${s.base}/undeclared`, `${s.inProject}/undeclared`]) {
    const undeclared = await s.call(path);
    assert.equal(undeclared.status, 404, `${path}: ${JSON.stringify(undeclared.body)}`);
  }
  const missing = await s.call(`/projects/no-such-project/api/plugins/${s.dual.id}/home`);
  assert.equal(missing.status, 404, JSON.stringify(missing.body));
  assert.equal(missing.body.code, "actions.missing");
});

test("RAC-1300 RAC-1301 DUAL-09 a stopped Home half: the project half answers the routes it binds, the Home answers the rest as any stopped Home plugin", { timeout: 60_000 }, async t => {
  const s = await serveDual(t);
  assert.equal((await s.call(`${s.inProject}/project`)).status, 200);
  const disabled = await s.call(`${s.base}/disable`, { method: "POST", body: {} });
  assert.equal(disabled.status, 200, JSON.stringify(disabled.body));
  assert.notEqual(s.host.homePlugins!.installation(s.dual.id)?.state, "running");

  const project = await s.call(`${s.inProject}/project`);
  assert.equal(project.status, 200, JSON.stringify(project.body));
  assert.equal(project.body.half, "project", "the project instance is independent of the Home instance");
  // Cold: the Host has let the project go, so its plugin platform is not running. The first request is a route only the Home
  // declares: answering it with the Home's stopped-plugin answer means the Host started the project's platform to see that its
  // half does not bind the route (RAC-1300), and the project's own route answers next (RAC-1301).
  await s.host.closeProject(s.current.reference);
  const coldHome = await s.call(`${s.inProject}/home`);
  assert.equal(coldHome.status, 503, `${coldHome.status} ${JSON.stringify(coldHome.body)}`);
  assert.deepEqual(coldHome.body, { error: "插件已撤销启用" }, "cold: the Home's answer for a switched-off Home plugin");
  const coldProject = await s.call(`${s.inProject}/project`);
  assert.equal(coldProject.status, 200, JSON.stringify(coldProject.body));
  assert.equal(coldProject.body.half, "project", "cold: the project half answers its own route while the Home half is stopped");
  // A half that is not running binds nothing, but the project's own half is another installation: only a declared route it binds is
  // handed to it. A declared route it does not bind is answered by the Home as for any stopped Home plugin, not refused by the
  // project instance as a route it never had.
  const inside = await s.call(`${s.inProject}/home`);
  assert.equal(inside.status, 503, `${inside.status} ${JSON.stringify(inside.body)}`);
  assert.deepEqual(inside.body, { error: "插件已撤销启用" }, "the Home's answer for a switched-off Home plugin");
  const outside = await s.call(`${s.base}/home`);
  assert.equal(outside.status, 400, JSON.stringify(outside.body));
  assert.equal(outside.body.half, undefined);
});

test("DUAL-09 S-31 a plugin the Host does not mark as dual-instance keeps the Home's answer: nothing falls through to a project", { timeout: 60_000 }, async t => {
  const probe = homeProbe("splitcontrol");
  const { request, project } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.definition] } });
  const current = await project("对照");
  for (const path of [`/api/plugins/${probe.id}/undeclared`, `/projects/${current.project_id}/api/plugins/${probe.id}/state`]) {
    const response = await request(path), body = await response.json() as { code?: string };
    assert.ok([403, 404].includes(response.status), `${path}: ${response.status} ${JSON.stringify(body)}`);
  }
  // Shown in the project (a personal Home plugin outside the build, RAC-569), it is the Home's own grants that refuse it, not a project half.
  const answered = await request(`/projects/${current.project_id}/api/plugins/${probe.id}/state`);
  assert.equal((await answered.json() as { code?: string }).code, "actions.forbidden", "an unmarked fixture is answered by the Home itself");
});
