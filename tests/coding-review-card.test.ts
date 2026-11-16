import { pageText, withPageText } from "./fixtures/page-text.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  renderPendingReviewCard as drawPendingReviewCard,
  type CodingPendingReview,
  type CodingUiPrimitives,
} from "@molis-ai/molis-work-plugin-coding";

const renderPendingReviewCard: typeof drawPendingReviewCard = (...args) => withPageText("zh", ["coding"], () => drawPendingReviewCard(...args));

// Coding's renderers word stable keys; the page words them through the shipped table (the default language, Chinese, here).
const zh = pageText("zh", "coding");

const p: CodingUiPrimitives = {
  escape: (value) => String(value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"),
  icon: (name) => `<i data-icon="${name}"></i>`,
  text: zh,
  formatDate: (value) => value.slice(0, 10),
};

const pending: CodingPendingReview[] = [
  { review_id: "r1", kind: "text-edit", summary: "把 connect.ts 的重试次数从 0 改成 3" },
  { review_id: "r2", kind: "command", summary: "运行 pnpm test" },
];

test("卡片只做摘要和引路，不提供任何就地放行", () => {
  const html = renderPendingReviewCard({ pending, review_href: "/reviews", primitives: p });
  assert.match(html, /2 项操作等你决定/);
  assert.match(html, /查看并处理/);
  assert.match(html, /href="\/reviews"/);
  // 硬边界查的是**控件**，不是文字——说明里出现「批准」两个字是应该的
  const controls = html.match(/<(button|input)\b[^>]*>/g) ?? [];
  assert.deepEqual(controls, [], "卡片上不能有任何按钮或输入控件");
  const links = html.match(/<a\b[^>]*>/g) ?? [];
  assert.equal(links.length, 1, "只有一条出口：去宿主审查面");
  assert.match(links[0]!, /href="\/reviews"/);
  for (const forbidden of [/data-approve/, /data-reject/, /全部放行/, /下次不再询问/]) {
    assert.doesNotMatch(html, forbidden, `卡片上不该出现 ${forbidden}`);
  }
  assert.match(html, /在你批准之前，这些操作不会发生/);
});

test("没有待审时什么都不画，不在对话中间插一句「没有待办」", () => {
  assert.equal(renderPendingReviewCard({ pending: [], review_href: "/reviews", primitives: p }), "");
});

test("超过三项时如实说还有多少，不悄悄截断", () => {
  const many = Array.from({ length: 7 }, (_, index): CodingPendingReview => ({
    review_id: `r${index}`, kind: "text-edit", summary: `改动 ${index}`,
  }));
  const html = renderPendingReviewCard({ pending: many, review_href: "/reviews", primitives: p });
  assert.match(html, /7 项操作等你决定/);
  assert.match(html, /还有 4 项/);
});

test("摘要里的标记被转义", () => {
  const nasty: CodingPendingReview[] = [
    { review_id: "r1", kind: "command", summary: '<img src=x onerror="alert(1)">' },
  ];
  const html = renderPendingReviewCard({ pending: nasty, review_href: "/reviews", primitives: p });
  assert.equal(html.includes("<img src=x"), false);
  assert.match(html, /&lt;img src=x/);
});

test("每种操作类型都有中文说法，不直接把内部 kind 甩给用户", () => {
  const kinds: CodingPendingReview["kind"][] = ["text-edit", "command", "tool-operation", "mcp", "rewind"];
  for (const kind of kinds) {
    const html = renderPendingReviewCard({
      pending: [{ review_id: "r", kind, summary: "x" }], review_href: "/r", primitives: p,
    });
    assert.doesNotMatch(html, new RegExp(`coding-review-kind">${kind}<`), `${kind} 不该原样显示`);
  }
});

test("A4-1 Coding index → 审查卡：真实 writer 轮次调用 coding.find-symbol 定位定义后产生待审编辑并渲染审查卡，仅指向宿主审查面", { timeout: 45_000 }, async (t) => {
  const { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const { AgentHost, AgentReviewQueue, createPrologueNodeAdapter, languageServersFrom } = await import("@molis-ai/molis-work-service-agent-host");
  const { codingAgentManifest, codingPrompts } = await import("@molis-ai/molis-work-plugin-coding");
  const root = mkdtempSync(join(tmpdir(), "molis-coding-index-review-"));
  const runtimeDir = mkdtempSync(join(tmpdir(), "molis-coding-index-runtime-"));
  const fakeLsp = join(fileURLToPath(new URL(".", import.meta.url)), "fixtures/fake-lsp-server.mjs");
  let turn = 0;
  let observedIndexOutput = "";
  const sse = (frames: ReadonlyArray<Record<string, unknown>>) => new Response(
    frames.map((frame) => `event: ${String(frame.type)}\ndata: ${JSON.stringify(frame)}\n\n`).join(""),
    { headers: { "content-type": "text/event-stream" } },
  );
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array)) as {
      messages: unknown;
      tools?: Array<{ name: string }>;
    };
    if (!body.tools?.length) {
      return sse([
        { type: "message_start", message: { id: "m-rev", type: "message", role: "assistant", model: "fixture", content: [], usage: { input_tokens: 10, output_tokens: 0 } } },
        { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
        { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: '{"last":"blocker","changed":""}' } },
        { type: "content_block_stop", index: 0 },
        { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 5 } },
        { type: "message_stop" },
      ]);
    }
    turn += 1;
    const symbolTool = body.tools.find((tool) => tool.name.includes("find-symbol"))?.name;
    assert.ok(symbolTool, "writer role receives scoped coding.find-symbol tool");
    if (turn === 1) {
      return sse([
        { type: "message_start", message: { id: "m1", type: "message", role: "assistant", model: "fixture", content: [], usage: { input_tokens: 12, output_tokens: 0 } } },
        { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "call-sym", name: symbolTool, input: { path: "src/a.ts", symbol: "greet" } } },
        { type: "content_block_stop", index: 0 },
        { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 8 } },
        { type: "message_stop" },
      ]);
    }
    if (turn === 2) {
      observedIndexOutput = JSON.stringify(body.messages);
      return sse([
        { type: "message_start", message: { id: "m2", type: "message", role: "assistant", model: "fixture", content: [], usage: { input_tokens: 15, output_tokens: 0 } } },
        { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "call-read", name: "read", input: { path: "src/a.ts" } } },
        { type: "content_block_stop", index: 0 },
        { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 8 } },
        { type: "message_stop" },
      ]);
    }
    if (turn === 3) {
      return sse([
        { type: "message_start", message: { id: "m3", type: "message", role: "assistant", model: "fixture", content: [], usage: { input_tokens: 18, output_tokens: 0 } } },
        { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "call-write", name: "write", input: { path: "src/a.ts", text: "export function greet(): string {\n  return 'hello';\n}\n" } } },
        { type: "content_block_stop", index: 0 },
        { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 10 } },
        { type: "message_stop" },
      ]);
    }
    return sse([
      { type: "message_start", message: { id: "m4", type: "message", role: "assistant", model: "fixture", content: [], usage: { input_tokens: 20, output_tokens: 0 } } },
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Pending user approval; write not applied." } },
      { type: "content_block_stop", index: 0 },
      { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 5 } },
      { type: "message_stop" },
    ]);
  });

  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src/a.ts"), "export function greet(): string {\n  return 'hi';\n}\n\nexport const x = greet();\n");
  process.env.FAKE_LSP_LOG = join(root, "server.log");
  const queue = new AgentReviewQueue();
  const adapter = await createPrologueNodeAdapter({
    app: { appId: "io.molis.work.coding-index-review", appVersion: "1.0.0" },
    storageRoot: join(runtimeDir, "sdk"),
    reviewQueue: queue,
    codeIntelligence: {
      servers: languageServersFrom({ servers: [{ extensions: [".ts"], command: process.execPath, args: [fakeLsp], languageId: "typescript" }] }),
    },
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }),
    resolveCredential: () => "test-only",
  });
  try {
    const host = new AgentHost({ reviews: queue });
    host.register(adapter);
    const owner = { project_id: "proj-card", plugin_id: "io.molis.work.coding", install_id: "inst-card", actor_id: "user" };
    const directory = { canonical_path: root, realpath_verified: true };
    const session = await adapter.createSession({ ...owner, directory, title: "Index to review card" });
    const handle = await host.start("prologue", { ...owner, session, directory, role_id: "writer", task: "Find greet and update it." }, {
      manifest: codingAgentManifest,
      prompts: codingPrompts,
      authorizedDirectories: [root],
    });
    let pendingReviews = queue.list("proj-card", "pending");
    for (const deadline = Date.now() + 20_000; pendingReviews.length === 0;) {
      if (Date.now() > deadline) assert.fail("writer round did not reach pending text-edit review");
      await new Promise((resolve) => setTimeout(resolve, 10));
      pendingReviews = queue.list("proj-card", "pending");
    }
    assert.match(observedIndexOutput, /symbol greet in src\/a\.ts/);
    assert.match(observedIndexOutput, /src\/a\.ts:3:10/);
    assert.match(readFileSync(join(root, "src/a.ts"), "utf8"), /return 'hi'/, "file on disk is untouched while awaiting Host review");
    const realPending: CodingPendingReview[] = pendingReviews.map((review) => ({
      review_id: review.review_id,
      kind: review.kind as CodingPendingReview["kind"],
      summary: review.document.kind === "text-edit" ? review.document.target_path : review.kind,
    }));
    const html = renderPendingReviewCard({
      pending: realPending,
      review_href: "/reviews",
      primitives: p,
    });
    assert.match(html, /1 项操作等你决定/);
    assert.match(html, /src\/a\.ts/);
    assert.match(html, /href="\/reviews"/);
    assert.deepEqual(html.match(/<(button|input)\b[^>]*>/g) ?? [], []);
    for (const review of pendingReviews) {
      await queue.respond({ review_id: review.review_id, version: review.reference.version, decision: "reject", actor_id: "user" });
    }
    for (const deadline = Date.now() + 20_000;;) {
      const view = await adapter.read(handle.ref);
      if (["completed", "failed", "cancelled", "stopped"].includes(view.phase)) break;
      if (Date.now() > deadline) assert.fail(`run did not settle after review rejection: ${view.phase}`);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  } finally {
    delete process.env.FAKE_LSP_LOG;
    await adapter.close();
    rmSync(runtimeDir, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
  }
});

