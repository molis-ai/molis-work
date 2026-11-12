import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import { join } from "node:path";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { issueView, ISSUE_FRAME } from "./fixtures/issue-browser.js";
import { deferred } from "./fixtures/home-runtime.js";

const candidate = '[data-look-card="folio"] .mw-look-card__pick';
const proof = "document.querySelector('.mw-look-proof')";
const pageSkin = "document.documentElement.dataset.uiSkin";
const choice = "document.getElementById('ui-environment')?.dataset.selectionRevision";
const folio = "folio@1";
const soft = "soft-workbench@1";

function luminance(color: string): number {
  const channels = color.match(/[\d.]+/gu)?.map(Number) ?? [];
  assert.ok(channels.length >= 3, color);
  return [0.2126, 0.7152, 0.0722].reduce((sum, weight, index) => {
    const value = channels[index]! / 255;
    return sum + weight * (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  }, 0);
}

test("FSS-01 FSS-02 FSS-08 FSS-20 FSS-27 FSS-28 FSS-32 real settings prepare a local specimen, then publish and recover without reloading the Issues frame", { timeout: 140_000 }, async t => {
  const b = await openGoalBrowser(t, "user", undefined, null);
  if (!b) return;
  const issue = await issueView(t, b, "batch-16-appearance");
  const requests: string[] = [];
  const recoveryReads: string[] = [];
  await b.command("Network.enable", {}, b.sessionId);
  t.after(b.on("Network.requestWillBeSent", params => {
    const request = params.request as { url: string };
    if (!request.url.startsWith(b.origin)) return;
    const url = new URL(request.url);
    requests.push(url.pathname);
    const id = url.searchParams.get("request_id");
    if (url.pathname === "/api/ui/appearance" && id) recoveryReads.push(id);
  }));
  await b.setViewport(1440, 940);
  await b.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }, { name: "prefers-color-scheme", value: "light" }] }, b.sessionId);
  await issue.go(`/projects/${b.projectId}/?desktop=1&settings=appearance`);
  await b.waitFor(`document.querySelector(${JSON.stringify(candidate)})?.getClientRects().length && typeof molisWorkRestoreAppearance === 'function'`);
  await b.click('[data-side-tab="plugin:issues/capture"]');
  await issue.composerFocused();
  const originalFrame = await issue.frame.frameId();
  await issue.type("保留这段 Issue 草稿");
  assert.equal(await issue.ask("$('[data-issue-composer] [name=description]').value"), "保留这段 Issue 草稿");
  assert.equal(await b.evaluate(pageSkin), soft);
  assert.equal(await issue.ask("d.documentElement.dataset.uiSkin"), soft);
  assert.equal(await b.evaluate("getComputedStyle(document.querySelector('[data-appearance-settings]')).getPropertyValue('--appearance-use-sheet').trim()"), "1");
  assert.equal(requests.filter(path => path.includes("/folio-") && path.endsWith(".woff2")).length, 0, "Soft requests no Folio face");
  assert.equal(existsSync(join(b.homeDirectory, "interface", "state.json")), false);

  let failFace = true, refusedFaces = 0;
  const requestListeners = b.server.listeners("request");
  b.server.removeAllListeners("request");
  b.server.on("request", (request, response) => {
    if (failFace && request.url === "/assets/folio-nunito-latin.woff2") {
      refusedFaces += 1;
      response.writeHead(503, { "cache-control": "no-store" });
      response.end();
      return;
    }
    for (const listener of requestListeners) listener.call(b.server, request, response);
  });
  await b.click(candidate);
  await b.waitFor("document.querySelector('[data-appearance-proof-sheet]').open");
  try { await b.waitFor(`${proof}.dataset.state === 'failed'`, 16_000); }
  catch (error) {
    t.diagnostic(JSON.stringify({ refusedFaces, fonts: await b.evaluate(`[...document.fonts].map(face => [face.family, face.status])`),
      proof: await b.evaluate(`({ state: ${proof}.dataset.state, fonts: getComputedStyle(${proof}.querySelector('.mw-look-proof__canvas')).getPropertyValue('--mw-shipped-families') })`) }));
    throw error;
  }
  assert.ok(refusedFaces > 0, "the real font route failed before the candidate became unusable");
  assert.equal(await b.evaluate("document.querySelector('[data-look-apply]').disabled"), true);
  assert.equal(await b.evaluate(pageSkin), soft);
  failFace = false;
  await b.click("[data-look-retry]");
  await b.waitFor(`${proof}.dataset.state === 'ready'`);
  assert.equal(await b.evaluate(`getComputedStyle(${proof}.querySelector('.mw-look-proof__canvas')).getPropertyValue('--page').trim()`), "#f4ede2");
  assert.ok(await b.evaluate<number>(`${proof}.querySelector('.mw-look-proof__sheet').getBoundingClientRect().width`) > 270, "split settings keep a readable specimen in the same sheet");
  assert.equal(await b.evaluate(pageSkin), soft);
  assert.equal(await issue.ask("d.documentElement.dataset.uiSkin"), soft);
  assert.equal(existsSync(join(b.homeDirectory, "interface", "state.json")), false);
  await issue.shot("01-folio-specimen");

  await b.click("[data-look-cancel]");
  await b.waitFor(`${proof}.dataset.state === 'idle'`);
  assert.equal(await b.evaluate(choice), "0");
  await b.click(candidate);
  await b.waitFor(`${proof}.dataset.state === 'ready'`);
  await b.click("[data-look-apply]");
  await b.waitFor(`${pageSkin} === '${folio}' && ${choice} === '1'`);
  const outer = `document.querySelector(${JSON.stringify(ISSUE_FRAME)})?.contentDocument?.documentElement`;
  await b.waitFor(`${outer}?.dataset.uiSkin === '${folio}'`);
  await issue.until(`d.documentElement.dataset.uiSkin === '${folio}'`);
  assert.equal(await issue.frame.frameId(), originalFrame);
  assert.equal(await issue.ask("$('[data-issue-composer] [name=description]').value"), "保留这段 Issue 草稿");
  assert.equal(await b.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--page').trim()"), "#f4ede2");
  assert.match(await issue.ask<string>("getComputedStyle(d.documentElement).getPropertyValue('--font')"), /Nunito Variable/u);
  assert.ok(requests.some(path => path === "/assets/folio-nunito-latin.woff2"));
  await issue.shot("02-folio-workbench-and-issues");
  const toast = `() => {
    const host = document.querySelector('[data-appearance-notice]');
    const css = key => getComputedStyle(host.querySelector(key)).color;
    return { ground: getComputedStyle(host).backgroundColor, message: css('[data-appearance-message]'),
      undo: css('[data-appearance-undo]'), dismiss: css('[data-appearance-dismiss] svg') };
  }`;
  for (const theme of ["light", "dark"]) {
    await b.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }, { name: "prefers-color-scheme", value: theme }] }, b.sessionId);
    await b.waitFor(`document.documentElement.dataset.resolvedTheme === '${theme}'`);
    const colors = await b.evaluate<{ ground: string; message: string; undo: string; dismiss: string }>(`(${toast})()`);
    assert.equal(colors.undo, colors.message);
    assert.equal(colors.dismiss, colors.message);
    const text = luminance(colors.message), ground = luminance(colors.ground);
    assert.ok((Math.max(text, ground) + 0.05) / (Math.min(text, ground) + 0.05) >= 4.5, JSON.stringify(colors));
    await issue.shot(`workbench-issues-receipt-${theme}`);
  }

  // Same hook that the native tray invokes on the current trusted WebView.
  await b.evaluate("molisWorkRestoreAppearance()");
  await b.waitFor("document.querySelector('[data-appearance-recovery]').open");
  assert.equal(await b.evaluate("document.querySelector('[data-appearance-recovery]').dataset.uiSkin"), soft);
  await b.click("[data-appearance-recover]");
  await b.waitFor(`${pageSkin} === '${soft}' && ${choice} === '2'`);
  await issue.until(`d.documentElement.dataset.uiSkin === '${soft}'`);
  await b.click("[data-appearance-undo]");
  await b.waitFor(`${pageSkin} === '${folio}' && ${choice} === '3'`);
  await issue.until(`d.documentElement.dataset.uiSkin === '${folio}'`);
  assert.equal(await issue.frame.frameId(), originalFrame);
  assert.equal(await issue.ask("$('[data-issue-composer] [name=description]').value"), "保留这段 Issue 草稿");

  // A candidate holds its exact pinned font while a second, independently authorized document commits a new choice.
  await b.click('[data-appearance-font="system-sans"]');
  await b.waitFor(`${proof}.dataset.state === 'ready'`);
  await b.evaluate(`document.querySelector(${JSON.stringify(ISSUE_FRAME)}).contentWindow.molisWorkRequest('/api/ui/appearance', {
    body: {expected_revision: 3, request_id: 'from-the-issues-document', choice: {kind:'restore'}}})`);
  await b.waitFor(`${pageSkin} === '${soft}' && ${choice} === '4' && ${proof}.dataset.state === 'conflict'`);
  assert.equal(await b.evaluate(`${proof}.querySelector('.mw-look-proof__canvas').dataset.uiSkin`), folio);
  assert.equal(await b.evaluate(`${proof}.querySelector('.mw-look-proof__canvas').dataset.uiFont`), "system-sans@1");
  assert.equal(await b.evaluate("document.querySelector('[data-look-apply]').textContent.trim()"), "仍然用上");

  // Lose the HTTP reply after the actual Host has committed. Only the original request is checked by GET.
  await b.evaluate(`(() => {
    const fetchOriginal = window.fetch;
    window.appearanceCalls = { writes: [], receipts: [] };
    window.fetch = async (input, options) => {
      const url = new URL(input, location.href);
      const response = await fetchOriginal(input, options);
      if (url.pathname === '/api/ui/appearance' && options?.method === 'POST') {
        appearanceCalls.writes.push(JSON.parse(options.body));
        await response.text();
        throw new TypeError('reply lost after server write');
      }
      if (url.pathname === '/api/ui/appearance' && url.searchParams.has('request_id')) appearanceCalls.receipts.push(url.searchParams.get('request_id'));
      return response;
    };
  })()`);
  await b.click("[data-look-apply]");
  await b.waitFor(`${pageSkin} === '${folio}' && ${choice} === '5'`);
  assert.equal(await b.evaluate("document.documentElement.dataset.uiFont"), "system-sans@1");
  const calls = await b.evaluate<{ writes: { expected_revision: number; request_id: string }[]; receipts: string[] }>("appearanceCalls");
  assert.equal(calls.writes.length, 1);
  assert.equal(calls.writes[0]!.expected_revision, 4);
  assert.deepEqual(calls.receipts, [calls.writes[0]!.request_id]);
  await issue.until(`d.documentElement.dataset.uiSkin === '${folio}' && d.documentElement.dataset.uiFont === 'system-sans@1'`);
  assert.equal(await issue.frame.frameId(), originalFrame);

  // Hold the real Host reply after its commit, then exercise the browser's pagehide/pageshow handlers in that gap.
  await b.evaluate(`(() => {
    window.appearanceCalls = { writes: [], receipts: [] };
    const activeFetch = window.fetch;
    window.fetch = async (input, options) => {
      const url = new URL(input, location.href);
      if (url.pathname !== '/api/ui/appearance' || options?.method !== 'POST') return activeFetch(input, options);
      window.fetch = activeFetch;
      await activeFetch(input, options).catch(() => undefined);
      appearanceCalls.writes.length = 0;
      appearanceCalls.writes.push(JSON.parse(options.body));
      window.appearanceReplyHeld = true;
      return new Promise((_, reject) => {
        const signal = options.signal;
        if (signal.aborted) reject(signal.reason);
        else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    };
    molisWorkRestoreAppearance();
  })()`);
  await b.click("[data-appearance-recover]");
  await b.waitFor("window.appearanceReplyHeld === true");
  // The preceding command runs via the original fetch, which committed even though its response was withheld here.
  await issue.until(`d.documentElement.dataset.uiSkin === '${soft}'`);
  const original = await b.evaluate<string>("appearanceCalls.writes[0].request_id");
  const before = recoveryReads.length;
  // Model time spent away from the cached page without sleeping or changing the production account guard.
  await b.command("Page.addScriptToEvaluateOnNewDocument", {
    source: "{ const now = Date.now; Date.now = () => now() + 60_000; }",
  }, b.sessionId);
  await b.navigate(() => b.evaluate(`setTimeout(() => {
    dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  }, 0)`));
  assert.equal(await b.evaluate("location.pathname"), "/", "the account guard actually replaced the cached workbench document");
  await b.waitFor(`${pageSkin} === '${soft}' && ${choice} === '6' && document.querySelector('[data-appearance-undo]')?.hidden === false`);
  assert.deepEqual(recoveryReads.slice(before), [original]);
  assert.equal(await b.evaluate("sessionStorage.getItem('molis-work:appearance-handoff')"), null);
});

