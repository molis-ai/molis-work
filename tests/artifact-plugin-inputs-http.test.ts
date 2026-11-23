import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalProjectDatabase, openProjectVersionStores, releaseProjectPlugins } from "@molis-ai/molis-work-app-local-host";
import { createSingleHomeTestWebServer as createMolisWorkWebServer } from "./fixtures/local-web-core.js";
import { pinnedArtifact } from "./fixtures/artifacts.js";

// 「交给插件作为输入」 (artifact-positioning, 2026-10-04): a 成果 version's detail lists the running plugins' input ports that take its
// type. Shelf had the one built-in input for a Coding report; since 44B it is a platform part with no ports and lists the project's
// results itself (「接收项目成果」), so a report's detail offers no Shelf input and giving it one is refused, changing nothing.
test("a Coding report's detail offers no Shelf input since Shelf lists the project's results itself, and giving it one is refused", async t => {
  const home = mkdtempSync(join(tmpdir(), "artifact-plugin-inputs-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const project = await catalog.createProject({ display_name: "端口输入", actor_id: "web-user" });
  for (const plugin_id of ["coding"]) catalog.addProjectPlugin({ project_id: project.project_id, plugin_id, actor_id: "web-user" });
  catalog.close();
  const prefix = "/projects/" + project.project_id, token = "artifact-plugin-inputs-control-token-123456789";
  const store = new LocalProjectDatabase(project.database_path), app = openProjectVersionStores(store);
  const server = createMolisWorkWebServer({ homeDirectory: home, controlToken: token });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string"); const origin = `http://127.0.0.1:${address.port}`;
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await releaseProjectPlugins(store, project.project_id); store.close(); rmSync(home, { recursive: true, force: true }); });
  const reference = { artifact_id: "coding-report:session:run", version: 1 };
  app.artifacts.commands.registerVersion({ ...pinnedArtifact("固定的执行报告"), project_id: project.project_id, actor_id: "web-user", ...reference,
    artifact_type_id: "coding.report.v1", schema_version: 1, producer: { plugin_id: "io.molis.work.coding", plugin_version: "1.50.0", binding_signature: "official-coding-binding" },
    content: { kind: "inline", payload: { title: "固定的执行报告", run_id: "run", source: { session_id: "session" }, body_markdown: "## 报告" } } });
  // Shelf lists the report among the project's results it can take in.
  const results = await fetch(origin + prefix + "/api/platform/shelf/project-results");
  assert.equal(results.status, 200);
  assert.deepEqual((await results.json() as { results: Array<{ reference: unknown }> }).results.map(row => row.reference), [reference]);
  const detail = await (await fetch(origin + prefix + `/artifacts/${encodeURIComponent(reference.artifact_id)}/versions/1`, { headers: { "x-molis-work-fragment": "detail" } })).text();
  assert.doesNotMatch(detail, /data-artifact-port data-plugin-id="system\.shelf"/u, "no Shelf input row");
  const given = await fetch(origin + prefix + "/api/artifacts/plugin-inputs", { method: "POST", headers: { origin, "content-type": "application/json",
    "x-molis-work-idempotency-key": randomUUID(), "x-molis-work-control-token": token }, body: JSON.stringify({ reference, plugin_id: "system.shelf", port: "coding-report" }) });
  assert.equal(given.status, 400, await given.text());
});
