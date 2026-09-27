import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { Agent, createServer } from 'node:https';
import { connect as tlsConnect } from 'node:tls';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { hostNetwork, NETWORK_STAND_IN, publicAddress } from '../apps/local-host/src/plugin-builder/network.js';

const context = (namespace = 'installed') => ({ identity: { projectId: 'p', installationId: 'i', pluginId: 'io.molis.work.generated.weather', namespace }, signal: new AbortController().signal }) as never;
const approved = { domains: ['api.weather.example'], secretRefs: [] as string[] };
/** The response without the server's clock. */
const undated = (response: unknown) => { const { headers, ...rest } = response as { headers: Record<string, string> }; const { date: _date, ...kept } = headers; return { ...rest, headers: kept }; };
const lookupTo = (address: string) => (_host: string, callback: (error: Error | null, addresses: Array<{ address: string; family: number }>) => void) => callback(null, [{ address, family: 4 }]);

test('addresses a plugin may reach are public ones only', () => {
  for (const address of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.5', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '224.0.0.1']) assert.equal(publicAddress(address), false, address);
  for (const address of ['93.184.216.34', '1.1.1.1', '2606:4700:4700::1111']) assert.equal(publicAddress(address), true, address);
  // A proxy in fake-IP mode answers every site's name from 198.18.0.0/15 (the development machine's proxy).
  for (const address of ['198.18.0.51', '198.19.255.1']) assert.equal(publicAddress(address), true, address);
});

test('checks get a stand-in; a trial only reads; the address, port and scheme are the host\'s rules', async () => {
  const network = hostNetwork({ reach: identity => identity.namespace === 'installed' ? 'all' : identity.namespace === 'preview' ? 'read' : 'none', lookup: lookupTo('127.0.0.1') });
  assert.deepEqual(await network.request(context('checks'), { url: 'https://api.weather.example/today' }, approved), NETWORK_STAND_IN);
  assert.deepEqual(await network.request(context('preview'), { url: 'https://api.weather.example/today', method: 'POST', body: '{}' }, approved), NETWORK_STAND_IN, 'a trial never sends a write');
  await assert.rejects(network.request(context(), { url: 'http://api.weather.example/today' }, approved), /只能访问 https/);
  await assert.rejects(network.request(context(), { url: 'https://api.weather.example:8443/today' }, approved), /标准 https 端口/);
  await assert.rejects(network.request(context(), { url: 'https://other.example/today' }, approved), /没有批准访问 other\.example/);
  await assert.rejects(network.request(context(), { url: 'https://127.0.0.1/x' }, { domains: ['127.0.0.1'], secretRefs: [] }), /不能直接访问 IP/);
  await assert.rejects(network.request(context(), { url: 'https://api.weather.example/today' }, approved), /不能访问本机或内网地址/, 'an approved name that resolves to a private address is refused');
  await assert.rejects(network.request(context(), { url: 'https://api.weather.example/today' }, { ...approved, secretRefs: ['weather'] }), /还没有为这个插件保存密钥「weather」/);
});

test('an approved https request goes out with the saved secret, comes back bounded, and a redirect is handed back rather than followed', { timeout: 30_000 }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'plugin-network-'));
  try {
    try { execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=api.weather.example', '-addext', 'subjectAltName=DNS:api.weather.example',
      '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem')], { stdio: 'ignore' }); }
    catch { t.skip('openssl is not available'); return; }
    const [key, cert] = await Promise.all([readFile(join(dir, 'key.pem')), readFile(join(dir, 'cert.pem'))]);
    const seen: Array<Record<string, unknown>> = [];
    const server = createServer({ key, cert }, (request, response) => {
      seen.push({ path: request.url, method: request.method, authorization: request.headers.authorization, cookie: request.headers.cookie, accept: request.headers.accept });
      if (request.url === '/moved') { response.writeHead(302, { location: 'https://elsewhere.example/', 'set-cookie': 'a=b' }); response.end(); return; }
      if (request.url === '/huge') { response.writeHead(200); response.end(Buffer.alloc(1024 * 1024 + 10, 97)); return; }
      response.writeHead(200, { 'content-type': 'application/json', 'set-cookie': 'secret=1' }); response.end('{"temperature":21}');
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    try {
      // Reach the local test server as if it were the approved site on 443; the connection still asks our lookup.
      const agent = new Agent({ ca: cert });
      (agent as unknown as { createConnection(options: object, callback: unknown): unknown }).createConnection = (options: object) => tlsConnect({ ...options, port });
      const network = hostNetwork({ reach: () => 'all', lookup: lookupTo('127.0.0.1'), allowAddress: () => true, agent,
        secret: async (_plugin, reference) => reference === 'weather' ? { header: 'Authorization', value: 'Bearer s3cret' } : null });
      const ok = await network.request(context(), { url: 'https://api.weather.example/today', headers: { Accept: 'application/json', Cookie: 'x=1', Authorization: 'forged' }, secretRefs: ['weather'] }, { ...approved, secretRefs: ['weather'] });
      assert.deepEqual(undated(ok), { status: 200, headers: { 'content-type': 'application/json' }, body: '{"temperature":21}' }, 'no cookies come back');
      assert.deepEqual(seen[0], { path: '/today', method: 'GET', authorization: 'Bearer s3cret', cookie: undefined, accept: 'application/json' }, 'the saved secret replaces what the plugin wrote; cookies never leave');
      assert.deepEqual(undated(await network.request(context(), { url: 'https://api.weather.example/moved' }, approved)), { status: 302, headers: { location: 'https://elsewhere.example/' }, body: '' });
      assert.equal(seen.length, 2, 'the redirect was not followed');
      await assert.rejects(network.request(context(), { url: 'https://api.weather.example/huge' }, approved), /超过 1MB/);
      // The same connection path refuses a private address when the address policy is the real one.
      const strict = hostNetwork({ reach: () => 'all', lookup: lookupTo('127.0.0.1'), agent });
      await assert.rejects(strict.request(context(), { url: 'https://api.weather.example/today' }, approved), /不能访问本机或内网地址/);
      assert.equal(seen.length, 3, 'nothing reached the server for the refused request');
      agent.destroy();
    } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('a plugin\'s saved secrets: listed without values, one plugin cannot read another\'s, the host\'s headers are off limits, uninstall forgets them', async () => {
  const { pluginSecrets } = await import('../apps/local-host/src/plugin-builder/secrets.js');
  const values = new Map<string, string>(), kept = new Map<string, string>();
  const sealed = { put: (ref: string, value: string) => { values.set(ref, value); }, get: (ref: string) => values.get(ref) ?? null, delete: (ref: string) => { values.delete(ref); } } as never;
  const storage = { get: (key: string) => kept.get(key) ?? null, set: (key: string, value: string) => { kept.set(key, value); }, delete: (key: string) => kept.delete(key) } as never;
  const secrets = pluginSecrets(undefined, 'board', storage, sealed);
  const a = 'io.molis.work.generated.a', b = 'io.molis.work.generated.b';
  secrets.save(a, { name: 'weather', header: 'X-Api-Key', value: 'k-123' });
  assert.deepEqual(secrets.list(a), [{ name: 'weather', header: 'X-Api-Key' }]);
  assert.deepEqual(await secrets.resolve(a, 'weather'), { header: 'X-Api-Key', value: 'k-123' });
  assert.equal(await secrets.resolve(b, 'weather'), null, 'another plugin naming the same secret gets nothing');
  assert.throws(() => secrets.save(a, { name: 'x', header: 'Cookie', value: 'v' }), /不能用来放密钥/);
  assert.throws(() => secrets.save(a, { name: 'x', header: 'Authorization', value: 'a\r\nHost: evil' }), /不能换行/);
  assert.ok(![...kept.values()].some(value => value.includes('k-123')), 'the value never lands in plain plugin storage');
  secrets.remove(a);
  assert.deepEqual(secrets.list(a), []); assert.equal(values.size, 0);
});
