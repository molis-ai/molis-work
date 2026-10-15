import assert from "node:assert/strict";
import test from "node:test";
import {
  CRAFT_FINISH_STYLES, INTERACTION_DATE_STYLES, INTERACTION_NUMBER_STYLES, INTERACTION_OPERATION_STYLES, INTERACTION_QUESTION_STYLES, INTERACTION_REFERENCE_STYLES,
  INTERACTION_STEP_STYLES, INTERACTION_STYLES, INTERACTION_TRACE_STYLES, PRIMITIVE_STYLES, VISUAL_FOUNDATION_STYLES,
  renderInteractionNextSteps, renderInteractionOperation, renderInteractionOptions, renderInteractionQuestion, renderPrimitiveCatalog,
  type InteractionField,
} from "@molis-ai/molis-work-design-system";
import { renderMolisWorkArrivalStylesheet, renderMolisWorkSettingsStylesheet, renderMolisWorkWorkbenchStylesheet } from "./workbench-renderer-fixture.js";

const footer = { note: "草稿只在本页保留", actions: [{ id: "submit", label: "提交回答", variant: "primary" as const, type: "submit" as const }] };
const fields: InteractionField[] = [
  { id: "format", label: "沟通方式", hint: "推荐依据：<现场>", control: { kind: "choice", options: [
    { value: "together", label: "一起复盘", description: "先对齐", recommended: true, selected: true }, { value: "async", label: "异步审阅", description: "先读材料" }] } },
  { id: "minutes", label: "预计时长", error: "请输入 15–120 之间的整数分钟。", control: { kind: "number", value: "two", unit: "分钟", step: 5 } },
  { id: "when", label: "开始时间", optional: true, control: { kind: "datetime", date: "2026-10-16", time: "10:00", zone: "UTC−07:00", calendar: { months: [{ year: 2026, month: 9 }] } } },
  { id: "materials", label: "关联材料", control: { kind: "reference", candidates: [{ id: "g", label: "Goal <a>", selected: true }, { id: "d", label: "文档" }] } },
];

