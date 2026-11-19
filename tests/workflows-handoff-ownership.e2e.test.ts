import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import test, { type TestContext } from "node:test";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { defineAction } from "@molis-ai/molis-work-plugin-sdk";
import { molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import type { Workflow, WorkflowInstance } from "@molis-ai/molis-work-plugin-workflows";
import { openWorkflowsBrowser } from "./fixtures/workflows-browser.js";
import { openPagesStore, openWorkflowsStore } from "./fixtures/plugin-home-stores.js";
import { createLocalFeedApplication, createLocalFeedSourceService } from "./fixtures/feed-library.js";
import { openTestShelfStore } from "./shelf-direct-actions.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";

async function handoffs(t: TestContext) {
  const browser = await openWorkflowsBrowser(t, { open: false });
  await browser.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, browser.sessionId);
  const project = browser.projectId!, path = `/projects/${project}/api/plugins/io.molis.work.native.workflows/workflows`;
  const source = createLocalFeedSourceService(browser.store.db, project).register({ kind: "research_library", repository: "molis-ai/research-library", research_source: "handoff-ownership" }).source;
  const feed = createLocalFeedApplication(browser.store.db);
  const runs: WorkflowInstance[] = [], flows: Workflow[] = [];
  for (const [index, flow] of [browser.a, browser.b].entries()) {
    const marker = index === 0 ? "A" : "B";
    const item = feed.ingestItem({ source, externalId: marker, title: `${marker} 的独立材料`, summary: `${marker} 摘要`, body: `只属于 ${marker} 的原始正文`, occurredAt: new Date().toISOString(), attention: false }).item;
    const updated = (await browser.web.post<{ workflow: Workflow }>(`${path}/${flow.workflow_id}`, { revision: flow.revision,
      chain: { stations: [{ plugin: "feed" }, { plugin: "pages" }], links: [{ kind: "manual", title_template: "", body_template: "", instructions: "" }] } })).workflow;
    flows.push(updated);
    runs.push((await browser.web.post<{ instance: WorkflowInstance }>(`${path}/${updated.workflow_id}/instances`, { item_id: item.item_id })).instance);
  }
  await feed.flushPendingJudgments();
  const store = openWorkflowsStore(browser.homeDirectory), pages = openPagesStore(browser.homeDirectory);
  t.after(() => { store.close(); pages.close(); });
  await browser.click("[data-plugin-strip] [data-plugin-id=workflows]");
  const directory = async () => {
    if (await browser.frame.evaluate("document.querySelector('[data-workflows=workbench]').dataset.wfMode") === "instance") {
      await browser.frame.click("[data-wf-action=back-to-flow]");
      await browser.frame.waitFor("document.querySelector('[data-workflows=workbench]').dataset.wfMode === 'workflow'");
    }
    if (await browser.frame.evaluate("document.querySelector('[data-workflows=workbench]').dataset.wfMode") === "workflow") {
      await browser.frame.click("[data-wf-action=back]");
      await browser.frame.waitFor("document.querySelector('[data-workflows=workbench]').dataset.wfMode === 'list'");
    }
  };
  const open = async (index: number) => {
    await directory();
    await browser.frame.click(`[data-wf-open="${flows[index]!.workflow_id}"]`);
    await browser.frame.waitFor(`document.querySelector('[data-wf-open-instance="${runs[index]!.instance_id}"]')`);
    await browser.frame.click(`[data-wf-open-instance="${runs[index]!.instance_id}"]`);
    await browser.frame.waitFor(`document.querySelector('.wf-run')?.dataset.id === '${runs[index]!.instance_id}'`);
  };
  await browser.frame.waitFor(`document.querySelector('[data-wf-open="${flows[0]!.workflow_id}"]')`);
  await open(0);
  const current = (index: number) => store.instance(runs[index]!.instance_id, project);
  return { ...browser, project, path, flows, runs, pages, open, directory, current };
}

type Handoffs = Awaited<ReturnType<typeof handoffs>>;

