import test from "node:test";
import assert from "node:assert/strict";
import { resolveModelHostname } from "../horizontal/agent-host/src/adapters/node-model-dns.js";

test("没有显式代理或正常私网解析时，不以公共 DNS 绕过地址检查", async () => {
  for (const [addresses, hasProxy] of [[['198.18.0.10'], false], [['127.0.0.1'], true], [['10.2.0.1'], true]] as const) {
    assert.deepEqual(await resolveModelHostname('example.test', {
      lookup: async () => addresses, hasProxy: () => hasProxy,
      fetch: async () => { throw new Error('must not resolve externally'); },
    }), addresses);
  }
});

test("代理假地址通过 HTTPS 重新解析，混合私网地址仍交给 SDK 拒绝", async () => {
  const seen: URL[] = [];
  const resolved = await resolveModelHostname('example.test', {
    lookup: async () => ['198.18.0.60', 'fdfe:dcba:9876::46', '127.0.0.1'], hasProxy: () => true,
    fetch: async (input, init) => {
      const url = new URL(String(input)); seen.push(url);
      assert.equal(url.origin, 'https://dns.google');
      assert.equal(url.searchParams.get('name'), 'example.test');
      assert.equal(init?.redirect, 'error');
      return new Response(JSON.stringify({ Status: 0, Answer: url.searchParams.get('type') === '1' ? [{ type: 1, data: '1.1.1.1' }] : [] }));
    },
  });
  assert.deepEqual(resolved, ['1.1.1.1', '127.0.0.1']);
  assert.equal(seen.length, 2);
});

test("外部解析失败、无地址或私网响应，不编造公共地址", async () => {
  for (const body of [{ Status: 3 }, { Status: 0, Answer: [{ type: 5, data: 'alias.test' }] }]) {
    await assert.rejects(() => resolveModelHostname('example.test', {
      lookup: async () => ['198.18.0.60'], hasProxy: () => true,
      fetch: async () => new Response(JSON.stringify(body)),
    }), /没有返回可验证/);
  }
  assert.deepEqual(await resolveModelHostname('example.test', {
    lookup: async () => ['198.18.0.60'], hasProxy: () => true,
    fetch: async () => new Response(JSON.stringify({ Status: 0, Answer: [{ type: 1, data: '10.1.2.3' }] })),
  }), ['10.1.2.3']);
});

test("主公共 DNS 连接失败时使用备用 HTTPS 查询，保留混合私网地址", async () => {
  const seen: URL[] = [];
  const result = await resolveModelHostname('example.test', {
    lookup: async () => ['198.18.0.60', '10.1.2.3'], hasProxy: () => true,
    fetch: async (input, init) => {
      const url = new URL(String(input)); seen.push(url);
      assert.equal(url.searchParams.get('name'), 'example.test');
      assert.equal(init?.redirect, 'error');
      assert.equal(init?.headers, undefined);
      if (url.hostname === 'dns.google') throw new Error('connection timed out');
      assert.equal(url.origin, 'https://dns.alidns.com');
      return new Response(JSON.stringify({ Status: 0, Answer: url.searchParams.get('type') === '1' ? [{ type: 1, data: '1.1.1.1' }] : [] }));
    },
  });
  assert.deepEqual(result, ['1.1.1.1', '10.1.2.3']);
  assert.equal(seen.length, 4);
});

test("已收到的 DNS 拒绝、无效与私网回答不会换来源，两个来源不可达时仍拒绝", async () => {
  for (const body of [JSON.stringify({ Status: 3 }), 'not json', JSON.stringify({ Status: 0, Answer: [] })]) {
    await assert.rejects(() => resolveModelHostname('example.test', {
      lookup: async () => ['198.18.0.60'], hasProxy: () => true,
      fetch: async input => {
        assert.equal(new URL(String(input)).hostname, 'dns.google');
        return new Response(body);
      },
    }));
  }
  assert.deepEqual(await resolveModelHostname('example.test', {
    lookup: async () => ['198.18.0.60'], hasProxy: () => true,
    fetch: async input => {
      assert.equal(new URL(String(input)).hostname, 'dns.google');
      return new Response(JSON.stringify({ Status: 0, Answer: [{ type: 1, data: '127.0.0.1' }] }));
    },
  }), ['127.0.0.1']);
  await assert.rejects(() => resolveModelHostname('example.test', {
    lookup: async () => ['198.18.0.60'], hasProxy: () => true,
    fetch: async () => new Response('', { status: 503 }),
  }), /公共 DNS 查询不可用/);
});

test("后续查询复用可达的解析服务而非旧地址，服务失联后仍可切回", async () => {
  const seen: string[] = [];
  let reachable = 'dns.alidns.com', address = '1.1.1.1';
  const ports = {
    lookup: async () => ['198.18.0.60'], hasProxy: () => true,
    fetch: (async input => {
      const url = new URL(String(input)); seen.push(url.hostname);
      if (url.hostname !== reachable) throw new Error('unreachable');
      return new Response(JSON.stringify({ Status: 0, Answer: url.searchParams.get('type') === '1' ? [{ type: 1, data: address }] : [] }));
    }) as typeof fetch,
  };
  assert.deepEqual(await resolveModelHostname('example.test', ports), ['1.1.1.1']);
  seen.length = 0; address = '127.0.0.1';
  assert.deepEqual(await resolveModelHostname('example.test', ports), ['127.0.0.1']);
  assert.deepEqual(seen, ['dns.alidns.com', 'dns.alidns.com']);
  seen.length = 0; reachable = 'dns.google'; address = '8.8.8.8';
  assert.deepEqual(await resolveModelHostname('example.test', ports), ['8.8.8.8']);
  assert.deepEqual(seen, ['dns.alidns.com', 'dns.alidns.com', 'dns.google', 'dns.google']);
});
