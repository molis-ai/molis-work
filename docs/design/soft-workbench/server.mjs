import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { renderIconSprite } from '../../../packages/design-system/dist/index.js';

const root = new URL('./', import.meta.url);
const files = new Map([
  ...['app.js', 'shared.js', 'data.js', 'onboarding.js'].map(name => ['/' + name, [new URL(name, root), 'text/javascript']]),
  ...['style.css', 'onboarding.css'].map(name => ['/' + name, [new URL(name, root), 'text/css']]),
  ['/inter.woff2', [new URL('../../../packages/design-system/fonts/inter-latin-variable.woff2', root), 'font/woff2']],
]);
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
  try {
    let body, type;
    if (path === '/' || path === '/onboarding') {
      body = (await readFile(new URL('index.html', root), 'utf8')).replace('<!-- ICONS -->', renderIconSprite());
      type = 'text/html; charset=utf-8';
    } else if (files.has(path)) {
      const [file, mime] = files.get(path);
      body = await readFile(file); type = mime;
    } else { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (error) { console.error(error.message); res.writeHead(500).end('Preview unavailable'); }
});
const port = Number(process.env.SOFT_WORKBENCH_PORT || 4338);
server.listen(port, '127.0.0.1', () => console.log(`Molis Work preview: http://127.0.0.1:${port}`));
