import assert from 'node:assert/strict';
import { test } from 'node:test';
import dns from 'node:dns/promises';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { isIP } from 'node:net';
import { assertSchema, assertMatches, isPublicAddress, validateNetworkRequest, createHttpsProxy } from '../packages/plugin-sandbox/dist/index.js';

test('strict schema validator rejects unknown keywords and checks nested constraints', () => {
  for (const schema of [{ type: 'string', pattern: '.*' }, { type: 'object' }, { type: 'array' }, { type: 'object', properties: {}, required: ['missing'], additionalProperties: false }, { type: 'integer', minimum: 10, maximum: 1 }]) assert.throws(() => assertSchema(schema));
  const schema = { type: 'object', properties: { count: { type: 'integer', minimum: 1 } }, required: ['count'], additionalProperties: false } as const;
  assertSchema(schema); assertMatches(schema, { count: 2 });
  for (const input of [{ count: 0 }, { count: 1.5 }, { count: 1, extra: true }, {}]) assert.throws(() => assertMatches(schema, input));
});

test('proxy public address policy rejects IPv4, IPv6, mapped and transition SSRF targets', () => {
  for (const address of ['127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.1', '100.64.0.1', '169.254.169.254', '0.0.0.0', '198.18.0.1', '192.0.2.1', '224.0.0.1', '::1', '::', '::ffff:127.0.0.1', '::ffff:7f00:1', 'fc00::1', 'fe80::1', '64:ff9b::7f00:1', '2002:7f00:1::', '2001:db8::1', '2001::1']) assert.equal(isPublicAddress(address), false, address);
  for (const address of ['1.1.1.1', '8.8.8.8', '2606:4700:4700::1111']) assert.equal(isPublicAddress(address), true, address);
});

test('proxy rejects URL, header, secret reference, and body escapes before opening sockets', () => {
  for (const url of ['http://example.com/', 'https://127.0.0.1/', 'https://[::ffff:127.0.0.1]/', 'https://example.com.evil.test/', 'https://example.com:444/', 'https://name:password@example.com/', 'https://example.com./', 'https://example.com/#fragment']) assert.throws(() => validateNetworkRequest({ url }, ['example.com'], 1024));
  assert.equal(validateNetworkRequest({ url: 'https://example.com/a' }, ['example.com'], 1024).hostname, 'example.com');
  for (const headers of [{ Host: 'localhost' }, { 'content-length': '100' }, { authorization: 'a\r\nb' }]) assert.throws(() => validateNetworkRequest({ url: 'https://example.com', headers }, ['example.com'], 1024));
  assert.throws(() => validateNetworkRequest({ url: 'https://example.com', body: 'x'.repeat(2048) }, ['example.com'], 1024));
});

