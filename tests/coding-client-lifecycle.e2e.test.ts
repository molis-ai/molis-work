import assert from "node:assert/strict";
import test from "node:test";
import { CODING_WORKBENCH_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-coding";
import { UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT } from "@molis-ai/molis-work-ui-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// W2-18-CODING-LIFETIME-01: the original global effect listener must be gone after detach/remount.
test("Coding stops hidden polling and releases every client listener before the same DOM is mounted again", { timeout: 45_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const child = await pluginFrameBrowser(t, browser, "coding");
  const { command, sessionId, evaluate, waitFor, click, navigate, origin, projectId } = browser;
  await command("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.lifecycleErrors=[];addEventListener('error',e=>lifecycleErrors.push(e.message));addEventListener('unhandledrejection',e=>lifecycleErrors.push(String(e.reason)));
    window.codingRequests=[];const originalFetch=window.fetch;
    window.fetch=(input,init)=>{const path=String(input?.url||input);if(path.includes('/api/plugins/io.molis.work.coding/'))codingRequests.push({path,method:init?.method||'GET'});return originalFetch(input,init);};
  ` }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await click('[data-plugin-strip] [data-plugin-id="coding"]');
  await waitFor("codingRequests.some(request=>request.path.endsWith('/state'))");
  await child.waitFor("document.querySelector('[data-coding-model] option')");
  await child.evaluate("window.codingRoot=document.querySelector('[data-coding-workbench]');window.codingParent=codingRoot.parentElement;window.lifecycleErrors=[];addEventListener('error',e=>lifecycleErrors.push(e.message));addEventListener('unhandledrejection',e=>lifecycleErrors.push(String(e.reason)))");
  // SYS-15-L1: hiding preserves the actual browsing context, while its polling stops.
  await evaluate("window.originalCodingFrame=document.querySelector('iframe[data-plugin-frame=coding]')");
  await click('[data-plugin-strip] [data-plugin-id="inbox"]');
  await waitFor("document.body.dataset.desktopSurface === 'inbox'");
  await pause(100);
  const hiddenReads = await evaluate<number>("codingRequests.length");
  await pause(5500);
  assert.equal(await evaluate("codingRequests.length"), hiddenReads, "hidden Coding does not keep state or review polling alive");
  await click('[data-plugin-strip] [data-plugin-id="coding"]');
  await waitFor("document.body.dataset.desktopSurface === 'coding'");
  assert.equal(await evaluate("document.querySelector('iframe[data-plugin-frame=coding]') === originalCodingFrame"), true, "the same isolated page is restored");
  await child.waitFor("!document.body.hidden");
  await waitFor(`codingRequests.length > ${hiddenReads}`);
  await child.evaluate("codingRoot.remove()"); await pause(100);
  const detachedReads = await evaluate<number>("codingRequests.length"); await pause(1200);
  assert.equal(await evaluate("codingRequests.length"), detachedReads);
  await child.evaluate(`(() => {
    codingParent.append(codingRoot);
    const mount=(${UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT})();
    const pluginId='io.molis.work.coding';
    window.remountCoding=()=>(${CODING_WORKBENCH_CLIENT_FACTORY_SCRIPT})({root:codingRoot,mountPluginClient:mount,translate:globalThis.L,pluginId,pluginRoute:path=>codingRoot.dataset.codingPrefix+'/api/plugins/'+pluginId+path,
      confirm:async()=>true,interaction:()=>{throw new Error('no card is drawn in this test');},receipts:{},workspaces:{add:async()=>({workspace_id:'none'}),select:async()=>{}},clients:{},reviews:{show:async()=>{}},openItem:()=>{}});
    remountCoding();remountCoding();
  })()`);
  await waitFor(`codingRequests.length > ${detachedReads}`);
  await child.click('[data-coding-new]');
  await waitFor("codingRequests.filter(request=>request.method==='POST'&&request.path.endsWith('/sessions')).length===1");
  await child.waitFor("document.querySelector('[data-coding-session]')");
  await pause(100);
  assert.equal(await evaluate("codingRequests.filter(request=>request.method==='POST'&&request.path.endsWith('/sessions')).length"), 1, "one user click creates one session after remount");
  const id = await child.evaluate<string>("document.querySelector('[data-coding-session]').dataset.codingSession");
  // FIX79-LIFETIME: create() already selects the detail; return through the real visible directory control.
  // That control only exists in the narrow layout (container molis-coding ≤ 760px); the default 800px window
  // gives a ~772px container, so pin a narrow window instead of depending on the browser's default size.
  await command("Emulation.setDeviceMetricsOverride", { width: 720, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await child.waitFor("document.querySelector('[data-coding-directory-back]').getClientRects().length > 0");
  await child.click('[data-coding-directory-back]');
  await child.waitFor("codingRoot.dataset.codingDetail === 'false'");
  await child.click(`[data-coding-session="${id}"]`);
  await waitFor(`codingRequests.some(request=>request.path.includes('/sessions/${id}?window=6'))`);
  await evaluate("window.effectReads=codingRequests.length");
  await evaluate(`window.dispatchEvent(new CustomEvent('molis:assistant-effect',{detail:{capability_id:'coding.sessions.update',session_id:${JSON.stringify(id)}}}))`);
  await pause(250);
  assert.equal(await evaluate(`codingRequests.slice(effectReads).filter(request=>request.path.includes('/sessions/${id}?window=1')).length`), 1, "only the live instance responds to the effect");
  await child.evaluate("codingRoot.remove()"); await pause(100);
  const absent = await evaluate<number>("codingRequests.length");
  await evaluate(`window.dispatchEvent(new CustomEvent('molis:assistant-effect',{detail:{capability_id:'coding.sessions.update',session_id:${JSON.stringify(id)}}}))`);
  await pause(200);
  assert.equal(await evaluate("codingRequests.length"), absent, "no old closure performs a request after detach");
  assert.deepEqual(await evaluate("lifecycleErrors"), []);
  assert.deepEqual(await child.evaluate("lifecycleErrors"), []);
});
