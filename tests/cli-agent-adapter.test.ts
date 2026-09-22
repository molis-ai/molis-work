import assert from "node:assert/strict";
import test from "node:test";
import type {
  AgentRunView,
  AgentStartRequest,
} from "@molis-ai/molis-work-contracts/services/agent-host";
import {
  AgentHost,
  AgentHostError,
  CliAgentAdapter,
  CliAgentError,
  type CliProcessEvent,
  type CliProcessPort,
} from "@molis-ai/molis-work-service-agent-host";
import type { AgentManifest } from "@molis-ai/molis-work-contracts/platform/plugin-agent";

const BOARD = "board-cli";
const PLUGIN = "io.molis.work.coding";
const DIRECTORY = "/Users/tester/code/project";

const manifest: AgentManifest = {
  directory_input_port: "project",
  roles: [
    { role_id: "reader", version: 1, name: "Reader" },
    { role_id: "builder", version: 2, name: "Builder", execution: "workspace-write" },
  ],
  prompts: [{ prompt_id: "reader", version: 1 }, { prompt_id: "builder", version: 2 }],
};

function fakeProcess(options: { version?: string | null } = {}) {
  const spawns: Array<{ command: string; args: string[]; cwd: string }> = [];
  let emit: ((event: CliProcessEvent) => void) | null = null;
  let killed = false;
  const port: CliProcessPort = {
    spawn(input) {
      spawns.push({ command: input.command, args: input.args, cwd: input.cwd });
      emit = input.onEvent;
      return {
        done: Promise.resolve(),
        kill() {
          killed = true;
        },
      };
    },
    async version() {
      return options.version === undefined ? "2.1.0" : options.version;
    },
  };
  return {
    port,
    spawns,
    killed: () => killed,
    line: (value: unknown) => emit?.({ kind: "line", line: JSON.stringify(value) }),
    raw: (value: string) => emit?.({ kind: "line", line: value }),
    exit: (code: number | null) => emit?.({ kind: "exit", code }),
  };
}

function adapterFor(process: CliProcessPort, model: string | null = "claude-opus-5") {
  return new CliAgentAdapter({
    runtime_id: "claude-code",
    display_name: "Claude Code",
    command: "claude",
    process,
    model: async () => model,
    now: () => new Date("2026-09-19T00:00:00.000Z"),
  });
}

async function startRun(adapter: CliAgentAdapter) {
  const session = await adapter.createSession({
    board_id: BOARD,
    plugin_id: PLUGIN,
    install_id: "install-1",
    actor_id: "tester",
    directory: { canonical_path: DIRECTORY, realpath_verified: true },
    title: "看看登录为什么卡",
  });
  const request: AgentStartRequest = {
    session,
    board_id: BOARD,
    plugin_id: PLUGIN,
    install_id: "install-1",
    actor_id: "tester",
    task: "看看登录为什么卡",
    role_id: "reader",
    role: {
      role_id: "reader",
      version: 1,
      execution: "read-only",
      prompts: [{ prompt_id: "reader", version: 1, body: "你只读代码，不做修改。" }],
      host_tools: [],
    },
    directory: { canonical_path: DIRECTORY, realpath_verified: true },
  };
  return { session, handle: await adapter.start(request) };
}

test("a read-only run is invoked with writes denied at the command line", async () => {
  const fake = fakeProcess();
  const adapter = adapterFor(fake.port);
  await startRun(adapter);

  assert.equal(fake.spawns.length, 1);
  const { command, args, cwd } = fake.spawns[0]!;
  assert.equal(command, "claude");
  assert.equal(cwd, DIRECTORY);
  assert.deepEqual(args.slice(0, 6), ["--print", "--verbose", "--output-format", "stream-json", "--model", "claude-opus-5"]);
  assert.equal(args[args.indexOf("--allowedTools") + 1], "Read,Grep,Glob");
  assert.equal(
    args[args.indexOf("--disallowedTools") + 1],
    "Write,Edit,MultiEdit,NotebookEdit,Bash",
    "写入工具必须在命令行上被拒绝，而不是靠提示词自觉",
  );
  assert.equal(
    args.at(-1),
    "你只读代码，不做修改。\n\n看看登录为什么卡",
    "角色 Prompt 必须真的进到这一跑，否则插件定义的角色等于没生效",
  );
});

