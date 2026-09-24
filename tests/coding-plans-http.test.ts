import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { LocalProjectDatabase, DEMO_BOARD_ID, seedDemoBoard, releaseCodingSurface } from "@molis-ai/molis-work-app-local-host";
import { ArtifactsModule } from "@molis-ai/molis-work-module-artifacts";
import { CodingSessionStore } from "@molis-ai/molis-work-plugin-coding";
import { agentHostCapabilities as agent, type AgentStartRequest, type AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import { projectsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import { writerDirectoryCapabilities } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { handleCodingPluginHttp } from "../apps/local-host/src/coding-surface.js";

test("Plan formal routes preserve confirmed revisions, reject stale/blocked/foreign proposals, and do not replay execution", async () => {
  const home = mkdtempSync(join(tmpdir(), "coding-plans-")), dbPath = join(home, "board.db");
  seedDemoBoard(dbPath); let store = new LocalProjectDatabase(dbPath);
  const sessions = new CodingSessionStore(store.db);
  for (const id of ["app", "other"]) { sessions.create({ board_id: DEMO_BOARD_ID, session_id: id, title: id, runtime_id: "prologue", at: new Date().toISOString() }); sessions.setRuntimeSession(DEMO_BOARD_ID, id, `sdk-${id}`, new Date().toISOString()); }
  const content = { title: "修复运费边界", steps: [{ title: "核对 shipping.mjs", acceptance: "10000 分免运费，9999 分收 500 分" }], blockers: "", change_reason: "" };
  const makeRun = (id: string, role = "planner", text = JSON.stringify(content)): AgentRunView => ({
    ref: { runtime_id: "prologue", session_id: "sdk-app", run_id: id }, phase: "completed", started_at: new Date().toISOString(), ended_at: new Date().toISOString(),
    turns: [{ turn_id: "u", kind: "user", text: "检查并修复边界", sequence: 1 }, { turn_id: "a", kind: "assistant", text, sequence: 2 }], activity: [], awaiting_input: [], awaiting_review: [],
    frozen: { role_id: role, role_version: 1, execution: role === "planner" ? "read-only" : "workspace-write", model_id: "m", prompts: [], skills: [], mcp_tools: [], host_tools: ["read-file"], text_materials: [], budget: null, directory: { canonical_path: home, realpath_verified: true } },
    usage: { tokens: { input: 0, output: 0 } },
  } as unknown as AgentRunView);
  const runs = [makeRun("proposal", "planner", "已核对文件，计划如下：\n" + JSON.stringify(content)), makeRun("ambiguous", "planner", "```json\n" + JSON.stringify(content) + "\n```\n```json\n" + JSON.stringify(content) + "\n```"), makeRun("malformed", "planner", "我会改代码"), makeRun("ordinary", "reader")];
  runs.push(makeRun("ambiguous-prose", "planner", "说明\n" + JSON.stringify(content) + "\n" + JSON.stringify(content)), makeRun("trailing", "planner", "说明\n" + JSON.stringify(content) + "\n不是唯一正文"));
  const starts: AgentStartRequest[] = [];
  const host = () => ({ store, homeDirectory: home, boardId: DEMO_BOARD_ID, actorId: "web-user", goalTitle: () => undefined,
    escapeHtml: (value: unknown) => String(value), translate: (value: string) => value,
    execution: { ready: async () => {}, models: async () => [{ provider_id: "p", model_id: "m", label: "fixture" }] },
    capabilities: { async invoke<Input, Output>(definition: { capability_id: string }, args: Input): Promise<Output> {
      const input = args as any[];
      if (definition.capability_id === projectsCapabilities.listWorkspaces.capability_id) return [{ workspace_id: "work", canonical_path: home, realpath_verified: true }, { workspace_id: "foreign", canonical_path: home + "-other", realpath_verified: true }] as Output;
      if (definition.capability_id === writerDirectoryCapabilities.list.capability_id) return [{ workspace_id: "foreign", canonical_path: home + "-other", branch: "writer/a", base_commit: "abc123" }] as Output;
      if (definition.capability_id === agent.availableRoles.capability_id) return ["planner", "builder", "reader", "writers"].map(role_id => ({ role_id, available: true })) as Output;
      if (definition.capability_id === agent.readSession.capability_id) return { runs: input[0].session_id === "sdk-app" ? runs.map(run => run.ref) : [] } as Output;
      if (definition.capability_id === agent.readRun.capability_id) return structuredClone(runs.find(run => run.ref.run_id === input[1].run_id)) as Output;
      if (definition.capability_id === agent.listSubagents.capability_id) return [{subagent_id:"child",role_id:"writer",role_name:"运费子任务",state:"completed",task:"补边界测试",result:"写入已返回，尚未检查",workspace_path:home+"-other"}] as Output;
      if (definition.capability_id === agent.startRun.capability_id) {
        starts.push(structuredClone(input[1]));const run=makeRun(`execute-${starts.length}`,input[1].role_id,"已收到");
        run.frozen.execution_plan=structuredClone(input[1].execution_plan);
        if(input[1].execution_plan)run.step_board={board_id:`board-${starts.length}`,version:3,terminal:true,nodes:input[1].execution_plan.steps.map((step:any)=>({id:step.id,state:"succeeded",reports:[{note:"原步骤证据",at_ms:10}]}))};
        run.frozen.text_materials=input[1].text_materials.map((material: any)=>({material_id:material.material_id,title:material.title,source_artifact_id:material.source_artifact_id,source_version:material.source_version}));runs.push(run);
        return {ref:run.ref,frozen:run.frozen} as Output;
      }
      throw new Error(`Unexpected capability ${definition.capability_id}`);
    } },
  });
  const server = createServer((request, response) => { void handleCodingPluginHttp(request, response, new URL(request.url!, "http://localhost"), host()).catch(error => { response.writeHead(500); response.end(String(error)); }); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const request = async (suffix = "", method = "GET", body?: unknown, id = "app") => {
    const result = await fetch(`http://127.0.0.1:${address.port}/api/plugins/io.molis.work.coding/sessions/${id}${suffix}`, { method, ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) });
    return { status: result.status, body: await result.json() };
  };
  const start = (extra = {}) => request("/runs", "POST", { task: "伪造替代任务", intent: "execute", workspace_id: "work", provider_id: "p", model_id: "m", plan_revision: 1, ...extra });
  try {
    assert.equal((await request("/plan")).body.plan, null);
    assert.equal((await start()).status, 400);
    for (const run_id of ["malformed", "ordinary", "foreign", "ambiguous", "ambiguous-prose", "trailing"]) assert.equal((await request("/plan", "POST", { run_id, expected_revision: 0 })).status, 400);
    assert.equal((await request("/plan", "POST", { run_id: "proposal", expected_revision: 0 }, "other")).status, 400);
    let response = await request("/plan", "POST", { run_id: "proposal", expected_revision: 0, content: { title: "伪造" } });
    assert.equal(response.status, 200, JSON.stringify(response.body));assert.deepEqual(response.body.plan.content, content);
    assert.equal((await request("/plan", "POST", { run_id: "proposal", expected_revision: 0 })).status, 400);
    assert.equal((await start()).status, 400, "draft is not executable");
    assert.equal((await request("/plan/confirm", "POST", { expected_revision: 0 })).status, 400);
    response = await request("/plan/confirm", "POST", { expected_revision: 1 });assert.equal(response.status, 200, JSON.stringify(response.body));
    const fixed = structuredClone(response.body.plan);
    assert.deepEqual((await request("/plan/confirm", "POST", { expected_revision: 1 })).body.plan, fixed);
    assert.equal((await start({ workspace_id: "foreign" })).status, 400);
    assert.equal((await start({ intent: "discuss" })).status, 400);
    await request("", "PATCH", { draft: "未发送的独立要求" });
    response = await start();assert.equal(response.status, 200, JSON.stringify(response.body));assert.equal(starts.length, 1);
    assert.deepEqual(starts[0].budget, {max_turns:60});assert.equal(starts[0].task, "检查并修复边界");assert.equal(starts[0].role_id, "builder");
    assert.match(starts[0].text_materials![0].text, /10000 分免运费/);assert.match(starts[0].text_materials![0].text, /不批准任何文件修改或命令/);
    assert.equal((await request()).body.draft, "未发送的独立要求");
    assert.equal((await start()).body.existing, true);assert.equal(starts.length, 1, "lost-response retry does not start a second Run");
    await releaseCodingSurface(store, DEMO_BOARD_ID);store.close();store = new LocalProjectDatabase(dbPath);
    assert.deepEqual((await request("/plan")).body.plan, fixed);assert.equal((await start()).body.existing, true);
    assert.equal((await request("/plan", "POST", { expected_revision: 1, content: { ...content, title: "新计划" } })).status, 400);
    const adjusted = { ...content, title: "新计划", change_reason: "增加边界检查", blockers: "尚缺折扣约定" };
    response = await request("/plan", "POST", { expected_revision: 1, content: adjusted });assert.equal(response.status, 200, JSON.stringify(response.body));assert.equal(response.body.plan.revision, 2);
    assert.equal((await request("/plan/confirm", "POST", { expected_revision: 2 })).status, 400);
    assert.equal((await start()).status, 400, "an old confirmation cannot authorize a changed draft");
    assert.equal((await request("/plan", "POST", { expected_revision: 1, content })).status, 400);
    await request("/plan", "POST", { expected_revision: 2, content: { ...adjusted, blockers: "" } });
    assert.equal((await request("/plan/confirm", "POST", { expected_revision: 3 })).status, 200);
    const parallel = { plan_revision:3, intent:"parallel", writer_assignments:[{workspace_id:"foreign",task:"只核对既定运费边界并补测试"}] };
    assert.equal((await start({...parallel,writer_assignments:[]})).status,400);assert.equal(starts.length,1);
    assert.equal((await start(parallel)).status, 200);assert.equal(starts.length, 2);
    assert.equal(starts[1].role_id,"writers");assert.equal(starts[1].subagent_workspaces?.[0]?.directory.canonical_path,home+"-other");
    assert.ok(starts[1].task.startsWith("检查并修复边界"));assert.ok(starts[1].task.includes(parallel.writer_assignments[0].task));
    assert.equal((await start(parallel)).body.existing,true);assert.equal(starts.length,2,"confirmed parallel Plan retry must not redispatch children");
    assert.deepEqual((await request("/plan?revision=1")).body.plan, fixed, "fixed execution plan remains readable after edits");
    assert.equal((await request("/plan?revision=1", "GET", undefined, "other")).status, 400);
    assert.equal((await request("/plan?revision=2")).status, 400, "unconfirmed revisions are not fixed plans");
    const board = (await request()).body;
    assert.equal(board.taskboard_plans.length, 2);
    assert.deepEqual(board.taskboard_plans[0].plan, fixed, "TaskBoard resolves the original confirmed plan instead of the new draft");
    assert.equal(board.taskboard_plans[1].plan.revision, 3);
    assert.equal(board.taskboard_plans[1].run_id, runs.at(-1)!.ref.run_id);
    assert.equal((await request("/plan", "POST", {expected_revision:3,content:{...adjusted,blockers:"等待产品确认"}})).status, 200);
    const childRun=runs.at(-1)!;childRun.phase="failed";
    assert.equal((await request("/runs/"+childRun.ref.run_id+"/subagents/child", "POST", {action:"needs-work",notes:"需要补充负数用例",expected_revision:0})).status,200);
    const changed=(await request()).body;
    assert.equal(changed.plan.revision,4);assert.equal(changed.plan.content.blockers,"等待产品确认");
    assert.deepEqual(changed.taskboard_plans,board.taskboard_plans,"a blocked next draft and failed parent never rewrite the executed plans");
    assert.equal(changed.runs.at(-1).phase,"failed");
    assert.equal(changed.subagents.at(-1).children[0].verdict.status,"needs-work");
    assert.equal(changed.subagents.at(-1).children[0].state,"completed","user rework is distinct from original execution state");
    await releaseCodingSurface(store, DEMO_BOARD_ID);store.close();store = new LocalProjectDatabase(dbPath);
    const reopened=(await request()).body;
    assert.deepEqual(reopened.taskboard_plans,changed.taskboard_plans);assert.deepEqual(reopened.subagents,changed.subagents);
    const unreadable=makeRun("lost-plan","builder");unreadable.frozen.text_materials=[{material_id:"lost",title:"lost",source_artifact_id:"coding-plan:app:999",source_version:1},{material_id:"foreign",title:"foreign",source_artifact_id:"coding-plan:other:1",source_version:1}];runs.push(unreadable);
    const lost=(await request()).body.taskboard_plans.at(-1);
    assert.equal(lost.run_id,"lost-plan");assert.equal(lost.revision,999);assert.equal(lost.plan,null);assert.match(lost.error,/不能替代/);
    assert.equal((await request()).body.taskboard_plans.length,3,"foreign plan references do not expose another session's plan");
    assert.equal((await request("", "GET", undefined, "other")).body.taskboard_plans.length,0);
    assert.equal(starts[0].text_materials![0].source_artifact_id, fixed.confirmed.artifact_id);
    assert.notEqual(starts[1].text_materials![0].source_artifact_id, fixed.confirmed.artifact_id);
    const firstRun=runs.find(run=>run.ref.run_id==="execute-1")!;
    const stepPath="/runs/execute-1/steps/step-1",evaluation={action:"accepted",notes:"已独立核对",board_id:"board-1",board_version:3,expected_revision:0};
    assert.equal((await request(stepPath,"POST",evaluation,"other")).status,400,"another app session cannot accept this run");
    assert.equal((await request("/runs/proposal/steps/step-1","POST",evaluation)).status,400,"no graph cannot be accepted");
    assert.equal((await request("/runs/execute-1/steps/step-9","POST",evaluation)).status,400);
    firstRun.phase="running";assert.equal((await request(stepPath,"POST",evaluation)).status,400);firstRun.phase="completed";
    assert.equal((await request(stepPath,"POST",{...evaluation,board_version:2})).status,400);
    assert.equal((await request(stepPath,"POST",{...evaluation,board_id:"foreign"})).status,400);
    const originalBoard=structuredClone(firstRun.step_board);
    response=await request(stepPath,"POST",evaluation);assert.equal(response.status,200,JSON.stringify(response.body));assert.equal(response.body.verdict.revision,1);
    const acceptedReport = await request("/runs/execute-1/report");
    assert.equal(acceptedReport.status, 200, JSON.stringify(acceptedReport.body));
    assert.match(acceptedReport.body.report.body_markdown, /用户已通过此步骤/);
    assert.equal((await request(stepPath,"POST",evaluation)).status,400,"stale assessment never overwrites the original");
    assert.equal((await request(stepPath,"POST",{...evaluation,action:"needs-work",notes:"",expected_revision:1})).status,400);
    response=await request(stepPath,"POST",{...evaluation,action:"needs-work",notes:"还需核对负数输入",expected_revision:1});assert.equal(response.status,200,JSON.stringify(response.body));
    assert.deepEqual(firstRun.step_board,originalBoard,"human rework never rewrites SDK success or report history");
    const verdict=response.body.verdict;
    await releaseCodingSurface(store,DEMO_BOARD_ID);store.close();store=new LocalProjectDatabase(dbPath);
    const assessed=(await request()).body.taskboard_plans.find((entry:any)=>entry.run_id==="execute-1");
    assert.deepEqual(assessed.verdicts["step-1"],verdict);assert.equal(assessed.plan.revision,1);assert.equal((await request()).body.plan.revision,4);
    const reportPath = "/runs/execute-1/report";
    const previewReport = (await request(reportPath)).body;
    assert.equal(previewReport.reference, null);
    assert.deepEqual(previewReport.report.steps.board, originalBoard);
    assert.deepEqual(previewReport.report.steps.verdicts["step-1"], verdict);
    assert.match(previewReport.report.body_markdown, /用户要求返工/);
    assert.match(previewReport.report.body_markdown, /还需核对负数输入/);
    assert.match(previewReport.report.body_markdown, /10000 分免运费/);
    assert.doesNotMatch(previewReport.report.body_markdown, /新计划/);
    firstRun.step_board!.version++;
    const staleReport = (await request(reportPath)).body.report;
    assert.match(staleReport.body_markdown, /历史评价：曾要求返工/);
    assert.match(staleReport.body_markdown, /当前版本尚待核对/);
    firstRun.phase = "failed";
    firstRun.step_board!.nodes[0].state = "running";
    const incompleteReport = (await request(reportPath)).body.report;
    assert.equal(incompleteReport.state, "failed");
    assert.equal(incompleteReport.steps.board.nodes[0].state, "running");
    assert.match(incompleteReport.body_markdown, /模型报告执行中/);
    firstRun.phase = "completed";
    firstRun.step_board = structuredClone(originalBoard);
    firstRun.step_board_error = "原步骤图暂不可读";
    const unavailableReport = (await request(reportPath)).body.report;
    assert.equal(unavailableReport.steps.board, undefined);
    assert.match(unavailableReport.body_markdown, /原步骤图暂不可读/);
    assert.equal(unavailableReport.model_answer, "已收到", "missing board never discards the original answer");
    delete firstRun.step_board_error;
    const originalExecution = firstRun.frozen.execution_plan!;
    firstRun.frozen.execution_plan = { ...originalExecution, source: { artifact_id: "coding-plan:other:1", version: 1 } };
    assert.match((await request(reportPath)).body.report.steps.unavailable_reason, /原计划来源/);
    firstRun.frozen.execution_plan = originalExecution;
    const savedReport = (await request(reportPath, "POST", {})).body;
    assert.equal(savedReport.reference.version, 1);
    assert.deepEqual(savedReport.report.steps, previewReport.report.steps);
    response = await request(stepPath, "POST", { ...evaluation, expected_revision: 2, notes: "后续复核已经通过" });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.deepEqual((await request(reportPath, "POST", {})).body, savedReport, "later evaluation cannot rewrite a saved report");
    await releaseCodingSurface(store, DEMO_BOARD_ID); store.close(); store = new LocalProjectDatabase(dbPath);
    assert.deepEqual((await request(reportPath)).body, savedReport, "reopening keeps the exact saved assessment");
    firstRun.step_board!.nodes[0].state="blocked";firstRun.step_board!.version++;
    assert.equal((await request(stepPath,"POST",{...evaluation,expected_revision:2,board_version:4})).status,400,"blocked is not accepted as success");
    firstRun.step_board=originalBoard;
    assert.deepEqual(starts[0].execution_plan?.steps,[{id:"step-1",...content.steps[0]}]);
    assert.equal((await start({plan_revision:undefined,intent:"discuss"})).status, 200, "ordinary direct work does not require planning");
    assert.equal(starts[2].text_materials!.length, 0);
    assert.equal((await request("/runs/execute-3/report")).body.report.steps, undefined, "ordinary runs acquire no inferred steps");
    const secondReport = (await request("/runs/execute-2/report")).body.report;
    assert.match(secondReport.body_markdown, /用户尚未评价/);
    assert.deepEqual(secondReport.steps.verdicts, {}, "other runs' assessments never leak");
    const artifacts = new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event) });
    artifacts.commands.archiveVersion({ board_id: DEMO_BOARD_ID, actor_id: "web-user", ...starts[1].execution_plan!.source });
    const missingPlanReport = (await request("/runs/execute-2/report", "POST", {})).body;
    assert.match(missingPlanReport.report.steps.unavailable_reason, /固定计划暂不可读/);
    assert.equal(missingPlanReport.report.model_answer, "已收到");
    assert.equal(missingPlanReport.report.steps.board, undefined);

  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));await releaseCodingSurface(store, DEMO_BOARD_ID);store.close();rmSync(home, { recursive: true, force: true });
  }
});