test("FSS-14 FSS-27 a missing receipt stays unconfirmed and the user can continue while the first transport key is held", { timeout: 75_000 }, async t => {
  const b = await openGoalBrowser(t, "user", undefined, null);
  if (!b) return;
  await b.setViewport(1024, 900);
  await b.navigate(() => b.command("Page.navigate", { url: b.origin + "/settings/appearance" }, b.sessionId));
  await b.waitFor("typeof molisWorkRestoreAppearance === 'function'");
  const held = deferred();
  let firstRequest: IncomingMessage | undefined;
  const listeners = b.server.listeners("request");
  b.server.removeAllListeners("request");
  b.server.on("request", (request, response) => {
    if (request.method === "POST" && request.url === "/api/ui/appearance" && !firstRequest) {
      firstRequest = request;
      request.pause();
      held.resolve();
    }
    for (const listener of listeners) listener.call(b.server, request, response);
  });
  t.after(() => { firstRequest?.resume(); });
  await b.evaluate(`(() => {
    const original = window.fetch;
    window.appearanceSent = [];
    window.appearanceRead = [];
    window.fetch = async (input, options) => {
      const url = new URL(input, location.href);
      if (url.pathname !== '/api/ui/appearance') return original(input, options);
      if (options?.method === 'POST') {
        appearanceSent.push({ body: options.body, key: options.headers['x-molis-work-idempotency-key'] });
        if (appearanceSent.length === 1) {
          window.appearanceOriginal = original(input, options).then(async response => ({ status: response.status, body: await response.json() }));
          window.appearanceProbe = () => original(input, options).then(async response => ({ status: response.status, body: await response.json() }));
          throw new TypeError('reply lost while the original write is still in flight');
        }
      }
      if (url.searchParams.has('request_id')) appearanceRead.push(url.searchParams.get('request_id'));
      return original(input, options);
    };
    molisWorkRestoreAppearance();
  })()`);
  await b.click("[data-appearance-recover]");
  await held.promise;
  await b.waitFor("document.querySelector('[data-appearance-recover]').textContent.trim() === '继续这次操作'");
  assert.equal(await b.evaluate(choice), "0");
  assert.match(await b.evaluate<string>("document.querySelector('[data-appearance-recovery-status]').textContent"), /无法确认/u);
  assert.equal(await b.evaluate("appearanceSent.length"), 1);
  const busy = await b.evaluate<{ status: number; body: { code: string } }>("appearanceProbe()");
  assert.equal(busy.status, 409);
  assert.equal(busy.body.code, "request.in_flight");
  await b.click("[data-appearance-recover]");
  await b.waitFor(`${choice} === '1' && !document.querySelector('[data-appearance-recovery]').open`);
  const sent = await b.evaluate<{ body: string; key: string }[]>("appearanceSent");
  assert.equal(sent.length, 2);
  assert.equal(sent[0]!.body, sent[1]!.body);
  assert.notEqual(sent[0]!.key, sent[1]!.key);
  const id = JSON.parse(sent[0]!.body).request_id;
  firstRequest!.resume();
  const late = await b.evaluate<{ status: number; body: { receipt: { request_id: string; selection_revision: number } } }>("appearanceOriginal");
  assert.equal(late.status, 200);
  assert.equal(late.body.receipt.request_id, id);
  assert.equal(late.body.receipt.selection_revision, 1);
  assert.deepEqual(await b.evaluate("appearanceRead"), [id]);
  const state = JSON.parse(readFileSync(join(b.homeDirectory, "interface", "state.json"), "utf8"));
  assert.equal(state.selection_revision, 1);
  assert.equal(state.applications.length, 1);
  assert.equal(state.applications[0].applied.request_id, id);
});

