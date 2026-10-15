import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
if (process.platform === 'darwin') {
  for (const script of ['build.sh', 'build-whisper.sh']) {
    const result = spawnSync('bash', [fileURLToPath(new URL(script, import.meta.url))], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
} else {
  // The helpers are macOS programs. The release still declares their folder (package.json `files`), so elsewhere it holds this
  // note and the release installs; the Host reports the helpers unavailable off macOS (src/material-native.ts).
  const bin = fileURLToPath(new URL('bin/', import.meta.url));
  mkdirSync(bin, { recursive: true });
  writeFileSync(new URL('bin/README.md', import.meta.url), `The material helpers are built on macOS only; this build ran on ${process.platform}.\n`);
}
