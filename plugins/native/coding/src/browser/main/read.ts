import { SESSION_WINDOW } from "../../session-window-sizes.js";
import { errorMessage } from "../dom.js";
import { terminal } from "./composer-state.js";
import { boardUpdate } from "./board.js";
import { applyConfiguration, canonical, retitle } from "./configuration.js";
import { controls } from "./controls.js";
import { renderDirectory } from "./directory.js";
import { draftKey, showReviews } from "./helpers.js";
import { followLive, renderEarlier } from "./live.js";
import type { Page } from "./page.js";
import { renderPriority, renderQueued } from "./queued.js";
import { readCheckpoints, readRecovery } from "./recovery.js";
import { api, sessionPath, status } from "./request.js";
import { renderRuns } from "./runs.js";
import type { SessionData } from "./shapes.js";
import { followWorkspace } from "./workspace.js";

/** Reads the open session: the newest rounds in full, unchanged ones by their fingerprint. Null when the page moved on meanwhile. */
async function readSession(page: Page, id: string, ticket: number, fresh: boolean): Promise<SessionData | null> {
  const { s } = page, stale = () => s.current !== id || ticket !== s.generation;
  const read = (known: string[]) => api<SessionData>(page, sessionPath(id) + "?window=" + SESSION_WINDOW + (s.earlierFingerprint ? "&earlier=" + s.earlierFingerprint : "") + (known.length ? "&known=" + known.join(",") : ""));
  let data = await read(fresh ? [] : s.windowRuns.flatMap(run => run.fingerprint ? [run.fingerprint] : []));
  if (stale()) return null;
  // An unchanged round keeps the very view already drawn, so nothing about it is redrawn either.
  data = { ...data, runs: data.runs.map(run => run.unchanged ? s.windowRuns.find(held => held.fingerprint === run.fingerprint) || run : run) };
  if (!data.runs.some(run => run.unchanged)) return data;
  data = await read([]);
  return stale() ? null : data;
}

/** Takes the read's rounds as the ones shown, and what the session needs from them (recovery, the results panel's label). */
function adoptRuns(page: Page, id: string, data: SessionData) {
  const { L, q, s } = page;
  if (data.earlier) {
    s.earlierRuns = data.earlier;
    s.earlierFingerprint = data.earlier_fingerprint || "";
  }
  // A round that leaves the window keeps its full view: it is already drawn and settled.
  for (const run of s.windowRuns) if (!data.runs.some(next => next.ref.run_id === run.ref.run_id)) s.olderViews.set(run.ref.run_id, run);
  s.windowRuns = data.runs;
  s.allRuns = [...s.earlierRuns.map(summary => s.olderViews.get(summary.ref.run_id) || summary), ...data.runs];
  s.recovery = Boolean(data.recovery_required);
  s.checkpointBusy = Boolean(data.checkpoint_busy);
  q("[data-coding-recovery]").hidden = !s.recovery;
  const label = s.recovery || s.checkpointBusy || data.runs.some(run => run.phase === "awaiting-review") ? L("coding.results.pending") : L("coding.results.title");
  q("[data-coding-results-label]").textContent = label;
  q("[data-coding-results-open]").setAttribute("aria-label", label);
  if (s.recovery && s.recoveryKey !== id) {
    s.recoveryKey = id;
    void readRecovery(page);
  }
}

/** The title, what the Assistant is told about the screen, and the goal the next round is for. */
function adoptHeader(page: Page, id: string, data: SessionData) {
  const { L, host, q, root, s } = page;
  if (!root.querySelector("[data-coding-title] input")) q("[data-coding-title]").textContent = data.session.title;
  // What the person is on, for the bottom Assistant: this session, at its round count. Data about the screen only.
  root.setAttribute("data-assistant-context", JSON.stringify({ plugin_id: host.pluginId, surface_title: "Coding", object: { kind: "coding_session", id, title: data.session.title || L("coding.session.untitled"), version: String(data.run_count ?? data.runs.length) } }));
  q("[data-coding-goal-label]").textContent = data.session.goal_id ? L("coding.goal.next", { title: data.session.goal_title || data.session.goal_id }) : L("coding.goal.none-next-label");
  retitle(page, id, s.state.sessions.find(record => record.session_id === id)?.title, data.session.title);
  s.state.sessions = s.state.sessions.map(record => record.session_id === id ? data.session : record);
}

/**
 * Settings saved elsewhere (the bottom Assistant, another window) are taken over unless this page holds a change of its own
 * not saved yet; otherwise its next save would quietly put the old choice back.
 */
function adoptConfiguration(page: Page, id: string, data: SessionData, fresh: boolean) {
  const { q, s } = page, saved = canonical(data.configuration ?? null), adopted = s.adoptedConfigurations.get(id);
  if (!s.configurations.has(id)) {
    s.configurations.set(id, data.configuration ?? undefined);
  } else if (adopted !== undefined && saved !== adopted && canonical(s.configurations.get(id) ?? null) === adopted) {
    s.configurations.set(id, data.configuration ?? undefined);
    if (!fresh) {
      applyConfiguration(page);
      controls(page);
    }
  }
  // In step with what is saved: from here a difference is someone else's change. Out of step: this page's own change is still on its way.
  if (adopted === undefined || canonical(s.configurations.get(id) ?? null) === saved) s.adoptedConfigurations.set(id, saved);
  if (!fresh) return;
  if (!s.configurations.get(id)) {
    const first = s.state.models[0];
    q<HTMLSelectElement>("[data-coding-intent]").value = "discuss";
    q<HTMLSelectElement>("[data-coding-model]").value = first ? JSON.stringify([first.provider_id, first.model_id]) : "";
    s.workspaceId = s.state.workspace?.workspace_id || (s.state.workspaces?.length === 1 ? s.state.workspaces[0]!.workspace_id : "");
  }
  applyConfiguration(page);
  void followWorkspace(page);
}

