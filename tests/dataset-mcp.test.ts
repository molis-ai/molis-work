import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { openDatasetStore, parseCsv } from "@molis-ai/molis-work-plugin-dataset";
import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { GoalProjectApplication, LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";

test("Dataset standard MCP: actual data, project grants, CSV, versions and publication recovery across processes", { timeout: 45_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "dataset-mcp-")), clients: Client[] = [];
  const connect = async (project: string, access = "write") => {
    const client = new Client({ name: "external-dataset", version: "1" }); clients.push(client);
    const transport = new StdioClientTransport({ command: process.execPath,
      args: ["--import", "tsx", fileURLToPath(new URL("./fixtures/dataset-mcp-server.ts", import.meta.url)), home, project, access], stderr: "pipe" });
    let errors = ""; transport.stderr?.on("data", data => { errors += String(data); });
    try { await client.connect(transport); } catch (error) { throw new Error(`${String(error)}\n${errors}`); }
    return client;
  };
  const call = async (client: Client, name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name: `dataset.${name}__v1`, arguments: args });
    assert.equal(result.isError, false, JSON.stringify(result)); return result.structuredContent as any;
  };
  try {
    const writer = await connect("a"), other = await connect("b"), reader = await connect("a", "read");
    const names = (await writer.listTools()).tools.map(t => t.name).filter(n => n.startsWith("dataset."));
    assert.deepEqual(names.sort(), ["list", "get", "create", "update", "delete", "columns.add", "columns.ai", "import", "export", "versions", "snapshot", "rollback", "promote"].map(n => `dataset.${n}__v1`).sort());
    assert.equal((await call(reader, "list")).ai_available, false);
    let { dataset } = await call(writer, "create", { title: "外部数据表" });
    assert.equal((await call(reader, "get", { id: dataset.id })).dataset.title, dataset.title);
    assert.deepEqual((await call(other, "list")).datasets, []);
    for (const [client, name, args] of [[other, "get", { id: dataset.id }], [reader, "create", {}], [writer, "create", { project_id: "b" }]] as const) {
      assert.equal((await client.callTool({ name: `dataset.${name}__v1`, arguments: args })).isError, true);
    }
    dataset = (await call(writer, "import", { id: dataset.id, expected_version: dataset.version, csv: '姓名,说明\r\n一骏,"first\r\nsecond, ""quote"""' })).dataset;
    const csv = (await call(reader, "export", { id: dataset.id })).csv;
    assert.deepEqual(parseCsv(csv).rows.map(r => r.cells), dataset.rows.map((r: any) => r.cells));
    const original = dataset;
    const { version } = await call(writer, "snapshot", { id: dataset.id, note: "原始表", expected_version: dataset.version });
    dataset = (await call(writer, "columns.add", { id: dataset.id, prompt: "本地列", expected_version: dataset.version })).dataset;
    dataset = (await call(writer, "columns.ai", { id: dataset.id, prompt: "拟一个日期列名", expected_version: dataset.version })).dataset;
    assert.equal(dataset.columns.at(-1).name, "MCP 列名");
    assert.equal((await writer.callTool({ name: "dataset.update__v1", arguments: { id: dataset.id, title: "过期内容", expected_version: original.version } })).isError, true);
    dataset = (await call(writer, "rollback", { id: dataset.id, version_id: version.id, expected_version: dataset.version })).dataset;
    assert.deepEqual(dataset.columns, original.columns); assert.deepEqual(dataset.rows, original.rows);
    assert.equal((await call(reader, "versions", { id: dataset.id })).versions[0].id, version.id);
    const db = openHomeSqliteDatabase(home, "dataset");
    try {
      db.exec("CREATE TRIGGER fail_dataset_mcp_publication BEFORE UPDATE OF artifact_version ON datasets WHEN NEW.artifact_version > OLD.artifact_version BEGIN SELECT RAISE(ABORT, 'fixture association failed'); END");
      assert.equal((await writer.callTool({ name: "dataset.promote__v1", arguments: { id: dataset.id, expected_version: dataset.version } })).isError, true);
      const pending = (await call(reader, "get", { id: dataset.id })).dataset;
      assert.equal(pending.publication_pending.version, 1); assert.equal(pending.artifact_version, 0);
      dataset = (await call(writer, "update", { id: dataset.id, title: "发布后继续编辑", expected_version: pending.version })).dataset;
      db.exec("DROP TRIGGER fail_dataset_mcp_publication");
    } finally { db.close(); }
    await writer.close();
    const restarted = await connect("a");
    const recovered = await call(restarted, "promote", { id: dataset.id, expected_version: dataset.version });
    assert.equal(recovered.recovered, true); assert.equal(recovered.artifact.version, 1);
    assert.equal(recovered.dataset.title, "发布后继续编辑"); assert.equal(recovered.dataset.publication_pending, undefined);
    const project = new LocalProjectDatabase(join(home, "a.sqlite"));
    try {
      const coordinator = new GoalProjectApplication(project);
      const artifact = coordinator.artifacts.query.getArtifactVersion("a", recovered.artifact)!;
      assert.equal((artifact.payload as any).title, "外部数据表");
      assert.deepEqual((artifact.payload as any).rows, original.rows);
      assert.equal(coordinator.artifacts.query.getArtifactVersion("a", { artifact_id: recovered.artifact.artifact_id, version: 2 }), null);
    } finally { project.close(); }
    const store = openDatasetStore(home);
    try { assert.deepEqual(store.get(dataset.id, "a"), recovered.dataset); } finally { store.close(); }
    await call(restarted, "delete", { id: dataset.id, expected_version: recovered.dataset.version });
    assert.deepEqual((await call(reader, "list")).datasets, []);
  } finally { await Promise.all(clients.map(c => c.close())); await rm(home, { recursive: true, force: true }); }
});