// Delay a real response after the production route finishes; a stale version produces the real owner refusal.
async function hold(b: Handoffs, operation: "preview" | "continue", stale = false) {
  await b.frame.evaluate(`(() => {
    const original = window.molisWorkRequest;
    window.__handoffHeld = false; window.__handoffReturned = false; window.__handoffCalls = []; window.__handoffReads = 0;
    let first = true;
    window.molisWorkRequest = Object.assign(async (url, init = {}) => {
      const path = new URL(String(url), 'http://plugin.invalid').pathname;
      if (init.method === 'POST' && /\\/(preview|continue)$/.test(path)) window.__handoffCalls.push({ path, body: structuredClone(init.body) });
      if (!first || !path.endsWith('/instances/${b.runs[0]!.instance_id}/${operation}')) {
        window.__handoffReads++;
        try { return await original(url, init); }
        finally { requestAnimationFrame(() => requestAnimationFrame(() => { window.__handoffReads--; })); }
      }
      first = false;
      let answer, failure;
      try { answer = await original(url, ${stale} ? { ...init, body: { ...init.body, updated_at: 'stale-version' } } : init); }
      catch (error) { failure = error; }
      window.__handoffHeld = true;
      await new Promise(resolve => { window.__releaseHandoff = resolve; });
      requestAnimationFrame(() => requestAnimationFrame(() => { window.__handoffReturned = true; }));
      if (failure) throw failure;
      return answer;
    }, original);
  })()`);
}

