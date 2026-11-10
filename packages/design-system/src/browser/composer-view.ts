import { renderComposer, type MwComposerOptions } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderComposerRestore, renderComposerStrip } from "../composer-parts.js";
import { composerDeliveries } from "../composer-rules.js";
import { sendable, type Composer, type ComposerBasics, type Status } from "./composer-state.js";

/**
 * What the composer shows (browser/composer.ts): the first screen is the SDK's `renderComposer()`; after that the parts are drawn
 * again from the same function and only those are swapped (the receiver row, the status line, the end of the bar, and the start
 * of the bar when asked), so the text area, its caret and an open menu stay as they are.
 */

export function firstScreen(c: ComposerBasics, text: string): MwComposerOptions {
  const { options, ai, labels } = c;
  const common = { text, add: Boolean(options.attachments || options.commands?.length || c.offersSources), ...(options.controls ? { controls: options.controls } : {}),
    ...(options.voice ? { voice: options.voice } : {}) };
  if (!ai) return { kind: "plain", labels, ...common };
  const receiver = ai.receiver?.();
  return { kind: "ai", labels: ai.labels, ...common, ...(receiver ? { receiver: { label: receiver.label, ...(receiver.open ? { open: true } : {}), ...(receiver.reset ? { resetLabel: receiver.resetLabel ?? c.fill(labels.remove, { name: receiver.label }) } : {}) } } : {}) };
}

/** The one status line: what is under way first, then what stops a send, then notes, then the turn running. */
function status(c: Composer): Status {
  const { labels } = c;
  if (c.phase === "sending") return { caption: labels.sending, text: labels.sendingText };
  if (c.phase === "failed") return { caption: labels.failed, text: c.failure, action: labels.retry, actionId: "retry" };
  if (c.phase === "unknown") return { caption: labels.unknown, text: labels.unknownText, action: labels.check, actionId: "check" };
  if (c.items.some((item) => item.state === "failed")) return { caption: labels.notice, text: labels.blocked, tone: "blocked" };
  if (c.note) return c.note;
  if (c.unsaved) return { caption: labels.notice, text: labels.unsaved, tone: "attention" };
  if (c.ai && c.running) return { caption: c.ai.labels.running, text: c.ai.labels.runningText };
  return undefined;
}

/**
 * Draws the parts again; the text area and an open menu stay as they are (`controls` redraws the start of the bar too). When the
 * strip gains or loses a row, the whole redraw runs inside `molisReflow`, so the rows are measured before anything around them
 * (the status line, say) changes, and each eases from where it was seen.
 */
export function paint(c: Composer, controls = false) {
  if (c.signal.aborted) return;
  const list = c.box.querySelector<HTMLElement>(".mw-composer__files");
  const shown = list ? ([...list.children] as HTMLElement[]).map((row) => row.dataset.composerFile).join(" ") : "";
  const moves = Boolean(list) && c.items.length > 0 && c.items.map((item) => item.key).join(" ") !== shown;
  const run = () => { if (moves && window.molisReflow) window.molisReflow(list!, () => draw(c, controls)); else draw(c, controls); };
  if (c.shell.hasAttribute("data-rest") !== atRest(c)) settle(c, run); else run();
}

function shownState(c: Composer) {
  return c.phase === "failed" || c.phase === "sending" || c.phase === "unknown" ? c.phase : c.ai && c.running ? "running" : undefined;
}

/** At rest: nothing written, attached or brought back, nothing to say and no state (the SDK's first screen marks it the same way). */
function atRest(c: Composer) {
  return c.delivery === "next-boundary" && !c.field.value && !c.field.disabled && !c.items.length && !c.restored && !shownState(c) && !status(c);
}

const SETTLE = "mw-composer-settle";
const PARTS = [".mw-composer__to", ".mw-composer__input", ".mw-composer__start", ".mw-composer__end"];
const token = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

