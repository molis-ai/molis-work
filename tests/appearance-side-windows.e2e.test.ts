import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import type { ServerResponse } from "node:http";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { deferred } from "./fixtures/home-runtime.js";
import { issueView, ISSUE_FRAME, type IssueBrowser } from "./fixtures/issue-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { openPagesStore, openPptStore } from "./fixtures/plugin-home-stores.js";
import { setProjectOutputFolder } from "./fixtures/project-directories-http.js";

const appearance = "/api/ui/appearance";
const stylesheet = "/assets/ui-skin/folio-1.css";
const issueDocument = `document.querySelector(${JSON.stringify(ISSUE_FRAME)})?.contentDocument`;
const sideReady = `typeof document.querySelector(${JSON.stringify(ISSUE_FRAME)})?.contentWindow?.molisWorkRestoreAppearance === 'function'`;
const issueInput = "[data-issue-composer] [name=description]";

/** As in the single-Home browser fixture, only the unconfigured account and sync facts are stubbed. */
function singleHomeAccounts(b: IssueBrowser) {
  const handlers = b.server.listeners("request");
  b.server.removeAllListeners("request");
  b.server.on("request", (request, response) => {
    const result = request.method === "GET" && (request.url === "/api/personal/status"
      ? { configured: false, identity: null, ready: true, space: "local", syncEnabled: false }
      : request.url === "/api/sync" ? { available: false, reason: "本地空间不参与同步，请先切换到个人空间。" } : null);
    if (result) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(result));
    } else for (const handler of handlers) handler.call(b.server, request, response);
  });
}

