// The board's parts for keeping someone's edits when what they were editing changed elsewhere (docs/design/rule-stale-reload/
// README.md「组件板新增」, decided by the user 2026-11-06: plan A, caught in place): buttons inside an alert, the row that keeps what
// you wrote under its field, the dot on a step, and a field's arrival wash. Like the composer's parts they live on the board first:
// the rules below are the board's own (not in the served sheets) and move into the page sheets with the first product page that
// draws them (N14's rule editor and Feed's rule page). Every control is an existing one; these rules only place them.
import { type MwButtonOptions, renderAlert, renderButton, renderField, renderKept, renderStepDot, renderTextarea } from "@molis-ai/molis-work-plugin-sdk/ui";
import { section, specimen } from "./catalog-parts.js";
import type { Say } from "./catalog-composer.js";

export const KEEP_EDITS_BOARD_STYLES = `
  /* 1 · Buttons inside an alert: under its words, so the next step reads as the answer to what the alert says. One shape for
     every alert with a next step; a page never writes its own row. */
  /* The column is the alert's own width, so a long button wraps instead of widening the alert and its words. */
  .mw-alert { min-width: 0; grid-template-columns: minmax(0, 1fr); }
  .mw-alert > :is(strong, p) { min-width: 0; overflow-wrap: anywhere; }
  .mw-alert__actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 4px; }
  /* An action's words are never cut (DESIGN): only a label that cannot fit the row wraps, and only that button grows. */
  .mw-alert__actions > .mw-btn { max-width: 100%; height: auto; white-space: normal; text-align: start; padding-block: 4px; }
  .mw-alert__title { display: flex; align-items: flex-start; gap: 6px; }
  .mw-alert__mark { display: inline-grid; place-items: center; flex: none; width: 20px; height: 20px; }
  .mw-alert[tabindex="-1"]:focus { outline: none; }
  /* It rises in when it first appears, its mark settles on success (the one bounce here: a finished moment), and it hops once when a
     blocked press sends someone back to it. A repaint leaves these off, so nothing moves twice. */
  .mw-alert--rise { animation: craft-rise var(--dur-move) var(--ease-quint); }
  .mw-alert--rise .mw-alert__mark { animation: mw-alert-land var(--dur-move) var(--ease-spring); }
  .mw-alert.is-nudged { animation: mw-alert-nudge var(--dur-move) var(--ease-quint); }
  @keyframes mw-alert-land { from { transform: scale(.6); } to { transform: none; } }
  @keyframes mw-alert-nudge { 0% { transform: none; } 40% { transform: translateY(-3px); } 100% { transform: none; } }

  /* 2 · What you wrote, kept under the field it came from: the amber of "waits on the person" (DESIGN「Reading load」). Once put back the
     same slot holds the other version, neutral, with the way back. */
  .mw-kept { display: grid; gap: 4px; min-width: 0; padding: 8px 8px 8px 12px; border-radius: var(--r-control); background: var(--amber-soft); }
  .mw-kept.is-swapped { background: var(--surface-soft); }
  .mw-kept__head { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .mw-kept__who { flex: 1; min-width: 0; color: var(--ink); font-size: 12px; font-weight: var(--weight-control); overflow-wrap: anywhere; }
  .mw-kept__text { margin: 0; color: var(--ink-soft); font-size: 13px; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; }
  .mw-kept__text.is-open { display: block; -webkit-line-clamp: unset; }
  .mw-kept__text.is-blank { color: var(--muted); }
  /* The padding reaches a finger without taking line room, as the link beside a status mark does. */
  .mw-btn.mw-kept__more { --reach: 4px; justify-self: start; min-height: 0; padding: var(--reach) 0; margin-block: calc(-1 * var(--reach)); font-size: 12px; line-height: 20px; text-decoration: underline; text-underline-offset: 3px; }
  .mw-btn.mw-kept__more[hidden] { display: none; }
  /* A group arrives one after another, half a hover apart. */
  .mw-kept--rise { animation: craft-rise var(--dur-move) var(--ease-quint) backwards; animation-delay: calc(var(--i, 0) * var(--dur-hover) / 2); }
  @media (max-width: 760px), (pointer: coarse) { .mw-btn.mw-kept__more { --reach: 12px; } }

  /* 3 · A dot on a step that holds something to look at: in the corner of the step's number. The number is a centred grid, so the
     dot's place starts from its middle. Amber like the row it points to; its ring keeps it apart from the number's edge. */
  .mw-step-dot { position: absolute; width: 8px; height: 8px; border-radius: 50%; background: var(--amber); box-shadow: 0 0 0 2px var(--paper); transform: translate(9px, -9px); }
  [aria-current] .mw-step-dot { display: none; }
  @media (forced-colors: active) { .mw-step-dot { forced-color-adjust: none; background: Highlight; } }

  /* 4 · A field whose content just changed: the same [data-craft-new] moment on the same clock, but the row's opaque wash would hide
     the words in a field. A little of the accent itself shows as much as the row's wash does and leaves the words readable (the soft
     tone is close to the paper, so over words it only fades them); it reaches a little past the field's edge. */
  [data-craft-new="field"]::after { inset: -4px -8px; border-radius: var(--r-control); background: color-mix(in srgb, var(--accent) 10%, transparent); }

  @media (prefers-reduced-motion: reduce) { .mw-alert--rise, .mw-alert--rise .mw-alert__mark, .mw-alert.is-nudged, .mw-kept--rise { animation: none; } }
  html[data-craft-still] :is(.mw-alert--rise, .mw-alert--rise .mw-alert__mark, .mw-alert.is-nudged, .mw-kept--rise) { animation: none !important; }

  /* The board's own arrangement of the specimens; not part of any part. The held wash shows its brightest frame, to judge it in both themes. */
  .mw-keep-stack { display: grid; gap: 8px; width: min(100%, 560px); min-width: 0; }
  .mw-keep-stack .functions-steps { flex-wrap: wrap; min-width: 0; padding: 8px 0; border-bottom: 0; }
  .mw-keep-stack .functions-steps button > span { flex: none; }
  [data-keep-wash-hold]::after { animation: none; opacity: 1; }
`;

