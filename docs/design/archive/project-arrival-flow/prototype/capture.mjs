// 用隔离的无头 Chrome 把原型的各个状态渲染成设计图。
// 用法：node docs/design/project-arrival-flow/prototype/capture.mjs <输出目录> <状态,状态,…> [宽x高] [light|dark]
//   状态即原型审阅条里的预设，例如 chooser、chooser.feed、sources.filled、scope、result。
// 每张图默认 2x 像素密度（环境变量 DPR 可改），静止模式（不播放动效），并检查水平溢出、底栏是否在视口内、脚本异常。
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [out = 'shots', presetArg = 'chooser', sizeArg = '1440x900', theme = 'light'] = process.argv.slice(2);
const presets = presetArg.split(',');
const [W, H] = sizeArg.split('x').map(Number);
const url = process.env.URL || pathToFileURL(resolve(here, 'dist/index.html')).href;
await mkdir(out, { recursive: true });

const profile = await mkdtemp(join(tmpdir(), 'arrival-shot-'));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const report = [];
let ws;
try {
  let port; for (let i = 0; i < 100 && !port; i++) { try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; } catch { await delay(50); } }
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws = new WebSocket(pages.find((p) => p.type === 'page').webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let seq = 0; const pend = new Map(); const errors = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pend.has(d.id)) { const p = pend.get(d.id); pend.delete(d.id); d.error ? p.j(new Error(JSON.stringify(d.error))) : p.r(d.result); }
    else if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
    else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push(d.params.args.map((a) => a.value || a.description).join(' '));
  };
  const send = (method, params = {}) => new Promise((r, j) => { const id = ++seq; pend.set(id, { r, j }); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => pend.has(id) && (pend.delete(id), j(new Error('timeout ' + method))), 45000); });
  const evaluate = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  await send('Page.enable'); await send('Runtime.enable');
  const DPR = Number(process.env.DPR || 2);
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: W < 600 });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
  for (const p of presets) {
    await send('Page.navigate', { url: `${url}#${p}&capture&still&${theme}` });
    await delay(250);
    await send('Page.reload', { ignoreCache: true });
    for (let i = 0; i < 120; i++) { if (await evaluate('document.readyState === "complete" && !!document.querySelector(".arrival-bar .bar-end")').catch(() => false)) break; await delay(50); }
    await evaluate('Promise.race([document.fonts.ready.then(() => true), new Promise((r) => setTimeout(() => r(false), 8000))])');
    await delay(500);
    const m = await evaluate(`(() => {
      const bar = document.querySelector('.arrival-bar').getBoundingClientRect();
      const over = document.documentElement.scrollWidth > innerWidth;
      const clipped = [...document.querySelectorAll('.arrival-bar .mw-btn')].filter((b) => { const r = b.getBoundingClientRect(); return r.right > innerWidth + 1 || r.left < -1; }).length;
      return { barBottom: Math.round(bar.bottom), over, clipped, theme: document.documentElement.dataset.resolvedTheme };
    })()`);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const file = join(out, `${p.replace(/[^a-z0-9.]/gi, '-')}${theme === 'dark' ? '-dark' : ''}${W < 700 ? '-narrow' : ''}.png`);
    await writeFile(file, Buffer.from(shot.data, 'base64'));
    report.push({ p, file, ...m, errors: errors.splice(0) });
  }
} finally {
  ws?.close(); chrome.kill(); await delay(200); await rm(profile, { recursive: true, force: true }).catch(() => {});
}
for (const r of report) console.log(`${r.p}: bar=${r.barBottom}/${H} overflow=${r.over} clipped=${r.clipped} theme=${r.theme} errors=${r.errors.length ? r.errors.join(' | ').slice(0, 300) : 0}`);