async function openTab(t: TestContext, b: IssueBrowser, path: string, plugin?: string) {
  const { targetId } = await b.command<{ targetId: string }>("Target.createTarget", { url: "about:blank", newWindow: true });
  t.after(async () => { await b.command("Target.closeTarget", { targetId }).catch(() => undefined); });
  const { sessionId } = await b.command<{ sessionId: string }>("Target.attachToTarget", { targetId, flatten: true });
  await b.command("Page.enable", {}, sessionId);
  await b.command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  const evaluate = async <T = unknown>(expression: string): Promise<T> => {
    const result = await b.command<{ result: { value: T }; exceptionDetails?: unknown }>("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId);
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const wait = (expression: string) => evaluate(`new Promise((resolve, reject) => {
    const deadline = Date.now() + 10000;
    const check = () => {
      if (${expression}) resolve(true);
      else if (Date.now() > deadline) reject(new Error(${JSON.stringify(expression)}));
      else setTimeout(check, 25);
    };
    check();
  })`);
  const child = plugin ? await pluginFrameBrowser(t, { ...b, sessionId, evaluate }, plugin) : undefined;
  await b.command("Target.activateTarget", { targetId });
  await b.navigate(() => b.command("Page.navigate", { url: b.origin + path }, sessionId), sessionId);
  await wait("typeof molisWorkRestoreAppearance === 'function'");
  return { evaluate, wait, child, targetId };
}

function observeAppearance(b: IssueBrowser) {
  const streams = new Map<ServerResponse, URL>();
  const opened: URL[] = [], reads: Array<{ source: URL; status: number }> = [];
  let onStream: ((response: ServerResponse, source: URL) => void) | undefined;
  b.server.prependListener("request", (request, response) => {
    if (request.method !== "GET") return;
    const pathname = new URL(request.url ?? "/", b.origin).pathname;
    const source = new URL(request.headers.referer ?? "/", b.origin);
    if (pathname === appearance + "/events") {
      opened.push(source);
      streams.set(response, source);
      response.once("close", () => streams.delete(response));
      onStream?.(response, source);
    } else if (pathname === appearance) response.once("finish", () => reads.push({ source, status: response.statusCode }));
  });
  return { streams, opened, reads, onStream(callback: typeof onStream) { onStream = callback; } };
}

async function seedOutputFile(b: IssueBrowser, projectId: string) {
  const directory = join(b.homeDirectory, "appearance-window-files"), filename = "appearance-windows.txt", original = "保留 Files 原文 A & B\n";
  await mkdir(directory);
  await writeFile(join(directory, filename), original);
  const { workspace_id } = await setProjectOutputFolder(b.web, projectId, directory);
  return { original, objectId: `${workspace_id}:${filename}` };
}

type OutputFile = Awaited<ReturnType<typeof seedOutputFile>>;

/** The project's output file read in the side panel's Files tab, the shell's materials reader that took over from the Files plugin (batch 06). */
async function readOutputFile(tab: Awaited<ReturnType<typeof openTab>>, { original, objectId }: OutputFile) {
  const row = JSON.stringify(`[data-side-file][data-kind="workspace_file"][data-id=${JSON.stringify(objectId)}]`);
  // The same two presses as shell-file-preview and side-materials-reader: the tab now selected, then Files.
  await tab.evaluate("document.querySelector('[data-side-tabs] [data-side-tab][aria-selected=true]').click()");
  await tab.evaluate("document.querySelector('[data-side-tab=files]').click()");
  await tab.wait(`Boolean(document.querySelector(${row}))`);
  await tab.evaluate(`document.querySelector(${row}).click()`);
  await tab.wait(`document.querySelector('[data-side-files-body]')?.textContent === ${JSON.stringify(original)}`);
}

/**
 * A new window on the project that reads the file. The retired Files plugin had a direct link (`?openPlugin=files`); the materials
 * reader has no object link yet (BL-materials-object-link), so the window reads it from its side panel.
 */
async function openOutputFile(t: TestContext, b: IssueBrowser, workbench: string, file: OutputFile) {
  const tab = await openTab(t, b, workbench);
  await readOutputFile(tab, file);
  return tab;
}

test("FSS-06 FSS-07 three Workbench windows with preloaded Issues still read a project file and a fourth can read it too", { timeout: 100_000 }, async t => {
  // Keep the real Web Host's catalog directory ports so the materials reader reads the configured output.
  const b = await openGoalBrowser(t, "seeded", undefined, undefined, undefined, undefined, {}, undefined,
    ["--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"]);
  if (!b) return;
  assert.ok(b.projectId);
  const project = `/projects/${b.projectId}`, workbench = project + "/";
  const page = openPagesStore(b.homeDirectory), decks = openPptStore(b.homeDirectory);
  const note = page.create({ project_id: b.projectId, title: "保留页面", body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "打开 Pages" }] }] } });
  const deck = decks.create({ project_id: b.projectId, title: "保留演示稿" });
  decks.update(deck.id, { slides: [{ id: deck.slides[0]!.id, title: "打开 PPT", bullets: [], notes: "" }] }, b.projectId);
  page.close(); decks.close();
  const file = await seedOutputFile(b, b.projectId);
  singleHomeAccounts(b);
  const traffic = observeAppearance(b);

  await b.setViewport(1440, 950);
  const pages = await pluginFrameBrowser(t, b, "pages");
  await b.navigate(() => b.command("Page.navigate", { url: b.origin + workbench + "?openPlugin=pages&openItem=" + note.id }, b.sessionId));
  await pages.waitFor("document.querySelector('[data-pages-editor] .ProseMirror')?.textContent === '打开 Pages'");
  await b.waitFor(sideReady);
  const ppt = await openTab(t, b, workbench + "?openPlugin=ppt&openItem=" + deck.id, "ppt");
  await ppt.child!.waitFor("document.querySelector('[data-ppt-preview] .ppt-card h2')?.textContent === '打开 PPT'");
  await ppt.wait(sideReady);

  const files = await openTab(t, b, workbench);
  await files.wait(sideReady);
  await readOutputFile(files, file);
  const third = traffic.streams.size;
  const direct = await openOutputFile(t, b, workbench, file);
  await direct.wait(sideReady);
  assert.ok(traffic.opened.every(source => source.pathname === workbench), "preloaded Issues has no additional HTTP stream");
  assert.ok(third > 0 && third <= 3 && traffic.streams.size <= 4);
  t.diagnostic(JSON.stringify({ third, fourth: traffic.streams.size, embeddedStreams: traffic.opened.filter(source => source.pathname !== workbench).length }));
});

