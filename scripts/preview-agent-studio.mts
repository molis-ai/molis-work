/**
 * Local preview of the agent-built plugin studio: real build gates, macOS Seatbelt sandbox, preview storage and
 * the headless-Chrome acceptance run. `--fixture` swaps only the models: a labelled designer that proposes two
 * note-taking plugins and a code agent that writes a real implementation and tests into the build directory.
 */
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { agentStudioFixture } from './agent-studio-preview-fixture.mjs';
import { LocalProjectDatabase } from '../apps/local-host/src/project-database.js';
import { seedDemoBoard, DEMO_BOARD_ID } from '../apps/local-host/src/demo-seed.js';
import { handleAgentStudioHttp, releaseAgentStudio } from '../apps/local-host/src/plugin-builder/agent-surface.js';
import { authorizeLocalWebRequest, sendLocalWebJson, type LocalMutationState } from '../apps/local-host/src/web-http.js';

const fixture = process.argv.includes('--fixture');
const home = mkdtempSync(join(tmpdir(), 'molis-agent-studio-'));
const databasePath = join(home, 'project.db'); seedDemoBoard(databasePath);
const store = new LocalProjectDatabase(databasePath), token = randomUUID() + randomUUID(), mutations = new Map<string, LocalMutationState>();

const options = { store, boardId: DEMO_BOARD_ID, homeDirectory: home, ...(fixture ? agentStudioFixture() : { models: async () => [] }) };
const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost') /* as the product server does: no port in the base */;
  if (url.pathname === '/') { response.writeHead(302, { location: '/plugin-builder/studio' }); response.end(); return; }
  if (!authorizeLocalWebRequest(request, response, url, token, mutations)) return;
  void handleAgentStudioHttp(request, response, url, options, token).then(handled => { if (!handled) sendLocalWebJson(response, 404, { error: '请打开 /plugin-builder/studio' }); })
    .catch(error => sendLocalWebJson(response, 500, { error: String(error) }));
});
const portArg = process.argv.indexOf('--port');
server.listen(portArg > 0 ? Number(process.argv[portArg + 1]) : 0, '127.0.0.1', () => {
  const address = server.address();
  if (address && typeof address === 'object') console.log('Agent studio preview' + (fixture ? '（替身模型）' : '') + ': http://127.0.0.1:' + address.port + '/plugin-builder/studio');
});
const stop = () => server.close(() => { void releaseAgentStudio(store, DEMO_BOARD_ID).then(() => { store.close(); process.exit(0); }); });
process.on('SIGTERM', stop); process.on('SIGINT', stop);
