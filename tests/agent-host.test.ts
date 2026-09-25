import assert from "node:assert/strict";
import test from "node:test";
import type { AgentManifest } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import type {
  AgentRunHandle,
  AgentRunView,
  AgentRuntimeAdapter,
  AgentRuntimeCapability,
  AgentSessionView,
  AgentStartRequest,
  AgentReviewRequest,
} from "@molis-ai/molis-work-contracts/services/agent-host";
import { isTerminalAgentPhase } from "@molis-ai/molis-work-contracts/services/agent-host";
import {
  AgentHost,
  AgentHostError,
  AgentReviewError,
  AgentReviewQueue,
  CliAgentAdapter,
  CliAgentError,
  emptyCapabilityMatrix,
  type CliProcessEvent,
  type CliProcessPort,
} from "@molis-ai/molis-work-service-agent-host";

const BOARD = "board-agent";
const PLUGIN = "io.molis.work.coding";
const DIRECTORY = "/Users/tester/code/project";

const manifest: AgentManifest = {
  directory_input_port: "project",
  roles: [
    { role_id: "reader", version: 1, name: "Reader" },
    { role_id: "builder", version: 2, name: "Builder", execution: "workspace-write" },
  ],
  prompts: [
    { prompt_id: "reader", version: 1 },
    { prompt_id: "builder", version: 2 },
  ],
};

function adapterFor(input: {
  runtimeId: string;
  supported?: AgentRuntimeCapability[];
  /** Deliberately report a wider authority than the Manifest froze. */
  liesAbout?: { role_id?: string; execution?: "read-only" | "workspace-write" };
  onCancel?: () => void;
}): AgentRuntimeAdapter {
  const capabilities = emptyCapabilityMatrix();
  for (const capability of input.supported ?? []) capabilities[capability] = "supported";
  return {
    descriptor: {
      runtime_id: input.runtimeId,
      display_name: input.runtimeId,
      provider_version: "1.0.0",
      capabilities,
    },
    async health() {
      return { ok: true, status: "ready", message: "就绪" };
    },
    async createSession() {
      return { session_id: "session-1", runtime_id: input.runtimeId };
    },
    async readSession(): Promise<AgentSessionView> {
      return {
        session: { session_id: "session-1", runtime_id: input.runtimeId },
        owner: { board_id: BOARD, plugin_id: PLUGIN, install_id: "install-1" },
        title: "任务",
        runs: [],
        latest_run: null,
      };
    },
    async start(request: AgentStartRequest): Promise<AgentRunHandle> {
      const role = manifest.roles.find((item) => item.role_id === request.role_id)!;
      return {
        ref: { run_id: "run-1", session_id: request.session.session_id },
        frozen: {
          role_id: input.liesAbout?.role_id ?? role.role_id,
          role_version: role.version,
          execution: input.liesAbout?.execution ?? role.execution ?? "read-only",
          model_id: "model-x",
          prompts: [],
          skills: [],
          mcp_tools: [],
          host_tools: [],
          text_materials: [],
          budget: null,
          directory: request.directory,
        },
      };
    },
    async read(): Promise<AgentRunView> {
      throw new Error("未使用");
    },
    observe() {
      return () => {};
    },
    async control() {
      input.onCancel?.();
    },
    async readCommandOutput(_session, ref) {
      // Mirrors both real adapters: a Runtime whose command execution is not
      // wired to the approval queue reports unavailable, never an empty
      // transcript that would read as "the command produced nothing".
      if (capabilities.command !== "supported") {
        throw Object.assign(new Error("这个 Runtime 尚未接通命令审批"), {
          code: "agent.capability_unavailable",
        });
      }
      return { ref, command: "node --version", exit_code: 0, stdout: "v24.14.0\n", stderr: "", truncated: false };
    },
  };
}

function startRequest(roleId: string): AgentStartRequest {
  return {
    session: { session_id: "session-1", runtime_id: "prologue" },
    board_id: BOARD,
    plugin_id: PLUGIN,
    install_id: "install-1",
    actor_id: "tester",
    task: "修一个 bug",
    role_id: roleId,
    directory: { canonical_path: DIRECTORY, realpath_verified: true },
  };
}

const authority = { manifest, authorizedDirectories: [DIRECTORY] };

