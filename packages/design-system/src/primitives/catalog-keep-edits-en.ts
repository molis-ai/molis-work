/**
 * English for the board's keep-edits sections (catalog-keep-edits.ts). The Chinese text is the key; the English follows the decided
 * prototype's (docs/design/rule-stale-reload/app.js) where it has one, so the product can take the same words. The workbench's
 * board dictionary spreads this in, as it does `COMPOSER_BOARD_EN`.
 */
export const KEEP_EDITS_BOARD_EN: Readonly<Record<string, string>> = {
  "提示里的按钮 / Alert Actions": "Alert Actions",
  "你写的 / Kept Value": "Kept Value",
  "步骤上的小点 / Step Dot": "Step Dot",
  "字段到达光 / Field Arrival": "Field Arrival",

  "要处理的事：一个主按钮": "Something to deal with: one primary button",
  "两条出路：主按钮排在后面": "Two ways out: the primary comes last",
  "慢了才出转圈，字还在": "A spinner only when it is slow, the words stay",
  "坏消息：说得平和，给下一步": "Bad news: said calmly, with a next step",
  "只是知会：没有主按钮": "Only telling you: no primary button",
  "完成：升起，对勾落定": "Done: rises in, the tick settles",
  "被拦下时：轻跳一下，焦点到主按钮": "When a press is blocked: one small hop, the focus goes to its primary",
  "最挤：长标题、长正文、两个长按钮": "Most crowded: a long title, long text, two long buttons",

  "这条规则在别处改过": "This rule changed elsewhere",
  "你写的都还在，还没存。": "What you wrote is still here, not saved yet.",
  "这条规则又被改了一次": "This rule changed again",
  "可能还有人在改它。你写的都还在，还没存。": "Someone may still be working on it. What you wrote is still here, not saved yet.",
  "最新版还没载入": "Couldn't load the latest version",
  "连接好像断了。你写的都还在，连上后再试一次。": "The connection seems down. What you wrote is still here; try again once you're back.",
  "这条规则刚在别处改过，已换成最新版": "This rule just changed elsewhere, so you're on the latest now",
  "发布前看一眼。": "Take a look before you publish.",
  "已载入最新版": "Latest version loaded",
  "判断说明两边都改了，你写的就在它下面。": "Instructions: changed on both sides; yours is right under it.",
  "载入最新版": "Load latest",
  "正在载入…": "Loading…",
  "再试一次": "Try again",
  "存成新规则": "Save as new rule",
  "看看改了什么": "See what changed",
  "发布 v1": "Publish v1",
  "用我写的另起一条": "Start fresh with what I wrote",
  "载入最新版，再放回": "Load latest, then put back",
  "这条规则在别处改过，而且改的正好是你现在写的这几个字段：判断说明、判断条件和结果怎样用":
    "This rule changed elsewhere, and in exactly the fields you are writing in now: the instructions, the criteria and how the result is used",
  "你写的都还在，还没存。载入最新版之后，两边都改的字段会把你写的摆在该字段正下方，只有你改的字段留着，存下去的可能是两边都没见过的组合，所以放回之前请先看一眼。":
    "What you wrote is still here, not saved yet. Once the latest version is in, a field changed on both sides shows yours right under it, and a field only you changed stays as you wrote it, so what gets saved may be a mix neither side has seen. Have a look before you put anything back.",

  "两边都改：你写的贴在字段下面，可以放回": "Changed on both sides: yours sits under the field, ready to put back",
  "放回之后：同一格换成最新版，可以换回": "Once put back: the same slot holds the latest, ready to swap back",
  "你清空过这一栏": "You had cleared this field",
  "最挤：长内容收在三行，看全部": "Most crowded: long text folds to three lines, with Show all",
  "一组：错开出现": "A group: one after another",

  "你写的": "You wrote",
  "最新版": "Latest version",
  "放回": "Put back",
  "换回": "Swap back",
  "放回你写的：{field}": "Put back what you wrote: {field}",
  "换回最新版：{field}": "Swap back to the latest: {field}",
  "判断说明": "Judgment instructions",
  "判断条件": "Criteria",
  "结果怎样用": "How the result is used",
  "你清空了这一栏": "You cleared this field",
  "看全部": "Show all",
  "只看客户直接发来的消息，转发的不算。": "Only messages customers sent directly; forwarded ones don't count.",
  "客户发来的消息都算，也包括转发过来的。": "Every message from a customer counts, forwarded ones included.",
  "只看客户直接发来的消息，转发的不算。如果消息里提到了退款、合同到期或者投诉，就算值得跟进；只是问候、自动回复或者已经由别的同事回复过的，都不算。遇到拿不准的情况，宁可多留一条，也不要漏掉，因为漏掉一条要跟进的消息比多看一条的代价大得多。周末和节假日发来的也一样处理，不要因为时间不对就跳过。":
    "Only messages customers sent directly; forwarded ones don't count. A message that mentions a refund, a contract running out or a complaint is worth following up; a greeting, an auto-reply or one a colleague has already answered is not. When in doubt keep it rather than miss it, because missing one that needed following up costs far more than reading one extra. Treat messages from weekends and holidays the same way; don't skip them because of the time they came in.",

  "别的步骤有改动：走到那一步小点就收起": "A change on another step: the dot goes once you reach that step",
  "两个步骤都有": "On two steps",
  "最挤：步骤名很长": "Most crowded: long step names",
  "这一步有改动要看": "Something changed on this step",
  "规则设置步骤": "Rule setup steps",
  "选择用途": "Choose a use",
  "判断规则": "Judgment rule",
  "试跑与启用": "Test and activate",
  "先选这条判断规则的用途和名称": "First choose what this judgment rule is for and what to call it",
  "再写清楚怎样判断、结果怎样用": "Then write down how to judge and how the result is used",
  "最后试跑几条样例并决定是否启用": "Finally try a few samples and decide whether to enable it",

  "定格在最亮的一帧": "Held at its brightest frame",
  "真实的一次：淡淡亮一下": "The real thing: one faint glow",
  "再看一遍": "Play again",
  "再亮一次": "Glow again",
};
