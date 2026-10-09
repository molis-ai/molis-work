import assert from "node:assert/strict";
import test from "node:test";

import Database from "better-sqlite3";
import { ActionService } from "@molis-ai/molis-work-kernel";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { ArtifactsModule, createArtifactsSchema } from "@molis-ai/molis-work-module-artifacts";
import { createContextLedger, createContextLedgerSchema } from "@molis-ai/molis-work-module-context-ledger";
import { artifactsActions, artifactsManifest, createArtifactActionHandlers } from "@molis-ai/molis-work-plugin-artifacts";
import { pinnedArtifact } from "./fixtures/artifacts.js";

// The summary a version offers the system search is what the person reads under the hit: its title and body text,
// never the ids and encodings a producer keeps in the same payload (plugin-conclusions E-4).
const projectId = "artifact-search-summary";
const person: ActionCallContext = { actor_id: "web-user", project_id: projectId, audience: "user", permissions: ["artifacts:read", "search:read"] };

function fixture() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(`CREATE TABLE boards (project_id TEXT PRIMARY KEY); INSERT INTO boards VALUES ('${projectId}'); CREATE TABLE events (seq INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL);`);
  createArtifactsSchema(db);
  createContextLedgerSchema(db);
  const artifacts = new ArtifactsModule({ db, now: () => "2026-10-09T00:00:00.000Z",
    appendEvent: event => Number(db.prepare("INSERT INTO events (project_id) VALUES (?)").run(event.projectId).lastInsertRowid) });
  const ledger = createContextLedger(db, { authorize: () => true });
  const actions = new ActionService();
  actions.registerProvider({
    provider: { provider_id: artifactsManifest.plugin_id, plugin_id: artifactsManifest.plugin_id, title: artifactsManifest.name, kind: "plugin", project_id: projectId },
    definitions: artifactsManifest.actions!,
    handlers: createArtifactActionHandlers({ projectId, artifacts, ledger: ledger.query, importSources: () => ({}),
      importDocument: async () => { throw new Error("read-only fixture"); }, openProjectReference: async () => { throw new Error("must not fetch a file"); } }),
  });
  const publish = (artifactId: string, title: string, artifactTypeId: string, payload: unknown) => artifacts.commands.registerVersion({
    project_id: projectId, actor_id: person.actor_id, artifact_id: artifactId, version: 1, artifact_type_id: artifactTypeId, schema_version: 1,
    producer: { plugin_id: "io.example.producer", plugin_version: "1.0.0", binding_signature: "binding" },
    content: { kind: "inline", payload: JSON.parse(JSON.stringify(payload)) }, ...pinnedArtifact(title),
  }).artifact;
  const summaries = async () => (await actions.invoke(person, artifactsActions.searchEntries, { cursor: null, limit: 50 })).entries
    .map(entry => ({ title: entry.title, summary: entry.summary }));
  return { publish, summaries, close: () => db.close() };
}

test("a pinned document's search summary is its text, not its document id, goal id or node types", async t => {
  const f = fixture(); t.after(f.close);
  f.publish("pages-8a4cf60-5069-4cf5-aab8-a313f6f607ae", "周报草稿", "io.molis.work.pages.document", {
    title: "周报草稿", page_id: "8a4cf60-5069-4cf5-aab8-a313f6f607ae", goal_id: "goal-7d1c9e52-0000-4000-8000-000000000001",
    body: { type: "doc", content: [{ type: "paragraph", attrs: { id: "node-3f2a" }, content: [{ type: "text", text: "本周完成了接口联调" }] }] } });
  const [entry] = await f.summaries();
  assert.equal(entry!.title, "周报草稿");
  assert.equal(entry!.summary, "本周完成了接口联调", "the title is the hit's own title line, not repeated in its summary");
  assert.doesNotMatch(entry!.summary, /8a4cf60|goal-7d1c|node-3f2a|paragraph/);
});

test("an imported file's search summary is its text and file name, not its bytes, type or encoding", async t => {
  const f = fixture(); t.after(f.close);
  f.publish("doc-1", "季度计划", "io.molis.work.document", {
    source: "file", source_id: "季度计划.pdf:abc123", title: "季度计划", format: "markdown",
    content: "# 季度计划\n先做搜索摘要",
    original_file: { filename: "季度计划.pdf", mime: "application/pdf", data_base64: "JVBERi0xLjQKJcfsj6IK".repeat(40) } });
  const [entry] = await f.summaries();
  assert.match(entry!.summary, /先做搜索摘要/);
  assert.match(entry!.summary, /季度计划\.pdf/);
  assert.doesNotMatch(entry!.summary, /JVBERi0x|application\/pdf|abc123|markdown/);
});

test("a table keeps its description, column names and cell text searchable", async t => {
  const f = fixture(); t.after(f.close);
  f.publish("dataset-1", "客户名单", "io.molis.work.dataset.table", {
    title: "客户名单", description: "华东区", columns: [{ id: "col-a1", name: "公司", type: "text", order: 0 }],
    rows: [{ id: "row-9", cells: { "col-a1": "星河科技" } }] });
  const [entry] = await f.summaries();
  for (const wanted of ["华东区", "公司", "星河科技"]) assert.match(entry!.summary, new RegExp(wanted));
  assert.doesNotMatch(entry!.summary, /col-a1|row-9|dataset-1/);
});
