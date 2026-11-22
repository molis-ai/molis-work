// 所有画面的标记。控件一律走设计系统的 render*（mw-* 类），页面只负责组合。
// 原型自己的类以 mw- 开头的是“候选组件”（见 prototype.css 顶部说明）：将来补进组件板，页面用法不变。
import {
  icon, escapeHtml as esc, renderButton, renderDirectoryRow, renderDirectoryHeading, renderStatusMark, renderProgress,
  renderEmpty, renderChoice, renderCheckbox, renderInput, renderTextarea, renderMeter, renderCollapsible, renderKbd, renderProjectMonogram,
} from './ds.js';
import { PERSONAL, PROJECTS as SAMPLE_PROJECTS, TODAY, FOLDERS, RESULT } from './data.js';

let projectList = SAMPLE_PROJECTS.slice();
export const setProjects = (list) => { projectList = list; };
export const getProjects = () => projectList;

/* ───────── 数据视图 ───────── */
export const ENTRIES = () => [PERSONAL, ...projectList];
export const byId = (id) => ENTRIES().find((e) => e.id === id) || null;
export const projectCount = () => projectList.length;

export function progressOf(p) {
  const goals = p.goals || [];
  const total = goals.length;
  const done = goals.filter((g) => g.s === 'done').length;
  const cur = goals.find((g) => g.s === 'doing') || goals.find((g) => g.s === 'todo') || null;
  return { total, done, cur, all: total > 0 && done === total };
}
const KIND = {
  you: { word: '由你推进', tone: 'progress', icon: 'status-progress' },
  decide: { word: '等你确认', tone: 'attention', icon: 'status-needs-you' },
  others: { word: '在等别人', tone: 'hold', icon: 'status-waiting' },
  ai: { word: '助理在做', tone: 'progress', icon: 'sparkles' },
};
export const kindOf = (k) => KIND[k] || KIND.you;
export const greeting = (hour = 15) => (hour < 5 ? '夜深了' : hour < 11 ? '早上好' : hour < 13 ? '中午好' : hour < 18 ? '下午好' : '晚上好');

/* ───────── 标题栏 ───────── */
export const wordmark = () => `<span class="mw-wordmark" data-wordmark role="img" aria-label="Molis Work">${[...'Molis Work'].map((c, i) => `<span class="mw-wordmark__l" aria-hidden="true" data-i="${i}">${c === ' ' ? '&nbsp;' : c}</span>`).join('')}<i class="mw-wordmark__caret" aria-hidden="true"></i></span>`;
export const caption = () => `<button type="button" class="mw-caption" data-caption aria-pressed="false" aria-label="暂停标题动画" title="点按暂停或播放"><span class="mw-caption__row" lang="en"><span class="mw-caption__ini">A</span><span class="mw-caption__tail"></span></span><span class="mw-caption__row" lang="en"><span class="mw-caption__ini">I</span><span class="mw-caption__tail"></span></span></button>`;

function tools({ bg, theme }) {
  const btn = (opts) => renderButton({ variant: 'ghost', size: 'md', ...opts });
  return `<nav class="arrival-tools" aria-label="全局">
    ${theme ? `<span class="arrival-theme">${btn({ icon: 'switch', label: '切换主题', attrs: { 'data-act': 'toggle-theme' } })}</span>` : ''}
    ${bg ? `<span class="arrival-global"><span class="arrival-bg">${btn({ icon: 'activity', label: '后台任务', attrs: { 'data-act': 'bg', id: 'bg-btn', 'aria-haspopup': 'true', 'aria-expanded': 'false' } })}<b class="arrival-bg__count" id="bg-count"${bg.count ? '' : ' hidden'}>${bg.count}</b></span>${btn({ icon: 'sparkles', label: '能力', attrs: { 'data-act': 'tool', 'data-tool': '能力' } })}${btn({ icon: 'settings', label: '设置', attrs: { 'data-act': 'tool', 'data-tool': '设置' } })}</span>` : ''}
  </nav>`;
}
/** 标题栏：字标（可打字）· AI 字幕（只在首页）· 全局入口。 */
export function titlebar({ withCaption = false, bg = null, theme = false } = {}) {
  return `<header class="arrival-titlebar" data-region="titlebar">
    <span class="arrival-brand">${icon('brand')}${wordmark()}</span>
    ${withCaption ? caption() : ''}
    <span class="arrival-spacer"></span>
    <span class="arrival-sample" title="项目、材料与整理结果都是设计示例，没有接入真实项目">示例数据 · 未接入真实项目</span>
    ${tools({ bg, theme })}
  </header>`;
}

/* ───────── 底栏：同一个 .workbench-bar，只换三块里的内容 ───────── */
export function barShell({ start = '', center = '', end = '', kind }) {
  return `<div class="workbench-bar arrival-bar" data-dock data-bar="${kind}" aria-label="底栏">
    <div class="bar-start">${start}</div>
    <div class="bar-center" data-assistant-island>${center}</div>
    <div class="bar-end">${end}</div>
  </div>`;
}
export const composer = (placeholder, value = '') => `<form class="assistant-composer bar-composer" data-composer autocomplete="off" aria-label="助理">
  <input class="assistant-composer-input" data-composer-input type="text" autocomplete="off" placeholder="${esc(placeholder)}" aria-label="发给助理" value="${esc(value)}">
  <button class="bar-composer-attach" type="button" data-act="tool" data-tool="添加文件、引用或能力" aria-label="添加文件、引用或能力" title="添加文件、引用或能力">${icon('plus')}</button>
  <button class="mw-btn mw-btn--primary mw-btn--icon-only mw-btn--sm" type="submit" data-composer-send aria-label="发送" title="发送"${value.trim() ? '' : ' disabled'}>${icon('send')}</button>
</form>`;
export const barStatus = ({ glyph, title, sub, spin }) => `<div class="mw-bar-status" role="status" aria-live="polite">
  <span class="mw-bar-status__tile${spin ? ' is-spin' : ''}" aria-hidden="true">${spin ? '<i></i>' : icon(glyph)}</span>
  <span class="mw-bar-status__text"><strong>${esc(title)}</strong><small>${esc(sub)}</small></span>
</div>`;
const lg = (opts) => renderButton({ size: 'lg', ...opts });
const enterKey = '<kbd class="mw-btn__key" aria-hidden="true">↵</kbd>';
const withKey = (html) => html.replace('</span></button>', `</span>${enterKey}</button>`);