function prologueRig() {
  const stops: string[] = [];
  const steers: string[] = [];
  let listener: ((event: unknown) => void) | null = null;
  let state = "running";
  let closed = false;
  let started: { mode: string; character: { instructions: string } } | undefined;
  const controlListeners = new Set<() => void>();
  const control = {
    get state() {
      return state as never;
    },
    stop(reason: "stopped" | "cancelled") {
      stops.push(reason);
      state = reason;
    },
    pause() {
      state = "pausing";
    },
    resume() {
      state = "running";
    },
    steer(input: { text: string }) {
      steers.push(input.text);
    },
    subscribe(fn: () => void) {
      controlListeners.add(fn);
      fn();
      return () => controlListeners.delete(fn);
    },
  };
  return {
    stops,
    steers,
    closed: () => closed,
    get started() {
      return started;
    },
    settle(next: string) {
      state = next;
      for (const notify of controlListeners) notify();
    },
    emit(event: unknown) {
      listener?.(event);
    },
    runtime: {
      sessions: {
        create: async () => ({ ref: { id: "prologue-session-1" } }),
      },
      async startAgentRun(input: never) {
        started = input as unknown as { mode: string; character: { instructions: string } };
        return {
          run: {
            ref: { id: "prologue-run-1" },
            subscribe: (fn: (event: never) => void) => {
              listener = fn as (event: unknown) => void;
              return () => { listener = null; };
            },
            cancel: async () => {},
          },
          control,
        };
      },
      async shutdown() {
        closed = true;
        return {};
      },
    } as never,
  };
}

test("a Runtime reports what it really supports, and roles it cannot carry say so", () => {
  const host = new AgentHost();
  host.register(adapterFor({ runtimeId: "prologue", supported: ["text-edit", "command"] }));
  host.register(adapterFor({ runtimeId: "cli-readonly" }));

  assert.deepEqual(host.descriptors().map((entry) => entry.runtime_id), ["cli-readonly", "prologue"]);
  assert.deepEqual(host.availableRoles("prologue", manifest), [
    { role_id: "reader", available: true },
    { role_id: "builder", available: true },
  ]);
  const degraded = host.availableRoles("cli-readonly", manifest);
  assert.deepEqual(degraded[0], { role_id: "reader", available: true });
  assert.equal(degraded[1]?.available, false);
  assert.match(degraded[1]?.reason ?? "", /不支持 text-edit、command/u);
});

test("a role the Plugin never declared cannot start", async () => {
  const host = new AgentHost();
  host.register(adapterFor({ runtimeId: "prologue", supported: ["text-edit", "command"] }));
  await assert.rejects(
    () => host.start("prologue", startRequest("smuggled"), authority),
    (error: unknown) => error instanceof AgentHostError && error.code === "agent.role_not_declared",
  );
});

test("a writing role is refused on a Runtime that cannot write", async () => {
  const host = new AgentHost();
  host.register(adapterFor({ runtimeId: "cli-readonly" }));
  await assert.rejects(
    () => host.start("cli-readonly", startRequest("builder"), authority),
    (error: unknown) => error instanceof AgentHostError
      && error.code === "agent.capability_unavailable",
  );
  // The read-only role on the same Runtime still works.
  const handle = await host.start("cli-readonly", startRequest("reader"), authority);
  assert.equal(handle.frozen.execution, "read-only");
});

test("an unverified or unauthorized directory never reaches the Runtime", async () => {
  const host = new AgentHost();
  host.register(adapterFor({ runtimeId: "prologue", supported: ["text-edit", "command"] }));

  await assert.rejects(
    () => host.start("prologue", {
      ...startRequest("reader"),
      directory: { canonical_path: "/somewhere/else", realpath_verified: true },
    }, authority),
    (error: unknown) => error instanceof AgentHostError
      && error.code === "agent.directory_unauthorized",
  );
  await assert.rejects(
    () => host.start("prologue", {
      ...startRequest("reader"),
      directory: { canonical_path: DIRECTORY, realpath_verified: false },
    }, authority),
    (error: unknown) => error instanceof AgentHostError
      && error.code === "agent.directory_unauthorized",
  );
});

test("a Runtime that returns wider authority than the Manifest froze has its run cancelled", async () => {
  let cancelled = false;
  const host = new AgentHost();
  host.register(adapterFor({
    runtimeId: "prologue",
    supported: ["text-edit", "command"],
    liesAbout: { execution: "workspace-write" },
    onCancel: () => {
      cancelled = true;
    },
  }));

  await assert.rejects(
    () => host.start("prologue", startRequest("reader"), authority),
    (error: unknown) => error instanceof AgentHostError
      && error.code === "agent.role_execution_exceeded",
  );
  assert.equal(cancelled, true, "越权的 Run 必须被取消，不能放着继续跑");
});

function reviewRequest(reviewId: string, expiresAt: string | null = null): AgentReviewRequest {
  return {
    review_id: reviewId,
    run: { run_id: "run-1", session_id: "session-1" },
    board_id: BOARD,
    plugin_id: PLUGIN,
    kind: "text-edit",
    document: {
      kind: "text-edit",
      target_path: "src/a.ts",
      exists: true,
      before_text: "old",
      after_text: "new",
    },
    requested_at: "2026-09-19T00:00:00.000Z",
    expires_at: expiresAt,
  };
}

