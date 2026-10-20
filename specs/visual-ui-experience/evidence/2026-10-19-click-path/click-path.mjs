// Measurement only: one press per plugin entry in the switcher, real production Host and workbench in headless Chrome,
// disposable seeded Home, no model or user data. Run after pnpm build:
//   node specs/visual-ui-experience/evidence/2026-10-19-click-path/click-path.mjs <result.json> [motion|automation]
// Per press: the click's Event Timing (duration to next paint, handler time) and the change in Chrome's layout and style
// counters over the following 700 ms. VUX_PLUGINS=<id,id,…> changes the sequence (default below).
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
const { PROJECT_SCOPED_PLUGIN_IDS } = await import('@molis-ai/molis-work-app-workbench');
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

  await open('first open');
  await new Promise(r => setTimeout(r, 1000));
  const ids = (process.env.VUX_PLUGINS ?? 'pages,home,todo,home,feed,home,issues,home,pages,home,todo,home').split(',');
  const rows = [];
  const m = async () => Object.fromEntries((await command('Performance.getMetrics')).metrics.map(r => [r.name, r.value]));
  for (const id of ids) {
    const link = `[data-plugin-strip] [data-plugin-id="${id}"]`;
    const point = await evaluate(`(async () => { let el = document.querySelector(${JSON.stringify(link)});
      if (!el.getClientRects().length) { document.querySelector('[data-plugin-picker-toggle]')?.click(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); el = document.querySelector(${JSON.stringify(link)}); }
      // The switcher opens with motion: measure where the entry comes to rest, or the press lands beside it.
      await Promise.all(document.getAnimations().filter(a => Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a => a.finished.catch(() => {})));
      const box = el.getBoundingClientRect(); window.__vux.events.length = 0; return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; })()`);
    await new Promise(r => setTimeout(r, 300));
    const before = await m();
    await command('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
    await command('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
    await new Promise(r => setTimeout(r, 700));
    const after = await m();
    const ev = await evaluate(`window.__vux.events.filter(e => e.name === 'click').map(e => [Math.round(e.duration), Math.round(e.processing)])[0] ?? null`);
    rows.push({ id, click: ev, layouts: after.LayoutCount - before.LayoutCount, layoutMs: Math.round((after.LayoutDuration - before.LayoutDuration) * 1000), styles: after.RecalcStyleCount - before.RecalcStyleCount, styleMs: Math.round((after.RecalcStyleDuration - before.RecalcStyleDuration) * 1000), scriptMs: Math.round((after.ScriptDuration - before.ScriptDuration) * 1000) });
  }
  result.rows = rows;
  console.log(JSON.stringify(rows));
  const med = k => { const v = rows.map(r => Array.isArray(r[k]) ? r[k][0] : r[k]).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
  console.log('median click', med('click'), 'layouts', med('layouts'), 'layoutMs', med('layoutMs'), 'styles', med('styles'), 'styleMs', med('styleMs'), 'scriptMs', med('scriptMs'));
  result.median = { click: med('click'), layouts: med('layouts'), layoutMs: med('layoutMs'), styles: med('styles'), styleMs: med('styleMs'), scriptMs: med('scriptMs') };
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