export function stepsHTML(total, current) {
  return `<ol class="mw-steps" aria-label="进度">${Array.from({ length: total }, (_, i) => `<li${i === current ? ' aria-current="step"' : ''} class="${i < current ? 'is-done' : ''}"><span></span></li>`).join('')}</ol>`;
}
const backStart = (total, current, label = '返回项目') => `${lg({ variant: 'ghost', icon: 'back', label, className: 'arrival-back', attrs: { 'data-act': 'ob-back' } })}${stepsHTML(total, current)}`;

export function chooserBar(state) {
  const e = byId(state.sel);
  const key = e ? e.id : 'none';
  const ph = !e ? '让助理做点什么…' : e.personal ? '在个人空间里，让助理做点什么…' : `问问「${e.name}」的进展，或交给助理一项工作…`;
  const ctx = e
    ? `<div class="mw-bar-context"><span class="mw-bar-context__mark">${e.personal ? icon('user') : renderProjectMonogram(e.name, e.id, esc)}</span><span class="mw-bar-context__text"><strong>${esc(e.name)}</strong><small>预览中 · 回车进入</small></span></div>`
    : `<div class="mw-bar-context"><span class="mw-bar-context__mark is-none">${icon('search')}</span><span class="mw-bar-context__text"><strong>没有匹配的项目</strong><small>助理在个人空间里工作</small></span></div>`;
  return barShell({
    kind: 'chooser', start: ctx,
    center: composer(ph, state.drafts.get(`chooser:${key}`) || ''),
    end: `${lg({ variant: 'secondary', icon: 'plus', label: '新建项目', attrs: { 'data-act': 'new' } })}${withKey(lg({ variant: 'primary', label: e?.personal ? '进入个人空间' : '进入项目', disabled: !e, attrs: { 'data-act': 'enter', 'aria-keyshortcuts': 'Enter' } }))}`,
  });
}

/* ───────── 项目选择页 ───────── */
function rowFor(p, state) {
  const g = progressOf(p);
  const decide = (p.next || []).filter((n) => n.kind === 'decide').length;
  const caption = p.personal ? `灵光 ${p.counts[0].value} · Shelf ${p.counts[1].value} · 待办 ${p.counts[2].value}`
    : !g.total ? `还没有目标 · ${p.opened}` : g.all ? `目标全部完成 · ${p.opened}` : `${g.cur.t} · ${p.opened}`;
  return renderDirectoryRow({
    title: p.name, caption, density: 'meta',
    count: p.personal ? undefined : g.total ? `${g.done}/${g.total}` : undefined,
    status: decide ? `${decide} 项等你` : undefined, statusTone: 'attention', statusIcon: 'status-needs-you',
    selected: state.sel === p.id,
    attrs: { 'data-id': p.id, 'data-act': 'pick', role: 'option', 'aria-selected': String(state.sel === p.id), tabindex: state.sel === p.id ? '0' : '-1', id: `row-${p.id}` },
  });
}
export function visibleEntries(state) {
  const q = state.query.trim().toLowerCase();
  if (!q) return ENTRIES();
  return ENTRIES().filter((e) => `${e.name} ${e.desc || ''}`.toLowerCase().includes(q));
}
/** 列表读不出来：就在列表该在的地方说清楚，并给重试（产品的 mw-empty--error）。个人空间不受影响。 */
export const loadErrorHTML = () => `<div class="mw-empty mw-empty--error chooser-error" role="alert"><span class="mw-empty__mark">${icon('circle-alert')}</span><strong>项目列表暂时读不到</strong><p>本机的项目目录没有响应。个人空间不受影响，可以先在那里工作。</p>${renderButton({ variant: 'secondary', size: 'md', icon: 'refresh', label: '重试', attrs: { 'data-act': 'retry-load' } })}</div>`;
export function listBody(state) {
  if (state.loadError) return `${renderDirectoryHeading('个人')}${rowFor(PERSONAL, state)}${loadErrorHTML()}`;
  const list = visibleEntries(state);
  if (!list.length) return `<p class="chooser-none">没有匹配的项目</p>`;
  const personal = list.find((e) => e.personal);
  const projects = list.filter((e) => !e.personal);
  return `${personal ? `${renderDirectoryHeading('个人')}${rowFor(personal, state)}` : ''}${projects.length ? `${renderDirectoryHeading(`项目 · 按最近打开`)}${projects.map((p) => rowFor(p, state)).join('')}` : ''}`;
}
export function listColumn(state) {
  const last = projectList[0];
  return `<header class="chooser-head">
      <p class="chooser-greeting" data-greeting><strong>${greeting()}</strong><span>${last ? `上次在 ${esc(last.name)} · ${esc(last.opened)}` : '欢迎来到 Molis Work'}</span></p>
    </header>
    <label class="mw-input-group chooser-search">${icon('search')}<input class="mw-input" id="chooser-q" type="search" placeholder="搜索项目" aria-label="搜索项目" autocomplete="off" spellcheck="false" value="${esc(state.query)}"><span class="chooser-search__key">${renderKbd('⌘K')}</span></label>
    <div class="chooser-dir" id="chooser-dir" role="listbox" aria-label="个人空间与项目" data-scroll>${listBody(state)}</div>
    <p class="chooser-foot">${icon('folder')}<span>项目和文档保存在这台电脑</span></p>`;
}

/* 项目简介：项目选择页与“命名并开始”共用的一块 */
const track = (goals) => `<ol class="mw-goal-track${goals.length > 7 ? ' is-dense' : ''}" role="img" aria-label="${goals.filter((g) => g.s === 'done').length} / ${goals.length} 个目标完成">${goals.map((g, i) => `<li data-s="${g.s}" style="--i:${i}" title="${esc(g.t)}"><span class="mw-goal-track__bar"></span><span class="mw-goal-track__name">${esc(g.t)}</span></li>`).join('')}</ol>`;
function focusCard(p, g) {
  if (!g.total) {
    return `<section class="brief-focus is-empty" aria-label="目标"><div><h2>还没有目标</h2><p>${p.facts.materials ? `项目里有 ${p.facts.materials} 份材料，可以先让助理起草。` : '进入项目后写下第一个目标。'}</p></div>${p.facts.materials ? renderButton({ variant: 'secondary', size: 'md', icon: 'sparkles', label: '让助理起草目标', attrs: { 'data-act': 'prefill', 'data-text': '根据项目材料，帮我起草 3 个目标' } }) : ''}</section>`;
  }
  return `<section class="brief-focus" aria-label="目标">
    <header><span class="brief-focus__label">${g.all ? '目标全部完成' : '当前目标'}</span><span class="brief-focus__count"><b>${g.done}</b> / ${g.total} 完成</span></header>
    ${g.all ? `<h2>${g.total} 个目标都完成了</h2><p>可以收尾，或为这个项目定下新的目标。</p>` : `<h2>${esc(g.cur.t)}</h2>${g.cur.brief ? `<p>${esc(g.cur.brief)}</p>` : ''}`}
    ${track(p.goals)}
  </section>`;
}
const nextRows = (items, attr = 'enter-item') => items.map((n, i) => {
  const k = kindOf(n.kind);
  return renderDirectoryRow({ title: n.t, caption: n.meta, density: 'meta', status: k.word, statusTone: k.tone, statusIcon: k.icon, attrs: { 'data-act': attr, 'data-i': String(i) } });
}).join('');
const recentRows = (items) => `<ul class="brief-recent">${items.map((r) => `<li><time>${esc(r.when)}</time><span>${esc(r.t)}</span></li>`).join('')}</ul>`;

