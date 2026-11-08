// Disposable measurement server: the production business core for an explicitly selected, seeded Home.
// The installation login and account transition belong to the production launcher and are measured separately.
import { createDesktopWebCore } from '@molis-ai/molis-work-app-desktop';
import { fileURLToPath } from 'node:url';
import { isAbsolute } from 'node:path';

const [home, portText] = process.argv.slice(2);
const port = Number(portText);
if (!home || !isAbsolute(home) || !Number.isInteger(port) || port < 1 || port > 65535 || [4207, 4208].includes(port)) {
  throw new Error('Expected an absolute disposable Home and an available measurement port');
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
