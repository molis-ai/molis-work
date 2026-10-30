import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { PAGES_ACTION_PERMISSIONS, PAGES_PROJECT_PLUGIN_ID } from "@molis-ai/molis-work-plugin-pages";
import { openPagesStore } from "./fixtures/plugin-home-stores.js";
import { molisWorkActionToolName } from "@molis-ai/molis-work-app-mcp";
import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { openTestHome } from "./fixtures/test-home.js";
import { residentMcpGrants } from "./fixtures/resident-mcp-grants.js";

// W5-01-PAGES-02 / -04: Pages' actions over the official MCP client on the project Runtime, including a promote that fails at the association and is recovered.
// RAC-105-A-16: every MCP client starts a forwarding process, which takes several seconds on a loaded Linux CI runner (30–45 s for the
// whole test at two files at once): the budget only stops a hang, it is not a speed check.
test("official stdio MCP client queries, imports, edits and generates with actual Pages actions across isolated projects", { timeout: 120_000 }, async t => {
  const resident = await openTestHome(t, { host: { completeText: async () => "MCP fixture reply" } }), home = resident.home;
  const projects = { a: await resident.createProject("Pages A", [PAGES_PROJECT_PLUGIN_ID]), b: await resident.createProject("Pages B", [PAGES_PROJECT_PLUGIN_ID]) };
  const grant = residentMcpGrants();
  const clients: Client[] = [];
  const connect = async (project: string, access = "write") => {
    const ref = projects[project as keyof typeof projects], actor = `runtime:fixture-${access}`;
    const permissions = access === "read" ? ["pages:read"] : PAGES_ACTION_PERMISSIONS;
    await grant(resident, ref.project_id, actor, "pages", permissions);
    const client = new Client({ name: "external-pages", version: "1" }); clients.push(client);
    const transport = new StdioClientTransport({ command: process.execPath,
      args: ["--import", "tsx", fileURLToPath(new URL("./fixtures/pages-mcp-server.ts", import.meta.url)), home, ref.project_id, `fixture-${access}`, ref.database_path, resident.origin], stderr: "pipe" });
    let errors = ""; transport.stderr?.on("data", data => { errors += String(data); });
    try { await client.connect(transport); } catch (error) { throw new Error(`${String(error)}\n${errors}`); }
    return client;
  };
  const tool = (name: string, version = 1) => molisWorkActionToolName({ capability_id: name, version });
  const call = async (client: Client, name: string, args: Record<string, unknown>, version = 1) => {
    const result = await client.callTool({ name: tool(name, version), arguments: args });
    assert.equal(result.isError, false, JSON.stringify(result)); return result.structuredContent as any;
  };
  try {
    const a = await connect("a"), b = await connect("b"), reader = await connect("a", "read");
    const available = (await a.listTools()).tools.map(row => row.name);
    for (const name of ["list", "get", "update", "delete", "templates", "folders.create", "folders.update", "folders.delete", "import.preview", "import", "ai", "extract", "promote", "documents.import", "generations.list", "generations.get", "generate"]) assert.ok(available.includes(tool(`pages.${name}`)));
    // W4-2-12: the new strict output is version 2; the old tool is absent, with no alias.
    assert.ok(available.includes(tool("pages.create", 2)));
    assert.equal(available.includes(tool("pages.create")), false);
    assert.equal((await a.callTool({ name: tool("pages.create"), arguments: { title: "Old binding" } })).isError, true);
    const { document } = await call(a, "pages.create", { title: "External", body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "MCP content" }] }] } }, 2);
    assert.deepEqual((await call(reader, "pages.get", { id: document.id })).document.body, document.body);
    assert.deepEqual((await call(b, "pages.list", {})).documents, []);
    assert.equal((await b.callTool({ name: tool("pages.get"), arguments: { id: document.id } })).isError, true);
    assert.equal((await reader.callTool({ name: tool("pages.create", 2), arguments: { title: "Denied" } })).isError, true);
    assert.equal((await a.callTool({ name: tool("pages.create", 2), arguments: { title: "Spoof", project_id: "b" } })).isError, true);
    assert.deepEqual((await call(a, "pages.list", {})).documents.map((page: { id: string }) => page.id), [document.id], "refused calls created nothing");
    assert.deepEqual((await call(b, "pages.list", {})).documents, []);
    // W3-09-3: an AI source (here MCP) sends the version it read whenever it changes, asks about or publishes an existing document.
    const updated = (await call(a, "pages.update", { id: document.id, title: "Updated", expected_version: document.version })).document;
    assert.equal((await a.callTool({ name: tool("pages.update"), arguments: { id: document.id, title: "Stale", expected_version: document.version } })).isError, true);
    const result = await call(a, "pages.ai", { id: document.id, command: "summarize", text: "MCP content", expected_version: updated.version });
    assert.equal(result.text, "MCP fixture reply"); assert.equal("stub" in result, false);
    const files = [{ name: "import.md", data: Buffer.from("# Imported\nExternal source").toString("base64") }];
    const preview = await call(a, "pages.import.preview", { files });
    const input = { files, selected_keys: preview.documents.map((page: any) => page.key), request_id: "a0000000-0000-0000-0000-000000000000" };
    const imported = await call(a, "pages.import", input);
    assert.deepEqual((await call(a, "pages.import", input)).documents, imported.documents);
    const parsedInput = { request_id: "external-parsed", request_hash: "confirmed-import", documents: [{ title: "Parsed source", body: document.body }] };
    const parsed = await call(a, "pages.documents.import", parsedInput);
    await call(a, "pages.update", { id: parsed.documents[0].id, title: "Source manually edited", expected_version: parsed.documents[0].version });
    assert.equal((await call(a, "pages.documents.import", parsedInput)).documents[0].title, "Source manually edited");
    const generationInput = { request_id: "external-generation", request_hash: "confirmed-snapshot", title: "Generated", instructions: "Keep source boundary",
      inputs: [{ entry_id: "external-material", item_id: "external-item", revision: 1, title: "Source", body: "Only a summary was read", url: null,
        source_label: "External fixture", captured_at: "2026-09-25T00:00:00Z", provenance: [] }] };
    assert.equal((await reader.callTool({ name: tool("pages.generate"), arguments: generationInput })).isError, true);
    const generated = await call(a, "pages.generate", generationInput);
    assert.match(JSON.stringify(generated.document.body), /Only a summary was read/);
    const record = (await call(reader, "pages.generations.get", { request_id: generationInput.request_id })).record;
    assert.equal(record.document_id, generated.document.id); assert.equal(record.status, "completed");
    assert.deepEqual(record.inputs, generationInput.inputs);
    assert.equal((await call(reader, "pages.generations.list", {})).records[0].document_id, generated.document.id);
    assert.equal((await call(b, "pages.generations.get", { request_id: generationInput.request_id })).record, null);
    await call(a, "pages.update", { id: generated.document.id, title: "Generated then edited", expected_version: generated.document.version });
    await a.close();
    const restarted = await connect("a");
    const store = openPagesStore(home);
    try {
      const persisted = (await call(restarted, "pages.list", {})).documents;
      assert.deepEqual(persisted, store.list(projects.a.project_id));
      assert.equal(persisted.length, 4);
      assert.equal(store.get(document.id, projects.a.project_id).title, "Updated");
      const replay = await call(restarted, "pages.generate", generationInput);
      assert.equal(replay.document.id, generated.document.id); assert.equal(replay.document.title, "Generated then edited"); assert.equal(replay.replayed, true);
    } finally { store.close(); }
    const db = openHomeSqliteDatabase(home, "pages");
    try {
      db.exec("CREATE TRIGGER fail_mcp_publication BEFORE UPDATE OF artifact_version ON pages WHEN NEW.artifact_version > OLD.artifact_version BEGIN SELECT RAISE(ABORT, 'fixture association failed'); END");
      const before = (await call(reader, "pages.get", { id: document.id })).document;
      const failed = await restarted.callTool({ name: tool("pages.promote"), arguments: { id: document.id, expected_version: before.version } });
      assert.equal(failed.isError, true);
      assert.notEqual(JSON.parse((failed.content as Array<{ text: string }>)[0]!.text).code, "actions.version_required", "the promote fails at the association, not for a missing version");
      const pending = (await call(reader, "pages.get", { id: document.id })).document;
      assert.equal(pending.publication_pending.version, 1); assert.equal(pending.artifact_version, 0);
      await call(restarted, "pages.update", { id: document.id, title: "Edited during recovery", expected_version: pending.version });
      db.exec("DROP TRIGGER fail_mcp_publication");
    } finally { db.close(); }
    await restarted.close();
    const recovering = await connect("a");
    // Reconnecting the client leaves the one resident and its Pages instance running.
    await call(recovering, "pages.list", {});
    const current = (await call(reader, "pages.get", { id: document.id })).document;
    const recovered = await call(recovering, "pages.promote", { id: document.id, expected_version: current.version });
    assert.equal(recovered.recovered, true); assert.equal(recovered.artifact.version, 1);
    assert.equal(recovered.document.title, "Edited during recovery"); assert.equal(recovered.document.publication_pending, undefined);
    const saved = openPagesStore(home);
    try { assert.deepEqual(recovered.document, saved.get(document.id, projects.a.project_id)); } finally { saved.close(); }
    await call(recovering, "pages.delete", { id: document.id });
    assert.equal((await call(reader, "pages.list", {})).documents.length, 3);
  } finally { await Promise.all(clients.map(client => client.close())); }
});
