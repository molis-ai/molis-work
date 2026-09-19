import assert from "node:assert/strict";
import test from "node:test";

import {
  PrologueCredentialBridge,
  type PrologueCredentialHost,
} from "@molis-ai/molis-work-service-agent-host";

/**
 * C6 的最后一跳：Molis Work 的密钥引用换成 Prologue 认识的引用。
 * 两边的密钥库是分开的，密钥必须交接一次，而且只交接一次。
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
      return { ref: { id: `prologue-cred-${written.length}` } };
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
  const second = await bridge.prologueRefFor("model-provider:minimax");
  assert.equal(first, "prologue-cred-1");
  assert.equal(second, first, "同一个引用不该反复写进 Prologue");
  assert.equal(resolved, 1, "密钥库只被问了一次");
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
  assert.equal(await bridge.prologueRefFor("model-provider:a"), "prologue-cred-1");
  assert.equal(await bridge.prologueRefFor("model-provider:b"), "prologue-cred-2");
  assert.deepEqual(written.map((entry) => entry.seen), ["sk-a", "sk-b"]);
});
