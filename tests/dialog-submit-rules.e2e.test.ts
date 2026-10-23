import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { pluginSurfaceClients } from "@molis-ai/molis-work-app-workbench";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { walkLayers } from "./fixtures/layer-walk.js";
import { OVERLAY_BEFORE, OVERLAY_OPEN } from "./fixtures/overlay-audit.js";
import { TITLES, seedLongChinese, writeLongChinese } from "./fixtures/chinese-walk.js";

// specs/visual-ui-experience §adaptive-focus (VUX-29), the part that is about dialogs. Every dialog the project page and the
// plugins open is reached the way a person reaches it (tests/fixtures/layer-walk: a create, rename or delete button, a menu's
// item, a row's context menu) and read while it is open:
//  - it is modal, so Tab and Shift+Tab go round inside it (the page behind it takes no focus);
//  - what is typed in it and sent twice at once goes out once;
//  - when the Host refuses, it stays open with what was typed and says why next to its buttons.
// Chrome holds every request that changes something and answers it with an error (Fetch.fulfillRequest), so the walk changes
// nothing and each dialog can be submitted as often as the audit likes. The audits are checked on dialogs written for the
// purpose (one that works, one that breaks each rule) so they cannot pass by reading nothing.

const SCREENS = ["project", "todo", "pages", "issues", "workflows", "form", "ppt", "goals", "project-settings"];
/** The plugins whose detail view (what the first long item opens into) has its own rename, delete and publish buttons. */
const DETAILS = ["todo", "pages", "issues", "workflows", "form", "ppt", "goals"];
/** Besides create, rename and delete: what the deck's "from text" outline and a workflow's "start a run" ask for a dialog with. */
const MORE_VERBS = ["生成", "开始"];
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Browser = NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>;
type Evaluate = <T = unknown>(expression: string) => Promise<T>;
type View = Awaited<ReturnType<typeof pluginFrameBrowser>>;
/** Reads the open dialog; in a plugin's frame with that frame's `evaluate` and `point` (the page's coordinates of a selector in it). */
type Read = (where: string, evaluate?: Evaluate, point?: View["point"]) => Promise<void>;

/** The tab stops of the open layer: what Tab reaches in it. */
const TABBABLE = String.raw`const tabbables = (layer) => [...layer.querySelectorAll('a[href], button, input, select, textarea, summary, [tabindex], [contenteditable=true]')]
  .filter((el) => el.tabIndex >= 0 && !el.matches(':disabled') && !el.closest('[inert]') && el.checkVisibility());`;

/** What the open layer is: null when it is not a dialog. */
const DIALOG = String.raw`(() => { const layer = document.querySelector('[data-ov-layer]');
  if (!layer || !layer.matches('dialog, [role=dialog], [role=alertdialog], [aria-modal=true]')) return null;
  ${TABBABLE}
  return { tag: layer.tagName.toLowerCase() + '.' + (typeof layer.className === 'string' ? layer.className.trim().split(/\s+/)[0] : ''), modal: layer.matches('dialog:modal'),
    stops: tabbables(layer).length, inside: layer.contains(document.activeElement) }; })()`;

/** Where focus is after Tab: inside the layer, on the document itself (what the browser's own controls take it to), or on the page behind. */
const FOCUS = String.raw`(() => { const layer = document.querySelector('[data-ov-layer]'), on = document.activeElement;
  const place = !layer || !on ? 'none' : layer.contains(on) ? 'inside' : on === document.body || on === document.documentElement ? 'document' : 'behind';
  return { place, on: on ? on.tagName.toLowerCase() + (typeof on.className === 'string' && on.className ? '.' + on.className.trim().split(/\s+/)[0] : '') : 'none' }; })()`;

/** Tags what a person fills in the open dialog and the button that sends it, and says what they are. */
const FORM = String.raw`(() => { const layer = document.querySelector('[data-ov-layer]');
  if (!layer || !layer.matches('dialog')) return null;
  layer.querySelectorAll('[data-vux-field], [data-vux-primary]').forEach((el) => { el.removeAttribute('data-vux-field'); el.removeAttribute('data-vux-primary'); });
  const shown = (el) => el.checkVisibility() && !el.closest('[inert]');
  const fields = [...layer.querySelectorAll('input, textarea')].filter((el) => shown(el) && !el.disabled && !el.readOnly
    && !/^(hidden|checkbox|radio|file|button|submit|reset|range|color|image)$/.test(el.type));
  fields.forEach((el, index) => { el.dataset.vuxField = String(index); });
  const buttons = [...layer.querySelectorAll('button')].filter((el) => shown(el) && !/^(取消|关闭|放弃|Cancel|Close)$/.test((el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, '').trim()) && !el.hasAttribute('data-dialog-close'));
  const primary = buttons.filter((el) => el.matches('.mw-btn--primary, .mw-btn--danger, [type=submit]')).at(-1) ?? buttons.at(-1) ?? null;
  if (primary) primary.dataset.vuxPrimary = '';
  return { fields: fields.length, buttons: [...layer.querySelectorAll('button')].filter(shown).length, firstIsInput: fields[0]?.tagName === 'INPUT', primary: primary ? (primary.getAttribute('aria-label') || primary.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30) : null }; })()`;

