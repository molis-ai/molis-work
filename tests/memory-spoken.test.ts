import assert from "node:assert/strict";
import test from "node:test";
import { quotedFrom, theirWords } from "@molis-ai/molis-work-service-memory";

const said = (text: string, ...messages: string[]) => theirWords(text, messages) !== null;

test("a text is the person's words when it is the whole of one of their messages: one sentence, several, a list with its header; what comes back is the message as they wrote it", () => {
  const messages = [
    "以后回答都用要点列表",
    "转账不用确认。除非超过一万元。",
    "Always reply in Chinese. Never use emojis.",
    "以后这些都不要做：\n1. 把客户名单发给外部顾问\n2. 周末给客户发消息",
  ];
  assert.equal(theirWords("以后回答都用要点列表", messages), "以后回答都用要点列表");
  // A run of sentences is theirs when it is the whole message, with every sentence of it.
  assert.equal(theirWords("转账不用确认。除非超过一万元。", messages), "转账不用确认。除非超过一万元。");
  assert.equal(theirWords("Always reply in Chinese. Never use emojis.", messages), "Always reply in Chinese. Never use emojis.");
  // A list is read with its header and every item: the whole message.
  assert.equal(theirWords("以后这些都不要做：\n1. 把客户名单发给外部顾问\n2. 周末给客户发消息", messages), messages[3]);
  // The message comes back as they wrote it, not as the text spells it.
  assert.equal(theirWords("always reply in chinese. never use emojis", messages), "Always reply in Chinese. Never use emojis.");
  assert.equal(theirWords("转账不用确认。除非超过一万元", messages), "转账不用确认。除非超过一万元。");
});

test("only these differences are ignored: case, width, quotation marks, spacing and one sentence mark at the very end; a comma, a question mark, a word, an order or a digit are not", () => {
  const same: Array<[text: string, message: string]> = [
    ["never send the client list to the consultant", "Never send the client list to the consultant."],
    ["以后回答都用要点列表。", "以后回答都用要点列表"],
    ["以后回答都用要点列表!", "以后回答都用要点列表。"],
    ["记住:周报先写风险", "记住：周报先写风险"],
    ["记住：周报先写风险（别放最后）", "记住：周报先写风险(别放最后)"],
    ["预算上限１００", "预算上限100"],
    ["预算上限 ￥500", "预算上限 ¥500"],
    ["NSM是北极星指标", "NSM 是北极星指标"],
    ["给 Bob 发周报", "给Bob发周报"],
    ["Reply  in\tChinese", "Reply in Chinese"],
    ["Always reply in Chinese.\nNever use emojis.", "Always reply in Chinese. Never use emojis."],
    ["He said \"no\" to it", "He said “no” to it"],
    ["don't send it", "Don’t send it"],
    ["「周报」先写风险", "“周报”先写风险"],
    ["先写风险。再写进展。", "先写风险.再写进展."],
  ];
  for (const [text, message] of same) assert.equal(theirWords(text, [message]), message, `${JSON.stringify(text)} / ${JSON.stringify(message)}`);
  const different: Array<[text: string, message: string]> = [
    ["不要发给外部顾问", "不，要发给外部顾问"], // a comma can turn it round
    ["周报先写风险再写进展", "周报先写风险，再写进展"],
    ["周报先写风险。再写进展", "周报先写风险，再写进展"],
    ["Send the report", "Send the report?"], // a question is not what they asked for
    ["Send the report", "Send the report..."],
    ["Send the report", "Send the report!!"],
    ["Sendthe report", "Send the report"],
    ["先写风险再写进展", "先写进展再写风险"],
    ["预算上限 500", "预算上限 5000"],
    ["预算上限 500", "预算上限 ٥٠٠"],
    ["- 周报先写风险", "周报先写风险"],
    ["周报先写风险", "◆ 周报先写风险"],
    ["Use tables", "◇ Use tables"],
  ];
  for (const [text, message] of different) assert.equal(theirWords(text, [message]), null, `${JSON.stringify(text)} / ${JSON.stringify(message)}`);
});

test("a part of a message is not theirs, whichever part: what a sentence says can lie in the one beside it, and nothing here reads that", () => {
  const message = "好的，这周的周报我自己写。以后不要自动删除旧文件，包括临时文件。周报先写风险，别放最后。";
  assert.equal(theirWords(message, [message]), message);
  // One sentence of three, a clause, the same without its mark, the first two, the last two.
  for (const part of ["以后不要自动删除旧文件，包括临时文件。", "以后不要自动删除旧文件，包括临时文件", "好的，这周的周报我自己写", "周报先写风险，别放最后", "自动删除旧文件",
    "好的，这周的周报我自己写。以后不要自动删除旧文件，包括临时文件。", "以后不要自动删除旧文件，包括临时文件。周报先写风险，别放最后。"]) assert.equal(said(part, message), false, part);
  // The sentence beside it is what makes the other one mean what it means: an exception after a permission, a ban in front of what is banned, a "no" after a question.
  assert.equal(said("转账不用确认", "转账不用确认。除非超过一万元。"), false);
  assert.equal(said("Delete files without asking", "Delete files without asking. Unless they are contracts."), false);
  assert.equal(said("所有文件都抄送老板", "除非是周报。所有文件都抄送老板。"), false);
  assert.equal(said("把客户名单发给外部顾问", "下面这些以后别做了。把客户名单发给外部顾问。"), false);
  assert.equal(said("把客户名单发给外部顾问", "把客户名单发给外部顾问？没门！"), false);
  assert.equal(said("Send the client list to the consultant", "Send the client list to the consultant? No way."), false);
  assert.equal(said("把客户名单发给外部顾问", "把客户名单发给外部顾问。这是不允许的。周报先写风险。"), false);
  // ...and said with the sentence beside it, it is theirs.
  assert.equal(said("转账不用确认。除非超过一万元。", "转账不用确认。除非超过一万元。"), true);
  assert.equal(said("把客户名单发给外部顾问？没门！", "把客户名单发给外部顾问？没门！"), true);
});

