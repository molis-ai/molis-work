import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";

// B58-03: exercise the real frame loader, without preloading the input program as the component board does.
test("B58-03: cold input holds immediately, rejects failed loads, and retries its original receipt", { timeout: 120_000 }, async t => {
  const b = await openGoalBrowser(t, true); if (!b) return;
  const child = await pluginFrameBrowser(t, b, "lingguang");
  await b.navigate(() => b.command("Page.navigate", { url: `${b.origin}/projects/${b.projectId}/` }, b.sessionId));
  await b.click('[data-plugin-picker-popover] [data-plugin-id="lingguang"]');
  await child.waitFor("window.molisComposer && !document.querySelector('[data-work-surface=lingguang]').hidden");
  assert.equal(await child.evaluate("Boolean(globalThis.molisComposerProgram)"), false);
  const queued: Array<{ requestId: string; session: string }> = [];
  let notify: (() => void) | undefined;
  t.after(b.on("Fetch.requestPaused", (event, session) => { queued.push({ requestId: String(event.requestId), session }); notify?.(); }));
  await child.frameCommand("Fetch.enable", { patterns: [{ urlPattern: "*/assets/molis-work-composer.js", requestStage: "Request" }] });
  const next = async () => {
    if (!queued.length) await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { notify = undefined; reject(new Error("Expected cold composer request")); }, 5000);
      notify = () => { clearTimeout(timer); notify = undefined; resolve(); };
    });
    return queued.shift()!;
  };
  const bundled = await build({ entryPoints: ["tests/fixtures/subtask-probe.ts"], bundle: true, write: false, format: "iife", globalName: "SubtaskProbe", platform: "browser" });
  await child.evaluate(bundled.outputFiles[0]!.text);
  await child.evaluate(`globalThis.probe=SubtaskProbe.mountProbe();
    probe.owner.record('a').pending={kind:'input',requestId:'original-cold',message:'Confirm',check:{id:'check',ref:'original-cold',label:'Check'}};
    probe.owner.sends.push({target:'a',binding:'a:1',input:{request_id:'original-cold',text:'a draft'}});
    probe.owner.receipts.set('original-cold','sent'); probe.handle.open('a')`);
  const first = await next();
  const field = "document.querySelector('#subtask-probe textarea')", check = "document.querySelector('#subtask-probe [data-subtask-check]')";
  await child.waitFor(`${field} && ${check}`);
  assert.deepEqual(await child.evaluate(`[${field}.disabled,document.querySelector('#subtask-probe [data-composer-send]').disabled]`), [true, true]);
  await child.evaluate(`${field}.focus()`, undefined, "person");
  await child.frameCommand("Input.insertText", { text: "must not be edited before loading" });
  assert.equal(await child.evaluate(`${field}.value`), "");
  await child.evaluate(`${check}.click()`);
  await child.waitFor("probe.owner.controls.length === 1");
  await b.command("Fetch.failRequest", { requestId: first.requestId, errorReason: "ConnectionClosed" }, first.session);
  await child.waitFor(`${check} && !${check}.disabled && ${field}.disabled`);
  assert.equal(await child.evaluate("probe.owner.record('a').draft"), "");
  await child.evaluate(`${check}.click()`);
  const retry = await next();
  assert.equal(await child.evaluate(`${field}.disabled`), true);
  await child.evaluate(`globalThis.coldRoot=document.createElement('div'); document.body.append(coldRoot);
    globalThis.coldHandle=window.molisComposer(coldRoot,{...probe.owner.source.composer(probe.owner.view('b')),placement:'local'});
    globalThis.coldResult='waiting'; coldHandle.ready().then(()=>coldResult='ready',()=>coldResult='closed'); coldHandle.destroy()`);
  await child.waitFor("coldResult === 'closed'");
  await b.command("Fetch.continueRequest", { requestId: retry.requestId }, retry.session);
  await child.waitFor(`globalThis.molisComposerProgram && !${check} && !${field}.disabled && ${field}.value === ''`);
  assert.deepEqual(await child.evaluate("[probe.owner.sends.length,probe.owner.controls.map(x=>x.action)]"), [1, ["original-cold", "original-cold"]]);
  assert.equal(await child.evaluate("coldRoot.children.length"), 0);
  // Both the loaded handle and an in-flight loader reject after destruction; no late mount owns the next root.
  await child.evaluate(`globalThis.inputHandle=window.molisComposer(document.createElement('div'), {...probe.owner.source.composer(probe.owner.view('b')),placement:'local'}); inputHandle.destroy()`);
  assert.equal(await child.evaluate("inputHandle.ready().then(()=>false,()=>true)"), true);
  await child.frameCommand("Fetch.disable");
  await child.evaluate("probe.handle.destroy()");
});
