import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter, type AgentStartAuthority } from "@molis-ai/molis-work-service-agent-host";
import { codingAgentManifest, codingPrompts } from "@molis-ai/molis-work-plugin-coding";
import type { AgentFrozenCharacter, AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";

function completionResponse(text = "Fixture complete."): Response {
  const events: string[] = [];
  const emit = (type: string, data: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
  emit("message_start", { message: { id: "msg_character", type: "message", role: "assistant", model: "fixture-model", content: [], stop_reason: null, usage: { input_tokens: 30, output_tokens: 0 } } });
  emit("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
  emit("content_block_delta", { index: 0, delta: { type: "text_delta", text } });
  emit("content_block_stop", { index: 0 });
  emit("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 8 } });
  emit("message_stop", {});
  return new Response(events.join(""), { headers: { "content-type": "text/event-stream" } });
}

test("packed SDK consumes the Host-frozen Character instructions and narrowed tools, and restores the exact source after restart", { timeout: 30_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), "molis-character-sdk-")), requests: any[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    requests.push(JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array)));
    return completionResponse();
  });
  const make = () => createPrologueNodeAdapter({ app: { appId: "io.molis.work.character-test", appVersion: "1.0.0" }, storageRoot: join(root, "runtime"),
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture-model", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
  let adapter: Awaited<ReturnType<typeof make>> | undefined;
  try {
    adapter = await make(); const host = new AgentHost(); host.register(adapter);
    const owner = { board_id: "b", plugin_id: "caller", install_id: "i", actor_id: "u" }, directory = { canonical_path: root, realpath_verified: true };
    const session = await adapter.createSession({ ...owner, directory, title: "Character freeze" });
    const original: AgentFrozenCharacter = { character_id: "profile", title: "Verifier", instructions: "CHARACTER_FIXED_V2: cite actual evidence.", host_tools: ["read-file"],
      source: { owner_actor_id: "u", draft_revision: 3 }, reference: { artifact_id: "character:b:profile", version: 2 }, board_id: "b", content_digest: "fixed",
      producer: { plugin_id: "io.molis.work.characters", plugin_version: "1.0.0", binding_signature: "official-characters-binding" }, published_at: "2026-09-22T00:00:00Z" };
    const expected = structuredClone(original);
    const authority: AgentStartAuthority = { manifest: { roles: [{ role_id: "reader", version: 1, name: "Reader", prompts: ["base", "reader"], host_tools: ["read-file", "search"] }],
      prompts: [{ prompt_id: "base", version: 1 }, { prompt_id: "reader", version: 1 }], characters: { selection: "optional-exact-artifact", scope: "project-owner", role_ids: ["reader"] } },
      authorizedDirectories: [root], prompts: [{ prompt_id: "base", version: 1, layer: "base", body: "BASE_MARKER" }, { prompt_id: "reader", version: 1, layer: "role", body: "ROLE_MARKER" }],
      project_prompts: [{ prompt_id: "project", version: 1, body: "PROJECT_MARKER" }], resolveCharacter: () => original };
    const task = "Inspect the repository without changing files.";
    const starting = host.start("prologue", { ...owner, session, directory, task, role_id: "reader", character: original.reference }, authority);
    original.instructions = "LATER_UNPUBLISHED_EDIT"; original.host_tools.push("search");
    const handle = await starting;
    const view = await new Promise<AgentRunView>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("fixture did not finish")), 10_000); let off = () => {};
      off = adapter!.observe(handle.ref, value => { if (["completed", "failed", "cancelled"].includes(value.phase)) { clearTimeout(timer); queueMicrotask(() => off()); resolve(value); } });
    });
    assert.equal(view.phase, "completed", view.stop_reason); assert.equal(requests.length, 1);
    const system = JSON.stringify(requests[0].system);
    assert.ok(system.includes(expected.instructions), system); assert.ok(!system.includes("LATER_UNPUBLISHED_EDIT"));
    assert.ok(!/\b(list|search)\b/.test(system), "SDK must not prescribe tools outside this frozen read-only scope");
    assert.ok(system.indexOf("BASE_MARKER") < system.indexOf("ROLE_MARKER"));
    assert.ok(system.indexOf("ROLE_MARKER") < system.indexOf(expected.instructions));
    assert.ok(system.indexOf(expected.instructions) < system.indexOf("PROJECT_MARKER"));
    const names = (requests[0].tools ?? []).map((tool: { name: string }) => tool.name);
    assert.ok(names.includes("read"), JSON.stringify(names)); assert.ok(!names.includes("search"), JSON.stringify(names));
    assert.deepEqual(view.frozen.character, expected); assert.deepEqual(view.frozen.host_tools, ["read-file"]); assert.equal(view.turns[0]?.text, task);
    await adapter.close(); adapter = await make();
    assert.deepEqual((await adapter.readSession(session)).latest_run?.frozen.character, expected);
    assert.equal(requests.length, 1, "restoring history never asks the model to regenerate Character context");
  } finally { await adapter?.close(); await rm(root, { recursive: true, force: true }); }
});

