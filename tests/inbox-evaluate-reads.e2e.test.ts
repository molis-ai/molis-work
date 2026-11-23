import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { PluginRuntime, SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { definePlugin } from "@molis-ai/molis-work-plugin-sdk";
import type { ActionDefinition, ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { inboxActions, inboxNextScene, inboxSceneBindingId, INBOX_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-inbox";
import { molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { HOST_STAND_IN_IDS, ISOLATED_HOST_IDS } from "./fixtures/isolated-host.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { createLocalFeedApplication, createLocalFeedSourceService } from "./fixtures/feed-library.js";

// BFP-01 / BL-131 (specs/visual-ui-experience/work-items/batch27-feed-inbox-performance): updating the first 20 suggestions in Inbox.
// BFP-02/03 (CPU, memory, heap, HTTP response/error segments) are not measured here; see BL-batch27-audit-followups.
// The rule returns a fixed answer, so no model latency is in the samples. Each sample counts the page's document reads after the
// judgment and records when the notice and the 20 suggestions appear; the timings are printed, the order and the count are asserted.
const SAMPLES = 5, ENTRIES = 20;
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;

test("BFP-01 BL-131: updating 20 Inbox suggestions reads the page once and says so only after the suggestions are shown", { timeout: 240_000 }, async t => {
  const browser = await openGoalBrowser(t, true, undefined, null); if (!browser) return;
  const { store, localHost, projectId, command, sessionId, navigate, origin } = browser;
  const { evaluate, waitFor, click } = await pluginFrameBrowser(t, browser, "inbox");
  assert.ok(localHost); assert.ok(projectId);
  // QEA-90: a real request to this same Host must finish while the fixed-rule batch is still running.
  let progress: { calls: number; healthAt: number; probe?: Promise<void>; error?: unknown } = { calls: 0, healthAt: 0 };
  const loopDelay = monitorEventLoopDelay({ resolution: 20 });
  t.after(() => loopDelay.disable());
  const reference = molisWorkHostProjectReference({ databasePath: browser.databasePath, projectId });
  await localHost.withProject(reference, () => undefined);
  const feed = createLocalFeedApplication(store.db);
  const source = createLocalFeedSourceService(store.db, projectId).register({ kind: "research_library", repository: "fixture/bfp", research_source: "current" }).source;
  for (let index = 0; index < ENTRIES; index++) {
    const item = feed.ingestItem({ source, externalId: `bfp-${index}`, title: `待核对的研究 ${index + 1}`, summary: "待核对", body: `研究原文 ${index + 1}`, occurredAt: new Date(Date.now() - index * 60_000).toISOString(), attention: false }).item;
    feed.ensureInboxEntryForFeedItem(projectId, item.item_id, "manual");
  }
  const definition: ActionDefinition = { capability_id: "fixture.bfp." + randomUUID(), version: 1, operation: "command", action: {
    title: "固定判断", description: "固定返回先核查", kind: "judgment", scope: "project", audiences: ["user", "workflow", "mcp"], permissions: ["fixture:bfp"], subject_kinds: ["inbox_entry"],
    input_schema: inboxNextScene.input_schema, output_schema: inboxNextScene.result_schema, output_type: inboxNextScene.result_type } };
  const plugin = definePlugin({ manifest: { schema_version: 1, host_api_version: 1, plugin_id: "com.example.bfp", version: "1.0.0", name: "固定判断插件",
    kind: "app", publisher: { publisher_id: "example", signature: "bfp-fixture" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }], permissions: [{ permission: "fixture:bfp", required: true, reason: "运行固定判断" }],
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [definition] },
    async start() { return { kind: "app", actions: [{ ...definition, handle: () => {
      if (++progress.calls === 1) progress.probe = fetch(`${origin}/health`).then(async response => {
        assert.equal(response.status, 200); await response.text(); progress.healthAt = progress.calls;
      }).catch(error => { progress.error = error; });
      return { status: "ok", suggested_behavior_ids: ["inbox.verify"] };
    } }] }; } });
  const runtime = new PluginRuntime(new SqlitePluginRuntimeRepository(store.db), undefined, { hostIds: ISOLATED_HOST_IDS, releaseIds: HOST_STAND_IN_IDS, actions: { registry: localHost.actionRegistry(reference), project_id: projectId } });
  const installed = runtime.install({ trust: { level: "unsigned" }, definition: plugin, deployment: "local", grants: ["fixture:bfp"] }).install;
  await runtime.start(installed.install_id);
  try {
  const caller: ActionCallContext = { actor_id: "owner", project_id: projectId, audience: "user", permissions: [...INBOX_ACTION_PERMISSIONS, "fixture:bfp"] };
  await localHost.actionClient(reference).invoke(caller, inboxActions.readJudgment, {});
  await localHost.sceneClient(reference).bind(caller, { binding_id: inboxSceneBindingId(projectId), scene_id: inboxNextScene.scene_id, scene_version: 1, project_id: projectId,
    enabled: true, function: { capability_id: definition.capability_id, version: 1 }, title: "Inbox 下一步", href: `/projects/${projectId}/?openPlugin=inbox` });

  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Network.enable", {}, sessionId);
  // What the page asks the Host for while a sample runs: the judgment POST and every HTML document read (the stage it re-renders).
  const requests: { id: string; url: string; method: string; at: number }[] = [];
  const responses = new Map<string, { at: number; htmlBytes?: number }>();
  const offRequest = browser.on("Network.requestWillBeSent", (event, session) => {
    const sent = event as { requestId: string; timestamp: number; request: { url: string; method: string } };
    if (session === sessionId) requests.push({ id: sent.requestId, url: sent.request.url, method: sent.request.method, at: sent.timestamp * 1000 });
  });
  const offResponse = browser.on("Network.responseReceived", (event, session) => {
    const received = event as { requestId: string; timestamp: number; response: { mimeType: string; encodedDataLength: number } };
    if (session !== sessionId) return;
    const { mimeType, encodedDataLength } = received.response;
    responses.set(received.requestId, { at: received.timestamp * 1000, ...(mimeType === "text/html" && { htmlBytes: encodedDataLength }) });
  });
  t.after(() => { offRequest(); offResponse(); });

  const samples: { notice: number; shown: number; reads: number; suggestionsAtNotice: number }[] = [];
  let passivePairs = 0;
  for (let sample = 0; sample < SAMPLES; sample++) {
    await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=inbox` }, sessionId));
    await browser.waitFor("document.body.dataset.desktopSurface === 'inbox'");
    await waitFor("document.querySelector('.inbox-next-config [data-inbox-evaluate]') && !document.querySelector('.inbox-next-config [data-inbox-evaluate]').disabled");
    await evaluate("document.querySelector('.inbox-next-config').open = true");
    // When the notice is written, how many suggestions the page shows: the order the person sees, recorded inside the frame.
    await evaluate(`(() => { window.__bfp = { notice: 0, shown: 0, at: 0 }; const count = () => document.querySelectorAll('.inbox-next-suggestion').length;
      new MutationObserver(() => { const status = document.querySelector('[data-inbox-evaluate-status]');
        if (!window.__bfp.notice && status?.textContent.includes('已更新')) { window.__bfp.notice = performance.now(); window.__bfp.at = count(); }
        if (!window.__bfp.shown && count() >= ${ENTRIES}) window.__bfp.shown = performance.now(); }).observe(document.body, { subtree: true, childList: true, characterData: true }); })()`);
    const before = requests.length;
    progress = { calls: 0, healthAt: 0 }; loopDelay.reset(); loopDelay.enable();
    const start = await evaluate<number>("performance.now()");
    await click(".inbox-next-config [data-inbox-evaluate]", 1, "center", 30_000);
    await waitFor(`window.__bfp.notice && window.__bfp.shown`, 30_000);
    const result = await evaluate<{ notice: number; shown: number; at: number }>("window.__bfp");
    loopDelay.disable();
    await progress.probe;
    assert.equal(progress.error, undefined);
    assert.equal(progress.calls, ENTRIES);
    assert.ok(progress.healthAt > 0 && progress.healthAt < ENTRIES, `Host answered health after judgment ${progress.healthAt}/${ENTRIES}`);
    t.diagnostic(`QEA-90 sample ${sample + 1} health responded after ${progress.healthAt}/${ENTRIES} judgments; max event-loop delay ${Math.round(loopDelay.max / 1e6)}ms`);
    await new Promise(resolve => setTimeout(resolve, 1500)); // let a late second read show up if there is one
    const seen = requests.slice(before);
    const post = seen.findIndex(request => request.method === "POST" && request.url.includes("/judgment/evaluate"));
    assert.ok(post >= 0, "the judgment ran");
    const afterPost = seen.slice(post + 1);
    const documents = afterPost.filter(request => responses.get(request.id)?.htmlBytes !== undefined);
    // QEA-115: this real Inbox consumer still refreshes the background Goal collection, without requesting its hidden document.
    const goalRefreshes = afterPost.filter(request => new URL(request.url).pathname.endsWith("/api/board/refresh"));
    assert.ok(goalRefreshes.every(request => new URL(request.url).searchParams.get("projection") === "collection"), "Inbox must not refresh a hidden Goal document");
    // The Inbox page itself; another view's own refresh (the Goals board) is reported above, not counted here.
    const reads = documents.filter(request => new URL(request.url).pathname === `/projects/${projectId}/`).length;
    t.diagnostic(`BFP sample ${sample + 1} document reads ${JSON.stringify(documents.map(request => ({ path: new URL(request.url).pathname + new URL(request.url).search, ms: Math.round(request.at - seen[post]!.at), bytes: responses.get(request.id)?.htmlBytes })))}`);
    // QEA-150: use the browser clock, since delivery of CDP messages can pause while this process is busy.
    const intervals = goalRefreshes.slice(1).map((request, index) => Math.round(request.at - goalRefreshes[index]!.at));
    assert.ok(intervals.every(interval => interval >= 3900), `hidden Goals follow the existing four-second poll: ${intervals.join(", ")} ms`);
    // QEA-201: measure only automatic reads while the judgment is pending, before its UI requests a fresh view.
    const judgmentAnswered = responses.get(seen[post]!.id)?.at;
    assert.ok(judgmentAnswered, "the real judgment response was received");
    const whileUpdating = afterPost.filter(request => request.at < judgmentAnswered);
    const attention = whileUpdating.filter(request => new URL(request.url).pathname === `/projects/${projectId}/api/attention`);
    const badgeReads = whileUpdating.filter(request => new URL(request.url).pathname === `/projects/${projectId}/api/host/surface-attention`).length;
    const gaps = attention.slice(1).map((request, index) => {
      const previous = responses.get(attention[index]!.id);
      assert.ok(previous, "the previous attention read answered");
      return Math.round(request.at - previous.at);
    });
    passivePairs += gaps.length;
    t.diagnostic(`QEA-201 sample ${sample + 1}: ${attention.length} attention reads, ${badgeReads} badge reads; gaps ${gaps.join(", ")} ms`);
    assert.ok(gaps.every(gap => gap >= 470), `automatic attention reads coalesce for 500 ms after each reply: ${gaps.join(", ")} ms`);
    samples.push({ notice: result.notice - start, shown: result.shown - start, reads, suggestionsAtNotice: result.at });
  }
  const p50 = { notice: Math.round(median(samples.map(item => item.notice))), shown: Math.round(median(samples.map(item => item.shown))) };
  assert.ok(passivePairs > 0, "the workload exercised a later automatic attention read in the same batch");
  t.diagnostic(`BFP inbox update samples ${JSON.stringify(samples.map(item => ({ ...item, notice: Math.round(item.notice), shown: Math.round(item.shown) })))} p50 ${JSON.stringify(p50)}`);
  for (const item of samples) {
    assert.equal(item.reads, 1, `one document read after the judgment: ${JSON.stringify(samples)}`);
    assert.equal(item.suggestionsAtNotice, ENTRIES, `the notice comes after the ${ENTRIES} suggestions are shown: ${JSON.stringify(samples)}`);
  }
  } finally { await runtime.stop(installed.install_id); }
});
