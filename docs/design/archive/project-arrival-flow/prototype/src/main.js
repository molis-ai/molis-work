// 原型的控制器：状态、动线、键盘与动效的接线。画面标记在 views.js，动效在 motion.js。
import { icon, escapeHtml as esc, renderToast, renderDirectoryRow } from './ds.js';
import { PERSONAL, PROJECTS, BACKGROUND_TASKS, FOLDERS, SAMPLE_FILES, SAMPLE_CHAT, SAMPLE_WEB, RESULT } from './data.js';
import * as V from './views.js';
import { Caption, typeWordmark, settleWordmark, arrive, cascade, motion, isStill, EASE } from './motion.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const app = $('#app');
let uid = 0;
const mid = () => `m${++uid}`;

/* ───────── 状态 ───────── */
const freshOb = () => ({
  step: 'sources', open: null, folderPick: 'docs', range: '30', sub: true, web: '', url: '', groups: [], off: new Set(), model: true,
  phase: 0, read: 0, running: false, timer: 0, away: false, finished: false, saving: false, name: '', summary: '', todos: null, error: '',
});
const state = {
  screen: 'chooser', sel: 'flyleaf', query: '', drafts: new Map(), ws: 'flyleaf', firstRun: false,
  welcome: { step: 'language', lang: 'zh' }, theme: 'system', density: 'standard',
  ob: freshOb(), bg: BACKGROUND_TASKS.slice(), lastSel: 'flyleaf', cold: true, quiet: false,
};
let caption = null;        // 标题栏里的字幕（首页）
let openingCaption = null; // 开场里的大字幕
let wordmarkHandle = null;

const readTheme = () => globalThis.molisWorkPreferences?.theme?.() ?? 'system';
const setTheme = (v) => { try { localStorage.setItem('molis-work:theme', v); } catch { /* 无痕 */ } globalThis.molisWorkPreferences?.sync?.(); state.theme = v; };

/* ───────── 外框：标题栏、工作面、底栏各挂一次，换画面只换里面的内容 ───────── */
function mountFrame() {
  app.innerHTML = `${V.titlebar({ withCaption: true, bg: { count: state.bg.length }, theme: true })}
    <main class="arrival-stage" id="stage"></main>
    ${V.barShell({ kind: 'init' })}
    <div class="arrival-toasts" id="toasts" aria-live="polite"></div>
    <div class="arrival-pop mw-menu" id="pop" role="dialog" aria-label="后台任务" hidden></div>`;
  caption = new Caption($('.arrival-titlebar [data-caption]'));
  caption.setActive(false);
}
const bar = () => $('.arrival-bar');
const slots = ['start', 'center', 'end'];
let barCache = {};

/** 用新的底栏替换三块里变了的内容；外框和位置不动。 */
function setBar(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const next = tmp.firstElementChild;
  const cur = bar();
  cur.dataset.bar = next.dataset.bar;
  slots.forEach((s) => {
    const to = next.querySelector(`.bar-${s}`);
    const from = cur.querySelector(`.bar-${s}`);
    const key = to.innerHTML;
    if (barCache[s] === key) return;
    const had = barCache[s] !== undefined;
    barCache[s] = key;
    from.innerHTML = key;
    if (had) [...from.children].forEach((c, i) => arrive(c, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 250, delay: i * 30 }));
  });
  bindComposer();
  if (document.activeElement === document.body) refocusSafe();
}
function refocusSafe() { /* 底栏重绘不抢焦点 */ }

function bindComposer() {
  const form = $('[data-composer]');
  if (!form) return;
  const input = $('[data-composer-input]', form);
  const send = $('[data-composer-send]', form);
  input.addEventListener('input', () => { state.drafts.set(draftKey(), input.value); send.disabled = !input.value.trim(); });
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (!input.value.trim()) return;
    const e = state.screen === 'workspace' ? V.byId(state.ws) : V.byId(state.sel);
    toast(`示意：会在「${e ? e.name : '个人空间'}」里开始一项新工作`);
    input.value = ''; state.drafts.delete(draftKey()); send.disabled = true;
  });
}
const draftKey = () => (state.screen === 'workspace' ? `ws:${state.ws}` : `chooser:${state.sel ?? 'none'}`);

