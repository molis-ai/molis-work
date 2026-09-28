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
import { createPrologueInference } from "../horizontal/agent-host/src/adapters/prologue-inference.js";
import { PrologueCredentialBridge } from "../horizontal/agent-host/src/adapters/prologue-node.js";
import { isDispatchRefusal } from "../horizontal/agent-host/src/inference.js";

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
