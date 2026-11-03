// Measurement only: real production Host, disposable seeded Home, no model or user data.
// Run after pnpm build: node scripts/visual/http-baseline.mjs <result.json>
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { cpus, freemem, loadavg, release, tmpdir, totalmem } from 'node:os';
import { resolve, join } from 'node:path';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';

const output = resolve(process.argv[2] ?? 'specs/visual-ui-experience/evidence/http-result.json');
const home = await mkdtemp(join(tmpdir(), 'molis-visual-baseline-'));
process.env.MOLIS_WORK_HOME = home;
process.env.MOLIS_WORK_SECRET_BACKEND = 'file';
const { openMolisWorkProjectCatalog, createDesktopWebHost } = await import('@molis-ai/molis-work-app-desktop');
const { seedDemoBoard, LocalProjectDatabase } = await import('@molis-ai/molis-work-app-local-host');
const { PROJECT_SCOPED_PLUGIN_IDS } = await import('@molis-ai/molis-work-app-local-host');
const round = value => Math.round(value * 100) / 100;
const loop = monitorEventLoopDelay({ resolution: 10 });
const sockets = new Set();
let server;
let store;
const result = {
  at: new Date().toISOString(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  environment: { node: process.version, os: release(), arch: process.arch, cpu: cpus()[0].model,
    logicalCpus: cpus().length, memoryBytes: totalmem(), freeMemoryBytes: freemem(), loadStart: loadavg() },
  scope: 'Production HTTP delivery with seeded disposable data. No browser paint, input, frame, native UI or real-model latency claims.',
  samples: [], assets: [],
};

async function request(path, label, headers = {}, starting = false) {
  const started = performance.now();
  const response = await fetch(result.origin + path, { headers, signal: AbortSignal.timeout(30_000) });
  const first = performance.now();
  const body = Buffer.from(await response.arrayBuffer());
  const sample = { label, path: path.replace(result.projectId, '{project}'), status: response.status,
    headersMs: round(first - started), bodyMs: round(performance.now() - started), bytes: body.length };
  assert.ok(response.status === 200 || response.status === 304 || (starting && response.status === 503), `${label}: HTTP ${response.status}; ${body.toString('utf8').slice(0, 300)}`);
  return { sample, body, etag: response.headers.get('etag') };
}

try {
  const setupStart = performance.now();
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  let project;
  try {
    project = await catalog.createProject({ display_name: '视觉性能基线', actor_id: 'isolated-baseline' });
    for (const plugin_id of PROJECT_SCOPED_PLUGIN_IDS) {
      catalog.addProjectPlugin({ project_id: project.project_id, plugin_id, actor_id: 'isolated-baseline' });
    }
  } finally { catalog.close(); }
  // This is the same isolated dataset setup as the repository's goal-browser fixture.
  for (const suffix of ['', '-wal', '-shm']) await rm(project.database_path + suffix, { force: true });
  seedDemoBoard(project.database_path, project.project_id);
  store = new LocalProjectDatabase(project.database_path);
  const snapshot = store.snapshot(project.project_id);
  result.dataset = Object.fromEntries(Object.entries(snapshot).filter(([, value]) => Array.isArray(value)).map(([key, value]) => [key, value.length]));
  result.dataset.projectPluginCount = PROJECT_SCOPED_PLUGIN_IDS.length;
  const createServer = createDesktopWebHost({ ptyClientFilePath: () => resolve('dist/web/pty-client.js') });
  server = createServer({ homeDirectory: home, controlToken: randomBytes(32).toString('hex') });
  server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolveListen); });
  result.origin = `http://127.0.0.1:${server.address().port}`;
  result.projectId = project.project_id;
  result.fixtureSetupMs = round(performance.now() - setupStart);
  result.processUntilFixtureReadyMs = round(process.uptime() * 1000);
  const path = `/projects/${project.project_id}/`;
  loop.enable();
  const readyStart = performance.now();
  for (;;) {
    const probe = await request('/health', 'health-startup-probe', {}, true);
    result.samples.push(probe.sample);
    const health = JSON.parse(probe.body.toString('utf8'));
    if (probe.sample.status === 200 && health.status === 'ok') break;
    assert.equal(health.status, 'starting');
    assert.ok(performance.now() - readyStart < 30_000, 'Host must become ready');
    await new Promise(resolveTimer => setTimeout(resolveTimer, 25));
  }
  result.listenToHealthReadyMs = round(performance.now() - readyStart);
  const first = await request(path, 'project-first-response');
  result.samples.push(first.sample);
  const assetPaths = [...new Set(first.body.toString('utf8').match(/\/assets\/[^"'<>\s)]+/g) ?? [])].filter(value => !/[{}]/.test(value));
  for (const asset of assetPaths) {
    const fetched = await request(asset, 'asset-first-response');
    result.assets.push(fetched.sample);
    if (fetched.etag) {
      const conditional = await request(asset, 'asset-revalidate', { 'if-none-match': fetched.etag });
      assert.equal(conditional.sample.status, 304, asset);
      assert.equal(conditional.sample.bytes, 0, asset);
      result.assets.push(conditional.sample);
    }
  }
  for (let repeat = 0; repeat < 10; repeat++) {
    result.samples.push((await request('/health', 'health-warm')).sample);
    result.samples.push((await request('/', 'projects-directory-warm')).sample);
    result.samples.push((await request(path, 'project-warm')).sample);
    result.samples.push((await request(path + '?workbenchPane=baseline&panePlugin=coding', 'coding-pane-http')).sample);
  }
  await new Promise(resolveTimer => setTimeout(resolveTimer, 30));
  loop.disable();
  result.eventLoop = { meanMs: round(loop.mean / 1e6), maxMs: round(loop.max / 1e6), p95Ms: round(loop.percentile(95) / 1e6) };
  result.memoryEnd = process.memoryUsage();
  result.environment.loadEnd = loadavg();
  delete result.origin;
  delete result.projectId;
  await writeFile(output, JSON.stringify(result, null, 2) + '\n');
  process.stdout.write(`Recorded ${result.samples.length} HTTP samples and ${result.assets.length} asset samples in ${output}\n`);
} finally {
  loop.disable();
  if (server?.listening) {
    const closed = new Promise(resolveClose => server.close(resolveClose));
    server.closeAllConnections();
    for (const socket of sockets) socket.destroy();
    await closed;
  }
  store?.close();
  await rm(home, { recursive: true, force: true, maxRetries: 3 });
}
