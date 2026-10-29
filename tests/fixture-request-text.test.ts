import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { imageRuntimeFixture } from "./fixtures/images-runtime.js";
import { modelRuntimeFixture } from "./fixtures/plugin-model-runtime.js";
import { recordingTextModel, wireText } from "./fixtures/recording-text-model.js";

// The loopback providers in tests/fixtures read a request body as bytes and decode it once. A body that arrives in two chunks, with
// a character cut between them, must reach the fixture whole: decoding each chunk alone turns the cut character into U+FFFD.

// Long enough for the server to read the first chunk before the second one is sent. Too short a pause could let a broken fixture read both
// chunks at once and pass; it can never make a sound fixture fail.
const PAUSE_MS = 50;

/**
 * POST `body` as UTF-8 in two writes, PAUSE_MS apart. The first write ends one byte into `mark`, so the server reads the character
 * `mark` starts with cut between two chunks. `mark` has to start with a character of two or more bytes.
 */
function postCut(url: string, body: string, mark: string, headers: Record<string, string> = {}): Promise<{ status: number; text: string }> {
  const bytes = Buffer.from(body, "utf8"), start = bytes.indexOf(Buffer.from(mark, "utf8"));
  assert.ok(start >= 0, "the body holds the mark");
  assert.equal(bytes[start]! & 0xc0, 0xc0, "the mark starts with the first byte of a multi-byte character");
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const request = httpRequest({ hostname: target.hostname, port: target.port, path: target.pathname, method: "POST", agent: false,
      headers: { "content-type": "application/json", ...headers } }, response => {
      const parts: Buffer[] = [];
      response.on("data", (part: Buffer) => { parts.push(part); });
      response.on("end", () => resolve({ status: response.statusCode ?? 0, text: Buffer.concat(parts).toString("utf8") }));
      response.on("error", reject);
    });
    request.on("error", reject);
    request.write(bytes.subarray(0, start + 1));
    setTimeout(() => request.end(bytes.subarray(start + 1)), PAUSE_MS);
  });
}

test("RAC-2130 the image provider fixture keeps a prompt whose four-byte character arrives cut between two chunks", { timeout: 60_000 }, async t => {
  const f = await imageRuntimeFixture(t), prompt = "画一只猫🐱";
  const reply = await postCut(`${f.input.base_url}/images/generations`, JSON.stringify({ prompt }), "🐱");
  assert.equal(reply.status, 200, reply.text);
  assert.deepEqual(f.calls, [{ prompt }]);
});

test("RAC-2132 the recording text model fixture keeps a message whose four-byte character arrives cut between two chunks", { timeout: 60_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "fixture-request-text-")), content = "总结一下🐱";
  t.after(() => rm(home, { recursive: true, force: true }));
  const model = await recordingTextModel(t, home, () => "好的");
  const reply = await postCut(`${model.base}/v1/messages`, JSON.stringify({ messages: [{ role: "user", content }] }), "🐱");
  assert.equal(reply.status, 200, reply.text);
  assert.deepEqual(model.requests.map(wireText), [content]);
});

test("RAC-2134 the plugin model runtime fixture keeps a message whose four-byte character arrives cut between two chunks", { timeout: 60_000 }, async t => {
  const f = await modelRuntimeFixture(t), content = "材料🐱";
  const reply = await postCut(`${f.base}/v1/chat/completions`, JSON.stringify({ model: "vision", messages: [{ role: "user", content }] }), "🐱");
  assert.equal(reply.status, 200, reply.text);
  assert.deepEqual(f.requests, [{ model: "vision", messages: [{ role: "user", content }] }]);
});
