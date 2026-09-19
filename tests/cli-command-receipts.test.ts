import assert from "node:assert/strict";
import test from "node:test";

import {
  CLI_RECEIPT_MAX_BYTES,
  applyCliStreamLine,
  emptyStreamState,
} from "@molis-ai/molis-work-service-agent-host";

/** 流按行喂入，所以测试也按行喂。 */
const feed = (state: Parameters<typeof applyCliStreamLine>[0], event: unknown) =>
  applyCliStreamLine(state, JSON.stringify(event), AT);

/**
 * CLI 能说清它跑过的命令产生了什么——这和「能不能在宿主审批下跑命令」是两件事。
 */

const AT = "2026-09-19T14:00:00Z";

function bash(callId: string, command: string) {
  return {
    type: "assistant",
    message: { content: [{ type: "tool_use", id: callId, name: "Bash", input: { command } }] },
  };
}

function result(callId: string, content: unknown, isError = false) {
  return {
    type: "user",
    message: { content: [{ type: "tool_result", tool_use_id: callId, content, is_error: isError }] },
  };
}

test("跑过的命令留下回执，退出码是「未知」而不是 0", () => {
  const state = emptyStreamState();
  feed(state, bash("c1", "pnpm test"));
  feed(state, result("c1", "42 passing\n"));

  assert.equal(state.receipts.length, 1);
  const receipt = state.receipts[0]!;
  assert.equal(receipt.ref.call_id, "c1");
  assert.equal(receipt.command, "pnpm test");
  assert.equal(receipt.stdout, "42 passing\n");
  assert.equal(receipt.stderr, "");
  assert.equal(receipt.exit_code, null, "CLI 只说成功/失败，填 0 等于编一个结果");
  assert.equal(receipt.truncated, false);
});

test("失败的命令，输出进 stderr 而不是混进 stdout", () => {
  const state = emptyStreamState();
  feed(state, bash("c1", "pnpm build"));
  feed(state, result("c1", "error TS2304", true));

  const receipt = state.receipts[0]!;
  assert.equal(receipt.stderr, "error TS2304");
  assert.equal(receipt.stdout, "");
  assert.equal(receipt.exit_code, null);
});

test("不是命令的工具调用不留回执——读文件不该出现在终端页", () => {
  const state = emptyStreamState();
  feed(state, {
    type: "assistant",
    message: { content: [{ type: "tool_use", id: "c1", name: "Read", input: { file_path: "a.ts" } }] },
  });
  feed(state, result("c1", "文件内容"));

  assert.deepEqual(state.receipts, []);
  assert.equal(state.activity.length, 1, "它仍然是一次工具活动，只是不是命令回执");
});

test("tool_result 以文本块数组到达时也能读出来", () => {
  const state = emptyStreamState();
  feed(state, bash("c1", "ls"));
  feed(state, result("c1", [
    { type: "text", text: "a.ts" },
    { type: "text", text: "b.ts" },
  ]));
  assert.equal(state.receipts[0]?.stdout, "a.ts\nb.ts");
});

test("超长输出被截断，并且如实标出来", () => {
  const state = emptyStreamState();
  feed(state, bash("c1", "cat huge.log"));
  feed(state, result("c1", "x".repeat(CLI_RECEIPT_MAX_BYTES + 5_000)));

  const receipt = state.receipts[0]!;
  assert.equal(receipt.truncated, true, "截断了就要说截断了");
  assert.equal(Buffer.byteLength(receipt.stdout, "utf8") <= CLI_RECEIPT_MAX_BYTES, true);
});

test("同一轮里多条命令各自留回执，互不覆盖", () => {
  const state = emptyStreamState();
  feed(state, bash("c1", "pnpm build"));
  feed(state, bash("c2", "pnpm test"));
  feed(state, result("c2", "ok"));
  feed(state, result("c1", "built"));

  assert.deepEqual(state.receipts.map((entry) => [entry.command, entry.stdout]),
    [["pnpm build", "built"], ["pnpm test", "ok"]]);
});