export function briefHTML(p, { actions = true, todosHtml = '', nextTitle = '接下来' } = {}) {
  if (p.personal) {
    return `<article class="brief" aria-labelledby="brief-title" data-id="${p.id}">
      <p class="brief-kicker">${renderStatusMark({ label: '只有你能看到', tone: 'quiet', icon: 'user', plain: true })}<span>最近打开 ${esc(p.opened)}</span></p>
      <h1 class="brief-title" id="brief-title">${esc(p.name)}</h1>
      <p class="brief-desc">${esc(p.desc)}</p>
      <section class="brief-focus is-counts" aria-label="里面有什么">${p.counts.map((c) => `<p><b>${c.value}</b><span>${esc(c.label)}</span></p>`).join('')}</section>
      <div class="brief-cols"><section class="brief-sec"><h2>接下来</h2><div class="brief-list">${nextRows(p.next)}</div></section><section class="brief-sec"><h2>最近</h2>${recentRows(p.recent)}</section></div>
    </article>`;
  }
  const g = progressOf(p);
  const state = !g.total ? { label: '未设目标', tone: 'quiet', icon: 'status-todo' } : g.all ? { label: '已完成', tone: 'done', icon: 'status-done' } : { label: '进行中', tone: 'progress', icon: 'status-progress' };
  const desc = p.desc
    ? `<p class="brief-desc">${esc(p.desc)}</p>`
    : `<p class="brief-desc is-missing">${icon('info')}<span>还没有项目描述。进入项目后，在项目设置里补一句它要做什么。</span></p>`;
  const next = todosHtml || (p.next.length
    ? `<div class="brief-list">${nextRows(p.next)}</div>`
    : `<p class="brief-quiet">${g.total ? '没有待推进的事。' : '目标定下来之后，要推进的事会出现在这里。'}</p>`);
  return `<article class="brief" aria-labelledby="brief-title" data-id="${p.id}">
    <p class="brief-kicker">${renderStatusMark({ label: state.label, tone: state.tone, icon: state.icon, plain: true })}<span>最近打开 ${esc(p.opened)}</span><span>${p.facts.materials} 份材料</span>${p.demo ? '<span>演示数据，可随时重建</span>' : ''}</p>
    <h1 class="brief-title" id="brief-title">${esc(p.name)}</h1>
    ${desc}
    ${focusCard(p, g)}
    <div class="brief-cols"><section class="brief-sec"><h2>${nextTitle}</h2>${next}</section><section class="brief-sec"><h2>最近</h2>${recentRows(p.recent)}</section></div>
    ${actions ? `<p class="brief-facts"><span>材料 ${p.facts.materials} 份</span><span>文档 ${p.facts.docs} 篇</span><span>${esc(p.facts.path)}</span></p>` : ''}
  </article>`;
}
export function noResultHTML(q) {
  return `<article class="brief brief-none">${renderEmpty({
    icon: 'search', title: `没有叫「${q.trim()}」的项目`, body: '换个关键词，或者就用它开始一个新项目。不属于任何项目的事，也可以先放进个人空间。',
    action: `<div class="brief-none__actions">${renderButton({ variant: 'secondary', size: 'lg', icon: 'x', label: '清除搜索', attrs: { 'data-act': 'clear-search' } })}${renderButton({ variant: 'primary', size: 'lg', icon: 'plus', label: `新建「${q.trim()}」`, attrs: { 'data-act': 'new-named' } })}</div>`,
  })}</article>`;
}
export function noProjectsHTML() {
  return `<article class="brief brief-none">${renderEmpty({
    icon: 'folder', title: '从一个真实项目开始', body: '带入正在做的文件、网页或聊天记录，整理成项目；也可以空白开始。个人空间随时可用。',
    action: `<div class="brief-none__actions">${renderButton({ variant: 'primary', size: 'lg', icon: 'plus', label: '带入材料新建', attrs: { 'data-act': 'new' } })}${renderButton({ variant: 'secondary', size: 'lg', label: '空白开始', attrs: { 'data-act': 'new-blank' } })}</div>`,
  })}</article>`;
}
export function detailFor(state) {
  const sel = byId(state.sel);
  if (sel && sel.personal && !projectList.length && !state.query.trim() && !state.loadError) return noProjectsHTML();
  return sel ? briefHTML(sel) : noResultHTML(state.query);
}
export function chooserView(state) {
  return `<div class="stage-split chooser" data-view="chooser">
    <aside class="stage-side chooser-list" id="chooser-list">${listColumn(state)}</aside>
    <section class="stage-sheet chooser-detail" id="chooser-detail" data-scroll aria-live="polite">${detailFor(state)}</section>
  </div>`;
}

/* ───────── 新用户的开场 ───────── */
export function openingView() {
  return `<div class="stage-single"><div class="stage-sheet opening" data-view="opening">
    <div class="opening-glow" aria-hidden="true"></div>
    <div class="opening-copy">
      <div class="opening-caption">${caption()}</div>
      <h1 class="opening-wordmark">${wordmark()}</h1>
    </div>
  </div></div>`;
}