/** What a person types: a different word in each field. */
const TYPE = String.raw`(() => [...document.querySelectorAll('[data-ov-layer] [data-vux-field]')].map((el, index) => {
  const value = el.type === 'url' ? 'https://example.com/vux29-' + index : el.type === 'number' ? String(3 + index) : el.type === 'date' ? '2026-12-0' + (1 + index) : el.type === 'email' ? 'vux29@example.com'
    : '二〇二六年的第 ' + (index + 1) + ' 个新名字';
  el.focus(); const setter = Object.getOwnPropertyDescriptor(el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set;
  setter.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return value; }))()`;

/** Empties what was typed, so a dialog the walk opens again and presses has nothing to send. */
const CLEAR = String.raw`(() => { for (const el of document.querySelectorAll('[data-vux-field]')) { if (!el.isConnected) continue;
  const setter = Object.getOwnPropertyDescriptor(el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set;
  setter.call(el, ''); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); } })()`;

/** The dialog as a person sees it after the Host said no: still open, what is in the fields, and what is said inside it. */
const AFTER = String.raw`(() => { const layer = document.querySelector('[data-ov-layer]');
  const open = !!layer && layer.isConnected && layer.checkVisibility() && (!(layer instanceof HTMLDialogElement) || layer.open);
  const values = [...(layer?.querySelectorAll('[data-vux-field]') ?? [])].map((el) => el.value);
  const said = [...(layer?.querySelectorAll('[role=alert], [aria-live=assertive], [class*=error], [data-error], [data-mw-state=failed], .mw-alert') ?? [])]
    .filter((el) => !/^(input|textarea|select)$/i.test(el.tagName) && el.checkVisibility() && (el.textContent || '').trim()).map((el) => el.textContent.replace(/\s+/g, ' ').trim().slice(0, 80));
  const busy = !!layer?.querySelector('[data-loading], [aria-busy=true]') || layer?.getAttribute('aria-busy') === 'true';
  return { open, values, said, busy, samePage: window.__vuxKept === true }; })()`;

/** The middle of the dialog's button, or null when something else is on top of it. */
const PRIMARY_POINT = String.raw`(() => { const el = document.querySelector('[data-ov-layer] [data-vux-primary]'); if (!el) return null;
  const box = el.getBoundingClientRect(); const x = box.x + box.width / 2, y = box.y + box.height / 2;
  return el.contains(document.elementFromPoint(x, y)) ? { x, y } : null; })()`;

