import assert from "node:assert/strict";
import test from "node:test";
import { createLocalHostCapsule } from "@molis-ai/molis-work-app-local-host";
import { renderDesktopCapsuleShell } from "@molis-ai/molis-work-app-desktop";
const { buildCapsuleSnapshot, renderCapsuleShell } = createLocalHostCapsule(renderDesktopCapsuleShell);
import type { GoalActionKind, GoalDisplayStatus } from "@molis-ai/molis-work-plugin-goals";
import type { GoalRecord } from "@molis-ai/molis-work-contracts/modules/goals";
import type { MolisWorkWebView, WebGoalView } from "./workbench-renderer-fixture.js";

const PROJECT = { project_id: "project-capsule", display_name: "胶囊测试" };

function goal(goalId: string, title: string, fulfillmentState: "unmet" | "satisfied" = "unmet"): GoalRecord {
  return {
    goal_id: goalId,
    board_id: "board-capsule",
    title,
    outcome: `${title}有明确结果`,
    why: `为了验证${title}`,
    business_logic: "只读取同一份 Molis Work 状态。",
    in_scope: [],
    out_of_scope: [],
    constraints: [],
    required_inputs: [],
    promised_outputs: [],
    definition_state: "accepted",
    decomposition_state: "closed_leaf",
    validity_state: "valid",
    fulfillment_state: fulfillmentState,
    trashed_at: null,
    trashed_by: null,
    archived_at: null,
    archived_by: null,
    priority: 1,
    accepted_by: "test-user",
    accepted_at: "2026-08-24T08:00:00.000Z",
    created_at: "2026-08-24T08:00:00.000Z",
    updated_at: "2026-08-24T08:00:00.000Z",
    acceptance_criteria: [{
      criterion_id: `${goalId}-done`,
      goal_id: goalId,
      statement: "真实状态能在四秒内显示",
      decision_method: "inspection",
      pass_condition: "界面显示与 Molis Work 一致",
      target: null,
      required_evidence: [],
    }],
  };
}

function webGoal(
  record: GoalRecord,
  workState: WebGoalView["work_state"],
  options: Partial<WebGoalView> = {},
): WebGoalView {
  const hasHumanDecision = options.review_obligations?.some((item) =>
    item.role === "human_approver" && item.state === "pending"
  ) ?? false;
  const displayStatus: GoalDisplayStatus = record.fulfillment_state === "satisfied"
    ? "completed"
    : hasHumanDecision
      ? "waiting_user"
    : workState === "executing" || workState === "clarifying" || workState === "reviewing" || workState === "revalidating"
      ? "in_progress"
      : workState === "waiting_for_human"
        ? "waiting_user"
        : workState.includes("blocked") || workState === "invalidated"
          ? "blocked"
          : workState === "waiting_children" || workState === "replaced"
            ? "waiting"
            : "continue";
  const actionKind: GoalActionKind = workState.includes("clarif")
    ? "clarify"
    : workState.includes("review") || workState === "waiting_for_human"
      ? "review"
      : workState.includes("revalidat")
        ? "revalidate"
        : "execute";
  const action = displayStatus === "completed" || displayStatus === "waiting"
    ? null
    : {
        action_id: `action-${record.goal_id}`,
        actor: displayStatus === "waiting_user" ? "user" as const : "runtime" as const,
        kind: actionKind,
        status: displayStatus === "in_progress" ? "active" as const : displayStatus === "blocked" ? "blocked" as const : "ready" as const,
        target_type: hasHumanDecision ? "review_obligation" : "goal",
        target_id: hasHumanDecision
          ? options.review_obligations?.find((item) => item.role === "human_approver" && item.state === "pending")?.obligation_id ?? record.goal_id
          : record.goal_id,
        reasons: [],
      };
  return {
    goal: record,
    status: workState as WebGoalView["status"],
    action_projection: {
      goal_id: record.goal_id,
      contract_revision: record.current_contract_revision ?? 1,
      progress: displayStatus === "completed" ? "verified" : displayStatus === "in_progress" ? "in_progress" : "not_started",
      primary_action: action,
      actions: action ? [action] : [],
      action_token: `token-${record.goal_id}`,
      display_status: displayStatus,
    },
    display_status: displayStatus,
    work_state: workState,
    status_label: displayStatus === "continue"
      ? "可继续"
      : displayStatus === "in_progress"
        ? "进行中"
        : displayStatus === "waiting_user"
          ? "等你"
          : displayStatus === "waiting"
            ? "等待中"
            : displayStatus === "blocked"
              ? "受阻"
              : "已完成",
    main_action_label: actionKind === "review"
      ? displayStatus === "waiting_user" ? "完成验收" : "开始复核"
      : actionKind === "clarify" ? "继续澄清" : "开始推进",
    action_summary: displayStatus === "waiting_user" ? "Runtime 能做的部分已经结束，现在轮到你决定" : "按当前主动作继续",
    reasons: [],
    active_claim_actor: null,
    active_claim: null,
    claims: [],
    runs: [],
    evidence: [],
    review_obligations: [],
    reviews: [],
    risks: [],
    impacts: [],
    relations: [],
    coverage: [],
    input_bindings: [],
    policy_bindings: [],
    events: [],
    resolved_policy: {
      goal_mode: "disabled",
      required_capabilities: [],
      self_verification: false,
      cross_reviewers: 0,
      adversarial_reviewers: 0,
      human_approval: false,
      max_lease_seconds: 1800,
    },
    passed_criteria: [],
    pending_reviews: [],
    ...options,
  };
}

