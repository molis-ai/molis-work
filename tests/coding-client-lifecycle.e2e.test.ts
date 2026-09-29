import assert from "node:assert/strict";
import test from "node:test";
import { CODING_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-coding";
import { UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT } from "@molis-ai/molis-work-ui-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
  assert.deepEqual(await evaluate("lifecycleErrors"), []);
});
