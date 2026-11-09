/**
 * The way in for a new person and for a new project, in the browser (specs/archive/project-arrival-flow): the opening, two
 * Welcome questions, and the journey that turns existing materials into a project — sources, scope, reading, naming.
 * Account authorization is performed by the provider, never simulated here. The journey is the Host's (the
 * `/api/onboarding/context` ids and phases are unchanged); this program only draws it, in the arrival frame: the
 * stage is `#cx-app`, the bar's three blocks belong to the step in view.
 */
export const CONTEXT_ONBOARDING_CLIENT = String.raw`
(() => {
  const arrival = window.molisArrival;
  const frame = document.querySelector('.arrival'), app = document.getElementById('cx-app'), dialog = document.getElementById('cx-dialog'), bar = document.querySelector('.arrival-bar');
  if (!frame || !app || !dialog || !bar || !arrival) return;
  const readText = globalThis.t.text, esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const glyph = name => '<svg aria-hidden="true"><use href="#icon-' + name + '"></use></svg>';
  const desktop = document.body.dataset.nativeDesktop === 'true';
  const native = Boolean(globalThis.__TAURI__?.core?.invoke);
  const firstRun = document.body.dataset.onboardingMode === 'first_run';
  const directories = ['downloads','documents','desktop','custom'];
  const kinds = [...(native?directories:['directory']),'files','browser','gmail','chat'];
  const names = {downloads:"workbench.context-onboarding.downloads",documents:"workbench.context-onboarding.documents",desktop:"workbench.context-onboarding.desktop",custom:"workbench.context-onboarding.another-folder",files:"workbench.context-onboarding.pick-files",directory:"workbench.context-onboarding.folder-materials",browser:"workbench.context-onboarding.browser-content",gmail:'Gmail',chat:"workbench.context-onboarding.chat-history"};
  const sourceIcons = {downloads:'folder',documents:'folder',desktop:'folder',custom:'folder',files:'file',directory:'folder',browser:'globe',gmail:'mail',chat:'message'};
  const grants = {}, uploads = new Map();
  let preparing = '', readingLocal = '', uploading = null, counting = null, reviewFiles = false, folded = new Set();
  const invoke = (command,args) => globalThis.__TAURI__.core.invoke(command,args);
  const directory = s => directories.includes(s.kind);
  const size = bytes => bytes < 1000 ? Math.max(1, Math.round(bytes)) + ' B' : bytes < 1000000 ? Math.max(1, Math.round(bytes/1000)) + ' KB' : bytes < 1e9 ? (bytes/1000000).toFixed(1) + ' MB' : (bytes/1e9).toFixed(1) + ' GB';
  const amount = bytes => bytes ? size(bytes) : '0 B';
  // How long the rest of a phase may take, from the calls it has made: said once one has finished, never guessed before.
  const remaining = (left, timing) => { if (!timing?.calls) return globalThis.t.text("workbench.context-onboarding.estimating-time-left"); const minutes = Math.ceil(left * timing.ms / timing.calls / 60000); return minutes <= 1 ? globalThis.t.text("workbench.context-onboarding.under-minute-left") : minutes < 60 ? globalThis.t.text("workbench.context-onboarding.about-n-min-left", {n:minutes}) : globalThis.t.text("workbench.context-onboarding.about-h-h-m-min-left", {h:Math.floor(minutes / 60), m:minutes % 60}); };
  const included = s => (s.metadata?.files||[]).filter(f=>!(s.excluded||[]).some(p=>f.path===p||f.path.startsWith(p+'/')));
  const route = path => desktop && !/[?&]desktop=1(&|$)/.test(path) ? path + (path.includes('?') ? '&' : '?') + 'desktop=1' : path;
  let config = {}, journey = null, expanded = null, busy = false, error = '', blank = false, materialsOnly = false, editing = false, timer = 0, inputTimer = 0, authTimer = 0, opener = null;
  let blankName = '', goingBack = false;
  let saveQueue = Promise.resolve();
  const api = (path, body) => molisWorkRequest(path, {body, fallback:globalThis.t.text("workbench.context-onboarding.request-failed-try-again")});
  const failureText = value => typeof value==='string' ? value : molisWorkRequest.text(value);
  const keepFailure = err => err && typeof err==='object' && 'callId' in err ? err : String(err?.message||err);
  const endpoint = suffix => '/api/onboarding/context/' + journey.id + (suffix ? '/' + suffix : '');
  const source = kind => journey.sources.find(s => s.kind === kind);
  const connected = () => (config.connections || []).filter(c => c.state === 'connected');
  const picked = () => journey.sources.filter(s => s.selected);
  const ready = s => s.references?.length ? true : directory(s) ? native && grants[s.kind]?.state==='ready' : s.kind==='gmail' ? Boolean(s.connection_id && connected().some(c=>c.connection_id===s.connection_id)) : s.kind==='browser' ? Boolean(s.text?.trim()) : Boolean(s.files?.length||uploads.has(s.kind));
  const readable = () => picked().filter(ready);
  const sourceStatus = s => s.references?.length ? '已暂存' : directory(s) ? (grants[s.kind]?.state==='ready'?'已授权':grants[s.kind]?.state==='unavailable'?'需要重新授权':'待授权') : ready(s)?'已添加':s.kind==='gmail'?(config.gmail_configured?'待连接':'暂不可连接'):'待添加';
  const startLabel = () => busy ? (counting && !counting.saving ? globalThis.t.text("workbench.context-onboarding.counting-done-total", counting) : preparing?'正在准备…':uploading?globalThis.t.text("workbench.context-onboarding.uploading-k-n", uploading):readingLocal?'正在读取…':'正在保存…') : '确认范围';

  /* ───────── Markup: the design system's parts, drawn in the browser (same classes as primitives/*.ts) ───────── */
  const attrs = map => Object.keys(map || {}).filter(k => map[k] !== undefined && map[k] !== null && map[k] !== false).map(k => map[k] === true ? ' ' + k : ' ' + k + '="' + esc(map[k]) + '"').join('');
  // md is the default height, left to the button so it follows the person's density.
  const btn = o => '<button type="' + (o.type || 'button') + '" class="mw-btn mw-btn--' + (o.variant || 'secondary') + (o.size && o.size !== 'md' ? ' mw-btn--' + o.size : '') + (o.cls ? ' ' + o.cls : '') + '" data-slot="button"' + (o.disabled ? ' disabled' : '') + attrs(o.attrs) + '>' + (o.icon ? glyph(o.icon) : '') + '<span data-slot="button-label">' + esc(o.label) + '</span>' + (o.key ? '<kbd class="mw-btn__key" aria-hidden="true">' + esc(o.key) + '</kbd>' : '') + '</button>';
  const choice = o => '<button type="button" class="mw-choice" data-slot="choice" aria-pressed="' + (o.selected ? 'true' : 'false') + '"' + attrs(o.attrs) + '><span class="mw-choice__label">' + (o.icon ? glyph(o.icon) : '') + esc(o.label) + (o.note ? '<small>' + esc(o.note) + '</small>' : '') + '</span><span class="mw-choice__check" aria-hidden="true">' + glyph('check') + '</span></button>';
  const status = (label, tone, icon, state) => '<span class="mw-status mw-status--' + tone + ' mw-status--plain" data-slot="status"' + (state ? ' data-mw-state="' + state + '"' : '') + '>' + (!state && icon ? glyph(icon) : '') + '<span>' + esc(label) + '</span></span>';
  const steps = (total, current) => '<ol class="mw-steps" data-slot="steps" aria-label="' + esc(globalThis.t.text("workbench.context-onboarding.onboarding-progress")) + '">' + Array.from({length: total}, (_, i) => '<li' + (i === current ? ' aria-current="step"' : '') + (i < current ? ' class="is-done"' : '') + '><span></span></li>').join('') + '</ol>';
  const barStatus = o => '<div class="mw-bar-status" data-slot="bar-status" role="status" aria-live="polite"><span class="mw-bar-status__tile" aria-hidden="true">' + (o.spin ? '<span class="mw-spinner" data-slot="spinner" aria-hidden="true"></span>' : glyph(o.glyph || 'info')) + '</span><span class="mw-bar-status__text"><strong>' + esc(o.title) + '</strong>' + (o.caption ? '<small>' + esc(o.caption) + '</small>' : '') + '</span></div>';
  const dirRow = o => '<button type="button" class="mw-dir-row mw-dir-row--meta directory-list-row' + (o.selected ? ' is-selected' : '') + (o.cls ? ' ' + o.cls : '') + '" data-slot="directory-row" title="' + esc(o.title) + '"' + attrs(o.attrs) + '><span class="mw-dir-row__icon">' + glyph(o.icon) + '</span><span class="mw-dir-row__copy"><span class="mw-dir-row__headline"><strong>' + esc(o.title) + '</strong>' + (o.count === undefined ? '' : '<span class="mw-dir-row__count">' + esc(o.count) + '</span>') + '</span><small>' + esc(o.caption) + '</small></span>' + (o.end || '') + '</button>';
  const note = (text, icon, cls) => '<p class="ob-note' + (cls ? ' ' + cls : '') + '">' + glyph(icon || 'shield') + '<span>' + esc(text) + '</span></p>';
  const kindChip = name => { const dot = name.lastIndexOf('.'); const ext = (dot > 0 ? name.slice(dot + 1) : 'txt').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 4) || 'txt'; return '<span class="mw-file-kind mw-file-kind--' + ext + '" data-slot="file-kind">' + ext.toUpperCase() + '</span>'; };
  const fileRow = o => '<li class="mw-file-row' + (o.cls ? ' ' + o.cls : '') + '" data-slot="file-row">' + (o.check ? '<label class="mw-file-row__label"><input class="mw-check" type="checkbox"' + (o.check.checked ? ' checked' : '') + attrs(o.check.attrs) + '>' + (o.chip || kindChip(o.name)) + '<span class="mw-file-row__name">' + esc(o.name) + '</span></label>' : '<span class="mw-file-row__label">' + (o.chip || kindChip(o.name)) + '<span class="mw-file-row__name">' + esc(o.name) + '</span></span>') + (o.size ? '<span class="mw-file-row__size" title="' + esc(o.size) + '">' + esc(o.size) + '</span>' : '') + (o.state || '') + (o.remove ? '<button type="button" class="mw-btn mw-btn--ghost mw-btn--icon-only mw-btn--sm mw-file-row__x" data-slot="button" aria-label="' + esc(o.remove.label) + '" title="' + esc(o.remove.label) + '"' + attrs(o.remove.attrs) + '>' + glyph('x') + '</button>' : '') + '</li>';
  // Time range and refresh stay outside the checkbox label: a button inside the label is the checkbox, so it neither changes the range nor folds the list.
  const fileGroup = o => {
    const pick = (o.check ? '<input class="mw-check" type="checkbox"' + (o.check.checked ? ' checked' : '') + (o.check.mixed ? ' data-mixed' : '') + attrs(o.check.attrs) + '>' : '') + '<span class="mw-file-group__ic">' + glyph(o.icon) + '</span><span class="mw-file-group__text"><strong style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(o.title) + '</strong>' + (o.caption ? '<small>' + esc(o.caption) + '</small>' : '') + '</span>' + (o.count ? '<span class="mw-file-group__count">' + esc(o.count) + '</span>' : '') + (o.status || '');
    const id = o.attrs && o.attrs['data-group'], open = !id || !folded.has(id);
    const fold = id && (o.rows.length || o.note) ? '<button type="button" class="mw-btn mw-btn--ghost mw-btn--icon-only mw-btn--sm" data-fold="' + esc(id) + '" aria-expanded="' + (open ? 'true' : 'false') + '" aria-label="' + esc(globalThis.t.text(open ? "workbench.context-onboarding.collapse-group" : "workbench.context-onboarding.expand-group")) + '" style="flex:none">' + glyph(open ? 'chevron-down' : 'chevron-right') + '</button>' : '';
    const remove = o.remove ? '<button type="button" class="mw-btn mw-btn--ghost mw-btn--icon-only mw-btn--sm mw-file-group__x" data-slot="button" aria-label="' + esc(o.remove.label) + '" title="' + esc(o.remove.label) + '"' + attrs(o.remove.attrs) + ' style="flex:none">' + glyph('x') + '</button>' : '';
    const identity = (o.check ? '<label class="mw-file-group__pick" style="display:flex;align-items:center;gap:12px;flex:1;min-width:0;cursor:pointer">' + pick + '</label>' : '<span class="mw-file-group__pick" style="display:flex;align-items:center;gap:12px;flex:1;min-width:0">' + pick + '</span>');
    const tools = o.tools ? '<div style="display:flex;align-items:center;justify-content:flex-end;gap:8px">' + o.tools + '</div>' : '';
    return '<section class="mw-file-group" data-slot="file-group"' + attrs(o.attrs) + '><div class="mw-file-group__head" style="display:flex;flex-direction:column;align-items:stretch;gap:8px"><div style="display:flex;align-items:center;gap:12px;min-width:0">' + identity + fold + remove + '</div>' + tools + '</div>' + (open ? '<ul class="mw-file-list">' + o.rows.join('') + '</ul>' + (o.note ? '<p class="mw-file-group__note">' + esc(o.note) + '</p>' : '') : '') + '</section>';
  };
  const empty = o => '<div class="mw-empty" data-slot="empty"><span class="mw-empty__mark">' + glyph(o.icon) + '</span><h2>' + esc(o.title) + '</h2><p>' + esc(o.body) + '</p>' + (o.action || '') + '</div>';
  const collapsible = (summary, body) => '<details class="mw-collapsible" data-slot="collapsible"><summary>' + esc(summary) + '</summary><div class="mw-collapsible__body">' + body + '</div></details>';
  const progressBar = (value, max, label) => '<div class="mw-progress" data-slot="progress" role="progressbar" aria-valuemin="0" aria-valuemax="' + max + '" aria-valuenow="' + Math.min(value, max) + '" aria-label="' + esc(label) + '"><span style="width:' + (max ? Math.min(100, value / max * 100) : 0) + '%"></span></div>';
  const meter = (value, max, label, text) => '<div class="ob-upload">' + progressBar(value, max, label) + '<small>' + esc(text) + '</small></div>';
  const toggles = (label, items) => '<div class="mw-toggle-group" data-slot="toggle-group" role="group" aria-label="' + esc(label) + '">' + items.map(i => '<button type="button" class="mw-toggle' + (i.current ? ' is-current' : '') + '" aria-pressed="' + (i.current ? 'true' : 'false') + '"' + attrs(i.attrs) + '>' + esc(i.label) + '</button>').join('') + '</div>';
  const title = text => '<h1 id="ob-title" tabindex="-1">' + text + '</h1>';
  const question = (text, sub) => '<header class="ob-q">' + title(esc(text)) + (sub ? '<p>' + esc(sub) + '</p>' : '') + '</header>';
  const errorLine = text => '<p class="cx-error" role="alert">' + esc(failureText(text || '')) + '</p>';
  // Every step of the journey is a Welcome step: the question on the left, what it makes on the right.
  const split = (view, left, right, cls) => '<div class="stage-single"><div class="stage-sheet welcome onboard" data-ob-view="' + view + '"><section class="welcome-q ob-left" data-scroll>' + left + '</section><div class="welcome-scene"><section class="ob-right' + (cls ? ' ' + cls : '') + '" data-scroll>' + right + '</section></div></div></div>';
  const stageHead = (heading, meta) => '<header class="ob-stage-head"><h2>' + esc(heading) + '</h2><span>' + meta + '</span></header>';

  /* ───────── Where in the journey ───────── */
  const introKey = 'molis-work:onboarding-intro';
  const readIntro = () => { try { return localStorage.getItem(introKey); } catch { return null; } };
  let introStep = null;
  if (firstRun && readIntro() !== 'done') { let saved = null; try { saved = sessionStorage.getItem(introKey); } catch {} introStep = saved === 'appearance' ? 'appearance' : saved === 'language' ? 'language' : 'opening'; }
  const setIntro = next => { introStep = next; try { if (next) sessionStorage.setItem(introKey, next); else { sessionStorage.removeItem(introKey); localStorage.setItem(introKey, 'done'); } } catch {} };
  const stepLabels = () => firstRun ? ['语言','外观','来源','确认','模型','整理','开始'] : ['来源','确认','模型','整理','开始'];
  const stepIndex = step => stepLabels().indexOf(step);
  const stepsBar = step => steps(stepLabels().length, stepIndex(step));
  const exitButton = () => firstRun ? btn({variant:'ghost', size:'lg', label:globalThis.t.text("workbench.context-onboarding.not-now"), cls:'arrival-back', attrs:{id:'cx-exit'}}) : btn({variant:'ghost', size:'lg', icon:'back', label:globalThis.t.text("workbench.context-onboarding.return-project"), cls:'arrival-back', attrs:{id:'cx-exit', 'aria-label':globalThis.t.text("workbench.context-onboarding.return-project")}});
  const primary = (label, action, o) => btn({variant:'primary', size:'lg', label:globalThis.t.text(label), key:'↵', cls:'ob-continue', disabled:o?.disabled, attrs:{'data-action':action, 'aria-keyshortcuts':'Enter', ...(o?.attrs||{})}});
  // A phone hides the label of a button that has an icon, so it keeps its name.
  const secondary = (label, action, o) => btn({variant:'secondary', size:'lg', icon:o?.icon, label:globalThis.t.text(label), disabled:o?.disabled, attrs:{'data-action':action, ...(o?.icon ? {'aria-label':globalThis.t.text(label)} : {})}});

  /* ───────── The opening and the two Welcome questions ───────── */
  function opening() {
    return {kind:'opening', view:'opening', step:'', html:'<div class="stage-single"><div class="stage-sheet opening" data-view="opening"><div class="opening-glow" aria-hidden="true"></div><div class="opening-copy"><div class="opening-caption">' + (document.getElementById('cx-caption')?.innerHTML || '') + '</div><h1 class="ob-greeting-wordmark" id="ob-title" tabindex="-1">' + (document.getElementById('cx-wordmark')?.innerHTML || '') + '</h1></div></div></div>',
      bar:{start:exitButton(), center:'', end:primary("workbench.context-onboarding.begin",'intro-next')}};
  }
  function language() {
    const current = String(document.documentElement.lang || 'zh').toLowerCase().startsWith('en') ? 'en' : 'zh';
    const next = encodeURIComponent(location.pathname + location.search);
    const option = (value, label) => '<a class="mw-choice" data-slot="choice" data-ui-language="' + value + '" href="/locale?lang=' + value + '&next=' + next + '" lang="' + value + '" hreflang="' + value + '"' + (current === value ? ' aria-current="true"' : '') + '><span class="mw-choice__label">' + label + '</span><span class="mw-choice__check" aria-hidden="true">' + glyph('check') + '</span></a>';
    return {kind:'welcome', view:'language', step:'语言',
      html:'<div class="stage-single"><div class="stage-sheet welcome" data-view="welcome" data-step="language"><section class="welcome-q">' + title(globalThis.t.text("workbench.context-onboarding.language")) + '<p>' + globalThis.t.text("workbench.context-onboarding.start-language-know-best-can-change-settings-any") + '</p><div class="welcome-options" role="group" aria-label="' + globalThis.t.text("workbench.context-onboarding.language-2") + '">' + option('zh','简体中文') + option('en','English') + '</div></section><aside class="welcome-scene" aria-hidden="true"><div class="ob-greeting"><strong lang="' + current + '">' + (current === 'en' ? 'Hello.' : '你好。') + '</strong><span>Molis Work</span></div></aside></div></div>',
      bar:{start:exitButton() + stepsBar('语言'), center:'', end:primary("workbench.context-onboarding.continue",'intro-next')}};
  }
  const miniRow = (g, w, s) => '<div class="ob-mini-row"><i>' + glyph(g) + '</i><span><b style="width:' + w + '%"></b><s style="width:' + s + '%"></s></span></div>';
  function miniWorkbench() {
    const row = miniRow;
    return '<div class="ob-mini"><div class="ob-mini-surface"><b class="ob-mini-title"></b>' + row('target',62,40) + row('rss',48,58) + row('note',70,36) + '</div><div class="ob-mini-bar"><span class="ob-mini-dock"><i></i><i class="is-on"></i><i></i></span><span class="ob-mini-composer"><i></i><em></em></span><span class="ob-mini-avatar"></span></div></div>';
  }
  function appearance() {
    const prefs = globalThis.molisWorkPreferences, theme = prefs ? prefs.theme() : 'system', density = prefs ? prefs.density() : 'standard';
    const opt = (attr, value, label, current, g) => choice({label:globalThis.t.text(label), icon:g, selected:current === value, attrs:{[attr]:value}});
    return {kind:'welcome', view:'appearance', step:'外观',
      html:'<div class="stage-single"><div class="stage-sheet welcome" data-view="welcome" data-step="appearance"><section class="welcome-q">' + title(globalThis.t.text("workbench.context-onboarding.appearance")) + '<p>' + globalThis.t.text("workbench.context-onboarding.choose-light-dark-follow-system-changes-apply-once") + '</p><div class="welcome-options" role="group" aria-label="' + globalThis.t.text("workbench.context-onboarding.theme") + '">' + opt('data-theme-option','light',"workbench.context-onboarding.light",theme,'sun') + opt('data-theme-option','dark',"workbench.context-onboarding.dark",theme,'moon') + opt('data-theme-option','system',"workbench.context-onboarding.follow-system",theme,'system') + '</div><p class="welcome-label">' + globalThis.t.text("workbench.context-onboarding.interface-density") + '</p><div class="welcome-options" role="group" aria-label="' + globalThis.t.text("workbench.context-onboarding.interface-density") + '">' + opt('data-density-option','standard',"workbench.context-onboarding.standard",density,'rows') + opt('data-density-option','compact',"workbench.context-onboarding.compact",density,'list') + '</div></section><aside class="welcome-scene" aria-hidden="true">' + miniWorkbench() + '</aside></div></div>',
      bar:{start:btn({variant:'ghost', size:'lg', label:globalThis.t.text("workbench.context-onboarding.previous"), cls:'arrival-back', attrs:{'data-action':'intro-back'}}) + stepsBar('外观'), center:'', end:primary("workbench.context-onboarding.continue",'intro-next')}};
  }

  /* ───────── Sources: add what the project is made from ───────── */
  const sourceRows = () => [
    {id:'folder', kinds: native ? directories : ['directory'], icon:'folder', name:'文件夹资料', caption: native ? '可以同时选下载、文稿、桌面和其他文件夹' : '选择一个工作文件夹中的文本资料'},
    {id:'files', kinds:['files'], icon:'file', name:'单独选文件', caption:'PDF、Word、Markdown 和文本文件'},
    {id:'browser', kinds:['browser'], icon:'globe', name:'浏览器内容', caption:'粘贴网页正文与来源网址'},
    {id:'chat', kinds:['chat'], icon:'message', name:'聊天记录', caption:'导入飞书、Slack 等导出的文本记录'},
    {id:'gmail', kinds:['gmail'], icon:'mail', name:'Gmail', caption:''},
  ];
  const sourcesOf = row => row.kinds.map(kind => source(kind)).filter(Boolean);
  const countOf = s => s.references?.length || (s.kind === 'browser' ? (s.text?.trim() ? 1 : 0) : s.kind === 'gmail' ? (ready(s) ? 1 : 0) : (included(s).length || s.files?.length || 0));
  const rowCount = row => sourcesOf(row).filter(s => s.selected && ready(s)).reduce((sum, s) => sum + countOf(s), 0);
  function gmailCaption() {
    const s = source('gmail');
    if (!ready(s) && connected().length) return globalThis.t.text("workbench.context-onboarding.choose-connected-google-account");
    if (!ready(s) && !config.gmail_configured) return globalThis.t.text("workbench.context-onboarding.google-access-not-set-up-molis-yet-use");
    const c = connected().find(c => c.connection_id === s.connection_id);
    return (c ? c.account_label || c.display_name : globalThis.t.text("workbench.context-onboarding.work-email")) + ' · ' + globalThis.t.text("workbench.context-onboarding.last-n-n-up-20-emails-no-attachments", {n:s.days || 30});
  }
  // A row that only chooses files opens the system chooser itself: the inputs stay in the page, out of sight.
  const picker = kind => '<input id="cx-upload-' + kind + '" class="mw-sr-only" type="file" multiple tabindex="-1" aria-hidden="true" ' + (kind === 'directory' ? 'webkitdirectory directory' : 'accept=".md,.markdown,.txt,.csv,.json,.html,.htm,.pdf,.docx"') + ' data-upload="' + kind + '">';
  const pickerOf = id => id === 'files' || id === 'chat' ? id : id === 'folder' && !native ? 'directory' : '';
  const RANGES = [[7,'7 天'],[30,'30 天'],[90,'90 天'],[0,'全部']];
  const folderDays = () => {
    const chosen = directories.map(kind => source(kind)).filter(s => s?.selected);
    const rows = chosen.length ? chosen : directories.map(kind => source(kind)).filter(Boolean);
    const first = rows[0] ? (rows[0].days ?? 30) : 30;
    return rows.every(s => (s.days ?? 30) === first) ? first : null;
  };
  function rowConfig(row) {
    if (row.id === 'folder') {
      const days = folderDays();
      const place = kind => {
        const s = source(kind), grant = grants[kind], on = Boolean(s?.selected);
        const path = grant?.state === 'ready' ? (grant.path || '') : '';
        const hint = path || (grant?.state === 'unavailable' ? globalThis.t.text("workbench.context-onboarding.reauthorization-required") : globalThis.t.text("workbench.context-onboarding.not-chosen-yet"));
        const again = grant?.state === 'ready' ? '<span class="ob-place__actions">' + btn({variant:'ghost', size:'sm', label:globalThis.t.text("workbench.context-onboarding.change"), attrs:{'data-authorize':kind}}) + btn({variant:'ghost', size:'sm', label:globalThis.t.text("workbench.context-onboarding.disconnect"), attrs:{'data-forget':kind}}) + '</span>' : '';
        return '<div class="ob-place">' + choice({label:globalThis.t.text(names[kind]), note:hint, selected:on, attrs:{'data-pick':kind, title:path || hint}}) + again + '</div>';
      };
      return '<div class="ob-cfg-block"><p class="ob-label">' + globalThis.t.text("workbench.context-onboarding.location") + '</p><div class="ob-picks" role="group" aria-label="' + globalThis.t.text("workbench.context-onboarding.location") + '">' + directories.map(place).join('') + '</div></div>'
        + '<div class="ob-cfg-block"><p class="ob-label">' + globalThis.t.text("workbench.context-onboarding.time-range") + '</p>' + toggles(globalThis.t.text("workbench.context-onboarding.time-range"), RANGES.map(([d, label]) => ({label:label, current:days === d, attrs:{'data-range-pick':String(d)}}))) + '</div>';
    }
    if (row.id === 'browser') { const s = source('browser'); return '<div class="ob-cfg-block"><label class="ob-label" for="cx-browser-text">' + globalThis.t.text("workbench.context-onboarding.page-text") + '</label><textarea class="mw-textarea" id="cx-browser-text" rows="4" maxlength="100000" data-kind="browser" data-field="text" placeholder="' + esc(globalThis.t.text("workbench.context-onboarding.copy-content-need-page-paste-here")) + '">' + esc(s.text || '') + '</textarea></div><div class="ob-cfg-block"><label class="ob-label" for="cx-url">' + globalThis.t.text("workbench.context-onboarding.page-address-optional") + '</label><input type="url" class="mw-input" id="cx-url" data-kind="browser" data-field="url" placeholder="https://" value="' + esc(s.url || '') + '"></div>' + note(globalThis.t.text("workbench.context-onboarding.only-pasted-text-used-other-tabs-history-never"), 'shield'); }
    if (row.id === 'gmail') {
      const s = source('gmail');
      const account = '<div class="ob-cfg-block"><label class="ob-label" for="cx-account">' + globalThis.t.text("workbench.context-onboarding.use-account") + '</label><select class="mw-select" data-slot="select" id="cx-account" data-field="connection_id" data-kind="gmail"><option value="">' + globalThis.t.text(connected().length ? "workbench.context-onboarding.choose-existing-account" : "workbench.context-onboarding.connect-google-account") + '</option>' + connected().map(c => '<option value="' + esc(c.connection_id) + '" ' + (c.connection_id === s.connection_id ? 'selected' : '') + '>' + esc(c.account_label || c.display_name) + '</option>').join('') + '</select></div>';
      const days = '<div class="ob-cfg-block"><label class="ob-label" for="cx-days">' + globalThis.t.text("workbench.context-onboarding.time-range-2") + '</label><select class="mw-select" data-slot="select" id="cx-days" data-field="days" data-kind="gmail"><option value="7" ' + (s.days === 7 ? 'selected' : '') + '>' + globalThis.t.text("workbench.context-onboarding.last-7-days") + '</option><option value="30" ' + (s.days !== 7 ? 'selected' : '') + '>' + globalThis.t.text("workbench.context-onboarding.last-30-days") + '</option></select></div>';
      return account + days + note(globalThis.t.text("workbench.context-onboarding.reads-up-20-email-bodies-never-reads-attachments"), 'shield') + (!config.gmail_configured ? note(globalThis.t.text("workbench.context-onboarding.google-access-isn-t-set-up-molis-yet"), 'alert', 'is-warn') : '<div class="ob-cfg-actions">' + btn({variant:'secondary', icon:'mail', label:globalThis.t.text(connected().length ? "workbench.context-onboarding.connect-another-google-account" : "workbench.context-onboarding.connect-google"), attrs:{'data-action':'connect'}}) + '</div>');
    }
    return '';
  }
  // What a row says on its right is what pressing it does, until something is in: then how much.
  function rowWord(row) {
    const n = rowCount(row);
    if (n) return globalThis.t.text("workbench.context-onboarding.added-n", {n});
    if (row.id === 'gmail' && !config.gmail_configured && !connected().length) return globalThis.t.text("workbench.context-onboarding.unavailable-now");
    return row.id === 'folder' && native && directories.some(kind => source(kind)?.selected && grants[kind]?.state === 'unavailable') ? globalThis.t.text("workbench.context-onboarding.reauthorization-required") : globalThis.t.text("workbench.context-onboarding.add");
  }
  // What pressing the row does, drawn as the button it acts as (the row is the one control): 添加, or the green count once added.
  function rowAct(row) {
    const n = rowCount(row), quiet = row.id === 'gmail' && !config.gmail_configured && !connected().length;
    return '<span class="ob-source__act' + (n ? ' is-added' : quiet ? ' is-quiet' : ' mw-btn mw-btn--secondary mw-btn--sm') + '">' + (quiet ? '' : glyph(n ? 'check' : 'plus')) + '<span>' + esc(rowWord(row)) + '</span></span>';
  }
  function sourceList() {
    return '<div class="ob-sources" role="list" aria-label="' + globalThis.t.text("workbench.context-onboarding.choose-material-sources") + '">' + sourceRows().map(row => {
      const unavailable = row.id === 'gmail' && !config.gmail_configured && !connected().length;
      const open = expanded === row.id && !pickerOf(row.id), has = rowCount(row) > 0, own = !pickerOf(row.id) && !unavailable;
      const caption = row.id === 'gmail' ? gmailCaption() : row.caption;
      return '<div class="ob-source' + (open ? ' is-open' : '') + (has ? ' has-items' : '') + '" role="listitem" data-src="' + row.id + '">' + dirRow({title:row.name, caption:caption, icon:row.icon, end:rowAct(row), selected:open, cls:unavailable ? 'is-unavailable' : '', attrs:{'data-open':row.id, disabled:unavailable, 'aria-expanded':own ? String(open) : null, 'aria-controls':own ? 'cfgp-' + row.id : null}}) + (open ? '<div class="ob-source__cfg" id="cfgp-' + row.id + '">' + rowConfig(row) + '</div>' : '') + '</div>';
    }).join('') + '</div>' + (native ? '' : picker('directory')) + picker('files') + picker('chat');
  }
  const fileCount = s => included(s).length || s.files?.length || 0;
  function groupFor(s) {
    const kind = s.kind, add = {attrs:{'data-group':kind}, remove:{label:globalThis.t.text("workbench.context-onboarding.remove") + ' ' + globalThis.t.text(names[kind]), attrs:{'data-remove':kind}}};
    if (s.references?.length) return fileGroup({...add, icon:sourceIcons[kind], title:globalThis.t.text(names[kind]), caption:globalThis.t.text("workbench.context-onboarding.n-n-stored-snapshot-will-be-reused", {n:s.references.length}), rows:[]});
    if (kind === 'gmail') return fileGroup({...add, icon:'mail', title:'Gmail', caption:gmailCaption(), rows:[fileRow({name:globalThis.t.text("workbench.context-onboarding.emails-last-n-n", {n:s.days || 30}) + '.eml', size:'≤ 20', chip:kindChip('x.eml')})]});
    if (kind === 'browser') { const bytes = new TextEncoder().encode(s.text || '').length; return fileGroup({...add, icon:'globe', title:globalThis.t.text("workbench.context-onboarding.page-text"), caption:(s.url || globalThis.t.text("workbench.context-onboarding.pasted-text")), rows:[fileRow({name:globalThis.t.text("workbench.context-onboarding.page-text-n-n", {n:(s.text || '').length.toLocaleString()}) + '.txt', size:size(bytes)})]}); }
    const files = (s.metadata?.files || (s.files || []).map(f => ({path:f.path, size:0}))), listed = included(s).length ? included(s) : files;
    const shown = listed.slice(0, 8), more = listed.length - shown.length;
    const caption = directory(s) ? [grants[kind]?.path || s.path || '', (s.days === 0 ? globalThis.t.text("workbench.context-onboarding.any-time") : globalThis.t.text("workbench.context-onboarding.last-n-n", {n:s.days ?? 30}))].filter(Boolean).join(' · ') : kind === 'directory' ? String(files[0]?.path || '').split('/')[0] : kind === 'chat' ? globalThis.t.text("workbench.context-onboarding.exported-text-records") : '';
    return fileGroup({...add, icon:sourceIcons[kind], title:directory(s) ? globalThis.t.text("workbench.context-onboarding.folder") + ' · ' + globalThis.t.text(names[kind]) : globalThis.t.text(names[kind]), caption, status:directory(s) ? status(globalThis.t.text("workbench.context-onboarding.authorized"), 'done', 'status-done') : '',
      rows:shown.map(f => fileRow({name:f.path, size:f.size ? size(f.size) : ''})), note:[more > 0 ? globalThis.t.text("workbench.context-onboarding.n-more-files-included", {n:more}) : '', s.metadata?.skipped ? globalThis.t.text("workbench.context-onboarding.n-n-left-out-time-type-access", {n:s.metadata.skipped}) : ''].filter(Boolean).join(' ')});
  }
  function materialsPane() {
    const groups = picked().filter(ready);
    if (!groups.length) return '<div class="ob-mini" aria-hidden="true"><div class="ob-mini-surface"><b class="ob-mini-title"></b>' + miniRow('folder',58,40) + miniRow('file',66,34) + miniRow('globe',44,52) + '</div></div><p class="ob-scene-note">' + globalThis.t.text("workbench.context-onboarding.pick-source-its-materials-line-up-here") + '</p>';
    const total = selectionTotal();
    return stageHead(globalThis.t.text("workbench.context-onboarding.bringing"), globalThis.t.text("workbench.context-onboarding.files-count-groups-groups-size-text-not-read", {count:total.count, groups:groups.length, size:size(total.bytes)})) + groups.map(groupFor).join('');
  }
  function resumeNotice() {
    return config.resume && config.resume.id !== journey.id ? '<p class="ob-resume cx-resume">' + glyph('history') + '<span>' + globalThis.t.text("workbench.context-onboarding.have-unfinished-import-last-time") + (config.resume.title && config.resume.title !== '未完成的整理' ? ' · ' + esc(config.resume.title) : '') + '</span>' + btn({variant:'link', size:'sm', label:globalThis.t.text("workbench.context-onboarding.continue-where-left-off"), attrs:{'data-action':'resume'}}) + '</p>' : '';
  }
  function sourcesView() {
    const total = selectionTotal(), any = picked().filter(ready);
    const left = question(globalThis.t.text("workbench.context-onboarding.bring-existing-materials"), globalThis.t.text("workbench.context-onboarding.files-pages-chats-become-new-project-s-background")) + resumeNotice()
      + (journey.summary ? '<p class="cx-hint ob-note">' + glyph('info') + '<span>' + globalThis.t.text("workbench.context-onboarding.materials-already-read-kept-starting-again-replaces-current") + '</span></p>' : '')
      + (journey.oauth_status === 'pending' ? '<div class="ob-notice" role="status"><span data-mw-state="reauth" aria-hidden="true"></span>' + '<span>' + globalThis.t.text("workbench.context-onboarding.finish-google-authorization-browser-continues-afterwards") + '</span>' + btn({variant:'secondary', size:'sm', label:globalThis.t.text("workbench.context-onboarding.skip-gmail-continue"), attrs:{'data-action':'skip-auth'}}) + '</div>' : '')
      + errorLine(error) + sourceList() + '<div class="ob-notes">' + (counting && !counting.saving ? note(globalThis.t.text("workbench.context-onboarding.counting-chosen-files-they-appear-right-when-count"), 'clock') + meter(counting.done, counting.total, globalThis.t.text("workbench.context-onboarding.count"), globalThis.t.text("workbench.context-onboarding.seen-done-total-keeping-kept-size", {done:counting.done, total:counting.total, kept:counting.kept, size:size(counting.bytes)})) : counting && counting.saving ? note(globalThis.t.text("workbench.context-onboarding.list-large-being-saved"), 'clock') : '') + note(globalThis.t.text("workbench.context-onboarding.adding-records-only-names-sizes-text-read-when"), 'shield') + note(globalThis.t.text("workbench.context-onboarding.no-limit-how-many-how-large-large-folder"), 'info') + '</div>';
    return {kind:'onboard', view:'sources', step:'来源', left, right:materialsPane(), rightCls:any.length ? '' : 'is-empty',
      bar:{start:exitButton() + stepsBar('来源'), center:'', end:secondary("workbench.context-onboarding.skip",'blank') + primary(startLabel(), 'prepare', {disabled:!picked().length || busy})}};
  }

  /* ───────── Scope: the person's last word on what is read ───────── */
  const previewReady = s => ready(s) && (!directory(s)||Boolean(s.references?.length||s.metadata));
  function selectionTotal() {
    let count=0,bytes=0;
    for(const s of picked()) {
      if(s.references?.length){count+=s.references.length;bytes+=s.references.reduce((n,r)=>n+(r.original?.size_bytes||0),0);}
      else if(s.metadata){const files=included(s);count+=files.length;bytes+=files.reduce((n,f)=>n+f.size,0);}
      else if(s.kind==='browser'&&s.text?.trim()){count++;bytes+=new TextEncoder().encode(s.text).length;}
    }
    return {count,bytes};
  }
  // No count or size limit (user 2026-10-22); past this much, the page says the files are read in a queue it may leave.
  const QUEUED = {count: 50, bytes: 50000000};
  function missingBlock(s) {
    const fix = directory(s) ? btn({variant:'secondary', size:'sm', label:globalThis.t.text("workbench.context-onboarding.choose-authorize"), attrs:{'data-authorize':s.kind}}) : s.kind === 'gmail' ? btn({variant:'secondary', size:'sm', label:globalThis.t.text(connected().length ? "workbench.context-onboarding.choose-existing-account" : "workbench.context-onboarding.connect-google"), attrs:{'data-action':connected().length ? 'choose-account' : 'connect'}}) : btn({variant:'secondary', size:'sm', label:globalThis.t.text("workbench.context-onboarding.add-content"), attrs:{'data-add':s.kind}});
    return '<section class="mw-file-group"><div class="mw-file-group__head"><span class="mw-file-group__ic">' + glyph(sourceIcons[s.kind]) + '</span><span class="mw-file-group__text"><strong>' + globalThis.t.text(names[s.kind]) + '</strong><small>' + esc(s.error || globalThis.t.text(directory(s) ? "workbench.context-onboarding.authorization-isn-t-finished-can-choose-directory-again" : s.kind === 'gmail' ? "workbench.context-onboarding.once-account-connected-mail-chosen-period-read-when" : "workbench.context-onboarding.add-some-content-first-after-refresh-files-chosen")) + '</small></span>' + fix + btn({variant:'ghost', size:'sm', label:globalThis.t.text("workbench.context-onboarding.skip-time"), attrs:{'data-skip':s.kind}}) + '</div></section>';
  }
  function scopeGroup(s) {
    if (!previewReady(s)) return missingBlock(s);
    const add = {attrs:{'data-group':s.kind}};
    if (s.references?.length) return fileGroup({...add, icon:sourceIcons[s.kind], title:globalThis.t.text(names[s.kind]), caption:globalThis.t.text("workbench.context-onboarding.stored-text-reused-changing-range-reads-again"), rows:[]});
    if (!s.metadata) return fileGroup({...add, icon:sourceIcons[s.kind], title:globalThis.t.text(names[s.kind]), caption:s.kind === 'gmail' ? gmailCaption() : globalThis.t.text("workbench.context-onboarding.added-content-processed-once-start"), rows:[]});
    const items = s.metadata.files, selected = included(s), folders = [...new Set(items.filter(f=>f.path.includes('/')).map(f=>f.path.slice(0,f.path.indexOf('/'))))];
    const rows = folders.map(folder => fileRow({name:folder + '/', chip:'<span class="mw-file-kind" data-slot="file-kind">' + glyph('folder') + '</span>', size:globalThis.t.text("workbench.context-onboarding.include-subfolders"), check:{checked:!(s.excluded||[]).includes(folder), attrs:{id:'cx-d-' + s.kind + '-' + folders.indexOf(folder), 'data-folder':s.kind, 'data-path':folder}}}))
      .concat(items.map((file, i) => fileRow({name:file.path, size:size(file.size), state:'<span class="mw-file-row__state">' + globalThis.t.text("workbench.context-onboarding.not-read") + '</span>', check:{checked:selected.includes(file), attrs:{id:'cx-f-' + s.kind + '-' + i, 'data-file':s.kind, 'data-index':i}}})));
    const tools = directory(s) ? toggles(globalThis.t.text(names[s.kind]) + globalThis.t.text("workbench.context-onboarding.time-range"), RANGES.map(([days, label]) => ({label:label, current:(s.days ?? 30) === days, attrs:{'data-range':s.kind, 'data-days':String(days)}}))) + btn({variant:'ghost', size:'sm', icon:'refresh', label:globalThis.t.text("workbench.context-onboarding.refresh-preview"), attrs:{'data-refresh':s.kind}}) : '';
    const seen = s.metadata.skipped || 0;
    return fileGroup({...add, icon:sourceIcons[s.kind], title:directory(s) ? globalThis.t.text("workbench.context-onboarding.folder") + ' · ' + globalThis.t.text(names[s.kind]) : globalThis.t.text(names[s.kind]), caption:s.kind === 'gmail' ? gmailCaption() : (grants[s.kind]?.path || s.path || ''), count:items.length ? selected.length + '/' + items.length : (seen ? String(seen) : '0/0'),
      check:{checked:items.length ? selected.length === items.length : s.selected, mixed:items.length > 0 && selected.length > 0 && selected.length < items.length, attrs:{id:'cx-all-' + s.kind, 'data-files-all':s.kind}}, tools, rows,
      note:[s.metadata.truncated ? globalThis.t.text("workbench.context-onboarding.folder-has-too-many-entries-scan-them-all") : (!items.length ? globalThis.t.text("workbench.context-onboarding.no-supported-files-time-range-widen-skip") : ''), seen ? seen + ' ' + globalThis.t.text("workbench.context-onboarding.items-left-out-time-type-access") : ''].filter(Boolean).join(' ')});
  }
  function scopeView() {
    const total = selectionTotal(), missing = picked().some(s => !previewReady(s)), queued = total.count > QUEUED.count || total.bytes > QUEUED.bytes;
    const left = question(globalThis.t.text("workbench.context-onboarding.confirm-what-gets-read"), globalThis.t.text(picked().some(s => s.references?.length) ? "workbench.context-onboarding.stored-text-reused-newly-chosen-files-show-only" : "workbench.context-onboarding.deselect-files-don-t-need-their-text-read")) + errorLine(error)
      + (uploading ? note(globalThis.t.text("workbench.context-onboarding.uploading-files-stay-page-until-upload-finishes-after"), 'clock') + meter(uploading.done, uploading.total, globalThis.t.text("workbench.context-onboarding.upload-progress"), globalThis.t.text("workbench.context-onboarding.done-total-uploaded", {done:amount(uploading.done), total:amount(uploading.total)})) : queued ? note(globalThis.t.text("workbench.context-onboarding.that-s-lot-material-once-start-files-read"), 'clock') : '')
      + note(globalThis.t.text(config.ai_available ? "workbench.context-onboarding.after-start-selected-text-read-sent-chosen-model" : "workbench.context-onboarding.after-start-selected-text-read-stored-computer-original"), 'shield')
      + (picked().some(s => s.kind === 'gmail') ? note(globalThis.t.text("workbench.context-onboarding.value-20-most-recent-emails-chosen-time-read"), 'mail') : '')
      + collapsible(globalThis.t.text("workbench.context-onboarding.how-reading-works"), '<p>' + globalThis.t.text("workbench.context-onboarding.no-limit-how-many-files-how-big-each") + '</p>');
    const listed = journey.sources.filter(s => s.selected || (directory(s) && s.metadata));
    const right = stageHead(globalThis.t.text("workbench.context-onboarding.confirm-one-one"), globalThis.t.text("workbench.context-onboarding.n-selected-size", {n:total.count, size:size(total.bytes)})) + listed.map(scopeGroup).join('');
    return {kind:'onboard', view:'preview', step:'确认', left, right,
      bar:{start:exitButton() + stepsBar('确认'), center:barStatus({glyph:'shield', title:globalThis.t.text("workbench.context-onboarding.n-selected-size", {n:total.count, size:size(total.bytes)}), caption:missing ? globalThis.t.text("workbench.context-onboarding.finish-sources-above-skip-what-don-t-need") : config.ai_available ? globalThis.t.text("workbench.context-onboarding.after-start-text-read-sent-chosen-model") : globalThis.t.text("workbench.context-onboarding.after-start-text-read-kept-device")}),
        end:secondary("workbench.context-onboarding.previous",'sources',{icon:'back'}) + (uploading || readingLocal ? primary(uploading ? globalThis.t.text("workbench.context-onboarding.uploading-k-n", uploading) : globalThis.t.text("workbench.context-onboarding.reading-name", {name:readingLocal}), 'start', {disabled:true}) : primary("workbench.context-onboarding.next",'model'))}};
  }

  /* ───────── Reading: the Host reads and sorts; the person may leave and come back ───────── */
  const docState = s => s.error ? 'failed' : s.references?.length ? 'done' : ready(s) ? 'ready' : 'pending';
  function issues(s){return s.issues?.length?'<details class="mw-collapsible cx-issues"><summary>'+s.issues.length+' '+globalThis.t.text("workbench.context-onboarding.items-not-read")+'</summary><div class="mw-collapsible__body">'+s.issues.map(i=>'<p>'+esc(i.path)+' · '+esc(i.reason)+'</p>').join('')+'</div></details>':'';}
  function receipts() {
    return '<ul class="mw-file-list is-receipts">' + picked().map(s => {
      const state = docState(s), label = s.error ? "workbench.context-onboarding.not-read" : s.references ? "workbench.context-onboarding.read" : journey.phase === 'reading' ? "workbench.context-onboarding.waiting" : sourceStatus(s);
      const detail = s.error || (s.references ? globalThis.t.text("workbench.context-onboarding.n-n-saved", {n:s.references.length}) + (s.skipped ? ' · ' + globalThis.t.text("workbench.context-onboarding.n-skipped", {n:s.skipped}) : '') : s.reading ? globalThis.t.text("workbench.context-onboarding.k-n", {k:Math.min(s.reading.done + 1, s.reading.total), n:s.reading.total}) : '');
      return fileRow({name:globalThis.t.text(names[s.kind]), chip:'<span class="mw-file-kind" data-slot="file-kind">' + glyph(sourceIcons[s.kind]) + '</span>', size:detail, state:status(label, state === 'done' ? 'done' : state === 'failed' ? 'blocked' : 'idle', null, state === 'done' || state === 'failed' ? state : journey.phase === 'reading' ? 'waiting' : state === 'ready' ? 'ready' : 'idle')});
    }).join('') + '</ul>' + picked().map(issues).join('');
  }
  function readingView() {
    const done = picked().filter(s=>s.references||s.error).length, total = Math.max(1, picked().length);
    const materialsReady = journey.phase==='failed' && journey.needs_model && picked().some(s=>s.references?.length);
    if (materialsReady) {
      return {kind:'onboard', view:'materials', step:'整理',
        left:question(globalThis.t.text("workbench.context-onboarding.materials-ready"), globalThis.t.text("workbench.context-onboarding.give-project-name-start-reading-writing-summary-can")) + errorLine(error) + note(config.model ? globalThis.t.text("workbench.context-onboarding.text-model-connected-can-carry-get-summary-todos") : globalThis.t.text("workbench.context-onboarding.connect-text-model-come-back-get-summary-todos"), config.model ? 'check' : 'info') + '<p class="ob-quiet">' + (config.model ? '' : btn({variant:'link', size:'sm', label:globalThis.t.text("workbench.context-onboarding.connect-text-model"), attrs:{'data-action':'model'}}) + ' ') + btn({variant:config.model ? 'secondary' : 'ghost', size:'sm', label:globalThis.t.text(config.model ? "workbench.context-onboarding.continue-2" : "workbench.context-onboarding.connected-continue"), attrs:{'data-action':'retry'}}) + '</p>',
        right:stageHead(globalThis.t.text("workbench.context-onboarding.materials-read"), '') + receipts(),
        bar:{start:exitButton() + stepsBar('整理'), center:barStatus({glyph:'check', title:globalThis.t.text("workbench.context-onboarding.materials-ready"), caption:globalThis.t.text("workbench.context-onboarding.originals-kept-device")}), end:secondary("workbench.context-onboarding.adjust-sources",'restart') + primary("workbench.context-onboarding.save-materials-start",'materials-only')}};
    }
    const reading = journey.phase==='reading', failed = journey.phase==='failed';
    const heading = reading ? (done===picked().length ? "workbench.context-onboarding.tracing-how-work-fits-together" : "workbench.context-onboarding.reading-materials") : "workbench.context-onboarding.materials-kept";
    // Files, not sources: each source is read file by file, and its checkpoint says how far it has come.
    const files = picked().reduce((n, s) => ({done:n.done + (s.references ? s.references.length + (s.issues?.length || 0) : s.reading?.done || 0), total:n.total + (s.references ? s.references.length + (s.issues?.length || 0) : s.reading?.total || 0)}), {done:0, total:0});
    const synthesis = journey.synthesis, todo = journey.todo, bytes = journey.reading_bytes?.total ? journey.reading_bytes : null;
    // Reading goes by bytes; the summary and the todo drafts by their calls, with what is left timed by the calls done (2026-10-22).
    const summing = done >= picked().length && reading, calls = synthesis?.batches;
    const phases = [['读入材料', (files.total ? globalThis.t.text("workbench.context-onboarding.done-total-total", {done:files.done, total:files.total}) : globalThis.t.text("workbench.context-onboarding.done-total-total", {done, total:picked().length})) + (bytes ? ' · ' + amount(Math.min(bytes.done, bytes.total)) + ' / ' + amount(bytes.total) : ''), done >= picked().length ? 'done' : 'progress', null],
      ['整理工作脉络', (synthesis && synthesis.total > 1 ? globalThis.t.text("workbench.context-onboarding.batch-k-n", {n:synthesis.total, k:Math.min(synthesis.completed + 1, synthesis.total)}) : globalThis.t.text("workbench.context-onboarding.background-progress-timeline")) + (summing && calls?.all ? ' · ' + remaining(calls.all - calls.done, synthesis.timing) : ''), summing ? 'progress' : 'idle', calls?.all > 1 ? [calls.done, calls.all, globalThis.t.text("workbench.context-onboarding.summary-progress")] : null],
      ...(todo && todo.total > 1 ? [['待办草稿', (todo.status === 'pending' ? globalThis.t.text("workbench.context-onboarding.finding-todos-batch-k-n", {n:todo.total, k:Math.min(todo.batches.length + 1, todo.total)}) : globalThis.t.text("workbench.context-onboarding.done-total-total-2", {done:todo.batches.length, total:todo.total})) + (todo.status === 'pending' && reading ? ' · ' + remaining(todo.total - todo.batches.length, todo.timing) : ''), todo.status === 'ready' ? 'done' : todo.status === 'pending' && reading ? 'progress' : 'idle', [todo.batches.length, todo.total, globalThis.t.text("workbench.context-onboarding.do-draft-progress")]]] : [])];
    const queuedHint = reading && (files.total > 1 || (synthesis && synthesis.total > 1)) ? note(globalThis.t.text(files.done < files.total ? "workbench.context-onboarding.that-s-lot-material-read-one-file-time" : "workbench.context-onboarding.can-leave-page-pick-up-where-left-off"), 'clock') : '';
    const left = question(heading, globalThis.t.text(reading ? "workbench.context-onboarding.can-leave-pick-up-organizing-later" : "workbench.context-onboarding.after-fixing-connection-model-settings-can-finish"))
      + '<ol class="ob-phases" role="list">' + phases.map(([name, sub, tone, bar]) => '<li class="ob-phase is-' + tone + '"><span class="ob-phase__mark" data-mw-state="' + (tone === 'done' ? 'done' : tone === 'progress' ? (reading ? 'running' : failed ? 'failed' : 'doing') : 'idle') + '"></span><span class="ob-phase__text"><strong>' + name + '</strong><small>' + esc(sub) + '</small>' + (bar ? progressBar(bar[0], bar[1], bar[2]) : '') + '</span></li>').join('') + '</ol>'
      + (journey.synthesis ? '<p class="cx-hint ob-note">' + glyph('info') + '<span>' + globalThis.t.text("workbench.context-onboarding.batches") + ' · ' + globalThis.t.text("workbench.context-onboarding.round-n",{n:journey.synthesis.stage}) + ' · ' + journey.synthesis.completed + ' / ' + journey.synthesis.total + '</span></p>' : '')
      + queuedHint + errorLine(journey.error||error)
      + (failed ? '<div class="ob-cfg-actions">' + btn({variant:'secondary', size:'sm', label:globalThis.t.text("workbench.context-onboarding.back-list-adjust-range"), attrs:{'data-action':'restart'}}) + (picked().some(s=>s.references?.length) ? btn({variant:'secondary', size:'sm', label:globalThis.t.text("workbench.context-onboarding.bring-materials-start"), attrs:{'data-action':'materials-only'}}) : '') + '</div>' : '') + note(globalThis.t.text("workbench.context-onboarding.only-what-just-selected-read"), 'shield');
    return {kind:'onboard', view:'reading', step:'整理', left,
      right:stageHead(globalThis.t.text("workbench.context-onboarding.reading-materials-2"), files.total ? globalThis.t.text("workbench.context-onboarding.done-total-total", {done:'<b>' + files.done + '</b>', total:files.total}) : globalThis.t.text("workbench.context-onboarding.done-total-total", {done:'<b>' + done + '</b>', total:picked().length})) + (bytes ? progressBar(Math.min(bytes.done, bytes.total), bytes.total, globalThis.t.text("workbench.context-onboarding.reading-progress")) : files.total ? progressBar(files.done, files.total, globalThis.t.text("workbench.context-onboarding.reading-progress")) : progressBar(done, total, globalThis.t.text("workbench.context-onboarding.reading-progress"))) + receipts(),
      bar:{start:exitButton() + stepsBar('整理'), center:barStatus({spin:reading, glyph:'alert', title:heading, caption:globalThis.t.text(reading ? "workbench.context-onboarding.can-leave-pick-up-organizing-later-2" : "workbench.context-onboarding.materials-kept")}),
        end:failed ? btn({variant:'secondary', size:'lg', label:globalThis.t.text(config.model ? "workbench.context-onboarding.change" : "workbench.context-onboarding.connect-text-model"), attrs:{'data-action':'model'}}) + primary("workbench.context-onboarding.continue-2",'retry',{disabled:busy}) : btn({variant:'primary', size:'lg', icon:'clock', label:globalThis.t.text("workbench.context-onboarding.sorting"), disabled:true})}};
  }

  /* ───────── Naming: what the project is, and what it starts with ───────── */
  function markdown(text) {
    const out=[];let paragraph=[];
    const flush=()=>{if(paragraph.length){out.push('<p>'+paragraph.join('\n')+'</p>');paragraph=[];}};
    for(const line of esc(text).split('\n')){const heading=/^#{1,3} (.+)$/.exec(line);if(heading){flush();out.push('<h3>'+heading[1]+'</h3>');}else if(!line.trim())flush();else paragraph.push(line);}
    flush();return out.join('').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\[S(\d+)\]/g,'<button class="cx-citation" data-cite="S$1" aria-label="'+globalThis.t.text("workbench.context-onboarding.view-source")+' S$1">[S$1]</button>');
  }
  // Todo drafts from the same materials: the person keeps what they want; the rest waits in Todo's “待你确认”.
  let todoPicked=null;
  const KIND={request:['要你处理','attention','status-needs-you'],commitment:['你的承诺','progress','status-progress'],waiting:['在等别人','hold','status-waiting'],suggestion:['建议','quiet','status-todo']};
  function draftDay(date){return new Intl.DateTimeFormat(document.documentElement.lang||'zh-CN',{month:'long',day:'numeric'}).format(new Date(date+'T00:00:00'));}
  function drafts(){
    const t=journey.todo;if(!t)return '';
    // One list to confirm, however many batches the drafts were organized in.
    const batches=t.batches||[], candidates=batches.flatMap(b=>b.candidates), referenceOnly=batches.reduce((n,b)=>n+b.reference_only.length,0);
    if(t.status==='pending')return '<p class="mw-brief__quiet" role="status">'+(t.total>1?globalThis.t.text("workbench.context-onboarding.finding-todos-batch-k-n",{n:t.total,k:Math.min(batches.length+1,t.total)}):globalThis.t.text("workbench.context-onboarding.finding-what-needs-materials"))+'</p>';
    if(t.status==='failed'||!batches.length)return '<p class="mw-brief__quiet">'+(t.error?globalThis.t.text("workbench.context-onboarding.couldn-t-draft-todos-reason-once-project-exists",{reason:esc(t.error)}):globalThis.t.text("workbench.context-onboarding.couldn-t-draft-todos-once-project-exists-assistant"))+'</p>';
    const open=candidates.filter(c=>!c.decision);
    if(!todoPicked)todoPicked=new Set(open.filter(c=>c.selected).map(c=>c.candidate_id));
    const notes=batches.flatMap(b=>b.notes).map(n=>'<p class="mw-brief__hint">'+esc(n)+'</p>').join('');
    if(!open.length)return '<p class="mw-brief__quiet">'+globalThis.t.text("workbench.context-onboarding.nothing-materials-needs-move")+'</p>'+notes;
    return '<p class="mw-brief__hint">'+globalThis.t.text("workbench.context-onboarding.ticked-ones-become-todos-new-project-rest-wait")+' <b>'+globalThis.t.text("workbench.context-onboarding.n-total-selected",{n:todoPicked.size,total:open.length})+'</b></p><ul class="mw-file-list cx-drafts">'+open.map(c=>{
      const k=KIND[c.kind]||KIND.suggestion;
      const meta=[c.due_date?globalThis.t.text("workbench.context-onboarding.due-date",{date:draftDay(c.due_date)})+(c.due_phrase?globalThis.t.text("workbench.context-onboarding.written-phrase",{phrase:esc(c.due_phrase)}):''):'',c.kind==='waiting'&&c.waiting?globalThis.t.text("workbench.context-onboarding.waiting-who",{who:esc(c.waiting.who)}):(c.owner.stated?'':globalThis.t.text("workbench.context-onboarding.owner-unclear")),c.existing?globalThis.t.text("workbench.context-onboarding.related-existing-todo"):''].filter(Boolean).join(' · ');
      return '<li class="mw-file-row is-todo cx-draft"><label class="mw-file-row__label"><input type="checkbox" class="mw-check" id="cx-t-'+c.candidate_id+'" data-draft="'+c.candidate_id+'" '+(todoPicked.has(c.candidate_id)?'checked':'')+'><span class="cx-draft-copy"><span class="mw-file-row__name">'+esc(c.title)+'</span>'+(meta?'<small class="cx-draft-meta">'+meta+'</small>':'')+(c.evidence[0]?'<small class="cx-draft-evidence">“'+esc(c.evidence[0].excerpt)+'”</small>':'')+'</span></label>'+status((k[0]),k[1],k[2])+'</li>';
    }).join('')+'</ul>'+notes+(referenceOnly?'<p class="mw-brief__hint">'+globalThis.t.text("workbench.context-onboarding.n-more-reference-only-not-listed-todos",{n:referenceOnly})+'</p>':'');
  }
  /** The new project as it will look in the chooser: the same brief, drawn from what is being decided. */
  function briefPreview(name, summary, nextHtml, kicker) {
    // The same sentence the chooser will show once the project exists: the first paragraph that says something (a heading is a title), as plain words.
    const first = String(summary || '').split(/\n\s*\n/).map(p => p.split('\n').filter(line => !/^\s*#{1,6}\s/.test(line)).join(' ').replace(/\*\*([^*]+)\*\*/g,'$1').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/\s*\[S\d+\]/g,'').replace(/\x60([^\x60]+)\x60/g,'$1').replace(/\s+/g,' ').trim()).find(Boolean) || '';
    return '<div class="ob-preview" aria-label="' + esc(globalThis.t.text("workbench.context-onboarding.how-new-project-will-look")) + '"><article class="mw-brief" data-slot="brief"><p class="mw-brief__kicker"><span>' + esc(kicker) + '</span></p><h1 class="mw-brief__title ob-project-name">' + esc(name) + '</h1>'
      + (first ? '<p class="mw-brief__desc">' + esc(first.length > 240 ? first.slice(0, 239) + '…' : first) + '</p>' : '<p class="mw-brief__desc is-missing">' + glyph('info') + '<span>' + globalThis.t.text("workbench.context-onboarding.no-description-yet-open-project-add-line-its") + '</span></p>')
      + '<section class="mw-brief__focus is-empty"><div><h2>' + globalThis.t.text("workbench.context-onboarding.no-goals-yet") + '</h2><p>' + globalThis.t.text("workbench.context-onboarding.write-first-goal-once-open-project-ask-assistant") + '</p></div></section>'
      + '<div class="mw-brief__cols"><section class="mw-brief__sec"><h2>' + nextHtml.title + '</h2>' + nextHtml.body + '</section></div></article></div>';
  }
  function review() {
    const s=journey.summary, draftsHtml = drafts(), picks = todoPicked ? todoPicked.size : 0;
    const left = question(globalThis.t.text("workbench.context-onboarding.name-new-project"), globalThis.t.text("workbench.context-onboarding.project-suggestion-was-drawn-materials-name-summary-can")) + errorLine(error||journey.error)
      + '<div class="ob-name"><label class="ob-label" for="cx-project-title">' + globalThis.t.text("workbench.context-onboarding.project-name") + '</label><input id="cx-project-title" class="mw-input ob-name__input" data-plain-field value="' + esc(s.title) + '"></div>'
      + '<div class="ob-name"><div class="cx-actions"><span class="ob-label">' + globalThis.t.text("workbench.context-onboarding.work-summary") + '</span>' + btn({variant:'ghost', size:'sm', label:globalThis.t.text(editing ? "workbench.context-onboarding.done-editing" : "workbench.context-onboarding.edit-summary"), attrs:{'data-action':'edit'}}) + '</div>'
      + (editing ? '<textarea id="cx-summary-editor" class="mw-textarea cx-summary-editor" rows="10" maxlength="100000" aria-label="' + globalThis.t.text("workbench.context-onboarding.edit-summary") + '">' + esc(s.body) + '</textarea>' : '<div class="cx-summary">' + markdown(s.body) + '</div>') + '</div>'
      + '<p class="ob-note">' + glyph('note') + '<span>' + globalThis.t.text("workbench.context-onboarding.sources-sources-materials-n", {sources:picked().length, n:s.references.length}) + '</span></p>'
      + (s.references.length ? collapsible(globalThis.t.text("workbench.context-onboarding.based-these-materials-n", {n:s.references.length}), '<div class="cx-sources">' + s.references.map(r=>'<button type="button" class="cx-reference" data-cite="'+r.label+'"><span>'+globalThis.t.text("workbench.context-onboarding.label-version-version",{label:r.label,version:r.version})+'</span>'+esc(r.title)+'</button>').join('') + picked().filter(x=>x.error).map(x=>'<p class="cx-source-meta">'+globalThis.t.text(names[x.kind])+': '+esc(x.error)+'</p>').join('') + picked().map(issues).join('') + '</div>') : '')
      + '<div>' + btn({variant:'ghost', size:'md', icon:'undo', label:globalThis.t.text("workbench.context-onboarding.adjust-sources-redo"), attrs:{'data-action':'restart'}}) + '</div>';
    const right = briefPreview(s.title, s.body, {title:'接下来 · 待办草稿', body:draftsHtml || '<p class="mw-brief__quiet">' + globalThis.t.text("workbench.context-onboarding.no-todo-drafts") + '</p>'}, globalThis.t.text("workbench.context-onboarding.just-now-n-n", {n:s.references.length}));
    return {kind:'onboard', view:'review', step:'开始', left, right,
      bar:{start:exitButton() + stepsBar('开始'), center:barStatus({glyph:'check', title:todoPicked ? globalThis.t.text("workbench.context-onboarding.project-suggestion-ready-n-n", {n:picks}) : globalThis.t.text("workbench.context-onboarding.project-suggestion-ready"), caption:globalThis.t.text(todoPicked&&todoPicked.size?"workbench.context-onboarding.summary-source-snapshot-todos-checked-saved-together-project":"workbench.context-onboarding.summary-snapshot-its-sources-saved-project")}),
        end:secondary("workbench.context-onboarding.adjust-sources",'restart') + primary(busy ? "workbench.context-onboarding.saving" : todoPicked&&todoPicked.size ? globalThis.t.text("workbench.context-onboarding.use-count-count").replace('{count}',todoPicked.size) : "workbench.context-onboarding.use-start",'adopt',{disabled:busy})}};
  }
  function savingProject() {
    const saving = journey.phase === 'adopting';
    return {kind:'onboard', view:'saving', step:'开始',
      left:question(journey.adoption.title, globalThis.t.text(saving?"workbench.context-onboarding.saving-project-materials-please-wait":"workbench.context-onboarding.project-s-contents-confirmed-saving-again-resumes-same")) + errorLine(error||journey.error),
      right:briefPreview(journey.adoption.title, journey.adoption.body || '', {title:'接下来', body:'<p class="mw-brief__quiet">' + globalThis.t.text(saving?"workbench.context-onboarding.saving":"workbench.context-onboarding.waiting-finish-saving") + '</p>'}, globalThis.t.text("workbench.context-onboarding.just-now")),
      bar:{start:exitButton() + stepsBar('开始'), center:barStatus({spin:saving, glyph:'folder', title:globalThis.t.text(saving?"workbench.context-onboarding.saving-project-materials":"workbench.context-onboarding.project-contents-confirmed"), caption:globalThis.t.text("workbench.context-onboarding.one-moment")}), end:primary(saving?"workbench.context-onboarding.saving":"workbench.context-onboarding.finish-saving-project",'adopt',{disabled:busy||saving})}};
  }
  function blankForm() {
    const preview = briefPreview(blankName.trim() || globalThis.t.text("workbench.context-onboarding.new-project"), '', {title:'接下来', body:'<p class="mw-brief__quiet">' + globalThis.t.text("workbench.context-onboarding.when-plugin-has-something-move-confirm-will-show") + '</p>'}, globalThis.t.text("workbench.context-onboarding.just-now") + ' · ' + globalThis.t.text(materialsOnly ? "workbench.context-onboarding.bring-materials-already-read" : "workbench.context-onboarding.blank-project"));
    const left = question(globalThis.t.text("workbench.context-onboarding.name-new-project-2"), globalThis.t.text(materialsOnly?"workbench.context-onboarding.imported-materials-come-project-summary-can-be-written":"workbench.context-onboarding.start-space-materials-next-steps-can-follow"))
      + '<form id="cx-blank-form" class="ob-name"><label class="ob-label" for="cx-blank-name">' + globalThis.t.text("workbench.context-onboarding.project-name") + '</label><input class="mw-input ob-name__input" id="cx-blank-name" required autocomplete="off" data-plain-field placeholder="' + esc(globalThis.t.text("workbench.context-onboarding.example-autumn-content-plan")) + '" value="' + esc(blankName) + '"><p class="cx-error ob-error" role="alert">' + esc(failureText(error)) + '</p></form>'
      + (materialsOnly ? '' : '<p class="ob-quiet">' + globalThis.t.text("workbench.context-onboarding.not-sure-what-project-yet") + ' ' + btn({variant:'link', size:'sm', label:globalThis.t.text("workbench.context-onboarding.start-personal-space"), attrs:{'data-action':'personal', disabled:busy}}) + '</p>');
    return {kind:'onboard', view:'blank', step:'来源', left, right:preview,
      bar:{start:exitButton() + steps(stepLabels().length, -1), center:barStatus({glyph:'plus', title:globalThis.t.text(materialsOnly ? "workbench.context-onboarding.bring-materials-already-read" : "workbench.context-onboarding.blank-project"), caption:blankName.trim() ? globalThis.t.text("workbench.context-onboarding.will-create-name", {name:blankName.trim()}) : globalThis.t.text("workbench.context-onboarding.write-name-begin")}),
        end:secondary(materialsOnly ? "common.control.back" : "workbench.context-onboarding.bring-materials",'back') + btn({variant:'primary', size:'lg', type:'submit', label:globalThis.t.text(busy ? "workbench.context-onboarding.creating" : "workbench.context-onboarding.create-project"), key:'↵', cls:'ob-continue', disabled:busy, attrs:{form:'cx-blank-form', 'aria-keyshortcuts':'Enter'}})}};
  }

  /* ───────── Which screen ───────── */
  let loadError = '';
  function view() {
    if (introStep === 'opening') return opening();
    if (introStep === 'language') return language();
    if (introStep === 'appearance') return appearance();
    if (!journey && !loadError) return {kind:'onboard', view:'loading', step:'', html:'<div class="stage-single"><div class="stage-sheet" data-ob-view="loading"><div class="ob-error-page"><h1 id="ob-title" tabindex="-1">' + globalThis.t.text("workbench.context-onboarding.start-what-re-working") + '</h1><p role="status">' + globalThis.t.text("workbench.context-onboarding.checking-available-sources") + '</p></div></div></div>', bar:{start:exitButton(), center:'', end:''}};
    if (!journey) return {kind:'onboard', view:'error', step:'', html:'<div class="stage-single"><div class="stage-sheet" data-ob-view="error"><div class="ob-error-page">' + empty({icon:'circle-alert', title:globalThis.t.text("workbench.context-onboarding.onboarding-can-t-open-right-now"), body:failureText(loadError), action:btn({variant:'secondary', size:'md', label:globalThis.t.text("workbench.context-onboarding.reload"), attrs:{'data-action':'reload'}})}) + '</div></div></div>', bar:{start:exitButton(), center:'', end:''}};
    if (journey.requires_reselection) return {kind:'onboard', view:'reselect', step:'来源', left:question(globalThis.t.text("workbench.context-onboarding.continue-work"), journey.error), right:'<div class="ob-preview">' + empty({icon:'folder', title:globalThis.t.text("workbench.context-onboarding.materials-need-be-chosen-again"), body:globalThis.t.text("workbench.context-onboarding.last-time-s-materials-can-t-be-reused")}) + '</div>', bar:{start:exitButton() + stepsBar('来源'), center:'', end:primary("workbench.context-onboarding.choose-materials-again",'new-journey')}};
    if (journey.adoption) return savingProject();
    if (blank) return blankForm();
    const modelApi = globalThis.molisWorkOnboardingModel;
    const modelHere = journey.phase === 'selecting' || journey.phase === 'failed';
    if (modelApi && modelHere && !uploading && !readingLocal && (modelApi.active || (journey.phase === 'selecting' && journey.previewed && !reviewFiles))) {
      if (!modelApi.active) modelApi.ensure();
      const step = modelApi.view(); if (step) return step;
    }
    if (journey.phase === 'selecting') return journey.previewed && !blank ? scopeView() : sourcesView();
    return journey.summary ? review() : readingView();
  }
  /** The parts that depend on the stage only: the left (the question) and the right (what the choices make). */
  const stageHtml = model => model.html || split(model.view, model.left, model.right, model.rightCls);

  /* ───────── Drawing: the stage is replaced, the bar's blocks are changed one by one ───────── */
  let lastView = null, lastIndex = -1, barCache = {};
  const barSlot = {start:'.bar-start', center:'.bar-center', end:'.bar-end'};
  function paintBar(parts, animate) {
    for (const slot of Object.keys(barSlot)) {
      const html = parts[slot] || '', element = bar.querySelector(barSlot[slot]);
      if (barCache[slot] === html) continue;
      const had = barCache[slot] !== undefined;
      barCache[slot] = html;
      element.innerHTML = html;
      if (had && animate) [...element.children].forEach((child, i) => arrival.arrive(child, [{opacity:0, transform:'translateY(6px)'},{opacity:1, transform:'none'}], {duration:250, delay:i * 30}));
    }
    bar.dataset.bar = firstRun && introStep ? 'welcome' : 'onboard';
  }
  // A journey step leaves by fading back (130ms) and the next one slides in from its direction (420ms). Still mode paints the end.
  let paintGeneration = 0;
  function render(focus, part) {
    const token = ++paintGeneration;
    app.setAttribute('aria-busy',String(busy));
    const model = view(), moved = lastView !== null && model.view !== lastView, index = stepIndex(model.step), wasOpening = lastView === 'opening';
    frame.dataset.screen = model.kind;
    if (model.view === 'opening' && wasOpening) { paintBar(model.bar, false); return; }
    const forward = index >= lastIndex;
    const paint = () => {
      if (token !== paintGeneration) return;
      const keep = !moved ? [...app.querySelectorAll('[data-scroll]')].map(node => node.scrollTop) : [];
      const activeId = document.activeElement && app.contains(document.activeElement) ? document.activeElement.id : '';
      if (part === 'right' && !moved && model.right !== undefined && app.querySelector('.ob-right')) app.querySelector('.ob-right').innerHTML = model.right;
      else {
        app.innerHTML = stageHtml(model);
        if (keep.length) [...app.querySelectorAll('[data-scroll]')].forEach((node, i) => { if (keep[i]) node.scrollTop = keep[i]; });
      }
      if(error && typeof error==='object') app.querySelectorAll('.cx-error').forEach(node=>molisWorkRequest.show(node,error));
      if(!journey && loadError && typeof loadError==='object') molisWorkRequest.show(app.querySelector('.mw-empty p'),loadError);
      const right = app.querySelector('.ob-right'); if (right) right.classList.toggle('is-empty', Boolean(model.rightCls));
      app.querySelectorAll('[data-scroll]').forEach(pane => { if (!pane.querySelector('a[href], button, input, select, textarea, summary, [tabindex]')) { pane.tabIndex = 0; pane.setAttribute('role', 'region'); pane.setAttribute('aria-label', globalThis.t.text("workbench.context-onboarding.details")); } });
      paintBar(model.bar, true);
      app.querySelectorAll('.mw-check[data-mixed]').forEach(box => { box.indeterminate = true; });
      const content = app.firstElementChild;
      if (content && moved) arrival.arrive(content, [{opacity:0, transform:'translateX(' + (forward ? 22 : -22) + 'px)'},{opacity:1, transform:'none'}], {duration:420});
      lastView = model.view; lastIndex = index;
      if (focus) document.getElementById(focus)?.focus({preventScroll:true});
      else if (moved) document.getElementById('ob-title')?.focus({preventScroll:true});
      else if (activeId) document.getElementById(activeId)?.focus({preventScroll:true});
      if (model.view === 'opening' && !wasOpening) startOpening();
    };
    const leaving = moved && part !== 'right' ? app.firstElementChild : null;
    const leave = leaving && arrival.arrive(leaving, [{opacity:1, transform:'none'},{opacity:0, transform:'translateX(' + (forward ? -22 : 22) + 'px)'}], {duration:130, fill:'forwards'});
    if (leave) { leave.finished.then(paint).catch(paint); return; }
    paint();
  }
  globalThis.molisWorkOnboardingDraw = { readText, esc, btn, choice, question, note, stageHead, stepsBar, exitButton, primary, secondary, barStatus };
  globalThis.molisWorkOnboardingModelHost = {
    render,
    reload: async () => { try { config = await api('/api/onboarding/context'); } catch { /* the file step keeps the model line it had */ } },
    modelLabel: () => config.model || '',
    reviewFiles: () => { reviewFiles = true; },
    showModel: () => { reviewFiles = false; },
    problem: () => error ? failureText(error) : '',
    startOffer: () => {
      const total = selectionTotal(), missing = picked().some(s => !previewReady(s));
      return { label: config.ai_available ? '开始整理' : '先带入资料', disabled: !!(busy || missing || (!total.count && !picked().some(s => s.kind === 'gmail'))) };
    },
  };
  const refreshRight = () => render(undefined, 'right');
  function startOpening() {
    const wordmark = app.querySelector('.ob-greeting-wordmark [data-wordmark]'), titleMark = document.querySelector('.arrival-titlebar [data-wordmark]');
    if (titleMark) titleMark.style.visibility = 'hidden';
    const handle = arrival.typeWordmark(wordmark, {pace:'ritual', delay:400, onDone:() => app.querySelector('.opening')?.classList.add('is-done', 'is-ready')});
    arrival.mountCaption(app.querySelector('.opening-caption [data-caption]'));
    const glow = app.querySelector('.opening-glow'); arrival.arrive(glow, [{opacity:0},{opacity:1}], {duration:1600});
    openingHandle = handle;
    // The way on arrives a moment after the name is typed (about 2.9s), not after the caret has finished blinking.
    clearTimeout(readyTimer); readyTimer = setTimeout(() => app.querySelector('.opening')?.classList.add('is-ready'), 2900);
  }
  let openingHandle = null, readyTimer = 0;
  /** Any key or click ends the typing at once, and the way on is there. */
  function endOpeningTyping() {
    openingHandle?.skip?.(); clearTimeout(readyTimer);
    app.querySelector('.opening')?.classList.add('is-done', 'is-ready');
  }
  /** The opening ends by settling its wordmark into the title bar. */
  async function leaveOpening(next) {
    const big = app.querySelector('.ob-greeting-wordmark [data-wordmark]'), small = document.querySelector('.arrival-titlebar [data-wordmark]');
    openingHandle?.skip?.(); clearTimeout(readyTimer);
    if (small) { small.style.visibility = 'visible'; small.dataset.state = 'done'; }
    if (big && small && !arrival.still()) {
      small.style.visibility = 'hidden';
      app.querySelector('.opening-glow')?.animate([{opacity:1},{opacity:0}], {duration:640, fill:'forwards'});
      app.querySelector('.opening-caption')?.animate([{opacity:1},{opacity:0}], {duration:240, fill:'forwards'});
      await arrival.flyTo(big, small, {duration:640});
      small.style.visibility = 'visible';
    }
    setIntro(next); render();
  }

  function invalidateSource(s) { delete s.references;delete s.files;delete s.error;delete s.skipped;delete s.issues; }
  /** What typing or choosing changed: the right pane, the bar and each row's count, without redrawing the left (the focus is there). */
  function refreshSelection() {
    refreshRight();
    app.querySelectorAll('.ob-source').forEach(node => {
      const row = sourceRows().find(r => r.id === node.dataset.src), act = node.querySelector('.ob-source__act');
      if (!row || !act) return;
      act.outerHTML = rowAct(row);
      node.classList.toggle('has-items', rowCount(row) > 0);
    });
  }
  function save() {
    clearTimeout(inputTimer);
    const id=journey.id, sources=journey.sources.map(({references,issues,error,skipped,...s})=>JSON.parse(JSON.stringify(s))),autoStart=journey.auto_start===true,previewed=journey.previewed===true;
    const next=saveQueue.catch(()=>{}).then(()=>api('/api/onboarding/context/'+id+'/selection',{sources,auto_start:autoStart,previewed}));
    saveQueue=next; return next;
  }
  function preserveEdits() {
    if(!journey.summary)return;
    const name=document.getElementById('cx-project-title'), body=document.getElementById('cx-summary-editor');
    if(name)journey.summary.title=name.value;if(body)journey.summary.body=body.value;
  }
  function projectLocation() {
    // With todos added, the person starts from one of them; otherwise from the overview document.
    if (journey.todo && journey.todo.added && journey.todo.added.length) return route('/projects/'+encodeURIComponent(journey.project_id)+'/?openPlugin=todo');
    return route('/projects/'+encodeURIComponent(journey.project_id)+'/?openPlugin=pages&openItem='+encodeURIComponent(journey.document_id || '')+'&openTitle='+encodeURIComponent((journey.adoption?.title || journey.summary?.title || globalThis.t.text("workbench.context-onboarding.project"))+' · '+globalThis.t.text("workbench.context-onboarding.work-summary")));
  }
  async function poll() {
    clearTimeout(timer);
    try { journey=await api(endpoint()); if(journey.phase==='complete'){location.assign(projectLocation());return;} render();if(journey.phase==='reading'||journey.phase==='adopting')timer=setTimeout(poll,1800); }
    catch(e){error=keepFailure(e);render();timer=setTimeout(poll,5000);}
  }
  async function connect(auto=false) {
    if(!config.gmail_configured) { expanded='gmail';error=globalThis.t.text("workbench.context-onboarding.google-access-isn-t-ready-yet-use-other");render();return; }
    source('gmail').selected=true;journey.auto_start=auto;await save();
    const result=await api('/api/settings/connectors/methods/oauth/start',{service_id:'gmail',display_name:'Gmail',onboarding_id:journey.id,desktop});
    if(globalThis.molisWorkOpenExternalUrl){
      await globalThis.molisWorkOpenExternalUrl(result.authorization_url);journey.oauth_status='pending';render();authTimer=setTimeout(pollAuthorization,1500);
    }else location.assign(result.authorization_url);
  }
  async function pollAuthorization() {
    clearTimeout(authTimer);
    try {
      const latest=await api(endpoint());
      if(latest.oauth_status==='pending'){authTimer=setTimeout(pollAuthorization,1800);return;}
      journey=latest;config=await api('/api/onboarding/context');
      if(latest.oauth_status==='connected'){error='';if(journey.auto_start&&journey.phase==='selecting')await prepare();else if(journey.phase==='reading'||journey.phase==='adopting')await poll();}
      else error=journey.error||globalThis.t.text("workbench.context-onboarding.google-isn-t-connected-yet-try-again-use");
      render();
    }catch(e){error=keepFailure(e);render();authTimer=setTimeout(pollAuthorization,5000);}
  }
  async function refreshGrants() { if(native) for(const grant of await invoke('context_directory_status')) grants[grant.id]=grant; }
  async function authorize(kind) {
    const s=source(kind), old=grants[kind]?.path;
    grants[kind]=await invoke('context_directory_authorize',{id:kind});
    if(grants[kind].state==='ready') {
      if(old!==grants[kind].path){invalidateSource(s);delete s.metadata;s.excluded=[];}
      s.path=grants[kind].path;
    }
    await save();
  }
  async function metadata(s) {
    if(s.references?.length)return;
    try { s.metadata=await invoke('context_directory_preview',{id:s.kind,days:s.days??30});delete s.error; }
    catch(e){delete s.metadata;s.error=String(e?.message||e);await refreshGrants();}
  }
  async function prepare() {
    const wasBusy=busy;busy=true;
    try { await saveQueue; journey.auto_start=false; await refreshGrants();
    for(const s of picked()) {
      preparing=names[s.kind];render();
      if(directory(s)&&native){if(grants[s.kind]?.state!=='ready')await authorize(s.kind);if(ready(s))await metadata(s);}
    }
    preparing='';journey.previewed=true;reviewFiles=false;await save();
    const gmail=source('gmail');if(gmail?.selected&&!ready(gmail)&&config.gmail_configured&&!connected().length&&journey.oauth_status!=='pending')await connect(true);
    }finally{preparing='';busy=wasBusy;render();}
  }
  async function start() {
    globalThis.molisWorkOnboardingModel?.close();
    if(journey.phase==='selecting') {
      if(picked().some(s=>!previewReady(s)))throw new Error(globalThis.t.text("workbench.context-onboarding.complete-sources-skip-what-don-t-need-time"));
      // No limits (2026-10-22): each chosen file goes up on its own into the round's staging, and the selection names it by digest.
      const lists=[];
      for(const s of picked()) {
        if(s.references?.length)continue;
        const chosen=directory(s)?included(s):uploads.has(s.kind)?uploads.get(s.kind).filter(file=>included(s).some(f=>f.path===(file.webkitRelativePath||file.name))):[];
        if(chosen.length)lists.push([s,chosen]);
      }
      // Bytes say how far the upload has come, across every source; the page is drawn again at most four times a second.
      const files=lists.reduce((n,[,chosen])=>n+chosen.length,0),total=lists.reduce((n,[,chosen])=>n+chosen.reduce((m,f)=>m+(f.size||0),0),0);
      let k=0,sent=0,drawn=0;
      try{for(const [s,chosen] of lists) {
        readingLocal=names[s.kind];s.files=[];
        for(const item of chosen) {
          uploading={k:++k,n:files,done:sent,total};if(Date.now()-drawn>=250){drawn=Date.now();render();}
          // A folder's file goes from the desktop shell straight to the Host, in pieces; the page only gets its digest back.
          if(directory(s)){const file=await invoke('context_directory_stage',{id:s.kind,journey:journey.id,file:item});s.files.push(file.staged?{path:file.path,staged:file.staged}:{path:file.path,reason:file.reason||globalThis.t.text("workbench.context-onboarding.couldn-t-read-file")});}
          else{const staged=await molisWorkRequest(endpoint('files')+'?path='+encodeURIComponent(item.webkitRelativePath||item.name),{file:item,fallback:globalThis.t.text("workbench.context-onboarding.upload-failed-try-again")});s.files.push({path:staged.path,staged:staged.staged});}
          sent+=item.size||0;
        }
      }}finally{uploading=null;}
      readingLocal='';uploading=null;await save();
    }
    journey=await api(endpoint('start'),{});render();timer=setTimeout(poll,800);
  }
  async function restart() {
    const previous=journey?.sources || [];
    journey=await api('/api/onboarding/context',{id:crypto.randomUUID()});
    journey.sources=kinds.map(kind=>{const old=previous.find(s=>s.kind===kind);return {kind,selected:false,days:30,...(kind==='gmail'&&old?.connection_id?{connection_id:old.connection_id}:{})};});
    const url=new URL(location.href);url.searchParams.set('journey',journey.id);url.searchParams.delete('oauth');history.replaceState(null,'',url);blank=false;error='';todoPicked=null;await save();render();
  }
  async function reopen() {
    await saveQueue;journey=await api(endpoint('reopen'),{});journey.previewed=false;blank=false;error='';editing=false;todoPicked=null;render();
  }
  function saveDraft() {
    const id=journey.id, draft={title:journey.summary.title,body:journey.summary.body};
    const next=saveQueue.catch(()=>{}).then(()=>api('/api/onboarding/context/'+id+'/draft',draft));saveQueue=next;return next;
  }
  async function adopt(isBlank=false) {
    preserveEdits();await saveQueue;
    const accepted=journey.adoption;
    const name=accepted?.title ?? (isBlank?document.getElementById('cx-blank-name').value:journey.summary.title);
    journey=await api(endpoint('adopt'),{title:name,body:accepted?.body ?? (isBlank?'':journey.summary.body),blank:isBlank&&!materialsOnly,materials_only:materialsOnly,todo_selected:!isBlank&&todoPicked?[...todoPicked]:[]});
    blank=false;
    if(journey.phase==='complete')location.assign(projectLocation());else{error=journey.error||globalThis.t.text("workbench.context-onboarding.saving-didn-t-finish-try-again");render();}
  }
  /** A large folder arrives as one FileList. Count it in slices so the page can say how far that has come before it is saved. */
  async function acceptUpload(el) {
    const list = el.files, total = list.length, chosen = [];
    let bytes = 0, index = 0, drawn = 0;
    const take = file => {
      const path = file.webkitRelativePath || file.name;
      if (/(^|\/)(\.[^/]*|node_modules|vendor|dist|build)(\/|$)/.test(path) || !/\.(md|markdown|txt|csv|json|html?|pdf|docx)$/i.test(file.name)) return;
      chosen.push(file); bytes += file.size || 0;
    };
    if (total > 2500) {
      busy = true;
      while (index < total) {
        const end = Math.min(index + 2500, total);
        for (; index < end; index++) take(list[index]);
        counting = { done: index, total, kept: chosen.length, bytes };
        if (Date.now() - drawn >= 250 || index === total) { drawn = Date.now(); render(); await new Promise(resolve => setTimeout(resolve, 0)); }
      }
    } else for (let i = 0; i < total; i++) take(list[i]);
    if (!chosen.length) throw new Error(globalThis.t.text("workbench.context-onboarding.no-supported-files-found"));
    const added = chosen.length, s = source(el.dataset.upload);
    if (s.kind !== 'directory' && uploads.has(s.kind)) { const had = uploads.get(s.kind); chosen.unshift(...had.filter(f => !chosen.some(c => c.name === f.name && c.size === f.size))); }
    invalidateSource(s); uploads.set(s.kind, chosen);
    s.metadata = { files: chosen.map(f => ({ path: f.webkitRelativePath || f.name, size: f.size, modified_ms: f.lastModified, identity: 'upload' })), skipped: total - added, truncated: false };
    s.excluded = []; s.selected = true; error = '';
    if (total > 2500) { counting = { done: total, total, kept: added, bytes, saving: true }; render(); await new Promise(resolve => setTimeout(resolve, 0)); }
  }
  /** A source taken out of the list: nothing about it stays selected, read or remembered. */
  async function removeSource(kind) {
    const s=source(kind);invalidateSource(s);delete s.metadata;delete s.text;delete s.url;s.excluded=[];s.selected=false;uploads.delete(kind);
    await save();
  }

  /* ───────── What the person does ───────── */
  const root = frame;
  root.addEventListener('input',e=>{
    // 项目名称封顶 120 个字（码点）：maxlength 按 UTF-16 单元数，含两单元字的名称只能写到 60 个字。
    if(e.target.id==='cx-project-title'||e.target.id==='cx-blank-name'){const chars=[...e.target.value];if(chars.length>120)e.target.value=chars.slice(0,120).join('');}
    if(e.target.id==='cx-project-title'||e.target.id==='cx-summary-editor'){preserveEdits();const preview=app.querySelector('.ob-project-name');if(preview&&e.target.id==='cx-project-title')preview.textContent=e.target.value.trim()||globalThis.t.text("workbench.context-onboarding.new-project");return;}
    if(e.target.id==='cx-blank-name'){blankName=e.target.value;const typed=blankName.trim();const preview=app.querySelector('.ob-project-name');if(preview)preview.textContent=typed||globalThis.t.text("workbench.context-onboarding.new-project");const status=bar.querySelector('.mw-bar-status__text small');if(status)status.textContent=typed?globalThis.t.text("workbench.context-onboarding.will-create-name",{name:typed}):globalThis.t.text("workbench.context-onboarding.write-name-begin");return;}
    if(e.target.dataset.field&&e.target.tagName!=='SELECT'){
      const s=source(e.target.dataset.kind);if(s[e.target.dataset.field]!==e.target.value)invalidateSource(s);
      s[e.target.dataset.field]=e.target.value;if(s.kind==='browser'&&e.target.dataset.field==='text')s.selected=Boolean(s.text?.trim());refreshSelection();clearTimeout(inputTimer);inputTimer=setTimeout(()=>save().catch(e=>{error=keepFailure(e);render();}),400);
    }
  });
  root.addEventListener('change',async e=>{
    const el=e.target;
    if(!(el instanceof HTMLElement)||!app.contains(el))return;
    // Only what changes the selection is saved; leaving the name field, say, must not touch it (a journey already read refuses).
    let changed=false;
    try {
      if(el.dataset.draft){if(el.checked)todoPicked.add(el.dataset.draft);else todoPicked.delete(el.dataset.draft);render();return;}
      if(el.id==='cx-project-title'||el.id==='cx-summary-editor'){preserveEdits();await saveDraft();return;}
      if(el.dataset.filesAll!==undefined){const s=source(el.dataset.filesAll);if(!s.metadata.files.length)s.selected=el.checked;else{const all=included(s).length===s.metadata.files.length;invalidateSource(s);s.excluded=all?s.metadata.files.map(f=>f.path):[];}changed=true;}
      else if(el.dataset.field){const s=source(el.dataset.kind);invalidateSource(s);s[el.dataset.field]=el.dataset.field==='days'?Number(el.value):el.value;if(el.dataset.field==='connection_id')s.selected=Boolean(el.value);changed=true;}
      else if(el.dataset.file||el.dataset.folder){
        const s=source(el.dataset.file||el.dataset.folder);invalidateSource(s);const path=el.dataset.folder?el.dataset.path:s.metadata.files[Number(el.dataset.index)].path;
        let excluded=new Set(s.excluded||[]);
        if(el.checked){for(const p of excluded)if(p===path||p.startsWith(path+'/'))excluded.delete(p);if(el.dataset.file){for(const p of [...excluded])if(path.startsWith(p+'/')){excluded.delete(p);for(const f of s.metadata.files)if(f.path.startsWith(p+'/')&&f.path!==path)excluded.add(f.path);}}}
        else excluded.add(path);
        s.excluded=[...excluded];changed=true;
      } else if(el.dataset.upload){ await acceptUpload(el); changed=true; }
      if(changed)await save();
    }catch(e){error=keepFailure(e);}finally{busy=false;counting=null;if(changed||error)render(el.id);}
  });
  root.addEventListener('submit',async e=>{if(e.target.id!=='cx-blank-form')return;e.preventDefault();busy=true;try{await adopt(true);}catch(e){error=keepFailure(e);}finally{busy=false;render();}});
  root.addEventListener('click',async e=>{
    const link=e.target.closest('a[href^="/locale"]');
    if(link){return;}
    // Size and “未读取” sit outside the name's label; the whole row is the choice.
    const rowHit=e.target.closest('.mw-file-row'); if(rowHit && !e.target.closest('label,button,a,input')){const box=rowHit.querySelector('input.mw-check'); if(box){box.click(); return;}}
    const b=e.target.closest('button');if(!b||b.disabled)return;
    if(b.dataset.fold){if(folded.has(b.dataset.fold))folded.delete(b.dataset.fold);else folded.add(b.dataset.fold);render();return;}
    if(b.id==='cx-exit'){try{await saveQueue;if(firstRun)await api('/api/onboarding/dismiss',{kind:'first_run',user_confirmed:true});try{sessionStorage.removeItem(introKey);}catch{}location.assign(route('/'));}catch(err){error=keepFailure(err);render();}return;}
    if(b.id==='cx-theme'){const theme=document.documentElement.dataset.resolvedTheme==='dark'?'light':'dark';document.documentElement.dataset.theme=theme;document.documentElement.dataset.resolvedTheme=theme;try{localStorage.setItem('molis-work:theme',theme);}catch{}render();return;}
    if(b.dataset.open&&pickerOf(b.dataset.open)){document.getElementById('cx-upload-'+pickerOf(b.dataset.open))?.click();return;}
    if(b.dataset.open){expanded=expanded===b.dataset.open?null:b.dataset.open;render();const cfg=app.querySelector('.ob-source__cfg');arrival.arrive(cfg,[{opacity:0,transform:'translateY(-4px)'},{opacity:1,transform:'none'}],{duration:250});app.querySelector('#cx-browser-text')?.focus({preventScroll:true});return;}
    if(b.dataset.pick){
      const kind=b.dataset.pick, s=source(kind);
      busy=true; error=''; render();
      try {
        if(s.selected) s.selected=false;
        else if(grants[kind]?.state==='ready'){ await metadata(s); s.selected=Boolean(s.metadata); }
        else { await authorize(kind); if(grants[kind]?.state==='ready'){ await metadata(s); s.selected=Boolean(s.metadata); } }
        await save();
      } catch(err){ error=keepFailure(err); }
      finally { busy=false; render(); }
      return;
    }
    if(b.dataset.rangePick!==undefined){
      const days=Number(b.dataset.rangePick);
      busy=true; error=''; render();
      try {
        for(const kind of directories){
          const s=source(kind); if(!s) continue;
          const changed=(s.days??30)!==days; s.days=days;
          if(!changed||!s.selected||grants[kind]?.state!=='ready') continue;
          invalidateSource(s); delete s.metadata; s.excluded=[];
          await metadata(s); s.selected=Boolean(s.metadata);
        }
        await save();
      } catch(err){ error=keepFailure(err); }
      finally { busy=false; render(); }
      return;
    }
    if(b.dataset.remove){busy=true;render();try{await removeSource(b.dataset.remove);}catch(err){error=keepFailure(err);}finally{busy=false;render();}return;}
    if(b.dataset.cite){const ref=journey.summary.references.find(r=>r.label===b.dataset.cite);if(!ref)return;opener=b;
      // The text is staged on the Host, not in the journey; a long one shows its beginning here and is whole in Pages after adoption.
      let read;try{read=await api(endpoint('text/'+ref.text.sha256));}catch(err){error=keepFailure(err);render();return;}
      const shown=esc(read.text)+(read.chars>read.text.length?'<p class="cx-source-meta">'+esc(globalThis.t.text("workbench.context-onboarding.showing-first-shown-chars-characters-read-all-pages",{shown:read.text.length,chars:read.chars}))+'</p>':'');
      dialog.innerHTML='<h2 id="cx-dialog-title">'+esc(ref.title)+'</h2><div class="cx-source-meta">'+esc(globalThis.t.text("workbench.context-onboarding.path-version-version",{path:ref.path,version:ref.version}))+'</div><div class="cx-source-body">'+shown+'</div><div class="cx-actions">'+btn({variant:'secondary',size:'md',label:globalThis.t.text("common.control.close"),attrs:{'data-close':true}})+'</div>';dialog.showModal();return;}
    if(b.dataset.authorize||b.dataset.forget||b.dataset.refresh||b.dataset.skip||b.dataset.range||b.dataset.add){
      busy=true;error='';render();
      try{
        if(b.dataset.authorize){const kind=b.dataset.authorize;await authorize(kind);const s=source(kind);if(ready(s)){await metadata(s);s.selected=Boolean(s.metadata);}}
        else if(b.dataset.forget){const kind=b.dataset.forget;grants[kind]=await invoke('context_directory_forget',{id:kind});const s=source(kind);invalidateSource(s);delete s.metadata;delete s.path;s.selected=false;}
        else if(b.dataset.refresh){const s=source(b.dataset.refresh);folded.delete(s.kind);invalidateSource(s);await metadata(s);}
        else if(b.dataset.range){const s=source(b.dataset.range);folded.delete(s.kind);invalidateSource(s);s.days=Number(b.dataset.days);s.excluded=[];await metadata(s);}
        else if(b.dataset.skip)source(b.dataset.skip).selected=false;
        else if(b.dataset.add){journey.previewed=false;expanded=b.dataset.add==='directory'?'folder':b.dataset.add;}
        await save();
      }catch(err){error=keepFailure(err);}finally{busy=false;render();}return;
    }
    if(b.dataset.obTemplate){await globalThis.molisWorkOnboardingModel?.pick(b.dataset.obTemplate);return;}
    const action=b.dataset.action;if(!action)return;
    if (action === 'intro-next' || action === 'intro-back') {
      if (introStep === 'opening') { await leaveOpening('language'); return; }
      setIntro(action === 'intro-next' ? (introStep === 'language' ? 'appearance' : null) : (introStep === 'appearance' ? 'language' : 'appearance'));
      render();
      return;
    }
    if(action==='choose-account'){source('gmail').selected=true;expanded='gmail';render('cx-account');try{await save();}catch(err){error=keepFailure(err);render();}return;}
    if(action==='edit'){preserveEdits();if(editing){try{await saveDraft();}catch(err){error=keepFailure(err);render('cx-summary-editor');return;}}editing=!editing;render(editing?'cx-summary-editor':'cx-project-title');return;}
    if(action==='blank'||action==='materials-only'){materialsOnly=action==='materials-only';blank=true;error='';render('cx-blank-name');return;}
    if(action==='back'){blank=false;materialsOnly=false;error='';render();return;}
    if(action==='personal'){busy=true;render();try{await saveQueue;const result=await api('/api/onboarding/personal',{});location.assign(route(result.path));}catch(err){error=keepFailure(err);busy=false;render();}return;}
    if(action==='reload'){location.reload();return;}
    if(action==='model'||action==='model-back'||action==='model-save'){await globalThis.molisWorkOnboardingModel?.act(action);return;}
    busy=true;error='';b.disabled=true;
    try{if(action==='new-journey')await restart();else if(action==='resume'){await save();const url=new URL(location.href);url.searchParams.set('journey',config.resume.id);url.searchParams.delete('oauth');location.assign(url);}else if(action==='skip-auth'){clearTimeout(authTimer);source('gmail').selected=false;journey.auto_start=false;journey.oauth_status=undefined;await save();if(picked().length)await prepare();}else if(action==='sources'){journey.previewed=false;await save();}else if(action==='prepare')await prepare();else if(action==='connect')await connect(journey.previewed===true);else if(action==='start'||action==='retry')await start();else if(action==='restart')await reopen();else if(action==='adopt')await adopt();}
    catch(err){error=keepFailure(err);}finally{busy=false;render();}
  });
  dialog.addEventListener('click',e=>{if(e.target.closest('[data-close]'))dialog.close();});dialog.addEventListener('close',()=>opener?.focus());
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.isComposing || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
    const target = e.target;
    if (target !== document.body && target?.id !== 'ob-title') return;
    // On the opening the first Enter ends the typing; the way on is there once the name has been typed.
    const opening = introStep === 'opening' ? app.querySelector('.opening') : null;
    if (opening && !opening.classList.contains('is-ready')) { e.preventDefault(); endOpeningTyping(); return; }
    const next = bar.querySelector('.ob-continue:not(:disabled)');
    if (next) { e.preventDefault(); next.click(); }
  });
  // Any key or click ends the opening's typing early; Enter (or the button) goes on.
  document.addEventListener('keydown', e => { if (introStep === 'opening' && e.key !== 'Enter' && e.key !== 'Tab') endOpeningTyping(); });
  app.addEventListener('click', e => { if (introStep === 'opening' && !e.target.closest('button')) endOpeningTyping(); });

  /* ───────── A model connected while this journey is open: read it again when the stage is showing the step. ───────── */
  let otherTabs = null;
  try { otherTabs = new BroadcastChannel('molis-work:model-ready'); } catch (unavailable) { otherTabs = null; }
  if (otherTabs) otherTabs.onmessage = () => {
    api('/api/onboarding/context').then(latest => { config = latest; if (lastView === 'preview' || lastView === 'materials' || lastView === 'model') render(); }).catch(() => undefined);
  };

  /* ───────── Start ───────── */
  (async()=>{try{
    arrival.mountCaption(document.querySelector('.arrival-titlebar > [data-caption]'));
    const cold = (() => { try { if (sessionStorage.getItem('molis-work:arrived')) return false; sessionStorage.setItem('molis-work:arrived', '1'); return true; } catch { return true; } })();
    const mark = document.querySelector('.arrival-titlebar [data-wordmark]');
    if (introStep !== 'opening') { if (cold) arrival.typeWordmark(mark, {pace:'quick', delay:250}); else arrival.settleWordmark(mark); }
    config=await api('/api/onboarding/context');await refreshGrants();
    const url=new URL(location.href), id=url.searchParams.get('journey');
    if(id)journey=await api('/api/onboarding/context/'+encodeURIComponent(id));else await restart();
    if(journey.phase==='selecting')journey.sources=kinds.map(kind=>journey.sources.find(s=>s.kind===kind)||({kind,selected:false,days:30}));
    if(journey.phase==='selecting'){const gmail=source('gmail');if(gmail&&!gmail.connection_id&&connected().length===1)gmail.connection_id=connected()[0].connection_id;}
    if(url.searchParams.get('start')==='blank'||url.searchParams.get('name')){blank=true;blankName=(url.searchParams.get('name')||'').trim();}
    const oauth=url.searchParams.get('oauth');if(oauth==='failed'||oauth==='cancelled'||journey.oauth_status==='failed'){error=journey.error||globalThis.t.text("workbench.context-onboarding.google-isn-t-connected-yet-reconnect-untick-gmail");expanded='gmail';}
    render();if(desktop&&oauth&&!globalThis.molisWorkOpenExternalUrl){frame.dataset.screen='onboard';app.innerHTML='<div class="stage-single"><div class="stage-sheet"><div class="ob-error-page">'+empty({icon:oauth==='connected'?'check':'circle-alert',title:globalThis.t.text(oauth==='connected'?"workbench.context-onboarding.google-connected":"workbench.context-onboarding.google-not-connected"),body:globalThis.t.text("workbench.context-onboarding.return-molis-work-import-picks-up-where-was")})+'</div></div></div>';return;}if(journey.oauth_status==='pending'&&globalThis.molisWorkOpenExternalUrl)authTimer=setTimeout(pollAuthorization,1000);if(journey.phase==='complete')location.assign(projectLocation());else if(!journey.requires_reselection&&(journey.phase==='reading'||journey.phase==='adopting'))await poll();else if(oauth==='connected'&&journey.auto_start)await prepare();
  }catch(e){loadError=e;error=keepFailure(e);render();}})();
})();
`;
