import { RegistryFallbackSessionAdapter } from "@molis-ai/molis-work-plugin-work";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { GoalProjectApplication } from "@molis-ai/molis-work-app-local-host";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { CodexRuntimeSessionAdapter, RuntimeHostRouter } from "@molis-ai/molis-work-service-runtime-host";
import { SessionContentService } from "@molis-ai/molis-work-plugin-work";
import { SessionDirectoryService } from "@molis-ai/molis-work-plugin-work";
import { SessionHandoffService } from "@molis-ai/molis-work-plugin-work";
import { MolisWorkSessionRegistry } from "@molis-ai/molis-work-module-private-work-context";
import type { RuntimeSessionTransport } from "@molis-ai/molis-work-contracts/services/runtime-host";
import { sessionHandoffGoalContext } from "./historical-sql-fixture.js";

function definitelyRejected(message: string): Error {
  return Object.assign(new Error(message), { deliveryAccepted: false, retryable: true });
}

function contractFixture(databasePath: string, boardId: string, goalId: string) {
  const store = new LocalProjectDatabase(databasePath);
  const coordinator = new GoalProjectApplication(store);
  coordinator.initializeBoard({
    board_id: boardId,
    title: "Recovery",
    actor_id: "owner",
    idempotency_key: `${boardId}-init`,
  });
  coordinator.goalEvents.createIntent({
    board_id: boardId,
    goal_id: goalId,
    title: "恢复 Handoff",
    outcome: "失败后不会重复创建目标 Session",
    why: "外部 Runtime 调用可能部分成功",
    business_logic: "保存 package 和 lineage 后只重试缺失阶段。",
    actor_id: "owner",
    actor_kind: "user",
    idempotency_key: `${goalId}-create`,
    requirements: [{
      requirement_id: `${goalId}-criterion`,
      statement: "重试复用目标 Session",
    }],
  });
  return { store, contract: sessionHandoffGoalContext(coordinator, boardId, goalId) };
}

function services(registry: MolisWorkSessionRegistry, transport: RuntimeSessionTransport) {
  const router = new RuntimeHostRouter((runtimeId) => new RegistryFallbackSessionAdapter(runtimeId, registry));
  router.register(new CodexRuntimeSessionAdapter(transport));
  const content = new SessionContentService(registry, router);
  return {
    content,
    handoff: new SessionHandoffService(
      registry,
      router,
      new SessionDirectoryService(registry, router),
      content,
    ),
  };
}

