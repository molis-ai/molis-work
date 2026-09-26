import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference, createLocalFeedApplication, createLocalFeedSourceService, resolveWebControlToken } from "@molis-ai/molis-work-app-local-host";
import { feedSubjectAction, feedRuleActions, type FeedOutRuleRecord, type FeedRulePreview } from "@molis-ai/molis-work-plugin-feed";
import { inboxActions, inboxNextScene } from "@molis-ai/molis-work-plugin-inbox";
import { inboxSubjectAction } from "../plugins/native/inbox/src/content-actions.js";
import { homeActions } from "../apps/local-host/src/home-actions.js";
import type { HomeEventsResult } from "../apps/local-host/src/home-event-actions.js";
import type { HomeActionOffers } from "../apps/local-host/src/home-offer-actions.js";
import { withFunctionsService } from "../apps/local-host/src/functions-host.js";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { createMcpActionGrant, hostActionToolName } from "../apps/local-host/src/mcp-action-grants.js";
import { writeMcpActionGrant } from "../apps/local-host/src/mcp-settings-store.js";
import { functionContextActions } from "@molis-ai/molis-work-module-functions";
import { sceneConfigurationActions, type ActionSceneTarget } from "@molis-ai/molis-work-contracts/platform/actions";
import type { JudgmentRecord } from "@molis-ai/molis-work-contracts/modules/functions";

