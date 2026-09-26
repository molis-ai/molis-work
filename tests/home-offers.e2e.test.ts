import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { createLocalFeedApplication, createLocalFeedSourceService, DEMO_BOARD_ID, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { PluginRuntime, SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { definePlugin, defineSubjectOffersAction } from "../packages/plugin-sdk/src/index.js";
import type { ActionDefinition, SubjectOffersInput } from "@molis-ai/molis-work-contracts/platform/actions";
import { subjectOfferChoiceKey } from "@molis-ai/molis-work-kernel";
import { withFunctionsService } from "../apps/local-host/src/functions-host.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
const captures = new URL("../.impeccable/review/home-offer-actions/", import.meta.url);

test("Home renders and executes unknown plugin offers and Inbox status through the common service", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded", undefined, null); if (!browser) return;
  const { localHost, store, projectId, command, sessionId, evaluate, waitFor, click, navigate, origin, reloadPage } = browser;
  assert.ok(localHost); assert.ok(projectId);
  const reference = molisWorkHostProjectReference({ databasePath: browser.databasePath, boardId: DEMO_BOARD_ID, projectId });
  const feed = createLocalFeedApplication(store.db);
  const source = createLocalFeedSourceService(store.db, DEMO_BOARD_ID).register({ kind: "research_library", repository: "molis-ai/research-library", research_source: "offers-browser" }).source;
  const item = feed.ingestItem({ source, externalId: "unknown-offer", title: "新插件可以处理的材料", summary: "检查插件自己的真实结果", body: "未核查的原始材料", occurredAt: new Date().toISOString(), attention: false }).item;
  const inboxItem = feed.ingestItem({ source, externalId: "inbox-offer", title: "完成这条 Inbox 事项", summary: "更新原始 Inbox 状态", body: "Inbox 正文", occurredAt: new Date().toISOString(), attention: false }).item;
  const entry = feed.ensureInboxEntryForFeedItem(DEMO_BOARD_ID, inboxItem.item_id, "manual").entry;
  await feed.flushPendingJudgments();
  store.db.exec("CREATE TABLE fixture_home_tags (id TEXT PRIMARY KEY, tag TEXT NOT NULL, revision INTEGER NOT NULL)");
  store.db.prepare("INSERT INTO fixture_home_tags VALUES (?, '', 1)").run(item.item_id);
  const read = () => store.db.prepare("SELECT tag, revision FROM fixture_home_tags WHERE id = ?").get(item.item_id) as { tag: string; revision: number };
  const offers = defineSubjectOffersAction("unknown.browser.offers", ["feed_item"], "材料标记", ["fixture:read"], [
    { offer_id: "unknown.mark-review", title: "标记待核查", action: { capability_id: "unknown.browser.tag", version: 1 } },
  ]);
  const write: ActionDefinition = { capability_id: "unknown.browser.tag", version: 1, operation: "command", action: {
    title: "标记材料", description: "更新本插件的实际标记", kind: "operation", scope: "project", audiences: ["user"], permissions: ["fixture:write"], subject_kinds: ["feed_item"],
    input_schema: { type: "object", properties: { id: { type: "string" }, revision: { type: "integer" }, tag: { type: "string" }, request_id: { type: "string" } }, required: ["id", "revision", "tag", "request_id"], additionalProperties: false },
    output_schema: { type: "object", properties: { tag: { type: "string" }, revision: { type: "integer" } }, required: ["tag", "revision"] } } };
  let writes = 0;
  let releaseOffers!: () => void;
  const offersReady = new Promise<void>(resolve => { releaseOffers = resolve; });
  const plugin = definePlugin({ manifest: { schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.example.browser-offers", version: "1.0.0", name: "材料标记",
    kind: "app", publisher: { publisher_id: "example", signature: "example-browser-offers" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
    permissions: ["fixture:read", "fixture:write"].map(permission => ({ permission, required: false, reason: "处理自己的材料标记" })), capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [offers, write] },
    async start() { return { kind: "app", actions: [{ ...offers, handle: async (_caller, value) => {
      await offersReady;
      const input = value as SubjectOffersInput;
      if (input.subject.id !== item.item_id || read().tag) return { offers: [] };
      return { offers: [{ offer_id: "unknown.mark-review", title: "标记待核查", action: { capability_id: write.capability_id, version: 1 }, input: { id: item.item_id, revision: read().revision, tag: "needs-review", request_id: input.request_id } }] };
    } }, { ...write, handle: (caller, value) => {
      assert.equal(caller.actor_id, "web-user"); assert.equal(caller.project_id, projectId);
      const input = value as { id: string; revision: number; tag: string };
      const result = store.db.prepare("UPDATE fixture_home_tags SET tag = ?, revision = revision + 1 WHERE id = ? AND revision = ?").run(input.tag, input.id, input.revision);
      assert.equal(result.changes, 1); writes++; return read();
    } }] }; } });
  const runtime = new PluginRuntime(new SqlitePluginRuntimeRepository(store.db), undefined, { actions: { registry: localHost.actionRegistry(reference), project_id: projectId } });
  const installed = runtime.install({ definition: plugin, deployment: "local", grants: ["fixture:read", "fixture:write"] }).install;
  await runtime.start(installed.install_id);
  const capture = async (name: string) => { const shot = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId); await writeFile(new URL(name + ".png", captures), Buffer.from(shot.data, "base64")); };
  try {
    await mkdir(captures, { recursive: true });
    await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
    const choiceKey = subjectOfferChoiceKey({ ...offers, provider_id: installed.install_id }, offers.action.subject_offer_choices![0]!);
    const draft = withFunctionsService(browser.homeDirectory, service => {
      const created = service.createChoice({ name: "材料核查规则", function_key: "browser_offer_rule" });
      return service.updateDraft(created.id, { instructions: "保留原条件", scene_id: "home.dock", subject_kinds: ["feed_item"],
        criteria: [{ key: "yes", description: "需要核查" }, { key: "no", description: "稍后核查" }], scene_map: { yes: choiceKey, no: choiceKey } });
    });
    await navigate(() => command("Page.navigate", { url: origin + "/capabilities/rules?project=" + projectId + "&rule=" + draft.id }, sessionId));
    await waitFor(`document.querySelector('[data-map-key="yes"]')?.value === '${choiceKey}'`);
    assert.ok(await evaluate(`Array.from(document.querySelector('[data-map-key="yes"]').options).some(option => option.value === '${choiceKey}' && option.textContent === '标记待核查')`));
    await click('[data-functions-step="fn"]');
    await capture("rules-declared-choice");
    await runtime.stop(installed.install_id);
    await reloadPage();
    await waitFor(`document.querySelector('[data-map-key="yes"]')?.selectedOptions[0]?.textContent.includes('原动作不可用')`);
    assert.equal(await evaluate("document.querySelector('[data-map-key=\"yes\"]').value"), choiceKey);
    await click('[data-functions-step="fn"]');
    await capture("rules-missing-choice");
    await evaluate(`(() => { const input = document.querySelector('[data-functions-instructions]'); input.value = '保留原条件，补充一句'; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await waitFor("document.querySelector('[data-functions-save-status]')?.textContent.includes('已保存')");
    const preserved = withFunctionsService(browser.homeDirectory, service => service.get(draft.id));
    assert.equal(preserved.instructions, "保留原条件，补充一句");
    assert.deepEqual(preserved.scene_map, draft.scene_map, "editing another field must not silently delete unavailable action references");
    await runtime.start(installed.install_id);
    await command("Page.addScriptToEvaluateOnNewDocument", { source: "window.__homeRequests=[]; const originalFetch=window.fetch; window.fetch=(url,options)=>{window.__homeRequests.push(String(url));return originalFetch(url,options)}" }, sessionId);
    await navigate(() => command("Page.navigate", { url: origin + "/projects/" + projectId + "/" }, sessionId));
    await waitFor(`!!document.querySelector('[data-home-subject-kind="feed_item"][data-home-subject-id="${item.item_id}"]')`);
    await click(`[data-home-subject-kind="feed_item"][data-home-subject-id="${item.item_id}"]`);
    await waitFor("document.querySelector('[data-home-offers]')?.textContent.includes('正在查找')");
    const talkTop = await evaluate<number>("document.querySelector('[data-home-open-talk]').getBoundingClientRect().top");
    releaseOffers();
    await waitFor("document.querySelector('[data-home-offer]')?.textContent==='标记待核查' && !document.querySelector('[data-home-offer]').disabled");
    assert.ok(Math.abs(await evaluate<number>("document.querySelector('[data-home-open-talk]').getBoundingClientRect().top") - talkTop) < 1, "async offers keep the Talk button under the pointer");
    await capture("desktop-unknown-action");
    await click('[data-home-offer]');
    try { await waitFor("!!document.querySelector('.home-offers-result') && !document.querySelector('[data-home-offer]')"); }
    catch { throw new Error(JSON.stringify({ writes, data: read(), ui: await evaluate("document.querySelector('[data-home-offers]')?.textContent"), requests: await evaluate("window.__homeRequests.filter(p=>p.includes('/api/home/actions/'))") })); }
    assert.equal(writes, 1); assert.deepEqual(read(), { tag: "needs-review", revision: 2 });
    await click('.home-offers-result summary'); await capture("desktop-real-result");
    await click('[data-home-close-event]');
    await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
    await command("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 }, sessionId);
    await click(`[data-home-subject-kind="inbox_entry"][data-home-subject-id="${entry.entry_id}"]`);
    await waitFor("document.querySelectorAll('[data-home-offer]').length===2 && !document.querySelector('[data-home-offer]').disabled");
    assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-home-offer]')].map(e=>e.textContent)"), ["做完了", "忽略"]);
    assert.equal(await evaluate("!!document.querySelector('[data-home-done], [data-home-dismiss]')"), false);
    assert.equal(await evaluate("[...document.querySelectorAll('[data-home-offer]')].every(button=>button.getBoundingClientRect().height>=44)"), true);
    await capture("mobile-inbox-actions");
    await click('[data-home-offer="0"]');
    await waitFor(`!document.querySelector('[data-home-subject-kind="inbox_entry"][data-home-subject-id="${entry.entry_id}"]') && document.querySelector('[data-work-surface="home"]')?.dataset.event === 'off'`);
    assert.equal(feed.getInboxEntry(DEMO_BOARD_ID, entry.entry_id).status, "done");
    assert.equal(feed.getInboxEntry(DEMO_BOARD_ID, entry.entry_id).revision, entry.revision + 1);
    const requests = await evaluate<string[]>("window.__homeRequests");
    assert.ok(requests.some(path => path.endsWith('/api/home/actions/execute')));
    assert.ok(!requests.some(path => path.includes('/api/inbox/entries/') && path.endsWith('/status')));
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
    await capture("mobile-inbox-complete");
    // The owner makes this material actionable again. Lose the next response after the real write.
    store.db.prepare("UPDATE fixture_home_tags SET tag = '', revision = revision + 1 WHERE id = ?").run(item.item_id);
    await reloadPage();
    await waitFor(`!!document.querySelector('[data-home-subject-kind="feed_item"][data-home-subject-id="${item.item_id}"]')`);
    await click(`[data-home-subject-kind="feed_item"][data-home-subject-id="${item.item_id}"]`);
    await waitFor("!!document.querySelector('[data-home-offer]:not(:disabled)')");
    await evaluate("(()=>{const previous=window.fetch;window.fetch=async(url,options)=>{const response=await previous(url,options);if(String(url).endsWith('/api/home/actions/execute'))throw new TypeError('fixture response lost');return response;}})()");
    await click('[data-home-offer]');
    await waitFor("document.querySelector('[data-home-offers]')?.textContent.includes('执行结果尚未确认')");
    assert.equal(writes, 2); assert.deepEqual(read(), { tag: "needs-review", revision: 4 });
    assert.equal(await evaluate("!!document.querySelector('[data-home-offer]:not(:disabled)')"), false);
    await capture("mobile-response-unknown");
    await runtime.stop(installed.install_id);
    await reloadPage();
    await waitFor(`!!document.querySelector('[data-home-subject-kind="feed_item"][data-home-subject-id="${item.item_id}"]')`);
    await click(`[data-home-subject-kind="feed_item"][data-home-subject-id="${item.item_id}"]`);
    await waitFor("document.querySelector('[data-home-offers]')?.textContent.includes('执行结果尚未确认') && !document.querySelector('[data-home-offers]').textContent.includes('正在查找')");
    assert.equal(writes, 2, "stopping the provider never converts uncertainty into a retry");
    await runtime.start(installed.install_id);
    await click('[data-home-offers-reload]');
    await waitFor("document.querySelector('[data-home-offers]')?.textContent === ''");
    assert.equal(writes, 2, "the owner confirms the old offer no longer applies without resubmitting it");
    assert.equal(await evaluate("Object.keys(sessionStorage).some(key=>key.startsWith('molis.home-action:'))"), false);
  } finally { releaseOffers(); await runtime.stop(installed.install_id); }
});
