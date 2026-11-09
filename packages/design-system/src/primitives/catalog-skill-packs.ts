// The board's parts for skill packs (docs/design/skill-packs/README.md「组件板新增」, decided by the user 2026-11-04: A's enable
// step and C's catalog): the three-way choice under an item row's words, a fold inside an item row, the list-and-detail page,
// buttons inside an alert and a link beside a status mark. Like the item rows they are built on (catalog-patterns.ts) they live on
// the board first: the rules below are the board's own (not in the served sheets) and move into the page sheets with the first
// product page that draws them (the 08 batch's settings section and install review). Every control is an existing one; these
// rules only place them. The status tones follow the README's table: auto and manual only are both settings in use (idle /
// ready), off is paused (quiet / paused), unavailable with something to do in place is hold / unavailable, and unavailable with
// only uninstall or reinstall left is blocked / blocked, told apart by its words as well.
import { escapeHtml, icon, renderButton, renderEmpty, renderRadioGroup, renderStatusMark, type MwStatusTone, type StateRingState } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderCollapsible, renderToggleGroup } from "./navigation.js";
import { section, specimen } from "./catalog-parts.js";
import type { Say } from "./catalog-composer.js";

export const SKILL_PACK_BOARD_STYLES = `
  /* 1 · An item row whose words stack (name, what it is for, its marks) with the three-way choice under them, not at the row's end:
     the choice is the row's one control, and under the words it keeps the same place whatever the name's length. The name wraps
     instead of being cut: a finger has no hover to read a cut name by. */
  .mw-item.mw-item--stack { align-items: flex-start; flex-wrap: wrap; row-gap: 0; padding-block: 10px; }
  .mw-item--stack > .mw-mark { margin-top: 2px; }
  .mw-item.mw-item--stack > span:nth-child(2) { display: grid; gap: 4px; flex: 1 1 0; align-items: start; }
  .mw-item--stack > span:nth-child(2) > small { white-space: normal; text-wrap: pretty; }
  .mw-item.mw-item--stack > span:nth-child(2) > strong { overflow: visible; white-space: normal; text-overflow: clip; overflow-wrap: break-word; line-height: 1.45; }
  .mw-item--stack[data-off] strong { color: var(--muted); }
  /* The choice's own row in the item, indented to the words where there is room. */
  .mw-item > .mw-item__under { display: flex; flex: 1 0 100%; align-items: center; flex-wrap: wrap; gap: 8px; min-width: 0; margin-top: 8px; padding-left: 44px; }
  .mw-item__under > .mw-alert { flex: 1 1 100%; }
  .mw-item__under .mw-toggle { white-space: nowrap; }

  /* 2 · A fold inside an item row: indented to the words (the 32px mark and the row's 12px gap), its summary a quiet 13px action
     instead of the standalone fold's 12px of room above and below. Its readable name carries the item's name. */
  .mw-item > .mw-item__more { flex: 1 0 100%; min-width: 0; padding: 0 0 0 44px; }
  .mw-item__more > summary { padding: 4px 0; color: var(--muted); font-size: 13px; }
  .mw-item__more > summary:hover { color: var(--ink-soft); }
  .mw-item__more > summary:focus-visible { outline: var(--focus-stroke); outline-offset: 2px; border-radius: 4px; }
  .mw-item__more .mw-collapsible__body { padding: 4px 0 6px; }
  .mw-facts { display: grid; grid-template-columns: minmax(0, 1fr); gap: 2px; margin: 0; max-width: 640px; font-size: 13px; line-height: 1.55; }
  .mw-facts dt { color: var(--muted); font-size: 12px; }
  .mw-facts dd { min-width: 0; margin: 0 0 8px; color: var(--ink); overflow-wrap: anywhere; }
  .mw-facts dd:last-child { margin-bottom: 0; }
  .mw-facts code { font-size: 12px; }
  .mw-facts ul { display: grid; gap: 2px; margin: 0; padding: 0; list-style: none; }
  .mw-facts li { display: flex; flex-wrap: wrap; gap: 2px 10px; }
  .mw-facts li > span { color: var(--muted); font-size: 12px; }
  .mw-facts blockquote { margin: 0; padding-left: 10px; border-left: 2px solid var(--line); color: var(--ink-soft); }

  /* 4 · Buttons inside an alert: under its words, so the next step reads as the answer to what the alert says. */
  .mw-alert__problems { display: grid; gap: 2px; margin: 4px 0 0; padding-left: 18px; color: var(--ink-soft); }
  .mw-alert__problems code { overflow-wrap: anywhere; }

  /* 5 · A link beside a status mark: one paragraph that starts with the mark, so the mark, its reason and the link share a line
     while they fit and wrap as words when they do not. The link's padding reaches a finger without taking line room. */
  .mw-status-line { margin: 0; min-width: 0; color: var(--ink-soft); font-size: 12px; line-height: 20px; text-wrap: pretty; }
  .mw-status-line > .mw-status { margin-right: 6px; vertical-align: middle; }
  .mw-status-line > .mw-btn--link { --reach: 6px; min-height: 0; margin-left: 6px; padding-block: var(--reach); margin-block: calc(-1 * var(--reach)); font-size: 13px; line-height: 20px; vertical-align: middle; }

  /* 3 · List and detail: the list on the left keeps each entry a list item (a screen reader says "3 of 5") and a real button fills
     it; the detail on the right is everything about one entry. Where the room is narrow it is one side at a time. */
  .mw-list-detail { container: mw-list-detail / inline-size; min-width: 0; }
  .mw-list-detail__body { display: grid; grid-template-columns: minmax(280px, 360px) minmax(0, 1fr); gap: 20px; align-items: start; min-width: 0; }
  .mw-list-detail__list { min-width: 0; }
  .mw-list-detail__list > .mw-items { width: 100%; }
  .mw-item.mw-item--pick { min-height: 0; padding: 0; }
  .mw-item--pick:is(:hover, :focus-within) { background: transparent; }
  .mw-item__pick { appearance: none; display: flex; align-items: center; gap: 12px; width: 100%; min-width: 0; min-height: 44px; margin: 0; padding: 6px 8px 6px 10px; border: 0; border-radius: var(--sk-r-item, 8px); background: transparent; color: inherit; font: inherit; text-align: start; cursor: pointer; transition: background-color var(--dur-hover) var(--ease-quint); }
  .mw-item__pick:hover { background: var(--nav-hover); }
  .mw-item__pick[aria-current="true"] { background: var(--nav-active); }
  .mw-item__pick:active:not(:disabled) { background: var(--nav-press); }
  .mw-item__pick:focus-visible { outline: var(--focus-stroke); outline-offset: -2px; }
  .mw-item__pick > span:nth-child(2) { display: grid; gap: 1px; flex: 1 1 0; min-width: 0; }
  /* The name wraps as it is; the pack it lives in takes one line, cut where room runs out, its whole name on hover. */
  .mw-item__pick > span:nth-child(2) > strong { overflow: visible; white-space: normal; overflow-wrap: break-word; line-height: 1.4; }
  .mw-item__pick > span:nth-child(2) > small { flex: none; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .mw-item__pick > .mw-item__end { color: inherit; }
  .mw-list-detail__detail { display: grid; gap: 14px; align-content: start; min-width: 0; padding: 4px 4px 4px 20px; border-left: 1px solid var(--line); }
  .mw-list-detail__detail[hidden] { display: none; }
  /* Only when another entry is chosen; the first view and a reload show the detail at once. */
  .mw-list-detail__detail.is-entering { animation: craft-rise var(--dur-move) var(--ease-quint); }
  .mw-list-detail__detail > header { display: grid; gap: 6px; }
  .mw-list-detail__detail h3 { margin: 0; color: var(--ink); font-size: 20px; font-weight: var(--weight-title, 600); line-height: 1.4; overflow-wrap: anywhere; }
  .mw-list-detail__detail h3:focus-visible { outline: var(--focus-stroke); outline-offset: 2px; border-radius: 4px; }
  .mw-list-detail__detail[data-off] h3 { color: var(--muted); }
  .mw-list-detail__detail > header > p { margin: 0; max-width: 640px; color: var(--ink-soft); font-size: 13px; line-height: 1.55; }
  /* The radios fade by their own .42; their words go muted, as the title does, without a second opacity. */
  .mw-list-detail__detail .mw-radio-group:disabled .mw-check-row { color: var(--muted); }
  .mw-list-detail__used { margin: 0; color: var(--muted); font-size: 12px; }
  .mw-list-detail__detail > .mw-list-detail__back { display: none; justify-self: start; }
  @container mw-list-detail (max-width: 640px) {
    .mw-list-detail__body { grid-template-columns: minmax(0, 1fr); }
    .mw-list-detail__detail { padding: 0; border-left: 0; }
    .mw-list-detail:not([data-detail]) .mw-list-detail__detail { display: none; }
    .mw-list-detail[data-detail] .mw-list-detail__list { display: none; }
    .mw-list-detail__detail > .mw-list-detail__back { display: inline-flex; }
  }
  /* A phone's list keeps its room for the names: the glyph, the same for every entry, gives way. */
  @container mw-list-detail (max-width: 480px) {
    .mw-item__pick > .mw-mark { display: none; }
    /* Only here may the status word be cut (its whole word on hover, and in the detail one tap away). */
    .mw-item__pick > .mw-item__end { min-width: 0; max-width: 45%; }
  }
  @media (prefers-reduced-motion: reduce) {
    .mw-list-detail__detail.is-entering { animation: none; }
    .mw-item__pick { transition: none; }
  }
  /* A phone or a finger: each of these is a 44px target, the link by its padding (it sits in a sentence). */
  @media (max-width: 600px), (pointer: coarse) {
    /* On a phone the choice takes the row from the glyph's edge and its three settings share it equally, so a longer word in
       another language narrows the others instead of running past the row. */
    .mw-item > .mw-item__under { padding-left: 0; }
    .mw-item__under > .mw-toggle-group { display: flex; flex: 1 1 100%; min-width: 0; }
    .mw-item__under .mw-toggle { flex: 1 1 0; min-width: 0; min-height: 44px; padding-inline: 6px; }
    .mw-item__more > summary { min-height: 44px; padding-block: 0; }
    .mw-status-line > .mw-btn--link { --reach: 12px; }
    .mw-alert__actions .mw-btn, .mw-list-detail__back { min-height: 44px; }
  }

  .mw-catalog :is([data-primitive="item-choice"], [data-primitive="item-details"], [data-primitive="alert-actions"], [data-primitive="status-link"]) .mw-catalog__specimens { grid-template-columns: repeat(auto-fill, minmax(min(100%, 420px), 1fr)); align-items: start; }
  .mw-catalog :is([data-primitive="item-choice"], [data-primitive="item-details"]) .mw-items { width: 100%; }
  .mw-catalog [data-primitive="list-detail"] .mw-catalog__specimens { grid-template-columns: minmax(0, 1fr); }
  .mw-catalog [data-primitive="list-detail"] .mw-catalog__row { display: block; }
  .mw-catalog [data-list-detail-narrow] { width: min(390px, 100%); padding: 12px; border-radius: var(--sk-r-item, 8px); box-shadow: inset 0 0 0 1px var(--line); }
  .mw-catalog [data-primitive="status-link"] .mw-catalog__row { display: grid; gap: 10px; justify-items: start; }
`;

