import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";

// W3-10-1b in the Workbench, in a real browser with the real clipboard: a request that fails shows the diagnostic ID only when the
// Host kept a record of the call to look it up by (spec §1, 2026-10-10 「只在查得到时显示」), and says plainly when the answer never came
// (2026-10-10 「没有自己重发办法的页面保存时断线」). Chrome is required.
//
//  1. A failure of a call the Host recorded (the memory page's 停用 of a memory that was deleted elsewhere, `memory.change` → 404
//     `memory.not_found`): the page's error area carries 诊断编号 and a click copies the whole ID; the diagnostics page finds the call by it.
//  2. A write the connection loses: the page does not know whether it happened, and says so, in the person's language, with no ID.
//  3. A phone (390px, a coarse pointer; light and dark): the toast is as wide as its words up to the window less its margins (it does not
//     shrink to half the window), keeps its message readable, puts the button under a message that fills the line, and shows it in the
//     toast's ink; the button, in the toast and in the error area, is a 44px target (DESIGN.md 「Focus and accessibility」, decision of
//     2026-10-11); a desktop window keeps the message and the button on one line.
//  4. A failure the Host does not record (a model provider saved with an address the Host refuses, a management write that does not go
//     through the action service): the Host puts no call number on the answer, and the page shows no 诊断编号, because nothing could
//     be looked up by it.

interface Answer { url: string; status: number; header: string | null; text: string }

/** Keeps what the Host answered to the requests of the page (the body and the call number header) so the test can compare them with what is shown. */
const RECORD_ANSWERS = `(() => {
  const original = window.fetch.bind(window);
  window.__answers = [];
  window.fetch = async (...args) => {
    const response = await original(...args);
    const copy = response.clone();
    copy.text().then(text => window.__answers.push({ url: String(args[0] instanceof Request ? args[0].url : args[0]), status: response.status, header: response.headers.get('x-molis-work-call-id'), text }));
    return response;
  };
})()`;

const answersFor = async (evaluate: <T>(expression: string) => Promise<T>, part: string): Promise<Answer[]> =>
  evaluate<Answer[]>(`window.__answers.filter(answer => answer.url.includes(${JSON.stringify(part)}))`);

type Evaluate = <T>(expression: string) => Promise<T>;
// This is the other window's own current read, not the stale page silently rebasing its pending decision.
const removeCurrentMemory = (evaluate: Evaluate, memoryId: string) => evaluate(`(async () => {
  const {items} = await molisWorkRequest('/api/memory/overview?scope=personal');
  const current = items.find(item => item.memory_id === ${JSON.stringify(memoryId)});
  return molisWorkRequest('/api/memory/change', {body: {memory_id: current.memory_id, expected_version: current.version, action: 'remove'}});
})()`);
type Command = (method: string, params?: Record<string, unknown>, sessionId?: string) => Promise<unknown>;