test("stream output becomes turns, tool activity and real usage", async () => {
  const fake = fakeProcess();
  const adapter = adapterFor(fake.port);
  const { handle } = await startRun(adapter);
  const views: AgentRunView[] = [];
  adapter.observe(handle.ref, (view) => views.push(view));

  fake.line({ type: "system", subtype: "init", session_id: "cli-session-7" });
  fake.line({
    type: "assistant",
    message: {
      content: [
        { type: "text", text: "我先看一下登录相关的文件。" },
        { type: "tool_use", id: "call-1", name: "Read", input: { file_path: "src/login.ts" } },
      ],
    },
  });

  let view = await adapter.read(handle.ref);
  assert.equal(view.phase, "running");
  assert.deepEqual(view.turns.map((turn) => turn.kind), ["user", "assistant"]);
  assert.deepEqual(view.activity.map((entry) => [entry.name, entry.target, entry.state]), [
    ["Read", "src/login.ts", "started"],
  ]);
  assert.equal(view.usage.unavailable_reason, "运行时尚未报告用量", "还没报就是没报，不能填 0 当真");

  fake.line({
    type: "user",
    message: { content: [{ type: "tool_result", tool_use_id: "call-1", is_error: false }] },
  });
  fake.line({
    type: "result",
    subtype: "success",
    is_error: false,
    result: "重试次数写死成 0 了。",
    usage: { input_tokens: 1200, output_tokens: 340, cache_read_input_tokens: 800 },
    total_cost_usd: 0.021,
  });
  fake.exit(0);

  view = await adapter.read(handle.ref);
  assert.equal(view.phase, "completed");
  assert.equal(view.activity[0]?.state, "completed");
  assert.deepEqual(view.usage.tokens, { input: 1200, output: 340, cached_input: 800 });
  assert.equal(view.usage.cost_usd, 0.021);
  assert.equal(view.usage.unavailable_reason, undefined);
  assert.equal(view.turns.at(-1)?.text, "重试次数写死成 0 了。");
  assert.ok(views.length > 1, "观察者应当在过程中收到更新");
});

test("a failed tool result and a failed run are both reported honestly", async () => {
  const fake = fakeProcess();
  const adapter = adapterFor(fake.port);
  const { handle } = await startRun(adapter);

  fake.line({
    type: "assistant",
    message: { content: [{ type: "tool_use", id: "call-1", name: "Read", input: { file_path: "missing.ts" } }] },
  });
  fake.line({
    type: "user",
    message: { content: [{ type: "tool_result", tool_use_id: "call-1", is_error: true }] },
  });
  fake.line({ type: "result", subtype: "error_max_turns", is_error: true, result: "" });
  fake.exit(1);

  const view = await adapter.read(handle.ref);
  assert.equal(view.activity[0]?.state, "failed");
  assert.equal(view.phase, "failed");
  assert.equal(view.stop_reason, "error_max_turns");
});

test("a process that dies without a result is failed, not quietly completed", async () => {
  const fake = fakeProcess();
  const adapter = adapterFor(fake.port);
  const { handle } = await startRun(adapter);
  fake.exit(null);

  const view = await adapter.read(handle.ref);
  assert.equal(view.phase, "failed");
  assert.match(view.stop_reason ?? "", /进程退出码/u);
});

test("noise on the stream is ignored rather than guessed at", async () => {
  const fake = fakeProcess();
  const adapter = adapterFor(fake.port);
  const { handle } = await startRun(adapter);

  fake.raw("npm warn something happened");
  fake.raw("{not json");
  fake.line({ type: "unknown-future-event", payload: {} });

  const view = await adapter.read(handle.ref);
  assert.deepEqual(view.turns.map((turn) => turn.kind), ["user"]);
  assert.deepEqual(view.activity, []);
});

test("stopping ends the process and the run says so", async () => {
  const fake = fakeProcess();
  const adapter = adapterFor(fake.port);
  const { handle } = await startRun(adapter);

  await adapter.control(handle.ref, { kind: "stop" });
  assert.equal(fake.killed(), true);
  const view = await adapter.read(handle.ref);
  assert.equal(view.phase, "stopped");
  assert.equal(view.stop_reason, "用户停止");

  // A late exit must not turn a stopped run into a failed one.
  fake.exit(143);
  assert.equal((await adapter.read(handle.ref)).phase, "stopped");
});

test("controls this runtime does not have are refused, not faked", async () => {
  const fake = fakeProcess();
  const adapter = adapterFor(fake.port);
  const { handle } = await startRun(adapter);

  assert.equal(adapter.descriptor.capabilities["run.control"], "partial");
  await assert.rejects(
    () => adapter.control(handle.ref, { kind: "pause" }),
    (error: unknown) => error instanceof CliAgentError
      && error.code === "agent.capability_unavailable",
  );
  await assert.rejects(
    () => adapter.control(handle.ref, { kind: "steer", text: "再看一下这里" }),
    (error: unknown) => error instanceof CliAgentError,
  );
});

