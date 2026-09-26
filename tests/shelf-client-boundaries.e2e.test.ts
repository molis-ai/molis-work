import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { WebSocket } from "ws";
import { ShelfStore } from "../modules/shelf/src/store.js";
import { SHELF_CLIENT_FACTORY_SCRIPT } from "../plugins/native/shelf/src/client.js";
import { createShelfRouteHandlers } from "../plugins/native/shelf/src/route-handlers.js";
import { shelfRouteErrorResponse } from "../plugins/native/shelf/src/route-error.js";
import { ShelfPluginRouteTable } from "../plugins/native/shelf/src/routes.js";
import { SHELF_STYLES } from "../plugins/native/shelf/src/styles.js";
import { renderShelfWorkbench } from "../plugins/native/shelf/src/ui.js";

// The only stub is runtime availability, so client handoffs can be exercised
// without installing or launching an agent. Storage and HTTP handlers are real.
class FixtureShelfStore extends ShelfStore {
  override runtime() {
    return { ...super.runtime(), runtime_key: "fixture", executable: "/fixture/not-launched", title: "Fixture" };
  }
}

async function openShelfBrowser(t: TestContext) {
  const chrome = [process.env.MOLIS_WORK_TEST_CHROME, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"]
    .find((path): path is string => Boolean(path && existsSync(path)));
  if (!chrome) { t.skip("Chrome is required for Shelf boundary E2E"); return null; }
  const home = await mkdtemp(join(tmpdir(), "shelf-client-boundaries-"));
  const shelf = new FixtureShelfStore(join(home, "shelf"), { disabled: true });
  shelf.admit({ filename: "目录材料.md", bytes: Buffer.from("# Shelf 专用测试页\n"), mime: "text/markdown" });
  const routes = new ShelfPluginRouteTable(createShelfRouteHandlers(shelf));
  const requests: string[] = [];
  const escape = (value: unknown) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  const html = `<!doctype html><html data-resolved-theme="light"><head><meta charset="utf-8"><style>
    [hidden]{display:none!important}body{margin:0;font-family:system-ui}*{box-sizing:border-box}
    :root{--content-side:#f5f5f4;--content-paper:#fff;--content-ink:#242424;--content-muted:#777;--content-line:#ddd}
    [data-shelf=workbench]{display:grid;grid-template-columns:280px minmax(0,1fr);min-height:900px}
    ${SHELF_STYLES}</style></head><body data-desktop-surface="shelf">
    ${renderShelfWorkbench({ ...shelf.snapshot(), selected_id: null, primitives: { escape, text: value => value } })}
    <script src="/fixture.js"></script></body></html>`;
  const script = `document.querySelector('[data-shelf=workbench]').hidden=false;
    window.molisWorkControlHeaders=()=>({'content-type':'application/json'});
    (${SHELF_CLIENT_FACTORY_SCRIPT})({translate:(value,values)=>String(value).replace(/\\{([^}]+)\\}/g,(_,key)=>values?.[key]??key)});`;
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
      response.writeHead(result.status, { "content-type": result.mime || "application/json; charset=utf-8", "cache-control": "no-store", ...result.headers });
      response.end(result.bytes ? Buffer.from(result.bytes) : JSON.stringify(result.body));
    } catch (error) {
      const failure = shelfRouteErrorResponse(error);
      response.writeHead(failure.status, { "content-type": "application/json" }); response.end(JSON.stringify(failure.body));
    }
  });
  let child: ChildProcess | undefined, socket: WebSocket | undefined;
  const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
  t.after(async () => {
    socket?.terminate();
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error("Fixture closed")); }
    if (child && child.exitCode === null && child.signalCode === null) {
      const closed = once(child, "close");
      child.kill("SIGTERM");
      const force = setTimeout(() => child?.kill("SIGKILL"), 3000);
      try { await closed; } finally { clearTimeout(force); }
    }
    server.closeAllConnections();
    if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(home, { recursive: true, force: true });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  child = spawn(chrome, ["--headless=new", "--disable-gpu", "--disable-background-networking", "--disable-extensions", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${join(home, "chrome")}`, "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
  const debuggerUrl = await new Promise<string>((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => reject(new Error("Chrome debugger startup timed out")), 20_000);
    child!.once("error", error => { clearTimeout(timeout); reject(error); });
    child!.stderr!.on("data", chunk => {
      output += String(chunk);
      const url = output.match(/DevTools listening on (ws:\/\/\S+)/)?.[1];
      if (url) { clearTimeout(timeout); resolve(url); }
    });
    child!.once("exit", () => { clearTimeout(timeout); reject(new Error(`Chrome exited: ${output.slice(-400)}`)); });
  });
  socket = new WebSocket(debuggerUrl);
  await once(socket, "open");
  let nextId = 0;
  socket.on("message", raw => {
    const value = JSON.parse(String(raw)), entry = pending.get(value.id);
    if (!entry) return;
    clearTimeout(entry.timer); pending.delete(value.id);
    if (value.error) entry.reject(new Error(JSON.stringify(value.error))); else entry.resolve(value.result);
  });
  const command = <T = unknown>(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<T> => {
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve: value => resolve(value as T), reject, timer: setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 20_000) });
      socket!.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  };
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
  return { home, shelf, requests, evaluate, waitFor, command, sessionId };
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
    const before = requests.filter(value => value === "POST /api/shelf/items").length;
    await command("DOM.setFileInputFiles", { nodeId: input.nodeId, files: [file] }, sessionId);
    await waitFor("document.querySelector('[data-shelf-preview]')?.textContent.includes('PICKER_END_SENTINEL') && document.querySelector('[data-shelf-file]').value === ''");
    assert.equal(requests.filter(value => value === "POST /api/shelf/items").length, before + 1);
    const item = shelf.snapshot().materials.find(item => item.name === filename);
    assert.ok(item); itemId = item.item_id;
    assert.equal(shelf.readFile(item.item_id).bytes.toString("utf8"), text);
    assert.ok(requests.includes(`GET /api/shelf/items/${itemId}/file`), "full preview must read the real copy endpoint");
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
    const materials=shelf.snapshot().materials;
    const folder=materials.find(item=>item.name==='混合目录');
    const file=materials.find(item=>item.name==='外部.txt');
    assert.ok(folder);assert.ok(file);
    assert.equal(shelf.readChild(folder.item_id,'内部.txt').bytes.toString('utf8'),'inside folder');
    assert.equal(shelf.readFile(file.item_id).bytes.toString('utf8'),'outside folder');
    assert.equal(await evaluate(`Boolean(document.querySelector('[data-shelf-item="${file.item_id}"]'))`),true);
  });
});
