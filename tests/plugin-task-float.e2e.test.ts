import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser, pluginFrameInitScript } from "./fixtures/plugin-frame-browser.js";

test("SAI-08/11: task projections have independent grants, retain one mount, and a closed pending open never returns", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  await pluginFrameInitScript(t, browser, `globalThis.molisWorkbenchPluginFactories = new Proxy({}, { set(target, key, factory) {
    target[key] = host => { globalThis.__taskHost = host; return factory(host); }; return true;
  } });`);
  const child = await pluginFrameBrowser(t, browser, "lingguang");
  const projected = await pluginFrameBrowser(t, browser, "lingguang", undefined, '[data-work-task-float] iframe[data-plugin-frame="lingguang"]');
  await browser.navigate(() => browser.command("Page.navigate", { url: `${browser.origin}/projects/${browser.projectId}/?openPlugin=lingguang` }, browser.sessionId));
  await child.waitFor("globalThis.__taskHost?.view");
  const handlers = browser.server.listeners("request");
  let hold = false, refused = false, checks = 0; const releases: Array<() => void> = [];
  const release = () => { hold = false; for (const run of releases.splice(0)) run(); };
  t.after(release);
  browser.server.removeAllListeners("request");
  browser.server.on("request", (request, response) => {
    const run = () => { for (const handler of handlers) handler.call(browser.server, request, response); };
    if (request.url?.includes("/view-revision")) {
      if (refused) { response.writeHead(403, { "content-type": "application/json" }); response.end(JSON.stringify({ error: "scope revoked", code: "plugin.page_forbidden" })); return; }
      if (hold) { checks++; releases.push(run); return; }
    }
    run();
  });
  const begin = (target: string) => child.evaluate(`globalThis.__taskHost.view.openTask({target:${JSON.stringify(target)}}).then(()=>globalThis.__opened='${target}',e=>globalThis.__openError=e.message); true`);
  await begin("A"); await projected.waitFor("globalThis.__taskHost?.view.task?.input.target === 'A'");
  assert.equal(await projected.evaluate("Object.isFrozen(globalThis.__taskHost.view.task.input)"), true);
  const frames = await browser.evaluate<number>("document.querySelectorAll('iframe[data-plugin-frame=lingguang]').length"); assert.equal(frames, 2);
  const grants = await browser.evaluate<string[]>("[...document.querySelectorAll('[data-plugin-page]')].filter(node=>node.querySelector('iframe[data-plugin-frame=lingguang]')).map(node=>node.dataset.pluginPage)");
  assert.equal(new Set(grants).size, 2, "source and projection have independent page grants");
  await child.evaluate("globalThis.__taskHost.drafts.write('b59-cas', null)");
  await child.evaluate("globalThis.__taskHost.drafts.compareAndSwap('b59-cas', null, 'A').then(value=>globalThis.__cas=value); true");
  await projected.evaluate("globalThis.__taskHost.drafts.compareAndSwap('b59-cas', null, 'B').then(value=>globalThis.__cas=value); true");
  await child.waitFor("typeof globalThis.__cas === 'boolean'"); await projected.waitFor("typeof globalThis.__cas === 'boolean'");
  const won = [await child.evaluate<boolean>("globalThis.__cas"), await projected.evaluate<boolean>("globalThis.__cas")];
  assert.equal(won.filter(Boolean).length, 1, "the shared draft owner atomically admits one expected value across frames");
  await projected.evaluate("globalThis.__taskHost.view.task.close()");
  await browser.waitFor("!document.querySelector('[data-work-task-float]')");
  hold = true; await begin("B");
  await new Promise<void>((resolve, reject) => { const end = Date.now() + 5000; const poll = () => checks ? resolve() : Date.now() > end ? reject(new Error("grant read not reached")) : setTimeout(poll, 20); poll(); });
  await browser.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" }, browser.sessionId);
  await browser.waitFor("!document.querySelector('[data-work-task-float]')"); release();
  await child.waitFor("globalThis.__openError");
  assert.equal(await browser.evaluate("Boolean(document.querySelector('[data-work-task-float]'))"), false);
  await begin("C"); await projected.waitFor("globalThis.__taskHost.view.task.input.target === 'C'");
  assert.equal(await browser.evaluate("document.querySelectorAll('iframe[data-plugin-frame=lingguang]').length"), 2);
  refused = true; await begin("D");
  await browser.waitFor("document.querySelectorAll('iframe[data-plugin-frame=lingguang]').length === 1");
});
