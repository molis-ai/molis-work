import { test } from "node:test";
import assert from "node:assert/strict";
import { pluginWorkbenchClientAsset } from "@molis-ai/molis-work-app-workbench";
import { renderMolisWorkWorkbenchClientScript } from "./workbench-renderer-fixture.js";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";

test("RAC-43: the Host keeps one Cognia Runtime surface and loads its registered client on demand", async t => {
  const f = await serveHomeRuntime(t), project = await f.project("One knowledge stage");
  const page = async () => {
    const response = await f.request(`/projects/${project.project_id}/`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.equal([...html.matchAll(/data-work-surface="cognia"/g)].length, 1);
    return html;
  };
  const html = await page();
  assert.match(html, /data-cognia="workbench"/);
  assert.match(html, /data-work-surface="cognia"/);
  assert.match(html, /data-cognia-action="import"/);
  assert.match(html, /data-cognia-workspace/);
  assert.equal((await f.request("/api/plugins/io.molis.work.cognia/disable", { method: "POST", body: {} })).status, 200);
  assert.doesNotMatch(await page(), /data-cognia="workbench"/);
  assert.equal((await f.request("/api/plugins/io.molis.work.cognia/enable", { method: "POST", body: {} })).status, 200);
  assert.match(await page(), /data-cognia="workbench"/);
  const script = renderMolisWorkWorkbenchClientScript();
  assert.doesNotMatch(script, /data-cognia=workbench/);
  assert.match(script, /\/assets\/molis-work-plugins\//);
  const client = pluginWorkbenchClientAsset("cognia");
  assert.ok(client, "the registered surface must have a loadable client asset");
  assert.match(client, /data-cognia=workbench/);
  assert.match(client, /\/api\/plugins\/io\.molis\.work\.cognia\/library/);
});
