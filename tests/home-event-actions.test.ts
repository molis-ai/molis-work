import assert from "node:assert/strict";
import test from "node:test";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { MemoryPluginRuntimeRepository, PluginRuntime } from "@molis-ai/molis-work-plugin-runtime";
import { definePlugin, defineHomeEventsAction } from "../packages/plugin-sdk/src/index.js";
import type { ActionCallContext, HomeEvent, HomeEventCollection } from "@molis-ai/molis-work-contracts/platform/actions";
import { createHomeEventHandlers, homeEventActions, type HomeEventsResult } from "../apps/local-host/src/home-event-actions.js";
import { createActionMcpPorts, actionMcpToolName, handleMcpMessage } from "@molis-ai/molis-work-app-mcp";
const caller: ActionCallContext = { actor_id: "owner", project_id: "event-project", audience: "user", permissions: ["home:read", "notes:read"] };
const window = { from: "2026-09-16T00:00:00Z", to: "2026-09-23T00:00:00Z", now: "2026-09-19T12:00:00Z" };
const original: HomeEvent = { event_id: "feed:collision", subject: { kind: "unknown-note", id: "n1" }, occurred_at: window.now, placement: "occurred", category: "personal",
  title: "自有笔记", summary: "原始摘要", content: "原始正文", facts: [["状态", "待处理"]], needs_attention: true,
  open: { kind: "item", surface: "notes", id: "n1", title: "自有笔记", label: "打开笔记" } };

