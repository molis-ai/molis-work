import { icon, renderButton, renderStatusMark, type PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";
import { section, specimen } from "./catalog-parts.js";

// The board's opening chapter: the design language the rest of the board is built from. What every screen answers, which colours
// may meet and what each one means, where each zone of the workbench stands, and (in the motion section) which change gets
// which motion. The specimens are made of the same tokens and controls as the product, so a change to a token shows here first.

const three = [
  ["01", "我在哪", "项目和事项的名字常驻在同一个位置。页面的标题是对象自己的名字，不是页面的种类。"],
  ["02", "现在怎样", "先摆要你处理的和出了例外的。一切正常的用灰字，一句话带过，不占首屏。"],
  ["03", "下一步", "一屏只有一个墨蓝主操作，用动词开头。同一种动作再出现时退成浅底。"],
] as const;

const rules = [
  ["冷色是系统，暖色是你", "身份、导航、焦点和进行中都在蓝灰里。整块界面上唯一的暖色是「轮到你」，所以它不用加粗也看得见。"],
  ["一屏一个墨蓝", "墨蓝只给主操作和选中。雾蓝只指路：焦点、链接、进行中，从不填按钮。"],
  ["层次靠明度，不靠线", "桌面、工作面、内层块、洗底四级。一组内容只画一圈边，组里用发丝线，不给每一行各画一个框。"],
  ["动效只说明变化", "到达、换了地方、前进后退、新来一条、轮到你、完成，各有一种，都用同一组时长和曲线。没有变化就不动。"],
  ["正常的事一句话", "没有等你的事、都已保存、都在正常运行，用灰字一句话带过，不占首屏，也不配图标装饰。颜色和位置留给例外。"],
] as const;

/** 设计语言：每一屏回答什么，五条搭配规则。 */
export function languageSection(): string {
  const cards = three.map(([no, title, body]) => `<article class="mw-lang-card"><small>${no}</small><strong>${title}</strong><p>${body}</p></article>`).join("");
  const list = rules.map(([title, body]) => `<li><strong>${title}</strong><span>${body}</span></li>`).join("");
  return section("language", "设计原则", `<div class="mw-catalog__specimens">
    ${specimen("每一屏先回答三个问题", `<div class="mw-lang-three">${cards}</div>`)}
    ${specimen("五条搭配规则", `<ol class="mw-lang-rules">${list}</ol>`)}
  </div>`);
}

type Tone = "idle" | "progress" | "attention" | "hold" | "blocked" | "done";
const row = (tone: Tone, glyph: PluginIconName, state: string, title: string, note: string, action = "", attrs = "") =>
  `<div class="mw-lang-row"${attrs}>${renderStatusMark({ label: state, tone, icon: glyph })}<strong>${title}</strong><span>${note}</span>${action}</div>`;

const temperature = [
  ["--action", "墨蓝", "你做的", "主操作、选中的选项、提示气泡", "状态、链接、装饰"],
  ["--accent", "雾蓝", "你在哪、正在发生", "焦点、链接、进行中、未读点", "填按钮"],
  ["--tone-attention", "琥珀", "轮到你", "等你决定、验收、回答", "插件身份、装饰、普通提醒"],
  ["--tone-hold", "青", "等别人", "已交出去、等对方回复", "进行中"],
  ["--tone-blocked", "红", "走不通", "阻塞、失败、危险操作", "未读、强调"],
  ["--tone-done", "绿", "落定了", "完成、已连接、已保存", "主操作"],
  ["--tone-idle", "灰", "歇着", "可开始、归档、常态", "需要人看见的事"],
] as const;

const surfaces = [["--page", "Desk"], ["--paper", "Surface"], ["--surface-soft", "Soft"], ["--rail", "Wash"]] as const;
const inks = [
  ["--ink", "Ink · 正文"], ["--ink-soft", "Soft · 次级"], ["--muted", "Muted · 说明"], ["--faint", "Faint · 提示"],
  ["--accent", "Mist blue · 链接"], ["--tone-attention", "Attention · 轮到你"], ["--tone-blocked", "Blocked · 阻塞"], ["--tone-done", "Done · 完成"],
] as const;
const ownerHues = [["blue", "target"], ["indigo", "inbox"], ["purple", "rss"], ["slate", "library"], ["steel", "file"]] as const;

/** 色彩搭配：角色放在一起看、颜色的温度、字在面上的实测对比度、插件身份色。 */
export function pairingSection(): string {
  const stage = `<div class="mw-lang-stage">
    <div class="mw-lang-sheet">
      <header><small>项目首页</small><h3>FlyLeaf-V0.1</h3></header>
      <div class="mw-lang-list">
        ${row("attention", "status-needs-you", "等你验收", "首版范围说明", "昨天 22:14 · Pages", renderButton({ label: "验收", variant: "primary", size: "sm" }))}
        ${row("progress", "status-progress", "进行中", "打磨首次使用", "助理在办 · 第 2 步，共 4 步", renderButton({ label: "看进展", variant: "secondary", size: "sm" }))}
        ${row("hold", "status-waiting", "等别人", "确认首批内测名单", "已发给 Lin")}
        ${row("blocked", "status-blocked", "读取失败", "导入用户访谈", "本地服务没有响应", renderButton({ label: "再试一次", variant: "secondary", size: "sm" }))}
        ${row("done", "status-done", "已完成", "完成阅读页原型", "9 月 29 日")}
      </div>
      <p class="mw-lang-note">说明用灰字。<a href="#pairing">链接是雾蓝</a>，键盘焦点是 2px 雾蓝描边：<input class="mw-input" value="按 Tab 到这里看" aria-label="焦点示例"></p>
    </div>
    <aside class="mw-lang-soft"><small>内层块</small><span class="mw-lang-wash">洗底</span><span class="mw-lang-wash">洗底</span></aside>
  </div>`;
  const table = temperature.map(([token, name, meaning, use, never]) =>
    `<tr><td><i class="mw-lang-dot" style="background:var(${token})"></i>${name}<code>${token}</code></td><td>${meaning}</td><td>${use}</td><td>${never}</td></tr>`).join("");
  const matrix = inks.map(([ink, label]) => `<tr><th scope="row">${label}</th>${surfaces.map(([surface]) =>
    `<td style="background:var(${surface});color:var(${ink})" data-lang-contrast><span>文字 Aa</span><small></small></td>`).join("")}</tr>`).join("");
  const tiles = ownerHues.map(([hue, glyph]) =>
    `<span class="mw-lang-tile" style="--h:var(--hue-${hue});--s:var(--hue-${hue}-soft)"><i>${icon(glyph)}</i><span>${hue}</span></span>`).join("");
  return section("pairing", "色彩搭配", `<div class="mw-catalog__specimens">
    ${specimen("角色放在一起看 · 一屏一个墨蓝，唯一的暖色是轮到你", stage)}
    ${specimen("颜色的温度 · 每种颜色只有一个意思", `<div class="mw-lang-scroll"><table class="mw-table mw-lang-table"><thead><tr><th>颜色</th><th>意思</th><th>用在</th><th>不用在</th></tr></thead><tbody>${table}</tbody></table></div>`)}
    ${specimen("字在面上 · 当前主题的实测对比度，4.5 以上才用来写字", `<div class="mw-lang-scroll"><table class="mw-lang-matrix"><thead><tr><th></th>${surfaces.map(([, name]) => `<th scope="col">${name}</th>`).join("")}</tr></thead><tbody>${matrix}</tbody></table></div>`)}
    ${specimen("插件身份色 · 只取冷色，带温度的颜色留给状态", `<div class="mw-lang-tiles">${tiles}</div>`)}
  </div>`);
}

const zones = [
  ["标题栏", "我在哪", "桌面色，不抬升", "标签移动 250ms"],
  ["工作面", "现在怎样", "工作面色 --paper，--sheet-shadow", "内容到达 420ms；同一个对象走过去"],
  ["右侧", "手边的参考", "工作面色，与工作面同级", "侧板从右缘滑入 420ms"],
  ["底栏", "下一步", "桌面上的抬升件，--lift-1 / --lift-2", "菜单从栏升起；轮到你时一圈暖色环，一次"],
  ["浮层", "临时的一件事", "--popover，--lift-3", "从触发它的控件长出，原路收回"],
] as const;

/** 布局分区：桌面上每个区回答哪个问题，用哪一层面、哪一种动效。 */
export function zonesSection(): string {
  const diagram = `<div class="mw-lang-zones" aria-hidden="true">
    <div class="mw-lang-zones__title"><i></i><i></i><b>FlyLeaf-V0.1 / 打磨首次使用</b><span>Pages</span><span>待办</span><em>标题栏 · 我在哪</em></div>
    <div class="mw-lang-zones__sheet"><em>工作面 · 现在怎样</em><u></u><u></u><u></u><u></u></div>
    <div class="mw-lang-zones__side"><em>右侧 · 手边的参考</em><u></u><u></u></div>
    <div class="mw-lang-zones__line"><span class="is-done"></span><span class="is-done"></span><span class="is-you"></span><b>现在 · 输入框</b><span></span><span></span><em>底栏 · 下一步</em></div>
  </div>`;
  const table = zones.map(([zone, answers, surface, motion]) => `<tr><td><strong>${zone}</strong></td><td>${answers}</td><td>${surface}</td><td>${motion}</td></tr>`).join("");
  return section("zones", "布局分区", `<div class="mw-catalog__specimens">
    ${specimen("桌面上的四个区 · 上面说在哪，中间说怎样，下面是下一步", diagram)}
    ${specimen("每个区用哪一层面、哪一种动效", `<div class="mw-lang-scroll"><table class="mw-table mw-lang-table"><thead><tr><th>分区</th><th>回答</th><th>面与抬升</th><th>动效</th></tr></thead><tbody>${table}</tbody></table></div>
      <p class="mw-catalog__hint">底栏上按事项排的节点是方向稿（事项线，specs/work-line），这里只定它用哪一层面和哪一种动效；现行底栏的实件见「底栏与浮层」。</p>`)}
  </div>`);
}

const grammar = [
  ["出现", "上浮 7px 同时淡入", "420ms · quint", "craft-rise"],
  ["再次显示", "淡入", "130ms · quint", "craft-fade-in"],
  ["同一个对象换了地方", "对象自己走过去，其余淡入", "420ms · quint", "molisCraft.carry"],
  ["前进 / 返回", "从来的那一侧滑入 16px", "420ms · quint", "molisCraft.turn"],
  ["新来一条", "一次雾蓝洗底", "640ms · quint", "molisCraft.land"],
  ["轮到你", "一圈暖色环向外散开，一次", "640ms · quint", "molisCraft.ask"],
  ["完成", "对勾落定，一次庆祝", "640ms · spring", "molisCraft.celebrate"],
  ["按下", "缩到 .97 再弹回", "130ms · spring", "mw-btn"],
  ["菜单与浮层", "从触发处长出，原路收回", "进 250ms · 出 130ms", "craft-drop"],
] as const;

/** 动效语法：哪一种变化用哪一种动效，以及三种新动效的可点标本。接在「动效标本」一节的开头。 */
export function motionGrammarSpecimens(): string {
  const table = grammar.map(([change, motion, clock, name]) => `<tr><td><strong>${change}</strong></td><td>${motion}</td><td>${clock}</td><td><code>${name}</code></td></tr>`).join("");
  const demo = (id: string, label: string) => renderButton({ label, variant: "secondary", size: "sm", attrs: { "data-lang-demo": id } });
  const titles = ["让第一次使用的人顺利完成一轮目标协作", "把布局、文字和交互收成一个完整的体验", "让信息流更适合专注阅读"];
  return `
      ${specimen("动效语法 · 一种变化对应一种动效", `<div class="mw-lang-scroll"><table class="mw-table mw-lang-table"><thead><tr><th>变化</th><th>动效</th><th>时长与曲线</th><th>名字</th></tr></thead><tbody>${table}</tbody></table></div>`)}
      ${specimen("同一个对象换了地方 · 420ms", `<div class="mw-lang-carry" data-lang-carry>
        <ul>${titles.map(title => `<li><button type="button" data-lang-carry-open>${title}</button></li>`).join("")}</ul>
        <article hidden>${renderButton({ label: "返回列表", variant: "ghost", size: "sm", icon: "back", attrs: { "data-lang-carry-back": "" } })}<h3 data-lang-carry-title></h3><p>列表里的标题走到详情的标题位置，人不用重新找它在哪。</p></article>
      </div>`)}
      ${specimen("前进 / 返回 · 420ms", `<div class="mw-motion-stack"><div class="mw-craft-row">${demo("back", "返回")}${demo("forward", "前进")}</div><div class="mw-lang-page" data-lang-page>第 1 页</div></div>`)}
      ${specimen("轮到你 · 640ms，一次", `<div class="mw-motion-stack"><div class="mw-craft-row">${demo("ask", "助理办完一步，等你验收")}</div>
        <div class="mw-lang-list mw-lang-list--edge"><div class="mw-lang-row" data-lang-ask>
          <span data-lang-ask-state="progress">${renderStatusMark({ label: "进行中", tone: "progress", icon: "status-progress" })}</span>
          <span data-lang-ask-state="attention" hidden>${renderStatusMark({ label: "等你验收", tone: "attention", icon: "status-needs-you" })}</span>
          <strong>首版范围说明</strong><span>状态先换，环只散开一次；之后靠琥珀色自己留在那里。</span></div></div></div>`)}`;
}

export const LANGUAGE_BOARD_STYLES = `
  .mw-lang-three { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr)); gap: 12px; inline-size: 100%; }
  .mw-lang-card { display: grid; gap: 4px; align-content: start; padding: 16px; border-radius: var(--r-card); background: var(--surface-soft); }
  .mw-lang-card small { color: var(--accent); font-size: 11px; font-variant-numeric: tabular-nums; }
  .mw-lang-card strong { font-size: 17px; font-weight: var(--weight-title, 600); }
  .mw-lang-card p { margin: 4px 0 0; color: var(--ink-soft); line-height: 1.6; }
  .mw-lang-rules { display: grid; gap: 0; inline-size: 100%; margin: 0; padding: 0; list-style: none; counter-reset: rule; border-radius: var(--r-card); box-shadow: 0 0 0 1px var(--line); }
  .mw-lang-rules li { display: grid; grid-template-columns: 2rem minmax(9rem, 14rem) minmax(0, 1fr); gap: 12px; align-items: baseline; padding: 12px 16px; counter-increment: rule; }
  .mw-lang-rules li + li { border-block-start: 1px solid var(--line); }
  .mw-lang-rules li::before { content: counter(rule); color: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; }
  .mw-lang-rules span { color: var(--ink-soft); line-height: 1.6; }
  .mw-lang-stage { display: grid; grid-template-columns: minmax(0, 1fr) 9rem; gap: 12px; inline-size: 100%; padding: 16px; border-radius: var(--r-dialog); background: var(--page); }
  .mw-lang-sheet { display: grid; gap: 12px; min-inline-size: 0; padding: 20px; border-radius: var(--r-sheet); background: var(--paper); box-shadow: var(--sheet-shadow, var(--surface-shadow)); }
  .mw-lang-sheet header { display: grid; gap: 2px; }
  .mw-lang-sheet header small, .mw-lang-soft small { color: var(--muted); font-size: 12px; }
  .mw-lang-sheet h3 { margin: 0; font-size: 20px; line-height: 1.3; }
  .mw-lang-list { border-radius: var(--r-card); box-shadow: 0 0 0 1px var(--line); }
  .mw-lang-list--edge { inline-size: 100%; }
  .mw-lang-row { display: grid; grid-template-columns: 7.5rem minmax(0, 1fr) auto; grid-template-areas: "state title action" "state note action"; align-items: center; gap: 0 12px; min-block-size: 52px; padding: 8px 12px; border-radius: inherit; }
  .mw-lang-row + .mw-lang-row { border-block-start: 1px solid var(--line); border-radius: 0; }
  .mw-lang-row > :is(.mw-status, [data-lang-ask-state]) { grid-area: state; justify-self: start; }
  .mw-lang-row > strong { grid-area: title; min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mw-lang-row > span:not(.mw-status, [data-lang-ask-state]) { grid-area: note; color: var(--muted); font-size: 12px; }
  .mw-lang-row > .mw-btn { grid-area: action; }
  .mw-lang-note { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 0; color: var(--muted); }
  .mw-lang-note a { color: var(--accent); }
  .mw-lang-note .mw-input { inline-size: 11rem; }
  .mw-lang-soft { display: grid; align-content: start; gap: 8px; padding: 12px; border-radius: var(--r-sheet); background: var(--surface-soft); }
  .mw-lang-wash { padding: 6px 8px; border-radius: var(--r-control); background: var(--rail); color: var(--ink-soft); font-size: 12px; }
  .mw-catalog :is(#language, #pairing, #zones) .mw-catalog__specimen { margin: 0; }
  .mw-lang-scroll { inline-size: 100%; min-inline-size: 0; overflow-x: auto; }
  .mw-lang-scroll > table { min-inline-size: 34rem; }
  .mw-lang-table { inline-size: 100%; }
  .mw-lang-table td { vertical-align: top; }
  .mw-lang-table td:first-child { white-space: nowrap; }
  .mw-lang-table code { margin-inline-start: 8px; color: var(--muted); font-size: 11px; }
  .mw-lang-dot { display: inline-block; inline-size: 10px; block-size: 10px; margin-inline-end: 8px; border-radius: 50%; vertical-align: -1px; }
  .mw-lang-matrix { inline-size: 100%; border-collapse: separate; border-spacing: 4px; }
  .mw-lang-matrix th { color: var(--muted); font-size: 11px; font-weight: var(--weight-control, 500); text-align: start; white-space: nowrap; }
  .mw-lang-matrix td { padding: 8px 10px; border-radius: var(--r-control); box-shadow: inset 0 0 0 1px var(--line); }
  .mw-lang-matrix td span { display: block; font-size: 13px; }
  .mw-lang-matrix td small { font-size: 11px; font-variant-numeric: tabular-nums; }
  .mw-lang-matrix td[data-lang-low] small::after { content: " · 不写字"; }
  .mw-lang-tiles { display: flex; flex-wrap: wrap; gap: 12px; }
  .mw-lang-tile { display: grid; grid-template-columns: auto auto; align-items: center; gap: 8px; padding: 6px 12px 6px 6px; border-radius: var(--r-row); background: var(--s); color: var(--ink-soft); font-size: 12px; }
  .mw-lang-tile i { display: grid; place-items: center; inline-size: 28px; block-size: 28px; border-radius: var(--r-control); background: var(--paper); color: var(--h); }
  .mw-lang-tile svg { inline-size: 16px; block-size: 16px; }
  .mw-lang-zones { display: grid; grid-template-columns: minmax(0, 1fr) 30%; grid-template-rows: 28px minmax(150px, auto) 44px; gap: 8px; inline-size: 100%; padding: 12px; border-radius: var(--r-dialog); background: var(--page); font-size: 11px; color: var(--muted); }
  .mw-lang-zones em { margin-inline-start: auto; font-style: normal; color: var(--accent); white-space: nowrap; }
  .mw-lang-zones__title { grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; padding-inline: 4px; }
  .mw-lang-zones__title i { inline-size: 12px; block-size: 12px; border-radius: 50%; background: var(--nav-active); }
  .mw-lang-zones__title b { padding: 4px 10px; border-radius: var(--r-control); background: var(--nav-raised); color: var(--ink); font-weight: var(--weight-control, 500); box-shadow: var(--lift-1); }
  .mw-lang-zones__title span { padding: 4px 10px; }
  .mw-lang-zones__sheet, .mw-lang-zones__side { display: grid; align-content: start; gap: 10px; padding: 14px; border-radius: var(--r-sheet); background: var(--paper); box-shadow: var(--sheet-shadow, var(--surface-shadow)); }
  .mw-lang-zones__sheet em, .mw-lang-zones__side em { margin: 0; }
  .mw-lang-zones u { display: block; block-size: 8px; border-radius: 4px; background: var(--rail); text-decoration: none; }
  .mw-lang-zones u:nth-of-type(1) { inline-size: 46%; block-size: 12px; background: var(--nav-active); }
  .mw-lang-zones u:nth-of-type(3) { inline-size: 82%; }
  .mw-lang-zones u:nth-of-type(4) { inline-size: 64%; }
  .mw-lang-zones__line { grid-column: 1 / -1; display: flex; align-items: center; gap: 10px; padding-inline: 12px; }
  .mw-lang-zones__line span { inline-size: 10px; block-size: 10px; border-radius: 50%; box-shadow: inset 0 0 0 1.5px var(--line-strong); }
  .mw-lang-zones__line span.is-done { background: var(--tone-done); box-shadow: none; }
  .mw-lang-zones__line span.is-you { background: var(--tone-attention); box-shadow: 0 0 0 3px color-mix(in srgb, var(--tone-attention) 22%, transparent); }
  .mw-lang-zones__line b { flex: 0 1 46%; padding: 8px 14px; border-radius: var(--r-composer); background: var(--nav-raised); color: var(--ink-soft); font-weight: 400; box-shadow: var(--lift-2); }
  .mw-catalog .mw-motion-grid > .mw-catalog__specimen:has(.mw-lang-table) { grid-column: 1 / -1; }
  @media (min-width: 900px) { .mw-catalog .mw-motion-grid > .mw-catalog__specimen:has(.mw-lang-carry) { grid-column: span 2; } }
  .mw-lang-carry { inline-size: min(100%, 34rem); min-block-size: 9.5rem; }
  .mw-lang-carry ul { display: grid; margin: 0; padding: 0; list-style: none; border-radius: var(--r-card); box-shadow: 0 0 0 1px var(--line); }
  .mw-lang-carry li + li { border-block-start: 1px solid var(--line); }
  .mw-lang-carry li button { inline-size: 100%; min-block-size: 40px; padding: 0 12px; border: 0; border-radius: var(--r-card); background: none; color: var(--ink); font: inherit; font-weight: var(--weight-control, 500); text-align: start; cursor: pointer; }
  .mw-lang-carry li button:hover { background: var(--nav-hover); }
  .mw-lang-carry li button:focus-visible { outline: var(--focus-stroke); outline-offset: -2px; }
  .mw-lang-carry article { display: grid; justify-items: start; gap: 8px; }
  .mw-lang-carry article h3 { margin: 0; font-size: 20px; line-height: 1.3; }
  .mw-lang-carry article p { margin: 0; color: var(--muted); }
  .mw-lang-page { display: grid; place-items: center; inline-size: min(100%, 22rem); block-size: 72px; border-radius: var(--r-card); background: var(--surface-soft); color: var(--ink-soft); }
  .mw-catalog__index-find { position: sticky; top: 0; z-index: 1; padding-block-end: 8px; background: var(--paper); }
  .mw-catalog__index-find .mw-input { inline-size: 100%; }
  .mw-catalog__index-group { margin: 14px 0 4px; padding-inline: 12px; color: var(--faint); font-size: 11px; font-weight: var(--weight-control, 500); letter-spacing: .02em; }
  .mw-catalog__index-find + .mw-catalog__index-group { margin-block-start: 2px; }
  .mw-catalog__index-none { margin: 8px 12px; color: var(--muted); font-size: 12px; }
  @media (max-width: 720px) {
    .mw-lang-stage { grid-template-columns: minmax(0, 1fr); }
    .mw-lang-rules li { grid-template-columns: 2rem minmax(0, 1fr); }
    .mw-lang-rules li span { grid-column: 2; }
    .mw-lang-row { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "state action" "title action" "note action"; }
    .mw-lang-zones { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto; }
    .mw-lang-zones__title span, .mw-lang-zones em { display: none; }
  }
`;
