import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { MolisWorkLocalHost, molisWorkHostProjectReference, seedDemoBoard, DEMO_BOARD_ID } from "@molis-ai/molis-work-app-local-host";
import { CODING_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-coding";
import { agentHostCapabilities as agent, type AgentRunView, type AgentStartRequest } from "@molis-ai/molis-work-contracts/services/agent-host";
import { goalContextCapabilities, goalProgressCapabilities } from "@molis-ai/molis-work-contracts/modules/goals";
import { handleCodingPluginHttp } from "../apps/local-host/src/coding-surface.js";

test("Coding freezes the selected real Goal, rejects changed/foreign/unavailable context, and keeps original report ownership after reassociation and restart", async () => {
  const root = mkdtempSync(join(tmpdir(), "coding-goal-context-")), databasePath = join(root, "project.db");
  seedDemoBoard(databasePath);
  const ref = molisWorkHostProjectReference({ databasePath, boardId: DEMO_BOARD_ID });
  const starts: AgentStartRequest[] = [], runs: AgentRunView[] = [];
  let sdkSessions = 0;
  const host = new MolisWorkLocalHost({ workspacesFor: () => [{ workspace_id: "work", canonical_path: root, display_name: "fixture", realpath_verified: true }] });
  host.registerCapability(agent.availableRoles, () => [{ role_id: "reader", available: true }] as any);
  host.registerCapability(agent.createSession, () => ({ runtime_id: "prologue", session_id: `sdk-${++sdkSessions}` }));
  host.registerCapability(agent.startRun, (_runtime, [, input]) => {
    starts.push(structuredClone(input));
    const run: AgentRunView = { ref: { session_id: input.session.session_id, run_id: `run-${runs.length + 1}` }, phase: "completed", started_at: "2026-09-22T00:00:00Z", ended_at: "2026-09-22T00:00:01Z",
      frozen: { role_id: "reader", role_version: 1, execution: "read-only", model_id: "m", directory: input.directory, budget: null, skills: [], prompts: [], mcp_tools: [], host_tools: [], text_materials: (input.text_materials ?? []).map(({ text: _text, ...material }) => material) },
      turns: [{ turn_id: "u", kind: "user", text: input.task, at: null }, { turn_id: "a", kind: "assistant", text: "只读取了本轮目标", at: null }], activity: [], usage: { tokens: { input: 0, output: 0 } }, awaiting_input: [], command_outputs: [] };
    runs.push(run); return { ref: run.ref, frozen: run.frozen } as any;
  });
  host.registerCapability(agent.readSession, (_runtime, [session]) => ({ runs: runs.filter(run => run.ref.session_id === session.session_id).map(run => run.ref) }) as any);
  host.registerCapability(agent.readRun, (_runtime, [, runRef]) => structuredClone(runs.find(run => run.ref.run_id === runRef.run_id)!));
  const createGoal = (id: string, board = DEMO_BOARD_ID, outcome = "固定原始目标🌲\r\n只评审，不写磁盘") => host.withProject(ref, ({ coordinator }) => coordinator.goalEvents.createIntent({ board_id: board, goal_id: id, title: `目标 ${id}`, outcome, why: "保留原始依据", business_logic: "先评审再决定", actor_id: "web-user", actor_kind: "user", idempotency_key: `create-${id}`, requirements: [{ requirement_id: `human-${id}`, statement: "用户确认评审结果", human_decision_required: true }] }));
  await createGoal("original"); await createGoal("next"); await createGoal("oversized", DEMO_BOARD_ID, "长".repeat(21_000));
  await host.withProject(ref, ({ coordinator }) => coordinator.initializeBoard({ board_id: "other", title: "Other", actor_id: "web-user", idempotency_key: "other" }));
  await createGoal("foreign", "other");
  const server = createServer((request, response) => { void host.withProject(ref, async ({ store, coordinator }) => handleCodingPluginHttp(request, response, new URL(request.url!, "http://localhost"), {
    actions: { registry: host.actionRegistry(ref), client: host.syncActionClient(ref), project_id: ref.project_id },
    store, boardId: DEMO_BOARD_ID, actorId: "web-user", goalTitle: id => coordinator.goalQueries.getGoal(DEMO_BOARD_ID, id)?.title,
    capabilities: host.client(ref), execution: { ready: async () => {}, models: async () => [{ provider_id: "p", model_id: "m", label: "fixture" }] },
    escapeHtml: value => String(value), translate: value => value,
  })).catch(error => { response.writeHead(500); response.end(JSON.stringify({ error: String(error) })); }); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const request = async (path: string, method = "GET", body?: unknown) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/plugins/io.molis.work.coding${path}`, { method,
      ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  };
  const note = (goal_id: string, idempotency_key: string) => host.withProject(ref, ({ coordinator }) => coordinator.goalEvents.recordNote({ board_id: DEMO_BOARD_ID, goal_id, actor_id: "web-user", actor_kind: "user", idempotency_key, body: "目标进展已更新" }));
  try {
    new Function(`return (${CODING_CLIENT_FACTORY_SCRIPT})`);
    const created = await request("/sessions", "POST", { title: "目标关联" }); assert.equal(created.status, 200);
    const id = created.body.session.session_id, sessionPath = `/sessions/${id}`;
    const start = () => request(`${sessionPath}/runs`, "POST", { task: "只读已关联目标", intent: "discuss", workspace_id: "work", provider_id: "p", model_id: "m", goal_id: "foreign", text_materials: [{ text: "伪造目标与已验收" }] });
    const pick = (value: any) => request(`${sessionPath}/goal`, "PUT", { goal_id: value.snapshot.goal.goal_id, expected_artifact_id: value.reference.artifact_id, text: "伪造正文" });
    assert.equal((await request("/goals/foreign")).status, 400);
    await assert.rejects(host.client(ref).invoke(goalContextCapabilities.read, { goal_id: "foreign", board_id: "other" } as any));
    assert.equal((await request("/goals/oversized")).status, 400);
    assert.equal(sdkSessions, 0);
    const choices = (await request("/goals")).body;
    assert.ok(choices.goals.some((item: any) => item.goal_id === "original"));
    assert.ok(!choices.goals.some((item: any) => item.goal_id === "foreign"));
    const original = (await request("/goals/original")).body;
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
      const state = coordinator.goalEvents.readState(DEMO_BOARD_ID, "original");
      coordinator.goalEvents.setAgreement({ board_id: DEMO_BOARD_ID, goal_id: "original", actor_id: "web-user", actor_kind: "user",
        idempotency_key: "changed-agreement", expected_config_version: state.config.version, expected_agreement_version: state.agreement.version,
        outcome: "只评审更新后的安装说明，不评审旧购物车逻辑",
        revise_requirements: [{ requirement_id: "human-original", statement: "用户确认新安装说明清楚", human_decision_required: true }] });
    });
    const changed = (await request("/goals/original")).body;
    assert.equal(changed.snapshot.goal.current_contract_revision, original.snapshot.goal.current_contract_revision);
    assert.equal(changed.snapshot.state.agreement.version, 2);
    assert.match(changed.material.title, /工作约定 v2 · 目标合同修订 r1/);
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
    assert.match(report.body.report.body_markdown, /工作约定 v1 · 目标合同修订 r1/);
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
    const progressPreview = (await request(progressPath)).body;
    assert.equal(progressPreview.current.goal.goal_id, "original");
    const progressInput = (view: any) => ({ expected_goal_cursor: view.current.state.goal_event_cursor,
      expected_contract_revision: view.current.goal.current_contract_revision, summary: "已完成只读评审，数量边界仍待用户确认。",
      next_step: "由用户阅读固定报告后决定下一步。", goal_id: "next", actor_id: "intruder", source: { artifact_id: "forged", version: 99 } });
    await note("original", "after-progress-preview");
    assert.equal((await request(progressPath, "POST", progressInput(progressPreview))).status, 400, "a change after preview requires a fresh review");
    const freshProgress = (await request(progressPath)).body, confirmed = progressInput(freshProgress);
    assert.equal((await request(progressPath, "POST", { ...confirmed, expected_contract_revision: confirmed.expected_contract_revision + 1 })).status, 400, "contract revision is checked in the original write transaction");
    const results = await Promise.all([request(progressPath, "POST", confirmed), request(progressPath, "POST", confirmed)]);
    for (const result of results) assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(results[0].body.event_id, results[1].body.event_id, "concurrent confirmations share the original Goal receipt");
    const recorded = results[0].body;
    assert.equal(recorded.progress_summary.actor_id, "web-user");
    assert.deepEqual(recorded.progress_summary.source, { ...report.body.reference, title: report.body.report.title,
      origin: { plugin_id: "coding", item_id: report.body.reference.artifact_id } });
    const afterProgress = await host.client(ref).invoke(goalContextCapabilities.read, { goal_id: "original" });
    assert.equal(afterProgress.state.work_status, "open");
    assert.equal(afterProgress.goal.accepted_at, null);
    assert.deepEqual(afterProgress.state.progress_summary?.source, recorded.progress_summary.source);
    const writtenEvent = await host.withProject(ref, ({ coordinator }) => coordinator.goalEvents.readEvent(DEMO_BOARD_ID, "original", recorded.event_id));
    assert.equal(writtenEvent.kind, "system");
    assert.deepEqual((writtenEvent.payload as any).source, recorded.progress_summary.source, "the public timeline reader preserves the fixed evidence source");
    assert.equal((await host.client(ref).invoke(goalContextCapabilities.read, { goal_id: "next" })).state.progress_summary, null);
    await note("original", "after-progress-write");
    assert.equal((await request(progressPath, "POST", confirmed)).body.event_id, recorded.event_id, "lost-response retry survives later Goal changes without writing again");
    assert.equal((await request(progressPath, "POST", { ...confirmed, summary: "不同内容不得静默覆盖" })).status, 400);
    assert.equal((await request(progressPath)).body.recorded.event_id, recorded.event_id);
    assert.equal((await request(progressPath)).body.current, null, "receipt is read without pretending a new progress confirmation is needed");
    assert.equal(await host.client(ref).invoke(goalProgressCapabilities.receipt, { goal_id: "next", actor_id: "web-user", idempotency_key: `coding-report-progress:${report.body.reference.artifact_id}@1` }), null, "a receipt cannot be relabeled as another Goal");
    await assert.rejects(host.client(ref).invoke(goalProgressCapabilities.record, { ...confirmed, board_id: "other", goal_id: "foreign", actor_id: "web-user", idempotency_key: "forged-board", based_on_cursor: 0 } as any));

    assert.equal((await start()).status, 200);
    assert.equal(starts[2].text_materials?.[0]?.source_artifact_id, next.reference.artifact_id);
    assert.deepEqual(starts[0], first);
    await host.closeProject(ref);
    const reopened = await request(`${sessionPath}/goal`);
    assert.equal(reopened.body.goal_id, "next"); assert.deepEqual(reopened.body.selected.reference, next.reference);
    assert.deepEqual((await request(`${sessionPath}/runs/run-1/report`)).body, report.body);
    assert.equal((await request(progressPath)).body.recorded.event_id, recorded.event_id, "original Goal receipt survives restart");
    await host.withProject(ref, ({ coordinator }) => coordinator.goals.lifecycle.setTrashed(DEMO_BOARD_ID, { goal_id: "next", trashed: true, reason: "检验不可用目标" }, { actor_id: "web-user", idempotency_key: "trash-next" }));
    assert.equal((await start()).status, 400);
    const deletedGoalReport = await request(`${sessionPath}/runs/run-3/report`, "POST");
    assert.equal(deletedGoalReport.status, 200); assert.equal(deletedGoalReport.body.report.goal.goal_id, "next");
    assert.equal((await request(`${sessionPath}/runs/run-3/report/progress`)).status, 400);
    assert.equal((await request(`${sessionPath}/runs/run-3/report/progress`, "POST", confirmed)).status, 400, "deleted Goal must not receive a new write");
    assert.equal((await request(`${sessionPath}/goal`, "PUT", { goal_id: null })).status, 200);
    assert.equal((await start()).status, 200); assert.deepEqual(starts.at(-1)?.text_materials, []);
    assert.deepEqual((await request(`${sessionPath}/runs/run-1/report`)).body, report.body);
    await host.withProject(ref, ({ coordinator }) => coordinator.artifacts.commands.archiveVersion({
      board_id: DEMO_BOARD_ID, actor_id: "web-user", ...original.reference,
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
    assert.equal(revisedReport.report.goal.agreement_version, 2);
    assert.equal(revisedReport.report.goal.contract_revision, 1);
    assert.deepEqual(revisedReport.report.goal.reference, latest.reference);
    const countBeforeOutput = await host.withProject(ref, ({ coordinator }) => coordinator.artifacts.query.listArtifacts(DEMO_BOARD_ID).length);
    const revisedOutputPath = `${sessionPath}/runs/run-5/report/output`;
    assert.equal((await request(revisedOutputPath, "POST", { expected_reference: null })).status, 400, "stale output confirmation cannot overwrite another choice");
    assert.equal((await request(revisedOutputPath, "POST", { expected_reference: report.body.reference })).status, 200);
    assert.equal((await request(revisedOutputPath, "POST", { expected_reference: report.body.reference })).status, 200, "retry reuses the same selection");
    assert.equal((await request(outputPath, "POST", { expected_reference: null })).status, 400);
    await host.closeProject(ref);
    assert.deepEqual((await request(revisedOutputPath)).body.current, revisedReport.reference, "output selection survives project restart");
    assert.equal(await host.withProject(ref, ({ coordinator }) => coordinator.artifacts.query.listArtifacts(DEMO_BOARD_ID).length), countBeforeOutput, "no duplicate report Artifact or version");
    assert.deepEqual((await request(`${sessionPath}/runs/run-1/report`)).body, report.body);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve())); await host.close(); rmSync(root, { recursive: true, force: true });
  }
});
