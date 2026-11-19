import assert from "node:assert/strict";
import test from "node:test";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { resetSecretStoreCache } from "@molis-ai/molis-work-storage";
import type { Workflow, WorkflowInstance } from "@molis-ai/molis-work-plugin-workflows";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { openPagesStore, openWorkflowsStore } from "./fixtures/plugin-home-stores.js";
import { createLocalFeedApplication, createLocalFeedSourceService } from "./fixtures/feed-library.js";
import { seedConfiguredModels } from "./fixtures/configured-models.js";
import { scriptedModelServer } from "./fixtures/connector-assistant-model.js";

test("QEA-64 · a real generated pending handoff can finish after its model is disabled, without generating or receiving twice", { timeout: 90_000 }, async t => {
  const prior = process.env.MOLIS_WORK_SECRET_BACKEND; process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  t.after(() => { if (prior === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = prior; resetSecretStoreCache(); });
  const secondEntered = Promise.withResolvers<void>(), releaseSecond = Promise.withResolvers<void>();
  t.after(() => releaseSecond.resolve());
  const model = await scriptedModelServer(t, () => "已生成的固定标题\n\n这一份生成正文只交付一次。");
  const b = await openGoalBrowser(t, "seeded", undefined, undefined, undefined, undefined, {
    prepareHome: home => seedConfiguredModels(home, [{ provider_id: "workflow-model", model_id: "fixture" }], model.base),
  });
  assert.ok(b, "an isolated test browser is required");
  const project = b.projectId!, path = `/projects/${project}/api/plugins/io.molis.work.native.workflows/workflows`;
  const source = createLocalFeedSourceService(b.store.db, project).register({ kind: "research_library", repository: "molis-ai/research-library", research_source: "pending-generated-content" }).source;
  const feed = createLocalFeedApplication(b.store.db);
  const item = feed.ingestItem({ source, externalId: "original", title: "原始材料", summary: "待整理", body: "本次原始材料的正文", occurredAt: new Date().toISOString(), attention: false }).item;
  await feed.flushPendingJudgments();
  const workflow = (await b.web.post<{ workflow: Workflow }>(path, { title: "生成后恢复", chain: {
    stations: [{ plugin: "feed" }, { plugin: "pages" }], links: [{ kind: "ai", title_template: "", body_template: "", instructions: "整理为一篇保留完整正文的短文" }],
  } })).workflow;
  const start = async () => (await b.web.post<{ instance: WorkflowInstance }>(`${path}/${workflow.workflow_id}/instances`, { item_id: item.item_id })).instance;
  const run = await start(), fresh = await start();
  const store = openWorkflowsStore(b.homeDirectory), pages = openPagesStore(b.homeDirectory); t.after(() => { store.close(); pages.close(); });
  const receive = run.chain.stations[1]!.content!.actions.receive!, invoke = ActionService.prototype.invoke;
  let deliveries = 0;
  t.mock.method(ActionService.prototype, "invoke", async function (this: ActionService, ...args: Parameters<typeof invoke>) {
    const result = await invoke.apply(this, args);
    if (args[1].capability_id === receive.capability_id && args[0].project_id === project) {
      deliveries++;
      if (deliveries === 1) throw new Error("Fixture generated delivery receipt lost");
      if (deliveries === 2) { secondEntered.resolve(); await releaseSecond.promise; }
    }
    return result;
  });
  const frame = await pluginFrameBrowser(t, b, "workflows");
  await b.setViewport(1280, 900);
  await b.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, b.sessionId);
  await b.navigate(() => b.command("Page.navigate", { url: `${b.origin}/projects/${project}/` }, b.sessionId));
  await b.click("[data-plugin-strip] [data-plugin-id=workflows]");
  const open = async (id: string) => {
    await frame.waitFor(`document.querySelector('[data-wf-open="${workflow.workflow_id}"]')`);
    if (await frame.evaluate("document.querySelector('[data-workflows=workbench]').dataset.wfMode") === "instance") {
      await frame.click("[data-wf-action=back-to-flow]"); await frame.waitFor("document.querySelector('[data-workflows=workbench]').dataset.wfMode === 'workflow'");
    }
    if (await frame.evaluate("document.querySelector('[data-workflows=workbench]').dataset.wfMode") === "workflow") {
      await frame.click("[data-wf-action=back]"); await frame.waitFor("document.querySelector('[data-workflows=workbench]').dataset.wfMode === 'list'");
    }
    await frame.click(`[data-wf-open="${workflow.workflow_id}"]`);
    await frame.waitFor(`document.querySelector('[data-wf-open-instance="${id}"]')`);
    await frame.click(`[data-wf-open-instance="${id}"]`);
    await frame.waitFor(`document.querySelector('.wf-run')?.dataset.id === '${id}'`);
  };
  await open(run.instance_id);
  await frame.click("[data-wf-action=continue]"); await frame.waitFor("document.querySelector('[data-wf-toast]')?.dataset.tone === 'error'");
  const pending = store.instance(run.instance_id, project).steps[0]!.pending!;
  assert.ok(pending); assert.equal(pending.output.body, "这一份生成正文只交付一次。");
  assert.equal(deliveries, 1); assert.equal(pages.list(project).length, 1);
  const calls = model.requests.length; assert.ok(calls > 0, "the real SDK actually requested the generated content");
  await b.web.post("/api/settings/models/workflow-model", { display_name: "fixture", base_url: model.base, api_format: "anthropic-messages",
    enabled: false, prompt_cache: "off", models: [{ model_id: "fixture", enabled: true }], check_connection: true });
  assert.equal((await b.web.get<{ ai_available: boolean }>(`${path}/instances/${run.instance_id}`)).ai_available, false);
  await b.reloadPage(); await b.click("[data-plugin-strip] [data-plugin-id=workflows]"); await b.surfaceReady("workflows"); await open(run.instance_id);
  assert.equal(model.requests.length, calls); assert.equal(deliveries, 1);
  assert.equal(await frame.evaluate("Boolean(document.querySelector('[data-wf-action=continue]'))"), true, "a fixed pending output no longer needs a generation model");
  await frame.click("[data-wf-action=continue]"); await secondEntered.promise;
  assert.match(await frame.evaluate<string>("document.querySelector('[data-wf-handoff]').innerText"), /正在交接/);
  assert.match(await frame.evaluate<string>("document.querySelector('[data-wf-vlink]').innerText"), /正在交接/);
  assert.equal(model.requests.length, calls);
  releaseSecond.resolve(); await frame.waitFor("document.querySelector('.wf-run__status')?.dataset.mwState === 'done'");
  const finished = store.instance(run.instance_id, project);
  assert.equal(finished.steps[0]!.handoff?.key, pending.key); assert.deepEqual(finished.steps[0]!.handoff?.output, pending.output);
  assert.equal(deliveries, 2); assert.equal(pages.list(project).length, 1); assert.equal(model.requests.length, calls);
  await frame.click("[data-wf-action=back-to-flow]"); await frame.waitFor(`document.querySelector('[data-wf-open-instance="${fresh.instance_id}"]')`);
  await frame.click(`[data-wf-open-instance="${fresh.instance_id}"]`); await frame.waitFor(`document.querySelector('.wf-run')?.dataset.id === '${fresh.instance_id}'`);
  assert.equal(await frame.evaluate("Boolean(document.querySelector('[data-wf-action=continue]'))"), false, "an unprepared AI link still needs its model");
  assert.match(await frame.evaluate<string>("document.querySelector('[data-wf-handoff]').innerText"), /模型/);
  assert.equal(store.instance(fresh.instance_id, project).steps[0]!.pending, undefined);
  assert.equal(model.requests.length, calls); assert.equal(pages.list(project).length, 1);
});
