import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer, type ServerResponse } from 'node:http';
import { gzipSync } from 'node:zlib';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ActionService } from '@molis-ai/molis-work-kernel';
import { ActionError } from '@molis-ai/molis-work-contracts/platform/actions';
import { shelfActions, SHELF_ACTION_PERMISSIONS } from '@molis-ai/molis-work-plugin-shelf';
import { openShelfStore } from '@molis-ai/molis-work-module-shelf';
import { readMaterialWebsite } from '../apps/local-host/src/material-web.js';
import { shelfActionProvider } from '../apps/local-host/src/shelf-actions.js';

async function fixture(t: test.TestContext) {
  const home = await mkdtemp(join(tmpdir(), 'material-web-'));
  const arrived = Promise.withResolvers<ServerResponse>(), closed = Promise.withResolvers<void>();
  let requests = 0, sentBytes = 0;
  const html = '<title>网页 &amp; 材料</title><nav>导航</nav><article><h2>正文</h2><p>中文 &#x1f642;</p><template>隐藏</template><script>秘密脚本</script></article>';
  const server = createServer((request, response) => {
    requests++;
    if (request.url === '/hold') { response.once('close', () => closed.resolve()); arrived.resolve(response); return; }
    if (request.url === '/redirect' || request.url === '/loop') { response.writeHead(302, { location: request.url === '/loop' ? '/loop' : '/page' }); response.end(); return; }
    if (request.url === '/large' || request.url === '/gzip') {
      response.once('close', () => closed.resolve());
      if (request.url === '/gzip') {
        const compressed = gzipSync(Buffer.from('<p>' + 'a'.repeat(4 * 1024 * 1024) + '</p>'));
        response.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'gzip', 'content-length': compressed.length }); response.end(compressed); return;
      }
      response.writeHead(200, { 'content-type': 'text/html' });
      const part = Buffer.from('<p>' + 'a'.repeat(8192) + '</p>');
      const timer = setInterval(() => { sentBytes += part.length; response.write(part); }, 1);
      response.once('close', () => clearInterval(timer)); return;
    }
    if (request.url === '/broken') {
      response.writeHead(200, { 'content-type': 'text/html' }); response.write('<p>partial');
      setImmediate(() => response.destroy()); return;
    }
    if (request.url === '/missing') { response.writeHead(404); response.end(); return; }
    if (request.url === '/plain') { response.writeHead(200, { 'content-type': 'text/plain' }); response.end('literal <tag> &amp;'); return; }
    if (request.url === '/text-large') { response.writeHead(200, { 'content-type': 'text/plain' }); response.end('a'.repeat(2_000_010)); return; }
    response.writeHead(200, { 'content-type': 'text/html' }); response.end(html);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  const service = new ActionService(), dispose = service.registerProvider(shelfActionProvider(home));
  let authorized = true;
  const caller = { actor_id: 'person', audience: 'user' as const, project_id: null, permissions: SHELF_ACTION_PERMISSIONS,
    validate_authority: () => { if (!authorized) throw new ActionError('actions.revoked', 'revoked'); } };
  const store = () => openShelfStore(home, { disabled: true });
  t.after(async () => {
    dispose(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(home, { recursive: true, force: true });
  });
  return { home, origin, service, caller, store, dispose, arrived: arrived.promise, closed: closed.promise,
    requests: () => requests, sentBytes: () => sentBytes, revoke: () => { authorized = false; } };
}

test('Host web extraction shares HTML semantics, preserves plaintext, follows bounded redirects and performs no implicit module fetch', async t => {
  const f = await fixture(t);
  const result = await readMaterialWebsite(f.origin + '/redirect');
  assert.equal(result.title, '网页 & 材料'); assert.match(result.text, /## 正文\n\n中文 🙂/);
  assert.doesNotMatch(result.text, /导航|隐藏|秘密脚本/); assert.equal(result.coverage.status, 'partial');
  assert.equal((await readMaterialWebsite(f.origin + '/plain')).text, 'literal <tag> &amp;');
  const before = f.requests();
  const pure = await f.store().admitUrl(f.origin + '/page');
  assert.equal(f.requests(), before); assert.match(f.store().readFile(pure.item_id).bytes.toString(), /没有抓到正文/);
  const imported = await f.service.invoke(f.caller, shelfActions.admit, { text: f.origin + '/page' }) as { item: { item_id: string } };
  const saved = f.store().readFile(imported.item.item_id).bytes.toString();
  assert.match(saved, /# 网页 & 材料/); assert.match(saved, /中文 🙂/); assert.match(saved, new RegExp(f.origin));
  const count = f.requests();
  await assert.rejects(readMaterialWebsite(f.origin + '/loop'), { code: 'redirect' }); assert.equal(f.requests() - count, 6);
  await assert.rejects(readMaterialWebsite('file:///etc/passwd'), { code: 'url' });
  await assert.rejects(readMaterialWebsite(f.origin.replace('http://', 'http://person:secret@')), { code: 'url' });
});

for (const path of ['/large', '/gzip'] as const) test(`Host capture bounds decoded bytes and closes ${path} instead of silently saving a prefix`, { timeout: 15_000 }, async t => {
  const f = await fixture(t);
  await assert.rejects(readMaterialWebsite(f.origin + path), { code: 'too_large' });
  await f.closed;
  if (path === '/large') assert.ok(f.sentBytes() < 6 * 1024 * 1024, 'the Host stops the producing response instead of downloading it all');
  const result = await f.service.invoke(f.caller, shelfActions.admit, { text: f.origin + path }) as { item: { item_id: string } };
  const saved = f.store().readFile(result.item.item_id).bytes.toString();
  assert.match(saved, /没有抓到正文/); assert.ok(saved.length < 300); assert.match(saved, new RegExp(path));
});

test('a broken response preserves only the link, without claiming its partial body was captured', async t => {
  const f = await fixture(t);
  const result = await f.service.invoke(f.caller, shelfActions.admit, { text: f.origin + '/broken' }) as { item: { item_id: string } };
  const saved = f.store().readFile(result.item.item_id).bytes.toString();
  assert.match(saved, /没有抓到正文/); assert.doesNotMatch(saved, /partial/);
});

for (const entry of ['admit', 'clipboard'] as const) for (const stop of ['cancel', 'revoke', 'withdraw', 'delete-clipboard'] as const) {
  if (entry === 'admit' && stop === 'delete-clipboard') continue;
  test(`Shelf ${entry} ${stop} during real capture leaves no material or file and can recover`, { timeout: 20_000 }, async t => {
  const f = await fixture(t), controller = new AbortController();
  const original = f.store().snapshot().materials, files = await readdir(join(f.home, 'shelf', 'files'));
  const clip = f.store().addClipboard(f.origin + '/hold')!;
  const pending = f.service.invoke({ ...f.caller, signal: controller.signal }, entry === 'admit' ? shelfActions.admit : shelfActions.clipToMaterial,
    entry === 'admit' ? { text: f.origin + '/hold' } : { clip_id: clip.clip_id });
  const rejected = assert.rejects(pending, stop === 'cancel' ? { name: 'AbortError' } : { code: stop === 'revoke' ? 'actions.revoked' : stop === 'withdraw' ? 'actions.provider_changed' : 'shelf.item_not_found' });
  const response = await f.arrived;
  if (stop === 'cancel') controller.abort();
  if (stop === 'revoke') f.revoke();
  if (stop === 'withdraw') f.dispose();
  if (stop === 'delete-clipboard') f.store().deleteClipboard(clip.clip_id);
  response.writeHead(200, { 'content-type': 'text/html' }); response.end('<p>late body</p>');
  await rejected; await f.closed;
  assert.deepEqual(f.store().snapshot().materials, original);
  assert.deepEqual(await readdir(join(f.home, 'shelf', 'files')), files);
  // A new authorized provider/call can still save a real page after any of these interruptions.
  const recovered = new ActionService(), dispose = recovered.registerProvider(shelfActionProvider(f.home));
  try {
    const result = await recovered.invoke({ ...f.caller, validate_authority: undefined }, shelfActions.admit, { text: f.origin + '/page' }) as { item: { item_id: string } };
    assert.match(f.store().readFile(result.item.item_id).bytes.toString(), /中文 🙂/);
  } finally { dispose(); }
});
}

test('a bounded text extraction keeps its partial-content notice in the saved Shelf material', async t => {
  const f = await fixture(t);
  const result = await f.service.invoke(f.caller, shelfActions.admit, { text: f.origin + '/text-large' }) as { item: { item_id: string } };
  const saved = f.store().readFile(result.item.item_id).bytes.toString();
  assert.ok(saved.includes('a'.repeat(2_000_000)));
  assert.ok(!saved.includes('a'.repeat(2_000_001)));
  assert.match(saved, /仅保存了部分内容/);
});

test('Host enforces the real 12-second deadline and cancels the unfinished response', { timeout: 20_000 }, async t => {
  const f = await fixture(t), start = performance.now();
  await assert.rejects(readMaterialWebsite(f.origin + '/hold'), { code: 'timeout' });
  await f.closed; assert.ok(performance.now() - start < 16_000);
});

test('a redirect repeats the current dispatch guard before sending another request', async t => {
  const f = await fixture(t); let checks = 0;
  await assert.rejects(readMaterialWebsite(f.origin + '/redirect', { beforeDispatch: () => { if (++checks === 2) throw new Error('revoked between hosts'); } }), /revoked between hosts/);
  assert.equal(f.requests(), 1);
});

test('cancel while the dispatch guard waits returns promptly and never sends a late HTTP request', async t => {
  const f = await fixture(t), entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(), controller = new AbortController();
  const pending = readMaterialWebsite(f.origin + '/page', { signal: controller.signal, beforeDispatch: async () => { entered.resolve(); await release.promise; } });
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  try {
    await entered.promise; controller.abort(); await rejected;
    assert.equal(f.requests(), 0);
    release.resolve(); await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(f.requests(), 0);
  } finally { release.resolve(); }
});
