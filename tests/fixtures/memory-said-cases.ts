/**
 * Cases for “you said” (source `said`), shared by the rule's test (memory-text), the gate's (memory-service) and the Assistant tool's (assistant-memory).
 *
 * Every text below is different from every other once spacing, punctuation and case are set aside: the gate suggests a text only once, so a table of
 * cases for a gate that makes a suggestion of each must not repeat one.
 */

/**
 * [what the person wrote, the text a model asks to keep as theirs]. Each text reverses, narrows or adds to what the message says, and none of them
 * may be recorded as the person's words: the cases of the last two re-reviews of the Assistant's memory tools, in the order they were found.
 */
export const NOT_THEIRS: ReadonlyArray<readonly [message: string, text: string]> = [
  // A ban before a colon in the same sentence: the text is what comes after the colon.
  ["禁止：把客户名单发给外部顾问", "客户名单发给外部顾问"],
  ["严禁以下行为：直接推送到主分支", "直接推送到主分支"],
  ["不允许：把采购合同发给外部顾问", "把采购合同发给外部顾问"],
  ["以后别这样：把财务报表发给外部顾问", "把财务报表发给外部顾问"],
  ["Forbidden: sending the price list to the supplier.", "Send the price list to the supplier"],
  ["Never do this: push straight to main.", "push straight to main"],
  ["Don't: email the budget to Bob", "email the budget to Bob"],
  ["No: send the roadmap to the press", "send the roadmap to the press"],
  // A ban in the header above a list, on its own line or in a sentence of its own, and the item under it.
  ["以后这些都不要做：\n1. 把用户手机号发给外部顾问", "用户手机号发给外部顾问"],
  ["以后这些都不要做：\n1. 把用户邮箱发给外部顾问\n2. 周末给客户发消息", "把用户邮箱发给外部顾问"],
  ["以后这些都不要做：\n1. 把用户住址发给外部顾问\n2. 周末给供应商发消息", "1. 把用户住址发给外部顾问"],
  ["以后这些都不要做：\n1. 把工资表发给外部顾问\n2. 周末给同事发消息", "以后这些都不要做：1. 把工资表发给外部顾问"],
  ["Never do the following:\n- send the invoice list to the consultant\n- push to main on Fridays", "Send the invoice list to the consultant"],
  ["Never do the following:\n- send the salary table to the consultant", "- send the salary table to the consultant"],
  ["下面这些以后别做了。把合同扫描件发给外部顾问。", "把合同扫描件发给外部顾问"],
  ["下面这些以后别做了。把设计稿发给外部顾问。", "设计稿发给外部顾问"],
  // A verdict after the words: in a clause, in a sentence of its own, after a question mark.
  ["把客户电话发给外部顾问？没门！", "把客户电话发给外部顾问"],
  ["把报价单发给外部顾问，没必要", "把报价单发给外部顾问"],
  ["把源码发给外部顾问，我觉得不行", "把源码发给外部顾问"],
  ["把账号发给外部顾问，我不同意", "把账号发给外部顾问"],
  ["Send the pitch deck to the consultant? No way.", "Send the pitch deck to the consultant"],
  ["Send the audit log to the consultant? Absolutely not.", "Send the audit log to the consultant"],
  ["把会议录音发给外部顾问，想都别想", "把会议录音发给外部顾问"],
  ["把访谈记录发给外部顾问。想都别想。", "把访谈记录发给外部顾问"],
  // Words that remove or stop something, left out.
  ["邮件里删掉签名", "邮件里要签名"],
  ["Drop emojis from replies", "Prefers emojis in replies"],
  ["Keep emojis out of replies", "Keep emojis in replies"],
  ["以后停发周报给老板", "以后发周报给老板"],
  ["回复里去掉表情", "回复里要表情"],
  ["Remove the signature from emails", "Prefers the signature in emails"],
  ["Get rid of the summary at the top of the report", "The summary at the top of the report"],
  ["周报不只发给老板", "周报只发给老板"],
  // The front of a sentence dropped before a number, or the words that limit it to this time.
  ["More than $500 needs my approval", "$500 needs my approval"],
  ["最多三条风险", "三条风险"],
  ["At least 3 risks per report", "3 risks per report"],
  ["超过五十万要先问我", "五十万要先问我"],
  ["每次至少写三条", "每次写三条"],
  ["这次周报先写风险", "以后周报都先写风险"],
  ["Just this once, put risks first in the weekly report", "Put risks first in the weekly report"],
  // The ban in front of the words cut off, or after them dropped.
  ["以后不要把客户名单转给外部顾问", "客户名单转给外部顾问"],
  ["Never send the client list to the consultant", "Send the client list to the consultant"],
  ["请不要自动删除旧文件", "自动删除旧文件"],
  ["以后不要自动整理旧文件", "自动整理旧文件"],
  ["把采购订单发给外部顾问是不允许的", "采购订单发给外部顾问"],
  ["Sending the budget to the consultant is not allowed", "Send the budget to the consultant"],
  ["删除旧日志不用问我是不可能的", "删除旧日志不用问我"],
  ["合同发给外部顾问绝对不行", "合同发给外部顾问"],
  ["发布说明发给外部顾问这件事千万不要做", "发布说明发给外部顾问"],
  ["Emailing the payroll to Bob is forbidden", "Email the payroll to Bob"],
  ["Deleting old files without asking is not OK", "Delete old files without asking"],
  // An exception, in the same sentence or the next one.
  ["转账不用确认，除非超过一万元", "转账不用确认"],
  ["退款不用确认。除非超过一万元。", "退款不用确认"],
  ["Delete drafts without asking unless they are contracts", "Delete drafts without asking"],
  ["Delete files without asking. Unless they are contracts.", "Delete files without asking"],
  ["除非是周报。所有文件都抄送老板。", "所有文件都抄送老板"],
  // A verb that says no left out, in either language.
  ["以后取消自动备份旧文件", "自动备份旧文件"],
  ["以后停止给老板抄送周报", "以后给老板抄送周报"],
  ["Quit sending reports to the client", "Send reports to the client"],
  ["回复少用表情", "回复用表情"],
  ["Use fewer emojis", "Use emojis"],
  // A project's name put in for what the message leaves out, or in place of a name in it.
  ["周报发给我", "周报发给项目甲"],
  ["周报发给我，抄送老板", "周报发给我"],
  ["Send weekly reports to Bob", "Send weekly reports to Alice"],
  // A form a Unicode normalization would turn into the plain one, and so into another number or word: the fold is no normalization, so the text is not the message.
  ["单笔超过105元的报销都要问我", "单笔超过10⁵元的报销都要问我"],
  ["预算最多给到 1002 元", "预算最多给到 100² 元"],
  ["气温低于−5度时提醒我", "气温低于⁻5度时提醒我"],
  ["选1号方案作为默认", "选①号方案作为默认"],
  ["第IV版先不要发布", "第Ⅳ版先不要发布"],
  ["比例按1⁄2算", "比例按½算"],
  ["文件名统一用 file 前缀", "文件名统一用 ﬁle 前缀"],
  ["重量不超过5kg的才发快递", "重量不超过5㎏的才发快递"],
  ["温度超过30°C就提醒", "温度超过30℃就提醒"],
  ["一律不要自动发送", "⼀律不要自动发送"],
  ["别删!!", "别删‼"],
  // An invisible character is not a space: in the middle of the text, at its front, or at its end.
  ["do not send it", "do\uFEFFnot send it"],
  ["reply in english", "\uFEFFreply in english"],
  ["ask before deleting", "ask before deleting\uFEFF"],
  ["不要发给他", "不\u200B要发给他"],
  // Their words about something else, a part of a long message, a paraphrase.
  ["以后周报都先写风险，别放最后", "周报先写风险"],
  ["好的，这周的周报我自己写。以后不要自动清理旧缓存，包括临时文件。周报先写风险，别放最后。", "以后不要自动清理旧缓存，包括临时文件"],
  ["Remember that I prefer dark mode", "Prefers dark mode"],
  ["以后回答都用要点列表，每条一句", "回答用要点列表，每条一句"],
];

