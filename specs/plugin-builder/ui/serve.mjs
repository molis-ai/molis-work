import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, delimiter } from 'node:path';

const require = createRequire(import.meta.url);
const { build } = require('esbuild');
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const out = join(here, '.build');
const port = Number(process.env.BUILDER_PORT || 4199);
await mkdir(out, { recursive: true });
const nodePaths = (process.env.NODE_PATH || '').split(delimiter).filter(Boolean);
await build({ entryPoints: [join(here, 'theme.ts')], outfile: join(out, 'theme.mjs'), bundle: true, platform: 'node', format: 'esm', nodePaths });
const theme = await import(join(out, 'theme.mjs'));
await build({ entryPoints: [join(here, 'app.ts')], outfile: join(out, 'app.js'), bundle: true, platform: 'browser', format: 'esm', nodePaths, sourcemap: true, external: ['/assets/*'] });
const html = `<!doctype html><html lang="zh-CN" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>插件 Builder · Molis Work</title><style>${theme.styles}</style><link rel="stylesheet" href="/app.css"></head><body class="immersive-workbench builder-page">${theme.sprite}<div id="app"></div><script>${theme.client}</script><script type="module" src="/app.js"></script></body></html>`;
const assets = new Map([
  ['/assets/inspiration-atlas.png', [join(here, 'assets/inspiration-atlas.png'), 'image/png']],
  ['/app.js', [join(out, 'app.js'), 'text/javascript']],
  ['/app.js.map', [join(out, 'app.js.map'), 'application/json']],
  ['/app.css', [join(out, 'app.css'), 'text/css']],
  ['/assets/inter-latin-variable.woff2', [join(root, 'packages/design-system/fonts/inter-latin-variable.woff2'), 'font/woff2']],
  ['/assets/noto-sans-sc-400.woff2', [join(root, 'packages/design-system/fonts/noto-sans-sc-400.woff2'), 'font/woff2']],
]);
const server = createServer(async (req, res) => {
  const path = new URL(req.url || '/', 'http://localhost').pathname;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
  if (path === '/' || path === '/plugin/materials') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); return; }
  if (path === '/favicon.ico') { res.writeHead(204).end(); return; }
  const asset = assets.get(path);
  if (!asset) { res.writeHead(404).end('Not found'); return; }
  try { res.setHeader('Content-Type', asset[1]); res.end(await readFile(asset[0])); }
  catch { res.writeHead(404).end('Not found'); }
});
server.listen(port, '127.0.0.1', () => process.stdout.write(`Plugin Builder: http://127.0.0.1:${port}\n`));