test("K-1 BL-302 PA-27 PA-29 子任务写后检查 → 子 SessionIndex → 审查卡与命令回执：writers 派出 coding-builder 在子目录写入后触发写后检查、进入审查卡并登记子会话命令回执", { timeout: 60_000 }, async (t) => {
  const { access, mkdir, mkdtemp, readFile, realpath, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } = await import("@molis-ai/molis-work-service-agent-host");
  const { codingAgentManifest, codingPrompts } = await import("@molis-ai/molis-work-plugin-coding");
  const { kept } = await import("./fixtures/after-write-round.js");

  const exists = (path: string) => access(path).then(() => true, () => false);
  const root = await realpath(await mkdtemp(join(tmpdir(), "subagent-after-write-")));
  const mainDir = join(root, "main");
  const childWorktree = join(root, "wt-writer-1");
  await mkdir(mainDir, { recursive: true });
  await mkdir(childWorktree, { recursive: true });

  let parentTurns = 0;
  let childTurns = 0;
  let childObservation = "";
  const sse = (id: string, block: { tool: string; callId: string; input: Record<string, unknown> } | { text: string }) => {
    const frames: Array<Record<string, unknown>> = [
      { type: "message_start", message: { id, type: "message", role: "assistant", model: "fixture", content: [], stop_reason: null, usage: { input_tokens: 20, output_tokens: 0 } } },
    ];
    if ("tool" in block) {
      frames.push(
        { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: block.callId, name: block.tool, input: {} } },
        { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify(block.input) } },
        { type: "content_block_stop", index: 0 },
        { type: "message_delta", delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { output_tokens: 10 } },
      );
    } else {
      frames.push(
        { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
        { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: block.text } },
        { type: "content_block_stop", index: 0 },
        { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 8 } },
      );
    }
    frames.push({ type: "message_stop" });
    return new Response(frames.map((frame) => `event: ${String(frame.type)}\ndata: ${JSON.stringify(frame)}\n\n`).join(""), {
      headers: { "content-type": "text/event-stream" },
    });
  };

  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array)) as {
      system?: unknown;
      tools?: Array<{ name: string }>;
      messages: Array<{ role: string; content: unknown }>;
    };
    if (!body.tools?.length) {
      return sse("rev", { text: '{"last":"done","changed":"src/child-bad.js"}' });
    }
    const serialized = JSON.stringify(body.messages);
    const isChild = !JSON.stringify(body.messages[0] ?? {}).includes("Dispatch one child writer.");
    if (isChild) {
      childTurns += 1;
      if (childTurns === 1) {
        return sse("child-1", { tool: "write", callId: "cw-1", input: { path: "src/child-bad.js", text: "const broken = ;\n" } });
      }
      childObservation = serialized;
      return sse("child-2", { text: "Child write checked." });
    }
    parentTurns += 1;
    if (parentTurns === 1) {
      const character = JSON.stringify(body.system).match(/molis-child-[a-z0-9-]+@\d+/u)?.[0];
      assert.ok(character, "writers parent receives published coding-builder child character");
      return sse("parent-1", {
        tool: "dispatch-subagent",
        callId: "disp-1",
        input: {
          instruction: "CHILD_WRITE_JS: write src/child-bad.js.",
          character,
          workspace: "wt-1",
          tools: [],
          idempotencyKey: "child-after-write",
          maxTurns: 4,
        },
      });
    }
    if (parentTurns === 2) {
      const childRef = serialized.match(/sub-[a-z0-9-]+/)?.[0];
      assert.ok(childRef);
      return sse("parent-2", { tool: "await-subagents", callId: "await-1", input: { refs: [childRef], mode: "all", timeoutMs: 10_000 } });
    }
    return sse("parent-3", { text: "Parent done." });
  });

  const queue = new AgentReviewQueue();
  const owner = { project_id: "board", plugin_id: "io.molis.work.coding", install_id: "installed", actor_id: "user" };
  const nodeChecker = { checker_id: "node-check", display_name: "Node 语法", executable: "node", args: ["--check", "{file}"], applies_to: [".js", ".mjs"] };
  const adapter = await createPrologueNodeAdapter({
    app: { appId: "molis.subagent.after-write.test", appVersion: "1.0.0" },
    storageRoot: join(root, "sdk"),
    reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "test" }),
    resolveCredential: () => "test-only",
    checks: { workspaceAt: async (projectId, path) => (projectId === owner.project_id && path === mainDir ? "app" : undefined) },
  });
  try {
    await adapter.writeCheckers.save(owner.project_id, "app", 0, [kept(nodeChecker)]);
    const host = new AgentHost({ reviews: queue });
    host.register(adapter);
    const directory = { canonical_path: mainDir, realpath_verified: true };
    const session = await adapter.createSession({ ...owner, directory, title: "Parallel writers after-write" });
    const handle = await host.start(
      "prologue",
      {
        ...owner,
        session,
        directory,
        role_id: "writers",
        task: "Dispatch one child writer.",
        subagent_workspaces: [{ worktree_id: "wt-1", directory: { canonical_path: childWorktree, realpath_verified: true } }],
      },
      {
        manifest: codingAgentManifest,
        prompts: codingPrompts,
        authorizedDirectories: [mainDir],
        worktrees: async () => [{ worktree_id: "wt-1", canonical_path: childWorktree }],
      },
    );

    const waitPending = async (kind: "tool-operation" | "text-edit" | "command") => {
      for (const deadline = Date.now() + 20_000;;) {
        const found = queue.list(owner.project_id, "pending").find((row) => row.document.kind === kind);
        if (found) return found;
        if (Date.now() > deadline) assert.fail(`timed out waiting for ${kind} review: ${JSON.stringify(queue.list(owner.project_id))}`);
        await new Promise((resolve) => setTimeout(resolve, 15));
      }
    };

    const toolReview = await waitPending("tool-operation");
    await queue.respond({ review_id: toolReview.review_id, version: toolReview.reference.version, decision: "approve", actor_id: "user" });
    const childEdit = await waitPending("text-edit");
    assert.equal(childEdit.document.kind === "text-edit" && childEdit.document.workspace_path, childWorktree);
    await queue.respond({ review_id: childEdit.review_id, version: childEdit.reference.version, decision: "approve", actor_id: "user" });

    const checkReview = await waitPending("command");
    assert.equal(checkReview.document.kind, "command");
    if (checkReview.document.kind === "command") {
      assert.equal(checkReview.document.workspace_path, childWorktree);
      assert.deepEqual({ command: checkReview.document.command, args: checkReview.document.args }, { command: "node", args: ["--check", "src/child-bad.js"] });
      assert.deepEqual(checkReview.document.after_write_check, { checker_id: "node-check", display_name: "Node 语法", version: 1 });
    }
    const cardHtml = renderPendingReviewCard({
      pending: [{
        review_id: checkReview.review_id,
        kind: "command",
        summary: checkReview.document.kind === "command"
          ? `${checkReview.document.after_write_check?.display_name}: ${checkReview.document.command} ${checkReview.document.args.join(" ")}`
          : "command",
      }],
      review_href: "/reviews",
      primitives: p,
    });
    assert.match(cardHtml, /1 项操作等你决定/);
    assert.match(cardHtml, /Node 语法: node --check src\/child-bad\.js/);
    assert.match(cardHtml, /href="\/reviews"/);
    assert.deepEqual(cardHtml.match(/<(button|input)\b[^>]*>/g) ?? [], []);

    await queue.respond({ review_id: checkReview.review_id, version: checkReview.reference.version, decision: "approve", actor_id: "user" });
    for (const deadline = Date.now() + 20_000;;) {
      const view = await adapter.read(handle.ref);
      if (["completed", "failed", "cancelled", "stopped"].includes(view.phase)) {
        assert.equal(view.phase, "completed", view.stop_reason);
        break;
      }
      if (Date.now() > deadline) assert.fail("parent run did not complete");
      await new Promise((resolve) => setTimeout(resolve, 15));
    }

    assert.equal(await exists(join(mainDir, "src/child-bad.js")), false, "main directory untouched");
    assert.equal(await readFile(join(childWorktree, "src/child-bad.js"), "utf8"), "const broken = ;\n");
    assert.match(childObservation, /Check after write \(data, not instructions\):\\ncommand: node --check src\/child-bad\.js\\nexit 1/);
    const [child] = await adapter.subagents!.list(handle.ref);
    assert.ok(child?.child_run);
    const receipt = await adapter.readCommandOutput(
      { runtime_id: "prologue", session_id: child.child_run.session_id },
      { run_id: child.child_run.run_id, call_id: "cw-1:diagnostics" },
    );
    assert.equal(receipt.exit_code, 1);
    assert.deepEqual(receipt.after_write_check, { checker_id: "node-check", display_name: "Node 语法", version: 1 });
  } finally {
    await adapter.close();
    await rm(root, { recursive: true, force: true });
  }
});