test("an effect runs only after a recorded approval, and that approval is single use", () => {
  const queue = new AgentReviewQueue();
  const seen: string[] = [];
  queue.observe((request) => seen.push(request.review_id));
  queue.request(reviewRequest("review-1"));
  assert.deepEqual(seen, ["review-1"]);

  assert.throws(
    () => queue.consumeApproval("review-1"),
    (error: unknown) => error instanceof AgentReviewError
      && error.code === "agent.review_not_approved",
    "未批准就执行必须被拒绝",
  );

  const receipt = queue.decide({ review_id: "review-1", decision: "approve", actor_id: "tester" });
  assert.equal(receipt.status, "approved");
  assert.equal(receipt.decided_by, "tester");
  assert.equal(receipt.effect_settled, false, "批准不等于已经发生");

  assert.equal(queue.consumeApproval("review-1").review_id, "review-1");
  assert.throws(
    () => queue.consumeApproval("review-1"),
    (error: unknown) => error instanceof AgentReviewError
      && error.code === "agent.review_not_approved",
    "同一份批准不能授权第二次写入",
  );

  const settled = queue.settle("review-1", { ok: true });
  assert.equal(settled.effect_settled, true);
});

test("a rejected review can never be turned into permission", () => {
  const queue = new AgentReviewQueue();
  queue.request(reviewRequest("review-2"));
  queue.decide({ review_id: "review-2", decision: "reject", actor_id: "tester", note: "先别改" });

  assert.throws(
    () => queue.consumeApproval("review-2"),
    (error: unknown) => error instanceof AgentReviewError
      && error.code === "agent.review_not_approved",
  );
  assert.throws(
    () => queue.decide({ review_id: "review-2", decision: "approve", actor_id: "tester" }),
    (error: unknown) => error instanceof AgentReviewError
      && error.code === "agent.review_already_decided",
    "拒绝之后不能换个入口再批一次",
  );
  assert.equal(queue.receipt("review-2")?.note, "先别改");
});

test("an expired review is refused rather than silently approved", () => {
  let now = Date.parse("2026-09-19T00:00:00.000Z");
  const queue = new AgentReviewQueue({ now: () => new Date(now) });
  queue.request(reviewRequest("review-3", "2026-09-19T00:01:00.000Z"));
  assert.deepEqual(queue.list(BOARD, "pending").map((item) => item.review_id), ["review-3"]);

  now = Date.parse("2026-09-19T00:02:00.000Z");
  assert.equal(queue.receipt("review-3")?.status, "expired");
  assert.deepEqual(queue.list(BOARD, "pending"), []);
  assert.throws(
    () => queue.decide({ review_id: "review-3", decision: "approve", actor_id: "tester" }),
    (error: unknown) => error instanceof AgentReviewError && error.code === "agent.review_expired",
  );
});

test("stopping a run withdraws everything still pending for it", () => {
  const queue = new AgentReviewQueue();
  queue.request(reviewRequest("review-4"));
  queue.request(reviewRequest("review-5"));
  queue.decide({ review_id: "review-5", decision: "approve", actor_id: "tester" });

  assert.equal(queue.cancelPending("run-1"), 1, "只撤回仍在等待的那条");
  assert.equal(queue.receipt("review-4")?.status, "cancelled");
  assert.equal(queue.receipt("review-5")?.status, "approved");
});

test("reconcile-required is not a terminal phase", () => {
  assert.equal(isTerminalAgentPhase("completed"), true);
  assert.equal(isTerminalAgentPhase("stopped"), true);
  assert.equal(isTerminalAgentPhase("reconcile-required"), false);
  assert.equal(isTerminalAgentPhase("awaiting-review"), false);
});

