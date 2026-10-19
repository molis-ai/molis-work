import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// specs/ai-interaction-experience AC-05: what a person writes stays with the session it was written in. After「新会话」is
// pressed, the composer takes nothing until the new session is made and its first read has put its own draft and next-round
// settings in: the box still shows the session before it, and what is typed or sent then would land in the wrong one, or be
// wiped when the read lands.

const coding = "[data-coding-workbench]";
const FIRST_WORDS = "甲会话里写了一半的任务";

/**
 * The Coding surface with a switch on the page's requests. `hold.what` takes the next one of a kind: `create`, the request
 * that makes a session, or `read`, the first read (`?window=6`) of a session other than `hold.except`. It is held until
 * `hold.release()`, or with `hold.fail` answered with a 503.
 */
async function openCoding(t: TestContext) {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return null;
  const { command, sessionId, evaluate, waitFor, click, navigate, origin, projectId, homeDirectory } = browser;
  await command("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.hold={what:null,fail:false,except:'',seen:0,release:null};window.stateReads=0;window.posts=[];window.patches=[];const originalFetch=window.fetch;
    window.fetch=(input,init)=>{const path=String(input?.url||input),method=init?.method||'GET';
      if(method==='POST'||method==='PATCH')(method==='POST'?posts:patches).push({path,body:typeof init?.body==='string'?init.body:''});
      if(method==='GET'&&path.endsWith('/api/plugins/io.molis.work.coding/state'))stateReads++;
      const read=/\\/api\\/plugins\\/io\\.molis\\.work\\.coding\\/sessions\\/([^/?]+)\\?window=6$/.exec(path);
      const create=method==='POST'&&path.endsWith('/api/plugins/io.molis.work.coding/sessions');
      const first=method==='GET'&&read&&decodeURIComponent(read[1])!==hold.except;
      if(hold.what&&(hold.what==='create'?create:first)){
        const what=hold.what;hold.what=null;hold.seen++;
        if(hold.fail)return Promise.resolve(new Response(JSON.stringify({error:(what==='create'?'建会话':'第一次读取')+'失败（测试）'}),{status:503,headers:{'content-type':'application/json'}}));
        return new Promise(resolve=>{hold.release=()=>resolve(originalFetch(input,init));});
      }
      return originalFetch(input,init);};
  ` }, sessionId);
  const workspace = join(homeDirectory, "coding-first-read");
  await mkdir(workspace, { recursive: true });
  await writeFile(join(workspace, "note.txt"), "release notes go in CHANGELOG.md\n");
  await command("Emulation.setDeviceMetricsOverride", { width: 1360, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await click(".navigator-project-settings");
  await waitFor("!!document.querySelector('[data-directory-panel=project-settings] [data-settings-section=workspaces]')");
  await click("[data-directory-panel=project-settings] [data-settings-section=workspaces]");
  await waitFor("!!document.querySelector('[data-project-workspaces-add]') && !document.querySelector('[data-project-workspaces-refresh]').disabled");
  await evaluate(`(()=>{const node=document.querySelector('[data-project-workspaces-add] [name=path]');node.value=${JSON.stringify(workspace)};node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await click("[data-project-workspaces-add] [type=submit]");
  await waitFor("document.querySelector('[data-project-workspaces-list]').textContent.includes('coding-first-read')");
  await click('[data-plugin-strip] [data-plugin-id="coding"]');
  await waitFor(`document.querySelector('[data-work-surface="coding"]')?.getBoundingClientRect().width > 100`);
  const box = `document.querySelector('${coding} [data-coding-task]')`;
  /** Writes into the box the way typing does: the value, then the input event the page listens to. */
  const type = (text: string) => evaluate(`(()=>{const node=${box};node.value=${JSON.stringify(text)};node.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const current = () => evaluate<string>(`document.querySelector('${coding} [data-coding-session][aria-current=true]')?.dataset.codingSession ?? ''`);
  /** Which of the box, 发送, the way of working and the model are closed. */
  const closed = () => evaluate<Record<string, boolean>>(`Object.fromEntries(['task','send','intent','model'].map(name=>[name,document.querySelector('${coding} [data-coding-'+name+']').disabled]))`);
  /** Presses 发送 and submits the form itself, as ⌘↵ does (`requestSubmit`, past the button); then gives the page a moment. */
  const trySend = async () => {
    await evaluate(`document.querySelector('${coding} [data-coding-send]').click();document.querySelector('${coding} [data-coding-composer]').requestSubmit()`);
    await new Promise(resolve => setTimeout(resolve, 500));
  };
  /** Where requests that start or steer work carried these words (a draft is saved with PATCH, not counted). */
  const sentWith = (words: string) => evaluate<string[]>(`posts.filter(one=>one.body.includes(${JSON.stringify(words)})).map(one=>one.path)`);
  /** Opens a session with words in its box (a session holding nothing is reused by「新会话」) and returns its id. */
  const start = async () => {
    await click(`${coding} [data-coding-new]`);
    await waitFor(`!${box}.disabled`);
    await type(FIRST_WORDS);
    return current();
  };
  /** Waits until the page has read its state again (the read whose `controls()` used to open the box), and a little more. */
  const afterAStateRead = async () => {
    const reads = await evaluate<number>("stateReads");
    await waitFor(`stateReads > ${reads}`, 15_000);
    await new Promise(resolve => setTimeout(resolve, 300));
  };
  return { ...browser, box, type, current, closed, trySend, sentWith, start, afterAStateRead };
}

const ALL_CLOSED = { task: true, send: true, intent: true, model: true };

test("AC-05: while「新会话」is being made, the composer of the session shown takes and sends nothing; then the new session's box opens empty", { timeout: 90_000 }, async t => {
  const opened = await openCoding(t); if (!opened) return;
  const { click, evaluate, waitFor, box, type, current, closed, trySend, sentWith, start, afterAStateRead } = opened;
  const first = await start();

  await evaluate("hold.what='create'");
  await click(`${coding} [data-coding-new]`);
  await waitFor("hold.seen === 1 && typeof hold.release === 'function'");
  await afterAStateRead();
  assert.equal(await current(), first, "the new session is not made yet");
  assert.equal(await evaluate<string>(`${box}.value`), FIRST_WORDS);
  assert.deepEqual(await closed(), ALL_CLOSED, "what is chosen or typed now would land in the session before it");
  await trySend();
  assert.deepEqual(await sentWith(FIRST_WORDS), [], "nothing is sent while the composer is closed");

  await evaluate("hold.release()");
  await waitFor(`!${box}.disabled`);
  const second = await current();
  assert.notEqual(second, first);
  assert.equal(await evaluate<string>(`${box}.value`), "", "the new session's box holds its own (empty) draft");
  assert.deepEqual(await sentWith(FIRST_WORDS), []);
  await type("乙会话的任务");
  await new Promise(resolve => setTimeout(resolve, 1000));
  assert.equal(await evaluate<string>(`${box}.value`), "乙会话的任务", "what is typed once the box opens stays");
});

test("AC-05: until a new session's first read lands, its composer stays closed and the words of the session before it are not sent into it; then the box holds its own draft", { timeout: 90_000 }, async t => {
  const opened = await openCoding(t); if (!opened) return;
  const { click, evaluate, waitFor, box, type, current, closed, trySend, sentWith, start, afterAStateRead } = opened;
  const first = await start();

  await evaluate(`hold.except=${JSON.stringify(first)};hold.what='read'`);
  await click(`${coding} [data-coding-new]`);
  await waitFor("hold.seen === 1 && typeof hold.release === 'function'");
  await afterAStateRead();
  const second = await current();
  assert.notEqual(second, first);
  // The box still shows the first session's words: this is the moment they could have gone into the second one.
  assert.equal(await evaluate<string>(`${box}.value`), FIRST_WORDS);
  assert.deepEqual(await closed(), ALL_CLOSED, "the composer is closed while the new session's first read is on its way");
  await trySend();
  assert.deepEqual(await sentWith(FIRST_WORDS), [], "nothing carrying the first session's words is sent");

  await evaluate("hold.release()");
  await waitFor(`!${box}.disabled`);
  assert.equal(await current(), second);
  assert.equal(await evaluate<string>(`${box}.value`), "", "the new session's box holds its own (empty) draft, not the other session's words");
  assert.deepEqual(await sentWith(FIRST_WORDS), [], "the second session never received the first one's words");
  await type("乙会话的任务");
  await new Promise(resolve => setTimeout(resolve, 1000));
  assert.equal(await evaluate<string>(`${box}.value`), "乙会话的任务", "what is typed once the box opens stays");
});

test("AC-05: when a session's first read fails, the next read gives the box its draft and opens it", { timeout: 90_000 }, async t => {
  const opened = await openCoding(t); if (!opened) return;
  const { click, evaluate, waitFor, box, closed, start } = opened;
  const first = await start();

  await evaluate(`hold.except=${JSON.stringify(first)};hold.what='read';hold.fail=true`);
  await click(`${coding} [data-coding-new]`);
  await waitFor("hold.seen === 1");
  await waitFor(`document.querySelector('${coding} [data-coding-status]')?.textContent.includes('第一次读取失败')`);
  assert.equal((await closed()).task, true, "the failed read put no draft in: the box stays closed");
  // The session view reads again on its own; that read puts the draft in.
  await waitFor(`!${box}.disabled`, 15_000);
  assert.equal(await evaluate<string>(`${box}.value`), "");
});

test("AC-05: when「新会话」reuses the session shown, or making one fails, the composer opens again on the session shown", { timeout: 90_000 }, async t => {
  const opened = await openCoding(t); if (!opened) return;
  const { click, evaluate, waitFor, box, type, current, closed } = opened;
  const open = { task: false, intent: false, model: false };
  const someOpen = async () => { const { task, intent, model } = await closed(); return { task, intent, model }; };
  const made = () => evaluate<number>("posts.filter(one=>one.path.endsWith('/api/plugins/io.molis.work.coding/sessions')).length");
  const settled = `!${box}.disabled && [...document.querySelectorAll('${coding} [data-coding-new]')].every(button=>!button.disabled)`;
  await click(`${coding} [data-coding-new]`);
  await waitFor(settled);
  const first = await current(), makes = await made();

  // A session holding nothing is the one「新会话」gives back: nothing is made, and the composer is this session's again.
  await click(`${coding} [data-coding-new]`);
  await waitFor(settled);
  assert.equal(await current(), first);
  assert.equal(await made(), makes, "no session is made");
  assert.deepEqual(await someOpen(), open);

  await type(FIRST_WORDS);
  await evaluate("hold.what='create';hold.fail=true");
  await click(`${coding} [data-coding-new]`);
  await waitFor(`hold.seen === 1 && document.querySelector('${coding} [data-coding-status]')?.textContent.includes('建会话失败')`);
  await waitFor(settled);
  assert.equal(await current(), first, "making the session failed: the one shown stays");
  assert.equal(await evaluate<string>(`${box}.value`), FIRST_WORDS, "with its words");
  assert.deepEqual(await someOpen(), open);
});

test("AC-05: until a new session's first read lands, no choice saved for it carries the words of the session before it: the context buttons and the palette's materials and methods are shut, and a method dialog left open across「新会话」saves its choice without the box", { timeout: 90_000 }, async t => {
  const opened = await openCoding(t); if (!opened) return;
  const { evaluate, waitFor, box, current, start, afterAStateRead } = opened;
  const CONTEXT = ["goal", "material", "method", "mcp", "actions", "character"];
  const shut = () => evaluate<boolean[]>(`${JSON.stringify(CONTEXT)}.map(name=>document.querySelector('${coding} [data-coding-'+name+'-open]').disabled)`);
  /** Presses ⌘ with these keys on the page, as the shortcuts read them. */
  const press = (keys: string) => evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{${keys},ctrlKey:true,bubbles:true,cancelable:true}))`);
  /** The commands the palette offers now (⌘⇧P opens it and closes it again). */
  const offered = async () => {
    await press("key:'p',code:'KeyP',shiftKey:true");
    const shown = await evaluate<string[]>(`[...document.querySelectorAll('${coding} [data-coding-palette-list] .coding-palette-detail')].map(node=>node.textContent)`);
    await press("key:'p',code:'KeyP',shiftKey:true");
    return shown;
  };
  /** What the page saved into this session with PATCH. */
  const saved = (id: string) => evaluate<Array<Record<string, unknown>>>(`patches.filter(one=>one.path.endsWith('/sessions/'+${JSON.stringify(encodeURIComponent(id))})).map(one=>JSON.parse(one.body))`);
  const first = await start();

  // The method dialog opened on the first session stays open: ⌘⌥N makes the new session past it.
  await evaluate(`document.querySelector('${coding} [data-coding-method-open]').click()`);
  await waitFor(`document.querySelector('${coding} [data-coding-method-dialog]').open`);
  await evaluate(`hold.except=${JSON.stringify(first)};hold.what='read'`);
  await press("key:'n',code:'KeyN',altKey:true");
  await waitFor("hold.seen === 1 && typeof hold.release === 'function'");
  await afterAStateRead();
  const second = await current();
  assert.notEqual(second, first);
  assert.equal(await evaluate<string>(`${box}.value`), FIRST_WORDS, "the box still shows the first session's words");
  assert.deepEqual(await shut(), CONTEXT.map(() => true), "goal, materials, methods, MCP, capabilities and role wait for the new session's first read");
  const early = await offered();
  assert.ok(!early.includes("/materials") && !early.includes("/methods"), `the palette offers neither: ${early.join(" ")}`);

  assert.equal(await evaluate<boolean>(`document.querySelector('${coding} [data-coding-method-dialog]').open`), true);
  await evaluate(`document.querySelector('${coding} [data-coding-method-form]').requestSubmit()`);
  await waitFor(`!document.querySelector('${coding} [data-coding-method-dialog]').open`);
  const choice = await saved(second);
  assert.equal(choice.length, 1, "the method choice is saved to the new session");
  assert.deepEqual(choice[0]!.methods, []);
  assert.equal("draft" in choice[0]!, false, "without the box: it still holds the first session's words");

  await evaluate("hold.release()");
  await waitFor(`!${box}.disabled`);
  assert.equal(await current(), second);
  assert.equal(await evaluate<string>(`${box}.value`), "", "the new session's box holds its own (empty) draft");
  assert.ok((await saved(second)).every(body => body.draft !== FIRST_WORDS), "the first session's words were never saved as the new one's draft");
  assert.deepEqual(await shut(), CONTEXT.map(() => false));
  const later = await offered();
  assert.ok(later.includes("/materials") && later.includes("/methods"), `the palette offers both again: ${later.join(" ")}`);
});
