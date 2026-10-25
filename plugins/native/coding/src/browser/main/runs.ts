import { controls } from "./controls.js";
import { renderCommandRows } from "./command-rows.js";
import { following } from "./helpers.js";
import { drawRun } from "./run-block.js";
import { renderFacts } from "./run-facts.js";
import { renderNextSteps, renderOutcomes, renderPill } from "./run-summary.js";
import type { Page } from "./page.js";
import type { RunView } from "./shapes.js";

/** An empty session shows the welcome with its suggestions; the first round takes it away. */
function welcome(page: Page, all: readonly RunView[]) {
  const { input, q, root, turns } = page;
  turns.toggleAttribute("data-coding-welcoming", !all.length);
  if (all.length) {
    q("[data-coding-welcome]")?.remove();
  } else if (!root.querySelector("[data-coding-welcome]")) {
    turns.append(q<HTMLTemplateElement>("[data-coding-welcome-template]").content.cloneNode(true));
    const name = root.dataset.codingWorkspaceName;
    if (name) turns.querySelectorAll("[data-coding-welcome-workspace]").forEach(node => { node.textContent = name; });
  }
  turns.querySelectorAll<HTMLButtonElement>("[data-coding-prompt]").forEach(button => { button.disabled = Boolean(input.value.trim()); });
}

/** The block of a round in the conversation, made at its place when it is new. */
function blockOf(page: Page, run: RunView, all: readonly RunView[]): HTMLElement {
  const { turns } = page, blocks = [...turns.children] as HTMLElement[];
  let block = blocks.find(node => node.dataset.run === run.ref.run_id);
  if (block) return block;
  block = document.createElement("section");
  block.dataset.run = run.ref.run_id;
  block.dataset.runIndex = String(all.indexOf(run));
  const after = ([...turns.querySelectorAll(":scope > [data-run]")] as HTMLElement[]).find(node => Number(node.dataset.runIndex) > all.indexOf(run));
  turns.insertBefore(block, after || null);
  return block;
}

/**
 * runs: the rounds to (re)draw, a contiguous stretch. all: the whole session in order, where rounds that are not
 * loaded are summaries. Numbering and "latest" are always read against the whole session.
 *
 * Following is the reader's choice, made by scrolling; content that grows after a render must not revoke it. Read back, the
 * part at the top of the view keeps its place: this is the one owner of the shift (overflow-anchor is none here; a WebView
 * may have no scroll anchoring).
 */
export function renderRuns(page: Page, runs: readonly RunView[], all: readonly RunView[] = runs) {
  const { q, s, turns } = page;
  const pinNow = !s.reportRun && following(page);
  const held = pinNow || s.reportRun ? null : ([...turns.querySelectorAll<HTMLElement>(":scope > [data-run] > *")]).find(node => node.getBoundingClientRect().bottom > turns.getBoundingClientRect().top);
  const heldTop = held?.getBoundingClientRect().top ?? 0;
  welcome(page, all);
  for (const run of runs) drawRun(page, blockOf(page, run, all), run, all);
  renderCommandRows(page, all);
  renderNextSteps(page, all);
  renderOutcomes(page, all);
  s.lastRun = all.at(-1) || null;
  renderFacts(page, all);
  renderPill(page);
  if (pinNow) s.follow.pin();
  else if (held?.isConnected) turns.scrollTop += held.getBoundingClientRect().top - heldTop;
  q("[data-coding-latest]").hidden = Boolean(s.reportRun) || pinNow;
  controls(page);
}