async function setUp(t: TestContext) {
  const browser = await openGoalBrowser(t, "seeded", seedLongChinese); if (!browser) return null;
  const { evaluate, waitFor, command, sessionId, navigate, origin, projectId } = browser;
  // A refused save leaves unsaved work, so leaving the screen may ask first: the walk answers Leave and says so.
  t.after(browser.on("Page.javascriptDialogOpening", (event, session) => {
    t.diagnostic(`browser dialog (${String(event.type)}) on ${String(event.url)}: answered ${event.type === "beforeunload" ? "Leave" : "No"}`);
    void command("Page.handleJavaScriptDialog", { accept: event.type === "beforeunload" }, session).catch(() => undefined);
  }));
  // Each plugin runs in its own isolated frame: its dialogs are read and pressed there (the walk reads the shell and the frame).
  const views: Record<string, View> = Object.fromEntries(await Promise.all(SCREENS.filter((id) => pluginSurfaceClients().some((client) => client.id === id))
    .map(async (id) => [id, await pluginFrameBrowser(t, browser, id)])));
  const content = async (path: string) => {
    const id = new URL(path, origin).searchParams.get("openPlugin");
    const child = id ? views[id] : undefined; if (!child) return null;
    await child.waitFor("document.querySelector('[data-work-surface]')"); return child;
  };
  await browser.setViewport(1280, 900);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/locale?lang=zh&next=%2F` }, sessionId));
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.readyState === 'complete' && typeof globalThis.molisWorkControlHeaders === 'function'", 20_000);
  const opened = await writeLongChinese(evaluate, projectId!);
  const screens = [...SCREENS.map((id): [string, string] => [id, `/projects/${projectId}/${id === "project" ? "" : `?openPlugin=${id}`}`]),
    ...DETAILS.filter((id) => opened[id]).map((id): [string, string] => [`${id} detail`, `/projects/${projectId}/?openPlugin=${id}&openItem=${encodeURIComponent(opened[id]!)}`]),
    ["project settings", `/projects/${projectId}/settings`]];
  // What the walk cannot press: a deck or a form is opened by its row before the dialogs it has can be asked for.
  const direct: Array<[where: string, path: string, steps: string[]]> = [
    ["ppt deck 「从文字生成大纲」", `/projects/${projectId}/?openPlugin=ppt`, ["[data-ppt-id]", "[data-ppt-outline-open]"]],
    ["ppt deck 「删除」", `/projects/${projectId}/?openPlugin=ppt`, ["[data-ppt-id]", "details:has([data-ppt-delete]) > summary", "[data-ppt-delete]"]],
    ["form 「删除」", `/projects/${projectId}/?openPlugin=form`, ["[data-form-id]", "details:has([data-form-delete]) > summary", "[data-form-delete]"]],
  ];
  return { browser: { ...browser, content }, views, screens, direct, names: TITLES.map((title) => title.slice(0, 10)) };
}

/** Opens a dialog by pressing the selectors in turn (each once it is shown), as a person would, and reads it while it is open. */
async function readDirect({ command, sessionId, navigate, origin }: Browser, view: View, [where, path, steps]: [string, string, string[]], read: Read) {
  const { evaluate, waitFor } = view;
  await navigate(() => command("Page.navigate", { url: origin + path }, sessionId));
  await command("Page.bringToFront", {}, sessionId);
  await waitFor("document.readyState === 'complete' && !!document.querySelector('[data-work-surface]')", 20_000);
  await pause(1500);
  for (const [index, selector] of steps.entries()) {
    if (index === steps.length - 1) await evaluate(OVERLAY_BEFORE);
    await waitFor(`document.querySelector(${JSON.stringify(selector)})?.checkVisibility() === true`, 15_000);
    const point = await view.point(selector).catch(() => null);
    assert.ok(point, `${where}: ${selector} can be pressed`);
    for (const type of ["mousePressed", "mouseReleased"] as const) await command("Input.dispatchMouseEvent", { type, ...point, button: "left", clickCount: 1 }, sessionId);
    await pause(index === steps.length - 1 ? 700 : 1200);
  }
  assert.ok(await evaluate(OVERLAY_OPEN), `${where}: the dialog opened`);
  await read(where, evaluate, view.point);
  for (const type of ["rawKeyDown", "keyUp"] as const) await command("Input.dispatchKeyEvent", { type, key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, sessionId);
  await pause(300);
}

/**
 * Presses Tab and Shift+Tab round the open dialog and a little more. After its last stop (or before its first) the browser's own
 * controls may take focus, which the page sees as the document; the next press must bring it back inside. The page behind the
 * dialog never takes it. Reports what it read in `seen` and what is wrong in `leaks`.
 */
/** What can still be pressed or focused in the page around the plugin frame shown now (the frame and its ancestors aside). */
const AROUND_FRAME = String.raw`(() => { const frame = [...document.querySelectorAll('iframe[data-plugin-frame]')].find((f) => f.checkVisibility()); if (!frame) return ['no frame'];
  return [...document.querySelectorAll('a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"]), [contenteditable=true]')]
    .filter((el) => el !== frame && !el.contains(frame) && !el.closest('[inert]') && el.checkVisibility() && !el.disabled)
    .slice(0, 4).map((el) => el.tagName.toLowerCase() + (el.getAttribute('aria-label') ? '「' + el.getAttribute('aria-label') + '」' : '')); })()`;

function focusLoop({ evaluate, command, sessionId }: Browser, seen: { dialogs: string[]; presses: number }, leaks: string[]) {
  const tab = async (shift: boolean) => {
    for (const type of ["keyDown", "keyUp"] as const) await command("Input.dispatchKeyEvent", { type, key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, ...(shift ? { modifiers: 8 } : {}) }, sessionId);
    await pause(50);
  };
  return async (where: string, inspect: Evaluate = evaluate, point?: View["point"]) => {
    const framed = point !== undefined;
    const dialog = await inspect<{ tag: string; modal: boolean; stops: number; inside: boolean } | null>(DIALOG);
    if (!dialog) return;
    seen.dialogs.push(`${where}: ${dialog.tag} (${dialog.stops} stops)`);
    if (!dialog.modal) leaks.push(`${where}: ${dialog.tag} is shown without showModal(), so the page behind it still takes focus`);
    if (!dialog.inside) leaks.push(`${where}: focus did not move into ${dialog.tag} when it opened`);
    // A modal in a plugin's frame sets aside the workbench around the frame too, as showModal() does in one document.
    if (framed) {
      const open = await evaluate<string[]>(AROUND_FRAME);
      if (open.length) leaks.push(`${where}: ${dialog.tag} is modal in its frame, but around the frame ${open.join(", ")} can still be used`);
    }
    for (const shift of [false, true]) {
      let outside = 0;
      for (let step = 0; step < dialog.stops + 3; step++) {
        await tab(shift);
        seen.presses++;
        const focus = await inspect<{ place: string; on: string }>(FOCUS);
        outside = focus.place === "inside" ? 0 : outside + 1;
        // In a plugin's frame the page around it is checked too: nothing behind the frame takes focus. Leaving the frame's last
        // stop passes through the frame's edge and then the browser's own controls, one stop more than in one document.
        const behind = !framed ? null : await evaluate<string | null>("(() => { const a = document.activeElement; return !a || a === document.body || a.tagName === 'IFRAME' ? null : a.tagName.toLowerCase() + (a.className ? '.' + String(a.className).split(' ')[0] : ''); })()");
        if (focus.place === "behind" || behind || outside > (framed ? 2 : 1)) { leaks.push(`${where}: ${shift ? "Shift+Tab" : "Tab"} step ${step + 1} left ${dialog.tag} for ${behind ? behind + " (the page around the frame)" : `${focus.on} (${focus.place})`}`); break; }
      }
    }
  };
}

interface Submitted { lines: string[]; twice: string[]; lost: string[]; submitted: number; refusedWithInput: number; confirms: string[] }

/**
 * Chrome answers every request that changes something with an error, so nothing the walk presses (a delete button in a dialog it
 * opens again, say) changes anything. Between `hold()` and `refuse()` the requests are kept instead, to be counted first.
 */
async function refusingChanges({ command, sessionId, on, origin }: Browser) {
  type Held = { requestId: string; line: string };
  const held: Held[] = [];
  let holding = false;
  const answer = (requestId: string) => command("Fetch.fulfillRequest", { requestId, responseCode: 500, responseHeaders: [{ name: "Content-Type", value: "application/json" }],
    body: Buffer.from(JSON.stringify({ error: "VUX-29 测试：这次请求被拒绝", code: "vux29.refused" })).toString("base64") }, sessionId).catch(() => undefined);
  const off = on("Fetch.requestPaused", (event, session) => {
    if (session !== sessionId) return;
    const request = event.request as { method: string; url: string };
    // Reads, and the page's own lifecycle (an isolated plugin page registers and leaves; the page subscribes to Home events),
    // go through: they change nothing a dialog asks for.
    if (/^(GET|HEAD|OPTIONS)$/.test(request.method) || /\/api\/(host\/plugin-pages|home\/events)(\/|$)/.test(new URL(request.url).pathname)) { void command("Fetch.continueRequest", { requestId: event.requestId }, sessionId).catch(() => undefined); return; }
    if (holding) held.push({ requestId: String(event.requestId), line: `${request.method} ${new URL(request.url).pathname}` });
    else void answer(String(event.requestId));
  });
  await command("Fetch.enable", { patterns: [{ urlPattern: `${origin}/*`, requestStage: "Request" }] }, sessionId);
  return {
    /** What was kept since `hold()`, as "METHOD /path". */
    sent: () => held.map((request) => request.line),
    hold: () => { held.length = 0; holding = true; },
    refuse: async () => { holding = false; for (const request of held.splice(0)) await answer(request.requestId); },
    stop: async () => { off(); holding = false; for (const request of held.splice(0)) await answer(request.requestId); await command("Fetch.disable", {}, sessionId); },
  };
}

