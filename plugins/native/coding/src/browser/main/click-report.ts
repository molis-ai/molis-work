import { errorMessage } from "../dom.js";
import { loadArtifacts, renderArtifacts } from "./artifacts.js";
import type { ClickRule } from "./click-types.js";
import type { Page } from "./page.js";
import { closeProgress, openProgress } from "./progress.js";
import { closeReport, loadReportOutput, showReport } from "./report.js";
import { api, sessionPath } from "./request.js";

/** Makes the saved report the session's output (the Host checks the version it was read at); reads the state again when it cannot. */
async function setReportOutput(page: Page, target: HTMLButtonElement) {
  const { L, lifetime, q, s } = page;
  if (!s.reportRun || target.disabled) return;
  const id = s.current, runId = s.reportRun, ticket = s.reportTicket;
  if (!s.reportOutput) {
    await loadReportOutput(page, id, runId, ticket);
    return;
  }
  target.disabled = true;
  try {
    await api(page, sessionPath(id, runId) + "/report/output", "POST", { expected_reference: s.reportOutput.current });
    await loadReportOutput(page, id, runId, ticket);
  } catch (error) {
    if (!lifetime.alive) return;
    if (ticket === s.reportTicket && id === s.current) {
      await loadReportOutput(page, id, runId, ticket);
      if (ticket === s.reportTicket) q("[data-coding-report-output-status]").textContent = L("coding.report.output-reread", { reason: errorMessage(error) });
    }
  }
}

export const REPORT_CLICKS: readonly ClickRule[] = [
  ["[data-coding-artifact-refresh]", page => loadArtifacts(page)],
  ["[data-coding-artifact]", (page, target, event) => {
    event.preventDefault();
    page.host.openItem("coding", target.dataset.codingArtifact || "", target.querySelector("strong")?.textContent || "");
  }],
  ["[data-coding-report-open]", async (page, target) => {
    const { s } = page;
    s.reportItem = "";
    s.changeItem = "";
    renderArtifacts(page);
    s.reportTrigger = target;
    await showReport(page, target.dataset.codingReportOpen || "");
  }],
  ["[data-coding-report-close]", page => {
    const { host, s } = page, fromArtifact = s.reportItem;
    s.reportItem = "";
    closeReport(page, true);
    if (fromArtifact) host.openItem("coding", s.current, s.state.sessions.find(item => item.session_id === s.current)?.title);
  }],
  ["[data-coding-report-progress],[data-coding-progress-refresh]", page => openProgress(page)],
  ["[data-coding-progress-close]", page => closeProgress(page)],
  ["[data-coding-progress-goal]", page => {
    const { host, s } = page, goal = s.progressView?.preview?.report_goal;
    if (!goal || s.progressSaving) return;
    closeProgress(page);
    host.openItem("goals", goal.goal_id, goal.title);
  }],
  ["[data-coding-report-output]", setReportOutput],
  ["[data-coding-report-save]", page => {
    const { s } = page;
    if (s.reportRun && !s.reportSaving) return showReport(page, s.reportRun, true);
  }],
];