type Mode = "off" | "auto" | "manual";
interface Unavailable {
  /** The status mark's word (README「状态标记的色调」). */
  readonly word: string;
  /** What happened, in the person's words (README「用不了」). */
  readonly why: string;
  /** The one thing that can be done about it, if any. */
  readonly fix?: string;
  /** Only uninstall or reinstall is left: blocked, and the three-way choice cannot be changed. */
  readonly onlyRemove?: boolean;
  /** The plugin is off: the setting cannot be changed until it is on again. */
  readonly locked?: boolean;
}
interface Skill {
  readonly id: string;
  readonly name: string;
  readonly what: string;
  readonly pack: string;
  readonly mode: Mode;
  readonly unavailable?: Unavailable;
  readonly when: string;
  readonly tools: readonly string[];
  readonly files: readonly { readonly path: string; readonly role: string; readonly size: string }[];
  readonly used: string;
}

const MODE_WORD: Record<Mode, string> = { off: "关", auto: "自动", manual: "仅手动" };
const MODE_SAYS: Record<Mode, string> = {
  off: "关：不会被用。",
  auto: "自动：AI 按任务自己选用；你点名时优先用你点的。",
  manual: "仅手动：只在你用 / 点名时用，AI 不会自己选。",
};

/** The skills the specimens show (made up; nothing is read from a Home). Every text is still Chinese: `say` turns it. */
function skills(say: Say): { readonly weekly: Skill; readonly minutes: Skill; readonly invoice: Skill; readonly schedule: Skill; readonly contract: Skill } {
  return {
    weekly: { id: "weekly", name: say("写周度复盘"), what: say("每周五把这一周的进展、风险和下周计划整理成一页"), pack: say("周报与复盘"), mode: "auto",
      when: say("要整理一周的工作、写周报或复盘时"), tools: ["goals.list", "pages.create"],
      files: [{ path: "templates/weekly.md", role: say("参考"), size: "2 KB" }], used: say("最近一次：昨天 17:40 · 助理") },
    minutes: { id: "minutes", name: say("把会议录音整理成带行动项、负责人和截止日期的纪要，并发到团队频道"), what: say("会后把录音转写整理成纪要"), pack: say("会议助手：录音转写、纪要与行动项跟进（团队版）"), mode: "manual",
      when: say("会议结束、手上有录音或转写时"), tools: ["files.read", "inbox.send"],
      files: [{ path: "scripts/split-speakers.py", role: say("脚本，会执行"), size: "6 KB" }], used: say("最近一次：3 天前 · Coding") },
    invoice: { id: "invoice", name: say("整理发票"), what: say("把发票照片识别成表格，按月归档"), pack: say("财务小工具"), mode: "off",
      when: say("收到发票照片或 PDF 时"), tools: ["files.read"], files: [], used: say("还没用过") },
    schedule: { id: "schedule", name: say("安排会议"), what: say("按大家的空闲时间提出会议时间"), pack: say("日程安排"), mode: "auto",
      unavailable: { word: say("暂时用不了"), why: say("没有连接日历，暂时用不了（状态仍可改）"), fix: say("去连接") },
      when: say("要约人开会、找共同空闲时间时"), tools: ["calendar.free_busy"], files: [], used: say("最近一次：上周 · 助理") },
    contract: { id: "contract", name: say("审合同条款"), what: say("逐条标出合同里的风险条款"), pack: say("法务审阅"), mode: "auto",
      unavailable: { word: say("已撤销"), why: say("发布者已撤销，只能卸载"), fix: say("卸载"), onlyRemove: true },
      when: say("拿到要签的合同时"), tools: ["files.read"], files: [{ path: "reference/clauses.md", role: say("参考"), size: "18 KB" }], used: say("还没用过") },
  };
}

