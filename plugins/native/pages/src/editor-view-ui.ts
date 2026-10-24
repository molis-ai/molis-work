// Small DOM helpers shared by editor overlays and node views.
import type { Translate } from "./editor-types.js";
import { scrollChildIntoView } from "./floating.js";


export function t(translate: Translate | undefined, value: string): string {
  return translate ? translate(value) : value;
}

export function dsIcon(name: string): string {
  return `<svg aria-hidden="true"><use href="#icon-${name}"></use></svg>`;
}

export function overlayRoot(): HTMLElement {
  return document.querySelector("[data-pages-stage-workspace]")
    ?? document.querySelector("[data-pages=workbench]")
    ?? document.body;
}

export function field(translate: Translate | undefined, label: string, value: string, type: string) {
  const wrap = document.createElement("label");
  wrap.textContent = t(translate, label);
  const input = document.createElement("input");
  input.className = "mw-input";
  input.type = type;
  input.value = value;
  wrap.append(input);
  return { label: wrap, input };
}

export function actions(translate: Translate | undefined, ok: () => void, cancel: () => void, okLabel = "确定"): HTMLElement {
  const row = document.createElement("div");
  row.className = "pages-pop-actions";
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "mw-btn mw-btn--ghost";
  dismiss.textContent = t(translate, "取消");
  dismiss.addEventListener("click", cancel);
  const save = document.createElement("button");
  save.type = "button";
  save.className = "mw-btn mw-btn--primary";
  save.textContent = t(translate, okLabel);
  save.addEventListener("click", ok);
  row.append(dismiss, save);
  return row;
}

export function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

export function keepSelectedVisible(menu: HTMLElement): void {
  const current = menu.querySelector(".is-on");
  if (!(current instanceof HTMLElement)) return;
  menu.scrollTop = scrollChildIntoView(
    { scrollTop: menu.scrollTop, clientHeight: menu.clientHeight },
    { offsetTop: current.offsetTop, offsetHeight: current.offsetHeight },
  );
}

/** A mousedown handler that keeps the editor's selection and focus where they are. */
export const keepFocus = (event: Event): void => event.preventDefault();

/** A handler that keeps an event from reaching the editor underneath. */
export const keepOut = (event: Event): void => event.stopPropagation();

export function stopEvent(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
}