/* ───────── 画面 ───────── */
function setScreen(name) {
  state.screen = name;
  app.dataset.screen = name;
  $('#stage').dataset.screen = name;
  caption?.setActive(name === 'chooser');
  openingCaption?.setActive(name === 'opening');
}
function renderScreen({ animate = false } = {}) {
  const sheet = $('#stage');
  const s = state.screen;
  let html = '';
  let barHtml = '';
  if (s === 'opening') { html = V.openingView(); barHtml = V.openingBar(); }
  else if (s === 'welcome') { html = V.welcomeView(state); barHtml = V.welcomeBar(state); }
  else if (s === 'chooser') { html = V.chooserView(state); barHtml = V.chooserBar(state); }
  else if (s === 'onboard') { html = V.onboardView(state); barHtml = onboardBarWithFirstRun(); }
  else { html = V.workspaceView(state); barHtml = V.workspaceBar(state); }
  sheet.innerHTML = html;
  sheet.scrollTop = 0;
  setBar(barHtml);
  afterRender({ animate });
}
function onboardBarWithFirstRun() {
  const html = V.onboardBar(state);
  if (!state.firstRun) return html;
  // 首次使用：引导接在语言、外观之后，进度短线共 6 段。
  const cur = { sources: 2, scope: 3, organize: 4, result: 5, blank: -1 }[state.ob.step];
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const steps = tmp.querySelector('.mw-steps');
  if (steps) steps.outerHTML = V.stepsHTML(6, cur);
  return tmp.innerHTML;
}
function afterRender({ animate }) {
  const s = state.screen;
  $$('.mw-check[data-mixed]').forEach((i) => { i.indeterminate = true; });
  if (s === 'chooser') {
    const row = $(`#row-${CSS.escape(state.sel ?? '')}`);
    row?.scrollIntoView?.({ block: 'nearest' });
  }
  if (s === 'onboard' && state.ob.step === 'blank') $('#ob-name')?.focus({ preventScroll: true });
  if (!animate || isStill()) return;
  if (s === 'chooser') arriveChooser(state.cold);
  else if (s === 'welcome' || s === 'onboard') arriveSplit();
  else if (s === 'workspace') arriveWorkspace();
}
function arriveChooser(cold) {
  const base = cold ? 120 : 40;
  cascade($$('#chooser-dir .mw-dir-row'), { delay: base, step: 28 });
  arrive($('.chooser-head'), [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: base - 40 });
  arrive($('.chooser-search'), [{ opacity: 0 }, { opacity: 1 }], { duration: 420, delay: base });
  arriveBrief(base + 40, true);
  const b = bar();
  arrive(b, [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 640, delay: cold ? 60 : 0 });
}
function arriveBrief(delay = 0, first = false) {
  const brief = $('#chooser-detail .brief');
  if (!brief) return;
  arrive(brief, [{ opacity: 0.4, transform: 'translateY(7px)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay });
  const bars = $$('.mw-goal-track__bar', brief);
  bars.forEach((el, i) => arrive(el, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 340, delay: delay + 120 + i * 45 }));
  if (first) cascade($$('.brief-list .mw-dir-row, .brief-recent li', brief), { delay: delay + 160, step: 40, duration: 380 });
}
function arriveSplit() {
  const split = $('#stage .stage-split, #stage .stage-single');
  const left = split?.firstElementChild;
  const right = split?.lastElementChild;
  arrive(left, [{ opacity: 0.4, transform: 'translateY(7px)' }, { opacity: 1, transform: 'none' }], { duration: 420 });
  arrive(right, [{ opacity: 0.4, transform: 'translateY(7px)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: 40 });
}
function arriveWorkspace() {
  const col = $('.workspace-col');
  [...(col?.children || [])].forEach((c, i) => { if (c.id !== 'ws-title') arrive(c, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: 120 + i * 50 }); });
}

/* 带方向的切换：先淡出旧内容，再换新内容并到达。 */
async function go(name, mutate, { dir = 'forward' } = {}) {
  const sheet = $('#stage');
  if (!isStill()) {
    const out = sheet.animate([{ opacity: 1 }, { opacity: 0, transform: `translateX(${dir === 'forward' ? -10 : 10}px)` }], { duration: 140, easing: 'ease-in', fill: 'forwards' });
    await out.finished.catch(() => {});
    out.cancel();
  }
  mutate?.();
  setScreen(name);
  renderScreen({ animate: true });
  if (!isStill()) sheet.animate([{ opacity: 0, transform: `translateX(${dir === 'forward' ? 14 : -14}px)` }, { opacity: 1, transform: 'none' }], { duration: 420, easing: EASE });
}

/* ───────── 小件：提示、后台任务 ───────── */
let toastTimer = 0;
function toast(message) {
  const host = $('#toasts');
  host.innerHTML = renderToast({ message, tone: 'neutral' });
  const el = host.firstElementChild;
  arrive(el, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 250 });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { host.innerHTML = ''; }, 2600);
}
function updateBgCount() {
  const c = $('#bg-count');
  if (c) { c.textContent = state.bg.length; c.hidden = !state.bg.length; }
}
function openPop() {
  const pop = $('#pop');
  const btn = $('#bg-btn');
  const r = btn.getBoundingClientRect();
  const ar = app.getBoundingClientRect();
  pop.innerHTML = `<p class="arrival-pop__title">后台任务</p>${state.bg.length ? state.bg.map((t) => renderDirectoryRow({
    title: t.title, caption: `${t.where} · ${t.meta}`, density: 'meta', icon: t.id === 'bg-onboard' && state.ob.finished ? 'status-done' : 'status-progress',
    attrs: { 'data-act': 'bg-task', 'data-task': t.id },
  })).join('') : '<p class="arrival-pop__empty">没有在运行的任务</p>'}`;
  pop.hidden = false;
  pop.style.top = `${r.bottom - ar.top + 6}px`;
  pop.style.left = `${Math.max(12, Math.min(ar.width - 332, r.right - ar.left - 320))}px`;
  btn.setAttribute('aria-expanded', 'true');
  arrive(pop, [{ opacity: 0, transform: 'translateY(-4px) scale(.98)' }, { opacity: 1, transform: 'none' }], { duration: 250 });
}
function closePop() {
  const pop = $('#pop');
  if (pop && !pop.hidden) { pop.hidden = true; $('#bg-btn')?.setAttribute('aria-expanded', 'false'); }
}

/* ───────── 项目选择页 ───────── */
function pick(id, { focus = false } = {}) {
  if (state.sel === id) return;
  state.sel = id;
  $$('#chooser-dir .mw-dir-row').forEach((r) => {
    const on = r.dataset.id === id;
    r.classList.toggle('is-selected', on);
    r.setAttribute('aria-selected', String(on));
    r.tabIndex = on ? 0 : -1;
  });
  const row = $(`#row-${CSS.escape(id)}`);
  row?.scrollIntoView?.({ block: 'nearest' });
  if (focus) row?.focus({ preventScroll: true });
  $('#chooser-detail').innerHTML = V.detailFor(state);
  $('#chooser-detail').scrollTop = 0;
  arriveBrief(0);
  setBar(V.chooserBar(state));
}
function refreshList() {
  const dir = $('#chooser-dir');
  dir.innerHTML = V.listBody(state);
  const vis = V.visibleEntries(state);
  // 搜索时尽量保住当前的预选；没有结果就记下它，清除搜索后原样回来。
  if (state.sel) state.prevSel = state.sel;
  if (!vis.length) state.sel = null;
  else if (!vis.some((e) => e.id === state.sel)) state.sel = vis.some((e) => e.id === state.prevSel) ? state.prevSel : vis[0].id;
  $$('#chooser-dir .mw-dir-row').forEach((r) => { const on = r.dataset.id === state.sel; r.classList.toggle('is-selected', on); r.setAttribute('aria-selected', String(on)); r.tabIndex = on ? 0 : -1; });
  $('#chooser-detail').innerHTML = V.detailFor(state);
  arriveBrief(0);
  setBar(V.chooserBar(state));
}
async function enterProject(id = state.sel, { item } = {}) {
  const e = V.byId(id);
  if (!e) return;
  state.ws = id;
  const from = $('#brief-title')?.getBoundingClientRect();
  const fromSize = from ? parseFloat(getComputedStyle($('#brief-title')).fontSize) : 0;
  state.lastSel = id;
  await go('workspace', null, {});
  const to = $('#ws-title');
  if (from && to && !isStill()) {
    const r = to.getBoundingClientRect();
    const k = fromSize / parseFloat(getComputedStyle(to).fontSize);
    to.style.transformOrigin = '0 0';
    to.animate([{ transform: `translate(${from.left - r.left}px, ${from.top - r.top}px) scale(${k})` }, { transform: 'none' }], { duration: 560, easing: EASE });
  }
  if (item != null) toast(`示意：会打开「${V.byId(id).next[item]?.t ?? ''}」`);
}

/* ───────── 新建项目 ───────── */
async function openOnboarding({ name = '', blank = false, firstRun = state.firstRun } = {}) {
  stopOrganize();
  // 带着名字或要空白开始：全新一份。否则，上次留下的材料清单（还没整理）原样接着；其余一律从头开始。
  const keep = !name && !blank && !state.ob.finished && !state.ob.away && state.ob.groups.length > 0 && ['sources', 'scope'].includes(state.ob.step);
  if (keep) { state.ob.step = 'sources'; state.ob.resumed = true; }
  else state.ob = freshOb();
  if (name) { state.ob.step = 'blank'; state.ob.name = name; }
  if (blank) state.ob.step = 'blank';
  state.firstRun = firstRun;
  state.lastSel = state.sel ?? state.lastSel;
  await go('onboard', null, {});
}
function obStep(step) {
  state.ob.step = step;
  state.ob.error = '';
  renderOnboard();
  if (step === 'organize') startOrganize(true);
}
function renderOnboard({ keepScroll = true } = {}) {
  const sheet = $('#stage');
  const left = $('.ob-left'); const right = $('.ob-right');
  const ls = left?.scrollTop ?? 0; const rs = right?.scrollTop ?? 0;
  const activeId = document.activeElement?.id;
  sheet.innerHTML = V.onboardView(state);
  setBar(onboardBarWithFirstRun());
  $$('.mw-check[data-mixed]').forEach((i) => { i.indeterminate = true; });
  if (keepScroll) { const l = $('.ob-left'); const r = $('.ob-right'); if (l) l.scrollTop = ls; if (r) r.scrollTop = rs; }
  if (activeId) $(`#${CSS.escape(activeId)}`)?.focus({ preventScroll: true });
  else if (state.ob.step === 'blank') $('#ob-name')?.focus({ preventScroll: true });
}
async function stepTo(step) {
  if (isStill()) { obStep(step); return; }
  const sheet = $('#stage');
  const out = sheet.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateX(-10px)' }], { duration: 140, easing: 'ease-in', fill: 'forwards' });
  await out.finished.catch(() => {});
  out.cancel();
  obStep(step);
  sheet.animate([{ opacity: 0, transform: 'translateX(14px)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: EASE });
  arriveSplit();
}
function addGroup(g) {
  const ob = state.ob;
  const i = ob.groups.findIndex((x) => x.key === g.key);
  g.id = `${g.key.replace(/[^a-z0-9]/gi, '-')}-${++uid}`;
  if (i >= 0) ob.groups.splice(i, 1, g); else ob.groups.push(g);
}
function addFolder(k) {
  const f = FOLDERS[k]; const ob = state.ob;
  const range = { 7: '最近 7 天', 30: '最近 30 天', 90: '最近 90 天', all: '全部时间' }[ob.range];
  const files = ob.range === '7' ? f.files.slice(0, Math.max(1, Math.ceil(f.files.length / 2))) : f.files;
  addGroup({ key: `folder:${k}`, src: 'folder', label: `文件夹 · ${f.label}`, scope: `${f.path} · ${range}${ob.sub ? ' · 含子目录' : ''}`, auth: '已授权', skipped: f.skipped + (f.files.length - files.length), items: files.map(([name, size]) => ({ id: mid(), name, size })) });
}
function addFiles(list, src = 'files') {
  const key = src === 'chat' ? 'chat' : 'files';
  const prev = state.ob.groups.find((g) => g.key === key);
  const items = [...(prev?.items || []), ...list.map(([name, size]) => ({ id: mid(), name, size }))];
  addGroup(src === 'chat' ? { key, src: 'chat', label: '聊天记录', scope: '导出的文本记录', auth: '', items } : { key, src: 'files', label: '单独选的文件', scope: '系统选择器选中的文件', auth: '', items });
}
function seedMaterials() {
  const ob = state.ob;
  ob.groups = []; ob.folderPick = 'docs'; ob.range = '30';
  addFolder('docs');
  addFiles(SAMPLE_FILES);
  addGroup({ key: 'web', src: 'web', label: '网页正文', scope: 'readwise.io · 粘贴的正文', auth: '', items: [{ id: mid(), name: '网页正文 · 1,240 字.txt', size: 3.6e3 }] });
  addFiles([SAMPLE_CHAT], 'chat');
}

/* 整理：只是模拟进度，不读取任何文件，也不调用模型 */
function startOrganize(reset) {
  const ob = state.ob;
  clearTimeout(ob.timer);
  if (reset) { ob.read = 0; ob.phase = 0; ob.finished = false; }
  ob.running = true;
  const total = V.chosen(ob).length;
  if (motion.still) { ob.read = Math.ceil(total * 0.64); ob.running = false; return; }
  const tick = () => {
    if (!ob.running) return;
    if (ob.phase === 0) { ob.read = Math.min(total, ob.read + 1); if (ob.read >= total) ob.phase = ob.model ? 1 : 3; }
    else if (ob.phase === 1) ob.phase = 2;
    else ob.phase = 3;
    if (ob.phase === 3) { finishOrganize(); return; }
    refreshOrganize();
    ob.timer = setTimeout(tick, ob.phase === 0 ? 260 : 1300);
  };
  ob.timer = setTimeout(tick, reset ? 600 : 260);
}
function stopOrganize() { clearTimeout(state.ob.timer); state.ob.running = false; }
function refreshOrganize() {
  updateBgTask();
  if (state.screen !== 'onboard' || state.ob.step !== 'organize') return;
  const ob = state.ob; const total = V.chosen(ob).length;
  const phases = $('.ob-phases'); if (phases) phases.outerHTML = V.phaseList(ob);
  const stageHead = $('.ob-right .ob-stage-head span'); if (stageHead) stageHead.innerHTML = `<b id="org-read">${Math.min(ob.read, total)}</b> / ${total} 份`;
  const bar = $('.ob-right .mw-progress > span'); if (bar) bar.style.width = `${(Math.min(ob.read, total) / total) * 100}%`;
  const cur = $('#org-file'); if (cur) cur.textContent = V.currentFile(ob);
  const list = $('.ob-right .is-receipts'); if (list) list.outerHTML = (() => { const t = document.createElement('div'); t.innerHTML = V.onboardView(state); return $('.is-receipts', t).outerHTML; })();
  setBar(onboardBarWithFirstRun());
}
function finishOrganize() {
  const ob = state.ob;
  ob.running = false; ob.finished = true;
  ob.name = ob.name || (ob.model ? RESULT.name : '');
  ob.summary = ob.summary || (ob.model ? RESULT.summary : '');
  ob.todos = ob.todos || RESULT.todos.map((t) => ({ ...t }));
  if (ob.away) { updateBgTask(true); toast('新项目的材料整理好了，在「后台任务」里接着命名'); return; }
  stepTo('result');
}
function updateBgTask(done) {
  const ob = state.ob;
  const i = state.bg.findIndex((t) => t.id === 'bg-onboard');
  if (!ob.away) { if (i >= 0) state.bg.splice(i, 1); }
  else {
    const total = V.chosen(ob).length;
    const t = { id: 'bg-onboard', title: done || ob.finished ? '新项目 · 整理完成，等你确认' : `新项目 · 正在整理 ${Math.min(ob.read, total)} / ${total}`, where: '新建项目', meta: done || ob.finished ? '点开命名并开始' : '可以继续别的工作' };
    if (i >= 0) state.bg[i] = t; else state.bg.push(t);
  }
  updateBgCount();
  if (!$('#pop').hidden) openPop();
}
async function createProject() {
  const ob = state.ob; const name = ob.name.trim();
  if (!name) {
    ob.error = '给项目起个名字再开始。';
    const err = $('#ob-name-err'); if (err) { err.hidden = false; err.querySelector('span').textContent = ob.error; }
    $('#ob-name')?.focus();
    return;
  }
  ob.saving = true; setBar(onboardBarWithFirstRun());
  await new Promise((r) => setTimeout(r, motion.still ? 0 : 800));
  const id = `new-${++uid}`;
  const todos = ob.step === 'blank' ? [] : (ob.todos || []).filter((t) => t.on);
  const p = {
    id, name, opened: '刚刚', desc: ob.step === 'blank' ? '' : ob.summary.trim(), goals: [],
    next: todos.map((t) => ({ kind: t.tag[0] === 'decide' ? 'decide' : t.tag[0] === 'others' ? 'others' : 'you', t: t.t, meta: t.tag[1] })),
    recent: [{ when: '刚刚', t: ob.step === 'blank' ? '创建了空白项目' : `带入 ${V.chosen(ob).length} 份材料并创建项目` }],
    facts: { materials: ob.step === 'blank' ? 0 : V.chosen(ob).length, docs: 0, path: `~/Molis/${name}` },
  };
  V.setProjects([p, ...V.getProjects()]);
  state.bg = state.bg.filter((t) => t.id !== 'bg-onboard'); updateBgCount();
  state.ob = freshOb(); state.sel = id; state.firstRun = false;
  toast(`示意：已创建「${name}」（没有写入真实数据）`);
  await enterProject(id);
}

/* ───────── 新用户开场 ───────── */
let openingDone = false;
function playOpening() {
  openingDone = false;
  const big = $('.opening-wordmark .mw-wordmark');
  $('.arrival-titlebar .mw-wordmark').style.visibility = 'hidden';
  openingCaption?.destroy();
  openingCaption = new Caption($('.opening-caption [data-caption]'));
  wordmarkHandle = typeWordmark(big, { pace: 'ritual', delay: 400, onDone: () => { openingDone = true; $('.opening')?.classList.add('is-done'); } });
  if (!isStill()) {
    arrive($('.opening-glow'), [{ opacity: 0 }, { opacity: 1 }], { duration: 1600 });
    arrive($('.arrival-bar .bar-end'), [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: 2900 });
  }
}
function skipOpening() {
  if (openingDone) return;
  openingDone = true;
  wordmarkHandle?.skip?.();
  $('.opening')?.classList.add('is-done');
}
async function startFromOpening() {
  skipOpening();
  openingCaption?.destroy(); openingCaption = null;
  const big = $('.opening-wordmark .mw-wordmark');
  const smallBrand = $('.arrival-titlebar .arrival-brand .mw-wordmark');
  smallBrand.style.visibility = 'visible';
  smallBrand.dataset.state = 'done';
  if (!isStill() && big) {
    const a = big.getBoundingClientRect(); const b = smallBrand.getBoundingClientRect();
    const k = b.height / a.height;
    smallBrand.style.visibility = 'hidden';
    big.style.transformOrigin = '0 0';
    const flight = big.animate([{ transform: 'none' }, { transform: `translate(${b.left - a.left}px, ${b.top - a.top}px) scale(${k})` }], { duration: 640, easing: EASE, fill: 'forwards' });
    $('.opening-glow')?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 640, fill: 'forwards' });
    $('.opening-caption')?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 240, fill: 'forwards' });
    await flight.finished.catch(() => {});
    smallBrand.style.visibility = 'visible';
  }
  state.firstRun = true;
  state.welcome = { step: 'language', lang: 'zh' };
  setScreen('welcome');
  renderScreen({ animate: true });
}

/* ───────── 事件 ───────── */
app.addEventListener('click', async (ev) => {
  const t = ev.target.closest('[data-act]');
  if (!ev.target.closest('#pop, #bg-btn')) closePop();
  if (state.screen === 'opening' && !t) { skipOpening(); return; }
  if (!t || t.disabled || t.getAttribute('aria-disabled') === 'true') return;
  const act = t.dataset.act; const ob = state.ob;
  switch (act) {
    case 'pick': pick(t.dataset.id); break;
    case 'enter': await enterProject(); break;
    case 'enter-item': if (state.screen === 'chooser') await enterProject(state.sel, { item: Number(t.dataset.i) }); break;
    case 'new': await openOnboarding({ firstRun: state.firstRun && !V.getProjects().length }); break;
    case 'new-blank': await openOnboarding({ blank: true }); break;
    case 'new-named': { const q = state.query.trim(); state.query = ''; await openOnboarding({ name: q }); break; }
    case 'clear-search': state.query = ''; $('#chooser-q').value = ''; refreshList(); $('#chooser-q').focus(); break;
    case 'retry-load': {
      state.loadError = false; V.setProjects(PROJECTS.slice()); state.sel = state.prevSel && V.byId(state.prevSel) ? state.prevSel : 'flyleaf';
      $('#chooser-dir').innerHTML = V.listBody(state);
      pick(state.sel === 'personal' ? 'flyleaf' : state.sel);
      $('#chooser-detail').innerHTML = V.detailFor(state); arriveBrief(0); setBar(V.chooserBar(state));
      $$('#chooser-dir .mw-dir-row').forEach((r) => { const on = r.dataset.id === state.sel; r.classList.toggle('is-selected', on); r.setAttribute('aria-selected', String(on)); r.tabIndex = on ? 0 : -1; });
      cascade($$('#chooser-dir .mw-dir-row'), { delay: 0, step: 28 });
      break;
    }
    case 'prefill': { const i = $('[data-composer-input]'); i.value = t.dataset.text; state.drafts.set(draftKey(), i.value); $('[data-composer-send]').disabled = false; i.focus(); break; }
    case 'bg': $('#pop').hidden ? openPop() : closePop(); break;
    case 'bg-task':
      closePop();
      if (t.dataset.task === 'bg-onboard') { ob.away = false; updateBgTask(); await go('onboard', () => { if (ob.finished) ob.step = 'result'; }, {}); if (ob.running) refreshOrganize(); }
      else toast('示意：会打开 Coding 开发沙盒里的这次运行');
      break;
    case 'tool': toast(`示意：会打开「${t.dataset.tool}」（原型不跳转）`); break;
    case 'toggle-theme': setTheme(document.documentElement.dataset.resolvedTheme === 'dark' ? 'light' : 'dark'); break;
    case 'ws-back': await go('chooser', () => { state.sel = state.ws; state.cold = false; }, { dir: 'back' }); break;
    case 'opening-start': await startFromOpening(); break;
    case 'lang': state.welcome.lang = t.dataset.lang; renderScreen(); break;
    case 'later': state.firstRun = true; await go('chooser', () => { V.setProjects([]); state.sel = 'personal'; state.cold = false; }, {}); break;
    case 'welcome-prev': await go('welcome', () => { state.welcome.step = 'language'; }, { dir: 'back' }); break;
    case 'welcome-next':
      if (state.welcome.step === 'language') await go('welcome', () => { state.welcome.step = 'appearance'; }, {});
      else { state.firstRun = true; await go('onboard', () => { state.ob = freshOb(); }, {}); }
      break;
    case 'ob-back':
      if (ob.running) { ob.away = true; updateBgTask(); }
      if (state.firstRun && !V.getProjects().length) { await go('chooser', () => { state.sel = 'personal'; state.cold = false; }, { dir: 'back' }); }
      else await go('chooser', () => { state.sel = state.lastSel; state.cold = false; }, { dir: 'back' });
      break;
    case 'ob-open': {
      const id = t.dataset.src;
      if (ob.step !== 'sources') { ob.step = 'sources'; }
      ob.open = ob.open === id ? null : id;
      renderOnboard();
      if (ob.open) { const cfg = $('.ob-source__cfg'); arrive(cfg, [{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], { duration: 250 }); $('#cfg-web')?.focus({ preventScroll: true }); }
      break;
    }
    case 'ob-pick': ob.folderPick = t.dataset.folder; renderOnboard(); break;
    case 'ob-range': ob.range = t.dataset.range; renderOnboard(); break;
    case 'ob-add-folder': addFolder(ob.folderPick); renderOnboard(); break;
    case 'ob-sample-files': addFiles(SAMPLE_FILES); renderOnboard(); break;
    case 'ob-sample-chat': addFiles([SAMPLE_CHAT], 'chat'); renderOnboard(); break;
    case 'ob-sample-web': ob.web = SAMPLE_WEB.text; ob.url = SAMPLE_WEB.url; renderOnboard(); break;
    case 'ob-add-web': {
      if (!ob.web.trim()) break;
      let host = ''; try { host = new URL(ob.url).host; } catch { /* 网址可选 */ }
      const prev = ob.groups.find((g) => g.key === 'web');
      addGroup({ key: 'web', src: 'web', label: '网页正文', scope: `${host ? `${host} · ` : ''}粘贴的正文`, auth: '', items: [...(prev?.items || []), { id: mid(), name: `网页正文 · ${ob.web.trim().length.toLocaleString()} 字.txt`, size: new Blob([ob.web]).size }] });
      ob.web = ''; ob.url = ''; renderOnboard();
      break;
    }
    case 'ob-remove': ob.groups.forEach((g) => { g.items = g.items.filter((m) => m.id !== t.dataset.mid); }); ob.groups = ob.groups.filter((g) => g.items.length); renderOnboard(); break;
    case 'ob-remove-group': ob.groups = ob.groups.filter((g) => g.id !== t.dataset.group); renderOnboard(); break;
    case 'ob-blank': await stepTo('blank'); break;
    case 'ob-to-sources': await stepTo('sources'); break;
    case 'ob-scope': await stepTo('scope'); break;
    case 'ob-prev': await stepTo('sources'); break;
    case 'ob-model': ob.model = !ob.model; renderOnboard(); break;
    case 'ob-start': await stepTo('organize'); break;
    case 'ob-away': ob.away = true; updateBgTask(); toast('整理会在后台继续，完成后在「后台任务」里接着命名'); await go('chooser', () => { state.sel = state.lastSel; state.cold = false; }, { dir: 'back' }); break;
    case 'ob-adjust': ob.finished = false; ob.todos = null; await stepTo('scope'); break;
    case 'ob-create': await createProject(); break;
    case 'ob-restart': state.ob = freshOb(); renderOnboard(); break;
    case 'ob-personal': state.ob = freshOb(); await go('chooser', () => { state.sel = 'personal'; state.cold = false; }, { dir: 'back' }); break;
    default: break;
  }
});
app.addEventListener('dblclick', async (ev) => {
  const row = ev.target.closest('#chooser-dir .mw-dir-row');
  if (row) { pick(row.dataset.id); await enterProject(row.dataset.id); }
});
app.addEventListener('input', (ev) => {
  const t = ev.target; const ob = state.ob;
  if (t.id === 'chooser-q') { state.query = t.value; refreshList(); return; }
  if (t.dataset?.field === 'web') { ob.web = t.value; const b = $('#cfg-web-add'); if (b) b.disabled = !t.value.trim(); return; }
  if (t.dataset?.field === 'url') { ob.url = t.value; return; }
  if (t.dataset?.field === 'summary') { ob.summary = t.value; return; }
  if (t.id === 'ob-name') {
    ob.name = t.value;
    if (ob.error && t.value.trim()) { ob.error = ''; $('#ob-name-err').hidden = true; }
    setBar(onboardBarWithFirstRun());
    const prev = $('.ob-preview .brief-title'); if (prev) prev.textContent = t.value.trim() || '新项目';
  }
});
app.addEventListener('change', (ev) => {
  const t = ev.target; const ob = state.ob;
  if (t.id === 'cfg-sub') { ob.sub = t.checked; return; }
  if (t.dataset?.fileInput) {
    const list = [...t.files].map((f) => [f.name, f.size]);
    if (list.length) { addFiles(list, t.dataset.fileInput === 'chat' ? 'chat' : 'files'); renderOnboard(); }
    return;
  }
  if (t.dataset?.scopeItem) { if (t.checked) ob.off.delete(t.dataset.scopeItem); else ob.off.add(t.dataset.scopeItem); renderOnboard(); return; }
  if (t.dataset?.scopeGroup) { const g = ob.groups.find((x) => x.id === t.dataset.scopeGroup); g.items.forEach((m) => (t.checked ? ob.off.delete(m.id) : ob.off.add(m.id))); renderOnboard(); return; }
  if (t.dataset?.todo != null) { ob.todos[Number(t.dataset.todo)].on = t.checked; renderOnboard(); }
});
app.addEventListener('keydown', async (ev) => {
  const t = ev.target;
  if (state.screen === 'opening' && ev.key !== 'Tab') {
    ev.preventDefault();
    if (ev.key === 'Enter' && openingDone) await startFromOpening(); else skipOpening();
    return;
  }
  if (t.id === 'chooser-q') {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); $(`#row-${CSS.escape(state.sel ?? '')}`)?.focus(); }
    else if (ev.key === 'Enter') { ev.preventDefault(); await enterProject(); }
    else if (ev.key === 'Escape' && t.value) { ev.preventDefault(); t.value = ''; state.query = ''; refreshList(); }
    return;
  }
  if (t.matches?.('#chooser-dir .mw-dir-row')) {
    const rows = $$('#chooser-dir .mw-dir-row'); const i = rows.indexOf(t);
    let n = -1;
    if (ev.key === 'ArrowDown') n = Math.min(rows.length - 1, i + 1);
    else if (ev.key === 'ArrowUp') n = Math.max(0, i - 1);
    else if (ev.key === 'Home') n = 0;
    else if (ev.key === 'End') n = rows.length - 1;
    else if (ev.key === 'Enter') { ev.preventDefault(); await enterProject(t.dataset.id); return; }
    if (n >= 0) { ev.preventDefault(); pick(rows[n].dataset.id, { focus: true }); }
    return;
  }
  if (t.id === 'ob-name' && ev.key === 'Enter') { ev.preventDefault(); await createProject(); }
});
document.addEventListener('keydown', async (ev) => {
  if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'k' && state.screen === 'chooser') { ev.preventDefault(); const q = $('#chooser-q'); q?.focus(); q?.select(); return; }
  if (ev.key === 'Escape') closePop();
  const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
  if (ev.key === 'Enter' && !typing && !ev.defaultPrevented && !document.activeElement?.closest?.('button, a, [role="option"], summary')) {
    if (state.screen === 'welcome') { ev.preventDefault(); $('[data-act="welcome-next"]')?.click(); }
    else if (state.screen === 'chooser') { ev.preventDefault(); await enterProject(); }
  }
});

