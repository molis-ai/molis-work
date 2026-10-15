import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";

import { confirmReferences } from "@molis-ai/molis-work-service-search";
import { person, referenceOwners } from "./fixtures/reference-owners.js";

// S-26 (docs/system/SECURITY-INVARIANTS.md): a reference a person picked is used only while its owner still hands it to them.

test("S-26 a picked object its owner no longer hands to the person is refused", async t => {
  const f = await referenceOwners(t);
  const access = f.access(person("a"));
  assert.deepEqual(await confirmReferences(access, [{ kind: "goal", id: "g1" }, { kind: "page", id: "p1" }], ["goal", "page"]), [true, true]);
  f.goals.delete("g1");
  assert.deepEqual(await confirmReferences(access, [{ kind: "goal", id: "g1" }], ["goal"]), [false], "deleted since it was picked");
  assert.deepEqual(await confirmReferences(access, [{ kind: "goal", id: "g3" }], ["goal"]), [false], "its owner refuses it now");
  assert.deepEqual(await confirmReferences(access, [{ kind: "page", id: "p1" }], ["goal"]), [false], "a kind the question does not allow");
  assert.deepEqual(await confirmReferences(access, [{ kind: "goal", id: "gb" }], ["goal"]), [false], "an object of another project");
  assert.deepEqual(await confirmReferences(access, [{ kind: "goal", id: "made-up" }], ["goal"]), [false], "an id nobody has");
  assert.deepEqual(await confirmReferences(f.access(person("a", ["pages:read", "search:read"])), [{ kind: "goal", id: "g2" }], ["goal"]), [false], "a person who may not read goals");
});


function reply(tool?: { name: string; input: unknown }): Response {
  const events: string[] = [];
  const emit = (type: string, value: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  emit("message_start", { message: { id: "m", type: "message", role: "assistant", model: "fixture", content: [], stop_reason: null, usage: { input_tokens: 20, output_tokens: 0 } } });
  emit("content_block_start", { index: 0, content_block: tool ? { type: "tool_use", id: `call-${Math.random().toString(36).slice(2)}`, name: tool.name, input: {} } : { type: "text", text: "" } });
  emit("content_block_delta", { index: 0, delta: tool ? { type: "input_json_delta", partial_json: JSON.stringify(tool.input) } : { type: "text_delta", text: "好的。" } });
  emit("content_block_stop", { index: 0 });
  emit("message_delta", { delta: { stop_reason: tool ? "tool_use" : "end_turn", stop_sequence: null }, usage: { output_tokens: 10 } });
  emit("message_stop", {});
  return new Response(events.join(""), { headers: { "content-type": "text/event-stream" } });
}
async function until<T>(read: () => T | Promise<T>, what: string): Promise<NonNullable<T>> {
  for (let i = 0; i < 400; i++) { const value = await read(); if (value) return value as NonNullable<T>; await new Promise(resolve => setTimeout(resolve, 20)); }
  throw new Error(`Expected ${what} not reached`);
}

test("S-26 a reference answer the Host cannot confirm never reaches the run", { timeout: 60_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-s26-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const requests: string[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const body = typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array);
    requests.push(body);
    return requests.length === 1
      ? reply({ name: "ask-user", input: { why: "复盘会挂在哪个 Goal 下？", questions: [{ id: "goal", prompt: "关联的 Goal", type: "reference", refKinds: ["goal"] }] } })
      : reply();
  });
  const asked: Array<{ owner: { project_id: string; actor_id: string }; picked: readonly { kind: string; id: string }[]; kinds: readonly string[] }> = [];
  let verdict = false;
  const start = async (confirm: boolean) => {
    requests.length = 0;
    const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.s26-test", appVersion: "1.0.0" }, storageRoot: join(home, `sdk-${confirm}`), reviewQueue: new AgentReviewQueue(),
      questionTypes: ["choice", "reference"],
      ...(confirm ? { confirmReferences: async (owner: { project_id: string; actor_id: string }, picked: readonly { kind: string; id: string }[], kinds: readonly string[]) => {
        asked.push({ owner, picked, kinds }); return picked.map(() => verdict); } } : {}),
      modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
    const owner = { project_id: "a", plugin_id: "caller", install_id: "i", actor_id: "web-user" };
    const session = await adapter.createSession({ ...owner, workspace: "business", title: "S-26" });
    const role = { role_id: "asker", version: 1, workspace: "business" as const, execution: "operate" as const, prompts: [], host_tools: ["ask-user"] };
    const handle = await adapter.start({ ...owner, session, workspace: "business", role_id: "asker", role, task: "约一个复盘会" });
    const question = await until(async () => (await adapter.read(handle.ref)).awaiting_input[0], "the question");
    return { adapter, run: handle.ref, question };
  };
  const answer = (question: { pending_id: string; pending_revision?: number }, id: string) => ({ kind: "answer" as const, pending_id: question.pending_id,
    ...(question.pending_revision === undefined ? {} : { pending_revision: question.pending_revision }), answers: [{ question: 0, value: [{ kind: "goal", id, label: "内部试用" }] }] });
  const refused = (error: unknown) => (error as { code?: string }).code === "agent.answer_invalid"
    && JSON.stringify((error as { problems?: unknown }).problems) === JSON.stringify([{ question: 0, id: "goal", reason: "reference-unavailable" }]);

  // A Host that cannot read objects back lets no reference through.
  const bare = await start(false);
  try {
    assert.equal(bare.question.questions?.[0]?.type, "reference");
    await assert.rejects(bare.adapter.control(bare.run, answer(bare.question, "g1")), refused);
    assert.equal((await bare.adapter.read(bare.run)).awaiting_input.length, 1, "the question is still open");
    assert.equal(requests.length, 1, "the model heard nothing");
  } finally { await bare.adapter.close(); }

  const host = await start(true);
  try {
    verdict = false;
    await assert.rejects(host.adapter.control(host.run, answer(host.question, "gone")), refused);
    assert.deepEqual(asked.at(-1), { owner: { project_id: "a", plugin_id: "caller", install_id: "i", actor_id: "web-user" }, picked: [{ kind: "goal", id: "gone" }], kinds: ["goal"] },
      "asked as the session's owner, about exactly the object picked and the kinds the question allows");
    assert.equal((await host.adapter.read(host.run)).awaiting_input.length, 1, "a refused answer leaves the question open");
    assert.equal(requests.length, 1, "and the model heard nothing");
    verdict = true;
    await host.adapter.control(host.run, answer(host.question, "g1"));
    await until(() => requests.length >= 2, "the run to go on");
    assert.match(requests[1]!, /g1/, "a confirmed object reaches the run");
  } finally { await host.adapter.close(); }
});