test("the Prologue adapter runs a read-only role and refuses a writing one", async () => {
  const { PrologueAgentAdapter, PrologueAdapterError } =
    await import("@molis-ai/molis-work-service-agent-host");

  const rig = prologueRig();
  const adapter = new PrologueAgentAdapter({
    runtime: rig.runtime,
    modelConfiguration: async () => ({
      protocol: "anthropic",
      endpoint: "https://api.anthropic.com",
      model: "claude-opus-5",
      credential_ref: "credential-1",
    }),
    now: () => new Date("2026-09-19T00:00:00.000Z"),
  });

  // Reading and running are wired; writing is not, and the matrix says so.
  assert.equal(adapter.descriptor.capabilities["run.start"], "supported");
  assert.equal(adapter.descriptor.capabilities["run.control"], "supported");
  assert.equal(adapter.descriptor.capabilities["text-edit"], "unsupported");
  assert.equal(adapter.descriptor.capabilities.command, "unsupported");

  const session = await adapter.createSession({
    board_id: BOARD,
    plugin_id: PLUGIN,
    install_id: "install-1",
    actor_id: "tester",
    directory: { canonical_path: DIRECTORY, realpath_verified: true },
    title: "修一个 bug",
  });
  const handle = await adapter.start({
    ...startRequest("reader"),
    session,
    role: {
      role_id: "reader",
      version: 1,
      execution: "read-only",
      prompts: [{ prompt_id: "reader", version: 1, body: "你只读代码。" }],
      host_tools: ["read"],
    },
  });

  // The Host decides the mode from the frozen role, not the model.
  assert.equal(rig.started?.mode, "plan");
  assert.equal(rig.started?.character.instructions, "你只读代码。");
  assert.equal(handle.frozen.execution, "read-only");
  assert.equal(handle.frozen.model_id, "claude-opus-5");

  rig.emit({ type: "prompt", role: "user", text: startRequest("reader").task });
  assert.equal((await adapter.read(handle.ref)).turns.filter((turn) => turn.kind === "user").length, 1);
  rig.emit({ type: "text-delta", text: "看过了。" });
  const streaming = await adapter.read(handle.ref);
  assert.equal(streaming.turns.at(-1)?.text, "看过了。", "输出不等待模型结束才可见");
  rig.settle("paused");
  assert.equal((await adapter.read(handle.ref)).phase, "paused", "无内容事件时控制状态也要刷新");
  rig.settle("running");
  rig.settle("completed");
  assert.equal((await adapter.read(handle.ref)).phase, "running", "控制先完成，但会话账尚未提交，不能开始下一轮");
  assert.equal((await adapter.read(handle.ref)).ended_at, null);
  rig.emit({ type: "completed" });
  rig.settle("completed");
  const view = await adapter.read(handle.ref);
  assert.equal(view.phase, "completed");
  assert.equal(view.turns.at(-1)?.text, "看过了。");
  assert.equal(view.turns.at(-1)?.turn_id, streaming.turns.at(-1)?.turn_id);
  assert.equal(view.turns.filter((turn) => turn.kind === "assistant").length, 1);

  await assert.rejects(
    () => adapter.start({
      ...startRequest("builder"),
      session,
      role: {
        role_id: "builder",
        version: 2,
        execution: "workspace-write",
        prompts: [{ prompt_id: "builder", version: 2, body: "你可以改。" }],
        host_tools: [],
      },
    }),
    (error: unknown) => error instanceof PrologueAdapterError
      && error.code === "agent.capability_unavailable",
    "审批桥未接通前，会写入的角色必须被拒绝",
  );

  await adapter.close();
  assert.equal(rig.closed(), true);
});

test("the control surface owns the run state, not the event stream", async () => {
  const { PrologueAgentAdapter } = await import("@molis-ai/molis-work-service-agent-host");
  const rig = prologueRig();
  const adapter = new PrologueAgentAdapter({
    runtime: rig.runtime,
    modelConfiguration: async () => ({
      protocol: "anthropic",
      endpoint: "https://api.anthropic.com",
      model: "claude-opus-5",
      credential_ref: "credential-1",
    }),
  });
  const session = await adapter.createSession({
    board_id: BOARD,
    plugin_id: PLUGIN,
    install_id: "install-1",
    actor_id: "tester",
    directory: { canonical_path: DIRECTORY, realpath_verified: true },
    title: "任务",
  });
  const handle = await adapter.start({
    ...startRequest("reader"),
    session,
    role: {
      role_id: "reader",
      version: 1,
      execution: "read-only",
      prompts: [],
      host_tools: [],
    },
  });

  await adapter.control(handle.ref, { kind: "stop" });
  assert.deepEqual(rig.stops, ["stopped"]);
  assert.equal((await adapter.read(handle.ref)).phase, "running", "停止请求不能冒充已落账的终态");
  assert.equal((await adapter.read(handle.ref)).ended_at, null);
  assert.match((await adapter.read(handle.ref)).stop_reason ?? "", /正在收尾/);

  // A late `completed` on the stream must not turn a stopped run into a success.
  rig.emit({ type: "completed" });
  assert.equal((await adapter.read(handle.ref)).phase, "stopped");

  await adapter.control(handle.ref, { kind: "steer", text: "再看一处" });
  assert.deepEqual(rig.steers, ["再看一处"]);
});

test("an unconfigured model is reported as needing setup, not as a failure", async () => {
  const { PrologueAgentAdapter } = await import("@molis-ai/molis-work-service-agent-host");
  const adapter = new PrologueAgentAdapter({
    runtime: { sessions: { create: async () => ({ ref: { id: "s" } }) }, shutdown: async () => ({}) },
    modelConfiguration: async () => null,
  });
  const health = await adapter.health();
  assert.equal(health.ok, false);
  assert.equal(health.status, "needs_setup");
  assert.ok(health.action, "需要配置时必须给出一条具体的下一步");
});

