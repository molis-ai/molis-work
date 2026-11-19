import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { grantGoalsMcp } from "./fixtures/goals-mcp-grants.js";
import { serveTestHost, type TestHostServer } from "./fixtures/test-home.js";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { createMolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { managementGoals } from "./goal-management-caller.js";
import { MolisWorkServer } from "../apps/desktop/launchers/mcp/server.js";
import type { GoalEventClosureResult, GoalEventDecisionResult, GoalEventStateView } from "@molis-ai/molis-work-plugin-goals/contract";
import { mcpGoalReviews } from "./fixtures/project-review-entry.js";
import { goalApplicationOf } from "./fixtures/goal-application.js";

function localType() {
  return {
    type_id: "story-delivery",
    version: 1,
    name: "故事片段交付",
    purpose: "说明可以体验的片段。",
    semantic_family: "delivery",
    source: { kind: "runtime", label: "当前 Goal 局部定义" },
    fields: [
      { field_id: "piece", name: "交付了什么片段", purpose: "可体验内容", format: "text", required: true },
    ],
  };
}

test("Runtime state tools record progress and close without applying user identity; management decides", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-mcp-goal-events-state-"));
  const homeDirectory = join(directory, "home");
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory });
  const project = await catalog.createProject({ display_name: "状态闭环", actor_id: "user" });
  catalog.close();
  const host = createMolisWorkLocalHost({ homeDirectory });
  let served: TestHostServer | undefined;
  let runtime: MolisWorkServer | undefined;
  let management: MolisWorkServer | undefined;
  try {
    served = await serveTestHost(null, { home: homeDirectory, host });
    await grantGoalsMcp(served, project);
    const runtimeHost = {
      homeDirectory,
      runtimeContext: {
        runtime_id: "codex",
        stable_work_context_id: "thread-state",
        host_declares_stable: true,
      },
    };
    const connection = {
      databasePath: project.database_path,
      projectId: project.project_id,
      webBaseUrl: "http://127.0.0.1:4173",
    };
    runtime = new MolisWorkServer("runtime", connection, runtimeHost, host);
    const project_id = project.project_id;
    const created = JSON.parse(await runtime.callTool("molis_work_v1_action_goals.create__v1", { title: "内部试用故事", outcome: "玩家能走完开场", idempotency_key: "intent-state",
    }));
    const goal_id = created.goal.goal_id as string;
    await runtime.callTool("molis_work_v1_action_goals.events.configure__v1", { goal_id, expected_version: 0, idempotency_key: "cfg-state",
      types: [localType()],
    });
    // The requirement is the platform's (contract-design §10).
    const projectRef = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
    await host.withProject(projectRef, open => goalApplicationOf(open).setRequirements(project_id, goal_id, [{ requirement_id: "playable", statement: "有一段能走完的开场" }]));
    const reported = JSON.parse(await runtime.callTool("molis_work_v1_action_goals.events.report__v1", { goal_id, idempotency_key: "report-state",
      events: [{
        type_id: "story-delivery", type_version: 1, title: "做出了开场",
        fields: { piece: "洞穴开场" },
      }],
    }));
    const progress = JSON.parse(await runtime.callTool("molis_work_v1_action_goals.progress.record__v1", { goal_id, idempotency_key: "progress-1",
      based_on_cursor: reported.events[0].journal_seq,
      summary: "开场可玩", next_step: "等用户确认",
    }));
    assert.equal(progress.progress_summary.stale, false);
    const asked = JSON.parse(await runtime.callTool("molis_work_v1_action_goals.decisions.request__v1", { goal_id, idempotency_key: "ask-1",
      question: "开场是否可以内部试用？",
      options: [
        { option_id: "yes", label: "可以", impact: "进入收尾" },
        { option_id: "no", label: "还不行", impact: "继续补" },
      ],
      purpose: "action",
      scope: { action: "complete" },
    }));
    await assert.rejects(
      () => runtime!.callTool("molis_work_v1_review_decide", { request_key: "runtime-decide", choice_id: "apply" }),
      (error: unknown) => error instanceof ActionError && error.code === "mcp.authority_denied",
    );
    await assert.rejects(
      () => runtime!.callTool("molis_work_v1_action_goals.progress.record__v1", { goal_id, idempotency_key: "fake-user", actor_kind: "user",
        based_on_cursor: reported.events[0].journal_seq, summary: "伪造用户",
      }),
      // Identity is not an input of any action: the contract rejects it before anything runs.
      { code: "actions.input_invalid" },
    );

    management = new MolisWorkServer("management", connection, null, host);
    const reviews = mcpGoalReviews(management, project_id, project.database_path);
    const original = await reviews.prepare(goalsActions.decide, { goal_id, idempotency_key: "mgmt-decide",
      request_id: asked.decision_request.request_id, selected_option_id: "yes", conclusion: "管理入口确认可以试用",
      effects: [{ kind: "authorize_action", action: "complete" }], scope: { action: "complete" } });
    // The management entry decides as the person on this machine; it takes no identity from its arguments (§9.5 #6).
    await assert.rejects(() => reviews.submit({ ...original, actor_id: "manager" } as typeof original), { code: "actions.input_invalid" });
    const decided = await reviews.submit<GoalEventDecisionResult>(original);
    assert.equal(decided.result?.decision.authority_source, "management");
    assert.equal(decided.result?.decision.actor_id, LOCAL_PERSON_ACTOR_ID);
    // The person accepts the requirement on the platform (contract-design §10).
    await host.withProject(projectRef, open => goalApplicationOf(open).decide(project_id, goal_id, ["playable"]));

    const ready = JSON.parse(await runtime.callTool("molis_work_v1_action_goals.state.read__v1", { goal_id })) as GoalEventStateView;
    const closed = JSON.parse(await runtime.callTool("molis_work_v1_action_goals.closure.submit__v1", { goal_id, idempotency_key: "close-1", kind: "complete",
      reason: "开场已支持且用户已确认", result: "可内部试用",
      expected_config_version: ready.config.version,
      expected_agreement_version: ready.agreement.version,
    })) as GoalEventClosureResult;
    assert.equal(closed.recorded, true);
    assert.equal(closed.completion_applied, true);

    await runtime.close();
    runtime = new MolisWorkServer("runtime", connection, runtimeHost, host);
    const reopened = JSON.parse(await runtime.callTool("molis_work_v1_action_goals.state.read__v1", { goal_id })) as GoalEventStateView;
    assert.equal(reopened.owner?.kind, "event_work");
    assert.equal(reopened.completion_effect, true);
    assert.equal(reopened.work_status, "completed");
    assert.equal(reopened.applied_decisions[0]?.authority_source, "management");

    const persisted = await managementGoals(host.actionClient(molisWorkHostProjectReference({
      databasePath: project.database_path, projectId: project.project_id,
    }), false), project_id).invoke(goalsActions.snapshot, {});
    assert.equal("claims" in persisted, false, "the retired claim protocol has no state");

    const progressEvent = JSON.parse(await runtime.callTool("molis_work_v1_action_goals.events.read__v1", { goal_id, event_id: progress.event_id,
    }));
    assert.equal(progressEvent.payload.operation, "progress_summary");
    assert.equal(progressEvent.payload.summary, "开场可玩");

    const beforeClose = JSON.parse(await runtime.callTool("molis_work_v1_action_goals.events.list__v1", { goal_id, limit: 100 }));
    await assert.rejects(
      () => runtime!.callTool("molis_work_v1_action_goals.closure.submit__v1", { goal_id, idempotency_key: "close-invalid", kind: "not-a-valid-kind",
        reason: "非法枚举必须拒绝", expected_config_version: ready.config.version,
        expected_agreement_version: ready.agreement.version,
      }),
      { code: "actions.input_invalid" },
    );
    const afterInvalid = JSON.parse(await runtime.callTool("molis_work_v1_action_goals.events.list__v1", { goal_id, limit: 100 }));
    assert.equal(afterInvalid.events.length, beforeClose.events.length);
  } finally {
    await runtime?.close();
    await management?.close();
    await served?.close();
    await host.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Runtime agree unknown field and omitted close version are rejected with no write", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-mcp-goal-events-unknown-"));
  const homeDirectory = join(directory, "home");
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory });
  const project = await catalog.createProject({ display_name: "未知字段", actor_id: "user" });
  catalog.close();
  const host = createMolisWorkLocalHost({ homeDirectory });
  let served: TestHostServer | undefined;
  let runtime: MolisWorkServer | undefined;
  try {
    served = await serveTestHost(null, { home: homeDirectory, host });
    await grantGoalsMcp(served, project);
    runtime = new MolisWorkServer("runtime", {
      databasePath: project.database_path,
      projectId: project.project_id,
      webBaseUrl: "http://127.0.0.1:4173",
    }, {
      homeDirectory,
      runtimeContext: { runtime_id: "codex", stable_work_context_id: "thread-unknown", host_declares_stable: true },
    }, host);
    const project_id = project.project_id;
    const created = JSON.parse(await runtime.callTool("molis_work_v1_action_goals.create__v1", { title: "未知字段", outcome: "原结果", idempotency_key: "intent-unknown",
    }));
    const goal_id = created.goal.goal_id as string;
    await runtime.callTool("molis_work_v1_action_goals.events.configure__v1", { goal_id, expected_version: 0, idempotency_key: "cfg-unknown", types: [localType()],
    });
    const state = JSON.parse(await runtime.callTool("molis_work_v1_action_goals.state.read__v1", { goal_id })) as GoalEventStateView;
    await assert.rejects(
      () => runtime!.callTool("molis_work_v1_action_goals.agreement.set__v1", { goal_id, idempotency_key: "agree-unknown",
        expected_config_version: state.config.version,
        expected_agreement_version: state.agreement.version,
        outcome: "新结果",
        independently_verified: true,
      }),
      { code: "actions.input_invalid" },
    );
    await assert.rejects(
      () => runtime!.callTool("molis_work_v1_action_goals.closure.submit__v1", { goal_id, idempotency_key: "close-omit", kind: "complete",
        reason: "漏掉约定版本", expected_config_version: state.config.version,
      }),
      { code: "actions.input_invalid" },
    );
    const after = JSON.parse(await runtime.callTool("molis_work_v1_action_goals.state.read__v1", { goal_id })) as GoalEventStateView;
    assert.equal(after.agreement.outcome, "原结果");
    assert.equal(after.observed_event_cursor, state.observed_event_cursor);
  } finally {
    await runtime?.close();
    await served?.close();
    await host.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("MCP agreement_change request keeps request-time commitment; later related change rejects approval", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-mcp-goal-events-stale-"));
  const homeDirectory = join(directory, "home");
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory });
  const project = await catalog.createProject({ display_name: "过期请求", actor_id: "user" });
  catalog.close();
  const host = createMolisWorkLocalHost({ homeDirectory });
  let served: TestHostServer | undefined;
  let runtime: MolisWorkServer | undefined;
  let management: MolisWorkServer | undefined;
  try {
    served = await serveTestHost(null, { home: homeDirectory, host });
    await grantGoalsMcp(served, project);
    const connection = {
      databasePath: project.database_path,
      projectId: project.project_id,
      webBaseUrl: "http://127.0.0.1:4173",
    };
    runtime = new MolisWorkServer("runtime", connection, {
      homeDirectory,
      runtimeContext: { runtime_id: "codex", stable_work_context_id: "thread-stale", host_declares_stable: true },
    }, host);
    management = new MolisWorkServer("management", connection, null, host);
    const project_id = project.project_id;
    const created = JSON.parse(await runtime.callTool("molis_work_v1_action_goals.create__v1", { title: "精确授权", outcome: "用户能完成真实购买", idempotency_key: "intent-stale-mcp",
    }));
    const goal_id = created.goal.goal_id as string;
    await runtime.callTool("molis_work_v1_action_goals.events.configure__v1", { goal_id, expected_version: 0, idempotency_key: "cfg-stale-mcp", types: [localType()],
    });
    // The requirement is the platform's (contract-design §10); the request below proposes a new outcome only.
    const projectRef = molisWorkHostProjectReference({ projectId: project_id, databasePath: project.database_path });
    await host.withProject(projectRef, open => goalApplicationOf(open).setRequirements(project_id, goal_id, [{ requirement_id: "r-five", statement: "真实购买" }]));
    const asked = JSON.parse(await runtime.callTool("molis_work_v1_action_goals.decisions.request__v1", { goal_id, idempotency_key: "ask-change-mcp",
      question: "把结果改成也能退货",
      options: [
        { option_id: "yes", label: "同意", impact: "按所展示内容应用" },
        { option_id: "no", label: "拒绝", impact: "保留当前约定" },
      ],
      purpose: "agreement_change",
      proposed_change: { outcome: "用户能完成真实购买并能退货" },
    }));
    // It commits to the outcome it would replace, and to nothing on the platform's requirement list (§10.9 question 3).
    assert.deepEqual(asked.decision_request.commitment, { outcome: "用户能完成真实购买", requirements: [] });
    const beforeChange = JSON.parse(await runtime.callTool("molis_work_v1_action_goals.state.read__v1", { goal_id })) as GoalEventStateView;
    const reviews = mcpGoalReviews(management, project_id, project.database_path);
    const original = await reviews.prepare(goalsActions.decide, { goal_id, idempotency_key: "approve-stale-mcp",
      request_id: asked.decision_request.request_id, selected_option_id: "yes", conclusion: "批准之前展示的结果变化",
      effects: [{ kind: "authorize_agreement_change" }] });
    // The management entry lists no Goals actions; it decides through its own tools only.
    await assert.rejects(management.callTool("molis_work_v1_action_goals.agreement.set__v1", { goal_id }), { code: "mcp.tool_unknown" });
    // This trusted user change is fixture setup: the outcome the approval was shown replacing no longer stands.
    await managementGoals(host.actionClient(projectRef), project_id).invoke(goalsActions.agree, {
      goal_id, idempotency_key: "change-stale-mcp",
      expected_config_version: beforeChange.config.version,
      expected_agreement_version: beforeChange.agreement.version,
      outcome: "用户能完成真实购买并看到收据",
    });
    const beforeApprove = JSON.parse(await runtime.callTool("molis_work_v1_action_goals.state.read__v1", { goal_id })) as GoalEventStateView;
    await assert.rejects(
      () => reviews.submit(original), { code: "actions.conflict" },
    );
    const afterApprove = JSON.parse(await runtime.callTool("molis_work_v1_action_goals.state.read__v1", { goal_id })) as GoalEventStateView;
    assert.equal(afterApprove.goal_event_cursor, beforeApprove.goal_event_cursor);
    assert.equal(afterApprove.agreement.outcome, "用户能完成真实购买并看到收据");
    assert.equal(afterApprove.applied_decisions.length, beforeApprove.applied_decisions.length);
  } finally {
    await runtime?.close();
    await management?.close();
    await served?.close();
    await host.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
