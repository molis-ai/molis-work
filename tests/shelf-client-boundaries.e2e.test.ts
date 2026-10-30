import { UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT, UI_REQUEST_CLIENT_SCRIPT } from "@molis-ai/molis-work-ui-host";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { actionErrorResponse, fillMessage } from "@molis-ai/molis-work-plugin-sdk";
import { ChromeHarness, locateTestChrome } from "@molis-ai/molis-work-test-kit/browser";
import { ShelfStore } from "../modules/shelf/dist/store.js";
import { SHELF_CLIENT_FACTORY_SCRIPT, SHELF_MESSAGES } from "@molis-ai/molis-work-plugin-shelf";
import { createShelfRouteHandlers } from "@molis-ai/molis-work-plugin-shelf";
import { SHELF_STYLES } from "@molis-ai/molis-work-plugin-shelf";
import { renderShelfWorkbench } from "@molis-ai/molis-work-plugin-shelf";
import { directShelfActions, ShelfPluginRouteTable, openTestShelfFiles } from "./shelf-direct-actions.js";

// The only stub is runtime availability, so client handoffs can be exercised
// without installing or launching an agent. Storage and HTTP handlers are real.
class FixtureShelfStore extends ShelfStore {
  override async runtime() {
    return { ...await super.runtime(), runtime_key: "fixture", executable: "/fixture/not-launched", title: "Fixture" };
  }
}