test("FSS-03 FSS-27 FSS-32 a fresh Workbench retries its saved Folio font in place", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, "user", undefined, null);
  if (!b) return;
  const workbench = `${b.origin}/projects/${b.projectId}/?desktop=1&settings=appearance`;
  const navigate = (url: string) => b.navigate(() => b.command("Page.navigate", { url }, b.sessionId));
  const fontPath = "/assets/folio-nunito-latin.woff2";
  const notice = "document.querySelector('[data-appearance-notice]')";
  const sample = "[data-font-retry-glyphs]";
  await b.setViewport(1440, 900);
  await b.command("DOM.enable", {}, b.sessionId);
  await b.command("CSS.enable", {}, b.sessionId);
  await b.command("Network.enable", {}, b.sessionId);
  // Exercise the cold response in this document even if another document requested the same stylesheet.
  await b.command("Network.setCacheDisabled", { cacheDisabled: true }, b.sessionId);
  await navigate(workbench);
  await b.waitFor("typeof molisWorkRestoreAppearance === 'function'");
  await b.evaluate("molisWorkRequest('/api/ui/locale', { body: { preference: 'en' } })");

  let unavailable = true, retrying = false;
  const writes: string[] = [];
  const listeners = b.server.listeners("request");
  b.server.removeAllListeners("request");
  b.server.on("request", (request, response) => {
    if (retrying && request.method === "POST" && request.url?.startsWith("/api/ui/")) writes.push(request.url);
    if (unavailable && request.url === fontPath) {
      response.writeHead(503, { "cache-control": "no-store" });
      response.end();
      return;
    }
    for (const listener of listeners) listener.call(b.server, request, response);
  });
  const replies: { path: string; status: number }[] = [];
  t.after(b.on("Network.responseReceived", ({ response }) => {
    if (!response.url.startsWith(b.origin + "/")) return;
    const path = new URL(response.url).pathname;
    if (path === "/api/ui/appearance" || path.endsWith(".woff2")) replies.push({ path, status: response.status });
  }));
  const receipt = await b.evaluate<{ receipt: { selection_revision: number } }>(`molisWorkRequest('/api/ui/appearance', { body: {
    request_id: 'saved-folio-font', expected_revision: 0,
    choice: { kind: 'selection', selection: { skin: { id: 'folio', revision: 1 }, font: { policy: 'follow-skin' }, mono: null } }
  } })`);
  assert.equal(receipt.receipt.selection_revision, 1);
  const stateFile = join(b.homeDirectory, "interface", "state.json"), saved = readFileSync(stateFile);
  assert.match(saved.toString(), /"id"\s*:\s*"folio"/u);

  replies.length = 0;
  await navigate(workbench + "&font-startup=1");
  await b.waitFor(`document.documentElement.lang === 'en' && ${notice}?.hidden === false`);
  assert.equal(await b.evaluate(`${notice}.querySelector('[data-appearance-message]').textContent`),
    "This window couldn’t load the new appearance. It is keeping the current look.");
  assert.ok(replies.some(reply => reply.path === fontPath && reply.status === 503), JSON.stringify(replies));
  assert.equal(await b.evaluate(pageSkin), folio);
  assert.deepEqual(readFileSync(stateFile), saved);
  await b.evaluate(`(() => {
    const glyphs = document.createElement('span');
    glyphs.setAttribute('data-font-retry-glyphs', '');
    glyphs.style.cssText = 'display:block;font:24px var(--font)';
    glyphs.textContent = 'Readable 2026';
    document.body.append(glyphs);
    window.fontRetryGlyphs = glyphs;
  })()`);
  type GlyphFont = { familyName: string; isCustomFont: boolean; glyphCount: number };
  const actualFonts = async () => {
    await b.evaluate(`(async () => { document.querySelector('${sample}').getBoundingClientRect(); await document.fonts.ready; })()`);
    const { root } = await b.command<{ root: { nodeId: number } }>("DOM.getDocument", {}, b.sessionId);
    const { nodeId } = await b.command<{ nodeId: number }>("DOM.querySelector", { nodeId: root.nodeId, selector: sample }, b.sessionId);
    return (await b.command<{ fonts: GlyphFont[] }>("CSS.getPlatformFontsForNode", { nodeId }, b.sessionId)).fonts;
  };
  const usesNunito = ({ familyName, isCustomFont, glyphCount }: GlyphFont) =>
    isCustomFont && glyphCount > 0 && /Nunito/u.test(familyName);
  const fallback = await actualFonts();
  assert.ok(fallback.some(font => !font.isCustomFont && font.glyphCount > 0) && !fallback.some(usesNunito), JSON.stringify(fallback));

  replies.length = 0;
  unavailable = false;
  retrying = true;
  await b.click("[data-appearance-read]");
  await b.waitFor(`${notice}?.hidden === true`);
  assert.ok(replies.some(reply => reply.path === "/api/ui/appearance" && reply.status === 200), JSON.stringify(replies));
  assert.ok(replies.some(reply => reply.path === fontPath && reply.status === 200), JSON.stringify(replies));
  const recovered = await actualFonts();
  assert.ok(recovered.some(usesNunito), JSON.stringify(recovered));
  assert.equal(await b.evaluate(`window.fontRetryGlyphs === document.querySelector('${sample}')`), true);
  assert.equal(await b.evaluate(pageSkin), folio);
  assert.equal(await b.evaluate("document.documentElement.lang"), "en");
  assert.deepEqual(writes, [], "retrying reads the saved choice without another appearance or language write");
  assert.deepEqual(readFileSync(stateFile), saved, "the saved selection and receipt keep their exact bytes");
  t.diagnostic(JSON.stringify({ fallback, recovered, replies, retryWrites: writes.length }));
  retrying = false;

  await b.evaluate("molisWorkRestoreAppearance()");
  await b.waitFor("document.querySelector('[data-appearance-recovery]').open");
  await b.click("[data-appearance-recover]");
  await b.waitFor(`${pageSkin} === '${soft}' && ${choice} === '2'`);
  assert.equal(await b.evaluate("document.documentElement.lang"), "en");
});