/**
 * Rest ↔ rows (composer-styles.ts `composerRestRules`, only where the page sheet lays rest out as one row): the box eases to its
 * new height and each part from where it was seen (First, Last, Invert, Play, with the board's `--dur-move` and `--ease-quint`).
 * Nothing changes element for the input, so focus and the caret stay. Each part's start is measured with the box already held at
 * its old height, so whichever way the page grows the box (the bar grows it up) every part starts exactly where it was seen; a
 * change while one is moving starts from where things are seen.
 */
function settle(c: Composer, change: () => void) {
  const { shell, box } = c;
  if (document.documentElement.hasAttribute("data-craft-still") || matchMedia("(prefers-reduced-motion: reduce)").matches || !shell.isConnected) {
    change(); window.molisFit?.(c.field); return;
  }
  const parts = () => PARTS.map((query) => shell.querySelector<HTMLElement>(query));
  const seen = () => parts().map((node) => node?.getBoundingClientRect());
  const was = seen(), from = box.getBoundingClientRect();
  change();
  window.molisFit?.(c.field);
  for (const node of [box, ...parts()]) for (const motion of node?.getAnimations() ?? []) if (motion.id === SETTLE) motion.cancel();
  const to = box.getBoundingClientRect();
  if (Math.abs(from.height - to.height) < 1 && seen().every((rect, index) => rect?.left === was[index]?.left && rect?.top === was[index]?.top)) return;
  const duration = parseFloat(token("--dur-move", "250ms")) || 250, easing = token("--ease-quint", "cubic-bezier(.22, 1, .36, 1)");
  box.dataset.settling = "";
  const height = box.animate([{ height: `${from.height}px` }, { height: `${to.height}px` }], { duration, easing, id: SETTLE });
  const done = () => { if (!box.getAnimations().some((motion) => motion.id === SETTLE && motion.playState === "running")) delete box.dataset.settling; };
  height.onfinish = done; height.oncancel = done;
  // Where things are with the box at its old height: the box eases from where it was seen, and each part from where it was.
  const start = box.getBoundingClientRect(), held = seen(), lift = { x: from.left - start.left, y: from.top - start.top };
  if (lift.x || lift.y) box.animate([{ translate: `${lift.x}px ${lift.y}px` }, { translate: "0 0" }], { duration, easing, id: SETTLE });
  parts().forEach((node, index) => {
    const before = was[index], now = held[index];
    if (!node || !before || !now) return;
    // A part inside the box moves with it already; the receiver row is outside it.
    const inside = box.contains(node), x = before.left - now.left - (inside ? lift.x : 0), y = before.top - now.top - (inside ? lift.y : 0);
    if (Math.abs(x) >= 0.5 || Math.abs(y) >= 0.5) node.animate([{ translate: `${x}px ${y}px` }, { translate: "0 0" }], { duration, easing, id: SETTLE });
  });
}

function draw(c: Composer, controls: boolean) {
  const { shell } = c;
  const state = shownState(c);
  const now = status(c);
  // 2026-11-09 audit fix: with no turn running the target may still take 下一轮再做 (a queue the next turn the person begins carries):
  // the split button stands in the send's place once there are words to queue, never in the one-row rest state.
  const idleDelivery = Boolean(c.ai && !c.running && c.field.value.trim() && composerDeliveries(false, c.ai.delivery?.(), c.ai.labels.unsupported)["after-run"].available);
  const drawn = { ...firstScreen(c, c.field.value), ...(state ? { state } : {}), ...(c.ai ? { delivery: c.delivery } : {}), ...(idleDelivery ? { idleDelivery: true } : {}), ...(now ? { status: now } : {}) } as MwComposerOptions;
  const fresh = document.createElement("template");
  fresh.innerHTML = renderComposer(drawn);
  const next = fresh.content.firstElementChild as HTMLElement;
  if (state) shell.dataset.state = state; else delete shell.dataset.state;
  shell.toggleAttribute("data-rest", atRest(c));
  const was = shell.querySelector(".mw-composer__status"), line = next.querySelector(".mw-composer__status");
  if (line) was ? was.replaceWith(line) : shell.querySelector(".mw-composer__text")!.after(line); else was?.remove();
  const to = next.querySelector(".mw-composer__to"), had = shell.querySelector(".mw-composer__to");
  // Kept when it reads the same, so a part that is easing between one row and rows keeps its motion.
  if (to) { if (!had) shell.prepend(to); else if (had.outerHTML !== to.outerHTML) had.replaceWith(to); } else had?.remove();
  const end = next.querySelector<HTMLElement>(".mw-composer__end")!;
  if (!c.running || !c.ai?.stop) end.querySelector("[data-composer-stop]")?.remove();
  for (const button of end.querySelectorAll<HTMLButtonElement>("[data-composer-send]")) button.disabled = !sendable(c);
  end.querySelector<HTMLButtonElement>("[data-composer-stop]")?.toggleAttribute("disabled", c.stopping);
  if (end.outerHTML !== c.painted) {
    if (c.open && shell.querySelector(".mw-composer__end")?.contains(c.open)) c.close();
    c.painted = end.outerHTML; shell.querySelector(".mw-composer__end")!.replaceWith(end);
  }
  if (controls) { c.close(); shell.querySelector(".mw-composer__start")!.replaceWith(next.querySelector(".mw-composer__start")!); }
  strip(c);
  c.box.querySelector(".mw-composer__restore")?.remove();
  if (c.restored) (c.box.querySelector(".mw-composer__files") ?? c.box).insertAdjacentHTML(c.box.querySelector(".mw-composer__files") ? "afterend" : "afterbegin", renderComposerRestore(c.labels, c.restored, c.fill));
}