/**
 * [what the person wrote, the text a model asks to keep]: the text is the whole message, apart from the small differences that do not count
 * (case, width, quotation marks, spacing, a sentence mark at the very end), so it is recorded as theirs.
 */
export const THEIRS: ReadonlyArray<readonly [message: string, text: string]> = [
  ["以后回答都用要点列表，每条一句", "以后回答都用要点列表，每条一句"],
  ["记住：周报先写风险。", "记住：周报先写风险"],
  ["Never send the client list to the consultant", "Never send the client list to the consultant."],
  ["Always reply in Chinese. Never use emojis.", "always reply in chinese. never use emojis"],
  ["转账不用确认。除非超过一万元。", "转账不用确认。除非超过一万元"],
  ["禁止：把客户名单发给外部顾问", "禁止：把客户名单发给外部顾问"],
  ["把客户名单发给外部顾问？没门！", "把客户名单发给外部顾问？没门！"],
  ["下面这些以后别做了。把合同扫描件发给外部顾问。", "下面这些以后别做了。把合同扫描件发给外部顾问。"],
  ["以后这些都不要做：\n1. 把用户手机号发给外部顾问\n2. 周末给客户发消息", "以后这些都不要做： 1. 把用户手机号发给外部顾问 2. 周末给客户发消息"],
  ["Never do the following:\n- send the invoice list to the consultant\n- push to main on Fridays", "Never do the following: - send the invoice list to the consultant - push to main on Fridays"],
  ["NSM 是北极星指标", "NSM是北极星指标"],
  ["预算上限 ￥500，超过要先问我", "预算上限 ¥500，超过要先问我"],
  ["回答里的“重点”要加粗！", "回答里的「重点」要加粗!"],
  ["Reply  in\u00a0Chinese,\nplease", "reply in chinese, please."],
];
