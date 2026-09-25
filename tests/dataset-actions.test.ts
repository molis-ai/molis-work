import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { datasetActions as actions, DATASET_ACTION_PERMISSIONS, openDatasetStore, runDatasetMcpTool, parseCsv, toCsv } from "@molis-ai/molis-work-plugin-dataset";
import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "../apps/local-host/src/project-host.js";
import type { HostCompleteText } from "../apps/local-host/src/host-complete-text.js";

async function fixture(t: test.TestContext, completeText: HostCompleteText | null = null) {
  const home = await mkdtemp(join(tmpdir(), "dataset-actions-")), host = new MolisWorkLocalHost({ homeDirectory: home, completeText });
  t.after(async () => { await host.close(); await rm(home, { recursive: true, force: true }); });
  const ref = molisWorkHostProjectReference({ databasePath: join(home, "project.sqlite"), boardId: "legacy-board", projectId: "a" });
  await host.withProject(ref, runtime => runtime.coordinator.initializeBoard({ board_id: ref.board_id, title: "Dataset", actor_id: "owner", idempotency_key: "init" }));
  const caller: ActionCallContext = { actor_id: "owner", project_id: "a", audience: "user", permissions: DATASET_ACTION_PERMISSIONS };
  const client = host.actionClient(ref), bound = bindActionClient(client, () => caller);
  return { home, host, ref, caller, client, bound };
}

test("Dataset registers all business actions; legacy MCP, snapshots, CSV and Artifact share original storage", async t => {
  const f = await fixture(t);
  const legacy = async (tool_id: string, args = {}) => JSON.parse(await runDatasetMcpTool(f.bound, { tool_id, arguments: args }));
  const catalog = await f.bound.discover();
  for (const action of Object.values(actions)) assert.ok(catalog.some(item => item.capability_id === action.capability_id));
  assert.equal(catalog.find(item => item.capability_id === actions.generateAi.capability_id)!.availability.available, false);
  const { dataset } = await legacy("create", { title: "Original" });
  assert.equal((await legacy("list")).datasets[0].id, dataset.id);
  await assert.rejects(f.client.invoke({ ...f.caller, project_id: "b" }, actions.list, {}), { code: "actions.scope_mismatch" });
  await assert.rejects(f.client.invoke({ ...f.caller, permissions: ["dataset:read"] }, actions.create, {}), { code: "actions.forbidden" });
  await assert.rejects(f.bound.invoke(actions.create, { project_id: "b" } as never), { code: "actions.input_invalid" });
  await assert.rejects(f.bound.invoke(actions.update, { id: dataset.id, columns: ["bad"] } as never), { code: "actions.input_invalid" });
  const updated = (await legacy("update", { id: dataset.id, title: "Edited", expected_version: dataset.version })).dataset;
  await assert.rejects(f.bound.invoke(actions.update, { id: dataset.id, title: "Stale", expected_version: dataset.version }), { code: "dataset.conflict" });
  assert.equal((await legacy("get", { id: dataset.id })).dataset.title, "Edited");
  await legacy("generate", { id: dataset.id, prompt: "Local column", expected_version: updated.version });
  const csv = '姓名,说明,日期\r\n一骏,"a,b\nline ""quoted""",2026-09-25\r\n小陈,"",2026-09-26';
  const imported = (await legacy("import", { id: dataset.id, csv })).dataset;
  assert.equal(imported.rows.length, 2); assert.equal(imported.rows[0].cells[imported.columns[1].id], 'a,b\nline "quoted"');
  assert.equal(imported.columns[2].type, "date");
  const exported = await legacy("export", { id: dataset.id });
  assert.deepEqual(parseCsv(exported.csv).rows.map(r => r.cells), imported.rows.map((r: any) => r.cells));
  assert.equal(exported.csv, toCsv(imported));
  await assert.rejects(f.bound.invoke(actions.import, { id: dataset.id, csv: 'col\n"broken' }), { code: "dataset.invalid" });
  assert.deepEqual((await legacy("get", { id: dataset.id })).dataset, imported);
  const snapshot = (await legacy("snapshot", { id: dataset.id, note: "Original snapshot" })).version;
  assert.equal((await legacy("versions", { id: dataset.id })).versions[0].id, snapshot.id);
  await legacy("update", { id: dataset.id, rows: [] });
  assert.equal((await legacy("rollback", { id: dataset.id, version_id: snapshot.id })).dataset.rows.length, 2);
  const promoted = await legacy("promote", { id: dataset.id });
  assert.equal(promoted.artifact.artifact_id, "dataset-" + dataset.id); assert.equal(promoted.dataset.artifact_version, 1);
  await f.host.withProject(f.ref, runtime => {
    const artifact = runtime.coordinator.artifacts.query.getArtifactVersion(f.ref.board_id, promoted.artifact)!;
    assert.equal(artifact.owner_actor_id, "owner"); assert.deepEqual((artifact.payload as any).rows, imported.rows);
  });
  const store = openDatasetStore(f.home); let foreign: string;
  try { foreign = store.create({ project_id: "b", title: "Private" }).id; assert.equal(store.get(dataset.id).artifact_version, 1); } finally { store.close(); }
  for (const definition of [actions.get, actions.versions, actions.export, actions.delete]) await assert.rejects(f.bound.invoke(definition, { id: foreign }), { code: "dataset.not_found" });
  const another = await fixture(t);
  assert.deepEqual((await another.bound.invoke(actions.list, {})).datasets, []);
  await f.host.closeProject(f.ref);
  assert.equal((await legacy("versions", { id: dataset.id })).versions[0].id, snapshot.id);
  await legacy("delete", { id: dataset.id }); assert.deepEqual((await legacy("list")).datasets, []);
});

