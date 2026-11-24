import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { codingProductHost } from "./fixtures/coding-product-host.js";
import { reviewAnswer } from "./fixtures/ending-review.js";
import { imageRuntimeFixture } from "./fixtures/images-runtime.js";
import { startModelStandIn } from "./fixtures/model-stand-in.js";
import { modelRuntimeFixture } from "./fixtures/plugin-model-runtime.js";
import { recordingTextModel, wireText } from "./fixtures/recording-text-model.js";

// The loopback providers in tests/fixtures read a request body as bytes and decode it once. A body that arrives in two chunks, with
// a character cut between them, must reach the fixture whole: decoding each chunk alone turns the cut character into U+FFFD.

// Long enough for the server to read the first chunk before the second one is sent. Too short a pause could let a broken fixture read both
// chunks at once and pass; it can never make a sound fixture fail.
const PAUSE_MS = 50;

/**
 * POST `body` in writes PAUSE_MS apart, cutting one byte into the first character of each mark.
 */
function postCut(url: string, body: string, marks: string[], headers: Record<string, string> = {}): Promise<{ status: number; text: string }> {
  const bytes = Buffer.from(body, "utf8");
  const cuts = marks.map(mark => {
    const start = bytes.indexOf(Buffer.from(mark, "utf8"));
    assert.ok(start >= 0, "the body holds the mark");
    assert.equal(bytes[start]! & 0xc0, 0xc0, "the mark starts with the first byte of a multi-byte character");
    return start + 1;
  }).sort((left, right) => left - right);
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
    const send = async () => {
      let start = 0;
      for (const cut of cuts) {
        request.write(bytes.subarray(start, cut));
        start = cut;
        await delay(PAUSE_MS);
      }
      request.end(bytes.subarray(start));
    };
    void send().catch(reject);
  });
}

test("RAC-2130 the image provider fixture keeps a prompt whose four-byte character arrives cut between two chunks", { timeout: 60_000 }, async t => {
  const f = await imageRuntimeFixture(t), prompt = "画一只猫🐱";
  const reply = await postCut(`${f.input.base_url}/images/generations`, JSON.stringify({ prompt }), ["🐱"]);
  assert.equal(reply.status, 200, reply.text);
  assert.deepEqual(f.calls, [{ prompt }]);
});

test("RAC-2132 the recording text model fixture keeps a message whose four-byte character arrives cut between two chunks", { timeout: 60_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "fixture-request-text-")), content = "总结一下🐱";
  t.after(() => rm(home, { recursive: true, force: true }));
  const model = await recordingTextModel(t, home, () => "好的");
  const reply = await postCut(`${model.base}/v1/messages`, JSON.stringify({ messages: [{ role: "user", content }] }), ["🐱"]);
  assert.equal(reply.status, 200, reply.text);
  assert.deepEqual(model.requests.map(wireText), [content]);
});

test("RAC-2134 the plugin model runtime fixture keeps a message whose four-byte character arrives cut between two chunks", { timeout: 60_000 }, async t => {
  const f = await modelRuntimeFixture(t), content = "材料🐱";
  const reply = await postCut(`${f.base}/v1/chat/completions`, JSON.stringify({ model: "vision", messages: [{ role: "user", content }] }), ["🐱"]);
  assert.equal(reply.status, 200, reply.text);
  assert.deepEqual(f.requests, [{ model: "vision", messages: [{ role: "user", content }] }]);
});

test("RAC-2175 the model stand-in fixture keeps a model name whose four-byte character arrives cut between two chunks", { timeout: 60_000 }, async t => {
  const stand = await startModelStandIn("key-2175"), model = "模型🐱";
  t.after(() => stand.close());
  const reply = await postCut(`${stand.baseUrl}/chat/completions`, JSON.stringify({ model, messages: [{ role: "user", content: "你好" }] }), ["🐱"], { authorization: "Bearer key-2175" });
  assert.equal(reply.status, 200, reply.text);
  assert.deepEqual(stand.requests, [{ model, offeredKey: "key-2175" }]);
});

test("RAC-2176 the model stand-in fixture still answers an ending-review request aside when a character of its instruction arrives cut between two chunks", { timeout: 60_000 }, async t => {
  const stand = await startModelStandIn("key-2176", "foreground reply");
  t.after(() => stand.close());
  const body = JSON.stringify({ model: "fixture", stream: false, messages: [{ role: "system", content: "在这一轮结束时对用户说的话" }, { role: "user", content: "好" }] });
  const reply = await postCut(`${stand.baseUrl}/chat/completions`, body, ["在这一轮"], { authorization: "Bearer key-2176" });
  assert.equal(reply.status, 200, reply.text);
  assert.equal((JSON.parse(reply.text) as { choices: { message: { content: string } }[] }).choices[0]!.message.content, reviewAnswer([]));
  assert.deepEqual(stand.requests, []);
});

test("TFLH-01 Coding records the full request after both a Chinese character and an emoji are split across HTTP chunks", { timeout: 60_000 }, async t => {
  const fixture = await codingProductHost(t, () => new Response("收到"), { loopbackProvider: true });
  const payload = { messages: [{ role: "user", content: "开头\n请核对猫🐱的原文\n尾句" }] };
  const body = JSON.stringify(payload);
  const reply = await postCut(fixture.providerEndpoint, body, ["猫", "🐱"]);
  assert.deepEqual(reply, { status: 200, text: "收到" });
  assert.deepEqual(fixture.providerRequests, [body]);
  assert.deepEqual(fixture.requests, [payload]);
});