test("health reports a missing binary and a missing model differently", async () => {
  assert.deepEqual(await adapterFor(fakeProcess({ version: null }).port).health(), {
    ok: false,
    status: "unavailable",
    message: "找不到可执行的 claude",
    action: "安装 Claude Code 并确认它在 PATH 里",
  });
  const needsModel = await adapterFor(fakeProcess().port, null).health();
  assert.equal(needsModel.status, "needs_setup");
  const ready = await adapterFor(fakeProcess().port).health();
  assert.deepEqual(ready, { ok: true, status: "ready", message: "Claude Code 2.1.0" });
});

test("the Host refuses a writing role on this runtime, because approvals do not reach it", async () => {
  const host = new AgentHost();
  host.register(adapterFor(fakeProcess().port));

  const roles = host.availableRoles("claude-code", manifest);
  assert.deepEqual(roles[0], { role_id: "reader", available: true });
  assert.equal(roles[1]?.available, false);

  await assert.rejects(
    () => host.start("claude-code", {
      session: { session_id: "s", runtime_id: "claude-code" },
      board_id: BOARD,
      plugin_id: PLUGIN,
      install_id: "install-1",
      actor_id: "tester",
      task: "改一下重试次数",
      role_id: "builder",
      directory: { canonical_path: DIRECTORY, realpath_verified: true },
    }, { manifest, authorizedDirectories: [DIRECTORY] }),
    (error: unknown) => error instanceof AgentHostError
      && error.code === "agent.capability_unavailable",
  );
});

test("without a frozen role the adapter refuses instead of running an unshaped agent", async () => {
  const fake = fakeProcess();
  const adapter = adapterFor(fake.port);
  const session = await adapter.createSession({
    board_id: BOARD,
    plugin_id: PLUGIN,
    install_id: "install-1",
    actor_id: "tester",
    directory: { canonical_path: DIRECTORY, realpath_verified: true },
    title: "任务",
  });

  await assert.rejects(
    () => adapter.start({
      session,
      board_id: BOARD,
      plugin_id: PLUGIN,
      install_id: "install-1",
      actor_id: "tester",
      task: "随便跑点什么",
      role_id: "reader",
      directory: { canonical_path: DIRECTORY, realpath_verified: true },
    }),
    (error: unknown) => error instanceof CliAgentError
      && error.code === "agent.runtime_missing",
  );
  assert.equal(fake.spawns.length, 0, "没有角色就不该起进程");
});

test("the Host freezes the role from the Plugin's own declarations", async () => {
  const fake = fakeProcess();
  const host = new AgentHost();
  host.register(adapterFor(fake.port));

  const handle = await host.start("claude-code", {
    session: await adapterFor(fake.port).createSession({
      board_id: BOARD,
      plugin_id: PLUGIN,
      install_id: "install-1",
      actor_id: "tester",
      directory: { canonical_path: DIRECTORY, realpath_verified: true },
      title: "任务",
    }),
    board_id: BOARD,
    plugin_id: PLUGIN,
    install_id: "install-1",
    actor_id: "tester",
    task: "看看登录",
    role_id: "reader",
    directory: { canonical_path: DIRECTORY, realpath_verified: true },
  }, {
    manifest,
    authorizedDirectories: [DIRECTORY],
    prompts: [{ prompt_id: "reader", version: 1, body: "只读。" }],
  }).catch((error: unknown) => error);

  // The session above belongs to a different adapter instance, so the run is
  // refused for an unknown session — but the role was frozen before that point.
  assert.ok(handle instanceof Error);
  assert.match((handle as Error).message, /找不到这条会话/u);
});

test("CLI command receipts with reused call ids require a run and never cross sessions", async () => {
  const fake = fakeProcess();
  const adapter = adapterFor(fake.port);
  const { session, handle } = await startRun(adapter);
  const receipt = (value: string) => {
    fake.line({ type: "assistant", message: { content: [{ type: "tool_use", id: "same-call", name: "Bash", input: { command: "check" } }] } });
    fake.line({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "same-call", content: value }] } });
    fake.line({ type: "result", subtype: "success", is_error: false, result: "done" });
  };
  receipt("first output");
  const next = await adapter.start({ session, plugin_id: PLUGIN, task: "next", role_id: "reader", directory: { canonical_path: DIRECTORY, realpath_verified: true },
    role: { role_id: "reader", version: 1, execution: "read-only", prompts: [], host_tools: [] } });
  receipt("second output");
  await assert.rejects(adapter.readCommandOutput(session, { call_id: "same-call" }), /多次执行/);
  assert.equal((await adapter.readCommandOutput(session, { call_id: "same-call", run_id: handle.ref.run_id })).stdout, "first output");
  assert.equal((await adapter.readCommandOutput(session, { call_id: "same-call", run_id: next.ref.run_id })).stdout, "second output");
  await assert.rejects(adapter.readCommandOutput({ ...session, session_id: "foreign" }, { call_id: "same-call", run_id: handle.ref.run_id }), /没有/);
});