test("Dataset publication recovers original Artifact after restart without replacing newer edits or another actor", async t => {
  const { bound, home, host, ref, client, caller } = await fixture(t);
  const { dataset } = await bound.invoke(actions.create, { title: "Publication v1" });
  const db = openHomeSqliteDatabase(home, "dataset");
  try {
    db.exec("CREATE TRIGGER fail_publication BEFORE UPDATE OF artifact_version ON datasets WHEN NEW.artifact_version > OLD.artifact_version BEGIN SELECT RAISE(ABORT, 'fixture association failure'); END");
    await assert.rejects(bound.invoke(actions.promote, { id: dataset.id }), /fixture association failure/);
    assert.equal((await bound.invoke(actions.get, { id: dataset.id })).dataset.publication_pending!.version, 1);
    await assert.rejects(bound.invoke(actions.delete, { id: dataset.id }), { code: "dataset.publication_pending" });
    const edited = (await bound.invoke(actions.update, { id: dataset.id, title: "New local edit" })).dataset;
    await assert.rejects(client.invoke({ ...caller, actor_id: "another-user" }, actions.promote, { id: dataset.id }), { code: "dataset.publication_owner" });
    db.exec("DROP TRIGGER fail_publication"); await host.closeProject(ref);
    const restored = await bound.invoke(actions.promote, { id: dataset.id, expected_version: edited.version });
    assert.equal(restored.recovered, true); assert.equal(restored.dataset.title, "New local edit"); assert.equal(restored.dataset.publication_pending, undefined);
    await host.withProject(ref, runtime => {
      assert.equal((runtime.coordinator.artifacts.query.getArtifactVersion(ref.board_id, restored.artifact)!.payload as any).title, "Publication v1");
      assert.equal(runtime.coordinator.artifacts.query.getArtifactVersion(ref.board_id, { ...restored.artifact, version: 2 }), null);
    });
    const next = await bound.invoke(actions.promote, { id: dataset.id }); assert.equal(next.artifact.version, 2);
    await host.withProject(ref, runtime => assert.equal((runtime.coordinator.artifacts.query.getArtifactVersion(ref.board_id, next.artifact)!.payload as any).title, "New local edit"));
  } finally { db.close(); }
});