const LONG_TITLE = "这条规则在别处改过，而且改的正好是你现在写的这几个字段：判断说明、判断条件和结果怎样用";
const LONG_BODY = "你写的都还在，还没存。载入最新版之后，两边都改的字段会把你写的摆在该字段正下方，只有你改的字段留着，存下去的可能是两边都没见过的组合，所以放回之前请先看一眼。";
const LONG_ACTION = "载入最新版之后再逐项决定：两边都改的字段放回你写的，别处改的字段留着最新版，然后从头看一遍再发布这条判断规则";
const SHORT_KEPT = "只看客户直接发来的消息，转发的不算。";
const LATEST_KEPT = "客户发来的消息都算，也包括转发过来的。";
const LONG_KEPT = "只看客户直接发来的消息，转发的不算。如果消息里提到了退款、合同到期或者投诉，就算值得跟进；只是问候、自动回复或者已经由别的同事回复过的，都不算。遇到拿不准的情况，宁可多留一条，也不要漏掉，因为漏掉一条要跟进的消息比多看一条的代价大得多。周末和节假日发来的也一样处理，不要因为时间不对就跳过。";

/**
 * 收起 already has two English texts in the served dictionaries and the translation gate allows no third, while the decided sample
 * says Dismiss on an alert and Show less on a fold. Until N14's interface gives them stable keys, the board picks by language itself.
 */
const hide = (say: Say, english: string): string => (say("你写的") === "你写的" ? "收起" : english);

