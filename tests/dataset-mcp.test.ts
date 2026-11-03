import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { LocalActionGatewayClient, LocalProjectDatabase, MolisWorkLocalHost, openProjectVersionStores, projectActionAvailability } from "@molis-ai/molis-work-app-local-host";
import { createActionMcpPorts, handleMcpMessage } from "@molis-ai/molis-work-app-mcp";
import type { ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { parseCsv } from "@molis-ai/molis-work-plugin-dataset";
import { openDatasetStore } from "./fixtures/plugin-home-stores.js";
import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { serveTestHost, type TestHostServer } from "./fixtures/test-home.js";

// One Home has one execution owner, the resident Host (Dataset runs on its Plugin Runtime, W5-01): each external tool is an MCP
// port whose calls cross the gateway to that Host, as the standard MCP launcher's do. This test builds both in one process;
// reopening means the Host object is closed and rebuilt, not an OS process or an external MCP child.
test("W5-01-DATASET-02: Dataset standard MCP preserves tables and publications across tool calls and a rebuilt Host object", { timeout: 120_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "dataset-mcp-"));
  let host: MolisWorkLocalHost | undefined, web: TestHostServer | undefined;
  const start = async () => {
    host = new MolisWorkLocalHost({ homeDirectory: home, actionAvailability: projectActionAvailability(withMolisWorkProjectCatalog, home),
      completeText: async () => "MCP 列名" });
    web = await serveTestHost(null, { home, host });
  };
  const stop = async () => { await web?.close(); await host?.close(); web = undefined; host = undefined; };
  t.after(async () => { await stop(); await rm(home, { recursive: true, force: true }); });
  await start();
  const a = await web!.createProject("MCP Dataset a"), b = await web!.createProject("MCP Dataset b");

  // What each tool may do is what the person granted it: the writers every Dataset action, the reader the ones that only read.
  const datasetViews = async (clientId: string, projectId: string) => (await web!.inspect(clientId, projectId)).filter(view => view.capability_id.startsWith("dataset."));
  const readsOnly = (view: ActionView) => view.action.permissions.every(permission => permission === "dataset:read");
  await web!.grant("writer", a.project_id, await datasetViews("writer", a.project_id));
  await web!.grant("second-writer", a.project_id, await datasetViews("second-writer", a.project_id));
  await web!.grant("reader", a.project_id, (await datasetViews("reader", a.project_id)).filter(readsOnly));
  await web!.grant("other", b.project_id, await datasetViews("other", b.project_id));

  type Tool = ReturnType<typeof createActionMcpPorts>;
  const connect = (clientId: string, projectId: string): Tool => createActionMcpPorts({ serverInfo: { name: "external-dataset", version: "1" },
    service: new LocalActionGatewayClient({ url: web!.origin, homeDirectory: home, clientId, projectId, controlToken: web!.controlToken }),
    context: () => ({ actor_id: clientId, project_id: projectId, audience: "mcp", permissions: [] }) });
  // W4-6-07 RAC-633-MIG-01: content.receive and subject.read have version 2; the other tools keep version 1.
  const tool = (name: string) => `dataset.${name}__v${["content.receive", "subject.read"].includes(name) ? 2 : 1}`;
  const answer = async (client: Tool, name: string, args: Record<string, unknown>) =>
    (await handleMcpMessage({ id: 1, method: "tools/call", params: { name: tool(name), arguments: args } }, client))!.result as { isError: boolean; content: Array<{ text: string }>; structuredContent?: unknown };
  const call = async (client: Tool, name: string, args: Record<string, unknown> = {}): Promise<any> => {
    const result = await answer(client, name, args);
    assert.equal(result.isError, false, JSON.stringify(result)); return result.structuredContent as any;
  };

  let writer = connect("writer", a.project_id), reader = connect("reader", a.project_id);
  const other = () => connect("other", b.project_id);
  const tools = await handleMcpMessage({ id: 1, method: "tools/list", params: {} }, writer);
  assert.deepEqual((tools!.result as { tools: Array<{ name: string }> }).tools.map(item => item.name).filter(name => name.startsWith("dataset.")).sort(),
    ["list", "get", "create", "update", "delete", "columns.add", "columns.ai", "import", "export", "versions", "snapshot", "rollback", "promote", "artifacts.pin", "search.entries", "subject.read",
      // The shared workflow content station (other work hands CSV in, reads the table out).
      "content.list", "content.read", "content.receive", "content.create"].map(name => tool(name)).sort());
  assert.equal((await call(reader, "list")).ai_available, false);
  let { dataset } = await call(writer, "create", { title: "外部数据表" });
  assert.equal((await call(reader, "get", { id: dataset.id })).dataset.title, dataset.title);
  assert.deepEqual((await call(other(), "list")).datasets, []);
  for (const [client, name, args] of [[other(), "get", { id: dataset.id }], [reader, "create", {}], [writer, "create", { project_id: "b" }]] as const) {
    assert.equal((await answer(client, name, args)).isError, true);
  }
  dataset = (await call(writer, "import", { id: dataset.id, expected_version: dataset.version, csv: '姓名,说明\r\n一骏,"first\r\nsecond, ""quote"""' })).dataset;
  const csv = (await call(reader, "export", { id: dataset.id })).csv;
  assert.deepEqual(parseCsv(csv).rows.map(row => row.cells), dataset.rows.map((row: { cells: Record<string, string> }) => row.cells));
  const original = dataset;
  const { version } = await call(writer, "snapshot", { id: dataset.id, note: "原始表", expected_version: dataset.version });
  dataset = (await call(writer, "columns.add", { id: dataset.id, prompt: "本地列", expected_version: dataset.version })).dataset;
  dataset = (await call(writer, "columns.ai", { id: dataset.id, prompt: "拟一个日期列名", expected_version: dataset.version })).dataset;
  assert.equal(dataset.columns.at(-1).name, "MCP 列名");
  assert.equal((await answer(writer, "update", { id: dataset.id, title: "过期内容", expected_version: original.version })).isError, true);
  dataset = (await call(writer, "rollback", { id: dataset.id, version_id: version.id, expected_version: dataset.version })).dataset;
  assert.deepEqual(dataset.columns, original.columns); assert.deepEqual(dataset.rows, original.rows);
  assert.equal((await call(reader, "versions", { id: dataset.id })).versions[0].id, version.id);
  const db = openHomeSqliteDatabase(home, "dataset");
  try {
    db.exec("CREATE TRIGGER fail_dataset_mcp_publication BEFORE UPDATE OF artifact_version ON datasets WHEN NEW.artifact_version > OLD.artifact_version BEGIN SELECT RAISE(ABORT, 'fixture association failed'); END");
    assert.equal((await answer(writer, "promote", { id: dataset.id, expected_version: dataset.version })).isError, true);
    const pending = (await call(reader, "get", { id: dataset.id })).dataset;
    assert.equal(pending.publication_pending.version, 1); assert.equal(pending.artifact_version, 0);
    dataset = (await call(writer, "update", { id: dataset.id, title: "发布后继续编辑", expected_version: pending.version })).dataset;
    db.exec("DROP TRIGGER fail_dataset_mcp_publication");
  } finally { db.close(); }

  // The Host object is closed and rebuilt in this process; the tools reconnect to it.
  await stop(); await start();
  writer = connect("writer", a.project_id); reader = connect("reader", a.project_id);
  const recovered = await call(writer, "promote", { id: dataset.id, expected_version: dataset.version });
  assert.equal(recovered.recovered, true); assert.equal(recovered.artifact.version, 1);
  assert.equal(recovered.dataset.title, "发布后继续编辑"); assert.equal(recovered.dataset.publication_pending, undefined);
  const project = new LocalProjectDatabase(a.database_path);
  try {
    const library = openProjectVersionStores(project);
    const artifact = library.artifacts.query.getArtifactVersion(a.project_id, recovered.artifact)!;
    assert.equal((artifact.payload as { title: string }).title, "外部数据表");
    assert.deepEqual((artifact.payload as { rows: unknown[] }).rows, original.rows);
    assert.equal(library.artifacts.query.getArtifactVersion(a.project_id, { artifact_id: recovered.artifact.artifact_id, version: 2 }), null);
  } finally { project.close(); }
  const store = openDatasetStore(home);
  try { assert.deepEqual(store.get(dataset.id, a.project_id), recovered.dataset); } finally { store.close(); }
  await call(writer, "delete", { id: dataset.id, expected_version: recovered.dataset.version });
  assert.deepEqual((await call(reader, "list")).datasets, []);
});
