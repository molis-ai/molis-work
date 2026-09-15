import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { RegistryFallbackSessionAdapter } from "@molis-ai/molis-work-plugin-work";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";

import { DEMO_BOARD_ID, GoalProjectApplication } from "@molis-ai/molis-work-app-local-host";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { CodexRuntimeSessionAdapter, RuntimeHostRouter } from "@molis-ai/molis-work-service-runtime-host";
import { SessionContentService } from "@molis-ai/molis-work-plugin-work";
import { SessionDirectoryService } from "@molis-ai/molis-work-plugin-work";
import { SessionHandoffService, buildSessionHandoffPackage } from "@molis-ai/molis-work-plugin-work";
import { MolisWorkSessionRegistry } from "@molis-ai/molis-work-module-private-work-context";
import { MolisWorkSessionError } from "@molis-ai/molis-work-module-private-work-context";
import type { RuntimeSessionTransport } from "@molis-ai/molis-work-contracts/services/runtime-host";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { openWorkSessionRegistry } from "@molis-ai/molis-work-app-local-host";
import {
  insertHistoricalClaim,
  insertHistoricalEvidence,
  insertHistoricalRisk,
  insertHistoricalRun,
  sessionHandoffGoalContext,
} from "./historical-sql-fixture.js";
import { materializeGoalEventV35Fixture } from "./goal-event-v35-fixture.js";

const WEB_TOKEN = "molis-work-session-handoff-token-0123456789abcdef";

function handoffCurrentSection(content: string): string {
  return content.split("## 历史记录（只读）")[0] ?? content;
}

function handoffHistorySection(content: string): string {
  return content.split("## 历史记录（只读）")[1] ?? "";
}

function createContract(databasePath: string, boardId: string, goalId: string) {
  const store = new LocalProjectDatabase(databasePath);
  const coordinator = new GoalProjectApplication(store);
  coordinator.initializeBoard({
    board_id: boardId,
    title: "Handoff 项目",
    actor_id: "owner",
    idempotency_key: `${boardId}-init`,
  });
  coordinator.goalEvents.createIntent({
    board_id: boardId,
    goal_id: goalId,
    title: "交付新的目标 Runtime Session",
    outcome: "目标 Runtime 收到可执行的 Goal Handoff",
    why: "换 Runtime 后仍需保留目标、约束与验收事实",
    business_logic: "用户审阅 package 后创建全新 Session，不复用来源原生身份。",
    actor_id: "owner",
    actor_kind: "user",
    idempotency_key: `${goalId}-create`,
    requirements: [{
      requirement_id: `${goalId}-criterion`,
      statement: "目标 Session 收到 Handoff",
    }],
  });
  insertHistoricalClaim(store.db, {
    claim_id: `${goalId}-claim`,
    board_id: boardId,
    goal_id: goalId,
    actor_id: "runtime-history",
    state: "released",
  });
  insertHistoricalRun(store.db, {
    run_id: `${goalId}-run`,
    board_id: boardId,
    goal_id: goalId,
    claim_id: `${goalId}-claim`,
    actor_id: "runtime-history",
    state: "completed",
    ended_at: "2026-09-02T00:02:00.000Z",
    output_refs_json: JSON.stringify(["artifact://handoff-history"]),
  });
  insertHistoricalEvidence(store.db, {
    evidence_id: `${goalId}-evidence`,
    board_id: boardId,
    goal_id: goalId,
    producer_actor_id: "runtime-history",
    locator: "artifact://handoff-history",
    result: "passed",
    criterion_ids: [`${goalId}-criterion`],
    run_id: `${goalId}-run`,
  });
  insertHistoricalRisk(store.db, {
    risk_id: `${goalId}-risk`,
    board_id: boardId,
    goal_ids: [goalId],
    description: "历史交接风险",
    treatment_plan: "只读保留",
    state: "resolved",
  });
  return { store, contract: sessionHandoffGoalContext(coordinator, boardId, goalId) };
}