/* ───────── Welcome：语言、外观 ───────── */
const miniWorkbench = () => {
  const row = (g, w, s) => `<div class="ob-mini-row"><i>${icon(g)}</i><span><b style="width:${w}%"></b><s style="width:${s}%"></s></span></div>`;
  return `<div class="ob-mini"><div class="ob-mini-surface"><b class="ob-mini-title"></b>${row('target', 62, 40)}${row('rss', 48, 58)}${row('note', 70, 36)}</div><div class="ob-mini-bar"><span class="ob-mini-dock"><i></i><i class="is-on"></i><i></i></span><span class="ob-mini-composer"><i></i><em></em></span><span class="ob-mini-avatar"></span></div></div>`;
};
export function welcomeView(state) {
  const w = state.welcome;
  const choice = (opts) => renderChoice(opts);
  if (w.step === 'language') {
    return `<div class="stage-single"><div class="stage-sheet welcome" data-view="welcome" data-step="language">
      <section class="welcome-q"><h1 tabindex="-1">${w.lang === 'en' ? 'Language' : '语言'}</h1><p>${w.lang === 'en' ? 'Start in the language you know best. You can change it later in Settings.' : '用你最熟悉的语言开始。之后可以在设置里随时更改。'}</p>
        <div class="welcome-options" role="group" aria-label="界面语言">${choice({ label: '简体中文', selected: w.lang === 'zh', attrs: { 'data-act': 'lang', 'data-lang': 'zh' } })}${choice({ label: 'English', selected: w.lang === 'en', attrs: { 'data-act': 'lang', 'data-lang': 'en' } })}</div></section>
      <aside class="welcome-scene" aria-hidden="true"><div class="ob-greeting"><strong lang="${w.lang}">${w.lang === 'en' ? 'Hello.' : '你好。'}</strong><span>Molis Work</span></div></aside>
    </div></div>`;
  }
  const theme = state.theme;
  return `<div class="stage-single"><div class="stage-sheet welcome" data-view="welcome" data-step="appearance">
    <section class="welcome-q"><h1 tabindex="-1">外观</h1><p>选择浅色、深色，或跟随系统。改动立即生效，只保存在这台设备。</p>
      <div class="welcome-options" role="group" aria-label="主题">${choice({ label: '浅色', icon: 'sun', selected: theme === 'light', attrs: { 'data-theme-option': 'light' } })}${choice({ label: '深色', icon: 'moon', selected: theme === 'dark', attrs: { 'data-theme-option': 'dark' } })}${choice({ label: '跟随系统', icon: 'system', selected: theme === 'system', attrs: { 'data-theme-option': 'system' } })}</div>
      <p class="welcome-label">界面密度</p>
      <div class="welcome-options" role="group" aria-label="界面密度">${choice({ label: '标准', icon: 'rows', selected: state.density === 'standard', attrs: { 'data-density-option': 'standard' } })}${choice({ label: '紧凑', icon: 'list', selected: state.density === 'compact', attrs: { 'data-density-option': 'compact' } })}</div></section>
    <aside class="welcome-scene" aria-hidden="true">${miniWorkbench()}</aside>
  </div></div>`;
}
export function welcomeBar(state) {
  const first = state.welcome.step === 'language';
  return barShell({
    kind: 'welcome',
    start: `${lg({ variant: 'ghost', label: first ? '稍后再说' : '上一步', attrs: { 'data-act': first ? 'later' : 'welcome-prev' } })}${stepsHTML(6, first ? 0 : 1)}`,
    center: '',
    end: withKey(lg({ variant: 'primary', label: state.welcome.lang === 'en' ? 'Continue' : '继续', attrs: { 'data-act': 'welcome-next', 'aria-keyshortcuts': 'Enter' } })),
  });
}
export function openingBar() {
  return barShell({ kind: 'opening', start: '', center: '', end: withKey(lg({ variant: 'primary', label: '开始', attrs: { 'data-act': 'opening-start', 'aria-keyshortcuts': 'Enter' } })) });
}

/* ───────── 新建项目 ───────── */
export const SOURCES = [
  { id: 'folder', icon: 'folder', name: '文件夹资料', cap: '选择一个工作文件夹中的文本资料' },
  { id: 'files', icon: 'file', name: '单独选文件', cap: 'PDF、Word、Markdown 和文本文件' },
  { id: 'web', icon: 'globe', name: '浏览器内容', cap: '粘贴网页正文与来源网址' },
  { id: 'gmail', icon: 'mail', name: 'Gmail', cap: 'Molis 尚未配置 Google 接入，可先使用其他来源', disabled: true },
  { id: 'chat', icon: 'message', name: '聊天记录', cap: '导入飞书、Slack 等导出的文本记录' },
];
export const RANGES = [['7', '7 天'], ['30', '30 天'], ['90', '90 天'], ['all', '全部']];
export const LIMIT = { count: 50, bytes: 6e6 };
export const fmtSize = (b) => (b < 1e6 ? `${Math.max(1, Math.round(b / 1e3))} KB` : `${(b / 1e6).toFixed(1)} MB`);
const extOf = (name) => (name.split('.').pop() || 'txt').toLowerCase().slice(0, 4);
export const allItems = (ob) => ob.groups.flatMap((g) => g.items.map((it) => ({ ...it, group: g })));
export const chosen = (ob) => allItems(ob).filter((m) => !ob.off.has(m.id));
export const sumBytes = (list) => list.reduce((a, m) => a + m.size, 0);
const countOf = (ob, src) => ob.groups.filter((g) => g.src === src).reduce((a, g) => a + g.items.length, 0);

