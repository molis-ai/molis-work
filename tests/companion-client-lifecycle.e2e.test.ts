import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { createServer, type ServerResponse } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT } from "@molis-ai/molis-work-ui-host";
import { renderFilesBrowserDirectory, renderFilesBrowserResult } from "@molis-ai/molis-work-plugin-files";
import { renderGitBrowserDirectory, renderGitBrowserResult } from "@molis-ai/molis-work-plugin-git";
import { CODING_COMPANIONS_CLIENT_FACTORY_SCRIPT } from "../apps/workbench/dist/scripts/client/coding-companions.js";
import { AGENT_REVIEW_CLIENT_FACTORY_SCRIPT } from "../apps/workbench/dist/scripts/client/agent-review.js";
import { ChromeHarness } from "./fixtures/plugin-builder-browser.js";

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate: () => boolean) {
  for (let n = 0; n < 150; n++) { if (predicate()) return; await pause(20); }
  assert.ok(predicate(), "expected server-side request or cancellation");
}
async function fixture(t: TestContext, markup: string, script: string, reply: (path: string) => unknown) {
  const directory = await mkdtemp(join(tmpdir(), "companion-lifecycle-"));
  let browser: ChromeHarness | null = null;
  let server: ReturnType<typeof createServer> | undefined;
  t.after(async () => {
    server?.closeAllConnections();server?.close();
    try { await browser?.close(); }
    finally { await rm(directory, { recursive: true, force: true }); }
  });
  browser = await ChromeHarness.start(directory);
  if (!browser) { t.skip("Chrome is unavailable"); return null; }
  const requests: string[] = [], aborted: string[] = [], blocked = new Set<string>(), pending = new Map<string, ServerResponse[]>();
  server = createServer((request, response) => {
    const path = new URL(request.url!, "http://fixture").pathname, key = request.method + " " + path;
    if (path === "/") {
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end(`<!doctype html><section id="parent" hidden>${markup}</section><script>
        window.errors=[];addEventListener('error',event=>errors.push(event.message));addEventListener('unhandledrejection',event=>errors.push(String(event.reason)));
        window.mount=(${UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT})();window.parentView=document.querySelector('#parent');
        ${script}
      </script>`);return;
    }
    if(path === "/favicon.ico"){response.writeHead(204);response.end();return;}
    requests.push(key);response.setHeader("content-type", "application/json");
    if (blocked.has(key)) {
      pending.set(key, [...pending.get(key) ?? [], response]);
      response.on("close", () => { if (!response.writableEnded) aborted.push(key); });
    } else response.end(JSON.stringify(reply(path)));
  });
  await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const page = await browser.page();
  await page.command("Page.navigate", { url: `http://127.0.0.1:${address.port}/` });
  await page.wait("window.parentView && window.boot");
  const count = (key: string) => requests.filter(request => request === key).length;
  return { page, requests, aborted, blocked, pending, count };
}
const fixedMarkup = '<button data-companion-refresh><span class="mw-spinner" hidden></span>刷新</button><p data-companion-status></p><div data-companion-content></div>';
const state = (name: string) => name === "files" ? { workspace: { workspace_id: "ws" } }
  : name === "git" ? { workspace: { workspace_id: "ws" }, selected: null, view: { phase: "ready", head: "current", conflicts: [], staged: [], changes: [] } }
  : { html: '<p data-current>current fixed content</p>' };

