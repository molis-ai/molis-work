import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import test from "node:test";
import { WebSocket } from "ws";

import { captureHostLog, type HostLogEntry } from "@molis-ai/molis-work-app-local-host";
import { BrowserHost, type BrowserListener, type BrowserPage } from "../apps/local-host/dist/browser/browser-host.js";
import { createBrowserSurfaceDriver } from "../apps/local-host/dist/browser/surface-driver.js";
import { locateBrowser } from "../apps/local-host/dist/browser/locate.js";
import { BROWSER_SOCKET_PATH, type BrowserClientMessage, type BrowserPageState, type BrowserServerMessage } from "@molis-ai/molis-work-contracts/services/browser";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { locateTestChrome } from "@molis-ai/molis-work-test-kit/browser";

/*
 * The side panel's browser on a real local Chrome (specs/archive/side-panel P2, P5): what the person sees and drives, and what
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

test("RAC-115: a real input protocol refusal reaches the existing socket, stays private and permits the next explicit input", { timeout: 120_000 }, async t => {
  const ui = await openGoalBrowser(t, true, undefined, null); if (!ui) return;
  const chrome = locateTestChrome(); assert.ok(chrome); assert.ok(ui.projectId);
  const home = await mkdtemp(join(tmpdir(), "browser-input-owner-"));
  const site = await serve("<!doctype html><title>RAC115 input</title><input id='probe' autofocus>");
  const browsers = new BrowserHost({ homeDirectory: home, locate: () => ({ path: chrome, name: basename(chrome) }) });
  let socket: WebSocket | undefined, restoreLog = () => {};
  try {
    const running = await browsers.browser();
    // The real server keeps its page, takeover and socket wiring; only its public browser port uses our owned process.
    t.mock.method(BrowserHost.prototype, "browser", async () => running);
    const sendCdp = running.cdp.send.bind(running.cdp);
    let pageSession: string | undefined, refuse = true, inputAttempts = 0;
    const protocolRefusals: unknown[] = [];
    const privateMethod = "Input.RAC115_PRIVATE_PROTOCOL", privateText = "RAC115 PRIVATE INPUT";
    t.mock.method(running.cdp, "send", (method: string, params: Record<string, unknown> = {}, sessionId?: string, timeoutMs?: number) => {
      if (method === "Page.navigate" && params.url === `${site.origin}/`) pageSession = sessionId;
      if (method === "Input.insertText") {
        inputAttempts++;
        if (refuse) return sendCdp(privateMethod, params, sessionId, timeoutMs).catch((error: unknown) => {
          protocolRefusals.push(error); throw error;
        });
      }
      return sendCdp(method, params, sessionId, timeoutMs);
    });
    const messages: BrowserServerMessage[] = [];
    socket = new WebSocket(ui.origin.replace(/^http/u, "ws") + BROWSER_SOCKET_PATH, { headers: { Origin: ui.origin } });
    socket.on("message", (bytes, binary) => { if (!binary) messages.push(JSON.parse(String(bytes)) as BrowserServerMessage); });
    await new Promise<void>((resolve, reject) => { socket!.once("open", () => resolve()); socket!.once("error", reject); });
    const send = (message: BrowserClientMessage) => socket!.send(JSON.stringify(message));
    send({ type: "auth", token: ui.controlToken });
    await until(() => messages.some(message => message.type === "ready"), Boolean, "authenticated browser socket");
    send({ type: "attach", project_id: ui.projectId, viewport: { width: 800, height: 600, dpr: 1 } });
    await until(() => messages.some(message => message.type === "state" && message.state.status === "ready"), Boolean, "real socket page startup");
    send({ type: "navigate", input: `${site.origin}/` });
    await until(() => messages.some(message => message.type === "state" && message.state.url === `${site.origin}/` && !message.state.loading), Boolean, "input page loaded");
    assert.ok(pageSession);
    const evaluate = async (expression: string) => {
      const result = await sendCdp("Runtime.evaluate", { expression, returnByValue: true }, pageSession) as { result: { value: unknown }; exceptionDetails?: unknown };
      assert.equal(result.exceptionDetails, undefined);
      return result.result.value;
    };
    await until(() => evaluate("!!document.getElementById('probe')"), Boolean, "input field ready");
    await evaluate("document.getElementById('probe').focus()");
    const entries: HostLogEntry[] = [];
    restoreLog = captureHostLog(entries);
    send({ type: "text", text: privateText });
    await until(() => protocolRefusals.length, count => count === 1, "actual Chrome protocol rejection");
    const refusal = protocolRefusals[0]; assert.ok(refusal instanceof Error);
    assert.equal(refusal.name, "CdpError");
    assert.ok(refusal.message.includes(privateMethod), "Chrome's original error contains private protocol details");
    const errors = () => messages.filter(message => message.type === "error");
    await until(errors, value => value.length === 1, "input failure on the existing browser socket", 5_000);
    assert.deepEqual(errors(), [{ type: "error", message: "无法确认这次输入是否完成，请检查页面。" }]);
    assert.equal(inputAttempts, 1, "no automatic retry after an uncertain input result");
    assert.equal(await evaluate("document.getElementById('probe').value"), "");
    const diagnostics = entries.filter(entry => entry.event === "input_dispatch_failed");
    assert.equal(diagnostics.length, 1);
    assert.equal(diagnostics[0]!.area, "browser"); assert.equal(diagnostics[0]!.level, "warn");
    assert.deepEqual(diagnostics[0]!.error, { name: "CdpError" });
    assert.deepEqual(diagnostics[0]!.fields, { method: "Input.insertText" });
    const exposed = JSON.stringify({ errors: errors(), diagnostics });
    for (const value of [privateText, privateMethod, site.origin, refusal.message, refusal.stack!]) {
      assert.equal(exposed.includes(value), false, "input, URL and raw protocol details stay out of errors and logs");
    }
    refuse = false;
    send({ type: "text", text: "下一次中文输入" });
    await until(() => evaluate("document.getElementById('probe').value"), value => value === "下一次中文输入", "next explicit input after recovery");
    assert.equal(inputAttempts, 2); assert.equal(errors().length, 1);
    // RAC-115: the other successful Input branches still drive the same real field through the socket.
    const point = await evaluate("(() => { const r=document.getElementById('probe').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}; })()") as { x: number; y: number };
    await evaluate("document.getElementById('probe').blur()");
    for (const event of ["down", "up"] as const) send({ type: "mouse", event, ...point, button: "left", buttons: event === "down" ? 1 : 0, click_count: 1, modifiers: 0 });
    await until(() => evaluate("document.activeElement.id"), value => value === "probe", "successful mouse focus");
    await evaluate("(() => { const e=document.getElementById('probe');e.setSelectionRange(e.value.length,e.value.length); })()");
    for (const event of ["down", "up"] as const) send({ type: "key", event, key: "ArrowLeft", code: "ArrowLeft", key_code: 37, modifiers: 0 });
    await until(() => evaluate("(() => { const e=document.getElementById('probe');return e.selectionStart===e.value.length-1; })()"), Boolean, "successful key input");
    send({ type: "compose", text: "组字" });
    await until(() => evaluate("document.getElementById('probe').value"), value => value === "下一次中文输组字入", "successful input composition");
    send({ type: "compose", text: "" });
    await until(() => evaluate("document.getElementById('probe').value"), value => value === "下一次中文输入", "composition cancellation");
    assert.equal(inputAttempts, 2); assert.equal(errors().length, 1);
    assert.equal(entries.filter(entry => entry.event === "input_dispatch_failed").length, 1);
  } finally {
    restoreLog(); t.mock.restoreAll();
    if (socket && socket.readyState !== WebSocket.CLOSED) {
      await new Promise<void>(resolve => { socket!.once("close", () => resolve()); socket!.terminate(); });
    }
    await browsers.close();
    await new Promise<void>(resolve => site.server.close(() => resolve()));
    await rm(home, { recursive: true, force: true });
  }
});

test("R5B-01/03: real page and browser process crashes retain their distinct recovery controls", { timeout: 120_000 }, async t => {
  const ui = await openGoalBrowser(t, true, undefined, null); if (!ui) return;
  await ui.command("Page.addScriptToEvaluateOnNewDocument", { source: `(() => {
    const Native=window.WebSocket;window.browserRecoveryMessages=[];
    window.WebSocket=class extends Native {constructor(...args){super(...args);if(String(args[0]).endsWith('/browser'))window.browserRecoverySocket=this;}
      send(text){if(String(this.url).endsWith('/browser'))window.browserRecoveryMessages.push(JSON.parse(text));return super.send(text);}};
  })();` }, ui.sessionId);
  await ui.navigate(() => ui.command("Page.navigate", { url: `${ui.origin}/projects/${ui.projectId}/` }, ui.sessionId));
  await ui.waitFor("window.browserRecoverySocket?.readyState===1 && document.querySelector('[data-browser]')");
  await ui.click('[data-side-tab="browser"]');
  await ui.waitFor("document.querySelector('[data-side-tab=browser]').getAttribute('aria-selected')==='true'");
  const home = await mkdtemp(join(tmpdir(), "browser-recovery-owner-")), site = await serve();
  // The test machine's Chrome (CI runs it unsandboxed): on a runner that restricts user namespaces a sandboxed renderer told to
  // crash hangs instead of dying, so the page never reports the crash (diagnosed on ubuntu-latest, 2026-10-15).
  const chrome = locateTestChrome();
  const browsers = new BrowserHost({ homeDirectory: home, locate: () => chrome ? { path: chrome, name: basename(chrome) } : locateBrowser() });
  const page = browsers.page("recovery");
  const listener: BrowserListener = { state: () => undefined, frame: () => undefined };
  let detach = () => {};
  try {
    detach = page.attach(listener, { width: 800, height: 600, dpr: 1 });
    await until(() => page.snapshot().status, value => value === "ready", "owned page startup");
    await page.navigate(site.origin);
    await until(() => page.snapshot(), value => value.url.startsWith(site.origin) && !value.loading, "owned page loaded");
    const running = await browsers.browser();
    const targets = await running.cdp.send("Target.getTargets") as { targetInfos: Array<{ targetId: string }> };
    const target = targets.targetInfos.find(row => page.owns(row.targetId)); assert.ok(target);
    const attached = await running.cdp.send("Target.attachToTarget", { targetId: target.targetId, flatten: true }) as { sessionId: string };
    const crashing = running.cdp.send("Page.crash", {}, attached.sessionId, 1_000).catch(() => undefined);
    const crashed = await until(() => page.snapshot(), value => value.problem?.code === "browser.page_crashed", "real page crash");
    await crashing;
    assert.equal(crashed.status, "crashed");
    const present = async (state: BrowserPageState, action: string) => {
      await ui.evaluate(`window.browserRecoverySocket.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({type:'state',state:${JSON.stringify(state)}})}))`);
      await ui.waitFor(`document.querySelector('[data-browser-cover-copy] [data-browser-action="${action}"]')`);
      await ui.evaluate("window.browserRecoveryMessages=[]");
      await ui.click(`[data-browser-cover-copy] [data-browser-action="${action}"]`);
      assert.equal(await ui.evaluate("window.browserRecoveryMessages.at(-1)?.type"), action, "the actual production click sends its recovery command");
    };
    await present(crashed, "reload");
    assert.equal(await ui.evaluate("document.querySelector('[data-browser-cover-copy] [data-browser-action=restart]')"), null);
    await page.reload();
    await until(() => page.snapshot(), value => value.status === "ready" && value.url.startsWith(site.origin) && !value.loading, "page reload recovery");
    assert.equal((await browsers.browser()).child.pid, running.child.pid, "page recovery retains its running browser");
    assert.ok(running.child.pid); running.child.kill("SIGTERM");
    const stopped = await until(() => page.snapshot(), value => value.problem?.code === "browser.crashed", "owned browser process exit");
    assert.equal(stopped.status, "stopped");
    await present(stopped, "restart");
    assert.equal(await ui.evaluate("document.querySelector('[data-browser-cover-copy] [data-browser-action=reload]')"), null);
    await browsers.restart();
    await until(() => page.snapshot(), value => value.status === "ready" && value.url.startsWith(site.origin) && !value.loading, "browser restart recovery");
    assert.notEqual((await browsers.browser()).child.pid, running.child.pid);
  } finally {
    detach(); await browsers.close();
    await new Promise<void>(resolve => site.server.close(() => resolve()));
    await rm(home, { recursive: true, force: true });
  }
});

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
    // On a 2x screen the person gets sharp frames, while the page and the Assistant keep CSS pixels.
    let frameWidth = 0;
    listener.frame = (bytes: Buffer) => { frames += 1;
      for (let i = 2; i < bytes.length && bytes[i] === 0xff;) { const marker = bytes[i + 1]!, length = bytes.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xc3) { frameWidth = bytes.readUInt16BE(i + 7); break; } i += 2 + length; } };
    await page.resize({ width: 800, height: 600, dpr: 2 });
    await until(() => frameWidth, width => width === 1600, "a 2x frame");
    assert.equal(await page.evaluate("devicePixelRatio"), 2);
    await page.resize({ width: 800, height: 600, dpr: 1 });

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
    const pngSize = (bytes: Uint8Array) => { const view = new DataView(bytes.buffer, bytes.byteOffset); return [view.getUint32(16), view.getUint32(20)]; };
    assert.deepEqual(pngSize(shot), [800, 600], "the Assistant's screenshot is in the CSS pixels it clicks with");
    assert.equal(driver.masked(shot), true);
    assert.equal(driver.masked(new Uint8Array([1, 2, 3])), false);
    assert.equal(await page.evaluate("!!document.getElementById('__molis_side_mask')"), false, "the cover is removed after the capture");

    // The approval card names a field by its label, and a password field's value never stands in for its name.
    assert.equal(await driver.describePoint!(email.x, email.y), "邮箱");
    const pw = await centre(page, "#pw");
    assert.equal(await driver.describePoint!(pw.x, pw.y), "密码");

    // Looking shows which work is using the page, so a takeover and its handback reach that work.
    await driver.observe("dom", { session_id: "s1" });
    assert.equal(state!.control.work_id, "s1");

    // The person takes over: from then on the driver refuses; handing back lets it act again — on a fresh look only,
    // since what it saw before may have changed under the person's hands.
    const seenBefore = await driver.identity();
    page.setControl({ mode: "taken-over", work_id: "s1", activity: null });
    await assert.rejects(driver.perform({ what: "wait", ms: 10 }, { session_id: "s1" }), /用户已接手/u);
    page.setControl({ mode: "person", work_id: null, activity: null });
    assert.notEqual(await driver.identity(), seenBefore, "an observation from before the takeover is stale afterwards");
    await driver.perform({ what: "key", keys: ["Tab"] }, { session_id: "s1" });

    // A shortcut written the Windows way still edits on macOS: select the field's text and replace it.
    await page.evaluate("document.getElementById('email').focus()");
    await driver.perform({ what: "key", keys: ["Control", "a"] }, { session_id: "s1" });
    await driver.perform({ what: "text", text: "you@example.com" }, { session_id: "s1" });
    assert.equal(await page.evaluate("document.getElementById('email').value"), "you@example.com");

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
    // R5B-01: the actual browser refuses non-Web schemes under its current owner code.
    assert.equal(state!.problem?.code, "browser.blocked_scheme");
    await page.navigate(`${forbidden.origin}/`);
    // Settled means the refusal is in: right after the navigation the previous state can still read "not loading" while the
    // document is between pages (no body yet), which is how this failed on the Linux runner.
    await until(() => state, value => !!value && !value.loading && value.problem?.code === "browser.load_failed", "the blocked load to settle");
    // After the refused load the document can still be between pages, with no body: then nothing of that page is there either.
    assert.equal(await page.evaluate("document.body?.innerText.includes('控制令牌在这里') === true"), false, "the forbidden origin's page never loaded");
    assert.notEqual(state!.title, "本机服务");
    assert.equal(state!.problem?.code, "browser.load_failed");

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

test("sign-ins last: a site's cookies survive the browser closing, and a browser left behind by a Host that stopped", { skip: !locateBrowser() && "no Chrome-family browser on this machine", timeout: 120_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "side-panel-cookies-"));
  const site = createServer((request, response) => {
    const set = /^\/set\/(\w+)$/u.exec(request.url ?? "");
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", ...(set ? { "set-cookie": `${set[1]}=kept; Max-Age=86400; Path=/` } : {}) });
    response.end(`<!doctype html><title>cookies</title><p id="c">${request.headers.cookie ?? ""}</p>`);
  });
  await new Promise<void>(resolve => site.listen(0, "127.0.0.1", resolve));
  const address = site.address(); if (!address || typeof address === "string") throw new Error("no address");
  const origin = `http://127.0.0.1:${address.port}`;
  const open = async (host: BrowserHost) => {
    let state: BrowserPageState | null = null;
    const page = host.page("p1");
    page.attach({ state: next => { state = next; }, frame: () => {} }, { width: 800, height: 600, dpr: 1 });
    await until(() => state?.status, status => status === "ready", "the page to start");
    return { page, visit: async (path: string) => { await page.navigate(`${origin}${path}`); await until(() => state, value => !!value && value.url === `${origin}${path}` && !value.loading, path); } };
  };
  const hosts: BrowserHost[] = [];
  try {
    // Closed the ordinary way: the browser is asked to quit and writes what it holds.
    const first = new BrowserHost({ homeDirectory: home }); hosts.push(first);
    await (await open(first)).visit("/set/closed");
    await first.close();
    const second = new BrowserHost({ homeDirectory: home }); hosts.push(second);
    const reopened = await open(second);
    await reopened.visit("/echo");
    assert.match(String(await reopened.page.evaluate("document.getElementById('c').textContent")), /closed=kept/u);

    // A Host that stopped without closing leaves its browser running; the next one asks it to quit before starting.
    await reopened.visit("/set/left");
    const third = new BrowserHost({ homeDirectory: home }); hosts.push(third);
    const after = await open(third);
    await after.visit("/echo");
    assert.match(String(await after.page.evaluate("document.getElementById('c').textContent")), /left=kept/u);
  } finally {
    for (const host of hosts.reverse()) await host.close().catch(() => undefined);
    site.close();
    await rm(home, { recursive: true, force: true });
  }
});

test("BROWERR-01/BROWERR-02: no installed browser refuses with its current code and original message", async () => {
  const home = await mkdtemp(join(tmpdir(), "browser-no-engine-"));
  const browsers = new BrowserHost({ homeDirectory: home, locate: () => null });
  try {
    await assert.rejects(browsers.browser(), {
      code: "browser.not_found", kind: "invalid",
      message: "没有找到可用的浏览器。请安装 Google Chrome（或 Chromium、Microsoft Edge），然后重试。",
    });
  } finally {
    await browsers.close();
    await rm(home, { recursive: true, force: true });
  }
});
