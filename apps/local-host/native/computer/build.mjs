import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function latestMtime(entries) {
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

const isEntrypoint = () => {
  const arg = process.argv[1];
  if (!arg) {
    return false;
  }
  const resolved = path.resolve(arg);
  if (!existsSync(resolved)) {
    return false;
  }
  return realpathSync(resolved) === realpathSync(fileURLToPath(import.meta.url));
};

// Builds the computer helper with local-host on macOS (specs/computer-use D10), only when its sources are newer than the
// app: every rebuild re-signs it, and an unchanged helper need not be touched.
if (isEntrypoint()) {
  if (process.platform === 'darwin') {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const executable = path.join(here, 'bin', 'Molis Work Computer Helper.app', 'Contents', 'MacOS', 'computer-helper');
    const built = existsSync(executable) ? statSync(executable).mtimeMs : 0;
    const sources = [path.join(here, 'build.sh'), path.join(here, 'Sources')];
    if (!built || latestMtime(sources) > built) {
      const result = spawnSync('bash', [path.join(here, 'build.sh')], { stdio: 'inherit' });
      if (result.status !== 0) {
        process.exit(result.status ?? 1);
      }
    }
  } else {
    // The helper is a macOS app. The release still declares its folder (package.json `files`), so elsewhere it holds this note and
    // the release installs; the Host finds no helper off macOS (src/computer/computer-surfaces.ts).
    const bin = path.join(path.dirname(fileURLToPath(import.meta.url)), 'bin');
    mkdirSync(bin, { recursive: true });
    writeFileSync(path.join(bin, 'README.md'), `The computer helper is built on macOS only; this build ran on ${process.platform}.\n`);
  }
}
