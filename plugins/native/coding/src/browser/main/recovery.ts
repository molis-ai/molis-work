import { el, errorMessage } from "../dom.js";
import { controls } from "./controls.js";
import type { Page } from "./page.js";
import { api, sessionPath } from "./request.js";
import type { Checkpoint, RecoveryReport, RecoveryRun } from "./shapes.js";

/** One interrupted round: what it did, what is still open, and the button that ends it. */
function recoverySection(page: Page, run: RecoveryRun, index: number): HTMLElement {
  const { L, s } = page, section = el("section");
  const labels = { completed: L("coding.recovery.done"), failed: L("coding.recovery.failed"), "not-dispatched": L("coding.recovery.not-dispatched"), unknown: L("coding.recovery.unknown") };
  // A subtask's interrupted round is named after the subtask, so the person knows what closing it settles.
  const child = run.subagent ? s.subagentGroups.flatMap(group => group.children || []).find(entry => entry.subagent_id === run.subagent?.subagent_id) : null;
  // Subtasks of one role read alike; the directory each one worked in tells them apart.
  const where = child?.workspace_path ? child.workspace_path.split("/").at(-1) || "" : "", role = child?.role_name || L("coding.results.subagents");
  section.append(el("h4", !run.subagent ? L("coding.recovery.turn", { number: index + 1 }) : where ? L("coding.recovery.subtask-where", { role, where }) : L("coding.recovery.subtask", { role, where })));
  if (run.subagent) section.append(el("p", L("coding.recovery.subtask-note")));
  for (const operation of run.operations) section.append(el("p", L("coding.goal.field", { label: labels[operation.outcome], value: operation.summary })));
  if (!run.operations.length) section.append(el("p", L("coding.recovery.no-operations")));
  if (run.waiting) section.append(el("p", L("coding.recovery.waiting", { count: run.waiting })));
  for (const message of run.blockers) section.append(el("p", message));
  const button = el("button", L("coding.recovery.end"), "mw-btn");
  button.type = "button";
  button.dataset.codingRecover = run.run_id;
  button.dataset.version = String(run.version);
  button.disabled = !run.can_close;
  section.append(button);
  return section;
}

/** Reads what closing the session's interrupted rounds would settle, and lists it. */
export async function readRecovery(page: Page) {
  const { L, lifetime, q, s } = page;
  if (!s.current || s.recoveryLoading || s.recoveryBusy) return;
  const id = s.current, ticket = s.generation;
  s.recoveryLoading = true;
  q("[data-coding-recovery]").hidden = false;
  q("[data-coding-recovery-status]").textContent = L("coding.recovery.loading");
  q<HTMLButtonElement>("[data-coding-recovery-refresh]").disabled = true;
  try {
    const report = await api<RecoveryReport>(page, sessionPath(id) + "/recovery");
    if (s.current !== id || ticket !== s.generation) return;
    const list = q("[data-coding-recovery-list]");
    list.replaceChildren(...report.runs.map((run, index) => recoverySection(page, run, index)));
    // What waits in the session goes with the next round; the runtime's input record says what it is.
    if (report.inputs?.length) list.append(el("p", L("coding.recovery.inputs", { count: report.inputs.length, inputs: report.inputs.map(input => input.text).join(L("coding.list.semicolon")) })));
    q("[data-coding-recovery-status]").textContent = report.blockers.length ? report.blockers.join("；") : report.runs.length ? L("coding.recovery.checked") : L("coding.recovery.none");
  } catch (error) {
    if (!lifetime.alive) return;
    if (s.current === id && ticket === s.generation) {
      s.recoveryKey = "";
      q("[data-coding-recovery-list]").replaceChildren();
      q("[data-coding-recovery-status]").textContent = L("coding.recovery.check-failed", { reason: errorMessage(error) });
    }
  } finally {
    if (ticket === s.generation) {
      s.recoveryLoading = false;
      q<HTMLButtonElement>("[data-coding-recovery-refresh]").disabled = false;
    }
  }
}

/** Where a checkpoint was made, in the round's number when the round is loaded. */
function checkpointMeta(page: Page, item: Checkpoint): string {
  const { L, s } = page, round = s.allRuns.findIndex(run => run.ref.run_id === item.origin_run_id);
  const origin = item.origin_run_id ? " · " + (round >= 0 ? L("coding.turn.number", { number: round + 1 }) : L("coding.checkpoints.origin", { run: item.origin_run_id })) : "";
  return new Date(item.created_at).toLocaleString() + origin + (item.directory ? " · " + item.directory.canonical_path : "");
}

/** One checkpoint: its label, where it was made, and the button that previews rewinding to it. */
function checkpointRow(page: Page, item: Checkpoint): HTMLElement {
  const { L } = page, row = el("section"), button = el("button", item.rewound_at ? L("coding.checkpoints.preview-again") : L("coding.checkpoints.preview"), "mw-btn");
  button.type = "button";
  button.dataset.codingRewind = item.checkpoint_id;
  button.setAttribute("aria-label", button.textContent + " " + item.label + " " + item.checkpoint_id);
  row.append(el("p", item.label), el("small", checkpointMeta(page, item)));
  // Already rewound here: say when, so the list does not read as untouched; the files may have changed since.
  if (item.rewound_at) row.append(el("small", L("coding.checkpoints.rewound", { at: new Date(item.rewound_at).toLocaleString() }), "coding-checkpoint-done"));
  row.append(button);
  return row;
}

/** Reads the points the session can be rewound to. */
export async function readCheckpoints(page: Page) {
  const { L, lifetime, q, s } = page;
  if (!s.current || s.checkpointLoading) return;
  const id = s.current, ticket = s.generation;
  s.checkpointLoading = true;
  controls(page);
  try {
    const data = await api<{ checkpoints: readonly Checkpoint[] }>(page, sessionPath(id) + "/checkpoints");
    if (s.current !== id || s.generation !== ticket) return;
    q("[data-coding-checkpoints-list]").replaceChildren(...data.checkpoints.map(item => checkpointRow(page, item)));
    q("[data-coding-checkpoints-status]").textContent = s.checkpointBusy ? L("coding.checkpoints.busy-below") : data.checkpoints.length ? L("coding.checkpoints.preview-first") : L("coding.checkpoints.none");
  } catch (error) {
    if (!lifetime.alive) return;
    if (s.current === id && s.generation === ticket) {
      s.checkpointKey = "";
      q("[data-coding-checkpoints-status]").textContent = L("coding.checkpoints.unreadable", { reason: errorMessage(error) });
    }
  } finally {
    if (s.generation === ticket) {
      s.checkpointLoading = false;
      controls(page);
    }
  }
}