test("FSS-06 FSS-07 three chooser windows keep their selected project and leave a connection for a project file", { timeout: 100_000 }, async t => {
  const b = await openGoalBrowser(t, "seeded", undefined, undefined, undefined, undefined, {}, undefined,
    ["--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"]);
  if (!b) return;
  assert.ok(b.projectId);
  const project = `/projects/${b.projectId}`, side = "/plugins/issues?side=capture";
  const file = await seedOutputFile(b, b.projectId);
  singleHomeAccounts(b);
  const traffic = observeAppearance(b), chooserConnected = deferred();
  traffic.onStream(() => {
    if ([...traffic.streams.values()].filter(source => source.pathname === "/").length === 3) chooserConnected.resolve();
  });

  const card = `document.getElementById(${JSON.stringify(`row-${b.projectId}`)})`;
  const selected = `location.pathname === '/' && document.body.dataset.arrival === 'chooser'
    && document.body.dataset.projectId === ${JSON.stringify(b.projectId)}
    && document.body.dataset.routePrefix === ${JSON.stringify(project)} && ${card}?.getAttribute('aria-selected') === 'true'`;
  const ready = `${selected} && ${sideReady}`;
  await b.setViewport(1440, 950);
  await b.navigate(() => b.command("Page.navigate", { url: b.origin + "/" }, b.sessionId));
  await b.waitFor(ready);
  const second = await openTab(t, b, "/");
  await second.wait(ready);
  const third = await openTab(t, b, "/");
  await third.wait(ready);
  const choosers = [{ evaluate: b.evaluate, wait: b.waitFor }, second, third];
  for (const chooser of choosers) await chooser.evaluate(`window.originalChooserSide = ${issueDocument}`);
  await chooserConnected.promise;

  const chooserStreams = [...traffic.streams.values()].map(source => source.pathname + source.search);
  t.diagnostic(JSON.stringify({ chooserStreams }));
  const fourth = await openOutputFile(t, b, project + "/", file);
  assert.deepEqual(chooserStreams, ["/", "/", "/"]);
  assert.equal(traffic.streams.size, 4);
  assert.ok(traffic.opened.every(source => source.pathname === "/" || source.pathname === project + "/"));

  const readsBeforeChange = traffic.reads.length;
  const change = await fourth.evaluate<{ receipt: { selection_revision: number } }>(`molisWorkRequest('${appearance}', { body: {
    request_id: 'chooser-window-folio', expected_revision: 0, choice: { kind: 'selection', selection: {
      skin: { id: 'folio', revision: 1 }, font: { policy: 'follow-skin' }, mono: null } } } })`);
  assert.equal(change.receipt.selection_revision, 1);
  for (const chooser of choosers) {
    await chooser.wait(`${issueDocument}?.documentElement.dataset.uiSkin === 'folio@1'`);
    assert.equal(await chooser.evaluate(`${selected} && window.originalChooserSide === ${issueDocument}`), true);
  }
  const sideReads = traffic.reads.slice(readsBeforeChange).filter(({ source, status }) => source.pathname + source.search === side && status === 200);
  assert.ok(sideReads.length >= 3, "each embedded Home side reads with its own authorized page");
  t.diagnostic(JSON.stringify({ fourthStreams: traffic.streams.size, sideReads: sideReads.length }));
});

