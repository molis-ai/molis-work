import { pluginFrameBrowser, pluginFrameInitScript } from "./fixtures/plugin-frame-browser.js";
import { LocalHostHttpClient } from "@molis-ai/molis-work-test-kit/local-host-http";
import type { TypeSafeProvider } from "@molis-ai/molis-work-contracts/modules/functions";
import { ISOLATED_HOST_IDS } from "./fixtures/isolated-host.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import test from "node:test";
import { PluginRuntime, SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { definePlugin } from "@molis-ai/molis-work-plugin-sdk";
import { type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { feedCaptureScene } from "@molis-ai/molis-work-plugin-feed";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";
import { createLocalFeedApplication, createLocalFeedSourceService } from "./fixtures/feed-library.js";

test("RAC-2518 a late authoring create cannot revive an old source, and an explicit retry recovers that exact draft after hide/reopen", { timeout: 90000 }, async t => {
  const provider: TypeSafeProvider = { async evaluate(_key, record) { return { primitive: record.primitive, choice: null, noul: .8, score: null, legend: null, probabilities: {}, confidence: null, model: "fixture-judgment" }; } };
  const b = await openGoalBrowser(t, true, undefined, null, { env: { TYPESAFE_API_KEY: "test-only-not-a-real-key" }, provider }); if (!b) return;
  const { store, localHost, projectId, homeDirectory, command, sessionId } = b; assert.ok(localHost); assert.ok(projectId);
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory }); catalog.addProjectPlugin({ project_id: projectId, plugin_id: "feed", actor_id: "fixture" }); catalog.close();
  const sourceService = createLocalFeedSourceService(store.db, projectId), feed = createLocalFeedApplication(store.db);
  const a = sourceService.register({ kind: "web_query", query: "late-authoring-A", name: "Late authoring A" }).source;
  const other = sourceService.register({ kind: "web_query", query: "late-authoring-B", name: "Late authoring B" }).source;
  for (const source of [a, other]) feed.ingestItem({ source, externalId: "authoring-material", title: "需要关注的消息", summary: "候选材料", body: "需要关注的真实测试材料", occurredAt: new Date().toISOString(), attention: false });
  await pluginFrameInitScript(t, b, `window.t403Calls=[];window.t403Reads={total:0,pending:0};window.t403HoldCreate=true;window.molisWorkbenchPluginFactories=new Proxy({}, {set(target,key,value){target[key]=key==='feed'?host=>{window.t403Host=host;const invoke=host.invokeAction;host.invokeAction=async(reference,input)=>{t403Calls.push(reference.capability_id);const result=await invoke(reference,input);if(t403HoldCreate&&reference.capability_id==='functions.authoring.create'){window.t403CreateEntered=true;await new Promise(resolve=>window.t403CreateRelease=resolve);window.t403CreateReturned=true;}return result;};const read=host.view.readDocument;host.view.readDocument=async(...args)=>{t403Reads.total++;t403Reads.pending++;try{return await read(...args)}finally{t403Reads.pending--}};return value(host)}:value;return true}});`);
  const child = await pluginFrameBrowser(t, b, "feed");
  await b.navigate(() => command("Page.navigate", { url: `${b.origin}/projects/${projectId}/?openPlugin=feed` }, sessionId));
  await child.waitFor("window.t403Host && t403Reads.total>0 && t403Reads.pending===0");
  const section = (id: string) => '[data-feed-out-rules="' + id + '"]';
  const select = async (id: string) => {
    await child.evaluate(`t403Host.openView({surface:'workbench',id:${JSON.stringify(id)},panel:'rules',intent:'open'})`);
    await child.waitFor(`document.querySelector('[data-feed-workbench]').dataset.selectedSource===${JSON.stringify(id)} && !document.querySelector('[data-feed-sources-dialog]').hidden && !document.querySelector('[data-feed-task-config="${id}"]').hidden`);
  };
  await select(a.source_id); await child.click(section(a.source_id) + ' [data-feed-rule-mode="natural"]');
  await child.evaluate(`(() => { const section=document.querySelector(${JSON.stringify(section(a.source_id))}); for(const [attr,value] of [['data-feed-out-rule-name','Delayed create rule'],['data-feed-rule-instructions','捕捉需要关注的消息']]){const field=section.querySelector('['+attr+']');field.value=value;field.dispatchEvent(new Event('input',{bubbles:true}));} })()`);
  await child.click(section(a.source_id) + ' [data-feed-rule-preview-run]'); await child.waitFor("window.t403CreateEntered");
  const draftKey = `/projects/${projectId}/:feed-rule:${a.source_id}`;
  const savedBefore = await child.evaluate<string>(`sessionStorage.getItem(${JSON.stringify(draftKey)})`);
  assert.ok(JSON.parse(savedBefore).functionKey); assert.equal(await child.evaluate(`document.querySelector('${section(a.source_id)} [data-feed-rule-composer]').inert`), true);
  await b.click('[data-plugin-strip] [data-plugin-id="home"]'); await b.click('[data-plugin-strip] [data-plugin-id="feed"]');
  await child.waitFor(`t403Host.scope.visible && !document.querySelector('${section(a.source_id)} [data-feed-rule-composer]').inert && t403Reads.pending===0`);
  await select(other.source_id);
  await child.evaluate(`(() => { const field=document.querySelector('${section(other.source_id)} [data-feed-out-rule-name]');field.value='Source B draft';field.dispatchEvent(new Event('input',{bubbles:true}));t403CreateRelease(); })()`);
  await child.waitFor("window.t403CreateReturned"); await child.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
  assert.deepEqual(await child.evaluate("t403Calls"), ["functions.authoring.create"], "no list/update/preview or Feed bind follows the old completion");
  assert.equal(await child.evaluate(`sessionStorage.getItem(${JSON.stringify(draftKey)})`), savedBefore, "the old callback does not overwrite its saved draft");
  assert.equal(await child.evaluate(`document.querySelector('${section(other.source_id)} [data-feed-out-rule-name]').value`), "Source B draft");
  assert.equal(feed.outRules.list(projectId).some(rule => rule.match.source_id === a.source_id), false);
  await child.evaluate("window.t403HoldCreate=false"); await select(a.source_id);
  await child.click(section(a.source_id) + ' [data-feed-rule-preview-run]');
  try { await child.waitFor(`document.querySelector('${section(a.source_id)} [data-feed-rule-preview]')?.textContent.includes('匹配')`); }
  catch (error) { t.diagnostic(JSON.stringify(await child.evaluate(`({calls:t403Calls,status:document.querySelector('${section(a.source_id)} [data-feed-rule-status]')?.textContent,draft:sessionStorage.getItem(${JSON.stringify(draftKey)})})`))); throw error; }
  const owner = new LocalHostHttpClient({ origin: b.origin, controlToken: b.controlToken });
  const functions = await owner.get<{ functions: Array<{ function_key: string; status: string }> }>("/api/functions");
  assert.equal(functions.functions.filter(fn => fn.function_key === JSON.parse(savedBefore).functionKey).length, 1, "lost-response recovery uses the original key");
  await child.click(section(a.source_id) + ' [data-feed-out-rule-create]');
  await child.waitFor(`document.querySelector('${section(a.source_id)} [data-feed-out-rule-row]')?.textContent.includes('Delayed create rule')`);
  assert.equal(feed.outRules.list(projectId).filter(rule => rule.match.source_id === a.source_id).length, 1, "one explicit save creates one binding");
});

