/**
 * A stand-in model for checking the smoke's wiring without a real model: a throwaway Home whose only text model is a
 * local server that answers the designer's three requests (propose, experience, detail) with fixed, valid answers.
 *
 * It exists so the path Home → model configuration → credential → Prologue agent → studio workflow → report can be
 * run by anyone, and by a test, with no key and no cost. It says nothing about any Skill: the answers do not depend on
 * what the model is shown.
 */
import { createServer, type Server } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LocalCatalogMetadata, LocalSqliteStorage, createFileSecretStore, runWithMolisWorkHome } from '@molis-ai/molis-work-storage';
import { ModelProviderStore, createModelProviderTables } from '../../apps/local-host/src/model-provider-store.js';
import { CATALOG_OWNER, CATALOG_SCHEMA_VERSION } from '../../apps/local-host/src/project-catalog-contract.js';
import { withConnectorConnections } from '../../apps/local-host/src/connector-connection-store.js';

/** Per stage, the answer; a list answers the first request with its first item, the next with its second, and the last one for every request after. */
export type StandInAnswers = Record<'propose' | 'experience' | 'detail', string | string[]>;
/**
 * The three answers, from the committed corpus (tests/fixtures/studio-replay/corpus.json): the two-proposal first answer,
 * the experience sketch of the first proposal, and the plain notes design. All three are valid for the real checks.
 */
export function standInAnswers(corpusFile: string): StandInAnswers {
  const corpus = JSON.parse(readFileSync(corpusFile, 'utf8')) as { entries: Array<{ id: string; answerJson?: unknown; answer?: string }> };
  const answerOf = (id: string) => { const entry = corpus.entries.find(item => item.id === id); if (!entry) throw new Error(`the stand-in needs corpus entry ${id}`); return entry.answerJson !== undefined ? JSON.stringify(entry.answerJson) : entry.answer!; };
  const proposed = JSON.parse(answerOf('propose-two-candidates')) as { candidates: Array<{ journey: string[]; pages: unknown[] }> }, first = proposed.candidates[0]!;
  return { propose: answerOf('propose-two-candidates'), detail: answerOf('detail-notes-plain'),
    experience: JSON.stringify({ summary: '以浏览已有内容为主，随手录入不中断浏览', journey: first.journey, pages: first.pages,
      scenarios: [{ task: '写入后继续浏览', content: '先读《理解媒介》，再记下一个问题。', expected: '保存后能找到记录并继续新建' }] }) };
}

export interface StandIn { address: string; modes: string[]; close(): Promise<void> }

/** An OpenAI-compatible streaming reply carrying `text`. */
function stream(text: string): string {
  const chunk = (delta: object, finish: string | null, extra: object = {}) => 'data: ' + JSON.stringify({ id: 'stand-in', object: 'chat.completion.chunk', model: 'stand-in-model', choices: [{ index: 0, delta, finish_reason: finish }], ...extra }) + '\n\n';
  return chunk({ role: 'assistant', content: text }, null) + chunk({}, 'stop', { usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }) + 'data: [DONE]\n\n';
}

export async function startStandInModel(answers: StandInAnswers): Promise<StandIn> {
  const modes: string[] = [], script = new Map(Object.entries(answers).map(([mode, answer]) => [mode, [answer].flat()]));
  const server: Server = createServer((request, response) => {
    let body = '';
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
      let mode = '';
      try {
        const messages = (JSON.parse(body) as { messages?: Array<{ role: string; content: unknown }> }).messages ?? [];
        const task = messages.filter(message => message.role === 'user').at(-1)?.content;
        mode = String((JSON.parse(typeof task === 'string' ? task : '{}') as { mode?: unknown }).mode ?? '');
      } catch { /* answered below as an unknown stage */ }
      modes.push(mode);
      const queue = script.get(mode), text = queue && (queue.length > 1 ? queue.shift() : queue[0]);
      response.writeHead(text === undefined ? 400 : 200, { 'content-type': text === undefined ? 'application/json' : 'text/event-stream' });
      response.end(text === undefined ? JSON.stringify({ error: { message: `the stand-in model has no answer for stage "${mode}"` } }) : stream(text));
    });
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const address = `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`;
  return { address, modes, close: () => new Promise<void>(done => server.close(() => done())) };
}

/**
 * Gives `home` a catalog with one enabled text model at `address` and its key in the Home's own file secret store.
 * The caller has set MOLIS_WORK_SECRET_BACKEND=file; the key is a fixed, meaningless string.
 */
export function configureStandInHome(home: string, address: string): void {
  mkdirSync(join(home, 'projects'), { recursive: true });
  const storage = new LocalSqliteStorage(join(home, 'projects', 'catalog.db'));
  try {
    const metadata = new LocalCatalogMetadata(storage.db);
    metadata.create(); metadata.initialize(CATALOG_OWNER, CATALOG_SCHEMA_VERSION); createModelProviderTables(storage.db);
    const connection = withConnectorConnections(home, store => {
      const created = store.createToken({ serviceId: 'model-api', displayName: 'stand-in model', token: 'stand-in-key-not-a-secret' });
      store.assertTarget(created.connection_id, 'model-api', address);
      return created;
    });
    const secrets = runWithMolisWorkHome(home, () => createFileSecretStore());
    new ModelProviderStore({ db: storage.db, secrets }).upsert({ credential_ref: connection.credential_ref!, provider_id: 'stand-in', display_name: 'Stand-in (local, scripted)', base_url: address,
      api_format: 'openai-chat-completions', models: [{ model_id: 'stand-in-model', enabled: true }] });
  } finally { storage.close(); }
}
