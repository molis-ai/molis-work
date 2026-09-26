import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { createLocalFeedApplication, createLocalFeedSourceService, DEMO_BOARD_ID, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

const captures = new URL("../.impeccable/review/home-talk-actions/", import.meta.url);
test("Home sends the actual text and subject to an explicit Session; drafts and uncertain delivery survive reload", { timeout: 80_000 }, async t => {
  let mode: "accept" | "delay" | "unknown" | "reject" = "accept";
  let release: ((value: unknown) => void) | undefined;
  const calls: Array<Record<string, unknown>> = [];
  const browser = await openGoalBrowser(t, "seeded", undefined, null, { async request(method, params) {
    if (method !== "turn/start") return method === "thread/turns/list" ? { data: [], nextCursor: null } : { thread: { id: params.threadId } };
    calls.push(params);
    if (mode === "delay") return new Promise(resolve => { release = resolve; });
    if (mode === "unknown") throw new Error("fixture connection lost");
    if (mode === "reject") throw Object.assign(new Error("fixture definite rejection"), { deliveryAccepted: false, retryable: true });
    return { turn: { id: `native-turn-${calls.length}` } };
  }, subscribe() { return () => undefined; } });
  if (!browser) return;
  const { localHost, store, projectId, command, sessionId, evaluate, waitFor, click, navigate, origin, reloadPage } = browser;
  assert.ok(localHost); assert.ok(projectId);
  const resources = await localHost.sessionResources();
  const first = resources.registry.createSession({ runtime_id: "codex", native_runtime_session_id: "first-unrelated", project_id: projectId, title: "其他工作会话", actor_id: "browser-test", user_confirmed: true });
  const chosen = resources.registry.createSession({ runtime_id: "codex", native_runtime_session_id: "chosen-target", project_id: projectId, current_goal_id: "review-goal", title: "登录问题排查", actor_id: "browser-test", user_confirmed: true });
  const feed = createLocalFeedApplication(store.db);
  const source = createLocalFeedSourceService(store.db, DEMO_BOARD_ID).register({ kind: "research_library", repository: "molis-ai/research-library", research_source: "home-talk-browser" }).source;
  const item = feed.ingestItem({ source, externalId: "talk-browser", title: "用户反馈：重新登录后还是看不到项目", summary: "需要核对登录流程", body: "这条材料的正文含有需要保留的上下文。\n请结合实际问题分析。", occurredAt: new Date().toISOString(), attention: false }).item;
  const item2 = feed.ingestItem({ source, externalId: "talk-browser-2", title: "另一条材料", summary: "另一个事项", body: "第二份独立正文", occurredAt: new Date().toISOString(), attention: false }).item;
  await feed.flushPendingJudgments();
  await localHost.withProject(molisWorkHostProjectReference({ databasePath: browser.databasePath, boardId: DEMO_BOARD_ID, projectId }), () => undefined);
  const event = (id: string) => `[data-home-subject-kind="feed_item"][data-home-subject-id="${id}"]`;
  const textarea = '[data-home-talk-form] textarea';
  const send = '[data-home-talk-form] [type=submit]';
  const input = async (text: string) => {
    await click(textarea); await command("Input.insertText", { text }, sessionId);
  };
  const open = async (id: string) => {
    await waitFor(`!!document.querySelector(${JSON.stringify(event(id))})`);
    await click(event(id)); await click('[data-home-open-talk]');
    try { await waitFor("!!document.querySelector('[name=talk-session]:not(:disabled)') || !!document.querySelector('[data-talk-action]')"); }
    catch { throw new Error(await evaluate<string>("JSON.stringify({errors:window.__talkErrors,dock:document.querySelector('[data-work-surface=home]')?.dataset.dock,talk:document.querySelector('[data-home-talk-body]')?.innerHTML,form:document.querySelector('[data-home-talk-form]')?.outerHTML})")); }
  };
  const screenshot = async (name: string) => { await evaluate("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))"); const shot = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId); await writeFile(new URL(name + ".png", captures), Buffer.from(shot.data, "base64")); };
  try {
    await mkdir(captures, { recursive: true });
    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
    await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    await command("Page.addScriptToEvaluateOnNewDocument", { source: "window.__talkErrors=[]; addEventListener('error',e=>window.__talkErrors.push(e.message)); addEventListener('unhandledrejection',e=>window.__talkErrors.push(String(e.reason)))" }, sessionId);
    await navigate(() => command("Page.navigate", { url: origin + "/projects/" + projectId + "/" }, sessionId));
    try { await waitFor(`!!document.querySelector(${JSON.stringify(event(item.item_id))})`); }
    catch { throw new Error(await evaluate<string>("JSON.stringify({errors:window.__talkErrors,events:[...document.querySelectorAll('[data-home-open-event]')].map(e=>e.dataset.homeOpenEvent),home:document.querySelector('[data-home-list]')?.textContent})")); }
    await open(item.item_id);
    assert.equal(await evaluate("document.querySelector('[name=talk-session]:checked')?.value || null"), null, "no arbitrary first Session");
    await input("原事项草稿");
    assert.equal(await evaluate(`document.querySelector('${send}').disabled`), true);
    await screenshot("desktop-choose-session");
    await click('[data-home-close-talk]'); await click('[data-home-close-event]');
    await open(item2.item_id);
    assert.equal(await evaluate(`document.querySelector('${textarea}').value`), "");
    await input("另一事项草稿");
    await reloadPage(); await open(item.item_id);
    assert.equal(await evaluate(`document.querySelector('${textarea}').value`), "原事项草稿");
    await click(`[name=talk-session][value="${chosen.session_id}"]`);
    await evaluate(`document.querySelector('${textarea}').select()`);
    await command("Input.insertText", { text: "请核对这条反馈，并保留换行。\n这是第二行。" }, sessionId);
    await click('.home-talk-context summary');
    assert.match(await evaluate<string>("document.querySelector('.home-talk-context pre').textContent"), /这条材料的正文/);
    await screenshot("desktop-context");
    assert.equal(await evaluate(`document.querySelector('${send}').disabled`), false, "an explicit target and nonempty draft enable sending");
    mode = "delay"; await click(send);
    try { await waitFor("document.querySelector('.home-talk-status').textContent.includes('正在发送')"); }
    catch { throw new Error(await evaluate<string>("JSON.stringify({errors:window.__talkErrors,status:document.querySelector('.home-talk-status')?.textContent,error:document.querySelector('.home-talk-error')?.textContent,disabled:document.querySelector('[data-home-talk-form] [type=submit]').disabled})")); }
    await click('[data-home-close-talk]'); await click('[data-home-open-talk]');
    assert.equal(await evaluate(`document.querySelector('${textarea}').disabled`), true);
    // Observe the independent server receipt while the original native call is still in flight.
    await reloadPage(); await open(item.item_id);
    await waitFor("document.querySelector('.home-talk-status').textContent.includes('尚未确认')");
    assert.equal(calls.length, 1); assert.equal(calls[0]!.threadId, "chosen-target");
    const sent = (calls[0]!.input as Array<{ text: string }>)[0]!.text;
    assert.match(sent, /这条材料的正文/); assert.match(sent, /用户消息：\n请核对这条反馈，并保留换行。\n这是第二行。/);
    assert.ok(!sent.includes("第二份独立正文"));
    release!({ turn: { id: "delayed-native-turn" } }); release = undefined;
    await click('[data-talk-action=check]');
    await waitFor("document.querySelector('.home-talk-status').textContent.includes('已被会话接收')");
    assert.equal(resources.registry.eventCount(chosen.session_id), 1); assert.equal(resources.registry.eventCount(first.session_id), 0);
    await screenshot("desktop-accepted");
    await click('[data-talk-action=new]');
    await waitFor("!document.querySelector('[data-home-talk-form] textarea').disabled");
    await input("结果不确定的消息"); mode = "unknown"; await click(send);
    await waitFor("!!document.querySelector('[data-talk-action=check]')");
    assert.equal(calls.length, 2);
    await reloadPage(); await open(item.item_id);
    await waitFor("document.querySelector('.home-talk-status').textContent.includes('尚未确认')");
    assert.equal(await evaluate("!!document.querySelector('[data-talk-action=retry], [data-talk-action=new], [data-talk-action=edit]')"), false);
    await click('[data-talk-action=check]');
    await waitFor("document.querySelector('.home-talk-status').textContent.includes('尚未确认')");
    assert.equal(calls.length, 2, "checking and refresh cannot repeat an unknown send");
    await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
    await screenshot("mobile-uncertain");
    const bounds = await evaluate<any>("(()=>{const p=document.querySelector('[data-home-talk]'),r=p.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,overflow:document.documentElement.scrollWidth>innerWidth}})()");
    assert.ok(bounds.left >= 0 && bounds.right <= 391 && bounds.top >= 0 && bounds.bottom <= 844, JSON.stringify(bounds)); assert.equal(bounds.overflow, false);
    await click('[data-home-close-talk]'); await click('[data-home-close-event]');
    await open(item2.item_id);
    assert.equal(await evaluate(`document.querySelector('${textarea}').value`), "另一事项草稿");
    await click(`[name=talk-session][value="${first.session_id}"]`);
    mode = "reject"; await click(send);
    await waitFor("!!document.querySelector('[data-talk-action=retry]')");
    await screenshot("mobile-definite-failure");
    mode = "accept"; await click('[data-talk-action=retry]');
    await waitFor("document.querySelector('.home-talk-status').textContent.includes('已被会话接收')");
    assert.equal(calls.length, 4); assert.equal(resources.registry.eventCount(first.session_id), 1);
    await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" }, sessionId);
    await waitFor("document.querySelector('[data-home-talk]').hidden");
    await waitFor("document.activeElement.matches('[data-home-open-talk]')");
    await click('[data-home-close-event]');
    await click(`[data-home-subject-kind="session"][data-home-subject-id="${chosen.session_id}"]`); await click('[data-home-open-talk]');
    try { await waitFor("!!document.querySelector('[name=talk-session]:checked')"); }
    catch { throw new Error(await evaluate<string>("JSON.stringify({errors:window.__talkErrors,dock:document.querySelector('[data-work-surface=home]')?.dataset.dock,title:document.querySelector('[data-home-detail-body] h2')?.textContent,talk:document.querySelector('[data-home-talk-body]')?.innerHTML,form:document.querySelector('[data-home-talk-form]')?.outerHTML})")); }
    assert.deepEqual(await evaluate("[...document.querySelectorAll('[name=talk-session]')].map(e=>({id:e.value,selected:e.checked}))"), [{ id: chosen.session_id, selected: true }]);
    await screenshot("mobile-exact-session");
    await click('[data-home-close-talk]'); await click('[data-home-close-event]');
    feed.linkGoal(DEMO_BOARD_ID, item2.item_id, "goal-without-session", "processing");
    await open(item2.item_id); await waitFor("!!document.querySelector('[data-talk-action=new]')");
    await click('[data-talk-action=new]');
    await waitFor("!!document.querySelector('[data-talk-action=sessions]')");
    assert.equal(await evaluate("document.querySelectorAll('[name=talk-session]').length"), 0);
    assert.equal(await evaluate(`document.querySelector('${send}').disabled`), true);
    await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 650, deviceScaleFactor: 1, mobile: true }, sessionId);
    await screenshot("mobile-no-associated-session");
    assert.equal(await evaluate("(()=>{const r=document.querySelector('[data-home-talk]').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.right<=innerWidth})()"), true);
  } finally { release?.({ turn: { id: "cleanup" } }); }
});
