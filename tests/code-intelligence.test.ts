// Code intelligence on the Host side (specs/coding-plugin/next-requirements.md A4/A4-1，用户 2026-11-12 定宿主侧):
// the executor behind the official coding pack's `coding.find-symbol`，按文件类型按需起语言服务器、会话结束关闭。

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { AgentHost, AgentReviewQueue, createCodeIntelligence, createPrologueNodeAdapter, languageServersFrom } from "@molis-ai/molis-work-service-agent-host";
import { codingAgentManifest, codingPrompts } from "@molis-ai/molis-work-plugin-coding";

const here = fileURLToPath(new URL(".", import.meta.url));
const fake = join(here, "fixtures/fake-lsp-server.mjs");
const overlong = join(here, "fixtures/overlong-lsp-server.mjs");

function workspace(): { readonly root: string; readonly log: string; close(): void } {
  const root = mkdtempSync(join(tmpdir(), "molis-code-intelligence-"));
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src/a.ts"), "export function greet(): string {\n  return 'hi';\n}\n\nexport const x = greet();\n");
  writeFileSync(join(root, "src/b.py"), "print('hi')\n");
  const log = join(root, "server.log");
  return { root, log, close: () => rmSync(root, { recursive: true, force: true }) };
}

/** 假服务器把「起了、握了手、关了」写进 log；孩子进程继承这台测试进程的环境。 */
const servers = (log: string) => {
  process.env.FAKE_LSP_LOG = log;
  return languageServersFrom({ servers: [{ extensions: [".ts", ".tsx"], command: process.execPath, args: [fake], languageId: "typescript" }] });
};

test("A4-1 语言服务器：配置写错了就拒，不静默跳过", () => {
  assert.throws(() => languageServersFrom({}), /servers list/);
  assert.throws(() => languageServersFrom({ servers: [{ command: "", extensions: [".ts"] }] }), /command/);
  assert.throws(() => languageServersFrom({ servers: [{ command: "x", extensions: [] }] }), /extensions/);
  assert.throws(() => languageServersFrom({ servers: [{ command: "x", extensions: ["ts"] }] }), /extensions/);
  assert.throws(() => languageServersFrom({ servers: [{ command: "x", extensions: [".ts"], args: ["a", 1] }] }), /args/);
  const parsed = languageServersFrom({ servers: [{ command: "srv", extensions: [".TS"], args: ["--stdio"] }] });
  assert.deepEqual(parsed, [{ command: "srv", extensions: [".ts"], args: ["--stdio"] }]);
});

test("A4-1 语言服务器：帧体超过上限就拒绝，不无界等待", { timeout: 15_000 }, async () => {
  const home = workspace();
  try {
    const intelligence = createCodeIntelligence({ servers: languageServersFrom({ servers: [{ extensions: [".ts"], command: process.execPath, args: [overlong] }] }),
      rootPath: home.root, timeoutMs: 3_000 });
    await assert.rejects(intelligence.symbolIndex({ args: { path: "src/a.ts", symbol: "greet" } } as never), /frame body of 999999999 bytes/u);
  } finally { home.close(); }
});

test("A4-1 查定义与引用：按文件类型起服务器，会话结束关掉它", { timeout: 30_000 }, async () => {
  const home = workspace();
  try {
    const intelligence = createCodeIntelligence({ servers: servers(home.log), rootPath: home.root });
    const result = await intelligence.symbolIndex({ args: { path: "src/a.ts", symbol: "greet" } } as never);
    assert.match(result, /symbol greet in src\/a\.ts/);
    assert.match(result, /definition:/);
    // 假服务器把定义指在第三行第十列（0 基 2:9），引用指在两处；输出本轮目录内的相对路径，不泄宿主机绝对路径。
    assert.match(result, /src\/a\.ts:3:10/);
    assert.match(result, /references:/);
    assert.match(result, /src\/a\.ts:9:5/);
    assert.match(result, /src\/a\.ts:13:3/);
    assert.equal(result.includes(home.root), false, "host absolute root path must never leak into tool output");
    // 服务器真的起了、接了握手、开了文档。
    const log = readFileSync(home.log, "utf8").split("\n");
    assert.ok(log.includes("started"));
    assert.ok(log.includes("initialize"));
    assert.ok(log.some((line) => line.startsWith("opened:file://")));
    // 收工时把它关掉，而不是留一个进程。
    await intelligence.close();
    const after = readFileSync(home.log, "utf8");
    assert.match(after, /shutdown/);
    assert.match(after, /exited/);
  } finally { delete process.env.FAKE_LSP_LOG; home.close(); }
});

