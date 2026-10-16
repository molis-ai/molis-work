import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
execFileSync(process.env.MOLIS_WORK_WORKER_BUILD || 'worker-build', ['--release', '--locked', '--no-opt'], {
  cwd: fileURLToPath(new URL('.', import.meta.url)), stdio: 'inherit', env: process.env,
});