/** `read(where)` types in the open dialog, presses its button twice at once (the mouse, then Enter in a field), and looks at what the dialog did. */
async function submitAudit(browser: Browser) {
  const { evaluate, command, sessionId } = browser;
  const requests = await refusingChanges(browser);
  const press = (type: "mousePressed" | "mouseReleased", point: { x: number; y: number }) => command("Input.dispatchMouseEvent", { type, ...point, button: "left", clickCount: 1 }, sessionId);
  const enter = (type: "keyDown" | "keyUp") => command("Input.dispatchKeyEvent", { type, key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, ...(type === "keyDown" ? { text: "\r" } : {}) }, sessionId);
  const result: Submitted = { lines: [], twice: [], lost: [], submitted: 0, refusedWithInput: 0, confirms: [] };

  const read: Read = async (where, inspect = evaluate, point) => {
    const form = await inspect<{ fields: number; buttons: number; primary: string | null; firstIsInput: boolean } | null>(FORM);
    // A confirmation has nothing to type and at most a close mark, Cancel and the one button that goes ahead; a chooser (a grid of templates) is not one.
    const confirmation = !form?.fields && (form?.buttons ?? 9) <= 3;
    if (!form || !form.primary) return;
    const typed = await inspect<string[]>(TYPE);
    await pause(150);
    try {
      if (await inspect<boolean>("!!document.querySelector('[data-ov-layer] [data-vux-primary]')?.disabled")) { result.lines.push(`${where}: 「${form.primary}」 stays disabled after typing in ${form.fields} field(s): not sent`); return; }
      await inspect("window.__vuxKept = true");
      for (const how of typed.length && form.firstIsInput ? ["click", "enter"] as const : ["click"] as const) {
        if (!(await inspect<{ open: boolean }>(AFTER)).open) break;
        requests.hold();
        if (how === "click") {
          const at = point ? await point("[data-ov-layer] [data-vux-primary]").catch(() => null) : await inspect<{ x: number; y: number } | null>(PRIMARY_POINT);
          if (!at) { result.lines.push(`${where}: 「${form.primary}」 is covered`); break; }
          // Two presses one straight after the other, as a hand that does not wait for the first to show anything.
          await Promise.all([press("mousePressed", at), press("mouseReleased", at), press("mousePressed", at), press("mouseReleased", at)]);
        } else {
          await inspect("document.querySelector('[data-ov-layer] [data-vux-field]').focus()");
          await Promise.all([enter("keyDown"), enter("keyUp"), enter("keyDown"), enter("keyUp")]);
        }
        await pause(500);
        const sent = requests.sent();
        // VUX-29: a dialog with nothing to type (a delete's "are you sure") is still open and busy while its request is out, and
        // Esc then does not pretend to cancel what is on its way.
        const during = confirmation && sent.length ? await inspect<{ open: boolean; busy: boolean }>(AFTER) : null;
        if (during) {
          if (!during.open) result.lost.push(`${where} (${how}): the confirmation closed before the Host answered ${sent.join(", ")}`);
          else {
            if (!during.busy) result.lost.push(`${where} (${how}): the confirmation does not show it is sending ${sent.join(", ")}`);
            await Promise.all((["rawKeyDown", "keyUp"] as const).map((type) => command("Input.dispatchKeyEvent", { type, key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, sessionId)));
            await pause(150);
            if (!(await inspect<{ open: boolean }>(AFTER)).open) result.lost.push(`${where} (${how}): Esc closed the confirmation while ${sent.join(", ")} was out`);
          }
        }
        const counts = new Map<string, number>();
        for (const line of sent) counts.set(line, (counts.get(line) ?? 0) + 1);
        for (const [line, count] of counts) if (count > 1) result.twice.push(`${where} (${how}): 「${form.primary}」 sent ${line} ${count} times`);
        await requests.refuse();
        await pause(700);
        const after = await inspect<{ open: boolean; values: string[]; said: string[]; busy: boolean; samePage: boolean }>(AFTER);
        result.lines.push(`${where} (${how}): 「${form.primary}」 → ${sent.length ? sent.join(", ") : "nothing sent"}; open ${after.open}; said ${JSON.stringify(after.said)}`);
        // Enter in a field sends what is in it: it does not take the dialog away (a Cancel button that comes first would).
        if (how === "enter" && !sent.length && !after.open && form.firstIsInput) result.lost.push(`${where} (enter): Enter in a field closed the dialog and sent nothing`);
        if (!sent.length) continue;
        result.submitted++;
        if (!typed.length) {
          if (!confirmation) continue;
          // VUX-29: refused, a confirmation stays open and says why inside itself (not in a note on the page behind it).
          result.confirms.push(where);
          if (!during?.open) continue;
          if (!after.open) result.lost.push(`${where} (${how}): the confirmation closed when the Host refused ${sent.join(", ")}; the reason is not shown inside it`);
          else if (!after.said.length) result.lost.push(`${where} (${how}): the Host refused ${sent.join(", ")} and the confirmation says nothing`);
          else if (after.busy) result.lost.push(`${where} (${how}): the confirmation is still busy after the Host refused`);
          continue;
        }
        result.refusedWithInput++;
        if (!after.samePage) result.lost.push(`${where} (${how}): the page was left after the Host refused ${sent.join(", ")}`);
        else if (!after.open) result.lost.push(`${where} (${how}): the dialog closed when the Host refused ${sent.join(", ")}; what was typed is gone`);
        else if (JSON.stringify(after.values) !== JSON.stringify(typed)) result.lost.push(`${where} (${how}): the fields changed after the Host refused (${JSON.stringify(typed)} → ${JSON.stringify(after.values)})`);
        else if (!after.said.length) result.lost.push(`${where} (${how}): the Host refused ${sent.join(", ")} and the dialog says nothing`);
        else if (after.busy) result.lost.push(`${where} (${how}): the dialog is still busy after the Host refused`);
      }
    } finally {
      await requests.refuse();
      // The walk presses what it finds in a dialog it opens again: nothing is left in the fields for it to send.
      await inspect(CLEAR);
    }
  };
  return { read, result, stop: requests.stop };
}

/** A dialog written for the check: `how` says which rule it keeps and which it breaks. */
const SYNTHETIC = (how: "good" | "twice" | "closes" | "silent" | "cancelFirst", modal: boolean) => String.raw`(() => {
  document.querySelectorAll('#vux-behind, #vux-dialog').forEach((el) => el.remove());
  document.body.insertAdjacentHTML('beforeend', '<button id="vux-behind" type="button">behind</button><dialog id="vux-dialog" class="mw-dialog"><form method="dialog" class="vux-form"><input name="n" aria-label="n"><p class="vux-error" role="alert" hidden></p>${how === "cancelFirst" ? '<button class="mw-btn" value="cancel">取消</button>' : '<button type="button" class="mw-btn">取消</button>'}<button type="submit" class="mw-btn mw-btn--primary" value="ok">保存</button></form></dialog>');
  const dialog = document.getElementById('vux-dialog'), form = dialog.querySelector('form'), error = dialog.querySelector('.vux-error'), save = form.querySelector('[type=submit]');
  let pending = false;
  dialog.querySelector('button[type=button]')?.addEventListener('click', () => dialog.close());
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (event.submitter?.value === 'cancel') { dialog.close(); return; }
    if (${how === "twice" ? "false" : "pending"}) return;
    pending = true; save.setAttribute('data-loading', '');
    try {
      ${how === "closes" ? "dialog.close();" : ""}
      const response = await fetch('/vux29-synthetic', { method: 'POST', body: form.n.value });
      if (!response.ok) throw new Error('refused');
      dialog.close();
    } catch (caught) { ${how === "closes" || how === "silent" ? "" : "error.textContent = String(caught.message); error.hidden = false;"} }
    finally { pending = false; save.removeAttribute('data-loading'); }
  });
  ${modal ? "dialog.showModal();" : "dialog.show();"} dialog.dataset.ovLayer = ''; return true; })()`;

test("VUX-29: Tab and Shift+Tab go round inside every modal dialog of the project page and the plugins", { timeout: 3_600_000 }, async (t) => {
  const set = await setUp(t); if (!set) return;
  const { browser, views, screens, direct, names } = set;
  const seen = { dialogs: [] as string[], presses: 0 };
  const leaks: string[] = [];
  const requests = await refusingChanges(browser);
  const read = focusLoop(browser, seen, leaks);
  try {
    await walkLayers(browser, screens, names, new Set(), read, (line) => t.diagnostic(line), MORE_VERBS);
    for (const one of direct) await readDirect(browser, views[one[1].match(/openPlugin=(\w+)/)![1]]!, one, read);
  } finally { await requests.stop(); }
  t.diagnostic(`dialogs: ${seen.dialogs.length}; Tab presses: ${seen.presses}`);
  for (const line of seen.dialogs) t.diagnostic(line);
  for (const line of leaks) t.diagnostic(`LEAK ${line}`);
  assert.ok(seen.dialogs.length >= 14, `the walk reached the dialogs (${seen.dialogs.length})`);
  assert.ok(seen.presses >= seen.dialogs.length * 4, `Tab was pressed in each of them (${seen.presses})`);
  assert.deepEqual(leaks, []);
});

test("VUX-29: the focus check notices a dialog shown without showModal and passes one shown with it", { timeout: 300_000 }, async (t) => {
  const set = await setUp(t); if (!set) return;
  const { browser } = set;
  const { evaluate, command, sessionId, origin, projectId, navigate, waitFor } = browser;
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.readyState === 'complete'", 20_000);
  for (const modal of [false, true]) {
    await evaluate(SYNTHETIC("good", modal));
    await evaluate("document.querySelector('#vux-dialog input').focus()");
    const seen = { dialogs: [] as string[], presses: 0 };
    const leaks: string[] = [];
    await focusLoop(browser, seen, leaks)(modal ? "modal" : "not modal");
    t.diagnostic(`${modal ? "showModal()" : "show()"}: ${seen.presses} presses, ${leaks.join("; ") || "no leak"}`);
    assert.equal(seen.dialogs.length, 1);
    assert.ok(seen.presses >= 6);
    if (modal) assert.deepEqual(leaks, []);
    else assert.ok(leaks.some((line) => /without showModal/.test(line)) && leaks.some((line) => /behind/.test(line)), `a dialog shown without showModal is reported (${leaks.join("; ")})`);
    await evaluate("document.getElementById('vux-dialog').close()");
  }
});

test("VUX-29: a dialog's submit sent twice goes out once, and a refused submit keeps the dialog, what was typed and says why", { timeout: 3_600_000 }, async (t) => {
  const set = await setUp(t); if (!set) return;
  const { browser, views, screens, direct, names } = set;
  const audit = await submitAudit(browser);
  try {
    await walkLayers(browser, screens, names, new Set(), audit.read, (line) => t.diagnostic(line), MORE_VERBS);
    for (const one of direct) await readDirect(browser, views[one[1].match(/openPlugin=(\w+)/)![1]]!, one, audit.read);
  } finally { await audit.stop(); }
  const { result } = audit;
  t.diagnostic(`dialogs submitted: ${result.submitted}; refused with something typed: ${result.refusedWithInput}`);
  for (const line of result.lines) t.diagnostic(line);
  for (const line of result.twice) t.diagnostic(`TWICE ${line}`);
  for (const line of result.lost) t.diagnostic(`LOST ${line}`);
  assert.ok(result.submitted >= 9, `dialogs were submitted (${result.submitted})`);
  assert.ok(result.refusedWithInput >= 6, `dialogs with something typed in them were refused (${result.refusedWithInput})`);
  // The delete confirmations of Todo, Pages, Issues, Form and PPT (each of them reached by its own screen) were all refused and read.
  for (const plugin of ["todo", "pages", "issues", "form", "ppt"]) assert.ok(result.confirms.some((where) => where.startsWith(plugin)), `a ${plugin} confirmation was submitted (${result.confirms.join("; ")})`);
  assert.deepEqual(result.twice, []);
  assert.deepEqual(result.lost, []);
});

test("VUX-29: the submit check notices a dialog that sends twice, closes, says nothing or is cancelled by Enter, and passes one that does none of these", { timeout: 300_000 }, async (t) => {
  const set = await setUp(t); if (!set) return;
  const { browser } = set;
  const { evaluate, command, sessionId, origin, projectId, navigate, waitFor } = browser;
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.readyState === 'complete'", 20_000);
  const audit = await submitAudit(browser);
  const run = async (how: "good" | "twice" | "closes" | "silent" | "cancelFirst") => {
    audit.result.twice.length = audit.result.lost.length = 0;
    await evaluate(SYNTHETIC(how, true));
    await audit.read(how);
    const { twice, lost } = audit.result;
    t.diagnostic(`${how}: ${JSON.stringify({ twice, lost })}`);
    await evaluate("document.getElementById('vux-dialog')?.close()");
    return { twice: [...twice], lost: [...lost] };
  };
  try {
    assert.deepEqual(await run("good"), { twice: [], lost: [] });
    assert.ok((await run("twice")).twice.length > 0, "a dialog that sends on every press is reported");
    assert.ok((await run("closes")).lost.some((line) => /closed/.test(line)), "a dialog that closes when the Host refuses is reported");
    assert.ok((await run("silent")).lost.some((line) => /says nothing/.test(line)), "a dialog that says nothing when the Host refuses is reported");
    assert.ok((await run("cancelFirst")).lost.some((line) => /Enter in a field closed/.test(line)), "a dialog whose Enter cancels it is reported");
    assert.ok(audit.result.submitted >= 4, `each of them was submitted (${audit.result.submitted})`);
  } finally { await audit.stop(); }
});

/**
 * What a person sees of the workbench outside the visible plugin frame: at points there, the element on top, its background and how
 * opaque it is (its own and its ancestors'), next to what the frame itself shows at its middle.
 */
const OUTSIDE = String.raw`(() => { const frame = [...document.querySelectorAll('iframe[data-plugin-frame]')].find((f) => f.checkVisibility()); if (!frame) return null;
  const box = frame.getBoundingClientRect(), W = innerWidth, H = innerHeight, points = [];
  for (const [fx, fy] of [[.01, .3], [.01, .7], [.99, .3], [.99, .7], [.3, .01], [.7, .01], [.3, .99], [.7, .99], [.01, .01], [.99, .01]]) {
    const x = fx * W, y = fy * H; if (x >= box.left && x < box.right && y >= box.top && y < box.bottom) continue; points.push([x, y]); }
  const read = (x, y) => { const el = document.elementFromPoint(x, y); if (!el) return { color: 'none', opacity: 0, on: 'none' };
    let opacity = 1; for (let node = el; node; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity);
    return { color: getComputedStyle(el).backgroundColor, opacity, on: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : '') }; };
  const cover = document.querySelector('.mw-modal-cover');
  return { outside: points.map(([x, y]) => read(x, y)), inside: read(box.left + box.width / 2, box.top + box.height / 2).on,
    animated: cover ? cover.getAnimations().length + ' ' + getComputedStyle(cover).animationName + ' ' + getComputedStyle(cover).transitionProperty : 'no cover' }; })()`;

/** The colour a modal dialog of the workbench itself paints behind it. */
const BACKDROP = String.raw`(() => { const dialog = document.createElement('dialog'); document.body.append(dialog); dialog.showModal();
  const color = getComputedStyle(dialog, '::backdrop').backgroundColor; dialog.close(); dialog.remove(); return color; })()`;

test("VUX-29: while a plugin's modal dialog is open the workbench outside its frame is covered like a dialog's backdrop, and only then", { timeout: 300_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded", seedLongChinese); if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin, projectId } = browser;
  const view = await pluginFrameBrowser(t, browser, "todo");
  await browser.setViewport(1280, 900);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=todo` }, sessionId));
  await command("Page.bringToFront", {}, sessionId);
  await waitFor("document.readyState === 'complete' && typeof globalThis.molisWorkControlHeaders === 'function'", 20_000);
  await view.waitFor("document.querySelector('[data-work-surface]')");
  const scrim = await evaluate<string>(BACKDROP);
  assert.notEqual(scrim, "rgba(0, 0, 0, 0)", "a modal dialog's backdrop has a colour");
  type Seen = { outside: Array<{ color: string; opacity: number; on: string }>; inside: string; animated: string };
  const seen = () => evaluate<Seen>(OUTSIDE);
  const covered = (now: Seen) => now.outside.length >= 5 && now.outside.every((point) => point.color === scrim && point.opacity === 1);
  const settle = async (want: boolean) => { for (let wait = 0; wait < 40; wait++) { if (covered(await seen()) === want) return; await pause(100); } };
  const open = () => view.evaluate("(() => { const dialog = document.createElement('dialog'); dialog.id = 'vux29-cover'; dialog.className = 'mw-dialog'; dialog.innerHTML = '<p>VUX-29</p><button>ok</button>'; document.body.append(dialog); dialog.showModal(); return true; })()");
  const close = () => view.evaluate("document.getElementById('vux29-cover')?.remove()");

  const before = await seen();
  t.diagnostic(`before: ${JSON.stringify(before)}`);
  assert.ok(before.outside.length >= 5, `the workbench has room around the frame (${before.outside.length} points)`);
  assert.ok(!before.outside.some((point) => point.color === scrim), "nothing outside the frame is covered while no dialog is open");

  await open(); await settle(true);
  const during = await seen();
  t.diagnostic(`modal open: ${JSON.stringify(during)}`);
  assert.ok(covered(during), `VUX-29: outside the frame shows the backdrop colour ${scrim} at full strength (${JSON.stringify(during.outside)})`);
  assert.equal(during.inside, "iframe", "the frame itself is not covered a second time (its dialog has its own backdrop)");
  // Reduced motion: shown at once, no fade.
  assert.match(during.animated, /^0 none (none|all)?/, `no animation under reduced motion (${during.animated})`);

  await close(); await settle(false);
  const after = await seen();
  assert.ok(!after.outside.some((point) => point.color === scrim) && after.animated === "no cover", `the cover goes when the dialog does (${JSON.stringify(after)})`);

  // Hidden frame: the cover goes with it (the workbench is not left dimmed behind a page nobody sees).
  await open(); await settle(true);
  await evaluate("document.querySelector('section[data-work-surface=todo]').hidden = true");
  const covers = () => evaluate<number>("document.querySelectorAll('.mw-modal-cover').length");
  for (let wait = 0; wait < 40 && await covers(); wait++) await pause(100);
  assert.equal(await covers(), 0, "a hidden frame leaves nothing covered");
  await evaluate("document.querySelector('section[data-work-surface=todo]').hidden = false");

  // Motion allowed: the cover fades in (an animation is running or has just run), as the backdrop of a dialog does.
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] }, sessionId);
  await close(); await open(); await settle(true);
  const moving = await seen();
  t.diagnostic(`modal open, motion allowed: ${JSON.stringify(moving)}`);
  assert.ok(covered(moving), "the cover is shown with motion allowed too");
  assert.match(moving.animated, /craft-fade-in/, `with motion allowed it fades in like the dialog's own backdrop (${moving.animated})`);
  await close(); await settle(false);
  // Frame teardown: leaving the page leaves nothing of the cover behind.
  await open(); await settle(true);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.readyState === 'complete'", 20_000);
  assert.equal(await evaluate("document.querySelectorAll('.mw-modal-cover').length"), 0, "no cover outlives the frame");
});

test("VUX-29: no dialog in the source is shown without showModal", () => {
  // The dialogs a walk cannot reach (a dialog is opened by what it is about) are held to the same rule where they are written.
  const roots = ["apps", "packages", "plugins", "modules", "horizontal", "server"];
  const files: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path); else if (/\.(ts|tsx)$/.test(entry.name) && /\/src\//.test(`/${path}`) && !/\.test\.ts$/.test(entry.name)) files.push(path);
    }
  };
  for (const root of roots) { try { visit(root); } catch { /* a root this checkout does not have */ } }
  const shown: string[] = [];
  let dialogs = 0;
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    dialogs += (text.match(/showModal\(\)/g) ?? []).length;
    for (const [number, line] of text.split("\n").entries()) {
      if (/\b\w*(?:[dD]ialog|dlg|[mM]odal|[cC]onfirm\w*|\w*Box)\??\.show\(\)/.test(line) || /\b\w*(?:[dD]ialog|dlg)\w*\.open\s*=\s*true/.test(line) || /<dialog\b[^>]*\sopen[\s>=]/.test(line)) shown.push(`${file}:${number + 1}: ${line.trim().slice(0, 120)}`);
    }
  }
  assert.ok(dialogs >= 60, `the source was read (${dialogs} showModal calls in ${files.length} files)`);
  assert.deepEqual(shown, []);
});
