import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commitDraftMaterial, commitMessageFrom, CODING_COMMIT_DRAFT, CODING_INSTRUCTIONS } from "@molis-ai/molis-work-plugin-coding";
import { draftText } from "@molis-ai/molis-work-app-local-host";
import { agentDefinitionsFor } from "../apps/local-host/src/agent-definitions/agent-definitions.js";
import { builtinRegistrations } from "../apps/local-host/src/agent-definitions/builtin-registrations.js";
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
  assert.match(CODING_COMMIT_DRAFT.body, /不编造/);
});

test("packed SDK: drafts share their owning Runtime, have no tools and leave no draft workspace", { timeout: 30_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "molis-draft-")); const bodies: any[] = [];
  const server = createServer(async (request, response) => {
    let raw = ""; for await (const chunk of request) raw += chunk;
    bodies.push(JSON.parse(raw));
    const events: string[] = [], emit = (type: string, value: unknown) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value as object })}\n\n`);
    emit("message_start", { message: { id: "m", type: "message", role: "assistant", model: "fixture", content: [], stop_reason: null, usage: { input_tokens: 120, output_tokens: 0 } } });
    emit("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
    emit("content_block_delta", { index: 0, delta: { type: "text_delta", text: "feat: 裸名字也能用 @ 引用\n\n- 放行不带 . 和 / 的名字" } });
    emit("content_block_stop", { index: 0 }); emit("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 30 } }); emit("message_stop", {});
    response.writeHead(200, { "content-type": "text/event-stream" }); response.end(events.join(""));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.draft-test", appVersion: "1.0.0" }, storageRoot: join(home, "owner-runtime") });
  const options = { homeDirectory: home, env: { MOLIS_WORK_TEXT_API_KEY: "test-only", MOLIS_WORK_TEXT_BASE_URL: `http://127.0.0.1:${address.port}`,
    MOLIS_WORK_TEXT_API_FORMAT: "anthropic-messages", MOLIS_WORK_TEXT_MODEL: "fixture" }, resolveInference: async () => adapter.inference };
  const before = await readdir(home), refs: string[] = [];
  try {
    for (let index = 0; index < 2; index++) {
      const result = await draftText(options, { purpose: "起草 git 提交说明", instructions: "只写提交说明。WRITE_RULES", material: "### 第 4 轮\nMATERIAL_BODY" },
        { onProgress: event => { if (event.type === "started") refs.push(event.run_ref.id); } });
      assert.equal(result.text, "feat: 裸名字也能用 @ 引用\n\n- 放行不带 . 和 / 的名字");
      assert.deepEqual(result.usage, { input: 120, output: 30 });
    }
    assert.equal(bodies.length, 2); assert.equal(new Set(refs).size, 2);
    for (const body of bodies) {
      assert.equal((body.tools ?? []).length, 0);
      assert.match(JSON.stringify(body.system), /WRITE_RULES/);
      assert.match(JSON.stringify(body.messages), /MATERIAL_BODY/);
    }
    assert.deepEqual(await readdir(home), before, "no per-draft runtime or directory is created");
    await assert.rejects(draftText(options, { purpose: "p", instructions: "i", material: "" }), /为空或过长/);
    assert.equal(bodies.length, 2);

    const definitions = agentDefinitionsFor(home, builtinRegistrations), pluginId = "io.molis.work.coding";
    const named = { purpose: "整理材料", prompt: "coding.commit-draft", material: "UNTRUSTED_MATERIAL" };
    const key = `${pluginId}/${named.prompt}`;
    assert.equal(definitions.uses(key).length, 0);
    await assert.rejects(draftText(options, named), { code: "actions.host_context_missing" });
    await assert.rejects(draftText(options, { ...named, instructions: "ambiguous" }, { pluginId }), /不能同时/);
    await assert.rejects(draftText(options, { ...named, prompt: "missing" }, { pluginId }), { code: "agent_definitions.not_found" });
    await assert.rejects(draftText(options, named, { pluginId: "io.molis.work.jelly" }), { code: "agent_definitions.not_found" });
    for (const stop of ["cancel", "revoke"] as const) {
      const controller = new AbortController(), entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
      const pending = draftText(options, named, { pluginId, signal: controller.signal, beforeDispatch: async () => {
        entered.resolve(); await release.promise; if (stop === "revoke") throw new Error("revoked");
      } });
      const rejected = assert.rejects(pending, stop === "cancel" ? { name: "AbortError" } : /revoked/);
      await entered.promise;
      if (stop === "cancel") controller.abort();
      release.resolve(); await rejected;
    }
    assert.equal(definitions.uses(key).length, 0, "rejected calls do not record prompt use");
    assert.equal(bodies.length, 2, "rejected calls do not dispatch a model");

    for (const prompt of CODING_INSTRUCTIONS) {
      const promptKey = `${pluginId}/${prompt.prompt_id}`;
      assert.equal(definitions.prompt(promptKey).default_body, prompt.body);
      const edited = `User instructions for ${prompt.prompt_id}: ` + "Preserve evidence. ".repeat(240);
      definitions.save(promptKey, edited, null, "owner");
      await draftText(options, { ...named, prompt: prompt.prompt_id }, { pluginId });
      assert.match(JSON.stringify(bodies.at(-1).system), new RegExp(prompt.prompt_id));
      assert.ok(JSON.stringify(bodies.at(-1).system).includes(edited));
      assert.doesNotMatch(JSON.stringify(bodies.at(-1).system), /UNTRUSTED_MATERIAL/);
      assert.match(JSON.stringify(bodies.at(-1).messages), /UNTRUSTED_MATERIAL/);
      assert.deepEqual(definitions.uses(promptKey).map(use => [use.version, use.user_revision, use.caller]), [[1, 1, pluginId]]);
    }
    const otherHome = join(home, "another-home");
    await draftText({ ...options, homeDirectory: otherHome }, named, { pluginId });
    assert.ok(JSON.stringify(bodies.at(-1).system).includes(CODING_COMMIT_DRAFT.body.split("\n")[0]!));
    assert.doesNotMatch(JSON.stringify(bodies.at(-1).system), /User instructions/);
    assert.equal(bodies.length, 5);
  } finally {
    await adapter.close(); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve())); await rm(home, { recursive: true, force: true });
  }
});