test("A4-1 只读本轮的目录；没有登记的服务器就明确拒绝", { timeout: 30_000 }, async () => {
  const home = workspace();
  try {
    const intelligence = createCodeIntelligence({ servers: servers(home.log), rootPath: home.root });
    // A real file next to the round's root: the check is about where it resolves, not about it not existing.
    writeFileSync(join(dirname(home.root), "outside.ts"), "export const leaked = 1;\n");
    await assert.rejects(intelligence.symbolIndex({ args: { path: "../outside.ts", symbol: "x" } } as never), /outside it/);
    // .py 没有登记服务器：说清楚没有登记，不是空结果，也不是去装一个。
    await assert.rejects(intelligence.symbolIndex({ args: { path: "src/b.py", symbol: "x" } } as never), /no language server is configured for \.py/);
    // 没有 path 就不猜。
    await assert.rejects(intelligence.symbolIndex({ args: { symbol: "greet" } } as never), /needs a path/);
    await intelligence.close();
    // 关掉之后不再悄悄起一个。
    await assert.rejects(intelligence.symbolIndex({ args: { path: "src/a.ts", symbol: "greet" } } as never), /closed/);
    assert.equal(existsSync(join(home.root, "src/a.ts")), true);
  } finally { delete process.env.FAKE_LSP_LOG; home.close(); }
});

