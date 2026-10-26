import type { CopyLabels as Labels } from "@molis-ai/molis-work-plugin-sdk/page-globals";
import { COPY_DONE_HOLD_MS, COPY_FAILED_HOLD_MS } from "../copy-decay.js";

/**
 * One copy feedback for every copy button (specs/visual-ui-experience §feedback-lifecycle, VUX-19): `window.molisCopy(button,
 * text, labels)` writes the text and answers on the button itself. idle → copying → done | failed: "done" only after
 * `clipboard.writeText` resolved; it holds ~2.5s and fades back. A newer press renews the hold and an older result never
 * overwrites a newer one. The three faces share one grid cell, so the button keeps the width of its longest label. The
 * result is also read out once through a polite status region; a button that is only an icon answers with a check or a cross
 * instead of words. Returns whether the text reached the clipboard.
 */
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
  // A button that is only an icon answers with an icon (a check, a cross) in the same box; its words are what is read out.
  const glyphs = !button.querySelector(":scope > [data-copy-face=idle]")?.textContent?.trim();
  for (const name of ["done", "failed"] as const) {
    const node = button.querySelector<HTMLElement>(`:scope > [data-copy-face="${name}"]`), label = labels[name];
    if (!node || !label || node.dataset.label === label) continue;
    node.dataset.label = label;
    if (glyphs) node.innerHTML = `<svg aria-hidden="true"><use href="#icon-${name === "done" ? "check" : "x"}"></use></svg>`;
    else node.textContent = label;
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
  const label = button.querySelector<HTMLElement>(`:scope > [data-copy-face="${state}"]`)?.dataset.label;
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

window.molisCopy ??= molisCopy;
// The status region is the page's one: anything else that has to be read out once (a size changed by keys) uses it too.
window.molisAnnounce ??= announce;
