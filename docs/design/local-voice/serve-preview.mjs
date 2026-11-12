// Serve an explicit list of review assets only; never expose the working tree.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const files = new Map([
  ...['index.html', 'demo.html', 'preview.js', 'preview.css', 'components.js'].map(name => [`/docs/design/local-voice/${name}`, new URL(name, import.meta.url)]),
  ['/docs/design/kit/kit.css', new URL('../kit/kit.css', import.meta.url)],
  ['/docs/design/kit/kit.js', new URL('../kit/kit.js', import.meta.url)],
  ['/specs/unified-input-voice/voice-reuse-audit-2026-11-12.md', new URL('../../../specs/unified-input-voice/voice-reuse-audit-2026-11-12.md', import.meta.url)],
]);
const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', md: 'text/plain' };
createServer(async (req, res) => {
  const route = new URL(req.url, 'http://127.0.0.1').pathname;
  if (req.method === 'GET' && route === '/') { res.writeHead(302, { Location: '/docs/design/local-voice/' }).end(); return; }
  const entry = files.get(route === '/docs/design/local-voice/' ? '/docs/design/local-voice/index.html' : route);
  if (req.method !== 'GET' || !entry) { res.writeHead(404).end(); return; }
  try {
    const data = await readFile(entry);
    res.writeHead(200, { 'Content-Type': (types[fileURLToPath(entry).split('.').pop()] || 'text/plain') + '; charset=utf-8', 'Cache-Control': 'no-store' }).end(data);
  } catch { res.writeHead(404).end(); }
}).listen(4453, '127.0.0.1', () => process.stdout.write('Voice preview: http://127.0.0.1:4453/ (8 allowlisted assets only)\n'));
