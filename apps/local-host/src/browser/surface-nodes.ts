import { randomUUID } from "node:crypto";
import { browserErrors } from "./errors.js";
import type { BrowserPage } from "./browser-host.js";

export const ELEMENT_LIMIT = 300;
const TEXT_BUDGET = 6_000;
type PageSession = Awaited<ReturnType<BrowserPage["session"]>>;
interface ElementOutline { role: string; name: string; value: string; states: string[]; x: number; y: number; href: string }
interface Outline {
  path: string; title: string; vw: number; vh: number; sy: number; max: number;
  elements: Array<ElementOutline & { node: string }>; text: string[];
}
interface Retained {
  session: PageSession; group: string; objectId: string; url: string; takeovers: number; nodes: Map<string, number>;
}
interface RemoteValue<T> { result?: { objectId?: string; value?: T }; exceptionDetails?: unknown }

// Both the initial outline and a retained object's current position use the same page-owned names and hit test.
const ELEMENT_SCRIPT = `
  const clean = (value, max) => String(value || '').replace(/\\s+/g, ' ').trim().slice(0, max);
  const sensitive = el => el.type === 'password' || /cc-|one-time-code/.test(el.getAttribute('autocomplete') || '');
  const nameOf = el => clean(el.getAttribute('aria-label') || (el.labels && el.labels[0] && el.labels[0].innerText) || el.getAttribute('title') || el.getAttribute('placeholder') || (el.tagName === 'INPUT' ? '' : el.innerText) || el.getAttribute('alt') || el.getAttribute('name') || (el.tagName === 'INPUT' && /submit|button/.test(el.type) ? el.value : ''), 80);
  const pointOf = el => {
    const r = el.getBoundingClientRect(), style = getComputedStyle(el);
    const left = Math.max(0, r.left), right = Math.min(innerWidth - 1, r.right), top = Math.max(0, r.top), bottom = Math.min(innerHeight - 1, r.bottom);
    if (right - left < 2 || bottom - top < 2 || style.visibility !== 'visible' || style.display === 'none' || style.pointerEvents === 'none' || Number(style.opacity) === 0 || !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return null;
    const x = Math.round((left + right) / 2), y = Math.round((top + bottom) / 2), hit = document.elementFromPoint(x, y);
    return hit && (hit === el || el.contains(hit)) ? { x, y } : null;
  };`;

/** The remote result holds the original DOM objects; no attributes or globals are added to the page. */
const OUTLINE_SCRIPT = `(() => {
  ${ELEMENT_SCRIPT}
  const vw = innerWidth, vh = innerHeight, out = [];
  const selector = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=checkbox],[role=radio],[role=tab],[role=menuitem],[role=option],[role=switch],[role=combobox],[role=textbox],[role=searchbox],[contenteditable=""],[contenteditable=true]';
  for (const el of document.querySelectorAll(selector)) {
    const point = pointOf(el);
    if (!point) continue;
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
    if (tag === 'A') { try { const u = new URL(el.href); href = u.origin === location.origin ? u.pathname : u.origin + u.pathname; } catch { /* An unreadable address has no outline link. */ } }
    out.push({ element: el, role, name: nameOf(el), value, states, ...point, href });
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
  return { document, path: location.origin + location.pathname, title: document.title, vw, vh, sy: Math.round(scrollY), max: Math.max(0, Math.round(page.scrollHeight - vh)), elements: out, text };
})()`;

const READ_OUTLINE = `function() {
  const { document, elements, ...outline } = this;
  return { ...outline, elements: elements.map(({ element, ...item }) => item) };
}`;
const RESOLVE_NODE = `function(index, currentDocument) {
  ${ELEMENT_SCRIPT}
  const el = this.elements[index]?.element;
  if (this.document !== currentDocument || !el || el.ownerDocument !== currentDocument || !el.isConnected || el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true' || el.closest('[inert]')) return null;
  const point = pointOf(el);
  return point ? { ...point, label: nameOf(el) || '无名称的 ' + (el.getAttribute('role') || el.localName) } : null;
}`;

