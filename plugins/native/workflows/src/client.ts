/**
 * Workflows client: list, chain editor and run view. Runs inside the Workbench page like other native plugins.
 *
 * Views are drawn once and then patched in place, so an edit never resets scroll, focus or the embedded plugin,
 * and motion can say what changed: a station arrives, slides or leaves; a handoff travels down the run's chain.
 */
export const WORKFLOWS_CLIENT_FACTORY_SCRIPT = String.raw`(host) => {
  const root = document.querySelector('[data-workflows=workbench]');
  if (!root) return;
  const L = host.translate;
  const $ = (selector) => root.querySelector(selector);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tx = (value, vars) => esc(L(value, vars));
  const ico = (name) => '<svg aria-hidden="true"><use href="#icon-' + esc(name) + '"></use></svg>';
  const listEl = $('[data-wf-list]');
  const workspace = $('[data-wf-workspace]');
  const view = $('[data-wf-view]');
  const pop = $('[data-wf-pop]');
  const dialog = $('[data-wf-dialog]');
  const dialogForm = $('[data-wf-dialog-form]');
  const toastEl = $('[data-wf-toast]');
  const MOD = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '') ? '⌘' : 'Ctrl';
  const KIND_LABEL = { function: '模板转换', ai: 'AI', manual: '手动' };
  const KIND_HELP = {
    function: '按定好的规则，把上一步的结果变成下一步能直接用的内容，中间不再问人。',
    ai: 'AI 读上一步的结果，整理成下一步能接着用的内容。整理出的内容会留在这一次的记录里。',
    manual: '人看完这一步，自己决定交不交、交什么过去。',
  };
  const headers = () => typeof molisWorkControlHeaders === 'function' ? molisWorkControlHeaders() : { 'content-type': 'application/json' };
  async function api(path, body) {
    const response = await fetch(host.route('/api/workflows' + path), {
      method: body === undefined ? 'GET' : 'POST', cache: 'no-store', headers: headers(),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(result.error || L('工作流程请求失败')); error.code = result.code; error.status = response.status; throw error; }
    return result;
  }

  // ---------- motion ----------
  const calm = () => Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const EASE_OUT = 'cubic-bezier(.16, 1, .3, 1)';
  const EASE_SETTLE = 'cubic-bezier(.32, 1.22, .52, 1)';
  const EASE_STANDARD = 'cubic-bezier(.32, .72, 0, 1)';
  const motion = (el, frames, options) => (!el || !el.animate || calm()) ? null : el.animate(frames, { easing: EASE_OUT, ...options });
  /** Surface arrival: the shared 6px rise. */
  const arrive = (el) => {
    if (!el || calm()) return;
    el.classList.remove('is-arriving'); void el.offsetWidth; el.classList.add('is-arriving');
    el.addEventListener('animationend', () => el.classList.remove('is-arriving'), { once: true });
  };
  /** A smaller arrival for content that replaces content in the same place. */
  const settle = (el) => motion(el, [{ opacity: 0, transform: 'translateY(3px)' }, { opacity: 1, transform: 'none' }], { duration: 160 });

  let toastTimer = 0; let toastAction = null;
  const hideToast = () => {
    clearTimeout(toastTimer); toastAction = null;
    toastEl.classList.remove('is-on');
    setTimeout(() => { if (!toastEl.classList.contains('is-on')) toastEl.hidden = true; }, 200);
  };
  /** A short notice; with an action (撤销) it stays a little longer and can be clicked. */
  const toast = (message, tone, action) => {
    toastAction = action || null;
    toastEl.innerHTML = '<span>' + esc(message) + '</span>' + (action ? '<button type="button" class="wf-toast__action" data-wf-toast-action>' + esc(action.label) + '</button>' : '');
    toastEl.dataset.tone = tone || '';
    toastEl.classList.toggle('has-action', Boolean(action));
    toastEl.hidden = false;
    void toastEl.offsetWidth;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, action ? 6000 : 3200);
  };
  toastEl.addEventListener('click', (event) => {
    if (!event.target.closest('[data-wf-toast-action]') || !toastAction) return;
    const run = toastAction.run; hideToast(); run();
  });

  const state = {
    workflows: [], stations: [], ai: false, loaded: false, workflow: null, instances: [], instance: null, step: 0,
    saving: 0, handoff: null, busy: null, openLink: null, openGap: null, returnTo: null,
  };
  const stationInfo = (plugin) => state.stations.find((item) => item.plugin === plugin) || { plugin, label: plugin, icon: 'grid', supported: false };
  const label = (plugin) => L(stationInfo(plugin).label);
  const tint = (plugin) => 'var(--plugin-' + plugin + ', var(--muted))';
  const readiness = (link) => {
    const chain = [state.instance?.chain, state.workflow].find(chain => chain?.links.includes(link));
    const index = chain?.links.indexOf(link);
    if (chain && index >= 0) {
      const unavailable = chain.stations.slice(index, index + 2).find(station => station.availability?.available === false);
      if (unavailable) return { ready: false, reason: unavailable.availability.reason };
    }
    if (link.kind === 'manual') return { ready: true, reason: '' };
    if (link.kind === 'function') return link.body_template.trim() ? { ready: true, reason: '' } : { ready: false, reason: '还没写交接规则' };
    if (!link.instructions.trim()) return { ready: false, reason: '还没写 AI 要整理成什么' };
    if (!state.ai) return { ready: false, reason: '还没有可用的文字模型' };
    return { ready: true, reason: '' };
  };
  const manualLink = () => ({ kind: 'manual', title_template: '', body_template: '', instructions: '' });
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
  const when = (iso) => { if (!iso) return ''; const d = new Date(iso); const today = new Date(); return d.toDateString() === today.toDateString() ? d.toLocaleTimeString(document.documentElement.lang || undefined, { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString(document.documentElement.lang || undefined, { month: 'short', day: 'numeric' }); };

  // ---------- chain rules (mirrors model.ts) ----------
  const insertStation = (chain, gap, plugin, id) => {
    const stations = [...chain.stations]; const links = [...chain.links];
    const at = Math.max(0, Math.min(gap, stations.length));
    stations.splice(at, 0, { station_id: id || uid(), plugin });
    if (stations.length === 1) return { stations, links: [] };
    if (at === 0) links.unshift(manualLink()); else if (at === stations.length - 1) links.push(manualLink()); else links.splice(at, 0, manualLink());
    return { stations, links };
  };
  const removeStation = (chain, index) => {
    const last = chain.stations.length - 1;
    const stations = chain.stations.filter((_, i) => i !== index); const links = [...chain.links];
    if (links.length) links.splice(index === 0 ? 0 : index === last ? last - 1 : index, 1);
    return { stations, links };
  };
  const moveStation = (chain, from, gap) => {
    if (gap === from || gap === from + 1) return chain;
    const station = chain.stations[from];
    const removed = removeStation(chain, from);
    const at = gap > from ? gap - 1 : gap;
    const inserted = insertStation(removed, at, station.plugin);
    inserted.stations[at] = station;
    return inserted;
  };

  // ---------- data ----------
  async function loadList() {
    try {
      const result = await api('');
      state.workflows = result.workflows; state.stations = result.stations; state.ai = result.ai_available; state.loaded = true;
      renderList();
    } catch (error) { listEl.innerHTML = '<p class="wf-error">' + esc(error.message) + '</p>'; }
  }
  async function openWorkflow(id, { keepInstance = false } = {}) {
    const result = await api('/' + id);
    if (state.workflow?.workflow_id !== id) undoStack.length = 0;
    state.workflow = result.workflow; state.instances = result.instances; state.ai = result.ai_available;
    if (state.returnTo && state.returnTo.workflow !== id) state.returnTo = null;
    if (!keepInstance) state.instance = null;
    remember();
    setMode('workflow'); renderList(); renderWorkflow();
  }
  async function openInstance(id, step) {
    const result = await api('/instances/' + id);
    state.instance = result.instance; state.instanceWorkflowTitle = result.workflow_title; state.ai = result.ai_available;
    state.step = Number.isInteger(step) ? Math.min(step, result.instance.steps.length - 1) : result.instance.current;
    state.handoff = null; state.returnTo = null;
    remember();
    setMode('instance'); renderInstance();
  }
  const memoryKey = () => 'molis-workflows:' + host.route('/');
  const remember = () => { try { sessionStorage.setItem(memoryKey(), JSON.stringify({ workflow: state.workflow?.workflow_id || null, instance: state.instance?.instance_id || null, step: state.step })); } catch {} };
  const setMode = (mode) => {
    // The link editor belongs to the chain it was opened on; leaving that view closes it.
    if (pop.matches?.(':popover-open')) pop.hidePopover();
    if (mode === 'list') view.replaceChildren();
    root.dataset.wfMode = mode;
    const expanded = mode !== 'list';
    root.dataset.expanded = expanded ? 'true' : 'false';
    workspace.hidden = !expanded;
  };

  // ---------- list ----------
  function chainText(chain) {
    if (!chain.stations.length) return '<span class="wf-muted">' + tx('还没有站') + '</span>';
    return chain.stations.map((station, index) => (index ? '<i class="wf-mini-link" data-kind="' + chain.links[index - 1].kind + '">' + esc(L(KIND_LABEL[chain.links[index - 1].kind])) + '</i>' : '')
      + '<b style="--station-tint:' + tint(station.plugin) + '">' + esc(label(station.plugin)) + '</b>').join('');
  }
  function renderList() {
    if (!state.loaded) return;
    if (!state.workflows.length) {
      listEl.innerHTML = '<div class="mw-empty wf-empty"><span class="mw-empty__mark">' + ico('workflow') + '</span><strong>' + tx('还没有工作流程') + '</strong>'
        + '<p>' + tx('把已有插件按顺序串起来，定好上一步的结果怎样交给下一步。每走一次都会留下这一次自己的内容。') + '</p>'
        + '<p class="wf-example"><b>Feed</b><i>' + tx('手动') + '</i><b>Inbox</b><i>AI</i><b>Pages</b></p>'
        + '<div class="mw-empty__actions"><button class="mw-btn mw-btn--ghost" type="button" data-wf-action="example">' + ico('sparkles') + '<span>' + tx('用这个例子新建') + '</span></button></div></div>';
      return;
    }
    listEl.innerHTML = '<nav class="mw-dir__list wf-rows" aria-label="' + tx('工作流程') + '">' + state.workflows.map((flow) => {
      const selected = state.workflow?.workflow_id === flow.workflow_id;
      const runs = flow.instance_count ? L('{count} 次', { count: flow.instance_count }) + (flow.active_count ? ' · ' + L('{count} 次进行中', { count: flow.active_count }) : '') : L('还没走过');
      const live = flow.active_count ? '<i class="wf-row__live" title="' + esc(L('{count} 次进行中', { count: flow.active_count })) + '"></i>' : '';
      return '<button type="button" class="wf-row directory-list-row' + (selected ? ' is-selected' : '') + '" data-wf-open="' + esc(flow.workflow_id) + '"' + (selected ? ' aria-current="page"' : '') + '>'
        + '<span class="wf-row__title"><span>' + esc(flow.title) + '</span>' + live + '</span><span class="wf-row__chain">' + chainText(flow) + '</span><span class="wf-row__meta">' + esc(runs) + '</span></button>';
    }).join('') + '</nav>';
  }

  // ---------- workflow editor ----------
  function chainIssues(chain) {
    return chain.links.map((link, index) => ({ index, link, state: readiness(link) })).filter((item) => !item.state.ready);
  }
  function stationHtml(station, index, count) {
    const info = stationInfo(station.plugin); const name = label(station.plugin);
    return '<div class="wf-station" role="listitem" tabindex="0" draggable="true" data-wf-station="' + index + '" data-station-id="' + esc(station.station_id) + '" style="--station-tint:' + tint(station.plugin) + '"'
      + ' aria-label="' + esc(L('{plugin} · 第 {n} 站', { plugin: name, n: index + 1 })) + '" aria-description="' + esc(L('拖动或用 {mod} ← → 调顺序，Delete 拿掉', { mod: MOD === '⌘' ? '⌥' : 'Alt +' })) + '">'
      + '<span class="wf-station__icon">' + ico(info.icon) + '</span><span class="wf-station__name">' + esc(name) + '</span>'
      + (station.availability?.available === false ? '<span class="wf-station__warning" role="img" aria-label="' + esc(station.availability.reason) + '" title="' + esc(station.availability.reason) + '">' + ico('alert') + '</span>' : '')
      + '<span class="wf-station__tools">'
      + (index > 0 ? '<button type="button" class="wf-tool" tabindex="-1" data-wf-action="move" data-from="' + index + '" data-gap="' + (index - 1) + '" aria-label="' + tx('往前挪') + '" title="' + tx('往前挪') + '">' + ico('chevron-left') + '</button>' : '')
      + (index < count - 1 ? '<button type="button" class="wf-tool" tabindex="-1" data-wf-action="move" data-from="' + index + '" data-gap="' + (index + 2) + '" aria-label="' + tx('往后挪') + '" title="' + tx('往后挪') + '">' + ico('chevron-right') + '</button>' : '')
      + '<button type="button" class="wf-tool wf-tool--danger" tabindex="-1" data-wf-action="remove" data-index="' + index + '" aria-label="' + tx('拿掉这一站') + '" title="' + tx('拿掉这一站') + '">' + ico('x') + '</button>'
      + '</span></div>';
  }
  function linkHtml(flow, index) {
    const link = flow.links[index]; const ready = readiness(link);
    const from = flow.stations[index]; const to = flow.stations[index + 1];
    const between = label(from.plugin) + ' → ' + label(to.plugin);
    const open = state.openLink === index;
    return '<div class="wf-link' + (state.openGap === index + 1 ? ' is-picking' : '') + '" data-wf-gap="' + (index + 1) + '" data-link-key="' + esc(from.station_id + '>' + to.station_id) + '" data-kind="' + link.kind + '" data-ready="' + ready.ready + '">'
      + '<span class="wf-link__line" aria-hidden="true"></span>'
      + '<button type="button" class="wf-link__pill' + (open ? ' is-open' : '') + '" data-wf-action="link" data-link="' + index + '" aria-haspopup="dialog" aria-expanded="' + open + '" aria-label="' + esc(between + ' · ' + L(KIND_LABEL[link.kind]) + (ready.ready ? '' : ' · ' + L('未接上'))) + '">'
      + (ready.ready ? '' : ico('alert')) + '<span>' + esc(L(KIND_LABEL[link.kind])) + '</span></button>'
      + '<button type="button" class="wf-add" data-wf-action="gap" data-gap="' + (index + 1) + '" aria-label="' + esc(L('在 {a} 和 {b} 之间加入插件', { a: label(from.plugin), b: label(to.plugin) })) + '" title="' + tx('在这里加入插件') + '">' + ico('plus') + '</button>'
      + '<span class="wf-link__line" aria-hidden="true"></span></div>';
  }
  function chainInner(flow) {
    if (!flow.stations.length) {
      return '<div class="wf-drop' + (state.openGap === 0 ? ' is-picking' : '') + '" data-wf-gap="0"><span class="wf-drop__mark">' + ico('workflow') + '</span>'
        + '<button type="button" class="mw-btn mw-btn--ghost" data-wf-action="gap" data-gap="0">' + ico('plus') + '<span>' + tx('加入第一站') + '</span></button><span class="wf-muted">' + tx('也可以把下面的插件拖到这里') + '</span></div>';
    }
    const end = (gap, name) => '<div class="wf-end' + (state.openGap === gap ? ' is-picking' : '') + '" data-wf-gap="' + gap + '"><button type="button" class="wf-add" data-wf-action="gap" data-gap="' + gap + '" aria-label="' + tx(name) + '" title="' + tx(name) + '">' + ico('plus') + '</button></div>';
    const parts = [end(0, '在开头加入插件')];
    flow.stations.forEach((station, index) => {
      parts.push(stationHtml(station, index, flow.stations.length));
      if (index < flow.links.length) parts.push(linkHtml(flow, index));
    });
    parts.push(end(flow.stations.length, '在末尾加入插件'));
    return parts.join('');
  }
  function issuesHtml(flow) {
    const issues = chainIssues(flow);
    if (!issues.length) return '';
    return '<p class="wf-issues" role="status">' + ico('alert') + '<span>' + esc(L('{count} 段还没接上：', { count: issues.length })) + issues.map((item) => {
      const message = esc(label(flow.stations[item.index].plugin) + ' → ' + label(flow.stations[item.index + 1].plugin) + '（' + L(item.state.reason) + '）');
      if (flow.stations.slice(item.index, item.index + 2).some(station => station.availability?.available === false)) return '<span>' + message + '</span>';
      return '<button type="button" class="wf-issue" data-wf-action="link" data-link="' + item.index + '">' + message + '</button>';
    }).join('<span aria-hidden="true">；</span>') + '</span></p>';
  }
  function runStatus(run) {
    if (run.status === 'done') return { tone: 'done', text: L('已走完') };
    if (run.status === 'stopped') return { tone: 'quiet', text: L('已结束 · 停在第 {n} 步', { n: run.current + 1 }) };
    return { tone: 'progress', text: L('第 {n}/{total} 步 · {plugin}', { n: run.current + 1, total: run.chain.stations.length, plugin: label(run.chain.stations[run.current].plugin) }) };
  }
  function pipsHtml(run) {
    return '<span class="wf-pips" aria-hidden="true">' + run.chain.stations.map((station, i) => '<i data-state="' + stepState(run, i) + '" style="--station-tint:' + tint(station.plugin) + '"></i>').join('') + '</span>';
  }
  function runsHtml(flow) {
    const unavailable = flow.stations.find(station => station.availability?.available === false);
    const canStart = flow.stations.length >= 2 && !unavailable;
    const startReason = unavailable ? unavailable.availability.reason : L('至少要有两站才能开始');
    const head = '<div class="wf-section__head"><h2>' + tx('走过的每一次') + '</h2><span class="wf-muted">' + esc(state.instances.length ? L('{count} 次', { count: state.instances.length }) : '') + '</span>'
      + '<button class="mw-btn mw-btn--primary" type="button" data-wf-action="start"' + (canStart ? '' : ' disabled title="' + esc(startReason) + '"') + '>' + ico('play') + '<span>' + tx('开始一次') + '</span></button></div>';
    if (!state.instances.length) {
      return head + '<p class="wf-muted wf-runs-empty">' + esc(unavailable ? L('先恢复不可用的站点，再开始第一次。') : canStart ? L('还没走过。开始一次时，先在 {plugin} 里选这一次的内容。', { plugin: label(flow.stations[0].plugin) }) : L('先把至少两站排好，再开始第一次。')) + '</p>';
    }
    return head + '<div class="wf-runs">' + state.instances.map((run) => {
      const status = runStatus(run);
      return '<button type="button" class="wf-run-row" data-wf-open-instance="' + esc(run.instance_id) + '"><span class="wf-run-row__title">' + esc(run.title) + '</span>' + pipsHtml(run)
        + '<span class="mw-status mw-status--' + status.tone + ' mw-status--plain">' + esc(status.text) + '</span><span class="wf-muted">' + esc(when(run.updated_at)) + '</span></button>';
    }).join('') + '</div>';
  }
  function returnHtml() {
    if (!state.returnTo) return '';
    return '<button class="mw-btn mw-btn--ghost wf-return" type="button" data-wf-action="return-to-run">' + ico('back') + '<span>' + esc(L('回到「{title}」', { title: state.returnTo.title })) + '</span></button>';
  }
  function paletteHtml() {
    const joinable = state.stations.filter((info) => info.supported);
    const others = state.stations.filter((info) => !info.supported);
    return joinable.map((info) => '<button type="button" class="wf-chip" draggable="true" data-wf-plugin="' + esc(info.plugin) + '" data-wf-action="append" title="' + tx('拖到链上，或点一下加到末尾') + '" style="--station-tint:' + tint(info.plugin) + '">' + ico(info.icon) + '<span>' + esc(L(info.label)) + '</span></button>').join('')
      + (others.length ? '<span class="wf-palette__others" title="' + esc(others.map((info) => L(info.label)).join('、')) + '">' + esc(L('其余 {count} 个插件暂不能串进流程', { count: others.length })) + '</span>' : '');
  }
  function renderWorkflow() {
    const flow = state.workflow;
    if (!flow) return;
    const current = view.querySelector('.wf-editor');
    if (current && current.dataset.id === flow.workflow_id) { patchWorkflow(current); return; }
    view.innerHTML = '<article class="wf-editor" data-id="' + esc(flow.workflow_id) + '">'
      + '<header class="plugin-stage-detail-bar wf-editor__bar"><button class="plugin-stage-back" type="button" data-wf-action="back" aria-label="' + tx('返回流程列表') + '" title="' + tx('返回流程列表') + '">' + ico('chevron-right') + '</button>'
      + '<input class="mw-input wf-title-input" data-wf-title data-inline-title value="' + esc(flow.title) + '" aria-label="' + tx('流程名称') + '" maxlength="120">'
      + '<span class="wf-return-slot" data-wf-return>' + returnHtml() + '</span>'
      + '<span class="wf-save-state" data-wf-save-state data-state="idle" aria-live="polite">' + tx('已保存') + '</span>'
      + '<button class="mw-btn mw-btn--ghost wf-danger" type="button" data-wf-action="delete">' + ico('trash') + '<span>' + tx('删除流程') + '</span></button></header>'
      + '<div class="wf-editor__scroll">'
      + '<section class="wf-section"><h2>' + tx('顺序与交接') + '</h2><p class="wf-hint">' + tx('插件是站，两站之间是衔接。点衔接换方式；点 + 或把插件拖到两站中间来加入。') + '</p>'
      + '<div class="wf-chain' + (flow.stations.length ? '' : ' is-empty') + '" data-wf-chain' + (flow.stations.length ? ' role="list"' : '') + ' aria-label="' + tx('流程顺序') + '">' + chainInner(flow) + '</div>'
      + '<div class="wf-issues-slot" data-wf-issues>' + issuesHtml(flow) + '</div>'
      + '<div class="wf-palette" aria-label="' + tx('可以加入的插件') + '"><span class="wf-palette__label">' + tx('插件') + '</span>' + paletteHtml() + '</div></section>'
      + '<section class="wf-section" data-wf-runs>' + runsHtml(flow) + '</section></div></article>';
    arrive(view.querySelector('.wf-editor'));
  }
  let pendingFocus = null;
  function patchWorkflow(editor) {
    const flow = state.workflow;
    const title = editor.querySelector('[data-wf-title]');
    if (title && document.activeElement !== title && title.value !== flow.title) title.value = flow.title;
    editor.querySelector('[data-wf-return]').innerHTML = returnHtml();
    patchChain(editor.querySelector('[data-wf-chain]'));
    const issues = editor.querySelector('[data-wf-issues]');
    const hadIssues = Boolean(issues.firstElementChild);
    issues.innerHTML = issuesHtml(flow);
    if (!hadIssues && issues.firstElementChild) settle(issues.firstElementChild);
    editor.querySelector('[data-wf-runs]').innerHTML = runsHtml(flow);
  }
  /** Redraw the chain, then let each station travel from where it was; new ones arrive, changed handoffs settle. */
  function patchChain(chainEl) {
    const flow = state.workflow;
    const before = new Map(); chainEl.querySelectorAll('[data-station-id]').forEach((el) => before.set(el.dataset.stationId, el.getBoundingClientRect()));
    const links = new Map(); chainEl.querySelectorAll('[data-link-key]').forEach((el) => links.set(el.dataset.linkKey, el.dataset.kind + ':' + el.dataset.ready));
    const focused = document.activeElement?.closest?.('[data-station-id]');
    const focusId = pendingFocus || (focused && chainEl.contains(focused) ? focused.dataset.stationId : null);
    pendingFocus = null;
    const empty = !flow.stations.length;
    chainEl.classList.toggle('is-empty', empty);
    if (empty) chainEl.removeAttribute('role'); else chainEl.setAttribute('role', 'list');
    chainEl.innerHTML = chainInner(flow);
    let arrived = null;
    chainEl.querySelectorAll('[data-station-id]').forEach((el) => {
      const was = before.get(el.dataset.stationId);
      if (!was) {
        arrived = el;
        motion(el, [{ opacity: 0, transform: 'scale(.88)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: EASE_SETTLE });
        return;
      }
      const dx = was.left - el.getBoundingClientRect().left;
      if (Math.abs(dx) > 1) motion(el, [{ transform: 'translateX(' + dx + 'px)' }, { transform: 'none' }], { duration: 260 });
    });
    chainEl.querySelectorAll('[data-link-key]').forEach((el) => {
      const was = links.get(el.dataset.linkKey);
      const now = el.dataset.kind + ':' + el.dataset.ready;
      if (was === undefined) motion(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 190, delay: 60, fill: 'backwards' });
      else if (was !== now) motion(el.querySelector('.wf-link__pill'), [{ transform: 'scale(.86)', opacity: .4 }, { transform: 'none', opacity: 1 }], { duration: 220, easing: EASE_SETTLE });
    });
    if (arrived) arrived.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: calm() ? 'auto' : 'smooth' });
    if (focusId) chainEl.querySelector('[data-station-id="' + focusId + '"]')?.focus({ preventScroll: true });
  }

  // ---------- saving the chain ----------
  let saveQueue = Promise.resolve();
  let saveShowTimer = 0;
  function setSaveState(mode) {
    const el = view.querySelector('[data-wf-save-state]');
    if (!el) return;
    el.dataset.state = mode;
    el.innerHTML = mode === 'saving' ? '<span class="mw-spinner" aria-hidden="true"></span><span>' + tx('正在保存…') + '</span>' : (mode === 'saved' ? ico('check') : '') + '<span>' + tx('已保存') + '</span>';
  }
  const undoStack = [];
  const configured = (link) => link.kind !== 'manual' || Boolean(link.title_template || link.body_template || link.instructions);
  /** Put the chain back as it was before the last change to its order, stations or handoff types. */
  function undo() {
    const flow = state.workflow;
    const last = undoStack.pop();
    if (!flow || !last || last.id !== flow.workflow_id) { undoStack.length = 0; return false; }
    if (pop.matches(':popover-open')) pop.hidePopover();
    saveWorkflow({ chain: last.chain, undo: true });
    toast(L('已撤回这次改动'));
    return true;
  }
  function saveWorkflow(patch) {
    const flow = state.workflow;
    if (!flow) return;
    if (patch.chain && patch.undoable) {
      undoStack.push({ id: flow.workflow_id, chain: JSON.parse(JSON.stringify({ stations: flow.stations, links: flow.links })) });
      if (undoStack.length > 30) undoStack.shift();
    }
    const lost = patch.chain && patch.undoable ? flow.links.filter(configured).length - patch.chain.links.filter(configured).length : 0;
    Object.assign(flow, patch.chain || {}, patch.title !== undefined ? { title: patch.title } : {});
    renderWorkflow(); renderList();
    if (patch.announce) toast(patch.announce, '', { label: L('撤销'), run: undo });
    else if (lost > 0) toast(L('{count} 段交接变回了手动', { count: lost }), '', { label: L('撤销'), run: undo });
    state.saving += 1;
    // Quick saves never flash a spinner; only a slow one says it is still saving.
    clearTimeout(saveShowTimer); saveShowTimer = setTimeout(() => { if (state.saving) setSaveState('saving'); }, 260);
    saveQueue = saveQueue.then(async () => {
      try {
        const body = { revision: state.workflow.revision };
        if (patch.chain) body.chain = { stations: state.workflow.stations, links: state.workflow.links };
        if (patch.title !== undefined) body.title = state.workflow.title;
        const result = await api('/' + flow.workflow_id, body);
        state.workflow.revision = result.workflow.revision;
        const row = state.workflows.find((item) => item.workflow_id === flow.workflow_id);
        if (row) Object.assign(row, result.workflow);
      } catch (error) {
        toast(error.message, 'error');
        await openWorkflow(flow.workflow_id).catch(() => undefined);
      } finally {
        state.saving -= 1;
        if (!state.saving) { clearTimeout(saveShowTimer); setSaveState('saved'); }
      }
    });
  }
  const chainOf = () => ({ stations: [...state.workflow.stations], links: [...state.workflow.links] });
  async function removeAt(index, { keyboard = false } = {}) {
    const flow = state.workflow; if (!flow) return;
    const el = view.querySelector('[data-wf-chain] [data-wf-station="' + index + '"]');
    const leaving = motion(el, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.88)' }], { duration: 130, easing: EASE_STANDARD, fill: 'forwards' });
    // The exit is a courtesy: never let an unpainted frame hold the edit back.
    if (leaving) await Promise.race([leaving.finished.catch(() => undefined), new Promise((resolve) => setTimeout(resolve, 180))]);
    if (keyboard) { const next = flow.stations[index + 1] || flow.stations[index - 1]; pendingFocus = next ? next.station_id : null; }
    saveWorkflow({ chain: removeStation(chainOf(), index), undoable: true, announce: L('已拿掉 {plugin}', { plugin: label(flow.stations[index].plugin) }) });
  }
  function insertAt(gap, plugin, { focus = false } = {}) {
    const id = uid();
    if (focus) pendingFocus = id;
    saveWorkflow({ chain: insertStation(chainOf(), gap, plugin, id), undoable: true });
  }
  function moveTo(from, gap, { focus = false } = {}) {
    const station = state.workflow.stations[from];
    if (focus && station) pendingFocus = station.station_id;
    saveWorkflow({ chain: moveStation(chainOf(), from, gap), undoable: true });
  }

  // ---------- popovers ----------
  let popAnchor = null;
  function positionPop(anchor) {
    const box = anchor.getBoundingClientRect(); const size = pop.getBoundingClientRect();
    const left = Math.max(12, Math.min(window.innerWidth - size.width - 12, box.left + box.width / 2 - size.width / 2));
    const below = box.bottom + 8 + size.height < window.innerHeight - 12;
    pop.style.left = left + 'px';
    pop.style.top = (below ? box.bottom + 8 : Math.max(12, box.top - size.height - 8)) + 'px';
    pop.dataset.side = below ? 'below' : 'above';
  }
  function placePop(anchorOf) {
    popAnchor = anchorOf;
    const anchor = anchorOf();
    if (!anchor) return;
    if (!pop.matches(':popover-open')) pop.showPopover?.();
    positionPop(anchor);
  }
  /** Content grew or shrank: stay where the eye already is, only shift to stay on screen. */
  function keepPopInView() {
    const box = pop.getBoundingClientRect();
    if (box.bottom > window.innerHeight - 12) pop.style.top = Math.max(12, window.innerHeight - 12 - box.height) + 'px';
  }
  function repositionPop() {
    if (!pop.matches?.(':popover-open') || !popAnchor) return;
    const anchor = popAnchor();
    if (!anchor || !anchor.isConnected) { pop.hidePopover(); return; }
    const box = anchor.getBoundingClientRect();
    if (box.bottom < 0 || box.top > window.innerHeight) { pop.hidePopover(); return; }
    positionPop(anchor);
  }
  const pillOf = (index) => () => view.querySelector('[data-wf-chain] [data-wf-action=link][data-link="' + index + '"]');
  const gapButtonOf = (gap) => () => view.querySelector('[data-wf-chain] [data-wf-action=gap][data-gap="' + gap + '"]');
  function markOpen() {
    view.querySelectorAll('[data-wf-chain] .wf-link__pill').forEach((pill) => {
      const open = Number(pill.dataset.link) === state.openLink;
      pill.classList.toggle('is-open', open); pill.setAttribute('aria-expanded', String(open));
    });
    view.querySelectorAll('[data-wf-chain] [data-wf-gap]').forEach((gap) => gap.classList.toggle('is-picking', Number(gap.dataset.wfGap) === state.openGap));
  }
  function openGapPicker(gap) {
    const chain = state.workflow;
    const before = chain.stations[gap - 1]; const after = chain.stations[gap];
    const heading = before && after ? L('加入到 {a} 和 {b} 之间', { a: label(before.plugin), b: label(after.plugin) }) : before ? L('加在 {a} 后面', { a: label(before.plugin) }) : after ? L('加在 {a} 前面', { a: label(after.plugin) }) : L('加入第一站');
    const others = state.stations.filter((info) => !info.supported);
    state.openLink = null; state.openGap = gap;
    pop.dataset.mode = 'gap';
    pop.innerHTML = '<header class="wf-pop__head"><strong>' + esc(heading) + '</strong></header><div class="wf-pop__list" role="listbox" aria-label="' + esc(heading) + '">'
      + state.stations.filter((info) => info.supported).map((info) => '<button type="button" class="wf-pop__item" role="option" data-wf-action="insert" data-plugin="' + esc(info.plugin) + '" data-gap="' + gap + '" style="--station-tint:' + tint(info.plugin) + '">'
        + '<span class="wf-station__icon">' + ico(info.icon) + '</span><span>' + esc(L(info.label)) + '</span></button>').join('')
      + '</div>' + (others.length ? '<p class="wf-hint" title="' + esc(others.map((info) => L(info.label)).join('、')) + '">' + esc(L('其余 {count} 个插件暂不能串进流程', { count: others.length })) + '</p>' : '');
    markOpen();
    placePop(gapButtonOf(gap));
    pop.querySelector('.wf-pop__item')?.focus();
  }
  let linkTimer = 0;
  function linkFieldsHtml(link) {
    const field = (name, title, value, rows, placeholder) => '<label class="mw-field"><span class="mw-field__label">' + tx(title) + '</span>'
      + (rows === 1 ? '<input class="mw-input" data-wf-link-field="' + name + '" value="' + esc(value) + '" placeholder="' + tx(placeholder) + '">' : '<textarea class="mw-textarea" rows="' + rows + '" data-wf-link-field="' + name + '" placeholder="' + tx(placeholder) + '">' + esc(value) + '</textarea>') + '</label>';
    if (link.kind === 'function') {
      return field('title_template', '标题规则', link.title_template, 1, '{标题}') + field('body_template', '正文规则', link.body_template, 5, '例如：来源：{来源}\n链接：{链接}\n\n{正文}')
        + '<p class="wf-tokens"><span>' + tx('点选插入') + '</span>' + ['标题', '正文', '来源', '链接', '日期'].map((name) => '<button type="button" class="wf-token" data-wf-token="{' + name + '}" title="' + tx('插入到正文规则') + '">{' + esc(name) + '}</button>').join('') + '</p>'
        + '<p class="wf-hint">' + tx('标题规则留空时沿用上一步的标题。') + '</p>';
    }
    if (link.kind === 'ai') return field('instructions', '要整理成什么', link.instructions, 4, '例如：整理成一页说明，分成背景、要点和待确认的问题，保留原文链接。');
    return '<p class="wf-hint">' + tx('走到这里时会停下来，人看完上一步的内容，改好要交的标题和正文，再决定交不交。') + '</p>';
  }
  function returnFootHtml(ready) {
    if (!state.returnTo) return '';
    return '<footer class="wf-pop__foot"><button class="mw-btn mw-btn--primary" type="button" data-wf-action="return-to-run" data-wf-return-button' + (ready.ready ? '' : ' disabled') + '>' + ico('arrow') + '<span>' + esc(L('回到「{title}」继续', { title: state.returnTo.title })) + '</span></button></footer>';
  }
  function openLinkEditor(index) {
    const flow = state.workflow; const link = flow.links[index];
    const from = label(flow.stations[index].plugin); const to = label(flow.stations[index + 1].plugin);
    const ready = readiness(link);
    state.openLink = index; state.openGap = null;
    pop.dataset.mode = 'link'; pop.dataset.link = String(index);
    pop.innerHTML = '<header class="wf-pop__head"><strong>' + esc(from + ' → ' + to) + '</strong><span class="wf-muted">' + tx('这一段的交接') + '</span></header>'
      + '<div class="mw-toggle-group wf-kinds" role="radiogroup" aria-label="' + tx('交接方式') + '">'
      + ['function', 'ai', 'manual'].map((kind) => '<button type="button" class="mw-toggle' + (kind === link.kind ? ' is-current' : '') + '" role="radio" aria-checked="' + (kind === link.kind) + '" data-wf-action="kind" data-kind="' + kind + '" data-link="' + index + '">' + esc(L(KIND_LABEL[kind])) + '</button>').join('')
      + '</div><p class="wf-kind-help" data-wf-kind-help>' + tx(KIND_HELP[link.kind]) + '</p><div class="wf-link-fields" data-wf-link-fields>' + linkFieldsHtml(link) + '</div>'
      + '<p class="wf-readiness" data-ready="' + ready.ready + '" data-wf-readiness>' + readinessHtml(ready) + '</p>' + returnFootHtml(ready);
    markOpen();
    placePop(pillOf(index));
  }
  /** Changing the handoff type keeps the editor where it is: the chip travels, the fields below swap. */
  function switchKind(index, kind, { pointer = false } = {}) {
    const chain = chainOf();
    if (chain.links[index].kind === kind) return;
    chain.links[index] = { ...chain.links[index], kind };
    saveWorkflow({ chain, undoable: true });
    pop.querySelectorAll('[data-wf-action=kind]').forEach((toggle) => {
      const on = toggle.dataset.kind === kind;
      toggle.classList.toggle('is-current', on); toggle.setAttribute('aria-checked', String(on));
    });
    pop.querySelector('[data-wf-kind-help]').textContent = L(KIND_HELP[kind]);
    const fields = pop.querySelector('[data-wf-link-fields]');
    fields.innerHTML = linkFieldsHtml(state.workflow.links[index]);
    settle(fields);
    refreshReadiness(index);
    keepPopInView();
    if (pointer) fields.querySelector('input, textarea')?.focus({ preventScroll: true });
  }
  function refreshReadiness(index) {
    const link = state.workflow.links[index]; const ready = readiness(link);
    const el = pop.querySelector('[data-wf-readiness]');
    if (el) { if (el.dataset.ready !== String(ready.ready)) settle(el); el.dataset.ready = String(ready.ready); el.innerHTML = readinessHtml(ready); }
    const back = pop.querySelector('[data-wf-return-button]');
    if (back) back.disabled = !ready.ready;
  }
  // One line says whether the link is connected; when a model is what is missing, it also says where to set one up.
  function readinessHtml(ready) {
    if (ready.ready) return ico('check') + '<span>' + tx('已接上') + '</span>';
    const fix = ready.reason === '还没有可用的文字模型' ? ' <a href="/settings/models">' + tx('打开模型设置') + '</a>' : '';
    return ico('alert') + '<span>' + esc(L('未接上：{reason}', { reason: L(ready.reason) })) + fix + '</span>';
  }

  // ---------- dialogs ----------
  let dialogSubmit = null;
  function openDialog(title, bodyHtml, submitLabel, onSubmit, { tone } = {}) {
    dialog.querySelector('[data-wf-dialog-title]').textContent = title;
    dialog.querySelector('[data-wf-dialog-body]').innerHTML = bodyHtml;
    const submit = dialog.querySelector('[data-wf-dialog-submit]');
    submit.innerHTML = '<span>' + esc(submitLabel) + '</span>';
    submit.classList.toggle('mw-btn--danger', tone === 'danger'); submit.classList.toggle('mw-btn--primary', tone !== 'danger');
    submit.disabled = !onSubmit;
    const error = dialog.querySelector('[data-wf-dialog-error]'); error.hidden = true; error.textContent = '';
    dialogSubmit = onSubmit;
    if (!dialog.open) dialog.showModal();
  }
  const skeletonPicks = () => '<div class="wf-picks" aria-busy="true">' + [62, 48, 70].map((width) => '<div class="wf-pick wf-pick--skeleton"><span class="mw-skeleton wf-skeleton-dot"></span><span><span class="mw-skeleton" style="width:' + width + '%"></span><span class="mw-skeleton wf-skeleton-small"></span></span></div>').join('') + '</div>';
  async function startRun() {
    const flow = state.workflow; const first = flow.stations[0].plugin;
    const hint = '<p class="wf-hint">' + esc(L('这一次从 {plugin} 里的一条内容开始。每一次的内容互不相串。', { plugin: label(first) })) + '</p>';
    openDialog(L('开始一次'), hint + skeletonPicks(), L('开始'), null);
    try {
      const result = await api('/stations/' + first + '/items');
      const items = result.items;
      const blank = result.can_start_blank ? '<label class="mw-check-row wf-pick wf-pick--blank"><input class="mw-radio" type="radio" name="start" value="" ' + (items.length ? '' : 'checked') + '><span><strong>' + esc(L('在 {plugin} 里新建一份', { plugin: label(first) })) + '</strong><input class="mw-input" name="blank_title" maxlength="120" placeholder="' + tx('这一次的名字') + '"></span></label>' : '';
      const filter = items.length > 6 ? '<label class="wf-pick-filter">' + ico('search') + '<input class="mw-input" type="search" data-wf-pick-filter placeholder="' + tx('筛选…') + '" aria-label="' + tx('筛选…') + '"></label>' : '';
      const list = items.length ? '<div class="wf-picks" role="radiogroup" aria-label="' + tx('先选这一次从哪条内容开始') + '">' + items.map((item, index) => '<label class="mw-check-row wf-pick" data-wf-pick-text="' + esc((item.title + ' ' + item.caption).toLowerCase()) + '"><input class="mw-radio" type="radio" name="start" value="' + esc(item.item_id) + '"' + (index === 0 ? ' checked' : '') + '><span><strong>' + esc(item.title) + '</strong><small>' + esc([item.caption, when(item.at)].filter(Boolean).join(' · ')) + '</small></span></label>').join('') + '<p class="wf-muted wf-picks-none" data-wf-picks-none hidden>' + tx('没有匹配的内容') + '</p></div>'
        : (blank ? '' : '<p class="wf-muted">' + esc(L('{plugin} 里还没有可以开始的内容。', { plugin: label(first) })) + '</p>');
      if (!dialog.open) return;
      const body = dialog.querySelector('[data-wf-dialog-body]');
      body.innerHTML = hint + filter + blank + list;
      settle(body.querySelector('.wf-picks') || body.lastElementChild);
      dialogSubmit = async () => {
        const picked = dialogForm.querySelector('input[name=start]:checked');
        if (!picked) throw new Error(L('先选这一次从哪条内容开始'));
        const request = picked.value ? { item_id: picked.value } : { title: dialogForm.querySelector('input[name=blank_title]')?.value || '' };
        const started = await api('/' + flow.workflow_id + '/instances', request);
        dialog.close();
        await openWorkflow(flow.workflow_id, { keepInstance: true });
        await openInstance(started.instance.instance_id, 0);
      };
      dialog.querySelector('[data-wf-dialog-submit]').disabled = !(items.length || blank);
      (body.querySelector('[data-wf-pick-filter]') || body.querySelector('input[name=start]:checked') || body.querySelector('input[name=blank_title]'))?.focus();
    } catch (error) {
      const el = dialog.querySelector('[data-wf-dialog-error]'); el.textContent = error.message; el.hidden = false;
    }
  }
  function filterPicks(query) {
    const needle = query.trim().toLowerCase();
    let shown = 0; let firstShown = null;
    dialog.querySelectorAll('[data-wf-pick-text]').forEach((pick) => {
      const hit = !needle || pick.dataset.wfPickText.includes(needle);
      pick.hidden = !hit;
      if (hit) { shown += 1; firstShown = firstShown || pick; }
    });
    const none = dialog.querySelector('[data-wf-picks-none]'); if (none) none.hidden = shown > 0;
    const checked = dialog.querySelector('[data-wf-pick-text] input:checked');
    if (checked && checked.closest('[data-wf-pick-text]').hidden && firstShown) firstShown.querySelector('input').checked = true;
  }

  // ---------- run view ----------
  function stepState(run, index) {
    const step = run.steps[index];
    if (step.status === 'done' || (run.status === 'done' && index <= run.current)) return 'done';
    if (index === run.current && run.status !== 'done') return run.status === 'stopped' ? 'stopped' : 'current';
    return 'pending';
  }
  function linkState(run, i) {
    const link = run.chain.links[i]; const handoff = run.steps[i].handoff;
    if (handoff) return 'done';
    if (state.busy && state.busy.kind === 'handoff' && state.busy.index === i) return 'working';
    if (i === run.current && run.status === 'active') return readiness(link).ready ? 'waiting' : 'blocked';
    return 'future';
  }
  function frameSrc(step) {
    const url = new URL(host.route('/'), location.origin);
    url.searchParams.set('workbenchPane', 'workflow-' + state.instance.instance_id);
    url.searchParams.set('panePlugin', step.item.plugin);
    url.searchParams.set('paneItem', step.item.item_id);
    url.searchParams.set('paneTitle', step.item.title || '');
    return url.pathname + url.search;
  }
  function runBarHtml(run) {
    const status = runStatus(run);
    return '<button class="plugin-stage-back" type="button" data-wf-action="back-to-flow" aria-label="' + tx('回到这条流程') + '" title="' + tx('回到这条流程') + '">' + ico('chevron-right') + '</button>'
      + '<div class="wf-run__title"><h1>' + esc(run.title) + '</h1><span class="wf-muted">' + esc(state.instanceWorkflowTitle || '') + '</span></div>'
      + pipsHtml(run) + '<span class="mw-status mw-status--' + status.tone + ' mw-status--plain wf-run__status">' + esc(status.text) + '</span>'
      + (run.status === 'active' ? '<button class="mw-btn mw-btn--ghost" type="button" data-wf-action="stop">' + ico('pause') + '<span>' + tx('结束这一次') + '</span></button>' : '');
  }
  function vchainHtml(run, selected) {
    const chain = run.chain;
    return chain.stations.map((station, i) => {
      const s = run.steps[i]; const st = stepState(run, i);
      const mark = st === 'done' ? ico('check') : st === 'current' ? '<i class="wf-dot"></i>' : st === 'stopped' ? ico('pause') : '<i class="wf-ring"></i>';
      let linkRow = '';
      if (i < chain.links.length) {
        const link = chain.links[i]; const ls = linkState(run, i); const kind = L(KIND_LABEL[link.kind]);
        const text = ls === 'done' ? L('{kind} · 已交 {time}', { kind, time: when(s.handoff.at) })
          : ls === 'working' ? (link.kind === 'ai' ? L('AI 正在整理…') : L('正在交接…'))
          : ls === 'waiting' ? (link.kind === 'manual' ? L('手动 · 等你交') : L('{kind} · 等你继续', { kind }))
          : ls === 'blocked' ? L('{kind} · 未接上', { kind }) : kind;
        linkRow = '<div class="wf-vlink" data-wf-vlink="' + i + '" data-kind="' + link.kind + '" data-state="' + ls + '"><span class="wf-vlink__line" aria-hidden="true"></span><span class="wf-vlink__label">' + esc(text) + '</span></div>';
      }
      const on = i === selected;
      return '<button type="button" class="wf-vstep is-' + st + (on ? ' is-selected' : '') + '" data-wf-step="' + i + '" tabindex="' + (on ? '0' : '-1') + '" style="--station-tint:' + tint(station.plugin) + '"' + (on ? ' aria-current="step"' : '') + '>'
        + '<span class="wf-vstep__mark">' + mark + '</span><span class="wf-station__icon">' + ico(stationInfo(station.plugin).icon) + '</span>'
        + '<span class="wf-vstep__copy"><strong>' + esc(label(station.plugin)) + '</strong><small>' + esc(s.item ? s.item.title : (st === 'pending' ? L('还没走到') : '')) + '</small></span></button>' + linkRow;
    }).join('');
  }
  let lastRun = { id: null, steps: null, links: null };
  function renderInstance() {
    const run = state.instance; if (!run) return;
    let article = view.querySelector('.wf-run');
    if (!article || article.dataset.id !== run.instance_id) {
      view.innerHTML = '<article class="wf-run" data-id="' + esc(run.instance_id) + '"><header class="plugin-stage-detail-bar wf-run__bar" data-wf-run-bar></header>'
        + '<div class="wf-run__body"><nav class="wf-vchain" data-wf-vchain aria-label="' + tx('这一次的步骤') + '"></nav>'
        + '<section class="wf-stage"><header class="wf-stage__head" data-wf-stage-head></header><div class="wf-handoff" data-wf-handoff></div>'
        + '<div class="wf-stage__frame" data-wf-frame-slot></div></section></div></article>';
      article = view.querySelector('.wf-run');
      arrive(article);
      lastRun = { id: run.instance_id, steps: null, links: null };
    }
    patchInstance(article);
  }
  function patchInstance(article) {
    const run = state.instance;
    const index = Math.max(0, Math.min(state.step, run.chain.stations.length - 1));
    const step = run.steps[index];
    article.querySelector('[data-wf-run-bar]').innerHTML = runBarHtml(run);

    const vchain = article.querySelector('[data-wf-vchain]');
    const focusedStep = vchain.contains(document.activeElement) ? document.activeElement.dataset.wfStep : null;
    vchain.innerHTML = vchainHtml(run, index);
    const steps = run.steps.map((_, i) => stepState(run, i));
    const links = run.chain.links.map((_, i) => linkState(run, i));
    // A step that just changed state says so once: the check lands, the dot arrives, the line fills downward.
    if (lastRun.steps && !calm()) {
      steps.forEach((value, i) => { if (lastRun.steps[i] !== value) vchain.querySelector('[data-wf-step="' + i + '"]')?.classList.add('is-changed'); });
      links.forEach((value, i) => { if (lastRun.links[i] !== value) vchain.querySelector('[data-wf-vlink="' + i + '"]')?.classList.add('is-changed'); });
    }
    lastRun.steps = steps; lastRun.links = links;
    if (focusedStep !== null && focusedStep !== undefined) vchain.querySelector('[data-wf-step="' + focusedStep + '"]')?.focus({ preventScroll: true });

    article.querySelector('[data-wf-stage-head]').innerHTML = '<span class="wf-stage__step">' + esc(L('第 {n} 步', { n: index + 1 })) + '</span><span class="wf-station__icon" style="--station-tint:' + tint(step.plugin) + '">' + ico(stationInfo(step.plugin).icon) + '</span><strong>' + esc(label(step.plugin)) + '</strong>' + (step.item ? '<span class="wf-muted">' + esc(step.item.title) + '</span>' : '');

    const handoffEl = article.querySelector('[data-wf-handoff]');
    const focusedAction = handoffEl.contains(document.activeElement) ? document.activeElement.dataset.wfAction : null;
    const key = handoffKey(run, index);
    handoffEl.innerHTML = renderHandoff(run, index);
    if (handoffEl.dataset.key !== key) { handoffEl.dataset.key = key; settle(handoffEl.firstElementChild); }
    if (focusedAction) handoffEl.querySelector('[data-wf-action="' + focusedAction + '"]')?.focus({ preventScroll: true });

    syncFrame(article.querySelector('[data-wf-frame-slot]'), step);
  }
  /**
   * The embedded plugin is kept while the step stays the same, so continuing or opening the handoff form never reloads it.
   * A new step's plugin fades in over the previous one once it has loaded; the first one shows a quiet skeleton.
   */
  function syncFrame(slot, step) {
    if (!step.item) {
      if (slot.dataset.src === '') return;
      slot.dataset.src = '';
      slot.className = 'wf-stage__frame is-empty';
      slot.innerHTML = '<div class="mw-empty wf-stage__empty"><span class="mw-empty__mark">' + ico(stationInfo(step.plugin).icon) + '</span><strong>' + tx('还没走到这一步') + '</strong><p>' + esc(L('前一步交过来后，这里就是 {plugin} 里这一次的内容。', { plugin: label(step.plugin) })) + '</p></div>';
      settle(slot.firstElementChild);
      return;
    }
    const src = frameSrc(step);
    if (slot.dataset.src === src) return;
    slot.dataset.src = src;
    slot.classList.remove('is-empty');
    slot.querySelectorAll('.wf-stage__empty').forEach((node) => node.remove());
    const previous = [...slot.querySelectorAll('iframe')];
    slot.classList.toggle('is-cold', !previous.length);
    slot.classList.add('is-loading');
    if (!slot.querySelector('.wf-frame-skeleton')) {
      slot.insertAdjacentHTML('afterbegin', '<div class="wf-frame-skeleton" aria-hidden="true"><span class="mw-skeleton" style="width:38%"></span><span class="mw-skeleton" style="width:72%"></span><span class="mw-skeleton" style="width:64%"></span><span class="mw-skeleton" style="width:46%"></span></div>');
    }
    const frame = document.createElement('iframe');
    frame.title = L('{plugin} 里这一次的内容', { plugin: label(step.plugin) });
    frame.dataset.wfFrame = '';
    frame.className = 'is-entering';
    let shown = false;
    const show = () => {
      if (shown || slot.dataset.src !== src) return;
      shown = true;
      frame.classList.remove('is-entering');
      slot.classList.remove('is-loading', 'is-cold');
      setTimeout(() => previous.forEach((old) => old.remove()), calm() ? 0 : 220);
    };
    frame.addEventListener('load', show, { once: true });
    setTimeout(show, 8000);
    slot.append(frame);
    frame.src = src;
  }
  function payloadBlock(payload) {
    return '<div class="wf-payload"><strong>' + esc(payload.title) + '</strong><pre>' + esc(payload.body) + '</pre>' + (payload.url ? '<a href="' + esc(payload.url) + '" target="_blank" rel="noopener noreferrer">' + esc(payload.url) + '</a>' : '') + '</div>';
  }
  function handoffKey(run, index) {
    const step = run.steps[index];
    if (step.handoff) return index + ':record';
    if (state.handoff?.index === index) return index + ':manual';
    if (index >= run.chain.links.length || run.status !== 'active' || index !== run.current) return index + ':' + run.status;
    return index + ':bar:' + readiness(run.chain.links[index]).ready;
  }
  function renderHandoff(run, index) {
    const step = run.steps[index];
    const chain = run.chain;
    if (step.handoff) {
      const h = step.handoff; const next = label(chain.stations[index + 1].plugin);
      const who = h.actor === 'ai' ? L('AI 整理后交给了 {next}', { next }) : h.actor === 'function' ? L('按规则交给了 {next}', { next }) : L('你手动交给了 {next}', { next });
      return '<details class="wf-record mw-disclosure"' + (h.actor === 'ai' ? ' open' : '') + '><summary><span class="wf-handoff__kind" data-kind="' + h.kind + '">' + esc(L(KIND_LABEL[h.kind])) + '</span><span>' + esc(who) + '</span><span class="wf-muted">' + esc(when(h.at)) + '</span></summary>'
        + '<div class="wf-record__body"><p class="wf-record__label">' + tx(h.actor === 'ai' ? 'AI 整理出的内容' : '交过去的内容') + '</p>' + payloadBlock(h.output)
        + (h.rule ? '<p class="wf-record__label">' + tx(h.actor === 'ai' ? '这段交接的要求' : '规则') + '</p><pre class="wf-rule">' + esc(h.rule) + '</pre>' : '')
        + '<button class="mw-btn mw-btn--ghost" type="button" data-wf-step="' + (index + 1) + '"><span>' + esc(L('去 {next} 看这一次', { next })) + '</span>' + ico('arrow') + '</button></div></details>';
    }
    if (index >= chain.links.length) {
      return run.status === 'done' ? '<p class="wf-handoff__note is-done">' + ico('completed') + '<span>' + tx('这是最后一站，这一次已经走完。') + '</span></p>' : '';
    }
    if (run.status !== 'active' || index !== run.current) {
      if (run.status === 'stopped' && index === run.current) return '<p class="wf-handoff__note">' + ico('pause') + '<span>' + tx('这一次在这里结束了，后面的站没有继续。') + '</span></p>';
      return '';
    }
    const link = chain.links[index]; const ready = readiness(link); const next = label(chain.stations[index + 1].plugin);
    const busy = state.busy && state.busy.index === index;
    if (state.handoff?.index === index && state.handoff.mode === 'manual') {
      const draft = state.handoff.draft;
      return '<form class="wf-manual" data-wf-manual><header><strong>' + esc(L('手动交给 {next}', { next })) + '</strong><span class="wf-muted">' + tx('看完再决定交不交、交什么。改好的内容会交过去。') + '</span></header>'
        + '<label class="mw-field"><span class="mw-field__label">' + tx('标题') + '</span><input class="mw-input" name="title" maxlength="200" value="' + esc(draft.title) + '"></label>'
        + '<label class="mw-field"><span class="mw-field__label">' + tx('正文') + '</span><textarea class="mw-textarea" name="body" rows="5">' + esc(draft.body) + '</textarea></label>'
        + '<footer><span class="wf-kbd-hint"><kbd class="mw-kbd">' + esc(MOD) + ' ↵</kbd>' + tx('交过去') + '<kbd class="mw-kbd">Esc</kbd>' + tx('先不交') + '</span>'
        + '<button class="mw-btn mw-btn--secondary" type="button" data-wf-action="handoff-cancel">' + tx('先不交') + '</button>'
        + '<button class="mw-btn mw-btn--primary" type="submit" data-wf-action="handoff-submit"' + (busy ? ' data-loading aria-disabled="true"' : '') + '>' + (busy ? '<span class="mw-spinner" aria-hidden="true"></span>' : '') + '<span>' + esc(L('交给 {next}', { next })) + '</span></button></footer></form>';
    }
    if (!ready.ready) {
      return '<p class="wf-handoff__bar is-blocked">' + ico('alert') + '<span>' + esc(L('下一段 {kind} → {next} 还没接上：{reason}', { kind: L(KIND_LABEL[link.kind]), next, reason: L(ready.reason) })) + '</span><button class="mw-btn mw-btn--ghost" type="button" data-wf-action="edit-link" data-link="' + index + '">' + tx('去配置') + '</button></p>';
    }
    const action = link.kind === 'manual' ? L('看内容并交给 {next}', { next }) : link.kind === 'ai' ? L('AI 整理后交给 {next}', { next }) : L('按规则交给 {next}', { next });
    const working = busy ? (state.busy.kind === 'preview' ? L('正在读取…') : link.kind === 'ai' ? L('AI 正在整理…') : L('正在交接…')) : action;
    return '<p class="wf-handoff__bar' + (busy ? ' is-working' : '') + '"><span class="wf-handoff__kind" data-kind="' + link.kind + '">' + esc(L(KIND_LABEL[link.kind])) + '</span><span>' + esc(L('下一段：{kind}交给 {next}', { kind: link.kind === 'manual' ? L('人看完后') : link.kind === 'ai' ? L('AI 整理后') : L('按规则'), next })) + '</span>'
      + '<button class="mw-btn mw-btn--primary" type="button" data-wf-action="continue" data-index="' + index + '"' + (busy ? ' aria-disabled="true" aria-busy="true"' : '') + '>' + (busy ? '<span class="mw-spinner" aria-hidden="true"></span>' : ico('arrow')) + '<span>' + esc(working) + '</span></button></p>';
  }
  async function continueRun(index, manual) {
    if (state.busy) return;
    const run = state.instance; const link = run.chain.links[index];
    if (link.kind === 'manual' && !manual) {
      state.busy = { index, kind: 'preview' }; renderInstance();
      try {
        const preview = await api('/instances/' + run.instance_id + '/preview', { from: index });
        state.handoff = { index, mode: 'manual', input: preview.input, draft: { title: preview.input.title, body: preview.input.body } };
      } catch (error) { toast(error.message, 'error'); }
      state.busy = null; renderInstance();
      view.querySelector('[data-wf-manual] input[name=title]')?.focus();
      return;
    }
    state.busy = { index, kind: 'handoff' }; renderInstance();
    try {
      const result = await api('/instances/' + run.instance_id + '/continue', { from: index, updated_at: run.updated_at, ...(manual || {}) });
      state.instance = result.instance; state.handoff = null; state.step = index + 1;
      toast(L('已交给 {next}', { next: label(run.chain.stations[index + 1].plugin) }));
      refreshFlowQuietly();
    } catch (error) {
      toast(error.message, 'error');
      if (error.status === 409) { state.busy = null; await openInstance(run.instance_id).catch(() => undefined); }
    }
    state.busy = null; remember(); renderInstance();
  }
  function refreshFlowQuietly() {
    if (!state.workflow) return;
    api('/' + state.workflow.workflow_id).then((result) => { state.instances = result.instances; }).catch(() => undefined);
    api('').then((result) => { state.workflows = result.workflows; renderList(); }).catch(() => undefined);
  }
  function selectStep(index) {
    if (!state.instance || index === state.step) return;
    state.step = index; if (state.handoff && state.handoff.index !== index) state.handoff = null;
    remember(); renderInstance();
  }

  // ---------- events ----------
  root.addEventListener('click', async (event) => {
    const target = event.target.closest('[data-wf-action], [data-wf-open], [data-wf-open-instance], [data-wf-step]');
    if (!target || !root.contains(target) || pop.contains(target)) return;
    const action = target.dataset.wfAction;
    const fromKeyboard = event.detail === 0;
    try {
      if (target.dataset.wfOpen) { if (state.workflow?.workflow_id !== target.dataset.wfOpen || state.instance) await openWorkflow(target.dataset.wfOpen); return; }
      if (target.dataset.wfOpenInstance) { await openInstance(target.dataset.wfOpenInstance); return; }
      if (target.dataset.wfStep !== undefined && !action) { selectStep(Number(target.dataset.wfStep)); return; }
      if (action === 'new' || action === 'example') {
        const example = action === 'example';
        const chain = example
          ? { stations: [{ station_id: uid(), plugin: 'feed' }, { station_id: uid(), plugin: 'inbox' }, { station_id: uid(), plugin: 'pages' }],
              links: [manualLink(), { kind: 'ai', title_template: '', body_template: '', instructions: L('把这条消息整理成一页说明：先写一句结论，再分成背景、要点和待确认的问题，保留原文链接。') }] }
          : { stations: [], links: [] };
        const created = await api('', { title: example ? L('把消息写成一页') : L('新的流程'), chain });
        await loadList();
        await openWorkflow(created.workflow.workflow_id);
        if (!example) view.querySelector('[data-wf-title]')?.select();
        return;
      }
      if (action === 'back') { state.workflow = null; state.instance = null; state.returnTo = null; remember(); setMode('list'); renderList(); return; }
      if (action === 'back-to-flow') { const id = state.instance?.workflow_id; state.instance = null; if (id) await openWorkflow(id); else setMode('list'); return; }
      if (action === 'return-to-run') { const back = state.returnTo; if (back) await openInstance(back.instance, back.step); return; }
      if (action === 'delete') {
        openDialog(L('删除流程'), '<p>' + esc(L('删除「{title}」后它不再出现在列表里。已经走过的每一次，以及交到各插件里的内容，都会保留。', { title: state.workflow.title })) + '</p>', L('删除'), async () => {
          await api('/' + state.workflow.workflow_id + '/delete', {}); dialog.close(); state.workflow = null; state.returnTo = null; remember(); setMode('list'); await loadList();
        }, { tone: 'danger' });
        return;
      }
      if (action === 'gap') { openGapPicker(Number(target.dataset.gap)); return; }
      if (action === 'append') { insertAt(state.workflow.stations.length, target.dataset.wfPlugin); return; }
      if (action === 'remove') { await removeAt(Number(target.dataset.index)); return; }
      if (action === 'move') { moveTo(Number(target.dataset.from), Number(target.dataset.gap), { focus: true }); return; }
      if (action === 'link') {
        const index = Number(target.dataset.link);
        if (state.openLink === index && pop.matches(':popover-open')) { pop.hidePopover(); return; }
        openLinkEditor(index); return;
      }
      if (action === 'edit-link') {
        const run = state.instance; const index = Number(target.dataset.link);
        state.returnTo = { workflow: run.workflow_id, instance: run.instance_id, step: state.step, title: run.title };
        await openWorkflow(run.workflow_id);
        openLinkEditor(index);
        pop.querySelector('[data-wf-link-fields] input, [data-wf-link-fields] textarea')?.focus({ preventScroll: true });
        return;
      }
      if (action === 'start') { await startRun(); return; }
      if (action === 'dialog-close') { dialog.close(); return; }
      if (action === 'stop') {
        const run = state.instance;
        openDialog(L('结束这一次？'), '<p>' + tx('后面的站不会再继续。已经交出去的内容都会留在各自的插件里。') + '</p>', L('结束这一次'), async () => {
          const result = await api('/instances/' + run.instance_id + '/stop', {});
          dialog.close(); state.instance = result.instance; state.handoff = null; renderInstance(); refreshFlowQuietly();
        });
        return;
      }
      if (action === 'continue') { await continueRun(Number(target.dataset.index)); return; }
      if (action === 'handoff-cancel') { cancelManual(); return; }
    } catch (error) { toast(error.message, 'error'); }
  });
  function cancelManual() {
    state.handoff = null; renderInstance();
    view.querySelector('[data-wf-action=continue]')?.focus({ preventScroll: true });
  }
  pop.addEventListener('click', (event) => {
    const token = event.target.closest('[data-wf-token]');
    if (token) {
      const area = pop.querySelector('[data-wf-link-field=body_template]');
      if (!area) return;
      const start = area.selectionStart ?? area.value.length; const end = area.selectionEnd ?? start;
      area.setRangeText(token.dataset.wfToken, start, end, 'end');
      area.focus();
      area.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    const target = event.target.closest('[data-wf-action]');
    if (!target) return;
    if (target.dataset.wfAction === 'insert') { pop.hidePopover?.(); insertAt(Number(target.dataset.gap), target.dataset.plugin, { focus: event.detail === 0 }); return; }
    if (target.dataset.wfAction === 'kind') { switchKind(Number(target.dataset.link), target.dataset.kind, { pointer: event.detail > 0 }); return; }
    if (target.dataset.wfAction === 'return-to-run') {
      const back = state.returnTo; if (!back) return;
      pop.hidePopover();
      openInstance(back.instance, back.step).catch((error) => toast(error.message, 'error'));
    }
  });
  pop.addEventListener('keydown', (event) => {
    const items = [...pop.querySelectorAll('.wf-pop__item')];
    const at = items.indexOf(document.activeElement);
    if (at < 0 || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (at + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next].focus();
  });
  pop.addEventListener('toggle', (event) => {
    if (event.newState !== 'closed') return;
    const anchor = popAnchor && popAnchor();
    const lostFocus = !document.activeElement || document.activeElement === document.body || pop.contains(document.activeElement);
    state.openLink = null; state.openGap = null; popAnchor = null;
    markOpen();
    if (lostFocus && anchor) anchor.focus({ preventScroll: true });
  });
  pop.addEventListener('input', (event) => {
    const field = event.target.closest('[data-wf-link-field]');
    if (!field) return;
    const index = Number(pop.dataset.link);
    state.workflow.links[index] = { ...state.workflow.links[index], [field.dataset.wfLinkField]: field.value };
    refreshReadiness(index);
    clearTimeout(linkTimer);
    linkTimer = setTimeout(() => saveWorkflow({ chain: chainOf() }), 450);
  });
  window.addEventListener('resize', repositionPop);
  root.addEventListener('scroll', repositionPop, true);

  let titleTimer = 0;
  const saveTitle = (input) => {
    clearTimeout(titleTimer);
    if (!state.workflow) return;
    const title = input.value.trim() || L('新的流程');
    if (title !== state.workflow.title) saveWorkflow({ title });
  };
  root.addEventListener('input', (event) => {
    if (pop.contains(event.target)) return;
    const title = event.target.closest('[data-wf-title]');
    if (title) { clearTimeout(titleTimer); titleTimer = setTimeout(() => saveTitle(title), 600); return; }
    const filter = event.target.closest('[data-wf-pick-filter]');
    if (filter) { filterPicks(filter.value); return; }
    const manual = event.target.closest('[data-wf-manual]');
    if (manual && state.handoff) state.handoff.draft = { title: manual.elements.title.value, body: manual.elements.body.value };
  });
  root.addEventListener('change', (event) => {
    const input = event.target.closest('[data-wf-title]');
    if (input) saveTitle(input);
  });
  root.addEventListener('focusin', (event) => {
    if (event.target.matches?.('input[name=blank_title]')) { const radio = event.target.closest('.wf-pick')?.querySelector('input[type=radio]'); if (radio) radio.checked = true; }
  });
  root.addEventListener('dblclick', (event) => {
    const pick = event.target.closest('.wf-pick[data-wf-pick-text]');
    if (pick && dialog.open) dialogForm.requestSubmit();
  });
  root.addEventListener('keydown', (event) => {
    const target = event.target;
    if (pop.contains(target)) return;
    const typing = target.matches?.('input, textarea, select, [contenteditable]');
    if (!typing && root.dataset.wfMode === 'workflow' && event.key.toLowerCase() === 'z' && (event.metaKey || event.ctrlKey) && !event.shiftKey) {
      if (undo()) event.preventDefault();
      return;
    }
    if (target.matches?.('[data-wf-title]')) {
      if (event.key === 'Enter') { event.preventDefault(); target.blur(); }
      if (event.key === 'Escape') { target.value = state.workflow?.title || target.value; clearTimeout(titleTimer); target.blur(); }
      return;
    }
    if (target.matches?.('[data-wf-pick-filter]') && event.key === 'ArrowDown') {
      event.preventDefault();
      dialog.querySelector('.wf-pick:not([hidden]) input[type=radio]')?.focus();
      return;
    }
    const manual = target.closest?.('[data-wf-manual]');
    if (manual) {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); manual.requestSubmit(); return; }
      if (event.key === 'Escape') { event.preventDefault(); cancelManual(); return; }
    }
    const station = target.matches?.('[data-wf-station]') ? target : null;
    if (station && state.workflow) {
      const index = Number(station.dataset.wfStation); const count = state.workflow.stations.length;
      if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && event.altKey) {
        event.preventDefault();
        if (event.key === 'ArrowLeft' && index > 0) moveTo(index, index - 1, { focus: true });
        if (event.key === 'ArrowRight' && index < count - 1) moveTo(index, index + 2, { focus: true });
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : Math.max(0, Math.min(count - 1, index + (event.key === 'ArrowRight' ? 1 : -1)));
        view.querySelector('[data-wf-chain] [data-wf-station="' + next + '"]')?.focus();
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); removeAt(index, { keyboard: true }); return; }
    }
    const vstep = target.closest?.('[data-wf-vchain] [data-wf-step]');
    if (vstep && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const steps = [...view.querySelectorAll('[data-wf-vchain] [data-wf-step]')];
      const at = steps.indexOf(vstep);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? steps.length - 1 : Math.max(0, Math.min(steps.length - 1, at + (event.key === 'ArrowDown' ? 1 : -1)));
      steps.forEach((step, i) => { step.tabIndex = i === next ? 0 : -1; });
      steps[next].focus();
    }
  });
  root.addEventListener('submit', async (event) => {
    const form = event.target.closest('[data-wf-manual]');
    if (!form) return;
    event.preventDefault();
    await continueRun(state.handoff.index, { title: form.elements.title.value, body: form.elements.body.value });
  });
  dialogForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!dialogSubmit) return;
    const submit = dialog.querySelector('[data-wf-dialog-submit]');
    if (submit.hasAttribute('data-loading')) return;
    submit.setAttribute('data-loading', ''); submit.insertAdjacentHTML('afterbegin', '<span class="mw-spinner" aria-hidden="true"></span>');
    try { await dialogSubmit(); } catch (error) { const el = dialog.querySelector('[data-wf-dialog-error]'); el.textContent = error.message; el.hidden = false; settle(el); }
    finally { submit.removeAttribute('data-loading'); submit.querySelector('.mw-spinner')?.remove(); }
  });

  // Drag a plugin (or a station) into a gap. Hovering a station picks the gap on the nearer side.
  let dragging = null; let dropGap = null; let dragSource = null;
  const gapElement = (gap) => view.querySelector('[data-wf-chain] [data-wf-gap="' + gap + '"]');
  const setDrop = (gap) => {
    if (dropGap === gap) return;
    view.querySelectorAll('[data-wf-chain] .is-drop').forEach((node) => node.classList.remove('is-drop'));
    dropGap = gap;
    if (gap !== null) gapElement(gap)?.classList.add('is-drop');
  };
  const pointGap = (event) => {
    const gap = event.target.closest?.('[data-wf-gap]');
    if (gap) return Number(gap.dataset.wfGap);
    const station = event.target.closest?.('[data-wf-station]');
    if (station) { const box = station.getBoundingClientRect(); const index = Number(station.dataset.wfStation); return event.clientX < box.left + box.width / 2 ? index : index + 1; }
    let best = null; let distance = Infinity;
    view.querySelectorAll('[data-wf-chain] [data-wf-gap]').forEach((node) => {
      const box = node.getBoundingClientRect(); const d = Math.abs(event.clientX - (box.left + box.width / 2));
      if (d < distance) { distance = d; best = Number(node.dataset.wfGap); }
    });
    return best;
  };
  root.addEventListener('dragstart', (event) => {
    const chip = event.target.closest?.('[data-wf-plugin]'); const station = event.target.closest?.('[data-wf-station]');
    if (chip) dragging = { plugin: chip.dataset.wfPlugin };
    else if (station) dragging = { from: Number(station.dataset.wfStation) };
    else return;
    if (pop.matches(':popover-open')) pop.hidePopover();
    dragSource = chip || station;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', chip ? chip.dataset.wfPlugin : 'station');
    requestAnimationFrame(() => { dragSource?.classList.add('is-drag-source'); view.querySelector('[data-wf-chain]')?.classList.add('is-dragging'); });
  });
  const endDrag = () => {
    dragging = null; setDrop(null);
    dragSource?.classList.remove('is-drag-source'); dragSource = null;
    view.querySelector('[data-wf-chain]')?.classList.remove('is-dragging');
  };
  root.addEventListener('dragend', endDrag);
  root.addEventListener('dragover', (event) => {
    if (!dragging) return;
    if (!event.target.closest?.('[data-wf-chain]')) { setDrop(null); return; }
    event.preventDefault();
    let gap = pointGap(event);
    if (gap !== null && dragging.from !== undefined && (gap === dragging.from || gap === dragging.from + 1)) gap = null;
    event.dataTransfer.dropEffect = gap === null ? 'none' : 'move';
    setDrop(gap);
  });
  root.addEventListener('dragleave', (event) => {
    const chain = view.querySelector('[data-wf-chain]');
    if (chain && !chain.contains(event.relatedTarget)) setDrop(null);
  });
  root.addEventListener('drop', (event) => {
    if (!dragging) return;
    event.preventDefault();
    const gap = dropGap; const drag = dragging;
    endDrag();
    if (gap === null) return;
    if (drag.plugin) insertAt(gap, drag.plugin);
    else moveTo(drag.from, gap);
  });

  // The embedded plugin asks its host to open another item; show it in the same frame.
  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin || event.data?.type !== 'workbench-pane-open' || !event.data.itemId) return;
    const frame = [...view.querySelectorAll('[data-wf-frame]')].find((candidate) => candidate.contentWindow === event.source);
    if (!frame) return;
    const url = new URL(frame.src, location.origin);
    url.searchParams.set('panePlugin', event.data.plugin); url.searchParams.set('paneItem', event.data.itemId); url.searchParams.set('paneTitle', event.data.title || '');
    frame.src = url.pathname + url.search;
  });

  // Open the plugin's surface the first time it is shown; come back to where the person was.
  let started = false;
  const start = async () => {
    if (started || root.hidden) return;
    started = true;
    await loadList();
    let memory = null;
    try { memory = JSON.parse(sessionStorage.getItem(memoryKey()) || 'null'); } catch {}
    try {
      if (memory?.workflow) await openWorkflow(memory.workflow, { keepInstance: true });
      if (memory?.instance) await openInstance(memory.instance, memory.step);
    } catch { setMode('list'); }
  };
  new MutationObserver(start).observe(root, { attributes: true, attributeFilter: ['hidden'] });
  root.addEventListener('molis-work:select-item', (event) => {
    if (event.detail?.itemId || !started) return;
    state.workflow = null; state.instance = null; state.returnTo = null; remember(); setMode('list'); renderList();
  });
  start();
}`;
