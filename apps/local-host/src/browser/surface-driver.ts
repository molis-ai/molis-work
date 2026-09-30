import { createHash } from "node:crypto";
import path from "node:path";
import type { HostSurfaceAction, HostSurfaceDriver, HostSurfaceObservationKind } from "@molis-ai/molis-work-contracts/services/ui-surfaces";
import { browserAddress, BrowserError, type BrowserPage } from "./browser-host.js";

/**
 * The side panel page as the Assistant sees and drives it (specs/side-panel D05–D10). Prologue decides whether each
 * look and each action may happen; this driver only does it, on the same page the person watches, and marks what it
 * does so the panel can show it. While the person has taken the page over, every action is refused.
 */
const ELEMENT_LIMIT = 300;
const TEXT_BUDGET = 6_000;
const IDLE_RELEASE_MS = 60_000;

/** Runs in the page: what can be acted on in the viewport, with centres to click, and the visible text around it. */
const OUTLINE_SCRIPT = `(() => {
  const vw = innerWidth, vh = innerHeight, out = [];
  const selector = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=checkbox],[role=radio],[role=tab],[role=menuitem],[role=option],[role=switch],[role=combobox],[role=textbox],[role=searchbox],[contenteditable=""],[contenteditable=true]';
  const clean = (value, max) => String(value || '').replace(/\\s+/g, ' ').trim().slice(0, max);
  const sensitive = el => el.type === 'password' || /cc-|one-time-code/.test(el.getAttribute('autocomplete') || '');
  const nameOf = el => clean(el.getAttribute('aria-label') || (el.labels && el.labels[0] && el.labels[0].innerText) || el.getAttribute('title') || el.getAttribute('placeholder') || (el.tagName === 'INPUT' ? '' : el.innerText) || el.getAttribute('alt') || el.getAttribute('name') || (el.tagName === 'INPUT' && /submit|button/.test(el.type) ? el.value : ''), 80);
  for (const el of document.querySelectorAll(selector)) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.right < 0 || r.top > vh || r.left > vw) continue;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none' || style.pointerEvents === 'none' || Number(style.opacity) === 0) continue;
    const x = Math.round(Math.min(vw - 1, Math.max(0, r.left + r.width / 2))), y = Math.round(Math.min(vh - 1, Math.max(0, r.top + r.height / 2)));
    const hit = document.elementFromPoint(x, y);
    if (hit && !(hit === el || el.contains(hit) || hit.contains(el))) continue;
    const tag = el.tagName;
    const role = el.getAttribute('role') || (tag === 'A' ? 'link' : tag === 'BUTTON' ? 'button' : tag === 'SELECT' ? 'select' : tag === 'TEXTAREA' ? 'textarea' : tag === 'INPUT' ? 'input:' + (el.type || 'text') : el.isContentEditable ? 'editor' : tag.toLowerCase());
    let value = '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') value = sensitive(el) ? (el.value ? '(已填写，已隐藏)' : '') : clean(el.value, 60);
    if (tag === 'SELECT') value = clean(el.selectedOptions && el.selectedOptions[0] && el.selectedOptions[0].text, 60);
    const states = [];
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') states.push('不可用');
    if (el.checked || el.getAttribute('aria-checked') === 'true') states.push('已选中');
    if (el.getAttribute('aria-expanded') === 'true') states.push('已展开');
    if (el.required) states.push('必填');
    if (document.activeElement === el) states.push('有焦点');
    let href = '';
    if (tag === 'A') { try { const u = new URL(el.href); href = u.origin === location.origin ? u.pathname : u.origin + u.pathname; } catch {} }
    out.push({ role, name: nameOf(el), value, states, x, y, href });
    if (out.length >= ${ELEMENT_LIMIT}) break;
  }
  const text = [], seen = new Set();
  let budget = ${TEXT_BUDGET};
  for (const el of document.querySelectorAll('h1,h2,h3,h4,p,li,td,th,dt,dd,blockquote,figcaption,[role=heading],[role=alert],[role=status]')) {
    if (budget <= 0) break;
    const r = el.getBoundingClientRect();
    if (r.height < 1 || r.bottom < 0 || r.top > vh) continue;
    const line = clean(el.innerText, 240);
    if (!line || seen.has(line)) continue;
    seen.add(line); text.push((/^H[1-4]$/.test(el.tagName) ? '# ' : '') + line); budget -= line.length;
  }
  const page = document.scrollingElement || document.documentElement;
  return JSON.stringify({ path: location.origin + location.pathname, title: document.title, vw, vh, sy: Math.round(scrollY), max: Math.max(0, Math.round(page.scrollHeight - vh)), elements: out, text });
})()`;