const mark = (name: Parameters<typeof icon>[0]) => `<span class="mw-mark" aria-hidden="true">${icon(name)}</span>`;
const ring = (mode: Mode): { tone: MwStatusTone; state: StateRingState } => mode === "off" ? { tone: "quiet", state: "paused" } : { tone: "idle", state: "ready" };

/** The setting's status mark, or the unavailable one, which is shown instead of it (the setting is kept). */
function statusOf(say: Say, skill: Skill): string {
  const u = skill.unavailable;
  // A narrow list can cut the mark's word; its whole word is on hover.
  if (u) return renderStatusMark({ label: u.word, tone: u.onlyRemove ? "blocked" : "hold", state: u.onlyRemove ? "blocked" : "unavailable", labelAttrs: { title: u.word } });
  return renderStatusMark({ label: say(MODE_WORD[skill.mode]), ...ring(skill.mode), labelAttrs: { title: say(MODE_WORD[skill.mode]) } });
}

/** 5 · The mark, why, and the one thing to do, as one paragraph. */
export function statusLine(mark: string, why: string, fix?: string): string {
  return `<p class="mw-status-line">${mark}<span>${escapeHtml(why)}</span>${fix ? renderButton({ label: fix, variant: "link" }) : ""}</p>`;
}

/** 4 · An alert with its next steps under its words (renderAlert draws the title and the words). */
export function alertWithActions(options: { tone: "danger" | "success" | "warning" | "info"; title: string; body: string; problems?: readonly string[]; actions: string }): string {
  const role = options.tone === "danger" ? "alert" : "status";
  const problems = options.problems?.length ? `<ul class="mw-alert__problems">${options.problems.map((line) => `<li>${line}</li>`).join("")}</ul>` : "";
  return `<div class="mw-alert mw-alert--${options.tone}" data-slot="alert" role="${role}"><strong>${escapeHtml(options.title)}</strong><p>${escapeHtml(options.body)}</p>${problems}<div class="mw-alert__actions">${options.actions}</div></div>`;
}