test("Dataset deletion is atomic with version removal", async t => {
  const { bound, home } = await fixture(t);
  const { dataset } = await bound.invoke(actions.create, {});
  const saved = await bound.invoke(actions.snapshot, { id: dataset.id });
  const db = openHomeSqliteDatabase(home, "dataset");
  try {
    db.exec("CREATE TRIGGER fail_delete BEFORE DELETE ON datasets BEGIN SELECT RAISE(ABORT, 'fixture delete failure'); END");
    await assert.rejects(bound.invoke(actions.delete, { id: dataset.id }), /fixture delete failure/);
    assert.equal((await bound.invoke(actions.get, { id: dataset.id })).dataset.id, dataset.id);
    assert.equal((await bound.invoke(actions.versions, { id: dataset.id })).versions[0]!.id, saved.version.id);
  } finally { db.close(); }
});

for (const mode of ["missing", "failure", "empty", "cancel", "edit", "delete", "success"] as const) test(`Dataset explicit AI ${mode} preserves current data and permissions`, async t => {
  const entered = Promise.withResolvers<void>(), released = Promise.withResolvers<void>(); let calls = 0;
  const f = await fixture(t, mode === "missing" ? null : async prompt => {
    calls++; assert.match(prompt, /计划截止日期/);
    if (mode === "failure") throw new Error("Fixture failure");
    if (mode === "empty") return " ";
    if (mode !== "success") { entered.resolve(); await released.promise; }
    return "截止日期";
  });
  const { dataset } = await f.bound.invoke(actions.create, {});
  await f.bound.invoke(actions.generate, { id: dataset.id, prompt: "原列" }); assert.equal(calls, 0);
  await assert.rejects(f.client.invoke({ ...f.caller, permissions: ["dataset:read", "dataset:write"] }, actions.generateAi, { id: dataset.id, prompt: "计划截止日期" }), { code: "actions.forbidden" });
  const abort = new AbortController();
  const pending = f.client.invoke({ ...f.caller, signal: abort.signal }, actions.generateAi, { id: dataset.id, prompt: "计划截止日期" });
  if (mode === "success") { assert.equal((await pending).dataset.columns.at(-1)!.name, "截止日期"); return; }
  const rejection = assert.rejects(pending, mode === "missing" ? { code: "actions.connection_required" } : mode === "failure" ? /Fixture failure/ : mode === "empty" ? /没有返回有效列名/
    : mode === "cancel" ? { name: "AbortError" } : mode === "edit" ? { code: "dataset.conflict" } : { code: "dataset.not_found" });
  if (["cancel", "edit", "delete"].includes(mode)) {
    await entered.promise;
    if (mode === "cancel") abort.abort();
    else if (mode === "edit") await f.bound.invoke(actions.update, { id: dataset.id, title: "Concurrent edit" });
    else await f.bound.invoke(actions.delete, { id: dataset.id });
    released.resolve();
  }
  await rejection;
  if (mode !== "delete") assert.equal((await f.bound.invoke(actions.get, { id: dataset.id })).dataset.columns.length, 1);
});


test("Dataset AI availability follows all required grants and the caller capability allowlist", async t => {
  const f = await fixture(t, async () => "列名");
  for (const caller of [
    { ...f.caller, permissions: ["dataset:read", "model:invoke"] },
    { ...f.caller, allowed_capability_ids: [actions.list.capability_id] },
  ]) {
    const result = await f.client.invoke(caller, actions.list, {});
    assert.equal(result.ai_available, false); assert.match(result.ai_unavailable_reason!, /权限/);
    await assert.rejects(f.client.invoke(caller, actions.generateAi, { id: "irrelevant", prompt: "日期" }), { code: "actions.forbidden" });
  }
  assert.equal((await f.bound.invoke(actions.list, {})).ai_available, true);
});
