import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { COMPOSER_AI_LABELS } from "./fixtures/composer-labels.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser, pluginFrameInitScript } from "./fixtures/plugin-frame-browser.js";

// B58-01/B58-03: the real frame bridge must not register a child float as the bar's new receiver.
test("B58-03: local framed AI input keeps the main bar's node, receiver, draft and delivery independent", { timeout: 120_000 }, async t => {
  const b = await openGoalBrowser(t, true); if (!b) return;
  await pluginFrameInitScript(t, b, `
    let uiFactory;
    globalThis.localCleanupCount = 0;
    Object.defineProperty(globalThis, 'molisFrameUi', { configurable: true, get: () => uiFactory, set(factory) {
      uiFactory = () => { const ui = factory(), mount = ui.mountPluginClient;
        ui.mountPluginClient = root => { const scope = mount(root); if (!scope) return scope;
          const own = scope.own;
          scope.own = cleanup => { localCleanupCount++; let active = true;
            return own(() => { if (active) { active = false; localCleanupCount--; } cleanup(); }); };
          return scope;
        }; return ui;
      };
    } });
  `);
  const child = await pluginFrameBrowser(t, b, "lingguang");
  await b.navigate(() => b.command("Page.navigate", { url: `${b.origin}/projects/${b.projectId}/` }, b.sessionId));
  await b.click('[data-plugin-picker-popover] [data-plugin-id="lingguang"]');
  await child.waitFor("window.molisComposer && !document.querySelector('[data-work-surface=lingguang]').hidden");
  await b.evaluate(`globalThis.originalFactory=window.molisComposer; window.molisComposer=(root,options)=>{
    const handle=originalFactory(root,options); if(options.entry==='main')globalThis.mainReadyHandle=handle; return handle;
  }`);
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
    globalThis.mainPlacement = placementMount('main', undefined, main);
  })()`);
  const bar = "document.querySelector('[data-assistant-island]')";
  await b.waitFor(`${bar}.dataset.receiver === 'page' && ${bar}.querySelector('.mw-composer__to').textContent.includes('main')`);
  assert.equal(await child.evaluate("mainPlacement.ready().then(()=>true,()=>false)"), true);
  await b.evaluate("mainReadyHandle.ready=()=>new Promise(resolve=>{globalThis.releaseMainReady=resolve})");
  await child.evaluate("globalThis.remoteReady='waiting'; void mainPlacement.ready().then(()=>remoteReady='ready',()=>remoteReady='inactive')");
  await b.waitFor("globalThis.releaseMainReady");
  await child.evaluate(`(() => { const root=document.createElement('div'); document.body.prepend(root); globalThis.otherPlacement=placementMount('child',undefined,root); })()`);
  await child.waitFor("remoteReady === 'inactive'");
  await b.evaluate("releaseMainReady()");
  assert.equal(await child.evaluate("remoteReady"), "inactive", "late old binding cannot resolve a switched receiver");
  await b.evaluate("globalThis.previousMainReady=mainReadyHandle");
  await child.evaluate("otherPlacement.destroy(); mainPlacement=placementMount('main',undefined,document.getElementById('placement-main'))");
  await b.waitFor(`mainReadyHandle !== previousMainReady && ${bar}.querySelector('.mw-composer__to').textContent.includes('main')`);
  assert.equal(await child.evaluate("mainPlacement.ready().then(()=>true,()=>false)"), true);
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
  // The actual public subtask controller also stays local in a Host-managed plugin frame.
  const bundled = await build({ entryPoints: ["tests/fixtures/subtask-probe.ts"], bundle: true, write: false, format: "iife", globalName: "SubtaskProbe", platform: "browser" });
  await b.evaluate(`keptBarField.value='parent preserved'; keptBarField.dispatchEvent(new Event('input',{bubbles:true}))`);
  await child.evaluate(bundled.outputFiles[0]!.text);
  await child.evaluate("globalThis.probe = SubtaskProbe.mountProbe(); probe.handle.open('a')");
  await child.waitFor("document.querySelector('#subtask-probe textarea')?.value === 'a draft'");
  await child.evaluate("probe.fill('public child input'); probe.send()");
  await child.waitFor("probe.owner.sends.length === 1");
  await child.evaluate("probe.handle.open('b')");
  await child.waitFor("document.querySelector('#subtask-probe textarea')?.value === 'b draft'");
  assert.deepEqual(await child.evaluate("probe.owner.sends.map(x=>[x.target,x.binding,x.input.text])"), [["a", "a:1", "public child input"]]);
  assert.deepEqual(await b.evaluate(`[keptBarField === ${bar}.querySelector('textarea'), keptBarField.value, ${bar}.querySelector('.mw-composer__to').textContent.includes('main')]`), [true, "parent preserved", true]);
  await child.evaluate("probe.handle.destroy()");
  // Reusing a root follows the public mount lifetime in both directions; no hidden mirror or listener survives.
  await child.evaluate("globalThis.localPlacement = placementMount('child', undefined, document.getElementById('placement-child'))");
  await b.waitFor(`${bar}.querySelector('.mw-composer__to').textContent.includes('child')`);
  await child.evaluate("globalThis.localPlacement = placementMount('child', 'local', document.getElementById('placement-child'))");
  await child.waitFor("!document.getElementById('placement-child').hasAttribute('data-composer-remote')");
  await child.evaluate("localPlacement.destroy()");
  assert.equal(await child.evaluate("localPlacement.ready().then(()=>false,()=>true)"), true);
  // B58-03: closing a local input releases its frame-owned cleanup immediately, including repeated root reuse.
  assert.deepEqual(await child.evaluate(`(() => {
    const before = localCleanupCount, root = document.createElement('div'), counts = [];
    document.body.append(root);
    try {
      for (let n=0;n<4;n++) { const handle=placementMount('child','local',root); counts.push(localCleanupCount-before); handle.destroy(); handle.destroy(); counts.push(localCleanupCount-before); }
      return counts;
    } finally { root.remove(); }
  })()`), [1, 0, 1, 0, 1, 0, 1, 0]);
});
