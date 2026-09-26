import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commitDraftMaterial, commitMessageFrom, COMMIT_DRAFT_INSTRUCTIONS } from "@molis-ai/molis-work-plugin-coding";
import { draftText } from "@molis-ai/molis-work-app-local-host";
import type { AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";

const run = (task: string, answer: string) => ({ turns: [{ turn_id: "u", kind: "user", text: task, at: null }, { turn_id: "a", kind: "assistant", text: answer, at: null }] }) as unknown as AgentRunView;
const change = (path: string, before: string | null, after: string, execution = "applied") => ({ files: [{ path, kind: before === null ? "added" : "modified", added_lines: 1, removed_lines: before === null ? 0 : 1, diff: "",
  review: { review_id: "r", before_text: before, after_text: after, decision: "approved", execution } }] }) as never;

test("提交说明的材料：计划标题、每轮的要求与结论、实际落盘的改动；没落盘的不算；太长时先舍最早的轮次", () => {
  const material = commitDraftMaterial({ planTitle: "让 @ 引用支持无扩展名文件", rounds: [
    { number: 4, run: run("按计划执行", "改了 mentionedPaths"), change: change("src/mentions.ts", "a\nfilter(/[./]/)\nc\n", "a\nfilter(none)\nc\n") },
    { number: 9, run: run("只提到裸名字又读不到时不要留空标题", "加了 parts 为空时原样返回"), change: change("src/rejected.ts", "x\n", "y\n", "not-applied") },
  ] });
  assert.match(material, /^这些改动服务的计划：让 @ 引用支持无扩展名文件/);
  assert.match(material, /### 第 4 轮\n要求：按计划执行\n结论：改了 mentionedPaths/);
  assert.match(material, /#### src\/mentions\.ts（修改，\+1 −1）\n.*- filter\(\/\[\.\/\]\/\)\n\+ filter\(none\)/s);
  assert.doesNotMatch(material, /rejected\.ts/, "a write that never landed is not described as a change");
  const long = commitDraftMaterial({ rounds: Array.from({ length: 20 }, (_, index) => index + 1).map(number => ({ number, run: run("第 " + number + " 轮的要求", "x"), change: change("f" + number + ".ts", null, "y\n".repeat(20_000)) })) });
  assert.ok(long.length <= 58_100);
  assert.doesNotMatch(long, /### 第 1 轮\n/, "the oldest round goes first"); assert.match(long, /### 第 20 轮/);
  assert.equal(commitMessageFrom("```text\nfix: 标题\n\n- 要点\n```"), "fix: 标题\n\n- 要点");
  assert.match(COMMIT_DRAFT_INSTRUCTIONS, /不编造/);
});

test("packed SDK: 起草是一次不带工具的模型调用，材料和写法都送到，返回用量，用完不留痕", { timeout: 30_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-draft-")); const bodies: any[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    bodies.push(JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array)));
    const events: string[] = [], emit = (type: string, value: unknown) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value as object })}\n\n`);
    emit("message_start", { message: { id: "m", type: "message", role: "assistant", model: "fixture", content: [], stop_reason: null, usage: { input_tokens: 120, output_tokens: 0 } } });
    emit("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
    emit("content_block_delta", { index: 0, delta: { type: "text_delta", text: "feat: 裸名字也能用 @ 引用\n\n- 放行不带 . 和 / 的名字" } });
    emit("content_block_stop", { index: 0 }); emit("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 30 } }); emit("message_stop", {});
    return new Response(events.join(""), { headers: { "content-type": "text/event-stream" } });
  });
  try {
    const result = await draftText({ modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "test" }),
      resolveCredential: () => "test-only" }, join(home, "drafts"), "board", { purpose: "起草 git 提交说明", instructions: "只写提交说明。WRITE_RULES", material: "### 第 4 轮\nMATERIAL_BODY" });
    assert.equal(result.text, "feat: 裸名字也能用 @ 引用\n\n- 放行不带 . 和 / 的名字");
    assert.deepEqual(result.usage, { input: 120, output: 30 });
    assert.equal(bodies.length, 1);
    assert.equal((bodies[0].tools ?? []).length, 0, "the draft has no tools");
    assert.match(JSON.stringify(bodies[0].system), /WRITE_RULES/);
    assert.match(JSON.stringify(bodies[0].messages), /MATERIAL_BODY/);
    assert.deepEqual(await readdir(join(home, "drafts")), [], "nothing is left behind");
    await assert.rejects(draftText({ modelConfiguration: async () => null, resolveCredential: () => null }, join(home, "drafts"), "board", { purpose: "p", instructions: "i", material: "" }), /为空或过长/);
  } finally { await rm(home, { recursive: true, force: true }); }
});
