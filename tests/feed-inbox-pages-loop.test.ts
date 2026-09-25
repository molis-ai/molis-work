import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readResearchLibrary } from "@molis-ai/molis-work-integration-github";
import { generatePagesFromMaterials, openPagesStore } from "@molis-ai/molis-work-plugin-pages";
import { createLocalFeedApplication, createLocalFeedSourceService, DEMO_BOARD_ID, LocalProjectDatabase, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import type { PagesGenerationRecord } from "@molis-ai/molis-work-contracts/modules/pages";
import type { JudgmentPort } from "@molis-ai/molis-work-contracts/modules/functions";
import { hostCompleteText } from "../apps/local-host/src/host-complete-text.js";
import { planInformationWork } from "../apps/local-host/src/assistant-http.js";
import { ASSISTANT_ISLAND_FACTORY_SCRIPT } from "../apps/workbench/src/scripts/client/assistant-island.js";
import { CLIENT_NAVIGATION_INBOX_SCRIPT } from "../apps/workbench/src/scripts/client/navigation-inbox.js";
import { functionFitsScene, sceneBehaviorIds } from "@molis-ai/molis-work-contracts/modules/functions";

const sha = (text: string) => createHash("sha256").update(text).digest("hex");
function publishedPackage() {
  const path = "packages/twitter-ai-observation/daily-v1";
  const research = JSON.stringify({ source_records: [{ id: "s1", title: "作者自述", url: "https://example.com/source", summary: "待核验", read_scope: "SUMMARY_EXPORT", boundary: "未重读全文" }], findings: [{ id: "f1", claim: "一个有边界的观察", support: "材料支持有限", boundary: "不是效果证明", source_ids: ["s1"] }], unknowns: ["没有独立复现"] });
  const report = "# 真实包格式的测试材料";
  const manifest = JSON.stringify({ id: "daily-v1", source_id: "twitter-ai-observation", usage: "BOUNDED", limitations: ["摘要导出"], files: [{ path: "research.json", sha256: sha(research) }, { path: "report.md", sha256: sha(report) }] });
  return new Map([["sources.json", JSON.stringify({ sources: [{ id: "twitter-ai-observation", publication_state: "ENABLED", name: "研究" }] })], ["catalog.json", JSON.stringify({ packages: [{ id: "daily-v1", source_id: "twitter-ai-observation", path, published_at: "2026-09-22T00:00:00Z", manifest_sha256: sha(manifest), usage: "BOUNDED" }] })], [`${path}/manifest.json`, manifest], [`${path}/research.json`, research], [`${path}/report.md`, report]]);
}

test("research adapter verifies publication hashes and retains reading boundaries", async () => {
  const files = publishedPackage();
  const input = { repository: "molis-ai/research-library", source_id: "twitter-ai-observation", revision: "a".repeat(40), readText: async (path: string) => { const value = files.get(path); if (!value) throw new Error("missing"); return value; } };
  const entries = await readResearchLibrary(input);
  assert.equal(entries.length, 1);
  assert.match(entries[0]!.body, /SUMMARY_EXPORT/);
  assert.match(entries[0]!.body, /没有独立复现/);
  assert.match(entries[0]!.url, /\/blob\/a{40}\//);
  files.set("packages/twitter-ai-observation/daily-v1/research.json", "{}");
  await assert.rejects(readResearchLibrary(input), /哈希/);
});

function request(): PagesGenerationRecord {
  return { request_id: "request-123", project_id: "project-a", request_hash: "hash-a", status: "running", document_id: null, title: "观察文稿", instructions: "保留原始边界", error: null, updated_at: new Date().toISOString(), inputs: [{ entry_id: "entry-1", item_id: "item-1", revision: 2, title: "研究材料", body: "SUMMARY_EXPORT。原帖未核验。", url: "https://example.com/source", source_label: "研究库", captured_at: new Date().toISOString(), provenance: [{ usage: "BOUNDED" }] }] };
}

test("a failed run cannot complete or fail a retry started in the same millisecond", t => {
  const home = mkdtempSync(join(tmpdir(), "molis-pages-generation-race-"));
  const store = openPagesStore(home);
  t.mock.method(Date, "now", () => Date.parse("2026-09-25T00:00:00Z"));
  try {
    const old = store.beginGeneration(request());
    store.failGeneration(old, "first attempt failed");
    const next = store.beginGeneration(request());
    assert.notEqual(next.updated_at, old.updated_at);
    assert.throws(() => store.completeGeneration(old, { type: "doc" }), /另一次处理/);
    store.failGeneration(old, "late stale failure");
    assert.deepEqual(store.generation(next.project_id, next.request_id), next);
    const saved = store.completeGeneration(next, { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Latest result" }] }] });
    store.failGeneration(old, "another late failure");
    store.failGeneration(next, "late current failure");
    assert.equal(store.generation(next.project_id, next.request_id)!.status, "completed");
    assert.equal(store.completeGeneration(old, { type: "doc" }).id, saved.id);
    assert.equal(store.list(next.project_id).length, 1);
  } finally { store.close(); rmSync(home, { recursive: true, force: true }); }
});

test("expired legacy generation migrates its snapshot and cannot be resurrected by the old worker", t => {
  const home = mkdtempSync(join(tmpdir(), "molis-pages-legacy-running-"));
  const store = openPagesStore(home);
  let now = Date.parse("2026-09-25T00:00:00Z");
  t.mock.method(Date, "now", () => now);
  try {
    const old = store.beginGeneration(request());
    now += 180_001;
    store.migrateProjectScope(old.project_id, "canonical-project");
    const moved = store.generation("canonical-project", old.request_id)!;
    assert.equal(moved.status, "failed"); assert.deepEqual(moved.inputs, old.inputs);
    assert.throws(() => store.completeGeneration(old, { type: "doc" }), /另一次处理/);
    store.failGeneration(old, "old worker stopped"); assert.equal(store.hasProjectData(old.project_id), false);
    const resumed = store.beginGeneration(moved);
    const document = store.completeGeneration(resumed, { type: "doc" });
    assert.equal(document.project_id, "canonical-project"); assert.equal(store.list("canonical-project").length, 1);
  } finally { store.close(); rmSync(home, { recursive: true, force: true }); }
});

test("Pages retries saved input, rejects concurrent generation and preserves later user edits", async () => {
  const home = mkdtempSync(join(tmpdir(), "molis-loop-pages-"));
  const store = openPagesStore(home);
  try {
    const record = request();
    await assert.rejects(generatePagesFromMaterials(run => run(store), record), /尚未配置/);
    assert.equal(store.generation("project-a", record.request_id)?.status, "failed");
    let calls = 0;
    let finish!: (value: string) => void;
    const first = generatePagesFromMaterials(run => run(store), record, async prompt => { calls++; assert.match(prompt, /SUMMARY_EXPORT/); return new Promise(resolve => { finish = resolve; }); });
    await assert.rejects(generatePagesFromMaterials(run => run(store), record, async () => "duplicated"), /仍在生成/);
    finish("# 观察\n\n有边界的内容。");
    const saved = await first;
    assert.match(JSON.stringify(saved.document.body), /原帖未核验/);
    store.update(saved.document.id, { title: "用户改过的标题" }, "project-a");
    const replay = await generatePagesFromMaterials(run => run(store), record, async () => { calls++; return "should not run"; });
    assert.equal(calls, 1);
    assert.equal(replay.document.title, "用户改过的标题");
    assert.equal(store.generations("project-b").length, 0);
    assert.throws(() => store.get(saved.document.id, "project-b"), /找不到/);
    await assert.rejects(generatePagesFromMaterials(run => run(store), { ...record, request_hash: "changed" }, async () => "text"), /已改变/);
  } finally { store.close(); rmSync(home, { recursive: true, force: true }); }
});

test("explicit auto admission separates positive, negative and review outcomes and dedupes Inbox", async () => {
  const home = mkdtempSync(join(tmpdir(), "molis-loop-rules-"));
  const dbPath = join(home, "project.db"); seedDemoBoard(dbPath); const store = new LocalProjectDatabase(dbPath);
  const judgments: JudgmentPort = {
    async judge(input) { return { judgment_id: "judgment-" + input.subject.id, function_key: input.function_key, function_version: 1, subject: input.subject, scene_id: input.scene_id ?? null, outcome: input.input.includes("review-item") ? "needs_review" : "ok", suggested_behavior_ids: input.input.includes("admit-item") ? ["inbox.admit"] : ["feed.open"], error_code: null, created_at: new Date().toISOString() }; },
    bindScene(scene_id, function_key, board_id, ref) { return { scene_id, function_key, board_id: board_id ?? null, ref: ref ?? null }; }, unbindScene() {}, sceneBinding() { return null; }, latest() { return null; },
  };
  try {
    const feed = createLocalFeedApplication(store.db, { judgments });
    const source = createLocalFeedSourceService(store.db, DEMO_BOARD_ID).register({ kind: "research_library", repository: "molis-ai/research-library", research_source: "twitter-ai-observation" }).source;
    feed.createOutRule(DEMO_BOARD_ID, { name: "语义筛选", match: { source_id: source.source_id }, function_key: "filter", admission: "inbox" });
    const ids = ["admit-item", "leave-item", "review-item"].map(id => feed.ingestItem({ source, externalId: id, title: id, summary: "", occurredAt: new Date().toISOString(), attention: false }).item.item_id);
    await feed.flushPendingJudgments();
    const entries = feed.listInboxEntries(DEMO_BOARD_ID).filter(entry => ids.includes(entry.subject_id) && entry.reason === "source_rule");
    assert.equal(entries.length, 2); assert.equal(entries.find(entry => entry.subject_id === ids[2])?.detail.needs_review, true);
    await feed.evaluateItems(DEMO_BOARD_ID, ids);
    assert.equal(feed.listInboxEntries(DEMO_BOARD_ID).filter(entry => ids.includes(entry.subject_id) && entry.reason === "source_rule").length, 2);
    await assert.rejects(planInformationWork(feed, DEMO_BOARD_ID, { prompt: "整理" }, async () => JSON.stringify({ message: "ok", action: { kind: "draft_pages", entry_ids: ["other-project"], title: "t", instructions: "i" } })), /当前 Inbox/);
  } finally { store.close(); rmSync(home, { recursive: true, force: true }); }
});

test("Host uses configured model transport and never fabricates text on failure", async () => {
  const complete = hostCompleteText({ env: { MINIMAX_API_KEY: "test-key" }, fetch: async (_url, init) => { assert.equal(JSON.parse(String(init?.body)).model, "MiniMax-M3"); return Response.json({ content: [{ type: "text", text: "真实接口形状" }] }); } });
  assert.equal(await complete!("input"), "真实接口形状");
  const failed = hostCompleteText({ env: { MINIMAX_API_KEY: "test-key" }, fetch: async () => new Response("private error", { status: 500 }) });
  await assert.rejects(failed!("input"), /模型返回 500/);
  assert.equal(hostCompleteText({ env: {} }), undefined);
  new Function("return " + ASSISTANT_ISLAND_FACTORY_SCRIPT);
  new Function(CLIENT_NAVIGATION_INBOX_SCRIPT);
});

test("legacy Inbox authoring still recognizes the supported next-step recommendations", () => {
  assert.equal(functionFitsScene({ primitive: "choice", scene_id: "inbox.next", criteria: ["inbox.compose", "inbox.verify", "inbox.dismiss"].map(key => ({ key, description: key })) }, "inbox.next"), true);
  assert.ok(sceneBehaviorIds("inbox.next").includes("inbox.compose"));
});

test("Multi-material document retains every source and a project-scoped return link", async () => {
  const home = mkdtempSync(join(tmpdir(), "molis-loop-multi-")); const store = openPagesStore(home);
  try {
    const record = request();
    const multi = { ...record, inputs: [...record.inputs, { ...record.inputs[0]!, entry_id: "entry-2", item_id: "item-2", body: "第二个来源只支持有限推断", url: "https://example.com/second" }] };
    const result = await generatePagesFromMaterials(run => run(store), multi, async prompt => {
      assert.match(prompt, /第二个来源只支持有限推断/); return "两条材料支持范围不同。[材料 1][材料 2]";
    });
    const body = JSON.stringify(result.document.body);
    assert.match(body, /SUMMARY_EXPORT/); assert.match(body, /第二个来源只支持有限推断/);
    assert.match(body, /\/projects\/project-a\/\?inbox_entry=entry-1/);
    assert.match(body, /\/projects\/project-a\/\?inbox_entry=entry-2/);
    assert.deepEqual(store.generation("project-a", record.request_id)?.inputs.map(i => i.entry_id), ["entry-1", "entry-2"]);
  } finally { store.close(); rmSync(home, { recursive: true, force: true }); }
});
