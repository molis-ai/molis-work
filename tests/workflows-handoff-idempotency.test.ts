import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ActionError, bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { DEMO_BOARD_ID, LocalProjectDatabase, createLocalFeedApplication, createLocalFeedSourceService, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { WORKFLOWS_ACTION_PERMISSIONS, createWorkflowContentPorts, handoffKey, openWorkflowsStore, workflowsActions as w, type WorkflowInstance } from "@molis-ai/molis-work-plugin-workflows";
import { openPagesStore } from "@molis-ai/molis-work-plugin-pages";
import { openLingguangStore } from "@molis-ai/molis-work-plugin-lingguang";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "../apps/local-host/src/project-host.js";
import { NATIVE_CONTENT_PERMISSIONS } from "../apps/local-host/src/content-action-providers.js";

const PROJECT = "project-handoff";

test("a handoff is delivered once: a lost race delivers nothing and a retry re-sends the saved result without asking the model again", { timeout: 120_000 }, async () => {
  const home = mkdtempSync(join(tmpdir(), "workflows-handoff-"));
  const dbPath = join(home, "project.db");
  seedDemoBoard(dbPath);
  const db = new LocalProjectDatabase(dbPath);
  const feed = createLocalFeedApplication(db.db);
  const source = createLocalFeedSourceService(db.db, DEMO_BOARD_ID).register({ kind: "research_library", repository: "molis-ai/research-library", research_source: "twitter-ai-observation" }).source;
  for (const id of ["a", "b"]) feed.ingestItem({ source, externalId: id, title: `消息 ${id}`, summary: "摘要", body: `消息 ${id} 的正文`, occurredAt: new Date().toISOString(), attention: false });
  let prompts = 0;
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: async () => { prompts++; await new Promise(resolve => setTimeout(resolve, 30)); return `整理稿 ${prompts}\n\n只交一次。`; } });
  const reference = molisWorkHostProjectReference({ databasePath: dbPath, boardId: DEMO_BOARD_ID, projectId: PROJECT });
  const caller = { actor_id: "test-user", project_id: PROJECT, audience: "user" as const, permissions: [...WORKFLOWS_ACTION_PERMISSIONS, ...NATIVE_CONTENT_PERMISSIONS] };
  const actions = bindActionClient(host.actionClient(reference), () => caller);
  const pages = () => { const store = openPagesStore(home); try { return store.list(PROJECT).length; } finally { store.close(); } };
  try {
    const { workflow } = await actions.invoke(w.create, { title: "交接一次", chain: { stations: [{ plugin: "feed" }, { plugin: "pages" }, { plugin: "lingguang" }],
      links: [{ kind: "ai", title_template: "", body_template: "", instructions: "整理成一页" }, { kind: "function", title_template: "{标题}", body_template: "{正文}", instructions: "" }] } });
    const items = (await actions.invoke(w.stationItems, { plugin: "feed" })).items;
    const start = async (itemId: string) => (await actions.invoke(w.start, { id: workflow.workflow_id, item_id: itemId })).instance;

    // Two windows hand over the same step at once: exactly one delivery wins, the other changes nothing.
    const raced = await start(items[0]!.item_id);
    const before = pages();
    const results = await Promise.allSettled([actions.invoke(w.continue, { id: raced.instance_id }), actions.invoke(w.continue, { id: raced.instance_id })]);
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1, JSON.stringify(results.map(result => result.status === "rejected" ? String(result.reason) : "ok")));
    assert.equal(pages(), before + 1, "the losing call delivered nothing");
    const winner = (await actions.invoke(w.instance, { id: raced.instance_id })).instance;
    assert.equal(winner.current, 1);
    assert.equal(winner.steps[0]!.handoff?.key, handoffKey(raced, 0));
    assert.equal(winner.steps[0]!.pending, undefined, "the delivered handoff no longer waits");

    // A crash between delivery and recording: the fixed handoff was saved and the page already exists.
    const crashed = await start(items[1]!.item_id);
    const { instance: previewed } = await actions.invoke(w.instance, { id: crashed.instance_id });
    const input = (await actions.invoke(w.preview, { id: crashed.instance_id })).input;
    const pending = { key: handoffKey(crashed, 0), kind: "ai" as const, actor: "ai" as const, at: new Date().toISOString(), input,
      output: { title: "崩溃前的整理稿", body: "已经送达，只是没来得及记录。", url: null, source: null, feed_item_id: null }, rule: "整理成一页" };
    const store = openWorkflowsStore(home);
    let saved: WorkflowInstance;
    try { const raw = store.instance(crashed.instance_id, PROJECT); saved = store.saveInstance(raw, { ...raw, chain: previewed.chain, steps: raw.steps.map((step, index) => index === 0 ? { ...step, pending } : step), updated_at: new Date().toISOString() }); }
    finally { store.close(); }
    const delivered = await createWorkflowContentPorts(bindActionClient(host.actionClient(reference), () => ({ ...caller, audience: "workflow" })))
      .receive("pages", pending.output, { instance_id: crashed.instance_id, step: 1, title: saved.title });
    const modelCalls = prompts, pageCount = pages();
    const resumed = (await actions.invoke(w.continue, { id: crashed.instance_id })).instance;
    assert.equal(prompts, modelCalls, "the saved result is re-sent; the model is not asked again");
    assert.equal(pages(), pageCount, "the page delivered before the crash is reused");
    assert.equal(resumed.steps[1]!.item?.item_id, delivered.item_id);
    assert.equal(resumed.steps[0]!.handoff?.output.title, "崩溃前的整理稿");

    // The next station receives idempotently too: a retried Lingguang delivery returns the same spark.
    const lingguang = createWorkflowContentPorts(bindActionClient(host.actionClient(reference), () => ({ ...caller, audience: "workflow" })));
    const once = await lingguang.receive("lingguang", { title: "灵光", body: "只记一次" }, { instance_id: "retry-instance", step: 2 });
    const twice = await lingguang.receive("lingguang", { title: "灵光", body: "只记一次" }, { instance_id: "retry-instance", step: 2 });
    assert.equal(twice.item_id, once.item_id);
    const sparks = openLingguangStore(home);
    try { assert.equal(sparks.list(PROJECT).filter(spark => spark.body === "只记一次").length, 1); } finally { sparks.close(); }
  } finally {
    await host.close(); db.close();
    rmSync(home, { recursive: true, force: true });
  }
});

