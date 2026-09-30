import assert from "node:assert/strict";
import test from "node:test";
import { spokenTurns } from "../apps/local-host/src/assistant/assistant-service.js";

test("the runtime's compaction labels a reply opens with are not shown; a reply that was only labels goes", () => {
  // Seen from MiniMax-M3 after a long work was compacted.
  const turns = [
    { kind: "user", text: "[retained assistant run:x] 用户自己这样写也照样保留" },
    { kind: "assistant", text: "[retained assistant run:k-9unce]\n我先把两个能力的准确标识查一下。" },
    { kind: "assistant", text: "[retained assistant run:k-9unce]" },
    { kind: "assistant", text: " [historical assistant run:a1] [retained assistant]\n两个按钮已经准备好。" },
    { kind: "assistant", text: "正文里提到 [retained assistant] 不算开头，照样保留。" },
  ];
  assert.deepEqual(spokenTurns(turns).map(turn => turn.text), [
    "[retained assistant run:x] 用户自己这样写也照样保留",
    "我先把两个能力的准确标识查一下。",
    "两个按钮已经准备好。",
    "正文里提到 [retained assistant] 不算开头，照样保留。",
  ]);
});
