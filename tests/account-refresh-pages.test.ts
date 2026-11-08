import assert from 'node:assert/strict';
import test from 'node:test';
import { AccountRefreshPages } from '@molis-ai/molis-work-app-local-host';
import {accountRefreshFixture,accountProbeCore} from './fixtures/account-refresh.js';

function account() {
  const controller = new AbortController();
  return { controller, lease: { signal: controller.signal, assertCurrent() { assert.equal(controller.signal.aborted, false, 'old account lease'); } } };
}
const forbidden = { code: 'actions.forbidden' };

test('ASR-04 a delayed cancellation for an older preparation cannot cancel a newer real OAuth attempt', async t => {
  const f=await accountRefreshFixture(t,accountProbeCore);
  try {
    await f.login('alice');
    await f.begin('bob');
    const old=(await f.status()).preparation.id as string;
    assert.equal((await f.request('/api/personal/prepare?action=cancel&page=account-refresh-page&id='+old,'POST')).status,200);
    assert.equal((await f.status()).loginPending,false);
    const next=await f.begin('carol');
    const current=(await f.status()).preparation.id as string;
    assert.notEqual(current,old);
    assert.equal((await f.request('/api/personal/prepare?action=cancel&page=account-refresh-page&id='+old,'POST')).status,200);
    const unchanged=await f.status();
    assert.equal(unchanged.loginPending,true,'stale cancellation cannot revoke the new Auth transaction');
    assert.equal(unchanged.preparation.id,current,'stale cancellation cannot remove the new preparation');
    assert.equal((await f.complete(next)).status,303);
    assert.equal((await f.status()).identity.userId,'carol','the newer real exchange can still complete');
  } finally { await f.close(); }
});

test('ASR-04 every current page acknowledges; only the owner may commit the matching intent once', t => {
  const pages = new AccountRefreshPages(), a = account(), outsider = account();
  t.after(() => pages.close());
  pages.register('owner', a.lease); pages.register('other', a.lease); pages.register('outsider', outsider.lease);
  const current = pages.start('owner', a.lease, 'switch');
  assert.equal(pages.snapshot(outsider.lease), null);
  assert.throws(() => pages.acknowledge('owner', outsider.lease, current.id), forbidden);
  assert.throws(() => pages.acknowledge('outsider', outsider.lease, current.id), forbidden);
  assert.throws(() => pages.acknowledge('owner', a.lease, 'old-id'), forbidden);
  assert.equal(pages.acknowledge('owner', a.lease, current.id).ready, false);
  assert.throws(() => pages.requirePrepared('owner', a.lease, current.id, 'switch'), forbidden);
  assert.equal(pages.acknowledge('other', a.lease, current.id).ready, true);
  assert.throws(() => pages.requirePrepared('other', a.lease, current.id, 'switch'), forbidden);
  assert.throws(() => pages.requirePrepared('owner', a.lease, current.id, 'logout'), forbidden);
  pages.requirePrepared('owner', a.lease, current.id, 'switch');
  assert.throws(() => pages.requirePrepared('owner', a.lease, current.id, 'switch'), forbidden);
  assert.throws(() => pages.acknowledge('owner', a.lease, current.id), forbidden);
  assert.throws(() => pages.register('late', a.lease), forbidden, 'a new unsaved page cannot join after the commit barrier');
});

test('ASR-04 a page arriving before commit joins the preparation and must acknowledge its own drafts', t => {
  const pages = new AccountRefreshPages(), a = account(); t.after(() => pages.close());
  pages.register('owner', a.lease);
  const current = pages.start('owner', a.lease, 'logout');
  assert.equal(pages.acknowledge('owner', a.lease, current.id).ready, true);
  pages.register('new-page', a.lease);
  assert.equal(pages.snapshot(a.lease)?.ready, false);
  assert.throws(() => pages.requirePrepared('owner', a.lease, current.id, 'logout'), forbidden);
  assert.equal(pages.acknowledge('new-page', a.lease, current.id).ready, true);
  pages.requirePrepared('owner', a.lease, current.id, 'logout');
});

test('ASR-04 disconnected required pages cancel preparation; a remaining page can retry without revoking its account', t => {
  const pages = new AccountRefreshPages(), a = account(); t.after(() => pages.close());
  pages.register('owner', a.lease); pages.register('other', a.lease);
  const unsubscribe = pages.subscribe('other', () => {});
  const current = pages.start('owner', a.lease, 'switch');
  pages.acknowledge('owner', a.lease, current.id);
  unsubscribe();
  assert.equal(pages.snapshot(a.lease), null);
  assert.throws(() => pages.acknowledge('other', a.lease, current.id), forbidden);
  pages.leave('other', a.lease);
  const retry = pages.start('owner', a.lease, 'switch');
  assert.notEqual(retry.id, current.id);
  assert.equal(pages.acknowledge('owner', a.lease, retry.id).ready, true);
  a.lease.assertCurrent();
});

