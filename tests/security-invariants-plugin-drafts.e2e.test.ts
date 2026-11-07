import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser, pluginFrameInitScript } from "./fixtures/plugin-frame-browser.js";

test("SYS-15-D1 opaque page drafts persist through reload, reject invalid writes and stay private to each plugin", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const cognia = await pluginFrameBrowser(t, browser, "cognia");
  const todo = await pluginFrameBrowser(t, browser, "todo");
  // Observe the public host passed to the actual plugin factory; the draft broker remains production code.
  await pluginFrameInitScript(t, browser, `
    window.molisWorkbenchPluginFactories=new Proxy({}, {set(target,key,factory){
      target[key]=host=>{window.testPageDrafts=host.drafts;return factory(host)};return true;
    }});
  `);
  const open = async (name: string) => {
    await browser.navigate(() => browser.command("Page.navigate", { url: browser.origin + "/projects/" + browser.projectId + "/?openPlugin=" + name }, browser.sessionId));
    await browser.surfaceReady(name);
  };
  await open("cognia");
  await cognia.waitFor("window.testPageDrafts");
  assert.equal(await cognia.evaluate("(async()=>{try{await caches.open('owner');return false}catch(error){return error.name}})()"), "SecurityError");
  await cognia.evaluate("testPageDrafts.write('private-draft','content saved by Cognia')");
  assert.equal(await cognia.evaluate("testPageDrafts.read('private-draft')"), "content saved by Cognia");
  for (const [key, value] of [["", "bad"], ["x".repeat(257), "bad"]]) {
    assert.equal(await cognia.evaluate(`testPageDrafts.write(${JSON.stringify(key)},${JSON.stringify(value)}).then(()=>false,error=>error.message)`), "Draft refused");
  }
  assert.equal(await cognia.evaluate("testPageDrafts.write('private-draft','x'.repeat(16*1024*1024+1)).then(()=>false,error=>error.message)"), "Draft refused");
  assert.equal(await cognia.evaluate("testPageDrafts.read('private-draft')"), "content saved by Cognia", "a refused overwrite preserves the previous draft");
  await open("todo"); await todo.waitFor("window.testPageDrafts");
  assert.equal(await todo.evaluate("testPageDrafts.read('private-draft')"), null, "the same key cannot read another plugin's cache");
  await todo.evaluate("testPageDrafts.write('private-draft','content saved by Todo')");
  await open("cognia"); await cognia.waitFor("window.testPageDrafts");
  assert.equal(await cognia.evaluate("testPageDrafts.read('private-draft')"), "content saved by Cognia", "the owner recovers its content after the page is replaced");
  await cognia.evaluate("testPageDrafts.write('private-draft',null)");
  assert.equal(await cognia.evaluate("testPageDrafts.read('private-draft')"), null);
  await open("todo"); await todo.waitFor("window.testPageDrafts");
  assert.equal(await todo.evaluate("testPageDrafts.read('private-draft')"), "content saved by Todo", "another plugin's overwrite and deletion have no effect");
});

test("ASR-04 existing draft writes finish before account preparation and a failed save keeps the page usable", {timeout:60_000}, async t => {
  const browser=await openGoalBrowser(t,true);if(!browser)return;
  const child=await pluginFrameBrowser(t,browser,"cognia");
  await pluginFrameInitScript(t,browser,`
    window.molisWorkbenchPluginFactories=new Proxy({}, {set(target,key,factory){
      target[key]=host=>{window.testPageDrafts=host.drafts;return factory(host)};return true;
    }});
  `);
  await browser.navigate(()=>browser.command("Page.navigate",{url:browser.origin+"/projects/"+browser.projectId+"/?openPlugin=cognia"},browser.sessionId));
  await browser.surfaceReady("cognia");await child.waitFor("window.testPageDrafts");
  await browser.evaluate(`{
    window.originalDraftCacheOpen=caches.open.bind(caches);
    caches.open=async name=>{if(name.endsWith(':drafts')){window.draftGateReady=true;await new Promise(resolve=>window.releaseDraftGate=resolve);}return window.originalDraftCacheOpen(name);};
  }`);
  await child.evaluate("void testPageDrafts.write('prepared-draft','saved before revocation').then(()=>window.preparedDraftSaved=true)");
  await browser.waitFor("window.draftGateReady");
  await browser.evaluate("void molisWorkAccountTransition.prepare().then(()=>window.accountPrepared=true)");
  assert.equal(await browser.evaluate("molisWorkAccountTransition.preparing && !window.accountPrepared"),true);
  await browser.evaluate("caches.open=window.originalDraftCacheOpen;window.releaseDraftGate()");
  await browser.waitFor("window.accountPrepared");await child.waitFor("window.preparedDraftSaved");
  assert.equal(await child.evaluate("testPageDrafts.write('prepared-draft','too late').then(()=>false,()=>true)"),true);
  await browser.evaluate("molisWorkAccountTransition.resume()");
  assert.equal(await child.evaluate("testPageDrafts.read('prepared-draft')"),"saved before revocation");
  await browser.evaluate("caches.open=async()=>{throw new Error('synthetic draft save failure')}");
  assert.equal(await child.evaluate("testPageDrafts.write('prepared-draft','failed overwrite').then(()=>false,()=>true)"),true);
  assert.equal(await browser.evaluate("molisWorkAccountTransition.prepare().then(()=>false,()=>true)"),true,"a failed save cannot acknowledge preparation");
  await browser.evaluate("caches.open=window.originalDraftCacheOpen;molisWorkAccountTransition.resume()");
  await child.waitFor("!document.body.inert");
  assert.equal(await child.evaluate("testPageDrafts.read('prepared-draft')"),"saved before revocation","failed preparation preserves the last successful draft and permits reading again");
  await child.evaluate("testPageDrafts.write('prepared-draft','saved after retry')");
  await browser.evaluate("molisWorkAccountTransition.prepare()");
  await browser.evaluate("molisWorkAccountTransition.resume()");
  await child.waitFor("!document.body.inert");
  assert.equal(await child.evaluate("testPageDrafts.read('prepared-draft')"),"saved after retry");
});