/** 1 · The three-way choice; disabled while the plugin is off, revoked or broken. */
function choice(say: Say, skill: Skill, disabled = false): string {
  return renderToggleGroup({
    label: say("「{name}」怎么用", { name: skill.name }),
    items: (["off", "auto", "manual"] as const).map((mode) => ({ value: mode, label: say(MODE_WORD[mode]), current: skill.mode === mode, attrs: disabled ? { disabled: true } : {} })),
  });
}

function saveFailed(say: Say, skill: Skill): string {
  return alertWithActions({ tone: "danger", title: say("没能保存"), body: say("「{name}」还是「{mode}」，什么都没改。", { name: skill.name, mode: say(MODE_WORD[skill.mode]) }),
    actions: renderButton({ label: say("重试"), variant: "secondary", size: "sm" }) });
}

/** 1 · One row of the enable step: the words, then the choice under them (and what stops it, or a failed save). */
function choiceRow(say: Say, skill: Skill, options: { locked?: Unavailable; failed?: boolean } = {}): string {
  const locked = options.locked;
  const under = `${choice(say, skill, Boolean(locked))}${options.failed ? saveFailed(say, skill) : ""}`;
  const why = locked ? statusLine(renderStatusMark({ label: locked.word, tone: locked.onlyRemove ? "blocked" : "hold", state: locked.onlyRemove ? "blocked" : "unavailable" }), locked.why, locked.fix) : "";
  return `<li class="mw-item mw-item--stack"${locked ? " data-off" : ""}>${mark("book")}<span><strong>${escapeHtml(skill.name)}</strong><small>${escapeHtml(skill.what)}</small>${why}</span><div class="mw-item__under">${under}</div></li>`;
}