test("formal MCP Home judgment and subject actions share Web facts and revocable authority", { timeout: 90_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "home-formal-mcp-"));
  const project = await withCatalog({ homeDirectory: home }, catalog => {
    const project = catalog.createProject({ display_name: "Home MCP", actor_id: "owner" });
    return project;
  });
  const reference = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id, boardId: project.board_id });
  const inputs: string[] = [];
  const host = new MolisWorkLocalHost({ homeDirectory: home, functions: { env: { TYPESAFE_API_KEY: "fixture-only" }, provider: {
    async evaluate(_key, record, input) {
      inputs.push(input);
      const choice = record.function_key === "system_admit_inbox" ? "inbox.admit" : "inbox.done";
      return { primitive: "choice", choice, probabilities: { [choice]: 1 }, confidence: null,
        model: record.model, noul: null, score: null, legend: null };
    },
  } } });
  const token = resolveWebControlToken({ homeDirectory: home });
  const server = createMolisWorkWebServer({ homeDirectory: home, localHost: host, controlToken: token });
  const clientId = "runtime:home-client";
  const context = { runtime_id: "home-client", stable_work_context_id: "home-session", host_declares_stable: true };
  const sdk = new Client({ name: "untrusted-display-name", version: "1" });
  try {
    const item = await host.withProject(reference, runtime => {
      const source = createLocalFeedSourceService(runtime.store.db, project.board_id).register({ kind: "research_library", repository: "molis-ai/research-library", research_source: "mcp-home" }).source;
      return createLocalFeedApplication(runtime.store.db).ingestItem({ source, externalId: "home-mcp-material", title: "真实事项", summary: "待判断", body: "真实原文传入判断", occurredAt: new Date().toISOString(), attention: false }).item;
    });
    const entry = await host.withProject(reference, runtime => createLocalFeedApplication(runtime.store.db).ensureInboxEntryForFeedItem(project.board_id, item.item_id, "manual").entry);
    await withCatalog({ homeDirectory: home }, catalog => catalog.bindRuntimeContext({ context, project_id: project.project_id, actor_id: "owner", user_confirmed: true }));
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`, prefix = `${origin}/projects/${project.project_id}`;
    const configured = await fetch(`${prefix}/api/home/dock-judgment`, { method: "POST", headers: {
      "content-type": "application/json", origin, "x-molis-work-control-token": token, "x-molis-work-idempotency-key": "bind-home-mcp",
    }, body: JSON.stringify({ function_key: "system_pick_home_dock" }) });
    assert.equal(configured.status, 200, await configured.clone().text());
    const rulePage = `${origin}/capabilities/library?project=${project.project_id}&action=functions.published.system_pick_home_dock&version=1`;
    const usagePage = await (await fetch(rulePage)).text();
    assert.ok(usagePage.includes(`href="/projects/${project.project_id}/">首页下一步</a>`), "system rule details expose the real Home binding");
    const transport = new StdioClientTransport({ command: process.execPath, args: ["--import", "tsx",
      fileURLToPath(new URL("../apps/desktop/launchers/mcp/server.ts", import.meta.url))], env: {
      ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
      MOLIS_WORK_HOME: home, MOLIS_WORK_WEB_URL: origin, MOLIS_WORK_RUNTIME_ID: context.runtime_id,
      MOLIS_WORK_WORK_CONTEXT_ID: context.stable_work_context_id, MOLIS_WORK_WORK_CONTEXT_STABLE: "true",
    }, stderr: "pipe" });
    let errors = ""; transport.stderr?.on("data", chunk => { errors += String(chunk); });
    await sdk.connect(transport).catch(error => { throw new Error(String(error) + errors); });
    const name = hostActionToolName(homeActions.evaluate);
    assert.equal((await sdk.listTools()).tools.some(tool => tool.name === name), false);
    const directory = await host.inspectActions({ actor_id: clientId, project_id: project.project_id, audience: "mcp", permissions: [] }, reference);
    const required = [homeActions.evaluate.capability_id, homeActions.recommendations.capability_id, homeActions.readJudgment.capability_id,
      feedSubjectAction.capability_id, inboxSubjectAction.capability_id, inboxActions.list.capability_id, homeActions.offers.capability_id, inboxActions.offers.capability_id, inboxActions.setStatus.capability_id, "functions.published.system_pick_home_dock"];
    for (const id of required) {
      const view = directory.find(view => view.capability_id === id)!; assert.ok(view, id);
      await writeMcpActionGrant(home, createMcpActionGrant(clientId, view.action.scope === "home" ? null : project.project_id, view, true));
    }
    assert.ok((await sdk.listTools()).tools.some(tool => tool.name === name));
    const call = async <T = { judgments: JudgmentRecord[] }>(id: string, args: Record<string, unknown>): Promise<T> => {
      const result = await sdk.callTool({ name: hostActionToolName({ capability_id: id, version: 1 }), arguments: args });
      assert.notEqual(result.isError, true, JSON.stringify(result));
      return JSON.parse((result.content as Array<{ text: string }>)[0]!.text) as T;
    };
    assert.equal((await sdk.listTools()).tools.some(tool => tool.name === hostActionToolName(feedRuleActions.create)), false);
    for (const definition of Object.values(feedRuleActions)) {
      const view = directory.find(view => view.capability_id === definition.capability_id)!; assert.ok(view);
      await writeMcpActionGrant(home, createMcpActionGrant(clientId, project.project_id, view, true));
    }
    const capture = await call<{ rule: FeedOutRuleRecord }>(feedRuleActions.create.capability_id, { name: "原始资料规则", match: { source_id: item.source_id, contains: "真实" } });
    assert.equal(capture.rule.board_id, project.board_id);
    const viaWeb = await (await fetch(`${prefix}/api/feed/out-rules`)).json() as { rules: FeedOutRuleRecord[] };
    assert.deepEqual(viaWeb.rules.find(rule => rule.rule_id === capture.rule.rule_id), capture.rule);
    const preview = await call<FeedRulePreview>(feedRuleActions.preview.capability_id, { source_id: item.source_id, contains: "真实原文" });
    assert.equal(preview.samples.find(sample => sample.item_id === item.item_id)?.matched, true);
    assert.match(preview.samples.find(sample => sample.item_id === item.item_id)!.input, /真实原文传入判断/);
    assert.equal(inputs.length, 0, "keyword preview does not invoke the judgment provider");
    const paused = await call<{ rule: FeedOutRuleRecord }>(feedRuleActions.update.capability_id, { rule_id: capture.rule.rule_id, patch: { enabled: false } });
    assert.equal(paused.rule.enabled, false);
    assert.equal((await call<{ rules: FeedOutRuleRecord[] }>(feedRuleActions.list.capability_id, {})).rules.find(rule => rule.rule_id === capture.rule.rule_id)?.enabled, false);
    const ruleGrant = directory.find(view => view.capability_id === feedRuleActions.update.capability_id)!;
    await writeMcpActionGrant(home, createMcpActionGrant(clientId, project.project_id, ruleGrant, false));
    assert.equal((await sdk.callTool({ name: hostActionToolName(feedRuleActions.update), arguments: { rule_id: capture.rule.rule_id, patch: { enabled: true } } })).isError, true);
    assert.equal((await sdk.callTool({ name: hostActionToolName(feedRuleActions.create), arguments: { board_id: "foreign", name: "Wrong scope", match: { contains: "test" } } })).isError, true);
    assert.equal((await sdk.callTool({ name: hostActionToolName(feedRuleActions.create), arguments: { name: "Wrong source", match: { source_id: "foreign-source" } } })).isError, true);
    await call(feedRuleActions.delete.capability_id, { rule_id: capture.rule.rule_id });
    assert.equal((await call<{ rules: FeedOutRuleRecord[] }>(feedRuleActions.list.capability_id, {})).rules.some(rule => rule.rule_id === capture.rule.rule_id), false);
    for (const id of [homeActions.events.capability_id, homeActions.openEvent.capability_id, "inbox.home.events"]) {
      const view = directory.find(view => view.capability_id === id)!; assert.ok(view, id);
      await writeMcpActionGrant(home, createMcpActionGrant(clientId, project.project_id, view, true));
    }
    const now = new Date();
    const window = { from: new Date(now.getTime() - 86400000).toISOString(), to: new Date(now.getTime() + 86400000).toISOString(), now: now.toISOString() };
    const events = await call<HomeEventsResult>(homeActions.events.capability_id, window);
    const homeItem = events.events.find(event => event.subject.kind === "inbox_entry" && event.subject.id === entry.entry_id)!;
    assert.ok(homeItem); assert.equal(homeItem.content, "真实原文传入判断");
    const navigation = { window, source: homeItem.source, event_id: homeItem.event_id, target: homeItem.open };
    assert.deepEqual(await call(homeActions.openEvent.capability_id, navigation), { target: homeItem.open });
    const webEvents = await fetch(`${prefix}/api/home/events`, { method: "POST", headers: { "content-type": "application/json", origin, "x-molis-work-control-token": token, "x-molis-work-idempotency-key": "home-events-web-read" }, body: JSON.stringify(window) });
    assert.equal(webEvents.status, 200, await webEvents.clone().text());
    assert.deepEqual(((await webEvents.json()) as HomeEventsResult).events.find(event => event.id === homeItem.id), homeItem);
    const eventGrant = directory.find(view => view.capability_id === "inbox.home.events")!;
    await writeMcpActionGrant(home, createMcpActionGrant(clientId, project.project_id, eventGrant, false));
    assert.equal((await call<HomeEventsResult>(homeActions.events.capability_id, window)).events.some(event => event.id === homeItem.id), false);
    assert.equal((await sdk.callTool({ name: hostActionToolName(homeActions.openEvent), arguments: navigation })).isError, true);
    await writeMcpActionGrant(home, createMcpActionGrant(clientId, project.project_id, eventGrant, true));
    const result = await call(homeActions.evaluate.capability_id, { subjects: [{ kind: "inbox_entry", id: entry.entry_id }] });
    const recommendation = result.judgments[0]!.suggested_behavior_ids[0]!;
    assert.match(recommendation, /^offer\./);
    assert.equal(result.judgments.length, 1); assert.match(inputs[0]!, /真实原文传入判断/);
    assert.deepEqual((await call<HomeEventsResult>(homeActions.events.capability_id, window)).events.find(event => event.id === homeItem.id)?.suggested_behavior_ids, [recommendation]);
    assert.deepEqual((await call(homeActions.recommendations.capability_id, {})).judgments, result.judgments);
    const history = withFunctionsService(home, service => service.listJudgments());
    assert.equal(history.length, 1); assert.equal(history[0]!.judgment_id, result.judgments[0]!.judgment_id);
    const readHome = async () => {
      const response = await fetch(`${prefix}/api/home/events`, { method: "POST", headers: {
        "content-type": "application/json", origin, "x-molis-work-control-token": token, "x-molis-work-idempotency-key": randomUUID(),
      }, body: JSON.stringify(window) });
      assert.equal(response.status, 200, await response.clone().text());
      return ((await response.json()) as HomeEventsResult).events.find(event => event.id === homeItem.id)!;
    };
    assert.deepEqual((await readHome()).suggested_behavior_ids, [recommendation], "Home reads the same current recommendation as MCP");
    const grantView = directory.find(view => view.capability_id === "functions.published.system_pick_home_dock")!;
    await writeMcpActionGrant(home, createMcpActionGrant(clientId, null, grantView, false));
    assert.equal((await sdk.callTool({ name, arguments: { subjects: [{ kind: "inbox_entry", id: entry.entry_id }] } })).isError, true);
    assert.deepEqual((await call(homeActions.recommendations.capability_id, {})).judgments, []);
    assert.equal(inputs.length, 1, "revoked caller cannot execute, and retains no recommendation derived from an unavailable judgment");
    assert.deepEqual((await readHome()).suggested_behavior_ids, [recommendation], "MCP revocation does not revoke the local user's independent authority");
    const disabled = await fetch(`${prefix}/api/home/dock-judgment`, { method: "POST", headers: {
      "content-type": "application/json", origin, "x-molis-work-control-token": token, "x-molis-work-idempotency-key": "disable-home-mcp",
    }, body: JSON.stringify({ function_key: null }) });
    assert.equal(disabled.status, 200);
    assert.match(await (await fetch(rulePage)).text(), /已停用/);
    assert.deepEqual((await readHome()).suggested_behavior_ids, []);
    assert.equal(withFunctionsService(home, service => service.listJudgments()).length, 1);
    const statusView = directory.find(view => view.capability_id === inboxActions.setStatus.capability_id)!;
    await writeMcpActionGrant(home, createMcpActionGrant(clientId, project.project_id, statusView, false));
    for (const definition of [homeActions.offers, homeActions.execute, inboxActions.offers]) {
      const view = directory.find(view => view.capability_id === definition.capability_id)!;
      await writeMcpActionGrant(home, createMcpActionGrant(clientId, project.project_id, view, true));
    }
    const subject = { subject: { kind: "inbox_entry", id: entry.entry_id }, request_id: "mcp-home-complete" };
    const deniedOffers = await call<HomeActionOffers>(homeActions.offers.capability_id, subject);
    assert.equal(deniedOffers.offers.find(offer => offer.offer_id === "inbox.done")!.availability.available, false);
    await writeMcpActionGrant(home, createMcpActionGrant(clientId, project.project_id, statusView, true));
    const prepared = await call<HomeActionOffers>(homeActions.offers.capability_id, subject);
    const { availability, ...offer } = prepared.offers.find(offer => offer.offer_id === "inbox.done")!;
    assert.equal(availability.available, true);
    const execution = { ...subject, offer };
    const completed = await call<{ result: { entry: { status: string; revision: number } } }>(homeActions.execute.capability_id, execution);
    assert.equal(completed.result.entry.status, "done"); assert.equal(completed.result.entry.revision, entry.revision + 1);
    const web = await (await fetch(`${prefix}/api/feed`)).json() as { inbox_entries: Array<{ entry_id: string; status: string; revision: number }> };
    const actual = web.inbox_entries.find(row => row.entry_id === entry.entry_id)!;
    assert.equal(actual.status, "done"); assert.equal(actual.revision, entry.revision + 1);
    assert.equal((await sdk.callTool({ name: hostActionToolName(homeActions.execute), arguments: execution })).isError, true, "the expired offer cannot execute twice");
    const captureJudgment = directory.find(view => view.capability_id === "functions.published.system_admit_inbox")!;
    await writeMcpActionGrant(home, createMcpActionGrant(clientId, null, captureJudgment, true));
    const captureSourceId = item.source_id; assert.ok(captureSourceId);
    const captureItem = await host.withProject(reference, runtime => {
      const feed = createLocalFeedApplication(runtime.store.db);
      return feed.ingestItem({ source: feed.getSource(project.board_id, captureSourceId), externalId: "mcp-capture-actual", title: "MCP 捕捉新消息",
        summary: "原文", body: "真正执行 Feed 场景", occurredAt: new Date().toISOString(), attention: false }).item;
    });
    const semantic = await call<{ rule: FeedOutRuleRecord }>(feedRuleActions.create.capability_id, { name: "MCP 自动入箱", match: { source_id: item.source_id },
      admission: "inbox", judgment: { capability_id: captureJudgment.capability_id, version: captureJudgment.version, provider_id: captureJudgment.provider.provider_id } });
    await call(feedRuleActions.evaluate.capability_id, { item_ids: [captureItem.item_id] });
    const feedResult = withFunctionsService(home, service => service.latestJudgment("feed_item", captureItem.item_id, project.board_id, "feed.capture"))!;
    assert.equal(feedResult.outcome, "ok"); assert.deepEqual(feedResult.suggested_behavior_ids, ["inbox.admit"]);
    assert.equal(feedResult.scene_provenance?.binding_id, "feed.capture:" + semantic.rule.rule_id);
    const capturedWeb = await (await fetch(`${prefix}/api/feed`)).json() as { inbox_entries: { subject_id: string; reason: string }[] };
    assert.ok(capturedWeb.inbox_entries.some(value => value.subject_id === captureItem.item_id && value.reason === "source_rule"));
    const capturedSuggestions = await call<{ recommendations: { item_id: string; suggested_behavior_ids: string[] }[] }>(feedRuleActions.recommendations.capability_id, {});
    assert.deepEqual(capturedSuggestions.recommendations.find(row => row.item_id === captureItem.item_id)?.suggested_behavior_ids, ["inbox.admit"]);
    const beforeRevocation = inputs.length;
    await writeMcpActionGrant(home, createMcpActionGrant(clientId, null, captureJudgment, false));
    assert.equal((await sdk.callTool({ name: hostActionToolName(feedRuleActions.evaluate), arguments: { item_ids: [captureItem.item_id] } })).isError, true);
    assert.equal(inputs.length, beforeRevocation);
    assert.deepEqual((await call<{ recommendations: unknown[] }>(feedRuleActions.recommendations.capability_id, {})).recommendations, []);
    assert.ok(withFunctionsService(home, service => service.listJudgments()).some(record => record.judgment_id === feedResult.judgment_id));
    for (const id of [inboxActions.readJudgment.capability_id, inboxActions.writeJudgment.capability_id,
      inboxActions.evaluateJudgment.capability_id, inboxActions.recommendations.capability_id, functionContextActions.targets.capability_id,
      functionContextActions.configure.capability_id, ...Object.values(sceneConfigurationActions(inboxNextScene)).map(action => action.capability_id), "functions.published.system_pick_inbox_next"]) {
      const view = directory.find(view => view.capability_id === id)!; assert.ok(view, id);
      await writeMcpActionGrant(home, createMcpActionGrant(clientId, view.action.scope === "home" ? null : project.project_id, view, true));
    }
    const inboxRule = withFunctionsService(home, service => service.list().find(row => row.function_key === "system_pick_inbox_next")!);
    const inboxTarget = async () => (await call<{ targets: ActionSceneTarget[] }>(functionContextActions.targets.capability_id, { id: inboxRule.id })).targets.find(row => row.scene_id === "inbox.next")!;
    const configureInbox = (target: ActionSceneTarget, enabled: boolean) => ({ id: inboxRule.id, scene_id: target.scene_id, scene_version: target.scene_version,
      provider_id: target.provider_id, binding_id: target.binding_id, expected_revision: target.revision, enabled });
    const initialInboxTarget = await inboxTarget(); assert.ok(initialInboxTarget); assert.equal(initialInboxTarget.availability.available, true);
    const initialConfig = configureInbox(initialInboxTarget, true);
    await call(functionContextActions.configure.capability_id, initialConfig);
    assert.equal((await inboxTarget()).binding?.function.provider_id, "system.functions");
    assert.equal((await sdk.callTool({ name: hostActionToolName(functionContextActions.configure), arguments: initialConfig })).isError, true, "stale MCP configurations cannot overwrite the owner revision");
    const inboxEntry = await host.withProject(reference, runtime => createLocalFeedApplication(runtime.store.db).listInboxEntries(project.board_id).find(entry => entry.subject_id === captureItem.item_id)!);
    const inboxJudgment = await call(inboxActions.evaluateJudgment.capability_id, { entry_ids: [inboxEntry.entry_id] });
    assert.deepEqual((await call(inboxActions.recommendations.capability_id, {})).judgments, inboxJudgment.judgments);
    const readInbox = async () => (await (await fetch(`${prefix}/api/feed`)).json() as { inbox_entries: { entry_id: string; next_judgment: JudgmentRecord | null }[] }).inbox_entries.find(entry => entry.entry_id === inboxEntry.entry_id)!;
    assert.equal((await readInbox()).next_judgment?.judgment_id, inboxJudgment.judgments[0]!.judgment_id);
    const inboxGrant = directory.find(view => view.capability_id === "functions.published.system_pick_inbox_next")!;
    await writeMcpActionGrant(home, createMcpActionGrant(clientId, null, inboxGrant, false));
    assert.deepEqual((await call(inboxActions.recommendations.capability_id, {})).judgments, []);
    assert.equal((await readInbox()).next_judgment?.judgment_id, inboxJudgment.judgments[0]!.judgment_id, "the local user keeps independent authority");
    const unavailableInbox = await inboxTarget();
    assert.equal(unavailableInbox.availability.available, false); assert.equal(unavailableInbox.configuration_availability.available, true);
    await call(functionContextActions.configure.capability_id, configureInbox(unavailableInbox, false));
    assert.equal((await readInbox()).next_judgment, null, "pausing the actual binding removes current advice from the cached page");
    assert.ok(withFunctionsService(home, service => service.listJudgments()).some(record => record.judgment_id === inboxJudgment.judgments[0]!.judgment_id));

  } finally {
    await sdk.close(); await new Promise<void>(resolve => server.close(() => resolve()));
    await host.close(); await rm(home, { recursive: true, force: true });
  }
});
