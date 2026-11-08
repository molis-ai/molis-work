import assert from "node:assert/strict";
import test from "node:test";
import { LocalHostHttpClient, addProjectPlugin } from "@molis-ai/molis-work-test-kit/local-host-http";
import type { JudgmentRuleRecord, TypeSafeProvider } from "@molis-ai/molis-work-contracts/modules/functions";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser, pluginFrameInitScript } from "./fixtures/plugin-frame-browser.js";
import { createLocalFeedApplication, createLocalFeedSourceService } from "./fixtures/feed-library.js";

// Feed's rule page when its draft changed elsewhere (specs/action-input-contracts §2.7, docs/design/rule-stale-reload): the other writer
// is the Host's own route, the page is the real Feed frame, only the trial provider is a fixture.

interface Draft { function?: JudgmentRuleRecord; functionKey?: string; previewContent?: string }

test("AIC-08: Feed keeps what you wrote when the draft changed elsewhere; the latest replaces the saved draft, wants a new preview, and the next one goes through", { timeout: 120_000 }, async t => {
  const provider: TypeSafeProvider = { async evaluate(_key, record) { return { primitive: record.primitive, choice: null, noul: .8, score: null, legend: null, probabilities: {}, confidence: null, model: "fixture-judgment" }; } };
  const b = await openGoalBrowser(t, true, undefined, null, { env: { TYPESAFE_API_KEY: "test-only-not-a-real-key" }, provider }); if (!b) return;
  const { store, projectId, command, sessionId } = b; assert.ok(projectId);
  await addProjectPlugin(b.web, projectId, "feed");
  const feed = createLocalFeedApplication(store.db), source = createLocalFeedSourceService(store.db, projectId).register({ kind: "web_query", query: "keep-edits", name: "Keep edits source" }).source;
  feed.ingestItem({ source, externalId: "keep-sample", title: "需要关注的消息", summary: "原材料", body: "试跑读取这段原文", occurredAt: new Date().toISOString(), attention: false });
  await pluginFrameInitScript(t, b, `window.molisWorkbenchPluginFactories=new Proxy({}, {set(target,key,value){target[key]=key==='feed'?host=>{window.t403Host=host;window.t403Reads={total:0,pending:0};const read=host.view.readDocument;host.view.readDocument=async(...args)=>{t403Reads.total++;t403Reads.pending++;try{return await read(...args)}finally{t403Reads.pending--}};return value(host)}:value;return true}});`);
  const child = await pluginFrameBrowser(t, b, "feed"), owner = new LocalHostHttpClient({ origin: b.origin, controlToken: b.controlToken });
  await b.navigate(() => command("Page.navigate", { url: `${b.origin}/projects/${projectId}/?openPlugin=feed` }, sessionId));
  await child.waitFor("window.t403Host && t403Reads.total>0 && t403Reads.pending===0");
  const section = `[data-feed-out-rules="${source.source_id}"]`, bandSel = section + " [data-feed-rule-band]", key = `/projects/${projectId}/:feed-rule:${source.source_id}`;
  const draft = async () => JSON.parse(await child.evaluate<string>(`sessionStorage.getItem(${JSON.stringify(key)}) || "{}"`)) as Draft;
  const fill = (attr: string, text: string) => child.evaluate(`(() => { const field=document.querySelector(${JSON.stringify(section + " [" + attr + "]")});field.value=${JSON.stringify(text)};field.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await child.evaluate(`t403Host.openView({surface:'workbench',id:${JSON.stringify(source.source_id)},panel:'rules',intent:'open'})`);
  await child.waitFor(`!document.querySelector('[data-feed-task-config="${source.source_id}"]')?.hidden && t403Reads.pending===0`);
  await child.click(section + ' [data-feed-rule-mode="natural"]');
  await fill("data-feed-out-rule-name", "Keep rule"); await fill("data-feed-rule-instructions", "捕捉需要关注的消息");
  await child.click(section + " [data-feed-rule-preview-run]");
  await child.waitFor(`document.querySelector('${section} [data-feed-rule-preview]')?.textContent.includes('匹配') && !document.querySelector('${section} [data-feed-rule-composer]').inert`);
  const first = (await draft()).function!; assert.ok(first);

  // Someone else changes the draft; this page changes the same field.
  const theirs = (await owner.post<{ function: JudgmentRuleRecord }>("/api/functions/" + first.id, { instructions: "别处写的说明", expected_updated_at: first.updated_at })).function;
  await fill("data-feed-rule-instructions", "我写的说明");
  await child.click(section + " [data-feed-rule-preview-run]");
  await child.waitFor(`document.querySelector('${bandSel} .mw-alert--warning') && !document.querySelector('${section} [data-feed-rule-composer]').inert`);
  assert.equal(await child.evaluate(`document.querySelector('${bandSel}').getAttribute('role')`), "status", "the slot is the one live region");
  assert.equal(await child.evaluate(`document.querySelector('${section} [data-feed-rule-instructions]').value`), "我写的说明", "what you wrote stays");
  assert.equal((await draft()).function!.updated_at, first.updated_at, "nothing is replaced before you choose");

  await child.click(bandSel + " [data-feed-keep-act=reload]");
  await child.waitFor(`document.querySelector('${bandSel} .mw-alert--success')`);
  const loaded = await draft();
  assert.equal(loaded.function!.updated_at, theirs.updated_at, "the saved draft is the latest record");
  assert.equal(loaded.previewContent, undefined, "the old preview no longer counts");
  assert.equal(loaded.functionKey, first.function_key);
  assert.equal(await child.evaluate(`document.querySelector('${section} [data-feed-rule-instructions]').value`), "别处写的说明");
  assert.deepEqual(await child.evaluate(`[...document.querySelectorAll('${section} [data-feed-kept]')].map(node => node.dataset.feedKept)`), ["instructions"]);
  assert.equal(await child.evaluate(`document.querySelector('${section} [data-feed-kept=instructions] .mw-kept__text').textContent`), "我写的说明");
  assert.match(await child.evaluate<string>(`document.querySelector('${bandSel} .mw-alert p').textContent`), /再预览一次才能启用/u);
  assert.equal(await child.evaluate("document.activeElement?.matches('[data-feed-kept-swap]')"), true);

  // This frame is short (under 560px): the alert is not pinned over the row it points to.
  assert.equal(await child.evaluate(`innerHeight <= 560 ? getComputedStyle(document.querySelector('${bandSel}')).position : 'static'`), "static");
  // Put yours back and preview: the next write names the new version and goes through.
  await child.click(section + " [data-feed-kept=instructions] [data-feed-kept-swap]");
  assert.equal(await child.evaluate(`document.querySelector('${section} [data-feed-rule-instructions]').value`), "我写的说明");
  await child.click(section + " [data-feed-rule-preview-run]");
  await child.waitFor(`document.querySelector('${section} [data-feed-rule-preview]')?.textContent.includes('匹配') && !document.querySelector('${section} [data-feed-rule-composer]').inert`);
  const after = (await owner.get<{ functions: JudgmentRuleRecord[] }>("/api/functions")).functions.find(row => row.id === first.id)!;
  assert.equal(after.instructions, "我写的说明"); assert.ok(after.last_preview);
  assert.equal((await draft()).function!.updated_at, after.updated_at);
});