test("AC-17: the questionnaire renders mixed fields with reasons, per-field errors, optional marks and stable hooks", () => {
  const html = renderInteractionQuestion({ id: "q", kicker: "需要你补充", title: "把<这次>安排好", badge: { label: "等你回答", tone: "waiting" }, fields, footer });
  assert.match(html, /data-ix-question="q"/);
  assert.match(html, /把&lt;这次&gt;安排好/, "caller text is escaped");
  assert.match(html, /推荐依据：&lt;现场&gt;/);
  assert.match(html, /Goal &lt;a&gt;/);
  assert.match(html, /class="mw-ix-option" data-ix-option="together" role="radio" aria-checked="true"/, "one pick is a radio, so a screen reader hears that the options exclude each other");
  assert.match(html, /role="radiogroup"[^>]*data-ix-options/);
  assert.match(html, /<span class="mw-ix-tag">推荐<\/span>/);
  assert.match(html, /data-ix-field="minutes"[\s\S]*?value="two"[\s\S]*?<p class="mw-ix-error" id="q-minutes-error" data-ix-error>请输入/, "a wrong draft stays as typed beside its error");
  assert.match(html, /<p class="mw-ix-error" id="q-format-error" data-ix-error hidden><\/p>/, "every field keeps an error slot its control points at");
  assert.match(html, /data-ix-value="minutes"[^>]*aria-describedby="q-minutes-error"/, "a field without a hint points only at its error slot");
  assert.doesNotMatch(html, /q-minutes-hint/, "nothing points at a missing id");
  assert.match(html, /aria-describedby="q-format-hint q-format-error"/);
  assert.match(html, /<span class="mw-ix-optional">选填<\/span>/);
  assert.match(html, /data-ix-part="date"[\s\S]*data-ix-part="time"/);
  assert.match(html, /data-slot="calendar"/, "dates use the design system's calendar");
  assert.doesNotMatch(html, /type="date"|type="datetime-local"/, "never the OS picker");
  assert.match(html, /data-ix-reference="g" aria-pressed="true"/);
});
test("AC-17: an answered question shows its summary and keeps its form hidden; a banner says why it can no longer be answered", () => {
  const answered = renderInteractionQuestion({ id: "a", kicker: "已交回", title: "安排", fields, footer, answered: { rows: [["预计时长", "45 分钟"]] },
    banner: { text: "对象已改版", tone: "waiting", actions: [{ id: "reopen", label: "按新版本重新准备" }] } });
  assert.match(answered, /<form class="mw-ix-form" novalidate data-ix-form hidden>/, "the form stays, hidden, for reopening with its draft");
  assert.match(answered, /<dl data-ix-summary><dt>预计时长<\/dt><dd>45 分钟<\/dd><\/dl>/);
  assert.match(answered, /data-ix-banner data-tone="waiting"[\s\S]*data-ix-action="reopen"/);
});
test("AC-17: option groups explain differences as cards and keep short options as choices", () => {
  assert.match(renderInteractionOptions([{ value: "a", label: "A", description: "why" }], { id: "o" }), /class="mw-ix-options"/);
  const short = renderInteractionOptions([{ value: "a", label: "A", selected: true }, { value: "b", label: "B", disabled: true }], { id: "c", multiple: true });
  assert.match(short, /class="mw-choice-group mw-ix-choices" role="group"[^>]*data-ix-multiple/);
  assert.match(short, /data-slot="choice" aria-pressed="true" data-ix-option="a"/, "several picks are toggle buttons");
  assert.match(short, /data-ix-option="b" disabled/);
  const single = renderInteractionOptions([{ value: "a", label: "A", selected: true }, { value: "b", label: "B" }], { id: "s" });
  assert.match(single, /role="radiogroup"/);
  assert.match(single, /role="radio" aria-checked="true" data-ix-option="a"/);
  assert.match(single, /role="radio" aria-checked="false" data-ix-option="b"/);
  assert.doesNotMatch(single, /aria-pressed/, "a radio never carries a button's pressed state");
});
test("AC-17 / AC-03: next steps show at most one primary and one secondary; a busy step cannot be pressed", () => {
  const html = renderInteractionNextSteps([
    { id: "result", label: "打开结果", source: "来自操作卡" }, { id: "other", label: "第二个主操作", source: "x" },
    { id: "continue", label: "继续调整", source: "来自操作卡", primary: false }, { id: "more", label: "第二个次操作", source: "y", primary: false },
  ]);
  assert.equal(html.match(/data-ix-step="/g)?.length, 2);
  assert.doesNotMatch(html, /第二个/);
  assert.match(html, /data-ix-step-id="continue" title="来自操作卡" data-secondary/);
  assert.match(renderInteractionNextSteps([{ id: "card", label: "执行中…", source: "s", busy: true }]), /data-busy aria-busy="true" disabled/);
});
test("FLOW-05 / AC-17: with a limit, next steps keep the caller's order, fold the rest into one button and mark what waits in words", () => {
  const steps = [
    { id: "a<1>", label: "确认 <卡>", source: "s1", primary: false, waiting: true, waitingLabel: "等你：" },
    { id: "b", label: "团队", source: "s2", primary: false }, { id: "c", label: "只给经理", source: "s3", primary: false },
    { id: "d", label: "打开结果", source: "s4" }, { id: "e", label: "再试一次", source: "s5" },
  ];
  const html = renderInteractionNextSteps(steps, "下一步", { max: 3, more: count => `还有 ${count} 项` });
  assert.deepEqual([...html.matchAll(/data-ix-step-id="([^"]*)"/g)].map(match => match[1]), ["a&lt;1&gt;", "b", "c"], "the first three, in the caller's order, escaped once");
  assert.match(html, /<button type="button" class="mw-ix-step mw-ix-steps__more" data-ix-steps-more="2" data-secondary>还有 2 项<\/button><\/div>$/);
  assert.match(html, /data-ix-step-id="a&lt;1&gt;" title="s1" data-secondary data-waiting>[\s\S]*?<span class="mw-sr-only">等你：<\/span><span data-ix-step-label>确认 &lt;卡&gt;<\/span>/,
    "the amber dot comes with words a screen reader reads");
  assert.equal(html.match(/data-waiting/g)?.length, 1);
  assert.doesNotMatch(renderInteractionNextSteps(steps.slice(2), "下一步", { max: 3, more: count => `还有 ${count} 项` }), /data-ix-steps-more/, "nothing folded, no more button");
  // Without options the component draws exactly what it drew before.
  const plain = [{ id: "result", label: "打开结果", source: "x" }, { id: "continue", label: "继续调整", source: "y", primary: false }];
  assert.equal(renderInteractionNextSteps(plain, "接下来"), renderInteractionNextSteps(plain, "接下来", undefined));
  assert.doesNotMatch(renderInteractionNextSteps(plain), /data-waiting|data-ix-steps-more|mw-sr-only/);
});
test("AC-17 / AC-06: the operation card states its target and version, the exact parameters, its status and result", () => {
  const html = renderInteractionOperation({ id: "op", kicker: "操作建议", title: "创建安排", badge: { label: "结果未知", tone: "waiting" },
    target: { prefix: "作用于", label: "内部试用", version: "版本 2", changed: true },
    preview: { title: "将使用这些参数", rows: [["预计时长", "45 分钟"]] }, status: { text: "结果未知", tone: "waiting" }, recovery: [{ id: "reconcile", label: "核对结果" }] });
  assert.match(html, /data-ix-version data-changed>版本 2</);
  assert.match(html, /data-ix-preview tabindex="-1"[\s\S]*<dd>45 分钟<\/dd>/);
  assert.match(html, /data-ix-status role="status" data-tone="waiting"/);
  assert.match(html, /data-ix-recovery[\s\S]*data-ix-action="reconcile"/);
  assert.doesNotMatch(html, /data-ix-action="execute"/, "an unknown result offers no execution");
});
test("AC-17, AC-21: the component board shows the parts; a product sheet takes only the segments its pages draw", () => {
  const board = renderPrimitiveCatalog();
  assert.match(board, /<section class="mw-catalog__section" id="interaction" data-primitive="interaction"><h2>AI 交互 \/ Interaction<\/h2>/);
  assert.match(board, /<a href="#interaction" title="AI 交互 \/ Interaction">AI 交互<\/a>/, "the board's index lists it");
  assert.match(board, /id="plugin-composition"/, "the plugin composition example keeps its place");
  assert.ok(board.includes(INTERACTION_STYLES), "the board inlines the interaction sheet");
  for (const sheet of [PRIMITIVE_STYLES, VISUAL_FOUNDATION_STYLES, CRAFT_FINISH_STYLES]) assert.ok(!sheet.includes(".mw-ix-card"), "not part of the shared page sheets");
  assert.doesNotMatch(INTERACTION_STYLES, /#[0-9a-fA-F]{3,8}\b|!important/, "tokens only, no overrides");
  // Adopted by the Assistant (A1+H2): the pages it lives on (the workbench and the project chooser) take what it draws, and no more.
  const drawn = [INTERACTION_QUESTION_STYLES, INTERACTION_DATE_STYLES, INTERACTION_OPERATION_STYLES, INTERACTION_STEP_STYLES];
  for (const sheet of [renderMolisWorkWorkbenchStylesheet(), renderMolisWorkArrivalStylesheet()]) {
    for (const segment of drawn) assert.ok(sheet.includes(segment), "a segment the Assistant draws is in its pages' sheet");
    for (const segment of [INTERACTION_NUMBER_STYLES, INTERACTION_REFERENCE_STYLES, INTERACTION_TRACE_STYLES]) assert.ok(!sheet.includes(segment), "a segment it does not draw stays out");
  }
  assert.ok(!renderMolisWorkSettingsStylesheet().includes(".mw-ix-card"), "settings pages have no Assistant");
  assert.equal(INTERACTION_STYLES, [INTERACTION_QUESTION_STYLES, INTERACTION_DATE_STYLES, INTERACTION_NUMBER_STYLES, INTERACTION_REFERENCE_STYLES, INTERACTION_OPERATION_STYLES,
    INTERACTION_STEP_STYLES, INTERACTION_TRACE_STYLES].join(""), "the segments add up to the whole sheet");
});
test("AC-17: ids and scopes are escaped exactly once, so references match the elements they name", () => {
  const nasty: InteractionField[] = [
    { id: 'a"b&c', label: "名字", hint: "说明", control: { kind: "text", value: "" } },
    { id: "pick", label: "选", control: { kind: "choice", options: [{ value: "x", label: "X" }] } },
  ];
  const html = renderInteractionQuestion({ id: 'q"1&2', kicker: "k", title: "t", fields: nasty, footer: { note: "", actions: [] } });
  assert.doesNotMatch(html, /\sid="[^"]*"[^"=\s>]/, "no raw quote ever ends an id attribute early");
  assert.match(html, /data-ix-question="q&quot;1&amp;2"/);
  assert.match(html, /<label id="q&quot;1&amp;2-a&quot;b&amp;c-label" for="q&quot;1&amp;2-a&quot;b&amp;c">/);
  assert.match(html, /<input[^>]* id="q&quot;1&amp;2-a&quot;b&amp;c"/, "the label's for matches the control's id");
  assert.match(html, /aria-describedby="q&quot;1&amp;2-a&quot;b&amp;c-hint q&quot;1&amp;2-a&quot;b&amp;c-error"/);
  assert.doesNotMatch(html, /&amp;amp;|&amp;quot;/, "never double-escaped");
  assert.match(html, /aria-labelledby="q&quot;1&amp;2-title"/);
  const op = renderInteractionOperation({ id: 'op"&', kicker: "k", title: "t", target: { prefix: "p", label: "l" },
    preview: { title: "p", rows: [] }, result: { title: "r", body: "b" } });
  assert.match(op, /aria-labelledby="op&quot;&amp;-title"/);
  assert.match(op, /aria-labelledby="op&quot;&amp;-preview"><h4 id="op&quot;&amp;-preview">/);
  assert.match(op, /aria-labelledby="op&quot;&amp;-result"><span[^>]*>[\s\S]*<h4 id="op&quot;&amp;-result">/);
});
test("AC-17: the board gives every sample its own ids, and calendar labels come from the caller", () => {
  const board = renderPrimitiveCatalog();
  const ids = [...board.matchAll(/ id="([^"]+)"/g)].map(match => match[1]!).filter(id => id.startsWith("ix-"));
  assert.ok(ids.length > 20);
  assert.deepEqual(ids.filter((id, index) => ids.indexOf(id) !== index), [], "no duplicate ids among the interaction samples");
  const html = renderInteractionQuestion({ id: "c", kicker: "k", title: "t", footer: { note: "", actions: [] },
    fields: [{ id: "d", label: "日期", control: { kind: "date", value: "", calendar: { months: [{ year: 2026, month: 9 }], label: "Pick a day" } } }] });
  assert.match(html, /role="dialog" aria-label="Pick a day"/);
});
test("AC-17: an other answer is a free text slot; whether it is chosen is whether it holds text", () => {
  const html = renderInteractionQuestion({ id: "o", kicker: "k", title: "t", footer: { note: "", actions: [] },
    fields: [{ id: "f", label: "方式", control: { kind: "choice", options: [{ value: "1", label: "一" }], other: { label: "其他", value: "自己写的" } } }] });
  assert.match(html, /<input[^>]*value="自己写的"[^>]*data-ix-other="f"/);
});

// RING-07: explicit receipt meaning wins over the badge's visual tone.
test("RING-07 interaction cards distinguish unknown results from waiting for a person", () => {
  const target = { prefix: "目标", label: "测试文档" };
  const html = renderInteractionOperation({ id: "unknown-ring", kicker: "操作", title: "核对", target, badge: { label: "结果未知", tone: "waiting", state: "verify" } });
  assert.match(html, /data-mw-state="verify"/);
  assert.doesNotMatch(html, /data-mw-state="answer"/);
  assert.match(renderInteractionOperation({ id: "done-ring", kicker: "操作", title: "完成", target, result: { title: "已完成", body: "保留原回执" } }), /data-mw-state="done"/);
});
