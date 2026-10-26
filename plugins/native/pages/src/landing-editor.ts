import type { Node } from "prosemirror-model";
import type { EditorView } from "prosemirror-view";
import type { ContextActionChosen } from "@molis-ai/molis-work-contracts/services/contextual";
import { placeOverlay } from "@molis-ai/molis-work-plugin-sdk/browser";
import { headingPath } from "./focus.js";

/**
 * Pages as the landing on the left (specs/context-program §3.4, §21.8 steps 3 and 5).
 *
 * - It tells the context row where something in hand would go in the open document (`molis:surface-landing`): the
 *   selection, the cursor once the person has been in the editor, else the end; with the saved version the positions
 *   belong to. Reported again whenever the document, its saving or the selection changes; none while edits are unsaved.
 * - When the person chooses to put something here (an `attach.` candidate the row hands over), it shows what will be
 *   written at that place and writes nothing itself: confirming runs the choice through the Host (`run`, bound by the row
 *   to the landing it was ranked with) and shows the saved document. If the document changed after the landing was
 *   reported, nothing is written and the person chooses the place again.
 * - When the bar asks where something would go (`molis:surface-landing-flash`: a way to put it here is hovered or focused),
 *   the landing shows itself once without covering the text: a copper line at the cursor or the end, a light background
 *   under a selection. Not again while it shows, and not at all when the person asked for less motion.
 */
const PLUGIN_ID = "io.molis.work.pages";
const AROUND = 200;

interface PagesLandingPort {
  readonly bench: HTMLElement;
  readonly view: () => EditorView | null;
  /** The open document as saved; null when nothing is open, this editor cannot show it, or edits are not saved yet. */
  readonly open: () => { readonly id: string; readonly version: number; readonly title: string } | null;
  /** Shows the document as it is now stored. */
  readonly refresh: () => Promise<unknown>;
  readonly translate: (text: string) => string;
}

interface Reported { readonly key: string; readonly doc: Node | null; readonly from: number; readonly to: number }
const NONE: Reported = { key: "", doc: null, from: 0, to: 0 };
/** What a Pages landing action is prepared with (landing-actions.ts), as far as the preview shows it. */
type Prepared = { anchor?: number; head?: number; text?: string; source?: { title?: string } } | undefined;

