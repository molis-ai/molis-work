import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import type { AgentMemoryCaller, AgentMemoryExtractor, AgentMemoryFormationInput } from "@molis-ai/molis-work-contracts/services/agent-host";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { hostTextGeneration, type HostTextGeneration } from "@molis-ai/molis-work-app-local-host";
import { memoryServiceHome, originalMemorySources } from "./fixtures/memory-service-home.js";

// MEM-12/21/34/35: one persistent formation path, exact originals, bounded targets and current-authority recovery.
const caller: AgentMemoryCaller = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "project-form", consumer: "assistant", current_scene: "common", purpose: "management" };
const words = "以后汇报都先说明风险";
const slot = { id: "new-risk", scope: "project" as const, owner: "project-form", origin: "形成专项",
  meta: { kind: "convention", source: "accepted", classification: { scenes: ["common"], lifecycle: "long-term" } } };
const request = (operation_id: string): AgentMemoryFormationInput => ({ operation_id, trigger: "run-end", sources: [{ event_id: "original-a", version: "1" }], slots: [slot] });
const draft: Awaited<ReturnType<AgentMemoryExtractor["extract"]>> = { drafts: [{ slot_id: slot.id, text: words, suggested_basis: "explicit",
  evidence: [{ source: { event_id: "original-a", version: "1" }, quote: words }] }], usage: { input_tokens: 12, output_tokens: 4 } };

async function fixture(t: test.TestContext, extractor?: AgentMemoryExtractor) {
  const sources = originalMemorySources(["project-form"]); sources.add("original-a", words);
  const env = await memoryServiceHome(t, { projects: ["project-form"], sources: sources.port, ...(extractor ? { extractor } : {}) });
  await env.open();
  return { ...env, sources, bound: () => env.memory().withCaller(caller) };
}

test("formation none and missing extractor preserve zero source/model reads", async t => {
  let calls = 0;
  const env = await fixture(t, { async extract() { calls++; return draft; } });
  let reads = 0, validations = 0;
  t.mock.method(env.sources.port, "resolve", async () => { reads++; return []; });
  const skipped = await env.bound().candidates.form({ operation_id: "none", trigger: "none", validate_context: async () => { validations++; throw new Error("none must not validate context"); } });
  assert.equal(skipped.outcome, "skipped"); assert.deepEqual(skipped.extraction, { calls: 0 });
  assert.equal(calls, 0); assert.equal(reads, 0); assert.equal(validations, 0);
  const missing = await fixture(t);
  t.mock.method(missing.sources.port, "resolve", async () => { reads++; return []; });
  const unavailable = await missing.bound().candidates.form(request("missing"));
  assert.equal(unavailable.outcome, "unavailable"); assert.equal(unavailable.extraction.calls, 0); assert.equal(reads, 0);
});

test("reported extraction use survives final source revocation while persistent candidates stay empty", async t => {
  const env = await fixture(t, { async extract() { env.sources.entries.clear(); return draft; } });
  const result = await env.bound().candidates.form(request("revoked"));
  assert.equal(result.outcome, "failed"); assert.deepEqual(result.extraction, { calls: 1, usage: draft.usage });
  assert.equal(result.items[0]?.outcome, "unknown");
  assert.deepEqual(await env.bound().candidates.list("project", "project-form"), []);
  await env.close(); await env.open();
  assert.deepEqual(await env.bound().candidates.list("project", "project-form"), []);
});

test("cancelling an outstanding extractor returns unknown use and late completion cannot write", async t => {
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const env = await fixture(t, { async extract() { entered.resolve(); await release.promise; return draft; } });
  const controller = new AbortController();
  const pending = env.bound().candidates.form({ ...request("cancelled"), signal: controller.signal });
  await entered.promise; controller.abort();
  const result = await pending; assert.equal(result.outcome, "cancelled");
  assert.deepEqual(result.extraction, { calls: 1 }, "no completed extractor receipt was accepted before cancellation");
  release.resolve(); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(await env.bound().candidates.list("project", "project-form"), []);
  await env.close(); await env.open(); assert.deepEqual(await env.bound().candidates.list("project", "project-form"), []);
});

