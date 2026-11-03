import { ringSegmentPath, STATE_RING_CORES, STATE_RING_FAMILIES, STATE_RING_ICON_STATES, stateRingGeometry } from "@molis-ai/molis-work-plugin-sdk/ui";

/** One renderer per document. Detached/hidden icons never keep an animation loop alive. A ring mounts already drawn in its
 * state; only a change of state settles into the new arrangement. Visibility only decides which rings draw frames, so a still
 * ring is never measured (`checkVisibility` reads style). */
export const STATE_RING_CLIENT_SCRIPT = `(() => {
  const families = ${JSON.stringify(Object.fromEntries(STATE_RING_FAMILIES.flatMap(f => f.states.map(s => [s, f.key]))))};
  const icons = ${JSON.stringify(STATE_RING_ICON_STATES)}, cores = ${JSON.stringify(STATE_RING_CORES)};
  const geometry = ${stateRingGeometry.toString()}, path = ${ringSegmentPath.toString()};
  const animated = new Set(['running','waiting','answer','paused','blocked','syncing','retrying','failed','partial','interrupted','verify','disconnected']);
  const entries = new Map(), visible = new Set(), reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const ns = 'http://www.w3.org/2000/svg';
  let frame = 0, previous = 0;
  function svgNode(name) { return document.createElementNS(ns, name); }
  function configure(entry) {
    const svg = entry.svg, state = svg.dataset.mwState;
    entry.family = families[state] || 'idle'; entry.state = state;
    const value = svg.getAttribute('data-ring-progress');
    entry.progress = value !== null && Number.isFinite(Number(value)) ? Math.max(0, Math.min(1, Number(value))) : undefined;
    entry.time = state === 'doing' ? .75 : 3;
    entry.live = animated.has(entry.family) && state !== 'doing';
    entry.settling = entry.current && !reduced.matches ? .6 : 0;
    svg.dataset.ringFamily = entry.family;
    entry.core.setAttribute('d', cores[entry.family] || '');
    entry.core.setAttribute('data-ring-tone', entry.family === 'done' ? 'success' : entry.family === 'verify' ? 'attention' : 'neutral');
    if (!entry.current || reduced.matches) entry.current = geometry(entry.family, entry.time, entry.progress);
    paint(entry, entry.current);
  }
  function paint(entry, segments) {
    for (let i = 0; i < 12; i++) {
      const segment = segments[i], depth = Math.max(0, Math.min(1, (segment.z + 9.2) / 18.4));
      entry.paths[i].setAttribute('d', path(segment.points));
      entry.paths[i].setAttribute('opacity', String(segment.alpha * (entry.family === 'syncing' ? .83 + .17 * depth : 1)));
      entry.paths[i].setAttribute('data-ring-tone', segment.tone);
    }
  }
  function refresh(entry) {
    const shown = (entry.live || entry.settling > 0) && entry.svg.isConnected && entry.intersecting && entry.svg.checkVisibility({ visibilityProperty: true });
    if (shown) visible.add(entry); else visible.delete(entry);
  }
  function wake() {
    if (!frame && !document.hidden && !reduced.matches && [...visible].some(e => e.live || e.settling > 0)) frame = requestAnimationFrame(tick);
  }
  function tick(now) {
    frame = 0;
    const dt = Math.min(.05, previous ? (now - previous) / 1000 : 1 / 60); previous = now;
    if (document.hidden || reduced.matches) return;
    for (const entry of visible) {
      if (!entry.live && entry.settling <= 0) continue;
      if (entry.live) entry.time += dt;
      entry.settling -= dt;
      const target = geometry(entry.family, entry.time, entry.progress), blend = 1 - Math.exp(-dt * 17);
      for (let i = 0; i < 12; i++) {
        const current = entry.current[i], next = target[i];
        current.alpha += (next.alpha - current.alpha) * blend; current.z = 0; current.tone = next.tone;
        for (let j = 0; j < 9; j++) {
          for (let k = 0; k < 3; k++) current.points[j][k] += (next.points[j][k] - current.points[j][k]) * blend;
          current.z += current.points[j][2] / 9;
        }
      }
      paint(entry, entry.current);
    }
    wake();
  }
  const observer = new IntersectionObserver(records => {
    for (const record of records) { const entry = entries.get(record.target); if (entry) { entry.intersecting = record.isIntersecting; refresh(entry); } }
    wake();
  });
  function mount(svg) {
    if (entries.has(svg)) return;
    svg.classList.add('mw-state-ring'); svg.setAttribute('viewBox', '0 0 24 24');
    let group = svg.querySelector('[data-ring-segments]'), core = svg.querySelector('[data-ring-core]');
    if (!group || !core) {
      group = svgNode('g'); group.dataset.ringSegments = '';
      for (let i = 0; i < 12; i++) group.append(svgNode('path'));
      core = svgNode('path'); core.dataset.ringCore = ''; svg.replaceChildren(group, core);
    }
    const entry = { svg, paths: [...group.children], core, intersecting: false };
    entries.set(svg, entry); configure(entry); observer.observe(svg);
  }
  function scan(root) {
    if (!(root instanceof Element)) return;
    const selector = '[data-mw-state],.mw-spinner,.mw-loading,svg use[href^="#icon-status-"]';
    const nodes = [...(root.matches(selector) ? [root] : []), ...root.querySelectorAll(selector)];
    for (const node of nodes) {
      if (node.localName === 'use') {
        const state = icons[node.getAttribute('href').slice(6)];
        if (state) { node.parentElement.dataset.mwState = state; mount(node.parentElement); }
      } else if (node.localName === 'svg') mount(node);
      else if (!node.querySelector(':scope > .mw-state-ring')) {
        const svg = svgNode('svg'); svg.dataset.mwState = node.dataset.mwState || 'running'; svg.setAttribute('aria-hidden', 'true');
        if (node.hasAttribute('data-ring-progress')) svg.dataset.ringProgress = node.dataset.ringProgress;
        node.dataset.ringMounted = ''; node.prepend(svg); mount(svg);
      }
    }
  }
  const mutations = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) scan(node);
      if (record.type === 'childList' && record.target instanceof Element && record.target.matches('[data-mw-state]')) scan(record.target);
      if (record.type === 'attributes') {
        const entry = entries.get(record.target);
        if (entry && (record.attributeName === 'data-mw-state' || record.attributeName === 'data-ring-progress')) configure(entry);
        else if (record.attributeName === 'data-mw-state' || record.attributeName === 'data-ring-progress') {
          const child = record.target.querySelector(':scope > .mw-state-ring');
          if (child) {
            const value = record.target.getAttribute(record.attributeName);
            if (value === null) child.removeAttribute(record.attributeName); else child.setAttribute(record.attributeName, value);
          } else scan(record.target);
        }
      }
    }
    for (const [svg, entry] of entries) {
      if (!svg.isConnected) { observer.unobserve(svg); entries.delete(svg); visible.delete(entry); }
      else refresh(entry);
    }
    wake();
  });
  function motionChanged() {
    cancelAnimationFrame(frame); frame = 0; previous = 0;
    for (const entry of entries.values()) { configure(entry); refresh(entry); }
    wake();
  }
  scan(document.documentElement);
  mutations.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-mw-state','data-ring-progress','hidden','class','style'] });
  reduced.addEventListener('change', motionChanged);
  document.addEventListener('visibilitychange', () => { cancelAnimationFrame(frame); frame = 0; previous = 0; wake(); });
  window.addEventListener('pagehide', () => { cancelAnimationFrame(frame); frame = 0; });
  window.addEventListener('pageshow', wake);
})();`;