test("A4-1 可选的 language-servers.json 写坏了：只关代码智能并说明原因，不打死 Agent", async () => {
  const { codeIntelligenceConfig } = await import("@molis-ai/molis-work-app-local-host");
  const dir = mkdtempSync(join(tmpdir(), "molis-language-servers-broken-"));
  try {
    // No file: the feature is simply absent.
    assert.equal(codeIntelligenceConfig(dir), undefined);
    // Broken JSON: a problem, not a throw — the composition keeps starting the Agent.
    writeFileSync(join(dir, "language-servers.json"), "{ this is not json");
    const broken = codeIntelligenceConfig(dir);
    assert.equal(broken?.servers.length, 0);
    assert.match(String(broken?.problem), /language-servers\.json 读不了/u);
    // Valid JSON with an invalid field: same degradation, with the validation reason.
    writeFileSync(join(dir, "language-servers.json"), JSON.stringify({ downloads: "allow", servers: [] }));
    assert.match(String(codeIntelligenceConfig(dir)?.problem), /registry/u);
    // A usable file carries the servers and no problem.
    writeFileSync(join(dir, "language-servers.json"), JSON.stringify({ servers: [{ extensions: [".ts"], command: "fake-lsp" }] }));
    const usable = codeIntelligenceConfig(dir);
    assert.equal(usable?.servers.length, 1);
    assert.equal(usable?.problem, undefined);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("A4-1 服务器崩溃重启后重新打开同一份文档", { timeout: 30_000 }, async () => {
  const home = workspace();
  process.env.FAKE_LSP_EXIT_AFTER_DEFINITION = "1";
  try {
    const intelligence = createCodeIntelligence({ servers: servers(home.log), rootPath: home.root });
    const first = await intelligence.symbolIndex({ args: { path: "src/a.ts", symbol: "greet" } } as never);
    assert.match(first, /symbol greet in src\/a\.ts/);
    for (let i = 0; i < 100 && !readFileSync(home.log, "utf8").includes("exited-after-definition"); i++) await new Promise((resolve) => setTimeout(resolve, 20));
    await new Promise((resolve) => setTimeout(resolve, 50));
    const second = await intelligence.symbolIndex({ args: { path: "src/a.ts", symbol: "greet" } } as never);
    assert.match(second, /symbol greet in src\/a\.ts/);
    const opened = readFileSync(home.log, "utf8").split("\n").filter((line) => line.startsWith("opened:file://"));
    assert.equal(opened.length, 2, "the restarted server must be told to open the unchanged document again");
    await intelligence.close();
  } finally { delete process.env.FAKE_LSP_EXIT_AFTER_DEFINITION; delete process.env.FAKE_LSP_LOG; home.close(); }
});

test("A4-1 打开的文档有上限：超过 64 个关闭最旧的", { timeout: 60_000 }, async () => {
  const home = workspace();
  process.env.FAKE_LSP_LOG = home.log;
  try {
    for (let index = 0; index < 66; index += 1) writeFileSync(join(home.root, "src", `f${index}.ts`), "export const greet = 1;\n");
    const intelligence = createCodeIntelligence({ servers: servers(home.log), rootPath: home.root });
    for (let index = 0; index < 66; index += 1) await intelligence.symbolIndex({ args: { path: `src/f${index}.ts`, symbol: "greet" } } as never);
    assert.match(readFileSync(home.log, "utf8"), /textDocument\/didClose/, "the oldest open document must be closed past the cap");
    await intelligence.close();
  } finally { delete process.env.FAKE_LSP_LOG; home.close(); }
});

test("A4-1 并发冷启动只起一个服务器；初始化途中关闭不留孤儿进程；坏帧立即销毁客户端", { timeout: 30_000 }, async () => {
  const home = workspace();
  try {
    mkdirSync(join(home.root, "src/sub"), { recursive: true });
    writeFileSync(join(home.root, "src/sub/c.ts"), "export const greet = () => 'ok';\n");
    process.env.FAKE_LSP_DELAY_INIT_MS = "120";
    const intelligence = createCodeIntelligence({ servers: servers(home.log), rootPath: home.root });
    const [first, second] = await Promise.all([
      intelligence.symbolIndex({ args: { path: "src/a.ts", symbol: "greet" } } as never),
      intelligence.symbolIndex({ args: { path: "src/sub/c.ts", symbol: "greet" } } as never),
    ]);
    assert.match(first, /src\/a\.ts:3:10/);
    assert.match(second, /src\/sub\/c\.ts:3:10/);
    const starts = readFileSync(home.log, "utf8").split("\n").filter((line) => line === "started");
    assert.equal(starts.length, 1, "concurrent calls for the same server key share a single startup");
    await intelligence.close();

    // Closing while initialize is still in flight rejects the call and closes the spawned server.
    const inflightLog = join(home.root, "inflight.log");
    process.env.FAKE_LSP_DELAY_INIT_MS = "250";
    const closingDuringInit = createCodeIntelligence({ servers: servers(inflightLog), rootPath: home.root });
    const pending = closingDuringInit.symbolIndex({ args: { path: "src/a.ts", symbol: "greet" } } as never);
    await new Promise((resolve) => setTimeout(resolve, 40));
    await closingDuringInit.close();
    await assert.rejects(pending, /closed|ended/u);

    // Malformed LSP header poisons the client immediately and allows a subsequent call to spawn a fresh server.
    delete process.env.FAKE_LSP_DELAY_INIT_MS;
    const poisonLog = join(home.root, "poison.log");
    const recoverable = createCodeIntelligence({ servers: servers(poisonLog), rootPath: home.root, timeoutMs: 3_000 });
    process.env.FAKE_LSP_BAD_HEADER = "1";
    await assert.rejects(recoverable.symbolIndex({ args: { path: "src/a.ts", symbol: "greet" } } as never), /Content-Length|ended/u);
    delete process.env.FAKE_LSP_BAD_HEADER;
    // Wait briefly so the newly spawned process reads clean env if needed; env is inherited at spawn time, and startLanguageServer spawns fresh!
    const recovered = createCodeIntelligence({ servers: servers(poisonLog), rootPath: home.root });
    const ok = await recovered.symbolIndex({ args: { path: "src/a.ts", symbol: "greet" } } as never);
    assert.match(ok, /src\/a\.ts:3:10/);
    await recoverable.close();
    await recovered.close();
  } finally {
    delete process.env.FAKE_LSP_DELAY_INIT_MS;
    delete process.env.FAKE_LSP_BAD_HEADER;
    delete process.env.FAKE_LSP_LOG;
    home.close();
  }
});

test("A4-1 软链根目录归一相对路径，目录外 URI 只报文件名不泄宿主机绝对路径", { timeout: 30_000 }, async () => {
  const home = workspace();
  const aliasParent = mkdtempSync(join(tmpdir(), "molis-code-intelligence-alias-"));
  const symlinkedRoot = join(aliasParent, "linked-work");
  symlinkSync(home.root, symlinkedRoot);
  try {
    const intelligence = createCodeIntelligence({ servers: servers(home.log), rootPath: symlinkedRoot });
    const inside = await intelligence.symbolIndex({ args: { path: "src/a.ts", symbol: "greet" } } as never);
    assert.match(inside, /src\/a\.ts:3:10/);
    assert.equal(inside.includes(home.root), false);
    assert.equal(inside.includes(aliasParent), false);
    await intelligence.close();

    process.env.FAKE_LSP_OVERRIDE_URI = "file:///Users/secret-host-account/private-repo/outside-target.ts";
    const outsideCheck = createCodeIntelligence({ servers: servers(home.log), rootPath: home.root });
    const outside = await outsideCheck.symbolIndex({ args: { path: "src/a.ts", symbol: "greet" } } as never);
    assert.match(outside, /outside-target\.ts:3:10 \(outside this round's directory\)/);
    assert.equal(outside.includes("secret-host-account"), false, "outside location must never leak host path segments");
    await outsideCheck.close();
  } finally {
    delete process.env.FAKE_LSP_OVERRIDE_URI;
    delete process.env.FAKE_LSP_LOG;
    rmSync(aliasParent, { recursive: true, force: true });
    home.close();
  }
});

test("A4-1 Coding 全部 7 个主角色开放 find-symbol，目录模式子角色沿系统工具上限不挂会话包工具且 coordinator 分派不升级越界", { timeout: 45_000 }, async (t) => {
  for (const roleId of ["reader", "coordinator", "planner", "reviewer", "writers", "builder", "writer"]) {
    const role = codingAgentManifest.roles.find((entry) => entry.role_id === roleId);
    assert.ok(role?.host_tools?.includes("find-symbol"), `${roleId} declares find-symbol`);
  }
  const childRoles = codingAgentManifest.subagents?.roles ?? [];
  for (const childId of ["coding-reader", "coding-reviewer", "coding-builder"]) {
    assert.equal(childRoles.find((entry) => entry.role_id === childId)?.host_tools?.includes("find-symbol"), false, `${childId} stays within system tools`);
  }

  const home = workspace();
  const runtimeDir = mkdtempSync(join(tmpdir(), "molis-coding-child-symbol-"));
  let parentStep = 0;
  let parentSymbolResult = "";
  let childVisited = false;
  const sse = (frames: ReadonlyArray<Record<string, unknown>>) => new Response(
    frames.map((frame) => `event: ${String(frame.type)}\ndata: ${JSON.stringify(frame)}\n\n`).join(""),
    { headers: { "content-type": "text/event-stream" } },
  );
  const callTool = (name: string, input: unknown, id: string) => sse([
    { type: "message_start", message: { id: "m", type: "message", role: "assistant", model: "fixture", content: [], usage: { input_tokens: 10, output_tokens: 0 } } },
    { type: "content_block_start", index: 0, content_block: { type: "tool_use", id, name, input } },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 5 } },
    { type: "message_stop" },
  ]);
  const doneText = (text: string) => sse([
    { type: "message_start", message: { id: "m", type: "message", role: "assistant", model: "fixture", content: [], usage: { input_tokens: 10, output_tokens: 0 } } },
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 5 } },
    { type: "message_stop" },
  ]);
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array)) as {
      messages: Array<{ role: string; content: unknown }>;
      system?: unknown;
      tools?: Array<{ name: string }>;
    };
    if (!body.tools?.length) {
      return doneText('{"last":"result","changed":""}');
    }
    const isChild = body.messages.some((message) => message.role === "user" && JSON.stringify(message.content).includes("CHILD_READ_CHECK"));
    if (isChild) {
      childVisited = true;
      assert.equal(body.tools.some((tool) => tool.name.includes("find-symbol")), false, "workspace child does not carry session pack tools");
      return doneText("Verified src/a.ts via child reader.");
    }
    parentStep += 1;
    const symbolTool = body.tools.find((tool) => tool.name.includes("find-symbol"))?.name;
    assert.ok(symbolTool, "coordinator parent receives scoped coding.find-symbol tool");
    if (parentStep === 1) {
      return callTool(symbolTool, { path: "src/a.ts", symbol: "greet" }, "parent-sym-1");
    }
    if (parentStep === 2) {
      parentSymbolResult = JSON.stringify(body.messages);
      const readerRef = JSON.stringify(body.system).match(/molis-child-[0-9a-f-]+@[0-9]+(?=:\s*代码调查)/)?.[0];
      assert.ok(readerRef, "coding-reader character ref is published in system prompt");
      return callTool("dispatch-subagent", {
        instruction: "CHILD_READ_CHECK: inspect src/a.ts.",
        tools: ["read"],
        character: readerRef,
        idempotencyKey: "reader-check",
        maxTurns: 2,
      }, "parent-dispatch-1");
    }
    return doneText("Coordinator finished.");
  });

  const queue = new AgentReviewQueue();
  const adapter = await createPrologueNodeAdapter({
    app: { appId: "io.molis.work.child-symbol", appVersion: "1.0.0" },
    storageRoot: join(runtimeDir, "sdk"),
    reviewQueue: queue,
    codeIntelligence: { servers: servers(home.log) },
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }),
    resolveCredential: () => "test-only",
  });
  try {
    const host = new AgentHost({ reviews: queue });
    host.register(adapter);
    const owner = { project_id: "proj-sym", plugin_id: "io.molis.work.coding", install_id: "inst-1", actor_id: "user" };
    const directory = { canonical_path: home.root, realpath_verified: true };
    const session = await adapter.createSession({ ...owner, directory, title: "Coordinator symbol + child" });
    const handle = await host.start("prologue", { ...owner, session, directory, role_id: "coordinator", task: "Locate greet and dispatch child reader." }, {
      manifest: codingAgentManifest,
      prompts: codingPrompts,
      authorizedDirectories: [home.root],
    });
    for (const deadline = Date.now() + 20_000;;) {
      for (const pending of queue.list("proj-sym", "pending")) {
        await queue.respond({ review_id: pending.review_id, decision: "approve", actor_id: "user" });
      }
      const view = await adapter.read(handle.ref);
      if (["completed", "failed", "cancelled", "stopped"].includes(view.phase)) {
        assert.equal(view.phase, "completed", JSON.stringify(view));
        break;
      }
      if (Date.now() > deadline) assert.fail(`coordinator run timed out in phase ${view.phase}`);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.match(parentSymbolResult, /src\/a\.ts:3:10/);
    assert.equal(childVisited, true, "coordinator dispatched coding-reader cleanly alongside session pack symbol tool");
  } finally {
    delete process.env.FAKE_LSP_LOG;
    await adapter.close();
    rmSync(runtimeDir, { recursive: true, force: true });
    home.close();
  }
});
