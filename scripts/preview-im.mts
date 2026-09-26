/** Isolated IM verification using the actual shared Server and the production UI/domain. */
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createImDomain } from '../server/src/im/index.ts';
import { renderImPage, IM_STYLES, IM_CLIENT_SCRIPT } from '../packages/im-ui/src/index.ts';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceFlag = process.argv.indexOf('--server-source');
const serverSource = sourceFlag < 0 ? join(repository, 'server/src') : resolve(process.argv[sourceFlag + 1]!);
const load = (name: string) => import(pathToFileURL(join(serverSource, name + '.ts')).href);
const [{ openServerDatabase }, { Identity }, { ServerEvents }, { ContinuityService }, { startServer }] = await Promise.all([
  load('database'), load('identity'), load('events'), load('continuity/service'), load('http'),
]);
const argument = (flag: string) => {const index = process.argv.indexOf(flag);return index < 0 ? undefined : process.argv[index + 1];};
const home = argument('--home') ?? await mkdtemp(join(tmpdir(), 'molis-im-live-'));
const storage = openServerDatabase(home), identity = new Identity(storage.db), events = new ServerEvents(storage.db);
const continuity = new ContinuityService(storage.db, identity, events, () => { throw new Error('Isolated IM preview does not access private projects'); });
const host = await startServer({ identity, events, continuity, im: createImDomain({ db: storage.db, identity, events }),
  imAssets: { html: renderImPage(), css: IM_STYLES, script: IM_CLIENT_SCRIPT }, hostname: argument('--hostname') ?? '127.0.0.1', port: Number(argument('--port') ?? 0) });
console.log(JSON.stringify({ origin: host.origin, home, isolated: true }));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, async () => {
  await host.close(); storage.close(); process.exit(0);
});
