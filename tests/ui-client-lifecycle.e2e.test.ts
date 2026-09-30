import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { createServer, type ServerResponse } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT } from "@molis-ai/molis-work-ui-host";
import { IMAGES_CLIENT_FACTORY_SCRIPT, imagesUiContribution } from "@molis-ai/molis-work-plugin-images";
import { escapeHtml } from "@molis-ai/molis-work-design-system";
import { ChromeHarness } from "./fixtures/plugin-builder-browser.js";

async function chrome(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "ui-lifetime-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const browser = await ChromeHarness.start(directory);
  if (!browser) { t.skip("Chrome is unavailable"); return null; }
  t.after(() => browser.close());
  return browser.page();
}
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate: () => boolean) {
  for (let n = 0; n < 100; n++) { if (predicate()) return; await pause(20); }
  assert.ok(predicate(), "expected server-side observation");
}

test("UI Host owns real browser requests, timers, observers and visible SSE across hide, detach and remount", { timeout: 25_000 }, async t => {
  const page = await chrome(t); if (!page) return;
  let streams = 0, streamCloses = 0, slowStarted = 0, slowClosed = 0;
  const server = createServer((request, response) => {
    if (request.url === "/events") {
      streams++; response.writeHead(200, { "content-type": "text/event-stream" }); response.write("data: alive\n\n");
      response.on("close", () => { streamCloses++; }); return;
    }
    if (request.url === "/slow") { slowStarted++; response.on("close", () => { slowClosed++; }); return; }
    response.end('<!doctype html><section id="parent"><div id="root">current</div></section>');
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const address = server.address(); assert.ok(address && typeof address === "object");
  await page.command("Page.navigate", { url: `http://127.0.0.1:${address.port}/` });
  await page.wait("document.querySelector('#root')");
  await page.evaluate(`(() => {
    window.mount = (${UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT})();
    window.root = document.querySelector('#root'); window.parentView = document.querySelector('#parent');
    window.scope = mount(root); window.clicks = 0; window.changes = 0; window.ticks = 0; window.errors = [];
    scope.listen(window, 'lifetime-test', () => clicks++);
    scope.observe(new MutationObserver(() => changes++), root, { attributes: true });
    scope.poll(async signal => { scope.assertCurrent(signal); ticks++; }, 25);
    scope.whenVisible(() => { const source = new EventSource('/events'); return () => source.close(); });
    scope.fetch('/slow').then(() => errors.push('stale request succeeded'), error => errors.push(error.name));
  })()`);
  assert.equal(await page.evaluate("mount(root)"), null, "same mounted root cannot attach a second client");
  await until(() => streams === 1 && slowStarted === 1);
  await page.wait("ticks >= 2");
  await page.evaluate("parentView.hidden = true");
  await until(() => streamCloses === 1);
  const hiddenTicks = await page.evaluate<number>("ticks"); await pause(100);
  assert.equal(await page.evaluate("ticks"), hiddenTicks);
  await page.evaluate("parentView.hidden = false"); await until(() => streams === 2);
  await page.wait(`ticks > ${hiddenTicks}`);
  await page.evaluate("root.remove()"); await until(() => streamCloses === 2 && slowClosed === 1);
  await page.wait("errors.includes('AbortError')");
  const frozen = await page.evaluate("({ticks,changes})");
  await page.evaluate("root.setAttribute('data-after', 'dispose'); window.dispatchEvent(new Event('lifetime-test'))");
  await pause(100);
  assert.deepEqual(await page.evaluate("({ticks,changes})"), frozen);
  assert.equal(await page.evaluate("clicks"), 0);
  assert.deepEqual(await page.evaluate("errors"), ["AbortError"]);
  await page.evaluate("parentView.append(root); window.next = mount(root); next.listen(window, 'lifetime-test', () => clicks++); window.dispatchEvent(new Event('lifetime-test'))");
  assert.equal(await page.evaluate("clicks"), 1, "only the current mount handles global events");
  assert.equal(await page.evaluate("scope.alive"), false);
  await page.evaluate("next.dispose()");
  await page.evaluate("window.embed=document.createElement('iframe'); embed.src='/frame'; parentView.append(embed)");
  await page.wait("embed.contentDocument?.querySelector('#root')");
  const childBoot = `window.mount=(${UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT})();window.scope=mount(document.querySelector('#root'));scope.whenVisible(()=>{const source=new EventSource('/events');return()=>source.close();});`;
  await page.evaluate(`embed.contentWindow.eval(${JSON.stringify(childBoot)})`);
  await until(() => streams === 3);
  await page.evaluate("parentView.hidden=true"); await until(() => streamCloses === 3);
  await page.evaluate("parentView.hidden=false"); await until(() => streams === 4);
  await page.evaluate("embed.remove()"); await until(() => streamCloses === 4);

});

test("An embedded view never lends its prototypes to the page holding it: content the page renders later stays clickable", { timeout: 25_000 }, async t => {
  const page = await chrome(t); if (!page) return;
  const server = createServer((request, response) => {
    response.setHeader("content-type", "text/html");
    // Like the Plugin Builder studio: a same-origin frame on the Host lifetime that watches and handles its own view.
    if (request.url === "/studio") {
      response.end(`<!doctype html><main id="root"><p>studio</p></main><script>
        const root = document.querySelector('#root'); window.running = 0;
        window.scope = (${UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT})()(root);
        scope.whenVisible(() => { running++; return () => { running--; }; });
        scope.observe(new MutationObserver(records => records.forEach(record => record.addedNodes.length)), root, { childList: true, subtree: true });
        scope.listen(root, 'click', () => {});
      </script>`);
      return;
    }
    // The workbench's delegated handler in its strictest form: any realm-safe check passes wherever this one does.
    response.end(`<!doctype html><section id="surface"><iframe id="studio" src="/studio"></iframe></section><main id="host"></main><script>
      window.clicks = [];
      document.addEventListener('click', event => { const action = event.target instanceof Element && event.target.closest('[data-action]'); if (action) clicks.push(action.dataset.action); });
    </script>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const address = server.address(); assert.ok(address && typeof address === "object");
  await page.command("Page.navigate", { url: `http://127.0.0.1:${address.port}/` });
  await page.wait("document.querySelector('#studio').contentWindow?.scope?.visible === true");
  // Chrome shares one record among a mutation's observers, wrapped in the realm of the first one called (the oldest).
  // Scripts the page starts after the frame mounted (the side panel, a dialog) read the nodes those records add.
  await page.evaluate("new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => node.nodeType))).observe(document.documentElement, { childList: true, subtree: true })");
  await page.evaluate(`document.querySelector('#host').innerHTML = '<button data-action="handback">交还</button>';
    document.body.insertAdjacentHTML('beforeend', '<button data-action="body">直接放在 body 下</button>')`);
  await pause(60);
  assert.deepEqual(await page.evaluate("[...document.querySelectorAll('[data-action]')].map(node => Object.getPrototypeOf(node) === HTMLButtonElement.prototype)"), [true, true],
    "nodes the page renders keep the page's own prototypes");
  await page.click('[data-action="handback"]'); await page.click('[data-action="body"]');
  assert.deepEqual(await page.evaluate("clicks"), ["handback", "body"], "delegated handlers see both clicks");
  // The frame still shares the page's visibility and lifetime.
  await page.evaluate("document.querySelector('#surface').hidden = true");
  await page.wait("document.querySelector('#studio').contentWindow.running === 0");
  await page.evaluate("document.querySelector('#surface').hidden = false");
  await page.wait("document.querySelector('#studio').contentWindow.running === 1");
  await page.evaluate("window.studioScope = document.querySelector('#studio').contentWindow.scope; document.querySelector('#studio').remove()");
  assert.equal(await page.evaluate("studioScope.signal.aborted"), true, "removing the frame disposes its client");
});

test("Images uses Host lifetime: hidden views stop polling, reopening refreshes, and late detached responses cannot replace current rows", { timeout: 30_000 }, async t => {
  const page = await chrome(t); if (!page) return;
  let reads = 0, block = false, pending: ServerResponse | undefined, aborted = 0;
  const job = { id: "current", status: "running", prompt: "服务器上的当前记录", created_at: "2026-09-28T00:00:00Z", images: [], connection_name: "fixture", model: "fixture" };
  const body = imagesUiContribution.render({ contribution_id: imagesUiContribution.descriptor.contribution_id, surface: "workbench", model: { primitives: { escape: escapeHtml, text: text => text } } });
  const server = createServer((request, response) => {
    response.setHeader("content-type", request.url === "/" ? "text/html" : "application/json");
    if (request.url === "/api/images/jobs") {
      reads++;
      if (block) { pending = response; response.on("close", () => { aborted++; }); return; }
      response.end(JSON.stringify({ jobs: [job] })); return;
    }
    if (request.url === "/api/images/connections") { response.end(JSON.stringify({ connections: [], auth_connections: [] })); return; }
    response.end(`<!doctype html><section id="parent" hidden>${body}</section><script>
      window.molisWorkControlHeaders = () => ({});
      window.mount = (${UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT})();
      window.boot = () => (${IMAGES_CLIENT_FACTORY_SCRIPT})({ mountPluginClient: mount, translate: x => x, route: x => x, projectId: () => 'project' });
      window.root = document.querySelector('[data-images=workbench]'); root.hidden = false; boot();
    </script>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const address = server.address(); assert.ok(address && typeof address === "object");
  await page.command("Page.navigate", { url: `http://127.0.0.1:${address.port}/` });
  await page.wait("window.boot && window.root");
  assert.equal(reads, 0, "hidden initial mount does not fetch progress");
  await page.evaluate("document.querySelector('#parent').hidden = false");
  await page.wait("document.querySelector('[data-images-job]')?.textContent.includes('服务器上的当前记录')");
  await until(() => reads === 1);
  await page.evaluate("boot(); boot(); document.querySelector('#parent').hidden = true");
  await pause(2700); assert.equal(reads, 1, "hidden ancestor stops the existing polling timer");
  await page.evaluate("document.querySelector('#parent').hidden = false");
  await until(() => reads === 2);
  block = true;
  await page.click('[data-images-refresh]'); await until(() => pending !== undefined);
  await page.evaluate("root.remove()"); await until(() => aborted === 1);
  block = false;
  await page.evaluate("document.querySelector('#parent').append(root); boot()");
  await until(() => reads === 4);
  pending!.end(JSON.stringify({ jobs: [{ ...job, id: "stale", prompt: "过期响应" }] }));
  await pause(100);
  assert.equal(await page.evaluate("document.querySelector('[data-images-rows]').textContent.includes('过期响应')"), false);
  await page.click('[data-images-refresh]'); await until(() => reads === 5);
  await pause(100); assert.equal(reads, 5, "reused DOM has exactly one current click listener");
  await page.evaluate("root.remove()"); await pause(2700); assert.equal(reads, 5);
});