/** The session's own choices (tools, methods, materials, character) are taken from the first read and kept by the page after. */
function adoptSelections(page: Page, id: string, data: SessionData) {
  const { s } = page;
  if (!s.mcpSourceSelections.has(id)) s.mcpSourceSelections.set(id, data.mcp_sources || []);
  if (!s.mcpSelections.has(id)) s.mcpSelections.set(id, data.mcp_tools || []);
  if (!s.actionSelections.has(id)) s.actionSelections.set(id, data.action_tools || []);
  if (!s.materialSelections.has(id)) s.materialSelections.set(id, data.materials || []);
  if (!s.characterSelections.has(id)) {
    s.characterSelections.set(id, data.character ?? null);
    s.characterTitles.set(id, data.character_title || "");
    if (data.character_skill_ids !== undefined) s.characterSkills.set(id, data.character_skill_ids);
  }
  if (!s.methodSelections.has(id)) s.methodSelections.set(id, data.methods || []);
  if (s.questionDrafts.has(id)) return;
  let saved: unknown = null;
  try {
    saved = JSON.parse(sessionStorage.getItem(draftKey(page, id) + ":questions") || "null");
  } catch {
    // Unreadable or no storage: the Host's copy of the answers stands.
  }
  s.questionDrafts.set(id, saved && typeof saved === "object" && !Array.isArray(saved) ? saved as Record<string, unknown> : data.question_drafts || {});
}

/** The composer's draft belongs to the session on show; a fresh read of another session starts its conversation over. */
function claimDraft(page: Page, id: string, data: SessionData, fresh: boolean) {
  const { s, turns } = page, { draft } = page.refs;
  if (!fresh && draft.owns(id)) return;
  draft.claim(id, data.draft);
  turns.replaceChildren();
  if (!s.offsets.has(id)) s.follow.resume();
}

/** Draws the session: its rounds, the meters, the queue, the reviews and the checkpoints. */
function drawSession(page: Page, id: string, data: SessionData, fresh: boolean) {
  const { L, q, root, s } = page, { cooperationUi, plans, stepReports, subagents, usageMeter } = page.refs;
  s.runtimeSessionId = data.session.runtime_session_id;
  s.queuedInputs = data.session.queued_inputs;
  s.planEntries = [...s.olderPlanEntries, ...(data.taskboard_plans || [])];
  s.subagentGroups = [...s.olderSubagents, ...(data.subagents || [])];
  renderRuns(page, data.runs, s.allRuns);
  renderEarlier(page);
  s.lastData = data;
  usageMeter.render(data, s.lastRun);
  void cooperationUi.refresh();
  if (s.lastRun && !terminal(s.lastRun.phase)) void followLive(page, id, s.lastRun.ref.run_id);
  renderQueued(page, id, data.session.queued);
  renderPriority(page, id, data.session.priority === true);
  plans.update(id, data.plan ?? null, s.allRuns);
  subagents.update(id, s.subagentGroups);
  boardUpdate(page, id, data);
  stepReports.sync(id);
  if (s.checkpointBusy) {
    s.statusKey = "checkpoint";
    status(page, L("coding.checkpoints.busy-right"));
  }
  // The results panel lists this session's reviews by session, not by naming every round: open items always, and the
  // latest settled history with the rest one click away. It is only read while the panel is open.
  if (root.dataset.codingResults === "true") {
    const children = (data.subagents || []).flatMap(group => (group.children || []).flatMap(child => child.child_run ? [child.child_run] : []));
    void showReviews(page, q("[data-coding-host-reviews]"), children, data.session.runtime_session_id, undefined, data.session.runtime_session_id ? { runSession: data.session.runtime_session_id, limit: 30 } : undefined);
  }
  const last = data.runs.at(-1), checkpointKey = JSON.stringify([id, last?.ref.run_id, last?.ended_at, s.checkpointBusy]);
  if (fresh || s.checkpointKey !== checkpointKey) {
    s.checkpointKey = checkpointKey;
    void readCheckpoints(page);
  }
  if (data.error) status(page, data.error, true);
  const top = s.offsets.get(id);
  if (fresh && top !== undefined) s.follow.restore(top);
  renderDirectory(page);
  controls(page);
}

/** A read that failed: the Host's refusal reaches the person, and an item that can no longer be read is announced to the workbench. */
function failRead(page: Page, id: string, error: unknown) {
  const { root } = page, { taskboard } = page.refs;
  const refused = error as { name?: string; code?: string; status?: number };
  if (refused.name === "AbortError") return;
  if (refused.code === "coding.session_unknown" || refused.status === 403) root.dispatchEvent(new CustomEvent("molis-work:item-unreadable", { bubbles: true, detail: { itemId: id } }));
  status(page, errorMessage(error), true);
  taskboard.fail(id, errorMessage(error));
}

/** Reads the open session again and draws it; `fresh` is the first read after the session was chosen. */
export async function readCurrent(page: Page, fresh = false) {
  const { lifetime, s } = page;
  if (!s.current || s.loading && !fresh) return;
  const id = s.current, ticket = s.generation;
  s.loading = true;
  try {
    const data = await readSession(page, id, ticket, fresh);
    if (!data) return;
    adoptRuns(page, id, data);
    adoptHeader(page, id, data);
    adoptConfiguration(page, id, data, fresh);
    adoptSelections(page, id, data);
    claimDraft(page, id, data, fresh);
    drawSession(page, id, data, fresh);
  } catch (error) {
    if (!lifetime.alive) return;
    if (s.current === id && ticket === s.generation) failRead(page, id, error);
  } finally {
    if (ticket === s.generation) s.loading = false;
  }
}
