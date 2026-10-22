import assert from 'node:assert/strict';
import test from 'node:test';
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
  const card = '你在给项目里的一份资料写卡片。\n{"title":"背景资料","sections":[]}';
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
