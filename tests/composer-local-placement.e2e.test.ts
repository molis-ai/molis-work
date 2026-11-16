import assert from "node:assert/strict";
import test from "node:test";
import { COMPOSER_AI_LABELS } from "./fixtures/composer-labels.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";

// B58-01/B58-03: the real frame bridge must not register a child float as the bar's new receiver.
test("B58-03: local framed AI input keeps the main bar's node, receiver, draft and delivery independent", { timeout: 120_000 }, async t => {
  const b = await openGoalBrowser(t, true); if (!b) return;
  const child = await pluginFrameBrowser(t, b, "lingguang");
  await b.navigate(() => b.command("Page.navigate", { url: `${b.origin}/projects/${b.projectId}/` }, b.sessionId));
  await b.click('[data-plugin-picker-popover] [data-plugin-id="lingguang"]');
  await child.waitFor("window.molisComposer && !document.querySelector('[data-work-surface=lingguang]').hidden");
  await child.evaluate(`(() => {
    const labels = ${JSON.stringify(COMPOSER_AI_LABELS)};
    globalThis.placementSeen = { main: [], child: [], drafts: {main:'', child:''} };
    globalThis.placementMount = (key, placement, root) => window.molisComposer(root, {
      kind: 'ai', entry: key, placement, labels, sources: false,
      receiver: () => ({label: key}),
      draft: {adapter: {read: async () => placementSeen.drafts[key], write: async text => { placementSeen.drafts[key] = text; }}},
      submit: async input => { placementSeen[key].push(input.text); return {state:'sent'}; }
    });
    const main = document.createElement('div'); main.id = 'placement-main'; document.body.prepend(main);
    placementMount('main', undefined, main);
  })()`);
  const bar = "document.querySelector('[data-assistant-island]')";
  await b.waitFor(`${bar}.dataset.receiver === 'page' && ${bar}.querySelector('.mw-composer__to').textContent.includes('main')`);
  await b.evaluate(`globalThis.keptBarField = ${bar}.querySelector('textarea'); keptBarField.value = 'main draft'; keptBarField.dispatchEvent(new Event('input', {bubbles:true}))`);
  await child.evaluate(`(() => { const root = document.createElement('div'); root.id = 'placement-child'; root.style.cssText='width:330px;min-height:180px'; document.body.prepend(root); globalThis.localPlacement = placementMount('child','local',root); })()`);
  await child.waitFor("globalThis.molisComposerProgram && document.querySelector('#placement-child textarea')");
  assert.deepEqual(await child.evaluate(`(() => { const root=document.getElementById('placement-child'); return [root.hasAttribute('data-composer-remote'),getComputedStyle(root).display]; })()`), [false, "block"]);
  assert.deepEqual(await b.evaluate(`[keptBarField === ${bar}.querySelector('textarea'), keptBarField.value, ${bar}.querySelector('.mw-composer__to').textContent.includes('main')]`), [true, "main draft", true]);
  await child.evaluate(`(() => { const field=document.querySelector('#placement-child textarea'); field.value='child draft'; field.dispatchEvent(new Event('input',{bubbles:true})); document.querySelector('#placement-child [data-composer-send]').click(); })()`);
  await child.waitFor("placementSeen.child.length === 1 && document.querySelector('#placement-child textarea').value === ''");
  assert.deepEqual(await child.evaluate("[placementSeen.main, placementSeen.child]"), [[], ["child draft"]]);
  assert.equal(await b.evaluate("keptBarField.value"), "main draft");
  await b.evaluate(`${bar}.querySelector('[data-composer-send]').click()`);
  await child.waitFor("placementSeen.main.length === 1");
  assert.deepEqual(await child.evaluate("[placementSeen.main, placementSeen.child]"), [["main draft"], ["child draft"]]);
  // Reusing a root follows the public mount lifetime in both directions; no hidden mirror or listener survives.
  await child.evaluate("globalThis.localPlacement = placementMount('child', undefined, document.getElementById('placement-child'))");
  await b.waitFor(`${bar}.querySelector('.mw-composer__to').textContent.includes('child')`);
  await child.evaluate("globalThis.localPlacement = placementMount('child', 'local', document.getElementById('placement-child'))");
  await child.waitFor("!document.getElementById('placement-child').hasAttribute('data-composer-remote')");
  await child.evaluate("localPlacement.destroy()");
});