test("FSS-28 an old document preparation cannot repaint a newer Home selection", { timeout: 75_000 }, async t => {
  const b = await openGoalBrowser(t, "user", undefined, null);
  if (!b) return;
  await b.setViewport(1024, 900);
  await b.navigate(() => b.command("Page.navigate", { url: b.origin + "/settings/appearance" }, b.sessionId));
  await b.waitFor("typeof molisWorkRestoreAppearance === 'function'");
  const second = await fetch(b.origin + "/settings/appearance");
  const html = await second.text();
  const proof = /<meta name="molis-work-page-session" content="([^"]+)"/u.exec(html)?.[1];
  const cookie = second.headers.getSetCookie().find(value => value.startsWith("molis-work-web-"))?.split(";")[0];
  assert.ok(proof && cookie);

  const requested = deferred(), release = deferred();
  t.after(release.resolve);
  const listeners = b.server.listeners("request");
  b.server.removeAllListeners("request");
  b.server.on("request", (request, response) => {
    const handle = () => { for (const listener of listeners) listener.call(b.server, request, response); };
    if (request.url === "/assets/folio-nunito-latin.woff2") {
      requested.resolve();
      void release.promise.then(handle);
    } else handle();
  });
  const apply = async (expected_revision: number, choice: unknown) => {
    const response = await fetch(b.origin + "/api/ui/appearance", { method: "POST",
      headers: { cookie, origin: b.origin, "content-type": "application/json", "x-molis-work-page-session": proof, "x-molis-work-idempotency-key": randomUUID() },
      body: JSON.stringify({ expected_revision, request_id: randomUUID(), choice }),
    });
    assert.equal(response.status, 200);
    return response.json();
  };
  const request = { skin: { id: "folio", revision: 1 }, font: { policy: "follow-skin" }, mono: null };
  await apply(0, { kind: "selection", selection: request });
  await requested.promise;
  assert.equal(await b.evaluate(pageSkin), soft, "the earlier font is still loading");
  await apply(1, { kind: "restore" });
  await b.waitFor(`${pageSkin} === '${soft}' && ${choice} === '2'`);
  release.resolve();
  await b.evaluate("document.fonts.load('400 1em \"Nunito Variable\"', 'Aa').then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))");
  assert.equal(await b.evaluate(pageSkin), soft);
  assert.equal(await b.evaluate(choice), "2");
});

