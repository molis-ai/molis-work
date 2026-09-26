import assert from "node:assert/strict";
import test from "node:test";

import {
  PrologueCredentialBridge,
  type PrologueCredentialHost,
} from "@molis-ai/molis-work-service-agent-host";

/**
 * C6 的最后一跳：Molis Work 的密钥引用换成 Prologue 认识的引用。
 * 两边的密钥库是分开的；相同密钥复用交接结果，更新和撤销从下一轮生效。
 */

function hostDouble() {
  const written: Array<{ label: string; bytes: Uint8Array; seen: string }> = [];
  const host: PrologueCredentialHost = {
    async writeCredential(input) {
      // 记下交接当时看到的明文，以及那个 buffer 本身（之后要确认被清零）
      written.push({
        label: input.label,
        bytes: input.secret.plaintext,
        seen: new TextDecoder().decode(input.secret.plaintext),
      });
      return { ref: { kind: "credential", id: `prologue-cred-${written.length}`, revision: 1 } };
    },
  };
  return { host, written };
}

test("我们的引用换成 Prologue 的引用，密钥只交接一次", async () => {
  const { host, written } = hostDouble();
  let resolved = 0;
  const bridge = new PrologueCredentialBridge({
    host,
    resolve: () => { resolved += 1; return "sk-super-secret-value"; },
  });

  const first = await bridge.prologueRefFor("model-provider:minimax");
  const afterFirst = resolved;
  const second = await bridge.prologueRefFor("model-provider:minimax");
  assert.deepEqual(first, { kind: "credential", id: "prologue-cred-1", revision: 1 });
  assert.equal(second, first, "同一个引用不该反复写进 Prologue");
  assert.ok(afterFirst > 0 && resolved > afterFirst, "包括缓存命中在内的每轮都重新确认密钥");
  assert.equal(written.length, 1);
  assert.equal(written[0]?.label, "model-provider:minimax");
  assert.equal(written[0]?.seen, "sk-super-secret-value");
});

test("交接完成后，递过去的字节被清零", async () => {
  const { host, written } = hostDouble();
  const bridge = new PrologueCredentialBridge({ host, resolve: () => "sk-1" });
  await bridge.prologueRefFor("model-provider:minimax");
  const bytes = written[0]!.bytes;
  assert.equal(bytes.length > 0, true);
  assert.deepEqual([...bytes], new Array(bytes.length).fill(0),
    "buffer 用完要抹掉——JS 里字符串抹不掉，能抹的这份就该抹");
});

test("没配凭据解析时，报的是「两边密钥库分开」而不是一个含糊的失败", async () => {
  const { host } = hostDouble();
  const bridge = new PrologueCredentialBridge({ host, resolve: undefined });
  await assert.rejects(
    () => bridge.prologueRefFor("model-provider:minimax"),
    (error: unknown) => error instanceof Error && /两边的密钥库是分开的/.test(error.message),
  );
});

test("密钥库里没有对应密钥时，明确说出是哪个引用", async () => {
  const { host, written } = hostDouble();
  const bridge = new PrologueCredentialBridge({ host, resolve: () => null });
  await assert.rejects(
    () => bridge.prologueRefFor("model-provider:gone"),
    (error: unknown) => error instanceof Error && /model-provider:gone/.test(error.message),
  );
  assert.equal(written.length, 0, "解析不到就不该往 Prologue 写任何东西");
});

test("空白密钥和没有密钥一样被拒", async () => {
  const { host, written } = hostDouble();
  const bridge = new PrologueCredentialBridge({ host, resolve: () => "   " });
  await assert.rejects(() => bridge.prologueRefFor("model-provider:blank"));
  assert.equal(written.length, 0);
});

test("不同的引用各自交接，互不串", async () => {
  const { host, written } = hostDouble();
  const bridge = new PrologueCredentialBridge({
    host,
    resolve: (ref) => ref === "model-provider:a" ? "sk-a" : "sk-b",
  });
  assert.equal((await bridge.prologueRefFor("model-provider:a")).id, "prologue-cred-1");
  assert.equal((await bridge.prologueRefFor("model-provider:b")).id, "prologue-cred-2");
  assert.deepEqual(written.map((entry) => entry.seen), ["sk-a", "sk-b"]);
});


test("密钥轮换从下一轮生效，撤销不能复用旧引用", async () => {
  const { host, written } = hostDouble();
  let key: string | null = "first-key";
  const bridge = new PrologueCredentialBridge({ host, resolve: () => key });
  const first = await bridge.prologueRefFor("provider");
  key = "rotated-key";
  const rotated = await bridge.prologueRefFor("provider");
  assert.notEqual(first.id, rotated.id);
  key = null;
  await assert.rejects(() => bridge.prologueRefFor("provider"), /没有/);
  assert.equal(written.length, 2);
});

test("并发起跑共享同一次密钥交接", async () => {
  const { host, written } = hostDouble();
  const bridge = new PrologueCredentialBridge({ host, resolve: async () => "same-key" });
  const refs = await Promise.all(Array.from({ length: 5 }, () => bridge.prologueRefFor("provider")));
  assert.equal(new Set(refs.map((ref) => ref.id)).size, 1);
  assert.equal(written.length, 1);
});

test("交接失败后可以重试，失败的明文字节也被清零", async () => {
  let attempts = 0;
  const buffers: Uint8Array[] = [];
  const bridge = new PrologueCredentialBridge({
    resolve: () => "retry-key",
    host: { async writeCredential(input) {
      buffers.push(input.secret.plaintext);
      if (++attempts === 1) throw new Error("store unavailable");
      return { ref: { kind: "credential", id: "retry-success", revision: 1 } };
    } },
  });
  await assert.rejects(() => bridge.prologueRefFor("provider"), /store unavailable/);
  assert.equal((await bridge.prologueRefFor("provider")).id, "retry-success");
  assert.ok(buffers.every((bytes) => bytes.every((byte) => byte === 0)));
});
