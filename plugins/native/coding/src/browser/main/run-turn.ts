import { contentHtml, setContentHtml } from "@molis-ai/molis-work-plugin-sdk/browser";
import { el } from "../dom.js";
import { paintable } from "./boundary.js";
import { enrichCode, linkedText } from "./code.js";
import { foldTurn } from "./run-folds.js";
import type { Page } from "./page.js";
import { api, sessionPath } from "./request.js";
import type { RunView, TurnView } from "./shapes.js";

/** What a turn's text is drawn from, so a turn already drawn from the same text is left alone. */
function renderKeyOf(turn: TurnView, run: RunView): string {
  return turn.text + (run.frozen.role_id === "planner" ? "|" + run.phase : "");
}

/** Puts a turn's words in its node: a plan or a split as its own card, otherwise the Host's HTML (streamed while it is being written). */
function drawText(page: Page, node: HTMLElement, run: RunView, turn: TurnView, writing: boolean) {
  const { s } = page, { growCode, plans, writerDirectories } = page.refs;
  if (plans.renderTurn(node, run, turn) || writerDirectories.renderTurn(node, run, turn)) return;
  if (turn.html && window.molisStreamText) {
    window.molisStreamText(node, contentHtml(turn.html, node.ownerDocument), { reveal: s.renderedText.has(node) && turn.kind === "assistant" && writing && !document.hidden, grow: (kept, next) => kept instanceof HTMLElement && next instanceof HTMLElement && growCode(paintable(kept), paintable(next)) });
  } else {
    setContentHtml(node, turn.html || "");
  }
  if (!turn.html) linkedText(node, turn.text);
}

/**
 * The pictures a round was sent with, under the person's words (A3 「发出后在消息里」): each read back from the platform once and
 * shown as a thumbnail that opens larger in the board's dialog; one that cannot be read says so by its name.
 */
function roundPictures(page: Page, node: HTMLElement, run: RunView) {
  if (node.querySelector(":scope > .coding-turn__pictures")) return;
  const { readText, s } = page, row = el("ul", "", "coding-turn__pictures"), session = s.current;
  row.setAttribute("aria-label", readText("coding.images.sent", { n: run.frozen.image_materials!.length }));
  for (const image of run.frozen.image_materials!) {
    const item = el("li"), open = el("button", "", "coding-turn__picture");
    open.type = "button";
    open.setAttribute("aria-label", readText("coding.images.open", { name: image.title }));
    open.title = image.title;
    item.append(open);
    row.append(item);
    void api<{ media_type: string; data: string }>(page, sessionPath(session, run.ref.run_id) + "/images/" + encodeURIComponent(image.material_id)).then(found => {
      const bytes = Uint8Array.from(atob(found.data), char => char.charCodeAt(0));
      const src = URL.createObjectURL(new Blob([bytes], { type: found.media_type })), thumb = document.createElement("img");
      thumb.src = src; thumb.alt = "";
      open.append(thumb);
      page.lifetime.listen(open, "click", () => window.molisPicture?.(open, { src, title: image.title, close: readText("coding.images.close") }));
    }, () => { open.disabled = true; open.textContent = readText("coding.images.unreadable", { name: image.title }); });
  }
  node.append(row);
}

/** The node of one turn in a round's block: made once, drawn again only when its text changed. */
export function turnNode(page: Page, block: HTMLElement, turn: TurnView, run: RunView, all: readonly RunView[]): HTMLElement {
  const { host, s, turns } = page, { inputReceipts } = page.refs;
  let node = ([...block.children] as HTMLElement[]).find(child => child.dataset.turn === turn.turn_id);
  if (!node) {
    node = el("article", "", "coding-turn");
    node.dataset.turn = turn.turn_id;
    node.dataset.kind = turn.kind;
  }
  const renderKey = renderKeyOf(turn, run);
  if (s.renderedText.get(node) !== renderKey) {
    drawText(page, node, run, turn, run === all.at(-1) && ["starting", "running"].includes(run.phase));
    foldTurn(page, node, turn);
    s.renderedText.set(node, renderKey);
    enrichCode(page, node);
  }
  if (turn.kind === "user" && run.frozen.image_materials?.length && run.turns.find(one => one.kind === "user") === turn) roundPictures(page, node, run);
  const receipt = host.receipts.line(turns, turn, { run_id: run.ref.run_id, awaiting_input: run.awaiting_input, step_board: run.step_board }, inputReceipts.act(s.current, run.ref.run_id));
  if (receipt && receipt.parentNode !== node) node.append(receipt);
  return node;
}