function view(goals: WebGoalView[], activeGoalId: string | null): MolisWorkWebView {
  return {
    snapshot: {
      board: {
        board_id: "",
        title: "胶囊测试",
        active_goal_id: activeGoalId,
        created_at: "2026-08-24T08:00:00.000Z",
        updated_at: "2026-08-24T08:00:00.000Z",
      },
      cursor: 9,
      goals: goals.map((item) => item.goal),
      relations: [],
      impacts: [],
      risks: [],
      claims: goals.flatMap((item) => item.claims),
      runs: goals.flatMap((item) => item.runs),
      evidence: goals.flatMap((item) => item.evidence),
      review_obligations: goals.flatMap((item) => item.review_obligations),
      reviews: goals.flatMap((item) => item.reviews),
      candidates: [],
      contract_proposals: [],
      rewires: [],
      clarification_sessions: [],
      clarification_turns: [],
      goal_tree_proposals: [],
      planning_method_packs: [],
    },
    project: PROJECT,
    projects: [PROJECT],
    route_prefix: "/projects/project-capsule",
    demo: false,
    active_goal_id: activeGoalId,
    goals,
    archived_goals: [],
    trashed_goals: [],
    counts: {} as MolisWorkWebView["counts"],
    coverage: [],
    input_bindings: [],
    policy_bindings: [],
    events: [],
  };
}

function directoryItem(record: GoalRecord): { goal_id: string } {
  return { goal_id: record.goal_id };
}

function ready(record: GoalRecord, _nextAction?: string): { goal_id: string } {
  return directoryItem(record);
}

function activeRun(goalId: string, startedAt: string, actorId = "runtime-a") {
  return {
    run_id: `run-${goalId}`,
    board_id: "board-capsule",
    goal_id: goalId,
    claim_id: `claim-${goalId}`,
    actor_id: actorId,
    role: "executor" as const,
    state: "started" as const,
    block_reason: null,
    output_refs: [],
    discovery_refs: [],
    started_at: startedAt,
    ended_at: null,
  };
}

