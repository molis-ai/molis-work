import assert from "node:assert/strict";
import test from "node:test";
import { partitionInstallation, serveHomeRuntime } from "./fixtures/home-runtime.js";

// Images ran in the Home and borrowed a project's permissions through the project's path; since batch 108 it runs in each project it is
// added to, so the project's own instance answers and its grants are that installation's.
test("W5-01-HPR-01 a partition route answers in the project its path names and loses revoked grants", async t => {
  const f = await serveHomeRuntime(t), project = await f.project("Project-only route grants", ["images"]);
  const plugin = "io.molis.work.images", root = `/api/plugins/${plugin}`;
  const scoped = `/projects/${project.project_id}${root}`;
  const missing = await f.request(scoped + "/jobs", { method: "POST", body: {} });
  assert.equal(missing.status, 400, await missing.clone().text());
  assert.equal((await missing.json()).code, "actions.input_invalid", "the legitimate project route reaches its action input validation");
  const personal = await f.request(root + `/jobs?project_id=${project.project_id}`, { method: "POST", body: {} });
  assert.notEqual(personal.status, 200, "a query field cannot establish trusted project context");
  await personal.text();
  assert.deepEqual(await (await f.request(scoped + "/jobs")).json(), { jobs: [] });
  const { install, regrant } = await partitionInstallation(f.host, project, plugin);
  await regrant(install.grants.filter(permission => permission !== "images:generate"));
  const denied = await f.request(scoped + "/jobs", { method: "POST", body: {} });
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).code, "actions.forbidden", "a live installation cannot lend a revoked permission");
  assert.equal((await f.request(scoped + "/connections")).status, 200, "the remaining read grant still works");
  assert.deepEqual(await (await f.request(scoped + "/jobs")).json(), { jobs: [] });
});
