import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createServer } from "node:http";
import { createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { hostTextGeneration } from "../apps/local-host/src/host-complete-text.js";
import { createPrologueInference } from "../horizontal/agent-host/dist/adapters/prologue-inference.js";
import { PrologueCredentialBridge } from "@molis-ai/molis-work-service-agent-host";
import { isDispatchRefusal } from "@molis-ai/molis-work-service-agent-host";

const require = createRequire(new URL("../horizontal/agent-host/package.json", import.meta.url));
const { createRuntime } = await import(require.resolve("@prologue/sdk"));
const { createNodeHost } = await import(require.resolve("@prologue/sdk/node"));

test("Host structured generation exposes real Run progress and receipts, and invalid output never succeeds", { timeout: 20_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "prologue-structured-host-"));
  let text = '{"title":"valid"}', requests = 0;
  const server = createServer(async (request, response) => {
    let raw = ""; for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw); requests++;
    assert.equal(body.response_format, undefined, "local validation does not silently request native output");
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.end(`data: ${JSON.stringify({ model: "provider-reported", choices: [{ index: 0, delta: { content: text }, finish_reason: null }] })}\n\n` +
      `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 8, completion_tokens: 2 } })}\n\ndata: [DONE]\n\n`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.structured.test", appVersion: "1.0.0" }, storageRoot: join(home, "runtime") });
  try {
    const generate = hostTextGeneration({ homeDirectory: home, env: { MOLIS_WORK_TEXT_API_KEY: "fixture-key",
      MOLIS_WORK_TEXT_API_FORMAT: "openai-chat-completions", MOLIS_WORK_TEXT_BASE_URL: `http://127.0.0.1:${address.port}/v1`, MOLIS_WORK_TEXT_MODEL: "selected" },
      resolveInference: async () => adapter.inference })!;
    const events: string[] = [];
    const options = { structured: { mode: "local" as const, schema: { type: "object" as const, properties: { title: { type: "string" as const, minLength: 1 } }, required: ["title"] } },
      onProgress: (event: { type: string }) => { events.push(event.type); } };
    const result = await generate("return title JSON", options);
    assert.deepEqual(result.structured, { title: "valid" });
    assert.equal(result.run_ref.kind, "run"); assert.equal(result.state, "completed");
    assert.equal(result.configuredModel, "selected"); assert.deepEqual(result.reportedModels, ["provider-reported"]);
    assert.equal(result.usage[0]?.input.tokens, 8);
    assert.ok(events.indexOf("started") < events.indexOf("text-delta")); assert.ok(events.includes("usage-recorded"));
    text = '{"title":""}';
    await assert.rejects(generate("return title JSON", options), (error: any) => {
      assert.equal(error.code, "MODEL_STRUCTURED_INVALID"); assert.equal(error.execution.state, "failed");
      assert.equal(error.execution.usage[0].output.tokens, 2); assert.notEqual(error.execution.run_ref.id, result.run_ref.id);
      return true;
    });
    assert.equal(requests, 2, "invalid format must not silently retry a billed call");
  } finally {
    await adapter.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(home, { recursive: true, force: true });
  }
});

test("native final dispatch rechecks source after an awaited credential check", { timeout: 20_000 }, async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), "prologue-native-guard-"));
  const scope = new AsyncLocalStorage<() => Promise<void>>();
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  let allowed = true, finalDispatch = false, held = false, fetches = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetches++;
    return new Response('data: {"choices":[{"delta":{"content":"late"},"finish_reason":null}]}\n\ndata: [DONE]\n\n', {
      headers: { "content-type": "text/event-stream" },
    });
  };
  const host = createNodeHost({ storageRoot, beforeModelDispatch: async () => {
    finalDispatch = true;
    await scope.getStore()?.();
  } });
  const runtime = await createRuntime({ app: { appId: "io.molis.native.guard-test", appVersion: "1.0.0" }, host,
    preset: "local-agent", network: { model: true } });
  const resolveCredential = async () => {
    if (finalDispatch && !held) { held = true; entered.resolve(); await release.promise; }
    return "fixture-only";
  };
  const bridge = new PrologueCredentialBridge({ host: { writeCredential: input => runtime.credentials.write(input) }, resolve: resolveCredential });
  const inference = createPrologueInference(runtime, async (input, signal) => {
    const snapshot = await input.resolveCredential(input.credential_ref);
    const ref = await bridge.prologueRefFor(input.credential_ref, input.resolveCredential, signal);
    return { ref, assertCurrent: async () => { assert.equal(await input.resolveCredential(input.credential_ref), snapshot); } };
  }, (guard, operation) => scope.run(guard, operation));
  try {
    const pending = inference.completeText({ protocol: "openai-compatible", endpoint: "https://1.1.1.1/v1/chat/completions",
      model: "fixture", prompt: "public fixture", credential_ref: "fixture", resolveCredential,
      beforeDispatch: () => { if (!allowed) throw new Error("source revoked"); }, max_output_tokens: 50, timeout_ms: 10_000 });
    // The caller gets its own check's reason back, not a generic model failure.
    const rejected = assert.rejects(pending, (error: unknown) => error instanceof Error && error.message === "source revoked" && isDispatchRefusal(error));
    await Promise.race([entered.promise, pending]);
    allowed = false;
    release.resolve();
    await rejected;
    assert.equal(fetches, 0, "revocation during the final credential await must prevent the actual provider request");
  } finally {
    release.resolve();
    await inference.close();
    await runtime.shutdown();
    globalThis.fetch = originalFetch;
    await rm(storageRoot, { recursive: true, force: true });
  }
});

