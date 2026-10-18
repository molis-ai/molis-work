import type { PasteLeaf } from "./paste-html.js";
import { toneFromCssColor } from "./tone.js";

export const CLIP_IMAGE = /^image\/(png|jpeg|gif|webp)$/iu;

export function clipboardImage(data: DataTransfer | null): File | null {
  if (!data) return null;
  for (const item of data.items) {
    if (item.kind === "file" && CLIP_IMAGE.test(item.type)) return item.getAsFile();
  }
  return null;
}

export function leafFromDom(node: globalThis.Node): PasteLeaf | string | null {
  if (node.nodeType === 3) return node.textContent || null;
  if (node.nodeType !== 1) return null;
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  if (tag === "script" || tag === "style") return null;
  const children: Array<PasteLeaf | string> = [];
  el.childNodes.forEach((child) => {
    const next = leafFromDom(child);
    if (typeof next === "string") children.push(next);
    else if (next) children.push(next);
  });
  const style = el.getAttribute("style") ?? "";
  const painted = (prop: string) => {
    const match = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, "i").exec(`;${style}`);
    return toneFromCssColor(match?.[1] ?? "");
  };
  const ink = el.getAttribute("data-pages-ink") ? toneFromCssColor(el.getAttribute("data-pages-ink")) : painted("color");
  const wash = el.getAttribute("data-pages-wash") ? toneFromCssColor(el.getAttribute("data-pages-wash")) : painted("background-color");
  return {
    tag,
    href: el.getAttribute("href") ?? undefined,
    src: el.getAttribute("src") ?? undefined,
    ...(ink ? { ink } : {}),
    ...(wash ? { wash } : {}),
    ...(el.hasAttribute("data-pages-bookmark") ? { bookmark: true } : {}),
    ...(el.getAttribute("alt") ? { alt: el.getAttribute("alt") ?? "" } : {}),
    ...(el.hasAttribute("data-pages-task") ? { task: true, checked: el.getAttribute("data-checked") === "true" } : {}),
    ...(el.hasAttribute("data-pages-tasks") ? { tasks: true } : {}),
    children,
  };
}
