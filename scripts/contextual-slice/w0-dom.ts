export const $ = <T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T => {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`预览缺少元素：${selector}`);
  return found;
};
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...children: (Node | string | null)[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "text") node.textContent = value; else node.setAttribute(key, value);
  }
  for (const child of children) if (child !== null) node.append(child);
  return node;
}
/** The design system's sprite (`renderIconSprite`) is on the page; this is the client twin of `icon(name)`. */
export function glyph(name: string): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"), use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  svg.setAttribute("aria-hidden", "true"); use.setAttribute("href", `#icon-${name}`); svg.append(use);
  return svg;
}
export type ButtonStyle = "primary" | "secondary" | "ghost";
export function button(label: string, action: () => void, style: ButtonStyle | boolean = "ghost", icon?: string): HTMLButtonElement {
  const kind = style === true ? "primary" : style === false ? "ghost" : style;
  const node = el("button", { type: "button", class: `mw-btn mw-btn--${kind}` }, ...(icon ? [glyph(icon)] : []), el("span", { text: label }));
  node.addEventListener("click", action);
  return node;
}
export function iconButton(label: string, icon: string, action: () => void): HTMLButtonElement {
  const node = el("button", { type: "button", class: "mw-btn mw-btn--ghost mw-btn--icon-only", "aria-label": label, title: label }, glyph(icon));
  node.addEventListener("click", action);
  return node;
}
export async function api<T>(path: string, body?: unknown, method = "POST", signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { method: body === undefined ? "GET" : method, signal,
    ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) });
  const value: { error?: string } = await response.json();
  if (!response.ok) throw new Error(value.error ?? `预览请求失败（${response.status}）`);
  return value as T;
}
export function announce(message: string) { $("[data-w0-live]").textContent = message; }

let toastTimer: ReturnType<typeof setTimeout> | undefined;
/** DESIGN.md: a toast is a graphite capsule above the bar with a success or failure mark; failure nudges once.
 * One with actions stays while the pointer or focus is on it, and leaves on its own after a while otherwise. */
export function toast(message: string, actions: HTMLButtonElement[] = [], failure = false) {
  const root = $("[data-w0-toast]"); clearTimeout(toastTimer);
  root.hidden = false; root.dataset.tone = failure ? "failure" : "success";
  root.replaceChildren(glyph(failure ? "circle-alert" : "check"), el("span", { class: "w0-toast-text", text: message }), ...actions,
    iconButton("关闭提示", "x", () => { root.hidden = true; }));
  root.classList.remove("is-nudging"); if (failure) { void root.offsetWidth; root.classList.add("is-nudging"); }
  announce(message);
  const leave = () => { toastTimer = setTimeout(() => { if (!root.matches(":hover") && !root.contains(document.activeElement) && !document.querySelector("[data-w0-keep-toast]")) root.hidden = true; else leave(); }, failure ? 9000 : 7000); };
  leave();
}
export function showError(error: unknown) { toast(error instanceof Error ? error.message : String(error), [], true); }
export function run(task: Promise<unknown>) { void task.catch(showError); }
export const id = () => crypto.randomUUID();
export type Rect = { left: number; right: number; top: number; bottom: number };
export type Anchor = () => Rect | null;

const TOP = 54, BOTTOM = 100, GAP = 8;
/** Places a floating layer by its anchor: above by default, below when asked or when above has no room.
 * `bounds` keeps a layer that belongs to the right panel inside it; `fixedLeft` keeps a bar's left edge still. */
export function placeLayer(node: HTMLElement, anchor: Anchor, below = false, fixedLeft?: number, bounds?: Pick<Rect, "left" | "right">): boolean {
  const rect = anchor();
  if (!rect || rect.bottom < TOP || rect.top > innerHeight - BOTTOM) return false;
  const width = node.offsetWidth, height = node.offsetHeight;
  let min = GAP, max = innerWidth - width - GAP;
  if (bounds) {
    // Inside the owner's region when it fits; a layer wider than the region keeps its right edge there and grows left.
    if (bounds.right - bounds.left - 2 * GAP >= width) { min = bounds.left + GAP; max = bounds.right - width - GAP; }
    else max = Math.min(max, bounds.right - width - GAP);
  }
  const left = Math.max(min, Math.min(fixedLeft ?? rect.left, max));
  const top = below || rect.top - height - GAP < TOP ? rect.bottom + GAP : rect.top - height - GAP;
  node.style.left = `${Math.max(GAP, left)}px`;
  node.style.top = `${Math.max(TOP, Math.min(top, innerHeight - height - BOTTOM))}px`;
  return true;
}
/** For layers that rise from the bottom bar (the Assistant's answer): bottom edge just above the anchor. */
export function riseFrom(node: HTMLElement, anchor: Rect) {
  const width = node.offsetWidth;
  node.style.left = `${Math.max(GAP, Math.min(anchor.left, innerWidth - width - GAP))}px`;
  node.style.top = `${Math.max(TOP, anchor.top - node.offsetHeight - GAP)}px`;
}