// BL-918 (S-60): the cap a sandboxed package's image port passes down, checked where the provider's resources are copied out.
test("BL-918 B27-IMG-01 the agent-host adapter checks every resource's size against the caller's cap before any buffer, reads nothing and revokes every resource", async () => {
  const KiB = 1024, MiB = 1024 * KiB, MiB4 = 4 * MiB, cap = { max_images: 4, max_image_bytes: MiB4, max_total_bytes: 8 * MiB };
  const run = async (sizes: number[], output: typeof cap | undefined, chunks?: (ref: string, offset: number, length: number) => { offset: number; bytes: Uint8Array; done: boolean }) => {
    const reads: string[] = [], revoked: string[] = [], refs = sizes.map((_, index) => `res-${index}`);
    const runtime = {
      images: { generate: async () => ({ images: refs }) },
      resources: {
        inspect: (ref: string) => ({ byteLength: sizes[refs.indexOf(ref)]! }),
        readChunk: async (ref: string, offset: number, length: number) => { reads.push(ref); return chunks ? chunks(ref, offset, length) : { offset, bytes: new Uint8Array(Math.min(length, sizes[refs.indexOf(ref)]! - offset)), done: offset + length >= sizes[refs.indexOf(ref)]! }; },
        revoke: async (ref: string) => { revoked.push(ref); },
      },
    };
    const inference = createPrologueInference(runtime as never, async () => ({ ref: undefined, assertCurrent: async () => {} }), (_guard, work) => work());
    try {
      const result = inference.generateImages({ protocol: "openai-images", endpoint: "https://images.example.com/v1/images/generations", model: "m", prompt: "p", timeout_ms: 10_000, credential_ref: "c",
        resolveCredential: () => "", ...(output ? { output } : {}) });
      return { result: await result.then(images => images.map(image => image.bytes.byteLength), (error: { code?: string }) => error.code), reads, revoked, refs };
    } finally { await inference.close(); }
  };
  const fits = await run([MiB4, MiB4], cap);
  assert.deepEqual(fits.result, [MiB4, MiB4]); assert.deepEqual(fits.revoked, fits.refs);
  for (const [sizes, what] of [[[MiB4 + 1], "one over 4 MiB"], [[MiB4, MiB4, 1], "8 MiB + 1"], [[1, 1, 1, 1, 1], "five"]] as const) {
    const refused = await run([...sizes], cap);
    assert.equal(refused.result, "agent.inference.image_too_large", what);
    assert.deepEqual(refused.reads, [], `${what}: nothing read`); assert.deepEqual(refused.revoked, refused.refs, `${what}: every resource revoked`);
  }
  // Without a cap the adapter keeps its own limit (a native client's pictures are not the sandbox's business).
  assert.deepEqual((await run([MiB4 + 1], undefined)).result, [MiB4 + 1]);
  // A chunk that claims to be done before the announced size, or reads past what was asked, is an incomplete resource.
  const early = await run([100 * KiB], cap, (_ref, offset, length) => ({ offset, bytes: new Uint8Array(length), done: true }));
  assert.equal(early.result, "agent.inference.image_invalid"); assert.deepEqual(early.revoked, early.refs);
  const over = await run([100 * KiB], cap, (_ref, offset, length) => ({ offset, bytes: new Uint8Array(length + 1), done: false }));
  assert.equal(over.result, "agent.inference.image_invalid");
});
