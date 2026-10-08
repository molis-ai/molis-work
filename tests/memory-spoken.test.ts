import assert from "node:assert/strict";
import test from "node:test";
import { quotedFrom, spokenAround } from "@molis-ai/molis-work-service-memory";

test("the person's words around a quote are the sentences of their saved message it lies in, as they wrote them, and nothing else is theirs", () => {
  const message = "好的，这周的周报我自己写。以后不要自动删除旧文件，包括临时文件。周报先写风险，别放最后。";
  // The quote may leave out spacing, punctuation and case; what comes back is the message's own text for the whole sentence.
  assert.deepEqual(spokenAround("自动删除旧文件", [message]), ["以后不要自动删除旧文件，包括临时文件。"]);
  assert.deepEqual(spokenAround("以后不要，自动删除旧文件", [message]), ["以后不要自动删除旧文件，包括临时文件。"]);
  assert.deepEqual(spokenAround("先写风险，别放最后", [message]), ["周报先写风险，别放最后。"]);
  // A quote across two sentences takes both of them.
  assert.deepEqual(spokenAround("我自己写。以后不要自动删除旧文件", [message]), ["好的，这周的周报我自己写。以后不要自动删除旧文件，包括临时文件。"]);
  // A whole message is its own sentence however long it is; English sentences end at a full stop followed by a space, not inside an address or a number.
  assert.deepEqual(spokenAround("好的", ["好的"]), ["好的"]);
  const english = "Never send the client list to the consultant. Send reports to boss@example.com every 3.5 days. Thanks";
  assert.deepEqual(spokenAround("SEND the CLIENT list to the consultant", [english]), ["Never send the client list to the consultant."]);
  assert.deepEqual(spokenAround("reports to boss@example.com every 3.5 days", [english]), ["Send reports to boss@example.com every 3.5 days."]);
  // A full stop after an abbreviation or a single letter does not end a sentence: the window keeps what comes before it.
  assert.deepEqual(spokenAround("send the client list", ["Please don't, e.g. send the client list. Thanks."]), ["Please don't, e.g. send the client list."]);
  assert.deepEqual(spokenAround("send the client list", ["Mr. Wu said never send the client list. Thanks."]), ["Mr. Wu said never send the client list."]);
  // Found in more than one message: each of them is theirs.
  assert.deepEqual(spokenAround("周报先写风险", ["周报先写风险，别放最后", "好的。周报先写风险！"]), ["周报先写风险，别放最后", "周报先写风险！"]);
  // Not their words: not in what they wrote, a fragment, or too short to say anything.
  assert.deepEqual(spokenAround("周报先写计划", [message]), []);
  assert.deepEqual(spokenAround("以后", [message]), []);
  assert.deepEqual(spokenAround("记", [message]), []);
  assert.deepEqual(spokenAround("自动删除旧文件", []), []);
  for (const quote of ["自动删除旧文件", "以后", "周报先写计划", "好的"]) assert.equal(quotedFrom(quote, [message]), spokenAround(quote, [message]).length > 0, quote);
});

test("an exception said in the sentence after the one the quote is in, or in the one before it, is part of what they said", () => {
  const message = "转账不用确认。除非超过一万元。另外周报先写风险。";
  assert.deepEqual(spokenAround("转账不用确认", [message]), ["转账不用确认。除非超过一万元。"]);
  assert.deepEqual(spokenAround("周报先写风险", [message]), ["另外周报先写风险。"]);
  assert.deepEqual(spokenAround("所有文件都抄送老板", ["除非是周报。所有文件都抄送老板。"]), ["除非是周报。所有文件都抄送老板。"]);
  assert.deepEqual(spokenAround("Delete files without asking", ["Delete files without asking. Unless they are contracts. Reply in Chinese."]), ["Delete files without asking. Unless they are contracts."]);
  // A verdict on it, in the next sentence, is theirs as well: it says no to the sentence before it. One that begins the message says no to nothing.
  assert.deepEqual(spokenAround("客户名单发给外部顾问", ["客户名单发给外部顾问。这是不允许的。周报先写风险。"]), ["客户名单发给外部顾问。这是不允许的。"]);
  assert.deepEqual(spokenAround("周报先写风险", ["不行。周报先写风险。"]), ["周报先写风险。"]);
  // An exception clause that comes after a comma is in the sentence already.
  assert.deepEqual(spokenAround("转账不用确认", ["转账不用确认，除非超过一万元。好的。"]), ["转账不用确认，除非超过一万元。"]);
});
