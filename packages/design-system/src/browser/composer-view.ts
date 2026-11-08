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

/** Draws the parts again; the text area and an open menu stay as they are (`controls` redraws the start of the bar too). */
export function paint(c: Composer, controls = false) {
  if (c.signal.aborted) return;
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
  c.box.querySelector(".mw-composer__files")?.remove();
  c.box.querySelector(".mw-composer__restore")?.remove();
  const strip = renderComposerStrip(c.labels, c.items, c.fill) + (c.restored ? renderComposerRestore(c.labels, c.restored, c.fill) : "");
  if (strip) c.box.insertAdjacentHTML("afterbegin", strip);
}
