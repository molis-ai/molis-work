import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { openPagesStore } from "@molis-ai/molis-work-plugin-pages";
import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";

test("official stdio MCP client queries, imports, edits and generates with actual Pages actions across isolated projects", { timeout: 30_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "pages-mcp-"));
  const clients: Client[] = [];
  const connect = async (project: string, access = "write") => {
    const client = new Client({ name: "external-pages", version: "1" }); clients.push(client);
    const transport = new StdioClientTransport({ command: process.execPath,
      args: ["--import", "tsx", fileURLToPath(new URL("./fixtures/pages-mcp-server.ts", import.meta.url)), home, project, access], stderr: "pipe" });
    let errors = ""; transport.stderr?.on("data", data => { errors += String(data); });
    try { await client.connect(transport); } catch (error) { throw new Error(`${String(error)}\n${errors}`); }
    return client;
  };
  const call = async (client: Client, name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name: `${name}__v1`, arguments: args });
    assert.equal(result.isError, false, JSON.stringify(result)); return result.structuredContent as any;
  };
  try {
    const a = await connect("a"), b = await connect("b"), reader = await connect("a", "read");
    const available = (await a.listTools()).tools.map(row => row.name);
    for (const name of ["list", "get", "create", "update", "delete", "templates", "folders.create", "folders.update", "folders.delete", "import.preview", "import", "ai", "extract", "promote", "documents.import", "generations.list", "generations.get", "generate"]) assert.ok(available.includes(`pages.${name}__v1`));
    const { document } = await call(a, "pages.create", { title: "External", body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "MCP content" }] }] } });
    assert.deepEqual((await call(reader, "pages.get", { id: document.id })).document.body, document.body);
    assert.deepEqual((await call(b, "pages.list", {})).documents, []);
    assert.equal((await b.callTool({ name: "pages.get__v1", arguments: { id: document.id } })).isError, true);
    assert.equal((await reader.callTool({ name: "pages.create__v1", arguments: { title: "Denied" } })).isError, true);
    assert.equal((await a.callTool({ name: "pages.create__v1", arguments: { title: "Spoof", project_id: "b" } })).isError, true);
    await call(a, "pages.update", { id: document.id, title: "Updated", expected_version: document.version });
    assert.equal((await a.callTool({ name: "pages.update__v1", arguments: { id: document.id, title: "Stale", expected_version: document.version } })).isError, true);
    const result = await call(a, "pages.ai", { id: document.id, command: "summarize", text: "MCP content" });
    assert.equal(result.text, "MCP fixture reply"); assert.equal(result.stub, false);
    const files = [{ name: "import.md", data: Buffer.from("# Imported\nExternal source").toString("base64") }];
    const preview = await call(a, "pages.import.preview", { files });
    const input = { files, selected_keys: preview.documents.map((page: any) => page.key), request_id: "a0000000-0000-0000-0000-000000000000" };
    const imported = await call(a, "pages.import", input);
    assert.deepEqual((await call(a, "pages.import", input)).documents, imported.documents);
    const parsedInput = { request_id: "external-parsed", request_hash: "confirmed-import", documents: [{ title: "Parsed source", body: document.body }] };
    const parsed = await call(a, "pages.documents.import", parsedInput);
    await call(a, "pages.update", { id: parsed.documents[0].id, title: "Source manually edited" });
    assert.equal((await call(a, "pages.documents.import", parsedInput)).documents[0].title, "Source manually edited");
    const generationInput = { request_id: "external-generation", request_hash: "confirmed-snapshot", title: "Generated", instructions: "Keep source boundary",
      inputs: [{ entry_id: "external-material", item_id: "external-item", revision: 1, title: "Source", body: "Only a summary was read", url: null,
        source_label: "External fixture", captured_at: "2026-09-25T00:00:00Z", provenance: [] }] };
    assert.equal((await reader.callTool({ name: "pages.generate__v1", arguments: generationInput })).isError, true);
    const generated = await call(a, "pages.generate", generationInput);
    assert.match(JSON.stringify(generated.document.body), /Only a summary was read/);
    const record = (await call(reader, "pages.generations.get", { request_id: generationInput.request_id })).record;
    assert.equal(record.document_id, generated.document.id); assert.equal(record.status, "completed");
    assert.deepEqual(record.inputs, generationInput.inputs);
    assert.equal((await call(reader, "pages.generations.list", {})).records[0].document_id, generated.document.id);
    assert.equal((await call(b, "pages.generations.get", { request_id: generationInput.request_id })).record, null);
    await call(a, "pages.update", { id: generated.document.id, title: "Generated then edited" });
    await a.close();
    const restarted = await connect("a");
    const store = openPagesStore(home);
    try {
      const persisted = (await call(restarted, "pages.list", {})).documents;
      assert.deepEqual(persisted, store.list("a"));
      assert.equal(persisted.length, 4);
      assert.equal(store.get(document.id, "a").title, "Updated");
      const replay = await call(restarted, "pages.generate", generationInput);
      assert.equal(replay.document.id, generated.document.id); assert.equal(replay.document.title, "Generated then edited"); assert.equal(replay.replayed, true);
    } finally { store.close(); }
    const db = openHomeSqliteDatabase(home, "pages");
    try {
      db.exec("CREATE TRIGGER fail_mcp_publication BEFORE UPDATE OF artifact_version ON pages WHEN NEW.artifact_version > OLD.artifact_version BEGIN SELECT RAISE(ABORT, 'fixture association failed'); END");
      const failed = await restarted.callTool({ name: "pages.promote__v1", arguments: { id: document.id } });
      assert.equal(failed.isError, true);
      const pending = (await call(reader, "pages.get", { id: document.id })).document;
      assert.equal(pending.publication_pending.version, 1); assert.equal(pending.artifact_version, 0);
      await call(restarted, "pages.update", { id: document.id, title: "Edited during recovery" });
      db.exec("DROP TRIGGER fail_mcp_publication");
    } finally { db.close(); }
    await restarted.close();
    const recovering = await connect("a");
    const recovered = await call(recovering, "pages.promote", { id: document.id });
    assert.equal(recovered.recovered, true); assert.equal(recovered.artifact.version, 1);
    assert.equal(recovered.document.title, "Edited during recovery"); assert.equal(recovered.document.publication_pending, undefined);
    const saved = openPagesStore(home);
    try { assert.deepEqual(recovered.document, saved.get(document.id, "a")); } finally { saved.close(); }
    await call(recovering, "pages.delete", { id: document.id });
    assert.equal((await call(reader, "pages.list", {})).documents.length, 3);
  } finally { await Promise.all(clients.map(client => client.close())); await rm(home, { recursive: true, force: true }); }
});