function alertActionsSection(say: Say): string {
  const load = (): MwButtonOptions => ({ label: say("载入最新版"), variant: "primary" });
  const keepAsNew = (): MwButtonOptions => ({ label: say("存成新规则") });
  const stack = (body: string) => `<div class="mw-keep-stack">${body}</div>`;
  const replay = (attr: string, label: string) => renderButton({ label: say(label), variant: "secondary", attrs: { [attr]: "" } });
  return section("alert-actions", say("提示里的按钮 / Alert Actions"), `<div class="mw-catalog__specimens">
    ${specimen(say("要处理的事：一个主按钮"), stack(renderAlert({ tone: "warning", title: say("这条规则在别处改过"), body: say("你写的都还在，还没存。"), actions: [load()] })))}
    ${specimen(say("两条出路：主按钮排在后面"), stack(renderAlert({ tone: "warning", title: say("这条规则又被改了一次"), body: say("可能还有人在改它。你写的都还在，还没存。"), actions: [keepAsNew(), load()] })))}
    ${specimen(say("慢了才出转圈，按钮不变宽"), stack(renderAlert({ tone: "warning", title: say("这条规则在别处改过"), body: say("你写的都还在，还没存。"), actions: [{ ...load(), loading: true }] })))}
    ${specimen(say("坏消息：说得平和，给下一步"), stack(renderAlert({ tone: "warning", title: say("最新版还没载入"), body: say("连接好像断了。你写的都还在，连上后再试一次。"), actions: [{ label: say("再试一次"), variant: "primary" }] })))}
    ${specimen(say("只是知会：没有主按钮"), stack(renderAlert({ title: say("这条规则刚在别处改过，已换成最新版"), body: say("发布前看一眼。"), actions: [{ label: say("看看改了什么") }] })))}
    ${specimen(say("完成：升起，对勾落定"), stack(`<div data-keep-rise>${renderAlert({ tone: "success", state: "done", rise: true, title: say("已载入最新版"), body: say("判断说明两边都改了，你写的就在它下面。"), actions: [{ label: hide(say, "Dismiss") }] })}</div><div class="mw-catalog__row">${replay("data-keep-replay-rise", "再看一遍")}</div>`))}
    ${specimen(say("被拦下时：轻跳一下，焦点到主按钮"), stack(`<div data-keep-nudge>${renderAlert({ tone: "warning", title: say("这条规则在别处改过"), body: say("你写的都还在，还没存。"), attrs: { tabindex: "-1" }, actions: [load()] })}</div><div class="mw-catalog__row">${renderButton({ label: say("发布 v1"), variant: "secondary", attrs: { "data-keep-press": "" } })}</div>`))}
    ${specimen(say("最挤：长标题、长正文、两个长按钮"), stack(renderAlert({ tone: "warning", title: say(LONG_TITLE), body: say(LONG_BODY), actions: [{ label: say("用我写的另起一条") }, { label: say("载入最新版，再放回"), variant: "primary" }] })))}
    ${specimen(say("最挤：按钮的字放不下时折行"), stack(renderAlert({ tone: "warning", title: say("这条规则在别处改过"), body: say("你写的都还在，还没存。"), actions: [{ label: say("存成新规则") }, { label: say(LONG_ACTION), variant: "primary", attrs: { "data-keep-long-label": "" } }] })))}
  </div>`);
}

