import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ActionError, bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { PluginRuntime, SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { DEMO_PROJECT_ID, LocalProjectDatabase, createLocalFeedApplication, createLocalFeedSourceService, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { WORKFLOWS_ACTION_PERMISSIONS, openWorkflowsStore, workflowsActions as w } from "@molis-ai/molis-work-plugin-workflows";
import { SCHEDULE_ACTION_PERMISSIONS, scheduleActions } from "@molis-ai/molis-work-plugin-schedule";
import { defineAction, definePlugin } from "../packages/plugin-sdk/src/index.js";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "../apps/local-host/src/project-host.js";
import { NATIVE_CONTENT_PERMISSIONS } from "../apps/local-host/src/content-action-providers.js";
import { authorizeMcpActions } from "../apps/local-host/src/mcp-action-client.js";
import { createMcpActionGrant } from "../apps/local-host/src/mcp-action-grants.js";
import { writeMcpActionGrant } from "../apps/local-host/src/mcp-settings-store.js";

const PROJECT = "project-action-steps";

test("a workflow step runs any registered action — even one the Host never heard of — by mapping handed-over fields", { timeout: 120_000 }, async () => {
  const home = mkdtempSync(join(tmpdir(), "workflows-action-steps-"));
  const dbPath = join(home, "project.db");
  seedDemoBoard(dbPath);
  const seed = new LocalProjectDatabase(dbPath);
  const source = createLocalFeedSourceService(seed.db, DEMO_PROJECT_ID).register({ kind: "research_library", repository: "molis-ai/research-library", research_source: "twitter-ai-observation" }).source;
  createLocalFeedApplication(seed.db).ingestItem({ source, externalId: "bug", title: "导出失败", summary: "客户反馈", body: "客户的周报导出一直失败。", occurredAt: new Date().toISOString(), attention: false });
  seed.close();
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const reference = molisWorkHostProjectReference({ databasePath: dbPath, projectId: DEMO_PROJECT_ID });

  // A plugin the Host code knows nothing about: its manifest and handler are all it takes.
  const tickets: { title: string; detail: string; priority: string }[] = [];
  let failNext = false;
  let pauseTicket: (() => Promise<void>) | undefined;
  let failAfterWrite: string | undefined;
  const create = defineAction<{ title: string; detail?: string; priority: "low" | "high" }, { ticket_id: number; note?: string; trace?: string }>({ capability_id: "fixture.tickets.create", version: 1, operation: "command",
    action: { title: "新建工单", description: "在工单插件里建一张工单", kind: "operation", scope: "project", audiences: ["user", "workflow", "mcp"], permissions: ["tickets:write"],
      subject_kinds: ["ticket"], result_view: { summary: "工单已创建", title_pointer: "/missing_title", text_pointer: "/note",
        link: { label: "打开工单", href_template: "/projects/{project_id}/?openPlugin=tickets&openItem={/ticket_id}" } }, input_schema: { type: "object", properties: { title: { type: "string", minLength: 1, description: "工单标题" }, detail: { type: "string" },
        priority: { type: "string", enum: ["low", "high"] } }, required: ["title", "priority"], additionalProperties: false },
      output_schema: { type: "object", properties: { ticket_id: { type: "integer" }, note: { type: "string" }, trace: { type: "string" } }, required: ["ticket_id"] } } },
    async (_context, input) => {
      await pauseTicket?.();
      if (failNext) { failNext = false; throw new Error("工单系统超时"); }
      tickets.push({ title: input.title, detail: input.detail ?? "", priority: input.priority });
      if (failAfterWrite) { const code = failAfterWrite; failAfterWrite = undefined; throw new ActionError(code, "工单已写入，后续步骤失败"); }
      return { ticket_id: tickets.length, ...(tickets.length === 1 ? { note: "工单正文".repeat(1500), trace: "内部诊断".repeat(6000) } : {}) };
    });
  const plugin = definePlugin({ manifest: { schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.fixture.tickets", version: "1.0.0", name: "工单", kind: "app",
    publisher: { publisher_id: "test", signature: "test" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
    permissions: [{ permission: "tickets:write", required: true, reason: "建工单" }], capabilities: { provides: [], consumes: [] },
    artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [create.definition] }, async start() { return { kind: "app", actions: [create.handler] }; } });
  const runtime = await host.withProject(reference, project => new PluginRuntime(new SqlitePluginRuntimeRepository(project.store.db), undefined,
    { actions: { registry: host.actionRegistry(reference), project_id: PROJECT } }));
  const installed = runtime.install({ definition: plugin, deployment: "local", grants: ["tickets:write"] }).install;
  await runtime.start(installed.install_id);

  const caller = { actor_id: "web-user", project_id: PROJECT, audience: "user" as const,
    permissions: [...WORKFLOWS_ACTION_PERMISSIONS, ...NATIVE_CONTENT_PERMISSIONS, ...SCHEDULE_ACTION_PERMISSIONS, "tickets:write"] };
  const actions = bindActionClient(host.actionClient(reference), () => caller);
  try {
    const { actions: offered } = await actions.invoke(w.actionSteps, {});
    const ticketStep = offered.find(row => row.ref.capability_id === "fixture.tickets.create")!;
    const scheduleStep = offered.find(row => row.ref.capability_id === scheduleActions.createTask.capability_id)!;
    assert.ok(ticketStep && scheduleStep, "the directory decides which steps exist");
    assert.equal(ticketStep.group, "工单");
    assert.deepEqual(ticketStep.fields.map(field => [field.name, field.required]), [["title", true], ["detail", false], ["priority", true]]);
    assert.ok(!offered.some(row => row.ref.capability_id.startsWith("workflows.")), "a workflow does not offer its own management");

    const station = (step: typeof ticketStep, mapping: Record<string, unknown>) => ({ plugin: "action", action: { ref: step.ref, title: step.title, group: step.group, mapping } });
    const template = { kind: "function", title_template: "工单：{标题}", body_template: "{正文}", instructions: "" };
    const pass = { kind: "function", title_template: "", body_template: "{正文}", instructions: "" };
    const chain = (ticketMapping: Record<string, unknown>) => ({ stations: [{ plugin: "feed" }, station(ticketStep, ticketMapping),
      station(scheduleStep, { title: { from: "title" }, instructions: { from: "body" }, time: { value: "09:00" } })], links: [template, pass] });
    await assert.rejects(actions.invoke(w.create, { title: "缺字段", chain: chain({ title: { from: "title" } }) }), (error: { message?: string }) => /priority/.test(error.message ?? ""));
    await assert.rejects(actions.invoke(w.create, { title: "越界", chain: chain({ title: { from: "title" }, priority: { value: "urgent" } }) }), /可选范围/);
    await assert.rejects(actions.invoke(w.create, { title: "动作不能开头", chain: { stations: [station(ticketStep, { title: { from: "title" }, priority: { value: "low" } }), { plugin: "feed" }], links: [pass] } }), /第一站/);
    const { workflow } = await actions.invoke(w.create, { title: "反馈建单并提醒", chain: chain({ title: { from: "title" }, detail: { from: "body" }, priority: { value: "high" } }) });

    const item = (await actions.invoke(w.stationItems, { plugin: "feed" })).items[0]!;
    const run = (await actions.invoke(w.start, { id: workflow.workflow_id, item_id: item.item_id })).instance;
    const afterTicket = (await actions.invoke(w.continue, { id: run.instance_id })).instance;
    assert.deepEqual(tickets, [{ title: "工单：导出失败", detail: "客户的周报导出一直失败。", priority: "high" }]);
    assert.equal(afterTicket.steps[1]!.result_truncated, true);
    assert.equal((afterTicket.steps[1]!.result as { truncated: boolean }).truncated, true);
    assert.deepEqual(afterTicket.steps[1]!.result_presentation, { summary: "工单已创建", text: "工单正文".repeat(1000), text_truncated: true, link: { label: "打开工单", href: "/projects/project-action-steps/?openPlugin=tickets&openItem=1" } });
    const reopened = openWorkflowsStore(home);
    try { assert.deepEqual(reopened.instance(run.instance_id, PROJECT).steps[1]!.result_presentation, afterTicket.steps[1]!.result_presentation); } finally { reopened.close(); }
    const done = (await actions.invoke(w.continue, { id: run.instance_id })).instance;
    assert.equal(done.status, "done");
    const tasks = (await actions.invoke(scheduleActions.list, {})).tasks;
    assert.deepEqual(tasks.map(task => [task.title, task.instructions, task.clock_label]), [["工单：导出失败", "客户的周报导出一直失败。", "09:00"]]);

    // A run that stopped while the action was being called: nothing is repeated until the person says so.
    const second = (await actions.invoke(w.start, { id: workflow.workflow_id, item_id: item.item_id })).instance;
    const preview = await actions.invoke(w.preview, { id: second.instance_id });
    const store = openWorkflowsStore(home);
    try {
      const raw = store.instance(second.instance_id, PROJECT);
      store.saveInstance(raw, { ...raw, steps: raw.steps.map((step, index) => index === 0 ? { ...step, pending: { key: `${raw.instance_id}:0`, kind: "function" as const, actor: "function" as const,
        at: new Date().toISOString(), input: preview.input, output: { ...preview.input, title: "工单：导出失败" }, attempted_at: new Date().toISOString() } } : step), updated_at: new Date().toISOString() });
    } finally { store.close(); }
    await assert.rejects(actions.invoke(w.continue, { id: second.instance_id }), { code: "workflows.uncertain" });
    assert.equal(tickets.length, 1);
    await actions.invoke(w.continue, { id: second.instance_id, retry_action: true });
    assert.equal(tickets.length, 2);

    // The provider failed after the call reached it: the step says what it said and still waits for the person.
    failNext = true;
    const failing = (await actions.invoke(w.start, { id: workflow.workflow_id, item_id: item.item_id })).instance;
    await assert.rejects(actions.invoke(w.continue, { id: failing.instance_id }), /工单系统超时/);
    await assert.rejects(actions.invoke(w.continue, { id: failing.instance_id }), (error: { code?: string; message?: string }) => error.code === "workflows.uncertain" && /工单系统超时/.test(error.message ?? ""));
    const unconfirmed = (await actions.invoke(w.instance, { id: failing.instance_id })).instance;
    assert.ok(unconfirmed.steps[0]!.pending?.attempted_at);
    assert.equal(unconfirmed.steps[0]!.pending?.attempt_error, "工单系统超时");
    await actions.invoke(w.continue, { id: failing.instance_id, retry_action: true });
    assert.equal(tickets.length, 3);

    // The complete schema rejects an empty mapped title before dispatch; no attempt is recorded.
    const { workflow: noUrl } = await actions.invoke(w.create, { title: "链接建单", chain: { stations: [{ plugin: "feed" }, station(ticketStep, { title: { from: "url" }, priority: { value: "low" } })], links: [pass] } });
    const refused = (await actions.invoke(w.start, { id: noUrl.workflow_id, item_id: item.item_id })).instance;
    await assert.rejects(actions.invoke(w.continue, { id: refused.instance_id }), { code: "actions.input_invalid" });
    await assert.rejects(actions.invoke(w.continue, { id: refused.instance_id }), { code: "actions.input_invalid" });
    assert.equal(tickets.length, 3);
    assert.equal((await actions.invoke(w.instance, { id: refused.instance_id })).instance.steps[0]!.pending?.attempted_at, undefined);

    // The same unknown plugin's action for an external MCP client: nothing without an exact grant, then it runs under the client's own identity.
    const view = (await host.actionClient(reference).discover(caller)).find(row => row.capability_id === "fixture.tickets.create")!;
    const client = { actor_id: "client-tickets", project_id: PROJECT, audience: "mcp" as const, permissions: [] };
    const denied = await authorizeMcpActions(host, client, home, reference);
    await assert.rejects(denied.service.invoke(denied.context, ticketStep.ref, { title: "未授权", priority: "low" }));
    assert.equal(tickets.length, 3);
    await writeMcpActionGrant(home, createMcpActionGrant(client.actor_id, PROJECT, view, true));
    const granted = await authorizeMcpActions(host, client, home, reference);
    assert.deepEqual(await granted.service.invoke(granted.context, ticketStep.ref, { title: "MCP 建单", priority: "low" }), { ticket_id: 4 });
    assert.equal(tickets[3]!.title, "MCP 建单");
    assert.ok(host.callLog!.list(PROJECT).some(row => row.capability_id === "fixture.tickets.create" && row.actor_id === "client-tickets" && row.audience === "mcp" && row.ok),
      "the call log names the client, not the local user");

    // The nested action has already started. A cancelled outer call must retain the
    // uncertain attempt exactly as it was, even when the nested provider reports failure.
    for (const fail of [false, true]) {
      const instance = (await actions.invoke(w.start, { id: workflow.workflow_id, item_id: item.item_id })).instance;
      const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
      pauseTicket = async () => { entered.resolve(); await release.promise; };
      const controller = new AbortController();
      const pending = host.actionClient(reference).invoke({ ...caller, signal: controller.signal }, w.continue, { id: instance.instance_id });
      const rejected = assert.rejects(pending);
      await entered.promise;
      const read = () => { const store = openWorkflowsStore(home); try { return store.instance(instance.instance_id, PROJECT); } finally { store.close(); } };
      const before = read();
      assert.ok(before.steps[0]!.pending?.attempted_at);
      controller.abort(); failNext = fail; release.resolve();
      await rejected;
      assert.deepEqual(read(), before, "cancelled outer calls cannot save completion or failure bookkeeping");
      pauseTicket = undefined;
      await assert.rejects(actions.invoke(w.continue, { id: instance.instance_id }), { code: "workflows.uncertain" });
    }

    // Directory-like errors can come from downstream after the original handler already wrote.
    // Neither authorization nor validation codes are proof that an ordinary continue is safe.
    for (const code of ["actions.forbidden", "actions.input_invalid"]) {
      const before = tickets.length;
      failAfterWrite = code;
      const partial = (await actions.invoke(w.start, { id: workflow.workflow_id, item_id: item.item_id })).instance;
      await assert.rejects(actions.invoke(w.continue, { id: partial.instance_id }), { code });
      assert.equal(tickets.length, before + 1);
      const saved = (await actions.invoke(w.instance, { id: partial.instance_id })).instance;
      assert.ok(saved.steps[0]!.pending?.attempted_at);
      assert.equal(saved.steps[0]!.pending?.attempt_error, "工单已写入，后续步骤失败");
      await assert.rejects(actions.invoke(w.continue, { id: partial.instance_id }), { code: "workflows.uncertain" });
      assert.equal(tickets.length, before + 1, "ordinary continue must not repeat the write");
      await actions.invoke(w.continue, { id: partial.instance_id, retry_action: true });
      assert.equal(tickets.length, before + 2, "only an explicit retry sends another call");
    }

    // The plugin goes away: the step keeps its reference, says why, and does not run.
    const third = (await actions.invoke(w.start, { id: workflow.workflow_id, item_id: item.item_id })).instance;
    await runtime.stop(installed.install_id);
    assert.deepEqual((await actions.invoke(w.instance, { id: run.instance_id })).instance.steps[1]!.result_presentation, afterTicket.steps[1]!.result_presentation, "removing the provider does not rewrite the historical return");
    const described = (await actions.invoke(w.get, { id: workflow.workflow_id })).workflow;
    assert.equal(described.stations[1]!.availability?.available, false);
    assert.equal(described.stations[1]!.action?.ref.capability_id, "fixture.tickets.create");
    await assert.rejects(actions.invoke(w.start, { id: workflow.workflow_id, item_id: item.item_id }), { code: "workflows.unavailable" });
    await assert.rejects(actions.invoke(w.continue, { id: third.instance_id }), { code: "workflows.unavailable" });
    assert.equal(tickets.length, 9, "includes the successful nested call already dispatched before cancellation; nothing after the plugin went away");
  } finally {
    await runtime.stop(installed.install_id).catch(() => undefined);
    await host.close();
    rmSync(home, { recursive: true, force: true });
  }
});
