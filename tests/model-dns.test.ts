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
