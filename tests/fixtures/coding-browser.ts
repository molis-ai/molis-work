import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { TestContext } from "node:test";
import { openGoalBrowser } from "./goal-browser.js";
import { CODING_BOX, CODING_COMPOSER, CODING_OPEN, CODING_SEND, codingControl } from "./coding-composer.js";
import { pluginFrameBrowser, pluginFrameInitScript } from "./plugin-frame-browser.js";

export const coding = "[data-coding-workbench]";
/** The words `start()` writes into a new session's box unless given others. */
export const FIRST_WORDS = "甲会话里写了一半的任务";
/** What sets a session's next round: buttons above the box (each opens a dialog of the same name), then the composer's ＋ commands. */
export const CONTEXT = ["workspace", "goal", "writer-directories", "material", "method", "mcp", "actions", "character", "delegate"];
/** The ＋ command (its `/word`) each of the last six is offered as. */
const ADDS: Readonly<Record<string, string>> = { material: "materials", method: "methods", mcp: "mcp", actions: "actions", character: "character", delegate: "delegate" };

/**
 * The Coding surface with a switch on the page's requests. `hold.what` takes the next one of a kind: `create`, the request
 * that makes a session, or `read`, the first read (`?window=6`) of a session other than `hold.except`. It is held until
 * `hold.release()`, or with `hold.fail` answered with a 503; `hold.next` is the kind the switch takes after that one, and
 * `hold.id` the session of the read it took last (the directory marks a session current only once its read lands).
 * `fakes` answers the requests a test has no real data for (a fixed change set) with what it holds; `hold.slow` delays
 * every save (PATCH) by that many milliseconds. `before` is a script run first on every page (a capability taken away).
 */
