import { ActionService } from "@molis-ai/molis-work-kernel";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { functionsActionProvider } from "@molis-ai/molis-work-module-functions";
/** Isolated Functions QA: real SQLite/routes/UI, deterministic provider; no external calls. */
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderFunctionsWorkbench } from '../apps/workbench/src/functions/ui.ts';
import { FUNCTIONS_STYLES } from '../apps/workbench/src/functions/styles.ts';
import { FUNCTIONS_CLIENT_FACTORY_SCRIPT } from '../apps/workbench/src/functions/client.ts';
import { FUNCTIONS_EN } from '../apps/workbench/src/functions/en.ts';
import { createFunctionsService, openFunctionsStore } from '@molis-ai/molis-work-module-functions';
import { createFunctionsRouteHandlers } from '../apps/local-host/src/functions-http/route-handlers.ts';
import { FunctionsHttpRouteTable } from '../apps/local-host/src/functions-http/routes.ts';
import { functionsRouteErrorResponse } from '../apps/local-host/src/functions-http/route-error.ts';
import { hostFunctionAuthoringCatalog, hostAllowedBehaviorIds } from '../apps/local-host/src/behavior-catalog.ts';
import { renderMolisWorkWorkbenchStylesheet } from '../tests/workbench-renderer-fixture.ts';
import { renderIconSprite } from '@molis-ai/molis-work-design-system';
const home = await mkdtemp(join(tmpdir(), 'functions-ux-'));
const store = openFunctionsStore(home);
const service = createFunctionsService({ store, env: {}, secrets: { get: () => 'fixture-only', put() {}, delete() {} }, allowed_behavior_ids: hostAllowedBehaviorIds(), provider: {
  async evaluate(_key, record) {
    await new Promise(resolve => setTimeout(resolve, 250));
    return { primitive: record.primitive, choice: record.primitive === 'choice' ? (record.criteria as {key: string}[])[0].key : null, noul: record.primitive === 'noul' ? .8 : null, score: record.primitive === 'score' ? 1 : null, legend: record.primitive === 'score' ? record.criteria as string[] : null, probabilities: record.primitive === 'choice' ? Object.fromEntries((record.criteria as {key:string}[]).map((c, i) => [c.key, i === 0 ? .9 : .1 / ((record.criteria as unknown[]).length - 1)])) : {}, confidence: .9, model: 'jev-1.13.0' };
  }
} });
for (const primitive of ['choice', 'noul', 'score'] as const) service.create({ primitive, name: primitive === 'choice' ? '筛选值得跟进的消息' : primitive === 'noul' ? '材料是否足够' : '评估紧急程度' });
const catalog = hostFunctionAuthoringCatalog();
const authoringCatalog = { ...catalog, subjects: [...catalog.subjects, { subject_kind: 'fixture_document', title: '扩展文档对象' }] };
const registry = new ActionService();
registry.registerProvider(functionsActionProvider({ read: run => run(service), run: run => run(service), credentialAvailable: () => true }));
const actions = bindActionClient(registry, () => ({ actor_id: "fixture", project_id: null, audience: "user", permissions: ["functions:manage", "functions:invoke"] }));
const routes = new FunctionsHttpRouteTable(createFunctionsRouteHandlers({ actions, catalog: () => authoringCatalog }));
const escape = (value: unknown) => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  if (url.pathname.startsWith('/api/')) {
    let raw = ''; for await (const part of req) raw += part;
    try {
      const result = await routes.handle({ method: req.method as 'GET' | 'POST', pathname: url.pathname.replace('/api/plugins/functions', '/api/functions'), query: url.searchParams, body: raw ? JSON.parse(raw) : {} });
      res.writeHead(result?.status ?? 404, { 'content-type':'application/json' }); res.end(JSON.stringify(result?.body ?? {}));
    } catch (error) { const result = functionsRouteErrorResponse(error); res.writeHead(result.status, { 'content-type':'application/json' }); res.end(JSON.stringify(result.body)); }
    return;
  }
  const english = url.searchParams.get('lang') === 'en';
  const L = (value: string) => english ? FUNCTIONS_EN[value] ?? value : value;
  const stage = renderFunctionsWorkbench({ primitives: { escape, text: value => escape(L(value)) } }).replace(' hidden data-functions="workbench"', ' data-functions="workbench"');
  res.writeHead(200, { 'content-type':'text/html; charset=utf-8' });
  res.end(`<!doctype html><html lang="${english ? 'en' : 'zh-CN'}"${url.searchParams.has('dark') ? ' data-resolved-theme="dark"' : ''}><meta name="viewport" content="width=device-width,initial-scale=1"><title>Functions · isolated QA</title><style>${renderMolisWorkWorkbenchStylesheet()}${FUNCTIONS_STYLES}body{margin:0}body.immersive-workbench .tab-pane-body{position:fixed;inset:28px 0 0;height:calc(100dvh - 28px)}.qa-notice{height:28px;padding:4px 16px;background:var(--rail);font-size:12px;color:var(--ink-soft)}</style><body class="immersive-workbench">${renderIconSprite()}<div class="qa-notice">${english ? 'Isolated test data · simulated model · no charges' : '隔离测试数据 · 模型返回为模拟结果 · 不产生费用'}</div><main class="tab-pane-body">${stage}</main><script>const translations=${JSON.stringify(english ? FUNCTIONS_EN : {})};(${FUNCTIONS_CLIENT_FACTORY_SCRIPT})({translate:v=>translations[v]||v,feedApi:null});</script></body></html>`);
});
server.listen(4174, '127.0.0.1', () => console.log('http://127.0.0.1:4174'));

for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => {
  server.close(() => { store.close(); void rm(home, { recursive: true, force: true }).then(() => process.exit(0)); });
});
