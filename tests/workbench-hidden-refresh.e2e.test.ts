import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

test("hidden Workbench pane stops global cursor reads and refreshes on return", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { command, sessionId, navigate, evaluate, waitFor, origin, projectId } = browser;
  await command("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.cursorReads=0;const originalFetch=window.fetch;
    window.fetch=(url,init)=>{if(String(url?.url||url).includes('/api/board/cursor'))window.cursorReads++;return originalFetch(url,init);};
  ` }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + '/projects/' + projectId + '/?desktop=1' }, sessionId));
  await waitFor("!!document.querySelector('[data-tab-workspace]')", 15_000);
  // W4-10: the board's 4-second change check runs on the Goal stage only; a pane on another plugin does not repeat it.
  await evaluate(`(()=>{const f=document.createElement('iframe');f.id='coding-pane';f.src=${JSON.stringify(origin + '/projects/' + projectId + '/?workbenchPane=other&panePlugin=coding')};document.body.append(f);})()`);
  await waitFor("document.getElementById('coding-pane')?.contentDocument?.body?.dataset.desktopSurface === 'coding'", 20_000);
  const codingReads = await evaluate<number>("document.getElementById('coding-pane').contentWindow.cursorReads");
  await new Promise(resolve => setTimeout(resolve, 4500));
  assert.equal(await evaluate("document.getElementById('coding-pane').contentWindow.cursorReads"), codingReads, "a pane on Coding does not poll the board cursor");
  await evaluate(`(()=>{const f=document.createElement('iframe');f.id='refresh-pane';f.src=${JSON.stringify(origin + '/projects/' + projectId + '/?workbenchPane=regression&panePlugin=goals')};document.body.append(f);})()`);
  await waitFor("document.getElementById('refresh-pane')?.contentWindow?.cursorReads > 0", 20_000);
  await evaluate("document.getElementById('refresh-pane').hidden=true");
  await new Promise(resolve => setTimeout(resolve, 150));
  const count = await evaluate<number>("document.getElementById('refresh-pane').contentWindow.cursorReads");
  await new Promise(resolve => setTimeout(resolve, 4500));
  assert.equal(await evaluate("document.getElementById('refresh-pane').contentWindow.cursorReads"), count);
  await evaluate("document.getElementById('refresh-pane').hidden=false");
  await waitFor("document.getElementById('refresh-pane').contentWindow.cursorReads > " + count, 2000);
});
