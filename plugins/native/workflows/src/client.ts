/**
 * Workflows client: list, chain editor and run view. Runs inside the Workbench page like other native plugins.
 *
 * Views are drawn once and then patched in place, so an edit never resets scroll, focus or the embedded plugin,
 * and motion can say what changed: a station arrives, slides or leaves; a handoff travels down the run's chain.
 */
import { WORKFLOW_GAP_PICKER_SCRIPT } from "./gap-picker-client.js";
import { WORKFLOW_SAVE_SCRIPT } from "./save-client.js";

// Notes kept out of the served script (a comment in it is bytes the browser downloads and never runs). `publishContext`: The workflow on screen, for the Assistant and the placement bar: a run is shown under the workflow it belongs to. `step search`: Many plugins offer steps: a search narrows the list by name, plugin or description; the current choice always stays. `readinessHtml`: One line says whether the link is connected; when a model is what is missing, it also says where to set one up. `run view motion`: A step that just changed state says so once: the check lands, the dot arrives, the line fills downward. `action step`: An action step has no page of its own: it shows what it was given and what the action returned. `judgment handoff`: A judgment that held the content back says what it decided; a person ending the run needs no reason. `run conflict`: A conflict or an action whose result is now unconfirmed: load what was recorded so the page shows the real state. `gap drag`: Drag a plugin (or a station) into a gap. Hovering a station picks the gap on the nearer side.
/** Client notes kept outside the downloaded factory.
 * ---------- motion ----------
 * Surface arrival: the shared 6px rise.
 * A smaller arrival for content that replaces content in the same place.
 * A short notice; with an action (撤销) it stays a little longer and can be clicked.
 * A station is named by what it is: a plugin, or the one action a step runs.
 * Choice rules come from the same directory as everything else; they are read once per open and after publishing elsewhere.
 * ---------- chain rules (mirrors model.ts) ----------
 * ---------- data ----------
 * The link editor belongs to the chain it was opened on; leaving that view closes it.
 * ---------- list ----------
 * ---------- workflow editor ----------
 * Redraw the chain, then let each station travel from where it was; new ones arrive, changed handoffs settle.
 * The exit is a courtesy: never let an unpainted frame hold the edit back.
 * A station that only provides content (成果) starts the run, wherever it was dropped.
 * ---------- popovers ----------
 * Content grew or shrank: stay where the eye already is, only shift to stay on screen.
 * ---------- action steps ----------
 * Mirrors the Host check so the editor says what is missing before saving; the Host checks again on save and on every run.
 * A saved step whose action went away stays visible as what it was, so nothing silently changes.
 * The rule list arrives after the editor opens; only this link's fields and readiness are redrawn.
 * Changing the handoff type keeps the editor where it is: the chip travels, the fields below swap.
 * ---------- dialogs ----------
 * ---------- run view ----------
 * The embedded plugin is kept while the step stays the same, so continuing or opening the handoff form never reloads it. A new step's plugin fades in over the previous one once it has loaded; the first one shows a quiet skeleton.
 * The action was called and never confirmed: nothing repeats it until the person has checked.
 * ---------- events ----------
 * Another action takes other fields: nothing is guessed across, each one is chosen again.
 * A different rule has different answers: earlier ticks do not carry over.
 * Typing keeps the field in place; only the readiness line and the save button follow.
 * The embedded plugin asks its host to open another item; show it in the same frame.
 * Open the plugin's surface the first time it is shown; come back to where the person was.
 */