export function itemChoiceSection(say: Say): string {
  const { weekly, minutes, invoice } = skills(say);
  const plugin: Unavailable = { word: say("暂时用不了"), why: say("插件「法务审阅」停用了，暂时用不了；设置保留为「自动」，恢复后照旧"), fix: say("启用插件"), locked: true };
  const revoked: Unavailable = { word: say("已撤销"), why: say("发布者已撤销，只能卸载"), fix: say("卸载"), onlyRemove: true };
  const broken: Unavailable = { word: say("坏了"), why: say("正文或附带文件缺失"), fix: say("重新安装"), onlyRemove: true };
  return section("item-choice", say("条目行里的分段 / Item Row Choice"), `<div class="mw-catalog__specimens">
    ${specimen(say("装完就地启用：每项三档，默认关"), `<ul class="mw-items">${choiceRow(say, { ...weekly, mode: "off" })}${choiceRow(say, minutes)}${choiceRow(say, invoice)}</ul>`)}
    ${specimen(say("用不了：三档变灰，状态旁给能做的事"), `<ul class="mw-items">${
      choiceRow(say, { ...invoice, name: say("审合同条款"), what: say("逐条标出合同里的风险条款"), mode: "auto" }, { locked: plugin })}${
      choiceRow(say, { ...invoice, name: say("比对合同版本"), what: say("标出两版合同之间改了哪些条款"), mode: "manual" }, { locked: revoked })}${
      choiceRow(say, { ...invoice, name: say("生成报价单"), what: say("按模板生成报价单 PDF") }, { locked: broken })}</ul>`)}
    ${specimen(say("保存失败：就地说清，原状态不变"), `<ul class="mw-items">${choiceRow(say, weekly, { failed: true })}</ul>`)}
  </div>`);
}

/** 2 · What a skill holds, inside its row's fold or in the detail. */
function facts(say: Say, skill: Skill, withExcerpt: boolean): string {
  const files = skill.files.length
    ? `<ul>${skill.files.map((file) => `<li><code>${escapeHtml(file.path)}</code><span>${escapeHtml(file.role)} · ${escapeHtml(file.size)}</span></li>`).join("")}</ul>`
    : `<span>${escapeHtml(say("没有附带文件"))}</span>`;
  const excerpt = withExcerpt ? `<dt>${escapeHtml(say("正文开头"))}</dt><dd><blockquote>${escapeHtml(say("先列出这周完成的目标，再写没做完的和原因；风险单独一节，每条写清谁来跟。"))}</blockquote></dd>` : "";
  return `<dl class="mw-facts"><dt>${escapeHtml(say("什么时候用"))}</dt><dd>${escapeHtml(skill.when)}</dd><dt>${escapeHtml(say("声明的工具（只是说明，不给权限）"))}</dt><dd>${
    skill.tools.map((tool) => `<code>${escapeHtml(tool)}</code>`).join(" ")}</dd><dt>${escapeHtml(say("附带的文件"))}</dt><dd>${files}</dd>${excerpt}</dl>`;
}

