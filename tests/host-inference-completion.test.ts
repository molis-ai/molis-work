import assert from "node:assert/strict";
import test from "node:test";
import { hostCompleteText, type HostTextOptions } from "@molis-ai/molis-work-app-local-host";
import { markDispatchRefusal } from "../horizontal/agent-host/dist/inference.js";
import { composeInstructedPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import { AGENT_PROMPT_MAX_CHARS } from "@molis-ai/molis-work-contracts/services/agent-definitions";
const env = () => ({ MOLIS_WORK_TEXT_API_KEY: "private-fixture-key", MOLIS_WORK_TEXT_BASE_URL: "https://model.example/v1", MOLIS_WORK_TEXT_API_FORMAT: "openai-chat-completions", MOLIS_WORK_TEXT_MODEL: "chosen-model" });
type Resolver = NonNullable<HostTextOptions["resolveInference"]>;
type Client = Awaited<ReturnType<Resolver>>;
const resolver = (completeText: Client["completeText"]): Resolver => async () => ({ completeTextResult: async input => ({ value: await completeText(input), configuredModel: input.model,
  state: "completed", run_ref: { kind: "run", id: "fixture", revision: 1 }, reportedModels: [], usage: [] }) } as Client);

// The environment is an explicit development configuration (repository-anti-corruption §1, 2026-10-04): the generic key names
// no provider, so it is not completed with MiniMax; MINIMAX_API_KEY is MiniMax by name.
test("an environment key configures a model only with its own endpoint and model; the generic key is not assumed to be MiniMax", async () => {
  const fail: Resolver = async () => assert.fail("nothing is configured");
  assert.equal(hostCompleteText({ env: { MOLIS_WORK_TEXT_API_KEY: "fixture-key" }, resolveInference: fail }), undefined);
  assert.equal(hostCompleteText({ env: { MOLIS_WORK_TEXT_API_KEY: "fixture-key", MOLIS_WORK_TEXT_BASE_URL: "https://model.example/v1" }, resolveInference: fail }), undefined);
  assert.equal(hostCompleteText({ env: { MOLIS_WORK_TEXT_API_KEY: "fixture-key", MOLIS_WORK_TEXT_MODEL: "chosen-model" }, resolveInference: fail }), undefined);
  const seen: Array<{ endpoint: string; model: string }> = [];
  const minimax = hostCompleteText({ env: { MINIMAX_API_KEY: "fixture-key" }, resolveInference: resolver(async input => { seen.push({ endpoint: input.endpoint, model: input.model }); return "ok"; }) })!;
  assert.equal(await minimax("prompt"), "ok");
  assert.deepEqual(seen, [{ endpoint: "https://api.minimax.cn/anthropic/v1/messages", model: "MiniMax-M3" }]);
});

test("legacy environment models do not imply vision or initialize inference for original images", async () => {
  const complete = hostCompleteText({ env: env(), resolveInference: async () => assert.fail("vision was not declared") })!;
  await assert.rejects(complete("image", { images: [{ root_path: "/unread", relative_path: "image.png" }] }), /已声明支持图片/);
});

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

// A prompt is counted in characters, like a schema's maxLength: 180_000 characters of text, the longest instruction a person can save and Pages' command line fit.
const PROMPT_LIMIT = 180_000 + AGENT_PROMPT_MAX_CHARS + 100, ASTRAL = "\u{1F7E2}", TOO_LONG = { message: "写作输入为空或过长，请减少材料后重试" };
const promptPort = (seen: string[]) => hostCompleteText({ env: env(), resolveInference: resolver(async input => { seen.push(input.prompt); return "ok"; }) })!;
// What pages.ai sends (plugins/native/pages/src/ai-run.ts:22) with the longest instruction and the longest command name: 23 characters (2 + 3 + 16 + 2) around the text.
const pagesPrompt = (text: string) => composeInstructedPrompt("规".repeat(AGENT_PROMPT_MAX_CHARS), `命令：比较异同（相同点、不同点、冲突）\n\n${text}`);

test("RAC-1877 a prompt is counted in characters, not UTF-16 units: 180000 two-unit characters go to the model, and so does a prompt of exactly the limit in three shapes", async () => {
  const seen: string[] = [], complete = promptPort(seen), sent = ASTRAL.repeat(180_000);
  assert.equal(sent.length, 360_000);
  assert.equal(await complete(sent), "ok");
  assert.ok(seen[0] === sent, "the model got the prompt as written");
  for (const prompt of ["a".repeat(PROMPT_LIMIT), ASTRAL.repeat(100) + "a".repeat(PROMPT_LIMIT - 100), ASTRAL.repeat(PROMPT_LIMIT)]) assert.equal(await complete(prompt), "ok");
  assert.equal(seen.length, 4);
});

test("RAC-1878 the longest pages.ai prompt (longest instruction, longest command name, 180000 characters of text) is not refused, whether its characters are one unit or two", async () => {
  const seen: string[] = [], complete = promptPort(seen);
  for (const unit of ["字", ASTRAL]) {
    const prompt = pagesPrompt(unit.repeat(180_000));
    assert.equal([...prompt].length, 180_000 + AGENT_PROMPT_MAX_CHARS + 23);
    assert.equal(await complete(prompt), "ok");
    assert.ok(seen.at(-1) === prompt, "the model got the prompt as written");
  }
  assert.equal(seen.length, 2);
});

test("RAC-1879 a prompt one character over the limit, however it is made, and a blank prompt are refused with the same message, and nothing is sent", async () => {
  const seen: string[] = [], complete = promptPort(seen);
  const over = ["a".repeat(PROMPT_LIMIT + 1), ASTRAL.repeat(100) + "a".repeat(PROMPT_LIMIT - 99), ASTRAL.repeat(PROMPT_LIMIT + 1)];
  for (const prompt of [...over, "", "   ", "\n\t "]) await assert.rejects(complete(prompt), TOO_LONG);
  assert.deepEqual(seen, []);
});

test("W5-01-SHM-04 revoking a credential during Runtime initialization preserves the refusal and prevents model dispatch", async () => {
  const source = env(), entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  let calls = 0;
  const complete = hostCompleteText({ env: source, resolveInference: async () => {
    entered.resolve(); await release.promise;
    return { completeTextResult: async () => { calls++; throw new Error("must not dispatch"); } } as Client;
  } })!;
  const pending = complete("material");
  const rejected = assert.rejects(pending, error => {
    assert.ok(error instanceof Error && "code" in error);
    assert.equal(error.code, "actions.connection_required");
    assert.equal("execution" in error, false);
    assert.equal("validateResult" in error, false);
    return true;
  });
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
  ready.resolve({ completeTextResult: async () => assert.fail("cancelled initialization dispatched a model") } as Client);
});

test("a dispatch the Host's own check refused says it was not sent, in the check's words", async () => {
  const complete = hostCompleteText({ env: env(), resolveInference: resolver(async () => { throw markDispatchRefusal(new Error("资料来源的授权已收回")); }) })!;
  await assert.rejects(complete("material"), (error: Error) =>
    /^资料来源的授权已收回；没有发给模型，材料已保留$/.test(error.message) && !/超时|模型返回/.test(error.message));
});

test("a Home execution service held by another process is reported as such, not as a model failure", async () => {
  const complete = hostCompleteText({ env: env(), resolveInference: async () => { throw Object.assign(new Error("busy"), { code: "agent.storage_busy" }); } })!;
  await assert.rejects(complete("material"), (error: { code?: string; message?: string }) =>
    error.code === "actions.service_unavailable" && /另一个 Molis Work 进程/.test(error.message ?? "") && !/模型返回|超时/.test(error.message ?? ""));
});

test("cancellation and the operation deadline cover the check after a model result", { timeout: 5_000 }, async () => {
  for (const stop of ["cancel", "timeout"] as const) {
    const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
    const controller = new AbortController(); let checks = 0, calls = 0;
    const complete = hostCompleteText({ env: env(), resolveInference: resolver(async () => { calls++; return "late result"; }) })!;
    const pending = complete("material", { signal: controller.signal, timeoutMs: stop === "timeout" ? 100 : 5_000,
      beforeDispatch: async () => { if (++checks === 2) { entered.resolve(); await release.promise; } } });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const watchdog = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("result check exceeded deadline")), 2_000); });
    const rejected = assert.rejects(Promise.race([pending, watchdog]), stop === "cancel" ? /explicit user cancellation/ : /材料已保留/);
    try {
      await entered.promise;
      if (stop === "cancel") controller.abort(new Error("explicit user cancellation"));
      await rejected; assert.equal(calls, 1);
    } finally { clearTimeout(timer); release.resolve(); }
  }
});

test("a revocation detected after the model response keeps the caller's reason", async () => {
  const refused = new Error("RESEARCH_AUTHORITY_REVOKED"); let checks = 0;
  const complete = hostCompleteText({ env: env(), resolveInference: resolver(async () => "result") })!;
  await assert.rejects(complete("material", { beforeDispatch: async () => { if (++checks === 2) throw refused; } }), error => error === refused);
});
