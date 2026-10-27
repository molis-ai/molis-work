import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { connect as netConnect } from "node:net";
import { execFileSync } from "node:child_process";
import { createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { hostTextGeneration } from "../apps/local-host/src/host-complete-text.js";
import { createPrologueInference } from "../horizontal/agent-host/dist/adapters/prologue-inference.js";
import { PrologueCredentialBridge } from "@molis-ai/molis-work-service-agent-host";
import { isDispatchRefusal } from "@molis-ai/molis-work-service-agent-host";

const require = createRequire(new URL("../horizontal/agent-host/package.json", import.meta.url));
const { createRuntime } = await import(require.resolve("@prologue/sdk"));
const { createNodeHost } = await import(require.resolve("@prologue/sdk/node"));

test("Host and native inference separate final dispatch from an issued result without weakening default checks", { timeout: 30_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "prologue-retained-result-"));
  let active = true, authorized = true, revokeAfterSend = false, requests = 0;
  const server = createServer(async (request, response) => {
    for await (const _chunk of request) { /* Consume the actual request before changing its source. */ }
    requests++; active = false;
    if (revokeAfterSend) authorized = false;
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.end('data: {"choices":[{"index":0,"delta":{"content":"retained summary"},"finish_reason":null}]}\n\n' +
      'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.retained-result.test", appVersion: "1.0.0" }, storageRoot: join(home, "runtime") });
  const beforeDispatch = () => { if (!active || !authorized) throw new Error("source unavailable for dispatch"); };
  const afterResult = () => { if (!authorized) throw new Error("source authority revoked"); };
  try {
    const generate = hostTextGeneration({ homeDirectory: home, env: { MOLIS_WORK_TEXT_API_KEY: "fixture-key",
      MOLIS_WORK_TEXT_API_FORMAT: "openai-chat-completions", MOLIS_WORK_TEXT_BASE_URL: `http://127.0.0.1:${address.port}/v1`, MOLIS_WORK_TEXT_MODEL: "fixture" },
      resolveInference: async () => adapter.inference })!;
    const kept = await generate("public fixture", { beforeDispatch, afterResult });
    assert.equal(kept.value, "retained summary"); assert.equal(kept.state, "completed"); assert.equal(requests, 1);
    active = true;
    await assert.rejects(generate("public fixture", { beforeDispatch }), error => {
      assert.equal(isDispatchRefusal(error), false, "a refused result must not be described as a request never sent"); return true;
    });
    assert.equal(requests, 2, "omitting afterResult keeps the original continuing check");
    active = true; revokeAfterSend = true;
    await assert.rejects(generate("public fixture", { beforeDispatch, afterResult }), error => {
      assert.equal(isDispatchRefusal(error), false); return true;
    });
    assert.equal(requests, 3, "an issued result cannot bypass withdrawn authority or silently retry");
  } finally {
    await adapter.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(home, { recursive: true, force: true });
  }
});

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

test("Host source fences survive the SDK's last awaited authorization and stay local to concurrent inference calls", { timeout: 30_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "prologue-source-final-send-")), requests: string[] = [];
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const scope = new AsyncLocalStorage<() => void | (() => void) | Promise<void | (() => void)>>();
  let hold = true, revision = 1, snapshot = 0, finalChecks = 0;
  const server = createServer(async (request, response) => {
    let body = ""; for await (const chunk of request) body += chunk;
    requests.push(body); response.writeHead(200, { "content-type": "text/event-stream" });
    response.end('data: {"choices":[{"index":0,"delta":{"content":"current result"},"finish_reason":null}]}\n\n' +
      'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const host = createNodeHost({ storageRoot: join(home, "sdk"), beforeNetworkDispatch: async () => scope.getStore()?.() });
  const execute = host.executeModelNetwork.bind(host);
  // Delay the real Host's same-handle authorization after its App guard, not a second model execution path.
  host.executeModelNetwork = input => execute({ ...input, beforeDispatch: async () => {
    const sdkFence = await input.beforeDispatch?.();
    if (hold) { hold = false; entered.resolve(); await release.promise; }
    return sdkFence ?? (() => {});
  } });
  const runtime = await createRuntime({ app: { appId: "io.molis.source-final.test", appVersion: "1.0.0" }, host,
    network: { model: true, loopback: true } });
  const bridge = new PrologueCredentialBridge({ host: { writeCredential: input => runtime.credentials.write(input) }, resolve: () => "test-only" });
  const inference = createPrologueInference(runtime, async (input, signal) => {
    const ref = await bridge.prologueRefFor(input.credential_ref, input.resolveCredential, signal);
    return { ref, assertCurrent: async () => { signal.throwIfAborted(); assert.equal(await input.resolveCredential(input.credential_ref), "test-only"); } };
  }, (guard, operation) => scope.run(guard, operation));
  const generate = hostTextGeneration({ homeDirectory: home, env: { MOLIS_WORK_TEXT_API_KEY: "test-only", MOLIS_WORK_TEXT_API_FORMAT: "openai-chat-completions",
    MOLIS_WORK_TEXT_BASE_URL: `http://127.0.0.1:${address.port}/v1`, MOLIS_WORK_TEXT_MODEL: "fixture" }, resolveInference: async () => inference })!;
  try {
    const pending = generate("revoked first source", { beforeDispatch: () => { snapshot = revision; }, afterResult: () => {},
      assertCurrent: () => { finalChecks++; if (snapshot !== revision) throw new Error("source changed at final send"); } });
    const settled = pending.then(value => ({ value }), (error: unknown) => ({ error }));
    await entered.promise; revision++;
    const other = await generate("independent allowed source", { beforeDispatch: () => {}, assertCurrent: () => {} });
    assert.equal(other.value, "current result"); assert.equal(requests.length, 1);
    assert.match(requests[0]!, /independent allowed source/);
    release.resolve(); const outcome = await settled;
    assert.equal(requests.length, 1, "the old hook discarded its returned fence and sends the revoked first source here");
    assert.ok("error" in outcome && outcome.error instanceof Error);
    assert.match(outcome.error.message, /source changed at final send.*没有发给模型/);
    assert.equal(finalChecks, 1, "a first-fence refusal sends no target request");
    const current = await generate("freshly checked first source", { beforeDispatch: () => { snapshot = revision; },
      assertCurrent: () => { finalChecks++; assert.equal(snapshot, revision); } });
    assert.equal(current.value, "current result"); assert.equal(requests.length, 2);
    assert.equal(finalChecks, 3, "current direct sends run the retained network and transport fences");
    await assert.rejects(generate("invalid asynchronous source fence", { assertCurrent: async () => { throw new Error("late async denial"); } }), /最终检查必须同步完成/);
    assert.equal(requests.length, 2, "a Promise is never an authorization decision");
  } finally {
    release.resolve(); await inference.close(); await runtime.shutdown(); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve())); await rm(home, { recursive: true, force: true });
  }
});

test("a reused source Error cannot mark a later already-issued request as never sent", { timeout: 30_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "prologue-source-refusal-reuse-"));
  const shared = new Error("same source refusal"), requests: string[] = [];
  let denyFirst = true, denyNextHop = false;
  const server = createServer(async (request, response) => {
    for await (const _chunk of request) { /* Consume the already-issued request before withdrawing the next hop. */ }
    requests.push(request.url ?? ""); denyNextHop = true;
    response.writeHead(307, { location: "/next-hop" }); response.end();
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.source-refusal.test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk") });
  const input = { protocol: "openai-compatible", endpoint: `http://127.0.0.1:${address.port}/v1/chat/completions`, model: "fixture", prompt: "public fixture",
    credential_ref: "fixture", resolveCredential: () => "test-only", max_output_tokens: 50, timeout_ms: 10_000,
    beforeDispatch: () => { if (denyNextHop) throw shared; }, afterResult: () => {}, assertCurrent: () => { if (denyFirst) throw shared; } };
  try {
    await assert.rejects(adapter.inference.completeText(input), error => error instanceof Error && error.message === shared.message && isDispatchRefusal(error));
    assert.equal(isDispatchRefusal(shared), false, "checking one request must not permanently mark the caller's reusable Error");
    assert.deepEqual(requests, []);
    denyFirst = false;
    await assert.rejects(adapter.inference.completeText(input), error => error instanceof Error && error.message === shared.message && !isDispatchRefusal(error));
    assert.deepEqual(requests, ["/v1/chat/completions"], "the first hop happened, while the revoked next hop was denied without retry");
  } finally {
    await adapter.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(home, { recursive: true, force: true });
  }
});

test("a source fence refused after CONNECT preserves the App reason and code without claiming the target was never sent", { timeout: 30_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "prologue-source-connect-refusal-"));
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const scope = new AsyncLocalStorage<() => void | (() => void) | Promise<void | (() => void)>>();
  const sockets = new Set<import("node:stream").Duplex>();
  const key = join(home, "key.pem"), cert = join(home, "cert.pem");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "2", "-keyout", key, "-out", cert,
    "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1"], { stdio: "ignore" });
  let connects = 0, targetRequests = 0, changed = false, fences = 0;
  const refused = Object.assign(new Error("source changed during CONNECT"), { code: "actions.subject_changed" });
  const target = createHttpsServer({ key: await readFile(key), cert: await readFile(cert) }, (_request, response) => {
    targetRequests++; response.writeHead(200, { "content-type": "text/event-stream" });
    response.end('data: {"choices":[{"delta":{"content":"unexpected"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
  });
  await new Promise<void>(resolve => target.listen(0, "127.0.0.1", resolve));
  const targetAddress = target.address(); assert.ok(targetAddress && typeof targetAddress !== "string");
  const proxy = createServer();
  proxy.on("connect", (request, socket) => {
    connects++; entered.resolve(); sockets.add(socket); socket.on("close", () => sockets.delete(socket));
    void release.promise.then(() => {
      if (socket.destroyed) return;
      const [host, port] = (request.url ?? "").split(":");
      const upstream = netConnect(Number(port), host, () => {
        socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        upstream.pipe(socket); socket.pipe(upstream);
      });
      sockets.add(upstream); upstream.on("close", () => sockets.delete(upstream)); upstream.on("error", () => socket.destroy());
    });
  });
  await new Promise<void>(resolve => proxy.listen(0, "127.0.0.1", resolve));
  const proxyAddress = proxy.address(); assert.ok(proxyAddress && typeof proxyAddress !== "string");
  const host = createNodeHost({ storageRoot: join(home, "sdk"), network: { proxy: { url: `http://127.0.0.1:${proxyAddress.port}` }, extraCaFile: cert },
    beforeNetworkDispatch: async () => scope.getStore()?.() });
  const runtime = await createRuntime({ app: { appId: "io.molis.source-connect.test", appVersion: "1.0.0" }, host, network: { model: true, loopback: true } });
  const bridge = new PrologueCredentialBridge({ host: { writeCredential: input => runtime.credentials.write(input) }, resolve: () => "test-only" });
  const inference = createPrologueInference(runtime, async (input, signal) => {
    const ref = await bridge.prologueRefFor(input.credential_ref, input.resolveCredential, signal);
    return { ref, assertCurrent: async () => { signal.throwIfAborted(); assert.equal(await input.resolveCredential(input.credential_ref), "test-only"); } };
  }, (guard, operation) => scope.run(guard, operation));
  const generate = hostTextGeneration({ homeDirectory: home, env: { MOLIS_WORK_TEXT_API_KEY: "test-only", MOLIS_WORK_TEXT_API_FORMAT: "openai-chat-completions",
    MOLIS_WORK_TEXT_BASE_URL: `https://localhost:${targetAddress.port}/v1`, MOLIS_WORK_TEXT_MODEL: "fixture" }, resolveInference: async () => inference })!;
  try {
    const pending = generate("public source", { beforeDispatch: () => {}, assertCurrent: () => { fences++; if (changed) throw refused; } });
    const settled = pending.then(value => ({ value }), (error: unknown) => ({ error }));
    await entered.promise; changed = true; release.resolve(); const outcome = await settled;
    assert.equal(connects, 1); assert.equal(targetRequests, 0); assert.equal(fences, 3);
    assert.ok("error" in outcome && outcome.error instanceof Error && "code" in outcome.error);
    assert.equal(outcome.error.code, refused.code); assert.equal(outcome.error.message, refused.message);
    assert.equal(isDispatchRefusal(outcome.error), false);
    assert.equal(isDispatchRefusal(refused), false, "the original App Error remains unmarked");
    assert.doesNotMatch(outcome.error.message, /没有发给模型/);
  } finally {
    release.resolve(); for (const socket of sockets) socket.destroy();
    await inference.close(); await runtime.shutdown(); proxy.closeAllConnections(); target.closeAllConnections();
    await Promise.all([new Promise<void>(resolve => proxy.close(() => resolve())), new Promise<void>(resolve => target.close(() => resolve()))]);
    await rm(home, { recursive: true, force: true });
  }
});
