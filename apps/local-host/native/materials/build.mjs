import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
if (process.platform === 'darwin') {
  for (const script of ['build.sh', 'build-whisper.sh']) {
    const result = spawnSync('bash', [fileURLToPath(new URL(script, import.meta.url))], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}
