import { ELEMENT_LIMIT, TEXT_BUDGET, type SurfaceElementOutline, type SurfaceOutline } from "../surface-node-types.js";

type SurfaceElement = Element & Partial<{
  type: string; labels: NodeListOf<HTMLLabelElement> | null; innerText: string; value: string; disabled: boolean;
  checked: boolean; required: boolean; selectedOptions: HTMLCollectionOf<HTMLOptionElement>; href: string; isContentEditable: boolean;
}>;
interface CapturedOutline extends SurfaceOutline {
  document: Document;
  elements: Array<SurfaceElementOutline & { element: SurfaceElement }>;
}

const clean = (value: unknown, max: number) => String(value || "").replace(/\s+/gu, " ").trim().slice(0, max);
const sensitive = (el: SurfaceElement) => el.type === "password" || /cc-|one-time-code/u.test(el.getAttribute("autocomplete") || "");
const nameOf = (el: SurfaceElement) => clean(el.getAttribute("aria-label") || el.labels?.[0]?.innerText || el.getAttribute("title") || el.getAttribute("placeholder") || (el.tagName === "INPUT" ? "" : el.innerText) || el.getAttribute("alt") || el.getAttribute("name") || (el.tagName === "INPUT" && /submit|button/u.test(el.type || "") ? el.value : ""), 80);

/** Both capture and retained-object resolution use the same names and hit test. */
function pointOf(el: SurfaceElement): { x: number; y: number } | null {
  const r = el.getBoundingClientRect(), style = getComputedStyle(el);
  const left = Math.max(0, r.left), right = Math.min(innerWidth - 1, r.right), top = Math.max(0, r.top), bottom = Math.min(innerHeight - 1, r.bottom);
  if (right - left < 2 || bottom - top < 2 || style.visibility !== "visible" || style.display === "none" || style.pointerEvents === "none" || Number(style.opacity) === 0 || !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return null;
  const x = Math.round((left + right) / 2), y = Math.round((top + bottom) / 2), hit = document.elementFromPoint(x, y);
  return hit && (hit === el || el.contains(hit)) ? { x, y } : null;
}

/** The remote result holds the original DOM objects; no attributes or globals are added to the page. */
export function capture(): CapturedOutline {
  const vw = innerWidth, vh = innerHeight, out: CapturedOutline["elements"] = [];
  const selector = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=checkbox],[role=radio],[role=tab],[role=menuitem],[role=option],[role=switch],[role=combobox],[role=textbox],[role=searchbox],[contenteditable=""],[contenteditable=true]';
  for (const el of document.querySelectorAll<SurfaceElement>(selector)) {
    const point = pointOf(el);
    if (!point) continue;
    const tag = el.tagName;
    const role = el.getAttribute("role") || (tag === "A" ? "link" : tag === "BUTTON" ? "button" : tag === "SELECT" ? "select" : tag === "TEXTAREA" ? "textarea" : tag === "INPUT" ? "input:" + (el.type || "text") : el.isContentEditable ? "editor" : tag.toLowerCase());
    let value = "";
    if (tag === "INPUT" || tag === "TEXTAREA") value = sensitive(el) ? (el.value ? "(已填写，已隐藏)" : "") : clean(el.value, 60);
    if (tag === "SELECT") value = clean(el.selectedOptions?.[0]?.text, 60);
    const states: string[] = [];
    if (el.disabled || el.getAttribute("aria-disabled") === "true") states.push("不可用");
    if (el.checked || el.getAttribute("aria-checked") === "true") states.push("已选中");
    if (el.getAttribute("aria-expanded") === "true") states.push("已展开");
    if (el.required) states.push("必填");
    if (document.activeElement === el) states.push("有焦点");
    let href = "";
    if (tag === "A") {
      try { const u = new URL(el.href || ""); href = u.origin === location.origin ? u.pathname : u.origin + u.pathname; }
      catch { /* An unreadable address has no outline link. */ }
    }
    out.push({ element: el, role, name: nameOf(el), value, states, ...point, href });
    if (out.length >= ELEMENT_LIMIT) break;
  }
  const text: string[] = [], seen = new Set<string>();
  let budget = TEXT_BUDGET;
  for (const el of document.querySelectorAll<HTMLElement>("h1,h2,h3,h4,p,li,td,th,dt,dd,blockquote,figcaption,[role=heading],[role=alert],[role=status]")) {
    if (budget <= 0) break;
    const r = el.getBoundingClientRect();
    if (r.height < 1 || r.bottom < 0 || r.top > vh) continue;
    const line = clean(el.innerText, 240);
    if (!line || seen.has(line)) continue;
    seen.add(line); text.push((/^H[1-4]$/u.test(el.tagName) ? "# " : "") + line); budget -= line.length;
  }
  const page = document.scrollingElement || document.documentElement;
  return { document, path: location.origin + location.pathname, title: document.title, vw, vh, sy: Math.round(scrollY), max: Math.max(0, Math.round(page.scrollHeight - vh)), elements: out, text };
}

export function read(this: CapturedOutline): SurfaceOutline {
  const { document: _document, elements, ...outline } = this;
  return { ...outline, elements: elements.map(({ element: _element, ...item }) => item) };
}

export function resolve(this: CapturedOutline, index: number, currentDocument: Document): { x: number; y: number; label: string } | null {
  const el = this.elements[index]?.element;
  if (this.document !== currentDocument || !el || el.ownerDocument !== currentDocument || !el.isConnected || el.matches(":disabled") || el.getAttribute("aria-disabled") === "true" || el.closest("[inert]")) return null;
  const point = pointOf(el);
  return point ? { ...point, label: nameOf(el) || "无名称的 " + (el.getAttribute("role") || el.localName) } : null;
}