for (const name of ["files", "git", "diff", "text-stats"]) {
  test(`${name} owns visible queries and listeners across hide, detach and remount`, { timeout: 30_000 }, async t => {
    const body = name === "files" ? renderFilesBrowserDirectory() + renderFilesBrowserResult()
      : name === "git" ? renderGitBrowserDirectory() + renderGitBrowserResult() : fixedMarkup;
    const f = await fixture(t, `<section data-companion="${name}">${body}</section>`, `
      const host={mountPluginClient:mount,route:path=>path,headers:()=>({}),icons:{},openPlugin:()=>{},reviewFactory:(${AGENT_REVIEW_CLIENT_FACTORY_SCRIPT}),
        request:async(plugin,path,method='GET',body,signal)=>{const response=await fetch('/'+plugin+path,{method,signal,...(body?{body:JSON.stringify(body)}:{})});return response.json();}};
      window.root=document.querySelector('[data-companion]');window.boot=()=>(${CODING_COMPANIONS_CLIENT_FACTORY_SCRIPT})(host);boot();
    `, path => {
      if (path.endsWith("/view-revision")) return { revision: "initial" };
      if (path.endsWith("/directory")) return { result: { outcome: "directory", entries: [{ name: "note.txt", kind: "file", path: ["note.txt"] }] } };
      if (path.endsWith("/summary")) return { summary: null, workspace: { workspace_id: "ws" } };
      if (path.endsWith("/reviews")) return { reviews: [], html: "", omitted: 0 };
      return state(path.split("/")[1]!);
    }); if (!f) return;
    const { page, blocked, pending, aborted, count } = f;
    assert.equal(f.requests.length, 0, "initial hidden ancestor starts no queries");
    const key = `GET /${name}/state`, refresh = name === "files" ? "[data-files-refresh]" : name === "git" ? "[data-git-refresh]" : "[data-companion-refresh]";
    const ready = name === "files" ? "document.querySelector('[data-file-path]') && !document.querySelector('[data-files-refresh]').disabled"
      : name === "git" ? "document.querySelector('[data-git-status]').textContent==='current' && !document.querySelector('[data-git-refresh]').disabled"
      : "document.querySelector('[data-current]') && !document.querySelector('[data-companion-refresh]').disabled";
    if(name === "git")blocked.add("GET /git/summary");
    await page.evaluate("parentView.hidden=false");
    if(name === "git"){
      await until(() => pending.has("GET /git/summary"));
      assert.equal(await page.evaluate("document.querySelector('[data-git-refresh]').disabled"),true,"refresh includes its source-control summary");
      assert.equal(await page.evaluate("document.querySelector('[data-git-status]').textContent.includes('正在读取')"),true);
      blocked.delete("GET /git/summary");pending.get("GET /git/summary")![0]!.end(JSON.stringify({summary:null,workspace:{workspace_id:"ws"}}));
    }
    await page.wait(ready);
    blocked.add(key);await page.click(refresh);await until(() => pending.has(key));
    await page.evaluate("parentView.hidden=true");await until(() => aborted.includes(key));
    const hidden = f.requests.length;await pause(120);assert.equal(f.requests.length, hidden);
    blocked.delete(key);await page.evaluate("parentView.hidden=false");await page.wait(ready);
    pending.get(key)![0]!.end(JSON.stringify({ html: "stale response", workspace: null }));await pause(80);await page.wait(ready);
    assert.equal(await page.evaluate("root.textContent.includes('stale response')"), false);
    if (name === "git") {
      // An old history click must not start its next query using the newly visible scope.
      const reviews = "GET /api/agent/reviews";blocked.add(reviews);
      await page.click("[data-git-history]");await until(() => pending.has(reviews));
      await page.evaluate("parentView.hidden=true");await until(() => aborted.includes(reviews));
      blocked.delete(reviews);await page.evaluate("parentView.hidden=false");await page.wait(ready);
      pending.get(reviews)![0]!.end(JSON.stringify({ reviews: [], html: "", omitted: 0 }));await pause(80);
      assert.equal(count("GET /git/results"), 0, "no continuation of the old history action after hide");
    }
    if (name === "files") {
      const open = "POST /files/open";blocked.add(open);
      await page.click("[data-file-path]");await until(() => pending.has(open));
      await page.evaluate("parentView.hidden=true");await pause(80);
      assert.equal(aborted.includes(open), false, "POST reading-position write survives hiding without replay");
      await page.evaluate("parentView.hidden=false");await page.wait(ready);
      pending.get(open)![0]!.end(JSON.stringify({ result: { outcome: "text", text: "stale file text", fingerprint: "old" } }));await pause(80);
      assert.equal(await page.evaluate("document.querySelector('[data-files-text]').value.includes('stale file text')"), false);
      assert.equal(count(open), 1);
    }
    // Detach while a real HTTP read waits, then attach the same DOM and initialize twice.
    blocked.add(key);await page.click(refresh);await until(() => pending.get(key)!.length === 2);
    await page.evaluate("root.remove()");await until(() => aborted.filter(item => item === key).length === 2);
    blocked.delete(key);await page.evaluate("parentView.append(root);boot();boot()");await page.wait(ready);
    const before = count(key);await page.click(refresh);await page.wait(ready);await pause(100);
    assert.equal(count(key) - before, name === "files" ? 2 : 1, "one click has one current refresh chain");
    await page.evaluate("root.remove()");await pause(100);const detached = f.requests.length;
    await page.evaluate(`root.querySelector(${JSON.stringify(refresh)}).click()`);await pause(100);
    assert.equal(f.requests.length, detached, "disposed DOM no longer handles refresh");
    assert.deepEqual(await page.evaluate("errors"), []);
  });
}