function sourceConfig(ob, id) {
  if (id === 'folder') {
    const picks = Object.entries(FOLDERS).map(([k, f]) => renderChoice({ label: f.label, selected: ob.folderPick === k, attrs: { 'data-act': 'ob-pick', 'data-folder': k, title: f.hint } })).join('');
    return `<div class="ob-cfg-block"><p class="ob-label">位置</p><div class="mw-choice-group ob-picks" role="group" aria-label="位置">${picks}</div></div>
      <div class="ob-cfg-row"><div class="ob-cfg-block"><p class="ob-label">时间范围</p><div class="mw-toggle-group" role="group" aria-label="时间范围" data-slot="toggle-group">${RANGES.map(([v, l]) => `<button type="button" class="mw-toggle${ob.range === v ? ' is-current' : ''}" aria-pressed="${ob.range === v}" data-act="ob-range" data-range="${v}">${l}</button>`).join('')}</div></div>
        <label class="mw-check-row">${renderCheckbox({ checked: ob.sub, attrs: { id: 'cfg-sub' } })}<span>整个子目录</span></label></div>
      <div class="ob-cfg-actions">${renderButton({ variant: 'primary', size: 'md', icon: 'folder', label: '选择并授权', attrs: { 'data-act': 'ob-add-folder' } })}<p class="ob-note">${icon('shield')}<span>先列出文件名和大小，开始整理后才读正文。</span></p></div>`;
  }
  if (id === 'files') {
    return `<div class="ob-cfg-actions"><label class="mw-btn mw-btn--primary mw-btn--md" for="cfg-files">${icon('file')}<span data-slot="button-label">选择文件</span></label><input id="cfg-files" class="mw-sr-only" type="file" multiple accept=".pdf,.doc,.docx,.md,.markdown,.txt,text/*" data-file-input="files">${renderButton({ variant: 'ghost', size: 'md', label: '用示例文件', attrs: { 'data-act': 'ob-sample-files' } })}</div>
      <p class="ob-note">${icon('info')}<span>最多 50 份、6 MB。这里只记下文件名和大小，不读取内容。</span></p>`;
  }
  if (id === 'web') {
    return `<div class="ob-cfg-block"><label class="ob-label" for="cfg-web">网页正文</label>${renderTextarea({ id: 'cfg-web', rows: 4, value: ob.web, placeholder: '从网页复制需要整理的内容，粘贴到这里', attrs: { 'data-field': 'web' } })}</div>
      <div class="ob-cfg-block"><label class="ob-label" for="cfg-url">原网页网址（可选）</label>${renderInput({ id: 'cfg-url', type: 'url', value: ob.url, placeholder: 'https://', attrs: { 'data-field': 'url' } })}</div>
      <div class="ob-cfg-actions">${renderButton({ variant: 'primary', size: 'md', icon: 'plus', label: '添加这段正文', disabled: !ob.web.trim(), attrs: { 'data-act': 'ob-add-web', id: 'cfg-web-add' } })}${renderButton({ variant: 'ghost', size: 'md', label: '填入示例', attrs: { 'data-act': 'ob-sample-web' } })}<p class="ob-note">${icon('shield')}<span>只使用粘贴的内容，不访问其他标签页或浏览记录。</span></p></div>`;
  }
  if (id === 'gmail') {
    return `<p class="ob-note is-warn">${icon('alert')}<span>Molis 还没有配置 Google 接入。可以先整理其他材料；接入准备好后再连接，连接后只读所选时间内最多 20 封邮件正文，不读附件，不发信。</span></p>
      <div class="ob-cfg-actions">${renderButton({ variant: 'primary', size: 'md', icon: 'mail', label: '连接 Google', disabled: true })}</div>`;
  }
  return `<div class="ob-cfg-actions"><label class="mw-btn mw-btn--primary mw-btn--md" for="cfg-chat">${icon('message')}<span data-slot="button-label">选择聊天导出文件</span></label><input id="cfg-chat" class="mw-sr-only" type="file" accept=".txt,.md,.json,.csv,text/*" data-file-input="chat">${renderButton({ variant: 'ghost', size: 'md', label: '用示例导出', attrs: { 'data-act': 'ob-sample-chat' } })}</div>
    <p class="ob-note">${icon('info')}<span>当前支持导出的文本；飞书、Slack 会话的直接连接还未接入。</span></p>`;
}
function sourceStateLabel(ob, s) {
  if (s.disabled) return '暂不可连接';
  const n = countOf(ob, s.id);
  return n ? `已添加 ${n}` : '待添加';
}
/** 来源就是目录行：选中（展开）的那一行用 --nav-active，配置就地展开在它下面。 */
export function sourceList(ob) {
  return `<div class="ob-sources" role="list" aria-label="材料来源">${SOURCES.map((s) => {
    const open = ob.open === s.id;
    const n = countOf(ob, s.id);
    const row = renderDirectoryRow({
      title: s.name, caption: s.cap, icon: s.icon, density: 'meta', count: sourceStateLabel(ob, s), selected: open,
      className: s.disabled ? 'is-unavailable' : '',
      attrs: { 'data-act': 'ob-open', 'data-src': s.id, 'aria-expanded': String(open), 'aria-controls': `cfgp-${s.id}` },
    });
    return `<div class="ob-source${open ? ' is-open' : ''}${n ? ' has-items' : ''}" role="listitem" data-src="${s.id}">${row}${open ? `<div class="ob-source__cfg" id="cfgp-${s.id}">${sourceConfig(ob, s.id)}</div>` : ''}</div>`;
  }).join('')}</div>`;
}
const chip = (name) => `<span class="mw-file-kind mw-file-kind--${extOf(name)}">${esc(extOf(name).toUpperCase())}</span>`;
export function materialsList(ob, mode) {
  return ob.groups.map((g) => {
    const on = g.items.filter((m) => !ob.off.has(m.id)).length;
    const all = on === g.items.length;
    const none = on === 0;
    const head = mode === 'scope'
      ? `<label class="mw-file-group__head"><input class="mw-check" type="checkbox" data-scope-group="${g.id}"${all ? ' checked' : ''}${!all && !none ? ' data-mixed' : ''}><span class="mw-file-group__ic">${icon(SOURCES.find((s) => s.id === g.src).icon)}</span><span class="mw-file-group__text"><strong>${esc(g.label)}</strong><small>${esc(g.scope)}</small></span><span class="mw-file-group__count">${on}/${g.items.length}</span>${g.auth ? renderStatusMark({ label: g.auth, tone: 'done', icon: 'status-done', plain: true }) : ''}</label>`
      : `<div class="mw-file-group__head"><span class="mw-file-group__ic">${icon(SOURCES.find((s) => s.id === g.src).icon)}</span><span class="mw-file-group__text"><strong>${esc(g.label)}</strong><small>${esc(g.scope)}</small></span>${g.auth ? renderStatusMark({ label: g.auth, tone: 'done', icon: 'status-done', plain: true }) : ''}<button type="button" class="mw-btn mw-btn--ghost mw-btn--icon-only mw-btn--sm mw-file-group__x" data-act="ob-remove-group" data-group="${g.id}" aria-label="移除 ${esc(g.label)}" title="移除">${icon('x')}</button></div>`;
    const rows = g.items.map((m) => mode === 'scope'
      ? `<li class="mw-file-row"><label class="mw-file-row__label"><input class="mw-check" type="checkbox" data-scope-item="${m.id}"${ob.off.has(m.id) ? '' : ' checked'}>${chip(m.name)}<span class="mw-file-row__name">${esc(m.name)}</span></label><span class="mw-file-row__size">${fmtSize(m.size)}</span><span class="mw-file-row__state">未读取</span></li>`
      : `<li class="mw-file-row"><span class="mw-file-row__label">${chip(m.name)}<span class="mw-file-row__name">${esc(m.name)}</span></span><span class="mw-file-row__size">${fmtSize(m.size)}</span><button type="button" class="mw-btn mw-btn--ghost mw-btn--icon-only mw-btn--sm mw-file-row__x" data-act="ob-remove" data-mid="${m.id}" aria-label="移除 ${esc(m.name)}" title="移除">${icon('x')}</button></li>`).join('');
    return `<section class="mw-file-group" data-group="${g.id}">${head}<ul class="mw-file-list">${rows}</ul>${g.skipped ? `<p class="mw-file-group__note">另有 ${g.skipped} 项因时间、类型或访问范围未列入。</p>` : ''}</section>`;
  }).join('');
}
export function meters(ob) {
  const c = chosen(ob);
  const bytes = sumBytes(c);
  const over = c.length > LIMIT.count || bytes > LIMIT.bytes;
  return `<div class="ob-meters${over ? ' is-over' : ''}">
    <div class="ob-meter"><p><span>份数</span><span><b>${c.length}</b> / ${LIMIT.count}</span></p>${renderProgress({ value: Math.min(c.length, LIMIT.count), max: LIMIT.count, label: '份数' })}</div>
    <div class="ob-meter"><p><span>大小</span><span><b>${(bytes / 1e6).toFixed(1)}</b> / 6 MB</span></p>${renderProgress({ value: Math.min(bytes, LIMIT.bytes), max: LIMIT.bytes, label: '大小' })}</div>
    ${over ? `<p class="ob-error">${icon('alert')}<span>超过 50 份或 6 MB，请取消部分文件。</span></p>` : ''}
  </div>`;
}
export const modelRow = (ob) => ob.model
  ? `<div class="ob-model"><span class="ob-model__dot is-on" aria-hidden="true"></span><span class="ob-model__text"><strong>文字模型 · MiniMax</strong><small>已连接 · 选中的正文会发给它整理</small></span>${renderButton({ variant: 'ghost', size: 'sm', label: '更换', attrs: { 'data-act': 'ob-model' } })}</div>`
  : `<div class="ob-model is-off"><span class="ob-model__dot" aria-hidden="true"></span><span class="ob-model__text"><strong>尚未连接文字模型</strong><small>原文先暂存在本机，连接后再生成摘要</small></span>${renderButton({ variant: 'secondary', size: 'sm', label: '连接文字模型', attrs: { 'data-act': 'ob-model' } })}</div>`;