test("Handoff package uses the canonical Goal and a minimal Session context, then creates a new Codex Session", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "molis-work-session-handoff-"));
  const home = path.join(directory, ".molis-work");
  const boardId = "project-handoff-native";
  const goalId = "goal-handoff-native";
  const { store, contract } = createContract(path.join(directory, "board.db"), boardId, goalId);
  const registry = await openWorkSessionRegistry({ homeDirectory: home });
  const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  const transport: RuntimeSessionTransport = {
    async request(method, params) {
      calls.push({ method, params });
      if (method === "thread/read") return { thread: { turns: [] } };
      if (method === "thread/start") return { thread: { id: "thread-native-destination" } };
      if (method === "turn/start") return { turn: { id: "turn-native-destination" } };
      throw new Error(`unexpected ${method}`);
    },
    subscribe() { return () => undefined; },
  };
  try {
    const source = registry.explicitlyLinkSession({
      runtime_id: "codex",
      native_runtime_session_id: "thread-native-source",
      actor_id: "user",
      user_confirmed: true,
      project_id: boardId,
      current_goal_id: goalId,
      workspace_path: directory,
      title: "来源 Session",
    });
    registry.appendEvent({
      session_id: source.session_id,
      source: "goalboard",
      kind: "user_message",
      source_id: "source-user",
      content: "请从当前验收缺口继续。",
    });
    registry.appendEvent({
      session_id: source.session_id,
      source: "goalboard",
      kind: "tool",
      source_id: "source-tool",
      content: "SHOULD-NOT-BE-IN-HANDOFF",
    });
    const router = new RuntimeHostRouter((runtimeId) => new RegistryFallbackSessionAdapter(runtimeId, registry));
    router.register(new CodexRuntimeSessionAdapter(transport));
    const content = new SessionContentService(registry, router);
    const service = new SessionHandoffService(
      registry,
      router,
      new SessionDirectoryService(registry, router),
      content,
    );

    const prepared = await service.prepare({
      source_session_id: source.session_id,
      project_id: boardId,
      project_name: "Handoff 项目",
      target_runtime_id: "codex",
      target_workspace_path: directory,
      actor_id: "user",
      goal_contract: contract,
    });
    assert.equal(prepared.reused, false);
    assert.match(prepared.handoff.content ?? "", /目标 Runtime 收到可执行的 Goal Handoff/);
    assert.match(prepared.handoff.content ?? "", /请从当前验收缺口继续/);
    assert.doesNotMatch(prepared.handoff.content ?? "", /SHOULD-NOT-BE-IN-HANDOFF/);
    assert.deepEqual(calls.map((item) => item.method), ["thread/read"]);

    const relationDb = new Database(registry.databasePath);
    try {
      const ledger = createContextLedger(relationDb, { authorize: () => true });
      const edge = ledger.query.get({ actor_id: "test-reader", scope: { kind: "personal", id: "private-work-context" } },
        `handoff.goal:${prepared.handoff.package_id}`);
      assert.equal(edge?.target.id, goalId);
      assert.equal(edge?.target.project_id, boardId);
      assert.equal(edge?.target.version, 1, "Native Work must pin the Contract revision used to build this package");
    } finally { relationDb.close(); }

    const edited = `${prepared.handoff.content}\n\n用户补充：先运行定向测试。`;
    const sent = await service.send({
      package_id: prepared.handoff.package_id,
      target_runtime_id: "codex",
      target_workspace_path: directory,
      content: edited,
      actor_id: "user",
      user_confirmed: true,
    });
    assert.equal(sent.handoff.state, "sent");
    assert.equal(sent.handoff.delivery_mode, "native");
    assert.ok(sent.destination_session);
    assert.notEqual(sent.destination_session?.session_id, source.session_id);
    assert.equal(sent.destination_session?.native_runtime_session_id, "thread-native-destination");
    assert.equal(sent.destination_session?.current_goal_id, goalId);
    assert.deepEqual(calls.map((item) => item.method), ["thread/read", "thread/start", "turn/start"]);
    assert.equal((calls[2]?.params.input as Array<{ text: string }>)[0]?.text, edited);
    assert.equal(registry.handoffsForSession(source.session_id)[0]?.destination_session_id, sent.destination_session?.session_id);

    const replay = await service.send({
      package_id: prepared.handoff.package_id,
      target_runtime_id: "codex",
      target_workspace_path: directory,
      content: edited,
      actor_id: "user",
      user_confirmed: true,
    });
    assert.equal(replay.destination_session?.session_id, sent.destination_session?.session_id);
    assert.deepEqual(calls.map((item) => item.method), ["thread/read", "thread/start", "turn/start"]);
  } finally {
    registry.close();
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("unsupported Runtime receives an honest Molis Work fallback Session with encrypted package content", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "molis-work-session-handoff-fallback-"));
  const boardId = "project-handoff-fallback";
  const goalId = "goal-handoff-fallback";
  const { store, contract } = createContract(path.join(directory, "board.db"), boardId, goalId);
  const registry = await openWorkSessionRegistry({ homeDirectory: path.join(directory, ".molis-work") });
  try {
    const source = registry.createSession({
      runtime_id: "runtime-without-read",
      actor_id: "user",
      user_confirmed: true,
      project_id: boardId,
      current_goal_id: goalId,
      title: "Fallback source",
    });
    const router = new RuntimeHostRouter((runtimeId) => new RegistryFallbackSessionAdapter(runtimeId, registry));
    const content = new SessionContentService(registry, router);
    const service = new SessionHandoffService(
      registry,
      router,
      new SessionDirectoryService(registry, router),
      content,
    );
    const prepared = await service.prepare({
      source_session_id: source.session_id,
      project_id: boardId,
      project_name: "Fallback Project",
      target_runtime_id: "claude-code",
      actor_id: "user",
      goal_contract: contract,
    });
    const sent = await service.send({
      package_id: prepared.handoff.package_id,
      target_runtime_id: "claude-code",
      content: prepared.handoff.content ?? "",
      actor_id: "user",
      user_confirmed: true,
    });
    assert.equal(sent.handoff.state, "sent");
    assert.equal(sent.handoff.delivery_mode, "molis_work_fallback");
    assert.equal(sent.destination_session?.runtime_id, "claude-code");
    assert.equal(sent.destination_session?.native_runtime_session_id, null);
    const targetContent = await content.read(sent.destination_session!.session_id);
    assert.equal(targetContent.content_mode, "fallback");
    assert.match(targetContent.events.map((event) => event.content).join("\n"), /# Handoff：交付新的目标 Runtime Session/);
  } finally {
    registry.close();
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("a source Session without a current Goal cannot prepare a Handoff", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "molis-work-session-handoff-no-goal-"));
  const boardId = "project-handoff-no-goal";
  const goalId = "goal-handoff-no-goal";
  const { store, contract } = createContract(path.join(directory, "board.db"), boardId, goalId);
  const registry = await openWorkSessionRegistry({ homeDirectory: path.join(directory, ".molis-work") });
  try {
    const source = registry.createSession({
      runtime_id: "unknown",
      actor_id: "user",
      user_confirmed: true,
      project_id: boardId,
    });
    const router = new RuntimeHostRouter((runtimeId) => new RegistryFallbackSessionAdapter(runtimeId, registry));
    const service = new SessionHandoffService(
      registry,
      router,
      new SessionDirectoryService(registry, router),
      new SessionContentService(registry, router),
    );
    await assert.rejects(
      () => service.prepare({
        source_session_id: source.session_id,
        project_id: boardId,
        project_name: "No Goal",
        target_runtime_id: "codex",
        actor_id: "user",
        goal_contract: contract,
      }),
      (error: unknown) => error instanceof MolisWorkSessionError && /当前 Goal/.test(error.message),
    );
  } finally {
    registry.close();
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("project Handoff web API keeps the editable draft, requires confirmation, and exposes the target Session", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "molis-work-session-handoff-web-"));
  const home = path.join(directory, ".molis-work");
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const project = await catalog.createProject({ display_name: "Handoff Web Project", actor_id: "user" });
  catalog.close();

  const goalId = "goal-handoff-web";
  const store = new LocalProjectDatabase(project.database_path);
  const coordinator = new GoalProjectApplication(store);
  coordinator.goals.commands.createGoal(
    project.board_id,
    {
      goal_id: goalId,
      title: "通过 Web 完成 Handoff",
      outcome: "目标 Session 收到已审阅的交接内容",
      why: "验证页面调用的完整接口链路",
      business_logic: "先生成草稿，编辑并确认后创建目标 Session。",
      in_scope: ["草稿", "确认", "目标 Session"],
      out_of_scope: ["跨 Runtime resume"],
      constraints: ["发送前必须确认"],
      required_inputs: ["当前 Goal"],
      promised_outputs: ["可读取的目标 Session"],
      definition_state: "accepted",
      decomposition_state: "closed_leaf",
      acceptance_criteria: [{
        criterion_id: "handoff-web-delivery",
        statement: "目标 Session 收到修改后的 package",
        decision_method: "test",
        pass_condition: "目标 Session 内容 API 返回用户保存的文本",
        required_evidence: ["test"],
      }],
    },
    { actor_id: "user", idempotency_key: "goal-handoff-web-create" },
  );
  store.close();

  const registry = await openWorkSessionRegistry({ homeDirectory: home });
  const source = registry.createSession({
    runtime_id: "codex",
    actor_id: "user",
    user_confirmed: true,
    project_id: project.project_id,
    current_goal_id: goalId,
    workspace_path: directory,
    title: "Web Handoff 来源",
  });
  registry.appendEvent({
    session_id: source.session_id,
    source: "goalboard",
    kind: "user_message",
    source_id: "handoff-web-source-message",
    content: "来源 Session 的最小上下文。",
  });
  registry.close();

  const server = createMolisWorkWebServer({ homeDirectory: home, controlToken: WEB_TOKEN });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const prefix = `/projects/${encodeURIComponent(project.project_id)}`;
    let requestNumber = 0;
    const mutation = (pathname: string, method: string, body: Record<string, unknown>) => fetch(`${origin}${pathname}`, {
      method,
      headers: {
        origin,
        "content-type": "application/json",
        "x-molis-work-control-token": WEB_TOKEN,
        "x-molis-work-idempotency-key": `session-handoff-web-${++requestNumber}`,
      },
      body: JSON.stringify(body),
    });

    const unauthorized = await fetch(
      `${origin}${prefix}/api/sessions/${encodeURIComponent(source.session_id)}/handoffs`,
      { method: "POST" },
    );
    assert.equal(unauthorized.status, 403);

    const preparedResponse = await mutation(
      `${prefix}/api/sessions/${encodeURIComponent(source.session_id)}/handoffs`,
      "POST",
      { target_runtime_id: "claude-code", target_workspace_path: directory },
    );
    assert.equal(preparedResponse.status, 201, await preparedResponse.clone().text());
    const prepared = await preparedResponse.json() as {
      handoff: { package_id: string; state: string; content: string };
      reused: boolean;
    };
    assert.equal(prepared.reused, false);
    assert.equal(prepared.handoff.state, "draft");
    assert.match(prepared.handoff.content, /通过 Web 完成 Handoff/);

    const editedContent = `${prepared.handoff.content}\n\n用户补充：先检查目标 Session 内容。`;
    const savedResponse = await mutation(
      `${prefix}/api/session-handoffs/${encodeURIComponent(prepared.handoff.package_id)}`,
      "PATCH",
      { target_runtime_id: "claude-code", target_workspace_path: directory, content: editedContent },
    );
    assert.equal(savedResponse.status, 200, await savedResponse.clone().text());

    const unconfirmed = await mutation(
      `${prefix}/api/session-handoffs/${encodeURIComponent(prepared.handoff.package_id)}/send`,
      "POST",
      {
        target_runtime_id: "claude-code",
        target_workspace_path: directory,
        content: editedContent,
        user_confirmed: false,
      },
    );
    assert.equal(unconfirmed.status, 400);

    const sentResponse = await mutation(
      `${prefix}/api/session-handoffs/${encodeURIComponent(prepared.handoff.package_id)}/send`,
      "POST",
      {
        target_runtime_id: "claude-code",
        target_workspace_path: directory,
        content: editedContent,
        user_confirmed: true,
      },
    );
    assert.equal(sentResponse.status, 201, await sentResponse.clone().text());
    const sent = await sentResponse.json() as {
      handoff: { state: string; delivery_mode: string; content: string };
      destination_session: { session_id: string; runtime_id: string };
    };
    assert.equal(sent.handoff.state, "sent");
    assert.equal(sent.handoff.delivery_mode, "molis_work_fallback");
    assert.equal(sent.handoff.content, editedContent);
    assert.equal(sent.destination_session.runtime_id, "claude-code");

    const targetContentResponse = await fetch(
      `${origin}${prefix}/api/sessions/${encodeURIComponent(sent.destination_session.session_id)}/content`,
    );
    assert.equal(targetContentResponse.status, 200, await targetContentResponse.clone().text());
    const targetContent = await targetContentResponse.json() as {
      content_mode: string;
      events: Array<{ content: string }>;
    };
    assert.equal(targetContent.content_mode, "fallback");
    assert.match(targetContent.events.map((event) => event.content).join("\n"), /用户补充：先检查目标 Session 内容/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});

