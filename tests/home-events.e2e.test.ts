import { ISOLATED_HOST_IDS } from "./fixtures/isolated-host.js";
import assert from "node:assert/strict";
import test from "node:test";
import { molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { PluginRuntime, SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { definePlugin, defineHomeEventsAction, defineSubjectContextAction, subjectContext, defineSubjectOffersAction } from "@molis-ai/molis-work-plugin-sdk";
import type { ActionDefinition, ActionReference, HomeEventView, SubjectActionOffer, SubjectOffersInput } from "@molis-ai/molis-work-contracts/platform/actions";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

test("an unknown plugin keeps its Home Events and contextual actions while the visible Home no longer requests Events", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded", undefined, null); if (!browser) return;
  const { localHost, store, projectId, command, sessionId, evaluate, waitFor, navigate, origin, web } = browser;
  assert.ok(localHost); assert.ok(projectId);
  const reference = molisWorkHostProjectReference({ databasePath: browser.databasePath, projectId });
  store.db.exec("CREATE TABLE fixture_home_notes (id TEXT PRIMARY KEY, content TEXT, done INTEGER, revision INTEGER)");
  store.db.prepare("INSERT INTO fixture_home_notes VALUES (?, ?, 0, 1)").run("own-note", "插件自己的原始记录");
  const read = () => store.db.prepare("SELECT content, done, revision FROM fixture_home_notes WHERE id = ?").get("own-note") as { content: string; done: number; revision: number };
  const subject = { kind: "fixture-note", id: "own-note" };
  const events = defineHomeEventsAction("unknown.notes.home", 1, [subject.kind], "笔记首页事项", ["fixture:read"]);
  const context = defineSubjectContextAction("unknown.notes.context", 1, subject.kind, "笔记上下文", ["fixture:read"]);
  const offers = defineSubjectOffersAction("unknown.notes.offers", 1, [subject.kind], "笔记动作", ["fixture:read"]);
  const complete: ActionDefinition = { capability_id: "unknown.notes.complete", version: 1, operation: "command", action: {
    title: "确认记录", description: "更新插件自己的原记录", kind: "operation", scope: "project", audiences: ["user"], permissions: ["fixture:write"], subject_kinds: [subject.kind],
    input_schema: { type: "object", properties: { revision: { type: "integer" }, request_id: { type: "string" } }, required: ["revision", "request_id"], additionalProperties: false },
    output_schema: { type: "object", properties: { done: { type: "boolean" } }, required: ["done"], additionalProperties: false } } };
  let fail = false, writes = 0;
  const plugin = definePlugin({ manifest: { schema_version: 1, host_api_version: 1, plugin_id: "io.molis.work.example.own-home-events", version: "1.0.0", name: "自有笔记",
    kind: "app", publisher: { publisher_id: "example", signature: "home-events" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
    permissions: ["fixture:read", "fixture:write"].map(permission => ({ permission, required: false, reason: "操作原笔记" })), capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [events, context, offers, complete] },
    async start() { return { kind: "app", actions: [
      { ...events, handle: () => {
        if (fail) throw new Error("private provider diagnostic must not appear in Home");
        const note = read(); return { source: { surface: "fixture-notes", title: "自有笔记", icon: "inbox" }, events: note.done ? [] : [{ event_id: "own-event", subject,
          occurred_at: new Date().toISOString(), placement: "today", category: "personal", title: "新插件提供的首页事项", summary: "由插件管理的记录", content: note.content, facts: [["版本", String(note.revision)]], needs_attention: true, open: null }] };
      } },
      { ...context, handle: () => subjectContext({ subject, revision: String(read().revision), title: "新插件提供的首页事项", content: read().content, goal_ids: [] }) },
      { ...offers, handle: (_caller, value) => ({ offers: read().done || (value as SubjectOffersInput).subject.id !== subject.id ? [] : [{ offer_id: "complete", title: "确认记录", action: { capability_id: complete.capability_id, version: 1 }, input: { revision: read().revision, request_id: (value as SubjectOffersInput).request_id } }] }) },
      { ...complete, handle: (caller, input) => {
        assert.equal(caller.project_id, projectId);
        assert.equal(store.db.prepare("UPDATE fixture_home_notes SET done = 1, revision = revision + 1 WHERE id = ? AND revision = ? AND done = 0").run(subject.id, (input as { revision: number }).revision).changes, 1);
        writes++; return { done: true };
      } },
    ] }; } });
  const runtime = new PluginRuntime(new SqlitePluginRuntimeRepository(store.db), undefined, { hostIds: ISOLATED_HOST_IDS, actions: { registry: localHost.actionRegistry(reference), project_id: projectId } });
  const install = runtime.install({ trust: { level: "unsigned" }, definition: plugin, deployment: "local", grants: ["fixture:read", "fixture:write"] }).install;
  const prefix = "/projects/" + projectId;
  const window = { from: new Date(Date.now() - 60_000).toISOString(), to: new Date(Date.now() + 60_000).toISOString(), now: new Date().toISOString() };
  const eventRead = () => web.post<{ events: HomeEventView[]; issues: string[] }>(prefix + "/api/home/events", window);
  const ownEvent = (reply: Awaited<ReturnType<typeof eventRead>>) => reply.events.find(event => event.subject.kind === subject.kind && event.subject.id === subject.id);
  const request_id = crypto.randomUUID();
  try {
    await runtime.start(install.install_id);
    await command("Page.addScriptToEvaluateOnNewDocument", { source: `window.homeRequests=[];
      const original=window.fetch;window.fetch=(url,options)=>{window.homeRequests.push(String(url));return original(url,options)}` }, sessionId);
    await navigate(() => command("Page.navigate", { url: origin + prefix + "/" }, sessionId));
    await waitFor("document.querySelector('[data-home-card]')");
    assert.equal(await evaluate("homeRequests.some(path=>path.endsWith('/api/home/events'))"), false);
    assert.equal(await evaluate("document.querySelector('[data-home-subject-kind=fixture-note]')"), null, "a separate Events declaration cannot invent a presentation");
    const actual = ownEvent(await eventRead());
    assert.ok(actual);
    assert.equal(actual.content, "插件自己的原始记录");
    assert.equal(actual.open, null);

    const { offers: offered } = await web.post<{ offers: Array<SubjectActionOffer & { source: ActionReference; availability: { available: boolean } }> }>(
      prefix + "/api/home/actions/prepare", { subject, request_id });
    const picked = offered.find(offer => offer.offer_id === "complete");
    assert.ok(picked?.availability.available);
    const { availability: _availability, ...offer } = picked;
    assert.deepEqual(await web.post(prefix + "/api/home/actions/execute", { subject, request_id, offer }), { title: "确认记录", result: { done: true } });
    assert.equal(writes, 1);
    assert.equal(read().revision, 2);
    assert.equal(ownEvent(await eventRead()), undefined, "the owner withdraws the completed event");

    store.db.prepare("UPDATE fixture_home_notes SET done = 0, revision = revision + 1 WHERE id = ?").run(subject.id);
    fail = true;
    const failed = await eventRead();
    assert.equal(ownEvent(failed), undefined);
    assert.ok(failed.issues.some(issue => issue.includes("笔记首页事项")));
    assert.ok(failed.issues.every(issue => !issue.includes("private provider diagnostic")));
    fail = false;
    assert.equal(ownEvent(await eventRead())?.event_id, "own-event");
    await runtime.stop(install.install_id);
    assert.equal(ownEvent(await eventRead()), undefined);
    assert.equal(writes, 1);
  } finally { await runtime.stop(install.install_id); }
});
