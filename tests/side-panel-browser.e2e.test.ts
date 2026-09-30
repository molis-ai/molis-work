import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { BrowserHost, type BrowserListener, type BrowserPage } from "../apps/local-host/dist/browser/browser-host.js";
import { createBrowserSurfaceDriver } from "../apps/local-host/dist/browser/surface-driver.js";
import { locateBrowser } from "../apps/local-host/dist/browser/locate.js";
import type { BrowserPageState } from "@molis-ai/molis-work-contracts/services/browser";

/*
 * The side panel's browser on a real local Chrome (specs/side-panel P2, P5): what the person sees and drives, and what
 * the Assistant's driver sees and does, on one page. Skipped when this machine has no Chrome-family browser.
 */

const PAGE = `<!doctype html><html><head><title>侧栏测试页</title></head><body style="margin:0;font:16px sans-serif">
  <main><h1>订单填写</h1><p>请填写邮箱后提交。</p>
  <label>邮箱 <input id="email" autocomplete="email"></label>
  <label>密码 <input id="pw" type="password" value="secret-value"></label>
  <button id="send" style="position:absolute;left:40px;top:200px;width:120px;height:40px" onclick="document.getElementById('state').textContent='已提交：'+document.getElementById('email').value">提交</button>
  <p id="state">未提交</p>
  <button id="popup" style="position:absolute;left:40px;top:260px;width:120px;height:40px" onclick="window.open('/second','_blank')">打开新窗口</button>
  <button id="alert" style="position:absolute;left:40px;top:320px;width:120px;height:40px" onclick="alert('确认一下')">提示</button>
  </main></body></html>`;

function serve(page = PAGE): Promise<{ server: Server; origin: string }> {
  const server = createServer((request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(request.url === "/second" ? "<!doctype html><title>新窗口</title><p>第二个页面</p>" : page);
  });
  return new Promise(resolve => server.listen(0, "127.0.0.1", () => {
    const address = server.address(); if (!address || typeof address === "string") throw new Error("no address");
    resolve({ server, origin: `http://127.0.0.1:${address.port}` });
  }));
}