test("the Host offers read-only roles and refuses unsupported writing roles", async () => {
  const { AgentHost: Host, PrologueAgentAdapter } =
    await import("@molis-ai/molis-work-service-agent-host");
  const host = new Host();
  host.register(new PrologueAgentAdapter({
    runtime: { sessions: { create: async () => ({ ref: { id: "s" } }) }, shutdown: async () => ({}) },
    modelConfiguration: async () => null,
  }));
  // Reader needs nothing beyond reading, so it stays available; Builder does not.
  const roles = host.availableRoles("prologue", manifest);
  assert.deepEqual(roles[0], { role_id: "reader", available: true });
  assert.equal(roles[1]?.available, false);
});

test("Plugins reach the Agent Host only through registered Capabilities", async () => {
  const { CapabilityRegistry } = await import("@molis-ai/molis-work-kernel");
  const { registerAgentHostCapabilities } = await import("@molis-ai/molis-work-service-agent-host");
  const { agentHostCapabilities } = await import("@molis-ai/molis-work-contracts/services/agent-host");

  const host = new AgentHost();
  host.register(adapterFor({ runtimeId: "prologue", supported: ["text-edit", "command"] }));
  host.register(adapterFor({ runtimeId: "cli-readonly" }));

  interface Context { board_id: string }
  const registry = new CapabilityRegistry<Context>();
  const dispose = registerAgentHostCapabilities<Context>(registry, {
    agentHost: () => host,
    authority: () => ({ manifest, authorizedDirectories: [DIRECTORY] }),
    boardId: (context) => context.board_id,
  });
  const context: Context = { board_id: BOARD };

  assert.deepEqual(
    (await registry.invoke(context, agentHostCapabilities.listRuntimes, []))
      .map((entry) => entry.runtime_id),
    ["cli-readonly", "prologue"],
  );
  assert.deepEqual(
    await registry.invoke(context, agentHostCapabilities.availableRoles, ["cli-readonly", PLUGIN]),
    [
      { role_id: "reader", available: true },
      { role_id: "builder", available: false, reason: "cli-readonly 不支持 text-edit、command" },
    ],
  );

  const ownedSession = {session_id:"session-1",runtime_id:"prologue"};
  const otherContext = {board_id:"another-board"};
  for(const operation of [
    () => registry.invoke(otherContext, agentHostCapabilities.readSession, [ownedSession]),
    () => registry.invoke(otherContext, agentHostCapabilities.startRun, ["prologue",startRequest("reader")]),
    () => registry.invoke(otherContext, agentHostCapabilities.readRun, [ownedSession,{run_id:"run-1",session_id:"session-1"}]),
    () => registry.invoke(otherContext, agentHostCapabilities.controlRun, [ownedSession,{run_id:"run-1",session_id:"session-1"},{kind:"stop"}]),
    () => registry.invoke(otherContext, agentHostCapabilities.readCommandOutput, [ownedSession,{call_id:"c1"}]),
  ]) await assert.rejects(operation, (error: unknown) => (error as {code?:string}).code === "agent.session_unknown");
  await assert.rejects(() => registry.invoke(context, agentHostCapabilities.controlRun, [ownedSession,{run_id:"other-run",session_id:"other-session"},{kind:"stop"}]),
    (error:unknown) => (error as {code?:string}).code === "agent.run_unknown");

  // Starting through the Capability still goes through the Host's own authority.
  const handle = await registry.invoke(context, agentHostCapabilities.startRun, [
    "prologue",
    startRequest("reader"),
  ]);
  assert.equal(handle.frozen.execution, "read-only");

  await assert.rejects(
    () => registry.invoke(context, agentHostCapabilities.startRun, [
      "cli-readonly",
      { ...startRequest("builder"), session: { session_id: "session-1", runtime_id: "cli-readonly" } },
    ]),
    (error: unknown) => error instanceof AgentHostError
      && error.code === "agent.capability_unavailable",
    "经 Capability 调用不能绕过启动授权",
  );

  // A command receipt is readable, but only as a receipt: a Runtime that has
  // not wired command execution to the approval queue answers unavailable
  // rather than an empty transcript, which would read as "the command produced
  // nothing".
  await assert.rejects(
    () => registry.invoke(context, agentHostCapabilities.readCommandOutput, [
      { session_id: "s-1", runtime_id: "cli-readonly" },
      { call_id: "c-1" },
    ]),
    (error: unknown) => error instanceof Error
      && (error as { code?: string }).code === "agent.capability_unavailable",
    "命令未接审批时，回执读取必须报不可用而不是空结果",
  );

  // Reading a receipt is the only command-shaped Capability: there is no way to
  // run one through this surface.
  assert.deepEqual(
    Object.values(agentHostCapabilities)
      .map((entry) => entry.capability_id)
      .filter((id) => id.includes("command")),
    ["agent.command-output.v1"],
  );

  // Deciding an approval is deliberately not a Capability.
  assert.equal(
    Object.values(agentHostCapabilities)
      .some((capability) => capability.capability_id.includes("decide")),
    false,
    "批准是用户动作，不能开成插件可调的能力",
  );

  dispose();
  await assert.rejects(
    () => registry.invoke(context, agentHostCapabilities.listRuntimes, []),
    (error: unknown) => (error as { code?: string }).code === "kernel.capability_missing",
    "注销之后不应还能调用",
  );
});


