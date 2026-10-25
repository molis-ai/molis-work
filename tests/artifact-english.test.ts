import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalProjectDatabase, openProjectVersionStores, releaseProjectPlugins } from "@molis-ai/molis-work-app-local-host";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { pinnedArtifact } from "./fixtures/artifacts.js";

// RAC-776 (hub review 2026-10-25): the 成果库 shows a type by the name its owner declares, and says the rest of its own page in
// its own words. Dataset's "数据表" is English only in Dataset's declared words, which the Host applies where it draws that name.
test("RAC-776 the 成果库 shows a type's name in its owner's English and its own sentences in Artifacts' English", async t => {
  const home = mkdtempSync(join(tmpdir(), "artifact-english-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const project = await catalog.createProject({ display_name: "成果英文", actor_id: "web-user" });
  for (const plugin_id of ["dataset", "artifacts"]) catalog.addProjectPlugin({ project_id: project.project_id, plugin_id, actor_id: "web-user" });
  catalog.close();
  const prefix = "/projects/" + project.project_id, token = "artifact-english-control-token-123456789";
  const store = new LocalProjectDatabase(project.database_path), app = openProjectVersionStores(store);
  const server = createMolisWorkWebServer({ homeDirectory: home, controlToken: token });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string"); const origin = `http://127.0.0.1:${address.port}`;
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await releaseProjectPlugins(store, project.project_id); store.close(); rmSync(home, { recursive: true, force: true }); });
  const reference = { artifact_id: "dataset-table:sales", version: 1 };
  app.artifacts.commands.registerVersion({ ...pinnedArtifact("销售表"), project_id: project.project_id, actor_id: "web-user", ...reference,
    artifact_type_id: "io.molis.work.dataset.table", schema_version: 1, producer: { plugin_id: "io.molis.work.dataset", plugin_version: "1.0.0", binding_signature: "official-dataset-binding" },
    content: { kind: "inline", payload: { title: "销售表" } } });
  const detail = async (locale: "en" | "zh") => (await fetch(origin + prefix + `/artifacts/${encodeURIComponent(reference.artifact_id)}/versions/1`,
    { headers: { "x-molis-work-fragment": "detail", cookie: `molis_work_locale=${locale}` } })).text();
  const typeRow = (html: string) => html.match(/<dt>[^<]*<\/dt><dd>[\s\S]*?<\/dd>/gu)?.find(row => row.includes("io.molis.work.dataset.table")) ?? "";

  const english = await detail("en");
  assert.match(typeRow(english), /<dt>Result type<\/dt><dd>Dataset ·/u, "the type is named by its owner, in the owner's English; the label is Artifacts' own");
  assert.doesNotMatch(typeRow(english), /[一-鿿]/u, typeRow(english));
  assert.match(typeRow(await detail("zh")), /<dt>结果类型<\/dt><dd>数据表 ·/u, "the Chinese page shows the declared name");
});