test("capsule projects a real active Run as Working", () => {
  const record = goal("working-goal", "实现真实状态胶囊");
  const item = webGoal(record, "executing", {
    runs: [activeRun(record.goal_id, "2026-08-24T09:00:00.000Z")],
  });
  const result = buildCapsuleSnapshot(view([item], record.goal_id), [], new Date("2026-08-24T09:03:00.000Z"));
  assert.equal(result.state.kind, "working");
  assert.equal(result.state.goal_title, record.title);
  assert.equal(result.state.status_since, "2026-08-24T09:00:00.000Z");
  assert.equal(result.state.action_path, "/projects/project-capsule/goals/working-goal");
  assert.equal(result.state.menu_bar_title, "进行中");
  assert.equal(result.default_tab, "in_progress");
  assert.deepEqual(result.tabs.map((tab) => [tab.kind, tab.items.length]), [["in_progress", 1]]);
});

test("capsule routes an actionable Goal to main Molis Work instead of creating work", () => {
  const record = goal("startable-goal", "开始下一项真实工作");
  const result = buildCapsuleSnapshot(
    view([webGoal(record, "execution_pending")], null),
    [ready(record)],
    new Date("2026-08-24T09:04:00.000Z"),
  );
  const projected = result.tabs[0]?.items[0];

  assert.equal(projected?.status_label, "可继续");
  assert.equal(projected?.action_label, "开始推进");
});

test("capsule ignores a stale current Goal and shows the real running Goal", () => {
  const staleRecord = goal("stale-goal", "上次查看的目标");
  const liveRecord = goal("live-goal", "真正正在推进的目标");
  const stale = webGoal(staleRecord, "execution_pending");
  const live = webGoal(liveRecord, "executing", {
    runs: [activeRun(liveRecord.goal_id, "2026-08-24T09:02:00.000Z")],
  });

  const result = buildCapsuleSnapshot(
    view([stale, live], staleRecord.goal_id),
    [ready(staleRecord)],
    new Date("2026-08-24T09:03:00.000Z"),
  );

  assert.equal(result.state.kind, "working");
  assert.equal(result.state.goal_id, liveRecord.goal_id);
  assert.equal(result.state.goal_title, liveRecord.title);
  assert.equal(result.state.running_count, 1);
  assert.equal(result.default_tab, "in_progress");
  assert.deepEqual(result.tabs.map((tab) => tab.kind), ["in_progress", "continue"]);
});

test("capsule does not present an unclaimed prerequisite blocker as current work", () => {
  const blockedRecord = goal("unclaimed-blocked-goal", "还不具备执行条件的目标");
  const nextRecord = goal("actionable-goal", "现在可以开始的目标");
  const blocked = webGoal(blockedRecord, "execution_blocked", {
    reasons: [{
      code: "dependency.unsatisfied",
      severity: "blocker",
      subject_type: "goal",
      subject_id: blockedRecord.goal_id,
      message: "前置目标还没有完成",
    }],
  });

  const result = buildCapsuleSnapshot(
    view([blocked, webGoal(nextRecord, "execution_pending")], blockedRecord.goal_id),
    [ready(nextRecord)],
    new Date("2026-08-24T09:03:00.000Z"),
  );

  assert.equal(result.state.kind, "ready");
  assert.equal(result.state.goal_id, nextRecord.goal_id);
  assert.equal(result.state.running_count, 0);
  assert.equal(result.state.additional_running, 0);
  assert.equal(result.default_tab, "continue");
  assert.deepEqual(result.tabs.map((tab) => tab.kind), ["continue", "blocked"]);
});