test("Host reviews retain decisions across hiding without rendering stale results or accumulating listeners", { timeout: 30_000 }, async t => {
  let empty = true;
  const review = '<article data-agent-review-item="r1"><button data-agent-review-approve="r1">批准</button><button data-agent-review-reject="r1">拒绝</button><div data-review-recovery></div></article>';
  const f = await fixture(t, '<section id="owner"><section id="reviews" hidden></section></section>', `
    window.owner=document.querySelector('#owner');window.container=document.querySelector('#reviews');window.decisions=0;
    const show=(${AGENT_REVIEW_CLIENT_FACTORY_SCRIPT})({mountPluginClient:mount,route:path=>path,headers:()=>({}),onDecision:()=>{decisions++;}});
    window.boot=()=>{const lifetime=mount(owner);if(!lifetime)return;lifetime.whenVisible(signal=>{window.readReviews=()=>show(container,[],null,'ws',undefined,{lifetime,signal});void readReviews();});};boot();
  `, path => path.endsWith("/decide") ? { receipt: { effect_settled: true } } : { reviews: empty ? [] : [{}], html: empty ? "" : review, omitted: 0 });
  if (!f) return;
  const { page, blocked, pending, aborted, count } = f;
  await page.evaluate("parentView.hidden=false");await until(() => count("GET /api/agent/reviews") === 1);
  await page.wait("container.hidden");
  empty = false;await page.evaluate("readReviews()");await page.wait("!container.hidden && container.querySelector('[data-agent-review-approve]')");
  blocked.add("GET /api/agent/reviews");await page.evaluate("void readReviews()");await until(() => pending.has("GET /api/agent/reviews"));
  await page.evaluate("parentView.hidden=true");await until(() => aborted.includes("GET /api/agent/reviews"));
  blocked.delete("GET /api/agent/reviews");await page.evaluate("parentView.hidden=false");await page.wait("container.querySelector('[data-agent-review-approve]')?.disabled===false");
  blocked.add("POST /api/agent/reviews/decide");await page.click("[data-agent-review-approve]");await until(() => pending.has("POST /api/agent/reviews/decide"));
  // Ordinary review polling in the same visible scope must not suppress the decision callback.
  await page.evaluate("readReviews()");pending.get("POST /api/agent/reviews/decide")![0]!.end(JSON.stringify({ receipt: { effect_settled: true } }));
  await page.wait("decisions===1 && container.querySelector('[data-agent-review-approve]')?.disabled===false");
  await page.click("[data-agent-review-reject]");await until(() => pending.get("POST /api/agent/reviews/decide")!.length === 2);
  await page.evaluate("parentView.hidden=true");await pause(80);
  assert.equal(aborted.includes("POST /api/agent/reviews/decide"), false, "hiding does not cancel or replay an already dispatched decision");
  await page.evaluate("parentView.hidden=false");await page.wait("container.querySelector('[data-agent-review-approve]')?.disabled===true");
  pending.get("POST /api/agent/reviews/decide")![1]!.end(JSON.stringify({ receipt: { effect_settled: true } }));await pause(100);
  assert.equal(await page.evaluate("decisions"), 1, "late decision cannot act in a new visible scope");
  await page.evaluate("readReviews()");await page.wait("container.querySelector('[data-agent-review-approve]')?.disabled===false");
  await page.evaluate("owner.remove()");await pause(100);await page.evaluate("parentView.append(owner);boot();boot()");
  await page.wait("container.querySelector('[data-agent-review-approve]')?.disabled===false");
  blocked.delete("POST /api/agent/reviews/decide");const before=count("POST /api/agent/reviews/decide");
  await page.click("[data-agent-review-approve]");await page.wait("decisions===2");await pause(100);
  assert.equal(count("POST /api/agent/reviews/decide")-before,1);
  assert.deepEqual(await page.evaluate("errors"), []);
});

