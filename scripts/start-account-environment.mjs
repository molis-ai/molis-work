import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertPortAvailable, selectEnvironment } from './environment-properties.mjs';
import { sessionGeneration } from './environment-session.mjs';
import { runPreflight } from './preflight-env.mjs';

const args = process.argv.slice(2);
const preflight = runPreflight({ strictNative: args.includes('--strict-native') });
if (preflight) process.exit(preflight);

const name = selectEnvironment(args, 'start', ['--desktop', '--strict-native']);
const { port, workSettings } = await import('./account-environments.mjs');
const desktop = args.includes('--desktop');
const { account, syncOrigin } = workSettings(name);
await assertPortAvailable(port);
const entry = new URL('../dist/web/server.js', import.meta.url);
if (!existsSync(entry)) throw new Error('Run pnpm install --frozen-lockfile and pnpm build first.');

const capabilities = new URL('/api/v2/auth/capabilities', account.authOrigin);
capabilities.searchParams.set('clientId', account.clientId);
const response = await fetch(capabilities, {
  headers: { Origin: account.productOrigin },
  redirect: 'error', signal: AbortSignal.timeout(5000),
}).catch(() => null);
if (!response?.ok) throw new Error(`Auth or client registration is unavailable at ${account.authOrigin}`);

const home = join(homedir(), '.molis-work-environments', name);
const generation = sessionGeneration('work', name);
const profile = await import('../apps/local-host/dist/active-release-profile.js');
profile.configureLocalAccount(name, account, generation, syncOrigin);
process.env.MOLIS_WORK_HOME = home;
delete process.env.MOLIS_WORK_SECRET_BACKEND;
process.argv = [process.execPath, fileURLToPath(entry), '--port', String(port), '--home', home];
console.log(`Work ${name}: ${account.productOrigin}; Auth ${account.authOrigin}; local Home ${home}; sync ${syncOrigin || 'disabled'}`);
await import(entry.href);

if (desktop) {
  const deadline = Date.now() + 15000;
  while (true) {
    const health = await fetch(account.productOrigin + '/health', { signal: AbortSignal.timeout(1000) }).catch(() => null);
    if (health?.ok) break;
    if (Date.now() >= deadline) {
      console.error('The fixed-port Work Host did not become ready');
      process.kill(process.pid, 'SIGTERM');
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (Date.now() < deadline) {
    const child = spawn('cargo', [
      'run', '--bin', 'molis-work-desktop', '--manifest-path', 'apps/desktop/src-tauri/Cargo.toml',
    ], {
      cwd: new URL('../', import.meta.url), stdio: 'inherit',
      env: { ...process.env, MOLIS_WORK_RELEASE_PROFILE: 'dev' },
    });
    const shutdown = () => child.kill('SIGTERM');
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
    child.on('error', error => {
      console.error(error.message);
      process.kill(process.pid, 'SIGTERM');
    });
    child.on('exit', () => process.kill(process.pid, 'SIGTERM'));
  }
}
