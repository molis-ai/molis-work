import assert from "node:assert/strict";
import test from "node:test";
import { hostCompleteText, type HostTextOptions } from "../apps/local-host/src/host-complete-text.js";
const env = () => ({ MOLIS_WORK_TEXT_API_KEY: "private-fixture-key", MOLIS_WORK_TEXT_BASE_URL: "https://model.example/v1", MOLIS_WORK_TEXT_API_FORMAT: "openai-chat-completions", MOLIS_WORK_TEXT_MODEL: "chosen-model" });
type Resolver = NonNullable<HostTextOptions["resolveInference"]>;
type Client = Awaited<ReturnType<Resolver>>;
const resolver = (completeText: Client["completeText"]): Resolver => async () => ({ completeText } as Client);

test("bounded text uses Prologue's native protocol, fixed model, endpoint and credential reference", async () => {
  let calls = 0;
  const complete = hostCompleteText({ env: env(), resolveInference: resolver(async input => {
    calls++;
    assert.equal(input.protocol, "openai-compatible");
    assert.equal(input.endpoint, "https://model.example/v1/chat/completions");
    assert.equal(input.model, "chosen-model");
    assert.equal(input.prompt, "original material");
    assert.equal(input.max_output_tokens, 5000);
    assert.equal(input.timeout_ms, 120_000);
    assert.equal(await input.resolveCredential(input.credential_ref), "private-fixture-key");
    assert.equal(await input.resolveCredential("unrelated-ref"), null);
    return "  result  ";
  }) })!;
  assert.equal(calls, 0);
  assert.equal(await complete("original material"), "result");
  assert.equal(calls, 1);
});

test("revoking a credential during Runtime initialization prevents model dispatch", async () => {
  const source = env(), entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  let calls = 0;
  const complete = hostCompleteText({ env: source, resolveInference: async () => {
    entered.resolve(); await release.promise;
    return { completeText: async () => { calls++; return "must not dispatch"; } } as Client;
  } })!;
  const pending = complete("material");
  const rejected = assert.rejects(pending, { code: "actions.connection_required" });
  await entered.promise; source.MOLIS_WORK_TEXT_API_KEY = ""; release.resolve(); await rejected;
  assert.equal(calls, 0);
});

test("a changed fixed model rejects its late result without adopting another selection", async () => {
  const source = env();
  const complete = hostCompleteText({ env: source, resolveInference: resolver(async () => {
    source.MOLIS_WORK_TEXT_MODEL = "another-model"; return "stale result";
  }) })!;
  await assert.rejects(complete("preserved material"), { code: "actions.configuration_changed" });
});

test("empty text and private Runtime errors never become a successful or leaking business result", async () => {
  for (const text of ["", " \n "]) await assert.rejects(hostCompleteText({ env: env(), resolveInference: resolver(async () => text) })!("material"), /没有返回正文/);
  for (const status of [undefined, 401, 429]) {
    const complete = hostCompleteText({ env: env(), resolveInference: resolver(async () => { throw Object.assign(new Error("private-fixture-key raw provider body"), { status }); }) })!;
    await assert.rejects(complete("material"), error => {
      assert.doesNotMatch((error as Error).message, /private-fixture-key|raw provider/);
      if (status) assert.match((error as Error).message, new RegExp(String(status)));
      else assert.match((error as Error).message, /材料已保留/);
      return true;
    });
  }
});

test("text cancellation before and after execution cannot expose a late answer", async () => {
  const before = new AbortController(); before.abort();
  await assert.rejects(hostCompleteText({ env: env(), resolveInference: async () => assert.fail("must not initialize") })!("material", { signal: before.signal }), { name: "AbortError" });
  const late = new AbortController();
  const complete = hostCompleteText({ env: env(), resolveInference: resolver(async input => {
    assert.equal(input.signal?.aborted, false); late.abort(); assert.equal(input.signal?.aborted, true); return "late answer";
  }) })!;
  await assert.rejects(complete("material", { signal: late.signal }), { name: "AbortError" });
});

test("cancelling during lazy Runtime startup releases the caller before startup finishes", async () => {
  const entered = Promise.withResolvers<void>(), ready = Promise.withResolvers<Client>();
  const controller = new AbortController();
  const complete = hostCompleteText({ env: env(), resolveInference: async () => { entered.resolve(); return ready.promise; } })!;
  const pending = complete("material", { signal: controller.signal });
  const rejected = assert.rejects(pending, { name: "AbortError" });
  await entered.promise; controller.abort(); await rejected;
  ready.resolve({ completeText: async () => assert.fail("cancelled initialization dispatched a model") } as Client);
});