test("FSS-02 FSS-17 FSS-20 the same appearance specimen works at three widths in both languages and themes", { timeout: 150_000 }, async t => {
  const b = await openGoalBrowser(t, "user", undefined, null);
  if (!b) return;
  const capture = await issueView(t, b, "batch-16-appearance");
  for (const width of [1440, 1024, 390]) for (const language of ["zh", "en"]) for (const theme of ["light", "dark"]) {
    await b.setViewport(width, width === 390 ? 844 : 900);
    await b.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }, { name: "prefers-color-scheme", value: theme }] }, b.sessionId);
    await capture.go(`/locale?lang=${language}&next=%2Fsettings%2Fappearance`);
    await b.waitFor(`document.querySelector(${JSON.stringify(candidate)})?.getClientRects().length`);
    assert.equal(await b.evaluate("document.documentElement.lang"), language === "en" ? "en" : "zh-CN");
    assert.equal(await b.evaluate("document.documentElement.dataset.resolvedTheme"), theme);
    await b.click(candidate);
    await b.waitFor(`${proof}.dataset.state === 'ready'`);
    assert.equal(await b.evaluate(pageSkin), soft);
    assert.equal(await b.evaluate("document.querySelector('[data-appearance-proof-sheet]').open"), width === 390);
    assert.equal(await b.evaluate(`getComputedStyle(${proof}.querySelector('.mw-look-proof__canvas')).getPropertyValue('--page').trim()`), theme === "light" ? "#f4ede2" : "#171f1b");
    assert.equal(await b.evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
    await capture.shot(`settings-${width}-${language}-${theme}`);
    if (width === 390) {
      await capture.escape();
      await b.waitFor("!document.querySelector('[data-appearance-proof-sheet]').open");
      assert.equal(await b.evaluate(`document.activeElement === document.querySelector(${JSON.stringify(candidate)})`), true);
      await b.click("[data-appearance-preview]");
    }
    await b.click("[data-look-cancel]");
    await b.waitFor(`${proof}.dataset.state === 'idle'`);
  }
});

