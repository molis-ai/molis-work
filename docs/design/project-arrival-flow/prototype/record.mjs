// 把原型里的动线真实地跑一遍并录成视频（隔离的无头 Chrome，Page.startScreencast，再用 ffmpeg 重采样到 30fps）。
// 用法：node docs/design/project-arrival-flow/prototype/record.mjs <first-run|returning|new-project> <输出.mp4> [light|dark]
// 点击、悬停、按键、输入都走真实的 Input.dispatch*，所以 hover / 焦点 / 按压状态也会出现在画面里。
import { spawn, spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [which = 'returning', outFile = '/tmp/arrival.mp4', theme = 'light'] = process.argv.slice(2);
const url = pathToFileURL(resolve(here, 'dist/index.html')).href;
const W = 1440; const H = 900;
const profile = await mkdtemp(join(tmpdir(), 'arrival-rec-'));
const frameDir = await mkdtemp(join(tmpdir(), 'arrival-frames-'));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', '--remote-debugging-port=0', `--user-data-dir=${profile}`, `--window-size=${W},${H}`, 'about:blank'], { stdio: 'ignore' });
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
let ws; const frames = [];
try {
  let port; for (let i = 0; i < 300 && !port; i++) { try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; } catch { await delay(50); } }
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws = new WebSocket(pages.find((p) => p.type === 'page').webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let seq = 0; const pend = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pend.has(d.id)) { const p = pend.get(d.id); pend.delete(d.id); d.error ? p.j(new Error(JSON.stringify(d.error))) : p.r(d.result); }
    else if (d.method === 'Page.screencastFrame') {
      frames.push({ data: d.params.data, ts: d.params.metadata.timestamp });
      send('Page.screencastFrameAck', { sessionId: d.params.sessionId }).catch(() => {});
    }
  };
  const send = (method, params = {}) => new Promise((r, j) => { const id = ++seq; pend.set(id, { r, j }); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => pend.has(id) && (pend.delete(id), j(new Error('timeout ' + method))), 30000); });
  const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });

  /* 鼠标与键盘 */
  let mx = 720; let my = 450;
  const centre = async (sel) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(); return [r.left + Math.min(r.width / 2, 120), r.top + r.height / 2]; })()`);
  const move = async (x, y, steps = 14) => { for (let i = 1; i <= steps; i++) { const t = i / steps; const e = t * t * (3 - 2 * t); await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: mx + (x - mx) * e, y: my + (y - my) * e }); await delay(14); } mx = x; my = y; };
  const hover = async (sel, pause = 250) => { const c = await centre(sel); if (!c) throw new Error('missing ' + sel); await move(c[0], c[1]); await delay(pause); };
  const click = async (sel, pause = 400) => { const c = await centre(sel); if (!c) throw new Error('missing ' + sel); await move(c[0], c[1]); await delay(120); await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: mx, y: my, button: 'left', clickCount: 1 }); await delay(90); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: mx, y: my, button: 'left', clickCount: 1 }); await delay(pause); };
  const KEYS = { ArrowDown: 40, ArrowUp: 38, Enter: 13, Escape: 27, End: 35, Home: 36 };
  const press = async (key, pause = 350, mods = 0) => { const code = KEYS[key]; await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code: key, windowsVirtualKeyCode: code, modifiers: mods }); if (key === 'Enter') await send('Input.dispatchKeyEvent', { type: 'char', text: '\r', key, windowsVirtualKeyCode: code }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: code, modifiers: mods }); await delay(pause); };
  const type = async (text, per = 70) => { for (const ch of text) { await send('Input.insertText', { text: ch }); await delay(per); } };
  const hold = (ms) => delay(ms);
  const load = async (hash) => { await send('Page.navigate', { url: `${url}#${hash}&capture&${theme}` }); await delay(300); await send('Page.reload', { ignoreCache: true }); for (let i = 0; i < 200; i++) { if (await ev('!!window.__arrival').catch(() => false)) break; await delay(50); } };

  /* 先预热字体与页面（不录），再清空状态，正式录制时是“冷启动”。 */
  await load(which === 'first-run' ? 'opening' : 'chooser');
  await ev('document.fonts.ready.then(() => true)');
  await delay(400);
  await send('Page.startScreencast', { format: 'jpeg', quality: 86, everyNthFrame: 1 });
  await ev(`window.__arrival.applyPreset(${JSON.stringify(which === 'first-run' ? 'opening' : 'chooser')}, { animate: true, cold: true })`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: mx, y: my });

  if (which === 'first-run') {
    await hold(5200); // 字标打出、字幕变换、光标闪动、「开始」出现
    await click('[data-act="opening-start"]', 1500);
    await hold(600);
    await hover('.welcome-options .mw-choice:nth-child(2)', 500);
    await click('.welcome-options .mw-choice:nth-child(2)', 700);
    await click('.welcome-options .mw-choice:nth-child(1)', 600);
    await click('[data-act="welcome-next"]', 1100);
    await click('[data-theme-option="dark"]', 1200);
    await click('[data-theme-option="system"]', 700);
    await click('[data-act="welcome-next"]', 1400);
    await click('[data-act="ob-open"][data-src="folder"]', 900);
    await click('[data-act="ob-add-folder"]', 1400);
  } else if (which === 'returning') {
    await hold(2600); // 轻开场：字标打字、字幕开始变换，同时一直可以操作
    await hover('#row-astralo', 300);
    await click('#row-astralo', 1200);
    await click('#row-coding', 1000);
    await press('ArrowDown', 700); await press('ArrowDown', 700);
    await click('#row-flyleaf', 1000);
    await click('[data-composer-input]', 300);
    await type('把本周的访谈纪要整理成一页', 55);
    await hold(500);
    await click('#row-feed', 1100);
    await click('#row-flyleaf', 1100);
    await click('#chooser-q', 300);
    await type('GoalBoard', 90);
    await hold(1200);
    await type('xyz', 90);
    await hold(1300);
    await ev(`(() => { const q = document.querySelector('#chooser-q'); q.value = ''; q.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await hold(1100);
    await click('#row-flyleaf', 700);
    await press('Enter', 1900); // 进入项目
    await click('[data-act="ws-back"]', 1800); // 回到项目选择，预选刚才的项目
  } else {
    await hold(900);
    await click('[data-act="new"]', 1100);
    await click('[data-act="ob-open"][data-src="folder"]', 800);
    await click('[data-act="ob-pick"][data-folder="docs"]', 500);
    await click('[data-act="ob-add-folder"]', 1300);
    await click('[data-act="ob-open"][data-src="files"]', 700);
    await click('[data-act="ob-sample-files"]', 900);
    await click('[data-act="ob-open"][data-src="web"]', 700);
    await click('[data-act="ob-sample-web"]', 700);
    await click('#cfg-web-add', 1100);
    await click('[data-act="ob-scope"]', 1300);
    await ev(`document.querySelectorAll('input[data-scope-item]')[6].id = 'rec-skip'`);
    await click('#rec-skip', 900);
    await click('[data-act="ob-start"]', 1000);
    await hold(7400); // 整理（读入、整理脉络、找出待办）→ 自动进入命名
    await hold(1400);
    await click('input[data-todo="2"]', 1000);
    await click('[data-act="ob-create"]', 2400);
  }
  await send('Page.stopScreencast');
  await delay(300);
} finally {
  ws?.close(); chrome.kill(); await delay(200); await rm(profile, { recursive: true, force: true }).catch(() => {});
}

/* 帧 → 30fps 视频：按时间戳排成 concat 列表，每帧停留到下一帧出现。 */
frames.sort((a, b) => a.ts - b.ts);
if (frames.length < 5) throw new Error(`录到的帧太少：${frames.length}`);
let list = 'ffconcat version 1.0\n';
for (let i = 0; i < frames.length; i++) {
  const f = join(frameDir, `f${String(i).padStart(5, '0')}.jpg`);
  await writeFile(f, Buffer.from(frames[i].data, 'base64'));
  const dur = i < frames.length - 1 ? Math.max(0.001, frames[i + 1].ts - frames[i].ts) : 0.5;
  list += `file '${f}'\nduration ${dur.toFixed(4)}\n`;
}
const lastF = join(frameDir, `f${String(frames.length - 1).padStart(5, '0')}.jpg`);
list += `file '${lastF}'\n`;
await writeFile(join(frameDir, 'list.txt'), list);
await mkdir(dirname(resolve(outFile)), { recursive: true });
const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(frameDir, 'list.txt'), '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '25', '-preset', 'medium', '-movflags', '+faststart', resolve(outFile)], { stdio: 'inherit' });
await rm(frameDir, { recursive: true, force: true }).catch(() => {});
console.log(r.status === 0 ? `ok ${outFile}  (${frames.length} 帧, ${(frames[frames.length - 1].ts - frames[0].ts).toFixed(1)}s)` : 'ffmpeg 失败');
