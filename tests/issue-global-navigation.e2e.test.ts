import assert from "node:assert/strict";
import test from "node:test";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { issueModel } from "./fixtures/issue-model.js";
import { ISSUE_FRAME, issueView, type IssueBrowser } from "./fixtures/issue-browser.js";

// Issue's way in is its glyph on the right side of the titlebar: its titlebar button left with the personal-tool slot (07-1 S4b).
const entry = '[data-side-tab="plugin:issues/capture"]';
const open = "document.body.dataset.sideOpen === 'true'", closed = "document.body.dataset.sideOpen === 'false'";

// Count the actual document requests at the fixture Host, including those from a hidden iframe.
function captureRequests(b: IssueBrowser) {
  const paths: string[] = [];
  b.server.on("request", req => {
    const url = new URL(req.url!, b.origin);
    if (url.pathname.endsWith("/side/issues/capture") || url.pathname === "/plugins/issues" && url.searchParams.get("side") === "capture") paths.push(url.pathname + url.search);
  });
  return paths;
}

async function expectClosedCapture(b: IssueBrowser, requests: readonly string[]) {
  await b.waitFor(closed);
  // Give any startup idle callback its turn, as on the measured first screen.
  await b.evaluate("new Promise(resolve => requestIdleCallback(resolve, {timeout: 4000}))");
  assert.deepEqual(requests, [], "a closed panel requests no capture document");
  assert.equal(await b.evaluate(`document.querySelector(${JSON.stringify(ISSUE_FRAME)}).getAttribute('src')`), null);
}

/** T405-FULL-03: one observation on refusal, without changing focus or the wait's bound. */
async function composerFocused(t: Parameters<typeof openGoalBrowser>[0], b: IssueBrowser, v: Awaited<ReturnType<typeof issueView>>) {
  try { await v.composerFocused(); }
  catch (error) {
    const child = await v.ask(`(() => {
      const input = $('[data-issue-composer] [name=description]'), style = input && d.defaultView.getComputedStyle(input);
      return { focus: d.hasFocus(), visibility: d.visibilityState, ready: d.readyState, active: d.activeElement?.outerHTML.slice(0, 260),
        input: input && { rects: input.getClientRects().length, bounds: input.getBoundingClientRect().toJSON(), disabled: input.disabled,
          hidden: !!input.closest('[hidden], [inert]'), display: style.display, visibility: style.visibility } };
    })()`).catch(String);
    const owners = await b.evaluate(`(() => {
      const describe = node => node && { tag: node.tagName, id: node.id, title: node.getAttribute('title'), side: node.getAttribute('data-side-body') };
      const frame = node => { const style = getComputedStyle(node); return { ...describe(node), src: new URL(node.src).pathname,
        rects: node.getClientRects().length, bounds: node.getBoundingClientRect().toJSON(), hidden: !!node.closest('[hidden], [inert]'),
        display: style.display, visibility: style.visibility }; };
      const outer = document.querySelector(${JSON.stringify(ISSUE_FRAME)}), owner = outer?.contentDocument;
      return { top: { focus: document.hasFocus(), visibility: document.visibilityState, active: describe(document.activeElement),
          sideOpen: document.body.dataset.sideOpen, selected: document.querySelector('[data-side-tab][aria-selected=true]')?.dataset.sideTab },
        outer: outer && frame(outer), owner: owner && { focus: owner.hasFocus(), visibility: owner.visibilityState, ready: owner.readyState,
          active: describe(owner.activeElement), children: [...owner.querySelectorAll('iframe')].slice(0, 4).map(frame) } };
    })()`).catch(String);
    t.diagnostic(`Issue composer focus: ${JSON.stringify({ child, owners })}`);
    throw error;
  }
}

