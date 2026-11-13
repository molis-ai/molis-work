// Code intelligence on the Host side (specs/coding-plugin/next-requirements.md A4/A4-1，用户 2026-11-12 定宿主侧):
// the executor behind the official coding pack's `coding.find-symbol`，按文件类型按需起语言服务器、会话结束关闭。

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createCodeIntelligence, languageServersFrom } from "@molis-ai/molis-work-service-agent-host";

const here = fileURLToPath(new URL(".", import.meta.url));
const fake = join(here, "fixtures/fake-lsp-server.mjs");

function workspace(): { readonly root: string; readonly log: string; close(): void } {
  const root = mkdtempSync(join(tmpdir(), "molis-code-intelligence-"));
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src/a.ts"), "export function greet(): string {\n  return 'hi';\n}\n\nexport const x = greet();\n");
  writeFileSync(join(root, "src/b.py"), "print('hi')\n");
  const log = join(root, "server.log");
  return { root, log, close: () => rmSync(root, { recursive: true, force: true }) };
}

/** 假服务器把「起了、握了手、关了」写进 log；孩子进程继承这台测试进程的环境。 */
const servers = (log: string) => {
  process.env.FAKE_LSP_LOG = log;
  return languageServersFrom({ servers: [{ extensions: [".ts", ".tsx"], command: process.execPath, args: [fake], languageId: "typescript" }] });
};

test("A4-1 语言服务器：配置写错了就拒，不静默跳过", () => {
  assert.throws(() => languageServersFrom({}), /servers list/);
  assert.throws(() => languageServersFrom({ servers: [{ command: "", extensions: [".ts"] }] }), /command/);
  assert.throws(() => languageServersFrom({ servers: [{ command: "x", extensions: [] }] }), /extensions/);
  assert.throws(() => languageServersFrom({ servers: [{ command: "x", extensions: ["ts"] }] }), /extensions/);
  assert.throws(() => languageServersFrom({ servers: [{ command: "x", extensions: [".ts"], args: ["a", 1] }] }), /args/);
  const parsed = languageServersFrom({ servers: [{ command: "srv", extensions: [".TS"], args: ["--stdio"] }] });
  assert.deepEqual(parsed, [{ command: "srv", extensions: [".ts"], args: ["--stdio"] }]);
});

test("A4-1 查定义与引用：按文件类型起服务器，会话结束关掉它", { timeout: 30_000 }, async () => {
  const home = workspace();
  try {
    const intelligence = createCodeIntelligence({ servers: servers(home.log), rootPath: home.root });
    const result = await intelligence.symbolIndex({ args: { path: "src/a.ts", symbol: "greet" } } as never);
    assert.match(result, /symbol greet in src\/a\.ts/);
    assert.match(result, /definition:/);
    // 假服务器把定义指在第三行第十列（0 基 2:9），引用指在两处。
    assert.match(result, /a\.ts:3:10/);
    assert.match(result, /references:/);
    assert.match(result, /a\.ts:9:5/);
    assert.match(result, /a\.ts:13:3/);
    // 服务器真的起了、接了握手、开了文档。
    const log = readFileSync(home.log, "utf8").split("\n");
    assert.ok(log.includes("started"));
    assert.ok(log.includes("initialize"));
    assert.ok(log.some((line) => line.startsWith("opened:file://")));
    // 收工时把它关掉，而不是留一个进程。
    await intelligence.close();
    const after = readFileSync(home.log, "utf8");
    assert.match(after, /shutdown/);
    assert.match(after, /exited/);
  } finally { delete process.env.FAKE_LSP_LOG; home.close(); }
});

test("A4-1 只读本轮的目录；没有登记的服务器就明确拒绝", { timeout: 30_000 }, async () => {
  const home = workspace();
  try {
    const intelligence = createCodeIntelligence({ servers: servers(home.log), rootPath: home.root });
    // A real file next to the round's root: the check is about where it resolves, not about it not existing.
    writeFileSync(join(dirname(home.root), "outside.ts"), "export const leaked = 1;\n");
    await assert.rejects(intelligence.symbolIndex({ args: { path: "../outside.ts", symbol: "x" } } as never), /outside it/);
    // .py 没有登记服务器：说清楚没有登记，不是空结果，也不是去装一个。
    await assert.rejects(intelligence.symbolIndex({ args: { path: "src/b.py", symbol: "x" } } as never), /no language server is configured for \.py/);
    // 没有 path 就不猜。
    await assert.rejects(intelligence.symbolIndex({ args: { symbol: "greet" } } as never), /needs a path/);
    await intelligence.close();
    // 关掉之后不再悄悄起一个。
    await assert.rejects(intelligence.symbolIndex({ args: { path: "src/a.ts", symbol: "greet" } } as never), /closed/);
    assert.equal(existsSync(join(home.root, "src/a.ts")), true);
  } finally { delete process.env.FAKE_LSP_LOG; home.close(); }
});
