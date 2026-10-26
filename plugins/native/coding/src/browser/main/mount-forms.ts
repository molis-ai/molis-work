import { errorMessage, part } from "../dom.js";
import { renderArtifacts } from "./artifacts.js";
import { rememberConfiguration, refreshState } from "./configuration.js";
import { controls } from "./controls.js";
import type { Page } from "./page.js";
import { progressDraftKey, rememberProgressDraft, renderProgress } from "./progress.js";
import { readCurrent } from "./read.js";
import { api, sessionPath, status } from "./request.js";
import { useProjectWorkspace } from "./workspace.js";

const detailOf = <Detail>(event: Event): Detail | undefined => (event as CustomEvent<Detail | null>).detail ?? undefined;

/** The submit button of a form, and whether it is free to press: a pressed one is disabled until the request is over. */
const submitOf = (form: HTMLFormElement) => part<HTMLButtonElement>(form, "[type=submit]");

/** Which goal the session's next round is fixed to. */
async function saveGoal(page: Page) {
  const { L, lifetime, q, s } = page, button = q<HTMLButtonElement>("[data-coding-goal-save]");
  if (button.disabled || s.goalSaving) return;
  const id = s.current, ticket = s.goalTicket, choice = s.goalChoice;
  s.goalSaving = true;
  button.disabled = true;
  try {
    await api(page, sessionPath(id) + "/goal", "PUT", { goal_id: choice?.snapshot.goal.goal_id ?? null, expected_artifact_id: choice?.reference.artifact_id });
    if (ticket === s.goalTicket && s.current === id) {
      q<HTMLDialogElement>("[data-coding-goal-dialog]").close();
      await readCurrent(page);
      status(page, L("coding.goal.saved"));
    }
  } catch (error) {
    if (!lifetime.alive) return;
    if (ticket === s.goalTicket) q("[data-coding-goal-error]").textContent = errorMessage(error);
  } finally {
    s.goalSaving = false;
    if (ticket === s.goalTicket) button.disabled = false;
  }
}

function listenGoal(page: Page) {
  const { lifetime, q, s } = page;
  lifetime.listen(q("[data-coding-goal-dialog]"), "cancel", event => {
    if (s.goalSaving) { event.preventDefault(); return; }
    s.goalTicket++;
    s.goalReading++;
  });
  lifetime.listen(q("[data-coding-goal-form]"), "submit", event => { event.preventDefault(); void saveGoal(page); });
}

/** Records the report's progress on its goal. */
async function saveProgress(page: Page) {
  const { L, lifetime, q, s } = page, view = s.progressView, current = view?.preview?.current;
  if (!view || !current || s.progressSaving || q<HTMLButtonElement>("[data-coding-progress-save]").disabled) return;
  rememberProgressDraft(page);
  const body = { summary: q<HTMLTextAreaElement>("[data-coding-progress-summary]").value, next_step: q<HTMLTextAreaElement>("[data-coding-progress-next]").value, expected_goal_cursor: current.state.goal_event_cursor };
  s.progressSaving = true;
  renderProgress(page);
  q("[data-coding-progress-status]").textContent = L("coding.progress.saving");
  try {
    const recorded = await api<NonNullable<NonNullable<typeof view.preview>["recorded"]>>(page, sessionPath(view.id, view.runId) + "/report/progress", "POST", body);
    if (s.progressView === view && view.preview) {
      view.preview.recorded = recorded;
      view.preview.current = null;
      try {
        sessionStorage.removeItem(progressDraftKey(page, view.id, view.runId));
      } catch {
        // The browser keeps no session storage here: nothing was kept to remove.
      }
    }
  } catch (error) {
    if (!lifetime.alive) return;
    if (s.progressView === view) q("[data-coding-progress-status]").textContent = L("coding.progress.save-failed", { reason: errorMessage(error) });
  } finally {
    s.progressSaving = false;
    if (s.progressView === view) renderProgress(page);
  }
}

function listenProgress(page: Page) {
  const { lifetime, q, s } = page;
  lifetime.listen(q("[data-coding-progress-dialog]"), "cancel", event => {
    if (s.progressSaving) { event.preventDefault(); return; }
    rememberProgressDraft(page);
    s.progressTicket++;
    s.progressView = null;
  });
  for (const selector of ["[data-coding-progress-summary]", "[data-coding-progress-next]"]) {
    lifetime.listen(q(selector), "input", () => {
      rememberProgressDraft(page);
      q<HTMLButtonElement>("[data-coding-progress-save]").disabled = !s.progressView?.preview?.current || s.progressSaving || !q<HTMLTextAreaElement>("[data-coding-progress-summary]").value.trim();
    });
  }
  lifetime.listen(q("[data-coding-progress-form]"), "submit", event => { event.preventDefault(); void saveProgress(page); });
}

interface KnowledgePicked { readonly request_id?: string; readonly picks?: { readonly kind: string; readonly id: string; readonly title: string }[] }

/** Materials are picked in the one picker of project knowledge (specs/project-knowledge PMAT-17); the page holds it, this surface asks for it and
 *  keeps the whole choice it hears back for the session that asked. */