function moreRow(say: Say, skill: Skill, open = false): string {
  const fold = renderCollapsible({ summary: say("看详情"), body: facts(say, skill, true), open, className: "mw-item__more" })
    .replace("<summary>", `<summary aria-label="${escapeHtml(say("看详情：{name}", { name: skill.name }))}">`);
  return `<li class="mw-item mw-item--stack">${mark("book")}<span><strong>${escapeHtml(skill.name)}</strong><small>${escapeHtml(skill.what)}</small></span>${fold}</li>`;
}

export function itemDetailsSection(say: Say): string {
  const { weekly, minutes, invoice } = skills(say);
  return section("item-details", say("条目行里的折叠详情 / Item Row Details"), `<div class="mw-catalog__specimens">
    ${specimen(say("安装预览：每项可就地展开"), `<ul class="mw-items">${moreRow(say, weekly, true)}${moreRow(say, invoice)}</ul>`)}
    ${specimen(say("长名字、会执行脚本"), `<ul class="mw-items">${moreRow(say, minutes, true)}</ul>`)}
  </div>`);
}

/** 3 · One entry of the list: the list item stays, a real button fills it. */
function pick(say: Say, skill: Skill, key: string, current: boolean): string {
  return `<li class="mw-item mw-item--pick"><button type="button" class="mw-item__pick" data-list-pick="${key}"${current ? ' aria-current="true"' : ""}>${mark("book")}<span><strong>${
    escapeHtml(skill.name)}</strong><small title="${escapeHtml(skill.pack)}">${escapeHtml(skill.pack)}</small></span><span class="mw-item__end">${statusOf(say, skill)}</span></button></li>`;
}

/** 3 · Everything about one entry; the choice is the three radios, each with what it means. */
function detail(say: Say, skill: Skill, key: string, shown: boolean): string {
  const u = skill.unavailable;
  const disabled = Boolean(u?.onlyRemove || u?.locked);
  const radios = renderRadioGroup({ legend: say("怎么用"), name: `${key}-mode`, items: (["off", "auto", "manual"] as const).map((mode) => ({ value: mode, label: say(MODE_SAYS[mode]), checked: skill.mode === mode })) });
  const why = u ? statusLine(statusOf(say, skill), u.why, u.fix) : "";
  return `<section class="mw-list-detail__detail" data-list-panel="${key}" aria-labelledby="${key}-title"${shown ? "" : " hidden"}${disabled ? " data-off" : ""}>
    ${renderButton({ label: say("全部技能"), variant: "ghost", size: "sm", icon: "chevron-left", className: "mw-list-detail__back", attrs: { "data-list-back": "" } })}
    <header><h3 id="${key}-title" tabindex="-1">${escapeHtml(skill.name)}</h3><p>${escapeHtml(skill.what)}</p></header>
    ${why}${disabled ? radios.replace("<fieldset ", "<fieldset disabled ") : radios}${facts(say, skill, false)}<p class="mw-list-detail__used">${escapeHtml(skill.used)}</p>
  </section>`;
}

function listDetail(say: Say, id: string, narrow: boolean): string {
  const list = Object.values(skills(say));
  const picks = list.map((skill, index) => pick(say, skill, `${id}-${skill.id}`, index === 0)).join("");
  const details = list.map((skill, index) => detail(say, skill, `${id}-${skill.id}`, index === 0)).join("");
  return `<div class="mw-list-detail" data-list-detail${narrow ? " data-list-detail-narrow" : ""}><div class="mw-list-detail__body"><div class="mw-list-detail__list" role="region" aria-label="${escapeHtml(narrow ? say("技能列表（窄处标本）") : say("技能列表"))}"><ul class="mw-items">${picks}</ul></div>${details}</div></div>`;
}