/** The page and the panel side by side (or stacked on a phone), nothing cut off, the entry still clickable. */
async function beside(b: IssueBrowser, v: Awaited<ReturnType<typeof issueView>>, width: number, name: string) {
  await v.viewport(width, width < 600 ? 844 : 900); await b.waitFor(open);
  await v.shot(`${name}-${width}`);
  const geometry = await b.evaluate<Record<string, boolean>>(`(() => {
    const main = document.querySelector('[data-plugin-stage]').getBoundingClientRect(), panel = document.querySelector('[data-side-panel]').getBoundingClientRect();
    const raw = document.querySelector(${JSON.stringify(entry)});
    // In a project's Scheme C top strip (POLISH-01/02), side-view tabs live inside [data-side-menu] behind the visible [data-side-ear].
    const button = raw.closest('[data-side-menu]') ? document.querySelector('[data-side-ear]') : raw, box = button.getBoundingClientRect();
    return { visible: main.width > 200 && main.height > 100 && panel.height > 200, separate: innerWidth > 760 ? main.right <= panel.left : main.bottom <= panel.top,
      clickable: button.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)), fits: document.documentElement.scrollWidth <= innerWidth };
  })()`);
  assert.deepEqual(geometry, { visible: true, separate: true, clickable: true, fits: true }, `${name} at ${width}`);
  assert.equal(await v.ask("d.documentElement.scrollWidth <= d.documentElement.clientWidth"), true, `${name} panel content fits at ${width}`);
}

test("ISSUE-35 in a project the chord and the button summon Issue from the page and from inside other frames, and put it away from inside", { timeout: 120_000 }, async t => {
  const b = await openGoalBrowser(t, "user", undefined, undefined, undefined, undefined, {
    prepareHome: async homeDirectory => { await issueModel(t, homeDirectory); },
  }); if (!b) return;
  const v = await issueView(t, b, "issue-global-navigation");
  const requests = captureRequests(b);
  await v.viewport(1440); await v.go(`/projects/${b.projectId}/?desktop=1`);
  assert.equal(await b.evaluate(`document.querySelector(${JSON.stringify(entry)}).getAttribute('aria-keyshortcuts')`), "Meta+Shift+I");
  assert.match(await b.evaluate<string>(`document.querySelector(${JSON.stringify(entry)}).parentElement.title`), /Issue (⌘⇧I|Ctrl\+Shift\+I)/);
  await expectClosedCapture(b, requests);
  const url = await b.evaluate<string>("location.href");
  await v.chord(); await b.waitFor(open); await composerFocused(t, b, v);
  // The chord opens the personal space's Issues wherever it is pressed (R14, batch 108).
  assert.deepEqual(requests, ["/projects/personal/side/issues/capture"]);
  assert.equal(await b.evaluate("location.href"), url, "the work stays where it was");
  await beside(b, v, 1440, "project");
  // From inside the tool the chord puts it away and the keyboard goes back to the page.
  await v.chord(); await b.waitFor(closed);
  assert.equal(await b.evaluate("document.querySelector('[data-side-panel]').contains(document.activeElement)"), false);
  // The glyph opens it and brings the keyboard along; the chord from inside puts it away. (Its titlebar button was a switch; the
  // side's glyphs open, and the side closes from its chord, ⌘\ or the layout menu — 07-1 S4b.)
  await b.click(entry); await b.waitFor(open);
  await composerFocused(t, b, v);
  assert.equal(requests.length, 1, "reopening reuses the loaded view");
  await v.type("项目页里写了一半");
  await v.chord(); await b.waitFor(closed);
  // Pressed while the keyboard is inside another side view's frame, the chord still reaches the shell.
  const other = await b.evaluate<string | null>("document.querySelector('[data-side-tab^=\"plugin:\"]:not([data-side-keys])')?.dataset.sideTab ?? null");
  assert.ok(other, "a project offers another plugin side view to type in");
  {
    await b.evaluate(`document.dispatchEvent(new CustomEvent('molis:side-open', { detail: { tab: 'plugin', view: ${JSON.stringify(other.slice(7))} }, cancelable: true }))`);
    await b.waitFor(`document.querySelector('[data-side-body="${other}"] iframe')?.contentDocument?.readyState === 'complete' && 'loaded' in document.querySelector('[data-side-body="${other}"] iframe').dataset`, 15_000);
    await b.evaluate(`document.querySelector('[data-side-body="${other}"] iframe').focus()`);
    await v.chord();
    await b.waitFor(`document.querySelector('[data-side-tab="plugin:issues/capture"]').getAttribute('aria-selected') === 'true'`);
    await composerFocused(t, b, v);
  }
  assert.equal(await v.ask("$('[data-issue-composer] [name=description]').value"), "项目页里写了一半", "the draft was kept while closed");
  // The discussion is its own app in a frame; typing there, the chord still reaches the shell.
  await b.evaluate("document.dispatchEvent(new CustomEvent('molis:side-open', { detail: { tab: 'discussion' }, cancelable: true }))");
  await b.waitFor("document.querySelector('[data-side-body=\"discussion\"] iframe')?.contentDocument?.readyState === 'complete' && !!document.querySelector('[data-side-body=\"discussion\"] iframe').contentDocument.querySelector('[data-im-app]')", 15_000);
  await b.evaluate("document.querySelector('[data-side-body=\"discussion\"] iframe').focus()");
  await v.chord();
  await b.waitFor("document.querySelector('[data-side-tab=\"plugin:issues/capture\"]').getAttribute('aria-selected') === 'true'");
  await composerFocused(t, b, v);
  for (const width of [1024, 390, 320]) await beside(b, v, width, "project");

  // D-2: a target sent on the first open reaches the actual Issue detail inside the plugin frame.
  await v.viewport(1440);
  await b.click("[data-layout-open]"); await b.click("[data-layout-action=side]"); await b.waitFor(closed);
  const title = "Cold-open destination", description = "Issue selected before the panel document loads";
  const record = await v.api<{ id: string }>("/projects/personal/api/plugins/io.molis.work.issues/create", { title, description, type: "bug" });
  await v.go(`/projects/${b.projectId}/?desktop=1`);
  await b.waitFor(closed);
  assert.equal(await b.evaluate(`document.querySelector(${JSON.stringify(ISSUE_FRAME)}).getAttribute('src')`), null);
  await b.evaluate(`document.dispatchEvent(new CustomEvent('molis:side-open', { detail: {
    tab: 'plugin', view: 'issues/capture', target: {item: ${JSON.stringify(record.id)}} }, cancelable: true }))`);
  await v.until(`!$('[data-issue-detail]').hidden && $('[data-issue-title]').textContent === ${JSON.stringify(title)}`, 15_000);
  assert.equal(await v.ask("$('[data-issue-text]').textContent"), description);
});