/* ───────── 审阅条（不是产品界面）与预设状态 ───────── */
const PRESETS = [
  ['opening', '开场 · 新用户'], ['chooser', '项目选择 · FlyLeaf'], ['chooser.feed', '项目选择 · 长项目名'], ['chooser.demo', '项目选择 · 目标全部完成'],
  ['chooser.football', '项目选择 · 没有目标'], ['chooser.ceshi', '项目选择 · 没有描述也没有目标'], ['chooser.personal', '项目选择 · 个人空间'],
  ['chooser.search', '项目选择 · 搜索 GoalBoard'], ['chooser.none', '项目选择 · 搜索无结果'], ['chooser.fresh', '项目选择 · 还没有项目'], ['chooser.failed', '项目选择 · 列表读取失败'],
  ['welcome', 'Welcome · 语言'], ['welcome.appearance', 'Welcome · 外观'],
  ['sources', '新建 · 还没有材料'], ['sources.filled', '新建 · 已添加材料'], ['sources.web', '新建 · 粘贴网页正文'], ['scope', '新建 · 确认范围'],
  ['scope.nomodel', '新建 · 未连接模型'], ['organize', '新建 · 整理中'], ['result', '新建 · 命名并开始'], ['blank', '新建 · 空白开始'], ['workspace', '进入项目之后（示意）'],
];
let currentPreset = 'chooser';
function reviewBar() {
  const r = $('#review');
  r.innerHTML = `<p class="review-badge"><b>设计原型</b><span>示例数据，未接入真实项目</span></p>
    <label class="review-field"><span>状态</span><select id="review-state">${PRESETS.map(([id, l]) => `<option value="${id}">${esc(l)}</option>`).join('')}</select></label>
    <span class="review-spacer"></span>
    <button type="button" class="review-btn" id="review-replay">重播进入</button>
    <button type="button" class="review-btn" id="review-theme" aria-pressed="false">深色</button>
    <button type="button" class="review-btn" id="review-motion" aria-pressed="false">暂停动效</button>
    <button type="button" class="review-btn" id="review-hide" aria-label="收起审阅条">收起</button>`;
  $('#review-state').value = currentPreset;
}
function bindReview() {
  $('#review').addEventListener('change', (ev) => { if (ev.target.id === 'review-state') { currentPreset = ev.target.value; applyPreset(currentPreset, { animate: true }); } });
  $('#review').addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.id === 'review-replay') applyPreset(currentPreset, { animate: true, cold: true });
    if (b.id === 'review-theme') { const dark = document.documentElement.dataset.resolvedTheme !== 'dark'; setTheme(dark ? 'dark' : 'light'); b.textContent = dark ? '浅色' : '深色'; b.setAttribute('aria-pressed', String(dark)); }
    if (b.id === 'review-motion') { motion.paused = !motion.paused; app.classList.toggle('is-paused', motion.paused); b.textContent = motion.paused ? '播放动效' : '暂停动效'; b.setAttribute('aria-pressed', String(motion.paused)); caption?.sync(); }
    if (b.id === 'review-hide') { document.body.classList.add('review-hidden'); $('#review-show').hidden = false; }
  });
  $('#review-show').addEventListener('click', () => { document.body.classList.remove('review-hidden'); $('#review-show').hidden = true; });
}

