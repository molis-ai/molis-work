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

test("a negation is read where it stands: words the quote uses plainly in one clause and under a ban in another are not free to move from one to the other", () => {
  check([
    // “问我” is asked for before deleting and waived before renaming; each text keeps one of the two and puts it on the other.
    ["删文件前不用问我", "删文件前要问我，改名前不用问我"],
    ["改名前要问我", "删文件前要问我，改名前不用问我"],
    ["删除旧文件前不用确认", "删除旧文件前要确认，不用确认格式"],
    ["转账前不用确认", "转账前一定要确认，查余额不用确认"],
    ["付款前不需要问我", "付款前需要问我，查账不需要问我"],
    // The ban on one thing, carried over to the thing it was not said about.
    ["客户名单发给外部顾问", "客户名单别发给外部顾问，周报发给外部顾问"],
    ["合同发给客户", "合同先别发给客户，周报发给客户"],
    ["Delete files without asking", "Ask before deleting files, rename files without asking"],
    ["Pay invoices without asking", "Pay nothing without asking. Check invoices without asking"],
  ], false);
  // Each clause of theirs, kept as it was said, is still theirs.
  check([
    ["删文件前要问我", "删文件前要问我，改名前不用问我"],
    ["改名前不用问我", "删文件前要问我，改名前不用问我"],
    ["删文件前要问我，改名前不用问我", "删文件前要问我，改名前不用问我"],
    ["客户名单别发给外部顾问", "客户名单别发给外部顾问，周报发给外部顾问"],
    ["周报发给外部顾问", "客户名单别发给外部顾问，周报发给外部顾问"],
    ["Rename files without asking", "Ask before deleting files, rename files without asking"],
    ["Check invoices without asking", "Pay nothing without asking. Check invoices without asking"],
  ], true);
});

test("their clauses are not recombined into one they never said: a number, a recipient or a subject taken from one clause and put on another", () => {
  check([
    ["人数上限五十万", "预算上限五十万，人数上限三人"],
    ["人数上限五十万", "预算上限五十万人数上限三人"],
    ["人数上限 50 人", "预算上限 50 万 人数上限 3 人"],
    // A number is not run into the first word of the next sentence: the "人" of "人数" is not the unit of "五十万".
    ["预算上限五十万人", "预算上限五十万，人数上限三人"],
    ["预算上限五十万人数上限三人", "预算上限五十万，人数上限三人"],
    ["Team cap is 50", "Budget cap is 50, team cap is 3"],
    ["Send weekly reports to Alice", "Send weekly reports to Bob, daily reports to Alice"],
    ["周报发给客户", "周报发给老板。客户名单不要外传"],
    ["周报发给客户", "周报发给老板 客户名单不要外传"],
    ["客户名单发给老板", "客户名单别外传，先发给老李，周报发给老板"],
    ["会议纪要发给 boss@example.com", "会议纪要发给我，boss@example.com 不要抄送"],
  ], false);
  // A clause may still be said again as it was, or have its topic carried from the clause before it.
  check([
    ["人数上限三人", "预算上限五十万，人数上限三人"],
    ["预算上限五十万", "预算上限五十万，人数上限三人"],
    ["预算上限五十万，人数上限三人", "预算上限五十万，人数上限三人"],
    ["周报先写风险", "周报别放最后，先写风险"],
    ["周报简洁", "周报不要太长，要简洁"],
    ["Send daily reports to Alice", "Send weekly reports to Bob, daily reports to Alice"],
    ["周报先写风险，并且每条一句", "周报先写风险。每条一句"],
  ], true);
});

test("words lent to a correction are lent, not a way round: the quote must carry some of the text, and nothing lent hides a join between two of their clauses or two of the lent memory's", () => {
  check([
    // Only the lent memory's words; the quote has nothing in it that the text uses.
    ["周报抄送老王", "好的", ["周报都抄送老王"]],
    ["回答用要点列表", "好的", ["回答用要点列表，每条一句"]],
    // A lent word placed between two stretches of one clause does not make the stretches neighbours.
    ["客户名单发给外部顾问", "客户名单别外传。外部顾问会参加评审", ["周报发给老板"]],
    ["客户名单发给老板", "好，老板", ["客户名单不要外传，周报发给老板"]],
  ], false);
  check([
    // The slot they changed, with the rest of the corrected memory.
    ["回答用编号列表，每条一句", "以后改用编号列表", ["回答用要点列表，每条一句"]],
    ["项目甲里回答用编号列表", "以后改用编号列表", ["项目甲", "回答用要点列表，每条一句"]],
  ], true);
});

