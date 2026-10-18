import assert from "node:assert/strict";
import test from "node:test";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";

test("W5-01-HPR-01 Home routes obtain project-only permissions from the resolved project and lose revoked grants", async t => {
  const f = await serveHomeRuntime(t), project = await f.project("Project-only route grants");
  const plugin = "io.molis.work.images", root = `/api/plugins/${plugin}`;
  const scoped = `/projects/${project.project_id}${root}`;
  const missing = await f.request(scoped + "/jobs", { method: "POST", body: {} });
  assert.equal(missing.status, 400, await missing.clone().text());
  assert.equal((await missing.json()).code, "actions.input_invalid", "the legitimate project route reaches its action input validation");
  const personal = await f.request(root + `/jobs?project_id=${project.project_id}`, { method: "POST", body: {} });
  assert.equal(personal.status, 400);
  assert.equal((await personal.json()).code, "actions.project_required", "a query field cannot establish trusted project context");
  assert.deepEqual(await (await f.request(scoped + "/jobs")).json(), { jobs: [] });
  const platform = await f.host.homePlugins!.ready(), install = f.host.homePlugins!.installation(plugin)!;
  await platform.runtime.stop(install.install_id);
  platform.runtime.grant(install.install_id, install.grants.filter(permission => permission !== "images:generate"));
  await platform.supervisor.restart(plugin);
  const denied = await f.request(scoped + "/jobs", { method: "POST", body: {} });
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).code, "actions.forbidden", "a live installation cannot lend a revoked project permission");
  assert.equal((await f.request(root + "/connections")).status, 200, "the remaining Home read grant still works");
  assert.deepEqual(await (await f.request(scoped + "/jobs")).json(), { jobs: [] });
});