function applyPreset(id, { animate = false, cold = true } = {}) {
  stopOrganize();
  V.setProjects(PROJECTS.slice());
  state.loadError = false; state.prevSel = null;
  state.query = ''; state.sel = 'flyleaf'; state.ob = freshOb(); state.firstRun = false; state.welcome = { step: 'language', lang: 'zh' };
  state.cold = cold; state.lastSel = 'flyleaf'; state.ws = 'flyleaf';
  state.bg = BACKGROUND_TASKS.slice(); updateBgCount();
  const [name, flag] = id.split('.');
  let screen = 'chooser';
  const ob = state.ob;
  switch (name) {
    case 'opening': screen = 'opening'; V.setProjects([]); state.firstRun = true; break;
    case 'chooser':
      if (flag === 'feed') state.sel = 'feed';
      if (flag === 'demo') state.sel = 'demo';
      if (flag === 'football') state.sel = 'football';
      if (flag === 'ceshi') state.sel = 'ceshi';
      if (flag === 'personal') state.sel = 'personal';
      if (flag === 'search') { state.query = 'GoalBoard'; state.sel = V.visibleEntries(state)[0].id; }
      if (flag === 'none') { state.query = 'roadmap'; state.sel = null; }
      if (flag === 'fresh') { V.setProjects([]); state.sel = 'personal'; state.firstRun = true; }
      if (flag === 'failed') { V.setProjects([]); state.sel = 'personal'; state.loadError = true; }
      break;
    case 'welcome': screen = 'welcome'; state.firstRun = true; V.setProjects([]); if (flag === 'appearance') state.welcome.step = 'appearance'; break;
    case 'sources': screen = 'onboard'; if (flag === 'filled') { seedMaterials(); ob.open = 'folder'; } if (flag === 'web') { seedMaterials(); ob.open = 'web'; ob.web = SAMPLE_WEB.text; ob.url = SAMPLE_WEB.url; } break;
    case 'scope': screen = 'onboard'; seedMaterials(); ob.step = 'scope'; ob.off.add(ob.groups[0].items[6].id); if (flag === 'nomodel') ob.model = false; break;
    case 'organize': screen = 'onboard'; seedMaterials(); ob.step = 'organize'; ob.read = 8; ob.phase = 0; break;
    case 'result': screen = 'onboard'; seedMaterials(); ob.step = 'result'; ob.finished = true; ob.name = RESULT.name; ob.summary = RESULT.summary; ob.todos = RESULT.todos.map((t) => ({ ...t })); break;
    case 'blank': screen = 'onboard'; ob.step = 'blank'; break;
    case 'workspace': screen = 'workspace'; break;
    default: break;
  }
  setScreen(screen);
  barCache = {};
  renderScreen({ animate });
  if (screen === 'opening') playOpening();
  else {
    // 老用户的轻开场：字标在标题栏里打一次，字幕随后开始；不打开页面就不播。
    const wm = $('.arrival-titlebar .mw-wordmark');
    wm.style.visibility = 'visible';
    if (animate && cold && screen === 'chooser') typeWordmark(wm, { pace: 'quick', delay: 250 });
    else settleWordmark(wm);
  }
  if (screen === 'onboard' && ob.step === 'organize') startOrganize(false);
  if (screen === 'chooser') caption?.refresh();
  if (screen === 'opening') openingCaption?.refresh();
  $('#review-state') && ($('#review-state').value = id);
}

/* ───────── 启动 ───────── */
function parseHash() {
  const tokens = location.hash.replace(/^#/, '').split('&').filter(Boolean);
  let preset = 'chooser';
  for (const tkn of tokens) {
    if (tkn === 'capture') document.body.classList.add('capture');
    else if (tkn === 'still') { motion.still = true; document.documentElement.dataset.still = ''; }
    else if (tkn === 'dark') setTheme('dark');
    else if (tkn === 'light') setTheme('light');
    else if (PRESETS.some(([id]) => id === tkn)) preset = tkn;
  }
  return preset;
}
function boot() {
  state.theme = readTheme();
  mountFrame();
  currentPreset = parseHash();
  reviewBar();
  bindReview();
  const darkNow = document.documentElement.dataset.resolvedTheme === 'dark';
  const tb = $('#review-theme'); if (tb) { tb.textContent = darkNow ? '浅色' : '深色'; tb.setAttribute('aria-pressed', String(darkNow)); }
  applyPreset(currentPreset, { animate: true, cold: true });
  window.addEventListener('hashchange', () => { currentPreset = parseHash(); $('#review-state').value = currentPreset; applyPreset(currentPreset, { animate: true }); });
  window.__arrival = { state, applyPreset, pick, V };
}
boot();
