/**
 * The page program of the service-connection parts (apps/workbench/src/service-connection-parts.ts). It only changes what the
 * server drew, in place, with the words the server drew into it: a page that draws the parts bundles this and calls what it needs.
 */
export type ConnectionProgressState = "running" | "hold" | "failed" | "cancelled" | "done";

/**
 * The service row that opens in place (`renderConnectionItem`): a press on the toggle, or anywhere on the row that is not one of
 * the row's own controls, opens or closes the part under it. One delegated listener on `root`; call it once.
 */
export function mountConnectionItems(root: Document | HTMLElement = document): void {
  root.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const item = target?.closest<HTMLElement>("[data-connection-item]");
    if (!target || !item) return;
    const own = target.closest("[data-connection-toggle]");
    const row = target.closest(".settings-connection-row");
    if (!own && (!row || row.parentElement !== item || target.closest("a, button, input, select, textarea, summary, label"))) return;
    const open = item.dataset.open !== "true";
    item.dataset.open = String(open);
    item.querySelector("[data-connection-toggle]")?.setAttribute("aria-expanded", String(open));
  });
}

function readJson<T>(text: string | undefined, fallback: T): T {
  try { return text ? JSON.parse(text) as T : fallback; } catch { return fallback; }
}

/**
 * Moves a drawn progress (`renderConnectionProgress`) to a step and a state: the marks, and its one line, written from the
 * caption template, step names and words the server drew on it. The line is the part's live region (unless drawn with
 * `live: false`), so a screen reader hears the change once.
 */
export function updateConnectionProgress(progress: HTMLElement, to: { readonly at: number; readonly state: ConnectionProgressState }): void {
  const line = progress.querySelector(".connection-progress__caption");
  if (!line) return;
  const steps = readJson<string[]>(progress.dataset.steps, []), words = readJson<Record<string, string>>(progress.dataset.words, {});
  const done = to.state === "done", at = done ? steps.length - 1 : Math.min(Math.max(to.at, 0), steps.length - 1);
  progress.dataset.state = to.state;
  progress.querySelectorAll(".mw-steps li").forEach((li, index) => {
    li.classList.toggle("is-done", done || index < at);
    if (!done && index === at) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
  });
  const values: Record<string, string> = { n: String(at + 1), total: String(steps.length), step: steps[at] ?? "" };
  line.textContent = (progress.dataset.caption ?? "").replace(/\{(n|total|step)\}/g, (_, key: string) => values[key] ?? "");
  const word = words[to.state];
  if (word) {
    const tag = document.createElement("span");
    tag.className = "connection-progress__state";
    tag.textContent = `· ${word}`;
    line.append(" ", tag);
  }
}

/**
 * Starts the connection a card (`renderConnectionCard`) offers: its body opens on the fold's clock, its action steps aside, and
 * the focus, which was on that action, goes to the progress line in the body (the line that will say each step).
 */
export function startConnectionCard(need: HTMLElement): void {
  const held = need.contains(document.activeElement);
  need.dataset.state = "running";
  if (held) need.querySelector<HTMLElement>(".connection-progress__caption")?.focus({ preventScroll: true });
}

/**
 * Folds a connected card into its one line: the line the server drew for it (its `<template data-connected-line>`) takes its
 * place in the status region, the card folds away and leaves the tab order, and the focus, if it was in the card, lands on the line.
 */
export function foldConnectionCard(need: HTMLElement): void {
  const template = need.querySelector<HTMLTemplateElement>("template[data-connected-line]");
  const line = need.querySelector<HTMLElement>(".connection-need__line");
  const fold = need.querySelector<HTMLElement>(".connection-need__fold");
  if (!template || !line || !fold) return;
  const held = need.contains(document.activeElement);
  line.replaceChildren(template.content.cloneNode(true));
  need.dataset.state = "done";
  fold.inert = true;
  if (held) line.parentElement?.focus({ preventScroll: true });
}