async function submit(b: Handoffs, body?: string) {
  await b.frame.click("[data-wf-action=continue]");
  await b.frame.waitFor("document.querySelector('[data-wf-manual]')");
  if (body) await b.frame.evaluate(`(() => { const el = document.querySelector('[data-wf-manual] textarea'); el.value = ${JSON.stringify(body)}; el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await b.frame.click("[data-wf-action=handoff-submit]");
}

async function reviewState(b: Handoffs, name: string, control: string) {
  const evidence = reviewEvidenceUrl("quality-audit-workflows/"); await mkdir(evidence, { recursive: true });
  for (const width of [1440, 1024, 390]) for (const theme of ["light", "dark"]) {
    await b.setViewport(width, 900);
    await b.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }, { name: "prefers-reduced-motion", value: "reduce" }] }, b.sessionId);
    await b.frame.evaluate(`document.querySelector(${JSON.stringify(control)}).scrollIntoView({ block: 'center' })`);
    assert.equal(await b.frame.evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
    const rect = await b.frame.evaluate<{ width: number; height: number }>(`(() => { const r = document.querySelector(${JSON.stringify(control)}).getBoundingClientRect(); return { width: r.width, height: r.height }; })()`);
    assert.ok(rect.width > 0 && rect.height > 0);
    await writeFile(new URL(`${name}-${theme}-${width}.png`, evidence), Buffer.from((await b.command<{ data: string }>("Page.captureScreenshot", { format: "png" }, b.sessionId)).data, "base64"));
  }
  await b.setViewport(1280, 900);
}

test("QEA-60 · A's late preview cannot supply the content of B's real handoff", { timeout: 90_000 }, async t => {
  const b = await handoffs(t);
  await hold(b, "preview");
  await b.frame.click("[data-wf-action=continue]"); await b.frame.waitFor("window.__handoffHeld");
  await b.open(1);
  await b.frame.evaluate("window.__releaseHandoff()"); await b.frame.waitFor("window.__handoffReturned");
  if (!await b.frame.evaluate("Boolean(document.querySelector('[data-wf-manual]'))")) {
    await b.frame.click("[data-wf-action=continue]"); await b.frame.waitFor("document.querySelector('[data-wf-manual]')");
  }
  await b.frame.click("[data-wf-action=handoff-submit]");
  await b.frame.waitFor("document.querySelector('.wf-run__status')?.dataset.mwState === 'done'");
  const actual = b.current(1);
  assert.equal(actual.steps[0]!.handoff?.output.body, "只属于 B 的原始正文");
  const saved = b.pages.get(actual.steps[1]!.item!.item_id, b.project);
  assert.match(JSON.stringify(saved.body), /只属于 B 的原始正文/);
  assert.doesNotMatch(JSON.stringify(saved.body), /只属于 A/);
  assert.equal(b.current(0).steps[0]!.handoff, null);
  assert.equal(await b.frame.evaluate("JSON.parse(document.querySelector('[data-workflows=workbench]').dataset.assistantContext).object.id"), b.flows[1]!.workflow_id);
});

test("QEA-60 · leaving for the directory discards a late preview and leaves the next run usable", { timeout: 90_000 }, async t => {
  const b = await handoffs(t);
  await hold(b, "preview");
  await b.frame.click("[data-wf-action=continue]"); await b.frame.waitFor("window.__handoffHeld");
  await b.directory();
  await b.frame.evaluate("window.__releaseHandoff()"); await b.frame.waitFor("window.__handoffReturned");
  assert.equal(await b.frame.evaluate("document.querySelector('[data-workflows=workbench]').dataset.wfMode"), "list");
  assert.equal(await b.frame.evaluate("Boolean(document.querySelector('[data-wf-manual]'))"), false);
  await b.open(1); await submit(b);
  await b.frame.waitFor("document.querySelector('.wf-run__status')?.dataset.mwState === 'done'");
  assert.equal(b.current(1).steps[0]!.handoff?.output.body, "只属于 B 的原始正文");
});

test("QEA-60 · B can hand over while A's older preview still waits", { timeout: 90_000 }, async t => {
  const b = await handoffs(t);
  await hold(b, "preview");
  await b.frame.click("[data-wf-action=continue]"); await b.frame.waitFor("window.__handoffHeld");
  await b.open(1);
  assert.notEqual(await b.frame.evaluate("document.querySelector('[data-wf-action=continue]')?.getAttribute('aria-disabled')"), "true");
  await b.frame.evaluate(`(() => {
    const original = window.molisWorkRequest; window.__bHeld = false;
    window.molisWorkRequest = Object.assign(async (url, init) => {
      const answer = await original(url, init);
      if (String(url).endsWith('/instances/${b.runs[1]!.instance_id}/continue')) {
        window.__bHeld = true; await new Promise(resolve => { window.__releaseB = resolve; });
      }
      return answer;
    }, original);
  })()`);
  await submit(b); await b.frame.waitFor("window.__bHeld");
  await b.frame.evaluate("window.__releaseHandoff()"); await b.frame.waitFor("window.__handoffReturned");
  assert.equal(await b.frame.evaluate("document.querySelector('[data-wf-manual] textarea').disabled"), true, "A's finally cannot clear B's outstanding request");
  await b.frame.evaluate("window.__releaseB()"); await b.frame.waitFor("document.querySelector('.wf-run__status')?.dataset.mwState === 'done'");
  assert.equal(await b.frame.evaluate("document.querySelector('.wf-run')?.dataset.id"), b.runs[1]!.instance_id);
  assert.equal(b.current(1).steps[0]!.handoff?.output.body, "只属于 B 的原始正文");
  assert.equal(b.current(0).status, "active");
});

for (const stale of [false, true]) test(`QEA-60 · a late ${stale ? "CAS refusal" : "committed handoff"} cannot reopen A over B`, { timeout: 90_000 }, async t => {
  const b = await handoffs(t);
  await hold(b, "continue", stale); await submit(b);
  await b.frame.waitFor("window.__handoffHeld");
  await b.open(1);
  await b.frame.evaluate("window.__releaseHandoff()"); await b.frame.waitFor("window.__handoffReturned");
  await b.frame.waitFor("window.__handoffReads === 0");
  assert.equal(await b.frame.evaluate("document.querySelector('.wf-run')?.dataset.id"), b.runs[1]!.instance_id);
  assert.equal(await b.frame.evaluate("JSON.parse(document.querySelector('[data-workflows=workbench]').dataset.assistantContext).object.id"), b.flows[1]!.workflow_id);
  assert.equal(b.current(0).status, stale ? "active" : "done");
  assert.equal(b.current(1).status, "active");
  await submit(b); await b.frame.waitFor("document.querySelector('.wf-run__status')?.dataset.mwState === 'done'");
  assert.equal(b.current(1).steps[0]!.handoff?.output.body, "只属于 B 的原始正文");
});

test("QEA-61 · a refused uncommitted handoff retains the person's editable draft for an explicit retry", { timeout: 90_000 }, async t => {
  const b = await handoffs(t), body = "尚未受理的编辑必须保留";
  await hold(b, "continue", true); await submit(b, body); await b.frame.waitFor("window.__handoffHeld");
  assert.equal(await b.frame.evaluate("document.querySelector('[data-wf-manual] textarea').disabled"), true);
  assert.equal(await b.frame.evaluate("document.querySelector('[data-wf-action=handoff-cancel]').disabled"), true);
  await b.frame.evaluate("window.__releaseHandoff()"); await b.frame.waitFor("window.__handoffReturned && window.__handoffReads === 0");
  assert.equal(b.current(0).steps[0]!.pending, undefined); assert.equal(b.pages.list(b.project).length, 0);
  assert.equal(await b.frame.evaluate("document.querySelector('[data-wf-manual] textarea').value"), body);
  assert.equal(await b.frame.evaluate("document.querySelector('[data-wf-manual] textarea').disabled"), false);
  await b.frame.click("[data-wf-action=handoff-submit]"); await b.frame.waitFor("document.querySelector('.wf-run__status')?.dataset.mwState === 'done'");
  assert.equal(b.current(0).steps[0]!.handoff?.output.body, body); assert.equal(b.pages.list(b.project).length, 1);
});

test("QEA-61 · a lost real Pages receipt preserves the edited handoff across reload and resumes the same delivery", { timeout: 90_000 }, async t => {
  const b = await handoffs(t);
  const receive = b.runs[0]!.chain.stations[1]!.content!.actions.receive!;
  const invoke = ActionService.prototype.invoke;
  let deliveries = 0;
  const failure = t.mock.method(ActionService.prototype, "invoke", async function (this: ActionService, ...args: Parameters<typeof invoke>) {
    const result = await invoke.apply(this, args);
    if (args[1].capability_id === receive.capability_id && args[0].project_id === b.project && ++deliveries === 1) throw new Error("Fixture receipt lost after Pages commit");
    return result;
  });
  const body = "本人已经修改并提交的唯一正文";
  await submit(b, body);
  await b.frame.waitFor("document.querySelector('[data-wf-toast]')?.dataset.tone === 'error'");
  const pending = b.current(0).steps[0]!.pending!;
  assert.equal(pending.output.body, body);
  assert.equal(b.pages.list(b.project).length, 1, "the original receive actually committed");
  await b.reloadPage(); await b.click("[data-plugin-strip] [data-plugin-id=workflows]"); await b.surfaceReady("workflows");
  await b.frame.waitFor(`document.querySelector('[data-wf-open="${b.flows[0]!.workflow_id}"]')`); await b.open(0);
  await b.frame.waitFor("document.querySelector('[data-wf-action=continue]')");
  assert.equal(deliveries, 1, "reload does not repeat delivery");
  await reviewState(b, "pending-content", "[data-wf-action=continue]");
  await b.frame.click("[data-wf-action=continue]");
  await b.frame.waitFor("document.querySelector('[data-wf-manual]') || document.querySelector('.wf-run__status')?.dataset.mwState === 'done'");
  if (await b.frame.evaluate("Boolean(document.querySelector('[data-wf-manual]'))")) {
    assert.equal(await b.frame.evaluate("document.querySelector('[data-wf-manual] textarea').value"), body, "a recovery cannot substitute the original source for the accepted edit");
    await b.frame.click("[data-wf-action=handoff-submit]");
    await b.frame.waitFor("document.querySelector('.wf-run__status')?.dataset.mwState === 'done'");
  }
  failure.mock.restore();
  assert.equal(deliveries, 2);
  assert.equal(b.current(0).steps[0]!.handoff?.key, pending.key);
  assert.equal(b.current(0).steps[0]!.handoff?.output.body, body);
  assert.equal(b.pages.list(b.project).length, 1, "the original request reuses the real document");
  assert.match(JSON.stringify(b.pages.list(b.project)[0]!.body), new RegExp(body));
});

async function replaceA(b: Handoffs, chain: { stations: unknown[]; links: unknown[] }) {
  b.flows[0] = (await b.web.post<{ workflow: Workflow }>(`${b.path}/${b.flows[0]!.workflow_id}`, { revision: b.flows[0]!.revision, chain })).workflow;
  b.runs[0] = (await b.web.post<{ instance: WorkflowInstance }>(`${b.path}/${b.flows[0]!.workflow_id}/instances`, { item_id: b.runs[0]!.steps[0]!.item!.item_id })).instance;
  await b.reloadPage(); await b.click("[data-plugin-strip] [data-plugin-id=workflows]"); await b.surfaceReady("workflows");
  await b.frame.waitFor(`document.querySelector('[data-wf-open="${b.flows[0]!.workflow_id}"]')`);
  await b.open(0);
}

test("QEA-62 · explicitly retrying a manual action preserves the accepted edit and reaches the real target once more", { timeout: 90_000 }, async t => {
  const b = await handoffs(t);
  const offered = await b.web.get<{ actions: { ref: { capability_id: string; version: number; provider_id: string }; title: string; group: string }[] }>(`${b.path}/steps/actions`);
  const shelf = offered.actions.find(item => item.ref.capability_id === "shelf.items.admit"); assert.ok(shelf);
  await replaceA(b, { stations: [{ plugin: "feed" }, { plugin: "action", action: { ref: shelf.ref, title: shelf.title, group: shelf.group, mapping: { text: { from: "body" }, title: { from: "title" } } } }],
    links: [{ kind: "manual", title_template: "", body_template: "", instructions: "" }] });
  const invoke = ActionService.prototype.invoke, inputs: unknown[] = [];
  t.mock.method(ActionService.prototype, "invoke", async function (this: ActionService, ...args: Parameters<typeof invoke>) {
    const result = await invoke.apply(this, args);
    if (args[1].capability_id === shelf.ref.capability_id && args[0].project_id === b.project) {
      inputs.push(structuredClone(args[2]));
      if (inputs.length === 1) throw new Error("Fixture result lost after Shelf commit");
    }
    return result;
  });
  const body = "明确重试时仍使用本人改写的材料";
  await submit(b, body);
  await b.frame.waitFor("document.querySelector('[data-wf-action=retry-action]')");
  assert.equal(inputs.length, 1);
  const pending = b.current(0).steps[0]!.pending!; assert.equal(pending.output.body, body); assert.ok(pending.attempted_at);
  const stored = openTestShelfStore(b.homeDirectory, { disabled: true });
  assert.ok((await stored.snapshot()).materials.some(item => stored.readFile(item.item_id).bytes.toString("utf8").includes(body)));
  await b.reloadPage(); await b.click("[data-plugin-strip] [data-plugin-id=workflows]"); await b.surfaceReady("workflows");
  await b.frame.waitFor(`document.querySelector('[data-wf-open="${b.flows[0]!.workflow_id}"]')`); await b.open(0);
  await b.frame.waitFor("document.querySelector('[data-wf-action=retry-action]')"); assert.equal(inputs.length, 1);
  await reviewState(b, "unknown-action", "[data-wf-action=retry-action]");
  await b.frame.evaluate(`(() => {
    const original = window.molisWorkRequest; window.__retryCalls = [];
    window.molisWorkRequest = Object.assign(async (url, init) => {
      const path = new URL(String(url), 'http://plugin.invalid').pathname;
      if (!/\\/instances\\/.*\\/(preview|continue)$/.test(path)) return original(url, init);
      const call = { path, body: structuredClone(init.body), returned: false }; window.__retryCalls.push(call);
      try { return await original(url, init); }
      finally { requestAnimationFrame(() => requestAnimationFrame(() => { call.returned = true; })); }
    }, original);
  })()`);
  await b.frame.click("[data-wf-action=retry-action]");
  await b.frame.waitFor("window.__retryCalls.some(call => call.returned)");
  if (await b.frame.evaluate("Boolean(document.querySelector('[data-wf-manual]'))")) {
    await b.frame.click("[data-wf-action=handoff-submit]");
    await b.frame.waitFor("window.__retryCalls.some(call => call.path.endsWith('/continue') && call.returned)");
  }
  assert.equal(inputs.length, 2, JSON.stringify(await b.frame.evaluate("window.__retryCalls")));
  assert.equal(await b.frame.evaluate("window.__retryCalls.find(call => call.path.endsWith('/continue'))?.body.retry_action"), true);
  await b.frame.waitFor("document.querySelector('.wf-run__status')?.dataset.mwState === 'done'");
  assert.equal(inputs.length, 2); assert.deepEqual(inputs[1], inputs[0]);
  assert.equal(b.current(0).steps[0]!.handoff?.key, pending.key);
  assert.equal(b.current(0).steps[0]!.handoff?.output.body, body);
});

test("QEA-63 · a judgment's actual refusal stays on the stopped step without claiming a target write", { timeout: 90_000 }, async t => {
  const b = await handoffs(t);
  let allow = false, judged = 0;
  const judge = defineAction({ capability_id: "functions.published.handoff-ownership", version: 1, operation: "command", action: {
    title: "交接判断", description: "实际判断入口的结果夹具", kind: "judgment", scope: "project", audiences: ["user", "workflow"], permissions: [], subject_kinds: [],
    input_schema: { type: "object", properties: { content: { type: "string" } }, required: ["content"] },
    output_schema: { type: "object", properties: { data: { type: "object", properties: { choice: { type: "string", enum: ["pass", "hold"] } } } } },
  } }, () => { judged++; return { status: "ok", function_key: "fixture", version: 1, data: { choice: allow ? "pass" : "hold" }, confidence: 0.9 }; });
  const ref = molisWorkHostProjectReference({ databasePath: b.databasePath, projectId: b.project });
  const remove = b.localHost!.actionRegistry(ref).registerProvider({ provider: { provider_id: "handoff-ownership", kind: "system", title: "交接判断", project_id: b.project }, definitions: [judge.definition], handlers: [judge.handler] });
  t.after(remove);
  const chain = { stations: [{ plugin: "feed" }, { plugin: "pages" }], links: [{ kind: "judgment", title_template: "", body_template: "", instructions: "",
    judgment: { capability_id: judge.definition.capability_id, version: 1, provider_id: "handoff-ownership" }, pass: ["pass"] }] };
  await replaceA(b, chain);
  await b.frame.evaluate(`(() => { window.__handoffToasts = []; const toast = document.querySelector('[data-wf-toast]'); new MutationObserver(() => window.__handoffToasts.push(toast.textContent)).observe(toast, { childList: true, subtree: true }); })()`);
  await b.frame.click("[data-wf-action=continue]");
  await b.frame.waitFor("document.querySelector('.wf-run__status')?.dataset.mwState === 'stopped'");
  const stopped = b.current(0);
  assert.equal(stopped.current, 0); assert.equal(stopped.stopped?.verdict?.choice, "hold");
  assert.equal(judged, 1); assert.equal(b.pages.list(b.project).length, 0);
  assert.equal(await b.frame.evaluate("document.querySelector('.wf-vstep.is-selected')?.dataset.wfStep"), "0");
  assert.match(await b.frame.evaluate<string>("document.querySelector('[data-wf-handoff]').innerText"), /hold/);
  assert.equal(await b.frame.evaluate("window.__handoffToasts.some(text => /已交给|已执行/.test(text))"), false);
  await reviewState(b, "held-judgment", "[data-wf-handoff]");
  allow = true; await replaceA(b, chain);
  await b.frame.click("[data-wf-action=continue]"); await b.frame.waitFor("document.querySelector('.wf-run__status')?.dataset.mwState === 'done'");
  assert.equal(judged, 2); assert.equal(b.pages.list(b.project).length, 1);
  assert.equal(b.current(0).steps[0]!.handoff?.actor, "judgment");
});
