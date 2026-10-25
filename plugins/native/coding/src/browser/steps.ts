import { insertedAcceptance } from "../inserted-step.js";
import { el, errorMessage } from "./dom.js";
import type { PlanEntry, SessionRead, StepNode, StepVerdict } from "./shapes.js";
import type { PagePorts, ReceiptLinks } from "./types.js";

export interface StepPorts extends PagePorts {
  /** Puts the reason for a rework in the composer (a failure is an Error that says why not). */
  readonly prepareRework: (reason: string) => void;
  readonly receipts: ReceiptLinks;
}

export interface StepReports {
  /** Closes the dialog when the session on show is not the one it was opened for. */
  sync(id: string): void;
  open(id: string, run: string, step: string): Promise<void>;
}

const ENDED = ["completed", "failed", "stopped", "cancelled"];

/** User assessments stay separate from original SDK reports and never mutate the graph. */
export function stepReports(ports: StepPorts): StepReports {
  const { lifetime, translate: L, q, api, current, status, refresh, prepareRework, receipts } = ports;
  const dialog = q<HTMLDialogElement>("[data-coding-step-dialog]"), detail = q("[data-coding-step-detail]"), notes = q<HTMLTextAreaElement>("[data-coding-step-notes]"), message = q("[data-coding-step-status]");
  const accept = q<HTMLButtonElement>("[data-coding-step-accept]"), reject = q<HTMLButtonElement>("[data-coding-step-reject]"), rework = q<HTMLButtonElement>("[data-coding-step-rework]"), reload = q<HTMLButtonElement>("[data-coding-step-refresh]");
  let owner = "", runId = "", stepId = "", ticket = 0, busy = false;
  let data: SessionRead | null = null, entry: PlanEntry | null | undefined = null, node: StepNode | null | undefined = null, verdict: StepVerdict | null = null;
  const states: Record<string, string> = {
    "not-started": L("coding.step.state.not-started"), ready: L("coding.step.state.ready"), running: L("coding.step.state.running"),
    succeeded: L("coding.step.state.succeeded"), failed: L("coding.step.state.failed"), cancelled: L("coding.step.state.cancelled"), blocked: L("coding.step.state.blocked"),
  };
  const key = () => "molis-coding-step-notes:" + location.pathname + ":" + owner + ":" + runId + ":" + stepId;
  const remember = () => {
    try { sessionStorage.setItem(key(), notes.value); } catch { /* storage closed: the notes stay in the box */ }
  };
  const update = () => {
    const run = data?.runs.find(item => item.ref.run_id === runId), ended = run && ENDED.includes(run.phase);
    const available = Boolean(ended && node?.reports.length && !entry?.board_error && !data?.recovery_required && !data?.checkpoint_busy);
    accept.disabled = busy || !available || node?.state !== "succeeded";
    reject.disabled = busy || !available;
    reload.disabled = busy;
    rework.disabled = busy || verdict?.status !== "needs-work";
    notes.disabled = busy;
  };
  const describe = (found: PlanEntry, step: StepNode) => {
    const plan = found.plan, board = found.board;
    if (!plan || !board) throw new Error(L("coding.step.unreadable"));
    const planned = plan.content.steps[Number(step.id.replace("step-", "")) - 1];
    const shown = step.inserted ? { title: step.title || step.id, acceptance: insertedAcceptance(step.reports) || L("coding.step.see-insert") } : planned ?? { title: step.title || step.id, acceptance: "" };
    detail.append(el("p", L("coding.step.run", { run: runId, revision: found.revision })), el("h3", shown.title), el("p", L("coding.step.acceptance", { acceptance: shown.acceptance })), el("p", states[step.state] || L("coding.step.state.unknown")));
    // Who holds the step now, and who made each report (a handover says so).
    if (step.owner) detail.append(el("p", L("coding.step.owner", { owner: step.owner.kind === "person" ? L("coding.step.you") : step.owner.label ?? "" })));
    const reports = el("ol", "");
    // A report naming a supplement opens its receipt in the conversation, when this page drew one.
    for (const report of step.reports) {
      const li = el("li", (report.by ? report.by.label + L("coding.timeline.colon") : "") + report.note);
      for (const one of report.inputs || []) {
        const link = receipts.link(q("[data-coding-turns]"), one.input_id, () => dialog.close());
        if (link) li.append(" ", link);
      }
      reports.append(li);
    }
    detail.append(reports);
    if (!step.reports.length) detail.append(el("p", L("coding.step.no-reports")));
    if (verdict) {
      detail.append(el("p", verdict.status === "accepted" ? L("coding.step.accepted") : L("coding.step.needs-work")), el("p", verdict.notes));
      if (verdict.project_id !== board.project_id || verdict.board_version !== board.version) detail.append(el("p", L("coding.step.stale-verdict")));
    } else detail.append(el("p", L("coding.step.no-verdict")));
    if (!notes.value && verdict?.notes) notes.value = verdict.notes;
  };
  const read = async () => {
    const at = ticket, id = owner;
    busy = true;
    update();
    message.textContent = L("coding.step.reading");
    try {
      const value = await api<SessionRead>("/sessions/" + encodeURIComponent(id));
      if (at !== ticket || id !== current()) return;
      data = value;
      entry = value.taskboard_plans?.find(item => item.run_id === runId && item.board?.nodes.some(each => each.id === stepId));
      node = entry?.board?.nodes.find(each => each.id === stepId);
      verdict = entry?.verdicts?.[stepId] || null;
      detail.replaceChildren();
      if (!node || !entry) throw new Error(L("coding.step.unreadable"));
      describe(entry, node);
      const run = value.runs.find(item => item.ref.run_id === runId);
      message.textContent = run && ENDED.includes(run.phase) ? L("coding.step.run-ended") : L("coding.step.run-running");
    } catch (error) {
      if (!lifetime.alive) return;
      if (at === ticket) { entry = null; node = null; verdict = null; message.textContent = errorMessage(error); }
    } finally {
      if (at === ticket) { busy = false; update(); }
    }
  };
  const save = async (action: "accepted" | "needs-work") => {
    if (busy || !node || !entry?.board) return;
    const at = ticket, id = owner, board = entry.board;
    busy = true;
    update();
    remember();
    message.textContent = L("coding.step.saving");
    try {
      await api("/sessions/" + encodeURIComponent(id) + "/runs/" + encodeURIComponent(runId) + "/steps/" + encodeURIComponent(stepId), "POST", {
        action, notes: notes.value, expected_revision: verdict?.revision || 0, project_id: board.project_id, board_version: board.version,
      });
      if (at !== ticket) return;
      try { sessionStorage.removeItem(key()); } catch { /* storage closed: nothing was kept */ }
      await read();
      if (id === current()) await refresh();
      if (at === ticket) message.textContent = action === "accepted" ? L("coding.step.saved-accepted") : L("coding.step.saved-rework");
    } catch (error) {
      if (!lifetime.alive) return;
      if (at === ticket) message.textContent = errorMessage(error);
    } finally {
      if (at === ticket) { busy = false; update(); }
    }
  };
  const askRework = () => {
    if (busy || verdict?.status !== "needs-work" || !entry) return;
    const reason = L("coding.step.rework-reason", { run: runId, revision: entry.revision, step: stepId, notes: verdict.notes });
    dialog.close();
    try {
      prepareRework(reason);
    } catch (error) {
      if (!lifetime.alive) return;
      status(errorMessage(error), true);
    }
  };
  lifetime.listen(notes, "input", remember);
  lifetime.listen(accept, "click", () => void save("accepted"));
  lifetime.listen(reject, "click", () => void save("needs-work"));
  lifetime.listen(reload, "click", () => void read());
  lifetime.listen(q("[data-coding-step-close]"), "click", () => dialog.close());
  lifetime.listen(dialog, "close", () => { remember(); ticket++; busy = false; });
  lifetime.listen(rework, "click", askRework);
  return {
    sync(id) { if (dialog.open && owner !== id) dialog.close(); },
    async open(id, run, step) {
      if (busy) { status(L("coding.step.busy"), true); return; }
      ticket++;
      owner = id; runId = run; stepId = step;
      data = null; entry = null; node = null; verdict = null;
      detail.replaceChildren();
      notes.value = "";
      try { notes.value = sessionStorage.getItem(key()) || ""; } catch { /* storage closed: start empty */ }
      dialog.showModal();
      await read();
    },
  };
}
