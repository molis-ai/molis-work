// A4-1 的界面一面：代码理解的工具名带回合作用域（`coding.find-symbol-<scope>`），时间线只显示人话，不露内部名。

import assert from "node:assert/strict";
import test from "node:test";
import { codingTimelineWords } from "@molis-ai/molis-work-plugin-coding";

test("A4-1: the scoped symbol tool reads as its own kind, never as the internal name", () => {
  const seen: string[] = [];
  const words = codingTimelineWords((key) => { seen.push(key); return key; });
  const scoped = words.named("coding.find-symbol-0123456789abcdef");
  assert.equal(scoped.key, "find-symbol");
  assert.equal(scoped.verb, "coding.call.find-symbol");
  assert.equal(scoped.doing, "coding.call.find-symbol.doing");
  assert.ok(seen.includes("coding.call.find-symbol"), "the words come from the language files");
});
