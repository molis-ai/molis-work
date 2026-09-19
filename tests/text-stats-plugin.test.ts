import assert from "node:assert/strict";
import test from "node:test";

import {
  countCodePoints,
  countLines,
  projectTextStats,
  textStatsManifest,
  unavailableStats,
  waitingStats,
} from "@molis-ai/molis-work-plugin-text-stats";

function snapshot(text: string) {
  return {
    snapshot: { workspace: { workspace_id: "ws-1", name: "项目" }, path: ["a.txt"], text },
    source_plugin_id: "io.molis.work.files",
    content_version: 4,
  };
}

test("三个计数各算各的，不会互相顶替", () => {
  // One emoji: 1 code point, 2 UTF-16 units, 4 UTF-8 bytes.
  const view = projectTextStats(snapshot("😀"));
  assert.equal(view.characters, 1);
  assert.equal(view.utf8_bytes, 4);
  assert.equal(view.lines, 1);
});

test("中文按字符算一个，按字节算三个", () => {
  const view = projectTextStats(snapshot("中文"));
  assert.equal(view.characters, 2);
  assert.equal(view.utf8_bytes, 6);
});

test("空文件没有行；结尾的换行不多算一行", () => {
  assert.equal(countLines(""), 0);
  assert.equal(countLines("a"), 1);
  assert.equal(countLines("a\n"), 1, "结尾换行是上一行的结束，不是新一行的开始");
  assert.equal(countLines("a\nb"), 2);
  assert.equal(countLines("a\nb\n"), 2);
  assert.equal(countLines("a\r\nb\r\n"), 2, "CRLF 是一个行尾，不是两个");
  assert.equal(countLines("\n"), 1);
});

test("代理对不会被数成两个字符", () => {
  assert.equal(countCodePoints("a😀b"), 3);
  assert.equal("a😀b".length, 4, "UTF-16 长度确实是 4，所以才不能拿它当字符数");
});

test("来源带着版本，两个对不上的数字才解释得清", () => {
  const view = projectTextStats(snapshot("hello"));
  assert.equal(view.source?.content_version, 4);
  assert.equal(view.source?.path, "a.txt");
  assert.equal(view.source?.workspace_name, "项目");
});

test("等待与失效是两种状态，只有失效给下一步", () => {
  assert.equal(waitingStats().phase, "waiting");
  assert.equal(waitingStats().recovery, undefined);
  assert.equal(unavailableStats().phase, "unavailable");
  assert.match(unavailableStats().recovery ?? "", /重新捕获/);
  assert.equal(waitingStats().characters, undefined, "没数过就不该有数字");
});

test("最小插件：不要能力、不发端口、不发事件", () => {
  assert.deepEqual(textStatsManifest.capabilities.consumes, []);
  assert.deepEqual(textStatsManifest.ports?.outputs, []);
  assert.equal(textStatsManifest.events, undefined);
  assert.equal(textStatsManifest.ports?.inputs.length, 1);
});