test("review replay preserves consumed approval and refuses changed content under the same id", () => {
  const queue = new AgentReviewQueue();
  const request = reviewRequest("stable-review");
  queue.request(request);
  queue.decide({ review_id: request.review_id, decision: "approve", actor_id: "user" });
  queue.consumeApproval(request.review_id);
  queue.settle(request.review_id, { ok: true });
  queue.request(structuredClone(request));
  assert.equal(queue.receipt(request.review_id)?.effect_settled, true);
  assert.throws(() => queue.settle(request.review_id, { ok: false, error: "late wrong result" }), /不能用另一结果覆盖/);
  assert.throws(() => queue.consumeApproval(request.review_id), /没有可用的批准/);
  const changed = structuredClone(request);
  changed.board_id = "another-board";
  assert.throws(() => queue.request(changed), /不能替换/);
  assert.equal(queue.get(request.review_id)?.board_id, request.board_id);
});


test("selected methods freeze only declared exact bodies and reject stale, duplicate, wider or ignored selections", async () => {
  const host = new AgentHost();
  const definition = { skill_id: "read-method", version: 1, name: "Read", summary: "Read evidence", tools: ["read-file"], body: "Use actual source evidence." };
  const granted = { ...authority, manifest: { ...manifest, roles: [{role_id: "reader", version: 1, name: "Reader", host_tools: ["read-file"]}], skills: [definition] }, skills: [definition] };
  let received: AgentStartRequest | undefined;
  let starts = 0;
  const adapter = adapterFor({ runtimeId: "prologue", supported: ["skills"] });
  const start = adapter.start.bind(adapter);
  adapter.start = async request => { starts++; received = request; const handle = await start(request);
    handle.frozen.skills = (request.role?.skills ?? []).map(({body: _body, ...declaration})=>declaration);return handle; };
  host.register(adapter);
  const request = {...startRequest("reader"), skills: [{skill_id: definition.skill_id, version: 1}], role: {role_id: "reader", version: 1, execution: "read-only" as const, host_tools: [], prompts: [], skills: [{...definition, body: "malicious replacement"}]} };
  const run = await host.start("prologue", request, granted);
  assert.equal(received?.role?.skills?.[0]?.body, definition.body);
  assert.equal(run.frozen.skills[0]?.version, 1);
  definition.body = "changed after start";
  assert.equal(received?.role?.skills?.[0]?.body, "Use actual source evidence.");
  await assert.rejects(host.start("prologue", {...request,skills:[{skill_id:"read-method",version:2}]},granted),/方法版本不可用/);
  await assert.rejects(host.start("prologue", {...request,skills:[...request.skills,...request.skills]},granted),/重复/);
  const wider = {...definition,tools:["run-command"]};
  await assert.rejects(host.start("prologue",request,{...granted,manifest:{...granted.manifest,skills:[wider]},skills:[wider]}),/未开放的工具/);
  assert.equal(starts,1,"invalid methods never reach a runtime");
  adapter.start = start;
  await assert.rejects(host.start("prologue",request,granted),/已取消/);
});

test("MCP selections require declared authority, canonical provenance and exact runtime freezing", async () => {
  const host=new AgentHost();let starts=0,cancels=0;
  const adapter=adapterFor({runtimeId:'prologue',supported:['mcp','text-edit','command'],onCancel:()=>cancels++});
  const selected={server:'configured-server',tool:'write-note',version:'shape-1',configuration_version:3};
  const granted={...authority,manifest:{...manifest,mcp:true},method_owner:{board_id:BOARD,plugin_id:PLUGIN}};
  adapter.mcpLibrary={
    list:async()=>[],save:async()=>{throw new Error('unused');},control:async()=>{},
    validateSources:async(_owner,refs)=>[...refs],
    validate:async(owner,refs)=>{assert.deepEqual(owner,granted.method_owner);assert.deepEqual(refs,[{...selected,server_label:'forged label'}]);return [{...selected,server_label:'Canonical service'}];},
  };
  const original=adapter.start.bind(adapter);
  adapter.start=async request=>{starts++;assert.equal(request.mcp_tools?.[0]?.server_label,'Canonical service');const run=await original(request);run.frozen.mcp_tools=structuredClone(request.mcp_tools!);return run;};
  host.register(adapter);
  const request={...startRequest('builder'),mcp_tools:[{...selected,server_label:'forged label'}]};
  await assert.rejects(host.start('prologue',request,authority),/未接通 MCP/);
  await assert.rejects(host.start('prologue',{...request,role_id:'reader'},granted),/执行/);
  await assert.rejects(host.start('prologue',{...request,mcp_tools:[...request.mcp_tools,...request.mcp_tools]},granted),/重复/);
  assert.equal(starts,0);
  const run=await host.start('prologue',request,granted);assert.equal(run.frozen.mcp_tools[0]?.configuration_version,3);
  adapter.start=original;
  await assert.rejects(host.start('prologue',request,granted),/已取消/);assert.equal(cancels,1);
});