test("capsule never replaces a current blocker with a released Run's historical reason", () => {
  const record = goal("historical-run-blocker", "范围已经纠偏的目标");
  const historicalRun = {
    ...activeRun(record.goal_id, "2026-08-24T08:30:00.000Z"),
    state: "completed" as const,
    block_reason: "旧范围要求补 Agent 成本和返工证据",
    ended_at: "2026-08-24T08:45:00.000Z",
  };
  const item = webGoal(record, "execution_blocked", {
    runs: [historicalRun],
    reasons: [{
      code: "risk.blocks_completion",
      severity: "blocker",
      subject_type: "risk",
      subject_id: "current-coverage-risk",
      message: "当前仍需处理来源覆盖风险",
      remediation: "先处理当前覆盖风险，再重新完成。",
    }],
  });

  const result = buildCapsuleSnapshot(
    view([item], record.goal_id),
    [],
    new Date("2026-08-24T09:03:00.000Z"),
  );

  assert.equal(result.state.kind, "blocked");
  assert.doesNotMatch(result.state.blocker ?? "", /Agent 成本和返工证据/);
});

test("capsule keeps an active current Goal focused and reports other running work", () => {
  const focusedRecord = goal("focused-live-goal", "用户正在关注的工作");
  const newerRecord = goal("newer-live-goal", "稍后启动的并行工作");
  const focused = webGoal(focusedRecord, "executing", {
    runs: [activeRun(focusedRecord.goal_id, "2026-08-24T09:00:00.000Z")],
  });
  const newer = webGoal(newerRecord, "executing", {
    runs: [activeRun(newerRecord.goal_id, "2026-08-24T09:02:00.000Z", "runtime-b")],
  });

  const result = buildCapsuleSnapshot(
    view([focused, newer], focusedRecord.goal_id),
    [],
    new Date("2026-08-24T09:03:00.000Z"),
  );

  assert.equal(result.state.goal_id, focusedRecord.goal_id);
  assert.equal(result.state.running_count, 2);
  assert.equal(result.state.additional_running, 1);
  assert.equal(result.state.menu_bar_title, "进行中 · 2");
  assert.deepEqual(result.tabs[0]?.items.map((item) => item.goal_id), [
    focusedRecord.goal_id,
    newerRecord.goal_id,
  ]);
});

test("capsule shows work needing the user before unrelated running work when focus is stale", () => {
  const staleRecord = goal("stale-ready-goal", "已经不在工作的当前目标");
  const decisionRecord = goal("needs-user-goal", "确认关键结果");
  const liveRecord = goal("background-live-goal", "并行推进其他工作");
  const decision = webGoal(decisionRecord, "review_pending", {
    review_obligations: [{
      obligation_id: "needs-user-review",
      board_id: "board-capsule",
      goal_id: decisionRecord.goal_id,
      role: "human_approver",
      required_count: 1,
      independence_rule: "user",
      criterion_scope: ["needs-user-goal-done"],
      state: "pending",
      created_at: "2026-08-24T09:02:30.000Z",
    }],
  });
  const live = webGoal(liveRecord, "executing", {
    runs: [activeRun(liveRecord.goal_id, "2026-08-24T09:02:00.000Z")],
  });

  const result = buildCapsuleSnapshot(
    view([webGoal(staleRecord, "execution_pending"), decision, live], staleRecord.goal_id),
    [ready(staleRecord)],
    new Date("2026-08-24T09:03:00.000Z"),
  );

  assert.equal(result.state.kind, "needs_you");
  assert.equal(result.state.goal_id, decisionRecord.goal_id);
  assert.equal(result.state.additional_running, 1);
  assert.equal(result.default_tab, "waiting_user");
  assert.deepEqual(result.tabs.map((tab) => tab.kind), ["waiting_user", "in_progress", "continue"]);
  assert.equal(
    result.state.action_path,
    "/projects/project-capsule/goals/needs-user-goal",
  );
});