test("turn delivery failure keeps the real target and retry sends only to that thread after restart", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "molis-work-handoff-recovery-"));
  const home = path.join(directory, ".molis-work");
  const boardId = "project-handoff-recovery";
  const goalId = "goal-handoff-recovery";
  const { store, contract } = contractFixture(path.join(directory, "board.db"), boardId, goalId);
  let registry = await openWorkSessionRegistry({ homeDirectory: home });
  const calls: Array<{ method: string; threadId: string | null }> = [];
  let failTurn = true;
  const transport: RuntimeSessionTransport = {
    async request(method, params) {
      calls.push({ method, threadId: typeof params.threadId === "string" ? params.threadId : null });
      if (method === "thread/read") return { thread: { turns: [] } };
      if (method === "thread/start") return { thread: { id: "thread-recovery-target" } };
      if (method === "turn/start" && failTurn) throw definitelyRejected("injected turn failure");
      if (method === "turn/start") return { turn: { id: "turn-recovery-target" } };
      throw new Error(`unexpected ${method}`);
    },
    subscribe() { return () => undefined; },
  };
  try {
    const source = registry.explicitlyLinkSession({
      runtime_id: "codex",
      native_runtime_session_id: "thread-recovery-source",
      actor_id: "user",
      user_confirmed: true,
      project_id: boardId,
      current_goal_id: goalId,
      title: "Recovery source",
    });
    let runtime = services(registry, transport);
    const prepared = await runtime.handoff.prepare({
      source_session_id: source.session_id,
      project_id: boardId,
      project_name: "Recovery",
      target_runtime_id: "codex",
      actor_id: "user",
      goal_contract: contract,
    });
    const failed = await runtime.handoff.send({
      package_id: prepared.handoff.package_id,
      target_runtime_id: "codex",
      content: prepared.handoff.content ?? "",
      actor_id: "user",
      user_confirmed: true,
    });
    assert.equal(failed.handoff.state, "failed");
    assert.equal(failed.destination_session?.native_runtime_session_id, "thread-recovery-target");
    assert.equal(registry.list({ project_id: boardId }).length, 2);
    assert.deepEqual(calls.map((call) => call.method), ["thread/read", "thread/start", "turn/start"]);

    registry.close();
    registry = await openWorkSessionRegistry({ homeDirectory: home });
    runtime = services(registry, transport);
    failTurn = false;
    const retried = await runtime.handoff.send({
      package_id: prepared.handoff.package_id,
      target_runtime_id: "codex",
      content: `${failed.handoff.content}\n\n重试时补充说明。`,
      actor_id: "user",
      user_confirmed: true,
    });
    assert.equal(retried.handoff.state, "sent");
    assert.equal(retried.destination_session?.session_id, failed.destination_session?.session_id);
    assert.deepEqual(calls.map((call) => call.method), ["thread/read", "thread/start", "turn/start", "turn/start"]);
    assert.equal(calls.at(-1)?.threadId, "thread-recovery-target");
    assert.equal(registry.list({ project_id: boardId }).length, 2);
  } finally {
    registry.close();
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("thread creation failure keeps a retryable package without a false destination Session", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "molis-work-handoff-create-failure-"));
  const boardId = "project-handoff-create-failure";
  const goalId = "goal-handoff-create-failure";
  const { store, contract } = contractFixture(path.join(directory, "board.db"), boardId, goalId);
  const registry = await openWorkSessionRegistry({ homeDirectory: path.join(directory, ".molis-work") });
  const transport: RuntimeSessionTransport = {
    async request(method) {
      if (method === "thread/read") return { thread: { turns: [] } };
      if (method === "thread/start") throw definitelyRejected("injected create failure");
      throw new Error(`unexpected ${method}`);
    },
    subscribe() { return () => undefined; },
  };
  try {
    const source = registry.explicitlyLinkSession({
      runtime_id: "codex",
      native_runtime_session_id: "thread-create-failure-source",
      actor_id: "user",
      user_confirmed: true,
      project_id: boardId,
      current_goal_id: goalId,
    });
    const runtime = services(registry, transport);
    const prepared = await runtime.handoff.prepare({
      source_session_id: source.session_id,
      project_id: boardId,
      project_name: "Create failure",
      target_runtime_id: "codex",
      actor_id: "user",
      goal_contract: contract,
    });
    const failed = await runtime.handoff.send({
      package_id: prepared.handoff.package_id,
      target_runtime_id: "codex",
      content: prepared.handoff.content ?? "",
      actor_id: "user",
      user_confirmed: true,
    });
    assert.equal(failed.handoff.state, "failed");
    assert.equal(failed.handoff.retryable, true);
    assert.equal(failed.destination_session, null);
    assert.equal(registry.list({ project_id: boardId }).length, 1);
  } finally {
    registry.close();
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("an ambiguous thread creation result is not automatically replayed", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "molis-work-handoff-ambiguous-create-"));
  const boardId = "project-handoff-ambiguous-create";
  const goalId = "goal-handoff-ambiguous-create";
  const { store, contract } = contractFixture(path.join(directory, "board.db"), boardId, goalId);
  const registry = await openWorkSessionRegistry({ homeDirectory: path.join(directory, ".molis-work") });
  const calls: string[] = [];
  const transport: RuntimeSessionTransport = {
    async request(method) {
      calls.push(method);
      if (method === "thread/read") return { thread: { turns: [] } };
      if (method === "thread/start") throw new Error("response lost after create request");
      throw new Error(`unexpected ${method}`);
    },
    subscribe() { return () => undefined; },
  };
  try {
    const source = registry.explicitlyLinkSession({
      runtime_id: "codex",
      native_runtime_session_id: "thread-ambiguous-create-source",
      actor_id: "user",
      user_confirmed: true,
      project_id: boardId,
      current_goal_id: goalId,
    });
    const runtime = services(registry, transport);
    const prepared = await runtime.handoff.prepare({
      source_session_id: source.session_id,
      project_id: boardId,
      project_name: "Ambiguous create",
      target_runtime_id: "codex",
      actor_id: "user",
      goal_contract: contract,
    });
    const sendInput = {
      package_id: prepared.handoff.package_id,
      target_runtime_id: "codex",
      content: prepared.handoff.content ?? "",
      actor_id: "user",
      user_confirmed: true,
    };
    const failed = await runtime.handoff.send(sendInput);
    assert.equal(failed.handoff.state, "failed");
    assert.equal(failed.handoff.retryable, false);
    assert.match(failed.handoff.error_message ?? "", /创建结果不确定/);
    assert.equal(failed.destination_session, null);
    await assert.rejects(() => runtime.handoff.send(sendInput), /不能安全重试/);
    assert.deepEqual(calls, ["thread/read", "thread/start"]);
  } finally {
    registry.close();
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("a successful create response without a native Session ID is not automatically replayed", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "molis-work-handoff-missing-native-id-"));
  const boardId = "project-handoff-missing-native-id";
  const goalId = "goal-handoff-missing-native-id";
  const { store, contract } = contractFixture(path.join(directory, "board.db"), boardId, goalId);
  const registry = await openWorkSessionRegistry({ homeDirectory: path.join(directory, ".molis-work") });
  const calls: string[] = [];
  const transport: RuntimeSessionTransport = {
    async request(method) {
      calls.push(method);
      if (method === "thread/read") return { thread: { turns: [] } };
      if (method === "thread/start") return { thread: {} };
      throw new Error(`unexpected ${method}`);
    },
    subscribe() { return () => undefined; },
  };
  try {
    const source = registry.explicitlyLinkSession({
      runtime_id: "codex",
      native_runtime_session_id: "thread-missing-native-id-source",
      actor_id: "user",
      user_confirmed: true,
      project_id: boardId,
      current_goal_id: goalId,
    });
    const runtime = services(registry, transport);
    const prepared = await runtime.handoff.prepare({
      source_session_id: source.session_id,
      project_id: boardId,
      project_name: "Missing native Session ID",
      target_runtime_id: "codex",
      actor_id: "user",
      goal_contract: contract,
    });
    const sendInput = {
      package_id: prepared.handoff.package_id,
      target_runtime_id: "codex",
      content: prepared.handoff.content ?? "",
      actor_id: "user",
      user_confirmed: true,
    };
    const failed = await runtime.handoff.send(sendInput);
    assert.equal(failed.handoff.state, "failed");
    assert.equal(failed.handoff.retryable, false);
    assert.match(failed.handoff.error_message ?? "", /创建结果不确定/);
    assert.equal(failed.destination_session, null);
    await assert.rejects(() => runtime.handoff.send(sendInput), /不能安全重试/);
    assert.deepEqual(calls, ["thread/read", "thread/start"]);
  } finally {
    registry.close();
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("an ambiguous delivery result keeps the target but blocks automatic replay", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "molis-work-handoff-ambiguous-delivery-"));
  const boardId = "project-handoff-ambiguous-delivery";
  const goalId = "goal-handoff-ambiguous-delivery";
  const { store, contract } = contractFixture(path.join(directory, "board.db"), boardId, goalId);
  const registry = await openWorkSessionRegistry({ homeDirectory: path.join(directory, ".molis-work") });
  const calls: string[] = [];
  const transport: RuntimeSessionTransport = {
    async request(method) {
      calls.push(method);
      if (method === "thread/read") return { thread: { turns: [] } };
      if (method === "thread/start") return { thread: { id: "thread-ambiguous-delivery-target" } };
      if (method === "turn/start") throw new Error("response lost after request write");
      throw new Error(`unexpected ${method}`);
    },
    subscribe() { return () => undefined; },
  };
  try {
    const source = registry.explicitlyLinkSession({
      runtime_id: "codex",
      native_runtime_session_id: "thread-ambiguous-delivery-source",
      actor_id: "user",
      user_confirmed: true,
      project_id: boardId,
      current_goal_id: goalId,
    });
    const runtime = services(registry, transport);
    const prepared = await runtime.handoff.prepare({
      source_session_id: source.session_id,
      project_id: boardId,
      project_name: "Ambiguous delivery",
      target_runtime_id: "codex",
      actor_id: "user",
      goal_contract: contract,
    });
    const sendInput = {
      package_id: prepared.handoff.package_id,
      target_runtime_id: "codex",
      content: prepared.handoff.content ?? "",
      actor_id: "user",
      user_confirmed: true,
    };
    const failed = await runtime.handoff.send(sendInput);
    assert.equal(failed.handoff.state, "failed");
    assert.equal(failed.handoff.retryable, false);
    assert.match(failed.handoff.error_message ?? "", /是否送达无法确认/);
    assert.equal(failed.destination_session?.native_runtime_session_id, "thread-ambiguous-delivery-target");
    await assert.rejects(() => runtime.handoff.send(sendInput), /不能安全重试/);
    assert.deepEqual(calls, ["thread/read", "thread/start", "turn/start"]);
  } finally {
    registry.close();
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("a concurrent send cannot create a second target Session", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "molis-work-handoff-concurrent-"));
  const boardId = "project-handoff-concurrent";
  const goalId = "goal-handoff-concurrent";
  const { store, contract } = contractFixture(path.join(directory, "board.db"), boardId, goalId);
  const registry = await openWorkSessionRegistry({ homeDirectory: path.join(directory, ".molis-work") });
  let releaseThreadStart!: () => void;
  let reportThreadStart!: () => void;
  const threadStartReleased = new Promise<void>((resolve) => { releaseThreadStart = resolve; });
  const threadStartEntered = new Promise<void>((resolve) => { reportThreadStart = resolve; });
  const calls: string[] = [];
  const transport: RuntimeSessionTransport = {
    async request(method) {
      calls.push(method);
      if (method === "thread/read") return { thread: { turns: [] } };
      if (method === "thread/start") {
        reportThreadStart();
        await threadStartReleased;
        return { thread: { id: "thread-concurrent-target" } };
      }
      if (method === "turn/start") return { turn: { id: "turn-concurrent-target" } };
      throw new Error(`unexpected ${method}`);
    },
    subscribe() { return () => undefined; },
  };
  let first: ReturnType<SessionHandoffService["send"]> | null = null;
  try {
    const source = registry.explicitlyLinkSession({
      runtime_id: "codex",
      native_runtime_session_id: "thread-concurrent-source",
      actor_id: "user",
      user_confirmed: true,
      project_id: boardId,
      current_goal_id: goalId,
    });
    const runtime = services(registry, transport);
    const prepared = await runtime.handoff.prepare({
      source_session_id: source.session_id,
      project_id: boardId,
      project_name: "Concurrent",
      target_runtime_id: "codex",
      actor_id: "user",
      goal_contract: contract,
    });
    const sendInput = {
      package_id: prepared.handoff.package_id,
      target_runtime_id: "codex",
      content: prepared.handoff.content ?? "",
      actor_id: "user",
      user_confirmed: true,
    };
    first = runtime.handoff.send(sendInput);
    await threadStartEntered;
    await assert.rejects(
      () => runtime.handoff.send(sendInput),
      /只有草稿或失败|另一个请求中发送|状态已经变化/,
    );
    releaseThreadStart();
    const sent = await first;
    assert.equal(sent.handoff.state, "sent");
    assert.deepEqual(calls, ["thread/read", "thread/start", "turn/start"]);
    assert.equal(registry.list({ project_id: boardId }).length, 2);
  } finally {
    releaseThreadStart?.();
    await first?.catch(() => undefined);
    registry.close();
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("a Runtime cannot reuse the source native ID as the Handoff target", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "molis-work-handoff-source-reuse-"));
  const boardId = "project-handoff-source-reuse";
  const goalId = "goal-handoff-source-reuse";
  const { store, contract } = contractFixture(path.join(directory, "board.db"), boardId, goalId);
  const registry = await openWorkSessionRegistry({ homeDirectory: path.join(directory, ".molis-work") });
  const transport: RuntimeSessionTransport = {
    async request(method) {
      if (method === "thread/read") return { thread: { turns: [] } };
      if (method === "thread/start") return { thread: { id: "thread-source-reused" } };
      throw new Error(`unexpected ${method}`);
    },
    subscribe() { return () => undefined; },
  };
  try {
    const source = registry.explicitlyLinkSession({
      runtime_id: "codex",
      native_runtime_session_id: "thread-source-reused",
      actor_id: "user",
      user_confirmed: true,
      project_id: boardId,
      current_goal_id: goalId,
    });
    const runtime = services(registry, transport);
    const prepared = await runtime.handoff.prepare({
      source_session_id: source.session_id,
      project_id: boardId,
      project_name: "Source reuse",
      target_runtime_id: "codex",
      actor_id: "user",
      goal_contract: contract,
    });
    const failed = await runtime.handoff.send({
      package_id: prepared.handoff.package_id,
      target_runtime_id: "codex",
      content: prepared.handoff.content ?? "",
      actor_id: "user",
      user_confirmed: true,
    });
    assert.equal(failed.handoff.state, "failed");
    assert.equal(failed.handoff.retryable, false);
    assert.match(failed.handoff.error_message ?? "", /不是一条新的 Session/);
    assert.equal(failed.destination_session, null);
    assert.deepEqual(registry.list({ project_id: boardId }).map((session) => session.session_id), [source.session_id]);
    await assert.rejects(
      () => runtime.handoff.send({
        package_id: prepared.handoff.package_id,
        target_runtime_id: "codex",
        content: prepared.handoff.content ?? "",
        actor_id: "user",
        user_confirmed: true,
      }),
      /不能安全重试/,
    );
  } finally {
    registry.close();
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("an interrupted sending state keeps its known target and becomes retryable when the Registry reopens", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "molis-work-handoff-interrupted-"));
  const home = path.join(directory, ".molis-work");
  let nowMs = Date.parse("2026-08-31T00:00:00.000Z");
  const now = () => new Date(nowMs);
  let registry = await openWorkSessionRegistry({ homeDirectory: home, now });
  const source = registry.createSession({
    runtime_id: "unknown",
    actor_id: "user",
    user_confirmed: true,
    project_id: "project-interrupted",
    current_goal_id: "goal-interrupted",
  });
  const draft = registry.createHandoffDraft({
    source_session_id: source.session_id,
    source_project_id: "project-interrupted",
    source_goal_id: "goal-interrupted",
    target_runtime_id: "codex",
    target_project_id: "project-interrupted",
    content: "package",
    actor_id: "user",
  });
  registry.markHandoffSending(draft.package_id);
  const destination = registry.createSession({
    runtime_id: "codex",
    native_runtime_session_id: "thread-interrupted-target",
    actor_id: "user",
    user_confirmed: true,
    project_id: "project-interrupted",
    current_goal_id: "goal-interrupted",
  });
  registry.attachHandoffDestination({
    package_id: draft.package_id,
    destination_session_id: destination.session_id,
    delivery_mode: "native",
  });
  const observer = await openWorkSessionRegistry({ homeDirectory: home, now });
  assert.equal(observer.getHandoff(draft.package_id).state, "sending");
  assert.equal(observer.latestPendingHandoff(source.session_id)?.state, "sending");
  observer.close();
  registry.close();
  nowMs += 6 * 60 * 1000;
  registry = await openWorkSessionRegistry({ homeDirectory: home, now });
  try {
    const recovered = registry.getHandoff(draft.package_id);
    assert.equal(recovered.state, "failed");
    assert.equal(recovered.error_code, "handoff.interrupted");
    assert.equal(recovered.retryable, true);
    assert.equal(recovered.destination_session_id, destination.session_id);
    assert.equal(recovered.delivery_mode, "native");
    assert.equal(registry.latestPendingHandoff(source.session_id)?.state, "failed");
  } finally {
    registry.close();
    await rm(directory, { recursive: true, force: true });
  }
});
import { openWorkSessionRegistry } from "@molis-ai/molis-work-app-local-host";