export function listDetailSection(say: Say): string {
  const empty = renderEmpty({ icon: "book", title: say("还没有技能"), body: say("技能是一套做法，比如怎么写周报、怎么审合同。装一个技能包，或者把本机 Agent 里已有的技能导进来。"),
    action: `<div class="mw-empty__actions">${renderButton({ label: say("从本机导入"), variant: "secondary", icon: "download" })}${renderButton({ label: say("去插件市场"), variant: "primary" })}</div>` });
  return section("list-detail", say("列表与详情 / List and Detail"), `<div class="mw-catalog__specimens">
    ${specimen(say("左边列表、右边详情：只在选中另一项时进场"), listDetail(say, "list-wide", false))}
    ${specimen(say("窄处一次一边：选中后焦点到详情标题，「全部技能」回到列表"), listDetail(say, "list-narrow", true))}
    ${specimen(say("还没有技能"), empty)}
  </div>`);
}

export function skillAlertSpecimens(say: Say): string {
  const bad = alertWithActions({ tone: "danger", title: say("这个包装不上"), body: say("下面这几处不对，什么都没装，原来的也没动。"),
    problems: [`<code>skills/meeting-notes/SKILL.md</code>${escapeHtml(say("：包里找不到"))}`, `<code>skills/weekly/scripts/run.sh</code>${escapeHtml(say("：声明了却没有这个文件"))}`],
    actions: renderButton({ label: say("重新选文件"), variant: "secondary", size: "sm" }) });
  const failed = alertWithActions({ tone: "danger", title: say("没能保存"), body: say("「{name}」还是「{mode}」，什么都没改。", { name: say("写周度复盘"), mode: say("自动") }), actions: renderButton({ label: say("重试"), variant: "secondary", size: "sm" }) });
  const done = alertWithActions({ tone: "success", title: say("已装好「{name}」{version}", { name: say("周报与复盘"), version: "1.4" }), body: say("{count} 个技能都还没启用。到「技能」里选哪些要用。", { count: 4 }), actions: renderButton({ label: say("去「技能」"), variant: "primary", size: "sm" }) });
  const two = alertWithActions({ tone: "warning", title: say("有 1 个技能只有本地 Agent 能用"), body: say("「整理仓库提交」要执行本机命令，内置助理用不了；导入后在 Coding 里可以点名用它。"),
    actions: renderButton({ label: say("照样导入"), variant: "secondary", size: "sm" }) + renderButton({ label: say("不导入这一个"), variant: "ghost", size: "sm" }) });
  const stack = (body: string) => `<div class="mw-keep-stack">${body}</div>`;
  return `${specimen(say("装不上：逐条列出原因"), stack(bad))}${specimen(say("保存失败"), stack(failed))}${specimen(say("完成后的下一步"), stack(done))}${specimen(say("两个按钮，长句"), stack(two))}`;
}

export function statusLinkSection(say: Say): string {
  const mode = (m: Mode) => `<p class="mw-status-line">${renderStatusMark({ label: say(MODE_WORD[m]), ...ring(m) })}</p>`;
  const hold = (word: string, why: string, fix?: string) => statusLine(renderStatusMark({ label: word, tone: "hold", state: "unavailable" }), why, fix);
  const blocked = (word: string, why: string, fix: string) => statusLine(renderStatusMark({ label: word, tone: "blocked", state: "blocked" }), why, fix);
  return section("status-link", say("状态旁的链接 / Status with Link"), `<div class="mw-catalog__specimens">
    ${specimen(say("在用与没在用"), `${mode("auto")}${mode("manual")}${mode("off")}`)}
    ${specimen(say("能就地修好的用不了"), `${hold(say("暂时用不了"), say("没有连接日历，暂时用不了（状态仍可改）"), say("去连接"))}${hold(say("暂时用不了"), say("缺少 {name}", { name: say("插件「日程安排」") }), say("去添加"))}${
      hold(say("暂时用不了"), say("插件「法务审阅」停用了，暂时用不了；设置保留为「自动」，恢复后照旧"), say("启用插件"))}${hold(say("只限本地 Agent"), say("只有本地 Agent 能用：{why}", { why: say("要执行本机命令") }))}`)}
    ${specimen(say("只能卸载或重装"), `${blocked(say("已撤销"), say("发布者已撤销，只能卸载"), say("卸载"))}${blocked(say("坏了"), say("正文或附带文件缺失"), say("重新安装"))}`)}
  </div>`);
}
