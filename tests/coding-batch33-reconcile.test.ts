import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join } from "node:path";
import test from "node:test";
import type { AgentRunRef, AgentStepBoard } from "@molis-ai/molis-work-contracts/services/agent-host";
import { ensureSystemAgentService, ModelProviderStore, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { applyRunEvent, applyUnknownCommandOutcomes, emptyPrologueStreamState } from "@molis-ai/molis-work-service-agent-host";
import { createFileSecretStore, LocalSqliteStorage, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { codingAgentManifest, codingPrompts } from "@molis-ai/molis-work-plugin-coding";
import { cogniaModelResponse, cogniaScriptedResponse } from "./fixtures/cognia-model-response.js";
import { codingProductHost } from "./fixtures/coding-product-host.js";

const CODING_PREFIX = "/api/plugins/io.molis.work.coding";

const placeIn = (system: string) => ({
  board: system.match(/本轮确认计划在项目任务图 (\S+) 上/)![1]!,
  prefix: system.match(/编号以 (\S+?)\. 开头/)![1]!,
});

const versionIn = (messages: string) =>
  Number([...messages.matchAll(/board (?:at|[^ ]+ at) version (\d+)/g)].at(-1)?.[1] ?? 1);

test("BL-222, CHO-12, CHO-35: succeeded step with unknown command outcome deducts progress, blocks acceptance, resets on rerun without closing plan, and settles on confirm-done", { timeout: 60_000 }, async t => {
  let phase: "plan" | "exec" | "probe" = "plan";
  let execTurn = 0;
  let boardId = "";
  let planPrefix = "";
  let probeText = "";
  const planJson = JSON.stringify({
    title: "后台命令对账计划",
    steps: [
      { title: "启动后台构建并核对产物", acceptance: "拿到退出码 0 且产物齐备", story_points: 3, estimate_reason: "涉及构建命令" },
      { title: "联调下游导出", acceptance: "导出端到端通过", after: [1], story_points: 5, estimate_reason: "依赖构建完成" },
    ],
    blockers: "",
    change_reason: "",
  });

  const { host, home, project, workspaceId, call } = await codingProductHost(t, (req) => {
    if (phase === "plan") return cogniaModelResponse(planJson, 20);
    const sys = JSON.stringify((req as { system?: unknown }).system ?? "");
    const msgs = JSON.stringify(req.messages);
    const full = `${sys}\n${msgs}`;
    if (phase === "probe") {
      if (full.includes("PROBE_STANDING") || full.includes("继续未完计划")) probeText += `\n${full}`;
      return cogniaModelResponse("已收到当前任务图现状。", 6);
    }
    if (!full.includes("本轮确认计划在项目任务图")) return cogniaModelResponse("[]", 5);
    execTurn += 1;
    if (execTurn === 1) {
      ({ board: boardId, prefix: planPrefix } = placeIn(full));
      return cogniaScriptedResponse({ name: "board-read", input: { board: boardId } });
    }
    if (execTurn === 2) {
      return cogniaScriptedResponse({
        name: "board-report",
        input: { board: boardId, node: `${planPrefix}.step-1`, state: "running", note: "开始后台构建", version: versionIn(msgs) },
      });
    }
    if (execTurn === 3) {
      return cogniaScriptedResponse({
        name: "start-command",
        input: { executable: "sh", argv: ["-c", "sleep 15"] },
      });
    }
    if (execTurn === 4) return cogniaScriptedResponse({ name: "board-read", input: { board: boardId } });
    if (execTurn === 5) {
      return cogniaScriptedResponse({
        name: "board-report",
        input: { board: boardId, node: `${planPrefix}.step-1`, state: "succeeded", note: "已在后台启动构建", version: versionIn(msgs) },
      });
    }
    return cogniaModelResponse("第一阶段已提交，等待核对。", 10);
  });

  const service = ensureSystemAgentService(host, home);
  const getAdapter = () => service.agentHost.adapter("prologue");
  const decided = new Set<string>();
  const settle = async (ref: AgentRunRef) => {
    for (const deadline = Date.now() + 25_000; ;) {
      for (const rev of service.agentHost.reviews.list(project.project_id, "pending")) {
        if (!decided.has(rev.review_id)) {
          decided.add(rev.review_id);
          await service.agentHost.reviews.respond({ review_id: rev.review_id, version: rev.reference.version, decision: "approve", actor_id: "web-user" });
        }
      }
      const view = await getAdapter().read(ref);
      if (["completed", "failed", "cancelled", "stopped"].includes(view.phase)) return view;
      if (Date.now() > deadline) throw new Error(`run did not settle: ${view.phase}`);
      await new Promise(resolve => setTimeout(resolve, 15));
    }
  };

  const runScenario = async (reconcileAction: "rerun" | "confirm-done") => {
    phase = "plan";
    execTurn = 0;
    const created = await call<{ session: { session_id: string } }>(project.project_id, `${CODING_PREFIX}/sessions`, {});
    const sid = created.body.session.session_id;
    const planRun = await call<{ run: { ref: AgentRunRef } }>(project.project_id, `${CODING_PREFIX}/sessions/${sid}/runs`, {
      task: "制定后台命令对账计划", intent: "plan", workspace_id: workspaceId, provider_id: "fixture", model_id: "fixture-model",
    });
    assert.equal((await settle(planRun.body.run.ref)).phase, "completed");
    const saved = await call<{ plan: { revision: number } }>(project.project_id, `${CODING_PREFIX}/sessions/${sid}/plan`, {
      expected_revision: 0, run_id: planRun.body.run.ref.run_id,
    });
    const confirmed = await call<{ plan: { revision: number } }>(project.project_id, `${CODING_PREFIX}/sessions/${sid}/plan/confirm`, {
      expected_revision: saved.body.plan.revision,
    });

    phase = "exec";
    execTurn = 0;
    const execRun = await call<{ run: { ref: AgentRunRef } }>(project.project_id, `${CODING_PREFIX}/sessions/${sid}/runs`, {
      task: "执行计划", intent: "execute", plan_revision: confirmed.body.plan.revision,
      workspace_id: workspaceId, provider_id: "fixture", model_id: "fixture-model",
    });
    const ended = await settle(execRun.body.run.ref);
    const runId = ended.ref.run_id;
    const initialBoard = ended.step_board!;
    const step1Before = initialBoard.nodes.find(n => n.id === "step-1")!;
    assert.equal(step1Before.state, "succeeded");
    assert.equal(step1Before.unknown_outcome, true, "succeeded step with unawaited background start-command must carry unknown_outcome");
    assert.equal(initialBoard.progress_summary?.completed_points, 0, "unknown_outcome step is deducted from completed_points");
    assert.equal(initialBoard.terminal, false, "board with unknown_outcome cannot be terminal");

    phase = "probe";
    probeText = "";
    const standingRun = await call<{ run: { ref: AgentRunRef } }>(project.project_id, `${CODING_PREFIX}/sessions/${sid}/runs`, {
      task: "PROBE_STANDING 查看当前计划进展", intent: "discuss", workspace_id: workspaceId, provider_id: "fixture", model_id: "fixture-model",
    });
    assert.equal((await settle(standingRun.body.run.ref)).phase, "completed");
    assert.match(probeText, /需核对（needs-reconciliation，命令结果未知待核对）/);

    const prematureAccept = await call(project.project_id, `${CODING_PREFIX}/sessions/${sid}/runs/${runId}/steps/step-1`, {
      action: "accepted", project_id: initialBoard.project_id, board_version: initialBoard.version, expected_revision: 0,
    });
    assert.equal(prematureAccept.status, 400, "accepting a step with unknown_outcome must be rejected");

    if (reconcileAction === "rerun") {
      const reconciled = await call<{ board: AgentStepBoard }>(project.project_id, `${CODING_PREFIX}/sessions/${sid}/runs/${runId}/plan-amendments`, {
        expected_version: initialBoard.version,
        amendment: { kind: "reconcile", node: "step-1", action: "rerun", note: "未拿到退出码，重新执行" },
      });
      assert.equal(reconciled.status, 200, JSON.stringify(reconciled.body));
      const step1FromAmend = reconciled.body.board.nodes.find(n => n.id === "step-1")!;
      assert.equal(step1FromAmend.state, "ready", "rerun must move step-1 back to ready instead of leaving it succeeded");
      assert.equal(step1FromAmend.unknown_outcome, undefined);
      assert.equal(reconciled.body.board.progress_summary?.completed_points, 0, "rerun must keep completed_points at 0");
      assert.equal(reconciled.body.board.terminal, false, "rerun must NOT close the plan");
      assert.equal(reconciled.body.board.nodes.find(n => n.id === "step-2")?.state, "not-started", "downstream step-2 stays gated on rerun");

      const reread = await getAdapter().read(ended.ref);
      assert.equal(reread.step_board?.nodes.find(n => n.id === "step-1")?.state, "ready");
      assert.equal(reread.step_board?.progress_summary?.completed_points, 0);

      probeText = "";
      const continuedRun = await call<{ run: { ref: AgentRunRef } }>(project.project_id, `${CODING_PREFIX}/sessions/${sid}/runs`, {
        task: "继续未完计划", intent: "execute", continue_step_board_of: runId, plan_revision: confirmed.body.plan.revision,
        workspace_id: workspaceId, provider_id: "fixture", model_id: "fixture-model",
      });
      assert.equal(continuedRun.status, 200, JSON.stringify(continuedRun.body));
      const continuedEnded = await settle(continuedRun.body.run.ref);
      assert.equal(continuedEnded.phase, "completed");
      assert.match(probeText, /rerun--step-1--1/, "continue_step_board_of resumes from the replacement ready node");
    } else {
      const skippedStep2 = await call<{ board: AgentStepBoard }>(project.project_id, `${CODING_PREFIX}/sessions/${sid}/runs/${runId}/plan-amendments`, {
        expected_version: initialBoard.version,
        amendment: { kind: "skip", node: "step-2", reason: "本轮暂缓下游联调" },
      });
      assert.equal(skippedStep2.status, 200, JSON.stringify(skippedStep2.body));
      assert.equal(skippedStep2.body.board.nodes.find(n => n.id === "step-2")?.skipped, true, "skip persists explicit skipped boolean");

      const reconciled = await call<{ board: AgentStepBoard }>(project.project_id, `${CODING_PREFIX}/sessions/${sid}/runs/${runId}/plan-amendments`, {
        expected_version: skippedStep2.body.board.version,
        amendment: { kind: "reconcile", node: "step-1", action: "confirm-done", note: "已人工确认构建产物完整" },
      });
      assert.equal(reconciled.status, 200, JSON.stringify(reconciled.body));
      const step1Confirmed = reconciled.body.board.nodes.find(n => n.id === "step-1")!;
      assert.equal(step1Confirmed.state, "succeeded");
      assert.equal(step1Confirmed.unknown_outcome, undefined);
      assert.equal(reconciled.body.board.nodes.find(n => n.id === "step-2")?.skipped, true, "skipped boolean survives board reload");
      assert.equal(reconciled.body.board.progress_summary?.completed_points, 3);

      const accepted = await call(project.project_id, `${CODING_PREFIX}/sessions/${sid}/runs/${runId}/steps/step-1`, {
        action: "accepted", project_id: reconciled.body.board.project_id, board_version: reconciled.body.board.version, expected_revision: 0,
      });
      assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    }
  };

  await runScenario("rerun");
  await runScenario("confirm-done");
});

test("BL-182 (R2-M1): subagent retry preserves parent's frozen resolved model even when parent omitted model_selection", { timeout: 60_000 }, async t => {
  let parentDispatched = false;
  const { host, home, project, workspaceId, call, providerRequests } = await codingProductHost(t, (req) => {
    const isChild = JSON.stringify(req.messages).includes("CHILD_FROZEN_MODEL");
    if (!isChild && !parentDispatched) {
      parentDispatched = true;
      const sysText = JSON.stringify((req as { system?: unknown }).system ?? "");
      const character = sysText.match(/molis-child-[a-z0-9-]+@\d+/)?.[0];
      assert.ok(character, `missing child character in coordinator prompt: ${sysText.slice(0, 300)}`);
      return cogniaScriptedResponse({
        name: "dispatch-subagent",
        input: {
          instruction: "CHILD_FROZEN_MODEL 检查默认模型冻结",
          tools: ["read", "search", "context-remaining"],
          character,
          idempotencyKey: "frozen-model-check",
        },
      });
    }
    return cogniaModelResponse(isChild ? "子任务执行完成" : "父会话已收到汇报", 8);
  });

  // Trigger lazy runtime registration once via Coding session/run or read workspaces.
  const warmupSession = await call<{ session: { session_id: string } }>(project.project_id, `${CODING_PREFIX}/sessions`, {});
  const warmRun = await call<{ run: { ref: AgentRunRef } }>(project.project_id, `${CODING_PREFIX}/sessions/${warmupSession.body.session.session_id}/runs`, {
    task: "初始化运行时", intent: "discuss", workspace_id: workspaceId, provider_id: "fixture", model_id: "fixture-model",
  });
  assert.equal(warmRun.status, 200);
  const service = ensureSystemAgentService(host, home);
  const adapter = service.agentHost.adapter("prologue");
  const decided = new Set<string>();
  const settleRun = async (ref: AgentRunRef) => {
    for (const deadline = Date.now() + 25_000; ;) {
      for (const rev of service.agentHost.reviews.list(project.project_id, "pending")) {
        if (!decided.has(rev.review_id)) {
          decided.add(rev.review_id);
          await service.agentHost.reviews.respond({ review_id: rev.review_id, version: rev.reference.version, decision: "approve", actor_id: "web-user" });
        }
      }
      const view = await adapter.read(ref);
      if (["completed", "failed", "cancelled", "stopped"].includes(view.phase)) return view;
      if (Date.now() > deadline) throw new Error(`run did not settle: ${view.phase}`);
      await new Promise(resolve => setTimeout(resolve, 15));
    }
  };
  const warmView = await settleRun(warmRun.body.run.ref);

  parentDispatched = false;
  const directDir = { canonical_path: warmView.frozen.directory!.canonical_path, realpath_verified: true as const };
  const owner = { project_id: project.project_id, plugin_id: "io.molis.work.coding", install_id: "i", actor_id: "web-user" };
  const directSession = await adapter.createSession({ ...owner, directory: directDir, title: "direct-r2-m1" });
  const directRun = await service.agentHost.start(
    "prologue",
    {
      ...owner,
      session: directSession,
      directory: directDir,
      task: "派发子任务验证无显式 model_selection 时的模型冻结",
      role_id: "coordinator",
      text_materials: [],
    } as never,
    { manifest: codingAgentManifest, prompts: codingPrompts, authorizedDirectories: [directDir.canonical_path] },
  );
  const directEnded = await settleRun(directRun.ref);
  assert.equal(directEnded.phase, "completed", directEnded.stop_reason ?? "");
  const children = await adapter.subagents!.list(directEnded.ref);
  assert.equal(children.length, 1);

  const credentialRef = withConnectorConnections(home, store => store.list()[0]!.credential_ref!);
  const db = new LocalSqliteStorage(join(home, "projects", "catalog.db"));
  try {
    new ModelProviderStore({ db: db.db, secrets: runWithMolisWorkHome(home, () => createFileSecretStore()) }).upsert({
      provider_id: "fixture", display_name: "Controlled SSE", base_url: "https://1.1.1.1/v1/messages", api_format: "anthropic-messages",
      credential_ref: credentialRef,
      models: [{ model_id: "drifted-default-model", enabled: true }, { model_id: "fixture-model", enabled: true }],
    });
  } finally {
    db.close();
  }

  const reqBefore = providerRequests.length;
  await adapter.subagents!.command!(directEnded.ref, children[0]!.subagent_id, {
    kind: "retry", source: "user-requested", child_run: children[0]!.child_run!, request_id: "frozen-model-retry",
  }, { actor_id: owner.actor_id, execution: {} });
  for (const deadline = Date.now() + 25_000; ;) {
    const row = (await adapter.subagents!.list(directEnded.ref)).find(item => item.subagent_id === children[0]!.subagent_id);
    if (row && row.state !== "running") break;
    if (Date.now() > deadline) throw new Error(`child did not settle: ${row?.state}`);
    await new Promise(resolve => setTimeout(resolve, 15));
  }
  const retryModels = providerRequests.slice(reqBefore).map(raw => (JSON.parse(raw) as { model?: string }).model);
  assert.ok(retryModels.length >= 1 && retryModels.every(m => m === "fixture-model"), `expected frozen_model fixture-model when model_selection omitted, got ${JSON.stringify(retryModels)}`);
});

test("BL-222, CHO-35: in-place rerun on non-succeeded step (chain.length === 1) settles to 100% and terminal after clean re-execution", { timeout: 60_000 }, async t => {
  let phase: "plan" | "exec1" | "exec2" = "plan";
  let turn = 0;
  let boardId = "";
  let planPrefix = "";
  const planJson = JSON.stringify({
    title: "原节点就地重跑结项计划",
    steps: [
      { title: "执行回归脚本", acceptance: "拿到退出码 0", story_points: 5, estimate_reason: "单步验证" },
    ],
    blockers: "",
    change_reason: "",
  });

  const { host, home, project, workspaceId, call } = await codingProductHost(t, (req) => {
    if (phase === "plan") return cogniaModelResponse(planJson, 12);
    const sys = JSON.stringify((req as { system?: unknown }).system ?? "");
    const msgs = JSON.stringify(req.messages);
    const full = `${sys}\n${msgs}`;
    if (!full.includes("本轮确认计划在项目任务图")) return cogniaModelResponse("[]", 5);
    turn += 1;
    if (phase === "exec1") {
      if (turn === 1) {
        ({ board: boardId, prefix: planPrefix } = placeIn(full));
        return cogniaScriptedResponse({ name: "board-read", input: { board: boardId } });
      }
      if (turn === 2) {
        return cogniaScriptedResponse({
          name: "board-report",
          input: { board: boardId, node: `${planPrefix}.step-1`, state: "running", note: "开始执行回归", version: versionIn(msgs) },
        });
      }
      if (turn === 3) {
        return cogniaScriptedResponse({
          name: "start-command",
          input: { executable: "sh", argv: ["-c", "sleep 15"] },
        });
      }
      return cogniaModelResponse("后台脚本未结束，本轮先停下等待核对。", 8);
    }
    if (turn === 1) {
      ({ board: boardId, prefix: planPrefix } = placeIn(full));
      return cogniaScriptedResponse({ name: "board-read", input: { board: boardId } });
    }
    if (turn === 2) {
      return cogniaScriptedResponse({
        name: "board-report",
        input: { board: boardId, node: `${planPrefix}.step-1`, state: "running", note: "重新执行回归脚本", version: versionIn(msgs) },
      });
    }
    if (turn === 3) {
      return cogniaScriptedResponse({ name: "board-read", input: { board: boardId } });
    }
    if (turn === 4) {
      return cogniaScriptedResponse({
        name: "board-report",
        input: { board: boardId, node: `${planPrefix}.step-1`, state: "succeeded", note: "重跑已拿到退出码 0", version: versionIn(msgs) },
      });
    }
    return cogniaModelResponse("重跑完成。", 8);
  });

  const service = ensureSystemAgentService(host, home);
  const getAdapter = () => service.agentHost.adapter("prologue");
  const decided = new Set<string>();
  const settle = async (ref: AgentRunRef) => {
    for (const deadline = Date.now() + 25_000; ;) {
      for (const rev of service.agentHost.reviews.list(project.project_id, "pending")) {
        if (!decided.has(rev.review_id)) {
          decided.add(rev.review_id);
          await service.agentHost.reviews.respond({ review_id: rev.review_id, version: rev.reference.version, decision: "approve", actor_id: "web-user" });
        }
      }
      const view = await getAdapter().read(ref);
      if (["completed", "failed", "cancelled", "stopped"].includes(view.phase)) return view;
      if (Date.now() > deadline) throw new Error(`run did not settle: ${view.phase}`);
      await new Promise(resolve => setTimeout(resolve, 15));
    }
  };

  const sid = (await call<{ session: { session_id: string } }>(project.project_id, `${CODING_PREFIX}/sessions`, {})).body.session.session_id;
  const planRun = await call<{ run: { ref: AgentRunRef } }>(project.project_id, `${CODING_PREFIX}/sessions/${sid}/runs`, {
    task: "制定单步重跑结项计划", intent: "plan", workspace_id: workspaceId, provider_id: "fixture", model_id: "fixture-model",
  });
  assert.equal((await settle(planRun.body.run.ref)).phase, "completed");
  const saved = await call<{ plan: { revision: number } }>(project.project_id, `${CODING_PREFIX}/sessions/${sid}/plan`, {
    expected_revision: 0, run_id: planRun.body.run.ref.run_id,
  });
  const confirmed = await call<{ plan: { revision: number } }>(project.project_id, `${CODING_PREFIX}/sessions/${sid}/plan/confirm`, {
    expected_revision: saved.body.plan.revision,
  });

  phase = "exec1";
  turn = 0;
  const exec1 = await call<{ run: { ref: AgentRunRef } }>(project.project_id, `${CODING_PREFIX}/sessions/${sid}/runs`, {
    task: "第一轮执行", intent: "execute", plan_revision: confirmed.body.plan.revision,
    workspace_id: workspaceId, provider_id: "fixture", model_id: "fixture-model",
  });
  const ended1 = await settle(exec1.body.run.ref);
  const runId1 = ended1.ref.run_id;
  const step1AfterExec1 = ended1.step_board!.nodes.find(n => n.id === "step-1")!;
  assert.equal(step1AfterExec1.state, "running");
  assert.equal(step1AfterExec1.unknown_outcome, true, "running step with unawaited command carries unknown_outcome");

  // Reconcile via `rerun` on a non-succeeded (`running`) step resets `step-1` in place (`chain.length === 1`).
  const reconciled = await call<{ board: AgentStepBoard }>(project.project_id, `${CODING_PREFIX}/sessions/${sid}/runs/${runId1}/plan-amendments`, {
    expected_version: ended1.step_board!.version,
    amendment: { kind: "reconcile", node: "step-1", action: "rerun", note: "后台命令未结束，重新跑一遍" },
  });
  assert.equal(reconciled.status, 200, JSON.stringify(reconciled.body));
  assert.equal(reconciled.body.board.nodes.find(n => n.id === "step-1")?.state, "ready");
  assert.equal(reconciled.body.board.nodes.find(n => n.id === "step-1")?.unknown_outcome, undefined);

  // Clean re-execution on the same node (`chain.length === 1`) must settle to `succeeded`, 100%, `terminal: true`, and allow step acceptance!
  phase = "exec2";
  turn = 0;
  const exec2 = await call<{ run: { ref: AgentRunRef } }>(project.project_id, `${CODING_PREFIX}/sessions/${sid}/runs`, {
    task: "继续重跑", intent: "execute", continue_step_board_of: runId1, plan_revision: confirmed.body.plan.revision,
    workspace_id: workspaceId, provider_id: "fixture", model_id: "fixture-model",
  });
  const ended2 = await settle(exec2.body.run.ref);
  const board2 = ended2.step_board!;
  const step1AfterExec2 = board2.nodes.find(n => n.id === "step-1")!;
  assert.equal(step1AfterExec2.state, "succeeded");
  assert.equal(step1AfterExec2.unknown_outcome, undefined, "post-rerun succeeded step must NOT revert to unknown_outcome");
  assert.equal(board2.progress_summary?.completed_points, 5);
  assert.equal(board2.progress_summary?.weighted_percent, 100);
  assert.equal(board2.terminal, true, "plan reaches terminal once in-place rerun succeeds cleanly");

  const accepted = await call(project.project_id, `${CODING_PREFIX}/sessions/${sid}/runs/${ended2.ref.run_id}/steps/step-1`, {
    action: "accepted", project_id: board2.project_id, board_version: board2.version, expected_revision: 0,
  });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
});

test("BL-222 / F-horiz-runtime-02: applyRunEvent maps EFFECT_RECONCILE_REQUIRED command to unknown_outcome while TOOL_INTERRUPTED stays failed", () => {
  const at = "2026-11-26T00:00:01.000Z";
  const baseBoard = (): AgentStepBoard => ({
    project_id: "project-reconcile",
    version: 3,
    terminal: true,
    progress_summary: {
      weighted_percent: 100,
      completed_points: 3,
      total_points: 3,
      estimated_leaves: 1,
      unestimated_leaves: 0,
      completed_unestimated_leaves: 0,
      removed_scope_leaves: 0,
      removed_scope_points: 0,
    },
    nodes: [{
      id: "step-1",
      state: "succeeded",
      story_points: 3,
      progress: 1,
      reports: [{ note: "执行构建命令", at_ms: Date.parse(at) }],
    }],
  });

  // Positive case: SDK emits outcome: "failed" with errorCode: "EFFECT_RECONCILE_REQUIRED" when receipt is lost after dispatch.
  const reconcileState = emptyPrologueStreamState();
  applyRunEvent(reconcileState, { type: "tool-call", call: { id: "cmd-reconcile", name: "run-command", input: { executable: "pnpm", argv: ["build"] } } }, at);
  applyRunEvent(reconcileState, {
    type: "tool-result",
    callId: "cmd-reconcile",
    name: "run-command",
    text: "EFFECT_RECONCILE_REQUIRED: The command executed, but its durable receipt could not be saved.",
    outcome: "failed",
    errorCode: "EFFECT_RECONCILE_REQUIRED",
  }, at);
  applyRunEvent(reconcileState, { type: "failed", error: { code: "EFFECT_RECONCILE_REQUIRED", safeMessage: "reconcile required" } }, at);
  assert.equal(reconcileState.activity[0]?.state, "unknown");
  const reconciledBoard = applyUnknownCommandOutcomes(
    { phase: reconcileState.phase, activity: reconcileState.activity },
    baseBoard(),
  );
  assert.equal(reconciledBoard.nodes[0]?.unknown_outcome, true, "EFFECT_RECONCILE_REQUIRED command must flag unknown_outcome: true");
  assert.equal(reconciledBoard.terminal, false, "board with EFFECT_RECONCILE_REQUIRED command cannot remain terminal");
  assert.equal(reconciledBoard.progress_summary?.completed_points, 0, "unknown_outcome deducts completed_points");

  // Negative case: SDK emits TOOL_INTERRUPTED only when a command never ran; must stay "failed" and never flag unknown_outcome.
  const interruptedState = emptyPrologueStreamState();
  applyRunEvent(interruptedState, { type: "tool-call", call: { id: "cmd-interrupted", name: "run-command", input: { executable: "pnpm", argv: ["test"] } } }, at);
  applyRunEvent(interruptedState, {
    type: "tool-result",
    callId: "cmd-interrupted",
    name: "run-command",
    text: "TOOL_INTERRUPTED: this run was cancelled before the tool ran. Nothing ran.",
    outcome: "failed",
    errorCode: "TOOL_INTERRUPTED",
  }, at);
  applyRunEvent(interruptedState, { type: "cancelled" }, at);
  assert.equal(interruptedState.activity[0]?.state, "failed");
  const interruptedBoard = applyUnknownCommandOutcomes(
    { phase: interruptedState.phase, activity: interruptedState.activity },
    baseBoard(),
  );
  assert.equal(interruptedBoard.nodes[0]?.unknown_outcome, undefined, "TOOL_INTERRUPTED unexecuted command must NOT flag unknown_outcome");
  assert.equal(interruptedBoard.terminal, true);
  assert.equal(interruptedBoard.progress_summary?.completed_points, 3);
});

interface ReconcileSdkRuntime {
  workspace: { authorize(input: { path: string; posture: "read-write" }): Promise<{ ref: unknown }> };
  sessions: { create(input: { title: string }): Promise<unknown> };
  startAgentRun(input: {
    session: unknown;
    rootRef: unknown;
    start: {
      protocol: string;
      endpoint: string;
      model: string;
      credentialRef: unknown;
      messages: Array<{ role: string; text: string }>;
    };
    agent: { idempotencyKey: string; toolNames: string[]; budget: { maxTurns: number } };
    runTool(invocation: { registration: { name: string } }): Promise<{ text: string }>;
  }): Promise<{
    run: { subscribe(listener: (event: Record<string, unknown>) => void): void };
    control: { stop(reason: string): Promise<void> };
    policy: { decide(id: string, decision: string): Promise<void> };
  }>;
  shutdown(): Promise<void>;
}

interface ReconcileSdkModule {
  createRuntime(input: Record<string, unknown>): Promise<ReconcileSdkRuntime>;
  createPrologueError(code: string, safeMessage: string): Error & { code: string };
}

interface ReconcileMemoryHost {
  writeCredential(input: { label: string; secret: { plaintext: Uint8Array } }): Promise<{ ref: unknown }>;
}

interface ReconcileTestingModule {
  createMemoryHost(input: Record<string, unknown>): ReconcileMemoryHost;
}

test("F-TEST-08 / BL-222: real SDK tool throwing EFFECT_RECONCILE_REQUIRED flows through prologue-stream into unknown_outcome while read-only TOOL_INTERRUPTED stays failed", async () => {
  const requireSdk = createRequire(new URL("../horizontal/agent-host/package.json", import.meta.url));
  const { createRuntime, createPrologueError } = await import(requireSdk.resolve("@prologue/sdk")) as ReconcileSdkModule;
  const { createMemoryHost } = await import(requireSdk.resolve("@prologue/sdk/testing")) as ReconcileTestingModule;
  const at = "2026-11-26T00:00:01.000Z";
  const baseBoard = (): AgentStepBoard => ({
    project_id: "project-reconcile-sdk",
    version: 4,
    terminal: true,
    progress_summary: {
      weighted_percent: 100,
      completed_points: 3,
      total_points: 3,
      estimated_leaves: 1,
      unestimated_leaves: 0,
      completed_unestimated_leaves: 0,
      removed_scope_leaves: 0,
      removed_scope_points: 0,
    },
    nodes: [{
      id: "step-1",
      state: "succeeded",
      story_points: 3,
      progress: 1,
      reports: [{ note: "真实工具执行构建命令", at_ms: Date.parse(at) }],
    }],
  });
  const toolTurnFrames = (calls: ReadonlyArray<{ id: string; name: string; args: Record<string, unknown> }>) => [
    ...calls.map((c, index) => `data: ${JSON.stringify({
      id: "chatcmpl-1",
      choices: [{ index: 0, delta: { tool_calls: [{ index, id: c.id, type: "function", function: { name: c.name, arguments: JSON.stringify(c.args) } }] }, finish_reason: null }],
    })}\n\n`),
    `data: ${JSON.stringify({ id: "chatcmpl-1", choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] })}\n\n`,
    "data: [DONE]\n\n",
  ];
  const runSdkScenario = async (mode: "reconcile" | "interrupted") => {
    const host = createMemoryHost({
      capabilities: { "workspace.command": "present", "workspace.write": "present" },
      files: { "README.md": "hello" },
      script: {
        turns: [
          {
            frames: toolTurnFrames(mode === "reconcile"
              ? [
                  { id: "call_cmd", name: "run-command", args: { executable: "echo", argv: ["hi"] } },
                  { id: "call_read", name: "read", args: { path: "README.md" } },
                ]
              : [
                  { id: "call_read_1", name: "read", args: { path: "README.md" } },
                  { id: "call_read_2", name: "read", args: { path: "README.md" } },
                ]),
          },
          {
            frames: [
              `data: ${JSON.stringify({ id: "chatcmpl-2", choices: [{ index: 0, delta: { content: "done" }, finish_reason: "stop" }] })}\n\n`,
              "data: [DONE]\n\n",
            ],
          },
        ],
      },
    });
    const cred = await host.writeCredential({ label: "fixture-key", secret: { plaintext: new TextEncoder().encode("secret") } });
    const runtime = await createRuntime({
      host,
      preset: "local-agent",
      network: { model: true },
      posture: { sandbox: "workspace-write", approval: "untrusted" },
      permissionMode: {
        mode: "auto-allow",
        allow: [{ what: "tool", name: "run-command" }, { what: "tool", name: "read" }],
      },
      rules: [
        { source: "runtime", effect: "allow", match: { what: "tool", name: "run-command" } },
        { source: "runtime", effect: "allow", match: { what: "tool", name: "read" } },
      ],
      app: { appId: "io.molis.reconcile-test", appVersion: "1.0.0" },
    });
    try {
      const root = await runtime.workspace.authorize({ path: "/workspace", posture: "read-write" });
      const session = await runtime.sessions.create({ title: `reconcile-${mode}` });
      let started: Awaited<ReturnType<ReconcileSdkRuntime["startAgentRun"]>> | undefined;
      started = await runtime.startAgentRun({
        session,
        rootRef: root.ref,
        start: {
          protocol: "openai-compatible",
          endpoint: "https://api.example.test/v1/chat/completions",
          model: "fixture",
          credentialRef: cred.ref,
          messages: [{ role: "user", text: "execute tools" }],
        },
        agent: { idempotencyKey: `reconcile-sdk-${mode}`, toolNames: ["run-command", "read"], budget: { maxTurns: 2 } },
        runTool: async (invocation) => {
          if (mode === "reconcile" && invocation.registration.name === "run-command") {
            throw createPrologueError("EFFECT_RECONCILE_REQUIRED", "command outcome unknown after transport drop");
          }
          if (mode === "interrupted" && invocation.registration.name === "read") {
            await started?.control.stop("cancelled");
            throw createPrologueError("CANCELLED", "user cancelled while reading");
          }
          return { text: "ok" };
        },
      });
      const stream = emptyPrologueStreamState();
      await new Promise<void>((resolve) => {
        started!.run.subscribe((event) => {
          applyRunEvent(stream, event as Parameters<typeof applyRunEvent>[1], at);
          if (event.type === "awaiting-approval") {
            const approval = event.approval as { id?: string } | undefined;
            if (approval?.id) {
              void started!.policy.decide(approval.id, "allow-once");
            }
          }
          if (typeof event.type === "string" && ["completed", "failed", "cancelled", "tripped"].includes(event.type)) {
            resolve();
          }
        });
      });
      return stream;
    } finally {
      await runtime.shutdown();
    }
  };

  // Real tool throwing EFFECT_RECONCILE_REQUIRED -> prologue-stream marks run-command "unknown",
  // queued read-only tool receives TOOL_INTERRUPTED -> "failed" (not "unknown"), and step board blocks acceptance.
  const reconcileStream = await runSdkScenario("reconcile");
  assert.equal(reconcileStream.phase, "failed");
  const cmdActivity = reconcileStream.activity.find(item => item.name === "run-command");
  const queuedReadActivity = reconcileStream.activity.find(item => item.name === "read");
  assert.equal(cmdActivity?.state, "unknown", "real EFFECT_RECONCILE_REQUIRED tool must map to state=unknown");
  assert.match(cmdActivity?.summary ?? "", /EFFECT_RECONCILE_REQUIRED/);
  assert.equal(queuedReadActivity?.state, "failed", "unexecuted queued read after reconcile stop must stay state=failed");
  assert.match(queuedReadActivity?.summary ?? "", /TOOL_INTERRUPTED/);
  const reconciledBoard = applyUnknownCommandOutcomes(
    { phase: reconcileStream.phase, activity: reconcileStream.activity },
    baseBoard(),
  );
  assert.equal(reconciledBoard.nodes[0]?.unknown_outcome, true, "real EFFECT_RECONCILE_REQUIRED must mark step unknown_outcome to block acceptance");
  assert.equal(reconciledBoard.terminal, false, "step board with unknown_outcome must not remain terminal");
  assert.equal(reconciledBoard.progress_summary?.completed_points, 0, "step board with unknown_outcome must deduct completed_points");

  // Real read-only tool interrupted by cancellation -> SDK emits TOOL_INTERRUPTED,
  // prologue-stream keeps all entries "failed", and step board does NOT flag unknown_outcome.
  const interruptedStream = await runSdkScenario("interrupted");
  assert.equal(interruptedStream.phase, "cancelled");
  assert.equal(interruptedStream.activity.length, 2);
  for (const item of interruptedStream.activity) {
    assert.equal(item.name, "read");
    assert.equal(item.state, "failed", "read-only TOOL_INTERRUPTED must never be misclassified as unknown");
    assert.match(item.summary ?? "", /TOOL_INTERRUPTED/);
  }
  const interruptedBoard = applyUnknownCommandOutcomes(
    { phase: interruptedStream.phase, activity: interruptedStream.activity },
    baseBoard(),
  );
  assert.equal(interruptedBoard.nodes[0]?.unknown_outcome, undefined, "read-only TOOL_INTERRUPTED must never flag unknown_outcome");
  assert.equal(interruptedBoard.terminal, true);
  assert.equal(interruptedBoard.progress_summary?.completed_points, 3);
});