test('host resolver answers still fail closed for private, mixed, malformed and mismatched addresses', async () => {
  const context = { identity: { projectId: 'p', installationId: 'i', pluginId: 'test', namespace: 'preview' as const }, operationId: 'test', signal: new AbortController().signal };
  for (const addresses of [[], [{ address: '127.0.0.1', family: 4 }], [{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.1', family: 4 }], [{ address: '198.18.0.1', family: 4 }], [{ address: '::ffff:7f00:1', family: 6 }], [{ address: '1.1.1.1', family: 6 }], [{ address: 'not-an-address', family: 4 }]]) {
    const proxy = createHttpsProxy({ resolveHostname: async (hostname, signal) => { assert.equal(hostname, 'example.com'); assert.equal(signal.aborted, false); return addresses; } });
    await assert.rejects(proxy.request(context, { url: 'https://example.com/' }, { domains: ['example.com'], secretRefs: [] }), { code: 'NETWORK_DENIED' });
  }
});

test('HTTPS proxy pins checked DNS, verifies hostname, rejects redirects and blocks secret echoes', async t => {
  const originalLookup = dns.lookup, originalRequest = https.request;
  let body = 'safe response', statusCode = 200, connections = 0;
  t.mock.method(dns, 'lookup', async () => [{ address: '93.184.216.34', family: 4 }]);
  t.mock.method(https, 'request', (options: Record<string, unknown>, receive: (r: PassThrough) => void) => {
    connections++;
    assert.equal(options.hostname, 'example.com'); assert.equal(options.servername, 'example.com'); assert.equal(options.agent, false); assert.equal(options.family, 4);
    (options.lookup as Function)('example.com', {}, (error: unknown, address: string, family: number) => { assert.equal(error, null); assert.equal(address, '93.184.216.34'); assert.equal(family, 4); });
    assert.equal((options.headers as Record<string, string>).authorization, 'Bearer top-secret-token');
    const req = new EventEmitter() as EventEmitter & { end(): void };
    req.end = () => queueMicrotask(() => { const res = Object.assign(new PassThrough(), { statusCode, headers: {} }); receive(res); res.end(body); });
    return req;
  });
  syncBuiltinESMExports();
  const context = { identity: { projectId: 'p', installationId: 'i', pluginId: 'test', namespace: 'preview' as const }, operationId: 'test', signal: new AbortController().signal };
  const request = { url: 'https://example.com/data', secretRefs: ['api-token'] };
  const authorization = { domains: ['example.com'], secretRefs: ['api-token'] };
  const proxy = createHttpsProxy({ resolveSecret: async () => ({ header: 'authorization', prefix: 'Bearer ', value: 'top-secret-token', domains: ['example.com'] }) });
  try {
    assert.equal((await proxy.request(context, request, authorization)).body, body);
    statusCode = 302; await assert.rejects(proxy.request(context, request, authorization), { code: 'REDIRECT_DENIED' }); statusCode = 200;
    for (const variant of ['top-secret-token', Buffer.from('top-secret-token').toString('base64'), Buffer.from('top-secret-token').toString('hex')]) {
      body = variant; await assert.rejects(proxy.request(context, request, authorization), { code: 'SECRET_IN_RESPONSE' });
    }
    body = 'safe injected result';
    const mutableAnswers = [{ address: '93.184.216.34', family: 4 }];
    const injected = createHttpsProxy({ resolveHostname: async () => mutableAnswers, resolveSecret: async () => {
      // A resolver cache changes during another await: connection keeps the checked copy.
      mutableAnswers[0]!.address = '127.0.0.1';
      return { header: 'authorization', prefix: 'Bearer ', value: 'top-secret-token', domains: ['example.com'] };
    } });
    assert.equal((await injected.request(context, request, authorization)).body, body);
    const before = connections;
    t.mock.method(dns, 'lookup', async () => [{ address: '93.184.216.34', family: 4 }, { address: '127.0.0.1', family: 4 }]); syncBuiltinESMExports();
    await assert.rejects(proxy.request(context, request, authorization), { code: 'NETWORK_DENIED' }); assert.equal(connections, before);
  } finally {
    // Restore named built-in ESM bindings as well as default export methods.
    dns.lookup = originalLookup; https.request = originalRequest; syncBuiltinESMExports();
  }
});

test('host resolver is bounded by request deadline and receives cancellation', async () => {
  const context = { identity: { projectId: 'p', installationId: 'i', pluginId: 'test', namespace: 'preview' as const }, operationId: 'test', signal: new AbortController().signal };
  let resolverSignal: AbortSignal | undefined;
  const proxy = createHttpsProxy({ timeoutMs: 25, resolveHostname: async (_hostname, signal) => { resolverSignal = signal; return new Promise(() => {}); } });
  // AbortSignal.timeout intentionally doesn't keep the process alive.
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    await assert.rejects(proxy.request(context, { url: 'https://example.com/' }, { domains: ['example.com'], secretRefs: [] }), { code: 'NETWORK_TIMEOUT' });
    assert.equal(resolverSignal?.aborted, true);
  } finally { clearTimeout(keepAlive); }
});

test('injected host resolver connects to real registry.npmjs.org over pinned HTTPS', { skip: process.env.MOLIS_SANDBOX_NETWORK_E2E !== '1', timeout: 35_000 }, async t => {
  // Integration-only dependency: the sandbox package itself never imports Agent Host.
  const { resolveModelHostname } = await import('../horizontal/agent-host/src/adapters/node-model-dns.js');
  let resolved: string[] = [];
  const proxy = createHttpsProxy({ timeoutMs: 30_000, resolveHostname: async (hostname, signal) => {
    assert.equal(hostname, 'registry.npmjs.org');
    // Test-only explicit host configuration for a transparent VPN whose fake-IP DNS
    // is active without proxy environment variables. Normal host behavior is unchanged.
    const ports = process.env.MOLIS_SANDBOX_NETWORK_DOH === '1' ? {
      lookup: async (name: string) => (await dns.lookup(name, { all: true })).map(answer => answer.address),
      fetch: (...args: Parameters<typeof fetch>) => fetch(...args),
      hasProxy: () => true,
    } : undefined;
    resolved = [...await resolveModelHostname(hostname, ports)];
    t.diagnostic(`checked DNS candidates: ${resolved.join(', ')}`);
    signal.throwIfAborted();
    return resolved.map(address => ({ address, family: isIP(address) }));
  } });
  const context = { identity: { projectId: 'network-test', installationId: 'network-test', pluginId: 'network-test', namespace: 'preview' as const }, operationId: 'registry.ping', signal: new AbortController().signal };
  const response = await proxy.request(context, { url: 'https://registry.npmjs.org/-/ping' }, { domains: ['registry.npmjs.org'], secretRefs: [] });
  assert.equal(response.status, 200);
  assert.match(response.headers['content-type'] ?? '', /application\/json/);
  assert.deepEqual(JSON.parse(response.body), {});
  assert.ok(resolved.length > 0 && resolved.every(isPublicAddress));
  t.diagnostic(`registry.npmjs.org returned HTTP ${response.status} through pinned HTTPS`);
});
