import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { createServer, type ServerResponse } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT } from "@molis-ai/molis-work-ui-host";
import { renderFilesBrowserDirectory, renderFilesBrowserResult } from "@molis-ai/molis-work-plugin-files";
import { renderGitBrowserDirectory, renderGitBrowserResult } from "@molis-ai/molis-work-plugin-git";
import { createWorkbenchLocale, pluginSurfaceClients } from "@molis-ai/molis-work-app-workbench";
import { AGENT_REVIEW_CLIENT_FACTORY_SCRIPT } from "../apps/workbench/dist/scripts/client/agent-review.js";
import { openStudioChrome } from "./fixtures/plugin-builder-browser.js";
import { DEMO_PROJECT_ID, LocalProjectDatabase, createPluginPlatform, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { createCodingPlugin } from "@molis-ai/molis-work-plugin-coding";
import { codingSessions, noEffect } from "./fixtures/coding-sessions.js";
import { createDiffPlugin, DIFF_LABELS, DIFF_MESSAGES, DIFF_TEMPLATES, type DiffView } from "@molis-ai/molis-work-plugin-diff";
import { diffViewText, renderDiff } from "@molis-ai/molis-work-plugin-sdk/diff-view";
import { icon } from "@molis-ai/molis-work-design-system";
import { UiHost, UI_REQUEST_CLIENT_SCRIPT } from "@molis-ai/molis-work-ui-host";
import { agentHostCapabilities as agent } from "@molis-ai/molis-work-contracts/services/agent-host";
import { pluginActions, withFakeAgentHost } from "./fixtures/plugin-actions.js";

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const { L, clientI18nScript } = createWorkbenchLocale(() => "zh");
async function until(predicate: () => boolean) {
  for (let n = 0; n < 150; n++) { if (predicate()) return; await pause(20); }
  assert.ok(predicate(), "expected server-side request or cancellation");
}
async function fixture(t: TestContext, markup: string, script: string, reply: (path: string, url: URL) => unknown | Promise<unknown>) {
  const directory = await mkdtemp(join(tmpdir(), "companion-lifecycle-"));
  let browser: Awaited<ReturnType<typeof openStudioChrome>> = null;
  let server: ReturnType<typeof createServer> | undefined;
  t.after(async () => {
    server?.closeAllConnections();server?.close();
    try { await browser?.close(); }
    finally { await rm(directory, { recursive: true, force: true }); }
  });
  browser = await openStudioChrome(directory);
  if (!browser) { t.skip("Chrome is unavailable"); return null; }
  const requests: string[] = [], aborted: string[] = [], blocked = new Set<string>(), pending = new Map<string, ServerResponse[]>();
  server = createServer((request, response) => {
    const url = new URL(request.url!, "http://fixture"), path = url.pathname, key = request.method + " " + path;
    if (path === "/") {
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end(`<!doctype html><section id="parent" hidden>${markup}</section><script>
        window.errors=[];addEventListener('error',event=>errors.push(event.message));addEventListener('unhandledrejection',event=>errors.push(String(event.reason)));
        ${clientI18nScript()}
        ${UI_REQUEST_CLIENT_SCRIPT}
        const actualMount=(${UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT})();window.mountedScopes=new WeakMap();
        window.mount=root=>{const scope=actualMount(root);if(scope)mountedScopes.set(root,scope);return scope;};window.parentView=document.querySelector('#parent');
        ${script}
      </script>`);return;
    }
    if(path === "/favicon.ico"){response.writeHead(204);response.end();return;}
    requests.push(key);response.setHeader("content-type", "application/json");
    if (blocked.has(key)) {
      pending.set(key, [...pending.get(key) ?? [], response]);
      response.on("close", () => { if (!response.writableEnded) aborted.push(key); });
    } else void Promise.resolve(reply(path, url)).then(value => response.end(JSON.stringify(value))).catch(error => { response.writeHead(500); response.end(JSON.stringify({ error: String(error) })); });
  });
  await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const page = await browser.page();
  await page.command("Page.navigate", { url: `http://127.0.0.1:${address.port}/` });
  await page.wait("window.parentView && window.boot");
  const count = (key: string) => requests.filter(request => request === key).length;
  return { page, requests, aborted, blocked, pending, count };
}
/** A plugin's client as the page mounts it on its own surface: each companion is a bundle of its own. */
const pageFactory = (id: string) => pluginSurfaceClients().find(client => client.id === id)!.factory;
// A companion's reads go to its own plugin's routes (`host.pluginRoute`); the fixture serves them at `/<plugin>/…`.
const companionHost = (name: string) => `root:document.querySelector('[data-companion]'),mountPluginClient:mount,translate:L,route:path=>path,pluginId:'io.molis.work.${name}',pluginRoute:path=>'/${name}'+path,headers:()=>({}),openPlugin:()=>{} ,reviews:{show:(element,query,options)=>{
  window.fixtureReviewShow ??= (${AGENT_REVIEW_CLIENT_FACTORY_SCRIPT})({mountPluginClient:mount,route:path=>path,headers:()=>({})});
  return fixtureReviewShow(element,query.runIds.map(run_id=>({run_id})),query.sessionId,query.workspaceId,query,
    {lifetime:mountedScopes.get(element.closest('[data-companion]')),signal:options?.signal});
}}`;
const fixedMarkup = '<button data-companion-refresh><span class="mw-spinner" hidden></span>刷新</button><p data-companion-status></p><div data-companion-content></div>';
const state = (name: string) => name === "files" ? { workspace: { workspace_id: "ws" } }
  : name === "git" ? { workspace: { workspace_id: "ws" }, selected: null, view: { phase: "ready", head: "current", conflicts: [], staged: [], changes: [] } }
  : { html: '<p data-current>current fixed content</p>' };

test("GITREF-01 GITREF-03 Git refresh keeps current row identity and focus, updates order and clears invalid scopes", { timeout: 30_000 }, async t => {
  const view = (workspace: string, changes: string[], staged: string[] = []) => ({
    ...state("git"), workspace: { workspace_id: workspace },
    view: { phase: "ready", head: "current", conflicts: [], staged: staged.map(path => ({ path: [path], label: path })), changes: changes.map(path => ({ path: [path], label: path })) },
  });
  let revision = 1, current = view("ws", ["note.md"]);
  const gates: Array<{ entered(): void; response: Promise<ReturnType<typeof view>> }> = [];
  const f = await fixture(t, `<section data-work-surface="git" data-companion="git">${renderGitBrowserDirectory(L)}${renderGitBrowserResult(L)}</section>`, `
    const host={${companionHost("git")}};window.boot=()=>(${pageFactory("git")})(host);boot();
  `, path => {
    if (path.endsWith("/view-revision")) return { revision: String(revision) };
    if (path.endsWith("/summary")) return { summary: null, workspace: current.workspace };
    if (path.endsWith("/reviews")) return { reviews: [], html: "", omitted: 0 };
    if (path === "/git/state") { const gate = gates.shift(); gate?.entered(); return gate?.response ?? current; }
    return state("git");
  }); if (!f) return;
  const { page } = f, ready = "!document.querySelector('[data-git-refresh]').disabled";
  const refresh = () => {
    const entered = Promise.withResolvers<void>(), response = Promise.withResolvers<ReturnType<typeof view>>();
    gates.push({ entered: entered.resolve, response: response.promise });
    t.after(() => response.resolve(current)); revision++;
    return { entered: entered.promise, respond(value: ReturnType<typeof view>) { current = value; response.resolve(value); }, fail() { response.reject(new Error("controlled state read failure")); } };
  };
  await page.evaluate("parentView.hidden=false");
  await page.wait("document.querySelector('[data-git-path]') && " + ready);
  await page.evaluate("window.savedRow=document.querySelector('[data-git-path]');savedRow.focus()");
  const same = refresh(); await same.entered;
  assert.equal(await page.evaluate("savedRow.isConnected"), true, "a pending state read keeps the real interaction target");
  assert.equal(await page.evaluate("document.activeElement===savedRow"), true, "a background refresh keeps keyboard intent too");
  same.respond(view("ws", ["note.md"], ["staged.md"])); await page.wait(ready);
  assert.equal(await page.evaluate("savedRow.isConnected && [...document.querySelectorAll('[data-git-path]')].includes(savedRow)"), true, "the same key commits through the existing node");
  assert.equal(await page.evaluate("document.activeElement===savedRow"), true);
  assert.deepEqual(await page.evaluate("[...document.querySelectorAll('[data-git-path]')].map(row=>JSON.parse(row.dataset.gitPath))"), [[["staged.md"], "index"], [["note.md"], "worktree"]]);
  const removed = refresh(); await removed.entered; removed.respond(view("ws", ["next.md"])); await page.wait(ready);
  assert.equal(await page.evaluate("savedRow.isConnected"), false, "a genuinely removed path is not kept as an action target");
  await page.evaluate("window.previousScopeRow=document.querySelector('[data-git-path]')");
  const changed = refresh(); await changed.entered; changed.respond(view("ws-two", ["next.md"])); await page.wait(ready);
  assert.equal(await page.evaluate("previousScopeRow.isConnected"), false, "an equal path in another workspace gets its own node");
  assert.equal(await page.evaluate("document.querySelectorAll('[data-git-path]').length"), 1);
  const failed = refresh(); await failed.entered; failed.fail(); await page.wait(ready);
  assert.equal(await page.evaluate("document.querySelectorAll('[data-git-path]').length"), 0, "a refused state read cannot leave an old scope interactive");
  assert.equal(await page.evaluate("document.querySelector('[data-git-history]').disabled"), true);
  assert.deepEqual(await page.evaluate("errors"), []);
});

test("W2-18-DIFF-FILE-01: a real Coding frozen output selects distinct files and repeated paths; refresh, reopen and late responses keep the chosen index", { timeout: 60_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), "coding-fixed-diff-")), path = join(directory, "project.db");
  seedDemoBoard(path);
  const store = new LocalProjectDatabase(path), sessions = codingSessions(store);
  const at = "2026-09-28T10:00:00.000Z", ref = { session_id: "runtime-session", run_id: "run-one" };
  await sessions.create(noEffect, { project_id: DEMO_PROJECT_ID, session_id: "coding-one", title: "Fixed changes", runtime_id: "prologue", at });
  await sessions.setRuntimeSession(noEffect, DEMO_PROJECT_ID, "coding-one", ref.session_id, at);
  let readable = true, reads = 0;
  const rows = [["empty.txt", "", ""], ["cart.mjs", "old\n", "new\n"], ["cart.mjs", "new\n", "latest <script>\n"]].map(([target, before, after], index) => ({
    request: { review_id: "review-" + index, project_id: DEMO_PROJECT_ID, plugin_id: "io.molis.work.coding", run: ref, kind: "text-edit",
      document: { kind: "text-edit", target_path: target, exists: true, before_text: before, after_text: after } },
    receipt: { review_id: "review-" + index, status: "approved", effect_settled: true, effect_error: null },
  }));
  const privateValues = new Map<string, string>();
  // The fake Agent Host answers its actions (R8 batch 3) and the typed capabilities still left from one table.
  const agentHost = withFakeAgentHost({ actions: pluginActions(store, DEMO_PROJECT_ID), capabilities: { async invoke<I, O>(definition: { capability_id: string }, _input: I): Promise<O> {
    reads++; if (!readable) throw new Error("runtime unavailable after capture");
    // Like a Host whose runtime has no task graph: Coding's wake loop ends here instead of retrying in the background
    // (each retry would land on a later read, after the capture, when the run is slower than its 5 s back-off).
    if (definition.capability_id === agent.awaitContinuations.capability_id) throw Object.assign(new Error("当前运行时没有等待与接续"), { code: "agent.capability_unavailable" });
    if (definition.capability_id === agent.readSession.capability_id) return { runs: [ref] } as O;
    if (definition.capability_id === agent.readRun.capability_id) return { ref, phase: "completed" } as O;
    if (definition.capability_id === agent.readRunReviews.capability_id) return structuredClone(rows) as O;
    throw new Error("Unexpected capability " + definition.capability_id);
  } } });
  const platform = createPluginPlatform({ project_id: DEMO_PROJECT_ID, actor_id: "tester", db: store.db, actions: agentHost.actions,
    artifacts: new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: id => store.eventCursor(id) }),
    processItems: new ProcessItemsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: id => store.eventCursor(id) }), ui: new UiHost(), home: null,
    privateStorageFor: () => ({ get: key => privateValues.get(key) ?? null, set: (key, value) => { privateValues.set(key, value); }, delete: key => privateValues.delete(key) }),
    capabilities: agentHost.capabilities,
  });
  const started = await platform.start([{ definition: createCodingPlugin(), bundled: true }, { definition: createDiffPlugin(), bundled: true }]);
  t.after(async () => { await platform.closeCoordination(); store.close(); await rm(directory, { recursive: true, force: true }); });
  assert.deepEqual(started.failed, []); assert.deepEqual(started.blocked, []);
  const dispatch = async (pathname: string, method: "GET" | "POST" = "GET", body?: unknown, query: Record<string, string> = {}) => {
    const result = await platform.router().dispatch({ actor_id: "tester", method, pathname, body, query });
    assert.equal(result?.status, 200, JSON.stringify(result?.body)); return result!.body;
  };
  const producer = "/api/plugins/io.molis.work.coding/sessions/coding-one/runs/run-one/changeset";
  const saved = await dispatch(producer, "POST") as { reference: { artifact_id: string; version: number } };
  assert.ok(saved.reference);
  await dispatch(producer + "/output", "POST", { expected_reference: null });
  platform.wiring.bind({ project_id: DEMO_PROJECT_ID, actor_id: "tester", target_plugin_id: "io.molis.work.diff", target_port: "changeset",
    source_plugin_id: "io.molis.work.coding", source_port: "changeset", origin: "user" });
  platform.wiring.selectInputGroup("io.molis.work.diff", "change-set"); await platform.wiring.drain();
  readable = false; const capturedReads = reads, indices: number[] = [];
  const fixedState = async (index: number) => {
    const state = await dispatch("/api/plugins/io.molis.work.diff/state", "GET", undefined, { change_index: String(index) }) as { view: DiffView };
    // The Host's presentation seam: the owner's genuine view is rendered by the public Diff renderer.
    return { ...state, html: renderDiff({ labels: DIFF_LABELS, view: state.view, primitives: {
      escape: value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;"),
      icon: name => icon(name as Parameters<typeof icon>[0]),
      text: diffViewText(DIFF_MESSAGES, "zh", DIFF_TEMPLATES, L),
    } }) };
  };
  const previous = await fixedState(1);
  const f = await fixture(t, `<section data-work-surface="diff" data-companion="diff">${fixedMarkup}</section>`, `
    const host={${companionHost("diff")}};
    window.root=host.root;window.boot=()=>(${pageFactory("diff")})(host);boot();
  `, (_path, url) => { const index = Number(url.searchParams.get("change_index") ?? 0); indices.push(index); return fixedState(index); });
  if (!f) return;
  const { page, blocked, pending } = f;
  await page.evaluate("parentView.hidden=false");
  await page.wait("document.querySelectorAll('[data-action=\"diff.show-file\"]').length === 3 && !document.querySelector('[data-companion-refresh]').disabled");
  assert.deepEqual(await page.evaluate("[...document.querySelectorAll('[data-action=\"diff.show-file\"]')].map(button=>button.textContent.trim())"), ["1. empty.txt", "2. cart.mjs", "3. cart.mjs"]);
  await page.click('[data-change-index="1"]');
  await page.wait("document.querySelector('[data-companion-content]').textContent.includes('old') && !document.querySelector('[data-companion-refresh]').disabled");
  blocked.add("GET /diff/state"); await page.click("[data-companion-refresh]"); await until(() => pending.has("GET /diff/state"));
  blocked.delete("GET /diff/state"); await page.click('[data-change-index="2"]');
  const ready = "document.querySelector('[data-change-index=\"2\"]')?.getAttribute('aria-pressed') === 'true' && document.querySelector('[data-companion-content]').textContent.includes('latest <script>') && !document.querySelector('[data-companion-refresh]').disabled";
  await page.wait(ready);
  pending.get("GET /diff/state")![0]!.end(JSON.stringify(previous)); await pause(80); await page.wait(ready);
  await page.click("[data-companion-refresh]"); await page.wait(ready);
  await page.evaluate("parentView.hidden=true"); await pause(80); await page.evaluate("parentView.hidden=false"); await page.wait(ready);
  assert.equal(indices.at(-1), 2); assert.equal(reads, capturedReads, "all file selection reads the fixed Coding output without the unavailable Agent runtime");
  assert.deepEqual(await page.evaluate("errors"), []);
});