test("ISSUE-31 ISSUE-35 on Home the draft survives closing and a full navigation, and Escape closes from the composer", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, "user", undefined, null); if (!b) return;
  const v = await issueView(t, b, "issue-global-navigation");
  const requests = captureRequests(b);
  await v.viewport(1440);
  await v.go("/onboarding");
  await expectClosedCapture(b, requests);
  await b.click(entry); await composerFocused(t, b, v);
  assert.deepEqual(requests, ["/projects/personal/side/issues/capture"]);
  requests.length = 0;
  await v.go("/");
  await expectClosedCapture(b, requests);
  await b.click(entry); await b.waitFor(open); await composerFocused(t, b, v);
  assert.deepEqual(requests, ["/projects/personal/side/issues/capture"]);
  await beside(b, v, 1440, "home");
  await v.type("首页写到一半，");
  await v.escape(); await b.waitFor(closed);
  assert.equal(await b.evaluate(`document.activeElement === document.querySelector(${JSON.stringify(entry)})`), true, "focus returns to what opened it");
  // Writing is kept on this device until it is sent, across pages that each have their own panel.
  await v.go(`/projects/${b.projectId}/?desktop=1`);
  await v.chord(); await b.waitFor(open); await composerFocused(t, b, v);
  assert.equal(await v.ask("$('[data-issue-composer] [name=description]').value"), "首页写到一半，");
  await v.go("/"); await v.chord(); await b.waitFor(open); await composerFocused(t, b, v);
  await v.type("接着写"); await v.go("/"); await v.chord(); await b.waitFor(open); await composerFocused(t, b, v);
  assert.equal(await v.ask("$('[data-issue-composer] [name=description]').value"), "首页写到一半，接着写");
  for (const width of [1024, 390, 320]) await beside(b, v, width, "home");
});

