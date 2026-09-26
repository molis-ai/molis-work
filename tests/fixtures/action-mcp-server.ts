import { DatabaseSync } from "node:sqlite";
import { LocalHost } from "@molis-ai/molis-work-app-local-host";
import { MemoryPluginRuntimeRepository, PluginRuntime } from "@molis-ai/molis-work-plugin-runtime";
import { createActionMcpPorts, handleMcpMessage, serveMcpStdio } from "@molis-ai/molis-work-app-mcp";
import { defineAction, definePlugin } from "../../packages/plugin-sdk/src/index.js";
import type { ActionMetadata } from "@molis-ai/molis-work-contracts/platform/actions";

// The launcher binds identity. No private Runtime session or tool argument supplies authority.
const [database, project, actor] = process.argv.slice(2);
if (!database || !project || !actor) throw new Error("Missing fixture launch identity");
const db = new DatabaseSync(database);
db.exec("PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY, project TEXT NOT NULL, actor TEXT NOT NULL, text TEXT NOT NULL)");
const metadata: ActionMetadata = { title: "笔记", description: "保存项目笔记", kind: "operation", scope: "project",
  audiences: ["user", "mcp"], permissions: ["notes:write"], subject_kinds: ["text"], input_schema: {
    type: "object", properties: { text: { type: "string", minLength: 1 } }, required: ["text"], additionalProperties: false,
  }, output_schema: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] } };
const write = defineAction<{ text: string }, { id: number }>({ capability_id: "fixture.notes.create", version: 1, operation: "command", action: metadata },
  (context, input) => ({ id: Number(db.prepare("INSERT INTO notes (project, actor, text) VALUES (?, ?, ?)")
    .run(context.project_id, context.actor_id, input.text).lastInsertRowid) }));
const read = defineAction({ capability_id: "fixture.notes.list", version: 1, operation: "query", action: {
  ...metadata, title: "读取笔记", description: "读取当前项目笔记", kind: "query", permissions: [],
  input_schema: { type: "object", additionalProperties: false },
  output_schema: { type: "array", $defs: { row: { type: "object", properties: { text: { type: "string" }, actor: { type: "string" } }, required: ["text", "actor"] } }, items: { $ref: "#/$defs/row" } },
} }, context => db.prepare("SELECT text, actor FROM notes WHERE project = ? ORDER BY id").all(context.project_id));
const plugin = definePlugin({ manifest: {
  schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.fixture.stdio-notes", version: "1.0.0", name: "Stdio notes", kind: "app",
  publisher: { publisher_id: "test", signature: "test" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [{ permission: "notes:write", required: true, reason: "Save notes" }], capabilities: { provides: [], consumes: [] },
  artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [write.definition, read.definition],
}, async start() { return { kind: "app", actions: [write.handler, read.handler] }; } });
const reference = { project_id: project, board_id: project, storage_key: database };
const host = new LocalHost({ runtimeFactory: { open: () => db, close: value => value.close() } });
const runtime = new PluginRuntime(new MemoryPluginRuntimeRepository(), undefined, { actions: { registry: host.actionRegistry(reference), project_id: project } });
const installed = runtime.install({ definition: plugin, deployment: "local", grants: ["notes:write"] }).install;
await runtime.start(installed.install_id);
const ports = createActionMcpPorts({ service: host.actionClient(reference), serverInfo: { name: "molis-action-fixture", version: "1.0.0" },
  context: () => ({ actor_id: actor, project_id: project, audience: "mcp", permissions: ["notes:write"] }),
});
try { await serveMcpStdio({ handleMessage: message => handleMcpMessage(message, ports) }); }
finally { await runtime.stop(installed.install_id); await host.close(); }
