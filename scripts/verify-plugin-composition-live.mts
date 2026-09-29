/** Opt-in real generation in an isolated project. Uses the existing configured model; no installs or external plugin effects. */
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { resolveMolisWorkHome } from '@molis-ai/molis-work-storage';
import { VISUAL_FOUNDATION_STYLES } from '@molis-ai/molis-work-design-system';
import { createPrologueNodeAdapter, prologueModelConfiguration, AgentReviewQueue } from '@molis-ai/molis-work-service-agent-host';
import { openConfiguredModels, selectConfiguredTextModel } from '../apps/local-host/src/configured-models.js';
import { LocalProjectDatabase } from '../apps/local-host/src/project-database.js';
import { seedDemoBoard, DEMO_BOARD_ID } from '../apps/local-host/src/demo-seed.js';
import { handleAgentStudioHttp, releaseAgentStudio } from '../apps/local-host/src/plugin-builder/agent-surface.js';
import { authorizeLocalWebRequest, sendLocalWebJson, type LocalMutationState } from '../apps/local-host/src/web-http.js';
import type { AgentBuild } from '@molis-ai/molis-work-plugin-builder';
if (!process.argv.includes('--live')) throw new Error('Pass --live to use the configured model with synthetic briefs.');
const configuredHome = resolveMolisWorkHome(), opened = openConfiguredModels(configuredHome);
const chosen = opened && selectConfiguredTextModel(configuredHome, opened.store); opened?.storage.close();
if (!chosen) throw new Error('No configured model is available');
const selection = { provider_id: chosen.provider.provider_id, model_id: chosen.model.model_id };
const configuration = () => { const db = openConfiguredModels(configuredHome); try { return db?.store.resolveConfiguration(selection) ?? null; } finally { db?.storage.close(); } };
const homeArg = process.argv.indexOf('--home');
const outputArg = process.argv.indexOf('--output'), minutesArg = process.argv.indexOf('--minutes'), minutes = minutesArg > 0 ? Number(process.argv[minutesArg + 1]) : 15;
if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 30) throw new Error('--minutes must be in (0, 30].');
const home = homeArg > 0 ? resolve(process.argv[homeArg + 1]!) : await mkdtemp(join(tmpdir(), 'plugin-composition-live-')), evidence = resolve(outputArg > 0 ? process.argv[outputArg + 1]! : '.impeccable/qa/review/plugin-composition/live'); await mkdir(evidence, { recursive: true });
const adapter = await createPrologueNodeAdapter({ app: { appId: 'io.molis.work.builder-verification', appVersion: '1.0.0' }, storageRoot: join(home, 'sdk'), reviewQueue: new AgentReviewQueue() });
const access = { modelConfiguration: async () => prologueModelConfiguration(configuration()), resolveCredential: (ref: string) => { const config = configuration(); return config?.provider.credential_ref === ref ? config.api_key : null; } };
const databasePath = join(home, 'project.db'); if (homeArg < 0) seedDemoBoard(databasePath);
const store = new LocalProjectDatabase(databasePath), token = randomUUID(), mutations = new Map<string, LocalMutationState>();
const options = { store, boardId: DEMO_BOARD_ID, homeDirectory: home, models: async () => [{ ...selection, label: chosen.model.model_id }],
  agents: async (build: AgentBuild, purpose: 'design' | 'code') => { const buildRoot = purpose === 'code' && build.directory ? build.directory : join(home, 'design', build.id); await mkdir(buildRoot, { recursive: true }); return adapter.createBuilderAgent({ buildRoot, storageRoot: join(home, 'runs', build.id), timeoutMs: 240_000, ...access }); },
  choice: { selectionAvailable: () => false, choose: async () => { throw new Error('Use the UI design preferences'); } } };
const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (url.pathname === '/assets/molis-work-settings.css') { response.writeHead(200, { 'content-type': 'text/css' }); response.end(VISUAL_FOUNDATION_STYLES); return; }
  if (!authorizeLocalWebRequest(request, response, url, token, mutations)) return;
  void handleAgentStudioHttp(request, response, url, options, token).then(handled => { if (!handled) sendLocalWebJson(response, 404, {}); }).catch(error => sendLocalWebJson(response, 500, { error: String(error) }));
});
await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
const origin = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
const api = async (path: string, body?: unknown) => { const result = await fetch(origin + '/api/plugin-builder/studio' + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', origin, 'x-molis-work-control-token': token, 'x-molis-work-idempotency-key': randomUUID() }, ...(body ? { body: JSON.stringify(body) } : {}) }); const value = await result.json() as any; if (!result.ok) throw new Error(value.error); return value; };
const samples = [
  ['reading', '做一个阅读摘记插件：新建标题、正文和来源，搜索摘记，点开阅读全文，删除写错的记录。只在插件本地存储，不调用其他插件、模型或网络。'],
  ['tasks', '做一个轻量待办插件：快速写入任务、列出未完成、逐条标完成、按完成状态筛选。突出今天要做的事情和快捷操作，只用插件本地存储。'],
  ['finance', '做一个日常收支记录插件：录入收入或支出金额、分类和备注，查看按类别汇总的总收入总支出，以及逐笔明细，删除错误记录。突出数值比较与对齐，只用插件本地存储，不联网。'],
];
console.log(JSON.stringify({ origin, home, model: chosen.model.model_id, vision: chosen.model.vision === true }));
try {
  await api('/settings', selection);
  for (const [name, brief] of samples) {
    if (process.argv.includes('--sample') && !process.argv[process.argv.indexOf('--sample') + 1]!.split(',').includes(name!)) continue;
    const existing = (await api('/state')).builds.find((build: AgentBuild) => build.brief === brief);
    let build = existing ?? (await api('/builds', { brief })).build, previous = '', answered = false; const started = Date.now();
    if (existing && !build.active && build.phase !== 'ready') await api('/builds/' + build.id + '/action', { action: 'resume', revision: build.revision });
    while (Date.now() - started < minutes * 60_000) {
      ({ build } = await api('/builds/' + build.id));
      const note = build.phase + ':' + build.steps.at(-1)?.label;
      if (note !== previous) { previous = note; console.log(name + ': ' + note); }
      if (build.phase === 'choosing') await api('/builds/' + build.id + '/action', { action: 'choose', revision: build.revision, candidateId: build.candidates[0].id });
      else if (build.phase === 'clarifying' && !answered) { answered = true; await api('/builds/' + build.id + '/action', { action: 'message', message: brief + '。采用最直接的单人使用方案即可。' }); }
      else if (['ready', 'failed', 'paused'].includes(build.phase)) break;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    if (build.active) { await api('/builds/' + build.id + '/action', { action: 'pause' }); ({ build } = await api('/builds/' + build.id)); }
    await writeFile(join(evidence, name + '.json'), JSON.stringify({ model: chosen.model.model_id, home, elapsedMs: Date.now() - started, build }, null, 2));
    console.log(JSON.stringify({ sample: name, phase: build.phase, error: build.error, elapsedMs: Date.now() - started, runs: build.runs.length }));
  }
} finally { await releaseAgentStudio(store, DEMO_BOARD_ID); await adapter.close(); await new Promise<void>(done => server.close(() => done())); store.close(); }