// RAC-2803: the two ISSUE-35 cases above remain complete, including other-side and discussion recall.
test("RAC-2801 RAC-2802: native search from the nested Issue composer keeps its draft and rejects invisible or foreign senders", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, "user", undefined, null); if (!b) return;
  const v = await issueView(t, b, "issue-global-navigation");
  await v.viewport(1440); await v.go(`/projects/${b.projectId}/?desktop=1`);
  await b.click(entry); await b.waitFor(open); await composerFocused(t, b, v);
  await v.type("Keep this unsent draft");
  await b.evaluate(`(() => { window.searchSenders=[]; window.issueSearchFrame=document.querySelector(${JSON.stringify(ISSUE_FRAME)});
    addEventListener('message', event => { if(event.data?.type==='molis:side-key') { const f=window.issueSearchFrame, body=f.closest('[data-side-body]');
      window.searchSenders.push({keys:event.data.keys,origin:event.origin===location.origin,source:event.source===f.contentWindow,
        connected:f.isConnected,visible:!body.hidden&&!body.closest('[inert]')&&document.body.dataset.sideOpen==='true',current:body.dataset.sideBody===document.querySelector('[data-side-tab][aria-selected=true]')?.dataset.sideTab}); } }); })()`);
  await v.ask(`(() => { window.nativeSearchKeys=[]; d.addEventListener('keydown',e=>{if(['KeyK','KeyF'].includes(e.code))window.nativeSearchKeys.push({trusted:e.isTrusted,code:e.code,meta:e.metaKey,prevented:e.defaultPrevented,composing:e.isComposing,repeat:e.repeat,focused:d.activeElement===e.target});});return true; })()`);
  const press = async (code: string, modifiers = 4) => {
    for (const type of ['keyDown','keyUp']) await b.command('Input.dispatchKeyEvent', {type,code,key:code==='Escape'?'Escape':code.slice(3).toLowerCase(),modifiers,
      windowsVirtualKeyCode:code==='Escape'?27:code.charCodeAt(3)}, b.sessionId);
  };
  const closedSearch = "!document.querySelector('[data-global-search-dialog]').open";
  const openedSearch = "document.querySelector('[data-global-search-dialog]').open && document.activeElement===document.querySelector('[data-global-search]')";
  for (const code of ['KeyK','KeyF']) {
    await v.press('[data-issue-composer] [name=description]');
    await press(code); await b.waitFor(openedSearch);
    await b.evaluate('new Promise(resolve=>setTimeout(resolve,100))');
    assert.equal(await b.evaluate(openedSearch), true, 'one chord must not toggle search twice');
    await press('Escape',0); await b.waitFor(closedSearch);
    assert.equal(await b.evaluate(open), true);
  }
  const receipts=await v.ask<Array<Record<string,unknown>>>('window.nativeSearchKeys');
  t.diagnostic('RAC-2801 native receipts: '+JSON.stringify(receipts));
  assert.deepEqual(receipts.map(r=>({trusted:r.trusted,meta:r.meta,prevented:r.prevented,composing:r.composing,repeat:r.repeat,focused:r.focused})),
    Array.from({length:2},()=>({trusted:true,meta:true,prevented:false,composing:false,repeat:false,focused:true})));
  assert.deepEqual(await b.evaluate('window.searchSenders'), ['Mod+K','Mod+F'].map(keys=>({keys,origin:true,source:true,connected:true,visible:true,current:true})));
  await v.press('[data-issue-composer] [name=description]'); await v.type("; continued");
  assert.equal(await v.ask("$('[data-issue-composer] [name=description]').value"), "Keep this unsent draft; continued");
  assert.equal(await b.evaluate(`window.issueSearchFrame===document.querySelector(${JSON.stringify(ISSUE_FRAME)})`), true);

  // Protocol probes exercise the actual shell listener; these are not native-input evidence.
  const probe = async (setup: string, keys = 'Mod+K', origin = 'location.origin', source = 'window.issueSearchFrame.contentWindow') => {
    await b.evaluate(`(() => { ${setup}; window.dispatchEvent(new MessageEvent('message',{origin:${origin},source:${source},data:{type:'molis:side-key',keys:${JSON.stringify(keys)}}})); })()`);
    await b.evaluate('new Promise(resolve=>setTimeout(resolve,100))');
    assert.equal(await b.evaluate(closedSearch), true, `source boundary: ${setup || keys}`);
  };
  await probe('', 'Mod+Shift+K');
  await probe('', 'Mod+K', "'https://wrong-origin.invalid'");
  await probe("const frame=document.createElement('iframe');frame.id='foreign-shortcut';document.body.append(frame)", 'Mod+K', 'location.origin', "document.querySelector('#foreign-shortcut').contentWindow");
  await probe("window.issueSearchFrame.closest('[data-side-body]').hidden=true");
  await b.evaluate("window.issueSearchFrame.closest('[data-side-body]').hidden=false");
  await probe("window.issueSearchFrame.style.visibility='hidden'");
  await b.evaluate("window.issueSearchFrame.style.visibility=''");
  await probe("window.issueSearchFrame.closest('[data-side-body]').inert=true");
  await b.evaluate("window.issueSearchFrame.closest('[data-side-body]').inert=false");
  await probe("window.issueSearchFrame.closest('[data-side-body]').dataset.sideBody='plugin:inactive/probe'");
  await b.evaluate("window.issueSearchFrame.closest('[data-side-body]').dataset.sideBody='plugin:issues/capture'");
  // The probes above took the keyboard out of the tool, so the side closes from the layout menu (its titlebar button that did
  // this left in 07-1 S4b).
  await b.click("[data-layout-open]"); await b.click("[data-layout-action=side]"); await b.waitFor(closed);
  await probe(''); // mounted but panel closed
  await b.click(entry); await b.waitFor(open);
  await probe("window.removedSearchSource=window.issueSearchFrame.contentWindow;window.issueSearchFrame.remove()", 'Mod+K', 'location.origin', 'window.removedSearchSource');
});

