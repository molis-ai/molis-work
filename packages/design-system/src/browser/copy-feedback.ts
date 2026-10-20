import { COPY_DONE_HOLD_MS, COPY_FAILED_HOLD_MS } from "../copy-decay.js";

/**
 * One copy feedback for every copy button (specs/visual-ui-experience §feedback-lifecycle, VUX-19): `window.molisCopy(button,
 * text, labels)` writes the text and answers on the button itself. idle → copying → done | failed: "done" only after
 * `clipboard.writeText` resolved; it holds ~2.5s and fades back. A newer press renews the hold and an older result never
 * overwrites a newer one. The three faces share one grid cell, so the button keeps the width of its longest label. The
 * result is also read out once through a polite status region. Returns whether the text reached the clipboard.
 */
type Labels = { done?: string; failed?: string };
type Source = string | (() => string | Promise<string>);

const presses = new WeakMap<HTMLElement, number>();
const timers = new WeakMap<HTMLElement, number>();
let status: HTMLElement | null = null;

function face(name: string, label: string) {
  const node = document.createElement("span");
  node.dataset.copyFace = name;
  node.textContent = label;
  return node;
}
function prepare(button: HTMLElement, labels: Labels) {
  if (!button.querySelector(":scope > [data-copy-face]")) {
    const idle = document.createElement("span");
    idle.dataset.copyFace = "idle";
    idle.append(...button.childNodes);
    button.append(idle, face("done", ""), face("failed", ""));
    button.classList.add("mw-copy");
  }
  for (const name of ["done", "failed"] as const) {
    const node = button.querySelector<HTMLElement>(`:scope > [data-copy-face="${name}"]`);
    if (node && labels[name] && node.textContent !== labels[name]) node.textContent = labels[name]!;
  }
}
function announce(text: string) {
  if (!status?.isConnected) {
    status = document.createElement("span");
    status.setAttribute("role", "status");
    status.className = "mw-sr-only";
    document.body.append(status);
  }
  status.textContent = "";
  requestAnimationFrame(() => { if (status) status.textContent = text; });
}
function settle(button: HTMLElement, state: "done" | "failed") {
  clearTimeout(timers.get(button));
  button.dataset.copy = state;
  button.removeAttribute("aria-busy");
  const label = button.querySelector(`:scope > [data-copy-face="${state}"]`)?.textContent;
  if (label) announce(label);
  timers.set(button, window.setTimeout(() => {
    timers.delete(button);
    if (button.dataset.copy === state) delete button.dataset.copy;
  }, state === "done" ? COPY_DONE_HOLD_MS : COPY_FAILED_HOLD_MS));
}

async function molisCopy(button: HTMLElement, source: Source, labels: Labels = {}) {
  prepare(button, { done: labels.done ?? "已复制", failed: labels.failed ?? "复制失败" });
  const press = (presses.get(button) ?? 0) + 1;
  presses.set(button, press);
  button.setAttribute("aria-busy", "true");
  let copied = false;
  try {
    const text = typeof source === "function" ? await source() : source;
    await navigator.clipboard.writeText(text);
    copied = true;
  } catch { copied = false; }
  if (presses.get(button) === press && button.isConnected) settle(button, copied ? "done" : "failed");
  return copied;
}

declare global { interface Window { molisCopy?: typeof molisCopy } }
window.molisCopy ??= molisCopy;
