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
export function button(label: string, action: () => void, primary = false): HTMLButtonElement {
  const node = el("button", { type: "button", class: `mw-btn ${primary ? "mw-btn--primary" : "mw-btn--ghost"}`, text: label });
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
export function showError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  announce(message);
  const toast = $("[data-w0-toast]"); toast.hidden = false;
  toast.replaceChildren(el("span", { text: message }), button("关闭", () => { toast.hidden = true; }));
}
export function run(task: Promise<unknown>) { void task.catch(showError); }
export const id = () => crypto.randomUUID();
export type Anchor = () => { left: number; right: number; top: number; bottom: number } | null;

export function placeLayer(node: HTMLElement, anchor: Anchor, below = false, fixedLeft?: number): boolean {
  const rect = anchor();
  if (!rect || rect.bottom < 54 || rect.top > innerHeight - 100) return false;
  const gap = 8, width = node.offsetWidth, height = node.offsetHeight;
  const left = Math.max(gap, Math.min(fixedLeft ?? rect.left, innerWidth - width - gap));
  const top = below || rect.top - height - gap < 54 ? rect.bottom + gap : rect.top - height - gap;
  node.style.left = `${left}px`;
  node.style.top = `${Math.max(54, Math.min(top, innerHeight - height - 100))}px`;
  return true;
}
