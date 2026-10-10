import assert from "node:assert/strict";
import test from "node:test";

import Database from "better-sqlite3";
import { ActionService } from "@molis-ai/molis-work-kernel";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ArtifactVersionRecord, ArtifactsApplicationApi, ArtifactsQueryApi } from "@molis-ai/molis-work-contracts/modules/artifacts";
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
  // What a later build of the allow-list would read out of a version that is stored the same way: the stored record is rewritten on its way
  // to the source (same version, same digest), as the source itself is the only thing that changes between builds.
  let rewrite: ((record: ArtifactVersionRecord) => ArtifactVersionRecord) | null = null;
  const query: ArtifactsQueryApi = Object.assign(Object.create(artifacts.query), {
    listArtifacts: (project: string) => artifacts.query.listArtifacts(project).map(record => rewrite ? rewrite(record) : record) });
  const port: ArtifactsApplicationApi = { query, commands: artifacts.commands };
  actions.registerProvider({
    provider: { provider_id: artifactsManifest.plugin_id, plugin_id: artifactsManifest.plugin_id, title: artifactsManifest.name, kind: "plugin", project_id: projectId },
    definitions: artifactsManifest.actions!,
    handlers: createArtifactActionHandlers({ projectId, artifacts: port, ledger: ledger.query, importSources: () => ({}),
      importDocument: async () => { throw new Error("read-only fixture"); }, openProjectReference: async () => { throw new Error("must not fetch a file"); } }),
  });
  const publish = (artifactId: string, title: string, artifactTypeId: string, payload: unknown) => artifacts.commands.registerVersion({
    project_id: projectId, actor_id: person.actor_id, artifact_id: artifactId, version: 1, artifact_type_id: artifactTypeId, schema_version: 1,
    producer: { plugin_id: "io.example.producer", plugin_version: "1.0.0", binding_signature: "binding" },
    content: { kind: "inline", payload: JSON.parse(JSON.stringify(payload)) }, ...pinnedArtifact(title),
  }).artifact;
  const summaries = async () => (await actions.invoke(person, artifactsActions.searchEntries, { cursor: null, limit: 50 })).entries
    .map(entry => ({ title: entry.title, summary: entry.summary }));
  const entries = async () => (await actions.invoke(person, artifactsActions.searchEntries, { cursor: null, limit: 50 })).entries;
  return { publish, summaries, entries, readAs: (next: typeof rewrite) => { rewrite = next; }, close: () => db.close() };
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

// The built-in producers keep their reading text under their own keys; a hit on any of them must still find the body
// (the first version of this allow-list dropped them, so fixed reports, decks and characters could no longer be found).
test("a Coding report is searchable by its task, the model's answer and its markdown body", async t => {
  const f = fixture(); t.after(f.close);
  f.publish("coding-report:s1:r1", "修复登录超时", "coding.report.v1", {
    title: "修复登录超时", run_id: "run-77f2", body_markdown: "## 结果\n登录接口的重试间隔改为指数退避",
    task: "排查登录接口为什么偶尔超时", model_answer: "根因是连接池耗尽", state: "completed", ended_at: "2026-10-09T00:00:00.000Z",
    source: { session_id: "session-5e1", runtime_id: "codex", runtime_session_id: "rt-9" } });
  const [entry] = await f.summaries();
  for (const wanted of ["指数退避", "排查登录接口为什么偶尔超时", "根因是连接池耗尽"]) assert.match(entry!.summary, new RegExp(wanted));
  assert.doesNotMatch(entry!.summary, /run-77f2|session-5e1|rt-9|codex|completed/);
});