async function takeMaterials(page: Page, picked: KnowledgePicked) {
  const { L, input, lifetime, refs, s } = page, [owner, id, ticket] = String(picked.request_id || "").split(":");
  if (owner !== "coding" || id !== s.current || Number(ticket) !== s.materialTicket) return;
  const selection = (picked.picks || []).map(pick => ({ kind: pick.kind, id: pick.id, title: pick.title }));
  try {
    await refs.draft.save(id, input.value, { materials: selection });
    s.materialSelections.set(id, selection);
    if (s.current !== id) return;
    controls(page);
    input.focus();
    status(page, selection.length ? L("coding.material.chosen", { count: selection.length }) : L("coding.material.cleared"));
  } catch (error) {
    if (lifetime.alive) status(page, errorMessage(error), true);
  }
}

/** The MCP tools and sources chosen for the session's next round. */
async function saveMcp(page: Page, form: HTMLFormElement) {
  const { L, lifetime, q, refs, s } = page, button = submitOf(form);
  if (button.disabled) return;
  button.disabled = true;
  const id = s.current, previous = s.mcpSelections.get(id), previousSources = s.mcpSourceSelections.get(id);
  s.mcpSelections.set(id, structuredClone(s.mcpChoices));
  s.mcpSourceSelections.set(id, structuredClone(s.mcpSourceChoices));
  try {
    await refs.draft.saveChoices(id);
    q<HTMLDialogElement>("[data-coding-mcp-dialog]").close();
    controls(page);
    status(page, L("coding.mcp.saved"));
  } catch (error) {
    if (!lifetime.alive) return;
    s.mcpSelections.set(id, previous || []);
    s.mcpSourceSelections.set(id, previousSources || []);
    q("[data-coding-mcp-error]").textContent = errorMessage(error);
  } finally {
    button.disabled = false;
  }
}

/** The methods chosen for the session's next round. */
async function saveMethods(page: Page, form: HTMLFormElement) {
  const { L, input, lifetime, q, refs, s } = page, submit = submitOf(form);
  if (submit.disabled) return;
  submit.disabled = true;
  const id = s.current, selection = structuredClone(s.methodChoices);
  try {
    await refs.draft.save(id, input.value, { methods: selection });
    s.methodSelections.set(id, selection);
    q<HTMLDialogElement>("[data-coding-method-dialog]").close();
    controls(page);
    input.focus();
    status(page, L("coding.method.saved"));
  } catch (error) {
    if (!lifetime.alive) return;
    q("[data-coding-method-error]").textContent = errorMessage(error);
  } finally {
    submit.disabled = false;
  }
}

/** The directory the session works in: an added path (confirmed by the person) or one of the project's. */
async function saveWorkspace(page: Page, form: HTMLFormElement) {
  const { L, host, lifetime, q, refs, s } = page, submit = submitOf(form), id = s.current;
  if (submit.disabled) return;
  submit.disabled = true;
  try {
    const path = q<HTMLInputElement>("[data-coding-workspace-path]").value.trim();
    if (path && !q<HTMLInputElement>("[data-coding-workspace-confirm]").checked) throw new Error(L("coding.workspace.confirm-needed"));
    const chosen = path ? (await host.addWorkspace(path)).workspace_id : q<HTMLSelectElement>("[data-coding-workspace-choice]").value;
    if (!chosen) throw new Error(L("coding.workspace.choose-needed"));
    // Chosen for the session it was opened on: once another one is on show (the switch closed this dialog), nothing more is set.
    if (s.current !== id) return;
    await useProjectWorkspace(page, chosen);
    if (s.current !== id) return;
    s.workspaceId = chosen;
    rememberConfiguration(page);
    await refs.draft.flush();
    await refreshState(page);
    q("[data-coding-workspace-error]").textContent = "";
    q<HTMLInputElement>("[data-coding-workspace-path]").value = "";
    q<HTMLInputElement>("[data-coding-workspace-confirm]").checked = false;
    q<HTMLDialogElement>("[data-coding-workspace-dialog]").close();
  } catch (error) {
    if (!lifetime.alive) return;
    q("[data-coding-workspace-error]").textContent = errorMessage(error);
  } finally {
    submit.disabled = false;
  }
}

function listenChoiceForms(page: Page) {
  const { directory, lifetime, q, s } = page;
  lifetime.listen(document, "molis-work:knowledge-picked", event => {
    const picked = detailOf<KnowledgePicked>(event);
    if (picked) void takeMaterials(page, picked);
  });
  lifetime.listen(q("[data-coding-method-dialog]"), "cancel", () => { s.methodDocumentTicket++; });
  const forms: [string, (page: Page, form: HTMLFormElement) => Promise<void>][] = [["[data-coding-mcp-form]", saveMcp], ["[data-coding-method-form]", saveMethods], ["[data-coding-workspace-form]", saveWorkspace]];
  for (const [selector, save] of forms) {
    const form = q<HTMLFormElement>(selector);
    lifetime.listen(form, "submit", event => { event.preventDefault(); void save(page, form); });
  }
  lifetime.listen(part(directory, "[data-coding-artifact-search]"), "input", () => renderArtifacts(page));
}

/** The dialogs of the page and the forms in them. */
export function mountForms(page: Page) {
  listenGoal(page);
  listenProgress(page);
  listenChoiceForms(page);
}