test('ASR-04 preparation timeout cancels without changing the account or accepting late acknowledgments', async t => {
  const pages = new AccountRefreshPages(5), a = account(); t.after(() => pages.close());
  pages.register('owner', a.lease);
  const current = pages.start('owner', a.lease, 'switch');
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(pages.snapshot(a.lease), null);
  assert.throws(() => pages.acknowledge('owner', a.lease, current.id), forbidden);
  a.lease.assertCurrent();
});

test('ASR-03 revocation removes old page memberships and preparation without lending them the next lease', t => {
  const pages = new AccountRefreshPages(), a = account(), b = account(); t.after(() => pages.close());
  pages.register('page', a.lease);
  const events: string[] = [];
  pages.subscribe('page', event => events.push(event.type));
  const current = pages.start('page', a.lease, 'switch');
  pages.acknowledge('page', a.lease, current.id);
  a.controller.abort();
  assert.ok(events.includes('revoked'));
  assert.throws(() => pages.snapshot(a.lease), /old account lease/u);
  assert.equal(pages.snapshot(b.lease), null);
  pages.register('page', b.lease);
  assert.throws(() => pages.acknowledge('page', b.lease, current.id), forbidden);
  const next = pages.start('page', b.lease, 'logout');
  assert.equal(pages.acknowledge('page', b.lease, next.id).ready, true);
});

test('ASR-03 a delayed old stream close cannot cancel the next lease preparation for a reused page id', t => {
  const pages = new AccountRefreshPages(), a = account(), b = account(); t.after(() => pages.close());
  pages.register('page', a.lease);
  const oldUnsubscribe = pages.subscribe('page', () => {});
  a.controller.abort();
  pages.register('page', b.lease);
  const current = pages.start('page', b.lease, 'switch');
  pages.acknowledge('page', b.lease, current.id);
  oldUnsubscribe();
  assert.equal(pages.snapshot(b.lease)?.id, current.id);
  pages.requirePrepared('page', b.lease, current.id, 'switch');
});

test('ASR-04 failed initial event delivery leaves no listener that poisons a later retry', t => {
  const pages = new AccountRefreshPages(), a = account(); t.after(() => pages.close());
  pages.register('owner', a.lease);
  let brokenCalls = 0;
  assert.throws(() => pages.subscribe('owner', () => { brokenCalls++; throw new Error('closed response'); }), /closed response/u);
  pages.subscribe('owner', () => {});
  const current = pages.start('owner', a.lease, 'switch');
  assert.equal(pages.acknowledge('owner', a.lease, current.id).ready, true);
  assert.equal(brokenCalls, 1, 'the failed initial listener was removed');
});

test('ASR-04 broadcast failure cancels preparation rather than accepting a page that never received it', t => {
  const pages = new AccountRefreshPages(), a = account(); t.after(() => pages.close());
  pages.register('owner', a.lease);
  let calls = 0;
  const unsubscribe = pages.subscribe('owner', () => { if (++calls > 1) throw new Error('response lost'); });
  assert.throws(() => pages.start('owner', a.lease, 'switch'), forbidden);
  assert.equal(pages.snapshot(a.lease), null);
  unsubscribe();
  assert.equal(pages.start('owner', a.lease, 'switch').ready, false);
});

for (const reason of ['cancel', 'leave', 'disconnect'] as const) test(`ASR-04 ${reason} during OAuth cancels the attempt before pages are told to resume`, t => {
  const a = account(), order: string[] = [];
  let pendingOAuth = true;
  const pages = new AccountRefreshPages(30_000, () => { order.push('cancel-login'); pendingOAuth = false; });
  t.after(() => pages.close());
  pages.register('owner', a.lease);
  const unsubscribe = pages.subscribe('owner', event => { if (event.type === 'cancelled') { assert.equal(pendingOAuth, false); order.push('resume'); } });
  const current = pages.start('owner', a.lease, 'switch');
  pages.acknowledge('owner', a.lease, current.id);
  pages.requirePrepared('owner', a.lease, current.id, 'switch');
  if (reason === 'cancel') pages.cancel('owner', a.lease, current.id);
  else if (reason === 'leave') pages.leave('owner', a.lease);
  else unsubscribe();
  assert.deepEqual(order, reason === 'disconnect' ? ['cancel-login'] : ['cancel-login', 'resume']);
  assert.equal(pages.snapshot(a.lease), null);
  assert.throws(() => pages.requirePrepared('owner', a.lease, current.id, 'switch'), forbidden);
  a.lease.assertCurrent();
  pages.register('new-page', a.lease);
  assert.equal(pages.start('new-page', a.lease, 'switch').ready, false, 'the same account remains usable after cancelling OAuth');
});