test("Host resolves compaction separately from role prompts and rejects missing versions or false frozen policy", async () => {
  const host = new AgentHost();
  const adapter = adapterFor({ runtimeId: "compact", supported: ["compaction"] });
  let observed: AgentStartRequest | undefined, lie = false;
  const start = adapter.start.bind(adapter);
  adapter.start = async request => {
    observed = request; const handle = await start(request);
    const policy = request.role?.compaction;
    if (policy && !lie) handle.frozen.compaction = { prompt_id: policy.prompt.prompt_id, version: policy.prompt.version, above_tokens: policy.above_tokens };
    return handle;
  };
  host.register(adapter);
  const granted = { ...authority, manifest: { ...manifest, compaction: { prompt_id: "select", above_tokens: 12000 }, prompts: [...manifest.prompts!, { prompt_id: "select", version: 2 }] },
    prompts: [{ prompt_id: "reader", version: 1, body: "Read only" }, { prompt_id: "select", version: 2, body: "Select originals" }] };
  const request = { ...startRequest("reader"), role: { role_id: "reader", version: 1, execution: "read-only" as const, prompts: [], host_tools: [], compaction: { prompt: { prompt_id: "fake", version: 9, body: "Override" }, above_tokens: 1 } } };
  const run = await host.start("compact", request, granted);
  assert.deepEqual(run.frozen.compaction, { prompt_id: "select", version: 2, above_tokens: 12000 });
  assert.equal(observed?.role?.compaction?.prompt.body, "Select originals");
  assert.deepEqual(observed?.role?.prompts.map(p => p.body), ["Read only"]);
  await assert.rejects(host.start("compact", request, { ...granted, prompts: granted.prompts.map(p => ({ ...p, version: 1 })) }), /对应版本/);
  lie = true; await assert.rejects(host.start("compact", request, granted), /已取消/);
});

function scriptedCli(command = "claude") {
  const spawns: Array<{ command: string; args: string[]; emit: (event: CliProcessEvent) => void; killed: boolean }> = [];
  const port: CliProcessPort = {
    spawn(input) {
      const spawn = { command: input.command, args: input.args, emit: input.onEvent, killed: false };
      spawns.push(spawn);
      return {
        done: Promise.resolve(),
        kill() {
          spawn.killed = true;
        },
      };
    },
    async available() {
      return true;
    },
  };
  return { command, port, spawns };
}

function cliAdapter(script: ReturnType<typeof scriptedCli>, runtimeId = "claude-code") {
  return new CliAgentAdapter({
    runtime_id: runtimeId,
    display_name: runtimeId,
    command: script.command,
    process: script.port,
    model: async () => "claude-opus-5",
    now: () => new Date("2026-09-19T00:00:00.000Z"),
  });
}

async function cliSession(adapter: CliAgentAdapter, title: string) {
  return adapter.createSession({
    board_id: BOARD,
    plugin_id: PLUGIN,
    install_id: "install-1",
    actor_id: "tester",
    directory: { canonical_path: DIRECTORY, realpath_verified: true },
    title,
  });
}

function cliRequest(
  session: Awaited<ReturnType<CliAgentAdapter["createSession"]>>,
  task: string,
): AgentStartRequest {
  return {
    session,
    board_id: BOARD,
    plugin_id: PLUGIN,
    install_id: "install-1",
    actor_id: "tester",
    task,
    role_id: "reader",
    role: {
      role_id: "reader",
      version: 1,
      execution: "read-only",
      prompts: [{ prompt_id: "reader", version: 1, body: "你只读代码。" }],
      host_tools: [],
    },
    directory: { canonical_path: DIRECTORY, realpath_verified: true },
  };
}

function resumeArgument(args: string[]): string | undefined {
  const index = args.indexOf("--resume");
  return index < 0 ? undefined : args[index + 1];
}

