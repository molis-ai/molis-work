import assert from "node:assert/strict";
import { pluginFrameBrowser, pluginFrameInitScript } from "./fixtures/plugin-frame-browser.js";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { sendBarrier } from "./fixtures/assistant-send-journey.js";
import { pluginSurfaceClients } from "@molis-ai/molis-work-app-workbench";

test("a hung UI asset times out, retries and ignores the late first response without remounting or losing the last selection", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { evaluate, click, waitFor, command, sessionId, navigate } = browser;
  const child = await pluginFrameBrowser(t,browser,"pages");
  const sessions = new Set<string>(); let holdAsset = true;
  t.after(browser.on("Target.detachedFromTarget", params => { sessions.delete(String(params.sessionId)); }));
  await pluginFrameInitScript(t, browser, `window.reviewPagesMounts=0;
    window.molisWorkbenchPluginFactories=new Proxy({}, {set(target,key,value){target[key]=key==='pages'?(...args)=>{window.reviewPagesMounts++;return value(...args)}:value;return true}});
  `, async session => { sessions.add(session); if (holdAsset) await command("Fetch.enable", { patterns: [{ urlPattern: "*/assets/molis-work-plugins/pages.js", requestStage: "Request" }] }, session); });
  await navigate(() => command("Page.navigate", { url: browser.origin + "/projects/" + browser.projectId + "/" }, sessionId));
  await evaluate(`(() => {
    const root = document.querySelector('[data-work-surface=pages]'); root.retainedClientRoot = true;
    root.addEventListener('molis-work:select-item', event => { window.reviewLastSelection = event.detail; });
  })()`);
  await click('[data-plugin-strip] [data-plugin-id="pages"]');
  await waitFor("document.querySelector('[data-work-surface=pages]').dataset.uiClientState === 'loading'");
  await evaluate(`(() => {
    const root = document.querySelector('[data-work-surface=pages]');
    root.dispatchEvent(new CustomEvent('molis-work:select-item', { bubbles: true, detail: { itemId: 'superseded-selection' } }));
    root.dispatchEvent(new CustomEvent('molis-work:select-item', { bubbles: true, detail: { itemId: null } }));
  })()`);
  await waitFor("document.querySelector('[data-work-surface=pages]').dataset.uiClientState === 'failed'", 13_000);
  assert.equal(await evaluate("document.querySelector('[data-work-surface=pages]').inert"), false);
  assert.equal(await evaluate("document.querySelector('[data-work-surface=pages]').hasAttribute('aria-busy')"), false);
  await click('[data-work-surface=pages] [data-ui-client-retry]');
  await waitFor("document.querySelector('[data-work-surface=pages]').dataset.uiClientState === 'loading'");
  // Release both the removed first script's network request and the retry's request.
  holdAsset = false;
  await Promise.all([...sessions].map(session => command("Fetch.disable", {}, session)));
  await waitFor("document.querySelector('[data-work-surface=pages]').dataset.uiClientState === 'ready'");
  assert.equal(await child.evaluate("window.reviewPagesMounts"), 1);
  assert.deepEqual(await evaluate("window.reviewLastSelection"), { itemId: null });
  assert.equal(await evaluate("document.querySelector('[data-work-surface=pages]').retainedClientRoot"), true);
  await click('[data-plugin-strip] [data-plugin-id="home"]');
  await click('[data-plugin-strip] [data-plugin-id="pages"]');
  assert.equal(await child.evaluate("window.reviewPagesMounts"), 1);
});

