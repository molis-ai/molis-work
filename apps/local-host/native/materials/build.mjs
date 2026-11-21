import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function latestMtime(entries) {
  let latest = 0;
  for (const entry of entries) {
    if (!existsSync(entry)) {
      continue;
    }
    const stat = statSync(entry);
    latest = Math.max(latest, stat.mtimeMs);
    if (stat.isDirectory()) {
      for (const child of readdirSync(entry)) {
        latest = Math.max(latest, latestMtime([path.join(entry, child)]));
      }
    }
  }
  return latest;
}

function buildIfStale(here, script, output, sources) {
  const built = existsSync(output) ? statSync(output).mtimeMs : 0;
  if (built && latestMtime(sources) <= built) return;
  const result = spawnSync('bash', [path.join(here, script)], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (process.platform === 'darwin') {
  const here = path.dirname(fileURLToPath(import.meta.url));
  buildIfStale(here, 'build.sh', path.join(here, 'bin', 'jelly-material'), [
    path.join(here, 'build.sh'),
    path.join(here, 'JellyMaterial.swift'),
  ]);
  if (process.env.MOLIS_WORK_SKIP_NATIVE_WHISPER_BUILD !== '1') {
    buildIfStale(here, 'build-whisper.sh', path.join(here, 'bin', 'jelly-whisper'), [
      path.join(here, 'build-whisper.sh'),
      path.join(here, 'whisper', 'Package.swift'),
      path.join(here, 'whisper', 'Package.resolved'),
      path.join(here, 'whisper', 'Sources'),
    ]);
  }
} else {
  // The helpers are macOS programs. The release still declares their folder (package.json `files`), so elsewhere it holds this
  // note and the release installs; the Host reports the helpers unavailable off macOS (src/material-native.ts).
  const bin = fileURLToPath(new URL('bin/', import.meta.url));
  mkdirSync(bin, { recursive: true });
  writeFileSync(new URL('bin/README.md', import.meta.url), `The material helpers are built on macOS only; this build ran on ${process.platform}.\n`);
}