for (const name of ["files", "git", "diff", "text-stats"]) {
  test(`${name} owns visible queries and listeners across hide, detach and remount`, { timeout: 30_000 }, async t => {
    const body = name === "files" ? renderFilesBrowserDirectory(L) + renderFilesBrowserResult(L)
      : name === "git" ? renderGitBrowserDirectory(L) + renderGitBrowserResult(L) : fixedMarkup;
    const f = await fixture(t, `<section data-work-surface="${name}" data-companion="${name}">${body}</section>`, `
      const host={${companionHost(name)}};
      window.root=host.root;window.boot=()=>(${pageFactory(name)})(host);boot();
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
  const markup = name === "files" ? renderFilesBrowserDirectory(L) + renderFilesBrowserResult(L) : renderGitBrowserDirectory(L) + renderGitBrowserResult(L);
  const f = await fixture(t, `<section data-work-surface="${name}" data-companion="${name}">${markup}</section>`, `
    const host={${companionHost(name)}};
    window.boot=()=>(${pageFactory(name)})(host);boot();
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

test("SYS-50: a Git revision waits for the open difference, then refreshes without stranding its action", { timeout: 30_000 }, async t => {
  let revision = 1;
  const f = await fixture(t, `<section data-work-surface="git" data-companion="git">${renderGitBrowserDirectory(L)}${renderGitBrowserResult(L)}</section>`, `
    const host={${companionHost("git")}};
    window.boot=()=>(${pageFactory("git")})(host);boot();
  `, path => {
    if (path.endsWith("/view-revision")) return { revision: String(revision) };
    if (path.endsWith("/summary")) return { summary: null, workspace: { workspace_id: "ws" } };
    if (path.endsWith("/reviews")) return { reviews: [], html: "", omitted: 0 };
    if (path === "/api/host/plugin-page-actions") return { html: '<p data-current-diff>fixed difference</p>' };
    if (path === "/git/prepare-index") return {};
    return { ...state("git"), view: { phase: "ready", head: "version-" + revision, conflicts: [], staged: [], changes: [{ path: ["note.md"], label: "note.md" }] } };
  }); if (!f) return;
  const { page, count, blocked, pending } = f, diff = "POST /git/diff";
  await page.evaluate("parentView.hidden=false");
  await page.wait("document.querySelector('[data-git-path]') && !document.querySelector('[data-git-refresh]').disabled");
  blocked.add(diff); await page.click("[data-git-path]"); await until(() => pending.has(diff));
  const reads = count("GET /git/state"), polls = count("GET /git/view-revision");
  revision = 2;
  await until(() => count("GET /git/view-revision") > polls);
  await until(() => count("GET /git/view-revision") > polls + 1);
  assert.equal(count("GET /git/state"), reads, "the revision refresh does not invalidate the unfinished difference");
  pending.get(diff)![0]!.end(JSON.stringify({ result: { outcome: "diff" }, selected: {
    workspace_id: "ws", path: ["note.md"], side: "worktree", revision: "one", reference: { artifact_id: "fixed", version: 1 },
  } }));
  await page.wait("document.querySelector('[data-current-diff]') && !document.querySelector('[data-git-index-action]').hidden");
  await page.wait("document.querySelector('[data-git-status]').textContent==='version-2' && !document.querySelector('[data-git-refresh]').disabled");
  assert.equal(count("POST /api/host/plugin-page-actions"), 1, "the fixed difference remains on its captured version");
  await page.click("[data-git-index-action]"); await until(() => count("POST /git/prepare-index") === 1);
  assert.deepEqual(await page.evaluate("errors"), []);
});

for (const phase of ["reading", "shown"]) test(`SYS-51: a late Git decision preserves a new difference while ${phase}`, { timeout: 30_000 }, async t => {
  let reads = 0;
  const selected = (version: number) => ({ workspace_id: "ws", path: ["note.md"], side: version === 1 ? "worktree" : "index", revision: "r" + version,
    reference: { artifact_id: "fixed", version } });
  const f = await fixture(t, `<section data-work-surface="git" data-companion="git">${renderGitBrowserDirectory(L)}${renderGitBrowserResult(L)}</section>`, `
    const host={${companionHost("git")},reviews:{show:async(element,query,options)=>{window.decide=options.onDecision;}}};
    window.boot=()=>(${pageFactory("git")})(host);boot();
  `, path => {
    if (path.endsWith("/view-revision")) return { revision: "one" };
    if (path.endsWith("/summary")) return { summary: null, workspace: { workspace_id: "ws" } };
    if (path === "/api/host/plugin-page-actions") return { html: '<p data-current-diff>fixed difference</p>' };
    if (path === "/git/prepare-index") return {};
    if (path === "/git/diff") return { result: { outcome: "diff" }, selected: selected(++reads) };
    return { ...state("git"), view: { phase: "ready", head: "current", conflicts: [], staged: [], changes: [{ path: ["note.md"], label: "note.md" }] } };
  }); if (!f) return;
  const { page, count, blocked, pending } = f, diff = "POST /git/diff";
  await page.evaluate("parentView.hidden=false");
  await page.wait("document.querySelector('[data-git-path]') && !document.querySelector('[data-git-refresh]').disabled");
  await page.click("[data-git-path]"); await page.wait("!document.querySelector('[data-git-index-action]').hidden");
  await page.click("[data-git-index-action]"); await until(() => count("POST /git/prepare-index") === 1);
  await page.wait("!document.querySelector('[data-git-index-action]').disabled");
  const submittedHidden = await page.evaluate("document.querySelector('[data-git-index-action]').hidden");
  if (phase === "reading") blocked.add(diff);
  await page.click("[data-git-path]");
  if (phase === "reading") await until(() => pending.has(diff));
  else await page.wait("!document.querySelector('[data-git-index-action]').hidden && document.querySelector('[data-git-scope]').textContent.includes('暂存区')");
  await page.evaluate("decide('settled')");
  if (phase === "reading") pending.get(diff)![0]!.end(JSON.stringify({ result: { outcome: "diff" }, selected: selected(2) }));
  await page.wait("!document.querySelector('[data-git-index-action]').hidden && !document.querySelector('[data-git-refresh]').disabled");
  assert.equal(submittedHidden, true, "the submitted difference cannot create another review while it waits");
  assert.match(await page.evaluate<string>("document.querySelector('[data-git-scope]').textContent"), /暂存区/);
  await page.click("[data-git-index-action]"); await until(() => count("POST /git/prepare-index") === 2);
  assert.deepEqual(await page.evaluate("errors"), []);
});