test("FSS-07 FSS-27 a side view reads after the parent reconnects and applies appearance even when the parent cannot", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, "user", undefined, null);
  if (!b) return;
  assert.ok(b.projectId);
  const project = `/projects/${b.projectId}`, side = project + "/side/issues/capture";
  const topPath = project + "/", directPath = side + "?standalone=1";
  singleHomeAccounts(b);
  const traffic = observeAppearance(b), reconnected = deferred(), directConnected = deferred();
  let waitingForReconnect = false;
  traffic.onStream((_, source) => {
    if (waitingForReconnect && source.pathname === topPath) reconnected.resolve();
    if (source.pathname === side && source.searchParams.has("standalone")) directConnected.resolve();
  });

  await b.setViewport(1440, 950);
  const issue = await issueView(t, b);
  await issue.go(topPath);
  await b.click('[data-side-tab="plugin:issues/capture"]');
  await issue.composerFocused();
  const draft = "父窗加载外观失败时保留此草稿";
  await issue.type(draft);
  const frameId = await issue.frame.frameId();
  await b.evaluate(`window.originalAppearanceSide = ${issueDocument}`);
  const direct = await openTab(t, b, directPath);
  assert.equal(await direct.evaluate("document.body.dataset.sideView"), "issues");
  await directConnected.promise;
  const { targetInfo } = await b.command<{ targetInfo: { targetId: string } }>("Target.getTargetInfo", {}, b.sessionId);
  await b.command("Target.activateTarget", { targetId: targetInfo.targetId });
  const original = [...traffic.streams].find(([, source]) => source.pathname === topPath)?.[0];
  assert.ok(original, "the owning Workbench opened its authorized stream");
  const topStreams = () => traffic.opened.filter(source => source.pathname === topPath).length;
  const streamsBefore = topStreams();
  waitingForReconnect = true;
  original.end();
  await reconnected.promise;
  assert.equal(topStreams(), streamsBefore + 1);

  const { frameTree } = await b.command<{ frameTree: { frame: { id: string } } }>("Page.getFrameTree", {}, b.sessionId);
  let parentFailures = 0;
  const transportErrors: unknown[] = [];
  t.after(b.on("Fetch.requestPaused", ({ requestId, frameId }, session) => {
    if (session !== b.sessionId) return;
    const fail = frameId === frameTree.frame.id;
    if (fail) parentFailures++;
    void b.command(fail ? "Fetch.failRequest" : "Fetch.continueRequest", fail ? { requestId, errorReason: "Failed" } : { requestId }, b.sessionId)
      .catch(error => transportErrors.push(error));
  }));
  await b.command("Network.setCacheDisabled", { cacheDisabled: true }, b.sessionId);
  await b.command("Fetch.enable", { patterns: [{ urlPattern: b.origin + stylesheet, resourceType: "Stylesheet" }] }, b.sessionId);
  const change = await direct.evaluate<{ receipt: { selection_revision: number } }>(`molisWorkRequest('${appearance}', { body: {
    request_id: 'side-window-folio', expected_revision: 0, choice: { kind: 'selection', selection: {
      skin: { id: 'folio', revision: 1 }, font: { policy: 'follow-skin' }, mono: null } } } })`);
  assert.equal(change.receipt.selection_revision, 1);
  await b.waitFor("document.querySelector('[data-appearance-notice]')?.hidden === false");
  assert.equal(await b.evaluate("document.documentElement.dataset.uiSkin"), "soft-workbench@1");
  assert.ok(parentFailures > 0);
  await b.waitFor(`${issueDocument}?.getElementById('ui-environment')?.dataset.selectionRevision === '1'`);
  await issue.until("d.documentElement.dataset.uiSkin === 'folio@1'");
  assert.equal(await b.evaluate(`window.originalAppearanceSide === ${issueDocument}`), true);
  assert.equal(await issue.frame.frameId(), frameId);
  assert.equal(await issue.ask(`$('${issueInput}').value`), draft);
  assert.ok(traffic.reads.some(({ source, status }) => source.pathname === side && !source.searchParams.has("standalone") && status === 200), "the embedded side reads through its own authorized document");
  assert.ok(traffic.opened.every(source => source.pathname !== side || source.searchParams.has("standalone")));
  await b.command("Fetch.disable", {}, b.sessionId);
  assert.deepEqual(transportErrors, []);
  const readsBeforeRetry = traffic.reads.length;
  await b.click("[data-appearance-read]");
  await b.waitFor("document.documentElement.dataset.uiSkin === 'folio@1' && document.querySelector('[data-appearance-notice]').hidden");
  assert.ok(traffic.reads.slice(readsBeforeRetry).some(({ source, status }) => source.pathname === topPath && status === 200));
  assert.equal(await issue.ask(`$('${issueInput}').value`), draft);

  await b.evaluate(`molisWorkRequest('${appearance}', { body: { request_id: 'side-window-restore', expected_revision: 1, choice: { kind: 'restore' } } })`);
  await b.command("Target.activateTarget", { targetId: direct.targetId });
  await direct.wait("document.getElementById('ui-environment').dataset.selectionRevision === '2' && document.documentElement.dataset.uiSkin === 'soft-workbench@1'");
  assert.ok(traffic.reads.some(({ source, status }) => source.searchParams.has("standalone") && status === 200));
  t.diagnostic(JSON.stringify({ parentStreams: topStreams(), parentFailures, authorizedSideRead: true, sameIssueFrame: true, standaloneRead: true }));
});
