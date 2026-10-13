import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Builds the computer helper with local-host on macOS (specs/computer-use D10), only when its sources are newer than the
// app: every rebuild re-signs it, and an unchanged helper need not be touched.
if (process.platform === 'darwin') {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const executable = path.join(here, 'bin', 'Molis Work Computer Helper.app', 'Contents', 'MacOS', 'computer-helper');
  const built = fs.existsSync(executable) ? fs.statSync(executable).mtimeMs : 0;
  const sources = [path.join(here, 'build.sh'), ...fs.readdirSync(path.join(here, 'Sources')).map(name => path.join(here, 'Sources', name))];
  if (sources.some(file => fs.statSync(file).mtimeMs > built)) {
    const result = spawnSync('bash', [path.join(here, 'build.sh')], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}