export async function openCoding(t: TestContext, before = "") {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return null;
  const { command, sessionId, navigate, origin, projectId, homeDirectory } = browser;
  const frame = await pluginFrameBrowser(t, browser, "coding");
  const { evaluate, waitFor, click } = frame;
  if (before) await pluginFrameInitScript(t, browser, before);
  const interceptRequests = `
    window.hold={what:null,fail:false,next:null,except:'',seen:0,id:'',release:null,slow:0};window.stateReads=0;window.posts=[];window.patches=[];window.puts=[];window.fakes=[];const originalFetch=window.fetch;
    window.fetch=(input,init)=>{const path=String(input?.url||input),method=init?.method||'GET';
      if(method!=='GET')(method==='POST'?posts:method==='PATCH'?patches:puts).push({path,body:typeof init?.body==='string'?init.body:''});
      if(method==='PATCH'&&hold.slow)return new Promise(resolve=>setTimeout(resolve,hold.slow)).then(()=>originalFetch(input,init));
      const fake=fakes.find(one=>one.method===method&&path.includes(one.path));
      if(fake)return Promise.resolve(new Response(JSON.stringify(fake.body),{status:200,headers:{'content-type':'application/json'}}));
      if(method==='GET'&&path.endsWith('/api/plugins/io.molis.work.coding/state'))stateReads++;
      const read=/\\/api\\/plugins\\/io\\.molis\\.work\\.coding\\/sessions\\/([^/?]+)\\?window=6$/.exec(path);
      const create=method==='POST'&&path.endsWith('/api/plugins/io.molis.work.coding/sessions');
      const first=method==='GET'&&read&&decodeURIComponent(read[1])!==hold.except;
      if(hold.what&&(hold.what==='create'?create:first)){
        const what=hold.what,fail=hold.fail;hold.what=hold.next;hold.next=null;hold.fail=false;hold.seen++;if(read)hold.id=decodeURIComponent(read[1]);
        if(fail)return Promise.resolve(new Response(JSON.stringify({error:(what==='create'?'建会话':'第一次读取')+'失败（测试）'}),{status:503,headers:{'content-type':'application/json'}}));
        return new Promise(resolve=>{hold.release=()=>resolve(originalFetch(input,init));});
      }
      return originalFetch(input,init);};
  `;
  const workspace = join(homeDirectory, "coding-first-read");
  await mkdir(workspace, { recursive: true });
  await writeFile(join(workspace, "note.txt"), "release notes go in CHANGELOG.md\n");
  await command("Emulation.setDeviceMetricsOverride", { width: 1360, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await browser.click(".navigator-project-settings");
  await browser.waitFor("!!document.querySelector('[data-directory-panel=project-settings] [data-settings-section=workspaces]')");
  await browser.click("[data-directory-panel=project-settings] [data-settings-section=workspaces]");
  await browser.waitFor("!!document.querySelector('[data-directories-add]') && document.querySelector('[data-project-directories]')?.dataset.state==='ready'");
  await browser.evaluate(`(()=>{const node=document.querySelector('[data-directories-add] [name=path]');node.value=${JSON.stringify(workspace)};node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await browser.click("[data-directories-add] [type=submit]");
  await browser.waitFor("document.querySelector('[data-directories-inputs]').textContent.includes('coding-first-read')");
  await browser.click("[data-directories-inputs] [data-directory-row]:has([title$='/coding-first-read']) [data-act=set-output]");
  await browser.waitFor("document.querySelector('[data-directories-output] [data-directory-row] [data-text=path]')?.title.endsWith('/coding-first-read')");
  await browser.click('[data-plugin-strip] [data-plugin-id="coding"]');
  await browser.waitFor(`document.querySelector('[data-work-surface="coding"]')?.getBoundingClientRect().width > 100`);
  await browser.waitFor(`document.querySelector('[data-work-surface="coding"]')?.dataset.uiClientState === 'ready'`);
  await evaluate(interceptRequests);
  // The box is the workbench bar's (one input): what touches it runs in the top document; the page's own parts run in the frame.
  const box = `document.querySelector('${CODING_BOX}')`;
  /** Writes into the box the way typing does: the value, then the input event the composer listens to. */
  const type = (text: string) => browser.evaluate(`(()=>{const node=${box};node.value=${JSON.stringify(text)};node.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText'}));})()`);
  const current = () => evaluate<string>(`document.querySelector('${coding} [data-coding-session][aria-current=true]')?.dataset.codingSession ?? ''`);
  /** Which of the box, 发送, the way of working and the model are closed. */
  const closed = () => browser.evaluate<Record<string, boolean>>(`(()=>{const at=selector=>document.querySelector(selector);
    return {task:at(${JSON.stringify(CODING_BOX)}).disabled,send:at(${JSON.stringify(CODING_SEND)}).disabled,intent:at(${JSON.stringify(codingControl("intent"))}).disabled,model:at(${JSON.stringify(codingControl("model"))}).disabled};})()`);
  /** Presses 发送, and ⌘↵ in the box past the button (the composer's own key); then gives the page a moment. */
  const trySend = async () => {
    await browser.evaluate(`(()=>{document.querySelector('${CODING_SEND}').click();
      ${box}.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',metaKey:true,ctrlKey:true,bubbles:true,cancelable:true}));})()`);
    await new Promise(resolve => setTimeout(resolve, 500));
  };
  /** Where requests that start or steer work carried these words (a draft is saved with PATCH, not counted). */
  const sentWith = (words: string) => evaluate<string[]>(`posts.filter(one=>one.body.includes(${JSON.stringify(words)})).map(one=>one.path)`);
  /** Opens a session with words in its box (a session holding nothing is reused by「新会话」) and returns its id. */
  const start = async (words = FIRST_WORDS) => {
    await click(`${coding} [data-coding-new]`);
    await browser.waitFor(CODING_OPEN);
    await type(words);
    return current();
  };
  /** Waits until the page has read its state again (the read whose `controls()` used to open the box), and a little more. */
  const afterAStateRead = async () => {
    const reads = await evaluate<number>("stateReads");
    await waitFor(`stateReads > ${reads}`, 15_000);
    await new Promise(resolve => setTimeout(resolve, 300));
  };
  /**
   * Which of what sets the next round is closed: a button above the box that is disabled, or a ＋ command ＋ cannot be opened for or
   * does not offer now. ＋ is opened to read it and closed again.
   */
  const shut = async () => {
    const offered = await browser.evaluate<string[]>(`(()=>{const shell=document.querySelector('${CODING_COMPOSER}'),add=shell.querySelector('[data-composer-add]');
      let offered=[];if(add&&!add.disabled){add.click();offered=[...shell.querySelectorAll('[data-composer-command]')].map(row=>row.textContent);add.click();}return offered;})()`);
    const buttons = await evaluate<boolean[]>(`${JSON.stringify(CONTEXT)}.map(name=>document.querySelector('${coding} [data-coding-'+name+'-open]')?.disabled ?? true)`);
    return CONTEXT.map((name, index) => ADDS[name] ? !offered.some(text => text.includes("/" + ADDS[name])) : buttons[index]!);
  };
  /** Presses ⌘ with these keys on the page, as the shortcuts read them. */
  const press = (keys: string) => evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{${keys},ctrlKey:true,bubbles:true,cancelable:true}))`);
  /** The commands the palette offers now (⌘⇧P opens it and closes it again). */
  const offered = async () => {
    await press("key:'p',code:'KeyP',shiftKey:true");
    const shown = await evaluate<string[]>(`[...document.querySelectorAll('${coding} [data-coding-palette-list] .coding-palette-detail')].map(node=>node.textContent)`);
    await press("key:'p',code:'KeyP',shiftKey:true");
    return shown;
  };
  /** The palette's commands that set the next round: every way of working the page offers, and the rest by name. */
  const nextRound = async () => [...await browser.evaluate<string[]>(`[...document.querySelector('${codingControl("intent")}').options].filter(option=>!option.disabled).map(option=>'/'+option.value)`),
    "/materials", "/methods", "/delegate", "/model", "/workspace"];
  /** What the page saved into this session with PATCH. */
  const saved = (id: string) => evaluate<Array<Record<string, unknown>>>(`patches.filter(one=>one.path.endsWith('/sessions/'+${JSON.stringify(encodeURIComponent(id))})).map(one=>JSON.parse(one.body))`);
  /** What the service holds for this session, read past the page. */
  const stored = (id: string) => evaluate<Record<string, unknown>>(`(async()=>{const made=posts.find(one=>one.path.endsWith('/api/plugins/io.molis.work.coding/sessions')).path;
    return (await fetch(made+'/'+${JSON.stringify(encodeURIComponent(id))}+'?window=1')).json();})()`);
  /** Opens an item the way the workbench does: a session by its id, a fixed change as `coding-changeset:<session>:<run>`. */
  const openItem = (itemId: string) => evaluate(`document.querySelector('${coding}').dispatchEvent(new CustomEvent('molis-work:select-item',{detail:{itemId:${JSON.stringify(itemId)}}}))`);
  return { ...browser, ...frame, frame, owner: browser, box, type, current, closed, trySend, sentWith, start, afterAStateRead, shut, press, offered, nextRound, saved, stored, openItem };
}
