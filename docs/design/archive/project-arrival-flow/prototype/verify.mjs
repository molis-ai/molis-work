// 在无头 Chrome 里把原型的动线走一遍并断言：选择与预览、搜索、按项目保留草稿、进入与返回、
// 新建引导的每一步（添加材料、确认范围、命名、创建）、空白开始、首次使用路径、键盘。
// 用法：node docs/design/project-arrival-flow/prototype/verify.mjs [输出 json 路径]
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const url = process.env.URL || pathToFileURL(resolve(here, 'dist/index.html')).href;
const profile = await mkdtemp(join(tmpdir(), 'arrival-verify-'));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const results = []; let ws; const errors = [];
let failed = 0;
try {
  let port; for (let i = 0; i < 100 && !port; i++) { try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; } catch { await delay(50); } }
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws = new WebSocket(pages.find((p) => p.type === 'page').webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let seq = 0; const pend = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pend.has(d.id)) { const p = pend.get(d.id); pend.delete(d.id); d.error ? p.j(new Error(JSON.stringify(d.error))) : p.r(d.result); }
    else if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
    else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push(d.params.args.map((a) => a.value || a.description).join(' '));
  };
  const send = (method, params = {}) => new Promise((r, j) => { const id = ++seq; pend.set(id, { r, j }); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => pend.has(id) && (pend.delete(id), j(new Error('timeout ' + method))), 30000); });
  const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  const wait = (ms = 60) => delay(ms);
  const $q = (s) => `document.querySelector(${JSON.stringify(s)})`;
  const click = async (s) => { await ev(`(() => { const e = ${$q(s)}; if (!e) throw new Error('missing ' + ${JSON.stringify(s)}); e.click(); })()`); await wait(); };
  const fill = async (s, v) => { await ev(`(() => { const e = ${$q(s)}; e.value = ${JSON.stringify(v)}; e.dispatchEvent(new Event('input', { bubbles: true })); })()`); await wait(); };
  const key = async (s, k, extra = {}) => { await ev(`${$q(s)}.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key: ${JSON.stringify(k)}, bubbles: true, cancelable: true }, ${JSON.stringify(extra)})))`); await wait(); };
  const docKey = async (k, extra = {}) => { await ev(`document.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key: ${JSON.stringify(k)}, bubbles: true, cancelable: true }, ${JSON.stringify(extra)})))`); await wait(); };
  const text = (s) => `(${$q(s)}?.textContent || '').trim()`;
  const check = async (name, expr) => { let value = false; try { value = await ev(expr); } catch (e) { value = `EXC ${e.message.slice(0, 160)}`; } const ok = value === true; results.push({ name, ok, value: ok ? undefined : value }); if (!ok) failed += 1; };
  const open = async (hash) => { await send('Page.navigate', { url: `${url}#${hash}&capture&still` }); await wait(200); await send('Page.reload', { ignoreCache: true }); for (let i = 0; i < 120; i++) { if (await ev('!!window.__arrival && !!document.querySelector(".arrival-bar .bar-end")').catch(() => false)) break; await delay(50); } await ev('document.fonts.ready.then(() => true)'); await wait(250); };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  /* ── 项目选择页 ── */
  await open('chooser');
  await check('初始预选上次的项目，详情是它', `${text('#brief-title')} === 'FlyLeaf-V0.1' && document.querySelectorAll('#chooser-dir .mw-dir-row').length === 10`);
  await check('只有一个预选行，键盘可达（roving tabindex）', `document.querySelectorAll('#chooser-dir .mw-dir-row.is-selected').length === 1 && document.querySelectorAll('#chooser-dir .mw-dir-row[tabindex="0"]').length === 1`);
  await check('底栏左侧说明回车会打开谁', `${text('.mw-bar-context__text strong')} === 'FlyLeaf-V0.1' && ${text('.mw-bar-context__text small')}.includes('回车进入')`);
  await check('进度来自目标状态：4/6，当前目标是打磨首次使用', `${text('.brief-focus__count')}.startsWith('4') && ${text('.brief-focus h2')} === '打磨首次使用' && document.querySelectorAll('.mw-goal-track > li[data-s="done"]').length === 4`);
  await click('#row-astralo');
  await check('点击只预览，不进入', `${text('#brief-title')} === 'ASTRALO' && document.querySelector('[data-view="chooser"]') && !document.querySelector('[data-view="workspace"]')`);
  await check('底栏随所选项目换上下文', `${text('.mw-bar-context__text strong')} === 'ASTRALO' && document.querySelector('[data-composer-input]').placeholder.includes('ASTRALO')`);
  await fill('[data-composer-input]', 'ASTRALO 的草稿');
  await click('#row-flyleaf');
  await check('草稿按项目保留：换项目后输入框是空的', `document.querySelector('[data-composer-input]').value === ''`);
  await fill('[data-composer-input]', 'FlyLeaf 的草稿');
  await click('#row-astralo');
  await check('回到原项目，草稿还在', `document.querySelector('[data-composer-input]').value === 'ASTRALO 的草稿'`);
  await click('#row-flyleaf');
  await check('再回 FlyLeaf，草稿还在', `document.querySelector('[data-composer-input]').value === 'FlyLeaf 的草稿' && !document.querySelector('[data-composer-send]').disabled`);
  await key('#row-flyleaf', 'ArrowDown');
  await check('方向键切换预览并移动焦点', `${text('#brief-title')} === 'GoalBoard 信息流工作台重设计' && document.activeElement.id === 'row-feed'`);
  await key('#row-feed', 'End');
  await check('End 到最后一项（ceshi：没有描述也没有目标）', `${text('#brief-title')} === 'ceshi' && !!document.querySelector('.brief-desc.is-missing') && !!document.querySelector('.brief-focus.is-empty') && !document.querySelector('.mw-goal-track')`);
  await click('#row-football');
  await check('没有目标的项目不显示假进度，并给出起草入口', `!document.querySelector('.mw-goal-track') && ${text('.brief-focus.is-empty h2')} === '还没有目标' && !!document.querySelector('.brief-focus.is-empty [data-act="prefill"]')`);
  await click('.brief-focus.is-empty [data-act="prefill"]');
  await check('「让助理起草目标」只把请求放进输入框，不直接执行', `document.querySelector('[data-composer-input]').value.includes('起草') && !document.querySelector('[data-view="workspace"]')`);
  await click('#row-demo');
  await check('目标全部完成的项目', `${text('.brief-focus__label')} === '目标全部完成' && document.querySelectorAll('.mw-goal-track > li[data-s="done"]').length === 3`);
  await click('#row-personal');
  await check('个人空间：计数代替目标，主操作变为进入个人空间', `document.querySelectorAll('.brief-focus.is-counts p').length === 3 && ${text('[data-act="enter"]')}.includes('进入个人空间')`);

  /* 搜索 */
  await fill('#chooser-q', 'GoalBoard');
  await check('搜索过滤列表，并预选第一个匹配项', `document.querySelectorAll('#chooser-dir .mw-dir-row').length === 4 && ${text('#brief-title')}.startsWith('GoalBoard')`);
  await fill('#chooser-q', 'roadmap');
  await check('搜索无结果：详情给出空态，进入项目禁用但仍可见，新建可用', `!!document.querySelector('.brief-none .mw-empty') && document.querySelector('[data-act="enter"]').disabled && !document.querySelector('[data-act="new"]').disabled && ${text('.mw-bar-context__text strong')} === '没有匹配的项目'`);
  await click('[data-act="clear-search"]');
  await check('清除搜索恢复列表与预选', `document.querySelectorAll('#chooser-dir .mw-dir-row').length === 10 && !!document.querySelector('#chooser-dir .mw-dir-row.is-selected')`);
  await fill('#chooser-q', 'roadmap');
  await click('[data-act="new-named"]');
  await check('以搜索词新建：进入空白页并带入名字', `!!document.querySelector('[data-step="blank"]') && document.querySelector('#ob-name').value === 'roadmap'`);
  await click('[data-act="ob-back"]');
  await check('返回项目：回到项目选择页，列表恢复', `!!document.querySelector('[data-view="chooser"]') && document.querySelectorAll('#chooser-dir .mw-dir-row').length === 10`);

  /* 进入与返回 */
  await click('#row-coding');
  await click('[data-act="enter"]');
  await wait(300);
  await check('进入项目：项目首页（示意）与真实的项目底栏', `!!document.querySelector('[data-view="workspace"]') && ${text('#ws-title')} === 'Coding 开发沙盒' && document.querySelectorAll('.arrival-bar .dock-pin').length === 5`);
  await click('[data-act="ws-back"]');
  await wait(300);
  await check('项目按钮返回：预选刚才的项目', `!!document.querySelector('[data-view="chooser"]') && ${text('#brief-title')} === 'Coding 开发沙盒'`);
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`);
  await wait(300);
  await check('回车直接进入所选项目', `!!document.querySelector('[data-view="workspace"]')`);
  await click('[data-act="ws-back"]'); await wait(300);
  await docKey('k', { metaKey: true });
  await check('⌘K 聚焦搜索', `document.activeElement.id === 'chooser-q'`);

  /* ── 新建项目 ── */
  await click('[data-act="new"]'); await wait(300);
  await check('新建：来源页，没有材料时「确认范围」禁用、「空白开始」可用', `${text('.ob-q h1')} === '带入已有的材料' && document.querySelector('[data-act="ob-scope"]').disabled && !document.querySelector('[data-act="ob-blank"]').disabled`);
  await check('进度短线共 4 段，当前是第 1 段', `document.querySelectorAll('.arrival-bar .mw-steps li').length === 4 && document.querySelector('.arrival-bar .mw-steps li[aria-current="step"]') === document.querySelectorAll('.arrival-bar .mw-steps li')[0]`);
  await check('返回项目是向左箭头', `!!document.querySelector('.arrival-back svg') && document.querySelector('.arrival-back [data-slot="button-label"]').textContent === '返回项目'`);
  await check('Gmail 未配置：行可展开但连接按钮禁用', `(() => { document.querySelector('[data-act="ob-open"][data-src="gmail"]').click(); return true; })()`);
  await wait();
  await check('Gmail 展开后说明原因，连接按钮禁用', `${text('#cfgp-gmail')}.includes('还没有配置') && document.querySelector('#cfgp-gmail .mw-btn').disabled`);
  await click('[data-act="ob-open"][data-src="folder"]');
  await click('[data-act="ob-pick"][data-folder="desktop"]');
  await click('[data-act="ob-range"][data-range="90"]');
  await click('[data-act="ob-add-folder"]');
  await check('添加文件夹：材料清单出现文件名与大小，正文尚未读取', `document.querySelectorAll('.ob-right .mw-file-row').length === 3 && ${text('.ob-stage-head span')}.includes('正文尚未读取') && ${text('.mw-bar-status__text small')}.includes('正文尚未读取')`);
  await click('[data-act="ob-open"][data-src="files"]');
  await click('[data-act="ob-sample-files"]');
  await click('[data-act="ob-open"][data-src="web"]');
  await check('网页正文为空时「添加」禁用', `document.querySelector('#cfg-web-add').disabled`);
  await fill('#cfg-web', '用户粘贴的演示正文');
  await check('有正文后「添加」可用', `!document.querySelector('#cfg-web-add').disabled`);
  await click('[data-act="ob-open"][data-src="files"]');
  await click('[data-act="ob-open"][data-src="web"]');
  await check('切换来源后，网页正文草稿还在', `document.querySelector('#cfg-web').value === '用户粘贴的演示正文'`);
  await click('#cfg-web-add');
  await check('添加网页正文成一组', `document.querySelectorAll('.mw-file-group').length === 3`);
  await click('[data-act="ob-open"][data-src="chat"]');
  await click('[data-act="ob-sample-chat"]');
  await click('[data-act="ob-remove"]');
  await check('移除一份材料', `document.querySelectorAll('.ob-right .mw-file-row').length === 6`);
  await click('[data-act="ob-scope"]'); await wait(300);
  await check('确认范围：逐项勾选，份数与大小在计量里', `document.querySelectorAll('.mw-file-row input[type="checkbox"]').length === 6 && ${text('.ob-meter b')} === '6'`);
  await ev(`document.querySelector('.mw-file-row input[data-scope-item]').click()`); await wait();
  await check('取消一份后计量与底栏同步', `${text('.ob-meter b')} === '5' && ${text('.mw-bar-status__text strong')}.startsWith('已选 5 份')`);
  await ev(`(() => { for (let n = 0; n < 12; n += 1) { const i = [...document.querySelectorAll('input[data-scope-group]')].find((x) => x.checked || x.indeterminate); if (!i) break; i.click(); } })()`); await wait();
  await check('全部取消后「开始整理」禁用', `document.querySelector('[data-act="ob-start"]').disabled`);
  await ev(`document.querySelector('input[data-scope-group]').click()`); await wait();
  await check('只勾一组后可以开始', `!document.querySelector('[data-act="ob-start"]').disabled`);
  await click('[data-act="ob-model"]');
  await check('未连接文字模型：主操作改为「带入资料，先开始」', `${text('[data-act="ob-start"]')}.includes('带入资料，先开始') && ${text('.ob-model strong')}.includes('尚未连接')`);
  await click('[data-act="ob-model"]');
  await click('[data-act="ob-prev"]'); await wait(300);
  await check('上一步回到来源，材料还在', `${text('.ob-q h1')} === '带入已有的材料' && document.querySelectorAll('.mw-file-group').length >= 1`);

  /* 整理 → 命名 → 创建（直接用结果预设，整理的模拟是实时的，另测） */
  await open('result');
  await check('命名页：名字、摘要与预览是同一份简介，待办在预览里勾选', `document.querySelector('#ob-name').value === 'FlyLeaf 首版内测' && ${text('.ob-preview .brief-title')} === 'FlyLeaf 首版内测' && document.querySelectorAll('.ob-preview input[data-todo]').length === 4`);
  await fill('#ob-name', '');
  await click('[data-act="ob-create"]');
  await check('名字为空时就地提示并聚焦，不创建', `!document.querySelector('#ob-name-err').hidden && document.activeElement.id === 'ob-name' && !!document.querySelector('[data-step="result"]')`);
  await fill('#ob-name', 'FlyLeaf 首版内测');
  await check('输入名字后提示消失、预览同步', `document.querySelector('#ob-name-err').hidden && ${text('.ob-preview .brief-title')} === 'FlyLeaf 首版内测'`);
  await ev(`document.querySelector('input[data-todo="0"]').click()`); await wait();
  await check('取消勾选一条待办，底栏主操作的数量同步', `${text('[data-act="ob-create"]')}.includes('加入 2 项待办')`);
  await click('[data-act="ob-create"]'); await wait(500);
  await check('创建：进入新项目，并出现在项目选择页第一位', `!!document.querySelector('[data-view="workspace"]') && ${text('#ws-title')} === 'FlyLeaf 首版内测' && window.__arrival.V.getProjects()[0].name === 'FlyLeaf 首版内测' && window.__arrival.V.getProjects()[0].next.length === 2`);
  await click('[data-act="ws-back"]'); await wait(300);
  await check('回到项目选择页：新项目被预选并在列表最前', `${text('#brief-title')} === 'FlyLeaf 首版内测' && document.querySelectorAll('#chooser-dir .mw-dir-row')[1].dataset.id.startsWith('new-')`);

  /* 空白开始 */
  await open('chooser');
  await click('[data-act="new"]'); await wait(300);
  await click('[data-act="ob-blank"]'); await wait(300);
  await check('空白开始：只有名字，预览是同一块简介的空状态', `${text('.ob-q h1')} === '给新项目一个名字' && ${text('.ob-preview .brief-title')} === '新项目' && !!document.querySelector('.ob-preview .brief-focus.is-empty')`);
  await check('空白页的进度短线不高亮任何一段', `document.querySelectorAll('.arrival-bar .mw-steps li[aria-current]').length === 0`);
  await fill('#ob-name', '秋季内容计划');
  await key('#ob-name', 'Enter'); await wait(500);
  await check('Enter 直接创建并进入', `!!document.querySelector('[data-view="workspace"]') && ${text('#ws-title')} === '秋季内容计划'`);

  /* 还没有任何项目 */
  await open('chooser.fresh');
  await check('还没有项目：只剩个人空间与两个入口', `document.querySelectorAll('#chooser-dir .mw-dir-row').length === 1 && !!document.querySelector('.brief-none .mw-empty') && document.querySelectorAll('.brief-none__actions .mw-btn').length === 2`);

  await open('chooser.failed');
  await check('列表读取失败：在列表的位置说清楚并给重试，个人空间照常可用', `!!document.querySelector('#chooser-dir .mw-empty--error') && document.querySelectorAll('#chooser-dir .mw-dir-row').length === 1 && ${text('#brief-title')} === '个人空间'`);
  await click('[data-act="retry-load"]'); await wait(300);
  await check('重试成功：项目列表回来，预选第一个项目', `document.querySelectorAll('#chooser-dir .mw-dir-row').length === 10 && !document.querySelector('.mw-empty--error') && ${text('#brief-title')} === 'FlyLeaf-V0.1'`);

  /* ── 首次使用 ── */
  await open('opening');
  await check('开场：大字标，标题栏字标先藏起来；开始按钮在底栏', `!!document.querySelector('.opening-wordmark .mw-wordmark') && document.querySelector('.arrival-titlebar .mw-wordmark').style.visibility === 'hidden' && ${text('[data-act="opening-start"]')}.includes('开始')`);
  await click('[data-act="opening-start"]'); await wait(300);
  await check('开始 → Welcome 语言；进度短线共 6 段', `!!document.querySelector('[data-view="welcome"][data-step="language"]') && document.querySelectorAll('.arrival-bar .mw-steps li').length === 6 && document.querySelector('.arrival-titlebar .mw-wordmark').style.visibility === 'visible'`);
  await click('[data-act="lang"][data-lang="en"]');
  await check('选 English：问候与按钮跟着变', `${text('.ob-greeting strong')} === 'Hello.' && ${text('[data-act="welcome-next"]')}.includes('Continue')`);
  await click('[data-act="lang"][data-lang="zh"]');
  await click('[data-act="welcome-next"]'); await wait(300);
  await check('继续 → 外观；主题与密度是同一种选项', `!!document.querySelector('[data-step="appearance"]') && document.querySelectorAll('.welcome-options .mw-choice').length === 5`);
  await click('[data-theme-option="dark"]'); await wait();
  await check('选深色：立即生效', `document.documentElement.dataset.resolvedTheme === 'dark'`);
  await click('[data-theme-option="light"]'); await wait();
  await click('[data-act="welcome-next"]'); await wait(300);
  await check('继续 → 来源（首次使用：进度短线 6 段、当前第 3 段）', `${text('.ob-q h1')} === '带入已有的材料' && document.querySelectorAll('.arrival-bar .mw-steps li').length === 6 && document.querySelectorAll('.arrival-bar .mw-steps li')[2].hasAttribute('aria-current')`);
  await click('[data-act="ob-back"]'); await wait(300);
  await check('首次使用时「返回项目」回到只有个人空间的项目选择页', `!!document.querySelector('[data-view="chooser"]') && document.querySelectorAll('#chooser-dir .mw-dir-row').length === 1`);

  await open('welcome');
  await click('[data-act="later"]'); await wait(300);
  await check('Welcome 里「稍后再说」→ 还没有项目的项目选择页', `!!document.querySelector('[data-view="chooser"]') && !!document.querySelector('.brief-none .mw-empty')`);

  /* 整理的实时模拟（不用静止模式）：读入 → 阶段推进 → 后台继续 → 回来命名 */
  await send('Page.navigate', { url: `${url}#sources.filled&capture` });
  await wait(200); await send('Page.reload', { ignoreCache: true });
  for (let i = 0; i < 120; i++) { if (await ev('!!window.__arrival').catch(() => false)) break; await delay(50); }
  await ev('document.fonts.ready.then(() => true)'); await wait(400);
  await click('[data-act="ob-scope"]'); await wait(700);
  await click('[data-act="ob-start"]'); await wait(900);
  await check('整理开始：底栏显示正在读入，主操作禁用', `${text('.mw-bar-status__text strong')}.startsWith('正在读入') && document.querySelector('.arrival-bar .bar-end .mw-btn--primary').disabled`);
  await click('[data-act="ob-away"]'); await wait(900);
  await check('在后台继续：回到项目选择页，标题栏的后台任务出现整理项', `!!document.querySelector('[data-view="chooser"]') && ${text('#bg-count')} === '2'`);
  await click('#bg-btn'); await wait(300);
  await check('后台任务里能看到「新项目 · 正在整理」', `${text('#pop')}.includes('新项目')`);
  await wait(9000);
  await click('[data-act="bg"]'); await wait(200);
  await check('整理完成后任务变为「等你确认」', `${text('#pop')}.includes('整理完成')`);
  await click('[data-act="bg-task"][data-task="bg-onboard"]'); await wait(600);
  await check('点开后台任务，回到命名并开始', `!!document.querySelector('[data-step="result"]') && document.querySelector('#ob-name').value === 'FlyLeaf 首版内测'`);

  /* 动效（实时，不用静止模式）：字标只打一次、字幕换词不让周围跳、脚本动画只动 opacity / transform */
  await send('Page.navigate', { url: `${url}#chooser&capture` });
  await wait(200); await send('Page.reload', { ignoreCache: true });
  for (let i = 0; i < 120; i++) { if (await ev('!!window.__arrival').catch(() => false)) break; await delay(50); }
  await ev('document.fonts.ready.then(() => true)'); await wait(2800);
  await check('冷启动约 1.3 秒后字标打完，没有仍在播放的字标动画', `(() => { const w = document.querySelector('.arrival-titlebar .mw-wordmark'); return w.dataset.state === 'done' && w.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length === 0; })()`);
  const samples = await ev(`(async () => { const out = []; for (let i = 0; i < 12; i++) { const c = document.querySelector('.arrival-titlebar .mw-caption').getBoundingClientRect(); const w = document.querySelector('.arrival-titlebar .mw-wordmark').getBoundingClientRect(); const s = document.querySelector('.stage-sheet').getBoundingClientRect(); out.push([c.width, c.left, w.left, w.width, s.left, s.width]); if (i === 3) document.querySelector('#row-astralo').click(); if (i === 7) document.querySelector('#row-coding').click(); await new Promise((r) => setTimeout(r, 330)); } return out; })()`);
  const spread = (k) => Math.max(...samples.map((r) => r[k])) - Math.min(...samples.map((r) => r[k]));
  const yes = (ok) => (ok ? 'true' : 'false');
  await check('字幕换词 4 秒内宽度与位置不变（不推动周围）', yes(spread(0) < 1 && spread(1) < 1));
  await check('切换项目时字标不重播、位置不动', yes(spread(2) < 1 && spread(3) < 1));
  await check('切换项目时工作面的位置与大小不跳', yes(spread(4) < 1 && spread(5) < 1));
  const props = await ev(`(async () => { const set = new Set(); document.querySelector('#row-flyleaf').click(); for (let i = 0; i < 10; i++) { document.getAnimations().filter((a) => !(a instanceof CSSTransition) && !(a instanceof CSSAnimation)).forEach((a) => (a.effect?.getKeyframes?.() || []).forEach((k) => Object.keys(k).forEach((p) => set.add(p)))); await new Promise((r) => setTimeout(r, 50)); } return [...set]; })()`);
  await check(`脚本驱动的动画只用 opacity / transform（实测属性：${props.join('、')}）`, yes(props.every((p) => ['offset', 'easing', 'composite', 'computedOffset', 'opacity', 'transform'].includes(p))));

  await check('全程没有脚本异常', `true`);
} finally {
  ws?.close(); chrome.kill(); await delay(200); await rm(profile, { recursive: true, force: true }).catch(() => {});
}
const out = process.argv[2];
const summary = { total: results.length, passed: results.filter((r) => r.ok).length, failed, scriptErrors: errors, results };
if (out) await writeFile(out, JSON.stringify(summary, null, 2));
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : `   → ${JSON.stringify(r.value)}`}`);
console.log(`\n${summary.passed}/${summary.total} 通过；脚本异常 ${errors.length} 条${errors.length ? '：' + errors.slice(0, 3).join(' | ') : ''}`);
process.exit(failed || errors.length ? 1 : 0);
