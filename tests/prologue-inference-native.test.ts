import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPrologueInference } from "../horizontal/agent-host/src/adapters/prologue-inference.js";
import { PrologueCredentialBridge } from "../horizontal/agent-host/src/adapters/prologue-node.js";

const require = createRequire(new URL("../horizontal/agent-host/package.json", import.meta.url));
const { createRuntime } = await import(require.resolve("@prologue/sdk"));
const { createNodeHost } = await import(require.resolve("@prologue/sdk/node"));

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
  const runtime = createRuntime({ app: { appId: "io.molis.native.guard-test", appVersion: "1.0.0" }, host,
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
    const rejected = assert.rejects(pending);
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
