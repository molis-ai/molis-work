import { el } from "../dom.js";
import { terminal } from "./composer-state.js";
import { phaseRing, toInput } from "./helpers.js";
import type { Page } from "./page.js";
import type { RunView } from "./shapes.js";

const SVG = "http://www.w3.org/2000/svg";

/** The next steps the Host offers after the latest round; the focused one keeps the focus when the row is redrawn. */
export function renderNextSteps(page: Page, all: readonly RunView[]) {
  const { q } = page, row = q("[data-coding-steps]"), next = all.at(-1)?.next_html || "";
  if (row.dataset.html === next) return;
  const at = document.activeElement as HTMLElement | null, had = Boolean(at && row.contains(at)), stepId = at?.dataset.ixStepId;
  row.innerHTML = next;
  row.dataset.html = next;
  row.hidden = !next;
  if (had && stepId) toInput(page, row.querySelector<HTMLElement>('[data-ix-step-id="' + CSS.escape(stepId) + '"]:not(:disabled)'));
}

function outcomeIcon(name: string): SVGSVGElement {
  const svg = document.createElementNS(SVG, "svg"), use = document.createElementNS(SVG, "use");
  svg.setAttribute("aria-hidden", "true");
  use.setAttribute("href", "#icon-" + name);
  svg.append(use);
  return svg;
}

/** One finished round's row: its changes and its report. */
function outcomeRow(page: Page, runId: string): HTMLElement {
  const { L } = page, row = el("div", "", "coding-outcome"), change = el("button", "", "mw-btn mw-btn--ghost"), report = el("button", "", "mw-btn mw-btn--ghost");
  row.dataset.codingOutcome = runId;
  change.type = "button";
  change.dataset.codingChangeOpen = runId;
  change.append(outcomeIcon("columns"), L("coding.short.change"));
  report.type = "button";
  report.dataset.codingReportOpen = runId;
  report.append(outcomeIcon("file"), L("coding.outcome.report"));
  row.append(el("span", "", "coding-outcome-name"), el("span", "", "coding-outcome-phase"), change, report);
  return row;
}

/** One row per finished round: its changes and its report, newest first. */
export function renderOutcomes(page: Page, all: readonly RunView[]) {
  const { L, q, s } = page, list = q("[data-coding-outcome-list]");
  const ended = all.filter(run => ["completed", "failed", "stopped", "cancelled"].includes(run.phase));
  q("[data-coding-outcomes]").hidden = !ended.length;
  const rows = new Map(([...list.children] as HTMLElement[]).map(node => [node.dataset.codingOutcome, node]));
  for (const run of ended) {
    let row = rows.get(run.ref.run_id);
    if (!row) {
      row = outcomeRow(page, run.ref.run_id);
      list.prepend(row);
    }
    const phase = row.querySelector<HTMLElement>(".coding-outcome-phase");
    if (!phase) continue;
    row.querySelector(".coding-outcome-name")!.textContent = L("coding.turn.number", { number: all.indexOf(run) + 1 });
    phase.textContent = s.phases[run.phase] || run.phase;
    phase.dataset.mwState = phaseRing(run.phase);
    phase.dataset.tone = run.phase === "completed" ? "done" : run.phase === "failed" ? "failed" : "idle";
  }
}

/** The header's pill names the state of a round that is still going. */
export function renderPill(page: Page) {
  const { q, s } = page, pill = q("[data-coding-phase]"), run = s.lastRun, live = Boolean(run) && !terminal(run!.phase);
  pill.hidden = !live;
  if (!live || !run) return;
  pill.dataset.phase = run.phase;
  pill.dataset.mwState = phaseRing(run.phase);
  pill.textContent = s.phases[run.phase] || run.phase;
}
