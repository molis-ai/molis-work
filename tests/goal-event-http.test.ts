import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { AddressInfo } from "node:net";

import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { GoalProjectApplication, LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { hostEventDecisionAuthority } from "@molis-ai/molis-work-plugin-goals";

const BOARD = "board-http-events";
const TOKEN = "molis-work-event-http-token-0123456789abcdef";

function listen(server: Server): Promise<string> {
  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      resolve(`http://127.0.0.1:${address.port}`);
    });
    server.once("error", reject);
  });
}

test("HTTP event APIs persist intent, blank planning, typed reports, decisions and closure through SQLite restart", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-event-http-"));
  const databasePath = join(directory, "project.db");
  const store = new LocalProjectDatabase(databasePath);
  const app = new GoalProjectApplication(store);
  app.initializeBoard({ board_id: BOARD, title: "HTTP 事件", actor_id: "user-1", idempotency_key: "init" });
  const created = app.goalEvents.createIntent({
    board_id: BOARD, title: "空白互动故事", outcome: "一段可玩片段", actor_id: "web-user",
    actor_kind: "user", idempotency_key: "intent-1",
  });
  const goalId = created.goal.goal_id;
  const blank = app.goalEvents.readState(BOARD, goalId);
  assert.equal(blank.config.adopted_planning.length, 0);
  assert.equal(blank.config.types.length, 0);
  app.goalEvents.configure({
    board_id: BOARD, goal_id: goalId, actor_id: "web-user", actor_kind: "user",
    expected_version: 0, idempotency_key: "cfg-1",
    types: [{
      type_id: "scene", version: 1, name: "故事交付", purpose: "可体验片段", semantic_family: "delivery",
      fields: [{ field_id: "piece", name: "片段", purpose: "发生了什么", format: "longtext", required: true }],
    }],
  });
  const afterCfg = app.goalEvents.readState(BOARD, goalId);
  app.goalEvents.setAgreement({
    board_id: BOARD, goal_id: goalId, actor_id: "web-user", actor_kind: "user",
    idempotency_key: "agree-1",
    expected_config_version: afterCfg.config.version,
    expected_agreement_version: afterCfg.agreement.version,
    new_requirements: [{ requirement_id: "playable", statement: "能从开始走到结束", bound_type_id: "scene" }],
  });
  app.goalEvents.report({
    board_id: BOARD, goal_id: goalId, actor_id: "web-user", actor_kind: "user", idempotency_key: "rep-1",
    events: [{
      type_id: "scene", type_version: 1, title: "开场已经能走进去",
      fields: { piece: "玩家可以从门口走进第一段。" },
      judgments: [{ requirement_id: "playable", verdict: "supports" }],
    }],
  });
  const opened = app.goalEvents.applyConcern({
    board_id: BOARD, goal_id: goalId, actor_id: "web-user", actor_kind: "user", idempotency_key: "concern-1",
    action: "open", title: "重启还没验", statement: "退出后再进会丢进度", blocks_closure: true,
    scope: { requirement_ids: ["playable"] },
  });
  const requested = app.goalEvents.requestDecision({
    board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "ask-1",
    question: "是否接受当前可玩范围？",
    options: [
      { option_id: "yes", label: "接受", impact: "可以继续收尾" },
      { option_id: "no", label: "再补", impact: "先补重启" },
    ],
    purpose: "requirement_acceptance",
    scope: { requirement_ids: ["playable"], concern_ids: [opened.concern.concern_id] },
  });
  const decided = app.goalEvents.recordTrustedDecision({
    board_id: BOARD, goal_id: goalId, idempotency_key: "dec-1",
    authority: hostEventDecisionAuthority("web", BOARD, "web-user", "dec-1"),
    request_id: requested.decision_request.request_id,
    selected_option_id: "yes",
    conclusion: "先按当前范围试用",
    effects: [{ kind: "accept_requirements" }, { kind: "accept_concerns" }],
    scope: { requirement_ids: ["playable"], concern_ids: [opened.concern.concern_id] },
  });
  app.goalEvents.applyConcern({
    board_id: BOARD, goal_id: goalId, actor_id: "web-user", actor_kind: "user", idempotency_key: "concern-2",
    action: "accept", concern_id: opened.concern.concern_id, reason: "本轮接受重启缺口",
    cited_decision_id: decided.decision.decision_id,
  });
  const closed = app.goalEvents.submitClosure({
    board_id: BOARD, goal_id: goalId, actor_id: "web-user", actor_kind: "user", idempotency_key: "close-1",
    kind: "complete", result: "开场可玩", reason: "当前范围已试用",
    expected_config_version: 1, expected_agreement_version: app.goalEvents.readState(BOARD, goalId).agreement.version,
  });
  assert.equal(closed.recorded, true);

  const server = createMolisWorkWebServer({ databasePath, boardId: BOARD, homeDirectory: directory, controlToken: TOKEN });
  const origin = await listen(server);
  try {
    const stateRes = await fetch(`${origin}/api/goals/${encodeURIComponent(goalId)}/event-state`);
    assert.equal(stateRes.status, 200);
    const state = await stateRes.json() as { owner: { kind: string }; latest_reports: Array<{ title: string }>; current_decisions: unknown[] };
    assert.equal(state.owner.kind, "event_work");
    assert.equal(state.latest_reports[0]?.title, "开场已经能走进去");
    const timelineRes = await fetch(`${origin}/api/goals/${encodeURIComponent(goalId)}/event-timeline?limit=20`);
    const timeline = await timelineRes.json() as { items: Array<{ event_id: string; title: string }>; next_cursor: number | null };
    assert.ok(timeline.items.length >= 4);
    const ids = timeline.items.map((item) => item.event_id);
    assert.equal(new Set(ids).size, ids.length);
    const bodyRes = await fetch(`${origin}/api/goals/${encodeURIComponent(goalId)}/events/${encodeURIComponent(timeline.items[0]!.event_id)}`);
    const body = await bodyRes.json() as { title: string; payload?: { piece?: string } };
    assert.ok(body.title);
    const conflict = await fetch(`${origin}/api/goals/${encodeURIComponent(goalId)}/event-close`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        "x-molis-work-idempotency-key": "close-stale",
        "x-molis-work-control-token": TOKEN,
      },
      body: JSON.stringify({
        kind: "complete", reason: "旧版本", expected_config_version: 0, expected_agreement_version: 0,
      }),
    });
    assert.equal(conflict.status, 409);
    const conflictBody = await conflict.json() as { code: string };
    assert.match(conflictBody.code, /stale_version|version_conflict/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    store.close();
  }

  const reopened = new LocalProjectDatabase(databasePath);
  const again = new GoalProjectApplication(reopened);
  const restored = again.goalEvents.readState(BOARD, goalId);
  assert.equal(restored.latest_reports[0]?.title, "开场已经能走进去");
  assert.equal(restored.owner?.kind, "event_work");
  reopened.close();
  rmSync(directory, { recursive: true, force: true });
});

