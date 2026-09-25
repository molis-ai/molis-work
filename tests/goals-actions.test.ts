import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { goalsActions, hostEventDecisionAuthority, createGoalIntentCapability, listGoalDirectoryCapability, recordGoalNoteCapability } from "@molis-ai/molis-work-plugin-goals";
import type { ResolvedPlanningMethodPack } from "@molis-ai/molis-work-contracts/modules/goals";
import { goalContextCapabilities } from "@molis-ai/molis-work-contracts/modules/goals";
import { bindActionClient, type ActionCallContext, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { createMcpActionGrant, hostActionToolName } from "../apps/local-host/src/mcp-action-grants.js";
import { writeMcpActionGrant } from "../apps/local-host/src/mcp-settings-store.js";
import { DEFAULT_GOAL_POLICY, BUILTIN_PLANNING_METHOD_PACKS } from "@molis-ai/molis-work-module-goals";

test("Goals public actions and typed consumers share records, idempotency, audit identity and live policy", async () => {
  const home = await mkdtemp(join(tmpdir(), "goals-actions-"));
  const project = await withCatalog({ homeDirectory: home }, c => c.createProject({ display_name: "Goals", actor_id: "user" }));
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, boardId: project.board_id, databasePath: project.database_path });
  let blocked = false, creates = 0;
  const host = new MolisWorkLocalHost({ homeDirectory: home, actionAvailability: (_caller, view) => {
    if (view.capability_id === goalsActions.create.capability_id) {
      creates++;
      if (blocked) return { available: false, code: "actions.plugin_disabled", reason: "Disabled in test" };
    }
    return { available: true };
  } });
  const caller: ActionCallContext = { actor_id: "runtime:actions", project_id: project.project_id, audience: "agent", permissions: ["goals:read", "goals:write"] };
  const actions = host.actionClient(ref), typed = host.client(ref);
  const bound = bindActionClient(actions, () => caller);
  try {
    const input = { title: "通过同一动作", goal_id: "ACTION-GOAL", outcome: "用户能看到结果", idempotency_key: "create-one", source_kind: "runtime" as const };
    await assert.rejects(actions.invoke({ ...caller, permissions: ["goals:read"] }, goalsActions.create, input));
    await assert.rejects(actions.invoke(caller, goalsActions.create, { ...input, actor_id: "forged" } as never), { code: "actions.input_invalid" });
    const created = await bound.invoke(goalsActions.create, input);
    assert.equal(created.goal.goal_id, input.goal_id);
    assert.equal(created.completion_effect, false);
    const replay = await typed.invoke(createGoalIntentCapability, { ...input, board_id: project.board_id, actor_id: caller.actor_id, actor_kind: "runtime" });
    assert.equal(replay.replayed, true);
    assert.equal(replay.observed_event_cursor, created.observed_event_cursor);
    const note = { goal_id: input.goal_id, body: "这句话必须到指定目标", idempotency_key: "note-one" };
    const recorded = await typed.invoke(recordGoalNoteCapability, { ...note, board_id: project.board_id, actor_id: caller.actor_id, actor_kind: "runtime" });
    assert.equal(recorded.recorded, true);
    assert.deepEqual(await actions.invoke(caller, goalsActions.note, note), { ...recorded, replayed: true });
    await assert.rejects(actions.invoke(caller, goalsActions.note, { ...note, body: "不同内容" }));
    await assert.rejects(actions.invoke(caller, goalsActions.note, { ...note, board_id: "other-board" } as never), { code: "actions.input_invalid" });
    await assert.rejects(typed.invoke(recordGoalNoteCapability, { ...note, board_id: "other-board", actor_id: "user" }), { code: "actions.scope_mismatch" });
    await assert.rejects(actions.invoke({ ...caller, project_id: "other-project" }, goalsActions.note, note), { code: "actions.scope_mismatch" });
    const event = await host.withProject(ref, runtime => runtime.coordinator.goalEvents.readEvent(project.board_id, input.goal_id, recorded.event_id));
    assert.equal(event.actor_id, caller.actor_id);
    assert.equal(event.actor_kind, "runtime");
    assert.equal((event.payload as { body: string }).body, note.body);
    const legacy = await typed.invoke(recordGoalNoteCapability, { ...note, body: "旧内部身份", idempotency_key: "legacy-note", board_id: project.board_id, actor_id: "legacy-owner" });
    const oldEvent = await host.withProject(ref, runtime => runtime.coordinator.goalEvents.readEvent(project.board_id, input.goal_id, legacy.event_id));
    assert.equal(oldEvent.actor_kind, null, "unclassified legacy identity must not be rewritten as a user decision");
    assert.equal(oldEvent.actor_id, "legacy-owner");
    await bound.invoke(goalsActions.create, { title: "第二个目标", goal_id: "SECOND-ACTION-GOAL", idempotency_key: "create-second" });
    const page = await bound.invoke(goalsActions.list, { limit: 1 });
    assert.equal(page.goals.length, 1);
    assert.ok(page.next_cursor, "two goals must produce a real pagination cursor");
    assert.deepEqual(await typed.invoke(listGoalDirectoryCapability, { board_id: project.board_id, limit: 1 }), page);
    const all = await typed.invoke(goalContextCapabilities.list, {});
    assert.ok(all.goals.some(goal => goal.goal_id === input.goal_id && goal.work_status === "open"));
    const next = await bound.invoke(goalsActions.list, { limit: 1, after_cursor: page.next_cursor });
    assert.equal(next.goals.length, 1);
    assert.ok(next.goals.every(goal => goal.goal_id !== page.goals[0]!.goal_id));
    blocked = true;
    const before = creates;
    await assert.rejects(typed.invoke(createGoalIntentCapability, { ...input, goal_id: "DENIED", idempotency_key: "denied", board_id: project.board_id, actor_id: "user" }), { code: "actions.plugin_disabled" });
    assert.ok(creates > before, "the old typed entry must reach the shared action policy");
    await assert.rejects(host.withProject(ref, runtime => runtime.coordinator.goalQueries.getGoal(project.board_id, "DENIED")), { code: "goal.not_found" });
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});

