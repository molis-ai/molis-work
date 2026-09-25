import { rejectSessionReportIndex } from "./fixtures/session-secondary-failure.js";
import { grantGoalsMcp } from "./fixtures/goals-mcp-grants.js";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openWorkSessionRegistry } from "@molis-ai/molis-work-app-local-host";
import { snapshotBoardCapability, molisWorkHostProjectReference, createMolisWorkLocalHost, LocalProjectDatabase, GoalProjectApplication } from "@molis-ai/molis-work-app-local-host";
import { MolisWorkV1Error } from "@molis-ai/molis-work-plugin-goals";
import { MolisWorkServer } from "../apps/desktop/launchers/mcp/server.js";
import type { GoalEventStateView, ReportGoalEventsResult } from "@molis-ai/molis-work-contracts/modules/goals";

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
      { field_id: "limits", name: "已知缺口", purpose: "尚未完成的部分", format: "longtext", required: false },
    ],
  };
}

test("Runtime event tools create, configure, report and reopen without Claim or Run", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-mcp-goal-events-"));
  const homeDirectory = join(directory, "home");
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory });
  const host = createMolisWorkLocalHost();
  let mcp: MolisWorkServer | undefined;
  try {
    const project = await catalog.createProject({ display_name: "事件闭环", actor_id: "user" });
    await grantGoalsMcp(host, homeDirectory, project);
    const runtimeHost = {
      homeDirectory,
      runtimeContext: {
        runtime_id: "codex",
        stable_work_context_id: "thread-events",
        host_declares_stable: true,
      },
    };
    mcp = new MolisWorkServer("runtime", {
      databasePath: project.database_path,
      boardId: project.board_id,
      projectId: project.project_id,
      webBaseUrl: "http://127.0.0.1:4173",
    }, runtimeHost, host);
    const board_id = project.board_id;
    const created = JSON.parse(await mcp.callTool("molis_work_v1_goal_intent_create", {
      title: "互动故事开场", outcome: "玩家能走进洞穴并做一次选择", idempotency_key: "intent-1",
    }));
    assert.equal(created.completion_effect, false);
    for (const field of ["definition_state", "decomposition_state", "fulfillment_state"]) {
      assert.equal(Object.hasOwn(created.goal, field), false);
    }
    assert.equal(created.goal.title, "互动故事开场");
    assert.equal(created.goal.why, undefined);
    const goal_id = created.goal.goal_id as string;
    const createdState = JSON.parse(await mcp.callTool("molis_work_v1_goal_state", { goal_id })) as GoalEventStateView;
    assert.equal(createdState.intent.source_kind, "runtime");
    const replayed = JSON.parse(await mcp.callTool("molis_work_v1_goal_intent_create", {
      title: "互动故事开场", outcome: "玩家能走进洞穴并做一次选择", idempotency_key: "intent-1",
    }));
    assert.equal(replayed.replayed, true);
    assert.equal(replayed.goal.goal_id, goal_id);
    assert.equal(replayed.observed_event_cursor, created.observed_event_cursor);

    const configured = JSON.parse(await mcp.callTool("molis_work_v1_event_configure", {
      goal_id, expected_version: 0, idempotency_key: "cfg-1", types: [localType()],
    }));
    assert.equal(configured.replayed, false);
    assert.equal(configured.config.version, 1);
    assert.equal(configured.config.types[0]?.type_id, "story-delivery");
    assert.deepEqual(configured.config.adopted_planning, []);

    const reported = JSON.parse(await mcp.callTool("molis_work_v1_event_report", {
      goal_id, idempotency_key: "report-1",
      events: [{
        type_id: "story-delivery", type_version: 1, title: "做出了开场片段",
        fields: { piece: "开场洞穴", limits: "还没有第二幕" },
      }],
    })) as ReportGoalEventsResult;
    assert.equal(reported.replayed, false);
    assert.equal(reported.events.length, 1);
    assert.equal(reported.events[0]?.kind, "report");
    assert.equal(reported.events[0]?.payload.piece, "开场洞穴");
    assert.equal(reported.events[0]?.actor_kind, "runtime");
    assert.match(reported.events[0]?.actor_id ?? "", /^runtime:codex:thread-events$/);
    assert.equal(reported.work_status, "open");
    assert.equal(reported.can_record, true);
    assert.equal(reported.completion_effect, false);
    assert.ok(reported.goal_event_cursor >= reported.events[0]!.journal_seq);

    const retry = JSON.parse(await mcp.callTool("molis_work_v1_event_report", {
      goal_id, idempotency_key: "report-1",
      events: [{
        type_id: "story-delivery", type_version: 1, title: "做出了开场片段",
        fields: { piece: "开场洞穴", limits: "还没有第二幕" },
      }],
    })) as ReportGoalEventsResult;
    assert.equal(retry.replayed, true);
    assert.equal(retry.events[0]?.event_id, reported.events[0]?.event_id);
    assert.equal(retry.work_status, "open");

    const state = JSON.parse(await mcp.callTool("molis_work_v1_goal_state", { goal_id })) as GoalEventStateView;
    assert.equal(state.owner?.kind, "event_work");
    assert.equal("protocol" in state, false);
    assert.equal(state.completion_effect, false);
    assert.equal(state.recorded_not_completed, true);
    assert.equal(state.latest_reports[0]?.event_id, reported.events[0]?.event_id);
    assert.equal(state.config.types.length, 1);

    const listed = JSON.parse(await mcp.callTool("molis_work_v1_event_list", { goal_id }));
    assert.deepEqual(listed.events.map((item: { kind: string }) => item.kind), ["system", "configuration", "report"]);
    assert.equal(listed.events[0]?.kind, "system");
    assert.equal(listed.events[0]?.payload.operation, "intent_created");
    assert.equal(listed.events[0]?.payload.source_kind, "runtime");
    assert.equal(listed.events[1]?.kind, "configuration");
    assert.equal(listed.events[1]?.payload.config_version, 1);
    assert.ok(Array.isArray(listed.events[1]?.payload.types));
    const read = JSON.parse(await mcp.callTool("molis_work_v1_event_read", {
      goal_id, event_id: reported.events[0]!.event_id,
    }));
    assert.equal(read.kind, "report");
    assert.equal(read.payload.piece, "开场洞穴");

    const snapshot = await host.client(molisWorkHostProjectReference({
      databasePath: project.database_path, boardId: project.board_id, projectId: project.project_id,
    })).invoke(snapshotBoardCapability, { board_id });
    assert.equal(snapshot.claims.length, 0);
    assert.equal(snapshot.runs.length, 0);

    await mcp.close();
    mcp = new MolisWorkServer("runtime", {
      databasePath: project.database_path,
      boardId: project.board_id,
      projectId: project.project_id,
      webBaseUrl: "http://127.0.0.1:4173",
    }, runtimeHost, host);
    const reopened = JSON.parse(await mcp.callTool("molis_work_v1_goal_state", { goal_id })) as GoalEventStateView;
    assert.equal(reopened.config.version, 1);
    assert.equal(reopened.latest_reports[0]?.title, "做出了开场片段");
    const oldBody = JSON.parse(await mcp.callTool("molis_work_v1_event_read", {
      goal_id, event_id: reported.events[0]!.event_id,
    }));
    assert.equal(oldBody.payload.piece, "开场洞穴");
    assert.equal(oldBody.type.version, 1);

    const v2 = structuredClone(localType());
    v2.version = 2;
    v2.fields.push({
      field_id: "entry", name: "怎样体验", purpose: "从哪里开始", format: "text", required: false,
    });
    await mcp.callTool("molis_work_v1_event_configure", {
      goal_id, expected_version: 1, idempotency_key: "cfg-2", types: [v2],
    });
    const stillOld = JSON.parse(await mcp.callTool("molis_work_v1_event_read", {
      goal_id, event_id: reported.events[0]!.event_id,
    }));
    assert.equal(stillOld.type.version, 1);
    assert.equal(stillOld.payload.entry, undefined);

    const beforeInvalid = JSON.parse(await mcp.callTool("molis_work_v1_event_list", { goal_id }));
    await assert.rejects(
      () => mcp!.callTool("molis_work_v1_event_report", {
        goal_id, idempotency_key: "bad-batch",
        events: [
          { type_id: "story-delivery", type_version: 1, title: "合法", fields: { piece: "仍应回滚" } },
          { type_id: "story-delivery", type_version: 1, title: "缺字段", fields: {} },
        ],
      }),
      (error: unknown) => error instanceof MolisWorkV1Error && error.code === "event_report.missing_required_field",
    );
    const afterInvalid = JSON.parse(await mcp.callTool("molis_work_v1_event_list", { goal_id }));
    assert.equal(afterInvalid.events.length, beforeInvalid.events.length);

    const beforeReject = afterInvalid.events.length;
    await assert.rejects(
      () => mcp!.callTool("molis_work_v1_event_report", {
        board_id: "other-board", goal_id, idempotency_key: "cross-board",
        events: [{ type_id: "story-delivery", type_version: 1, title: "跨 board", fields: { piece: "不应写入" } }],
      }),
      (error: unknown) => error instanceof MolisWorkV1Error && error.code === "mcp.connection_override_denied",
    );
    await assert.rejects(
      () => mcp!.callTool("molis_work_v1_event_report", {
        goal_id, idempotency_key: "override-db", database_path: "/tmp/not-this.db",
        events: [{ type_id: "story-delivery", type_version: 1, title: "覆盖路径", fields: { piece: "不应写入" } }],
      }),
      (error: unknown) => error instanceof MolisWorkV1Error && error.code === "mcp.connection_override_denied",
    );
    await assert.rejects(
      () => mcp!.callTool("molis_work_v1_event_report", {
        goal_id, idempotency_key: "fake-user", actor_kind: "user",
        events: [{ type_id: "story-delivery", type_version: 1, title: "伪造用户", fields: { piece: "不应写入" } }],
      }),
      (error: unknown) => error instanceof MolisWorkV1Error && error.code === "mcp.user_impersonation_denied",
    );
    await assert.rejects(
      () => mcp!.callTool("molis_work_v1_goal_intent_create", {
        title: "伪造身份", idempotency_key: "fake-actor", actor_id: "user-admin",
      }),
      (error: unknown) => error instanceof MolisWorkV1Error && error.code === "mcp.user_impersonation_denied",
    );
    await assert.rejects(
      () => mcp!.callTool("molis_work_v1_goal_state", { goal_id, board_id }),
      (error: unknown) => error instanceof MolisWorkV1Error && error.code === "mcp.connection_override_denied",
    );
    await assert.rejects(
      () => mcp!.callTool("molis_work_v1_goal_state", { goal_id, board_id: null }),
      (error: unknown) => error instanceof MolisWorkV1Error && error.code === "mcp.connection_override_denied",
    );
    await assert.rejects(
      () => mcp!.callTool("molis_work_v1_event_note", { goal_id, body: "覆盖身份", idempotency_key: "note-undef", actor_id: undefined }),
      (error: unknown) => error instanceof MolisWorkV1Error && error.code === "mcp.user_impersonation_denied",
    );
    const afterReject = JSON.parse(await mcp.callTool("molis_work_v1_event_list", { goal_id }));
    assert.equal(afterReject.events.length, beforeReject);

    const persisted = await host.client(molisWorkHostProjectReference({
      databasePath: project.database_path, boardId: project.board_id, projectId: project.project_id,
    })).invoke(snapshotBoardCapability, { board_id });
    assert.equal(persisted.claims.length, 0);
    assert.equal(persisted.runs.length, 0);
  } finally {
    await mcp?.close();
    await host.close();
    catalog.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("event report stays persisted when secondary Session indexing fails", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-mcp-event-activity-"));
  const homeDirectory = join(directory, "home");
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory });
  const host = createMolisWorkLocalHost();
  let mcp: MolisWorkServer | undefined;
  try {
    const project = await catalog.createProject({ display_name: "事件活动", actor_id: "user" });
    await grantGoalsMcp(host, homeDirectory, project);
    const registry = await openWorkSessionRegistry({ homeDirectory });
    let sessionId: string;
    try {
      sessionId = registry.explicitlyLinkSession({
        runtime_id: "codex", native_runtime_session_id: "thread-events-activity",
        actor_id: "user", user_confirmed: true, project_id: project.project_id,
      }).session_id;
    } finally { registry.close(); }
    mcp = new MolisWorkServer("runtime", {
      databasePath: project.database_path, boardId: project.board_id,
      projectId: project.project_id, webBaseUrl: "http://127.0.0.1:4173",
    }, {
      homeDirectory,
      runtimeContext: { runtime_id: "codex", stable_work_context_id: "thread-events-activity", host_declares_stable: true },
    }, host);
    const board_id = project.board_id;
    const created = JSON.parse(await mcp.callTool("molis_work_v1_goal_intent_create", {
      title: "记录事件活动", idempotency_key: "intent-activity",
    }));
    const goal_id = created.goal.goal_id as string;
    await mcp.callTool("molis_work_v1_event_configure", {
      goal_id, expected_version: 0, idempotency_key: "cfg-activity", types: [localType()],
    });
    const restoreSessionIndex = rejectSessionReportIndex(homeDirectory);
    const reported = JSON.parse(await mcp.callTool("molis_work_v1_event_report", {
      goal_id, idempotency_key: "report-activity",
      events: [{ type_id: "story-delivery", type_version: 1, title: "已记录", fields: { piece: "洞穴" } }],
    })) as ReportGoalEventsResult;
    assert.equal(reported.events[0]?.payload.piece, "洞穴");
    restoreSessionIndex();
    const listed = JSON.parse(await mcp.callTool("molis_work_v1_event_list", { goal_id }));
    assert.equal(listed.events.filter((item: { kind: string }) => item.kind === "report").length, 1);
    const inspect = await openWorkSessionRegistry({ homeDirectory });
    try {
      assert.equal(inspect.events(sessionId).filter((event) => event.source_id === "molis_work_v1_event_report:report-activity").length, 0);
    } finally { inspect.close(); }
  } finally {
    await mcp?.close();
    await host.close();
    catalog.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("missing stable Session identity rejects event writes with no Goal or event side effects", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-mcp-event-identity-"));
  const homeDirectory = join(directory, "home");
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory });
  const host = createMolisWorkLocalHost();
  let mcp: MolisWorkServer | undefined;
  try {
    const project = await catalog.createProject({ display_name: "身份拒绝", actor_id: "user" });
    await grantGoalsMcp(host, homeDirectory, project);
    const reference = molisWorkHostProjectReference({
      databasePath: project.database_path, boardId: project.board_id, projectId: project.project_id,
    });
    const before = await host.client(reference).invoke(snapshotBoardCapability, { board_id: project.board_id });
    mcp = new MolisWorkServer("runtime", {
      databasePath: project.database_path, boardId: project.board_id,
      projectId: project.project_id, webBaseUrl: "http://127.0.0.1:4173",
    }, {
      homeDirectory,
      runtimeContext: { runtime_id: "codex", stable_work_context_id: null, host_declares_stable: false },
    }, host);
    await assert.rejects(
      () => mcp!.callTool("molis_work_v1_goal_intent_create", {
        title: "不应写入", idempotency_key: "missing-session",
      }),
      (error: unknown) => error instanceof MolisWorkV1Error
        && error.code === "mcp.runtime_identity_missing"
        && /稳定 Session/.test(error.message),
    );
    const after = await host.client(reference).invoke(snapshotBoardCapability, { board_id: project.board_id });
    assert.equal(after.goals.length, before.goals.length);
    assert.deepEqual(after.goals.map((goal) => goal.goal_id), before.goals.map((goal) => goal.goal_id));

    await mcp.close();
    mcp = new MolisWorkServer("runtime", {
      databasePath: project.database_path, boardId: project.board_id,
      projectId: project.project_id, webBaseUrl: "http://127.0.0.1:4173",
    }, {
      homeDirectory,
      nativeRuntimeSessionId: "native-session",
      runtimeContext: { runtime_id: "codex", stable_work_context_id: null, host_declares_stable: false },
    }, host);
    const created = JSON.parse(await mcp.callTool("molis_work_v1_goal_intent_create", {
      title: "稳定 native Session", idempotency_key: "native-session-intent",
    }));
    assert.equal(created.goal.title, "稳定 native Session");
    assert.match(JSON.parse(await mcp.callTool("molis_work_v1_event_configure", {
      goal_id: created.goal.goal_id, expected_version: 0, idempotency_key: "native-cfg",
      types: [localType()],
    })).config.updated_by, /^runtime:codex:native-session$/);
  } finally {
    await mcp?.close();
    await host.close();
    catalog.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Runtime MCP create persists runtime source, complete cursor and rejects caller channels", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-mcp-create-source-"));
  const homeDirectory = join(directory, "home");
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory });
  let host = createMolisWorkLocalHost();
  let mcp: MolisWorkServer | undefined;
  let store: LocalProjectDatabase | undefined;
  try {
    const project = await catalog.createProject({ display_name: "创建来源", actor_id: "user" });
    await grantGoalsMcp(host, homeDirectory, project);
    const runtimeHost = {
      homeDirectory,
      runtimeContext: {
        runtime_id: "codex",
        stable_work_context_id: "thread-source",
        host_declares_stable: true,
      },
    };
    mcp = new MolisWorkServer("runtime", {
      databasePath: project.database_path,
      boardId: project.board_id,
      projectId: project.project_id,
      webBaseUrl: "http://127.0.0.1:4173",
    }, runtimeHost, host);
    store = new LocalProjectDatabase(project.database_path);
    const board_id = project.board_id;
    const call = async (name: string, input: Record<string, unknown>) =>
      JSON.parse(await mcp!.callTool(`molis_work_v1_${name}`, { ...input }));
    const parent = await call("goal_intent_create", { title: "用户购买结果", goal_id: "SOURCE-PARENT", idempotency_key: "source-parent" });
    const dependency = await call("goal_intent_create", { title: "实际付款", goal_id: "SOURCE-DEPENDENCY", idempotency_key: "source-dependency" });
    const input = {
      title: "订单收据",
      goal_id: "SOURCE-CHILD",
      outcome: "收据可读",
      requirements: [{ statement: "包含真实付款金额" }],
      parent_goal_id: parent.goal.goal_id,
      dependency_goal_ids: [dependency.goal.goal_id],
      idempotency_key: "source-child",
    };
    const created = await call("goal_intent_create", input);
    const state = await call("goal_state", { goal_id: created.goal.goal_id }) as GoalEventStateView;
    assert.equal(state.intent.source_kind, "runtime");
    for (const field of ["definition_state", "decomposition_state", "fulfillment_state"]) {
      assert.equal(Object.hasOwn(created.goal, field), false);
    }
    const finalCursor = Number((store.db.prepare("SELECT MAX(seq) AS n FROM events WHERE board_id=?").get(board_id) as { n: number }).n);
    assert.equal(created.observed_event_cursor, finalCursor);
    assert.deepEqual(state.requirements.map((item) => item.statement), ["包含真实付款金额"]);
    assert.equal(store.snapshot(board_id).relations.filter((relation) => relation.from_goal_id === created.goal.goal_id).length, 2);
    const replay = await call("goal_intent_create", input);
    assert.equal(replay.replayed, true);
    assert.equal(replay.observed_event_cursor, created.observed_event_cursor);
    assert.equal(replay.goal.goal_id, created.goal.goal_id);
    const before = store.snapshot(board_id);
    for (const source_kind of ["web", "onboarding", "feed", "tree", "runtime"]) {
      await assert.rejects(
        () => call("goal_intent_create", {
          title: "伪造入口来源", goal_id: `FORGED-${source_kind}`, source_kind, idempotency_key: `forged-${source_kind}`,
        }),
        (error: unknown) => error instanceof MolisWorkV1Error
          && /source_kind|来源|字段|unknown|拒绝|权限/i.test(error.message),
      );
    }
    assert.deepEqual(store.snapshot(board_id), before);
    const app = new GoalProjectApplication(store);
    for (let index = 0; index < 45; index++) {
      app.goalEvents.recordNote({
        board_id,
        goal_id: created.goal.goal_id,
        actor_id: "runtime:codex:thread-source",
        actor_kind: "runtime",
        body: `真实后续核对 ${index + 1}`,
        idempotency_key: `source-after-${index}`,
      });
    }
    assert.equal((await call("goal_state", { goal_id: created.goal.goal_id })).intent.source_kind, "runtime");
    await mcp.close();
    await host.close();
    store.close();
    host = createMolisWorkLocalHost();
    mcp = new MolisWorkServer("runtime", {
      databasePath: project.database_path,
      boardId: project.board_id,
      projectId: project.project_id,
      webBaseUrl: "http://127.0.0.1:4173",
    }, runtimeHost, host);
    store = new LocalProjectDatabase(project.database_path);
    const reopened = await call("goal_state", { goal_id: created.goal.goal_id }) as GoalEventStateView;
    assert.equal(reopened.intent.source_kind, "runtime");
    const restartedReplay = await call("goal_intent_create", input);
    assert.equal(restartedReplay.replayed, true);
    assert.equal(restartedReplay.observed_event_cursor, created.observed_event_cursor);
    assert.equal(store.snapshot(board_id).goals.length, 3);
  } finally {
    await mcp?.close();
    await host.close();
    store?.close();
    catalog.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("no-config note and combined report progress persist; implicit focus, illegal progress and missing resume reason do not write; completed resume needs a first agreed outcome", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-mcp-note-resume-"));
  const homeDirectory = join(directory, "home");
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory });
  const host = createMolisWorkLocalHost();
  let mcp: MolisWorkServer | undefined;
  try {
    const project = await catalog.createProject({ display_name: "笔记继续", actor_id: "user" });
    await grantGoalsMcp(host, homeDirectory, project);
    mcp = new MolisWorkServer("runtime", {
      databasePath: project.database_path, boardId: project.board_id,
      projectId: project.project_id, webBaseUrl: "http://127.0.0.1:4173",
    }, {
      homeDirectory,
      runtimeContext: { runtime_id: "codex", stable_work_context_id: "thread-note", host_declares_stable: true },
    }, host);
    const created = JSON.parse(await mcp.callTool("molis_work_v1_goal_intent_create", {
      title: "无类型笔记", outcome: "玩家能走完开场", idempotency_key: "note-intent",
    }));
    const goal_id = created.goal.goal_id as string;
    assert.equal((JSON.parse(await mcp.callTool("molis_work_v1_goal_state", { goal_id })) as GoalEventStateView).config.types.length, 0);
    const note = JSON.parse(await mcp.callTool("molis_work_v1_event_note", {
      goal_id, body: "先记下已核对的流程", idempotency_key: "note-1",
    }));
    assert.equal(note.recorded, true);
    const replayNote = JSON.parse(await mcp.callTool("molis_work_v1_event_note", {
      goal_id, body: "先记下已核对的流程", idempotency_key: "note-1",
    }));
    assert.equal(replayNote.replayed, true);
    assert.equal(replayNote.event_id, note.event_id);
    assert.equal((JSON.parse(await mcp.callTool("molis_work_v1_goal_state", { goal_id })) as GoalEventStateView).config.types.length, 0);
    await assert.rejects(
      () => mcp!.callTool("molis_work_v1_event_note", { body: "不能靠焦点", idempotency_key: "implicit-focus" }),
      (error: unknown) => error instanceof MolisWorkV1Error,
    );

    await mcp.callTool("molis_work_v1_event_configure", {
      goal_id, expected_version: 0, idempotency_key: "note-cfg", types: [localType()],
    });
    const state = JSON.parse(await mcp.callTool("molis_work_v1_goal_state", { goal_id })) as GoalEventStateView;
    await mcp.callTool("molis_work_v1_event_agree", {
      goal_id, idempotency_key: "note-agree",
      expected_config_version: state.config.version,
      expected_agreement_version: state.agreement.version,
      new_requirements: [{ requirement_id: "ready", statement: "开场可玩" }],
    });
    const batch = {
      goal_id, idempotency_key: "note-report",
      events: [{
        type_id: "story-delivery", type_version: 1, title: "开场", fields: { piece: "洞穴" },
        judgments: [{ requirement_id: "ready", verdict: "supports" }],
      }],
      progress: { summary: "开场可玩", next_step: "等确认" },
    };
    const reported = JSON.parse(await mcp.callTool("molis_work_v1_event_report", batch)) as ReportGoalEventsResult;
    assert.equal(reported.progress_summary?.summary, "开场可玩");
    assert.equal(reported.progress_summary?.stale, false);
    assert.ok(reported.goal_event_cursor > reported.events[0]!.journal_seq);
    await assert.rejects(
      () => mcp!.callTool("molis_work_v1_event_report", { ...batch, progress: { summary: "不同进展" } }),
      (error: unknown) => error instanceof MolisWorkV1Error && /幂等|重复|idempot|conflict|冲突/i.test(error.message),
    );
    const prior = JSON.parse(await mcp.callTool("molis_work_v1_event_list", { goal_id, limit: 100 }));
    await assert.rejects(
      () => mcp!.callTool("molis_work_v1_event_report", {
        goal_id, idempotency_key: "bad-progress",
        events: [{ type_id: "story-delivery", type_version: 1, title: "应回滚", fields: { piece: "x" } }],
        progress: { summary: "非法", extra: true },
      }),
      (error: unknown) => error instanceof MolisWorkV1Error,
    );
    assert.equal(JSON.parse(await mcp.callTool("molis_work_v1_event_list", { goal_id, limit: 100 })).events.length, prior.events.length);

    const ready = JSON.parse(await mcp.callTool("molis_work_v1_goal_state", { goal_id })) as GoalEventStateView;
    const closed = JSON.parse(await mcp.callTool("molis_work_v1_event_close", {
      goal_id, idempotency_key: "note-close", kind: "complete",
      reason: "开场可用", result: "可玩",
      expected_config_version: ready.config.version,
      expected_agreement_version: ready.agreement.version,
    }));
    assert.equal(closed.completion_applied, true);
    await mcp.callTool("molis_work_v1_event_note", { goal_id, body: "完成后的历史补充", idempotency_key: "history-note" });
    assert.equal((JSON.parse(await mcp.callTool("molis_work_v1_goal_state", { goal_id })) as GoalEventStateView).work_status, "completed");
    await assert.rejects(
      () => mcp!.callTool("molis_work_v1_event_resume", { goal_id, idempotency_key: "missing-reason" }),
      (error: unknown) => error instanceof MolisWorkV1Error && /原因|理由|reason/i.test(error.message),
    );
    const resume = { goal_id, reason: "明确开始新一轮", idempotency_key: "resume-done" };
    const resumed = JSON.parse(await mcp.callTool("molis_work_v1_event_resume", resume));
    assert.equal(resumed.work_status, "open");
    const replayResume = JSON.parse(await mcp.callTool("molis_work_v1_event_resume", resume));
    assert.equal(replayResume.replayed, true);
    assert.equal(replayResume.event_id, resumed.event_id);
    const openBefore = JSON.parse(await mcp.callTool("molis_work_v1_goal_state", { goal_id })) as GoalEventStateView;
    await assert.rejects(
      () => mcp!.callTool("molis_work_v1_event_resume", { goal_id, reason: "已在进行", idempotency_key: "resume-open" }),
      (error: unknown) => error instanceof MolisWorkV1Error && error.code === "event_resume.already_open",
    );
    assert.equal((JSON.parse(await mcp.callTool("molis_work_v1_goal_state", { goal_id })) as GoalEventStateView).goal_event_cursor, openBefore.goal_event_cursor);
  } finally {
    await mcp?.close();
    await host.close();
    catalog.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
