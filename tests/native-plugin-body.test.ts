import assert from "node:assert/strict";
import { IncomingMessage } from "node:http";
import { Socket } from "node:net";
import test from "node:test";
import { readLocalWebBody } from "@molis-ai/molis-work-app-local-host";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";

// Schedule now uses the Runtime's shared reader, with the same 256,000-byte body limit.
test("W2-18-NATIVE-BODY-01 Runtime Schedule accepts Chinese within budget and refuses overflow before changing persisted tasks", async t => {
  let modelCalls = 0;
  const edge = await serveHomeRuntime(t, { completeText: async () => { modelCalls++; throw new Error('no model request expected'); } });
  const project = await edge.project('Schedule body test');
  assert.equal((await edge.request(`/api/settings/projects/${project.project_id}/plugins`, { method: 'POST', body: { plugin_id: 'schedule' } })).status, 200);
  const path = `/projects/${project.project_id}/api/plugins/io.molis.work.schedule`;
  const input = { title: '中文任务', instructions: '读取中文内容', time: '08:30' };
  const saved = await edge.request(path + '/tasks', { method: 'POST', body: input });
  assert.equal(saved.status, 201, await saved.text());
  const before = await (await edge.request(path + '/list')).json();
  assert.equal(before.tasks.length, 1);
  assert.equal(before.tasks[0].title, input.title); assert.equal(before.tasks[0].instructions, input.instructions);
  const body = JSON.stringify({ ...input, padding: '中'.repeat(90_000) });
  assert.ok(body.length < 256_000 && Buffer.byteLength(body) > 256_000);
  const oversized = await edge.request(path + '/tasks', { method: 'POST', raw: body });
  assert.deepEqual([oversized.status, (await oversized.json()).code], [413, 'actions.input_too_large']);
  assert.deepEqual(await (await edge.request(path + '/list')).json(), before, 'overflow leaves persistence unchanged');
  const malformed = await edge.request(path + '/tasks', { method: 'POST', raw: '{' });
  assert.deepEqual([malformed.status, (await malformed.json()).code], [400, 'actions.input_invalid']);
  assert.deepEqual(await (await edge.request(path + '/list')).json(), before, 'malformed JSON leaves persistence unchanged');
  assert.equal(modelCalls, 0);
});

test("W2-18-NATIVE-BODY-01 split Runtime input stops decoding and parsing after the first refusal", async t => {
  const request = new IncomingMessage(new Socket());
  t.after(() => request.destroy());
  let converted = 0, parsed = 0;
  const originalParse = JSON.parse;
  t.mock.method(JSON, 'parse', (text: string, reviver?: Parameters<typeof JSON.parse>[1]) => {
    if (text.startsWith('{"native_body_marker":')) parsed++;
    return originalParse(text, reviver);
  });
  const handled = assert.rejects(readLocalWebBody(request), { code: 'actions.input_too_large' });
  request.emit('data', '{"native_body_marker":"'); request.emit('data', 'x'.repeat(256_001));
  await handled;
  const tail = Buffer.from('"}');
  Object.defineProperty(tail, Symbol.toPrimitive, { value: () => { converted++; return '"}'; } });
  request.emit('data', tail); request.emit('end');
  assert.deepEqual([converted, parsed], [0, 0]);
});