test("FSS-20 FSS-35 switching language retitles the open Folio specimen", { timeout: 75_000 }, async t => {
  const b = await openGoalBrowser(t, "user", undefined, null);
  if (!b) return;
  await b.setViewport(1440, 900);
  await b.navigate(() => b.command("Page.navigate", { url: `${b.origin}/locale?lang=zh&next=%2Fsettings%2Fappearance` }, b.sessionId));
  await b.waitFor(`document.querySelector(${JSON.stringify(candidate)})?.getClientRects().length`);
  await b.click(candidate);
  const title = `${proof}.querySelector('.mw-card__description').textContent`;
  const label = `${proof}.querySelector('.mw-look-proof__canvas').parentElement.getAttribute('aria-label')`;
  await b.waitFor(`${proof}.dataset.state === 'ready' && ${title}.includes('Folio 圆润')`);
  await b.evaluate(`window.batch16Proof = ${proof}`);
  await b.click('[data-ui-language="en"]');
  await b.waitFor(`document.documentElement.lang === 'en' && ${title} === 'Trying: Folio · Folio Rounded'`);
  assert.match(await b.evaluate<string>(label), /Folio Rounded/u);
  assert.equal(await b.evaluate(`${proof} === batch16Proof && ${proof}.dataset.state === 'ready'`), true);
  assert.equal(await b.evaluate(pageSkin), soft);
  await b.click('[data-look-cancel]');
  await b.click(candidate);
  await b.waitFor(`${proof}.dataset.state === 'ready' && ${title} === 'Trying: Folio · Folio Rounded'`);
});