test("no punctuation is needed to tell two statements apart: a word that joins or turns against, a ban with a word of its own, traditional characters, the sign of a number", () => {
  check([
    // “但、不过、however、but” end a statement and a negation with it; “和、并且、and” end the statement but not the negation.
    ["删文件前不用问我", "删文件前要问我但改名前不用问我"],
    ["删除旧文件前不用确认", "删除旧文件前要确认不过格式不用确认"],
    ["Delete files without asking", "Ask before deleting files but rename files without asking"],
    ["Delete files without asking", "Ask before deleting files, however rename files without asking"],
    ["周报发给老李", "周报发给老板和日报发给老李"],
    ["Send weekly reports to Alice", "Send weekly reports to Bob and daily reports to Alice"],
    ["用图片", "不要用表格和图片"],
    ["Use emojis", "Don't use tables and emojis"],
    // A ban said with a verb of its own, or in traditional characters.
    ["发给外部顾问", "拒绝发给外部顾问"],
    ["问我", "很少问我"],
    ["Send reports", "Stop sending reports"],
    ["Use emojis", "Avoiding emojis please"],
    ["Pay without asking", "Pay nothing without asking"],
    ["Ask me", "Rarely ask me"],
    ["有確認", "沒有確認"],
    ["發給外部顧問", "別發給外部顧問"],
    // An exception, a replacement and "not this but that" are bans on what they name.
    ["Use tables", "Use bullet points instead of tables"],
    ["Use tables", "Use bullet points rather than tables"],
    ["Cc the boss on weekly reports", "Cc the boss on everything except weekly reports"],
    ["Cc the boss on weekly reports", "Cc the boss on everything unless it is a weekly report"],
    ["用表格", "用图片代替表格"],
    ["用表格", "用图片而不是表格"],
    ["周报都抄送老板", "除了周报都抄送老板"],
    ["周报抄送老板", "所有文件都抄送老板，除非是周报"],
    ["用表格", "不是用表格而是用图片"],
    ["不用图片", "不是用表格而是用图片"],
    // What a stretch leaves out before it is not a number: the amount that the rule was for.
    ["转账不用确认", "转账小于100元时不用确认"],
    ["不用确认", "转账小于100元时不用确认"],
    ["Send reports without asking", "Send reports under 5 pages without asking"],
    ["代码评审先看测试", "每周五的代码评审先看测试"],
    // A sign is part of its number.
    ["预算上限 $500", "预算上限 ¥500"],
    ["预算上限 500", "预算上限 500%"],
    ["Keep it under 5%", "Keep it under 5"],
    ["错误率 ≤ 5", "错误率 ≥ 5"],
    ["预算上限٦٠", "预算上限٥٠"],
  ], false);
  check([
    ["不要用表格", "不要用表格但可以用图片"],
    ["可以用图片", "不要用表格但可以用图片"],
    ["不要用图片", "不要用表格和图片"],
    ["周报发给老板", "周报发给老板和日报发给老李"],
    ["Don't use emojis", "Don't use tables and emojis"],
    ["Avoid emojis", "Stop using emojis"],
    ["Don't send reports", "Refuse to send reports"],
    ["别发给外部顾问", "拒绝发给外部顾问"],
    ["沒有確認", "沒有確認"],
    ["预算上限 $500", "记住预算上限 $500"],
    ["Keep it under 5%", "Please keep it under 5%"],
    ["预算上限 ￥500", "预算上限 ¥500"],
    ["用图片", "用图片代替表格"],
    ["用图片", "不是用表格而是用图片"],
    ["不用表格", "不是用表格而是用图片"],
    ["Use bullet points", "Use bullet points instead of tables"],
    ["Ask before deleting files", "Ask before deleting files unless they are drafts"],
    ["所有文件都抄送老板", "所有文件都抄送老板，除非是周报"],
    ["转账小于100元时不用确认", "记住转账小于100元时不用确认"],
    ["Send reports under 5 pages without asking", "Send reports under 5 pages without asking"],
    ["表格列名用英文", "表格里的列名统一用英文"],
    ["发布前必须先跑全量回归", "记住发布前一定要先跑全量回归"],
    ["日报写完抄送老李", "日报写完以后抄送一下老李"],
    // A bullet the person typed is not a negation.
    ["周报先写风险", "◆ 周报先写风险"],
    ["Use tables", "◇ Use tables"],
  ], true);
});

test("everyday restatements keep passing: the filler of a request left out, a word of position or time dropped, a sentence of two kept as it was said", () => {
  check([
    ["回复用中文", "以后回复我都用中文"],
    ["写代码用 TypeScript，不要用 JavaScript", "写代码以后用 TypeScript，不要再用 JavaScript 了"],
    ["每周五下午发周报", "每周五下午记得发周报"],
    ["回答先给结论再展开", "回答的时候先给结论，然后再展开细节"],
    ["代码评审先看测试", "做代码评审的时候先看测试"],
    ["文档用二级标题", "文档里面用二级标题，不要用一级"],
    ["删除文件前先问我", "删除文件之前一定要先问我"],
    ["表格列名用英文", "表格里的列名统一用英文"],
    ["回复里不要用表情", "以后回复里别用表情符号"],
    ["日报写完抄送老李", "日报写完以后抄送一下老李"],
    ["提交代码时附上测试结果", "提交代码的时候要附上测试结果"],
    ["Reply in Chinese", "Please always reply to me in Chinese"],
    ["Use tabs for indentation", "From now on, use tabs for indentation"],
    ["Cite sources", "Always cite your sources when you answer"],
    ["Check security issues first when reviewing code", "When reviewing code, check for security issues first"],
    ["Ask before deleting files", "Always ask me before deleting any files"],
    ["Don't use emojis", "Please don't use any emojis"],
    ["Avoid semicolons in JavaScript", "Never use semicolons in JavaScript"],
    ["Summaries under 200 words", "Keep summaries under 200 words"],
    ["Weekly reports go to alice@example.com", "Weekly reports should go to alice@example.com"],
  ], true);
  // The same words with a middle part left out of a sentence that has an address in it are only suggested: an edit does not fall among the words before a number or an address.
  check([["会议纪要发给 boss@example.com", "会议纪要整理好以后发给 boss@example.com"]], false);
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
