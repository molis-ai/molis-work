import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DEMO_PROJECT_ID, GoalProjectApplication, LocalProjectDatabase, MolisWorkLocalHost, molisWorkHostProjectReference, resolveWebControlToken, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { pinnedArtifact } from "./fixtures/artifacts.js";

const controlToken = "artifact-declaration-gate-control-token-0123456789";
const coding = { plugin_id: "io.molis.work.coding", plugin_version: "1.20.0", binding_signature: "official-coding-binding" };
const pages = { plugin_id: "io.molis.work.pages", plugin_version: "1.0.0", binding_signature: "official-pages-binding" };
const write = (artifact_id: string, artifact_type_id: string, producer: typeof coding, title: string) => ({ project_id: DEMO_PROJECT_ID, actor_id: "fixture",
  artifact_id, version: 1, artifact_type_id, schema_version: 1, producer, content: { kind: "inline" as const, payload: { title } },
  ...pinnedArtifact(title, { kind: "fixture", id: artifact_id }, "1") });

async function fixture(t: test.TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "molis-work-artifact-declarations-"));
  const databasePath = join(directory, "fixture.db");
  seedDemoBoard(databasePath);
  const store = new LocalProjectDatabase(databasePath);
  const coordinator = new GoalProjectApplication(store);
  const server = createMolisWorkWebServer({ databasePath, projectId: DEMO_PROJECT_ID, homeDirectory: directory, controlToken });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); store.close(); await rm(directory, { recursive: true, force: true }); });
  await (await fetch(origin + "/health")).text();
  return { coordinator, origin };
}

// specs/artifact-positioning A7: what a built-in plugin writes must match what its Manifest declares, store by store.
test("a built-in plugin writes only the types its Manifest declares, each to the store it declares it for", async t => {
  const { coordinator } = await fixture(t);
  // Pages declares documents as 成果 and nothing else.
  assert.throws(() => coordinator.artifacts.commands.registerVersion(write("pages-stray", "io.molis.work.pages.outline", pages, "未声明")), { code: "artifact.type_undeclared" });
  // Coding's change set is a process item; its report is a 成果. Neither goes to the other store.
  assert.throws(() => coordinator.artifacts.commands.registerVersion(write("changeset-in-library", "coding.changeset.v1", coding, "变更集")), { code: "artifact.type_undeclared" });
  assert.throws(() => coordinator.processItems.commands.registerVersion(write("report-as-process", "coding.report.v1", coding, "报告")), { code: "artifact.type_undeclared" });
  assert.equal(coordinator.artifacts.query.listArtifacts(DEMO_PROJECT_ID).filter(item => ["pages-stray", "changeset-in-library"].includes(item.artifact_id)).length, 0);
  assert.equal(coordinator.processItems.commands.registerVersion(write("changeset-ok", "coding.changeset.v1", coding, "变更集")).replayed, false);
  // A plugin this host did not build in is held to its Manifest by the Plugin Runtime's own clients.
  const installed = { plugin_id: "com.example.installed", plugin_version: "1.0.0", binding_signature: "installed-binding" };
  assert.equal(coordinator.artifacts.commands.registerVersion(write("installed-1", "com.example.note", installed, "安装的插件")).replayed, false);
});

test("process items never reach the 成果库, the side panel's files or the system search", { timeout: 60_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "molis-work-process-items-hidden-"));
  const project = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "过程项", actor_id: "owner" }));
  await withCatalog({ homeDirectory: home }, catalog => catalog.addProjectPlugin({ project_id: project.project_id, plugin_id: "artifacts", actor_id: "owner" }));
  const ref = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const token = resolveWebControlToken({ homeDirectory: home });
  const server = createMolisWorkWebServer({ homeDirectory: home, localHost: host, controlToken: token });
  try {
    const at = (input: ReturnType<typeof write>) => ({ ...input, project_id: project.project_id });
    await host.withProject(ref, runtime => {
      runtime.coordinator.processItems.commands.registerVersion(at(write("coding-changeset:s:r", "coding.changeset.v1", coding, "过程项甲乙丙")));
      // A 成果 with a title of the same shape is the positive control: every list below does show 成果.
      runtime.coordinator.artifacts.commands.registerVersion({ ...at(write("coding-report:s:r", "coding.report.v1", coding, "成果甲乙丙")),
        content: { kind: "inline", payload: { title: "成果甲乙丙", body: "成果甲乙丙", summary: "成果甲乙丙" } } });
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`, origin = `${base}/projects/${project.project_id}`;
    const json = async (path: string, init?: RequestInit) => JSON.stringify(await (await fetch(origin + path, init)).json());

    const library = await json("/api/artifacts/versions");
    assert.match(library, /成果甲乙丙/);
    assert.doesNotMatch(library, /过程项甲乙丙|coding-changeset/);

    const sources = JSON.parse(await json("/api/side/files/sources")).sources as Array<{ id: string }>;
    const files: string[] = [];
    for (const source of sources) files.push(await json(`/api/side/files/entries?source=${encodeURIComponent(source.id)}`));
    assert.match(files.join("\n"), /成果甲乙丙/);
    assert.doesNotMatch(files.join("\n"), /过程项甲乙丙|coding-changeset/);

    const headers = { "content-type": "application/json", origin: base, "x-molis-work-control-token": token };
    const search = (query: string) => json("/api/search/query", { method: "POST", headers: { ...headers, "x-molis-work-idempotency-key": randomUUID() },
      body: JSON.stringify({ query, scope: "project", limit: 20 }) });
    assert.match(await search("成果甲乙丙"), /成果甲乙丙/);
    assert.doesNotMatch(await search("过程项甲乙丙"), /过程项甲乙丙/);
  } finally {
    await new Promise<void>(resolve => server.listening ? server.close(() => resolve()) : resolve());
    await host.close();
    await rm(home, { recursive: true, force: true });
  }
});