test("registered clients mount on demand, retry resources and retain their original surfaces", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { evaluate, click, waitFor, command, sessionId, navigate } = browser;
  const views=Object.fromEntries(await Promise.all(pluginSurfaceClients().map(async pack=>[pack.id,await pluginFrameBrowser(t,browser,pack.id)])));
  const child=views.pages!;
  // An isolated child can request its assets before DevTools attaches; fail at the server instead.
  const handlers = browser.server.listeners("request");
  browser.server.removeAllListeners("request");
  let failEditor = true, failedRequests = 0;
  browser.server.on("request", (request, response) => {
    if (failEditor && request.url === "/assets/molis-work-pages-editor.js") {
      failedRequests++;
      response.writeHead(503); response.end();
    } else for (const handler of handlers) handler.call(browser.server, request, response);
  });
  await navigate(() => command("Page.navigate", { url: browser.origin + "/projects/" + browser.projectId + "/" }, sessionId));
  assert.equal(await evaluate("typeof window.MolisWorkPagesEditor"), "undefined");
  assert.equal(await evaluate("Object.keys(window.molisWorkbenchPluginFactories || {}).length"), 0);
  assert.ok(await evaluate<number>("document.querySelectorAll('[data-plugin-document]').length") > 10);
  await click('[data-plugin-strip] [data-plugin-id="pages"]');
  await waitFor("document.querySelector('[data-work-surface=pages] [data-ui-client-retry]')");
  assert.ok(failedRequests > 0, "the editor resource failed before the retry was offered");
  assert.equal(await evaluate("document.querySelector('[data-work-surface=pages]').inert"), false);
  failEditor = false;
  await click('[data-work-surface=pages] [data-ui-client-retry]');
  await waitFor("document.querySelector('[data-work-surface=pages]').dataset.uiClientState === 'ready'");
  assert.equal(await child.evaluate("typeof window.MolisWorkPagesEditor.mount"), "function");
  // W5-04 PG-070: every surface (Files, Git, Diff and Text Stats among them) mounts with the bundle of its own; the clients a
  // surface uses (Coding's Git and Files) load beside it, and each isolated document loads a bundle only once, retaining it when reopened.
  const loaded = (id: string) => `performance.getEntriesByType('resource').filter(entry => entry.name.endsWith('/assets/molis-work-plugins/${id}.js')).length`;
  const opened: string[] = [];
  for (const { id, bundle, assets } of pluginSurfaceClients()) {
    const link = `[data-plugin-strip] [data-plugin-id="${id}"]`;
    // Characters is a settings page; its existing dedicated browser test exercises that entry.
    if (!await evaluate(`!!document.querySelector(${JSON.stringify(link)})`)) continue;
    const root = `[data-work-surface="${id}"]`;
    // RAC-43 W5-01-HOME-STAGE-01: a Runtime view replaces its old build-time stage; both must never mount together.
    assert.equal(await evaluate(`document.querySelectorAll(${JSON.stringify(root)}).length`), 1, id);
    const view=views[id]!;
    await click(link);
    await waitFor(`document.querySelector(${JSON.stringify(root)})?.dataset.uiClientState === 'ready'`);
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(root)}).inert`), false, id);
    await evaluate(`document.querySelector(${JSON.stringify(root)}).retainedClientRoot = true`);
    await click('[data-plugin-strip] [data-plugin-id="home"]');
    await click(link);
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(root)}).retainedClientRoot`), true, id);
    assert.equal(bundle, id, `${id} has a bundle of its own`);
    assert.equal(await view.evaluate(loaded(bundle)), 1, id);
    for (const asset of assets.filter(asset => asset.startsWith("/assets/molis-work-plugins/"))) {
      assert.equal(await view.evaluate(loaded(asset.slice(asset.lastIndexOf("/") + 1, -3))), 1, `${id} loads ${asset} once`);
    }
    opened.push(id);
  }
  for (const id of ["files", "git", "diff", "text-stats"]) assert.ok(opened.includes(id), `${id}'s surface was opened with its own bundle`);
});


test("W5-02-REG-09 SYS-15-U9 the mounted Host confirms a workspace and translates failures without changing the request default", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { command, sessionId, navigate, origin, projectId } = browser;
  const child = await pluginFrameBrowser(t, browser, "coding");
  await pluginFrameInitScript(t, browser, `
    window.molisWorkbenchPluginFactories = new Proxy({}, {
      set(target, key, value) { target[key] = key === 'coding' ? host => { window.workspaceTestHost = host; return value(host); } : value; return true; }
    });
  `);
  for (const [locale, linkFailure, defaultFailure] of [["zh", "无法关联工作区", "来源操作失败"], ["en", "Unable to link workspace", "Source operation failed"]]) {
    await command("Network.setCookie", { name: "molis_work_locale", value: locale, url: origin }, sessionId);
    await navigate(() => command("Page.navigate", { url: origin + "/projects/" + projectId + "/" }, sessionId));
    await browser.click('[data-plugin-strip] [data-plugin-id="coding"]');
    await child.waitFor("!!window.workspaceTestHost");
    const operations = [
      { expression: "workspaceTestHost.workspaces.add('/confirmed/folder')", expected: linkFailure, path: "/api/host/plugin-page-workspaces", body: { operation: "add", value: "/confirmed/folder" }, confirm: true },
      { expression: "workspaceTestHost.api('/api/plugins/io.molis.work.coding/sessions', 'POST', {})", expected: defaultFailure, path: "/api/plugins/io.molis.work.coding/sessions", body: {}, confirm: false },
    ];
    for (const operation of operations) {
      const barrier = await sendBarrier(browser, [{ urlPattern: "*" + operation.path, requestStage: "Request" }]);
      try {
        await child.evaluate(`(() => { const button=document.createElement('button');button.id='workspace-test-call';button.textContent='Test Host';
          button.style.cssText='position:fixed;top:10px;left:10px;z-index:10000';button.onclick=()=>{window.workspaceResult=${operation.expression}.then(()=>({unexpected:true}),error=>({message:error.message,status:error.status}));};document.body.append(button); })()`);
        await child.click('#workspace-test-call');
        if (operation.confirm) {
          await browser.waitFor("document.querySelector('[data-page-dialog=confirm]')?.textContent.includes('/confirmed/folder')");
          await browser.click('[data-page-dialog=confirm] [type=submit]');
        }
        const request = await barrier.next();
        assert.equal(new URL(request.request.url).pathname, "/projects/" + projectId + operation.path);
        assert.deepEqual(JSON.parse(request.request.postData ?? "null"), operation.body);
        await command("Fetch.fulfillRequest", { requestId: request.requestId, responseCode: 500,
          responseHeaders: [{ name: "Content-Type", value: "application/json" }], body: Buffer.from("{}").toString("base64") }, sessionId);
        assert.deepEqual(await child.evaluate("window.workspaceResult"), { message: operation.expected, status: 500 });
        await child.evaluate("document.querySelector('#workspace-test-call').remove()");
      } finally { await barrier.close(); }
    }
  }
});