for (const name of ["files", "git"]) test(`${name} refreshes changed revisions, resumes after disconnect and stops while hidden`, { timeout: 30_000 }, async t => {
  let revision = 1;
  const markup = name === "files" ? renderFilesBrowserDirectory() + renderFilesBrowserResult() : renderGitBrowserDirectory() + renderGitBrowserResult();
  const f = await fixture(t, `<section data-companion="${name}">${markup}</section>`, `
    const host={mountPluginClient:mount,route:path=>path,headers:()=>({}),icons:{},openPlugin:()=>{},reviewFactory:(${AGENT_REVIEW_CLIENT_FACTORY_SCRIPT}),
      request:async(plugin,path,method='GET',body,signal)=>{const response=await fetch('/'+plugin+path,{method,signal,...(body?{body:JSON.stringify(body)}:{})});if(!response.ok)throw new Error('offline');return response.json();}};
    window.boot=()=>(${CODING_COMPANIONS_CLIENT_FACTORY_SCRIPT})(host);boot();
  `, path => {
    if(path.endsWith('/view-revision'))return {revision:String(revision)};
    if(path.endsWith('/directory'))return {result:{outcome:'directory',entries:[{name:'version-'+revision,kind:'file',path:['version-'+revision]}]}};
    if(path.endsWith('/summary'))return {summary:null,workspace:{workspace_id:'ws'}};
    if(path.endsWith('/reviews'))return {reviews:[],html:'',omitted:0};
    const value=state(path.split('/')[1]!);return name==='git' && path==='/git/state'?{...value,view:{...value.view,head:'version-'+revision}}:value;
  });if(!f)return;
  const {page,count,blocked,pending,aborted}=f, key=`GET /${name}/view-revision`;
  const visible=(n:number)=>name==='files'?`!!document.querySelector('[data-file-path]')?.textContent.includes('version-${n}')`:`document.querySelector('[data-git-status]').textContent==='version-${n}'`;
  await page.evaluate('parentView.hidden=false');await page.wait(visible(1));
  const before=count(`GET /${name}/state`);await pause(2200);
  assert.equal(count(`GET /${name}/state`),before,'unchanged revision makes no expensive state reads');
  revision=2;await page.wait(visible(2));
  blocked.add(key);await until(()=>pending.has(key));
  pending.get(key)![0]!.writeHead(503);pending.get(key)![0]!.end('{}');blocked.delete(key);
  revision=3;await page.wait(visible(3));
  blocked.add(key);await until(()=>(pending.get(key)?.length??0)===2);
  await page.evaluate('parentView.hidden=true');await until(()=>aborted.includes(key));
  const hidden=f.requests.length;await pause(2200);assert.equal(f.requests.length,hidden,'no hidden polling or business writes');
  blocked.delete(key);revision=4;await page.evaluate('parentView.hidden=false');await page.wait(visible(4));
  assert.deepEqual(await page.evaluate('errors'),[]);
});