test("event-work handoff package uses current facts and does not force Proposal or roles", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "molis-work-session-handoff-event-"));
  const home = path.join(directory, ".molis-work");
  const boardId = "project-handoff-event";
  const store = new LocalProjectDatabase(path.join(directory, "board.db"));
  const coordinator = new GoalProjectApplication(store);
  coordinator.initializeBoard({ board_id: boardId, title: "Event Handoff", actor_id: "owner", idempotency_key: `${boardId}-init` });
  const created = coordinator.goalEvents.createIntent({
    board_id: boardId, title: "事件交接目标", outcome: "按当前差距继续",
    actor_id: "owner", actor_kind: "user", idempotency_key: "event-handoff-intent",
  });
  const contract = sessionHandoffGoalContext(coordinator, boardId, created.goal.goal_id);
  const registry = await openWorkSessionRegistry({ homeDirectory: home });
  const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  const transport: RuntimeSessionTransport = {
    async request(method, params) {
      calls.push({ method, params });
      if (method === "thread/read") return { thread: { turns: [] } };
      if (method === "thread/start") return { thread: { id: "thread-event-destination" } };
      if (method === "turn/start") return { turn: { id: "turn-event-destination" } };
      throw new Error(`unexpected ${method}`);
    },
    subscribe() { return () => undefined; },
  };
  try {
    const source = registry.explicitlyLinkSession({
      runtime_id: "codex",
      native_runtime_session_id: "thread-event-source",
      actor_id: "user",
      user_confirmed: true,
      project_id: boardId,
      current_goal_id: created.goal.goal_id,
      workspace_path: directory,
      title: "事件来源 Session",
    });
    const router = new RuntimeHostRouter((runtimeId) => new RegistryFallbackSessionAdapter(runtimeId, registry));
    router.register(new CodexRuntimeSessionAdapter(transport));
    const service = new SessionHandoffService(
      registry,
      router,
      new SessionDirectoryService(registry, router),
      new SessionContentService(registry, router),
    );
    const prepared = await service.prepare({
      source_session_id: source.session_id,
      project_id: boardId,
      project_name: "Event Handoff",
      target_runtime_id: "codex",
      target_workspace_path: directory,
      actor_id: "user",
      goal_contract: contract,
    });
    const content = prepared.handoff.content ?? "";
    const current = handoffCurrentSection(content);
    assert.match(content, /当前事件工作/);
    assert.match(content, /不要领取角色或开始 Run/);
    assert.match(content, /按当前差距继续|当前约定/);
    assert.match(current, /## 当前要求/);
    assert.doesNotMatch(current, /## 验收标准/);
    assert.match(content, /## 历史记录（只读）/);
    assert.match(content, /## 历史验收标准/);
    assert.doesNotMatch(content, /resumeWork\(/);
    assert.doesNotMatch(content, /提交 Proposal/);
    assert.doesNotMatch(content, /先读取它的合同和当前项目规划组合/);
    const sent = await service.send({
      package_id: prepared.handoff.package_id,
      target_runtime_id: "codex",
      target_workspace_path: directory,
      content,
      actor_id: "user",
      user_confirmed: true,
    });
    assert.equal(sent.handoff.state, "sent");
    assert.equal((calls[2]?.params.input as Array<{ text: string }>)[0]?.text, content);
  } finally {
    registry.close();
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("current handoff acceptance uses live event requirements; original v35 criteria stay under history", async () => {
  const fixture = materializeGoalEventV35Fixture("legacy");
  const store = new LocalProjectDatabase(fixture.path);
  const app = new GoalProjectApplication(store);
  const boardId = DEMO_BOARD_ID;
  const goalId = "CORE";
  const registry = await openWorkSessionRegistry({ homeDirectory: fixture.directory });
  try {
    const historyBefore = app.goalQueries.readGoalContract(boardId, goalId);
    const originalCriteria = historyBefore.goal.acceptance_criteria;
    const criterion = originalCriteria[0];
    assert.ok(criterion, "original v35 CORE must keep at least one historical acceptance criterion");
    let state = app.goalEvents.readState(boardId, goalId);
    const requirement = state.requirements.find((item) => item.statement === criterion.statement);
    assert.ok(requirement, "the original historical acceptance criterion must be mapped to an actual current requirement");
    app.goalEvents.setAgreement({
      board_id: boardId,
      goal_id: goalId,
      actor_id: "handoff-history-user",
      actor_kind: "user",
      expected_config_version: state.config.version,
      expected_agreement_version: state.agreement.version,
      retire_requirement_ids: [requirement.requirement_id],
      idempotency_key: "handoff-history-retire",
    });
    state = app.goalEvents.readState(boardId, goalId);
    assert.equal(state.requirements.some((item) => item.requirement_id === requirement.requirement_id), false);
    const history = app.goalQueries.readGoalContract(boardId, goalId);
    assert.deepEqual(history.goal.acceptance_criteria, originalCriteria);
    const source = registry.explicitlyLinkSession({
      runtime_id: "handoff-history-fixture",
      native_runtime_session_id: "isolated-history-source",
      actor_id: "handoff-history-user",
      user_confirmed: true,
      project_id: boardId,
      current_goal_id: goalId,
      workspace_path: fixture.directory,
    });
    const content = buildSessionHandoffPackage({
      source_session: source,
      project_name: "原始历史接力验收",
      timeline: [],
      goal_contract: sessionHandoffGoalContext(app, boardId, goalId),
    });
    const current = handoffCurrentSection(content);
    const historical = handoffHistorySection(content);
    assert.equal(current.includes(criterion.statement), false);
    for (const item of originalCriteria) {
      assert.match(historical, new RegExp(item.statement.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(historical, new RegExp(item.pass_condition.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(historical, new RegExp(item.decision_method.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    assert.match(historical, /## 历史验收标准/);
    assert.doesNotMatch(content, /resumeWork\(/);
    for (const live of state.requirements) {
      assert.match(current, new RegExp(live.statement.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  } finally {
    registry.close();
    store.close();
    await rm(fixture.directory, { recursive: true, force: true });
  }
});

test("completed Goal handoff names the public resume tool and keeps historical Run/Evidence/Risk out of current protocol", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "molis-work-session-handoff-resume-"));
  const boardId = "project-handoff-resume";
  const goalId = "goal-handoff-resume";
  const { store, contract: openContract } = createContract(path.join(directory, "board.db"), boardId, goalId);
  const coordinator = new GoalProjectApplication(store);
  const registry = await openWorkSessionRegistry({ homeDirectory: path.join(directory, ".molis-work") });
  try {
    coordinator.goalEvents.configure({
      board_id: boardId,
      goal_id: goalId,
      actor_id: "owner",
      actor_kind: "user",
      expected_version: coordinator.goalEvents.readState(boardId, goalId).config.version,
      idempotency_key: `${goalId}-type`,
      types: [{
        type_id: "handoff-result",
        version: 1,
        name: "结果",
        purpose: "可核对的交付",
        semantic_family: "delivery",
        source: { kind: "runtime", label: "交接测试" },
        fields: [{ field_id: "result", name: "结果", purpose: "当前交付", format: "text", required: true }],
      }],
    });
    coordinator.goalEvents.report({
      board_id: boardId,
      goal_id: goalId,
      actor_id: "owner",
      actor_kind: "user",
      idempotency_key: `${goalId}-support`,
      events: [{
        type_id: "handoff-result",
        type_version: 1,
        title: "交接结果已可核对",
        fields: { result: "当前要求已满足" },
        judgments: [{ requirement_id: `${goalId}-criterion`, verdict: "supports" }],
      }],
    });
    const beforeClose = coordinator.goalEvents.readState(boardId, goalId);
    coordinator.goalEvents.submitClosure({
      board_id: boardId,
      goal_id: goalId,
      actor_id: "owner",
      actor_kind: "user",
      idempotency_key: `${goalId}-complete`,
      kind: "complete",
      result: "当前要求已满足",
      reason: "验证完成后续必须显式继续",
      expected_config_version: beforeClose.config.version,
      expected_agreement_version: beforeClose.agreement.version,
    });
    const source = registry.explicitlyLinkSession({
      runtime_id: "handoff-resume-fixture",
      native_runtime_session_id: "isolated-resume-source",
      actor_id: "user",
      user_confirmed: true,
      project_id: boardId,
      current_goal_id: goalId,
      workspace_path: directory,
    });
    const content = buildSessionHandoffPackage({
      source_session: source,
      project_name: "完成后续交接",
      timeline: [],
      goal_contract: sessionHandoffGoalContext(coordinator, boardId, goalId),
    });
    const current = handoffCurrentSection(content);
    const historical = handoffHistorySection(content);
    assert.match(current, /molis_work_v1_event_resume/);
    assert.match(current, /必须显式继续/);
    assert.doesNotMatch(content, /resumeWork\(/);
    assert.doesNotMatch(current, /## 当前 Run|有效 Evidence|待检查角色/);
    assert.match(historical, /## 历史 Run/);
    assert.match(historical, new RegExp(`${goalId}-run`));
    assert.match(historical, /## 历史 Evidence/);
    assert.match(historical, /artifact:\/\/handoff-history/);
    assert.match(historical, /## 历史 Risk/);
    assert.match(historical, /历史交接风险/);
    assert.equal(openContract.goal.goal_id, goalId);
  } finally {
    registry.close();
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});
