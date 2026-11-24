import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { openPptStore } from "./fixtures/plugin-home-stores.js";
import { pluginFrameBrowser, pluginFrameInitScript } from "./fixtures/plugin-frame-browser.js";

// Observe the real dispatch after the registered factory has wired its handler. Never claim the request in the fixture.
const observe = `window.molisWorkbenchPluginFactories=new Proxy({}, {set(target,key,factory){
  target[key]=host=>{const result=factory(host);if(!['ppt','schedule','issues'].includes(key))return result;window.selections=[];window.selectionClicks=[];window.selectionOpens=[];
    const request=window.molisWorkRequest;
    window.molisWorkRequest=Object.assign(async(url,options)=>{const result=await request(url,options);
      if(options?.method==='POST'&&new URL(url,'http://plugin.invalid').pathname.endsWith('/open'))selectionOpens.push(url);return result;},request);
    const root=document.querySelector('[data-ppt=workbench],[data-schedule-workbench],[data-issues=workbench]');
    root.addEventListener('molis-work:select-item',event=>queueMicrotask(()=>selections.push({id:event.detail?.itemId,claimed:event.defaultPrevented})));
    root.addEventListener('click',event=>{const row=event.target.closest('[data-ppt-id],[data-schedule-row],[data-issue-id]');if(row)selectionClicks.push(row.dataset.pptId||row.dataset.scheduleTaskId||row.dataset.issueId);});
    return result;};return true;
}});`;

test("QEA-72: a normal PPT object link still uses the unclaimed row selection exactly once", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  await browser.setViewport(1440, 900);
  await pluginFrameInitScript(t, browser, observe);
  const store = openPptStore(browser.homeDirectory);
  const deck = (() => { try { return store.create({ title: "Row selection deck", project_id: browser.projectId! }); } finally { store.close(); } })();
  const child = await pluginFrameBrowser(t, browser, "ppt");
  await browser.navigate(() => browser.command("Page.navigate", { url: `${browser.origin}/projects/${browser.projectId}/?openPlugin=ppt&openRecord=${deck.id}` }, browser.sessionId));
  await child.waitFor(`document.querySelector('[data-ppt=workbench]')?.dataset.expanded==='true' && document.querySelector('[data-ppt-title]')?.value===${JSON.stringify(deck.title)}`);
  const selections = await child.evaluate<Array<{ id: string; claimed: boolean }>>("selections");
  assert.ok(selections.some(entry => entry.id === deck.id && !entry.claimed), "the real frame dispatch leaves row handling to the platform");
  assert.deepEqual(await child.evaluate("selectionClicks"), [deck.id]);
});

test("QEA-72: a normal issues object link is claimed and opens its stored object without row fallback", { timeout: 90_000 }, async t => {
  const plugin = "issues";
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  await browser.setViewport(1440, 900);
  await pluginFrameInitScript(t, browser, observe);
  const title = `Explicit ${plugin} destination`;
  const api = "/api/plugins/io.molis.work.issues";
  const made = await browser.web.post<{ id: string }>(api + "/create", { title, type: "experience", description: "Keep the destination selected by the person" });
  const read = async () => browser.web.get(api + "/read?id=" + encodeURIComponent(made.id));
  const before = await read();
  const child = await pluginFrameBrowser(t, browser, plugin);
  await browser.navigate(() => browser.command("Page.navigate", { url: `${browser.origin}/projects/${browser.projectId}/?openPlugin=${plugin}&openItem=${made.id}` }, browser.sessionId));
  const heading = "[data-issue-title]";
  await child.waitFor(`document.querySelector(${JSON.stringify(heading)})?.textContent===${JSON.stringify(title)}`);
  assert.ok((await child.evaluate<Array<{ id: string; claimed: boolean }>>("selections")).some(entry => entry.id === made.id && entry.claimed));
  assert.deepEqual(await child.evaluate("selectionClicks"), []);
  assert.deepEqual(await read(), before, "opening neither recreates nor rewrites the object");
});

test("QEA-72: a normal Schedule task link is claimed and opens without a second row click", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  await browser.setViewport(1440, 900);
  await pluginFrameInitScript(t, browser, observe);
  const api = `/projects/${browser.projectId}/api/plugins/io.molis.work.schedule`;
  const result = await browser.web.post<{ task: { task_id: string } }>(api + "/tasks", {
    title: "Direct task selection", instructions: "Read the current project", time: "10:30",
  });
  const id = result.task.task_id;
  type List = { tasks: Array<{ task_id: string; unread: boolean; updated_at: string }> };
  const before = await browser.web.get<List>(api + "/list");
  const child = await pluginFrameBrowser(t, browser, "schedule");
  await browser.navigate(() => browser.command("Page.navigate", { url: `${browser.origin}/projects/${browser.projectId}/?openPlugin=schedule&openItem=${id}` }, browser.sessionId));
  await child.waitFor(`document.querySelector('[data-schedule-detail="${id}"] h1')?.getClientRects().length>0`);
  assert.ok((await child.evaluate<Array<{ id: string; claimed: boolean }>>("selections")).some(entry => entry.id === id && entry.claimed));
  assert.deepEqual(await child.evaluate("selectionClicks"), [], "the complete handler opens the task without platform row clicks");
  await child.waitFor("selectionOpens.length===1");
  const after = await browser.web.get<List>(api + "/list");
  const withoutReadTime = (list: List) => ({ ...list, tasks: list.tasks.map(({ updated_at, ...task }) => task) });
  assert.deepEqual(withoutReadTime(after), withoutReadTime(before), "only the existing mark-read timestamp changes for this already-read task");
  assert.ok(after.tasks[0]!.updated_at >= before.tasks[0]!.updated_at);
});
