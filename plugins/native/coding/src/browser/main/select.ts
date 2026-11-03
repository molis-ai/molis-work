import { renderArtifacts } from "./artifacts.js";
import { refreshState } from "./configuration.js";
import { controls } from "./controls.js";
import { renderGoalFace } from "./goals.js";
import { resetWindow, showReviews } from "./helpers.js";
import type { Page } from "./page.js";
import { readCurrent } from "./read.js";
import { closeReport, showReport } from "./report.js";
import { api, sessionPath, status } from "./request.js";
import { errorMessage } from "../dom.js";
import type { SessionData, SessionRecord } from "./shapes.js";

/** Forgets what the last session on show was holding, so the next one is read from nothing. */
function leaveSession(page: Page) {
  const { q, s, turns } = page, { cooperationUi, draft } = page.refs;
  // A choice open in a dialog belongs to the session it was opened on: switching closes it unsaved.
  s.materialTicket++;
  s.goalTicket++;
  s.goalReading++;
  s.methodDocumentTicket++;
  // Materials are picked in the page's one knowledge picker, not a dialog here: the ticket above drops its answer.
  for (const name of s.choosers) if (name !== "material") q<HTMLDialogElement>("[data-coding-" + name + "-dialog]").close();
  closeReport(page);
  if (s.current) {
    s.offsets.set(s.current, turns.scrollTop);
    void draft.flush().catch(error => status(page, errorMessage(error), true));
  }
  void showReviews(page, q("[data-coding-host-reviews]"), []);
  s.recoveryLoading = false;
  s.recoveryBusy = false;
  s.recoveryKey = "";
  q("[data-coding-recovery-list]").replaceChildren();
  q("[data-coding-recovery]").hidden = true;
  resetWindow(page);
  cooperationUi.reset();
}

/** Puts the page on a session: everything shown belongs to the one before until the first read of this one draws. */
export async function select(page: Page, id: string) {
  const { L, host, q, root, s } = page, { changeReview, draft, taskboard } = page.refs;
  host.revealTask?.();
  root.dataset.codingResults = "false";
  root.dataset.codingDetail = "true";
  s.sessionOnShow = true;
  // The same session back on show (its tab reopened): the directory's faces read from what is already held.
  if (id === s.current) {
    taskboard.refreshOutline();
    renderGoalFace(page);
    return s.selectionTask;
  }
  if (changeReview.active()) changeReview.close();
  q("[data-coding-outcome-list]").replaceChildren();
  q("[data-coding-outcomes]").hidden = true;
  leaveSession(page);
  s.current = id;
  draft.release();
  s.generation++;
  s.loading = false;
  s.lastRun = null;
  s.recovery = false;
  s.checkpointBusy = false;
  s.checkpointLoading = false;
  s.checkpointKey = "";
  s.statusKey = "";
  taskboard.loading(id);
  q("[data-coding-checkpoints-list]").replaceChildren();
  q("[data-coding-checkpoints-status]").textContent = L("coding.checkpoints.loading");
  q("[data-coding-commands]").querySelectorAll(":scope > .coding-command").forEach(node => node.remove());
  q("[data-coding-commands]").hidden = true;
  controls(page);
  s.selectionTask = readCurrent(page, true);
  await s.selectionTask;
}

/** Opens an item of this plugin: a session, or a fixed report or change review of one of its rounds. */
export async function openCodingItem(page: Page, itemId: string) {
  const { L, s } = page, { changeReview } = page.refs, ticket = ++s.itemTicket;
  s.reportItem = "";
  s.changeItem = "";
  const prefix = itemId.startsWith("coding-changeset:") ? "coding-changeset:" : itemId.startsWith("coding-report:") ? "coding-report:" : "";
  if (!prefix) {
    await select(page, itemId);
    if (ticket === s.itemTicket) {
      closeReport(page);
      changeReview.close();
      renderArtifacts(page);
    }
    return;
  }
  const parts = itemId.slice(prefix.length).split(":");
  if (parts.length !== 2) throw new Error(L("coding.error.artifact-reference"));
  const id = decodeURIComponent(parts[0]!), runId = decodeURIComponent(parts[1]!);
  await select(page, id);
  if (ticket !== s.itemTicket || s.current !== id) return;
  if (prefix === "coding-changeset:") {
    s.changeItem = itemId;
    await changeReview.openFixed(runId);
  } else {
    s.reportItem = itemId;
    await showReport(page, runId);
  }
  if (ticket === s.itemTicket) renderArtifacts(page);
}

/**
 * A new session is only worth keeping once something is written in it: an untouched empty one is reused instead of piling up.
 * Anything with a draft, a Goal or a past run is left alone.
 */
async function untouched(page: Page): Promise<SessionRecord | null> {
  const { L, s } = page, { draft } = page.refs;
  for (const session of s.state.sessions.filter(item => item.state === "idle" && item.title === L("coding.session.new-title") && !item.goal_id)) {
    if (draft.local(session.session_id)) continue;
    try {
      const data = await api<SessionData>(page, sessionPath(session.session_id) + "?window=1");
      if (!data.runs.length && !(String(data.draft || "")).trim() && !data.character && !(data.materials || []).length) return session;
    } catch {
      // A session that cannot be read is not reused; the next one is looked at.
    }
  }
  return null;
}

/** Starts a session, or reuses an untouched one, and puts the page on it. */
export async function create(page: Page) {
  const { L, host } = page, reuse = await untouched(page);
  const session = reuse || (await api<{ session: SessionRecord }>(page, "/sessions", "POST", { title: L("coding.session.new-title") })).session;
  if (!reuse) await refreshState(page);
  host.openItem("coding", session.session_id, session.title);
  await select(page, session.session_id);
}

/** Tells the bottom Assistant this session changed here (its mode, a new round), so a work it shows reads it again. */
export function surfaceChanged(page: Page, id: string) {
  if (page.lifetime.alive && id) window.dispatchEvent(new CustomEvent("molis:assistant-surface-changed", { detail: { plugin_id: "coding", object: { kind: "coding-session", id } } }));
}

/** The composer keeps rarely used context behind one "+" so the bar stays about the task. */
export function setAttach(page: Page, open: boolean) {
  const { attachMenu, attachToggle } = page.refs;
  attachMenu.hidden = !open;
  attachToggle.setAttribute("aria-expanded", String(open));
}
