// Measurement only: real production Host and workbench in headless Chrome, disposable seeded Home, no model or user data.
// Run after pnpm build: node scripts/visual/browser-baseline.mjs <result.json> [motion|automation]
// `motion` hides navigator.webdriver so the product's motion runs as it does for a person; `automation` keeps the product's
// automation rule (no motion). Each run is one process, one Home, one fresh Chrome profile.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { cpus, loadavg, release, tmpdir, totalmem } from 'node:os';
import { resolve, join } from 'node:path';
import { performance } from 'node:perf_hooks';

const output = resolve(process.argv[2] ?? 'specs/visual-ui-experience/evidence/browser-result.json');
const motion = (process.argv[3] ?? 'motion') === 'motion';
const home = await mkdtemp(join(tmpdir(), 'molis-visual-browser-'));
process.env.MOLIS_WORK_HOME = home;
process.env.MOLIS_WORK_SECRET_BACKEND = 'file';
const { openMolisWorkProjectCatalog, createDesktopWebHost } = await import('@molis-ai/molis-work-app-desktop');
const { seedDemoBoard } = await import('@molis-ai/molis-work-app-local-host');
const { PROJECT_SCOPED_PLUGIN_IDS } = await import('@molis-ai/molis-work-app-local-host');
const { ChromeHarness } = await import('@molis-ai/molis-work-test-kit/browser');
const round = value => Math.round(value * 100) / 100;
const sockets = new Set();
let server, chrome;
const result = {
  at: new Date().toISOString(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  dirty: execFileSync('git', ['status', '--porcelain', '--', 'apps', 'packages', 'plugins', 'modules', 'horizontal'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean).length,
  environment: { node: process.version, os: release(), arch: process.arch, cpu: cpus()[0].model, logicalCpus: cpus().length, memoryBytes: totalmem(), loadStart: loadavg() },
  conditions: { viewport: '1440x900@1', motion: motion ? 'enabled (navigator.webdriver hidden)' : 'off (automation rule)', chrome: 'headless, fresh profile, cache on' },
  scope: 'Browser timings of the production workbench with seeded data. No model, no native shell, no real display refresh.',
  scenarios: {},
};

// What the page itself records: paints, long tasks, event timing, layout shifts. Installed before any page script runs.
const PAGE_PROBE = `(() => {
  const probe = window.__vux = { longtasks: [], events: [], shifts: 0 };
  const observe = (type, take, options = {}) => { try { new PerformanceObserver(list => list.getEntries().forEach(take)).observe({ type, buffered: true, ...options }); } catch {} };
  observe('longtask', entry => probe.longtasks.push({ start: entry.startTime, duration: entry.duration }));
  observe('event', entry => probe.events.push({ name: entry.name, start: entry.startTime, duration: entry.duration, processing: entry.processingEnd - entry.processingStart }), { durationThreshold: 16 });
  observe('layout-shift', entry => { if (!entry.hadRecentInput) probe.shifts += entry.value; });
})();`;

async function main() {
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  let project;
  try {
    project = await catalog.createProject({ display_name: '视觉性能基线', actor_id: 'isolated-baseline' });
    for (const plugin_id of PROJECT_SCOPED_PLUGIN_IDS) catalog.addProjectPlugin({ project_id: project.project_id, plugin_id, actor_id: 'isolated-baseline' });
  } finally { catalog.close(); }
  for (const suffix of ['', '-wal', '-shm']) await rm(project.database_path + suffix, { force: true });
  seedDemoBoard(project.database_path, project.project_id);
  const createServer = createDesktopWebHost({ ptyClientFilePath: () => resolve('dist/web/pty-client.js') });
  server = createServer({ homeDirectory: home, controlToken: randomBytes(32).toString('hex') });
  server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolveListen); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (;;) { const health = await (await fetch(origin + '/health')).json(); if (health.status === 'ok') break; await new Promise(r => setTimeout(r, 25)); }
  const url = `${origin}/projects/${project.project_id}/`;

  chrome = await ChromeHarness.start(home, { commandTimeoutMs: 60_000 });
  assert.ok(chrome, 'Chrome is required');
  const page = await chrome.page();
  const command = (method, params = {}) => page.command(method, params, 60_000);
  await command('Page.enable');
  await command('Performance.enable');
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await command('Page.addScriptToEvaluateOnNewDocument', { source: (motion ? "Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false });" : '') + PAGE_PROBE });
  const evaluate = expression => page.evaluate(expression, 60_000);
  const waitFor = (expression, timeoutMs = 30_000) => page.wait(expression, { timeoutMs, pollMs: 8 });
  const metrics = async () => {
    await command('HeapProfiler.collectGarbage');
    const { metrics: rows } = await command('Performance.getMetrics');
    const get = name => rows.find(row => row.name === name)?.value;
    return { nodes: get('Nodes'), listeners: get('JSEventListeners'), heapUsedMB: round(get('JSHeapUsedSize') / 1048576), documents: get('Documents'), frames: get('Frames'), layoutCount: get('LayoutCount'), recalcStyleCount: get('RecalcStyleCount') };
  };
  // Operable: the composer accepts input, the plugin strip answers, and no shown surface is still loading its client.
  const OPERABLE = `(() => { const input = document.querySelector('[data-assistant-input]'); return input && !input.disabled && document.querySelector('[data-plugin-strip]')
    && !document.querySelector('[data-ui-client-state="loading"]') && document.readyState !== 'loading'; })()`;
  const open = async label => {
    const loaded = chrome.event('Page.loadEventFired', () => true, 60_000);
    const started = performance.now();
    await command('Page.navigate', { url });
    await waitFor(OPERABLE, 60_000);
    const operableNodeMs = performance.now() - started;
    await loaded;
    await new Promise(r => setTimeout(r, 1500)); // let deferred work and long tasks after load land in the record
    const timing = await evaluate(`(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const paint = Object.fromEntries(performance.getEntriesByType('paint').map(entry => [entry.name, entry.startTime]));
      const resources = performance.getEntriesByType('resource');
      const long = window.__vux.longtasks;
      return { responseStart: nav.responseStart, domContentLoaded: nav.domContentLoadedEventEnd, load: nav.loadEventEnd,
        firstPaint: paint['first-paint'] ?? null, firstContentfulPaint: paint['first-contentful-paint'] ?? null,
        documentBytes: nav.encodedBodySize, requests: resources.length + 1,
        transferBytes: nav.transferSize + resources.reduce((sum, entry) => sum + entry.transferSize, 0),
        decodedBytes: nav.decodedBodySize + resources.reduce((sum, entry) => sum + entry.decodedBodySize, 0),
        cachedRequests: resources.filter(entry => entry.transferSize === 0 && entry.decodedBodySize > 0).length,
        longTasks: long.length, longTaskMs: long.reduce((sum, entry) => sum + entry.duration, 0), longestTaskMs: Math.max(0, ...long.map(entry => entry.duration)),
        layoutShift: window.__vux.shifts };
    })()`);
    const row = { label, operableFromNavigateMs: round(operableNodeMs), ...Object.fromEntries(Object.entries(timing).map(([k, v]) => [k, typeof v === 'number' ? round(v) : v])), ...(await metrics()) };
    return row;
  };

  result.scenarios.open = [await open('first open, empty cache')];
  for (let i = 0; i < 5; i++) result.scenarios.open.push(await open(`reopen ${i + 1}, warm cache`));

  // Plugin first entry and switch back: press → surface ready (client loaded, mounted) → next frame.
  const PLUGINS = ['pages', 'todo', 'feed', 'coding', 'issues'];
  const enter = async id => {
    const link = `[data-plugin-strip] [data-plugin-id="${id}"]`;
    if (!await evaluate(`!!document.querySelector(${JSON.stringify(link)})`)) return null;
    await evaluate(`window.__vux.longtasks.length = 0; window.__vux.events.length = 0;`);
    // A plugin not kept in the Dock is reached through the switcher's list, as a person would.
    const point = await evaluate(`(async () => { let el = document.querySelector(${JSON.stringify(link)});
      if (!el.getClientRects().length) { document.querySelector('[data-plugin-picker-toggle]')?.click(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); el = document.querySelector(${JSON.stringify(link)}); }
      // The switcher opens with motion: measure where the entry comes to rest, or the press lands beside it.
      await Promise.all(document.getAnimations().filter(a => Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a => a.finished.catch(() => {})));
      const box = el.getBoundingClientRect(), x = box.x + box.width / 2, y = box.y + box.height / 2;
      return { x, y, w: box.width, lands: el.contains(document.elementFromPoint(x, y)) }; })()`);
    assert.ok(point.w > 0 && point.lands, `${id}: entry is not reachable`);
    delete point.lands;
    const started = performance.now();
    await command('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
    await command('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
    const surface = `document.querySelector('[data-work-surface="${id}"]')`;
    await waitFor(`(() => { const s = ${surface}; return s && !s.closest('[hidden]') && s.getClientRects().length && (!s.dataset.uiClientState || s.dataset.uiClientState === 'ready'); })()`, 30_000);
    await evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
    const readyMs = performance.now() - started;
    const page = await evaluate(`({ press: window.__vux.events.filter(e => e.name === 'pointerdown' || e.name === 'click' || e.name === 'pointerup').map(e => Math.round(e.duration)),
      longTasks: window.__vux.longtasks.length, longTaskMs: Math.round(window.__vux.longtasks.reduce((s, e) => s + e.duration, 0)) })`);
    return { id, readyMs: round(readyMs), ...page };
  };
  const goHome = () => enter('home');
  result.scenarios.pluginFirstEntry = [];
  result.scenarios.pluginReturn = [];
  for (const id of PLUGINS) {
    const first = await enter(id); if (!first) continue;
    result.scenarios.pluginFirstEntry.push(first);
    await goHome();
    result.scenarios.pluginReturn.push(await enter(id));
    await goHome();
  }
  // Repeated switching: what is left behind after each round (nodes, listeners, heap after GC).
  result.scenarios.switchRounds = [{ round: 0, ...(await metrics()) }];
  for (let r = 1; r <= 10; r++) {
    for (const id of PLUGINS) { if (await enter(id)) await goHome(); }
    if (r % 2 === 0) result.scenarios.switchRounds.push({ round: r, ...(await metrics()) });
  }
  // Typing in the resident composer: each key's event duration as the page measured it (Event Timing, ≥16ms recorded).
  await evaluate(`window.__vux.events.length = 0; document.querySelector('[data-assistant-input]').focus();`);
  const text = 'Molis Work 输入延迟测量 abcdefghijklmnopqrstuvwxyz 0123456789';
  const keyStarted = performance.now();
  for (const ch of text) {
    if (/[a-z0-9 ]/i.test(ch)) {
      await command('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch });
      await command('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
    } else await command('Input.insertText', { text: ch });
  }
  await evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
  const typing = await evaluate(`({ value: document.querySelector('[data-assistant-input]').value.length, slow: window.__vux.events.filter(e => e.name.startsWith('key') || e.name === 'input' || e.name === 'beforeinput').map(e => Math.round(e.duration)) })`);
  result.scenarios.typing = { characters: [...text].length, typedMs: round(performance.now() - keyStarted), valueLength: typing.value, eventsOver16ms: typing.slow, longestEventMs: Math.max(0, ...typing.slow) };

  result.environment.loadEnd = loadavg();
  await writeFile(output, JSON.stringify(result, null, 2) + '\n');
  process.stdout.write(`Recorded browser scenarios in ${output}\n`);
}

try { await main(); }
finally {
  await chrome?.close().catch(() => {});
  if (server?.listening) {
    const closed = new Promise(resolveClose => server.close(resolveClose));
    server.closeAllConnections();
    for (const socket of sockets) socket.destroy();
    await closed;
  }
  await rm(home, { recursive: true, force: true, maxRetries: 3 });
}