test("concurrent formation calls retain their own immutable caller and one-call context", async t => {
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const seen: Array<{ operation: string; project: string | null; title?: string }> = [];
  const env = await fixture(t, { async extract(who, input) {
    if (input.operation_id === "first") { entered.resolve(); await release.promise; }
    seen.push({ operation: input.operation_id, project: who.project_id, title: input.context?.work_title });
    return { drafts: [] };
  } });
  const context = { work_title: "first original title", existing: [], pending: [] };
  const first = env.bound().candidates.form({ ...request("first"), context });
  context.work_title = "mutated outside";
  await entered.promise;
  const second = await env.bound().candidates.form({ ...request("second"), context: { work_title: "second title", existing: [], pending: [] } });
  release.resolve(); assert.equal((await first).outcome, "completed"); assert.equal(second.outcome, "completed");
  assert.deepEqual(seen, [{ operation: "second", project: "project-form", title: "second title" },
    { operation: "first", project: "project-form", title: "first original title" }]);
});

test("Host extractor performs one real HTTP generation, preserves canonical evidence and usage, and rejects invented slots", { timeout: 30_000 }, async t => {
  const sources = originalMemorySources(["project-form"]); sources.add("original-a", words);
  let body: object = { drafts: [{ slot_id: "d0", text: words, suggested_basis: "inferred", applies_when: { task: "汇报" }, evidence: [{ source_id: "s0", quote: words }] }] };
  const prompts: string[] = [];
  const server = createServer(async (req, response) => {
    let raw = ""; for await (const chunk of req) raw += chunk;
    const payload = JSON.parse(raw) as { messages: Array<{ content: string }> };
    prompts.push(payload.messages.map(message => message.content).join("\n"));
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.end(`data: ${JSON.stringify({ model: "fixture", choices: [{ index: 0, delta: { content: JSON.stringify(body) }, finish_reason: null }] })}\n\n`
      + `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 18, completion_tokens: 7 } })}\n\ndata: [DONE]\n\n`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const address = server.address(); assert.ok(address && typeof address !== "string");
  let generate: HostTextGeneration | undefined;
  const env = await memoryServiceHome(t, { projects: ["project-form"], sources: sources.port, generate: (prompt, options) => generate!(prompt, options) });
  await env.open();
  generate = hostTextGeneration({ homeDirectory: env.home, env: { MOLIS_WORK_TEXT_API_KEY: "fixture-only", MOLIS_WORK_TEXT_API_FORMAT: "openai-chat-completions",
    MOLIS_WORK_TEXT_BASE_URL: `http://127.0.0.1:${address.port}/v1`, MOLIS_WORK_TEXT_MODEL: "fixture" }, resolveInference: async () => env.adapter().inference });
  const bound = () => env.memory().withCaller(caller);
  const result = await bound().candidates.form({ ...request("http"), context: { replaying: true, work_title: "本轮工作", existing: [],
    pending: [{ candidate_id: "visible-old", version: 1, scope: "project", kind: "fact", text: "旧草稿", sources: [{ event_id: "hidden-identity", version: "1" }], applies: { task: "hidden-applicability" } }] } });
  assert.equal(result.outcome, "completed"); assert.equal(prompts.length, 1);
  assert.deepEqual(result.extraction, { calls: 1, usage: { input_tokens: 18, output_tokens: 7 } });
  assert.doesNotMatch(prompts[0]!, /hidden-identity|hidden-applicability|replaying/);
  const [candidate] = await bound().candidates.list("project", "project-form");
  assert.equal(candidate!.suggested_basis, "inferred"); assert.equal(candidate!.meta.basis, undefined);
  assert.equal(candidate!.meta.applies_when?.task, "汇报");
  assert.deepEqual(candidate!.sources?.map(({ event_id, version }) => ({ event_id, version })), [{ event_id: "original-a", version: "1" }]);
  let validations = 0;
  const denied = await bound().candidates.form({ ...request("context-revoked"), validate_context: async () => {
    if (++validations === 2) throw new Error("Context permission was revoked before dispatch");
  } });
  assert.equal(validations, 2, "the fixed snapshot is checked again at the real dispatch boundary");
  assert.equal(denied.outcome, "failed"); assert.deepEqual(denied.extraction, { calls: 1 });
  assert.equal(prompts.length, 1, "extractor invocation is not an HTTP request: revoked context never reaches the model");
  assert.equal((await bound().candidates.list("project", "project-form")).length, 1);
  body = { drafts: [{ slot_id: "model-invented", text: words, suggested_basis: "explicit", evidence: [{ source_id: "s0", quote: words }] }] };
  const invalid = await bound().candidates.form(request("invalid"));
  assert.equal(invalid.outcome, "failed"); assert.equal(invalid.extraction.calls, 1); assert.equal(prompts.length, 2);
  assert.equal((await bound().candidates.list("project", "project-form")).length, 1, "malformed output creates no new candidate");
});
