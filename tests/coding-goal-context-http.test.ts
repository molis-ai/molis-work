import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
// Host and Coding surface come from the same modules, so one project platform serves both.
import { seedDemoBoard, DEMO_PROJECT_ID, codingRouteHooks, handleProjectPluginHttp, releaseProjectPlugins } from "@molis-ai/molis-work-app-local-host";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { CODING_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-coding";
import { agentHostCapabilities as agent, AGENT_RUNTIME_CAPABILITIES, type AgentRunView, type AgentRuntimeCapabilityMatrix, type AgentStartRequest } from "@molis-ai/molis-work-contracts/services/agent-host";
import { goalPluginActions } from "@molis-ai/molis-work-contracts/modules/goal-actions";
import type { HostPluginCaller } from "@molis-ai/molis-work-contracts/platform/app-host";
import { bindActionClient, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { seedConfiguredModels } from "./fixtures/configured-models.js";

function codingHostFixture(root: string) {
  const starts: AgentStartRequest[] = [], runs: AgentRunView[] = [];
  let sdkSessions = 0;
  let captured: HostPluginCaller | undefined;
  let heldProgress: { enter(): void; wait: Promise<void> } | undefined;
  const host = new MolisWorkLocalHost({ actionAvailability: (caller, action) => { if (caller.audience === "plugin" && action.capability_id === goalPluginActions.contract.capability_id) captured = caller.host_plugin; if (heldProgress && caller.audience === "plugin" && action.capability_id === goalPluginActions.progress.capability_id && caller.allowed_capability_ids?.includes(action.capability_id)) {
      const held = heldProgress; heldProgress = undefined; held.enter(); return held.wait.then(() => ({ available: true as const }));
    } return { available: true }; }, homeDirectory: root, workspacesFor: () => [{ workspace_id: "work", canonical_path: root, display_name: "fixture", realpath_verified: true }] });
  // A Host with a Home composes its own Agent service (and registers its agent.* capabilities); the Home is what gives Coding's
  // `services.model` the provider catalog (PG-047). This test stands in the Agent capabilities, so it releases the real ones first.
  // The Host's own close disposes that service again; it is released once, so that second call answers the first.
  const composed = host.ensureAgentService(root, () => { throw new Error("a Host with a Home has composed its Agent service by now"); });
  const released = composed.dispose();
  composed.dispose = () => released;
  host.registerCapability(agent.availableRoles,() => [{ role_id: "reader", available: true }] as any);
  // The runtime directory a new session is made from (PG-054): one Runtime that offers everything.
  const everything = Object.fromEntries(AGENT_RUNTIME_CAPABILITIES.map(capability => [capability, "supported"])) as AgentRuntimeCapabilityMatrix;
  host.registerCapability(agent.listRuntimes, () => [{ runtime_id: "prologue", display_name: "Prologue", provider_version: "fixture", capabilities: everything }]);
  host.registerCapability(agent.listActions, () => []);
  // Sessions and rounds are actions Coding calls as itself (R8 batch 3).
  host.registerAction(agent.createSession, () => ({ runtime_id: "prologue", session_id: `sdk-${++sdkSessions}` }));
  host.registerAction(agent.startRun, (_runtime, [, input]) => {
    starts.push(structuredClone(input));
    const run: AgentRunView = { ref: { session_id: input.session.session_id, run_id: `run-${runs.length + 1}` }, phase: "completed", started_at: "2026-09-22T00:00:00Z", ended_at: "2026-09-22T00:00:01Z",
      frozen: { role_id: "reader", role_version: 1, execution: "read-only", model_id: "m", directory: input.directory, budget: null, skills: [], prompts: [], mcp_tools: [], host_tools: [], text_materials: (input.text_materials ?? []).map(({ text: _text, ...material }) => material) },
      turns: [{ turn_id: "u", kind: "user", text: input.task, at: null }, { turn_id: "a", kind: "assistant", text: "只读取了本轮目标", at: null }], activity: [], usage: { tokens: { input: 0, output: 0 } }, awaiting_input: [], command_outputs: [] };
    runs.push(run); return { ref: run.ref, frozen: run.frozen } as any;
  });
  host.registerAction(agent.readSession, (_runtime, [session]) => ({ session, owner: { project_id: DEMO_PROJECT_ID, plugin_id: "io.molis.work.coding", install_id: "fixture" }, title: "", latest_run: null,
    runs: runs.filter(run => run.ref.session_id === session.session_id).map(run => run.ref) }));
  host.registerAction(agent.readRun, (_runtime, [, runRef]) => structuredClone(runs.find(run => run.ref.run_id === runRef.run_id)!));
  return { host, starts, runs, sessionCount: () => sdkSessions, codingCaller: () => captured, holdProgress() {
    const entered = Promise.withResolvers<void>(), released = Promise.withResolvers<void>();
    heldProgress = { enter: () => entered.resolve(), wait: released.promise };
    return { entered: entered.promise, release: () => released.resolve() };
  } };
}
async function readGoalSnapshot(actions: BoundActionClient, goal_id: string) {
  const { goal } = await actions.invoke(goalPluginActions.contract, { goal_id });
  const { observed_event_cursor: _cursor, ...state } = await actions.invoke(goalPluginActions.state, { goal_id });
  return { goal, state };
}
async function setOriginalOutcome(host: MolisWorkLocalHost, ref: ReturnType<typeof molisWorkHostProjectReference>, outcome: string, idempotency_key: string) {
  await host.withProject(ref, ({ coordinator }) => {
    const current = coordinator.goalEvents.readState(DEMO_PROJECT_ID, "original");
    coordinator.goalEvents.setAgreement({ project_id: DEMO_PROJECT_ID, goal_id: "original", actor_id: "web-user", actor_kind: "user",
      idempotency_key, expected_config_version: current.config.version, expected_agreement_version: current.agreement.version, outcome });
  });
}
async function rejectCopiedCodingCaller(host: MolisWorkLocalHost, ref: ReturnType<typeof molisWorkHostProjectReference>, original: HostPluginCaller | undefined) {
  assert.ok(original);
  const caller = { actor_id: original.actor_id, actor_kind: "user" as const, audience: "plugin" as const, project_id: original.project_id,
    permissions: ["goals:read", "goals:write"], plugin_install_id: original.install_id, host_plugin: original };
  const copied = { ...original };
  for (const definition of [goalPluginActions.contract, goalPluginActions.state]) {
    await assert.rejects(host.actionClient(ref).invoke({ ...caller, host_plugin: copied }, definition, { goal_id: "original" }), { code: "host.plugin_caller_invalid" });
    await assert.rejects(host.actionClient(ref).invoke({ ...caller, actor_id: "different-person" }, definition, { goal_id: "original" }), { code: "host.plugin_caller_mismatch" });
  }
}

async function rejectStoppedGoalProgress(host: MolisWorkLocalHost, ref: ReturnType<typeof molisWorkHostProjectReference>,
  request: (path: string, method?: string, body?: unknown) => Promise<{ status: number; body: Record<string, unknown> }>, path: string, input: unknown,
  hold: () => { entered: Promise<void>; release(): void }, caller: HostPluginCaller | undefined) {
  // W3-07-8-02: the actual running Coding session loses authority while its Goal write awaits real Host policy.
  const owner = await host.withProject(ref, runtime => runtime.store), before = owner.readEventsDescending(DEMO_PROJECT_ID);
  const barrier = hold(), pending = request(path, "POST", input);
  try {
    await Promise.race([barrier.entered, pending.then(answer => { throw new Error(`Goal write did not reach its policy barrier: ${answer.status}`); })]);
    await releaseProjectPlugins(owner, DEMO_PROJECT_ID);
    barrier.release();
    const refused = await pending;
    // W5-01-AQD-07: the shared route checks the stopped instance before the Goal write resumes.
    assert.deepEqual([refused.status, refused.body.code], [503, "actions.plugin_unavailable"], JSON.stringify(refused.body));
    assert.deepEqual(owner.readEventsDescending(DEMO_PROJECT_ID), before, "revocation writes no progress, receipt or Goal event");
  } finally { barrier.release(); }
  assert.ok(caller);
  const stale = { actor_id: caller.actor_id, actor_kind: "user" as const, audience: "plugin" as const, project_id: caller.project_id,
    permissions: ["goals:read"], plugin_install_id: caller.install_id, host_plugin: caller };
  await assert.rejects(host.actionClient(ref).invoke(stale, goalPluginActions.state, { goal_id: "original" }), { code: "host.plugin_caller_invalid" });
  const reopened = await request(path); assert.equal(reopened.status, 200, JSON.stringify(reopened.body));
  await assert.rejects(host.actionClient(ref).invoke(stale, goalPluginActions.state, { goal_id: "original" }), { code: "host.plugin_caller_invalid" }, "restart grants only its new session, not the old object");
  assert.equal(reopened.body.recorded, null, "a restarted actual Coding definition reads no late receipt");
}

test("Coding freezes the selected real Goal, rejects changed/foreign/unavailable context, and keeps original report ownership after reassociation and restart", async () => {
  const root = mkdtempSync(join(tmpdir(), "coding-goal-context-")), databasePath = join(root, "project.db");
  await new MolisWorkLocalHost({ homeDirectory: root, completeText: null }).close();
  seedDemoBoard(databasePath); await seedConfiguredModels(root);
  const ref = molisWorkHostProjectReference({ databasePath, projectId: DEMO_PROJECT_ID });
  const { host, starts, runs, sessionCount, codingCaller, holdProgress } = codingHostFixture(root);
  const goalActions = bindActionClient(host.actionClient(ref), () => ({ actor_id: "web-user", actor_kind: "user", audience: "user", project_id: DEMO_PROJECT_ID, permissions: ["goals:read", "goals:write"] }));
  const readGoal = (goal_id: string) => readGoalSnapshot(goalActions, goal_id);
  const createGoal = (id: string, board = DEMO_PROJECT_ID, outcome = "固定原始目标🌲\r\n只评审，不写磁盘") => host.withProject(ref, ({ coordinator }) => coordinator.goalEvents.createIntent({ project_id: board, goal_id: id, title: `目标 ${id}`, outcome, why: "保留原始依据", business_logic: "先评审再决定", actor_id: "web-user", actor_kind: "user", idempotency_key: `create-${id}`, requirements: [{ requirement_id: `human-${id}`, statement: "用户确认评审结果", human_decision_required: true }] }));
  await createGoal("original"); await createGoal("next"); await createGoal("oversized", DEMO_PROJECT_ID, "长".repeat(21_000));
  await host.withProject(ref, ({ coordinator }) => coordinator.initializeBoard({ project_id: "other", actor_id: "web-user", idempotency_key: "other" }));
  await createGoal("foreign", "other");
  const server = createServer((request, response) => { void host.withProject(ref, async ({ store, artifacts, processItems }) => handleProjectPluginHttp(request, response, new URL(request.url!, "http://localhost"), {
    actions: { registry: host.actionRegistry(ref), client: { ...host.actionClient(ref), ...host.syncActionClient(ref) }, project_id: ref.project_id },
    store, artifacts, processItems, projectId: DEMO_PROJECT_ID, actorId: "web-user",
    capabilities: host.client(ref), homeDirectory: root,
    escapeHtml: value => String(value), translate: value => value,
  }, codingRouteHooks)).catch(error => { const refused = actionErrorResponse(error); response.writeHead(refused.status); response.end(JSON.stringify(refused.body)); }); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const request = async (path: string, method = "GET", body?: unknown) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/plugins/io.molis.work.coding${path}`, { method,
      ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  };
  const note = (goal_id: string, idempotency_key: string) => host.withProject(ref, ({ coordinator }) => coordinator.goalEvents.recordNote({ project_id: DEMO_PROJECT_ID, goal_id, actor_id: "web-user", actor_kind: "user", idempotency_key, body: "目标进展已更新" }));
  try {
    new Function(`return (${CODING_CLIENT_FACTORY_SCRIPT})`);
    const created = await request("/sessions", "POST", { title: "目标关联" }); assert.equal(created.status, 200, JSON.stringify(created.body));
    const id = created.body.session.session_id, sessionPath = `/sessions/${id}`;
    const start = () => request(`${sessionPath}/runs`, "POST", { task: "只读已关联目标", intent: "discuss", workspace_id: "work", provider_id: "p", model_id: "m", goal_id: "foreign", text_materials: [{ text: "伪造目标与已验收" }] });
    const pick = (value: any) => request(`${sessionPath}/goal`, "PUT", { goal_id: value.snapshot.goal.goal_id, expected_artifact_id: value.reference.artifact_id, text: "伪造正文" });
    assert.equal((await request("/goals/foreign")).status, 400);
    await assert.rejects(goalActions.invoke(goalPluginActions.contract, { goal_id: "foreign", project_id: "other" } as never));
    assert.equal((await request("/goals/oversized")).status, 400);
    assert.equal(sessionCount(), 0);
    const choices = (await request("/goals")).body;
    assert.ok(choices.goals.some((item: any) => item.goal_id === "original"));
    assert.ok(!choices.goals.some((item: any) => item.goal_id === "foreign"));
    const original = (await request("/goals/original")).body;
    await rejectCopiedCodingCaller(host, ref, codingCaller());
    const picked = await pick(original); assert.equal(picked.status, 200, JSON.stringify(picked.body));
    assert.equal((await request(sessionPath)).body.session.goal_title, "目标 original", "title is available before the first runtime session");
    assert.equal((await start()).status, 200);
    assert.equal(starts[0].text_materials?.length, 1);
    assert.equal(starts[0].text_materials?.[0]?.text, original.material.text);
    assert.match(starts[0].text_materials![0]!.text, /用户确认评审结果/);
    assert.doesNotMatch(starts[0].text_materials![0]!.text, /伪造/);
    const first = structuredClone(starts[0]);
    await note("next", "unrelated");
    assert.equal((await start()).status, 200, "unrelated Goal events do not replace selected context");
    await host.withProject(ref, ({ coordinator }) => {
      const state = coordinator.goalEvents.readState(DEMO_PROJECT_ID, "original");
      coordinator.goalEvents.setAgreement({ project_id: DEMO_PROJECT_ID, goal_id: "original", actor_id: "web-user", actor_kind: "user",
        idempotency_key: "changed-agreement", expected_config_version: state.config.version, expected_agreement_version: state.agreement.version,
        outcome: "只评审更新后的安装说明，不评审旧购物车逻辑",
        revise_requirements: [{ requirement_id: "human-original", statement: "用户确认新安装说明清楚", human_decision_required: true }] });
    });
    const changed = (await request("/goals/original")).body;
    assert.equal(changed.snapshot.state.agreement.version, 2);
    assert.match(changed.material.title, /工作约定 v2$/);
    assert.match(changed.material.text, /用户确认新安装说明清楚/);
    assert.match(changed.material.text, /只评审更新后的安装说明/);
    assert.equal((await pick(original)).status, 400, "stale preview rejected at confirmation");
    assert.equal((await start()).status, 400, "changed Goal blocks execution until reviewed");
    assert.equal(starts.length, 2);
    const next = (await request("/goals/next")).body;
    assert.equal((await pick(next)).status, 200);
    assert.equal((await request(`${sessionPath}/runs/run-1/report/progress`)).status, 400, "unsaved preview cannot write Goal progress");
    assert.equal((await request(`${sessionPath}/runs/run-1/report?fixed=1`)).status, 400, "a missing fixed source must not turn into a newly assembled preview");
    assert.equal((await request(`${sessionPath}/runs/run-1/report/output`, "POST", { expected_reference: null })).status, 400, "an unsaved preview cannot become a fixed output");
    const report = await request(`${sessionPath}/runs/run-1/report`, "POST");
    assert.equal(report.status, 200, JSON.stringify(report.body));
    assert.equal(report.body.report.goal.goal_id, "original");
    assert.deepEqual(report.body.report.goal.reference, original.reference);
    assert.equal(report.body.report.goal.agreement_version, 1, "historical ownership uses the frozen agreement, not current agreement 2");
    assert.match(report.body.report.body_markdown, /工作约定 v1 · 目标事件 \d+/);
    const catalog = await request("/reports");
    assert.equal(catalog.status, 200);
    assert.equal(catalog.body.reports.length, 1, "only saved reports, not every terminal run");
    assert.deepEqual(catalog.body.reports[0].reference, report.body.reference);
    assert.equal(catalog.body.reports[0].session_id, id);
    assert.equal(catalog.body.reports[0].body_markdown, undefined, "the directory does not download all report bodies");
    const outputPath = `${sessionPath}/runs/run-1/report/output`;
    assert.equal((await request(outputPath)).body.current, null);
    const firstOutput = await request(outputPath, "POST", { expected_reference: null, reference: { artifact_id: "forged", version: 99 } });
    assert.equal(firstOutput.status, 200, JSON.stringify(firstOutput.body));
    assert.deepEqual(firstOutput.body.current, report.body.reference, "output source is the saved report, never the browser payload");
    const progressPath = `${sessionPath}/runs/run-1/report/progress`;
    // W3-07-8-02: this confirmation reads facts; it does not create a new model material under the 20k limit.
    const priorAgreement = (await readGoal("original")).state;
    await setOriginalOutcome(host, ref, "长".repeat(21_000), "grow-after-fixed-report");
    const progressResponse = await request(progressPath); assert.equal(progressResponse.status, 200, JSON.stringify(progressResponse.body));
    const progressPreview = progressResponse.body;
    assert.equal(progressPreview.current.state.agreement.outcome.length, 21_000);

    assert.equal(progressPreview.current.goal.goal_id, "original");
    const progressInput = (view: any) => ({ expected_goal_cursor: view.current.state.goal_event_cursor, summary: "已完成只读评审，数量边界仍待用户确认。",
      next_step: "由用户阅读固定报告后决定下一步。", goal_id: "next", actor_id: "intruder", source: { artifact_id: "forged", version: 99 } });
    await note("original", "after-progress-preview");
    // D26: the Goal moved on since the preview, a conflict its owner declares; Coding's edge answers it by kind (409, was 400).
    const stale = await request(progressPath, "POST", progressInput(progressPreview));
    assert.deepEqual([stale.status, stale.body.code], [409, "goals.event_progress.stale_goal"], "a change after preview requires a fresh review");
    const freshProgress = (await request(progressPath)).body;
    await rejectStoppedGoalProgress(host, ref, request, progressPath, progressInput(freshProgress), holdProgress, codingCaller());
    const confirmed = progressInput((await request(progressPath)).body);
    const ahead = await request(progressPath, "POST", { ...confirmed, expected_goal_cursor: confirmed.expected_goal_cursor + 1 });
    assert.deepEqual([ahead.status, ahead.body.code], [409, "goals.event_progress.stale_goal"], "the Goal version is checked in the original write transaction (D26: by kind, was 400)");
    const results = await Promise.all([request(progressPath, "POST", confirmed), request(progressPath, "POST", confirmed)]);
    for (const result of results) assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(results[0].body.event_id, results[1].body.event_id, "concurrent confirmations share the original Goal receipt");
    const recorded = results[0].body;
    assert.equal(recorded.progress_summary.actor_id, "web-user");
    assert.deepEqual(recorded.progress_summary.source, { ...report.body.reference, title: report.body.report.title,
      origin: { plugin_id: "coding", item_id: report.body.reference.artifact_id } });
    const afterProgress = await readGoal("original");
    assert.equal(afterProgress.state.work_status, "open");
    assert.equal(afterProgress.goal.accepted_at, null);
    assert.deepEqual(afterProgress.state.progress_summary?.source, recorded.progress_summary.source);
    const writtenEvent = await host.withProject(ref, ({ coordinator }) => coordinator.goalEvents.readEvent(DEMO_PROJECT_ID, "original", recorded.event_id));
    assert.equal(writtenEvent.kind, "system");
    assert.deepEqual((writtenEvent.payload as any).source, recorded.progress_summary.source, "the public timeline reader preserves the fixed evidence source");
    assert.equal((await readGoal("next")).state.progress_summary, null);
    await setOriginalOutcome(host, ref, priorAgreement.agreement.outcome, "restore-after-progress-confirmation");
    await note("original", "after-progress-write");
    assert.equal((await request(progressPath, "POST", confirmed)).body.event_id, recorded.event_id, "lost-response retry survives later Goal changes without writing again");
    assert.equal((await request(progressPath, "POST", { ...confirmed, summary: "不同内容不得静默覆盖" })).status, 400);
    assert.equal((await request(progressPath)).body.recorded.event_id, recorded.event_id);
    assert.equal((await request(progressPath)).body.current, null, "receipt is read without pretending a new progress confirmation is needed");
    assert.equal(await goalActions.invoke(goalPluginActions.receipt, { goal_id: "next", idempotency_key: `coding-report-progress:${report.body.reference.artifact_id}@1` }), null, "a receipt cannot be relabeled as another Goal");
    const { actor_id: _forgedActor, ...forgedProgress } = confirmed;
    await assert.rejects(goalActions.invoke(goalPluginActions.progress, { ...forgedProgress, project_id: "other", goal_id: "foreign", idempotency_key: "forged-board", based_on_cursor: 0 } as any));

    assert.equal((await start()).status, 200);
    assert.equal(starts[2].text_materials?.[0]?.source_artifact_id, next.reference.artifact_id);
    assert.deepEqual(starts[0], first);
    await host.closeProject(ref);
    const reopened = await request(`${sessionPath}/goal`);
    assert.equal(reopened.body.goal_id, "next"); assert.deepEqual(reopened.body.selected.reference, next.reference);
    assert.deepEqual((await request(`${sessionPath}/runs/run-1/report`)).body, report.body);
    assert.equal((await request(progressPath)).body.recorded.event_id, recorded.event_id, "original Goal receipt survives restart");
    await host.withProject(ref, ({ coordinator }) => coordinator.goals.lifecycle.setTrashed(DEMO_PROJECT_ID, { goal_id: "next", trashed: true, reason: "检验不可用目标" }, { actor_id: "web-user", idempotency_key: "trash-next" }));
    assert.equal((await start()).status, 400);
    const deletedGoalReport = await request(`${sessionPath}/runs/run-3/report`, "POST");
    assert.equal(deletedGoalReport.status, 200); assert.equal(deletedGoalReport.body.report.goal.goal_id, "next");
    assert.equal((await request(`${sessionPath}/runs/run-3/report/progress`)).status, 400);
    assert.equal((await request(`${sessionPath}/runs/run-3/report/progress`, "POST", confirmed)).status, 400, "deleted Goal must not receive a new write");
    assert.equal((await request(`${sessionPath}/goal`, "PUT", { goal_id: null })).status, 200);
    assert.equal((await start()).status, 200); assert.deepEqual(starts.at(-1)?.text_materials, []);
    assert.deepEqual((await request(`${sessionPath}/runs/run-1/report`)).body, report.body);
    await host.withProject(ref, ({ processItems }) => processItems.commands.archiveVersion({
      project_id: DEMO_PROJECT_ID, actor_id: "web-user", ...original.reference,
    }));
    const missingSource = await request(`${sessionPath}/runs/run-2/report`, "POST");
    assert.equal(missingSource.status, 200, "unavailable Goal input must not lose completed output: " + JSON.stringify(missingSource.body));
    assert.equal(missingSource.body.report.goal, undefined, "do not substitute the session's later Goal");
    assert.deepEqual(missingSource.body.report.goal_source_error.references, [original.reference]);
    assert.equal(missingSource.body.report.model_answer, "只读取了本轮目标");
    assert.match(missingSource.body.report.body_markdown, /目标来源.*不可读/);
    assert.equal((await request(`${sessionPath}/runs/run-2/report/progress`, "POST", confirmed)).status, 400, "missing original Goal never falls back to the current association");
    assert.deepEqual((await request(`${sessionPath}/runs/run-1/report`)).body, report.body);
    await host.closeProject(ref);
    assert.deepEqual((await request(`${sessionPath}/runs/run-2/report`)).body, missingSource.body);
    const latest = (await request("/goals/original")).body;
    assert.equal((await pick(latest)).status, 200);
    assert.equal((await start()).status, 200);
    assert.equal(starts.at(-1)?.text_materials?.[0]?.text, latest.material.text);
    const revisedReport = (await request(`${sessionPath}/runs/run-5/report`, "POST")).body;
    assert.equal(revisedReport.report.goal.agreement_version, 4);
    assert.deepEqual(revisedReport.report.goal.reference, latest.reference);
    const countBeforeOutput = await host.withProject(ref, ({ artifacts }) => artifacts.query.listArtifacts(DEMO_PROJECT_ID).length);
    const revisedOutputPath = `${sessionPath}/runs/run-5/report/output`;
    assert.equal((await request(revisedOutputPath, "POST", { expected_reference: null })).status, 400, "stale output confirmation cannot overwrite another choice");
    assert.equal((await request(revisedOutputPath, "POST", { expected_reference: report.body.reference })).status, 200);
    assert.equal((await request(revisedOutputPath, "POST", { expected_reference: report.body.reference })).status, 200, "retry reuses the same selection");
    assert.equal((await request(outputPath, "POST", { expected_reference: null })).status, 400);
    await host.closeProject(ref);
    assert.deepEqual((await request(revisedOutputPath)).body.current, revisedReport.reference, "output selection survives project restart");
    assert.equal(await host.withProject(ref, ({ artifacts }) => artifacts.query.listArtifacts(DEMO_PROJECT_ID).length), countBeforeOutput, "no duplicate report Artifact or version");
    assert.deepEqual((await request(`${sessionPath}/runs/run-1/report`)).body, report.body);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve())); await host.close(); rmSync(root, { recursive: true, force: true });
  }
});
