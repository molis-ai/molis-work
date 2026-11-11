import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { accountEnvironment } from './account-environments.mjs';
const name = process.argv[2];
if (process.argv.length !== 3) throw new Error('Usage: node scripts/start-account-environment.mjs dev|test|prod');
const config = accountEnvironment(name);
const port = Number(new URL(config.productOrigin).port);
const root = fileURLToPath(new URL('../', import.meta.url));
const home = join(homedir(), '.molis-work-environments', name);
await new Promise((resolve, reject) => {
  const server = createServer();
  server.once('error', () => reject(new Error(`Port ${port} is occupied. Stop its owner first; no existing process was stopped.`)));
  server.listen(port, '127.0.0.1', () => server.close(resolve));
});
const response = await fetch(config.authOrigin, { signal: AbortSignal.timeout(5000) }).catch(() => null);
if (!response?.ok) throw new Error(`Auth is unavailable at ${config.authOrigin}. For dev, run npm run dev in the Auth repository first.`);
if (!existsSync(join(root, 'dist/web/server.js'))) throw new Error('Run pnpm install --frozen-lockfile and pnpm build first.');
console.log(`${name}: ${config.productOrigin}; Auth: ${config.authOrigin}; Home: ${home}`);
const child = spawn(process.execPath, [join(root, 'dist/web/server.js'), '--port', String(port), '--home', home], {
  cwd: root, stdio: 'inherit', env: { ...process.env, MOLIS_WORK_ACCOUNT_CONFIG: JSON.stringify(config) },
});
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
