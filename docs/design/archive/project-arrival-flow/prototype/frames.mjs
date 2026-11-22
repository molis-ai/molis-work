// 开发用：打开原型的某个状态，并连续截取开头的若干帧，看进入动效的节奏。
// 用法：node frames.mjs <状态> <输出前缀> [帧数] [间隔毫秒]
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const [preset = 'chooser', prefix = '/tmp/frame', count = '12', every = '120'] = process.argv.slice(2);
const url = pathToFileURL(resolve(here, 'dist/index.html')).href;
const profile = await mkdtemp(join(tmpdir(), 'arrival-frames-'));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
try {
  let port; for (let i = 0; i < 300 && !port; i++) { try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; } catch { await delay(50); } }
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws = new WebSocket(pages.find((p) => p.type === 'page').webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let seq = 0; const pend = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { const p = pend.get(d.id); pend.delete(d.id); d.error ? p.j(new Error(JSON.stringify(d.error))) : p.r(d.result); } };
  const send = (method, params = {}) => new Promise((r, j) => { const id = ++seq; pend.set(id, { r, j }); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => pend.has(id) && (pend.delete(id), j(new Error('timeout ' + method))), 30000); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'about:blank' });
  // 先把字体与页面载入缓存，再在“冷启动”的状态下计时。
  await send('Page.navigate', { url: `${url}#${preset}&capture` });
  await delay(1500);
  await send('Runtime.evaluate', { expression: `window.__arrival.applyPreset(${JSON.stringify(preset)}, { animate: true, cold: true })` });
  const t0 = Date.now();
  for (let i = 0; i < Number(count); i++) {
    const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
    await writeFile(`${prefix}-${String(i).padStart(2, '0')}.jpg`, Buffer.from(shot.data, 'base64'));
    console.log(i, Date.now() - t0, 'ms');
    await delay(Number(every));
  }
} finally { ws?.close(); chrome.kill(); await delay(200); await rm(profile, { recursive: true, force: true }).catch(() => {}); }