const privacy = (text) => `<p class="ob-note">${icon('shield')}<span>${text}</span></p>`;
export function phaseList(ob) {
  const total = chosen(ob).length;
  const list = ob.model
    ? [['读入材料', `${Math.min(ob.read, total)} / ${total} 份`], ['整理工作脉络', '背景、进展与时间线'], ['找出要你推进的事', '待办、等待与截止']]
    : [['读入材料', `${Math.min(ob.read, total)} / ${total} 份`]];
  return `<ol class="ob-phases" role="list">${list.map(([t, s], i) => {
    const tone = ob.phase > i ? 'done' : ob.phase === i ? 'progress' : 'idle';
    const glyph = ob.phase > i ? 'status-done' : ob.phase === i ? 'status-progress' : 'status-todo';
    return `<li class="ob-phase is-${tone}"><span class="ob-phase__mark">${icon(glyph)}</span><span class="ob-phase__text"><strong>${esc(t)}</strong><small>${esc(s)}</small></span></li>`;
  }).join('')}</ol>`;
}
export const currentFile = (ob) => {
  const c = chosen(ob);
  if (ob.phase === 1) return '把材料串成背景、进展与时间线…';
  if (ob.phase >= 2) return '正在找出要你推进的事…';
  return c[Math.min(ob.read, c.length - 1)]?.name || '';
};
function readList(ob) {
  const c = chosen(ob);
  return `<ul class="mw-file-list is-receipts">${c.map((m, i) => {
    const done = i < ob.read;
    const now = i === ob.read && ob.phase === 0;
    const tone = done ? 'done' : now ? 'progress' : 'idle';
    const label = done ? '已读取' : now ? '正在读取' : '等待中';
    return `<li class="mw-file-row"><span class="mw-file-row__label">${chip(m.name)}<span class="mw-file-row__name">${esc(m.name)}</span></span><span class="mw-file-row__size">${fmtSize(m.size)}</span>${renderStatusMark({ label, tone, icon: done ? 'status-done' : now ? 'status-progress' : 'status-todo', plain: true })}</li>`;
  }).join('')}</ul>`;
}
const todoTone = { decide: 'attention', you: 'progress', others: 'hold', unknown: 'quiet' };
const todoGlyph = { decide: 'clock', you: 'status-progress', others: 'status-waiting', unknown: 'question' };
export function todoList(ob) {
  const rows = (ob.todos || []).map((t, i) => `<li class="mw-file-row is-todo"><label class="mw-file-row__label"><input class="mw-check" type="checkbox" data-todo="${i}"${t.on ? ' checked' : ''}><span class="mw-file-row__name${t.on ? '' : ' is-off'}">${esc(t.t)}</span></label>${renderStatusMark({ label: t.tag[1], tone: todoTone[t.tag[0]], icon: todoGlyph[t.tag[0]], plain: true })}</li>`).join('');
  return `<ul class="mw-file-list">${rows}</ul>${renderCollapsible({ summary: `${RESULT.refs.length} 条仅供参考，未列为待办`, body: `<ul class="ob-refs">${RESULT.refs.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` })}`;
}
const snapshot = (ob) => { const c = chosen(ob); return `${c.length} 份材料 · ${new Set(c.map((m) => m.group.src)).size} 个来源 · 读取于 10月1日 15:42`; };
const nameField = (ob, big) => `<div class="ob-name${big ? ' is-big' : ''}"><label class="ob-label" for="ob-name">项目名称</label><input class="mw-input${big ? ' ob-name__input' : ''}" id="ob-name" type="text" autocomplete="off" maxlength="120" placeholder="例如：秋季内容计划" value="${esc(ob.name)}" ${big ? 'data-plain-field' : ''} aria-describedby="ob-name-err"><p class="ob-error" id="ob-name-err"${ob.error ? '' : ' hidden'}>${icon('alert')}<span>${esc(ob.error)}</span></p></div>`;

/** 新项目的预览：与项目选择页的详情是同一个简介块。 */
function previewProject(ob) {
  const todos = (ob.todos || []).filter((t) => t.on);
  const p = {
    id: 'new', name: ob.name.trim() || '新项目', opened: '刚刚', desc: ob.step === 'blank' ? '' : ob.summary.trim(),
    goals: [], next: todos.slice(0, 3).map((t) => ({ kind: t.tag[0] === 'decide' ? 'decide' : t.tag[0] === 'others' ? 'others' : 'you', t: t.t, meta: t.tag[1] })),
    recent: [{ when: '刚刚', t: ob.step === 'blank' ? '创建了空白项目' : `带入 ${chosen(ob).length} 份材料并创建项目` }],
    facts: { materials: ob.step === 'blank' ? 0 : chosen(ob).length, docs: 0, path: `~/Molis/${ob.name.trim() || '新项目'}` },
  };
  const todosHtml = ob.step === 'result' ? (ob.model ? `<p class="brief-hint">勾选的会加入新项目；没勾的留在「待办 → 待你确认」。</p>${todoList(ob)}` : '<p class="brief-quiet">连接文字模型后，才能从材料里找出待办。现在可以先带着资料开始。</p>') : '';
  return `<div class="ob-preview" aria-label="新项目的样子">${briefHTML(p, { actions: false, todosHtml, nextTitle: ob.step === 'result' ? '接下来 · 待办草稿' : '接下来' })}</div>`;
}

/** 新建项目的两栏：左为这一步的问题，右为这一步的材料。 */
export function onboardView(state) {
  const ob = state.ob;
  const left = (inner) => `<aside class="stage-side ob-left" data-scroll>${inner}</aside>`;
  const right = (inner, cls = '') => `<section class="stage-sheet ob-right ${cls}" data-scroll>${inner}</section>`;
  const q = (title, sub) => `<header class="ob-q"><h1 tabindex="-1">${title}</h1><p>${sub}</p></header>`;
  if (ob.step === 'sources') {
    const all = allItems(ob);
    const stage = all.length
      ? `<header class="ob-stage-head"><h2>这次带入</h2><span>${all.length} 份 · ${ob.groups.length} 组 · ${fmtSize(sumBytes(all))} · 正文尚未读取</span></header>${materialsList(ob, 'list')}`
      : renderEmpty({ icon: 'folder', title: '从你正在做的事开始', body: '选一种来源，材料会按来源排在这里。添加时只记下文件名和大小。', action: `<div class="ob-quick">${renderButton({ variant: 'secondary', size: 'md', icon: 'folder', label: '添加文件夹', attrs: { 'data-act': 'ob-open', 'data-src': 'folder' } })}${renderButton({ variant: 'secondary', size: 'md', icon: 'file', label: '选择文件', attrs: { 'data-act': 'ob-open', 'data-src': 'files' } })}${renderButton({ variant: 'secondary', size: 'md', icon: 'globe', label: '粘贴网页正文', attrs: { 'data-act': 'ob-open', 'data-src': 'web' } })}</div>` });
    const resumed = ob.resumed ? `<p class="ob-resume">${icon('history')}<span>接着上次没完成的材料清单。</span>${renderButton({ variant: 'link', size: 'sm', label: '重新开始', attrs: { 'data-act': 'ob-restart' } })}</p>` : '';
    return `<div class="stage-split onboard" data-view="onboard" data-step="sources">${left(`${q('带入已有的材料', '文件、网页和聊天记录会成为新项目的背景。')}${resumed}${sourceList(ob)}${privacy('添加时只记下文件名和大小，开始整理时才读取正文。')}`)}${right(stage, all.length ? '' : 'is-empty')}</div>`;
  }
  if (ob.step === 'scope') {
    return `<div class="stage-split onboard" data-view="onboard" data-step="scope">${left(`${q('确认这次读取的范围', '取消不需要的文件；开始后才读取正文。')}${meters(ob)}${modelRow(ob)}${privacy(ob.model ? '开始后读取选中正文并发给所选模型；原文件保持原样。' : '开始后读取选中正文，暂存在本机；原文件保持原样。')}${renderCollapsible({ summary: '读取规则', body: '<p>本轮最多 50 份、6 MB，邮件也计入。PDF 读取文本层，Word 读取正文；单个文件失败会保留原因，不影响其他文件。只做本次整理，不自动持续同步。</p>' })}`)}${right(`<header class="ob-stage-head"><h2>逐项确认</h2><span>已选 ${chosen(ob).length} / ${allItems(ob).length} 份 · ${fmtSize(sumBytes(chosen(ob)))}</span></header>${materialsList(ob, 'scope')}`)}</div>`;
  }
  if (ob.step === 'organize') {
    const total = chosen(ob).length;
    return `<div class="stage-split onboard" data-view="onboard" data-step="organize">${left(`${q(ob.model ? '正在整理' : '正在读入', '可以离开，回来后接着整理。')}${phaseList(ob)}${privacy('只读取刚才选中的范围。')}`)}${right(`<header class="ob-stage-head"><h2>读入材料</h2><span><b id="org-read">${Math.min(ob.read, total)}</b> / ${total} 份</span></header>${renderProgress({ value: Math.min(ob.read, total), max: total, label: '读入进度' })}<p class="ob-current" id="org-file">${esc(currentFile(ob))}</p>${readList(ob)}`)}</div>`;
  }
  if (ob.step === 'result') {
    return `<div class="stage-split onboard" data-view="onboard" data-step="result">${left(`${q('给新项目起个名字', ob.model ? '根据已有材料整理了一份建议，名字和摘要都可以改。' : '资料已经准备好，摘要可以连接文字模型后再整理。')}${nameField(ob, true)}<div class="ob-name"><label class="ob-label" for="ob-summary">摘要</label>${renderTextarea({ id: 'ob-summary', rows: 6, value: ob.summary, placeholder: ob.model ? '' : '连接文字模型后可以生成摘要，也可以自己写一句。', attrs: { 'data-field': 'summary' } })}</div><p class="ob-note">${icon('note')}<span>${snapshot(ob)}</span></p><div>${renderButton({ variant: 'ghost', size: 'md', icon: 'undo', label: '调整来源并重新整理', attrs: { 'data-act': 'ob-adjust' } })}</div>`)}${right(previewProject(ob))}</div>`;
  }
  return `<div class="stage-split onboard" data-view="onboard" data-step="blank">${left(`${q('给新项目一个名字', '先建一个空间，资料和下一步可以慢慢补充。')}${nameField(ob, true)}<p class="ob-quiet">还没想好是什么项目？${renderButton({ variant: 'link', size: 'sm', label: '先在个人空间开始', attrs: { 'data-act': 'ob-personal' } })}</p><div>${renderButton({ variant: 'ghost', size: 'md', icon: 'folder', label: '改为带入已有材料', attrs: { 'data-act': 'ob-to-sources' } })}</div>`)}${right(previewProject(ob))}</div>`;
}
export function onboardBar(state) {
  const ob = state.ob;
  const all = allItems(ob);
  const c = chosen(ob);
  const total = 4;
  const cur = { sources: 0, scope: 1, organize: 2, result: 3, blank: -1 }[ob.step];
  const start = backStart(total, cur);
  if (ob.step === 'sources') {
    return barShell({ kind: 'onboard', start,
      center: all.length ? barStatus({ glyph: 'note', title: `已添加 ${all.length} 份材料`, sub: `${ob.groups.length} 组 · ${fmtSize(sumBytes(all))} · 正文尚未读取` }) : barStatus({ glyph: 'folder', title: '还没有材料', sub: '添加至少一份材料，或空白开始' }),
      end: `${lg({ variant: 'secondary', label: '空白开始', attrs: { 'data-act': 'ob-blank' } })}${withKey(lg({ variant: 'primary', label: '确认范围', disabled: !all.length, attrs: { 'data-act': 'ob-scope', 'aria-keyshortcuts': 'Enter' } }))}` });
  }
  if (ob.step === 'scope') {
    const over = c.length > LIMIT.count || sumBytes(c) > LIMIT.bytes;
    return barShell({ kind: 'onboard', start,
      center: barStatus({ glyph: 'shield', title: `已选 ${c.length} 份 · ${fmtSize(sumBytes(c))}`, sub: over ? '超过本轮上限，请取消部分文件' : ob.model ? '开始后读取正文并发给 MiniMax 整理' : '开始后读取正文，暂存在本机' }),
      end: `${lg({ variant: 'secondary', icon: 'back', label: '上一步', attrs: { 'data-act': 'ob-prev' } })}${withKey(lg({ variant: 'primary', label: ob.model ? '开始整理' : '带入资料，先开始', disabled: !c.length || over, attrs: { 'data-act': 'ob-start', 'aria-keyshortcuts': 'Enter' } }))}` });
  }
  if (ob.step === 'organize') {
    const t = ['正在读入', '正在整理工作脉络', '正在找出要你推进的事'][Math.min(ob.phase, 2)];
    return barShell({ kind: 'onboard', start,
      center: barStatus({ spin: true, title: ob.phase === 0 ? `${t} ${Math.min(ob.read, c.length)} / ${c.length}` : t, sub: '可以离开，回来后接着整理' }),
      end: `${lg({ variant: 'secondary', label: '在后台继续', attrs: { 'data-act': 'ob-away' } })}${lg({ variant: 'primary', icon: 'clock', label: '整理中', disabled: true })}` });
  }
  if (ob.step === 'result') {
    const n = (ob.todos || []).filter((t) => t.on).length;
    return barShell({ kind: 'onboard', start,
      center: ob.saving ? barStatus({ spin: true, title: '正在保存项目与资料', sub: '请稍候' }) : barStatus({ glyph: 'check', title: ob.model ? `项目建议已就绪 · ${n} 项待办` : '资料已经准备好', sub: '摘要、来源快照和勾选的待办会一起保存' }),
      end: `${lg({ variant: 'secondary', label: '调整来源', attrs: { 'data-act': 'ob-adjust' } })}${withKey(lg({ variant: 'primary', label: ob.model ? (n ? `采用，加入 ${n} 项待办并开始` : '采用，开始工作') : '保存资料，开始工作', disabled: ob.saving, attrs: { 'data-act': 'ob-create', 'aria-keyshortcuts': 'Enter' } }))}` });
  }
  return barShell({ kind: 'onboard', start,
    center: ob.saving ? barStatus({ spin: true, title: '正在创建项目', sub: '请稍候' }) : barStatus({ glyph: 'plus', title: '空白项目', sub: ob.name.trim() ? `将创建「${ob.name.trim()}」` : '写下名字就可以开始' }),
    end: `${lg({ variant: 'secondary', label: '带入材料', attrs: { 'data-act': 'ob-to-sources' } })}${withKey(lg({ variant: 'primary', label: '创建项目', disabled: ob.saving, attrs: { 'data-act': 'ob-create', 'aria-keyshortcuts': 'Enter' } }))}` });
}

/* ───────── 进入项目后（示意） ───────── */
export function workspaceView(state) {
  const p = byId(state.ws) || projectList[0];
  const g = progressOf(p);
  return `<div class="stage-single"><div class="stage-sheet workspace" data-view="workspace">
    <div class="workspace-col">
      <p class="workspace-note">${icon('info')}<span>示意 · 进入之后的项目首页，不在这次设计范围里</span></p>
      <p class="workspace-date">今天的工作 · ${TODAY}</p>
      <h1 class="brief-title" id="ws-title">${esc(p.name)}</h1>
      ${g.cur && !g.all ? `<p class="brief-desc">正在推进「${esc(g.cur.t)}」，${g.done} / ${g.total} 个目标完成。</p>` : ''}
      <div class="brief-list workspace-list">${p.next.length ? nextRows(p.next, 'noop') : '<p class="brief-quiet">今天还没有安排。</p>'}</div>
    </div>
  </div></div>`;
}
export function workspaceBar(state) {
  const p = byId(state.ws) || projectList[0];
  const pin = (glyph, label, current) => `<button class="dock-pin${current ? '' : ''}" type="button" ${current ? 'aria-current="page"' : ''} aria-label="${label}" title="${label}" data-act="tool" data-tool="${label}">${icon(glyph)}</button>`;
  return barShell({
    kind: 'workspace',
    start: `<div class="plugin-picker"><button class="plugin-picker-trigger" type="button" aria-haspopup="true" aria-expanded="false" aria-label="全部插件与 Dock" data-act="tool" data-tool="插件切换器"><span class="plugin-picker-all" aria-hidden="true">${icon('grid')}</span><span class="plugin-picker-current">${icon('home')}<span>项目首页</span></span>${icon('chevron-up')}</button></div>
      <div class="dock-pins" role="toolbar" aria-label="常驻插件">${pin('home', '项目首页', true)}${pin('target', 'Goals')}${pin('inbox', 'Inbox')}${pin('rss', 'Feed')}${pin('terminal', 'Sessions')}</div>`,
    center: composer(`在「${p.name}」里，让助理做点什么…`, state.drafts.get(`ws:${p.id}`) || ''),
    end: `<div class="bar-residents" role="toolbar" aria-label="常驻">${['library:Shelf', 'idea:灵光', 'sidebar:侧栏'].map((x) => { const [g, l] = x.split(':'); return `<button class="bar-resident" type="button" aria-label="${l}" title="${l}" data-act="tool" data-tool="${l}">${icon(g)}</button>`; }).join('')}</div>
      <button class="mw-project-button" type="button" data-act="ws-back" aria-label="项目菜单：回到全部项目" title="全部项目">${renderProjectMonogram(p.name, p.id, esc)}</button>`,
  });
}