/**
 * The strip, row by row (VUX-18): a row keeps its element from being added until it goes, so reading → read → failed changes it in
 * place (the parts that changed, so a picture's preview is not loaded again) and a button that had focus has it back; a new row
 * grows in and the others ease aside, one that goes leaves its neighbours closing up (`paint` runs it in `molisReflow`, with the board's motion tokens).
 */
function strip(c: Composer) {
  const html = renderComposerStrip(c.labels, c.items, c.fill), list = c.box.querySelector<HTMLElement>(".mw-composer__files");
  if (!html) return list?.remove();
  const fresh = document.createElement("template");
  fresh.innerHTML = html;
  const next = fresh.content.firstElementChild as HTMLElement;
  if (!list) return c.box.prepend(next);
  const rows = [...next.children] as HTMLElement[], had = new Map(([...list.children] as HTMLElement[]).map((row) => [row.dataset.composerFile, row]));
  const focused = document.activeElement instanceof HTMLElement && list.contains(document.activeElement) ? document.activeElement : null;
  const again = focused && { row: focused.closest<HTMLElement>("[data-composer-file]")?.dataset.composerFile, kind: focused.hasAttribute("data-composer-retry") ? "retry" : "remove" };
  rows.forEach((row, index) => {
    const kept = had.get(row.dataset.composerFile);
    if (kept) { had.delete(row.dataset.composerFile); same(kept, row); }
    const node = kept ?? row;
    if (list.children[index] !== node) list.insertBefore(node, list.children[index] ?? null);
  });
  for (const gone of had.values()) gone.remove();
  // Its own button again, or the row's × when that one is gone (a retried row is being read).
  const row = focused && !focused.isConnected && again?.row ? list.querySelector<HTMLElement>(`[data-composer-file="${CSS.escape(again.row)}"]`) : null;
  (row?.querySelector<HTMLElement>(`[data-composer-${again!.kind}]`) ?? row?.querySelector<HTMLElement>("[data-composer-remove]"))?.focus({ preventScroll: true });
}

/** Makes `kept` look as `row` does, keeping each part that did not change. */
function same(kept: HTMLElement, row: HTMLElement) {
  if (kept.outerHTML === row.outerHTML) return;
  for (const name of kept.getAttributeNames()) if (!row.hasAttribute(name)) kept.removeAttribute(name);
  for (const name of row.getAttributeNames()) kept.setAttribute(name, row.getAttribute(name)!);
  const parts = [...row.children];
  parts.forEach((part, index) => {
    const was = kept.children[index];
    if (!was) kept.append(part); else if (was.outerHTML !== part.outerHTML) was.replaceWith(part);
  });
  while (kept.children.length > parts.length) kept.lastElementChild!.remove();
}