test("FSS-17 FSS-68 a trusted language click works during the live Folio fade", { timeout: 50_000 }, async t => {
  const b = await openGoalBrowser(t, "empty", undefined, null);
  assert.ok(b);
  const english = "a[data-ui-language=en]";
  await b.setViewport(1024, 900);
  await b.command("Emulation.setEmulatedMedia", { features: [
    { name: "prefers-reduced-motion", value: "no-preference" }, { name: "prefers-color-scheme", value: "light" },
  ] }, b.sessionId);
  await b.navigate(() => b.command("Page.navigate", { url: b.origin + "/locale?lang=zh&next=%2Fsettings%2Fappearance" }, b.sessionId));
  await b.waitFor(`typeof molisWorkLookFade === 'function' && typeof molisWorkRequest === 'function'
    && document.querySelector('[data-appearance-settings]') && document.querySelector(${JSON.stringify(english)})`);
  assert.deepEqual(await b.evaluate(`[document.documentElement.lang, ${pageSkin}, ${choice}]`), ["zh-CN", soft, "0"]);
  await b.evaluate(`(() => {
    const link = document.querySelector(${JSON.stringify(english)});
    window.beforeLookFade = { body: document.body, settings: document.querySelector('[data-appearance-settings]'), link };
    link.addEventListener('click', event => {
      const fade = document.getAnimations().find(animation => animation.id === 'mw-look-fade');
      window.lookFadeClick = { trusted: event.isTrusted, animation: fade?.playState ?? null, skin: ${pageSkin} };
    }, { once: true });
    document.documentElement.removeAttribute('data-craft-still');
    link.scrollIntoView({ block: 'center', behavior: 'instant' });
  })()`);
  const body = { request_id: randomUUID(), expected_revision: 0, choice: { kind: "selection", selection: {
    skin: { id: "folio", revision: 1 }, font: { policy: "pinned", scheme: { id: "system-sans", revision: 1 } }, mono: null,
  } } };
  await b.evaluate(`molisWorkRequest('/api/ui/appearance', { body: ${JSON.stringify(body)} })`);
  await b.waitFor(`${pageSkin} === '${folio}' && ${choice} === '1'`);
  await b.click(english);
  assert.deepEqual(await b.evaluate("window.lookFadeClick"), { trusted: true, animation: "running", skin: folio });
  await b.waitFor(`document.documentElement.lang === 'en' && document.querySelector(${JSON.stringify(english)})?.getAttribute('aria-current') === 'true'`);
  assert.deepEqual(await b.evaluate(`[location.pathname, document.body === beforeLookFade.body,
    document.querySelector('[data-appearance-settings]') === beforeLookFade.settings, document.querySelector(${JSON.stringify(english)}) === beforeLookFade.link,
    ${pageSkin}, document.documentElement.dataset.uiFont, ${choice}]`),
  ["/settings/appearance", true, true, true, folio, "system-sans@1", "1"]);
});