const MASK_ID = "__molis_side_mask";
const MASK_ON = `(() => { if (document.getElementById('${MASK_ID}')) return; const s = document.createElement('style'); s.id = '${MASK_ID}';
  s.textContent = 'input[type=password],input[autocomplete*="cc-"],input[autocomplete="one-time-code"]{color:transparent!important;text-shadow:none!important;background:#1d1d1f!important;caret-color:transparent!important}';
  (document.head || document.documentElement).append(s); })()`;
const MASK_OFF = `document.getElementById('${MASK_ID}')?.remove()`;

const KEYS: Record<string, { key: string; code: string; keyCode: number; text?: string }> = {
  enter: { key: "Enter", code: "Enter", keyCode: 13, text: "\r" }, tab: { key: "Tab", code: "Tab", keyCode: 9 }, escape: { key: "Escape", code: "Escape", keyCode: 27 },
  esc: { key: "Escape", code: "Escape", keyCode: 27 }, backspace: { key: "Backspace", code: "Backspace", keyCode: 8 }, delete: { key: "Delete", code: "Delete", keyCode: 46 },
  arrowup: { key: "ArrowUp", code: "ArrowUp", keyCode: 38 }, arrowdown: { key: "ArrowDown", code: "ArrowDown", keyCode: 40 },
  arrowleft: { key: "ArrowLeft", code: "ArrowLeft", keyCode: 37 }, arrowright: { key: "ArrowRight", code: "ArrowRight", keyCode: 39 },
  home: { key: "Home", code: "Home", keyCode: 36 }, end: { key: "End", code: "End", keyCode: 35 }, pageup: { key: "PageUp", code: "PageUp", keyCode: 33 },
  pagedown: { key: "PageDown", code: "PageDown", keyCode: 34 }, space: { key: " ", code: "Space", keyCode: 32, text: " " },
};
const MODIFIERS: Record<string, number> = { alt: 1, option: 1, control: 2, ctrl: 2, meta: 4, cmd: 4, command: 4, shift: 8 };

const MODIFIER_KEYS: Record<string, { key: string; code: string; keyCode: number }> = {
  alt: { key: "Alt", code: "AltLeft", keyCode: 18 }, option: { key: "Alt", code: "AltLeft", keyCode: 18 }, control: { key: "Control", code: "ControlLeft", keyCode: 17 },
  ctrl: { key: "Control", code: "ControlLeft", keyCode: 17 }, meta: { key: "Meta", code: "MetaLeft", keyCode: 91 }, cmd: { key: "Meta", code: "MetaLeft", keyCode: 91 },
  command: { key: "Meta", code: "MetaLeft", keyCode: 91 }, shift: { key: "Shift", code: "ShiftLeft", keyCode: 16 },
};

function keyOf(name: string): { key: string; code: string; keyCode: number; text?: string } {
  const known = KEYS[name.toLowerCase()] ?? MODIFIER_KEYS[name.toLowerCase()];
  if (known) return known;
  if (/^[a-z]$/iu.test(name)) return { key: name, code: `Key${name.toUpperCase()}`, keyCode: name.toUpperCase().charCodeAt(0), text: name };
  if (/^\d$/u.test(name)) return { key: name, code: `Digit${name}`, keyCode: name.charCodeAt(0), text: name };
  if (/^F([1-9]|1[0-2])$/u.test(name)) return { key: name, code: name, keyCode: 111 + Number(name.slice(1)) };
  throw new BrowserError("page.load_failed", `认不出按键「${name}」`);
}

