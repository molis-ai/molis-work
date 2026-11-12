import { dateArg, t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { el, errorMessage } from "../dom.js";
import { controls } from "./controls.js";
import type { Page } from "./page.js";
import { api, sessionPath } from "./request.js";
import type { Checkpoint, RecoveryReport, RecoveryRun } from "./shapes.js";

/** One interrupted round: what it did, what is still open, and the button that ends it. */
function recoverySection(page: Page, run: RecoveryRun, index: number): HTMLElement {
  const { s } = page, section = el("section");
  const labels = { completed: uiText.text("coding.recovery.done"), failed: uiText.text("coding.recovery.failed"), "not-dispatched": uiText.text("coding.recovery.not-dispatched"), unknown: uiText.text("coding.recovery.unknown") };
  // A subtask's interrupted round is named after the subtask, so the person knows what closing it settles.
  const child = run.subagent ? s.subagentGroups.flatMap(group => group.children || []).find(entry => entry.subagent_id === run.subagent?.subagent_id) : null;
  // Subtasks of one role read alike; the directory each one worked in tells them apart.
  const where = child?.workspace_path ? child.workspace_path.split("/").at(-1) || "" : "", role = child?.role_name || uiText.text("coding.results.subagents");
  section.append(el("h4", !run.subagent ? uiText.text("coding.recovery.turn", { number: index + 1 }) : where ? uiText.text("coding.recovery.subtask-where", { role, where }) : uiText.text("coding.recovery.subtask", { role, where })));
  if (run.subagent) section.append(el("p", uiText.text("coding.recovery.subtask-note")));
  for (const operation of run.operations) section.append(el("p", uiText.text("coding.goal.field", { label: labels[operation.outcome], value: operation.summary })));
  if (!run.operations.length) section.append(el("p", uiText.text("coding.recovery.no-operations")));
  if (run.waiting) section.append(el("p", uiText.text("coding.recovery.waiting", { count: run.waiting })));
  for (const message of run.blockers) section.append(el("p", message));
  const button = el("button", uiText.text("coding.recovery.end"), "mw-btn");
  button.type = "button";
  button.dataset.codingRecover = run.run_id;
  button.dataset.version = String(run.version);
  button.disabled = !run.can_close;
  section.append(button);
  return section;
}

/** Reads what closing the session's interrupted rounds would settle, and lists it. */
export async function readRecovery(page: Page) {
  const { lifetime, q, s } = page;
  if (!s.current || s.recoveryLoading || s.recoveryBusy) return;
  const id = s.current, ticket = s.generation;
  s.recoveryLoading = true;
  q("[data-coding-recovery]").hidden = false;
  q("[data-coding-recovery-status]").textContent = uiText.text("coding.recovery.loading");
  q<HTMLButtonElement>("[data-coding-recovery-refresh]").disabled = true;
  try {
    const report = await api<RecoveryReport>(page, sessionPath(id) + "/recovery");
    if (s.current !== id || ticket !== s.generation) return;
    const list = q("[data-coding-recovery-list]");
    list.replaceChildren(...report.runs.map((run, index) => recoverySection(page, run, index)));
    // What waits in the session goes with the next round; the runtime's input record says what it is.
    if (report.inputs?.length) list.append(el("p", uiText.text("coding.recovery.inputs", { count: report.inputs.length, inputs: report.inputs.map(input => input.text).join(uiText.text("common.punctuation.semicolon")) })));
    q("[data-coding-recovery-status]").textContent = report.blockers.length ? report.blockers.join(uiText.text("common.punctuation.semicolon")) : report.runs.length ? uiText.text("coding.recovery.checked") : uiText.text("coding.recovery.none");
  } catch (error) {
    if (!lifetime.alive) return;
    if (s.current === id && ticket === s.generation) {
      s.recoveryKey = "";
      q("[data-coding-recovery-list]").replaceChildren();
      q("[data-coding-recovery-status]").textContent = uiText.text("coding.recovery.check-failed", { reason: errorMessage(error) });
    }
  } finally {
    if (ticket === s.generation) {
      s.recoveryLoading = false;
      q<HTMLButtonElement>("[data-coding-recovery-refresh]").disabled = false;
    }
  }
}

/** Where a checkpoint was made, in the round's number when the round is loaded. */
function checkpointMeta(page: Page, item: Checkpoint): HTMLElement {
  const { s } = page, round = s.allRuns.findIndex(run => run.ref.run_id === item.origin_run_id);
  const meta = el("small"), time = el("time", uiText.text("common.generated.formatted", { value: dateArg(item.created_at, "datetime-with-seconds") }));
  time.dateTime = item.created_at;
  meta.append(time);
  if (item.origin_run_id) meta.append(" · ", el("span", round >= 0 ? uiText.text("coding.turn.number", { number: round + 1 }) : uiText.text("coding.checkpoints.origin", { run: item.origin_run_id })));
  if (item.directory) {
    const path = el("span", item.directory.canonical_path); path.translate = false;
    meta.append(" · ", path);
  }
  return meta;
}

/** One checkpoint: its label, where it was made, and the button that previews rewinding to it. */
function checkpointRow(page: Page, item: Checkpoint): HTMLElement {
  const row = el("section"), button = el("button", "", "mw-btn");
  const word = el("span", item.rewound_at ? uiText.text("coding.checkpoints.preview-again") : uiText.text("coding.checkpoints.preview"));
  const label = el("p", item.label), id = el("span", item.checkpoint_id), name = "coding-checkpoint-" + crypto.randomUUID();
  word.id = name + "-action"; label.id = name + "-label"; id.id = name + "-id";
  label.translate = false; id.translate = false; id.hidden = true;
  button.type = "button";
  button.dataset.codingRewind = item.checkpoint_id;
  button.setAttribute("aria-labelledby", [word.id, label.id, id.id].join(" "));
  button.append(word);
  row.append(label, id, checkpointMeta(page, item));
  // Already rewound here: say when, so the list does not read as untouched; the files may have changed since.
  if (item.rewound_at) row.append(el("small", uiText.text("coding.checkpoints.rewound", { at: dateArg(item.rewound_at, "datetime-with-seconds") }), "coding-checkpoint-done"));
  row.append(button);
  return row;
}

/** Reads the points the session can be rewound to. */
export async function readCheckpoints(page: Page) {
  const { lifetime, q, s } = page;
  if (!s.current || s.checkpointLoading) return;
  const id = s.current, ticket = s.generation;
  s.checkpointLoading = true;
  controls(page);
  try {
    const data = await api<{ checkpoints: readonly Checkpoint[] }>(page, sessionPath(id) + "/checkpoints");
    if (s.current !== id || s.generation !== ticket) return;
    q("[data-coding-checkpoints-list]").replaceChildren(...data.checkpoints.map(item => checkpointRow(page, item)));
    q("[data-coding-checkpoints-status]").textContent = s.checkpointBusy ? uiText.text("coding.checkpoints.busy-below") : data.checkpoints.length ? uiText.text("coding.checkpoints.preview-first") : uiText.text("coding.checkpoints.none");
  } catch (error) {
    if (!lifetime.alive) return;
    if (s.current === id && s.generation === ticket) {
      s.checkpointKey = "";
      q("[data-coding-checkpoints-status]").textContent = uiText.text("coding.checkpoints.unreadable", { reason: errorMessage(error) });
    }
  } finally {
    if (s.generation === ticket) {
      s.checkpointLoading = false;
      controls(page);
    }
  }
}