test("formal unknown plugins supply namespaced events and checked navigation through Home and MCP", async () => {
  const service = new ActionService();
  service.registerProvider({ provider: { provider_id: "system.home", title: "Home", kind: "system", project_id: caller.project_id! }, definitions: Object.values(homeEventActions), handlers: createHomeEventHandlers(service, { capability_id: "unavailable.recommendations", version: 1 }) });
  const query = defineHomeEventsAction("unknown.notes.events", ["unknown-note"], "笔记事项", ["notes:read"]);
  let events = [original]; let duringRead: (() => void) | undefined;
  const plugin = definePlugin({ manifest: { schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.example.event-notes", version: "1.0.0", name: "Notes", kind: "app",
    publisher: { publisher_id: "example", signature: "events" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
    permissions: [{ permission: "notes:read", required: false, reason: "读取原笔记" }], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [query] },
    async start() { return { kind: "app", actions: [{ ...query, handle: async () => { await Promise.resolve(); duringRead?.(); return { source: { surface: "notes", title: "我的笔记", icon: "note" }, events }; } }] }; } });
  const repository = new MemoryPluginRuntimeRepository();
  const runtime = new PluginRuntime(repository, undefined, { actions: { registry: service, project_id: caller.project_id! } });
  const install = runtime.install({ definition: plugin, deployment: "local", grants: ["notes:read"] }).install;
  const read = async (context = caller) => await service.invoke(context, homeEventActions.events, window) as HomeEventsResult;
  try {
    await runtime.start(install.install_id);
    const result = await read(); assert.equal(result.events.length, 1); assert.deepEqual(result.issues, []);
    const row = result.events[0]!; assert.equal(row.source.provider_id, install.install_id); assert.equal(row.content, "原始正文"); assert.notEqual(row.id, original.event_id);
    const request = { window, source: row.source, event_id: row.event_id, target: row.open };
    assert.deepEqual(await service.invoke(caller, homeEventActions.openEvent, request), { target: original.open });
    await assert.rejects(service.invoke(caller, homeEventActions.openEvent, { ...request, target: { ...original.open, id: "another" } }), { code: "actions.event_changed" });
    events = [{ ...original, open: { ...original.open!, id: "moved" } }];
    await assert.rejects(service.invoke(caller, homeEventActions.openEvent, request), { code: "actions.event_changed" });
    events = [];
    await assert.rejects(service.invoke(caller, homeEventActions.openEvent, request), { code: "actions.event_changed" });
    events = [original, original]; assert.equal((await read()).events.length, 0); assert.equal((await read()).issues.length, 1);
    events = [{ ...original, subject: { kind: "undeclared", id: "n1" } }]; assert.equal((await read()).events.length, 0);
    events = [original];
    const alias = { ...query, capability_id: "second.notes.events" };
    const stopAlias = service.registerProvider({ provider: { provider_id: "another-plugin", title: "Second query", kind: "plugin", project_id: caller.project_id! }, definitions: [alias], handlers: [{ ...alias, handle: () => ({ source: { surface: "notes", title: "第二视图", icon: "note" }, events: [original] }) }] });
    assert.equal(new Set((await read()).events.map(event => event.id)).size, 2, "same event ID in distinct providers cannot overwrite a row"); stopAlias();
    const denied = await read({ ...caller, permissions: ["home:read"] }); assert.equal(denied.events.length, 0); assert.equal(denied.issues.length, 0, "ungranted providers stay outside the visible directory");
    await assert.rejects(service.invoke({ ...caller, project_id: "foreign" }, homeEventActions.events, window));
    for (const bad of [{ ...window, to: window.from }, { ...window, now: window.to }]) await assert.rejects(service.invoke(caller, homeEventActions.events, bad), { code: "actions.input_invalid" });
    const ports = createActionMcpPorts({ service, context: () => ({ ...caller, audience: "mcp" }), serverInfo: { name: "events", version: "1" } });
    const reply = await handleMcpMessage({ id: 1, method: "tools/call", params: { name: actionMcpToolName(homeEventActions.events), arguments: window } }, ports);
    const mcp = reply!.result as { isError: boolean; content: Array<{ text: string }> };
    assert.equal(mcp.isError, false); assert.equal((JSON.parse(mcp.content[0]!.text) as HomeEventsResult).events[0]?.content, "原始正文");
    duringRead = () => repository.save({ ...runtime.get(install.install_id), grants: [] });
    const withdrawn = await read(); assert.equal(withdrawn.events.length, 0); assert.ok(withdrawn.issues.length);
    duringRead = undefined; repository.save({ ...runtime.get(install.install_id), grants: ["notes:read"] });
    const revokeAtReturn: ActionCallContext = { ...caller, validate_authority: reference => {
      if (reference.provider_id === install.install_id) repository.save({ ...runtime.get(install.install_id), grants: [] });
    } };
    await assert.rejects(service.invoke(revokeAtReturn, homeEventActions.openEvent, request));
    repository.save({ ...runtime.get(install.install_id), grants: ["notes:read"] });
    await runtime.stop(install.install_id); assert.equal((await read()).events.length, 0);
    await assert.rejects(service.invoke(caller, homeEventActions.openEvent, request), { code: "actions.event_source_changed" });
  } finally { await runtime.stop(install.install_id); }
  const malformed = { ...query, action: { ...query.action, output_schema: { type: "object" } } };
  assert.throws(() => service.registerProvider({ provider: { provider_id: "bad", title: "Bad", kind: "plugin" }, definitions: [malformed], handlers: [{ ...malformed, handle: () => ({}) }] }), { code: "actions.definition_invalid" });
});

test("native event providers project original Feed, Inbox, source state and project Sessions", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises"); const { tmpdir } = await import("node:os"); const { join } = await import("node:path");
  const { MolisWorkLocalHost, molisWorkHostProjectReference, seedDemoBoard, DEMO_BOARD_ID, createLocalFeedApplication, createLocalFeedSourceService } = await import("@molis-ai/molis-work-app-local-host");
  const { createFeedEvidenceContentStore } = await import("@molis-ai/molis-work-module-feed");
  const { runWithMolisWorkHome } = await import("@molis-ai/molis-work-storage");
  const home = await mkdtemp(join(tmpdir(), "native-home-events-")); const databasePath = join(home, "project.db"); seedDemoBoard(databasePath);
  const reference = molisWorkHostProjectReference({ databasePath, boardId: DEMO_BOARD_ID, projectId: caller.project_id! });
  const host = new MolisWorkLocalHost({ homeDirectory: home });
  const owner = { ...caller, permissions: ["home:read", "feed:read", "inbox:read", "goals:read", "sessions:read"] };
  const now = new Date(); const range = { from: new Date(now.getTime() - 86400000).toISOString(), to: new Date(now.getTime() + 86400000).toISOString(), now: now.toISOString() };
  try {
    const runtime = await host.withProject(reference, runtime => runtime); const feed = createLocalFeedApplication(runtime.store.db);
    const source = createLocalFeedSourceService(runtime.store.db, reference.board_id).register({ kind: "research_library", repository: "molis-ai/research-library", research_source: "events" }).source;
    const ingest = (id: string, at = now.toISOString()) => feed.ingestItem({ source, externalId: id, title: "材料 " + id, summary: "摘要", body: "完整原文 " + id, occurredAt: at, attention: false }).item;
    const ordinary = ingest("ordinary"), active = ingest("active", "2020-01-01T00:00:00Z"), done = ingest("done");
    const retainedText = "# 保留的材料原文\n\n这段内容只存在加密材料中。";
    const retained = runWithMolisWorkHome(home, () => createFeedEvidenceContentStore().write(retainedText));
    const materialItem = feed.ingestItem({ source, externalId: "material-only", title: "材料附件", summary: "不能替代原文的摘要", body: null, occurredAt: now.toISOString(), attention: false,
      material: { material_id: "retained-material", canonical_url: null, title: "材料附件", source_name: source.name, published_at: null,
        preview: "附件预览", content_hash: null, content_ref: retained.contentRef, content_available: true, content_type: "text/markdown",
        character_count: retainedText.length, captured_at: now.toISOString(), provenance: {}, selected_for_context: true } }).item;
    const goal = runtime.store.snapshot(reference.board_id).goals[0]!;
    feed.linkGoal(reference.board_id, ordinary.item_id, goal.goal_id, "processing");
    const activeEntry = feed.ensureInboxEntryForFeedItem(reference.board_id, active.item_id, "manual").entry;
    const doneEntry = feed.ensureInboxEntryForFeedItem(reference.board_id, done.item_id, "manual").entry;
    feed.setInboxEntryStatus(reference.board_id, doneEntry.entry_id, "done", doneEntry.revision); await feed.flushPendingJudgments();
    feed.upsertSource({ ...source, status: "error", last_outcome: "failed", last_error_code: "rate_limited", updated_at: now.toISOString() });
    const resources = await host.sessionResources();
    const session = resources.registry.createSession({ runtime_id: "codex", native_runtime_session_id: "native-event-session", project_id: reference.project_id, actor_id: owner.actor_id, user_confirmed: true, title: "真实会话", current_goal_id: goal.goal_id });
    const foreign = resources.registry.createSession({ runtime_id: "codex", native_runtime_session_id: "foreign-event-session", project_id: "foreign", actor_id: owner.actor_id, user_confirmed: true });
    const client = host.actionClient(reference);
    for (const capability_id of ["feed.home.events", "inbox.home.events", "sessions.home.events"]) {
      await assert.rejects(client.invoke(owner, { capability_id, version: 1 }, { ...range, to: range.from }), { code: "actions.input_invalid" });
    }
    const result = await client.invoke(owner, homeEventActions.events, range) as HomeEventsResult;
    assert.deepEqual(result.issues, []);
    const find = (kind: string, id: string) => result.events.filter(event => event.subject.kind === kind && event.subject.id === id);
    assert.equal(find("feed_item", ordinary.item_id)[0]?.content, "完整原文 ordinary");
    assert.equal(find("feed_item", materialItem.item_id)[0]?.content, retainedText, "Home reads decrypted retained materials when the item has no inline body");
    assert.equal(find("feed_item", ordinary.item_id)[0]?.facts.find(fact => fact[0] === "挂在")?.[1], goal.title);
    assert.equal(find("session", session.session_id)[0]?.facts.find(fact => fact[0] === "挂在")?.[1], goal.title);
    assert.equal(find("feed_item", active.item_id).length, 0); assert.equal(find("feed_item", done.item_id).length, 0);
    const attention = find("inbox_entry", activeEntry.entry_id); assert.equal(attention.length, 1); assert.equal(attention[0]?.placement, "active"); assert.match(attention[0]?.content || "", /完整原文 active/);
    assert.equal(find("inbox_entry", doneEntry.entry_id).length, 0);
    const fault = find("source", source.source_id)[0]!; assert.ok(fault); assert.equal(fault.open?.label, "查看来源"); assert.match(fault.content, /同步出现问题/); assert.ok(!fault.content.includes("授权"));
    assert.equal(find("session", session.session_id)[0]?.open?.id, session.session_id); assert.equal(find("session", foreign.session_id).length, 0);
    const open = { window: range, source: fault.source, event_id: fault.event_id, target: fault.open };
    assert.deepEqual(await client.invoke(owner, homeEventActions.openEvent, open), { target: fault.open });
    feed.upsertSource({ ...source, status: "active", last_outcome: "completed", last_error_code: null });
    await assert.rejects(client.invoke(owner, homeEventActions.openEvent, open), { code: "actions.event_changed" });
    feed.upsertSource({ ...source, status: "disconnected", last_outcome: "failed", last_error_code: "auth_required" });
    const sourceEntry = feed.createInboxEntry({ boardId: reference.board_id, subjectType: "source_fault", subjectId: source.source_id, reason: "source_fault", detail: { user_action: "请检查连接设置" } }).entry;
    const withFault = await client.invoke(owner, homeEventActions.events, range) as HomeEventsResult;
    assert.equal(withFault.events.some(event => event.subject.kind === "source" && event.subject.id === source.source_id), false, "one fault has only its original attention row");
    assert.equal(withFault.events.find(event => event.subject.id === sourceEntry.entry_id)?.content, "请检查连接设置");
    feed.setInboxEntryStatus(reference.board_id, sourceEntry.entry_id, "dismissed", sourceEntry.revision);
    const dismissed = await client.invoke(owner, homeEventActions.events, range) as HomeEventsResult;
    assert.equal(dismissed.events.some(event => event.subject.id === sourceEntry.entry_id || event.subject.kind === "source" && event.subject.id === source.source_id), false, "dismissed faults do not reappear as raw source events");
    feed.setInboxEntryStatus(reference.board_id, activeEntry.entry_id, "done", activeEntry.revision);
    const after = await client.invoke(owner, homeEventActions.events, range) as HomeEventsResult;
    assert.equal(after.events.some(event => event.subject.id === activeEntry.entry_id || event.subject.id === active.item_id), false);
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});
