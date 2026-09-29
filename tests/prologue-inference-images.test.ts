import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPrologueNodeAdapter, isDispatchRefusal, type PrologueTextInput } from "@molis-ai/molis-work-service-agent-host";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
async function fixture(run: (f: {
  home: string; root: string; storage: string; adapter: Awaited<ReturnType<typeof createPrologueNodeAdapter>>;
  requests: any[]; input: (extra?: Partial<PrologueTextInput>) => PrologueTextInput; staged: () => Promise<string[]>;
}) => Promise<void>) {
  const home = await mkdtemp(join(tmpdir(), "inference-images-")), root = join(home, "source"), storage = join(home, "runtime");
  await mkdir(root); await writeFile(join(root, "one.png"), png);
  const requests: any[] = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString()); requests.push(body);
    response.writeHead(200, { "content-type": "text/event-stream" });
    if (request.url === "/messages") {
      const event = (type: string, value: object) => response.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
      event("message_start", { message: { id: "image", type: "message", role: "assistant", model: "reported-vision", content: [], usage: { input_tokens: 12, output_tokens: 0 } } });
      event("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
      event("content_block_delta", { index: 0, delta: { type: "text_delta", text: "image result" } });
      event("content_block_stop", { index: 0 }); event("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 2 } }); event("message_stop", {});
    } else response.write('data: {"model":"reported-vision","choices":[{"index":0,"delta":{"content":"image result"},"finish_reason":null}]}\n\ndata: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":12,"completion_tokens":2}}\n\ndata: [DONE]\n\n');
    response.end();
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.input-images.test", appVersion: "1.0.0" }, storageRoot: storage }).catch(async error => {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(home, { recursive: true, force: true }); throw error;
  });
  const input = (extra: Partial<PrologueTextInput> = {}): PrologueTextInput => ({ protocol: "openai-compatible", endpoint: `http://127.0.0.1:${address.port}/chat/completions`,
    model: "selected-vision", prompt: "Describe the original images in order.", images: [{ root_path: root, relative_path: "one.png" }],
    credential_ref: "fixture", resolveCredential: () => "fixture-private", max_output_tokens: 100, timeout_ms: 15_000, ...extra });
  const staged = async () => (await Promise.all(["staged", "published"].map(kind => readdir(join(storage, "intake", kind)).catch(error => {
    if (error.code === "ENOENT") return []; throw error;
  })))).flat();
  try { await run({ home, root, storage, adapter, requests, input, staged }); }
  finally { await adapter.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(home, { recursive: true, force: true }); }
}

test("original images use both Prologue protocols, preserve source/order and release Host bytes", { timeout: 30_000 }, async () => fixture(async f => {
  const secondRoot = join(f.home, "second"); await mkdir(secondRoot);
  const gif = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");
  await writeFile(join(secondRoot, "two.gif"), gif);
  for (const protocol of ["openai-compatible", "anthropic-compatible"]) {
    const request = f.input({ protocol, images: [{ root_path: f.root, relative_path: "one.png" }, { root_path: secondRoot, relative_path: "two.gif" }, { root_path: f.root, relative_path: "one.png" }] });
    if (protocol === "anthropic-compatible") request.endpoint = request.endpoint.replace("/chat/completions", "/messages");
    const result = await f.adapter.inference.completeTextResult(request);
    assert.equal(result.value, "image result"); assert.equal(result.state, "completed"); assert.equal(result.run_ref.kind, "run");
    assert.deepEqual(result.reportedModels, ["reported-vision"]); assert.equal(result.usage[0]?.input.tokens, 12);
    const sent = f.requests.at(-1); assert.equal(sent.tools, undefined);
    const blocks = sent.messages.at(-1).content;
    const images = blocks.filter((block: any) => block.type === "image" || block.type === "image_url").map((block: any) =>
      block.type === "image" ? block.source.data : block.image_url.url.split(",")[1]);
    assert.deepEqual(images.map((value: string) => Buffer.from(value, "base64")), [png, gif, png]);
    assert.deepEqual(await f.staged(), []); assert.deepEqual(await readFile(join(f.root, "one.png")), png);
  }
}));

test("invalid structured output retains the execution receipt and destroys image bytes", async () => fixture(async f => {
  await assert.rejects(f.adapter.inference.completeTextResult(f.input({ structured: { mode: "local", schema: { type: "object" } } })), (error: any) => {
    assert.equal(error.code, "MODEL_STRUCTURED_INVALID"); assert.equal(error.execution.state, "failed"); assert.equal(error.execution.usage[0]?.output.tokens, 2); return true;
  });
  assert.equal(f.requests.length, 1); assert.deepEqual(await f.staged(), []);
}));

test("intake rejects false image types, path escapes, symlinks, count and byte limits without dispatch or retained bytes", { timeout: 30_000 }, async () => fixture(async f => {
  await writeFile(join(f.root, "fake.png"), "not an image"); await writeFile(join(f.home, "outside.png"), png);
  await symlink(join(f.home, "outside.png"), join(f.root, "escape.png"));
  const tooLarge = Buffer.alloc(32 * 1024 * 1024 + 1); png.copy(tooLarge); await writeFile(join(f.root, "large.png"), tooLarge);
  for (const relative_path of ["fake.png", "../outside.png", "escape.png", "large.png"]) {
    await assert.rejects(f.adapter.inference.completeTextResult(f.input({ images: [{ root_path: f.root, relative_path: "one.png" }, { root_path: f.root, relative_path }] })));
    assert.deepEqual(await f.staged(), []); assert.equal(f.requests.length, 0);
  }
  await assert.rejects(f.adapter.inference.completeTextResult(f.input({ images: Array.from({ length: 31 }, () => ({ root_path: f.root, relative_path: "one.png" })) })), { code: "inference.image_limit" });
  assert.equal(f.requests.length, 0);
  // The size boundary is checked on bytes, independently of external image quality/decoding.
  await writeFile(join(f.root, "large.png"), tooLarge.subarray(0, 32 * 1024 * 1024));
  await f.adapter.inference.completeTextResult(f.input({ images: [{ root_path: f.root, relative_path: "large.png" }] }));
  assert.equal(Buffer.from(f.requests[0].messages[0].content.find((part: any) => part.type === "image_url").image_url.url.split(",")[1], "base64").length, 32 * 1024 * 1024);
  assert.deepEqual(await f.staged(), []);
}));

for (const reason of ["cancel", "revoke", "close"] as const) test(`image intake ${reason} during an awaited check prevents dispatch and destroys staged bytes`, { timeout: 20_000 }, async () => fixture(async f => {
  const controller = new AbortController(), entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  let held = false, revoked = false;
  const pending = f.adapter.inference.completeTextResult(f.input({ signal: controller.signal, beforeDispatch: async () => {
    if (!held && (await f.staged()).length) { held = true; entered.resolve(); await release.promise; }
    if (revoked) throw new Error("fixture source revoked");
  } }));
  const rejected = assert.rejects(pending, (error: any) => reason === "revoke" ? error.message === "fixture source revoked" && isDispatchRefusal(error) : error.name === "AbortError");
  try {
    await Promise.race([entered.promise, pending]);
    if (reason === "cancel") controller.abort();
    if (reason === "revoke") { revoked = true; release.resolve(); }
    if (reason === "close") await f.adapter.close();
    await rejected;
    // close waits for cleanup even though a cancelled caller is released promptly.
    await f.adapter.close();
    assert.deepEqual(await f.staged(), []); assert.equal(f.requests.length, 0);
  } finally { release.resolve(); }
}));