// Use the actual product prompts and one persistent SDK session: short marker
// fixtures alone cannot detect truncation or a stale persona on the next run.
test("packed SDK sends full Coding prompts and the current Character on consecutive runs", { timeout: 30_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), "molis-coding-character-wire-"));
  const requests: any[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const request = JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array));
    if (JSON.stringify(request.system).includes(codingPrompts.find(prompt => prompt.prompt_id === "coding-compaction")!.body.split("\n")[0]!)) return completionResponse(JSON.stringify({ selections: [] }));
    requests.push(request);
    return completionResponse();
  });
  const host = new AgentHost({ reviews: new AgentReviewQueue() });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.character-wire", appVersion: "1.0.0" },
    storageRoot: join(root, "runtime"), reviewQueue: host.reviews,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture-model", credential_ref: "fixture", prompt_cache: "off" }),
    resolveCredential: () => "fixture-only" });
  try {
    host.register(adapter);
    const owner = { board_id: "b", plugin_id: "io.molis.work.coding", install_id: "i", actor_id: "u" };
    const directory = { canonical_path: root, realpath_verified: true };
    const session = await adapter.createSession({ ...owner, directory, title: "Coding Character delivery" });
    const instructions = [
      "你的职责是把修改与验证闭环。先用简短清单说明本任务的完成条件，再读取真实代码并做必要的最小修改。修改后运行项目已有的相关测试，以实际命令回执判断结果。最终逐项列出完成条件、对应证据和仍未验证的事项；未实际运行或无法证明的内容标为 UNVERIFIED，不把推断写成通过。遵守原有权限与宿主审查。",
      "你的职责是完成有据可查、少打断用户的代码检查。用户已经给出文件路径时，先用读取文件工具直接读取该文件和约定文档；只有路径未知或读取失败才搜索定位，不要仅为列目录运行命令。读完要求后列出具体完成条件，核对实现和已有相关测试，再运行必要的测试命令取得实际回执；不要把静态阅读当作测试通过。没有发现需要修改的问题就保留文件原样，不额外改文档或扩展范围。最终将每条结论对应到代码、实际测试回执或未验证项；证据不足标为 UNVERIFIED，不把推断写成通过。遵守调用方工具范围和宿主审查，不请求永久放行。",
    ];
    const tail = "长角色末尾：只依据实际回执报告结果。";
    instructions.push("角色说明。".repeat(4_000).slice(0, 20_000 - tail.length) + tail);
    const profile = (version: number): AgentFrozenCharacter => ({ character_id: "profile", title: "Verifier", instructions: instructions[version - 1]!, host_tools: null,
      source: { owner_actor_id: "u", draft_revision: version }, reference: { artifact_id: "character:b:profile", version }, board_id: "b", content_digest: `digest-${version}`,
      producer: { plugin_id: "io.molis.work.characters", plugin_version: "1.0.0", binding_signature: "official-characters-binding" }, published_at: "2026-09-22T00:00:00Z" });
    const authority: AgentStartAuthority = { manifest: codingAgentManifest, authorizedDirectories: [root], prompts: [...codingPrompts], resolveCharacter: ref => profile(ref.version) };
    const task = "请检查 shipping.mjs 是否符合 README 的要求，完成这次代码检查。";
    for (const version of [null, 1, 2, 3, null]) {
      const before = requests.length;
      const handle = await host.start("prologue", { ...owner, session, directory, task, role_id: "builder",
        ...(version ? { character: profile(version).reference } : {}) }, authority);
      const view = await new Promise<AgentRunView>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Coding fixture did not finish")), 10_000); let off = () => {};
        off = adapter.observe(handle.ref, value => { if (["completed", "failed", "cancelled"].includes(value.phase)) { clearTimeout(timer); queueMicrotask(() => off()); resolve(value); } });
      });
      assert.equal(view.phase, "completed", view.stop_reason);
      assert.equal(requests.length, before + 1);
      const wireSystem = requests.at(-1).system;
      const system = typeof wireSystem === "string" ? wireSystem : wireSystem.map((block: { text: string }) => block.text).join("\n");
      for (const id of ["coding-base", "coding-builder"]) assert.ok(system.includes(codingPrompts.find(prompt => prompt.prompt_id === id)!.body), `missing full ${id}`);
      for (let i = 0; i < instructions.length; i++) assert.equal(system.includes(instructions[i]!), version === i + 1, `wrong Character body on run ${before + 1}`);
      assert.ok(!system.includes("[truncated:"));
      assert.equal(view.frozen.character?.reference.version ?? null, version);
      assert.deepEqual(view.frozen.host_tools, codingAgentManifest.roles.find(role => role.role_id === "builder")!.host_tools);
    }
    const beforeRejected = requests.length;
    const runsBeforeRejected = await adapter.readSession(session);
    await assert.rejects(host.start("prologue", { ...owner, session, directory, task, role_id: "builder", character: profile(2).reference },
      { ...authority, project_prompts: [{ prompt_id: "project-long", version: 1, body: "项目指令。".repeat(13_000) }] }), /合计超过 64000 字符，未启动执行/);
    assert.equal(requests.length, beforeRejected, "oversize composition never reaches the model");
    assert.deepEqual(await adapter.readSession(session), runsBeforeRejected, "rejected instructions do not create an unfinished execution");
    assert.equal(host.reviews.list("b", "pending").length, 0);
  } finally { await adapter.close(); await rm(root, { recursive: true, force: true }); }
});