// VUX-TOAST-01: measure actual pointer/keyboard states, not a style inferred from an idle button.
test("toast diagnostic links keep readable ink through pointer and keyboard states", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded", undefined, null);
  assert.ok(browser, "Chrome is required for the diagnostic-link states");
  const { origin, projectId, command, sessionId, navigate, evaluate, waitFor, click } = browser;
  await command("Browser.grantPermissions", { origin, permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"] });
  await command("DOM.enable", {}, sessionId); await command("CSS.enable", {}, sessionId);
  const toast = "[data-toast].is-visible.is-error", button = `${toast} [data-molis-call-id]`;
  const evidence = reviewEvidenceUrl("toast-call-id-states/"); await mkdir(evidence, { recursive: true });
  const open = () => navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?settingsPath=%2Fsettings%2Fmemory` }, sessionId));
  for (const scheme of ["light", "dark"]) for (const width of [1440, 1024, 390]) {
    const phone = width === 390;
    await phoneOf(command, sessionId, phone);
    await command("Emulation.setDeviceMetricsOverride", { width, height: phone ? 844 : 960, deviceScaleFactor: 1, mobile: phone }, sessionId);
    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }] }, sessionId);
    await open(); await waitFor("document.querySelector('[data-memory-add]') && typeof molisWorkRequest === 'function'", 20_000);
    const saved = await evaluate<{ memory: { memory_id: string } }>(`molisWorkRequest('/api/memory/items', { body: { scope: 'personal', text: '诊断链接状态 ${scheme} ${phone}', kind: 'preference' } })`);
    await open();
    const row = `[data-memory-settings] [data-memory-id="${saved.memory.memory_id}"]`;
    await waitFor(`!!document.querySelector(${JSON.stringify(row)})`, 20_000);
    await evaluate(`molisWorkRequest('/api/memory/change', { body: { memory_id: ${JSON.stringify(saved.memory.memory_id)}, action: 'remove' } })`);
    await click(`${row} button[aria-label^="停用"]`);
    await waitFor(`!!document.querySelector(${JSON.stringify(button)}) && document.querySelector(${JSON.stringify(toast)}).getAnimations().every(a => a.playState === 'finished')`);
    const point = await evaluate<{ x: number; y: number }>(`(() => { const b = document.querySelector(${JSON.stringify(button)}).getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
    const mouse = (type: string, pressed = false, away = false) => command("Input.dispatchMouseEvent", { type, ...(away ? { x: 1, y: 1 } : point), button: pressed || type === "mouseReleased" ? "left" : "none", buttons: pressed ? 1 : 0, clickCount: type === "mouseMoved" ? 0 : 1 }, sessionId);
    const inspect = async (state: string) => {
      const color = await toastLinesOf(evaluate, toast);
      const live = await evaluate<{ hover: boolean; active: boolean; focus: boolean; toastInk: string; scheme: boolean }>(`(() => { const b = document.querySelector(${JSON.stringify(button)}); return { hover: b.matches(':hover'), active: b.matches(':active'), focus: b.matches(':focus-visible'), toastInk: getComputedStyle(b.parentElement).color, scheme: matchMedia('(prefers-color-scheme: ${scheme})').matches }; })()`);
      const { root } = await command("DOM.getDocument", {}, sessionId) as { root: { nodeId: number } };
      const { nodeId } = await command("DOM.querySelector", { nodeId: root.nodeId, selector: button }, sessionId) as { nodeId: number };
      const matched = await command("CSS.getMatchedStylesForNode", { nodeId }, sessionId) as { matchedCSSRules: { matchingSelectors: number[]; rule: { selectorList: { selectors: { text: string }[] }; style: { cssProperties: { name: string; value: string }[] } } }[] };
      const rules = matched.matchedCSSRules.flatMap(({ matchingSelectors, rule }) => rule.style.cssProperties.filter(p => p.name === "color").map(p => ({ selectors: matchingSelectors.map(i => rule.selectorList.selectors[i].text), color: p.value })));
      const name = `${scheme}-${width}-${state}`;
      await writeFile(new URL(`${name}.json`, evidence), JSON.stringify({ state, ...live, ...color, rules }, null, 2));
      const shot = await command("Page.captureScreenshot", { format: "png" }, sessionId) as { data: string };
      await writeFile(new URL(`${name}.png`, evidence), Buffer.from(shot.data, "base64"));
      assert.equal(live.scheme, true, name);
      assert.equal(live.hover, state === "hover" || state === "active", `${name}: actual pointer state`);
      assert.equal(live.active, state === "active", `${name}: actual pressed state`);
      if (state === "focus") assert.equal(live.focus, true, `${name}: actual keyboard focus`);
      assert.ok(color.contrast >= 4.5, `${name}: ${color.contrast}:1 (${color.ink} on ${color.ground})`);
      assert.equal(color.ink, live.toastInk, `${name}: the diagnostic link keeps the toast's ink`);
    };
    await mouse("mouseMoved", false, true); await inspect("normal");
    await mouse("mouseMoved"); await inspect("hover");
    await mouse("mousePressed", true);
    try { await inspect("active"); } finally { await mouse("mouseReleased"); }
    await mouse("mouseMoved", false, true);
    for (const modifiers of [8, 0]) for (const type of ["keyDown", "keyUp"])
      await command("Input.dispatchKeyEvent", { type, key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, modifiers }, sessionId);
    await inspect("focus");
  }
});

/** The toast's box, and where its glyph sits (the glyph hangs on the toast's left edge at a fixed offset from the top). */
const toastBox = (evaluate: Evaluate, selector: string) => evaluate<{ x: number; right: number; h: number; glyphHeight: number; glyphTop: number }>(`(() => { const el = document.querySelector(${JSON.stringify(selector)});
  const b = el.getBoundingClientRect(); return { x: b.x, right: b.right, h: b.height, glyphHeight: el.querySelector('.mw-state-ring').getBoundingClientRect().height, glyphTop: el.querySelector('.mw-state-ring').getBoundingClientRect().top - b.top }; })()`);

/** The button as a finger meets it: its box, and what is under the middle of its top and bottom edges (its reach is real, not a measurement alone). */
const reachOf = (evaluate: Evaluate, selector: string) => evaluate<{ w: number; h: number; top: boolean; bottom: boolean }>(`(() => { const el = document.querySelector(${JSON.stringify(selector)});
  el.scrollIntoView({ block: 'center' }); const b = el.getBoundingClientRect(); const x = b.x + b.width / 2;
  return { w: b.width, h: b.height, top: el.contains(document.elementFromPoint(x, b.top + 2)), bottom: el.contains(document.elementFromPoint(x, b.bottom - 2)) }; })()`);

/** The message and the button of the toast as lines: how many lines the message takes, where the button's words sit against them, and how the button reads on the toast. */
const toastLinesOf = (evaluate: Evaluate, toast: string) => evaluate<{ lines: number; textLeft: number; textBottom: number; buttonLeft: number; buttonTop: number; contrast: number; ink: string; ground: string }>(`(() => {
  const toast = document.querySelector(${JSON.stringify(toast)}); const text = document.createRange(); text.selectNodeContents([...toast.childNodes].find(node => node.nodeType === Node.TEXT_NODE));
  const button = toast.querySelector('[data-molis-call-id]'); const words = document.createRange(); words.selectNodeContents(button);
  const channels = value => { const n = (value.match(/[\\d.]+/g) || []).map(Number); return value.startsWith('color(') ? n.slice(0, 3).map(v => v * 255) : n.slice(0, 3); };
  const luminance = value => { const [r, g, b] = channels(value).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
  const [lighter, darker] = [luminance(getComputedStyle(button).color), luminance(getComputedStyle(toast).backgroundColor)].sort((a, b) => b - a);
  return { lines: text.getClientRects().length, textLeft: text.getBoundingClientRect().left, textBottom: text.getBoundingClientRect().bottom,
    buttonLeft: words.getBoundingClientRect().left, buttonTop: words.getBoundingClientRect().top, contrast: (lighter + .05) / (darker + .05),
    ink: getComputedStyle(button).color, ground: getComputedStyle(toast).backgroundColor }; })()`);

/** A toast with a message too long for one line on a phone, put on the page the way the helper does it. */
const LONG_MESSAGE = "这条记忆在别处已经被删除，请刷新列表后再试，或者回到上一页重新操作一次";
const showLongToast = (evaluate: Evaluate, selector: string) => evaluate(`(() => { molisWorkRequest.toast(document.querySelector(${JSON.stringify(selector)}),
  Object.assign(new Error(${JSON.stringify(LONG_MESSAGE)}), { callId: '0123abcd-4567-4890-abcd-0123456789ab' }), undefined, { ms: 60000 }); })()`);

/** A phone: 390px wide with a touch screen, so the pointer is coarse; or the desktop window the other steps use. */
const phoneOf = async (command: Command, sessionId: string, on: boolean) => {
  await command("Emulation.setTouchEmulationEnabled", on ? { enabled: true, maxTouchPoints: 5 } : { enabled: false }, sessionId);
  await command("Emulation.setDeviceMetricsOverride", on ? { width: 390, height: 844, deviceScaleFactor: 1, mobile: true } : { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
};

test("a failure the Host recorded shows its diagnostic ID, which copies whole and finds the call; one it did not record shows none; a lost write says it is unknown", { timeout: 300_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded", undefined, null);
  if (!browser) return;
  const { origin, projectId, localHost, sessionId, command, evaluate, waitFor, click, navigate } = browser;
  assert.ok(localHost?.callLog, "the Host keeps a call log");
  await command("Browser.grantPermissions", { origin, permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"] });
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  const prefix = `/projects/${projectId}`;
  const open = (settings: string) => navigate(() => command("Page.navigate", { url: `${origin}${prefix}/?settingsPath=${encodeURIComponent(settings)}` }, sessionId));
  const text = (selector: string) => evaluate<string | null>(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? null`);

  // ---- 1. A recorded failure ------------------------------------------------------------------------------------------------------
  await open("/settings/memory");
  await waitFor("document.querySelector('[data-memory-settings] [data-memory-add]') && typeof molisWorkRequest === 'function'", 20_000);
  const memoryId = (await evaluate<{ memory?: { memory_id: string }; memory_id?: string }>(
    "molisWorkRequest('/api/memory/items', { body: { scope: 'personal', text: '周报用要点列表，每条一句', kind: 'preference' } })")).memory?.memory_id;
  assert.ok(memoryId, "a memory was written");
  await open("/settings/memory");
  const row = `[data-memory-settings] [data-memory-id="${memoryId}"]`;
  await waitFor(`!!document.querySelector(${JSON.stringify(row)})`, 20_000);
  // Deleted somewhere else (a second window, the assistant) while this page still shows it.
  await removeCurrentMemory(evaluate, memoryId);
  await evaluate(RECORD_ANSWERS);
  await click(`${row} button[aria-label^="停用"]`);
  const errorButton = "[data-memory-settings] [data-memory-error] [data-molis-call-id]";
  await waitFor(`!!document.querySelector(${JSON.stringify(errorButton)})`, 15_000);

  const [refused] = await answersFor(evaluate, "/api/memory/change");
  assert.ok(refused, "the page's request was answered");
  const body = JSON.parse(refused.text) as { error: string; code: string; call_id?: string };
  assert.equal(refused.status, 404);
  assert.equal(body.code, "memory.not_found");
  assert.match(body.call_id ?? "", /^[0-9a-f-]{36}$/, "the Host put the call's ID in the body of the answer, because it recorded the call");
  assert.equal(refused.header, body.call_id, "and it is the one in the header");
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(errorButton)}).textContent`), `诊断编号 ${body.call_id!.slice(0, 8)}`, "the short form a person sees");
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(errorButton)}).dataset.molisCallId`), body.call_id, "carrying the whole ID");
  assert.equal(await evaluate("document.querySelector('[data-memory-settings] [data-memory-error]').firstChild.textContent"), body.error, "after the Host's own words");
  assert.equal(await evaluate("document.querySelector('[data-memory-settings] [data-memory-error]').hidden"), false);
  // The reason also shows where the person is (the toast), with the same button, and the toast does not run away from a pointer on it.
  await waitFor("!!document.querySelector('[data-toast].is-error [data-molis-call-id]')", 5_000);
  // RING-07: the shared failure ring replaces the old background-image glyph.
  await waitFor("document.querySelector('[data-toast].is-error > .mw-state-ring')?.dataset.mwState === 'failed'");
  const desktopToast = await toastBox(evaluate, "[data-toast].is-error");
  assert.ok(desktopToast.h < 60 && desktopToast.right <= 1440, `a desktop window keeps the message and the button on one line (${JSON.stringify(desktopToast)})`);
  assert.ok(Math.abs((desktopToast.h - desktopToast.glyphHeight) / 2 - desktopToast.glyphTop) <= 1, `with the glyph centred on that line (${JSON.stringify(desktopToast)})`);
  assert.ok(Math.abs(desktopToast.glyphHeight - 15) <= 1, `RING-08: as tall as its 13px words (${desktopToast.glyphHeight})`);
  const desktopReach = await reachOf(evaluate, "[data-toast].is-error [data-molis-call-id]");
  assert.ok(desktopReach.h >= 32 && desktopReach.top && desktopReach.bottom, `and a pointer reaches the button over at least 32px (${JSON.stringify(desktopReach)})`);

  await click(errorButton);
  assert.equal(await evaluate("navigator.clipboard.readText()"), body.call_id, "a click copies the whole ID, not the short form");
  assert.equal(await text(errorButton), "已复制");

  // The diagnostics page finds the call by the short form a person copied.
  await open(`/settings/diagnostics?call=${body.call_id!.slice(0, 8)}`);
  const panel = "[data-work-surface=settings] [data-settings-panel=diagnostics]";
  await waitFor(`!!document.querySelector(${JSON.stringify(panel + " [data-call-row]")})`, 20_000);
  assert.equal(await evaluate(`document.querySelectorAll(${JSON.stringify(panel + " [data-call-row]")}).length`), 1, "one operation");
  const found = await text(panel + " [data-call-row]");
  assert.match(found ?? "", /memory\.change@/, "the call that failed");
  assert.match(found ?? "", new RegExp(`诊断编号 ${body.call_id!.slice(0, 8)}`));
  assert.match(found ?? "", /失败/);
  const logged = localHost.callLog.find(body.call_id!.slice(0, 8));
  assert.deepEqual(logged.map(entry => entry.code), ["memory.not_found"], "and the log row has the code of the answer");

  // ---- 2. A write the connection loses ------------------------------------------------------------------------------------------------
  await open("/settings/memory");
  await waitFor("document.querySelector('[data-memory-settings] [data-memory-add]') && typeof molisWorkRequest === 'function'", 20_000);
  const kept = (await evaluate<{ memory?: { memory_id: string } }>(
    "molisWorkRequest('/api/memory/items', { body: { scope: 'personal', text: '连接断开时保持原样', kind: 'preference' } })")).memory?.memory_id;
  await open("/settings/memory");
  const keptRow = `[data-memory-settings] [data-memory-id="${kept}"]`;
  await waitFor(`!!document.querySelector(${JSON.stringify(keptRow)})`, 20_000);
  await command("Network.enable", {}, sessionId);
  await command("Network.setBlockedURLs", { urls: [`${origin}${prefix}/api/memory/change`, `${origin}/api/memory/change`] }, sessionId);
  await click(`${keptRow} button[aria-label^="停用"]`);
  await waitFor("!document.querySelector('[data-memory-settings] [data-memory-error]').hidden", 15_000);
  await command("Network.setBlockedURLs", { urls: [] }, sessionId);
  assert.equal(await text("[data-memory-settings] [data-memory-error]"), "不知道这次操作有没有完成，请刷新后核对", "no browser English, and no pretending it is known");
  assert.equal(await evaluate("document.querySelectorAll('[data-memory-settings] [data-memory-error] [data-molis-call-id]').length"), 0, "there is no call to look up");
  assert.equal((await evaluate<{ items: { memory_id: string; state: string }[] }>("molisWorkRequest('/api/memory/overview?scope=personal')")).items.find(item => item.memory_id === kept)?.state, "active",
    "and the write that got no answer did not happen");
  // ---- 3. A phone: a toast that fits and keeps its words, and a button a finger can hit (before 4: the model page asks before it is left) ---
  await phoneOf(command, sessionId, true);
  for (const scheme of ["light", "dark"]) {
    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }] }, sessionId);
    await open("/settings/memory");
    await waitFor("document.querySelector('[data-memory-settings] [data-memory-add]') && typeof molisWorkRequest === 'function'", 20_000);
    assert.equal(await evaluate("matchMedia('(pointer: coarse)').matches && innerWidth"), 390, "a phone: 390px wide with a coarse pointer");
    const stale = (await evaluate<{ memory?: { memory_id: string } }>(
      `molisWorkRequest('/api/memory/items', { body: { scope: 'personal', text: '手机上的失败（${scheme}）', kind: 'preference' } })`)).memory?.memory_id;
    await open("/settings/memory");
    const staleRow = `[data-memory-settings] [data-memory-id="${stale}"]`;
    await waitFor(`!!document.querySelector(${JSON.stringify(staleRow)})`, 20_000);
    await removeCurrentMemory(evaluate, stale);
    await click(`${staleRow} button[aria-label^="停用"]`);
    await waitFor("!!document.querySelector('[data-toast].is-visible.is-error [data-molis-call-id]') && !!document.querySelector('[data-memory-settings] [data-memory-error] [data-molis-call-id]')", 15_000);
    const shown = await toastBox(evaluate, "[data-toast].is-visible.is-error");
    assert.ok(shown.x >= 0 && shown.right <= 390, `${scheme}: the toast is inside the window (${JSON.stringify(shown)})`);
    assert.ok(shown.h <= 110, `${scheme}: and does not stand a message on its end (${shown.h}px tall)`);
    const real = await toastLinesOf(evaluate, "[data-toast].is-visible.is-error");
    assert.ok(real.lines <= 2, `${scheme}: the message takes at most two lines, not one character each (${real.lines})`);
    assert.ok(real.contrast >= 4.5, `${scheme}: the button reads in the toast's ink, ${real.contrast}:1 (${real.ink} on ${real.ground})`);
    for (const [where, selector] of [["in the toast", "[data-toast].is-visible.is-error [data-molis-call-id]"], ["in the error area", "[data-memory-settings] [data-memory-error] [data-molis-call-id]"]]) {
      const target = await reachOf(evaluate, selector);
      assert.ok(target.h >= 44 && target.w >= 44, `${scheme}: the 诊断编号 button ${where} is a 44px target on a phone, ${target.w}×${target.h}`);
      assert.ok(target.top && target.bottom, `${scheme}: and a finger on the top or the bottom of that box reaches it ${where}`);
    }
    // A message that fills the line puts the button under it, left edges together; the message keeps its width.
    await showLongToast(evaluate, "[data-toast]");
    await waitFor("document.querySelector('[data-toast]').textContent.startsWith('这条记忆在别处已经被删除')", 5_000);
    const long = await toastLinesOf(evaluate, "[data-toast].is-visible.is-error");
    const longBox = await toastBox(evaluate, "[data-toast].is-visible.is-error");
    assert.ok(longBox.x >= 0 && longBox.right <= 390 && longBox.h <= 130, `${scheme}: a long message still fits the window (${JSON.stringify(longBox)})`);
    assert.ok(long.lines >= 2 && long.lines <= 3, `${scheme}: a long message wraps into lines of words (${long.lines})`);
    assert.ok(long.buttonTop >= long.textBottom - 1, `${scheme}: the button is under the message, not squeezed beside it`);
    assert.ok(Math.abs(long.buttonLeft - long.textLeft) <= 1, `${scheme}: and starts where the message does`);
  }
  await phoneOf(command, sessionId, false);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] }, sessionId);

  // ---- 4. A failure the Host does not record (last: the model page keeps what was typed, so leaving it would ask the person first) ----------
  await open("/settings/models");
  await waitFor("document.querySelector('[data-model-settings] [data-model-template]') && typeof molisWorkRequest === 'function'", 20_000);
  await evaluate(RECORD_ANSWERS);
  const setValue = (selector: string, value: string) => evaluate(`(() => { const field = document.querySelector(${JSON.stringify(selector)});
    field.value = ${JSON.stringify(value)}; field.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await click("[data-model-settings] [data-model-template=deepseek]");
  await waitFor("document.querySelector('[data-model-base-url]')?.value === 'https://api.deepseek.com'");
  await setValue("[data-model-base-url]", "ftp://models.invalid/v1");
  await setValue("[data-model-api-key]", "page-test-key-0123456789");
  await click("[data-model-save]");
  await waitFor("document.querySelector('[data-model-status]')?.hasAttribute('data-failed')", 15_000);
  const [unrecorded] = await answersFor(evaluate, "/api/settings/models/");
  assert.ok(unrecorded && unrecorded.status >= 400 && unrecorded.status < 500, `the Host refused the provider, got ${unrecorded?.status}`);
  assert.ok((await text("[data-model-status]"))?.length, "the reason shows as it always did");
  assert.equal(await text("[data-model-status]"), (JSON.parse(unrecorded.text) as { error: string }).error, "in the Host's own words");
  assert.equal(unrecorded.header, null, "the answer carries no call number in its header");
  assert.equal((JSON.parse(unrecorded.text) as { call_id?: string }).call_id, undefined, "nor in its body: no call was recorded, so nothing could be looked up");
  assert.equal(await evaluate("document.querySelectorAll('[data-model-settings] [data-molis-call-id], [data-toast] [data-molis-call-id]').length"), 0, "so the page shows no 诊断编号");

});

test("the settings page opened on its own: its toast hangs on the right edge on one line, and on a phone fits, puts the button under a long message and is reachable", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, "empty", undefined, null);
  if (!browser) return;
  const { origin, sessionId, command, evaluate, waitFor, navigate } = browser;
  const toast = "[data-settings-toast].is-visible.is-error";
  const button = `${toast} [data-molis-call-id]`;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/settings/memory` }, sessionId));
  await waitFor("document.body.classList.contains('settings-page') && !!document.querySelector('[data-settings-toast]') && typeof molisWorkRequest === 'function'", 20_000);
  const show = (message: string) => evaluate(`(() => { molisWorkRequest.toast(document.querySelector('[data-settings-toast]'),
    Object.assign(new Error(${JSON.stringify(message)}), { callId: '0123abcd-4567-4890-abcd-0123456789ab' }), undefined, { ms: 60000 }); })()`);

  await show("这条记忆已经不存在");
  await waitFor(`!!document.querySelector(${JSON.stringify(button)})`, 5_000);
  const desktop = await toastBox(evaluate, toast);
  assert.ok(desktop.h < 60, `a desktop window keeps the message and the button on one line (${JSON.stringify(desktop)})`);
  assert.ok(Math.abs(desktop.right - (1440 - 22)) <= 1, `the toast hangs on the window's right edge, 22px in, as the page's own rule says, and is not a bar over its right half (${JSON.stringify(desktop)})`);
  assert.ok(desktop.right - desktop.x < 720, "as wide as its words");
  assert.ok(Math.abs((desktop.h - desktop.glyphHeight) / 2 - desktop.glyphTop) <= 1, `with the glyph centred on that line (${JSON.stringify(desktop)})`);
  assert.ok(Math.abs(desktop.glyphHeight - 15) <= 1, `RING-08: as tall as its 13px words (${desktop.glyphHeight})`);
  const desktopReach = await reachOf(evaluate, button);
  assert.ok(desktopReach.h >= 32 && desktopReach.top && desktopReach.bottom, `and a pointer reaches the button over at least 32px (${JSON.stringify(desktopReach)})`);

  for (const scheme of ["light", "dark"]) {
    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }] }, sessionId);
    await phoneOf(command, sessionId, true);
    await navigate(() => command("Page.navigate", { url: `${origin}/settings/memory` }, sessionId));
    await waitFor("document.body.classList.contains('settings-page') && !!document.querySelector('[data-settings-toast]') && typeof molisWorkRequest === 'function'", 20_000);
    await show(LONG_MESSAGE);
    await waitFor(`!!document.querySelector(${JSON.stringify(button)})`, 5_000);
    const box = await toastBox(evaluate, toast);
    const lines = await toastLinesOf(evaluate, toast);
    assert.ok(box.x >= 0 && box.right <= 390 && box.h <= 130, `${scheme}: a long message fits the phone (${JSON.stringify(box)})`);
    assert.ok(lines.lines >= 2 && lines.lines <= 3, `${scheme}: and wraps into lines of words (${lines.lines})`);
    assert.ok(lines.buttonTop >= lines.textBottom - 1 && Math.abs(lines.buttonLeft - lines.textLeft) <= 1, `${scheme}: with the button under the message, where the message starts`);
    assert.ok(lines.contrast >= 4.5, `${scheme}: in the toast's ink, ${lines.contrast}:1 (${lines.ink} on ${lines.ground})`);
    // The toast reverses the page's surface; every state must remain visible there.
    const ringContrast = await evaluate<number[]>(`(() => { const toast = document.querySelector('[data-settings-toast]');
      const luminance = value => { const parts = (value.match(/[\\d.]+/g) || []).map(Number), channels = value.startsWith('color(') ? parts.slice(0, 3) : parts.slice(0, 3).map(v => v / 255);
        const [r,g,b] = channels.map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return .2126*r + .7152*g + .0722*b; };
      const svg = toast.querySelector('.mw-state-ring'), path = svg.querySelector('[data-ring-segments] path'); path.style.transition = 'none';
      return ['neutral','success','danger'].map(tone => { path.dataset.ringTone = tone; const [hi,lo] = [luminance(getComputedStyle(path).stroke), luminance(getComputedStyle(toast).backgroundColor)].sort((a,b) => b-a); return (hi+.05)/(lo+.05); }); })()`);
    assert.ok(ringContrast.every(value => value >= 3), `${scheme}: state strokes contrast against the toast: ${ringContrast}`);
    const target = await reachOf(evaluate, button);
    assert.ok(target.h >= 44 && target.w >= 44 && target.top && target.bottom, `${scheme}: the button is a 44px target a finger reaches (${JSON.stringify(target)})`);
    await phoneOf(command, sessionId, false);
  }
  // RING-07 / RING-03: the fading toast must not leave an invisible animation running.
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] }, sessionId);
  await show("检查隐藏时停止绘制");
  await waitFor("document.querySelector('[data-settings-toast] .mw-state-ring')?.dataset.mwState === 'failed'");
  await evaluate("document.querySelector('[data-settings-toast]').classList.remove('is-visible')");
  await waitFor("getComputedStyle(document.querySelector('[data-settings-toast] .mw-state-ring')).visibility === 'hidden'");
  const frozen = await evaluate(`(async () => { const ring = document.querySelector('[data-settings-toast] .mw-state-ring'); const before = ring.innerHTML;
    await new Promise(resolve => setTimeout(resolve, 2200)); return before === ring.innerHTML; })()`);
  assert.equal(frozen, true, "a hidden failure toast stops repainting");
});
