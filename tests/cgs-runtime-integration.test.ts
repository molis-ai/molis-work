import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import { SqlitePluginRuntimeReleaseArtifactRepository, pluginManifestDigest } from "@molis-ai/molis-work-plugin-runtime";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

// CGS-NW-02/03: exercise the shipped product assembly, without plugin fixtures or a second app server.
test("CGS-NW-03 ordinary Work project installs CGS, serves its archived UI and retains author state across Host restart", async () => {
  const home = await mkdtemp(join(tmpdir(), "molis-cgs-formal-"));
  const project = await withMolisWorkProjectCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "作者验收副本", actor_id: "user" }));
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path });
  const token = "cgs-formal-integration-test-token-0123456789";
  const hostOptions = { homeDirectory: home, completeText: null };
  let host = new MolisWorkLocalHost(hostOptions);
  let server = createMolisWorkWebServer({ ...hostOptions, localHost: host, controlToken: token });
  const listen = async () => { await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve)); const address = server.address(); assert.ok(address && typeof address === "object"); return `http://127.0.0.1:${address.port}`; };
  let origin = await listen();
  const request = (path: string, body?: unknown) => fetch(origin + path, body === undefined ? {} : { method: "POST", headers: {
    origin, "content-type": "application/json", "x-molis-work-control-token": token, "x-molis-work-idempotency-key": randomUUID(),
  }, body: JSON.stringify(body) });
  const api = `/projects/${project.project_id}/api/plugins/io.molis.work.cgs`;
  const call = async (name: string, body: unknown) => { const response = await request(`${api}/works/${name}`, body); assert.equal(response.status, 200, await response.clone().text()); return response.json(); };
  const stop = async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); host.close(); };
  try {
    assert.equal((await request(`${api}/works/list`, {})).status, 403, "not enabled in this project yet");
    const added = await request(`/api/settings/projects/${project.project_id}/plugins`, { plugin_id: "cgs" });
    assert.equal(added.status, 200, await added.clone().text());
    const listing = await call("list", {}); assert.deepEqual(listing.works.creations, []); assert.equal(listing.works.modelAvailable, false);
    const initial = { request_id: randomUUID(), text: "合成验收：从助理开篇", materials: [{ name: "作者材料", text: "只用于本篇的明确材料" }] };
    const started = await call("start", initial);
    const assistantWork = (await call("read", { id: started.work.id })).work;
    assert.equal(assistantWork.source.files[0].text, initial.materials[0]!.text);
    assert.deepEqual(await call("start", initial), started);
    assert.equal(assistantWork.account, null); assert.equal(assistantWork.versions.length, 0);
    const id = randomUUID();
    const created = await call("create", { id }); assert.equal(created.work.id, id);
    const source = "作者材料：润色应保留事实、判断和语气。只做隔离验收。";
    const imported = await call("importfile", { id, expected_revision: created.work.revision, materialId: randomUUID(), name: "作者材料.txt", base64: Buffer.from(source).toString("base64") });
    assert.equal(imported.work.revision, created.work.revision + 1);
    const html = await (await request(`/projects/${project.project_id}/`)).text();
    assert.match(html, /data-work-surface="cgs"/);
    assert.equal((html.match(/data-plugin-tile="cgs"/g) ?? []).length, 1, "one catalog navigation entry");
    const client = html.match(/data-runtime-client="([^"]+)"/); assert.ok(client);
    const assetResponse = await request(client[1]!.replaceAll("&amp;", "&"));
    assert.equal(assetResponse.status, 200); assert.match(await assetResponse.text(), /mount/);
    const entry = BUILTIN_PLUGIN_CATALOG.find(row => row.project_plugin_id === "cgs")!;
    const archive = await host.withProject(ref, runtime => new SqlitePluginRuntimeReleaseArtifactRepository(runtime.store.db).get(
      entry.manifest.plugin_id, entry.manifest.publisher.signature, entry.manifest.version, pluginManifestDigest(entry.manifest)));
    assert.equal(entry.manifest.methods?.length, 7, "CGS-AS-01 registers only seven implemented phase 0/1 methods");
    assert.deepEqual(entry.manifest.methods?.map(method => method.skill_id), ["account-strategy", "material-capture", "creation", "edit-review", "platform-adapt", "media-production", "publishing-ops"]);
    assert.ok(archive, "the real supervisor must capture a complete release");
    const bundle = JSON.parse(archive.module_source);
    let restored;
    try { restored = (await import(`data:text/javascript;base64,${Buffer.from(bundle.module_source).toString("base64")}`)).__native_plugin_factory(); }
    catch (error) { throw new Error(`CGS release restore failed: ${(error as Error).message}`); }
    assert.deepEqual(restored.manifest, entry.manifest);
    await stop(); host = new MolisWorkLocalHost(hostOptions); server = createMolisWorkWebServer({ ...hostOptions, localHost: host, controlToken: token }); origin = await listen();
    const reopened = await call("read", { id });
    assert.deepEqual(reopened.work, imported.work, "no write or approval on restart");
    assert.deepEqual(reopened.executing, []);
    assert.deepEqual((await call("read", { id: started.work.id })).work, assistantWork, "CGS-AS-02 initial materials survive the actual Host restart");
  } finally { await stop(); await rm(home, { recursive: true, force: true }); }
});
