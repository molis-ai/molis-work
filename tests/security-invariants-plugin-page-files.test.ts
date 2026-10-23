import assert from "node:assert/strict";
import test from "node:test";
import { realpath, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { grantHomeProbe, homeProbe, serveHomeRuntime } from "./fixtures/home-runtime.js";

test("SYS-15-F2 S-47 native handoff resolves only existing declared owner files and rejects other pages, traversal, links and revoked activation", async t => {
  const probe = homeProbe("nofiles"), f = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.definition] } });
  await grantHomeProbe(f.host, probe);
  const p = await f.project("File handoff"), q = await f.project("Other file handoff"), prefix = `/projects/${p.project_id}`;
  const open = async (pluginId: string, route = "") => {
    const result = await f.request(route + "/api/host/plugin-pages", { method: "POST", body: { plugin_id: pluginId } });
    assert.equal(result.status, 200, await result.clone().text());
    return { "x-molis-plugin-page": (await result.json()).page_id as string };
  };
  const headers = await open("io.molis.work.shelf", prefix);
  const check = (route = prefix, page = headers) => f.request(route + "/api/host/plugin-page-check", { method: "POST", headers: page, body: {} });
  assert.equal((await check()).status, 200);
  assert.equal((await check(`/projects/${q.project_id}`)).status, 403);
  assert.equal((await check(prefix, { "x-molis-plugin-page": "invented" })).status, 403);
  assert.equal((await check("", await open(probe.id))).status, 200, "the picker is a public page service, independent of owner files");
  const admitted = await f.request(prefix + "/api/plugins/io.molis.work.shelf/items", {
    method: "POST", headers, body: { filename: "owned.txt", bytes_base64: Buffer.from("only this owner's file").toString("base64") },
  });
  assert.equal(admitted.status, 200, await admitted.clone().text());
  const { item } = await admitted.json();
  const resolve = (paths: unknown[], route = prefix, page = headers) => f.request(route + "/api/host/plugin-page-files", { method: "POST", headers: page, body: { paths } });
  const allowed = await resolve([item.relative_path]);
  assert.equal(allowed.status, 200, await allowed.clone().text());
  const [path] = (await allowed.json()).paths; assert.equal(path, join(await realpath(f.home), "shelf", item.relative_path));
  await writeFile(join(f.home, "outside.txt"), "must not be handed off");
  await symlink(join(f.home, "outside.txt"), join(f.home, "shelf", "files", "outside-link.txt"));
  for (const paths of [["../outside.txt"], [join(f.home, "outside.txt")], ["files/outside-link.txt"], ["files/missing.txt"], ["files"], [null], []]) {
    const denied = await resolve(paths); assert.ok(denied.status >= 400 && denied.status < 500, JSON.stringify(paths) + ": " + await denied.text());
  }
  assert.equal((await resolve([item.relative_path], "")).status, 403);
  assert.equal((await resolve([item.relative_path], `/projects/${q.project_id}`)).status, 403);
  assert.equal((await resolve([item.relative_path], "", await open(probe.id))).status, 403);
  const platform = await f.host.homePlugins!.ready(), installation = f.host.homePlugins!.installation("io.molis.work.shelf")!;
  await platform.runtime.stop(installation.install_id);
  assert.equal((await check()).status, 403, "a revoked activation cannot search or select a local file");
  assert.equal((await resolve([item.relative_path])).status, 403);
});