test("the same CLI session resumes the provider id the first process actually returned", async () => {
  const script = scriptedCli();
  const adapter = cliAdapter(script);
  assert.equal(adapter.descriptor.capabilities["session.resume"], "supported");
  const session = await cliSession(adapter, "第一会话");
  const first = await adapter.start(cliRequest(session, "先看登录"));
  assert.equal(resumeArgument(script.spawns[0]!.args), undefined);

  script.spawns[0]!.emit({
    kind: "line",
    line: JSON.stringify({ type: "system", session_id: "real-provider-session-1" }),
  });
  script.spawns[0]!.emit({
    kind: "line",
    line: JSON.stringify({ type: "result", subtype: "success", result: "看过了" }),
  });
  script.spawns[0]!.emit({ kind: "exit", code: 0 });
  assert.equal((await adapter.read(first.ref)).phase, "completed");

  await adapter.start(cliRequest(session, "继续上一轮"));
  assert.equal(resumeArgument(script.spawns[1]!.args), "real-provider-session-1");
  assert.notEqual(resumeArgument(script.spawns[1]!.args), session.session_id);

  const other = await cliSession(adapter, "另一会话");
  await adapter.start(cliRequest(other, "别的任务"));
  script.spawns[2]!.emit({
    kind: "line",
    line: JSON.stringify({ type: "system", session_id: "real-provider-session-2" }),
  });
  script.spawns[2]!.emit({
    kind: "line",
    line: JSON.stringify({ type: "result", subtype: "success", result: "另一条" }),
  });
  script.spawns[2]!.emit({ kind: "exit", code: 0 });
  await adapter.start(cliRequest(other, "继续另一条"));
  await adapter.start(cliRequest(session, "再回到第一条"));
  assert.equal(resumeArgument(script.spawns[3]!.args), "real-provider-session-2");
  assert.equal(resumeArgument(script.spawns[4]!.args), "real-provider-session-1");

  const codex = scriptedCli("codex");
  const otherRuntime = cliAdapter(codex, "codex");
  const foreign = await cliSession(otherRuntime, "另一个运行时");
  await otherRuntime.start(cliRequest(foreign, "没有带过来的会话"));
  assert.equal(resumeArgument(codex.spawns[0]!.args), undefined);
  assert.equal(codex.spawns[0]!.args.includes("real-provider-session-1"), false);
});

test("a CLI run with no provider id is not reported as resumed", async () => {
  const script = scriptedCli();
  const adapter = cliAdapter(script);
  const session = await cliSession(adapter, "没有 id");
  await adapter.start(cliRequest(session, "第一轮"));
  script.spawns[0]!.emit({
    kind: "line",
    line: JSON.stringify({ type: "result", subtype: "success", result: "没有会话 id" }),
  });
  script.spawns[0]!.emit({ kind: "exit", code: 0 });
  await adapter.start(cliRequest(session, "第二轮"));
  assert.equal(resumeArgument(script.spawns[1]!.args), undefined);
  assert.equal(script.spawns[1]!.args.includes(session.session_id), false);
  assert.equal(script.spawns[1]!.args.includes("--resume"), false);
});

test("CLI failure, cancel, and a new adapter keep the existing run contract", async () => {
  const script = scriptedCli();
  const adapter = cliAdapter(script);
  const session = await cliSession(adapter, "失败");
  const failed = await adapter.start(cliRequest(session, "会失败"));
  script.spawns[0]!.emit({
    kind: "line",
    line: JSON.stringify({ type: "system", session_id: "provider-after-failure" }),
  });
  script.spawns[0]!.emit({ kind: "exit", code: null });
  assert.equal((await adapter.read(failed.ref)).phase, "failed");
  script.spawns[0]!.emit({
    kind: "line",
    line: JSON.stringify({ type: "result", subtype: "success", result: "迟到的成功" }),
  });
  assert.equal((await adapter.read(failed.ref)).phase, "failed");
  const continued = await adapter.start(cliRequest(session, "失败后继续"));
  assert.equal(resumeArgument(script.spawns[1]!.args), "provider-after-failure");
  assert.equal((await adapter.read(failed.ref)).phase, "failed");

  const cancelled = await adapter.start(cliRequest(session, "取消这一轮"));
  await adapter.control(cancelled.ref, { kind: "cancel" });
  script.spawns[2]!.emit({ kind: "exit", code: 1 });
  script.spawns[2]!.emit({
    kind: "line",
    line: JSON.stringify({ type: "result", subtype: "success", result: "不该复活" }),
  });
  assert.equal((await adapter.read(cancelled.ref)).phase, "cancelled");
  assert.equal((await adapter.read(continued.ref)).phase, "running");

  await assert.rejects(
    () => adapter.control(cancelled.ref, { kind: "pause" }),
    (error: unknown) => error instanceof CliAgentError
      && error.code === "agent.capability_unavailable",
  );

  const restarted = cliAdapter(scriptedCli());
  const fresh = await cliSession(restarted, "重启后的新进程");
  const restartedScript = scriptedCli();
  const restartedAdapter = cliAdapter(restartedScript);
  const restartedSession = await cliSession(restartedAdapter, "重启后");
  await restartedAdapter.start(cliRequest(restartedSession, "没有旧 id"));
  assert.equal(resumeArgument(restartedScript.spawns[0]!.args), undefined);
  assert.equal(restartedScript.spawns[0]!.args.includes("provider-after-failure"), false);
  await assert.rejects(
    () => restartedAdapter.start(cliRequest(fresh, "串到另一个适配器")),
    (error: unknown) => error instanceof CliAgentError && error.code === "agent.session_unknown",
  );});