test("Feed discovers an installed plugin judgment, previews without admission, saves and really consumes it on desktop and narrow screens", { timeout: 90000 }, async t => {
  const b = await openGoalBrowser(t, true, undefined, null); if (!b) return;
  const { localHost, store, projectId, homeDirectory, command, sessionId, navigate, origin } = b;
  const { evaluate, waitFor, click } = await pluginFrameBrowser(t, b, "feed");
  assert.ok(localHost); assert.ok(projectId);
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory });
  catalog.addProjectPlugin({ project_id: projectId, plugin_id: "feed", actor_id: "fixture" }); catalog.close();
  const reference = molisWorkHostProjectReference({ databasePath: b.databasePath, projectId });
  await localHost.withProject(reference, () => undefined);
  const feed = createLocalFeedApplication(store.db);
  const source = createLocalFeedSourceService(store.db, projectId).register({ kind: "web_query", query: "capture-browser-" + randomUUID() }).source;
  const item = feed.ingestItem({ source, externalId: "browser-item", title: "需要核对的插件消息", summary: "原材料", body: "判断读取这段原文", occurredAt: new Date().toISOString(), attention: false }).item;
  const definition: ActionDefinition = { capability_id: "fixture.feed.capture." + randomUUID(), version: 1, operation: "command", action: {
    title: "插件判断：需要跟进", description: "判断原材料是否需要跟进", kind: "judgment", scope: "project", audiences: ["user", "workflow", "mcp"], permissions: [], subject_kinds: ["feed_item"],
    input_schema: feedCaptureScene.input_schema, output_schema: feedCaptureScene.result_schema, output_type: feedCaptureScene.result_type } };
  const inputs: string[] = [];
  const plugin = definePlugin({ manifest: { schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.example.capture", version: "1.0.0", name: "捕捉判断示例",
    kind: "app", publisher: { publisher_id: "example", signature: "capture-fixture" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
    permissions: [], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [definition] },
    async start() { return { kind: "app", actions: [{ ...definition, handle: (_caller, args) => { inputs.push((args as { content: string }).content); return { status: "ok", suggested_behavior_ids: ["inbox.admit"] }; } }] }; } });
  const runtime = new PluginRuntime(new SqlitePluginRuntimeRepository(store.db), undefined, { hostIds: ISOLATED_HOST_IDS, actions: { registry: localHost.actionRegistry(reference), project_id: projectId } });
  const install = runtime.install({ trust: { level: "unsigned" }, definition: plugin, deployment: "local", grants: [] }).install;
  await runtime.start(install.install_id);
  const section = `[data-feed-out-rules="${source.source_id}"]`;
  const fill = (selector: string, value: string) => evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); node.value = ${JSON.stringify(value)}; node.dispatchEvent(new Event('input', { bubbles: true })); node.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  try {
    await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
    await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
    await b.waitFor("document.querySelector('[data-plugin-id=feed]')"); await b.click('[data-plugin-id="feed"]');
    await waitFor(`document.querySelector('[data-feed-task="${source.source_id}"]')`); await click(`[data-feed-task="${source.source_id}"]`);
    await click('button[data-feed-view="rules"]');
    await waitFor(`document.querySelector('${section}')`);
    await click(section + ' [data-feed-rule-mode="existing"]');
    const choice = await waitFor(`Array.from(document.querySelector('${section} [data-feed-out-rule-function-key]').options).find(option => option.textContent.includes('插件判断：需要跟进'))?.value`);
    // waitFor only waits; obtain the actual serialized reference from the live selector.
    void choice;
    const value = await evaluate<string>(`Array.from(document.querySelector('${section} [data-feed-out-rule-function-key]').options).find(option => option.textContent.includes('插件判断：需要跟进')).value`);
    await fill(section + ' [data-feed-out-rule-name]', "需要跟进的消息");
    await fill(section + ' [data-feed-out-rule-function-key]', value);
    await fill(section + ' [data-feed-out-rule-admission]', "inbox");
    await click(section + ' [data-feed-rule-preview-run]');
    await waitFor(`document.querySelector('${section} [data-feed-rule-preview]')?.textContent.includes('匹配') || document.querySelector('${section} [data-feed-rule-status]')?.dataset.error === 'true'`);
    assert.notEqual(await evaluate(`document.querySelector('${section} [data-feed-rule-status]')?.dataset.error`), 'true', await evaluate(`document.querySelector('${section}')?.innerText`));
    assert.equal(inputs.length, 1); assert.match(inputs[0]!, /判断读取这段原文/);
    assert.ok(!feed.listInboxEntries(projectId).some(entry => entry.subject_id === item.item_id));
    await click(section + ' [data-feed-out-rule-create]');
    await waitFor(`Array.from(document.querySelectorAll('${section} [data-feed-out-rule-row]')).some(row => row.textContent.includes('需要跟进的消息')) || document.querySelector('${section} [data-feed-rule-status]')?.dataset.error === 'true'`);
    assert.notEqual(await evaluate(`document.querySelector('${section} [data-feed-rule-status]')?.dataset.error`), 'true', await evaluate(`document.querySelector('${section}')?.innerText`));
    const saved = feed.outRules.list(projectId).find(rule => rule.name === "需要跟进的消息")!;
    assert.equal(saved.judgment?.capability_id, definition.capability_id); assert.ok(saved.judgment?.provider_id);
    await evaluate(`document.querySelector('${section} [data-feed-out-rules-evaluate]').closest('details').open = true`);
    // A natural-height disclosure clips its children while opening; wait until it contains the control before scrolling.
    await waitFor(`(() => { const button = document.querySelector('${section} [data-feed-out-rules-evaluate]');
      const disclosure = button.closest('details');
      return disclosure.open && disclosure.getBoundingClientRect().bottom >= button.getBoundingClientRect().bottom; })()`);
    await click(section + ' [data-feed-out-rules-evaluate]');
    await waitFor(`!document.querySelector('${section} [data-feed-out-rules-evaluate]')?.disabled`);
    for (let i = 0; i < 30 && !feed.listInboxEntries(projectId).some(entry => entry.subject_id === item.item_id); i++) await new Promise(resolve => setTimeout(resolve, 100));
    assert.ok(feed.listInboxEntries(projectId).some(entry => entry.subject_id === item.item_id && entry.reason === "source_rule"));
    assert.equal(inputs.length, 2);
    await runtime.stop(install.install_id);
    await click(section + ' [data-feed-rule-mode="existing"]');
    await waitFor(`document.querySelector('${section} [data-feed-rule-binding-status]')?.textContent !== '已启用'`);
    assert.ok(feed.outRules.list(projectId).find(rule => rule.rule_id === saved.rule_id)!.judgment, "stopping the provider preserves the exact saved reference");
    const usages = await localHost.sceneClient(reference).usages({ actor_id: "web-user", project_id: projectId, audience: "user", permissions: ["feed:read", "feed:write", "model:invoke"] });
    const usage = usages.find(usage => usage.binding_id === "feed.capture:" + saved.rule_id)!;
    assert.ok(usage.href);
    await navigate(() => command("Page.navigate", { url: origin + usage.href }, sessionId));
    await waitFor(`!document.querySelector('[data-feed-sources-dialog]')?.hidden && !document.querySelector('[data-feed-task-config="${source.source_id}"]')?.hidden`);
    await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
    await waitFor("document.documentElement.scrollWidth <= innerWidth + 1");
    await mkdir(reviewEvidenceUrl("feed-capture/"), { recursive: true });
    await evaluate(`document.querySelector('${section} [data-feed-out-rule-row]').scrollIntoView({ block: 'center', behavior: 'instant' })`);
    const screenshot = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
    await writeFile(reviewEvidenceUrl("feed-capture/unavailable-narrow.png"), Buffer.from(screenshot.data, "base64"));
  } catch (error) {
    t.diagnostic(await b.evaluate("JSON.stringify({url:location.href,surface:document.body.dataset.desktopSurface,roots:[...document.querySelectorAll('[data-plugin-contribution]')].map(root=>({...root.dataset,hidden:root.hidden,text:root.innerText.slice(-400)})),toast:document.querySelector('[data-toast]')?.innerText})"));
    const failure = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId); await writeFile("/private/tmp/t403-evidence/feed-capture-failure.png", Buffer.from(failure.data, "base64"));
    t.diagnostic(await evaluate(`JSON.stringify({ section: document.querySelector('${section}')?.innerText, busy: document.querySelector('${section} [data-feed-rule-composer]')?.getAttribute('aria-busy') })`).catch(() => "child unavailable"));
    t.diagnostic(JSON.stringify(feed.outRules.list(projectId).filter(rule => rule.match.source_id === source.source_id)));
    throw error;
  } finally { await runtime.stop(install.install_id); }
});
