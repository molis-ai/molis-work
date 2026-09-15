import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createMolisWorkLocalHost, snapshotBoardCapability, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { MolisWorkV1Error } from "@molis-ai/molis-work-plugin-goals";
import { MolisWorkServer } from "../apps/desktop/launchers/mcp/server.js";
import type { GoalEventClosureResult, GoalEventStateView } from "@molis-ai/molis-work-contracts/modules/goals";

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
  const host = createMolisWorkLocalHost();
  let runtime: MolisWorkServer | undefined;
  let management: MolisWorkServer | undefined;
  try {
    const project = await catalog.createProject({ display_name: "状态闭环", actor_id: "user" });
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
      boardId: project.board_id,
      projectId: project.project_id,
      webBaseUrl: "http://127.0.0.1:4173",
    };
    runtime = new MolisWorkServer("runtime", connection, runtimeHost, host);
    const board_id = project.board_id;
    const created = JSON.parse(await runtime.callTool("molis_work_v1_goal_intent_create", { title: "内部试用故事", outcome: "玩家能走完开场", idempotency_key: "intent-state",
    }));
    const goal_id = created.goal.goal_id as string;
    await runtime.callTool("molis_work_v1_event_configure", { goal_id, expected_version: 0, idempotency_key: "cfg-state",
      types: [localType()],
    });
    const configured = JSON.parse(await runtime.callTool("molis_work_v1_goal_state", { goal_id })) as GoalEventStateView;
    await runtime.callTool("molis_work_v1_event_agree", { goal_id, idempotency_key: "agree-state",
      expected_config_version: configured.config.version,
      expected_agreement_version: configured.agreement.version,
      new_requirements: [{ requirement_id: "playable", statement: "有一段能走完的开场" }],
    });
    const reported = JSON.parse(await runtime.callTool("molis_work_v1_event_report", { goal_id, idempotency_key: "report-state",
      events: [{
        type_id: "story-delivery", type_version: 1, title: "做出了开场",
        fields: { piece: "洞穴开场" },
        judgments: [{ requirement_id: "playable", verdict: "supports" }],
      }],
    }));
    const progress = JSON.parse(await runtime.callTool("molis_work_v1_event_progress", { goal_id, idempotency_key: "progress-1",
      based_on_cursor: reported.events[0].journal_seq,
      summary: "开场可玩", next_step: "等用户确认",
    }));
    assert.equal(progress.progress_summary.stale, false);
    const asked = JSON.parse(await runtime.callTool("molis_work_v1_event_decision_request", { goal_id, idempotency_key: "ask-1",
      question: "开场是否可以内部试用？",
      options: [
        { option_id: "yes", label: "可以", impact: "进入收尾" },
        { option_id: "no", label: "还不行", impact: "继续补" },
      ],
      purpose: "requirement_acceptance",
      scope: { requirement_ids: ["playable"] },
    }));
    await assert.rejects(
      () => runtime!.callTool("molis_work_v1_event_decide", { goal_id, idempotency_key: "runtime-decide", conclusion: "伪造批准",
      }),
      (error: unknown) => error instanceof MolisWorkV1Error && (
        error.code === "mcp.authority_denied" || error.code === "mcp.user_impersonation_denied"
      ),
    );
    await assert.rejects(
      () => runtime!.callTool("molis_work_v1_event_progress", { goal_id, idempotency_key: "fake-user", actor_kind: "user",
        based_on_cursor: reported.events[0].journal_seq, summary: "伪造用户",
      }),
      (error: unknown) => error instanceof MolisWorkV1Error && error.code === "mcp.user_impersonation_denied",
    );

    management = new MolisWorkServer("management", connection, null, host);
    const decided = JSON.parse(await management.callTool("molis_work_v1_event_decide", {
      database_path: project.database_path,
      board_id, goal_id, actor_id: "manager", idempotency_key: "mgmt-decide",
      request_id: asked.decision_request.request_id,
      selected_option_id: "yes",
      conclusion: "管理入口确认可以试用",
      accepts_requirements: true,
      scope: { requirement_ids: ["playable"] },
    }));
    assert.equal(decided.decision.authority_source, "management");
    assert.equal(decided.decision.actor_id, "manager");

    const ready = JSON.parse(await runtime.callTool("molis_work_v1_goal_state", { goal_id })) as GoalEventStateView;
    const closed = JSON.parse(await runtime.callTool("molis_work_v1_event_close", { goal_id, idempotency_key: "close-1", kind: "complete",
      reason: "开场已支持且用户已确认", result: "可内部试用",
      expected_config_version: ready.config.version,
      expected_agreement_version: ready.agreement.version,
    })) as GoalEventClosureResult;
    assert.equal(closed.recorded, true);
    assert.equal(closed.completion_applied, true);

    await runtime.close();
    runtime = new MolisWorkServer("runtime", connection, runtimeHost, host);
    const reopened = JSON.parse(await runtime.callTool("molis_work_v1_goal_state", { goal_id })) as GoalEventStateView;
    assert.equal(reopened.owner?.kind, "event_work");
    assert.equal(reopened.completion_effect, true);
    assert.equal(reopened.work_status, "completed");
    assert.equal(reopened.applied_decisions[0]?.authority_source, "management");

    const persisted = await host.client(molisWorkHostProjectReference({
      databasePath: project.database_path, boardId: project.board_id, projectId: project.project_id,
    })).invoke(snapshotBoardCapability, { board_id });
    assert.equal(persisted.claims.length, 0);

    const progressEvent = JSON.parse(await runtime.callTool("molis_work_v1_event_read", { goal_id, event_id: progress.event_id,
    }));
    assert.equal(progressEvent.payload.operation, "progress_summary");
    assert.equal(progressEvent.payload.summary, "开场可玩");

    const beforeClose = JSON.parse(await runtime.callTool("molis_work_v1_event_list", { goal_id, limit: 100 }));
    await assert.rejects(
      () => runtime!.callTool("molis_work_v1_event_close", { goal_id, idempotency_key: "close-invalid", kind: "not-a-valid-kind",
        reason: "非法枚举必须拒绝", expected_config_version: ready.config.version,
        expected_agreement_version: ready.agreement.version,
      }),
      (error: unknown) => error instanceof MolisWorkV1Error && error.code === "event_closure.invalid_kind",
    );
    const afterInvalid = JSON.parse(await runtime.callTool("molis_work_v1_event_list", { goal_id, limit: 100 }));
    assert.equal(afterInvalid.events.length, beforeClose.events.length);
  } finally {
    await runtime?.close();
    await management?.close();
    await host.close();
    catalog.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Runtime agree unknown field and omitted close version are rejected with no write", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-mcp-goal-events-unknown-"));
  const homeDirectory = join(directory, "home");
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory });
  const host = createMolisWorkLocalHost();
  let runtime: MolisWorkServer | undefined;
  try {
    const project = await catalog.createProject({ display_name: "未知字段", actor_id: "user" });
    runtime = new MolisWorkServer("runtime", {
      databasePath: project.database_path,
      boardId: project.board_id,
      projectId: project.project_id,
      webBaseUrl: "http://127.0.0.1:4173",
    }, {
      homeDirectory,
      runtimeContext: { runtime_id: "codex", stable_work_context_id: "thread-unknown", host_declares_stable: true },
    }, host);
    const board_id = project.board_id;
    const created = JSON.parse(await runtime.callTool("molis_work_v1_goal_intent_create", { title: "未知字段", outcome: "原结果", idempotency_key: "intent-unknown",
    }));
    const goal_id = created.goal.goal_id as string;
    await runtime.callTool("molis_work_v1_event_configure", { goal_id, expected_version: 0, idempotency_key: "cfg-unknown", types: [localType()],
    });
    const state = JSON.parse(await runtime.callTool("molis_work_v1_goal_state", { goal_id })) as GoalEventStateView;
    await assert.rejects(
      () => runtime!.callTool("molis_work_v1_event_agree", { goal_id, idempotency_key: "agree-unknown",
        expected_config_version: state.config.version,
        expected_agreement_version: state.agreement.version,
        outcome: "新结果",
        independently_verified: true,
      }),
      (error: unknown) => error instanceof MolisWorkV1Error && error.code === "mcp.unexpected_field",
    );
    await assert.rejects(
      () => runtime!.callTool("molis_work_v1_event_close", { goal_id, idempotency_key: "close-omit", kind: "complete",
        reason: "漏掉约定版本", expected_config_version: state.config.version,
      }),
      (error: unknown) => error instanceof MolisWorkV1Error && (
        error.code === "event_closure.expected_agreement_version_required" || error.code === "mcp.invalid_params"
      ),
    );
    const after = JSON.parse(await runtime.callTool("molis_work_v1_goal_state", { goal_id })) as GoalEventStateView;
    assert.equal(after.agreement.outcome, "原结果");
    assert.equal(after.observed_event_cursor, state.observed_event_cursor);
  } finally {
    await runtime?.close();
    await host.close();
    catalog.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("MCP agreement_change request keeps request-time commitment; later related change rejects approval", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-mcp-goal-events-stale-"));
  const homeDirectory = join(directory, "home");
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory });
  const host = createMolisWorkLocalHost();
  let runtime: MolisWorkServer | undefined;
  let management: MolisWorkServer | undefined;
  try {
    const project = await catalog.createProject({ display_name: "过期请求", actor_id: "user" });
    const connection = {
      databasePath: project.database_path,
      boardId: project.board_id,
      projectId: project.project_id,
      webBaseUrl: "http://127.0.0.1:4173",
    };
    runtime = new MolisWorkServer("runtime", connection, {
      homeDirectory,
      runtimeContext: { runtime_id: "codex", stable_work_context_id: "thread-stale", host_declares_stable: true },
    }, host);
    management = new MolisWorkServer("management", connection, null, host);
    const board_id = project.board_id;
    const created = JSON.parse(await runtime.callTool("molis_work_v1_goal_intent_create", { title: "精确授权", outcome: "用户能完成真实购买", idempotency_key: "intent-stale-mcp",
    }));
    const goal_id = created.goal.goal_id as string;
    await runtime.callTool("molis_work_v1_event_configure", { goal_id, expected_version: 0, idempotency_key: "cfg-stale-mcp", types: [localType()],
    });
    const configured = JSON.parse(await runtime.callTool("molis_work_v1_goal_state", { goal_id })) as GoalEventStateView;
    await runtime.callTool("molis_work_v1_event_agree", { goal_id, idempotency_key: "agree-stale-mcp",
      expected_config_version: configured.config.version,
      expected_agreement_version: configured.agreement.version,
      new_requirements: [{ requirement_id: "r-five", statement: "真实购买" }],
    });
    const asked = JSON.parse(await runtime.callTool("molis_work_v1_event_decision_request", { goal_id, idempotency_key: "ask-retire-mcp",
      question: "取消原来的真实购买要求",
      options: [
        { option_id: "yes", label: "同意", impact: "按所展示内容应用" },
        { option_id: "no", label: "拒绝", impact: "保留当前约定" },
      ],
      purpose: "agreement_change",
      proposed_change: { retire_requirement_ids: ["r-five"] },
    }));
    assert.equal(asked.decision_request.commitment.outcome, "用户能完成真实购买");
    assert.equal(asked.decision_request.commitment.requirements[0].statement, "真实购买");
    const beforeRevise = JSON.parse(await runtime.callTool("molis_work_v1_goal_state", { goal_id })) as GoalEventStateView;
    await management.callTool("molis_work_v1_event_agree", {
      database_path: project.database_path,
      board_id, goal_id, actor_id: "manager", idempotency_key: "revise-stale-mcp",
      expected_config_version: beforeRevise.config.version,
      expected_agreement_version: beforeRevise.agreement.version,
      revise_requirements: [{ requirement_id: "r-five", statement: "真实购买并处理退货" }],
    });
    const beforeApprove = JSON.parse(await runtime.callTool("molis_work_v1_goal_state", { goal_id })) as GoalEventStateView;
    await assert.rejects(
      () => management!.callTool("molis_work_v1_event_decide", {
        database_path: project.database_path,
        board_id, goal_id, actor_id: "manager", idempotency_key: "approve-stale-mcp",
        request_id: asked.decision_request.request_id,
        selected_option_id: "yes",
        conclusion: "批准之前展示的取消要求",
        effects: [{ kind: "authorize_agreement_change" }],
      }),
      (error: unknown) => error instanceof MolisWorkV1Error
        && error.code === "event_decision.stale_commitment"
        && /变化|变更|匹配|过期|基线/.test(error.message),
    );
    const afterApprove = JSON.parse(await runtime.callTool("molis_work_v1_goal_state", { goal_id })) as GoalEventStateView;
    assert.equal(afterApprove.goal_event_cursor, beforeApprove.goal_event_cursor);
    assert.equal(afterApprove.requirements.find((item) => item.requirement_id === "r-five")?.statement, "真实购买并处理退货");
    assert.equal(afterApprove.applied_decisions.length, beforeApprove.applied_decisions.length);
  } finally {
    await runtime?.close();
    await management?.close();
    await host.close();
    catalog.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
