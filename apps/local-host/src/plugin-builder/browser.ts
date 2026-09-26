import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import type { AgentBuild, BrowserAcceptance } from '@molis-ai/molis-work-plugin-builder';

/** Host-owned G7 driver. Contract steps never supply JavaScript, selectors, URLs or browser launch arguments. */
/** Each case starts from empty data, as the designer is told: `reset` empties the preview and the page is reopened. */
export async function runBuilderBrowserAcceptance(build: AgentBuild, options: { url: string; signal: AbortSignal; executable?: string; reset?: () => Promise<void> }): Promise<NonNullable<AgentBuild['browserResult']>> {
  if (!build.design) throw new Error('缺少界面验收合同');
  const browser = await BuilderBrowser.open(options.signal, options.executable);
  const cases: NonNullable<AgentBuild['browserResult']>['cases'] = [];
  try {
    await browser.navigate(options.url);
    try { await browser.wait(`globalThis.__molisPluginReady===true`); }
    catch { throw new Error('试用页没有在 20 秒内打开完成：请确认功能都已接通后重新验收'); }
    for (const [index, test] of build.design.acceptance.entries()) {
      options.signal.throwIfAborted();
      if (index > 0 && options.reset) {
        await options.reset();
        // Clear the old page's flag first, so the wait below can only be satisfied by the reopened page.
        await browser.evaluate('globalThis.__molisPluginReady=false');
        await browser.navigate(options.url);
        try { await browser.wait(`globalThis.__molisPluginReady===true`); }
        catch { throw new Error('试用页没有在 20 秒内打开完成：请确认功能都已接通后重新验收'); }
      }
      let position = 0;
      try { const selected = new Map<string, string>(); for (const step of test.steps) { await executeStep(browser, step, selected); position++; } cases.push({ id: test.id, passed: true, detail: test.description }); }
      catch (error) { cases.push({ id: test.id, passed: false, detail: await diagnose(browser, test.steps[position], position, error, build.nodes.some(node => node.id === (test.steps[position] as { componentId?: string } | undefined)?.componentId && !!node.read)) }); break; }
    }
    for (const test of build.design.acceptance) if (!cases.some(row => row.id === test.id)) cases.push({ id: test.id, passed: false, detail: '前置用例失败，尚未执行' });
    return { passed: cases.length > 0 && cases.every(row => row.passed), cases, at: new Date().toISOString() };
  } finally { await browser.close(); }
}
const literal = (value: unknown) => JSON.stringify(value);
/**
 * What a failed step saw: the step, the component's visible text and the data its query returned. The host uses it to
 * tell a display problem (the data has the text, the part does not show it) from a behavior problem.
 */