async function openShelfBrowser(t: TestContext) {
  const chrome = locateTestChrome();
  if (!chrome) { t.skip("Chrome is required for Shelf boundary E2E"); return null; }
  const home = await mkdtemp(join(tmpdir(), "shelf-client-boundaries-"));
  const shelf = new FixtureShelfStore(join(home, "shelf"), openTestShelfFiles(home));
  await shelf.admit({ filename: "目录材料.md", bytes: Buffer.from("# Shelf 专用测试页\n"), mime: "text/markdown" });
  const routes = new ShelfPluginRouteTable(createShelfRouteHandlers({ actions: directShelfActions(shelf) }));
  const requests: string[] = [];
  let delayNextRead: (() => Promise<void>) | undefined;
  let delayNextFile: (() => Promise<void>) | undefined;
  const delaySnapshot = () => {
    let ready!: () => void, release!: () => void;
    const started = new Promise<void>(resolve => { ready = resolve; });
    const wait = new Promise<void>(resolve => { release = resolve; });
    delayNextRead = () => { ready(); return wait; };
    return { started, release };
  };
  const delayFile = () => {
    const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
    delayNextFile = () => { entered.resolve(); return release.promise; };
    return { started: entered.promise, release: () => release.resolve() };
  };
  // The workbench's translator, in Chinese: a stable key's `zh` with its values filled in.
  const zh = (key: string, values?: Record<string, string | number>) => fillMessage(SHELF_MESSAGES[key as keyof typeof SHELF_MESSAGES]?.zh ?? key, values);
  const zhTable = JSON.stringify(Object.fromEntries(Object.entries(SHELF_MESSAGES).map(([key, text]) => [key, text.zh])));
  const escape = (value: unknown) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  const html = `<!doctype html><html data-resolved-theme="light"><head><meta charset="utf-8"><style>
    [hidden]{display:none!important}body{margin:0;font-family:system-ui}*{box-sizing:border-box}
    :root{--content-side:#f5f5f4;--content-paper:#fff;--content-ink:#242424;--content-muted:#777;--content-line:#ddd}
    [data-shelf=workbench]{display:grid;grid-template-columns:280px minmax(0,1fr);min-height:900px}
    ${SHELF_STYLES}</style></head><body data-desktop-surface="shelf">
    ${renderShelfWorkbench({ ...(await shelf.snapshot()), selected_id: null, primitives: { escape, text: zh } })}
    <script src="/fixture.js"></script></body></html>`;
  const script = `document.querySelector('[data-shelf=workbench]').hidden=false;
    const zhTable=${zhTable};
    window.L=(key,values)=>(${fillMessage.toString()})(zhTable[key]??key,values);
    ${UI_REQUEST_CLIENT_SCRIPT}
    window.mountShelf=(${UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT})();
    window.bootShelf=()=>(${SHELF_CLIENT_FACTORY_SCRIPT})({mountPluginClient:mountShelf,pluginId:'io.molis.work.shelf',pluginRoute:path=>'/api/plugins/io.molis.work.shelf'+path,loadMedia:async()=>null,copyText:text=>navigator.clipboard.writeText(text),translate:window.L});bootShelf();`;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url || "/", "http://localhost");
    requests.push(`${request.method} ${url.pathname}`);
    if (url.pathname === "/") { response.writeHead(200, { "content-type": "text/html; charset=utf-8" }); response.end(html); return; }
    if (url.pathname === "/fixture.js") { response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" }); response.end(script); return; }
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const bytes = Buffer.concat(chunks);
      const result = await routes.handle({ method: request.method === "POST" ? "POST" : "GET", pathname: url.pathname, query: url.searchParams, body: bytes.length ? JSON.parse(bytes.toString("utf8")) : {} });
      if (!result) { response.writeHead(404); response.end(); return; }
      if (request.method === "GET" && url.pathname === "/api/plugins/io.molis.work.shelf/" && delayNextRead) { const wait = delayNextRead; delayNextRead = undefined; await wait(); }
      if (request.method === "GET" && url.pathname.endsWith("/file") && delayNextFile) { const wait = delayNextFile; delayNextFile = undefined; await wait(); }
      response.writeHead(result.status, { "content-type": result.mime || "application/json; charset=utf-8", "cache-control": "no-store", ...result.headers });
      response.end(result.bytes ? Buffer.from(result.bytes) : JSON.stringify(result.body));
    } catch (error) {
      const failure = actionErrorResponse(error);
      response.writeHead(failure.status, { "content-type": "application/json" }); response.end(JSON.stringify(failure.body));
    }
  });
  let harness: ChromeHarness | undefined;
  t.after(async () => {
    await harness?.close();
    server.closeAllConnections();
    if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(home, { recursive: true, force: true });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const browser = await ChromeHarness.start(home, { executable: chrome, startTimeoutMs: 20_000 });
  harness = browser;
  const command = <T = unknown>(method: string, params: Record<string, unknown> = {}, sessionId?: string) => browser.command<T>(method, params, sessionId);
  const target = await command<{ targetId: string }>("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await command<{ sessionId: string }>("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  await command("Page.enable", {}, sessionId);
  const evaluate = async <T = unknown>(expression: string): Promise<T> => {
    const result = await command<{ result: { value: T }; exceptionDetails?: unknown }>("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId);
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const waitFor = (expression: string) => evaluate(`new Promise((resolve,reject)=>{const end=Date.now()+12000;
    const check=()=>{if(${expression})resolve(true);else if(Date.now()>end)reject(new Error('Condition timed out: '+${JSON.stringify(expression)}));else setTimeout(check,25)};check()})`);
  await command("Page.navigate", { url: origin }, sessionId);
  await waitFor("document.querySelector('[data-shelf-list=materials] [data-shelf-item]') && document.querySelector('[data-shelf-bar]')?.textContent.length > 0");
  return { home, shelf, requests, evaluate, waitFor, command, sessionId, delaySnapshot, delayFile };
}

test("Shelf isolated client boundaries use production UI and real file HTTP", { timeout: 90_000 }, async t => {
  const browser = await openShelfBrowser(t); if (!browser) return;
  const { shelf, home, requests, evaluate, waitFor, command, sessionId } = browser;
  await t.test("directory pointer and keyboard activation each request one file picker", async () => {
    // These DOM activations measure the bubbling contract; they do not claim a
    // native Finder gesture. The next case supplies a genuine Chrome FileList.
    await evaluate(`window.pickerClicks=0;window.preventPicker=event=>{event.preventDefault();window.pickerClicks++};
      document.querySelector('[data-shelf-file]').addEventListener('click',window.preventPicker);
      document.querySelector('[data-shelf=directory] [data-shelf-pick]').click();`);
    assert.equal(await evaluate("window.pickerClicks"), 1);
    await evaluate(`document.querySelector('[data-shelf=directory] [data-shelf-pick]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}))`);
    assert.equal(await evaluate("window.pickerClicks"), 2);
    await evaluate("document.querySelector('[data-shelf-file]').removeEventListener('click',window.preventPicker)");
  });

  const filename = "真实 picker’s.md".replace("’", "'");
  let itemId = "";
  await t.test("a real local picker file traverses production HTTP and keeps all bytes through the preview tail", async () => {
    const file = join(home, filename);
    const text = "# 真实文件选择器\n\n" + "本地 FileList 完整读入 Unicode 文本。\n".repeat(1200) + "\nPICKER_END_SENTINEL\n";
    assert.ok(text.length > 20_000);
    await writeFile(file, text);
    const document = await command<{ root: { nodeId: number } }>("DOM.getDocument", {}, sessionId);
    const input = await command<{ nodeId: number }>("DOM.querySelector", { nodeId: document.root.nodeId, selector: "[data-shelf-file]" }, sessionId);
    assert.ok(input.nodeId);
    const before = requests.filter(value => value === "POST /api/plugins/io.molis.work.shelf/items").length;
    await command("DOM.setFileInputFiles", { nodeId: input.nodeId, files: [file] }, sessionId);
    await waitFor("document.querySelector('[data-shelf-preview]')?.textContent.includes('PICKER_END_SENTINEL') && document.querySelector('[data-shelf-file]').value === ''");
    assert.equal(requests.filter(value => value === "POST /api/plugins/io.molis.work.shelf/items").length, before + 1);
    const item = (await shelf.snapshot()).materials.find(item => item.name === filename);
    assert.ok(item); itemId = item.item_id;
    assert.equal(shelf.readFile(item.item_id).bytes.toString("utf8"), text);
    assert.ok(requests.includes(`GET /api/plugins/io.molis.work.shelf/items/${itemId}/file`), "full preview must read the real copy endpoint");
  });

  await t.test("unsent input is restored, missing bridge preserves the draft, and wheel handoff quotes apostrophes", async () => {
    await evaluate(`(() => {delete window.molisWorkShelfTui;const field=document.querySelector('[data-shelf-tty-input]');
      field.value='已有草稿';window.dispatchEvent(new CustomEvent('molis-shelf-tui-unsent',{detail:{texts:['失败文本','https://example.com/中文'],message:'fixture spawn failed'}}));})()`);
    const restored = "失败文本 https://example.com/中文 已有草稿";
    assert.equal(await evaluate("document.querySelector('[data-shelf-tty-input]').value"), restored);
    await evaluate("document.querySelector('[data-shelf-tty-input]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}))");
    assert.equal(await evaluate("document.querySelector('[data-shelf-tty-input]').value"), restored);
    assert.match(await evaluate<string>("document.querySelector('[data-shelf-bar-hint]').textContent"), /终端尚未连接，输入已保留/);
    await evaluate(`window.terminalCalls=[];window.molisWorkShelfTui={open:()=>window.terminalCalls.push({kind:'open'}),send:text=>{window.terminalCalls.push({kind:'send',text});return true}};
      window.dispatchEvent(new CustomEvent('molis-shelf-send-tui',{detail:{item_ids:[${JSON.stringify(itemId)}]}}));`);
    await waitFor("window.terminalCalls.some(call=>call.kind==='send')");
    const item = shelf.readFile(itemId).item, filePath = join(shelf.root, item.relative_path);
    assert.ok(filePath.endsWith(filename));
    const expected = "'" + filePath.slice(0, -filename.length) + "真实 picker'\\''s.md'";
    assert.deepEqual(await evaluate("window.terminalCalls"), [{ kind: "open" }, { kind: "send", text: expected }]);
  });

  await t.test("a mixed folder and file drop admits both and keeps successes visible when another entry fails", async () => {
    // The directory-entry interface is synthesized; its files and the complete
    // admission/preview HTTP path use the production client and store.
    await evaluate(`(() => {
      const file=(name,text)=>({name,isFile:true,isDirectory:false,file:resolve=>resolve(new File([text],name,{type:'text/plain'}))});
      const folder={name:'混合目录',isDirectory:true,isFile:false,createReader:()=>{let read=false;return {readEntries:resolve=>{const entries=read?[]:[file('内部.txt','inside folder')];read=true;queueMicrotask(()=>resolve(entries))}}}};
      const broken={name:'不可读.txt',isFile:true,isDirectory:false,file:(_,reject)=>reject(new Error('fixture unreadable file'))};
      const entries=[folder,broken,file('外部.txt','outside folder')];
      const event=new Event('drop',{bubbles:true,cancelable:true});
      Object.defineProperty(event,'dataTransfer',{value:{types:['Files'],items:entries.map(entry=>({webkitGetAsEntry:()=>entry})),files:[]}});
      document.querySelector('[data-shelf=directory]').dispatchEvent(event);
    })()`);
    await waitFor("document.querySelector('[data-shelf-bar-hint]').textContent.includes('fixture unreadable file')");
    const materials=(await shelf.snapshot()).materials;
    const folder=materials.find(item=>item.name==='混合目录');
    const file=materials.find(item=>item.name==='外部.txt');
    assert.ok(folder);assert.ok(file);
    assert.equal(shelf.readChild(folder.item_id,'内部.txt').bytes.toString('utf8'),'inside folder');
    assert.equal(shelf.readFile(file.item_id).bytes.toString('utf8'),'outside folder');
    assert.equal(await evaluate(`Boolean(document.querySelector('[data-shelf-item="${file.item_id}"]'))`),true);
  });
});

test("W2-18-SHELF-OPEN-01: a selected clipboard ID opens its body on the mounted page and after remount", { timeout: 35_000 }, async t => {
  const browser = await openShelfBrowser(t); if (!browser) return;
  const { shelf, evaluate, waitFor } = browser;
  const clip = await shelf.addClipboard("The original private clipboard body 7731"); assert.ok(clip);
  const select = `document.querySelector('[data-shelf=workbench]').dispatchEvent(new CustomEvent('molis-work:select-item',{detail:{itemId:${JSON.stringify(clip.clip_id)}}}))`;
  await evaluate(select);
  await waitFor("document.querySelector('[data-shelf-preview]').textContent.includes('clipboard body 7731')");
  assert.equal(await evaluate("document.querySelector('[data-shelf-chrome-tag]').textContent"), "剪贴板");
  await evaluate("window.oldShelf=document.querySelector('[data-shelf=workbench]');window.shelfParent=oldShelf.parentElement;oldShelf.remove()");
  await new Promise(resolve => setTimeout(resolve, 50));
  await evaluate(`shelfParent.append(oldShelf);bootShelf();${select}`);
  await waitFor("document.querySelector('[data-shelf-preview]').textContent.includes('clipboard body 7731')");
  const material = (await shelf.snapshot()).materials[0]!;
  await evaluate(`oldShelf.dispatchEvent(new CustomEvent('molis-work:select-item',{detail:{itemId:${JSON.stringify(material.item_id)}}}))`);
  await waitFor("document.querySelector('[data-shelf-chrome-tag]').textContent.includes('材料')");
});

test("W2-18-SHELF-CACHE-01: owner edits invalidate same-ID text and an earlier file response cannot restore old bytes", { timeout: 35_000 }, async t => {
  const browser = await openShelfBrowser(t); if (!browser) return;
  const { shelf, evaluate, waitFor, delayFile } = browser;
  const item = await shelf.admit({ filename: "editable.md", bytes: Buffer.from("# Original\n" + "a".repeat(25_000) + "\nORIGINAL_END"), mime: "text/markdown" });
  await evaluate(`window.dispatchEvent(new CustomEvent('molis-shelf-refresh',{detail:{item_ids:[${JSON.stringify(item.item_id)}]}}))`);
  await waitFor("document.querySelector('[data-shelf-preview]').textContent.includes('ORIGINAL_END')");
  const delayed = delayFile(); t.after(() => delayed.release());
  await evaluate("window.dispatchEvent(new CustomEvent('molis-shelf-refresh'))"); await delayed.started;
  await shelf.writeCopy(item.item_id, "# Current\n" + "b".repeat(25_000) + "\nCURRENT_END");
  await evaluate("window.dispatchEvent(new CustomEvent('molis-shelf-refresh'))");
  await waitFor("document.querySelector('[data-shelf-preview]').textContent.includes('CURRENT_END')");
  delayed.release(); await new Promise(resolve => setTimeout(resolve, 100));
  const text = await evaluate<string>("document.querySelector('[data-shelf-preview]').textContent");
  assert.ok(text.includes("CURRENT_END")); assert.ok(!text.includes("ORIGINAL_END"));
  await evaluate("window.shelfRoot=document.querySelector('[data-shelf=workbench]');shelfRoot.hidden=true");
  await new Promise(resolve => setTimeout(resolve, 50));
  await shelf.writeCopy(item.item_id, "# Return\nRETURN_END");
  await evaluate("shelfRoot.hidden=false");
  await waitFor("document.querySelector('[data-shelf-preview]').textContent.includes('RETURN_END')");
});

// W2'-2 moved admission out of the page (Images calls `shelf.items.admit`), so the window event this guarded is gone; the
// guarantee stays on the window events Shelf still hears: only the one live mount answers, a detached one stays silent.
test("W2-18-SHELF-LIFETIME-01: a window event belongs to one live mount; a detached mount answers nothing", { timeout: 35_000 }, async t => {
  const browser = await openShelfBrowser(t); if (!browser) return;
  const { requests, evaluate } = browser;
  const reads = () => requests.filter(request => request === "GET /api/plugins/io.molis.work.shelf/").length;
  const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  await evaluate("window.shelfRoot=document.querySelector('[data-shelf=workbench]');window.shelfParent=shelfRoot.parentElement;shelfRoot.remove()");
  await pause(50);
  const refresh = "window.dispatchEvent(new CustomEvent('molis-shelf-refresh'))";
  const detached = reads(); await evaluate(refresh); await pause(150);
  assert.equal(reads(), detached, "a detached mount reads nothing");
  await evaluate("shelfParent.append(shelfRoot);bootShelf();bootShelf()");
  await pause(150);
  const mounted = reads(); await evaluate(refresh); await pause(200);
  assert.equal(reads(), mounted + 1, "one live mount, one read");
});


test("Shelf keeps the latest snapshot and releases global handlers across hide, detach and remount", { timeout: 35_000 }, async t => {
  const browser = await openShelfBrowser(t); if (!browser) return;
  const { shelf, requests, evaluate, waitFor, delaySnapshot } = browser;
  const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  const reads = () => requests.filter(request => request === "GET /api/plugins/io.molis.work.shelf/").length;
  const delayed = delaySnapshot();
  await evaluate("window.dispatchEvent(new CustomEvent('molis-shelf-refresh'))"); await delayed.started;
  await shelf.admit({ filename: "更新后的材料.md", bytes: Buffer.from("# 最新内容"), mime: "text/markdown" });
  await evaluate("window.dispatchEvent(new CustomEvent('molis-shelf-refresh'))");
  await waitFor("document.querySelector('[data-shelf-list=materials]').textContent.includes('更新后的材料')");
  delayed.release(); await pause(100);
  assert.equal(await evaluate("document.querySelector('[data-shelf-list=materials]').textContent.includes('更新后的材料')"), true, "late earlier snapshot cannot erase a later read");
  await evaluate("window.shelfRoot=document.querySelector('[data-shelf=workbench]');window.shelfParent=shelfRoot.parentElement;shelfRoot.hidden=true");
  const hiddenReads = reads(); await pause(800); assert.equal(reads(), hiddenReads);
  await evaluate("shelfRoot.hidden=false");
  for (let n = 0; n < 100 && reads() === hiddenReads; n++) await pause(20);
  assert.equal(reads(), hiddenReads + 1, "returning reads authoritative data once");
  await pause(100); await evaluate("shelfRoot.remove()"); await pause(50);
  const detachedReads = reads();
  await evaluate("window.dispatchEvent(new CustomEvent('molis-shelf-refresh'))"); await pause(100);
  assert.equal(reads(), detachedReads, "detached Shelf no longer listens to global refresh events");
  await evaluate("shelfParent.append(shelfRoot);bootShelf();bootShelf()");
  for (let n = 0; n < 100 && reads() === detachedReads; n++) await pause(20);
  assert.equal(reads(), detachedReads + 1);
  await pause(100); const mountedReads = reads();
  await evaluate("window.dispatchEvent(new CustomEvent('molis-shelf-refresh'))");
  for (let n = 0; n < 100 && reads() === mountedReads; n++) await pause(20);
  await pause(100); assert.equal(reads(), mountedReads + 1, "one current handler serves one refresh after remount");
});

// specs/visual-ui-experience VUX-19: copying a clip says how it went. Copied only once the clipboard took it; a refusal is said
// on the bar instead of swallowed, and the clip is not made current on the Shelf while the clipboard does not hold it.
test("VUX-19: a clip's copy is said on the bar, a refused clipboard included, and a refusal makes nothing current", { timeout: 35_000 }, async t => {
  const browser = await openShelfBrowser(t); if (!browser) return;
  const { shelf, requests, evaluate, waitFor, command, sessionId } = browser;
  const clip = await shelf.addClipboard("复制到剪贴板的一段话 4471"); assert.ok(clip);
  await command("Page.reload", {}, sessionId);
  const row = `document.querySelector('[data-shelf-clip=${JSON.stringify(clip.clip_id)}]')`;
  await waitFor(`${row} && document.querySelector('[data-shelf-bar]')?.textContent.length > 0`);
  await evaluate(`(() => { window.allowCopy = false; window.copied = []; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
    writeText: (text) => window.allowCopy ? (window.copied.push(text), Promise.resolve()) : Promise.reject(new Error('denied')) } }); })()`);
  const promoted = () => requests.filter(line => line === "POST /api/plugins/io.molis.work.shelf/clipboard").length;
  const before = promoted();
  await evaluate(`${row}.querySelector('[data-shelf-row-action=copy]').click()`);
  await waitFor(`document.querySelector('[data-shelf-bar-hint]')?.textContent.includes('复制失败')`);
  assert.equal(promoted(), before, "a refused copy does not make the clip current");
  await evaluate("window.allowCopy = true");
  await evaluate(`document.querySelector('[data-shelf-clip=${JSON.stringify(clip.clip_id)}] [data-shelf-row-action=copy]').click()`);
  await waitFor(`document.querySelector('[data-shelf-bar-hint]')?.textContent.includes('已复制')`);
  assert.deepEqual(await evaluate("window.copied"), ["复制到剪贴板的一段话 4471"]);
  for (let n = 0; n < 50 && promoted() === before; n++) await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(promoted(), before + 1, "a copy the clipboard took makes the clip current once");
});