test("a list is read with its header and all of its items: the items alone, the header alone, the header with some of the items or a ban in front of a colon are not theirs", () => {
  const list = "以后这些都不要做：\n1. 把客户名单发给外部顾问\n2. 周末给客户发消息";
  assert.equal(said(list, list), true);
  assert.equal(said("以后这些都不要做： 1. 把客户名单发给外部顾问 2. 周末给客户发消息", list), true, "a line break is white space, the same as a space");
  assert.equal(said("以后这些都不要做：1. 把客户名单发给外部顾问 2. 周末给客户发消息", list), false, "and no space is not a space");
  for (const part of ["1. 把客户名单发给外部顾问\n2. 周末给客户发消息", "把客户名单发给外部顾问", "客户名单发给外部顾问", "1. 把客户名单发给外部顾问", "以后这些都不要做：", "以后这些都不要做", "以后这些都不要做：\n1. 把客户名单发给外部顾问"])
    assert.equal(said(part, list), false, part);
  const english = "Never do the following:\n- send the client list to the consultant\n- push to main";
  assert.equal(said(english, english), true);
  for (const part of ["Send the client list to the consultant", "- send the client list to the consultant", "send the client list to the consultant\n- push to main", "Never do the following:"]) assert.equal(said(part, english), false, part);
  // A ban before a colon is part of the same sentence.
  assert.equal(said("把客户名单发给外部顾问", "禁止：把客户名单发给外部顾问"), false);
  assert.equal(said("禁止：把客户名单发给外部顾问", "禁止：把客户名单发给外部顾问"), true);
  assert.equal(said("push straight to main", "Never do this: push straight to main."), false);
});

test("one message at a time: words of two messages joined are not theirs, and a text found inside another message that goes on past it is not theirs either", () => {
  assert.equal(said("周报先写风险，别放最后", "周报先写风险", "别放最后"), false);
  assert.equal(said("周报先写风险别放最后", "周报先写风险", "别放最后"), false);
  // It is one of the messages, found among others.
  assert.equal(theirWords("周报先写风险", ["好的", "周报先写风险", "再看看"]), "周报先写风险");
  // It is the whole of one message and part of another that goes on or says no: they did not say it plain.
  assert.equal(said("自动清理旧日志", "自动清理旧日志", "不要自动清理旧日志"), false);
  assert.equal(said("自动清理旧日志", "不要自动清理旧日志", "自动清理旧日志"), false);
  assert.equal(said("自动清理旧日志", "自动清理旧日志", "自动清理旧日志的功能怎么样了"), false);
  // The same message twice is the same words twice.
  assert.equal(theirWords("自动清理旧缓存", ["自动清理旧缓存", "自动清理旧缓存。"]), "自动清理旧缓存");
});

test("nothing to compare is not theirs: no messages, an empty one, a single character", () => {
  assert.equal(theirWords("以后回答都用要点列表", []), null);
  assert.equal(theirWords("以后回答都用要点列表", ["", "   "]), null);
  assert.equal(theirWords("好", ["好"]), null);
  assert.equal(theirWords("。", ["。"]), null);
  assert.equal(theirWords("好的", ["好的"]), "好的");
});

test("a quote is a real stretch of what they said only when it is a whole message or at least six characters in three or more units; it does not make a memory theirs", () => {
  const message = "好的，这周的周报我自己写。以后不要自动删除旧文件，包括临时文件。周报先写风险，别放最后。";
  assert.equal(quotedFrom("自动删除旧文件", [message]), true);
  assert.equal(quotedFrom("以后不要，自动删除旧文件", [message]), true, "spacing and punctuation are set aside");
  assert.equal(quotedFrom("SEND the CLIENT list to the consultant", ["Never send the client list to the consultant."]), true);
  assert.equal(quotedFrom("好的", ["好的"]), true, "a whole message is its own quote");
  for (const quote of ["以后", "记", "周报先写计划", "好的"]) assert.equal(quotedFrom(quote, [message]), false, quote);
  assert.equal(quotedFrom("自动删除旧文件", []), false);
  // The quote may be a stretch of the message while the memory is not the message: the first is evidence, the second is the rule.
  assert.equal(said("自动删除旧文件", message), false);
});
