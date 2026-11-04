import assert from 'node:assert/strict';
import test from 'node:test';
import { homeAgentDefinitions } from "@molis-ai/molis-work-app-local-host";
import { composeInstructedPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import { openTestHome } from "./fixtures/test-home.js";
import { startModelStandIn } from './fixtures/model-stand-in.js';

// MERGEFIX-03: foreground counts must stay exact when background work interleaves with model setup.
test('model stand-in answers background cards without counting them as checks, and still counts repeated foreground requests', async t => {
  const model = await startModelStandIn('fixture-accepted');
  t.after(() => model.close());
  const send = (content: string, key = 'fixture-accepted', stream = false) => fetch(`${model.baseUrl}/chat/completions`, {
    method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'fixture-model', stream, messages: [{ role: 'user', content }] }),
  });
  const probe = 'Reply with exactly MOLIS_OK.';
  const home = await openTestHome(t);
  const instruction = homeAgentDefinitions(home.home).prompt("system:knowledge/knowledge.organize").default_body;
  const card = composeInstructedPrompt(instruction, JSON.stringify({ title: "背景资料", summary: "简介", text: "正文", sections: [] }));
  assert.equal((await send(probe, 'fixture-rejected')).status, 401);
  assert.equal((await (await send(probe)).json()).choices[0].message.content, 'MOLIS_OK');
  const cardAnswer = await (await send(card)).json();
  assert.deepEqual(JSON.parse(cardAnswer.choices[0].message.content), {
    title: '背景资料', brief: '夹具整理出的卡片。', keywords: [], sections: [],
  });
  const streamed = await (await send(card, 'fixture-accepted', true)).text();
  const first = JSON.parse(streamed.split('\n\n')[0]!.slice('data: '.length));
  assert.equal(JSON.parse(first.choices[0].delta.content).title, '背景资料');
  assert.equal((await send(card, 'fixture-rejected')).status, 401, 'background work does not bypass authentication');
  assert.deepEqual(model.requests, [
    { model: 'fixture-model', offeredKey: 'fixture-rejected' },
    { model: 'fixture-model', offeredKey: 'fixture-accepted' },
  ], 'exactly two foreground requests, regardless of background timing');
  await send(probe);
  assert.equal(model.requests.length, 3, 'an accidental second connectivity check is still visible');
  await send('An unrelated foreground task');
  assert.equal(model.requests.length, 4, 'unknown calls are not silently discarded');
});
