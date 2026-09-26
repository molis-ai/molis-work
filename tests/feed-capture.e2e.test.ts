import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import test from "node:test";
import { PluginRuntime, SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { definePlugin } from "../packages/plugin-sdk/src/index.js";
import { type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { DEMO_BOARD_ID, molisWorkHostProjectReference, createLocalFeedApplication, createLocalFeedSourceService } from "@molis-ai/molis-work-app-local-host";
import { feedCaptureScene } from "@molis-ai/molis-work-plugin-feed";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

test("Feed discovers an installed plugin judgment, previews without admission, saves and really consumes it on desktop and narrow screens", { timeout: 90000 }, async t => {
  const b = await openGoalBrowser(t, true, undefined, null); if (!b) return;
  const { localHost, store, projectId, homeDirectory, command, sessionId, evaluate, waitFor, click, navigate, origin } = b;
  assert.ok(localHost); assert.ok(projectId);
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory });
  catalog.addProjectPlugin({ project_id: projectId, plugin_id: "feed", actor_id: "fixture" }); catalog.close();
  const reference = molisWorkHostProjectReference({ databasePath: b.databasePath, boardId: DEMO_BOARD_ID, projectId });
  await localHost.withProject(reference, () => undefined);
  const feed = createLocalFeedApplication(store.db);
  const source = createLocalFeedSourceService(store.db, DEMO_BOARD_ID).register({ kind: "web_query", query: "capture-browser-" + randomUUID() }).source;
  const item = feed.ingestItem({ source, externalId: "browser-item", title: "需要核对的插件消息", summary: "原材料", body: "判断读取这段原文", occurredAt: new Date().toISOString(), attention: false }).item;
  const definition: ActionDefinition = { capability_id: "fixture.feed.capture." + randomUUID(), version: 1, operation: "command", action: {
    title: "插件判断：需要跟进", description: "判断原材料是否需要跟进", kind: "judgment", scope: "project", audiences: ["user", "workflow", "mcp"], permissions: [], subject_kinds: ["feed_item"],
    input_schema: feedCaptureScene.input_schema, output_schema: feedCaptureScene.result_schema, output_type: feedCaptureScene.result_type } };
  const inputs: string[] = [];
  const plugin = definePlugin({ manifest: { schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.example.capture", version: "1.0.0", name: "捕捉判断示例",
    kind: "app", publisher: { publisher_id: "example", signature: "capture-fixture" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
    permissions: [], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [definition] },
    async start() { return { kind: "app", actions: [{ ...definition, handle: (_caller, args) => { inputs.push((args as { content: string }).content); return { status: "ok", suggested_behavior_ids: ["inbox.admit"] }; } }] }; } });
  const runtime = new PluginRuntime(new SqlitePluginRuntimeRepository(store.db), undefined, { actions: { registry: localHost.actionRegistry(reference), project_id: projectId } });
  const install = runtime.install({ definition: plugin, deployment: "local", grants: [] }).install;
  await runtime.start(install.install_id);
  const section = `[data-feed-out-rules="${source.source_id}"]`;
  const fill = (selector: string, value: string) => evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); node.value = ${JSON.stringify(value)}; node.dispatchEvent(new Event('input', { bubbles: true })); node.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  try {
    await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
    await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
    await waitFor("document.querySelector('[data-plugin-id=feed]')"); await click('[data-plugin-id="feed"]');
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
    assert.ok(!feed.listInboxEntries(DEMO_BOARD_ID).some(entry => entry.subject_id === item.item_id));
    await click(section + ' [data-feed-out-rule-create]');
    await waitFor(`Array.from(document.querySelectorAll('${section} [data-feed-out-rule-row]')).some(row => row.textContent.includes('需要跟进的消息')) || document.querySelector('${section} [data-feed-rule-status]')?.dataset.error === 'true'`);
    assert.notEqual(await evaluate(`document.querySelector('${section} [data-feed-rule-status]')?.dataset.error`), 'true', await evaluate(`document.querySelector('${section}')?.innerText`));
    const saved = feed.listOutRules(DEMO_BOARD_ID).find(rule => rule.name === "需要跟进的消息")!;
    assert.equal(saved.judgment?.capability_id, definition.capability_id); assert.ok(saved.judgment?.provider_id); assert.equal(saved.function_key, null);
    await evaluate(`document.querySelector('${section} [data-feed-out-rules-evaluate]').closest('details').open = true`);
    await click(section + ' [data-feed-out-rules-evaluate]');
    await waitFor(`!document.querySelector('${section} [data-feed-out-rules-evaluate]')?.disabled`);
    for (let i = 0; i < 30 && !feed.listInboxEntries(DEMO_BOARD_ID).some(entry => entry.subject_id === item.item_id); i++) await new Promise(resolve => setTimeout(resolve, 100));
    assert.ok(feed.listInboxEntries(DEMO_BOARD_ID).some(entry => entry.subject_id === item.item_id && entry.reason === "source_rule"));
    assert.equal(inputs.length, 2);
    await runtime.stop(install.install_id);
    await click(section + ' [data-feed-rule-mode="existing"]');
    await waitFor(`document.querySelector('${section} [data-feed-rule-binding-status]')?.textContent !== '已启用'`);
    assert.ok(feed.listOutRules(DEMO_BOARD_ID).find(rule => rule.rule_id === saved.rule_id)!.judgment, "stopping the provider preserves the exact saved reference");
    const usages = await localHost.sceneClient(reference).usages({ actor_id: "web-user", project_id: projectId, audience: "user", permissions: ["feed:read", "feed:write", "model:invoke"] });
    const usage = usages.find(usage => usage.binding_id === "feed.capture:" + saved.rule_id)!;
    assert.ok(usage.href);
    await navigate(() => command("Page.navigate", { url: origin + usage.href }, sessionId));
    await waitFor(`!document.querySelector('[data-feed-sources-dialog]')?.hidden && !document.querySelector('[data-feed-task-config="${source.source_id}"]')?.hidden`);
    await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
    await waitFor("document.documentElement.scrollWidth <= innerWidth + 1");
    await mkdir(new URL("../.impeccable/review/feed-capture/", import.meta.url), { recursive: true });
    await evaluate(`document.querySelector('${section} [data-feed-out-rule-row]').scrollIntoView({ block: 'center', behavior: 'instant' })`);
    const screenshot = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
    await writeFile(new URL("../.impeccable/review/feed-capture/unavailable-narrow.png", import.meta.url), Buffer.from(screenshot.data, "base64"));
  } catch (error) {
    t.diagnostic(await evaluate(`JSON.stringify({ section: document.querySelector('${section}')?.innerText, busy: document.querySelector('${section} [data-feed-rule-composer]')?.getAttribute('aria-busy') })`));
    t.diagnostic(JSON.stringify(feed.listOutRules(DEMO_BOARD_ID).filter(rule => rule.match.source_id === source.source_id)));
    throw error;
  } finally { await runtime.stop(install.install_id); }
});