export const WORKFLOWS_CLIENT_FACTORY_SCRIPT = String.raw`(host) => {
  const root = document.querySelector('[data-workflows=workbench]');
  if (!root) return;
  const L = host.translate;
  const $ = (selector) => root.querySelector(selector);
  const esc = (val) => String(val ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tx = (val, vars) => esc(L(val, vars));
  const ico = (name) => '<svg aria-hidden="true"><use href="#icon-' + esc(name) + '"></use></svg>';
  const listEl = $('[data-wf-list]');
  const space = $('[data-wf-workspace]');
  const view = $('[data-wf-view]');
  const pop = $('[data-wf-pop]');
  const dlg = $('[data-wf-dialog]');
  const formEl = $('[data-wf-dialog-form]');
  const toastEl = $('[data-wf-toast]');
  const MOD = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '') ? '⌘' : 'Ctrl';
  const KINDS = { judgment: 'workflows.kind.judgment', function: 'workflows.kind.function', ai: 'AI', manual: 'workflows.kind.manual' };
  const KIND_HELP = {
    function: 'workflows.kind.function-help',
    ai: 'workflows.kind.ai-help',
    manual: 'workflows.kind.manual-help',
    judgment: 'workflows.kind.judgment-help',
  };
  const headers = () => typeof molisWorkControlHeaders === 'function' ? molisWorkControlHeaders() : { 'content-type': 'application/json' };
  async function api(path, body) {
    const reply = await fetch(host.route('/api/plugins/io.molis.work.native.workflows/workflows' + path), {
      method: body === undefined ? 'GET' : 'POST', cache: 'no-store', headers: headers(),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const res = await reply.json().catch(() => ({}));
    if (!reply.ok) { const err = new Error((body === undefined && host.readRefusal?.(reply.status, res.code)) || res.error || L('workflows.error.request')); err.status = reply.status; throw err; }
    return res;
  }

  const calm = () => Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const EASE_OUT = 'cubic-bezier(.16, 1, .3, 1)';
  const EASE_SETTLE = 'cubic-bezier(.32, 1.22, .52, 1)';
  const EASE_STANDARD = 'cubic-bezier(.32, .72, 0, 1)';
  const motion = (el, frames, opts) => (!el || !el.animate || calm()) ? null : el.animate(frames, { easing: EASE_OUT, ...opts });
  const arrive = (el) => {
    if (!el || calm()) return;
    el.classList.remove('is-arriving'); void el.offsetWidth; el.classList.add('is-arriving');
    el.addEventListener('animationend', () => el.classList.remove('is-arriving'), { once: true });
  };
  const settle = (el) => motion(el, [{ opacity: 0, transform: 'translateY(3px)' }, { opacity: 1, transform: 'none' }], { duration: 160 });

  let toastId = 0; let toastAct = null;
  const hideToast = () => {
    clearTimeout(toastId); toastAct = null;
    toastEl.classList.remove('is-on');
    setTimeout(() => { if (!toastEl.classList.contains('is-on')) toastEl.hidden = true; }, 200);
  };
  const toast = (msg, tone, act) => {
    toastAct = act || null;
    toastEl.innerHTML = '<span>' + esc(msg) + '</span>' + (act ? '<button type="button" class="mw-toast__action" data-wf-toast-action>' + esc(act.label) + '</button>' : '');
    toastEl.dataset.tone = tone || ''; if (tone === 'error') toastEl.dataset.mwState = 'failed'; else { delete toastEl.dataset.mwState; delete toastEl.dataset.ringMounted; }
    toastEl.classList.toggle('has-action', Boolean(act));
    toastEl.hidden = false;
    void toastEl.offsetWidth;
    toastEl.classList.add('is-on');
    clearTimeout(toastId);
    toastId = setTimeout(hideToast, act ? 6000 : 3200);
  };
  toastEl.addEventListener('click', (ev) => {
    if (!ev.target.closest('[data-wf-toast-action]') || !toastAct) return;
    const run = toastAct.run; hideToast(); run();
  });

  const ui = {
    workflows: [], stations: [], ai: false, loaded: false, judgments: null, actionSteps: null, stepDraft: null, stepQuery: '', stepIndex: null, workflow: null, instances: [], instance: null, step: 0,
    handoff: null, busy: null, openLink: null, openGap: null, returnTo: null,
  };
  const stnMeta = (plug) => plug === 'action' ? { plugin:plug, label: 'workflows.station.action', icon: 'zap', supported: true }
    : ui.stations.find((item) => item.plugin === plug) || { plugin:plug, label: plug, icon: 'grid', supported: false };
  const label = (val) => val && typeof val === 'object' ? (val.action ? val.action.title : L(stnMeta(val.plugin).label)) : L(stnMeta(val).label);
  const tint = (plug) => 'var(--plugin-' + plug + ', var(--muted))';
  const readyState = (link) => {
    const chain = [ui.instance?.chain, ui.workflow].find(chain => chain?.links.includes(link));
    const idx = chain?.links.indexOf(link);
    if (chain && idx >= 0) {
      const absent = chain.stations.slice(idx, idx + 2).find(stn => stn.availability?.available === false);
      if (absent) return { ready: false, reason: absent.availability.reason };
    }
    if (link.kind === 'manual') return { ready: true, reason: '' };
    if (link.kind === 'judgment') {
      if (!link.judgment) return { ready: false, reason: 'workflows.ready.no-judgment' };
      const known = (ui.judgments || []).find(row => ruleKey(row.ref) === ruleKey(link.judgment));
      if (ui.judgments && !known) return { ready: false, reason: 'workflows.ready.rule-gone' };
      if (known && !known.available) return { ready: false, reason: known.reason || 'workflows.ready.rule-unavailable' };
      return (link.pass || []).length ? { ready: true, reason: '' } : { ready: false, reason: 'workflows.ready.no-pass' };
    }
    if (link.kind === 'function') return link.body_template.trim() ? { ready: true, reason: '' } : { ready: false, reason: 'workflows.ready.no-template' };
    if (!link.instructions.trim()) return { ready: false, reason: 'workflows.ready.no-instructions' };
    if (!ui.ai) return { ready: false, reason: 'workflows.ready.no-model' };
    return { ready: true, reason: '' };
  };
  const handLink = () => ({ kind: 'manual', title_template: '', body_template: '', instructions: '' });
  const ruleText = (verdict) => verdict.status === 'needs_review' ? L('workflows.verdict.needs-review') : L('workflows.verdict.result', { choice: verdict.choice || L('workflows.verdict.none') })
    + (verdict.confidence == null ? '' : ' · ' + L('workflows.verdict.confidence', { value: Math.round(verdict.confidence * 100) }));
  const ruleKey = (ref) => ref ? ref.capability_id + '@' + ref.version + '@' + ref.provider_id : '';
  async function loadRules(force) {
    if (ui.judgments && !force) return ui.judgments;
    try { ui.judgments = (await api('/judgments')).judgments; } catch (err) { ui.judgments = []; toast(err.message, 'error'); }
    return ui.judgments;
  }
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
  const when = (iso) => { if (!iso) return ''; const d = new Date(iso); const today = new Date(); return d.toDateString() === today.toDateString() ? d.toLocaleTimeString(document.documentElement.lang || undefined, { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString(document.documentElement.lang || undefined, { month: 'short', day: 'numeric' }); };

  const insertStn = (chain, gap, plug, id) => {
    const stations = [...chain.stations]; const links = [...chain.links];
    const at = Math.max(0, Math.min(gap, stations.length));
    stations.splice(at, 0, { station_id: id || uid(), plugin:plug });
    if (stations.length === 1) return { stations, links: [] };
    if (at === 0) links.unshift(handLink()); else if (at === stations.length - 1) links.push(handLink()); else links.splice(at, 0, handLink());
    return { stations, links };
  };
  const removeStn = (chain, idx) => {
    const last = chain.stations.length - 1;
    const stations = chain.stations.filter((_, i) => i !== idx); const links = [...chain.links];
    if (links.length) links.splice(idx === 0 ? 0 : idx === last ? last - 1 : idx, 1);
    return { stations, links };
  };
  const moveStation = (chain, from, gap) => {
    if (gap === from || gap === from + 1) return chain;
    const stn = chain.stations[from];
    const removed = removeStn(chain, from);
    const at = gap > from ? gap - 1 : gap;
    const inserted = insertStn(removed, at, stn.plugin);
    inserted.stations[at] = stn;
    return inserted;
  };

  async function loadList() {
    try {
      const res = await api('');
      ui.workflows = res.workflows; ui.stations = res.stations; ui.ai = res.ai_available; ui.loaded = true;
      drawList();
    } catch (err) { listEl.innerHTML = '<p class="wf-error">' + esc(err.message) + '</p>'; }
  }
  document.addEventListener('molis-work:model-ready', () => api('').then((res) => {
    ui.ai = res.ai_available; drawList();
    if (root.dataset.wfMode === 'instance') drawRun(); else if (root.dataset.wfMode === 'workflow') drawFlow();
    if (ui.openLink !== null) checkReady(ui.openLink);
  }).catch((err) => toast(err.message, 'error')));
  let navId = 0;
  async function showFlow(id, { keepInstance = false, revision:rev = ++navId } = {}) {
    flushSave(); root.querySelector('[data-wf-gone]').hidden = true;
    const res = await api('/' + id);
    if (rev !== navId) return;
    if (ui.workflow?.workflow_id !== id) undos.length = 0;
    ui.workflow = adoptFlow(res.workflow); ui.instances = res.instances; ui.ai = res.ai_available;
    if (ui.returnTo && ui.returnTo.workflow !== id) ui.returnTo = null;
    if (!keepInstance) ui.instance = null;
    remember();
    setMode('workflow'); drawList(); drawFlow();
    return ui.workflow;
  }
  async function openRun(id, step, rev = ++navId) {
    const res = await api('/instances/' + id);
    if (rev !== navId) return;
    ui.instance = res.instance; ui.instanceWorkflowTitle = res.workflow_title; ui.ai = res.ai_available;
    ui.step = Number.isInteger(step) ? Math.min(step, res.instance.steps.length - 1) : res.instance.current;
    ui.handoff = null; ui.returnTo = null;
    remember();
    setMode('instance'); drawRun();
  }
  const stateKey = () => 'molis-workflows:' + host.route('/');
  const remember = () => { try { sessionStorage.setItem(stateKey(), JSON.stringify({ workflow: ui.workflow?.workflow_id || null, instance: ui.instance?.instance_id || null, step: ui.step })); } catch {} };
  const emitCtx = () => {
    const ctx = { plugin_id: "io.molis.work.native.workflows", surface_title: L('workflows.page.title') };
    const mode = root.dataset.wfMode;
    const flow = mode === 'workflow' ? ui.workflow : null;
    const runOf = mode === 'instance' && ui.instance ? { id: ui.instance.workflow_id, title: ui.instanceWorkflowTitle } : null;
    if (flow) { ctx.object = { kind: 'workflow', id: flow.workflow_id, version: String(flow.revision), title: flow.title }; ctx.unsaved = Boolean(Object.keys(edits.get(flow.workflow_id)?.patch || {}).length); }
    else if (runOf?.id) ctx.object = { kind: 'workflow', id: runOf.id, title: runOf.title || '' };
    root.setAttribute('data-assistant-context', JSON.stringify(ctx));
  };
  const setMode = (mode) => {
    flushSave();
    if (pop.matches?.(':popover-open')) pop.hidePopover();
    if (mode === 'list') view.replaceChildren();
    root.dataset.wfMode = mode;
    const expanded = mode !== 'list';
    root.dataset.expanded = expanded ? 'true' : 'false';
    space.hidden = !expanded;
    emitCtx();
  };

  function chainText(chain) {
    if (!chain.stations.length) return '<span class="wf-muted">' + tx('workflows.chain.no-stations') + '</span>';
    return chain.stations.map((stn, idx) => (idx ? '<i class="wf-mini-link" data-kind="' + chain.links[idx - 1].kind + '">' + esc(L(KINDS[chain.links[idx - 1].kind])) + '</i>' : '')
      + '<b style="--station-tint:' + tint(stn.plugin) + '">' + esc(label(stn)) + '</b>').join('');
  }
  function drawList() {
    if (!ui.loaded) return;
    if (!ui.workflows.length) {
      listEl.innerHTML = '<div class="mw-empty wf-empty"><span class="mw-empty__mark">' + ico('workflow') + '</span><strong>' + tx('workflows.list.empty-title') + '</strong>'
        + '<p>' + tx('workflows.list.empty-hint') + '</p>'
        + '<p class="wf-example"><b>Feed</b><i>' + tx('workflows.kind.manual') + '</i><b>Inbox</b><i>AI</i><b>Pages</b></p>'
        + '<button class="mw-btn mw-btn--secondary" type="button" data-wf-action="example">' + ico('sparkles') + '<span>' + tx('workflows.list.example') + '</span></button></div>';
      return;
    }
    listEl.innerHTML = '<nav class="mw-dir__list wf-rows" aria-label="' + tx('workflows.page.title') + '">' + ui.workflows.map((flow) => {
      const selected = ui.workflow?.workflow_id === flow.workflow_id;
      const runs = flow.instance_count ? L('workflows.list.run-count', { count: flow.instance_count }) + (flow.active_count ? ' · ' + L('workflows.list.active-count', { count: flow.active_count }) : '') : L('workflows.list.not-run');
      const live = flow.active_count ? '<i class="wf-row__live" title="' + esc(L('workflows.list.active-count', { count: flow.active_count })) + '"></i>' : '';
      return '<button type="button" class="wf-row directory-list-row' + (selected ? ' is-selected' : '') + '" data-wf-open="' + esc(flow.workflow_id) + '"' + (selected ? ' aria-current="page"' : '') + '>'
        + '<span class="wf-row__title"><span>' + esc(flow.title) + '</span>' + live + '</span><span class="wf-row__chain" data-overflow-fade>' + chainText(flow) + '</span><span class="wf-row__meta">' + esc(runs) + '</span></button>';
    }).join('') + '</nav>';
  }

  function chainIssues(chain) {
    return chain.links.map((link, idx) => ({ index:idx, link, state: readyState(link) })).filter((item) => !item.state.ready);
  }
  function stationHtml(stn, idx, count) {
    const info = stnMeta(stn.plugin); const name = label(stn);
    return '<div class="wf-station" role="listitem" tabindex="0" draggable="true" data-wf-station="' + idx + '" data-station-id="' + esc(stn.station_id) + '" style="--station-tint:' + tint(stn.plugin) + '"'
      + ' aria-label="' + esc(L('workflows.station.label', { plugin: name, n: idx + 1 })) + '" aria-description="' + esc(L('workflows.station.hint', { mod: MOD === '⌘' ? '⌥' : 'Alt +' })) + '">'
      + '<span class="wf-station__icon">' + ico(info.icon) + '</span>'
      + (stn.action ? '<button type="button" class="wf-station__name wf-station__edit" tabindex="-1" data-wf-action="edit-step" data-index="' + idx + '" title="' + tx('workflows.station.edit-step') + '">' + esc(name)
        + (stn.action.group ? '<small>' + esc(stn.action.group) + '</small>' : '') + '</button>' : '<span class="wf-station__name">' + esc(name) + '</span>')
      + (stn.availability?.available === false ? '<span class="wf-station__warning" role="img" aria-label="' + esc(stn.availability.reason) + '" title="' + esc(stn.availability.reason) + '">' + ico('alert') + '</span>' : '')
      + '<span class="wf-station__tools">'
      + (idx > 0 ? '<button type="button" class="wf-tool" tabindex="-1" data-wf-action="move" data-from="' + idx + '" data-gap="' + (idx - 1) + '" aria-label="' + tx('workflows.station.move-earlier') + '" title="' + tx('workflows.station.move-earlier') + '">' + ico('chevron-left') + '</button>' : '')
      + (idx < count - 1 ? '<button type="button" class="wf-tool" tabindex="-1" data-wf-action="move" data-from="' + idx + '" data-gap="' + (idx + 2) + '" aria-label="' + tx('workflows.station.move-later') + '" title="' + tx('workflows.station.move-later') + '">' + ico('chevron-right') + '</button>' : '')
      + '<button type="button" class="wf-tool wf-tool--danger" tabindex="-1" data-wf-action="remove" data-index="' + idx + '" aria-label="' + tx('workflows.station.remove') + '" title="' + tx('workflows.station.remove') + '">' + ico('x') + '</button>'
      + '</span></div>';
  }
  function linkHtml(flow, idx) {
    const link = flow.links[idx]; const ready = readyState(link);
    const from = flow.stations[idx]; const to = flow.stations[idx + 1];
    const between = label(from) + ' → ' + label(to);
    const open = ui.openLink === idx;
    return '<div class="wf-link' + (ui.openGap === idx + 1 ? ' is-picking' : '') + '" data-wf-gap="' + (idx + 1) + '" data-link-key="' + esc(from.station_id + '>' + to.station_id) + '" data-kind="' + link.kind + '" data-ready="' + ready.ready + '">'
      + '<span class="wf-link__line" aria-hidden="true"></span>'
      + '<button type="button" class="wf-link__pill' + (open ? ' is-open' : '') + '" data-wf-action="link" data-link="' + idx + '" aria-haspopup="dialog" aria-expanded="' + open + '" aria-label="' + esc(between + ' · ' + L(KINDS[link.kind]) + (ready.ready ? '' : ' · ' + L('workflows.link.not-connected'))) + '">'
      + (ready.ready ? '' : ico('alert')) + '<span>' + esc(L(KINDS[link.kind])) + '</span></button>'
      + '<button type="button" class="wf-add" data-wf-action="gap" data-gap="' + (idx + 1) + '" aria-label="' + esc(L('workflows.gap.between', { a: label(from), b: label(to) })) + '" title="' + tx('workflows.gap.here') + '">' + ico('plus') + '</button>'
      + '<span class="wf-link__line" aria-hidden="true"></span></div>';
  }
  function chainBody(flow) {
    if (!flow.stations.length) {
      return '<div class="wf-drop' + (ui.openGap === 0 ? ' is-picking' : '') + '" data-wf-gap="0"><span class="wf-drop__mark">' + ico('workflow') + '</span>'
        + '<button type="button" class="mw-btn mw-btn--ghost" data-wf-action="gap" data-gap="0">' + ico('plus') + '<span>' + tx('workflows.gap.first') + '</span></button><span class="wf-muted">' + tx('workflows.gap.drag-here') + '</span></div>';
    }
    const end = (gap, name) => '<div class="wf-end' + (ui.openGap === gap ? ' is-picking' : '') + '" data-wf-gap="' + gap + '"><button type="button" class="wf-add" data-wf-action="gap" data-gap="' + gap + '" aria-label="' + tx(name) + '" title="' + tx(name) + '">' + ico('plus') + '</button></div>';
    const parts = [end(0, 'workflows.gap.at-start')];
    flow.stations.forEach((stn, idx) => {
      parts.push(stationHtml(stn, idx, flow.stations.length));
      if (idx < flow.links.length) parts.push(linkHtml(flow, idx));
    });
    parts.push(end(flow.stations.length, 'workflows.gap.at-end'));
    return parts.join('');
  }
  function faultHtml(flow) {
    const issues = chainIssues(flow);
    if (!issues.length) return '';
    return '<p class="wf-issues" role="status">' + ico('alert') + '<span>' + esc(L('workflows.issues.count', { count: issues.length })) + issues.map((item) => {
      const msg = esc(label(flow.stations[item.index]) + ' → ' + label(flow.stations[item.index + 1]) + '（' + L(item.state.reason) + '）');
      if (flow.stations.slice(item.index, item.index + 2).some(stn => stn.availability?.available === false)) return '<span>' + msg + '</span>';
      return '<button type="button" class="wf-issue" data-wf-action="link" data-link="' + item.index + '">' + msg + '</button>';
    }).join('<span aria-hidden="true">；</span>') + '</span></p>';
  }
  function runStatus(run) {
    if (run.status === 'done') return { tone: 'done', state: 'done', text: L('workflows.run.done') };
    if (run.status === 'stopped') return { tone: 'quiet', state: 'stopped', text: L('workflows.run.stopped', { n: run.current + 1 }) };
    return { tone: 'progress', state: 'doing', text: L('workflows.run.progress', { n: run.current + 1, total: run.chain.stations.length, plugin: label(run.chain.stations[run.current]) }) };
  }
  function pipsHtml(run) {
    return '<span class="wf-pips" aria-hidden="true">' + run.chain.stations.map((stn, i) => '<i data-state="' + stepState(run, i) + '" style="--station-tint:' + tint(stn.plugin) + '"></i>').join('') + '</span>';
  }
  function runsHtml(flow) {
    const absent = flow.stations.find(stn => stn.availability?.available === false);
    const failed = edits.get(flow.workflow_id)?.error;
    const canStart = flow.stations.length >= 2 && !absent && !failed;
    const startReason = failed ? L('workflows.save.failed') : absent ? absent.availability.reason : L('workflows.run.need-two');
    const head = '<div class="wf-section__head"><h2>' + tx('workflows.run.heading') + '</h2><span class="wf-muted">' + esc(ui.instances.length ? L('workflows.list.run-count', { count: ui.instances.length }) : '') + '</span>'
      + '<button class="mw-btn mw-btn--primary" type="button" data-wf-action="start"' + (canStart ? '' : ' disabled title="' + esc(startReason) + '"') + '>' + ico('play') + '<span>' + tx('workflows.run.start') + '</span></button></div>';
    if (!ui.instances.length) {
      return head + '<p class="wf-muted wf-runs-empty">' + esc(absent ? L('workflows.run.restore-first') : canStart ? L('workflows.run.none-yet', { plugin: label(flow.stations[0]) }) : L('workflows.run.arrange-first')) + '</p>';
    }
    return head + '<div class="wf-runs">' + ui.instances.map((run) => {
      const status = runStatus(run);
      return '<button type="button" class="wf-run-row" data-wf-open-instance="' + esc(run.instance_id) + '"><span class="wf-run-row__title">' + esc(run.title) + '</span>' + pipsHtml(run)
        + '<span class="mw-status mw-status--' + status.tone + ' mw-status--plain" data-mw-state="' + status.state + '">' + esc(status.text) + '</span><span class="wf-muted">' + esc(when(run.updated_at)) + '</span></button>';
    }).join('') + '</div>';
  }
  function returnHtml() {
    if (!ui.returnTo) return '';
    return '<button class="mw-btn mw-btn--ghost wf-return" type="button" data-wf-action="return-to-run">' + ico('back') + '<span>' + esc(L('workflows.return.back', { title: ui.returnTo.title })) + '</span></button>';
  }
  function paletteHtml() {
    const joinable = ui.stations.filter((info) => info.supported);
    const others = ui.stations.filter((info) => !info.supported);
    return joinable.map((info) => '<button type="button" class="wf-chip" draggable="true" data-wf-plugin="' + esc(info.plugin) + '" data-wf-action="append" title="' + tx('workflows.palette.chip-hint') + '" style="--station-tint:' + tint(info.plugin) + '">' + ico(info.icon) + '<span>' + esc(L(info.label)) + '</span></button>').join('')
      + '<button type="button" class="wf-chip wf-chip--action" data-wf-action="add-step" title="' + tx('workflows.palette.action-hint') + '">' + ico('zap') + '<span>' + tx('workflows.palette.add-action') + '</span></button>'
      + (others.length ? '<span class="wf-palette__others" title="' + esc(others.map((info) => L(info.label)).join('、')) + '">' + esc(L('workflows.palette.others', { count: others.length })) + '</span>' : '');
  }
  function drawFlow() {
    const flow = ui.workflow;
    if (!flow) return;
    emitCtx();
    const cur = view.querySelector('.wf-editor');
    if (cur && cur.dataset.id === flow.workflow_id) { patchFlowRow(cur); paintSave(); return; }
    view.innerHTML = '<article class="wf-editor" data-id="' + esc(flow.workflow_id) + '">'
      + '<header class="plugin-stage-detail-bar wf-editor__bar"><button class="plugin-stage-back" type="button" data-wf-action="back" aria-label="' + tx('workflows.editor.back') + '" title="' + tx('workflows.editor.back') + '">' + ico('chevron-right') + '</button>'
      + '<input class="mw-input wf-title-input" data-wf-title data-inline-title value="' + esc(flow.title) + '" aria-label="' + tx('workflows.editor.name') + '" maxlength="120">'
      + '<span class="wf-return-slot" data-wf-return>' + returnHtml() + '</span>'
      + '<span class="wf-save-state" data-wf-save-state data-state="idle" aria-live="polite">' + tx('workflows.save.saved') + '</span>'
      + '<button class="mw-btn mw-btn--ghost wf-danger" type="button" data-wf-action="delete">' + ico('trash') + '<span>' + tx('workflows.editor.delete') + '</span></button></header>'
      + '<div class="wf-editor__scroll">'
      + '<section class="wf-section"><h2>' + tx('workflows.chain.heading') + '</h2><p class="wf-hint">' + tx('workflows.chain.hint') + '</p>'
      + '<div class="wf-chain' + (flow.stations.length ? '' : ' is-empty') + '" data-wf-chain' + (flow.stations.length ? ' role="list"' : '') + ' aria-label="' + tx('workflows.chain.label') + '">' + chainBody(flow) + '</div>'
      + '<div class="wf-issues-slot" data-wf-issues>' + faultHtml(flow) + '</div>'
      + '<div class="wf-palette" aria-label="' + tx('workflows.palette.label') + '"><span class="wf-palette__label">' + tx('workflows.palette.plugins') + '</span>' + paletteHtml() + '</div></section>'
      + '<section class="wf-section" data-wf-runs>' + runsHtml(flow) + '</section></div></article>';
    arrive(view.querySelector('.wf-editor'));
    paintSave();
  }
  let focusNext = null;
  function patchFlowRow(editor) {
    const flow = ui.workflow;
    const title = editor.querySelector('[data-wf-title]');
    if (title && document.activeElement !== title && title.value !== flow.title) title.value = flow.title;
    editor.querySelector('[data-wf-return]').innerHTML = returnHtml();
    patchChain(editor.querySelector('[data-wf-chain]'));
    const issues = editor.querySelector('[data-wf-issues]');
    const hadIssues = Boolean(issues.firstElementChild);
    issues.innerHTML = faultHtml(flow);
    if (!hadIssues && issues.firstElementChild) settle(issues.firstElementChild);
    editor.querySelector('[data-wf-runs]').innerHTML = runsHtml(flow);
  }
  function patchChain(chainEl) {
    const flow = ui.workflow;
    const before = new Map(); chainEl.querySelectorAll('[data-station-id]').forEach((el) => before.set(el.dataset.stationId, el.getBoundingClientRect()));
    const links = new Map(); chainEl.querySelectorAll('[data-link-key]').forEach((el) => links.set(el.dataset.linkKey, el.dataset.kind + ':' + el.dataset.ready));
    const focused = document.activeElement?.closest?.('[data-station-id]');
    const focusId = focusNext || (focused && chainEl.contains(focused) ? focused.dataset.stationId : null);
    focusNext = null;
    const empty = !flow.stations.length;
    chainEl.classList.toggle('is-empty', empty);
    if (empty) chainEl.removeAttribute('role'); else chainEl.setAttribute('role', 'list');
    chainEl.innerHTML = chainBody(flow);
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

  ${WORKFLOW_SAVE_SCRIPT}
  const chainOf = () => ({ stations: [...ui.workflow.stations], links: [...ui.workflow.links] });
  async function removeAt(idx, { keyboard = false } = {}) {
    const flow = ui.workflow; if (!flow) return;
    const stn = flow.stations[idx];
    const el = view.querySelector('[data-wf-chain] [data-wf-station="' + idx + '"]');
    const leaving = motion(el, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.88)' }], { duration: 130, easing: EASE_STANDARD, fill: 'forwards' });
    if (leaving) await Promise.race([leaving.finished.catch(() => undefined), new Promise((resolve) => setTimeout(resolve, 180))]);
    if (ui.workflow !== flow || root.dataset.wfMode !== 'workflow') return;
    idx = flow.stations.findIndex(item => item.station_id === stn.station_id);
    if (idx < 0) return;
    if (keyboard) { const next = flow.stations[idx + 1] || flow.stations[idx - 1]; focusNext = next ? next.station_id : null; }
    saveFlow({ chain: removeStn(chainOf(), idx), undoable: true, announce: L('workflows.toast.removed', { plugin: label(flow.stations[idx]) }) });
  }
  function insertAt(gap, plug, { focus = false } = {}) {
    const id = uid();
    if (focus) focusNext = id;
    saveFlow({ chain: insertStn(chainOf(), stnMeta(plug).receives === false ? 0 : gap, plug, id), undoable: true });
  }
  function moveTo(from, gap, { focus = false } = {}) {
    const stn = ui.workflow.stations[from];
    if (focus && stn) focusNext = stn.station_id;
    saveFlow({ chain: moveStation(chainOf(), from, gap), undoable: true });
  }

  let popAt = null;
  function setPop(anchor) {
    const box = anchor.getBoundingClientRect(); const size = pop.getBoundingClientRect();
    const left = Math.max(12, Math.min(window.innerWidth - size.width - 12, box.left + box.width / 2 - size.width / 2));
    const below = box.bottom + 8 + size.height < window.innerHeight - 12;
    pop.style.left = left + 'px';
    pop.style.top = (below ? box.bottom + 8 : Math.max(12, box.top - size.height - 8)) + 'px';
    pop.dataset.side = below ? 'below' : 'above';
  }
  function placePop(anchorOf) {
    popAt = anchorOf;
    const anchor = anchorOf();
    if (!anchor) return;
    if (!pop.matches(':popover-open')) pop.showPopover?.();
    setPop(anchor);
  }
  function fitPop() {
    const box = pop.getBoundingClientRect();
    if (box.bottom > window.innerHeight - 12) pop.style.top = Math.max(12, window.innerHeight - 12 - box.height) + 'px';
  }
  function movePop() {
    if (!pop.matches?.(':popover-open') || !popAt) return;
    const anchor = popAt();
    if (!anchor || !anchor.isConnected) { pop.hidePopover(); return; }
    const box = anchor.getBoundingClientRect();
    if (box.bottom < 0 || box.top > window.innerHeight) { pop.hidePopover(); return; }
    setPop(anchor);
  }
  const pillOf = (idx) => () => view.querySelector('[data-wf-chain] [data-wf-action=link][data-link="' + idx + '"]');
  const gapButtonOf = (gap) => () => view.querySelector('[data-wf-chain] [data-wf-action=gap][data-gap="' + gap + '"]');
  function markOpen() {
    view.querySelectorAll('[data-wf-chain] .wf-link__pill').forEach((pill) => {
      const open = Number(pill.dataset.link) === ui.openLink;
      pill.classList.toggle('is-open', open); pill.setAttribute('aria-expanded', String(open));
    });
    view.querySelectorAll('[data-wf-chain] [data-wf-gap]').forEach((gap) => gap.classList.toggle('is-picking', Number(gap.dataset.wfGap) === ui.openGap));
  }
  ${WORKFLOW_GAP_PICKER_SCRIPT}
  function linkView(link) {
    const field = (name, title, val, rows, placeholder) => '<label class="mw-field"><span class="mw-field__label">' + tx(title) + '</span>'
      + (rows === 1 ? '<input class="mw-input" data-wf-link-field="' + name + '" value="' + esc(val) + '" placeholder="' + esc(placeholder) + '">' : '<textarea class="mw-textarea" rows="' + rows + '" data-wf-link-field="' + name + '" placeholder="' + esc(placeholder) + '">' + esc(val) + '</textarea>') + '</label>';
    if (link.kind === 'function') {
      return field('title_template', 'workflows.rule.title', link.title_template, 1, '{标题}') + field('body_template', 'workflows.rule.body', link.body_template, 5, L('workflows.rule.body-placeholder', { source: '{来源}', link: '{链接}', body: '{正文}' }))
        + '<p class="wf-tokens"><span>' + tx('workflows.rule.insert') + '</span>' + ['标题', '正文', '来源', '链接', '日期'].map((name) => '<button type="button" class="wf-token" data-wf-token="{' + name + '}" title="' + tx('workflows.rule.insert-into-body') + '">{' + esc(name) + '}</button>').join('') + '</p>'
        + '<p class="wf-hint">' + tx('workflows.rule.title-empty-note') + '</p>';
    }
    if (link.kind === 'ai') return field('instructions', 'workflows.ai.target', link.instructions, 4, 'workflows.ai.placeholder');
    if (link.kind === 'judgment') {
      if (!ui.judgments) return '<div class="wf-judgment" aria-busy="true"><span class="mw-skeleton" style="width:70%"></span><span class="mw-skeleton wf-skeleton-small"></span></div>';
      const rows = [...ui.judgments];
      if (link.judgment && !rows.some(row => ruleKey(row.ref) === ruleKey(link.judgment))) rows.unshift({ ref: link.judgment, title: link.judgment.title || link.judgment.capability_id, choices: [], available: false, reason: 'workflows.judgment.gone' });
      const cur = rows.find(row => ruleKey(row.ref) === ruleKey(link.judgment));
      const picker = rows.length
        ? '<label class="mw-field"><span class="mw-field__label">' + tx('workflows.kind.judgment') + '</span><select class="mw-select" data-wf-judgment>'
          + (link.judgment ? '' : '<option value="" selected>' + tx('workflows.judgment.choose') + '</option>')
          + rows.map(row => '<option value="' + esc(ruleKey(row.ref)) + '"' + (row === cur ? ' selected' : '') + '>' + esc(row.title + ' · v' + row.ref.version + (row.available ? '' : ' · ' + L(row.reason || 'workflows.judgment.unavailable'))) + '</option>').join('') + '</select></label>'
        : '<p class="wf-hint">' + tx('workflows.judgment.none') + ' <a href="/capabilities/rules">' + tx('workflows.judgment.write') + '</a></p>';
      const choices = cur ? '<fieldset class="wf-pass"><legend class="mw-field__label">' + tx('workflows.judgment.pass-when') + '</legend>'
        + (cur.choices.length ? cur.choices.map(choice => '<label class="mw-check-row"><input class="mw-check" type="checkbox" data-wf-pass value="' + esc(choice) + '"' + ((link.pass || []).includes(choice) ? ' checked' : '') + '><span>' + esc(choice) + '</span></label>').join('')
          : '<p class="wf-muted">' + tx('workflows.judgment.unreadable') + '</p>') + '</fieldset>' : '';
      return picker + choices + '<p class="wf-hint">' + tx('workflows.judgment.note') + '</p>';
    }
    return '<p class="wf-hint">' + tx('workflows.manual.note') + '</p>';
  }
  function backFoot(ready) {
    if (!ui.returnTo) return '';
    return '<footer class="wf-pop__foot"><button class="mw-btn mw-btn--primary" type="button" data-wf-action="return-to-run" data-wf-return-button' + (ready.ready ? '' : ' disabled') + '>' + ico('arrow') + '<span>' + esc(L('workflows.link.return-continue', { title: ui.returnTo.title })) + '</span></button></footer>';
  }
  const LABEL = { title: 'workflows.field.title', body: 'workflows.field.body', source: 'workflows.field.source', url: 'workflows.field.link', date: 'workflows.field.date' };
  const refKey = ruleKey;
  async function loadActions() {
    if (ui.actionSteps) return ui.actionSteps;
    try { ui.actionSteps = (await api('/steps/actions')).actions; } catch (err) { ui.actionSteps = []; toast(err.message, 'error'); }
    return ui.actionSteps;
  }
  const stepOf = (draft) => (ui.actionSteps || []).find(row => refKey(row.ref) === refKey(draft.ref));
  function stepError(draft, choice) {
    if (!draft.ref) return L('workflows.step.no-action');
    if (!choice) return L('workflows.step.action-gone');
    if (!choice.available) return L(choice.reason || 'workflows.step.action-unavailable');
    for (const field of choice.fields) if (field.required && !draft.mapping[field.name]) return L('workflows.step.field-empty', { field: field.title || field.name });
    for (const [name, originEl] of Object.entries(draft.mapping)) {
      const field = choice.fields.find(item => item.name === name);
      if (!field) return L('workflows.step.field-dropped', { field: name });
      if ('value' in originEl && (originEl.value === '' || originEl.value === undefined || (typeof originEl.value === 'number' && Number.isNaN(originEl.value)))) return L('workflows.step.fixed-empty', { field: field.title || name });
    }
    return '';
  }
  function formHtml(draft, choice) {
    if (!choice) return '';
    if (!choice.fields.length) return '<p class="wf-hint">' + tx('workflows.step.no-input') + '</p>';
    return '<div class="wf-map" role="group" aria-label="' + tx('workflows.step.fields-heading') + '">' + choice.fields.map((field) => {
      const originEl = draft.mapping[field.name];
      const cur = !originEl ? '' : 'from' in originEl ? 'from:' + originEl.from : 'value';
      const named = field.title || field.name;
      const mappable = field.type === 'string' && !field.enum;
      const opts = (field.required ? (cur === '' ? '<option value="" selected disabled>' + tx('workflows.step.pick-source') + '</option>' : '') : '<option value=""' + (cur === '' ? ' selected' : '') + '>' + tx('workflows.step.leave-empty') + '</option>')
        + (mappable ? Object.keys(LABEL).map((key) => '<option value="from:' + key + '"' + (cur === 'from:' + key ? ' selected' : '') + '>' + esc(L('workflows.step.from-handed', { field: L(LABEL[key]) })) + '</option>').join('') : '')
        + '<option value="value"' + (cur === 'value' ? ' selected' : '') + '>' + tx('workflows.step.fixed-value') + '</option>';
      let valueEl = '';
      if (cur === 'value') {
        const val = originEl.value; const aria = ' aria-label="' + esc(L('workflows.step.fixed-value-for', { field: named })) + '"';
        valueEl = field.enum ? '<select class="mw-select" data-wf-map-value="' + esc(field.name) + '"' + aria + '>' + field.enum.map((option) => '<option value="' + esc(String(option)) + '"' + (option === val ? ' selected' : '') + '>' + esc(String(option)) + '</option>').join('') + '</select>'
          : field.type === 'boolean' ? '<select class="mw-select" data-wf-map-value="' + esc(field.name) + '"' + aria + '><option value="true"' + (val === true ? ' selected' : '') + '>' + tx('workflows.step.yes') + '</option><option value="false"' + (val === false ? ' selected' : '') + '>' + tx('workflows.step.no') + '</option></select>'
          : '<input class="mw-input" data-wf-map-value="' + esc(field.name) + '"' + aria + (field.type === 'string' ? '' : ' type="number" inputmode="decimal"' + (field.type === 'integer' ? ' step="1"' : '')) + ' value="' + esc(val === undefined ? '' : String(val)) + '">';
      }
      return '<div class="wf-map__row"><span class="wf-map__name">' + esc(named) + (field.required ? '<i aria-label="' + tx('workflows.step.required') + '">*</i>' : '')
        + (field.title && field.title !== field.name ? '<small>' + esc(field.name) + '</small>' : '') + '</span>'
        + '<select class="mw-select" data-wf-map-source="' + esc(field.name) + '" aria-label="' + esc(L('workflows.step.comes-from', { field: named })) + '">' + opts + '</select>' + valueEl + '</div>';
    }).join('') + '</div>';
  }
  function readyView(problem) {
    if (problem) return ico('alert') + '<span>' + esc(problem) + '</span>';
    return ico('check') + '<span>' + tx(Object.keys(ui.stepDraft.mapping).length ? 'workflows.step.all-filled' : 'workflows.step.no-required') + '</span>';
  }
  function editHtml() {
    const draft = ui.stepDraft; const rows = [...(ui.actionSteps || [])];
    if (draft.ref && ui.actionSteps && !stepOf(draft)) rows.unshift({ ref: draft.ref, title: draft.title, group: draft.group || '', fields: [], available: false, reason: 'workflows.judgment.gone' });
    const choice = rows.find(row => refKey(row.ref) === refKey(draft.ref));
    const query = (ui.stepQuery || '').trim().toLowerCase();
    const visible = query ? rows.filter(row => row === choice || [row.title, row.group, row.description || ''].join(' ').toLowerCase().includes(query)) : rows;
    const groups = [...new Set(visible.map(row => row.group))];
    const search = rows.length > 12 ? '<label class="mw-field"><span class="mw-field__label">' + tx('workflows.step.find') + '</span><input class="mw-input" type="search" data-wf-step-search value="'
      + esc(ui.stepQuery || '') + '" placeholder="' + esc(L('workflows.step.filter-hint')) + '" aria-label="' + esc(L('workflows.step.filter-hint')) + '"></label>' : '';
    const picker = !ui.actionSteps ? '<div class="wf-judgment" aria-busy="true"><span class="mw-skeleton" style="width:70%"></span><span class="mw-skeleton wf-skeleton-small"></span></div>'
      : rows.length ? search + (visible.length ? '<label class="mw-field"><span class="mw-field__label">' + tx('workflows.step.which') + (query ? '<small>' + esc(L('workflows.step.match-count', { count: String(visible.length) })) + '</small>' : '') + '</span><select class="mw-select" data-wf-step-action>'
        + (draft.ref ? '' : '<option value="" selected disabled>' + tx('workflows.step.choose') + '</option>')
        + groups.map(group => '<optgroup label="' + esc(group) + '">' + visible.filter(row => row.group === group).map(row => '<option value="' + esc(refKey(row.ref)) + '"' + (row === choice ? ' selected' : '') + '>'
          + esc(row.title + (row.available ? '' : ' · ' + L(row.reason || 'workflows.judgment.unavailable'))) + '</option>').join('') + '</optgroup>').join('') + '</select></label>'
        : '<p class="wf-hint" role="status">' + tx('workflows.step.no-match') + '</p>')
        + (choice?.description ? '<p class="wf-hint">' + esc(choice.description) + '</p>' : '')
      : '<p class="wf-hint">' + tx('workflows.step.none-available') + '</p>';
    const problem = ui.actionSteps ? stepError(draft, choice) : '';
    const editing = ui.stepIndex !== null;
    return '<header class="wf-pop__head"><strong>' + tx(editing ? 'workflows.step.running-heading' : 'workflows.palette.add-action') + '</strong><span class="wf-muted">' + tx('workflows.step.running-hint') + '</span></header>'
      + '<div class="wf-link-fields">' + picker + '<div data-wf-step-fields>' + formHtml(draft, choice) + '</div>'
      + (ui.actionSteps && rows.length ? '<p class="wf-readiness" data-ready="' + !problem + '" data-wf-step-ready>' + readyView(problem) + '</p>' : '') + '</div>'
      + '<footer class="wf-pop__foot"><button class="mw-btn mw-btn--primary" type="button" data-wf-action="step-save"' + (problem || !ui.actionSteps ? ' disabled' : '') + '>' + ico(editing ? 'check' : 'plus') + '<span>' + tx(editing ? 'workflows.step.save' : 'workflows.step.append') + '</span></button></footer>';
  }
  function drawStep() {
    pop.innerHTML = editHtml();
    fitPop();
  }
  async function openStep(idx, anchorOf) {
    const flow = ui.workflow; const stn = idx === null ? null : flow.stations[idx];
    ui.stepIndex = idx;
    ui.stepDraft = stn?.action ? JSON.parse(JSON.stringify(stn.action)) : { ref: null, title: '', group: '', mapping: {} };
    ui.stepQuery = '';
    ui.openLink = null; ui.openGap = null;
    pop.dataset.mode = 'step'; delete pop.dataset.link;
    drawStep();
    markOpen();
    placePop(anchorOf);
    await loadActions();
    if (ui.workflow !== flow || pop.dataset.mode !== 'step' || !pop.matches(':popover-open')) return;
    drawStep(); settle(pop.querySelector('.wf-link-fields'));
    pop.querySelector('[data-wf-step-action]')?.focus({ preventScroll: true });
  }
  function saveStep() {
    const draft = ui.stepDraft; const chain = chainOf();
    if (stepError(draft, stepOf(draft))) return;
    pop.hidePopover?.();
    if (ui.stepIndex === null) {
      const id = uid(); focusNext = id;
      const inserted = insertStn(chain, chain.stations.length, 'action', id);
      inserted.stations[inserted.stations.length - 1] = { station_id: id, plugin: 'action', action: draft };
      saveFlow({ chain: inserted, undoable: true, announce: L('workflows.toast.action-added', { action: draft.title }) });
      return;
    }
    const { availability, ...kept } = chain.stations[ui.stepIndex];
    void availability;
    chain.stations[ui.stepIndex] = { ...kept, action: draft };
    saveFlow({ chain, undoable: true });
  }
  function setMap(fieldEl) {
    const draft = ui.stepDraft; const name = fieldEl.dataset.wfMapValue;
    const field = stepOf(draft)?.fields.find(item => item.name === name);
    const raw = fieldEl.value;
    const val = field?.type === 'boolean' ? raw === 'true' : field?.type === 'number' || field?.type === 'integer' ? (raw.trim() === '' ? '' : Number(raw))
      : field?.enum ? field.enum.find(option => String(option) === raw) : raw;
    ui.stepDraft = { ...draft, mapping: { ...draft.mapping, [name]: { value:val } } };
  }
  function showLink(idx) {
    const flow = ui.workflow; const link = flow.links[idx];
    const from = label(flow.stations[idx]); const to = label(flow.stations[idx + 1]);
    const ready = readyState(link);
    ui.openLink = idx; ui.openGap = null;
    pop.dataset.mode = 'link'; pop.dataset.link = String(idx);
    pop.innerHTML = '<header class="wf-pop__head"><strong>' + esc(from + ' → ' + to) + '</strong><span class="wf-muted">' + tx('workflows.link.heading') + '</span></header>'
      + '<div class="mw-toggle-group wf-kinds" role="radiogroup" aria-label="' + tx('workflows.link.type') + '">'
      + ['judgment', 'function', 'ai', 'manual'].map((kind) => '<button type="button" class="mw-toggle' + (kind === link.kind ? ' is-current' : '') + '" role="radio" aria-checked="' + (kind === link.kind) + '" data-wf-action="kind" data-kind="' + kind + '" data-link="' + idx + '">' + esc(L(KINDS[kind])) + '</button>').join('')
      + '</div><p class="wf-kind-help" data-wf-kind-help>' + tx(KIND_HELP[link.kind]) + '</p><div class="wf-link-fields" data-wf-link-fields>' + linkView(link) + '</div>'
      + '<p class="wf-readiness" data-ready="' + ready.ready + '" data-wf-readiness>' + readyRow(ready) + '</p>' + backFoot(ready);
    markOpen();
    placePop(pillOf(idx));
    if (link.kind === 'judgment' && !ui.judgments) checkRules(idx);
  }
  async function checkRules(idx, force) {
    const flow = ui.workflow;
    await loadRules(force);
    if (ui.workflow !== flow || pop.dataset.mode !== 'link' || Number(pop.dataset.link) !== idx) return;
    const formFields = pop.querySelector('[data-wf-link-fields]');
    if (formFields && ui.workflow.links[idx].kind === 'judgment') { formFields.innerHTML = linkView(ui.workflow.links[idx]); settle(formFields); }
    checkReady(idx);
  }
  function switchKind(idx, kind, { pointer = false } = {}) {
    const chain = chainOf();
    if (chain.links[idx].kind === kind) return;
    chain.links[idx] = { ...chain.links[idx], kind };
    saveFlow({ chain, undoable: true });
    pop.querySelectorAll('[data-wf-action=kind]').forEach((toggle) => {
      const on = toggle.dataset.kind === kind;
      toggle.classList.toggle('is-current', on); toggle.setAttribute('aria-checked', String(on));
    });
    pop.querySelector('[data-wf-kind-help]').textContent = L(KIND_HELP[kind]);
    const formFields = pop.querySelector('[data-wf-link-fields]');
    formFields.innerHTML = linkView(ui.workflow.links[idx]);
    settle(formFields);
    checkReady(idx);
    fitPop();
    if (kind === 'judgment' && !ui.judgments) checkRules(idx);
    if (pointer) formFields.querySelector('input, textarea')?.focus({ preventScroll: true });
  }
  function checkReady(idx) {
    const link = ui.workflow.links[idx]; const ready = readyState(link);
    const el = pop.querySelector('[data-wf-readiness]');
    if (el) { if (el.dataset.ready !== String(ready.ready)) settle(el); el.dataset.ready = String(ready.ready); el.innerHTML = readyRow(ready); }
    const back = pop.querySelector('[data-wf-return-button]');
    if (back) back.disabled = !ready.ready;
  }
  function readyRow(ready) {
    if (ready.ready) return ico('check') + '<span>' + tx('workflows.link.connected') + '</span>';
    const fix = ready.reason === 'workflows.ready.no-model' ? ' <a href="/settings/models">' + tx('workflows.link.open-model-settings') + '</a>' : '';
    return ico('alert') + '<span>' + esc(L('workflows.link.not-connected-reason', { reason: L(ready.reason) })) + fix + '</span>';
  }

  let submitForm = null; dlg.addEventListener('cancel', (ev) => { if (dlg.querySelector('[data-loading]')) ev.preventDefault(); }); // Esc and Close do not pretend to cancel a submit on its way (VUX-29).
  function showForm(title, bodyHtml, submitLabel, onSubmit, { tone } = {}) {
    dlg.querySelector('[data-wf-dialog-title]').textContent = title;
    dlg.querySelector('[data-wf-dialog-body]').innerHTML = bodyHtml;
    const submit = dlg.querySelector('[data-wf-dialog-submit]');
    submit.innerHTML = '<span>' + esc(submitLabel) + '</span>';
    submit.classList.toggle('mw-btn--danger', tone === 'danger'); submit.classList.toggle('mw-btn--primary', tone !== 'danger');
    submit.disabled = !onSubmit;
    const err = dlg.querySelector('[data-wf-dialog-error]'); err.hidden = true; err.textContent = '';
    submitForm = onSubmit;
    if (!dlg.open) dlg.showModal();
  }
  const skeletonPicks = () => '<div class="wf-picks" aria-busy="true">' + [62, 48, 70].map((width) => '<div class="wf-pick wf-pick--skeleton"><span class="mw-skeleton wf-skeleton-dot"></span><span><span class="mw-skeleton" style="width:' + width + '%"></span><span class="mw-skeleton wf-skeleton-small"></span></span></div>').join('') + '</div>';
  async function startRun() {
    const flow = ui.workflow; flushSave(); await queue;
    if (ui.workflow !== flow || edits.get(flow.workflow_id)?.error || flow.stations.length < 2) return;
    const first = flow.stations[0].plugin;
    const hint = '<p class="wf-hint">' + esc(L('workflows.run.starts-from', { plugin: label(first) })) + '</p>';
    showForm(L('workflows.run.start'), hint + skeletonPicks(), L('workflows.run.started'), null);
    try {
      const res = await api('/stations/' + first + '/items');
      const items = res.items;
      const blank = res.can_start_blank ? '<label class="mw-check-row wf-pick wf-pick--blank"><input class="mw-radio" type="radio" name="start" value="" ' + (items.length ? '' : 'checked') + '><span><strong>' + esc(L('workflows.run.create-new', { plugin: label(first) })) + '</strong><input class="mw-input" name="blank_title" maxlength="120" placeholder="' + tx('workflows.run.name') + '"></span></label>' : '';
      const filterEl = items.length > 6 ? '<label class="wf-pick-filter">' + ico('search') + '<input class="mw-input" type="search" data-wf-pick-filter placeholder="' + tx('workflows.run.filter') + '" aria-label="' + tx('workflows.run.filter') + '"></label>' : '';
      const list = items.length ? '<div class="wf-picks" role="radiogroup" aria-label="' + tx('workflows.run.pick-first') + '">' + items.map((item, idx) => '<label class="mw-check-row wf-pick" data-wf-pick-text="' + esc((item.title + ' ' + item.caption).toLowerCase()) + '"><input class="mw-radio" type="radio" name="start" value="' + esc(item.item_id) + '"' + (idx === 0 ? ' checked' : '') + '><span><strong>' + esc(item.title) + '</strong><small>' + esc([item.caption, when(item.at)].filter(Boolean).join(' · ')) + '</small></span></label>').join('') + '<p class="wf-muted wf-picks-none" data-wf-picks-none hidden>' + tx('workflows.run.no-match') + '</p></div>'
        : (blank ? '' : '<p class="wf-muted">' + esc(L('workflows.run.nothing-to-start', { plugin: label(first) })) + '</p>');
      if (!dlg.open) return;
      const body = dlg.querySelector('[data-wf-dialog-body]');
      body.innerHTML = hint + filterEl + blank + list;
      settle(body.querySelector('.wf-picks') || body.lastElementChild);
      submitForm = async () => {
        const picked = formEl.querySelector('input[name=start]:checked');
        if (!picked) throw new Error(L('workflows.run.pick-first'));
        const request = picked.value ? { item_id: picked.value } : { title: formEl.querySelector('input[name=blank_title]')?.value || '' };
        const started = await api('/' + flow.workflow_id + '/instances', request);
        dlg.close();
        await showFlow(flow.workflow_id, { keepInstance: true });
        await openRun(started.instance.instance_id, 0);
      };
      dlg.querySelector('[data-wf-dialog-submit]').disabled = !(items.length || blank);
      (body.querySelector('[data-wf-pick-filter]') || body.querySelector('input[name=start]:checked') || body.querySelector('input[name=blank_title]'))?.focus();
    } catch (err) {
      const el = dlg.querySelector('[data-wf-dialog-error]'); el.textContent = err.message; el.hidden = false;
    }
  }
  function filterPicks(query) {
    const needle = query.trim().toLowerCase();
    let shown = 0; let firstView = null;
    dlg.querySelectorAll('[data-wf-pick-text]').forEach((pick) => {
      const hit = !needle || pick.dataset.wfPickText.includes(needle);
      pick.hidden = !hit;
      if (hit) { shown += 1; firstView = firstView || pick; }
    });
    const none = dlg.querySelector('[data-wf-picks-none]'); if (none) none.hidden = shown > 0;
    const checked = dlg.querySelector('[data-wf-pick-text] input:checked');
    if (checked && checked.closest('[data-wf-pick-text]').hidden && firstView) firstView.querySelector('input').checked = true;
  }

  function stepState(run, idx) {
    const step = run.steps[idx];
    if (step.status === 'done' || (run.status === 'done' && idx <= run.current)) return 'done';
    if (idx === run.current && run.status !== 'done') return run.status === 'stopped' ? 'stopped' : 'current';
    return 'pending';
  }
  function linkState(run, i) {
    const link = run.chain.links[i]; const handoff = run.steps[i].handoff;
    if (handoff) return 'done';
    if (ui.busy && ui.busy.kind === 'handoff' && ui.busy.index === i) return 'working';
    if (i === run.current && run.status === 'active') return readyState(link).ready ? 'waiting' : 'blocked';
    return 'future';
  }
  function runBarHtml(run) {
    const status = runStatus(run);
    return '<button class="plugin-stage-back" type="button" data-wf-action="back-to-flow" aria-label="' + tx('workflows.run.back-to-flow') + '" title="' + tx('workflows.run.back-to-flow') + '">' + ico('chevron-right') + '</button>'
      + '<div class="wf-run__title"><h1>' + esc(run.title) + '</h1><span class="wf-muted">' + esc(ui.instanceWorkflowTitle || '') + '</span></div>'
      + pipsHtml(run) + '<span class="mw-status mw-status--' + status.tone + ' mw-status--plain wf-run__status" data-mw-state="' + status.state + '">' + esc(status.text) + '</span>'
      + (run.status === 'active' ? '<button class="mw-btn mw-btn--ghost" type="button" data-wf-action="stop">' + ico('pause') + '<span>' + tx('workflows.run.end') + '</span></button>' : '');
  }
  function vchainHtml(run, selected) {
    const chain = run.chain;
    return chain.stations.map((stn, i) => {
      const s = run.steps[i]; const st = stepState(run, i);
      const mark = '<i data-mw-state="' + (st === 'current' ? 'doing' : st === 'pending' ? 'waiting' : st) + '"></i>';
      let linkRow = '';
      if (i < chain.links.length) {
        const link = chain.links[i]; const ls = linkState(run, i); const kind = L(KINDS[link.kind]);
        const text = ls === 'done' ? L('workflows.run.kind-handed', { kind, time: when(s.handoff.at) })
          : ls === 'working' ? (link.kind === 'ai' ? L('workflows.run.ai-working') : L('workflows.run.handing'))
          : ls === 'waiting' ? (link.kind === 'manual' ? L('workflows.run.manual-waiting') : L('workflows.run.waiting-continue', { kind }))
          : ls === 'blocked' ? L('workflows.run.kind-not-connected', { kind }) : kind;
        linkRow = '<div class="wf-vlink" data-wf-vlink="' + i + '" data-kind="' + link.kind + '" data-state="' + ls + '"><span class="wf-vlink__line" aria-hidden="true"></span><span class="wf-vlink__label" data-mw-state="' + ({done:'done',working:'running',waiting:'answer',blocked:'blocked',future:'idle'}[ls]) + '">' + esc(text) + '</span></div>';
      }
      const on = i === selected;
      return '<button type="button" class="wf-vstep is-' + st + (on ? ' is-selected' : '') + '" data-wf-step="' + i + '" tabindex="' + (on ? '0' : '-1') + '" style="--station-tint:' + tint(stn.plugin) + '"' + (on ? ' aria-current="step"' : '') + '>'
        + '<span class="wf-vstep__mark">' + mark + '</span><span class="wf-station__icon">' + ico(stnMeta(stn.plugin).icon) + '</span>'
        + '<span class="wf-vstep__copy"><strong>' + esc(label(stn)) + '</strong><small>' + esc(stn.action ? (s.item ? L('workflows.run.ran-in', { place: stn.action.group || L('workflows.run.the-plugin') }) : run.steps[i - 1]?.pending?.attempted_at ? L('workflows.run.unconfirmed') : st === 'pending' ? L('workflows.run.not-reached') : '')
          : s.item ? s.item.title : (st === 'pending' ? L('workflows.run.not-reached') : '')) + '</small></span></button>' + linkRow;
    }).join('');
  }
  let lastRun = { id: null, steps: null, links: null };
  function drawRun() {
    const run = ui.instance; if (!run) return;
    let article = view.querySelector('.wf-run');
    if (!article || article.dataset.id !== run.instance_id) {
      view.innerHTML = '<article class="wf-run" data-id="' + esc(run.instance_id) + '"><header class="plugin-stage-detail-bar wf-run__bar" data-wf-run-bar></header>'
        + '<div class="wf-run__body"><nav class="wf-vchain" data-wf-vchain aria-label="' + tx('workflows.run.steps-heading') + '"></nav>'
        + '<section class="wf-stage"><header class="wf-stage__head" data-wf-stage-head></header><div class="wf-handoff" data-wf-handoff></div>'
        + '<div class="wf-stage__frame" data-wf-frame-slot></div></section></div></article>';
      article = view.querySelector('.wf-run');
      arrive(article);
      lastRun = { id: run.instance_id, steps: null, links: null };
    }
    patchInstance(article);
  }
  function patchInstance(article) {
    const run = ui.instance;
    const idx = Math.max(0, Math.min(ui.step, run.chain.stations.length - 1));
    const step = run.steps[idx];
    article.querySelector('[data-wf-run-bar]').innerHTML = runBarHtml(run);

    const vchain = article.querySelector('[data-wf-vchain]');
    const stepFocus = vchain.contains(document.activeElement) ? document.activeElement.dataset.wfStep : null;
    vchain.innerHTML = vchainHtml(run, idx);
    const steps = run.steps.map((_, i) => stepState(run, i));
    const links = run.chain.links.map((_, i) => linkState(run, i));
    if (lastRun.steps && !calm()) {
      steps.forEach((val, i) => { if (lastRun.steps[i] !== val) vchain.querySelector('[data-wf-step="' + i + '"]')?.classList.add('is-changed'); });
      links.forEach((val, i) => { if (lastRun.links[i] !== val) vchain.querySelector('[data-wf-vlink="' + i + '"]')?.classList.add('is-changed'); });
    }
    lastRun.steps = steps; lastRun.links = links;
    if (stepFocus !== null && stepFocus !== undefined) vchain.querySelector('[data-wf-step="' + stepFocus + '"]')?.focus({ preventScroll: true });
    article.querySelector('[data-wf-stage-head]').innerHTML = '<span class="wf-stage__step">' + esc(L('workflows.run.step-n', { n: idx + 1 })) + '</span><span class="wf-station__icon" style="--station-tint:' + tint(step.plugin) + '">' + ico(stnMeta(step.plugin).icon) + '</span><strong>' + esc(label(run.chain.stations[idx])) + '</strong>' + (step.item && step.plugin !== 'action' ? '<span class="wf-muted">' + esc(step.item.title) + '</span>' : '');
    const handoffBox = article.querySelector('[data-wf-handoff]');
    const actionFocus = handoffBox.contains(document.activeElement) ? document.activeElement.dataset.wfAction : null;
    const key = handoffKey(run, idx);
    handoffBox.innerHTML = renderHandoff(run, idx);
    if (handoffBox.dataset.key !== key) { handoffBox.dataset.key = key; settle(handoffBox.firstElementChild); }
    if (actionFocus) handoffBox.querySelector('[data-wf-action="' + actionFocus + '"]')?.focus({ preventScroll: true });

    syncFrame(article.querySelector('[data-wf-frame-slot]'), step, run.chain.stations[idx]);
  }
  function syncFrame(slot, step, stn) {
    if (stn?.action) {
      const key = 'action:' + (step.item ? step.item.item_id : 'pending') + ':' + (step.result === undefined ? '' : 'done');
      if (slot.dataset.src === key) return;
      slot.dataset.src = key; slot.className = 'wf-stage__frame is-empty';
      const res = step.result_presentation;
      slot.innerHTML = step.item
        ? '<div class="wf-stage__result"><div class="wf-result-summary" data-wf-result-summary><h3>' + tx(res?.summary || 'workflows.result.returned') + '</h3>'
          + (res?.title ? '<p class="wf-result-title">' + esc(res.title) + '</p>' : '')
          + (res?.text ? '<p class="wf-result-text">' + esc(res.text) + '</p>' : '')
          + (res?.text_truncated ? '<p class="wf-muted">' + tx(step.result_truncated ? 'workflows.result.excerpt' : 'workflows.result.excerpt-full') + '</p>' : '')
          + (res?.link ? '<a class="mw-btn mw-btn--secondary" data-wf-result-link href="' + esc(res.link.href) + '">' + tx(res.link.label) + '</a>' : '') + '</div>'
          + '<details class="wf-result-details"><summary>' + tx('workflows.result.technical') + '</summary>'
          + (step.result_truncated ? '<p class="wf-muted">' + tx('workflows.result.too-long') + '</p>' : '<pre class="wf-rule">' + esc(JSON.stringify(step.result ?? null, null, 2)) + '</pre>') + '</details>'
          + '<details class="wf-result-details"><summary>' + tx('workflows.result.input') + '</summary>' + dataHtml(step.payload || { title: '', body: '' }) + '</details></div>'
        : '<div class="mw-empty wf-stage__empty"><span class="mw-empty__mark">' + ico('zap') + '</span><strong>' + tx('workflows.run.not-at-step') + '</strong><p>' + esc(L('workflows.run.will-run', { action: stn.action.title })) + '</p></div>';
      settle(slot.firstElementChild);
      return;
    }
    if (!step.item) {
      if (slot.dataset.src === '') return;
      slot.dataset.src = '';
      slot.className = 'wf-stage__frame is-empty';
      slot.innerHTML = '<div class="mw-empty wf-stage__empty"><span class="mw-empty__mark">' + ico(stnMeta(step.plugin).icon) + '</span><strong>' + tx('workflows.run.not-at-step') + '</strong><p>' + esc(L('workflows.run.will-show', { plugin: label(step.plugin) })) + '</p></div>';
      settle(slot.firstElementChild);
      return;
    }
    const src = step.item.plugin + ':' + step.item.item_id;
    if (slot.dataset.src === src) return;
    slot.dataset.src = src;
    slot.classList.remove('is-empty');
    const region = document.createElement('div');
    region.style.cssText = 'width:100%;height:100%';
    slot.replaceChildren(region);
    slot.classList.add('is-loading', 'is-cold');
    const embedded = host.view.embed(region, {surface:step.item.plugin,itemId:step.item.item_id,title:step.item.title || label(step.plugin)});
    embedded.ready.then(() => {
      if (slot.dataset.src === src) slot.classList.remove('is-loading','is-cold');
    }).catch(error => {
      if (!region.isConnected) return;
      slot.classList.remove('is-loading','is-cold');
      region.textContent = error.message;
    });
  }

  function dataHtml(dataIn) {
    return '<div class="wf-payload"><strong>' + esc(dataIn.title) + '</strong><pre>' + esc(dataIn.body) + '</pre>' + (dataIn.url ? '<a href="' + esc(dataIn.url) + '" target="_blank" rel="noopener noreferrer">' + esc(dataIn.url) + '</a>' : '') + '</div>';
  }
  function handoffKey(run, idx) {
    const step = run.steps[idx];
    if (step.handoff) return idx + ':record';
    if (ui.handoff?.index === idx) return idx + ':manual';
    if (idx >= run.chain.links.length || run.status !== 'active' || idx !== run.current) return idx + ':' + run.status;
    return idx + ':bar:' + readyState(run.chain.links[idx]).ready;
  }
  function renderHandoff(run, idx) {
    const step = run.steps[idx];
    const chain = run.chain;
    if (step.handoff) {
      const h = step.handoff; const next = label(chain.stations[idx + 1]);
      const who = h.actor === 'ai' ? L('workflows.handoff.ai-done', { next }) : h.actor === 'function' ? L('workflows.handoff.rule-done', { next })
        : h.actor === 'judgment' ? L('workflows.handoff.judged', { choice: h.verdict?.choice || '', next }) : L('workflows.handoff.manual-done', { next });
      return '<details class="wf-record mw-disclosure"' + (h.actor === 'ai' ? ' open' : '') + '><summary><span class="wf-handoff__kind" data-kind="' + h.kind + '">' + esc(L(KINDS[h.kind])) + '</span><span>' + esc(who) + '</span><span class="wf-muted">' + esc(when(h.at)) + '</span></summary>'
        + '<div class="wf-record__body"><p class="wf-record__label">' + tx(h.actor === 'ai' ? 'workflows.handoff.ai-output' : 'workflows.handoff.handed-content') + '</p>' + dataHtml(h.output)
        + (h.rule ? '<p class="wf-record__label">' + tx(h.actor === 'ai' ? 'workflows.handoff.instruction' : h.actor === 'judgment' ? 'workflows.kind.judgment' : 'workflows.handoff.rule') + '</p><pre class="wf-rule">' + esc(h.rule) + '</pre>' : '')
        + (h.verdict ? '<p class="wf-record__label">' + tx('workflows.handoff.judgment') + '</p><p class="wf-verdict">' + esc(ruleText(h.verdict)) + '</p>' : '')
        + '<button class="mw-btn mw-btn--ghost" type="button" data-wf-step="' + (idx + 1) + '"><span>' + esc(L('workflows.handoff.see-run', { next })) + '</span>' + ico('arrow') + '</button></div></details>';
    }
    if (idx >= chain.links.length) {
      return run.status === 'done' ? '<p class="wf-handoff__note is-done"><span data-mw-state="done" aria-hidden="true"></span>' + '<span>' + tx('workflows.handoff.last-station') + '</span></p>' : '';
    }
    if (run.status !== 'active' || idx !== run.current) {
      if (run.status === 'stopped' && idx === run.current) {
        if (run.stopped && run.stopped.from === idx) return '<p class="wf-handoff__note is-held">' + ico('pause') + '<span>' + esc(L(run.stopped.reason)) + (run.stopped.verdict ? ' · ' + esc(ruleText(run.stopped.verdict)) : '') + '</span></p>';
        return '<p class="wf-handoff__note">' + ico('pause') + '<span>' + tx('workflows.handoff.ended-here') + '</span></p>';
      }
      return '';
    }
    const link = chain.links[idx]; const ready = readyState(link); const next = label(chain.stations[idx + 1]);
    const busy = ui.busy && ui.busy.index === idx;
    const tgt = chain.stations[idx + 1];
    if (tgt.action && step.pending?.attempted_at && !busy) {
      // The action was called and never confirmed: nothing repeats it until the person has checked.
      return '<div class="wf-handoff__bar is-blocked wf-uncertain" role="status"><span data-mw-state="verify" aria-hidden="true"></span><span>'
        + esc(step.pending.attempt_error ? L('workflows.action.last-failed', { action: tgt.action.title, error: step.pending.attempt_error }) : L('workflows.action.last-unconfirmed', { action: tgt.action.title }))
        + ' · ' + esc(L('workflows.action.check-first', { place: tgt.action.group || L('workflows.run.the-plugin') })) + '</span>'
        + '<button class="mw-btn mw-btn--secondary" type="button" data-wf-action="stop">' + tx('workflows.run.end') + '</button>'
        + '<button class="mw-btn mw-btn--primary" type="button" data-wf-action="retry-action" data-index="' + idx + '">' + ico('refresh') + '<span>' + tx('workflows.action.run-again') + '</span></button></div>';
    }
    if (ui.handoff?.index === idx && ui.handoff.mode === 'manual') {
      const draft = ui.handoff.draft;
      return '<form class="wf-manual" data-wf-manual><header><strong>' + esc(L('workflows.manual.hand-to', { next })) + '</strong><span class="wf-muted">' + tx('workflows.manual.hint') + '</span></header>'
        + '<label class="mw-field"><span class="mw-field__label">' + tx('workflows.field.title') + '</span><input class="mw-input" name="title" maxlength="200" value="' + esc(draft.title) + '"></label>'
        + '<label class="mw-field"><span class="mw-field__label">' + tx('workflows.field.body') + '</span><textarea class="mw-textarea" name="body" data-fit rows="5">' + esc(draft.body) + '</textarea></label>'
        + '<footer><span class="wf-kbd-hint"><kbd class="mw-kbd">' + esc(MOD) + ' ↵</kbd>' + tx('workflows.manual.hand-over') + '<kbd class="mw-kbd">Esc</kbd>' + tx('workflows.manual.not-now') + '</span>'
        + '<button class="mw-btn mw-btn--secondary" type="button" data-wf-action="handoff-cancel">' + tx('workflows.manual.not-now') + '</button>'
        + '<button class="mw-btn mw-btn--primary" type="submit" data-wf-action="handoff-submit"' + (busy ? ' data-loading aria-disabled="true"' : '') + '>' + (busy ? '<span class="mw-spinner" aria-hidden="true"></span>' : '') + '<span>' + esc(L('workflows.manual.submit-to', { next })) + '</span></button></footer></form>';
    }
    if (!ready.ready) {
      return '<p class="wf-handoff__bar is-blocked">' + ico('alert') + '<span>' + esc(L('workflows.handoff.next-blocked', { kind: L(KINDS[link.kind]), next, reason: L(ready.reason) })) + '</span><button class="mw-btn mw-btn--ghost" type="button" data-wf-action="edit-link" data-link="' + idx + '">' + tx('workflows.handoff.configure') + '</button></p>';
    }
    const act = link.kind === 'manual' ? L('workflows.handoff.review-and-hand', { next }) : link.kind === 'ai' ? L('workflows.handoff.ai-and-hand', { next })
      : link.kind === 'judgment' ? L('workflows.handoff.judge-and-hand', { next }) : L('workflows.handoff.rule-and-hand', { next });
    const working = busy ? (ui.busy.kind === 'preview' ? L('workflows.handoff.loading') : tgt.action && link.kind !== 'ai' && link.kind !== 'judgment' ? L('workflows.handoff.running') : link.kind === 'ai' ? L('workflows.run.ai-working') : link.kind === 'judgment' ? L('workflows.handoff.judging') : L('workflows.run.handing')) : act;
    return '<p class="wf-handoff__bar' + (busy ? ' is-working' : '') + '"><span class="wf-handoff__kind" data-kind="' + link.kind + '">' + esc(L(KINDS[link.kind])) + '</span><span>' + esc(L('workflows.handoff.next', { kind: link.kind === 'manual' ? L('workflows.handoff.after-person') : link.kind === 'ai' ? L('workflows.handoff.after-ai') : link.kind === 'judgment' ? L('workflows.handoff.after-judgment') : L('workflows.handoff.by-rule'), next })) + '</span>'
      + '<button class="mw-btn mw-btn--primary" type="button" data-wf-action="continue" data-index="' + idx + '"' + (busy ? ' aria-disabled="true" aria-busy="true"' : '') + '>' + (busy ? '<span class="mw-spinner" aria-hidden="true"></span>' : ico('arrow')) + '<span>' + esc(working) + '</span></button></p>';
  }
  async function resumeRun(idx, manualEl, opts = {}) {
    if (ui.busy) return;
    const run = ui.instance; const link = run.chain.links[idx];
    if (link.kind === 'manual' && !manualEl) {
      ui.busy = { index:idx, kind: 'preview' }; drawRun();
      try {
        const preview = await api('/instances/' + run.instance_id + '/preview', { from: idx });
        ui.handoff = { index:idx, mode: 'manual', input: preview.input, draft: { title: preview.input.title, body: preview.input.body } };
      } catch (err) { toast(err.message, 'error'); }
      ui.busy = null; drawRun();
      view.querySelector('[data-wf-manual] input[name=title]')?.focus();
      return;
    }
    ui.busy = { index:idx, kind: 'handoff' }; drawRun();
    try {
      const res = await api('/instances/' + run.instance_id + '/continue', { from: idx, updated_at: run.updated_at, ...(manualEl || {}), ...(opts.retry ? { retry_action: true } : {}) });
      ui.instance = res.instance; ui.handoff = null; ui.step = idx + 1;
      const tgt = run.chain.stations[idx + 1];
      toast(tgt.action ? L('workflows.toast.action-ran', { action: tgt.action.title }) : L('workflows.toast.handed-to', { next: label(tgt) }));
      refreshFlow();
    } catch (err) {
      toast(err.message, 'error');
      if (err.status === 409 || run.chain.stations[idx + 1]?.action) { ui.busy = null; await openRun(run.instance_id).catch(() => undefined); }
    }
    ui.busy = null; remember(); drawRun();
  }
  function refreshFlow() {
    if (!ui.workflow) return;
    api('/' + ui.workflow.workflow_id).then((res) => { ui.instances = res.instances; }).catch(() => undefined);
    api('').then((res) => { ui.workflows = res.workflows; drawList(); }).catch(() => undefined);
  }
  function selectStep(idx) {
    if (!ui.instance || idx === ui.step) return;
    ui.step = idx; if (ui.handoff && ui.handoff.index !== idx) ui.handoff = null;
    remember(); drawRun();
  }

  root.addEventListener('click', async (ev) => {
    const tgt = ev.target.closest('[data-wf-action], [data-wf-open], [data-wf-open-instance], [data-wf-step]');
    if (!tgt || !root.contains(tgt) || pop.contains(tgt)) return;
    const act = tgt.dataset.wfAction;
    try {
      if (tgt.dataset.wfOpen) { if (ui.workflow?.workflow_id !== tgt.dataset.wfOpen || ui.instance) await showFlow(tgt.dataset.wfOpen); return; }
      if (tgt.dataset.wfOpenInstance) { await openRun(tgt.dataset.wfOpenInstance); return; }
      if (tgt.dataset.wfStep !== undefined && !act) { selectStep(Number(tgt.dataset.wfStep)); return; }
      if (act === 'new' || act === 'example') {
        const example = act === 'example';
        const chain = example
          ? { stations: [{ station_id: uid(), plugin: 'feed' }, { station_id: uid(), plugin: 'inbox' }, { station_id: uid(), plugin: 'pages' }],
              links: [handLink(), { kind: 'ai', title_template: '', body_template: '', instructions: L('workflows.example.instructions') }] }
          : { stations: [], links: [] };
        const created = await api('', { title: example ? L('workflows.example.title') : L('workflows.flow.new-title'), chain });
        await loadList();
        await showFlow(created.workflow.workflow_id);
        if (!example) view.querySelector('[data-wf-title]')?.select();
        return;
      }
      if (act === 'back') { navId++; ui.workflow = null; ui.instance = null; ui.returnTo = null; remember(); setMode('list'); drawList(); return; }
      if (act === 'back-to-flow') { const id = ui.instance?.workflow_id; ui.instance = null; if (id) await showFlow(id); else setMode('list'); return; }
      if (act === 'return-to-run') { const back = ui.returnTo; if (back) await openRun(back.instance, back.step); return; }
      if (act === 'retry-save') { retrySave(); return; }
      if (act === 'delete') {
        showForm(L('workflows.editor.delete'), '<p>' + esc(L('workflows.dialog.delete-body', { title: ui.workflow.title })) + '</p>', L('workflows.dialog.delete'), async () => {
          await api('/' + ui.workflow.workflow_id + '/delete', {}); dlg.close(); ui.workflow = null; ui.returnTo = null; remember(); setMode('list'); await loadList();
        }, { tone: 'danger' });
        return;
      }
      if (act === 'gap') { openGapPicker(Number(tgt.dataset.gap)); return; }
      if (act === 'append') { insertAt(ui.workflow.stations.length, tgt.dataset.wfPlugin); return; }
      if (act === 'add-step') {
        if (!ui.workflow.stations.length) { toast(L('workflows.step.start-with-picker'), 'error'); return; }
        await openStep(null, () => view.querySelector('[data-wf-action=add-step]')); return;
      }
      if (act === 'edit-step') { const idx = Number(tgt.dataset.index); await openStep(idx, () => view.querySelector('[data-wf-chain] [data-wf-action=edit-step][data-index="' + idx + '"]')); return; }
      if (act === 'remove') { await removeAt(Number(tgt.dataset.index)); return; }
      if (act === 'move') { moveTo(Number(tgt.dataset.from), Number(tgt.dataset.gap), { focus: true }); return; }
      if (act === 'link') {
        const idx = Number(tgt.dataset.link);
        if (ui.openLink === idx && pop.matches(':popover-open')) { pop.hidePopover(); return; }
        showLink(idx); return;
      }
      if (act === 'edit-link') {
        const run = ui.instance; const idx = Number(tgt.dataset.link);
        ui.returnTo = { workflow: run.workflow_id, instance: run.instance_id, step: ui.step, title: run.title };
        const opened = await showFlow(run.workflow_id);
        if (!opened || ui.workflow !== opened) return;
        showLink(idx);
        pop.querySelector('[data-wf-link-fields] input, [data-wf-link-fields] textarea')?.focus({ preventScroll: true });
        return;
      }
      if (act === 'start') { await startRun(); return; }
      if (act === 'dialog-close') { if (!dlg.querySelector('[data-loading]')) dlg.close(); return; }
      if (act === 'stop') {
        const run = ui.instance;
        showForm(L('workflows.dialog.end-title'), '<p>' + tx('workflows.dialog.end-body') + '</p>', L('workflows.run.end'), async () => {
          const res = await api('/instances/' + run.instance_id + '/stop', {});
          dlg.close(); ui.instance = res.instance; ui.handoff = null; drawRun(); refreshFlow();
        });
        return;
      }
      if (act === 'continue') { await resumeRun(Number(tgt.dataset.index)); return; }
      if (act === 'retry-action') { await resumeRun(Number(tgt.dataset.index), undefined, { retry: true }); return; }
      if (act === 'handoff-cancel') { cancelHand(); return; }
    } catch (err) { toast(err.message, 'error'); }
  });
  function cancelHand() {
    ui.handoff = null; drawRun();
    view.querySelector('[data-wf-action=continue]')?.focus({ preventScroll: true });
  }
  pop.addEventListener('click', (ev) => {
    const token = ev.target.closest('[data-wf-token]');
    if (token) {
      const area = pop.querySelector('[data-wf-link-field=body_template]');
      if (!area) return;
      const start = area.selectionStart ?? area.value.length; const end = area.selectionEnd ?? start;
      area.setRangeText(token.dataset.wfToken, start, end, 'end');
      area.focus();
      area.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    const tgt = ev.target.closest('[data-wf-action]');
    if (!tgt) return;
    if (tgt.dataset.wfAction === 'insert') { pop.hidePopover?.(); insertAt(Number(tgt.dataset.gap), tgt.dataset.plugin, { focus: ev.detail === 0 }); return; }
    if (tgt.dataset.wfAction === 'step-save') { saveStep(); return; }
    if (tgt.dataset.wfAction === 'kind') { switchKind(Number(tgt.dataset.link), tgt.dataset.kind, { pointer: ev.detail > 0 }); return; }
    if (tgt.dataset.wfAction === 'return-to-run') {
      const back = ui.returnTo; if (!back) return;
      pop.hidePopover();
      openRun(back.instance, back.step).catch((err) => toast(err.message, 'error'));
    }
  });
  pop.addEventListener('keydown', (ev) => {
    const items = [...pop.querySelectorAll('.wf-pop__item')];
    const at = items.indexOf(document.activeElement);
    if (at < 0 || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(ev.key)) return;
    ev.preventDefault();
    const next = ev.key === 'Home' ? 0 : ev.key === 'End' ? items.length - 1 : (at + (ev.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next].focus();
  });
  pop.addEventListener('toggle', (ev) => {
    if (ev.newState !== 'closed') return;
    const anchor = popAt && popAt();
    const lostFocus = !document.activeElement || document.activeElement === document.body || pop.contains(document.activeElement);
    ui.openLink = null; ui.openGap = null; popAt = null;
    markOpen();
    if (lostFocus && anchor) anchor.focus({ preventScroll: true });
  });
  pop.addEventListener('change', (ev) => {
    if (pop.dataset.mode === 'step') {
      const draft = ui.stepDraft;
      const picked = ev.target.closest('[data-wf-step-action]');
      if (picked) {
        const row = (ui.actionSteps || []).find(item => refKey(item.ref) === picked.value);
        if (row) ui.stepDraft = { ref: row.ref, title: row.title, group: row.group, mapping: {} };
        drawStep(); settle(pop.querySelector('[data-wf-step-fields]'));
        pop.querySelector('[data-wf-step-action]')?.focus({ preventScroll: true });
        return;
      }
      const originEl = ev.target.closest('[data-wf-map-source]');
      if (originEl) {
        const name = originEl.dataset.wfMapSource;
        const field = stepOf(draft)?.fields.find(item => item.name === name);
        const mapValues = { ...draft.mapping };
        if (!originEl.value) delete mapValues[name];
        else if (originEl.value === 'value') mapValues[name] = { value: field?.enum ? field.enum[0] : field?.type === 'boolean' ? true : '' };
        else mapValues[name] = { from: originEl.value.slice(5) };
        ui.stepDraft = { ...draft, mapping:mapValues };
        drawStep();
        (pop.querySelector('[data-wf-map-value="' + name + '"]') || pop.querySelector('[data-wf-map-source="' + name + '"]'))?.focus({ preventScroll: true });
        return;
      }
      const val = ev.target.closest('select[data-wf-map-value]');
      if (val) { setMap(val); checkStep(); }
      return;
    }
    const idx = Number(pop.dataset.link);
    const selectEl = ev.target.closest('[data-wf-judgment]');
    if (selectEl) {
      const row = (ui.judgments || []).find(item => ruleKey(item.ref) === selectEl.value);
      if (!row) return;
      ui.workflow.links[idx] = { ...ui.workflow.links[idx], judgment: { ...row.ref, title: row.title }, pass: [] };
      const formFields = pop.querySelector('[data-wf-link-fields]'); formFields.innerHTML = linkView(ui.workflow.links[idx]); settle(formFields);
      checkReady(idx); saveFlow({ chain: chainOf() });
      return;
    }
    if (ev.target.closest('[data-wf-pass]')) {
      const pass = [...pop.querySelectorAll('[data-wf-pass]:checked')].map(box => box.value);
      ui.workflow.links[idx] = { ...ui.workflow.links[idx], pass };
      checkReady(idx); saveFlow({ chain: chainOf() });
    }
  });
  function checkStep() {
    const problem = stepError(ui.stepDraft, stepOf(ui.stepDraft));
    const line = pop.querySelector('[data-wf-step-ready]');
    if (line) { line.dataset.ready = String(!problem); line.innerHTML = readyView(problem); }
    const save = pop.querySelector('[data-wf-action=step-save]'); if (save) save.disabled = Boolean(problem);
  }
  pop.addEventListener('input', (ev) => {
    if (pop.dataset.mode === 'step') {
      const search = ev.target.closest('input[data-wf-step-search]');
      if (search) {
        ui.stepQuery = search.value;
        const caret = search.selectionStart;
        drawStep();
        const again = pop.querySelector('[data-wf-step-search]');
        if (again) { again.focus({ preventScroll: true }); again.setSelectionRange(caret, caret); }
        return;
      }
      const val = ev.target.closest('input[data-wf-map-value]');
      if (val) { setMap(val); checkStep(); }
      return;
    }
    const field = ev.target.closest('[data-wf-link-field]');
    if (!field) return;
    const idx = Number(pop.dataset.link);
    ui.workflow.links[idx] = { ...ui.workflow.links[idx], [field.dataset.wfLinkField]: field.value };
    checkReady(idx);
    debounce(ui.workflow, { chain: chainOf() }, 'chain', 450);
  });
  window.addEventListener('resize', movePop);
  root.addEventListener('scroll', movePop, true);

  const saveName = (fieldEl) => {
    flushSave();
    if (!ui.workflow) return;
    const title = fieldEl.value.trim() || L('workflows.flow.new-title');
    if (title !== ui.workflow.title) saveFlow({ title });
  };
  root.addEventListener('input', (ev) => {
    if (pop.contains(ev.target)) return;
    const title = ev.target.closest('[data-wf-title]');
    if (title) { debounce(ui.workflow, { title: title.value.trim() || L('workflows.flow.new-title') }, 'title', 600); return; }
    const filterEl = ev.target.closest('[data-wf-pick-filter]');
    if (filterEl) { filterPicks(filterEl.value); return; }
    const manualEl = ev.target.closest('[data-wf-manual]');
    if (manualEl && ui.handoff) ui.handoff.draft = { title: manualEl.elements.title.value, body: manualEl.elements.body.value };
  });
  root.addEventListener('change', (ev) => {
    const fieldEl = ev.target.closest('[data-wf-title]');
    if (fieldEl) saveName(fieldEl);
  });
  root.addEventListener('focusin', (ev) => {
    if (ev.target.matches?.('input[name=blank_title]')) { const radio = ev.target.closest('.wf-pick')?.querySelector('input[type=radio]'); if (radio) radio.checked = true; }
  });
  root.addEventListener('dblclick', (ev) => {
    const pick = ev.target.closest('.wf-pick[data-wf-pick-text]');
    if (pick && dlg.open) formEl.requestSubmit();
  });
  root.addEventListener('keydown', (ev) => {
    const tgt = ev.target;
    if (pop.contains(tgt)) return;
    const typing = tgt.matches?.('input, textarea, select, [contenteditable]');
    if (!typing && root.dataset.wfMode === 'workflow' && ev.key.toLowerCase() === 'z' && (ev.metaKey || ev.ctrlKey) && !ev.shiftKey) {
      if (undo()) ev.preventDefault();
      return;
    }
    if (tgt.matches?.('[data-wf-title]')) {
      if (ev.key === 'Enter') { ev.preventDefault(); tgt.blur(); }
      if (ev.key === 'Escape') { tgt.value = ui.workflow?.title || tgt.value; clearTimeout(pendingEdits.get('title')?.timer); pendingEdits.delete('title'); tgt.blur(); }
      return;
    }
    if (tgt.matches?.('[data-wf-pick-filter]') && ev.key === 'ArrowDown') {
      ev.preventDefault();
      dlg.querySelector('.wf-pick:not([hidden]) input[type=radio]')?.focus();
      return;
    }
    const manualEl = tgt.closest?.('[data-wf-manual]');
    if (manualEl) {
      if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); manualEl.requestSubmit(); return; }
      if (ev.key === 'Escape') { ev.preventDefault(); cancelHand(); return; }
    }
    const stn = tgt.matches?.('[data-wf-station]') ? tgt : null;
    if (stn && ui.workflow) {
      const idx = Number(stn.dataset.wfStation); const count = ui.workflow.stations.length;
      if ((ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') && ev.altKey) {
        ev.preventDefault();
        if (ev.key === 'ArrowLeft' && idx > 0) moveTo(idx, idx - 1, { focus: true });
        if (ev.key === 'ArrowRight' && idx < count - 1) moveTo(idx, idx + 2, { focus: true });
        return;
      }
      if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight' || ev.key === 'Home' || ev.key === 'End') {
        ev.preventDefault();
        const next = ev.key === 'Home' ? 0 : ev.key === 'End' ? count - 1 : Math.max(0, Math.min(count - 1, idx + (ev.key === 'ArrowRight' ? 1 : -1)));
        view.querySelector('[data-wf-chain] [data-wf-station="' + next + '"]')?.focus();
        return;
      }
      if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); removeAt(idx, { keyboard: true }); return; }
    }
    const vstep = tgt.closest?.('[data-wf-vchain] [data-wf-step]');
    if (vstep && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(ev.key)) {
      ev.preventDefault();
      const steps = [...view.querySelectorAll('[data-wf-vchain] [data-wf-step]')];
      const at = steps.indexOf(vstep);
      const next = ev.key === 'Home' ? 0 : ev.key === 'End' ? steps.length - 1 : Math.max(0, Math.min(steps.length - 1, at + (ev.key === 'ArrowDown' ? 1 : -1)));
      steps.forEach((step, i) => { step.tabIndex = i === next ? 0 : -1; });
      steps[next].focus();
    }
  });
  root.addEventListener('submit', async (ev) => {
    const form = ev.target.closest('[data-wf-manual]');
    if (!form) return;
    ev.preventDefault();
    await resumeRun(ui.handoff.index, { title: form.elements.title.value, body: form.elements.body.value });
  });
  formEl.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!submitForm) return;
    const submit = dlg.querySelector('[data-wf-dialog-submit]');
    if (submit.hasAttribute('data-loading')) return;
    submit.setAttribute('data-loading', ''); submit.insertAdjacentHTML('afterbegin', '<span class="mw-spinner" aria-hidden="true"></span>');
    try { await submitForm(); } catch (err) { const el = dlg.querySelector('[data-wf-dialog-error]'); el.textContent = err.message; el.hidden = false; settle(el); }
    finally { submit.removeAttribute('data-loading'); submit.querySelector('.mw-spinner')?.remove(); }
  });

  let dragging = null; let dropGap = null; let dragFrom = null;
  const gapEl = (gap) => view.querySelector('[data-wf-chain] [data-wf-gap="' + gap + '"]');
  const dropAt = (gap) => {
    if (dropGap === gap) return;
    view.querySelectorAll('[data-wf-chain] .is-drop').forEach((node) => node.classList.remove('is-drop'));
    dropGap = gap;
    if (gap !== null) gapEl(gap)?.classList.add('is-drop');
  };
  const gapAt = (ev) => {
    const gap = ev.target.closest?.('[data-wf-gap]');
    if (gap) return Number(gap.dataset.wfGap);
    const stn = ev.target.closest?.('[data-wf-station]');
    if (stn) { const box = stn.getBoundingClientRect(); const idx = Number(stn.dataset.wfStation); return ev.clientX < box.left + box.width / 2 ? idx : idx + 1; }
    let best = null; let distance = Infinity;
    view.querySelectorAll('[data-wf-chain] [data-wf-gap]').forEach((node) => {
      const box = node.getBoundingClientRect(); const d = Math.abs(ev.clientX - (box.left + box.width / 2));
      if (d < distance) { distance = d; best = Number(node.dataset.wfGap); }
    });
    return best;
  };
  root.addEventListener('dragstart', (ev) => {
    const chip = ev.target.closest?.('[data-wf-plugin]'); const stn = ev.target.closest?.('[data-wf-station]');
    if (chip) dragging = { plugin: chip.dataset.wfPlugin };
    else if (stn) dragging = { from: Number(stn.dataset.wfStation) };
    else return;
    if (pop.matches(':popover-open')) pop.hidePopover();
    dragFrom = chip || stn;
    ev.dataTransfer.effectAllowed = 'move';
    ev.dataTransfer.setData('text/plain', chip ? chip.dataset.wfPlugin : 'station');
    requestAnimationFrame(() => { dragFrom?.classList.add('is-drag-source'); view.querySelector('[data-wf-chain]')?.classList.add('is-dragging'); });
  });
  const endDrag = () => {
    dragging = null; dropAt(null);
    dragFrom?.classList.remove('is-drag-source'); dragFrom = null;
    view.querySelector('[data-wf-chain]')?.classList.remove('is-dragging');
  };
  root.addEventListener('dragend', endDrag);
  root.addEventListener('dragover', (ev) => {
    if (!dragging) return;
    if (!ev.target.closest?.('[data-wf-chain]')) { dropAt(null); return; }
    ev.preventDefault();
    let gap = gapAt(ev);
    if (gap !== null && dragging.from !== undefined && (gap === dragging.from || gap === dragging.from + 1)) gap = null;
    ev.dataTransfer.dropEffect = gap === null ? 'none' : 'move';
    dropAt(gap);
  });
  root.addEventListener('dragleave', (ev) => {
    const chain = view.querySelector('[data-wf-chain]');
    if (chain && !chain.contains(ev.relatedTarget)) dropAt(null);
  });
  root.addEventListener('drop', (ev) => {
    if (!dragging) return;
    ev.preventDefault();
    const gap = dropGap; const drag = dragging;
    endDrag();
    if (gap === null) return;
    if (drag.plugin) insertAt(gap, drag.plugin);
    else moveTo(drag.from, gap);
  });


  let started = false;
  let listReady = null;
  let pickedItem, pickedQuiet = false;
  const selectFlow = async (id, rev) => {
    if (id) {
      try { await showFlow(id, { revision:rev }); }
      catch (err) { if (rev !== navId) return; if (err.status !== 404 && err.status !== 403) { if (!pickedQuiet) toast(err.message, 'error'); return; } root.dispatchEvent(new CustomEvent('molis-work:item-unreadable', { bubbles: true, detail: { itemId: id } })); ui.workflow = null; ui.instance = null; ui.returnTo = null; remember(); setMode('list'); drawList(); const note = root.querySelector('[data-wf-gone]'); if (!pickedQuiet || err.status === 403) { note.textContent = err.status === 403 ? err.message : L('workflows.flow.gone'); note.hidden = false; } }
      return;
    }
    ui.workflow = null; ui.instance = null; ui.returnTo = null; remember(); setMode('list'); drawList();
  };
  const start = async () => {
    if (started || root.hidden) return;
    started = true;
    const rev = ++navId;
    const wanted = pickedItem;
    listReady = loadList(); await listReady;
    if (rev !== navId) return;
    if (wanted !== undefined) { await selectFlow(wanted, rev); return; }
    let memory = null;
    try { memory = JSON.parse(sessionStorage.getItem(stateKey()) || 'null'); } catch {}
    try {
      if (memory?.workflow) await showFlow(memory.workflow, { keepInstance: true, revision:rev });
      if (rev !== navId) return;
      if (memory?.instance) await openRun(memory.instance, memory.step, rev);
    } catch { if (rev === navId) setMode('list'); }
  };
  new MutationObserver(start).observe(root, { attributes: true, attributeFilter: ['hidden'] });
  root.addEventListener('molis-work:select-item', async (ev) => {
    const id = ev.detail?.itemId || null; pickedItem = id; pickedQuiet = Boolean(ev.detail?.quiet);
    const rev = ++navId;
    if (!started) { await start(); return; }
    await listReady;
    if (rev === navId) await selectFlow(id, rev);
  });
  start();
}`.replace(/^[ \t]+/gm, '');
