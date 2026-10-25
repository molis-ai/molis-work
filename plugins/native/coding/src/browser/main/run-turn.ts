import { el } from "../dom.js";
import { paintable } from "./boundary.js";
import { enrichCode, linkedText } from "./code.js";
import { foldTurn } from "./run-folds.js";
import type { Page } from "./page.js";
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
    window.molisStreamText(node, turn.html, { reveal: s.renderedText.has(node) && turn.kind === "assistant" && writing && !document.hidden, grow: (kept, next) => kept instanceof HTMLElement && next instanceof HTMLElement && growCode(paintable(kept), paintable(next)) });
  } else {
    node.innerHTML = turn.html || "";
  }
  if (!turn.html) linkedText(node, turn.text);
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
  const receipt = host.receipts.line(turns, turn, { run_id: run.ref.run_id, awaiting_input: run.awaiting_input, step_board: run.step_board }, inputReceipts.act(s.current, run.ref.run_id));
  if (receipt && receipt.parentNode !== node) node.append(receipt);
  return node;
}
