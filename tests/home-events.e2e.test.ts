import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { molisWorkHostProjectReference, DEMO_BOARD_ID } from "@molis-ai/molis-work-app-local-host";
import { PluginRuntime, SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { definePlugin, defineHomeEventsAction, defineSubjectContextAction, subjectContext, defineSubjectOffersAction } from "../packages/plugin-sdk/src/index.js";
import type { ActionDefinition, SubjectOffersInput } from "@molis-ai/molis-work-contracts/platform/actions";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

test("an unknown plugin owns its Home event, context and real action; failure and lifecycle refresh stay accurate", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded", undefined, null); if (!browser) return;
  const { localHost, store, projectId, command, sessionId, evaluate, waitFor, click, navigate, origin, reloadPage } = browser;
  assert.ok(localHost); assert.ok(projectId);
  const reference = molisWorkHostProjectReference({ databasePath: browser.databasePath, boardId: DEMO_BOARD_ID, projectId });
  store.db.exec("CREATE TABLE fixture_home_notes (id TEXT PRIMARY KEY, content TEXT, done INTEGER, revision INTEGER)");
  store.db.prepare("INSERT INTO fixture_home_notes VALUES (?, ?, 0, 1)").run("own-note", "插件自己的原始记录");
  const read = () => store.db.prepare("SELECT content, done, revision FROM fixture_home_notes WHERE id = ?").get("own-note") as { content: string; done: number; revision: number };
  const subject = { kind: "fixture-note", id: "own-note" };
  const events = defineHomeEventsAction("unknown.notes.home", [subject.kind], "笔记首页事项", ["fixture:read"]);
  const context = defineSubjectContextAction("unknown.notes.context", subject.kind, "笔记上下文", ["fixture:read"]);
  const offers = defineSubjectOffersAction("unknown.notes.offers", [subject.kind], "笔记动作", ["fixture:read"]);
  const complete: ActionDefinition = { capability_id: "unknown.notes.complete", version: 1, operation: "command", action: {
    title: "确认记录", description: "更新插件自己的原记录", kind: "operation", scope: "project", audiences: ["user"], permissions: ["fixture:write"], subject_kinds: [subject.kind],
    input_schema: { type: "object", properties: { revision: { type: "integer" }, request_id: { type: "string" } }, required: ["revision", "request_id"], additionalProperties: false },
    output_schema: { type: "object", properties: { done: { type: "boolean" } }, required: ["done"], additionalProperties: false } } };
  let fail = false, writes = 0;
  const plugin = definePlugin({ manifest: { schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.example.own-home-events", version: "1.0.0", name: "自有笔记",
    kind: "app", publisher: { publisher_id: "example", signature: "home-events" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
    permissions: ["fixture:read", "fixture:write"].map(permission => ({ permission, required: false, reason: "操作原笔记" })), capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [events, context, offers, complete] },
    async start() { return { kind: "app", actions: [
      { ...events, handle: () => {
        if (fail) throw new Error("private provider diagnostic must not appear in Home");
        const note = read(); return { source: { surface: "fixture-notes", title: "自有笔记", icon: "inbox" }, events: note.done ? [] : [{ event_id: "own-event", subject,
          occurred_at: new Date().toISOString(), placement: "today", category: "personal", title: "新插件提供的首页事项", summary: "由插件管理的记录", content: note.content, facts: [["版本", String(note.revision)]], needs_attention: true, open: null }] };
      } },
      { ...context, handle: () => subjectContext({ subject, revision: String(read().revision), title: "新插件提供的首页事项", content: read().content, goal_ids: [], session_id: null }) },
      { ...offers, handle: (_caller, value) => ({ offers: read().done || (value as SubjectOffersInput).subject.id !== subject.id ? [] : [{ offer_id: "complete", title: "确认记录", action: { capability_id: complete.capability_id, version: 1 }, input: { revision: read().revision, request_id: (value as SubjectOffersInput).request_id } }] }) },
      { ...complete, handle: (caller, input) => {
        assert.equal(caller.project_id, projectId);
        assert.equal(store.db.prepare("UPDATE fixture_home_notes SET done = 1, revision = revision + 1 WHERE id = ? AND revision = ? AND done = 0").run(subject.id, (input as { revision: number }).revision).changes, 1);
        writes++; return { done: true };
      } },
    ] }; } });
  const runtime = new PluginRuntime(new SqlitePluginRuntimeRepository(store.db), undefined, { actions: { registry: localHost.actionRegistry(reference), project_id: projectId } });
  const install = runtime.install({ definition: plugin, deployment: "local", grants: ["fixture:read", "fixture:write"] }).install;
  const selector = '[data-home-subject-kind="fixture-note"][data-home-subject-id="own-note"]';
  const captures = new URL("../.impeccable/review/home-plugin-events/", import.meta.url);
  const capture = async (name: string) => { await mkdir(captures, { recursive: true }); const shot = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId); await writeFile(new URL(name + ".png", captures), Buffer.from(shot.data, "base64")); };
  try {
    await runtime.start(install.install_id);
    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
    await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    await command("Page.addScriptToEvaluateOnNewDocument", { source: "window.__homeRequests=[];const previous=window.fetch;window.fetch=async(url,options)=>{const response=await previous(url,options);if(String(url).includes('/api/home/'))window.__homeRequests.push({url:String(url),status:response.status,body:await response.clone().text()});return response;}" }, sessionId);
    await navigate(() => command("Page.navigate", { url: origin + "/projects/" + projectId + "/" }, sessionId));
    await waitFor(`!!document.querySelector(${JSON.stringify(selector)})`, 12000);
    await click(selector);
    try { await waitFor("document.querySelector('[data-home-offer]')?.textContent==='确认记录'", 12000); }
    catch { await capture("failed-prepare"); throw new Error(await evaluate<string>("JSON.stringify({requests:window.__homeRequests.map(r=>({...r,body:r.body.slice(0,1200)})),offers:document.querySelector('[data-home-offers]')?.textContent,home:document.querySelector('[data-work-surface=home]')?.dataset,detail:document.querySelector('[data-home-detail-body]')?.textContent})")); }
    assert.match(await evaluate<string>("document.querySelector('[data-home-detail-body]').textContent"), /插件自己的原始记录/);
    assert.equal(await evaluate("!!document.querySelector('[data-home-open-target]')"), false, "no invented navigation when the plugin supplies none");
    // Keep an old response in flight while a later refresh is requested. The later facts must win,
    // without piling up concurrent requests or leaving Home permanently in its loading state.
    await evaluate(`(() => {
      const previous = window.fetch; window.__homeReadCount = 0;
      const held = new Promise(resolve => { window.__releaseHomeRead = resolve; });
      window.fetch = async (url, options) => {
        const isEvents = String(url).endsWith('/api/home/events');
        const first = isEvents && ++window.__homeReadCount === 1;
        const response = await previous(url, options);
        if (first) { window.__homeReadHeld = true; await held; }
        return response;
      };
      document.dispatchEvent(new Event('visibilitychange'));
    })()`);
    await waitFor("window.__homeReadHeld === true", 12000);
    store.db.prepare("UPDATE fixture_home_notes SET content = ?, revision = revision + 1 WHERE id = ?").run("刷新后的插件原文", subject.id);
    await evaluate("document.dispatchEvent(new Event('visibilitychange'));document.dispatchEvent(new Event('visibilitychange'))");
    assert.equal(await evaluate("window.__homeReadCount"), 1);
    await evaluate("window.__releaseHomeRead()");
    await waitFor("document.querySelector('[data-home-detail-body]')?.textContent.includes('刷新后的插件原文')", 12000);
    assert.ok(await evaluate<number>("window.__homeReadCount") >= 2);
    await capture("desktop-plugin-event");
    await click('[data-home-open-talk]');
    await waitFor("document.querySelector('[data-home-talk-body]')?.textContent.includes('当前项目还没有可接收消息的会话')");
    assert.match(await evaluate<string>("document.querySelector('.home-talk-context').textContent"), /刷新后的插件原文/);
    await click('[data-home-close-talk]');
    await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
    await command("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 }, sessionId);
    assert.ok(await evaluate<number>("document.querySelector('[data-home-offer]').getBoundingClientRect().height") >= 44);
    await capture("mobile-plugin-event");
    assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"), true);
    await waitFor("!!document.querySelector('[data-home-offer]:not(:disabled)')");
    await click('[data-home-offer]'); await waitFor(`!document.querySelector(${JSON.stringify(selector)})`);
    assert.equal(writes, 1); assert.equal(read().done, 1); assert.equal(read().revision, 3);
    store.db.prepare("UPDATE fixture_home_notes SET done = 0, revision = revision + 1 WHERE id = ?").run(subject.id);
    fail = true; await reloadPage(); await waitFor("document.querySelector('[data-home-event-status]')?.textContent.includes('笔记首页事项')", 12000);
    assert.equal(await evaluate(`!!document.querySelector(${JSON.stringify(selector)})`), false);
    assert.equal(await evaluate("document.querySelector('[data-home-event-status]').textContent.includes('private provider diagnostic')"), false);
    assert.ok(await evaluate<number>("document.querySelector('[data-home-events-reload]').getBoundingClientRect().height") >= 44);
    await capture("mobile-source-error");
    fail = false; await click('[data-home-events-reload]'); await waitFor(`!!document.querySelector(${JSON.stringify(selector)})`, 12000);
    await runtime.stop(install.install_id); await reloadPage();
    await waitFor("!document.querySelector('[data-home-hero]')?.textContent.includes('正在读取事项')", 12000);
    assert.equal(await evaluate(`!!document.querySelector(${JSON.stringify(selector)})`), false);
    assert.equal(writes, 1);
  } finally { await runtime.stop(install.install_id); }
});