async function until<T>(read: () => T | Promise<T>, done: (value: T) => boolean, what: string, ms = 15_000): Promise<T> {
  const deadline = Date.now() + ms;
  for (;;) {
    const value = await read();
    if (done(value)) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}: ${JSON.stringify(value)}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

const centre = async (page: BrowserPage, selector: string) => {
  const raw = await page.evaluate(`JSON.stringify((() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })())`);
  return JSON.parse(String(raw)) as { x: number; y: number };
};

test("the side panel browser shows and drives a real page, and the Assistant's driver acts on the same page within its bounds", { skip: !locateBrowser() && "no Chrome-family browser on this machine", timeout: 120_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "side-panel-browser-"));
  const site = await serve();
  const forbidden = await serve("<!doctype html><title>本机服务</title><p>控制令牌在这里</p>");
  const browsers = new BrowserHost({ homeDirectory: home, forbiddenOrigins: () => [forbidden.origin] });
  let state: BrowserPageState | null = null;
  let frames = 0;
  const listener: BrowserListener = { state: next => { state = next; }, frame: () => { frames += 1; } };
  try {
    const page = browsers.page("p1");
    page.attach(listener, { width: 800, height: 600, dpr: 1 });
    await until(() => state?.status, status => status === "ready", "the page to start");

    // Before any site: Prologue's blank browser page, which the Assistant can look at and open a site from.
    const blank = createBrowserSurfaceDriver(page, () => false);
    assert.equal(await blank.scope(), "about:blank");
    assert.match(new TextDecoder().decode(await blank.observe("accessibility-tree")), /空白页[\s\S]*navigate/u);
    await blank.close();

    await page.navigate(`${site.origin}/`);
    await until(() => state, value => !!value && value.title === "侧栏测试页" && !value.loading, "the test page");
    assert.equal(state!.origin, site.origin);
    await until(() => frames, count => count > 0, "a screencast frame");

    // The person clicks and types through CDP input, as the panel sends it.
    const email = await centre(page, "#email");
    await page.input({ type: "mouse", event: "down", x: email.x, y: email.y, button: "left", buttons: 1, click_count: 1, modifiers: 0 });
    await page.input({ type: "mouse", event: "up", x: email.x, y: email.y, button: "left", buttons: 0, click_count: 1, modifiers: 0 });
    await page.input({ type: "text", text: "me@example.com" });
    assert.equal(await page.evaluate("document.getElementById('email').value"), "me@example.com");

    // What 交给助理 takes: the page's own readable text, with its source.
    const capture = await page.capture();
    assert.equal(capture.origin, site.origin);
    assert.match(capture.text, /订单填写[\s\S]*请填写邮箱后提交/u);
    assert.equal(capture.selection, false);

    // The Assistant's view: actionable elements with the centres it clicks.
    const driver = createBrowserSurfaceDriver(page, origin => origin === "https://blocked.example");
    assert.equal(await driver.scope(), site.origin);
    const outline = new TextDecoder().decode(await driver.observe("accessibility-tree"));
    assert.match(outline, /button「提交」 @\(100,220\)/u, outline);
    assert.doesNotMatch(outline, /secret-value/u, "a password's value never enters the outline");
    assert.equal(state!.control.mode, "assistant", "looking shows in the panel");
    await driver.perform({ what: "pointer", x: 100, y: 220, button: "left", clicks: 1 }, { session_id: "s1" });
    assert.equal(await page.evaluate("document.getElementById('state').textContent"), "已提交：me@example.com");
    assert.match(state!.control.activity?.summary ?? "", /点击「提交」/u);

    // Screenshots leave only as the driver's own covered ones.
    const shot = await driver.observe("screenshot");
    assert.deepEqual([...shot.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
    assert.equal(driver.masked(shot), true);
    assert.equal(driver.masked(new Uint8Array([1, 2, 3])), false);
    assert.equal(await page.evaluate("!!document.getElementById('__molis_side_mask')"), false, "the cover is removed after the capture");

    // The person takes over: from then on the driver refuses; handing back lets it act again.
    page.setControl({ mode: "taken-over", work_id: "s1", activity: null });
    await assert.rejects(driver.perform({ what: "wait", ms: 10 }, { session_id: "s1" }), /用户已接手/u);
    page.setControl({ mode: "person", work_id: null, activity: null });
    await driver.perform({ what: "key", keys: ["Tab"] }, { session_id: "s1" });

    // A window the page opens stacks over it; closing it returns to the page below.
    const popup = await centre(page, "#popup");
    await page.input({ type: "mouse", event: "down", x: popup.x, y: popup.y, button: "left", buttons: 1, click_count: 1, modifiers: 0 });
    await page.input({ type: "mouse", event: "up", x: popup.x, y: popup.y, button: "left", buttons: 0, click_count: 1, modifiers: 0 });
    await until(() => state, value => !!value && value.popup_depth === 1 && value.title === "新窗口", "the popup to show");
    await page.closePopup();
    await until(() => state, value => !!value && value.popup_depth === 0 && value.title === "侧栏测试页", "back on the page");

    // A page dialog waits for the person in the panel.
    const alertButton = await centre(page, "#alert");
    await page.input({ type: "mouse", event: "down", x: alertButton.x, y: alertButton.y, button: "left", buttons: 1, click_count: 1, modifiers: 0 });
    void page.input({ type: "mouse", event: "up", x: alertButton.x, y: alertButton.y, button: "left", buttons: 0, click_count: 1, modifiers: 0 });
    const dialog = (await until(() => state, value => !!value?.dialog, "the dialog")).dialog!;
    assert.equal(dialog.message, "确认一下");
    await page.answerDialog(dialog.id, true);
    await until(() => state, value => !value?.dialog, "the dialog to close");

    // Only web addresses; never the local Host itself.
    await page.navigate("file:///etc/passwd");
    assert.equal(state!.problem?.code, "page.blocked_scheme");
    await page.navigate(`${forbidden.origin}/`);
    await until(() => state, value => !!value && !value.loading, "the blocked load to settle");
    assert.equal(await page.evaluate("document.body.innerText.includes('控制令牌在这里')"), false, "the forbidden origin's page never loaded");
    assert.notEqual(state!.title, "本机服务");
    assert.equal(state!.problem?.code, "page.load_failed");

    // A site the person blocked is not even looked at.
    const blocking = createBrowserSurfaceDriver(page, () => true);
    await page.navigate(`${site.origin}/`);
    await until(() => state, value => !!value && value.title === "侧栏测试页" && !value.loading, "the test page again");
    await assert.rejects(blocking.observe("dom"), /禁止/u);
  } finally {
    await browsers.close();
    site.server.close(); forbidden.server.close();
    await rm(home, { recursive: true, force: true });
  }
});
