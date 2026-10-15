import assert from "node:assert/strict";
import test from "node:test";
import { CODING_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-coding";
import { UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT } from "@molis-ai/molis-work-ui-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// W2-18-CODING-LIFETIME-01: the original global effect listener must be gone after detach/remount.
test("Coding stops hidden polling and releases every client listener before the same DOM is mounted again", { timeout: 45_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { command, sessionId, evaluate, waitFor, click, navigate, origin, projectId } = browser;
  await command("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.lifecycleErrors=[];addEventListener('error',e=>lifecycleErrors.push(e.message));addEventListener('unhandledrejection',e=>lifecycleErrors.push(String(e.reason)));
    window.codingRequests=[];const originalFetch=window.fetch;
    window.fetch=(input,init)=>{const path=String(input?.url||input);if(path.includes('/api/plugins/io.molis.work.coding/'))codingRequests.push({path,method:init?.method||'GET'});return originalFetch(input,init);};
  ` }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await click('[data-plugin-strip] [data-plugin-id="coding"]');
  await waitFor("codingRequests.some(request=>request.path.endsWith('/state'))");
  await waitFor("document.querySelector('[data-coding-model] option')");
  await evaluate("window.codingRoot=document.querySelector('[data-coding-workbench]');window.codingParent=codingRoot.parentElement");
  await click('[data-plugin-strip] [data-plugin-id="inbox"]');
  await waitFor("document.body.dataset.desktopSurface === 'inbox'");
  await pause(100);
  const hiddenReads = await evaluate<number>("codingRequests.length");
  await pause(5500);
  assert.equal(await evaluate("codingRequests.length"), hiddenReads, "hidden Coding does not keep state or review polling alive");
  await click('[data-plugin-strip] [data-plugin-id="coding"]');
  await waitFor("document.body.dataset.desktopSurface === 'coding'");
  await waitFor(`codingRequests.length > ${hiddenReads}`);
  await evaluate("codingRoot.remove()"); await pause(100);
  const detachedReads = await evaluate<number>("codingRequests.length"); await pause(1200);
  assert.equal(await evaluate("codingRequests.length"), detachedReads);
  await evaluate(`(() => {
    codingParent.append(codingRoot);
    const mount=(${UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT})();
    window.remountCoding=()=>(${CODING_CLIENT_FACTORY_SCRIPT})({mountPluginClient:mount,openItem:()=>{}});
    remountCoding();remountCoding();
  })()`);
  await waitFor(`codingRequests.length > ${detachedReads}`);
  await click('[data-coding-new]');
  await waitFor("codingRequests.filter(request=>request.method==='POST'&&request.path.endsWith('/sessions')).length===1");
  await waitFor("document.querySelector('[data-coding-session]')");
  await pause(100);
  assert.equal(await evaluate("codingRequests.filter(request=>request.method==='POST'&&request.path.endsWith('/sessions')).length"), 1, "one user click creates one session after remount");
  const id = await evaluate<string>("document.querySelector('[data-coding-session]').dataset.codingSession");
  // FIX79-LIFETIME: create() already selects the detail; return through the real visible directory control.
  await click('[data-coding-directory-back]');
  await waitFor("codingRoot.dataset.codingDetail === 'false'");
  await click(`[data-coding-session="${id}"]`);
  await waitFor(`codingRequests.some(request=>request.path.includes('/sessions/${id}?window=6'))`);
  await evaluate("window.effectReads=codingRequests.length");
  await evaluate(`window.dispatchEvent(new CustomEvent('molis:assistant-effect',{detail:{capability_id:'coding.sessions.update',session_id:${JSON.stringify(id)}}}))`);
  await pause(250);
  assert.equal(await evaluate(`codingRequests.slice(effectReads).filter(request=>request.path.includes('/sessions/${id}?window=1')).length`), 1, "only the live instance responds to the effect");
  await evaluate("codingRoot.remove()"); await pause(100);
  const absent = await evaluate<number>("codingRequests.length");
  await evaluate(`window.dispatchEvent(new CustomEvent('molis:assistant-effect',{detail:{capability_id:'coding.sessions.update',session_id:${JSON.stringify(id)}}}))`);
  await pause(200);
  assert.equal(await evaluate("codingRequests.length"), absent, "no old closure performs a request after detach");
  assert.deepEqual(await evaluate("lifecycleErrors"), []);
});
