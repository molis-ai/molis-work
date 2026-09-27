import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { DEMO_BOARD_ID, LocalProjectDatabase, createLocalFeedApplication, createLocalFeedSourceService, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { WORKFLOWS_ACTION_PERMISSIONS, workflowsActions as w } from "@molis-ai/molis-work-plugin-workflows";
import { openPagesStore } from "@molis-ai/molis-work-plugin-pages";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "../apps/local-host/src/project-host.js";
import { NATIVE_CONTENT_PERMISSIONS } from "../apps/local-host/src/content-action-providers.js";
import { withFunctionsServiceAsync, type FunctionsHostOptions } from "../apps/local-host/src/functions-host.js";

const PROJECT = "project-judgment-link";

test("a judgment link hands content on only for the ticked results and records why a run stopped", { timeout: 120_000 }, async () => {
  const home = mkdtempSync(join(tmpdir(), "workflows-judgment-"));
  const dbPath = join(home, "project.db");
  seedDemoBoard(dbPath);
  const db = new LocalProjectDatabase(dbPath);
  const feed = createLocalFeedApplication(db.db);
  const source = createLocalFeedSourceService(db.db, DEMO_BOARD_ID).register({ kind: "research_library", repository: "molis-ai/research-library", research_source: "twitter-ai-observation" }).source;
  feed.ingestItem({ source, externalId: "urgent", title: "客户投诉", summary: "需要处理", body: "需要今天处理的投诉", occurredAt: new Date().toISOString(), attention: false });
  feed.ingestItem({ source, externalId: "noise", title: "例行通知", summary: "无关", body: "例行的系统通知", occurredAt: new Date().toISOString(), attention: false });
  const judged: string[] = [];
  const functions: FunctionsHostOptions = { env: { TYPESAFE_API_KEY: "fixture-only" }, provider: { async evaluate(_key, record, input) {
    judged.push(input);
    const choice = input.includes("需要") ? "handle" : "skip";
    return { primitive: "choice", choice, noul: null, score: null, legend: null, probabilities: { [choice]: 0.9 }, confidence: 0.9, model: record.model };
  } } };
  const published = await withFunctionsServiceAsync(home, async service => {
    const draft = service.create({ primitive: "choice", name: "要不要处理" });
    service.updateDraft(draft.id, { instructions: "这条内容今天需要人处理吗", criteria: [{ key: "handle", description: "需要处理" }, { key: "skip", description: "不需要" }] });
    await service.preview(draft.id, "需要处理的样例");
    return service.publish(draft.id);
  }, functions);
  judged.length = 0;
  const host = new MolisWorkLocalHost({ homeDirectory: home, functions, completeText: null });
  const reference = molisWorkHostProjectReference({ databasePath: dbPath, boardId: DEMO_BOARD_ID, projectId: PROJECT });
  const caller = { actor_id: "test-user", project_id: PROJECT, audience: "user" as const, permissions: [...WORKFLOWS_ACTION_PERMISSIONS, ...NATIVE_CONTENT_PERMISSIONS, "functions:invoke"] };
  const actions = bindActionClient(host.actionClient(reference), () => caller);
  const pages = () => { const store = openPagesStore(home); try { return store.list(PROJECT); } finally { store.close(); } };
  try {
    // The rule list comes from the caller's own directory, with the rule's finite answers.
    const { judgments } = await actions.invoke(w.judgments, {});
    const rule = judgments.find(row => row.ref.capability_id === `functions.published.${published.function_key}`)!;
    assert.ok(rule, JSON.stringify(judgments));
    assert.deepEqual([...rule.choices].sort(), ["handle", "skip"]);
    const hidden = await bindActionClient(host.actionClient(reference), () => ({ ...caller, permissions: caller.permissions.filter(p => p !== "functions:invoke") })).invoke(w.judgments, {});
    assert.equal(hidden.judgments.length, 0, "rules the caller may not run are not offered");

    const judgmentLink = (pass: string[]) => ({ kind: "judgment", title_template: "", body_template: "", instructions: "", judgment: { ...rule.ref, title: rule.title }, pass });
    const { workflow } = await actions.invoke(w.create, { title: "只交要处理的", chain: { stations: [{ plugin: "feed" }, { plugin: "pages" }], links: [judgmentLink([])] } });
    const items = (await actions.invoke(w.stationItems, { plugin: "feed" })).items;
    const start = async (title: string) => (await actions.invoke(w.start, { id: workflow.workflow_id, item_id: items.find(item => item.title === title)!.item_id })).instance;

    const unticked = await start("客户投诉");
    await assert.rejects(actions.invoke(w.continue, { id: unticked.instance_id }), { code: "workflows.not_ready" });
    assert.equal(judged.length, 0, "a link without passing results never asks the rule");
    await actions.invoke(w.update, { id: workflow.workflow_id, revision: workflow.revision, chain: { stations: workflow.stations, links: [judgmentLink(["handle"])] } });

    const passed = (await actions.invoke(w.continue, { id: unticked.instance_id })).instance;
    assert.equal(passed.status, "done");
    assert.equal(passed.steps[0]!.handoff?.actor, "judgment");
    assert.equal(passed.steps[0]!.handoff?.verdict?.choice, "handle");
    assert.equal(passed.steps[0]!.handoff?.output.body, passed.steps[0]!.handoff?.input.body, "the step's own content goes on");
    assert.ok(pages().some(page => page.id === passed.steps[1]!.item?.item_id));

    const before = pages().length;
    const held = (await actions.invoke(w.continue, { id: (await start("例行通知")).instance_id })).instance;
    assert.equal(held.status, "stopped");
    assert.equal(held.stopped?.from, 0);
    assert.equal(held.stopped?.verdict?.choice, "skip");
    assert.match(held.stopped?.reason ?? "", /skip/);
    assert.equal(pages().length, before, "held content reaches nothing");
    assert.equal(judged.length, 2);
  } finally {
    await host.close(); db.close();
    rmSync(home, { recursive: true, force: true });
  }
});
