import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalProjectDatabase, GoalProjectApplication, releaseCodingSurface } from "@molis-ai/molis-work-app-local-host";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { pinnedArtifact } from "./fixtures/artifacts.js";

// 「交给插件作为输入」 (artifact-positioning, 2026-10-04): a 成果 version's detail lists the running plugins' input ports that
// take its type; the person gives one this fixed version and later puts back the source the Host wired by default.
test("a Coding report in the 成果库 can be given to Shelf's report input and taken back to following Coding", async t => {
  const home = mkdtempSync(join(tmpdir(), "artifact-plugin-inputs-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const project = await catalog.createProject({ display_name: "端口输入", actor_id: "web-user" });
  for (const plugin_id of ["coding", "artifacts"]) catalog.addProjectPlugin({ project_id: project.project_id, plugin_id, actor_id: "web-user" });
  catalog.close();
  const prefix = "/projects/" + project.project_id, token = "artifact-plugin-inputs-control-token-123456789";
  const store = new LocalProjectDatabase(project.database_path), app = new GoalProjectApplication(store);
  const server = createMolisWorkWebServer({ homeDirectory: home, controlToken: token });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string"); const origin = `http://127.0.0.1:${address.port}`;
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await releaseCodingSurface(store, project.project_id); store.close(); rmSync(home, { recursive: true, force: true }); });
  const post = async (path: string, body: unknown, authorized = true) => {
    const response = await fetch(origin + prefix + path, { method: "POST", headers: { origin, "content-type": "application/json", "x-molis-work-idempotency-key": randomUUID(),
      ...(authorized ? { "x-molis-work-control-token": token } : {}) }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json().catch(() => null) as any };
  };
  const reference = { artifact_id: "coding-report:session:run", version: 1 };
  app.artifacts.commands.registerVersion({ ...pinnedArtifact("固定的执行报告"), project_id: project.project_id, actor_id: "web-user", ...reference,
    artifact_type_id: "coding.report.v1", schema_version: 1, producer: { plugin_id: "io.molis.work.coding", plugin_version: "1.50.0", binding_signature: "official-coding-binding" },
    content: { kind: "inline", payload: { title: "固定的执行报告", run_id: "run", source: { session_id: "session" }, body_markdown: "## 报告" } } });
  // Opening a plugin's page starts the project's plugins, as the workbench would.
  assert.equal((await fetch(origin + prefix + "/api/plugins/io.molis.work.shelf/project-results")).status, 200);
  const detail = async () => (await fetch(origin + prefix + `/artifacts/${encodeURIComponent(reference.artifact_id)}/versions/1`, { headers: { "x-molis-work-fragment": "detail" } })).text();
  const shelfRow = (html: string) => html.match(/<li data-artifact-port data-plugin-id="io\.molis\.work\.shelf" data-port="coding-report">[\s\S]*?<\/li>/u)?.[0] ?? "";

  // Shelf's report input follows Coding by default.
  assert.match(shelfRow(await detail()), /现在跟着 Coding[\s\S]*data-artifact-port-input="use"/u);
  const give = { reference, plugin_id: "io.molis.work.shelf", port: "coding-report" };
  assert.equal((await post("/api/artifacts/plugin-inputs", give, false)).status, 403, "changing what a plugin reads needs the page's control token");
  const refused = await post("/api/artifacts/plugin-inputs", { ...give, port: "materials" });
  assert.equal(refused.status, 400, JSON.stringify(refused.body));

  const given = await post("/api/artifacts/plugin-inputs", give);
  assert.equal(given.status, 200, JSON.stringify(given.body));
  assert.deepEqual(given.body.inputs.find((row: any) => row.port === "coding-report"), { plugin_id: "io.molis.work.shelf", plugin_title: given.body.inputs[0].plugin_title,
    port: "coding-report", source: "this", source_title: null });
  assert.match(shelfRow(await detail()), /正在读这一版[\s\S]*data-artifact-port-input="restore"/u);

  const restored = await post("/api/artifacts/plugin-inputs", { ...give, restore: true });
  assert.equal(restored.status, 200, JSON.stringify(restored.body));
  assert.equal(restored.body.inputs.find((row: any) => row.port === "coding-report").source, "plugin");
  assert.match(shelfRow(await detail()), /现在跟着 Coding/u);
});

// A fixed version given to a plugin input stays what the input reads until the person changes it: the Host's default wiring
// (run on every project open and again when any port is put back) fills only the ports that read nothing, and "put back" from
// a page that is out of date does not undo a later choice.
test("a version given to Shelf's report input survives a Host restart, and a stale 'put back' click leaves a later choice alone", async t => {
  const home = mkdtempSync(join(tmpdir(), "artifact-plugin-inputs-pin-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const project = await catalog.createProject({ display_name: "端口输入", actor_id: "web-user" });
  for (const plugin_id of ["coding", "artifacts"]) catalog.addProjectPlugin({ project_id: project.project_id, plugin_id, actor_id: "web-user" });
  catalog.close();
  const prefix = "/projects/" + project.project_id, token = "artifact-plugin-inputs-pin-control-token-123456789";
  const store = new LocalProjectDatabase(project.database_path), app = new GoalProjectApplication(store);
  t.after(async () => { await releaseCodingSurface(store, project.project_id); store.close(); rmSync(home, { recursive: true, force: true }); });
  const openHost = async () => {
    const server = createMolisWorkWebServer({ homeDirectory: home, controlToken: token });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address !== "string");
    return { server, origin: `http://127.0.0.1:${address.port}` };
  };
  let host = await openHost();
  t.after(async () => { await new Promise<void>(resolve => host.server.close(() => resolve())); });
  const post = async (path: string, body: unknown) => {
    const response = await fetch(host.origin + prefix + path, { method: "POST", headers: { origin: host.origin, "content-type": "application/json", "x-molis-work-idempotency-key": randomUUID(),
      "x-molis-work-control-token": token }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json().catch(() => null) as any };
  };
  const first = { artifact_id: "coding-report:session:first", version: 1 }, second = { artifact_id: "coding-report:session:second", version: 1 };
  for (const reference of [first, second]) {
    app.artifacts.commands.registerVersion({ ...pinnedArtifact(reference.artifact_id), project_id: project.project_id, actor_id: "web-user", ...reference,
      artifact_type_id: "coding.report.v1", schema_version: 1, producer: { plugin_id: "io.molis.work.coding", plugin_version: "1.50.0", binding_signature: "official-coding-binding" },
      content: { kind: "inline", payload: { title: reference.artifact_id, run_id: "run", source: { session_id: "session" }, body_markdown: "## 报告" } } });
  }
  const open = async () => assert.equal((await fetch(host.origin + prefix + "/api/plugins/io.molis.work.shelf/project-results")).status, 200);
  const shelfRow = async (reference: { artifact_id: string; version: number }) => ((await (await fetch(host.origin + prefix + `/artifacts/${encodeURIComponent(reference.artifact_id)}/versions/${reference.version}`,
    { headers: { "x-molis-work-fragment": "detail" } })).text()).match(/<li data-artifact-port data-plugin-id="io\.molis\.work\.shelf" data-port="coding-report">[\s\S]*?<\/li>/u)?.[0] ?? "")
    .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const input = { plugin_id: "io.molis.work.shelf", port: "coding-report" };
  await open();
  assert.match(await shelfRow(first), /现在跟着 Coding/u);

  assert.equal((await post("/api/artifacts/plugin-inputs", { reference: first, ...input })).status, 200);
  assert.match(await shelfRow(first), /正在读这一版/u);

  // A fresh Host start on the same Home runs the default wiring again.
  await new Promise<void>(resolve => host.server.close(() => resolve()));
  host = await openHost();
  await open();
  assert.match(await shelfRow(first), /正在读这一版/u, "the default wiring does not replace a version the person gave the input");

  // The person gives the input a later version; a page that still shows the first one puts the input back.
  assert.equal((await post("/api/artifacts/plugin-inputs", { reference: second, ...input })).status, 200);
  assert.match(await shelfRow(first), /另一版固定的成果/u);
  const stale = await post("/api/artifacts/plugin-inputs", { reference: first, ...input, restore: true });
  assert.equal(stale.status, 200, JSON.stringify(stale.body));
  assert.equal(stale.body.inputs.find((row: any) => row.port === "coding-report").source, "another-version");
  assert.match(await shelfRow(second), /正在读这一版/u, "putting back a version the input no longer reads does not undo the later choice");

  const restored = await post("/api/artifacts/plugin-inputs", { reference: second, ...input, restore: true });
  assert.equal(restored.status, 200, JSON.stringify(restored.body));
  assert.match(await shelfRow(second), /现在跟着 Coding/u);
});