/** Uploads come from a path Prologue has already checked against its floor table (never `.ssh` and the like). */
export function createBrowserSurfaceDriver(page: BrowserPage, blocked: (origin: string) => boolean = () => false): HostSurfaceDriver {
  const producedScreens: string[] = [];
  let idle: ReturnType<typeof setTimeout> | undefined;
  const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
  const release = () => { if (page.controlMode === "assistant") page.setControl({ mode: "person", work_id: null, activity: null }); };
  const mark = (sessionId: string | null, summary: string, point: { x: number; y: number } | null) => {
    if (page.controlMode === "taken-over") throw new BrowserError("page.load_failed", "用户已接手这个页面，助理暂停操作。等用户交还后，先重新观察页面。");
    page.setControl({ mode: "assistant", work_id: sessionId, activity: { summary, point, at: new Date().toISOString() } });
    clearTimeout(idle);
    idle = setTimeout(release, IDLE_RELEASE_MS);
    idle.unref?.();
  };
  const settle = async () => {
    // Give a click or a key the moment a page needs to react, and a started navigation the time to arrive.
    await new Promise(resolve => setTimeout(resolve, 250));
    for (let waited = 0; page.snapshot().loading && waited < 10_000; waited += 200) await new Promise(resolve => setTimeout(resolve, 200));
  };
  const labelAt = async (x: number, y: number): Promise<string> => {
    const value = await page.evaluate(`(() => { const el = document.elementFromPoint(${Math.round(x)}, ${Math.round(y)}); if (!el) return ''; const t = el.closest('a,button,input,select,textarea,label,[role]') || el; return String(t.getAttribute('aria-label') || t.innerText || t.getAttribute('placeholder') || t.getAttribute('title') || t.value || '').replace(/\\s+/g, ' ').trim().slice(0, 40); })()`).catch(() => "");
    return typeof value === "string" ? value : "";
  };
  const origin = () => page.snapshot().origin || "这个页面";
  return {
    kind: "browser",
    project_id: page.projectId,
    async identity() {
      const session = await page.session();
      return `${session.targetId}\u0000${page.snapshot().url}`;
    },
    async scope() {
      const state = page.snapshot();
      if (!state.origin) throw new BrowserError("page.load_failed", "页面还没有打开任何网站");
      return state.origin;
    },
    async observe(kind: HostSurfaceObservationKind) {
      await page.ensure();
      // A site the person blocked is not even looked at, from the moment they said so (Prologue's own deny rule joins
      // when the runtime next starts).
      if (blocked(page.snapshot().origin)) throw new BrowserError("page.load_failed", "用户禁止助理查看或操作这个网站。");
      // Looking is the Assistant using the page too: the panel shows it (and opens itself) before any action.
      if (page.controlMode !== "taken-over") mark(null, `正在查看 ${origin()}`, null);
      if (kind === "screenshot") {
        const session = await page.session();
        await session.send("Runtime.evaluate", { expression: MASK_ON });
        try {
          const shot = await session.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }) as { data: string };
          const bytes = new Uint8Array(Buffer.from(shot.data, "base64"));
          producedScreens.push(digest(bytes));
          if (producedScreens.length > 32) producedScreens.shift();
          return bytes;
        } finally { await session.send("Runtime.evaluate", { expression: MASK_OFF }).catch(() => undefined); }
      }
      if (kind === "window-metadata") {
        const state = page.snapshot();
        return new TextEncoder().encode(JSON.stringify({ site: state.origin, title: state.title, viewport: state.viewport, loading: state.loading, popup: state.popup_depth > 0 }));
      }
      if (kind === "dom") {
        const capture = await page.capture();
        return new TextEncoder().encode(`页面：${capture.title}\n网站：${capture.origin}\n\n${capture.text}${capture.truncated ? "\n[页面正文较长，只取了开头]" : ""}`);
      }
      const raw = await page.evaluate(OUTLINE_SCRIPT);
      const outline = JSON.parse(typeof raw === "string" ? raw : "{}") as { path: string; title: string; vw: number; vh: number; sy: number; max: number;
        elements: Array<{ role: string; name: string; value: string; states: string[]; x: number; y: number; href: string }>; text: string[] };
      const lines = [
        `页面：${outline.title || "（无标题）"}`,
        `地址：${outline.path}`,
        `视口：${outline.vw}×${outline.vh}，已向下滚动 ${outline.sy}/${outline.max}`,
        "",
        "可操作的元素（点击时用 @ 后面的中心坐标）：",
        ...outline.elements.map((element, index) => `[${index + 1}] ${element.role}「${element.name || "无名称"}」${element.value ? ` 值=${element.value}` : ""}${element.href ? ` → ${element.href}` : ""}${element.states.length ? ` （${element.states.join("、")}）` : ""} @(${element.x},${element.y})`),
        ...(outline.elements.length >= ELEMENT_LIMIT ? ["（元素较多，只列出前 300 个）"] : []),
        "",
        "视口里的文字：",
        ...outline.text,
      ];
      return new TextEncoder().encode(lines.join("\n"));
    },
    async perform(action: HostSurfaceAction, context) {
      const sessionId = context.session_id;
      if (blocked(page.snapshot().origin)) throw new BrowserError("page.load_failed", "用户禁止助理查看或操作这个网站。");
      const session = await page.session();
      const send = (method: string, params: Record<string, unknown>) => session.send(method, params);
      switch (action.what) {
        case "pointer": {
          const label = await labelAt(action.x, action.y);
          mark(sessionId, `在 ${origin()} ${action.button === "right" ? "右键点击" : action.clicks > 1 ? "双击" : "点击"}${label ? `「${label}」` : `（${action.x}, ${action.y}）`}`, { x: action.x, y: action.y });
          await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: action.x, y: action.y, button: "none", buttons: 0 });
          for (let click = 1; click <= Math.max(1, Math.min(3, action.clicks)); click += 1) {
            await send("Input.dispatchMouseEvent", { type: "mousePressed", x: action.x, y: action.y, button: action.button, buttons: 1, clickCount: click });
            await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: action.x, y: action.y, button: action.button, buttons: 0, clickCount: click });
          }
          await settle();
          return;
        }
        case "key": {
          // The keys are pressed together (["Control", "a"]); "Control+a" in one entry means the same.
          const parts = action.keys.flatMap(entry => entry.split("+")).map(part => part.trim()).filter(Boolean);
          const modifiers = parts.reduce((mask, part) => mask | (MODIFIERS[part.toLowerCase()] ?? 0), 0);
          const main = parts.filter(part => MODIFIERS[part.toLowerCase()] === undefined);
          if (main.length > 1) throw new BrowserError("page.load_failed", "一次只能按一个键（可以加 Ctrl、Shift 等修饰键）；按顺序按几个键请分几次做。");
          mark(sessionId, `在 ${origin()} 按下 ${parts.join(" + ")}`, null);
          const key = main.length ? keyOf(main[0]!) : keyOf(parts.at(-1) ?? "");
          const text = modifiers & (2 | 4) ? undefined : key.text;
          await send("Input.dispatchKeyEvent", { type: text ? "keyDown" : "rawKeyDown", key: key.key, code: key.code, windowsVirtualKeyCode: key.keyCode, modifiers, ...(text ? { text } : {}) });
          await send("Input.dispatchKeyEvent", { type: "keyUp", key: key.key, code: key.code, windowsVirtualKeyCode: key.keyCode, modifiers });
          await settle();
          return;
        }
        case "text": {
          const field = await page.evaluate(`(() => { const el = document.activeElement; if (!el || el === document.body) return ''; return String(el.getAttribute('aria-label') || (el.labels && el.labels[0] && el.labels[0].innerText) || el.getAttribute('placeholder') || el.getAttribute('name') || '').replace(/\\s+/g, ' ').trim().slice(0, 40); })()`).catch(() => "");
          mark(sessionId, `在 ${origin()} ${field ? `的「${String(field)}」里` : ""}输入 ${[...action.text].length} 个字`, null);
          await send("Input.insertText", { text: action.text });
          return;
        }
        case "navigate": {
          const address = browserAddress(action.url);
          if ("blocked" in address) throw new BrowserError("page.blocked_scheme", `只能打开网页地址，不能打开「${address.blocked}:」`);
          mark(sessionId, `打开 ${new URL(address.url).origin}`, null);
          await page.navigate(address.url);
          await settle();
          return;
        }
        case "wait": {
          mark(sessionId, `等待页面（${Math.round(Math.min(action.ms, 10_000) / 100) / 10} 秒）`, null);
          await new Promise(resolve => setTimeout(resolve, Math.max(0, Math.min(action.ms, 10_000))));
          return;
        }
        case "upload": {
          const file = path.resolve(path.sep, ...action.from);
          const chooser = page.snapshot().file_chooser;
          if (!chooser) throw new BrowserError("page.load_failed", "网页现在没有在等待选择文件：先点击网页上的上传按钮。");
          mark(sessionId, `向 ${origin()} 上传 ${path.basename(file)}`, null);
          await page.chooseFiles(chooser.id, [file]);
          await settle();
          return;
        }
        case "download": {
          throw new BrowserError("page.load_failed", "侧栏浏览器里的下载由用户在下载提示里保存；助理不能把文件存到本机指定位置。");
        }
      }
    },
    async close() { clearTimeout(idle); release(); },
    masked(bytes: Uint8Array) { return producedScreens.includes(digest(bytes)); },
  };
}