for (const stage of ["preparation", "response"] as const) test(`workflow AI revocation during ${stage} prevents dispatch or commit and allows authorized recovery`, { timeout: 30_000 }, async () => {
  const home = mkdtempSync(join(tmpdir(), "workflow-ai-authority-")), dbPath = join(home, "project.db");
  seedDemoBoard(dbPath);
  const db = new LocalProjectDatabase(dbPath);
  const source = createLocalFeedSourceService(db.db, DEMO_BOARD_ID).register({ kind: "research_library", repository: "molis-ai/research-library", research_source: "twitter-ai-observation" }).source;
  const item = createLocalFeedApplication(db.db).ingestItem({ source, externalId: "ai-authority", title: "原材料", summary: "摘要", body: "只能在仍有权限时生成与保存。", occurredAt: new Date().toISOString(), attention: false }).item;
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  let allowed = true, dispatched = 0;
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: async (_prompt, options) => {
    if (stage === "preparation") { entered.resolve(); await release.promise; }
    await options?.beforeDispatch?.();
    dispatched++;
    if (stage === "response") { entered.resolve(); await release.promise; }
    return "整理稿\n\n已获授权的正文。";
  } });
  const reference = molisWorkHostProjectReference({ databasePath: dbPath, boardId: DEMO_BOARD_ID, projectId: PROJECT });
  const caller = { actor_id: "user", project_id: PROJECT, audience: "user" as const, permissions: [...WORKFLOWS_ACTION_PERMISSIONS, ...NATIVE_CONTENT_PERMISSIONS],
    validate_authority: () => { if (!allowed) throw new ActionError("actions.revoked", "原调用已撤权"); } };
  const actions = bindActionClient(host.actionClient(reference), () => caller);
  const pages = openPagesStore(home);
  try {
    const { workflow } = await actions.invoke(w.create, { title: "持续授权", chain: { stations: [{ plugin: "feed" }, { plugin: "pages" }],
      links: [{ kind: "ai", instructions: "整理材料", title_template: "", body_template: "" }] } });
    const original = (await actions.invoke(w.start, { id: workflow.workflow_id, item_id: item.item_id })).instance;
    const pending = actions.invoke(w.continue, { id: original.instance_id });
    const rejected = assert.rejects(pending, { code: "actions.revoked" });
    await Promise.race([entered.promise, pending]);
    allowed = false; release.resolve(); await rejected;
    assert.equal(dispatched, stage === "preparation" ? 0 : 1);
    assert.equal(pages.list(PROJECT).length, 0);
    const store = openWorkflowsStore(home);
    try { assert.deepEqual(store.instance(original.instance_id, PROJECT), original, "no handoff or bookkeeping may commit after revocation"); }
    finally { store.close(); }
    allowed = true;
    const done = (await actions.invoke(w.continue, { id: original.instance_id })).instance;
    assert.equal(done.status, "done");
    assert.equal(pages.list(PROJECT).length, 1);
  } finally { release.resolve(); pages.close(); await host.close(); db.close(); rmSync(home, { recursive: true, force: true }); }
});
