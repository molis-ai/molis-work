import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { MemoryPluginRuntimeRepository, PluginRuntime } from "@molis-ai/molis-work-plugin-runtime";
import { definePlugin, defineSubjectContextAction, subjectContext, resolveActionSubject } from "../packages/plugin-sdk/src/index.js";
import { bindActionClient, type ActionCallContext, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { MolisWorkLocalHost, molisWorkHostProjectReference, seedDemoBoard, DEMO_BOARD_ID, createLocalFeedApplication, createLocalFeedSourceService } from "@molis-ai/molis-work-app-local-host";
import { homeTalkActions, HOME_TALK_PERMISSIONS, createHomeTalkHandlers } from "../apps/local-host/src/home-talk-actions.js";
import { workActions } from "@molis-ai/molis-work-plugin-work";

const caller: ActionCallContext = { actor_id: "owner", project_id: "talk-project", audience: "user", permissions: [...HOME_TALK_PERMISSIONS, "notes:read"] };
const context = (kind = "unknown-note") => subjectContext({ subject: { kind, id: "note-1" }, revision: "1", title: "客户反馈", content: "登录失败的原始记录", goal_ids: [], session_id: null });

test("unknown SDK plugin supplies subject context through formal Runtime registration, grants and lifecycle", async () => {
  const service = new ActionService();
  const repository = new MemoryPluginRuntimeRepository();
  const runtime = new PluginRuntime(repository, undefined, { actions: { registry: service, project_id: caller.project_id! } });
  const definition = defineSubjectContextAction("unknown.notes.context", "unknown-note", "笔记", ["notes:read"]);
  let snapshot = context();
  const plugin = definePlugin({ manifest: { schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.example.context", version: "1.0.0", name: "新笔记",
    kind: "app", publisher: { publisher_id: "example", signature: "example-context" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
    permissions: [{ permission: "notes:read", required: false, reason: "读取当前笔记" }], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [definition] },
    async start() { return { kind: "app", actions: [{ ...definition, handle: () => snapshot }] }; } });
  const installed = runtime.install({ definition: plugin, deployment: "local", grants: ["notes:read"] }).install;
  try {
    await assert.rejects(resolveActionSubject(service, caller, snapshot.subject), { code: "actions.subject_unavailable" });
    await runtime.start(installed.install_id);
    const result = await resolveActionSubject(service, caller, snapshot.subject);
    assert.deepEqual(result.context, snapshot);
    assert.equal(result.reader.provider_id, installed.install_id);
    snapshot = { ...snapshot, subject: { ...snapshot.subject, id: "wrong" } };
    await assert.rejects(resolveActionSubject(service, caller, context().subject), { code: "actions.subject_mismatch" });
    snapshot = context();
    await assert.rejects(resolveActionSubject(service, { ...caller, permissions: [] }, snapshot.subject));
    const other = { ...definition, capability_id: "other.notes.context" };
    const stop = service.registerProvider({ provider: { provider_id: "other", title: "Other", kind: "plugin" }, definitions: [other], handlers: [{ ...other, handle: () => snapshot }] });
    await assert.rejects(resolveActionSubject(service, caller, snapshot.subject), { code: "actions.subject_ambiguous" });
    stop();
    repository.save({ ...runtime.get(installed.install_id), grants: [] });
    await assert.rejects(resolveActionSubject(service, caller, snapshot.subject));
    await runtime.stop(installed.install_id);
    await assert.rejects(resolveActionSubject(service, caller, snapshot.subject), { code: "actions.subject_unavailable" });
  } finally { await runtime.stop(installed.install_id); }
  const malformed: ActionDefinition = { ...definition, action: { ...definition.action, output_schema: { type: "object" } } };
  assert.throws(() => service.registerProvider({ provider: { provider_id: "broken", title: "Broken", kind: "plugin" }, definitions: [malformed], handlers: [{ ...malformed, handle: () => snapshot }] }), { code: "actions.definition_invalid" });
});

test("Home resolves original Feed, Inbox, Goal and Session facts, and never defaults an unrelated conversation", async () => {
  const home = await mkdtemp(join(tmpdir(), "home-talk-actions-"));
  const databasePath = join(home, "project.db"); seedDemoBoard(databasePath);
  const reference = molisWorkHostProjectReference({ databasePath, boardId: DEMO_BOARD_ID, projectId: caller.project_id! });
  const host = new MolisWorkLocalHost({ homeDirectory: home, runtimeSessionTransport: { async request() { throw new Error("preparation must not contact Runtime"); }, subscribe() { return () => undefined; } } });
  try {
    const runtime = await host.withProject(reference, runtime => runtime);
    const feed = createLocalFeedApplication(runtime.store.db);
    const source = createLocalFeedSourceService(runtime.store.db, reference.board_id).register({ kind: "research_library", repository: "molis-ai/research-library", research_source: "talk-context" }).source;
    const item = feed.ingestItem({ source, externalId: "talk-item", title: "需要解释的材料", summary: "核对原始正文", body: "上下文正文".repeat(7000), occurredAt: new Date().toISOString(), attention: false }).item;
    const entry = feed.ensureInboxEntryForFeedItem(reference.board_id, item.item_id, "manual").entry;
    const owner = await host.sessionResources();
    const create = (native: string, goal: string | null = null, project = reference.project_id, runtimeId = "codex") => owner.registry.createSession({ runtime_id: runtimeId, native_runtime_session_id: native, project_id: project, current_goal_id: goal, actor_id: caller.actor_id, user_confirmed: true });
    const first = create("native-first"), second = create("native-second", "goal-associated");
    create("foreign", null, "other-project"); create("unsupported", null, reference.project_id, "opencode");
    const actions = bindActionClient(host.actionClient(reference), () => caller);
    const prepare = (kind: string, id: string) => actions.invoke(homeTalkActions.prepareTalk, { subject: { kind, id } });
    let prepared = await prepare("feed_item", item.item_id);
    assert.equal(prepared.selection, "choose"); assert.equal(prepared.selected_session_id, null);
    assert.deepEqual(new Set(prepared.candidates.map(x => x.session_id)), new Set([first.session_id, second.session_id]));
    assert.equal(prepared.context.content.length, 32000); assert.equal(prepared.context.truncated, true);
    feed.linkGoal(reference.board_id, item.item_id, "goal-associated", "processing");
    prepared = await prepare("inbox_entry", entry.entry_id);
    assert.equal(prepared.selected_session_id, second.session_id);
    assert.equal(prepared.context.subject.id, entry.entry_id); assert.deepEqual(prepared.context.goal_ids, ["goal-associated"]);
    assert.equal(prepared.context.truncated, true, "Inbox retains the source's truncation indicator");
    const third = create("native-third", "goal-associated");
    prepared = await prepare("feed_item", item.item_id);
    assert.equal(prepared.selected_session_id, null); assert.equal(prepared.candidates.length, 2);
    prepared = await prepare("session", second.session_id);
    assert.deepEqual(prepared.candidates.map(x => x.session_id), [second.session_id]);
    owner.registry.updateAssociations({ session_id: second.session_id, current_goal_id: null, actor_id: caller.actor_id, user_confirmed: true });
    owner.registry.updateAssociations({ session_id: third.session_id, current_goal_id: null, actor_id: caller.actor_id, user_confirmed: true });
    assert.equal((await prepare("feed_item", item.item_id)).candidates.length, 0);
    const goalId = runtime.store.snapshot(reference.board_id).goals[0]!.goal_id;
    prepared = await prepare("goal", goalId);
    assert.deepEqual(prepared.context.goal_ids, [goalId]); assert.ok(!prepared.context.content.includes("[object Object]"));
    prepared = await prepare("source", source.source_id);
    assert.equal(prepared.selection, "choose"); assert.equal(prepared.selected_session_id, null);
    assert.ok(!prepared.context.content.includes("credential_ref"));
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});

test("Home refuses a changed subject snapshot while resolving the Session directory", async () => {
  const service = new ActionService();
  const definition = defineSubjectContextAction("unknown.context", "unknown-note", "笔记", []);
  let snapshot = context();
  service.registerProvider({ provider: { provider_id: "unknown", title: "Unknown", kind: "plugin" }, definitions: [definition], handlers: [{ ...definition, handle: () => snapshot }] });
  service.registerProvider({ provider: { provider_id: "io.molis.work.sessions", title: "Work", kind: "plugin" }, definitions: [workActions.directory], handlers: [{ ...workActions.directory, handle: async () => {
    await Promise.resolve(); snapshot = { ...snapshot, revision: "2", content: "edited" }; return { records: [], runtimes: [] };
  } }] });
  service.registerProvider({ provider: { provider_id: "home", title: "Home", kind: "system" }, definitions: [homeTalkActions.prepareTalk], handlers: createHomeTalkHandlers(caller.project_id!, service) });
  await assert.rejects(service.invoke(caller, homeTalkActions.prepareTalk, { subject: snapshot.subject }), { code: "actions.subject_changed" });
});