test("capsule prioritizes a pending user decision and deep-links to that Goal", () => {
  const record = goal("decision-goal", "确认胶囊信息结构");
  const item = webGoal(record, "review_pending", {
    review_obligations: [{
      obligation_id: "human-decision",
      board_id: "board-capsule",
      goal_id: record.goal_id,
      role: "human_approver",
      required_count: 1,
      independence_rule: "user",
      criterion_scope: ["decision-goal-done"],
      state: "pending",
      created_at: "2026-08-24T09:04:00.000Z",
    }],
  });
  const result = buildCapsuleSnapshot(view([item], record.goal_id), [], new Date("2026-08-24T09:05:00.000Z"));
  assert.equal(result.state.kind, "needs_you");
  assert.match(result.state.current, /轮到你决定/);
  assert.equal(
    result.state.action_path,
    "/projects/project-capsule/goals/decision-goal",
  );
  assert.equal(result.state.menu_bar_title, "等你");
  assert.equal(result.tabs[0]?.items[0]?.next_step, "完成验收");
});

test("capsule groups every actionable Goal into one horizontal status tab", () => {
  const complete = goal("complete-now", "直接完成的目标");
  const executeFirst = goal("execute-first", "先执行的目标");
  const clarify = goal("clarify-next", "需要继续说清楚的目标");
  clarify.definition_state = "draft";
  clarify.decomposition_state = "abstract";
  const executeSecond = goal("execute-second", "随后执行的目标");
  const currentView = view([
    webGoal(complete, "completion_pending"),
    webGoal(executeFirst, "execution_pending"),
    webGoal(clarify, "clarification_pending"),
    webGoal(executeSecond, "execution_pending"),
  ], null);

  const result = buildCapsuleSnapshot(currentView, [
    ready(complete, "complete"),
    ready(executeFirst),
    ready(clarify, "clarify"),
    ready(executeSecond),
    ready(executeFirst),
  ]);

  assert.equal(result.default_tab, "continue");
  assert.deepEqual(result.tabs.map((tab) => [tab.kind, tab.items.length]), [
    ["continue", 4],
  ]);
  assert.deepEqual(
    result.tabs.find((tab) => tab.kind === "continue")?.items.map((item) => item.goal_id),
    [complete.goal_id, executeFirst.goal_id, clarify.goal_id, executeSecond.goal_id],
  );
  assert.equal(result.tabs.flatMap((tab) => tab.items).length, 4);
  assert.equal(result.tabs[0]!.items[0]!.status_label, "可继续");
});

test("capsule shows a real completion briefly, then the authoritative next actionable Goal", () => {
  const completed = webGoal(goal("completed-goal", "完成胶囊状态链", "satisfied"), "satisfied", {
    evidence: [{
      evidence_id: "evidence-complete",
      board_id: "board-capsule",
      goal_id: "completed-goal",
      criterion_ids: ["completed-goal-done"],
      producer_actor_id: "runtime-a",
      run_id: "run-complete",
      review_id: null,
      kind: "test",
      locator: "test://capsule",
      locator_status: "unverified",
      locator_validation_reason: "测试夹具中的不透明 locator",
      locator_checked_at: null,
      locator_workspace_id: null,
      digest: "三种真实状态已经通过检查",
      captured_at: "2026-08-24T09:09:59.000Z",
      result: "passed",
      lifecycle_state: "effective",
      correction: null,
    }],
  });
  const nextRecord = goal("next-goal", "补齐恢复与发布");
  const next = webGoal(nextRecord, "execution_pending");
  const currentView = view([completed, next], "completed-goal");
  currentView.events = [{
    seq: 10,
    event_id: "event-complete",
    actor_id: "runtime-a",
    type: "goal.satisfied",
    object_type: "goal",
    object_id: "completed-goal",
    reason: "完成条件满足",
    payload: {},
    at: "2026-08-24T09:10:00.000Z",
  }];

  const justCompleted = buildCapsuleSnapshot(
    currentView,
    [ready(nextRecord)],
    new Date("2026-08-24T09:10:06.000Z"),
  );
  assert.equal(justCompleted.state.kind, "complete");
  assert.equal(justCompleted.state.just_completed, "三种真实状态已经通过检查");
  assert.equal(justCompleted.state.action_path, "/projects/project-capsule/goals/completed-goal");
  assert.equal(justCompleted.state.menu_bar_title, "已完成");
  assert.equal(justCompleted.default_tab, "completed");
  assert.deepEqual(justCompleted.tabs.map((tab) => tab.kind), ["continue", "completed"]);

  const afterResult = buildCapsuleSnapshot(
    currentView,
    [ready(nextRecord)],
    new Date("2026-08-24T09:10:11.000Z"),
  );
  assert.equal(afterResult.state.kind, "ready");
  assert.equal(afterResult.state.goal_id, "next-goal");
  assert.equal(afterResult.state.menu_bar_title, "可继续");
});