test("HTTP event-close rejects unknown kind without recording an event", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-event-http-kind-"));
  const databasePath = join(directory, "project.db");
  const store = new LocalProjectDatabase(databasePath);
  const app = new GoalProjectApplication(store);
  app.initializeBoard({ board_id: BOARD, title: "kind", actor_id: "user-1", idempotency_key: "init-kind" });
  const created = app.goalEvents.createIntent({
    board_id: BOARD, title: "无效收尾", outcome: "不能默认为完成",
    actor_id: "web-user", actor_kind: "user", idempotency_key: "intent-kind",
  });
  const server = createMolisWorkWebServer({ databasePath, boardId: BOARD, homeDirectory: directory, controlToken: TOKEN });
  const origin = await listen(server);
  try {
    const before = app.goalEvents.readState(BOARD, created.goal.goal_id);
    const response = await fetch(`${origin}/api/goals/${encodeURIComponent(created.goal.goal_id)}/event-close`, {
      method: "POST",
      headers: { "content-type": "application/json", origin, "x-molis-work-control-token": TOKEN, "x-molis-work-idempotency-key": "bogus-kind" },
      body: JSON.stringify({
        kind: "bogus", reason: "检查无效动作不能提交完成",
        expected_config_version: before.config.version, expected_agreement_version: before.agreement.version,
      }),
    });
    assert.equal(response.status, 400);
    const body = await response.json() as { code?: string };
    assert.match(String(body.code), /invalid_kind/);
    const after = app.goalEvents.readState(BOARD, created.goal.goal_id);
    assert.equal(after.work_status, before.work_status);
    assert.equal(after.observed_event_cursor, before.observed_event_cursor);
    const missing = await fetch(`${origin}/api/goals/${encodeURIComponent(created.goal.goal_id)}/event-close`, {
      method: "POST",
      headers: { "content-type": "application/json", origin, "x-molis-work-control-token": TOKEN, "x-molis-work-idempotency-key": "missing-kind" },
      body: JSON.stringify({
        reason: "缺 kind 也不能默认完成",
        expected_config_version: before.config.version, expected_agreement_version: before.agreement.version,
      }),
    });
    assert.equal(missing.status, 400);
    const missingBody = await missing.json() as { code?: string };
    assert.match(String(missingBody.code), /invalid_kind/);
    const afterMissing = app.goalEvents.readState(BOARD, created.goal.goal_id);
    assert.equal(afterMissing.observed_event_cursor, before.observed_event_cursor);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("HTTP writes persist typed reports, scoped concerns and closure through the public event routes", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-event-http-write-"));
  const databasePath = join(directory, "project.db");
  const store = new LocalProjectDatabase(databasePath);
  const app = new GoalProjectApplication(store);
  app.initializeBoard({ board_id: BOARD, title: "HTTP 写入", actor_id: "user-1", idempotency_key: "init-write" });
  const created = app.goalEvents.createIntent({
    board_id: BOARD, title: "HTTP 写入目标", outcome: "经 HTTP 保存后再读回",
    actor_id: "web-user", actor_kind: "user", idempotency_key: "intent-write",
  });
  const goalId = created.goal.goal_id;
  const server = createMolisWorkWebServer({ databasePath, boardId: BOARD, homeDirectory: directory, controlToken: TOKEN });
  const origin = await listen(server);
  const headers = {
    "content-type": "application/json",
    origin,
    "x-molis-work-control-token": TOKEN,
  };
  try {
    const configure = await fetch(`${origin}/api/goals/${encodeURIComponent(goalId)}/event-configure`, {
      method: "POST",
      headers: { ...headers, "x-molis-work-idempotency-key": "http-cfg" },
      body: JSON.stringify({
        expected_version: 0,
        types: [{
          type_id: "note", version: 1, name: "进展记录", purpose: "记下事实", semantic_family: "progress",
          fields: [{ field_id: "body", name: "内容", purpose: "原文", format: "longtext", required: true }],
        }],
      }),
    });
    assert.equal(configure.status, 200, await configure.clone().text());
    const configuredState = app.goalEvents.readState(BOARD, goalId);
    const agree = await fetch(`${origin}/api/goals/${encodeURIComponent(goalId)}/event-agree`, {
      method: "POST",
      headers: { ...headers, "x-molis-work-idempotency-key": "http-agree" },
      body: JSON.stringify({
        expected_config_version: configuredState.config.version,
        expected_agreement_version: configuredState.agreement.version,
        new_requirements: [{ requirement_id: "need", statement: "能读回刚才写入的事实", bound_type_id: "note" }],
      }),
    });
    assert.equal(agree.status, 200, await agree.clone().text());
    const report = await fetch(`${origin}/api/goals/${encodeURIComponent(goalId)}/event-report`, {
      method: "POST",
      headers: { ...headers, "x-molis-work-idempotency-key": "http-rep" },
      body: JSON.stringify({
        events: [{ type_id: "note", type_version: 1, title: "HTTP 已经写下报告", fields: { body: "这条经公开路由写入。" } }],
      }),
    });
    assert.equal(report.status, 200, await report.clone().text());
    const concern = await fetch(`${origin}/api/goals/${encodeURIComponent(goalId)}/event-concern`, {
      method: "POST",
      headers: { ...headers, "x-molis-work-idempotency-key": "http-concern" },
      body: JSON.stringify({
        action: "open", title: "还要核对范围", statement: "范围必须明确",
        blocks_closure: true, scope: { requirement_ids: ["need"] },
      }),
    });
    assert.equal(concern.status, 200, await concern.clone().text());
    const concernBody = await concern.json() as { concern: { concern_id: string } };
    const decision = await fetch(`${origin}/api/goals/${encodeURIComponent(goalId)}/event-decision`, {
      method: "POST",
      headers: { ...headers, "x-molis-work-idempotency-key": "http-dec" },
      body: JSON.stringify({
        conclusion: "接受当前范围",
        effects: [{ kind: "accept_requirements" }, { kind: "accept_concerns" }],
        scope: { requirement_ids: ["need"], concern_ids: [concernBody.concern.concern_id] },
      }),
    });
    assert.equal(decision.status, 200, await decision.clone().text());
    const decided = await decision.json() as { decision: { decision_id: string } };
    const accept = await fetch(`${origin}/api/goals/${encodeURIComponent(goalId)}/event-concern`, {
      method: "POST",
      headers: { ...headers, "x-molis-work-idempotency-key": "http-accept" },
      body: JSON.stringify({
        action: "accept", concern_id: concernBody.concern.concern_id, reason: "决定已覆盖",
        cited_decision_id: decided.decision.decision_id,
      }),
    });
    assert.equal(accept.status, 200, await accept.clone().text());
    const state = await (await fetch(`${origin}/api/goals/${encodeURIComponent(goalId)}/event-state`)).json() as {
      agreement: { version: number }; config: { version: number }; latest_reports: Array<{ title: string }>;
    };
    const closed = await fetch(`${origin}/api/goals/${encodeURIComponent(goalId)}/event-close`, {
      method: "POST",
      headers: { ...headers, "x-molis-work-idempotency-key": "http-close" },
      body: JSON.stringify({
        kind: "complete", reason: "HTTP 写入已核对",
        expected_config_version: state.config.version,
        expected_agreement_version: state.agreement.version,
      }),
    });
    assert.equal(closed.status, 200, await closed.clone().text());
    const timeline = await (await fetch(`${origin}/api/goals/${encodeURIComponent(goalId)}/event-timeline?limit=20`)).json() as {
      items: Array<{ event_id: string; source?: string; title: string }>;
    };
    const ids = timeline.items.map((item) => item.event_id || item.title);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(timeline.items.some((item) => item.title.includes("HTTP 已经写下报告") || item.source === "event_work"));
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("HTTP progress uses the Goal cursor and legal field ids stay content", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-event-http-cursor-"));
  const databasePath = join(directory, "project.db");
  const store = new LocalProjectDatabase(databasePath);
  const app = new GoalProjectApplication(store);
  app.initializeBoard({ board_id: BOARD, title: "cursor", actor_id: "user-1", idempotency_key: "init-cursor" });
  const created = app.goalEvents.createIntent({
    board_id: BOARD, title: "空白进展", outcome: "第一次摘要",
    actor_id: "web-user", actor_kind: "user", idempotency_key: "intent-cursor",
  });
  const goalId = created.goal.goal_id;
  const server = createMolisWorkWebServer({ databasePath, boardId: BOARD, homeDirectory: directory, controlToken: TOKEN });
  const origin = await listen(server);
  const headers = { "content-type": "application/json", origin, "x-molis-work-control-token": TOKEN };
  try {
    const state = await (await fetch(`${origin}/api/goals/${encodeURIComponent(goalId)}/event-state`)).json() as { goal_event_cursor: number };
    assert.ok(state.goal_event_cursor >= 1);
    const progress = await fetch(`${origin}/api/goals/${encodeURIComponent(goalId)}/event-progress`, {
      method: "POST",
      headers: { ...headers, "x-molis-work-idempotency-key": "blank-progress" },
      body: JSON.stringify({ summary: "空白目标第一次记录进展", based_on_cursor: state.goal_event_cursor }),
    });
    assert.equal(progress.status, 200, await progress.clone().text());
    assert.equal(app.goalEvents.readState(BOARD, goalId).progress_summary?.summary, "空白目标第一次记录进展");
    app.goalEvents.configure({
      board_id: BOARD, goal_id: goalId, actor_id: "web-user", actor_kind: "user",
      expected_version: 0, idempotency_key: "special-fields",
      types: [{
        type_id: "special", version: 1, name: "合法字段", purpose: "原文",
        fields: ["requirement_id", "verdict", "title"].map((field_id) => ({
          field_id, name: field_id, purpose: "原文", format: "text" as const, required: true,
        })),
      }],
    });
    const report = await fetch(`${origin}/api/goals/${encodeURIComponent(goalId)}/event-report`, {
      method: "POST",
      headers: { ...headers, "x-molis-work-idempotency-key": "special-report" },
      body: JSON.stringify({
        events: [{
          type_id: "special", type_version: 1, title: "字段内容不能构成判断",
          fields: { requirement_id: "原文 requirement_id", verdict: "原文 verdict", title: "原文 title" },
        }],
      }),
    });
    assert.equal(report.status, 200, await report.clone().text());
    const reportBody = await report.json() as { work_status?: string; events?: Array<{ journal_seq: number }>; goal_event_cursor?: number };
    assert.equal(reportBody.work_status, "open");
    const beforeScalar = app.goalEvents.listEvents(BOARD, goalId, { limit: 100 });
    const scalarProgress = await fetch(`${origin}/api/goals/${encodeURIComponent(goalId)}/event-report`, {
      method: "POST",
      headers: { ...headers, "x-molis-work-idempotency-key": "scalar-progress" },
      body: JSON.stringify({
        events: [{
          type_id: "special", type_version: 1, title: "非法进展应整批回滚",
          fields: { requirement_id: "不应写入", verdict: "不应写入", title: "不应写入" },
        }],
        progress: "不能被静默丢掉的非法进展",
      }),
    });
    assert.equal(scalarProgress.status, 400, await scalarProgress.clone().text());
    assert.deepEqual(app.goalEvents.listEvents(BOARD, goalId, { limit: 100 }), beforeScalar);
    const saved = app.goalEvents.listEvents(BOARD, goalId, { limit: 20 }).events.find((event) => event.kind === "report");
    assert.equal(saved?.judgments.length, 0);
    assert.equal((saved?.payload as { verdict?: string }).verdict, "原文 verdict");
    const readyCfg = app.goalEvents.readState(BOARD, goalId);
    app.goalEvents.setAgreement({
      board_id: BOARD, goal_id: goalId, actor_id: "web-user", actor_kind: "user",
      idempotency_key: "need-for-close",
      expected_config_version: readyCfg.config.version,
      expected_agreement_version: readyCfg.agreement.version,
      new_requirements: [{ requirement_id: "closed-result", statement: "结果已交付", bound_type_id: "special" }],
    });
    app.goalEvents.report({
      board_id: BOARD, goal_id: goalId, actor_id: "web-user", actor_kind: "user", idempotency_key: "support-close",
      events: [{
        type_id: "special", type_version: 1, title: "交付完成",
        fields: { requirement_id: "a", verdict: "b", title: "c" },
        judgments: [{ requirement_id: "closed-result", verdict: "supports" }],
      }],
    });
    const ready = app.goalEvents.readState(BOARD, goalId);
    const closed = app.goalEvents.submitClosure({
      board_id: BOARD, goal_id: goalId, actor_id: "web-user", actor_kind: "user", idempotency_key: "do-complete",
      kind: "complete", result: "明确结果已交付", reason: "测试显式重开",
      expected_config_version: ready.config.version, expected_agreement_version: ready.agreement.version,
    });
    assert.equal(closed.completion_applied, true);
    const firstResume = await fetch(`${origin}/api/goals/${encodeURIComponent(goalId)}/event-resume`, {
      method: "POST",
      headers: { ...headers, "x-molis-work-idempotency-key": "resume-replay" },
      body: JSON.stringify({ reason: "明确开启下一轮", idempotency_key: "resume-replay" }),
    });
    assert.equal(firstResume.status, 200, await firstResume.clone().text());
    const firstBody = await firstResume.json() as { event_id: string };
    const secondResume = await fetch(`${origin}/api/goals/${encodeURIComponent(goalId)}/event-resume`, {
      method: "POST",
      headers: { ...headers, "x-molis-work-idempotency-key": "resume-replay" },
      body: JSON.stringify({ reason: "明确开启下一轮", idempotency_key: "resume-replay" }),
    });
    assert.equal(secondResume.status, 200, await secondResume.clone().text());
    const secondBody = await secondResume.json() as { event_id: string };
    assert.equal(secondBody.event_id, firstBody.event_id);
    const createBody = {
      goal_id: "old-guard-first", title: "创建入口的业务幂等", outcome: "", why: "", business_logic: "",
    };
    const postCreate = (body: Record<string, unknown>, key: string) => fetch(`${origin}/api/goals`, {
      method: "POST",
      headers: { ...headers, "x-molis-work-idempotency-key": key },
      body: JSON.stringify(body),
    });
    const firstCreate = await postCreate(createBody, "create-replay-key");
    assert.equal(firstCreate.status, 201, await firstCreate.clone().text());
    const firstCreateBody = await firstCreate.json() as {
      goal: { goal_id: string }; replayed: boolean; observed_event_cursor: number;
    };
    assert.equal(firstCreateBody.replayed, false);
    const replayCreate = await postCreate(createBody, "create-replay-key");
    assert.equal(replayCreate.status, 201, await replayCreate.clone().text());
    const replayCreateBody = await replayCreate.json() as {
      goal: { goal_id: string }; replayed: boolean; observed_event_cursor: number;
    };
    assert.equal(replayCreateBody.replayed, true);
    assert.equal(replayCreateBody.goal.goal_id, firstCreateBody.goal.goal_id);
    assert.equal(replayCreateBody.observed_event_cursor, firstCreateBody.observed_event_cursor);
    const differentCreate = await postCreate({ ...createBody, goal_id: "old-guard-second", title: "不同输入" }, "create-replay-key");
    assert.equal(differentCreate.status, 400, await differentCreate.clone().text());
    assert.match((await differentCreate.json() as { error: string }).error, /不同|conflict|different|idempot/i);
    assert.equal(store.snapshot(BOARD).goals.filter((goal) => goal.goal_id === "old-guard-first").length, 1);
    assert.equal(store.snapshot(BOARD).goals.some((goal) => goal.goal_id === "old-guard-second"), false);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("HTTP draft route is gone; event owners and historical drafts stay unchanged", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-event-http-draft-"));
  const databasePath = join(directory, "project.db");
  const store = new LocalProjectDatabase(databasePath);
  const app = new GoalProjectApplication(store);
  app.initializeBoard({ board_id: BOARD, title: "draft-owner", actor_id: "user-1", idempotency_key: "init-draft-http" });
  const created = app.goalEvents.createIntent({
    board_id: BOARD, title: "事件目标", outcome: "原事件约定",
    actor_id: "web-user", actor_kind: "user", idempotency_key: "intent-draft-http",
  });
  app.goals.commands.createGoal(BOARD, {
    goal_id: "legacy-http-draft", title: "未转交草稿", outcome: "旧结果", why: "旧原因",
    business_logic: "旧编辑", definition_state: "draft", decomposition_state: "abstract",
    acceptance_criteria: [],
  }, { actor_id: "web-user", idempotency_key: "legacy-http-create" });
  const server = createMolisWorkWebServer({ databasePath, boardId: BOARD, homeDirectory: directory, controlToken: TOKEN });
  const origin = await listen(server);
  const headers = { "content-type": "application/json", origin, "x-molis-work-control-token": TOKEN };
  try {
    const page = await (await fetch(`${origin}/goals/${encodeURIComponent(created.goal.goal_id)}`)).text();
    assert.match(page, /data-goal-event-document/);
    assert.doesNotMatch(page, /data-draft-editor/);
    const before = store.snapshot(BOARD).goals.find((goal) => goal.goal_id === created.goal.goal_id)!;
    const beforeState = app.goalEvents.readState(BOARD, created.goal.goal_id);
    const rejected = await fetch(`${origin}/api/goals/${encodeURIComponent(created.goal.goal_id)}/draft`, {
      method: "POST",
      headers: { ...headers, "x-molis-work-idempotency-key": "http-draft-hijack" },
      body: JSON.stringify({
        title: "旧草稿表单的新标题", outcome: "旧草稿表单的新结果", why: "不应写入",
        business_logic: "第二份约定", definition_state: "draft", reason: "通过旧草稿入口修改当前约定",
        acceptance_criteria: [],
      }),
    });
    assert.equal(rejected.status, 404, await rejected.clone().text());
    const after = store.snapshot(BOARD).goals.find((goal) => goal.goal_id === created.goal.goal_id)!;
    const afterState = app.goalEvents.readState(BOARD, created.goal.goal_id);
    assert.equal(after.outcome, before.outcome);
    assert.equal(after.title, before.title);
    assert.deepEqual(after.acceptance_criteria, before.acceptance_criteria);
    assert.equal(afterState.agreement.outcome, beforeState.agreement.outcome);
    assert.equal(afterState.agreement.version, beforeState.agreement.version);
    const legacyPage = await (await fetch(`${origin}/goals/legacy-http-draft`)).text();
    assert.match(legacyPage, /未转交草稿/);
    assert.match(legacyPage, /旧结果/);
    assert.doesNotMatch(legacyPage, /data-draft-editor|data-open-goal-edit|data-event-form-open="note"|data-event-form="note"|data-event-form="type"|data-event-form="agreement"|data-event-form="closure"|data-event-form="continue"/);
    const saved = await fetch(`${origin}/api/goals/legacy-http-draft/draft`, {
      method: "POST",
      headers: { ...headers, "x-molis-work-idempotency-key": "http-legacy-draft" },
      body: JSON.stringify({
        title: "未转交草稿已补全", outcome: "可继续的旧结果", why: "旧原因",
        business_logic: "旧编辑", definition_state: "draft", reason: "补全未转交草稿",
        acceptance_criteria: [],
      }),
    });
    assert.equal(saved.status, 404, await saved.clone().text());
    const legacyAfter = store.snapshot(BOARD).goals.find((goal) => goal.goal_id === "legacy-http-draft")!;
    assert.equal(legacyAfter.title, "未转交草稿");
    assert.equal(legacyAfter.outcome, "旧结果");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("HTTP Goal page keeps accepted legacy constraints, inputs and outputs readable", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-event-http-definition-"));
  const databasePath = join(directory, "project.db");
  const store = new LocalProjectDatabase(databasePath);
  const app = new GoalProjectApplication(store);
  app.initializeBoard({ board_id: BOARD, title: "definition-read", actor_id: "user-1", idempotency_key: "init-definition-http" });
  const goal = {
    goal_id: "legacy-definition-http",
    title: "保留原目标的输入输出",
    outcome: "迁入正文后仍能读到完整约定",
    why: "历史资料不能在更换界面时消失",
    business_logic: "从目标说明直接读取原字段",
    definition_state: "accepted" as const,
    decomposition_state: "closed_leaf" as const,
    in_scope: ["原范围内事项"],
    out_of_scope: ["原范围外事项"],
    constraints: ["原约束：只修改已确认的文案"],
    required_inputs: ["原输入：用户已确认的发布说明"],
    promised_outputs: ["原输出：可读的最终说明文档"],
    acceptance_criteria: [{
      criterion_id: "legacy-read-criterion",
      statement: "能够查看原字段",
      decision_method: "inspection" as const,
      target: { value: 90, unit: "分", baseline: "release-gate" },
      pass_condition: "原约束、输入和输出逐项显示",
      required_evidence: ["inspection", "original-report"],
    }],
  };
  app.goals.commands.createGoal(BOARD, goal, { actor_id: "definition-fixture", idempotency_key: "legacy-definition-http-create", reason: "隔离验收原字段读取" });
  const before = store.snapshot(BOARD);
  const server = createMolisWorkWebServer({ databasePath, boardId: BOARD, homeDirectory: directory, controlToken: TOKEN });
  const origin = await listen(server);
  try {
    const page = await (await fetch(`${origin}/goals/${encodeURIComponent(goal.goal_id)}`)).text();
    const start = page.indexOf('data-event-panel="description"');
    const end = page.indexOf('data-event-panel="requirements"');
    assert.ok(start >= 0 && end > start, "description panel must be in the Goal document");
    const description = page.slice(start, end);
    for (const value of [...goal.constraints, ...goal.required_inputs, ...goal.promised_outputs]) {
      assert.match(description, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    assert.doesNotMatch(page, /data-draft-form|data-open-goal-edit|data-event-form-open="note"|data-event-form="note"|data-event-form="type"|data-event-form="agreement"|data-event-form="closure"|data-event-form="continue"/);
    assert.match(page, /data-event-work="false"/);
    assert.match(page, /阅读原来的说明、要求和历史/);
    const requirements = page.slice(end);
    const detailsStart = requirements.indexOf("<details");
    const detailsEnd = requirements.indexOf("</details>");
    assert.ok(detailsStart >= 0 && detailsEnd > detailsStart, "original criteria must be inside an expandable details");
    const details = requirements.slice(detailsStart, detailsEnd + "</details>".length);
    assert.match(details, /<summary>原 Goal 标准<\/summary>/);
    assert.match(details, /legacy-read-criterion/);
    assert.match(details, /inspection/);
    assert.match(details, /\{&quot;value&quot;:90,&quot;unit&quot;:&quot;分&quot;,&quot;baseline&quot;:&quot;release-gate&quot;\}/);
    assert.doesNotMatch(details, /90 分/);
    assert.match(details, /original-report/);
    assert.doesNotMatch(details, /当前满足|尚未满足/);
    const fragment = await (await fetch(`${origin}/api/goals/${encodeURIComponent(goal.goal_id)}/document`)).text();
    for (const value of [...goal.constraints, ...goal.required_inputs, ...goal.promised_outputs]) {
      assert.match(fragment, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    assert.deepEqual(store.snapshot(BOARD).goals, before.goals);
    assert.equal(app.goalEvents.isEventStateOwner(BOARD, goal.goal_id), false);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("HTTP event-agree rejects unknown fields and omitted agreement version with no write", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-event-http-agree-"));
  const databasePath = join(directory, "project.db");
  const store = new LocalProjectDatabase(databasePath);
  const app = new GoalProjectApplication(store);
  app.initializeBoard({ board_id: BOARD, title: "agree", actor_id: "user-1", idempotency_key: "init-agree" });
  const created = app.goalEvents.createIntent({
    board_id: BOARD, title: "约定未知字段", outcome: "原结果",
    actor_id: "web-user", actor_kind: "user", idempotency_key: "intent-agree-http",
  });
  const goalId = created.goal.goal_id;
  const server = createMolisWorkWebServer({ databasePath, boardId: BOARD, homeDirectory: directory, controlToken: TOKEN });
  const origin = await listen(server);
  const headers = { "content-type": "application/json", origin, "x-molis-work-control-token": TOKEN };
  try {
    const before = app.goalEvents.readState(BOARD, goalId);
    const unknown = await fetch(`${origin}/api/goals/${encodeURIComponent(goalId)}/event-agree`, {
      method: "POST",
      headers: { ...headers, "x-molis-work-idempotency-key": "unknown-agree" },
      body: JSON.stringify({
        expected_config_version: before.config.version,
        expected_agreement_version: before.agreement.version,
        outcome: "新结果",
        independently_verified: true,
      }),
    });
    assert.equal(unknown.status, 400);
    const unknownBody = await unknown.json() as { code?: string };
    assert.equal(unknownBody.code, "event_http.unexpected_field");
    const omitted = await fetch(`${origin}/api/goals/${encodeURIComponent(goalId)}/event-close`, {
      method: "POST",
      headers: { ...headers, "x-molis-work-idempotency-key": "omit-agreement" },
      body: JSON.stringify({
        kind: "complete", reason: "漏掉约定版本", expected_config_version: before.config.version,
      }),
    });
    assert.equal(omitted.status, 400);
    const after = app.goalEvents.readState(BOARD, goalId);
    assert.equal(after.agreement.outcome, before.agreement.outcome);
    assert.equal(after.observed_event_cursor, before.observed_event_cursor);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("HTTP outcome replacement expires all current supports; stale agreement_change approval has no write", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-event-http-expire-"));
  const databasePath = join(directory, "project.db");
  const store = new LocalProjectDatabase(databasePath);
  const app = new GoalProjectApplication(store);
  app.initializeBoard({ board_id: BOARD, title: "http-expire", actor_id: "user-1", idempotency_key: "init-expire" });
  const created = app.goalEvents.createIntent({
    board_id: BOARD, title: "真实购买", outcome: "用户可以完成真实购买",
    actor_id: "web-user", actor_kind: "user", idempotency_key: "intent-expire",
  });
  const goalId = created.goal.goal_id;
  app.goalEvents.configure({
    board_id: BOARD, goal_id: goalId, actor_id: "web-user", actor_kind: "user",
    expected_version: 0, idempotency_key: "cfg-expire",
    types: [{
      type_id: "delivery", version: 1, name: "交付", purpose: "当前实际交付内容",
      fields: [{ field_id: "result", name: "结果", purpose: "可以核对的结果", format: "text", required: true }],
    }],
  });
  const versions = () => {
    const state = app.goalEvents.readState(BOARD, goalId);
    return { expected_config_version: state.config.version, expected_agreement_version: state.agreement.version };
  };
  app.goalEvents.setAgreement({
    board_id: BOARD, goal_id: goalId, actor_id: "web-user", actor_kind: "user",
    idempotency_key: "agree-expire", ...versions(),
    new_requirements: [
      { requirement_id: "r-one", statement: "真实完成购买", bound_type_id: "delivery" },
      { requirement_id: "r-two", statement: "可查询订单", bound_type_id: "delivery" },
    ],
  });
  app.goalEvents.report({
    board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "rep-expire",
    events: [{
      type_id: "delivery", type_version: 1, title: "真实核对结果",
      fields: { result: "隔离验收记录" },
      judgments: [
        { requirement_id: "r-one", verdict: "supports" },
        { requirement_id: "r-two", verdict: "supports" },
      ],
    }],
  });
  const closed = app.goalEvents.submitClosure({
    board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime",
    idempotency_key: "close-expire", kind: "complete", reason: "核对当前要求后明确收尾", result: "可操作的购买体验",
    ...versions(),
  });
  assert.equal(closed.completion_applied, true);
  const server = createMolisWorkWebServer({ databasePath, boardId: BOARD, homeDirectory: directory, controlToken: TOKEN });
  const origin = await listen(server);
  const headers = { "content-type": "application/json", origin, "x-molis-work-control-token": TOKEN };
  try {
    const beforeChange = app.goalEvents.readState(BOARD, goalId);
    const replace = await fetch(`${origin}/api/goals/${encodeURIComponent(goalId)}/event-agree`, {
      method: "POST",
      headers: { ...headers, "x-molis-work-idempotency-key": "http-outcome-replace" },
      body: JSON.stringify({ ...versions(), outcome: "展示购买按钮即可", idempotency_key: "http-outcome-replace" }),
    });
    assert.equal(replace.status, 200, await replace.clone().text());
    const changed = app.goalEvents.readState(BOARD, goalId);
    assert.equal(changed.agreement.outcome, "展示购买按钮即可");
    assert.equal(changed.work_status, "open");
    assert.equal(changed.completion_effect, false);
    assert.equal(changed.requirements.find((item) => item.requirement_id === "r-one")?.currently_satisfied, false);
    assert.equal(changed.requirements.find((item) => item.requirement_id === "r-two")?.currently_satisfied, false);
    assert.equal(changed.closure?.closure_id, beforeChange.closure?.closure_id);
    assert.equal(changed.closure?.superseded, true);
    const incomplete = app.goalEvents.submitClosure({
      board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "close-after-replace", kind: "complete", reason: "核对当前要求后明确收尾", result: "可操作的购买体验",
      ...versions(),
    });
    assert.equal(incomplete.recorded, true);
    assert.equal(incomplete.completion_applied, false);

    const staleRequest = app.goalEvents.requestDecision({
      board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "ask-http-stale",
      question: "取消原来的真实购买要求",
      options: [
        { option_id: "yes", label: "同意", impact: "按所展示内容应用" },
        { option_id: "no", label: "拒绝", impact: "保留当前约定并继续处理" },
      ],
      purpose: "agreement_change",
      proposed_change: { retire_requirement_ids: ["r-one"] },
    });
    assert.equal(staleRequest.decision_request.commitment?.requirements[0]?.statement, "真实完成购买");
    const freshPage = await (await fetch(`${origin}/goals/${encodeURIComponent(goalId)}`)).text();
    assert.match(freshPage, /name="agreement_change_decision" value="authorize"/);
    assert.match(freshPage, /name="agreement_change_decision" value="deny"/);
    assert.doesNotMatch(freshPage, /name="agreement_change_decision"[^>]*checked/);
    assert.doesNotMatch(freshPage, /name="effect" value="authorize_agreement_change"/);
    assert.doesNotMatch(freshPage, /name="selected_option_id"/);
    assert.match(freshPage, /退休要求/);
    assert.match(freshPage, /真实完成购买/);
    app.goalEvents.setAgreement({
      board_id: BOARD, goal_id: goalId, actor_id: "web-user", actor_kind: "user",
      idempotency_key: "http-revise-before-approve", ...versions(),
      revise_requirements: [{ requirement_id: "r-one", statement: "真实购买并处理退货" }],
    });
    const stalePage = await (await fetch(`${origin}/goals/${encodeURIComponent(goalId)}`)).text();
    assert.match(stalePage, /已经变化/);
    assert.match(stalePage, /刷新或重新请求/);
    const beforeStale = app.goalEvents.readState(BOARD, goalId);
    const staleApproval = await fetch(`${origin}/api/goals/${encodeURIComponent(goalId)}/event-decision`, {
      method: "POST",
      headers: { ...headers, "x-molis-work-idempotency-key": "http-stale-approve" },
      body: JSON.stringify({
        request_id: staleRequest.decision_request.request_id,
        selected_option_id: "yes",
        conclusion: "批准之前展示的取消要求",
        effects: [{ kind: "authorize_agreement_change" }],
        idempotency_key: "http-stale-approve",
      }),
    });
    assert.equal(staleApproval.status, 400, await staleApproval.clone().text());
    const staleBody = await staleApproval.json() as { error?: string };
    assert.match(String(staleBody.error), /变化|变更|匹配|过期|基线|版本/);
    const afterStale = app.goalEvents.readState(BOARD, goalId);
    assert.equal(afterStale.goal_event_cursor, beforeStale.goal_event_cursor);
    assert.equal(afterStale.requirements.find((item) => item.requirement_id === "r-one")?.statement, "真实购买并处理退货");
    assert.equal(afterStale.applied_decisions.length, beforeStale.applied_decisions.length);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("HTTP create receipt has no retired state aliases and covers requirements and relations", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-event-http-create-"));
  const databasePath = join(directory, "project.db");
  const store = new LocalProjectDatabase(databasePath);
  const app = new GoalProjectApplication(store);
  app.initializeBoard({ board_id: BOARD, title: "HTTP 创建", actor_id: "user-1", idempotency_key: "init-create" });
  const parent = app.goalEvents.createIntent({
    board_id: BOARD, title: "购买体验", outcome: "用户完成购买",
    actor_id: "web-user", actor_kind: "user", idempotency_key: "http-parent", source_kind: "web",
  });
  const dependency = app.goalEvents.createIntent({
    board_id: BOARD, title: "实际付款", outcome: "付款完成",
    actor_id: "web-user", actor_kind: "user", idempotency_key: "http-dependency", source_kind: "web",
  });
  const server = createMolisWorkWebServer({ databasePath, boardId: BOARD, homeDirectory: directory, controlToken: TOKEN });
  const origin = await listen(server);
  try {
    const createdResponse = await fetch(`${origin}/api/goals`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        "x-molis-work-control-token": TOKEN,
        "x-molis-work-idempotency-key": "http-child",
      },
      body: JSON.stringify({
        title: "付款与收据",
        outcome: "真实完成付款且可以读到收据",
        parent_goal_id: parent.goal.goal_id,
        dependency_goal_ids: [dependency.goal.goal_id],
        acceptance_criteria: ["真实付款成功"],
        idempotency_key: "http-child",
      }),
    });
    assert.equal(createdResponse.status, 201, await createdResponse.clone().text());
    const created = await createdResponse.json() as {
      goal: Record<string, unknown>;
      observed_event_cursor: number;
      replayed: boolean;
    };
    assert.equal(created.replayed, false);
    for (const field of ["definition_state", "decomposition_state", "fulfillment_state"]) {
      assert.equal(Object.hasOwn(created.goal, field), false);
    }
    const finalCursor = Number(store.db.prepare("SELECT MAX(seq) AS n FROM events WHERE board_id=?").get(BOARD)?.n);
    assert.equal(created.observed_event_cursor, finalCursor);
    const replayResponse = await fetch(`${origin}/api/goals`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        "x-molis-work-control-token": TOKEN,
        "x-molis-work-idempotency-key": "http-child-new-header",
      },
      body: JSON.stringify({
        title: "付款与收据",
        outcome: "真实完成付款且可以读到收据",
        parent_goal_id: parent.goal.goal_id,
        dependency_goal_ids: [dependency.goal.goal_id],
        acceptance_criteria: ["真实付款成功"],
        idempotency_key: "http-child",
      }),
    });
    assert.equal(replayResponse.status, 201, await replayResponse.clone().text());
    const replayed = await replayResponse.json() as {
      goal: { goal_id: string }; observed_event_cursor: number; replayed: boolean;
    };
    assert.equal(replayed.replayed, true);
    assert.equal(replayed.goal.goal_id, created.goal.goal_id);
    assert.equal(replayed.observed_event_cursor, created.observed_event_cursor);
    const failedParent = await fetch(`${origin}/api/goals`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        "x-molis-work-control-token": TOKEN,
        "x-molis-work-idempotency-key": "http-child-fail-then-retry",
      },
      body: JSON.stringify({
        title: "失败后改正输入",
        parent_goal_id: "missing-parent",
        idempotency_key: "http-child-fail-then-retry",
      }),
    });
    assert.equal(failedParent.status, 400, await failedParent.clone().text());
    const recovered = await fetch(`${origin}/api/goals`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        "x-molis-work-control-token": TOKEN,
        "x-molis-work-idempotency-key": "http-child-fail-then-retry",
      },
      body: JSON.stringify({
        title: "失败后改正输入",
        parent_goal_id: parent.goal.goal_id,
        idempotency_key: "http-child-fail-then-retry",
      }),
    });
    assert.equal(recovered.status, 201, await recovered.clone().text());
    const recoveredBody = await recovered.json() as { replayed: boolean; goal: { goal_id: string } };
    assert.equal(recoveredBody.replayed, false);
    const state = app.goalEvents.readState(BOARD, String(created.goal.goal_id));
    assert.equal(state.intent.source_kind, "web");
    assert.deepEqual(state.requirements.map((item) => item.statement), ["真实付款成功"]);
    const childCount = store.snapshot(BOARD).goals.filter((goal) => goal.title === "付款与收据").length;
    assert.equal(childCount, 1);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("onboarding initialize receipt has no retired aliases and persists onboarding source", async () => {
  const homeDirectory = mkdtempSync(join(tmpdir(), "molis-work-event-http-onboarding-"));
  const server = createMolisWorkWebServer({
    homeDirectory,
    controlToken: TOKEN,
  });
  const origin = await listen(server);
  let catalog: Awaited<ReturnType<typeof openMolisWorkProjectCatalog>> | undefined;
  let store: LocalProjectDatabase | undefined;
  try {
    const initializedResponse = await fetch(`${origin}/api/onboarding/initialize`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        "x-molis-work-control-token": TOKEN,
        "x-molis-work-idempotency-key": "http-onboarding",
      },
      body: JSON.stringify({
        project_name: "引导创建来源",
        outcome: "建立可持续推进的购买体验",
        intent_frame: "open",
        workspace_path: null,
        runtime_kind: null,
        user_confirmed: true,
      }),
    });
    assert.equal(initializedResponse.status, 201, await initializedResponse.clone().text());
    const initialized = await initializedResponse.json() as {
      project: { project_id: string };
      goal: Record<string, unknown>;
      goal_id: string;
    };
    for (const field of ["definition_state", "decomposition_state", "fulfillment_state"]) {
      assert.equal(Object.hasOwn(initialized.goal, field), false);
    }
    catalog = await openMolisWorkProjectCatalog({ homeDirectory });
    const project = catalog.getProject(initialized.project.project_id);
    store = new LocalProjectDatabase(project.database_path);
    const app = new GoalProjectApplication(store);
    assert.equal(app.goalEvents.readState(project.board_id, initialized.goal_id).intent.source_kind, "onboarding");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    store?.close();
    catalog?.close();
    rmSync(homeDirectory, { recursive: true, force: true });
  }
});

test("HTTP goal-tree decisions replay the original result with a stable business key", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-event-http-tree-retry-"));
  const databasePath = join(directory, "project.db");
  const store = new LocalProjectDatabase(databasePath);
  const app = new GoalProjectApplication(store);
  app.initializeBoard({ board_id: BOARD, title: "HTTP 树决定", actor_id: "user-1", idempotency_key: "init-tree-http" });
  const treeItem = (id: string) => ({
    item_id: `item-${id}`,
    kind: "goal" as const,
    operation: "create" as const,
    payload: { title: id, outcome: `${id}结果`, goal_id: id },
    source_refs: ["runtime"],
    reason: "结构条目",
    confidence: 0.9,
  });
  const whole = app.goalTreeSubmission.submitGoalTreeProposal({
    board_id: BOARD,
    actor_id: "runtime:test:session",
    submitted_session_id: "session",
    summary: "整组确认",
    items: [treeItem("HTTP-TREE-A"), treeItem("HTTP-TREE-B")],
    idempotency_key: "http-tree-whole-propose",
  });
  const partial = app.goalTreeSubmission.submitGoalTreeProposal({
    board_id: BOARD,
    actor_id: "runtime:test:session",
    submitted_session_id: "session",
    summary: "部分确认",
    items: [treeItem("HTTP-TREE-PART-A"), treeItem("HTTP-TREE-PART-B")],
    idempotency_key: "http-tree-part-propose",
  });
  const server = createMolisWorkWebServer({ databasePath, boardId: BOARD, homeDirectory: directory, controlToken: TOKEN });
  const origin = await listen(server);
  const headers = { "content-type": "application/json", origin, "x-molis-work-control-token": TOKEN };
  try {
    const decide = (proposalId: string, body: Record<string, unknown>, key: string) => fetch(
      `${origin}/api/goal-tree-proposals/${encodeURIComponent(proposalId)}/decision`,
      {
        method: "POST",
        headers: { ...headers, "x-molis-work-idempotency-key": key },
        body: JSON.stringify(body),
      },
    );
    const wholeBody = {
      confirm_all_pending: true,
      reason: "用户确认本次展示的整组目标",
      idempotency_key: "http-tree-whole-decide",
    };
    const approved = await decide(whole.proposal.proposal_id, wholeBody, "http-tree-whole-decide");
    assert.equal(approved.status, 200, await approved.clone().text());
    const approvedBody = await approved.json() as { replayed: boolean; applied_item_ids: string[] };
    assert.equal(approvedBody.replayed, false);
    assert.equal(approvedBody.applied_item_ids.length, 2);
    const wholeReplay = await decide(whole.proposal.proposal_id, wholeBody, "http-tree-whole-decide");
    assert.equal(wholeReplay.status, 200, await wholeReplay.clone().text());
    const wholeReplayBody = await wholeReplay.json() as { replayed: boolean; applied_item_ids: string[] };
    assert.equal(wholeReplayBody.replayed, true);
    assert.deepEqual(wholeReplayBody.applied_item_ids, approvedBody.applied_item_ids);
    const wholeNewHttp = await decide(whole.proposal.proposal_id, wholeBody, "http-tree-whole-new-http");
    assert.equal(wholeNewHttp.status, 200, await wholeNewHttp.clone().text());
    assert.equal((await wholeNewHttp.json() as { replayed: boolean }).replayed, true);
    const differentWhole = await decide(
      whole.proposal.proposal_id,
      { ...wholeBody, reason: "同键不同决定内容" },
      "http-tree-whole-different",
    );
    assert.equal(differentWhole.status, 400, await differentWhole.clone().text());
    assert.match((await differentWhole.json() as { error: string }).error, /不同|conflict|different|idempot/i);
    const partBody = {
      decisions: [{ item_id: "item-HTTP-TREE-PART-A", decision: "confirm", reason: "先做这一项" }],
      idempotency_key: "http-tree-part-decide",
    };
    const selected = await decide(partial.proposal.proposal_id, partBody, "http-tree-part-decide");
    assert.equal(selected.status, 200, await selected.clone().text());
    const selectedBody = await selected.json() as { replayed: boolean; applied_item_ids: string[] };
    assert.equal(selectedBody.applied_item_ids.length, 1);
    const rejectBody = {
      decisions: [{ item_id: "item-HTTP-TREE-PART-B", decision: "reject", reason: "暂不做另一项" }],
      idempotency_key: "http-tree-part-reject",
    };
    const rejected = await decide(partial.proposal.proposal_id, rejectBody, "http-tree-part-reject");
    assert.equal(rejected.status, 200, await rejected.clone().text());
    const partReplay = await decide(partial.proposal.proposal_id, partBody, "http-tree-part-new-http");
    assert.equal(partReplay.status, 200, await partReplay.clone().text());
    assert.equal((await partReplay.json() as { replayed: boolean }).replayed, true);
    const rejectReplay = await decide(partial.proposal.proposal_id, rejectBody, "http-tree-reject-new-http");
    assert.equal(rejectReplay.status, 200, await rejectReplay.clone().text());
    assert.equal((await rejectReplay.json() as { replayed: boolean }).replayed, true);
    assert.equal(store.snapshot(BOARD).goals.filter((goal) => goal.goal_id.startsWith("HTTP-TREE-")).length, 3);
    const blocked = await fetch(`${origin}/api/non-idempotent-management-probe`, {
      method: "POST",
      headers: { ...headers, "x-molis-work-idempotency-key": "http-tree-whole-decide" },
      body: JSON.stringify({}),
    });
    assert.equal(blocked.status, 409, await blocked.clone().text());
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("HTTP goal-tree reject prefills displayed relation conflict and keeps the submitted reason", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-event-http-tree-conflict-"));
  const databasePath = join(directory, "project.db");
  const store = new LocalProjectDatabase(databasePath);
  const app = new GoalProjectApplication(store);
  app.initializeBoard({ board_id: BOARD, title: "关系冲突退回", actor_id: "user-1", idempotency_key: "init-rel-conflict" });
  const parent = app.goalEvents.createIntent({
    board_id: BOARD, title: "购买体验", outcome: "用户完成购买",
    actor_id: "web-user", actor_kind: "user", idempotency_key: "rel-conflict-parent", source_kind: "web",
  });
  const child = app.goalEvents.createIntent({
    board_id: BOARD, title: "付款结果", outcome: "付款完成",
    parent_goal_id: parent.goal.goal_id,
    actor_id: "web-user", actor_kind: "user", idempotency_key: "rel-conflict-child", source_kind: "web",
  });
  const relation = store.snapshot(BOARD).relations.find((item) =>
    item.from_goal_id === child.goal.goal_id &&
    item.to_goal_id === parent.goal.goal_id &&
    item.type === "part_of" &&
    item.state === "active",
  );
  assert.ok(relation);
  const submitted = app.goalTreeSubmission.submitGoalTreeProposal({
    board_id: BOARD,
    actor_id: "runtime:test:session",
    submitted_session_id: "session",
    summary: "解除已经变化的父子关系",
    items: [{
      item_id: "item-rel-deactivate",
      kind: "relation",
      operation: "deactivate",
      payload: {
        relation_id: relation.relation_id,
        from_goal_id: child.goal.goal_id,
        to_goal_id: parent.goal.goal_id,
        type: "part_of",
        reason: "准备解除这条关系",
      },
      source_refs: ["runtime"],
      reason: "关系基线随后会变化",
      confidence: 1,
      affected_objects: [{ object_type: "relation", object_id: relation.relation_id }],
    }],
    idempotency_key: "rel-conflict-propose",
  });
  app.goals.commands.deactivateRelation(BOARD, {
    relation_id: relation.relation_id,
    reason: "提案外已经解除这条关系",
  }, { actor_id: "user-1", idempotency_key: "rel-conflict-outside-deactivate" });
  const checked = app.goalTreeCheck.checkGoalTreeProposal({
    board_id: BOARD,
    proposal_id: submitted.proposal.proposal_id,
    actor_id: "runtime:test:session",
    idempotency_key: "rel-conflict-check",
  });
  assert.deepEqual(checked.conflict_item_ids, ["item-rel-deactivate"]);
  const server = createMolisWorkWebServer({ databasePath, boardId: BOARD, homeDirectory: directory, controlToken: TOKEN });
  const origin = await listen(server);
  const headers = { "content-type": "application/json", origin, "x-molis-work-control-token": TOKEN };
  try {
    const page = await (await fetch(`${origin}/goals/${encodeURIComponent(child.goal.goal_id)}`)).text();
    assert.match(page, /退回理由已按下方问题预填，可以直接提交，也可以改写/);
    assert.match(page, /已按下方问题预填，可以直接采用，也可以改写/);
    assert.match(page, /决定理由或修改意见[\s\S]*必填/);
    assert.doesNotMatch(page, /Molis Work 会自动附上上方问题/);
    assert.doesNotMatch(page, /补充说明[\s\S]*可选/);
    const prefilled = page.match(/<textarea name="reason"[^>]*>([\s\S]*?)<\/textarea>/)?.[1] ?? "";
    assert.match(prefilled, /不能安全写入|不一致/);
    const path = `/api/goal-tree-proposals/${encodeURIComponent(submitted.proposal.proposal_id)}/decision`;
    const emptyReject = await fetch(`${origin}${path}`, {
      method: "POST",
      headers: { ...headers, "x-molis-work-idempotency-key": "rel-conflict-empty" },
      body: JSON.stringify({
        decisions: [{ item_id: "item-rel-deactivate", decision: "reject", reason: "" }],
        reason: "",
        idempotency_key: "rel-conflict-empty",
      }),
    });
    assert.equal(emptyReject.status, 400, await emptyReject.clone().text());
    assert.match((await emptyReject.json() as { error: string }).error, /理由|修改意见/);
    const afterEmpty = app.goalTree.listGoalTreeProposals({
      board_id: BOARD, proposal_id: submitted.proposal.proposal_id, include_legacy: false,
    }).proposals[0];
    assert.equal(afterEmpty?.items[0]?.decision, null);
    const rewritten = "用户改写后的退回：关系已经在提案外解除，请按当前 Goal Tree 重提。";
    const rejectBody = {
      decisions: [{ item_id: "item-rel-deactivate", decision: "reject", reason: rewritten }],
      reason: rewritten,
      idempotency_key: "rel-conflict-rewrite",
    };
    const rejected = await fetch(`${origin}${path}`, {
      method: "POST",
      headers: { ...headers, "x-molis-work-idempotency-key": "rel-conflict-rewrite" },
      body: JSON.stringify(rejectBody),
    });
    assert.equal(rejected.status, 200, await rejected.clone().text());
    const rejectedBody = await rejected.json() as { replayed: boolean; rejected_item_ids: string[] };
    assert.equal(rejectedBody.replayed, false);
    assert.deepEqual(rejectedBody.rejected_item_ids, ["item-rel-deactivate"]);
    const stored = app.goalTree.listGoalTreeProposals({
      board_id: BOARD, proposal_id: submitted.proposal.proposal_id, include_legacy: false,
    }).proposals[0];
    assert.equal(stored?.items[0]?.decision?.reason, rewritten);
    const replay = await fetch(`${origin}${path}`, {
      method: "POST",
      headers: { ...headers, "x-molis-work-idempotency-key": "rel-conflict-rewrite-new-http" },
      body: JSON.stringify(rejectBody),
    });
    assert.equal(replay.status, 200, await replay.clone().text());
    const replayBody = await replay.json() as { replayed: boolean; rejected_item_ids: string[] };
    assert.equal(replayBody.replayed, true);
    assert.deepEqual(replayBody.rejected_item_ids, ["item-rel-deactivate"]);
    const replayedStored = app.goalTree.listGoalTreeProposals({
      board_id: BOARD, proposal_id: submitted.proposal.proposal_id, include_legacy: false,
    }).proposals[0];
    assert.equal(replayedStored?.items[0]?.decision?.reason, rewritten);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