test("a deck is searchable by its slide bullets and notes, not by slide ids or colors", async t => {
  const f = fixture(); t.after(f.close);
  f.publish("deck-1", "季度汇报", "io.molis.work.ppt.deck", {
    title: "季度汇报", description: "给管理层", color_primary: "#1a73e8", color_background: "#ffffff", color_text: "#202124",
    slides: [{ id: "slide-c0ffee", title: "封面", bullets: ["营收同比增长两成", "新增三家标杆客户"], notes: "开场先讲结论", order: 0 }] });
  const [entry] = await f.summaries();
  for (const wanted of ["给管理层", "封面", "营收同比增长两成", "新增三家标杆客户", "开场先讲结论"]) assert.match(entry!.summary, new RegExp(wanted));
  assert.doesNotMatch(entry!.summary, /slide-c0ffee|#1a73e8/);
});

test("a character is searchable by its instructions", async t => {
  const f = fixture(); t.after(f.close);
  f.publish("character-1", "严格的评审员", "character.definition.v1", {
    character_id: "char-0b7d", title: "严格的评审员", instructions: "逐条核对验收标准，缺证据就退回",
    host_tools: null, source: { owner_actor_id: "web-user", draft_revision: 3 } });
  const [entry] = await f.summaries();
  assert.match(entry!.summary, /逐条核对验收标准，缺证据就退回/);
  assert.doesNotMatch(entry!.summary, /char-0b7d|web-user/);
});

test("a captured Feed message keeps its summary, tags and source name searchable, not its source ids", async t => {
  const f = fixture(); t.after(f.close);
  f.publish("feed-capture-1", "新版本发布", "io.molis.work.feed.capture", {
    title: "新版本发布", summary: "修复了同步冲突", url: "https://example.com/post/1", occurred_at: "2026-10-08T00:00:00.000Z",
    source: { source_id: "src-3d9a", source_kind: "rss", source_label: "产品更新日志" }, tags: ["发布说明"],
    materials: [{ material_id: "mat-1", canonical_url: "https://example.com/post/1", title: "发布公告" }] });
  const [entry] = await f.summaries();
  for (const wanted of ["修复了同步冲突", "产品更新日志", "发布说明", "发布公告"]) assert.match(entry!.summary, new RegExp(wanted));
  assert.doesNotMatch(entry!.summary, /src-3d9a|mat-1|rss/);
});

test("a questionnaire keeps its questions and option labels searchable, not question types", async t => {
  const f = fixture(); t.after(f.close);
  f.publish("form-1", "满意度调查", "io.molis.work.form.questionnaire", {
    title: "满意度调查", description: "下季度改进依据", status: "published",
    questions: [{ id: "q-41", type: "single_choice", title: "你最看重哪方面", required: true, order: 0, options: [{ id: "o-1", label: "响应速度" }] }] });
  const [entry] = await f.summaries();
  for (const wanted of ["下季度改进依据", "你最看重哪方面", "响应速度"]) assert.match(entry!.summary, new RegExp(wanted));
  assert.doesNotMatch(entry!.summary, /q-41|o-1|single_choice/);
});

// The index skips an entry whose revision is unchanged (horizontal/search), so the revision has to cover everything the entry makes searchable,
// the summary included: when the way a summary is read out of a version changes, an entry indexed before the change is read again. Without that
// an index built before E-4 keeps the id-first summaries until each artifact gets a new version or somebody rebuilds the index by hand.
test("an entry's revision covers its summary: the same stored version read out differently is a new revision", async t => {
  const f = fixture(); t.after(f.close);
  f.publish("doc-r", "周报", "io.molis.work.pages.document", { title: "周报", page_id: "8a4cf60-5069-4cf5-aab8-a313f6f607ae", body: "本周完成了接口联调" });
  const [before] = await f.entries();
  const [again] = await f.entries();
  assert.equal(again!.revision, before!.revision, "an unchanged version keeps its revision, so it is not read again on every sync");
  f.readAs(record => ({ ...record, payload: { title: "周报", page_id: "8a4cf60-5069-4cf5-aab8-a313f6f607ae", body: "本周完成了接口联调，下周继续" } }));
  const [after] = await f.entries();
  assert.notEqual(after!.summary, before!.summary);
  assert.notEqual(after!.revision, before!.revision, "the summary changed, the version and its digest did not: the revision still has to change");
});