const unavailable = () => browserErrors.load_failed("先前观察的页面目标已不可用，请重新观察页面后再操作。");

/** One bounded observation owned by this browser driver, shared by approval description and pointer injection. */
export class BrowserSurfaceNodes {
  private retained: Retained | null = null;
  private generation = 0;

  constructor(private readonly page: BrowserPage) {}

  async clear(): Promise<number> {
    const generation = ++this.generation;
    const retained = this.retained;
    this.retained = null;
    if (retained) await retained.session.send("Runtime.releaseObjectGroup", { objectGroup: retained.group }).catch(() => undefined);
    return generation;
  }

  private current(retained: Retained, session: PageSession): boolean {
    return retained.session.targetId === session.targetId && retained.url === this.page.snapshot().url && retained.takeovers === this.page.takeoverCount && !this.page.snapshot().loading;
  }

  /** Called after the driver invalidates the preceding observation, including any non-tree look. */
  async observe(generation: number): Promise<Outline> {
    if (generation !== this.generation) throw unavailable();
    const session = await this.page.session();
    const retained: Retained = { session, group: `molis-browser-nodes-${randomUUID()}`, objectId: "", url: this.page.snapshot().url, takeovers: this.page.takeoverCount, nodes: new Map() };
    try {
      const captured = await session.send("Runtime.evaluate", { expression: OUTLINE_SCRIPT, objectGroup: retained.group, returnByValue: false }) as RemoteValue<never>;
      if (captured.exceptionDetails || !captured.result?.objectId) throw unavailable();
      retained.objectId = captured.result.objectId;
      const read = await session.send("Runtime.callFunctionOn", { objectId: retained.objectId, functionDeclaration: READ_OUTLINE, returnByValue: true }) as RemoteValue<Omit<Outline, "elements"> & { elements: ElementOutline[] }>;
      const current = await this.page.session();
      if (read.exceptionDetails || !read.result?.value || generation !== this.generation || !this.current(retained, current)) throw unavailable();
      const outline = read.result.value;
      const elements = outline.elements.map((element, index) => {
        const node = `node_${randomUUID().replaceAll("-", "")}`;
        retained.nodes.set(node, index);
        return { ...element, node };
      });
      this.retained = retained;
      return { ...outline, elements };
    } catch (error) {
      await session.send("Runtime.releaseObjectGroup", { objectGroup: retained.group }).catch(() => undefined);
      throw error;
    }
  }

  async resolve(node: string): Promise<{ x: number; y: number; label: string; session: PageSession }> {
    const retained = this.retained, index = retained?.nodes.get(node);
    if (!retained || index === undefined) throw unavailable();
    try {
      const session = await this.page.session();
      if (retained !== this.retained || !this.current(retained, session)) throw unavailable();
      const document = await session.send("Runtime.evaluate", { expression: "document", objectGroup: retained.group, returnByValue: false }) as RemoteValue<never>;
      if (document.exceptionDetails || !document.result?.objectId) throw unavailable();
      let resolved: RemoteValue<{ x: number; y: number; label: string } | null>;
      try {
        resolved = await session.send("Runtime.callFunctionOn", { objectId: retained.objectId, functionDeclaration: RESOLVE_NODE,
          arguments: [{ value: index }, { objectId: document.result.objectId }], returnByValue: true }) as typeof resolved;
      } finally { await session.send("Runtime.releaseObject", { objectId: document.result.objectId }).catch(() => undefined); }
      const current = await this.page.session();
      if (resolved.exceptionDetails || !resolved.result?.value || retained !== this.retained || !this.current(retained, current)) throw unavailable();
      return { ...resolved.result.value, session: retained.session };
    } catch { throw unavailable(); }
  }
}