export function mountPagesLanding(port: PagesLandingPort): { report(): void } {
  const L = port.translate;
  let touched = "";
  let shown = NONE;
  const send = (detail: unknown) => port.bench.dispatchEvent(new CustomEvent("molis:surface-landing", { bubbles: true, detail }));
  const report = () => {
    const view = port.view(), open = port.open();
    if (!view || !open) { if (shown.key) { shown = NONE; send(null); } return; }
    if (view.hasFocus()) touched = open.id;
    const { doc, selection } = view.state;
    const position = !selection.empty ? "selection" : touched === open.id ? "cursor" : "end";
    const from = position === "end" ? doc.content.size : selection.from, to = position === "selection" ? selection.to : from;
    const key = [open.id, open.version, open.title, position, from, to].join(" ");
    if (key === shown.key && doc.eq(shown.doc ?? doc)) { shown = { ...shown, doc }; return; }
    shown = { key, doc, from, to };
    const text = position === "selection" ? doc.textBetween(from, to, "\n") : "";
    send({ pane_id: "", plugin_id: PLUGIN_ID, object: { kind: "pages_document", id: open.id, title: open.title }, position, version: open.version,
      targets: [{ kind: "text_range", role: "paragraph", text: text.slice(0, 4000), ...(text.length > 4000 ? { truncated: true } : {}), anchor: from, head: to }],
      surroundings: { heading_path: headingPath(doc, from), before: doc.textBetween(Math.max(0, from - AROUND), from, "\n"), after: doc.textBetween(to, Math.min(doc.content.size, to + AROUND), "\n") } });
  };

  let pop: HTMLElement | null = null;
  const close = () => { pop?.remove(); pop = null; };
  const preview = async (chosen: ContextActionChosen, view: EditorView) => {
    close();
    const box = pop = document.createElement("div"), base = shown;
    box.className = "pages-pop";
    box.role = "dialog";
    box.ariaLabel = chosen.title;
    box.innerHTML = '<p></p><div class="pages-landing-preview" hidden></div><div class="pages-pop-actions"><button type="button" class="mw-btn mw-btn--ghost"></button><button type="button" class="mw-btn mw-btn--primary" hidden></button></div>';
    const lead = box.querySelector("p")!, text = box.querySelector<HTMLElement>(".pages-landing-preview")!, [cancel, ok] = [...box.querySelectorAll("button")] as [HTMLButtonElement, HTMLButtonElement];
    const fail = (message: string) => { lead.textContent = message; lead.className = "pages-pop-error"; ok.disabled = false; };
    const moved = L("pages.landing.moved");
    lead.textContent = L("pages.landing.preparing");
    cancel.textContent = L("pages.action.cancel");
    cancel.onclick = close;
    (port.bench.querySelector("[data-pages-stage-workspace]") ?? port.bench).append(box);
    placeOverlay(box, view.coordsAtPos(Math.min(base.from, view.state.doc.content.size)), "below");
    const input = (await chosen.prepare().catch(() => null))?.input as Prepared;
    if (pop !== box) return;
    if (typeof input?.text !== "string" || Math.min(input.anchor!, input.head!) !== base.from || Math.max(input.anchor!, input.head!) !== base.to) return fail(moved);
    lead.textContent = chosen.title;
    // Each paragraph as it will be written; a quote looks as Pages draws one, with where it came from under it.
    if (input.source) text.classList.add("pages-quote");
    const lines = [...input.text.split(/\n+/u).filter(Boolean), ...(input.source?.title ? ["— " + input.source.title] : [])];
    text.replaceChildren(...lines.map(line => Object.assign(document.createElement("p"), { textContent: line })));
    ok.textContent = L("pages.landing.put-in");
    text.hidden = ok.hidden = false;
    ok.onclick = () => {
      ok.disabled = true;
      // Only into the document the landing was reported for: the positions mean nothing in another one.
      void (async () => {
        if (!base.doc || !view.state.doc.eq(base.doc) || !port.open()) return fail(moved);
        await chosen.run!();
        close();
        await port.refresh();
      })().catch((error: unknown) => fail(error instanceof Error ? error.message : moved));
    };
    ok.focus();
  };

  window.addEventListener("molis:assistant-context-action-chosen", (event) => {
    const chosen = (event as CustomEvent<ContextActionChosen>).detail, view = port.view(), open = port.open();
    if (!chosen?.landing || typeof chosen.run !== "function" || chosen.landing.plugin_id !== PLUGIN_ID || !view || !open || chosen.landing.object.id !== open.id) return;
    event.preventDefault();
    void preview(chosen, view);
  });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && pop) close(); });
  let flashing = false;
  port.bench.addEventListener("molis:surface-landing-flash", () => {
    const view = port.view(), { key, from, to } = shown;
    if (flashing || !view || !key || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    flashing = true;
    let clear = () => {};
    if (from === to) {
      const at = view.coordsAtPos(Math.min(from, view.state.doc.content.size)), line = document.createElement("span");
      line.className = "pages-landing-flash";
      line.style.cssText = `left:${at.left - 1}px;top:${at.top}px;height:${at.bottom - at.top}px`;
      document.body.append(line);
      clear = () => line.remove();
    } else if (CSS.highlights) {
      const range = document.createRange(), start = view.domAtPos(from), end = view.domAtPos(to);
      range.setStart(start.node, start.offset); range.setEnd(end.node, end.offset);
      CSS.highlights.set("pages-landing", new Highlight(range));
      clear = () => CSS.highlights.delete("pages-landing");
    }
    setTimeout(() => { clear(); flashing = false; }, 640);
  });
  return { report };
}