test("official MCP launcher discovers granted Goals actions and writes into the shared Host", { timeout: 60_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "goals-actions-mcp-"));
  const project = await withCatalog({ homeDirectory: home }, c => c.createProject({ display_name: "MCP Goals", actor_id: "user" }));
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, boardId: project.board_id, databasePath: project.database_path });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const caller: ActionCallContext = { actor_id: "runtime:goals-actions", project_id: project.project_id, audience: "mcp", permissions: [] };
  const server = createMolisWorkWebServer({ homeDirectory: home, localHost: host });
  const sdk = new Client({ name: "untrusted-client-name", version: "1" });
  try {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    await withCatalog({ homeDirectory: home }, c => c.bindRuntimeContext({
      context: { runtime_id: "goals-actions", stable_work_context_id: "goals-actions-session", host_declares_stable: true },
      project_id: project.project_id, actor_id: "user", user_confirmed: true,
    }));
    const transport = new StdioClientTransport({ command: process.execPath, args: ["--import", "tsx", fileURLToPath(new URL("../apps/desktop/launchers/mcp/server.ts", import.meta.url))], env: {
      ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
      MOLIS_WORK_HOME: home, MOLIS_WORK_WEB_URL: origin, MOLIS_WORK_RUNTIME_ID: "goals-actions",
      MOLIS_WORK_WORK_CONTEXT_ID: "goals-actions-session", MOLIS_WORK_WORK_CONTEXT_STABLE: "true",
    }, stderr: "pipe" });
    let errors = ""; transport.stderr?.on("data", chunk => { errors += String(chunk); });
    await sdk.connect(transport).catch(error => { throw new Error(String(error) + errors); });
    const name = hostActionToolName(goalsActions.create);
    assert.equal((await sdk.listTools()).tools.some(tool => tool.name === name), false);
    const views = (await host.inspectActions(caller, ref)).filter(view => Object.values(goalsActions).some(action => action.capability_id === view.capability_id));
    assert.equal(views.length, 40);
    assert.equal(views.some(view => view.capability_id === goalsActions.decide.capability_id), false);
    for (const view of views) await writeMcpActionGrant(home, createMcpActionGrant(caller.actor_id, project.project_id, view, true));
    assert.equal((await sdk.listTools()).tools.some(tool => tool.name === name), true);
    assert.equal((await sdk.listTools()).tools.some(tool => tool.name === hostActionToolName(goalsActions.decide)), false);
    assert.equal((await sdk.callTool({ name: hostActionToolName(goalsActions.decide), arguments: { goal_id: "forged", idempotency_key: "forged",
      conclusion: "model pretending to approve", user_confirmed: true, authority: { actor_kind: "user", authority_source: "web" } } })).isError, true);
    const input = { title: "外部客户端目标", goal_id: "MCP-ACTION-GOAL", idempotency_key: "mcp-create",
      requirements: [{ requirement_id: "delivered", statement: "交付完整正文" }] };
    const created = await sdk.callTool({ name, arguments: input });
    assert.equal(created.isError, false, JSON.stringify(created));
    assert.equal((created.structuredContent as { goal: { goal_id: string } }).goal.goal_id, input.goal_id);
    const state = await host.withProject(ref, runtime => runtime.coordinator.goalEvents.readState(project.board_id, input.goal_id));
    assert.equal(state.intent.source_kind, "runtime", "a model-created goal must not default to Web provenance");
    const noteInput = { goal_id: input.goal_id, body: "来自标准 MCP 的原文", idempotency_key: "mcp-note" };
    const noteName = hostActionToolName(goalsActions.note);
    const note = await sdk.callTool({ name: noteName, arguments: noteInput });
    assert.equal(note.isError, false, JSON.stringify(note));
    const eventId = (note.structuredContent as { event_id: string }).event_id;
    const event = await host.withProject(ref, runtime => runtime.coordinator.goalEvents.readEvent(project.board_id, input.goal_id, eventId));
    assert.equal(event.actor_id, caller.actor_id); assert.equal(event.actor_kind, "runtime");
    assert.equal((event.payload as { body: string }).body, noteInput.body);
    const replay = await sdk.callTool({ name: noteName, arguments: noteInput });
    assert.equal((replay.structuredContent as { replayed: boolean }).replayed, true);
    const listed = await sdk.callTool({ name: hostActionToolName(goalsActions.list), arguments: {} });
    assert.ok((listed.structuredContent as { goals: Array<{ goal_id: string }> }).goals.some(goal => goal.goal_id === input.goal_id));
    assert.equal((await sdk.callTool({ name: noteName, arguments: { ...noteInput, actor_kind: "user" } })).isError, true);
    const stateResult = await sdk.callTool({ name: hostActionToolName(goalsActions.state), arguments: { goal_id: input.goal_id } });
    assert.equal(stateResult.isError, false, JSON.stringify(stateResult));
    const publicState = stateResult.structuredContent as { goal_id: string; intent: { title: string } };
    assert.equal(publicState.goal_id, input.goal_id);
    assert.equal(publicState.intent.title, input.title);
    const documentName = hostActionToolName(goalsActions.document);
    const readDocument = await sdk.callTool({ name: documentName, arguments: { goal_id: input.goal_id } });
    assert.equal(readDocument.isError, false, JSON.stringify(readDocument));
    const document = readDocument.structuredContent as { description: { title: string }; timeline: { items: Array<{ event_id: string }> } };
    assert.equal(document.description.title, input.title);
    assert.ok(document.timeline.items.some(item => item.event_id === eventId));
    await writeMcpActionGrant(home, createMcpActionGrant(caller.actor_id, project.project_id, views.find(v => v.capability_id === goalsActions.document.capability_id)!, false));
    assert.equal((await sdk.listTools()).tools.some(tool => tool.name === documentName), false);
    assert.equal((await sdk.callTool({ name: documentName, arguments: { goal_id: input.goal_id } })).isError, true);
    const eventResult = await sdk.callTool({ name: hostActionToolName(goalsActions.event), arguments: { goal_id: input.goal_id, event_id: eventId } });
    assert.equal(eventResult.isError, false, JSON.stringify(eventResult));
    assert.deepEqual(eventResult.structuredContent, { result: event });
    const missing = await sdk.callTool({ name: hostActionToolName(goalsActions.directoryItem), arguments: { goal_id: "MISSING" } });
    assert.equal(missing.isError, false, JSON.stringify(missing));
    assert.deepEqual(missing.structuredContent, { result: null });
    const history = await sdk.callTool({ name: hostActionToolName(goalsActions.historyItem), arguments: { goal_id: input.goal_id, item_id: eventId } });
    assert.equal(history.isError, false, JSON.stringify(history));
    assert.match((history.structuredContent as { result: { html: string } }).result.html, /来自标准 MCP 的原文/);
    const invokeWork = async <Input, Output>(action: ActionDefinition<Input, Output>, payload: Omit<Input, "goal_id">): Promise<Output> => {
      const result = await sdk.callTool({ name: hostActionToolName(action), arguments: { goal_id: input.goal_id, ...payload } });
      assert.equal(result.isError, false, JSON.stringify(result));
      return result.structuredContent as Output;
    };
    const invokePlanning = async <Input, Output>(action: ActionDefinition<Input, Output>, payload: Input): Promise<Output> => {
      const result = await sdk.callTool({ name: hostActionToolName(action), arguments: payload as Record<string, unknown> });
      assert.equal(result.isError, false, JSON.stringify(result));
      return result.structuredContent as Output;
    };
    const lifecycleInput = { goal_id: input.goal_id, reason: "用户确认整理", idempotency_key: "public-active" };
    assert.equal((await invokePlanning(goalsActions.active, lifecycleInput)).active_goal_id, input.goal_id);
    const legacyActive = { ...lifecycleInput, idempotency_key: "legacy-active" };
    assert.equal((await sdk.callTool({ name: "molis_work_v1_active_goal", arguments: legacyActive })).isError, false);
    const trashInput = { ...lifecycleInput, user_confirmed: true, idempotency_key: "public-trash", trashed: true };
    assert.equal((await sdk.callTool({ name: hostActionToolName(goalsActions.trash), arguments: { ...trashInput, user_confirmed: false } })).isError, true);
    const trashed = await invokePlanning(goalsActions.trash, trashInput);
    assert.equal(trashed.status, "trashed"); assert.equal(trashed.active_goal_cleared, true);
    assert.equal((await invokePlanning(goalsActions.trashed, {})).goals[0]?.goal_id, input.goal_id);
    const legacyList = await sdk.callTool({ name: "molis_work_v1_goal_trash_list", arguments: {} });
    assert.equal(legacyList.isError, false, JSON.stringify(legacyList));
    const parseLegacy = (result: Awaited<ReturnType<typeof sdk.callTool>>) => JSON.parse((result.content as Array<{ type: string; text: string }>).find(item => item.type === "text")!.text);
    assert.equal(parseLegacy(legacyList).goals[0].goal_id, input.goal_id);
    const legacyTrash = { ...lifecycleInput, user_confirmed: true, idempotency_key: "legacy-restore" };
    assert.equal((await sdk.callTool({ name: "molis_work_v1_goal_restore", arguments: { ...legacyTrash, trashed: true } })).isError, true);
    const restored = await sdk.callTool({ name: "molis_work_v1_goal_restore", arguments: legacyTrash });
    assert.equal(restored.isError, false, JSON.stringify(restored));
    assert.equal(parseLegacy(restored).status, "restored"); assert.equal(parseLegacy(restored).work_state.status, "open");
    const legacyTrashed = await sdk.callTool({ name: "molis_work_v1_goal_trash", arguments: { ...legacyTrash, idempotency_key: "legacy-trash" } });
    assert.equal(legacyTrashed.isError, false, JSON.stringify(legacyTrashed));
    assert.equal(parseLegacy(legacyTrashed).goal.trashed_by, "runtime:goals-actions:goals-actions-session");
    assert.equal(parseLegacy(legacyTrashed).next_action.kind, "report_recoverable_trash");
    await invokePlanning(goalsActions.trash, { ...trashInput, trashed: false, idempotency_key: "public-restore" });
    const trashGrant = views.find(view => view.capability_id === goalsActions.trash.capability_id)!;
    await writeMcpActionGrant(home, createMcpActionGrant(caller.actor_id, project.project_id, trashGrant, false));
    const lifecycleTools = (await sdk.listTools()).tools;
    for (const name of [hostActionToolName(goalsActions.trash), "molis_work_v1_goal_trash", "molis_work_v1_goal_restore"]) {
      assert.equal(lifecycleTools.some(tool => tool.name === name), false);
      assert.equal((await sdk.callTool({ name, arguments: name === hostActionToolName(goalsActions.trash) ? { ...trashInput, idempotency_key: "denied" } : { ...legacyTrash, idempotency_key: "denied" } })).isError, true);
    }
    assert.deepEqual((await invokePlanning(goalsActions.trashed, {})).goals, []);
    const guidance = await invokePlanning(goalsActions.guidanceAdd, { kind: "constraint", content: "保留用户原始文件。", reason: "数据边界",
      confirmation_summary: "已向用户展示精确原文并确认", user_confirmed: true, idempotency_key: "public-guidance" });
    assert.equal(guidance.entry.created_by, caller.actor_id);
    assert.match((await invokePlanning(goalsActions.guidanceRead, {})).runtime_prompt_prefix, /保留用户原始文件/);
    const guidanceUpdate = { guidance_id: guidance.entry.guidance_id, action: "edit" as const, kind: "constraint" as const,
      content: "保留用户原始文件和备份。", reason: "补充备份边界", confirmation_summary: "用户同意修改", user_confirmed: true, idempotency_key: "legacy-guidance-edit" };
    const legacyGuidance = await sdk.callTool({ name: "molis_work_v1_project_guidance_update", arguments: guidanceUpdate });
    assert.equal(legacyGuidance.isError, false, JSON.stringify(legacyGuidance));
    const afterGuidance = await invokePlanning(goalsActions.guidanceRead, {});
    assert.equal(afterGuidance.entries[0]?.revision, 2);
    assert.equal(afterGuidance.entries[0]?.updated_by, "runtime:goals-actions:goals-actions-session");
    assert.match(afterGuidance.runtime_prompt_prefix, /保留用户原始文件和备份/);
    await invokePlanning(goalsActions.guidanceUpdate, { ...guidanceUpdate, action: "deactivate", idempotency_key: "public-guidance-off" });
    assert.equal((await invokePlanning(goalsActions.guidanceRead, {})).entries.length, 0);
    const guidanceGrant = views.find(view => view.capability_id === goalsActions.guidanceUpdate.capability_id)!;
    await writeMcpActionGrant(home, createMcpActionGrant(caller.actor_id, project.project_id, guidanceGrant, false));
    const toolsAfterRevoke = (await sdk.listTools()).tools;
    assert.equal(toolsAfterRevoke.some(tool => tool.name === "molis_work_v1_project_guidance_update"), false);
    assert.equal((await sdk.callTool({ name: "molis_work_v1_project_guidance_update", arguments: { ...guidanceUpdate, action: "restore", idempotency_key: "denied-guidance" } })).isError, true);
    assert.equal((await invokePlanning(goalsActions.guidanceRead, {})).inactive_entries[0]?.revision, 3);
    const planning = await invokePlanning(goalsActions.planningRead, {});
    const software = planning.methods.find(method => method.method_id === "domain-software-development")!;
    const adopted = await invokePlanning(goalsActions.planningApply, { method_id: software.method_id, user_confirmed: true });
    assert.deepEqual(adopted.method.event_types, software.event_types);
    assert.deepEqual(adopted.method.default_requirements, software.default_requirements);
    const { scope: _scope, version: _version, created_at: _created, updated_at: _updated, overridden_scopes: _overrides, ...method } = software as ResolvedPlanningMethodPack;
    const planningSaved = await invokePlanning(goalsActions.planningSave, { method: { ...method, enabled: false }, user_confirmed: true });
    assert.equal(planningSaved.method.version, software.version + 1);
    assert.equal((await invokePlanning(goalsActions.planningRead, {})).composition.method_pack_ids.includes(method.method_id), false);
    assert.deepEqual((await invokePlanning(goalsActions.planningImpact, { changed_goal_ids: [input.goal_id] })).changed_goal_ids, [input.goal_id]);
    assert.deepEqual((await invokePlanning(goalsActions.planningGraph, {})).issues, []);
    const planningGrant = views.find(view => view.capability_id === goalsActions.planningApply.capability_id)!;
    await writeMcpActionGrant(home, createMcpActionGrant(caller.actor_id, project.project_id, planningGrant, false));
    assert.equal((await sdk.listTools()).tools.some(tool => tool.name === hostActionToolName(goalsActions.planningApply)), false);
    assert.equal((await sdk.callTool({ name: hostActionToolName(goalsActions.planningApply), arguments: { method_id: method.method_id, user_confirmed: true } })).isError, true);
    assert.equal((await invokePlanning(goalsActions.planningRead, {})).methods.find(item => item.method_id === method.method_id)?.version, software.version + 1);
    const configured = await invokeWork(goalsActions.configure, { expected_version: 0, idempotency_key: "public-config",
      types: [{ type_id: "work", version: 1, name: "实际交付", purpose: "完整原文", fields: [{ field_id: "body", name: "内容", purpose: "工作事实", format: "text", required: true }] }],
      requirement_bindings: [{ type_id: "work", requirement_id: "delivered" }] });
    assert.equal(configured.config.version, 1);
    const reported = await invokeWork(goalsActions.report, { idempotency_key: "public-report", events: [{ type_id: "work", type_version: 1,
      title: "外部真实交付", fields: { body: "标准 MCP 保存的报告正文" }, judgments: [{ requirement_id: "delivered", verdict: "supports" }] }] });
    assert.equal(reported.events[0]!.actor_id, caller.actor_id);
    const progressed = await invokeWork(goalsActions.progress, { idempotency_key: "public-progress", based_on_cursor: reported.goal_event_cursor, summary: "报告已交付" });
    assert.equal(progressed.progress_summary.summary, "报告已交付");
    const receiptName = hostActionToolName(goalsActions.progressReceipt);
    const receipt = await sdk.callTool({ name: receiptName, arguments: { goal_id: input.goal_id, idempotency_key: "public-progress" } });
    assert.equal(receipt.isError, false, JSON.stringify(receipt));
    assert.deepEqual(receipt.structuredContent, { result: { ...progressed, replayed: true } });
    const absentReceipt = await sdk.callTool({ name: receiptName, arguments: { goal_id: input.goal_id, idempotency_key: "never-written" } });
    assert.equal(absentReceipt.isError, false, JSON.stringify(absentReceipt));
    assert.deepEqual(absentReceipt.structuredContent, { result: null });
    assert.equal((await sdk.callTool({ name: receiptName, arguments: { goal_id: input.goal_id, idempotency_key: "public-progress", actor_id: "other-user" } })).isError, true);
    const concern = await invokeWork(goalsActions.concern, { idempotency_key: "public-concern", action: "open", title: "继续核对", statement: "需要复查", blocks_closure: false, scope: { event_ids: [reported.events[0]!.event_id] } });
    assert.equal(concern.concern.status, "open");
    const requested = await invokeWork(goalsActions.requestDecision, { idempotency_key: "public-request", question: "是否允许发布？", purpose: "action",
      options: [{ option_id: "yes", label: "允许", impact: "可发布" }, { option_id: "no", label: "拒绝", impact: "继续核对" }], scope: { action: "publish" } });
    const approved = await host.withProject(ref, runtime => runtime.coordinator.goalEvents.recordTrustedDecision({
      board_id: project.board_id, goal_id: input.goal_id, idempotency_key: "real-user", authority: hostEventDecisionAuthority("web", project.board_id, "real-user", "real-user"),
      request_id: requested.decision_request.request_id, selected_option_id: "yes", conclusion: "允许发布", effects: [{ kind: "authorize_action", action: "publish" }], scope: { action: "publish" },
    }));
    const cited = await invokeWork(goalsActions.citeDecision, { idempotency_key: "public-cite", decision_id: approved.decision.decision_id, scope: { action: "publish" } });
    assert.equal(cited.decision.actor_id, "real-user");
    const current = await invokeWork(goalsActions.state, {});
    const agreed = await invokeWork(goalsActions.agree, { idempotency_key: "public-agree", expected_config_version: current.config.version,
      expected_agreement_version: current.agreement.version, outcome: "用户能查看交付" });
    const closed = await invokeWork(goalsActions.close, { idempotency_key: "public-close", kind: "cancel", reason: "结束此轮测试",
      expected_config_version: current.config.version, expected_agreement_version: agreed.agreement.version });
    assert.equal(closed.work_status, "cancelled");
    assert.equal((await invokeWork(goalsActions.resume, { idempotency_key: "public-resume", reason: "继续实际工作" })).work_status, "open");
    const finalState = await invokeWork(goalsActions.state, {});
    const completed = await invokeWork(goalsActions.close, { kind: "complete", result: "用户可查看完整报告", reason: "完成交付", idempotency_key: "public-complete",
      expected_config_version: finalState.config.version, expected_agreement_version: finalState.agreement.version });
    assert.equal(completed.work_status, "completed", JSON.stringify(completed));
    const archived = await invokePlanning(goalsActions.archive, { goal_id: input.goal_id, archived: true, reason: "整理已完成目标", idempotency_key: "public-archive" });
    assert.ok(archived.goal.archived_at); assert.equal(archived.goal.fulfillment_state, "satisfied");
    assert.equal((await invokePlanning(goalsActions.archive, { goal_id: input.goal_id, archived: false, reason: "恢复查看", idempotency_key: "public-unarchive" })).goal.archived_at, null);
    const treeInput = { summary: "MCP structure proposal", idempotency_key: "legacy-tree", items: [{ item_id: "mcp-tree-child",
      kind: "goal" as const, operation: "create" as const, payload: { goal_id: "MCP-TREE-CHILD", title: "Needs user approval" },
      source_refs: ["mcp-session"], reason: "Proposed work", confidence: 1 }] };
    const proposedWire = await sdk.callTool({ name: "molis_work_v1_goal_tree_propose", arguments: treeInput });
    assert.equal(proposedWire.isError, false, JSON.stringify(proposedWire));
    const proposed = parseLegacy(proposedWire);
    assert.equal(proposed.proposal.submitted_by, "runtime:goals-actions:goals-actions-session");
    assert.equal(proposed.proposal.submitted_session_id, "goals-actions-session", "the shared gateway preserves trusted session provenance");
    assert.equal(parseLegacy(await sdk.callTool({ name: "molis_work_v1_goal_tree_propose", arguments: treeInput })).replayed, true);
    const treeQuery = { proposal_id: proposed.proposal.proposal_id };
    const treeCheck = { ...treeQuery, idempotency_key: "legacy-tree-check" };
    const checkedWire = await sdk.callTool({ name: "molis_work_v1_goal_tree_check", arguments: treeCheck });
    assert.equal(checkedWire.isError, false, JSON.stringify(checkedWire));
    assert.deepEqual(parseLegacy(checkedWire).conflict_item_ids, []);
    assert.deepEqual(parseLegacy(await sdk.callTool({ name: "molis_work_v1_goal_tree_read", arguments: treeQuery })), await invokePlanning(goalsActions.treeRead, treeQuery));
    await invokePlanning(goalsActions.treeCheck, { ...treeQuery, idempotency_key: "public-tree-check" });
    const publicProposal = await invokePlanning(goalsActions.treeSubmit, { ...treeInput, idempotency_key: "public-tree", items: [{ ...treeInput.items[0]!,
      item_id: "public-tree", payload: { goal_id: "PUBLIC-TREE-CHILD", title: "Another pending proposal" } }] });
    assert.equal(publicProposal.proposal.submitted_by, caller.actor_id);
    assert.deepEqual(await invokePlanning(goalsActions.directoryItem, { goal_id: "MCP-TREE-CHILD" }), { result: null });
    for (const tool of ["molis_work_v1_goal_tree_decide", hostActionToolName(goalsActions.treeDecide)]) {
      assert.equal((await sdk.listTools()).tools.some(t => t.name === tool), false);
      assert.equal((await sdk.callTool({ name: tool, arguments: { ...treeQuery, idempotency_key: "forged-tree", confirm_all_pending: true,
        user_confirmed: true, authority: { actor_id: "user", actor_kind: "user", authority_source: "web" } } })).isError, true);
    }
    for (const tool of ["molis_work_v1_goal_tree_propose", hostActionToolName(goalsActions.treeSubmit)]) {
      assert.equal((await sdk.callTool({ name: tool, arguments: { ...treeInput, submitted_session_id: "forged" } })).isError, true);
    }
    const treeSubmitView = views.find(v => v.capability_id === goalsActions.treeSubmit.capability_id)!;
    await writeMcpActionGrant(home, createMcpActionGrant(caller.actor_id, project.project_id, treeSubmitView, false));
    for (const tool of ["molis_work_v1_goal_tree_propose", hostActionToolName(goalsActions.treeSubmit)]) {
      assert.equal((await sdk.listTools()).tools.some(t => t.name === tool), false);
      assert.equal((await sdk.callTool({ name: tool, arguments: treeInput })).isError, true);
    }
    assert.equal((await invokePlanning(goalsActions.treeRead, {})).proposals.length, 2);
    const reportView = views.find(view => view.capability_id === goalsActions.report.capability_id)!;
    await writeMcpActionGrant(home, createMcpActionGrant(caller.actor_id, project.project_id, reportView, false));
    assert.equal((await sdk.callTool({ name: hostActionToolName(goalsActions.report), arguments: { goal_id: input.goal_id,
      idempotency_key: "denied-report", events: [{ type_id: "work", type_version: 1, title: "不能写入", fields: { body: "拒绝后不能保存" } }] } })).isError, true);
    const afterWrites = await host.withProject(ref, runtime => runtime.coordinator.goalEvents.listEvents(project.board_id, input.goal_id, { limit: 100 }));
    assert.equal(afterWrites.events.filter(event => event.kind === "report").length, 1);
    const noteView = views.find(view => view.capability_id === goalsActions.note.capability_id)!;
    await writeMcpActionGrant(home, createMcpActionGrant(caller.actor_id, project.project_id, noteView, false));
    assert.equal((await sdk.listTools()).tools.some(tool => tool.name === noteName), false);
    assert.equal((await sdk.callTool({ name: noteName, arguments: { ...noteInput, idempotency_key: "denied-note" } })).isError, true);
    const events = await host.withProject(ref, runtime => runtime.coordinator.goalEvents.listEvents(project.board_id, input.goal_id));
    assert.equal(events.events.filter(event => event.kind === "system" && event.payload.operation === "observation_note").length, 1);
    const personal = { ...BUILTIN_PLANNING_METHOD_PACKS.find(m => m.method_id === "domain-software-development")!, method_id: "mcp-personal-live", name: "Current personal method" };
    await withCatalog({ homeDirectory: home }, c => c.personalPlanningMethods.save(personal, new Date().toISOString()));
    assert.equal((await invokePlanning(goalsActions.planningRead, {})).methods.find(m => m.method_id === personal.method_id)?.name, personal.name);
    const nextPersonal = await withCatalog({ homeDirectory: home }, c => c.personalPlanningMethods.save({ ...personal, name: "Updated while connected" }, new Date().toISOString()));
    const publicPersonal = (await invokePlanning(goalsActions.planningRead, {})).methods.find(m => m.method_id === personal.method_id)!;
    assert.equal(publicPersonal.version, nextPersonal.version); assert.equal(publicPersonal.name, nextPersonal.name);
    // The earlier planning test revoked this grant; the new apply is a distinct authorized operation.
    await writeMcpActionGrant(home, createMcpActionGrant(caller.actor_id, project.project_id, views.find(v => v.capability_id === goalsActions.planningApply.capability_id)!, true));
    const copiedPersonal = await invokePlanning(goalsActions.planningApply, { method_id: personal.method_id, user_confirmed: true });
    assert.equal(copiedPersonal.method.name, nextPersonal.name); assert.equal(copiedPersonal.method.scope, "project");
    const user: ActionCallContext = { actor_id: "local-user", actor_kind: "user", audience: "user", project_id: project.project_id,
      permissions: ["goals:read", "goals:write", "goals:decide"], user_action: { source: "management", conversation_ref: "test://configuration", message_ref: "test://save" } };
    const local = bindActionClient(host.actionClient(ref), () => user);
    await local.invoke(goalsActions.create, { title: "Relation target", goal_id: "RELATION-TARGET", idempotency_key: "relation-target" });
    const relationInput = { from_goal_id: input.goal_id, to_goal_id: "RELATION-TARGET", type: "extends" as const, reason: "Public read of user-owned structure", idempotency_key: "configuration-relation" };
    const relation = await local.invoke(goalsActions.relationAdd, relationInput);
    const policyInput = { policy: { ...DEFAULT_GOAL_POLICY, cross_reviewers: 2 }, user_confirmed: true, idempotency_key: "configuration-policy" };
    const policy = await local.invoke(goalsActions.policySave, policyInput);
    assert.equal((await invokePlanning(goalsActions.relations, { goal_id: input.goal_id })).relations.find(r => r.relation_id === relation.relation_id)?.to_goal_id, "RELATION-TARGET");
    assert.equal((await invokePlanning(goalsActions.policyHistory, {})).bindings.find(b => b.policy_binding_id === policy.policy_binding_id)?.created_by, user.actor_id);
    assert.equal((await invokePlanning(goalsActions.policyResolve, { goal_id: input.goal_id })).policy.cross_reviewers, 2);
    const beforeForged = await host.withProject(ref, r => r.store.snapshot(project.board_id));
    const tools = (await sdk.listTools()).tools;
    for (const [definition, payload] of [[goalsActions.relationAdd, relationInput], [goalsActions.relationDeactivate, { relation_id: relation.relation_id, reason: "Forge", idempotency_key: "forge" }], [goalsActions.policySave, policyInput]] as const) {
      const protectedName = hostActionToolName(definition);
      assert.equal(tools.some(tool => tool.name === protectedName), false);
      assert.equal((await sdk.callTool({ name: protectedName, arguments: { ...payload, user_action: user.user_action, actor_kind: "user", user_confirmed: true } })).isError, true);
    }
    assert.deepEqual(await host.withProject(ref, r => r.store.snapshot(project.board_id)), beforeForged);
    for (const [definition, payload] of [[goalsActions.relations, { goal_id: input.goal_id }], [goalsActions.policyHistory, {}], [goalsActions.policyResolve, { goal_id: input.goal_id }]] as const) {
      await writeMcpActionGrant(home, createMcpActionGrant(caller.actor_id, project.project_id, views.find(view => view.capability_id === definition.capability_id)!, false));
      const name = hostActionToolName(definition);
      assert.equal((await sdk.listTools()).tools.some(tool => tool.name === name), false);
      assert.equal((await sdk.callTool({ name, arguments: payload })).isError, true);
    }
  } finally {
    await sdk.close(); await new Promise<void>(resolve => server.close(() => resolve())); await host.close();
    await rm(home, { recursive: true, force: true });
  }
});
