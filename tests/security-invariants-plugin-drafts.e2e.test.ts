import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";

test("SYS-15-D1 opaque page drafts persist through reload, reject invalid writes and stay private to each plugin", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const cognia = await pluginFrameBrowser(t, browser, "cognia");
  const todo = await pluginFrameBrowser(t, browser, "todo");
  // Observe the public host passed to the actual plugin factory; the draft broker remains production code.
  await browser.command("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.molisWorkbenchPluginFactories=new Proxy({}, {set(target,key,factory){
      target[key]=host=>{window.testPageDrafts=host.drafts;return factory(host)};return true;
    }});
  ` }, browser.sessionId);
  const open = async (name: string) => {
    await browser.navigate(() => browser.command("Page.navigate", { url: browser.origin + "/projects/" + browser.projectId + "/?openPlugin=" + name }, browser.sessionId));
    await browser.surfaceReady(name);
  };
  await open("cognia");
  await cognia.waitFor("window.testPageDrafts");
  assert.equal(await cognia.evaluate("caches.open('owner').then(()=>false,error=>error.name)"), "SecurityError");
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