async function diagnose(browser: BuilderBrowser, step: BrowserAcceptance['steps'][number] | undefined, index: number, error: unknown, reads: boolean): Promise<string> {
  const reason = (error instanceof Error ? error.message.replace(/\n\s+at [\s\S]*$/, '') : String(error)).replace(/^(?:Uncaught\s+)?(?:Error:\s*)+/, '');
  if (!step || !('componentId' in step)) return JSON.stringify({ step: index + 1, reason });
  const root = component(step.componentId);
  const visible = await browser.evaluate<string>(`${flat(root)}.slice(0,600)`).catch(() => '');
  // A part that reads nothing has no data of its own; what it should show can only come through the design.
  const data = !reads ? '' : await browser.evaluate<string>(`globalThis.__molisPluginRead?globalThis.__molisPluginRead(${literal(step.componentId)}).then(v=>JSON.stringify(v).slice(0,1500),e=>'读取失败：'+e.message):''`).catch(() => '');
  return JSON.stringify({ step: index + 1, action: step.action, componentId: step.componentId, reason, visible, data });
}
const collapse = (value: string) => value.replace(/\s+/g, ' ').trim();
// What a part shows: its text and what is in its fields (a prefilled answer is shown even though it is not text).
const flat = (root: string) => `(((${root})?.innerText??'')+' '+[...(${root})?.querySelectorAll('[data-field]')??[]].map(el=>el.type==='checkbox'?'':el.value).join(' ')).replace(/\\s+/g,' ')`;
/** "编程珠玑 在读" on a list: one record shows every word, whether the list is a table, cards or lines. */
const oneRecord = (root: string, text: string) => {
  const words = collapse(text).split(' ').filter(Boolean);
  return words.length < 2 ? 'false' : `[...(${root})?.querySelectorAll('[data-record-id]')??[]].some(r=>{const t=r.innerText.replace(/\\s+/g,' ');return ${literal(words)}.every(w=>t.includes(w))})`;
};
const component = (id: string) => `[...document.querySelectorAll('[data-component-id]')].find(el=>el.dataset.componentId===${literal(id)})`;
/** `selected` remembers, per collection, the record a case chose, for actions that sit on that record. */
async function executeStep(browser: BuilderBrowser, step: BrowserAcceptance['steps'][number], selected: Map<string, string>) {
  if (step.action === 'reload') { await browser.evaluate('globalThis.__molisPluginReady=false'); await browser.command('Page.reload'); await browser.wait('globalThis.__molisPluginReady===true'); return; }
  if (step.action === 'page') {
    // A one-page plugin shows no page switcher: asking for its only page is already done.
    const tab = `[...document.querySelectorAll('.pc-tabs button')].find(el=>el.dataset.page===${literal(step.pageId)})`;
    if (await browser.evaluate<boolean>(`(()=>{const tab=${tab};return !!tab&&(tab.getAttribute('aria-selected')==='true'||!!tab.closest('[hidden]'))})()`)) return;
    await browser.click(tab); return;
  }
  const root = component(step.componentId);
  if (step.action === 'fill') {
    const field = `[...(${root})?.querySelectorAll('[data-field]')??[]].find(el=>el.name===${literal(step.field)})`;
    if (typeof step.value === 'boolean') await browser.evaluate(`(()=>{const el=${field};if(!el)throw Error('验收字段不存在');if(el.type==='checkbox')el.checked=${step.value};else el.value=${literal(String(step.value))};el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    else await browser.fill(field, step.value);
  } else if (step.action === 'submit') {
    // An action on one record is a button on the chosen record, not a block of its own.
    const host = await browser.evaluate<string | null>(`[...document.querySelectorAll('[data-pc-action]')].find(el=>el.dataset.pcAction===${literal(step.componentId)})?.closest('[data-component-id]')?.dataset.componentId??null`);
    if (host) {
      const record = selected.get(host); if (!record) throw new Error('要先选中「' + host + '」里的一条记录');
      const feedback = `[...document.querySelectorAll('[data-pc-feedback]')].find(el=>el.dataset.pcFeedback===${literal(step.componentId)})`;
      await browser.evaluate(`(()=>{const el=${feedback};if(el){el.className='';el.textContent='';}})()`);
      await browser.click(`[...(${record})?.querySelectorAll('[data-pc-action]')??[]].find(el=>el.dataset.pcAction===${literal(step.componentId)})`);
      await browser.wait(`(()=>{const el=${feedback};if(el?.className==='pc-error')throw Error(el.textContent);return el?.className==='pc-success'})()`);
      return;
    }
    // The browser silently refuses a form with an empty required field; name the field instead of timing out.
    const empty = await browser.evaluate<string>(`[...(${root})?.querySelectorAll('form [data-field]')??[]].filter(el=>!el.checkValidity()).map(el=>el.name).join('、')`);
    if (empty) throw new Error('表单还有必填字段是空的：' + empty);
    await browser.click(`(${root})?.querySelector('[type=submit]')`);
    await browser.wait(`(()=>{const el=${root};if(el?.querySelector('.pc-error')?.textContent)throw Error(el.querySelector('.pc-error').textContent);return !!el?.querySelector('.pc-success')&& !el.querySelector('[type=submit]')?.disabled})()`);
  } else if (step.action === 'select') {
    // Ids are made at run time, so a case may name the record by the text it shows.
    const record = step.recordId !== undefined
      ? `[...(${root})?.querySelectorAll('[data-record-id]')??[]].find(el=>el.dataset.recordId===${literal(step.recordId)})`
      : `[...(${root})?.querySelectorAll('[data-record-id]')??[]].find(el=>el.innerText.includes(${literal(step.text ?? '')}))`;
    await browser.wait(`!!(${record})`);
    selected.set(step.componentId, record);
    const choose = `(${record})?.querySelector('[data-pc-select]')`;
    if (await browser.evaluate<boolean>(`!!${choose}`)) await browser.click(choose);
  }
  // Visible text is compared with whitespace collapsed: line breaks between a record's parts are layout, not content.
  else if (step.action === 'expect') await browser.wait(`${flat(root)}.includes(${literal(collapse(step.text))})||${oneRecord(root, step.text)}`);
  else if (step.action === 'expectOrder') await browser.wait(`(()=>{const t=${flat(root)};let at=-1;for(const part of ${literal(step.texts.map(collapse))}){const next=t.indexOf(part,at+1);if(next<0)return false;at=next;}return true;})()`);
  else if (step.action === 'expectAbsent') { await browser.wait('globalThis.__molisPluginPending===0&&!document.querySelector("[data-pc-pending]")'); const present = await browser.evaluate<boolean>(`${flat(root)}.includes(${literal(collapse(step.text))})||${oneRecord(root, step.text)}`); if (present) throw new Error('验收不应显示：' + step.text); }
  else if (step.action === 'expectValue') {
    const value = await browser.evaluate(`(()=>{const el=[...(${root})?.querySelectorAll('[data-field]')??[]].find(el=>el.name===${literal(step.field)});return el?.type==='checkbox'?el.checked:el?.value})()`);
    if (value !== step.value) throw new Error('字段值不符合预期：' + step.field);
  }
}

class BuilderBrowser {
  private sequence = 0;
  private session = '';
  private closed = false;
  private readonly pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void; timer: NodeJS.Timeout }>();
  private constructor(private readonly child: ChildProcess, private readonly socket: WebSocket, private readonly directory: string, private readonly signal: AbortSignal) {
    socket.on('message', raw => {
      const result = JSON.parse(String(raw)); if (!result.id) return;
      const pending = this.pending.get(result.id); if (!pending) return;
      this.pending.delete(result.id); clearTimeout(pending.timer);
      if (result.error) pending.reject(new Error(result.error.message || '浏览器命令失败')); else pending.resolve(result.result);
    });
    socket.on('close', () => this.rejectPending(new Error('验收浏览器已关闭')));
    signal.addEventListener('abort', this.abort, { once: true });
  }
  private abort = () => { void this.close(); };
  private rejectPending(error: Error) { for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(error); } this.pending.clear(); }
  static async open(signal: AbortSignal, executable?: string) {
    signal.throwIfAborted();
    const chrome = [executable, process.env.MOLIS_WORK_BUILDER_BROWSER, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium'].find((path): path is string => Boolean(path && existsSync(path)));
    if (!chrome) throw new Error('G7 需要本机 Chrome/Chromium，请安装后重试；尚未通过的界面不能发布');
    const directory = await mkdtemp(join(tmpdir(), 'molis-builder-browser-'));
    const child = spawn(chrome, ['--headless=new', '--disable-gpu', '--disable-background-networking', '--disable-component-update', '--disable-extensions', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + directory, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
    let socket: WebSocket | undefined;
    try {
      const url = await new Promise<string>((resolve, reject) => {
        let stderr = '';
        const cancel = () => { cleanup(); reject(new Error('界面验收已取消')); };
        const timer = setTimeout(() => { cleanup(); reject(new Error('验收浏览器启动超时')); }, 20_000);
        const cleanup = () => { clearTimeout(timer); signal.removeEventListener('abort', cancel); };
        signal.addEventListener('abort', cancel, { once: true });
        child.once('error', error => { cleanup(); reject(error); }); child.once('exit', () => { cleanup(); reject(new Error('验收浏览器未能启动')); });
        child.stderr!.on('data', chunk => { stderr = (stderr + String(chunk)).slice(-16_384); const found = /DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/\S+)/.exec(stderr)?.[1]; if (found) { cleanup(); resolve(found); } });
      });
      signal.throwIfAborted(); socket = new WebSocket(url); await once(socket, 'open');
      const browser = new BuilderBrowser(child, socket, directory, signal);
      const target = await browser.command<{ targetId: string }>('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await browser.command<{ sessionId: string }>('Target.attachToTarget', { targetId: target.targetId, flatten: true }); browser.session = sessionId;
      await browser.command('Page.enable'); return browser;
    } catch (error) { socket?.close(); child.kill('SIGKILL'); await rm(directory, { recursive: true, force: true }); throw error; }
  }
  command<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    this.signal.throwIfAborted(); if (this.closed) throw new Error('浏览器已关闭'); const id = ++this.sequence;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('浏览器步骤超时：' + method)); }, 30_000);
      this.pending.set(id, { resolve: value => resolve(value as T), reject, timer }); this.socket.send(JSON.stringify({ id, method, params, ...(this.session ? { sessionId: this.session } : {}) }));
    });
  }
  async evaluate<T = unknown>(expression: string): Promise<T> { const result = await this.command<{ result: { value: T }; exceptionDetails?: { text: string; exception?: { description: string } } }>('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result.value; }
  async navigate(url: string) { const parsed = new URL(url); if (parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(parsed.hostname)) throw new Error('界面验收只能打开宿主本机预览'); await this.command('Page.navigate', { url }); }
  async wait(expression: string) { await this.evaluate(`new Promise((resolve,reject)=>{const deadline=Date.now()+20000;function check(){try{if(${expression})return resolve(true)}catch(e){return reject(e)}if(Date.now()>deadline)return reject(Error('验收等待超时'));setTimeout(check,50)}check()})`); }
  async click(expression: string) {
    await this.wait(`!!(${expression})`);
    const point = await this.evaluate<{ x: number; y: number }>(`(()=>{const el=${expression};if(el.disabled)throw Error('验收操作不可用');el.scrollIntoView({block:'center'});const b=el.getBoundingClientRect();if(!b.width||!b.height)throw Error('验收目标不可见');return{x:b.x+b.width/2,y:b.y+b.height/2}})()`);
    await this.command('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 }); await this.command('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
  }
  async fill(expression: string, value: string) {
    await this.click(expression);
    const select = await this.evaluate<boolean>(`(${expression})?.tagName==='SELECT'`);
    if (select) { await this.evaluate(`(()=>{const el=${expression};el.value=${literal(value)};el.dispatchEvent(new Event('change',{bubbles:true}));})()`); return; }
    await this.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 4, commands: ['selectAll'] });
    await this.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 0 }); await this.command('Input.insertText', { text: value });
  }
  async close() {
    if (this.closed) return; this.closed = true; this.signal.removeEventListener('abort', this.abort); this.rejectPending(new Error('界面验收已结束')); this.socket.close();
    if (this.child.exitCode === null && this.child.signalCode === null) { const closed = once(this.child, 'close'); this.child.kill('SIGTERM'); const timer = setTimeout(() => this.child.kill('SIGKILL'), 2000); await closed; clearTimeout(timer); }
    await rm(this.directory, { recursive: true, force: true });
  }
}
