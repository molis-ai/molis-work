import { renderComposer, type MwComposerOptions } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderComposerRestore, renderComposerStrip } from "../composer-parts.js";
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
  return { kind: "ai", labels: ai.labels, ...common, ...(receiver ? { receiver: { label: receiver.label, ...(receiver.reset ? { resetLabel: receiver.resetLabel ?? c.fill(labels.remove, { name: receiver.label }) } : {}) } } : {}) };
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
  if (moves && window.molisReflow) window.molisReflow(list!, () => draw(c, controls)); else draw(c, controls);
}

function draw(c: Composer, controls: boolean) {
  const { shell } = c;
  const state = c.phase === "failed" || c.phase === "sending" || c.phase === "unknown" ? c.phase : c.ai && c.running ? "running" : undefined;
  const now = status(c), drawn = { ...firstScreen(c, c.field.value), ...(state ? { state } : {}), ...(now ? { status: now } : {}) } as MwComposerOptions;
  const fresh = document.createElement("template");
  fresh.innerHTML = renderComposer(drawn);
  const next = fresh.content.firstElementChild as HTMLElement;
  if (state) shell.dataset.state = state; else delete shell.dataset.state;
  const was = shell.querySelector(".mw-composer__status"), line = next.querySelector(".mw-composer__status");
  if (line) was ? was.replaceWith(line) : shell.querySelector(".mw-composer__text")!.after(line); else was?.remove();
  const to = next.querySelector(".mw-composer__to"), had = shell.querySelector(".mw-composer__to");
  if (to) had ? had.replaceWith(to) : shell.prepend(to); else had?.remove();
  const end = next.querySelector<HTMLElement>(".mw-composer__end")!;
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
