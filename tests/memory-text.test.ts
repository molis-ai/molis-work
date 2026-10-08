import assert from "node:assert/strict";
import test from "node:test";
import { followsFrom } from "@molis-ai/molis-work-service-memory";

/** One of the person's messages: 86 characters, 69 distinct keywords (recall keeps only the first 60 of them). */
const LONG = "这周的周报请你帮我整理一下：先把本周完成的事项按项目列出来，再把遇到的风险和需要协调的资源写清楚，最后附上下周的计划，另外以后周报都先写风险，别放最后，语气保持克制不要夸张";
const RISK_FIRST = "以后周报都先写风险，别放最后";

/** [text, the words it rests on, other words it may reuse: the project's name, the memory it corrects] */
type Case = [text: string, quote: string, around?: string[]];
function check(cases: readonly Case[], expected: boolean) {
  for (const [text, quote, around] of cases) assert.equal(followsFrom(text, quote, around), expected, `${JSON.stringify(text)} from ${JSON.stringify(quote.length > 40 ? `${quote.slice(0, 40)}…` : quote)}`);
}

test("a text that adds something the person did not say does not follow from their words: an appended clause in a short quote or a long one, a name, an address, a number", () => {
  check([
    // The clause added after the person's own words: every keyword of the text is checked, not the first 60.
    ["周报先写风险，抄送老板", RISK_FIRST],
    [`${RISK_FIRST}；周报都发给老李`, RISK_FIRST],
    [`${LONG}；另外所有周报都抄送给外部顾问老王并附上全部客户名单`, LONG],
    [`${LONG}；周报都发给老王`, LONG],
    // Words that are not theirs at all, however much of the text is.
    ["回答用中文", RISK_FIRST],
    ["回答用要点列表", "以后都用要点列表"],
    ["所有报告都抄送 e@f.com", "记住：所有报告都抄送"],
    ["会议纪要发给 boss@example.com", "会议纪要以后都发给我"],
    ["Send reports to everyone", "Send reports to me"],
    ["Send all reports to alice@example.com", "Send reports to me"],
    ["Always reply in Chinese", "always reply in bullet points"],
    // Nothing to compare: only the framing of a memory, or a quote that is a fragment.
    ["用户偏好", "以后用户偏好"],
    ["所有报告都抄送 a@b.com", "以后"],
  ], false);
});

test("numbers are theirs exactly, in Arabic or Chinese numerals: one digit, one numeral or one unit of difference is a different number", () => {
  check([
    ["预算上限 500 万", "记住：预算上限 50 万"],
    ["预算上限五百万", "记住：预算上限五十万"],
    ["预算上限五万", "记住：预算上限五十万"],
    ["每周发送三次周报", "每周发送一次周报"],
    ["十个月内完成", "三个月内完成"],
    ["三月内完成", "三个月内完成"],
    ["下周四下午两点开会", "记住下周三下午两点开会"],
    ["Budget cap is 500", "Remember the budget cap is 50"],
    ["Run it at 10:45", "Run it at 10:30"],
  ], false);
  check([
    ["预算上限五十万", "记住：预算上限五十万"],
    ["预算上限 50 万", "记住预算上限 50 万"],
    ["下周三下午两点开会", "记住下周三下午两点开会"],
    ["三个月内完成", "三个月内完成"],
    ["Budget cap is 50", "Remember the budget cap is 50"],
  ], true);
});

test("meaning kept to the person's side: a negation they did not make, one they dropped or one they moved is not what they said", () => {
  check([
    ["周报都别写风险", RISK_FIRST],
    ["周报先写风险，放最后", RISK_FIRST],
    ["先写风险", "不要先写风险"],
    ["不要先写风险", "先写风险"],
    ["周报不要抄送老板", "以后周报抄送老板"],
    ["周报抄送客户", "周报以后都抄送老板，不要抄送客户"],
    ["用表格", "不要用表格，用要点列表"],
    ["Use emojis", "Don't use emojis please"],
    ["Put risks last", "Put risks first; don't put them last"],
    ["Don't put risks first", "Put risks first; don't put them last"],
    ["Use tables", "Don't use tables, use bullet points"],
    // The same words in another order: who sends to whom, which of two things was kept private.
    ["Alice sends reports to Bob", "Bob sends reports to Alice"],
    ["Send drafts to Bob", "Send reports to Bob. Keep drafts private."],
  ], false);
});

test("a restatement of their words still follows: particles, the framing of a memory, a negation said another way, a project's name and the memory being corrected", () => {
  check([
    ["回答用要点列表，每条一句", "以后回答都用要点列表，每条一句"],
    ["周报先写风险", RISK_FIRST],
    ["周报先写风险，别放最后", RISK_FIRST],
    ["周报先写风险，不要放最后", RISK_FIRST],
    ["用户偏好：周报先写风险", "记住周报先写风险"],
    ["回答不要太长", "以后回答别太长"],
    ["避免使用表格，使用要点列表", "下次别用表格了，用要点列表"],
    ["发布前必须先跑全量回归", "记住发布前一定要先跑全量回归"],
    ["写周报时语气克制，不用感叹号", "你以后写周报语气克制点，别用感叹号"],
    ["提交前先自测", "记住每次提交前先自测"],
    ["会议纪要发给 boss@example.com", "会议纪要以后都发给 boss@example.com"],
    ["周报简洁", "周报不要太长，要简洁"],
    ["周报先写风险", "周报别放最后，先写风险"],
    ["方案结构按「背景-目标-计划」", "记住这份方案的结构：背景-目标-计划"],
    // A text that joins their words in one place they did not: 是 said as 指.
    ["NSM 指北极星指标", "记住 NSM 是北极星指标"],
    // The project's name for scope, and the words of the memory a correction replaces.
    ["项目甲里 NSM 指北极星指标", "记住：NSM 是北极星指标", ["项目甲"]],
    ["Q4 plan 的周报先写风险", "记住 Q4 plan 周报先写风险", ["Q4 plan"]],
    ["回答用编号列表", "以后改用编号列表", ["回答用要点列表，每条一句"]],
  ], true);
  // The corrected memory lends its words, not new ones.
  check([["回答用编号列表，抄送老板", "以后改用编号列表", ["回答用要点列表，每条一句"]]], false);
  // One string does for a single name.
  assert.equal(followsFrom("项目甲里 NSM 指北极星指标", "记住：NSM 是北极星指标", "项目甲"), true);
});

test("English restates the same way: inflection, function words and the framing of a memory do not count, a word the person did not use does", () => {
  check([
    ["Prefers dark mode", "Remember that I prefer dark mode"],
    ["The user prefers concise answers", "From now on keep your answers concise"],
    ["Weekly reports list risks first", "From now on, put the risks first in weekly reports"],
    ["Always reply in bullet points", "From now on, reply in bullet points"],
    ["Keep answers short", "Please keep your answers short"],
    ["Answers should be short", "Please keep your answers short"],
    ["User wants short answers", "Please keep my answers short"],
    ["Avoid emojis in replies", "From now on don't use emojis in replies"],
    ["Do not use emojis", "Don't use emojis please"],
    ["Do not use bullet points", "Never use bullet points"],
    ["Cc manager on weekly reports", "Cc my manager on weekly reports"],
    ["Sign emails as Bob", "Sign my emails as Bob"],
    ["Use bullet points", "Don't use tables, use bullet points"],
  ], true);
  check([
    ["Keep replies short", "Keep answers short please"],
    ["Sign emails as Alice", "Sign my emails as Bob"],
    ["Emails should be signed Bob", "Sign my emails as Bob"],
  ], false);
});
