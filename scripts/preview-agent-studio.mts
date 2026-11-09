/**
 * Local preview of the agent-built plugin studio: real build gates, macOS Seatbelt sandbox, preview storage and
 * the headless-Chrome acceptance run. `--fixture` swaps only the models: a labelled designer that proposes two
 * note-taking plugins and a code agent that writes a real implementation and tests into the build directory.
 */
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { agentStudioFixture } from './agent-studio-preview-fixture.mjs';
import { STUDIO_HARNESS_PATH, studioHarnessPage, studioHarnessRequests } from './agent-studio-harness.mjs';
import { LocalProjectDatabase, seedDemoBoard, DEMO_PROJECT_ID, pluginPagesFor, resolveWebLocale, authorizeLocalWebRequest, sendLocalWebJson, type LocalMutationState } from '@molis-ai/molis-work-app-local-host';
import { handleAgentStudioHttp, releaseAgentStudio } from '../apps/local-host/dist/plugin-builder/agent-surface.js';
import { releaseInstalledPlugins } from '../apps/local-host/dist/installed-plugin-host.js';

const fixture = process.argv.includes('--fixture');
const home = mkdtempSync(join(tmpdir(), 'molis-agent-studio-'));
const databasePath = join(home, 'project.db'); seedDemoBoard(databasePath);
const store = new LocalProjectDatabase(databasePath), token = randomUUID() + randomUUID(), mutations = new Map<string, LocalMutationState>();

const harness = studioHarnessRequests(home, DEMO_PROJECT_ID, token);
const options = { store, projectId: DEMO_PROJECT_ID, homeDirectory: home, ...(fixture ? agentStudioFixture() : { models: async () => [] }) };
const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost') /* as the product server does: no port in the base */;
  if (url.pathname === '/') { response.writeHead(302, { location: STUDIO_HARNESS_PATH }); response.end(); return; }
  harness.handle(request, response, url, "", (local, proof) => {
    if (url.pathname === STUDIO_HARNESS_PATH) {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(studioHarnessPage(home, DEMO_PROJECT_ID, "", proof, resolveWebLocale(request.headers.cookie, request.headers["accept-language"]))); return;
    }
    if (!authorizeLocalWebRequest(request, response, url, token, mutations)) return;
    return pluginPagesFor(home).bind(request, url).then(release => {
      if (release) response.once("close", release);
      return handleAgentStudioHttp(request, response, local, options, proof);
    }).then(handled => { if (!handled) sendLocalWebJson(response, 404, { error: '请打开 ' + STUDIO_HARNESS_PATH }); })
      .catch(error => sendLocalWebJson(response, 500, { error: String(error) }));
  });
});
const portArg = process.argv.indexOf('--port');
server.listen(portArg > 0 ? Number(process.argv[portArg + 1]) : 0, '127.0.0.1', () => {
  const address = server.address();
  if (address && typeof address === 'object') console.log('Agent studio preview' + (fixture ? '（替身模型）' : '') + ': http://127.0.0.1:' + address.port + STUDIO_HARNESS_PATH);
});
const stop = () => {
  harness.close(); server.closeAllConnections();
  server.close(() => { void releaseAgentStudio(store, DEMO_PROJECT_ID).then(() => releaseInstalledPlugins(store, DEMO_PROJECT_ID))
    .then(() => { store.close(); rmSync(home, { recursive: true, force: true }); }); });
};
process.on('SIGTERM', stop); process.on('SIGINT', stop);
