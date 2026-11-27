// Disposable measurement server: the production business core for an explicitly selected, seeded Home.
// The installation login and account transition belong to the production launcher and are measured separately.
import { createDesktopWebCore } from '@molis-ai/molis-work-app-desktop';
import { realpathSync } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RESERVED_PORTS = new Set([4173, 4207, 4208]);

const realPath = (target) => {
  const absolute = resolve(target);
  try {
    return realpathSync(absolute);
  } catch {
    /* path may not exist yet; resolve nearest existing ancestor */
    const parent = dirname(absolute);
    return parent === absolute ? absolute : join(realPath(parent), relative(parent, absolute));
  }
};

const isInside = (outer, target) => {
  const step = relative(outer, target);
  return step === '' || (!step.startsWith('..') && !isAbsolute(step));
};

const realHomeRoots = () => {
  const bases = new Set([homedir()]);
  try {
    const accountHome = userInfo().homedir;
    if (accountHome) bases.add(accountHome);
  } catch {
    /* userInfo() may be unavailable in restricted environments */
  }
  return [...bases].filter(Boolean).map((base) => realPath(join(base, '.molis-work')));
};

const [home, portText] = process.argv.slice(2);
const port = Number(portText);
if (!home || !isAbsolute(home) || !Number.isInteger(port) || port < 1 || port > 65535 || RESERVED_PORTS.has(port)) {
  throw new Error('Expected an absolute disposable Home and an available measurement port (4173, 4207, 4208 are reserved)');
}
if (process.env.MOLIS_WORK_SECRET_BACKEND !== 'file') {
  throw new Error('MOLIS_WORK_SECRET_BACKEND must be "file" so the system key store is not touched');
}
const resolvedHome = realPath(home);
for (const realHome of realHomeRoots()) {
  if (isInside(realHome, resolvedHome) || isInside(resolvedHome, realHome)) {
    throw new Error(`Refusing real Home or path overlapping it (${home})`);
  }
}
const server = createDesktopWebCore({ ptyClientFilePath: () => fileURLToPath(new URL('../../dist/web/pty-client.js', import.meta.url)) })({ homeDirectory: home });
let closing = false;
function close() {
  if (closing) return;
  closing = true;
  server.closeAllConnections();
  server.close(error => { process.exitCode = error ? 1 : 0; });
}
process.once('SIGTERM', close);
process.once('SIGINT', close);
server.listen(port, '127.0.0.1');