test("capsule shell is one menu-bar popover with horizontal state tabs and inline Goal details", () => {
  const html = renderCapsuleShell([PROJECT]);
  assert.match(html, /capsule-shell/);
  assert.match(html, /capsule__arrow/);
  assert.match(html, /data-capsule-project/);
  assert.match(html, /data-loading="true"/);
  assert.match(html, /capsule__spinner/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /正在获取这个项目的最新工作状态/);
  assert.match(html, /data-capsule-tabs/);
  assert.match(html, /role="tablist"/);
  assert.match(html, /data-capsule-list/);
  assert.match(html, /capsule__goal-row/);
  assert.match(html, /aria-selected/);
  assert.match(html, /overflow-x: auto/);
  assert.match(html, /--accent: #5e6ad2/);
  assert.match(html, /Noto Sans SC/);
  assert.match(html, /html body \* \{[\s\S]*font-weight: 400 !important/);
  assert.doesNotMatch(html, /#4f6ff7/);
  assert.match(html, /event\.key !== "ArrowLeft"/);
  assert.match(html, /event\.key !== "Escape"/);
  assert.match(html, /capsule_hide/);
  assert.match(html, /capsule_resize/);
  assert.match(html, /capsule_update_menu_bar/);
  assert.match(html, /title: next\.state\.menu_bar_title/);
  assert.match(html, /new AbortController\(\)/);
  assert.match(html, /requestId !== requestSequence/);
  assert.match(html, /requestedProjectId !== projectId/);
  assert.match(html, /activeRequest\?\.controller\.abort\(\)/);
  assert.match(html, /if \(activeRequest\) return;/);
  assert.match(html, /load\(\{ showLoading: true \}\)/);
  assert.match(html, /window\.setInterval\(refresh, 2500\)/);
  assert.match(html, /prefers-reduced-motion: reduce/);
  assert.match(html, /molis-work:capsule-view:v1/);
  assert.match(html, /expandedGoals\.get\(projectId\)/);
  assert.match(html, /localStorage\.setItem\(viewStorageKey/);
  assert.match(html, /data-capsule-error-detail/);
  assert.match(html, /暂时无法确认最新状态/);
  assert.match(html, /恢复前，这里不会把旧状态当成正在进行/);
  assert.match(html, /title: L\("连接中断"\)/);
  assert.match(html, /data-capsule-retry/);
  assert.match(html, /setCapsuleHeight\(252\)/);
  assert.match(html, /setCapsuleHeight\(280\)/);
  assert.match(html, /window\.addEventListener\("online"/);
  assert.match(html, /data-goal-id/);
  assert.match(html, /focus\(\{ preventScroll: true \}\)/);
  assert.match(html, /aria-expanded="true"\] \.capsule__goal-title/);
  assert.doesNotMatch(html, /window\.setInterval\(load, 2500\)/);
  assert.doesNotMatch(html, /capsule_set_mode|data-tauri-drag-region|data-capsule-mode/);
  assert.doesNotMatch(html, /capsule__compact|capsule__expanded|capsule__minimized/);
  assert.doesNotMatch(html, /capsule__goal-block/);
  assert.doesNotMatch(html, />Pause<|>Resume<|>Start</);
});