test("UPP-30 B2R-09 capture a task in personal space after confirmation, then find its owner from the overview", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, "user", undefined, null, undefined, undefined, { projectPlugins: ["todo"] });
  if (!b) return;
  const todo = await pluginFrameBrowser(t, b, "todo");
  const visit = (path: string) => b.navigate(() => b.command("Page.navigate", { url: b.origin + path }, b.sessionId));
  await visit("/projects/" + b.projectId + "/");
  const panel = "[data-personal-tasks=capture]";
  const member = async () => (await b.web.get<{ projects: {project_id: string; plugins: string[]}[] }>("/api/settings/project-plugins"))
    .projects.find(row => row.project_id === "personal")!.plugins.includes("todo");
  assert.equal(await member(), false);
  await b.click(panel + " summary"); await b.waitFor("document.querySelectorAll('[data-personal-tasks-body] button').length === 2");
  await b.click(panel + " button:last-child"); assert.equal(await member(), false);
  await b.click(panel + " summary");
  await b.waitFor("document.querySelectorAll('[data-personal-tasks-body] button').length === 2");
  await b.click(panel + " button:first-of-type");
  await b.waitFor("!!document.querySelector('[data-personal-tasks-body] form input')");
  await b.evaluate("document.querySelector('[data-personal-tasks-body] form input').value='B2 personal capture'");
  await b.click(panel + " form button");
  await b.waitFor("!document.querySelector('[data-personal-tasks-body] form')");
  assert.equal(await member(), true);
  await b.web.post("/projects/" + b.projectId + "/api/plugins/io.molis.work.todo/items", { title: "B2 project task" });
  await visit("/projects/personal/");
  const { runningPartitionPlatformServices } = await import("@molis-ai/molis-work-app-local-host");
  const { installIdentity } = await import("@molis-ai/molis-work-plugin-runtime");
  const { todoManifest } = await import("@molis-ai/molis-work-plugin-todo");
  const { refreshedOverview } = await import("./fixtures/overview-read.js");
  await refreshedOverview(() => b.web.post("/api/runtime/overview/read", { kinds: ["task"] }));
  const overview = runningPartitionPlatformServices(b.homeDirectory)!.overview;
  for (const id of ["personal", b.projectId!]) overview.markDirty(id, installIdentity(todoManifest));
  await b.click("[data-personal-tasks=overview] summary");
  await b.waitFor("!!document.querySelector('[data-personal-tasks-body] [role=status]')");
  assert.equal(await b.evaluate("document.querySelectorAll('[data-personal-tasks-body] a').length"), 0);

  await b.waitFor("document.querySelector('[data-personal-tasks-body]')?.textContent.includes('B2 project task')");
  const links = await b.evaluate<{ title: string; url: string }[]>("Array.from(document.querySelectorAll('[data-personal-tasks-body] a'), a => ({ title: a.textContent, url: a.href }))");
  assert.equal(new URL(links.find(row => row.title.includes("B2 personal capture"))!.url).pathname, "/projects/personal/");
  const owner = new URL(links.find(row => row.title.includes("B2 project task"))!.url);
  assert.equal(owner.pathname, "/projects/" + b.projectId + "/");
  await b.navigate(() => b.click("[data-personal-tasks-body] a[href^='/projects/" + b.projectId + "/']"));
  await todo.waitFor("document.querySelector('[data-todo-field=title]')?.value === 'B2 project task'");
});