function keptSection(say: Say): string {
  const put = say("放回"), back = say("换回"), yours = say("你写的"), latest = say("最新版");
  const putName = say("放回你写的：{field}", { field: say("判断说明") }), backName = say("换回最新版：{field}", { field: say("判断说明") });
  const more = () => ({ label: say("看全部"), attrs: { "data-keep-more": "", "data-keep-open": say("看全部"), "data-keep-close": hide(say, "Show less") } });
  const field = (value: string) => renderField({ label: say("判断说明"), control: renderTextarea({ rows: 3, value: say(value), attrs: { "data-keep-field": "" } }) });
  const row = (kept: string, options: { long?: boolean; swapped?: boolean; rise?: boolean; index?: number } = {}) => renderKept({
    who: options.swapped ? latest : yours,
    text: say(kept),
    swapped: options.swapped,
    rise: options.rise,
    index: options.index,
    action: { label: options.swapped ? back : put, attrs: { "data-keep-swap": "", "aria-label": options.swapped ? backName : putName } },
    ...(options.long ? { more: more() } : {}),
    attrs: { "data-keep-labels": JSON.stringify({ yours, latest, put, back, putName, backName }) },
  });
  const swapping = (value: string, kept: string, options: { long?: boolean; swapped?: boolean } = {}) => `<div class="mw-keep-stack" data-keep-pair><div data-keep-box>${field(value)}</div>${row(kept, options)}</div>`;
  return section("kept", say("你写的 / Kept Value"), `<div class="mw-catalog__specimens">
    ${specimen(say("两边都改：你写的贴在字段下面，可以放回"), swapping(LATEST_KEPT, SHORT_KEPT))}
    ${specimen(say("放回之后：同一格换成最新版，可以换回"), swapping(SHORT_KEPT, LATEST_KEPT, { swapped: true }))}
    ${specimen(say("你清空过这一栏"), `<div class="mw-keep-stack">${field(LATEST_KEPT)}${renderKept({ who: yours, text: "", blankText: say("你清空了这一栏"), action: { label: put, attrs: { "aria-label": putName } } })}</div>`)}
    ${specimen(say("最挤：长内容收在三行，看全部"), swapping(LATEST_KEPT, LONG_KEPT, { long: true }))}
    ${specimen(say("一组：错开出现"), `<div class="mw-keep-stack"><div class="mw-keep-stack" data-keep-group>${[0, 1, 2].map((index) => renderKept({ who: yours, text: say(SHORT_KEPT), rise: true, index, action: { label: put, attrs: { "aria-label": say("放回你写的：{field}", { field: say(["判断说明", "判断条件", "结果怎样用"][index]!) }) } } })).join("")}</div><div class="mw-catalog__row">${renderButton({ label: say("再看一遍"), variant: "secondary", attrs: { "data-keep-replay-group": "" } })}</div></div>`)}
  </div>`);
}

function stepDotSection(say: Say): string {
  const dot = () => renderStepDot({ label: say("这一步有改动要看") });
  const steps = (names: readonly string[], current: number, dotted: readonly number[]) => `<nav class="functions-steps" aria-label="${say("规则设置步骤")}" data-keep-steps>${names.map((name, index) => `<button type="button"${index === current ? ' aria-current="step"' : ""}><span>${index + 1}${dotted.includes(index) ? dot() : ""}</span>${say(name)}</button>`).join("")}</nav>`;
  return section("step-dot", say("步骤上的小点 / Step Dot"), `<div class="mw-catalog__specimens">
    ${specimen(say("别的步骤有改动：走到那一步小点就收起"), `<div class="mw-keep-stack">${steps(["选择用途", "判断规则", "试跑与启用"], 0, [2])}</div>`)}
    ${specimen(say("两个步骤都有"), `<div class="mw-keep-stack">${steps(["选择用途", "判断规则", "试跑与启用"], 2, [0, 1])}</div>`)}
    ${specimen(say("最挤：步骤名很长"), `<div class="mw-keep-stack">${steps(["先选这条判断规则的用途和名称", "再写清楚怎样判断、结果怎样用", "最后试跑几条样例并决定是否启用"], 1, [0, 2])}</div>`)}
  </div>`);
}

function fieldWashSection(say: Say): string {
  const field = (value: string) => renderField({ label: say("判断说明"), control: renderTextarea({ rows: 5, value: say(value) }) });
  return section("field-wash", say("字段到达光 / Field Arrival"), `<div class="mw-catalog__specimens">
    ${specimen(say("定格在最亮的一帧"), `<div class="mw-keep-stack"><div data-craft-new="field" data-keep-wash-hold>${field(LATEST_KEPT)}</div></div>`)}
    ${specimen(say("真实的一次：淡淡亮一下"), `<div class="mw-keep-stack"><div data-keep-wash>${field(LONG_KEPT)}</div><div class="mw-catalog__row">${renderButton({ label: say("再亮一次"), variant: "secondary", attrs: { "data-keep-replay-wash": "" } })}</div></div>`)}
  </div>`);
}

export function keepEditsSections(say: Say): string {
  return alertActionsSection(say) + keptSection(say) + stepDotSection(say) + fieldWashSection(say);
}
