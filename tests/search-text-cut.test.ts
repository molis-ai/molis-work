import assert from "node:assert/strict";
import test from "node:test";
import { searchText } from "@molis-ai/molis-work-contracts/platform/actions";

// RAC-2255 to RAC-2257 (T-247): searchText cuts by UTF-16 units; a cut between the two halves of a character drops the lone half.
const endsWithLoneHigh = (text: string): boolean => {
  const last = text.charCodeAt(text.length - 1);
  return last >= 0xd800 && last <= 0xdbff;
};

test("RAC-2255 a cut between the two halves of a character drops the lone half and stays within max units", () => {
  const cases: Array<[string, number, string]> = [
    ["ab😀", 3, "ab"],
    ["😀😀", 3, "😀"],
    ["😀", 1, ""],
    ["a\u{10000}", 2, "a"],
    ["a\u{10FFFF}", 2, "a"],
    ["a😀b", 3, "a😀"],
    ["  a\n\n😀x ", 3, "a "],
  ];
  for (const [input, max, expected] of cases) {
    const result = searchText(input, max);
    assert.equal(result, expected, `${JSON.stringify(input)} cut at ${max}`);
    assert.ok(result.length <= max, `${JSON.stringify(input)} cut at ${max} is ${result.length} units`);
    assert.equal(endsWithLoneHigh(result), false, `${JSON.stringify(input)} cut at ${max} ends with half a character`);
  }
});

test("RAC-2256 text without two-unit characters comes out exactly as before", () => {
  assert.equal(searchText("\u0000a\tb\u007f  c\n"), "a b c");
  assert.equal(searchText("hello world", 5), "hello");
  assert.equal(searchText(null), "");
  assert.equal(searchText(undefined), "");
  assert.equal(searchText(42), "42");
  assert.equal(searchText("中文 测试", 0), "");
  // The formula before T-247, kept here as the reference for every cut point.
  // eslint-disable-next-line no-control-regex
  const before = (raw: string, max: number) => raw.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, " ").replace(/\s+/gu, " ").trim().slice(0, max);
  const inputs = ["plain ascii text", "  leading and trailing  ", "中文的搜索摘要，含标点。", "混合 mixed\t文字\r\n第二行", "\u0001控制\u001f字符\u007f", "a\u000b\u000cb\u000e\u001fc", ""];
  for (const input of inputs) {
    for (let max = 0; max <= input.length + 1; max += 1) assert.equal(searchText(input, max), before(input, max), `${JSON.stringify(input)} cut at ${max}`);
  }
});
