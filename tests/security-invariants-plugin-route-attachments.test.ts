import assert from "node:assert/strict";
import test from "node:test";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";
import { streamProbe } from "./fixtures/plugin-stream.js";

for (const scope of ["home", "project"] as const) {
  test(`S-03 RAC-37 ${scope} accepts a 32 MB encoded batch within the declared 45 MB limit and refuses the next byte`, { timeout: 60_000 }, async t => {
    const probe = streamProbe(scope), route = probe.definition.manifest.routes!.find(route => route.route_id === "direct")!;
    delete route.stream; route.max_body_bytes = 45_000_000;
    assert.equal(parsePluginManifest(probe.definition.manifest).routes!.at(-1)!.max_body_bytes, 45_000_000);
    probe.behavior.route = async request => {
      const body = request.body as { data: string };
      return { status: 200, body: { received: Buffer.from(body.data, "base64").byteLength } };
    };
    const f = await serveHomeRuntime(t, { pluginFixtures: { [scope]: [probe.definition] } });
    const project = scope === "project" ? await f.project("Batch upload") : undefined;
    const path = `${project ? `/projects/${project.project_id}` : ""}/api/plugins/${probe.id}/direct`;
    const json = JSON.stringify({ data: Buffer.alloc(32_000_000, 65).toString("base64") });
    assert.ok(json.length > 36_000_000 && json.length < 45_000_000, "this formerly valid batch cannot fit the previous Runtime ceiling");
    const raw = json.padEnd(45_000_000, " ");
    const accepted = await f.request(path, { method: "POST", raw });
    assert.equal(accepted.status, 200); assert.deepEqual(await accepted.json(), { received: 32_000_000 });
    const refused = await f.request(path, { method: "POST", raw: raw + " " });
    assert.equal(refused.status, 413); assert.equal((await refused.json()).code, "actions.input_too_large");
    assert.equal(probe.requests.length, 1, "the excessive request never enters the plugin");
  });

  test(`S-03 RAC-38 ${scope} Runtime downloads refuse executable MIME and plugin headers, preserving bytes and filename`, { timeout: 60_000 }, async t => {
    const probe = streamProbe(scope), route = probe.definition.manifest.routes!.find(route => route.route_id === "direct")!;
    delete route.stream; route.method = "GET";
    const f = await serveHomeRuntime(t, { pluginFixtures: { [scope]: [probe.definition] } });
    const project = scope === "project" ? await f.project("Attachment download") : undefined;
    const path = `${project ? `/projects/${project.project_id}` : ""}/api/plugins/${probe.id}/direct`;
    for (const [filename, mime, bytes] of [
      ["资料.html", "text/html", Buffer.from("<script>window.executed = true</script>")],
      ["图像.svg", "image/svg+xml", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>')],
      ["empty.bin", "application/octet-stream", Buffer.alloc(0)],
    ] as const) {
      probe.behavior.route = async () => ({ status: 200, bytes, filename, mime, body: { mustNotReplaceBytes: true },
        headers: { "content-type": mime, "content-disposition": "inline", "content-security-policy": "default-src *", "cache-control": "public" } });
      const response = await f.request(path);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type"), "application/octet-stream");
      assert.equal(response.headers.get("content-disposition"), "attachment; filename*=UTF-8''" + encodeURIComponent(filename));
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      assert.equal(response.headers.get("content-security-policy"), "sandbox");
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
    }
    probe.behavior.route = async () => ({ status: 200, body: { still: "JSON" } });
    const json = await f.request(path);
    assert.match(json.headers.get("content-type")!, /application\/json/);
    assert.deepEqual(await json.json(), { still: "JSON" });
  });
}
