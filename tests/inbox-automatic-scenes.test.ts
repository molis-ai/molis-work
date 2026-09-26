import { createFeedCaptureTrigger, feedCaptureScene } from "@molis-ai/molis-work-plugin-feed";
import { NATIVE_CONTENT_PERMISSIONS } from "../apps/local-host/src/content-action-providers.js";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createCompletedIntentResultFixtureV1 } from "@adeptify/intelligence-client/testing";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference, createLocalFeedApplication, createLocalFeedSourceService,
  createLocalFeedConnectorService, createLocalFeedSourceScheduler, listFeedSourceCatalog, type FeedSourceRuntime } from "@molis-ai/molis-work-app-local-host";
import { INBOX_ACTION_PERMISSIONS, createInboxJudgmentTrigger, inboxActions, inboxNextScene, inboxSceneBindingId } from "@molis-ai/molis-work-plugin-inbox";
import type { ActionCallContext, ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { withFunctionsService, type FunctionsHostOptions } from "../apps/local-host/src/functions-host.js";
import { projectActionAvailability } from "../apps/local-host/src/project-action-availability.js";
import { workflowsHostPorts } from "../apps/local-host/src/workflows-native-plugin-http.js";

test("HTTP admission, ingestion, workflow and scheduler events use the saved Inbox scene without a second judgment path", { timeout: 25_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "automatic-inbox-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const created = await catalog.createProject({ display_name: "自动判断", actor_id: "test" });
  const project = catalog.getProject(created.project_id);
  catalog.addProjectPlugin({ project_id: project.project_id, plugin_id: "feed", actor_id: "test" });
  const reference = molisWorkHostProjectReference({ databasePath: project.database_path, boardId: project.board_id, projectId: project.project_id });
  const caller: ActionCallContext = { actor_id: "owner", project_id: project.project_id, audience: "user", permissions: [...INBOX_ACTION_PERMISSIONS] };
  const inputs: string[] = [];
  let failure = false;
  const functions: FunctionsHostOptions = { env: { TYPESAFE_API_KEY: "fixture-only" }, provider: {
    async evaluate(_key, record, input) {
      inputs.push(input);
      if (failure) throw Object.assign(new Error("private-provider-detail"), { code: "fixture.provider_failed" });
      return { primitive: "choice", choice: "inbox.done", noul: null, score: null, legend: null,
        probabilities: { "inbox.done": 1 }, confidence: null, model: record.model };
    },
  } };
  // Desktop imports the same Catalog through package dist; bridge its nominal private-field type for this source-level Host test.
  const policy = projectActionAvailability(async (_options, run) => run(catalog as unknown as Parameters<typeof run>[0]), home);
  const host = new MolisWorkLocalHost({ homeDirectory: home, functions, actionAvailability: policy, sceneAvailability: policy });
  const token = "automatic-inbox-01234567890123456789";
  const server = createMolisWorkWebServer({ homeDirectory: home, localHost: host, controlToken: token });
  let sequence = 0;
  const history = () => withFunctionsService(home, service => service.listJudgments(), functions);
  try {
    await host.actionClient(reference).invoke(caller, inboxActions.writeJudgment, { function_key: "system_pick_inbox_next" });
    const runtime = await host.withProject(reference, runtime => runtime);
    const feed = createLocalFeedApplication(runtime.store.db);
    const source = createLocalFeedSourceService(runtime.store.db, runtime.board_id).register({ kind: "research_library",
      repository: "molis-ai/research-library", research_source: "automatic-inbox-fixture" }).source;
    const addMaterial = (title: string, body = "可核对的原始材料") => feed.ingestItem({ source, externalId: `manual-${sequence++}`, title,
      summary: title, body, occurredAt: new Date().toISOString(), attention: false }).item;
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const admit = async (item: { item_id: string; revision: number }) => {
      const response = await fetch(`${origin}/projects/${project.project_id}/api/feed/items/${item.item_id}/inbox`, {
        method: "POST", headers: { origin, "content-type": "application/json", "x-molis-work-control-token": token,
          "x-molis-work-idempotency-key": `automatic-admit-${sequence++}` }, body: JSON.stringify({ expected_revision: item.revision }),
      });
      assert.equal(response.status, 200, await response.text());
      return feed.listInboxEntries(runtime.board_id).find(entry => entry.subject_id === item.item_id)!;
    };
    const item = addMaterial("HTTP 自动判断");
    const entry = await admit(item);
    assert.equal(history().length, 1);
    assert.equal(history()[0]!.subject.id, entry.entry_id);
    assert.deepEqual(history()[0]!.suggested_behavior_ids, ["inbox.done"]);
    assert.equal(feed.getInboxEntry(runtime.board_id, entry.entry_id).status, "open");
    await admit(item);
    assert.equal(history().length, 1, "repeated admission does not emit another created event or judgment");
    failure = true;
    const failed = await admit(addMaterial("供应商故障"));
    const failureRecord = history().find(record => record.subject.id === failed.entry_id)!;
    assert.equal(failureRecord.outcome, "needs_review");
    assert.equal(failureRecord.error_code, "fixture.provider_failed");
    assert.deepEqual(failureRecord.suggested_behavior_ids, []);
    assert.ok(!JSON.stringify(failureRecord).includes("private-provider-detail"));
    failure = false;
    const beforeLong = inputs.length;
    const long = await admit(addMaterial("材料过长", "原文".repeat(4500)));
    assert.equal(history().find(record => record.subject.id === long.entry_id)!.error_code, "actions.input_invalid");
    assert.equal(inputs.length, beforeLong, "invalid prepared input becomes a review state without calling the model");

    const unknown: ActionDefinition = { capability_id: `fixture.${project.project_id}.local-judgment`, version: 1, operation: "command", action: {
      title: "Local judgment", description: "no remote provider", kind: "judgment", scope: "project", audiences: ["user", "workflow"], permissions: [], subject_kinds: ["inbox_entry"],
      input_schema: inboxNextScene.input_schema, output_type: inboxNextScene.result_type, output_schema: inboxNextScene.result_schema,
    } };
    let localCalls = 0, localFailure = false;
    const stop = host.actionRegistry(reference).registerProvider({ provider: { provider_id: unknown.capability_id, kind: "plugin", title: "Unknown fixture" },
      definitions: [unknown], handlers: [{ ...unknown, handle: () => {
        localCalls++;
        if (localFailure) throw new Error("fixture local judgment failed");
        return { status: "ok", suggested_behavior_ids: ["inbox.verify"] };
      } }] });
    const scenes = host.sceneClient(reference);
    await scenes.bind(caller, { binding_id: inboxSceneBindingId(project.project_id), scene_id: inboxNextScene.scene_id, scene_version: 1,
      project_id: project.project_id, function: { capability_id: unknown.capability_id, version: 1 }, enabled: true, title: "自动核查" });
    const captureDefinition: ActionDefinition = { ...unknown, capability_id: unknown.capability_id + ".capture", action: { ...unknown.action,
      subject_kinds: ["feed_item"], input_schema: feedCaptureScene.input_schema, output_schema: feedCaptureScene.result_schema } };
    let captureCalls = 0;
    host.actionRegistry(reference).registerProvider({ provider: { provider_id: captureDefinition.capability_id, kind: "plugin", title: "Feed fixture" }, definitions: [captureDefinition],
      handlers: [{ ...captureDefinition, handle: () => { captureCalls++; return { status: "ok", suggested_behavior_ids: ["inbox.admit"] }; } }] });
    const feedOptions = { captureJudgment: createFeedCaptureTrigger({ scenes, context: () => ({ ...caller, permissions: [...caller.permissions, "feed:read", "feed:write"] }), boardId: runtime.board_id }), inboxJudgment: createInboxJudgmentTrigger({ scenes, context: () => caller, boardId: runtime.board_id }) };
    await assert.rejects(feedOptions.inboxJudgment({ board_id: "other", entry_id: entry.entry_id }), { code: "actions.scope_mismatch" });
    const automatic = createLocalFeedApplication(runtime.store.db, feedOptions);
    const direct = automatic.ingestItem({ source, externalId: "module-attention", title: "直接带入箱请求的材料", summary: "内容", occurredAt: new Date().toISOString(), attention: { reason: "source_rule" } });
    await automatic.flushPendingJudgments();
    assert.equal(localCalls, 1, "Attention events emitted inside Feed ingestion also reach the scene");
    const directEntry = automatic.listInboxEntries(runtime.board_id).find(entry => entry.subject_id === direct.item.item_id)!;
    assert.deepEqual(history().find(record => record.subject.id === directEntry.entry_id)!.suggested_behavior_ids, ["inbox.verify"]);
    assert.throws(() => runtime.store.db.transaction(() => {
      automatic.ingestItem({ source, externalId: "rolled-back-attention", title: "不应判断", summary: "", occurredAt: new Date().toISOString(), attention: { reason: "manual" } });
      throw new Error("roll back fixture");
    }).immediate(), /roll back/);
    await automatic.flushPendingJudgments();
    assert.equal(localCalls, 1, "rolled-back module events cannot trigger a model call");

    const ports = workflowsHostPorts({ projectId: project.project_id,
      homeDirectory: home, completeText: null,
      actions: bindActionClient(host.actionClient(reference), () => ({ ...caller, audience: "workflow", permissions: NATIVE_CONTENT_PERMISSIONS })),
    });
    const handoff = await ports.receive("inbox", { title: "工作流交接", body: "需要核对的交接内容", feed_item_id: null }, { instance_id: "fixture-flow", step: 1 });
    assert.equal(localCalls, 2);
    assert.equal(history().find(record => record.subject.id === handoff.item_id)!.function_key, unknown.capability_id);
    const restricted = workflowsHostPorts({ projectId: project.project_id, homeDirectory: home, completeText: null,
      actions: bindActionClient(host.actionClient(reference), () => ({ ...caller, actor_id: "restricted-workflow", audience: "workflow",
        permissions: NATIVE_CONTENT_PERMISSIONS.filter(permission => permission !== "model:invoke") })),
    });
    const withoutModel = await restricted.receive("inbox", { title: "只交接材料", body: "没有模型权限也可以保留材料", feed_item_id: null }, { instance_id: "restricted-flow", step: 1 });
    assert.ok(feed.getInboxEntry(runtime.board_id, withoutModel.item_id));
    assert.equal(localCalls, 2, "a workflow without model permission cannot borrow the native background caller to judge its entry");
    assert.ok(!history().some(record => record.subject.id === withoutModel.item_id));

    await runWithMolisWorkHome(home, async () => {
      const connectors = createLocalFeedConnectorService(runtime.store.db, runtime.board_id, () => ({ type: "github",
        async health() { return { ok: true, status: "connected", message: "fixture" }; },
        async sync() { return { ok: true, mode: "live", cursor: { fixture: 1 }, items: [{ externalId: "auto-issue", title: "连接器材料", summary: "需要处理", occurredAt: new Date().toISOString(), attention: { reason: "source_rule" } }] }; },
      }), home, feedOptions);
      const connector = connectors.feed.upsertSource({ ...connectors.ensureSources().find(source => source.sync_kind === "github")!, status: "active" });
      await connectors.sync(connector.source_id, { idempotencyKey: "auto-connector-once" });
      assert.equal(localCalls, 3, "connector sync passes the trigger through its own application");
      await connectors.sync(connector.source_id, { idempotencyKey: "auto-connector-once" });
      assert.equal(localCalls, 3);
    });

    let now = new Date("2026-09-25T00:00:00Z");
    const publicRuntime = (): FeedSourceRuntime => ({
      intelligenceCollect: { async executeExact(request) {
        const base = createCompletedIntentResultFixtureV1(request);
        return { ...base, materials: [{ id: "material:automatic-public", candidateId: "automatic-public", title: "公开来源材料",
          sourceName: "Example", preview: "需要核查", canonicalUrl: "https://example.com/automatic-public",
          contentRef: "molis-work-feed/sha256/" + "a".repeat(64), contentHash: `sha256:${"a".repeat(64)}`,
          contentHashProfile: "search-markdown-v1", contentType: "text/markdown", characterCount: 4,
          capturedAt: now.toISOString(), provenance: { operationId: request.operationId, providerId: "rss", providerVersion: "1.0.0",
            bindingRevision: 1, retrievedAt: now.toISOString(), matchedLaneIds: ["intent:exact"], rankProfile: "feed-v1",
            transportProfileFingerprint: `sha256:${"b".repeat(64)}` },
          extractorRef: { providerId: "rss", providerVersion: "1.0.0" }, truncated: false, availability: "available",
        }] };
      }, async shutdown() {} },
      content: { write() { return { contentRef: "fixture" }; }, read() { return "需要核查"; }, has() { return true; }, inspect() { return { referenced: 1, available: 1, missing: 0, keyAvailable: true }; } }, async shutdown() {},
    });
    const publicSources = createLocalFeedSourceService(runtime.store.db, runtime.board_id, publicRuntime, () => now, home, feedOptions);
    const publicSource = publicSources.register({ kind: "rss", definition_id: listFeedSourceCatalog()[0]!.id }).source;
    publicSources.feed.createOutRule(runtime.board_id, { name: "纳入 Inbox", match: { source_id: publicSource.source_id }, admission: "inbox", judgment: { capability_id: captureDefinition.capability_id, version: 1, provider_id: captureDefinition.capability_id } });
    localFailure = true;
    const pulled = await publicSources.sync(publicSource.source_id, { idempotencyKey: "auto-public-once" });
    assert.equal(pulled.created, 1);
    assert.equal(pulled.run.outcome, "completed", "a failed follow-up judgment does not falsify the source sync result");
    assert.equal(localCalls, 4, "public source admission uses the same scene");
    assert.equal(captureCalls, 1, "source collection runs the actual Feed capture scene before creating the Inbox event");
    const publicItem = publicSources.feed.snapshot(runtime.board_id).feed_items.find(item => item.source_id === publicSource.source_id)!;
    const publicEntry = publicSources.feed.listInboxEntries(runtime.board_id).find(entry => entry.subject_id === publicItem.item_id)!;
    assert.equal(history().find(record => record.subject.id === publicEntry.entry_id)!.outcome, "needs_review");
    localFailure = false;
    await publicSources.sync(publicSource.source_id, { idempotencyKey: "auto-public-once" });
    assert.equal(localCalls, 4);
    assert.equal(captureCalls, 1, "replaying the collection receipt does not repeat a judgment");
    publicSources.configureSchedule(publicSource.source_id, { mode: "interval", enabled: true, interval_minutes: 5 });
    now = new Date("2026-09-25T00:05:00Z");
    const scheduler = createLocalFeedSourceScheduler(runtime.store.db, runtime.board_id, async () => {
      throw Object.assign(new Error("fixture auth failure"), { code: "connector_needs_auth" });
    }, () => now, home, feedOptions);
    assert.equal((await scheduler.tick(now)).failed, 1);
    assert.equal(localCalls, 5, "scheduler-created source faults also flush their scene event");
    const faults = publicSources.feed.listInboxEntries(runtime.board_id).filter(entry => entry.subject_type === "source_fault");
    assert.ok(faults.some(entry => history().some(record => record.subject.id === entry.entry_id)));

    stop();
    const unavailable = await admit(addMaterial("提供方已停用"));
    assert.ok(!history().some(record => record.subject.id === unavailable.entry_id));
    assert.equal((await scenes.usages(caller))[0]!.availability.available, false);
    assert.equal(localCalls, 5);
  } finally {
    if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await host.close(); catalog.close(); await rm(home, { recursive: true, force: true });
  }
});
