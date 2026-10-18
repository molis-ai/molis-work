import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// W2'-2 (specs/context-program §21.6): a plugin's side view is its own document. The placement events it dispatches
// reach the page through the side panel (S-30); any other event stays in the view.

const SHELF_TAB = "plugin:shelf/side";
const shelfFrame = `document.querySelector('[data-side-body="${SHELF_TAB}"] iframe')`;

test("SIDE-FWD-01 a side view's placement events reach the page; an unlisted event stays in the view", { timeout: 60_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { evaluate, waitFor, click, command, sessionId, navigate, origin, projectId } = browser;
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await click("[data-side-toggle]");
  await waitFor(`${shelfFrame}?.contentDocument?.querySelector('[data-shelf-stage-shell]')`, 10_000);
  await evaluate(`(() => {
    window.__heard = [];
    for (const name of ['molis:placement-result', 'molis:placement-request', 'molis:not-forwarded']) addEventListener(name, (event) => window.__heard.push([name, event.detail && event.detail.title]));
    const view = ${shelfFrame}.contentWindow;
    view.dispatchEvent(new view.CustomEvent('molis:placement-result', { detail: { verb: 'failed', title: '从侧栏来的', note: 'side view' } }));
    view.dispatchEvent(new view.CustomEvent('molis:not-forwarded', { detail: { title: 'never' } }));
  })()`);
  await waitFor("window.__heard.length >= 1 && document.querySelector('.placement-toast')");
  assert.match(String(await evaluate("document.querySelector('.placement-toast').textContent")), /从侧栏来的/, "the page's card shows what the side view reported");
  assert.deepEqual(await evaluate("window.__heard"), [["molis:placement-result", "从侧栏来的"]], "only the listed event crossed");
});
