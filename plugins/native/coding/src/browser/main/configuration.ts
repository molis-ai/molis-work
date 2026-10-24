import { el } from "../dom.js";
import { renderDirectory } from "./directory.js";
import { controls } from "./controls.js";
import type { Page } from "./page.js";
import { api } from "./request.js";
import type { StateRead } from "./shapes.js";
import { showWorkspace } from "./workspace.js";

/** A value as JSON with its keys in order, to compare two reads of the same thing. */
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(name => [name, (item as Record<string, unknown>)[name]])) : item);
}

/** Puts the session's remembered start (intent, model, directory, effort) back on the composer. */
export function applyConfiguration(page: Page) {
  const { L, q } = page, { composerModels } = page.refs, { s } = page;
  const config = s.configurations.get(s.current), models = q<HTMLSelectElement>("[data-coding-model]");
  models.querySelector("[data-unavailable]")?.remove();
  if (config) {
    q<HTMLSelectElement>("[data-coding-intent]").value = config.intent;
    const value = config.provider_id && config.model_id ? JSON.stringify([config.provider_id, config.model_id]) : "";
    if (![...models.options].some(option => option.value === value)) {
      const unavailable = el("option", L("coding.model.unavailable"));
      unavailable.value = value;
      unavailable.dataset.unavailable = "true";
      models.append(unavailable);
    }
    models.value = value;
    s.workspaceId = config.workspace_id;
    composerModels.apply(config);
  }
  const workspace = s.state.workspaces?.find(item => item.workspace_id === s.workspaceId);
  showWorkspace(page, workspace?.canonical_path, s.workspaceId ? L("coding.workspace.unavailable") : L("coding.workspace.choose-first"));
  if (!q<HTMLDialogElement>("[data-coding-workspace-dialog]").open) q<HTMLSelectElement>("[data-coding-workspace-choice]").value = s.workspaceId;
}

/** Keeps what the composer is set to as the open session's start. */
export function rememberConfiguration(page: Page) {
  const { q } = page, { composerModels, draft } = page.refs, { s } = page;
  if (!draft.owns(s.current)) return;
  const [provider, model] = JSON.parse(q<HTMLSelectElement>("[data-coding-model]").value || "[]") as [string?, string?];
  const writers = s.configurations.get(s.current)?.writer_assignments;
  s.configurations.set(s.current, {
    intent: q<HTMLSelectElement>("[data-coding-intent]").value, provider_id: provider || "", model_id: model || "", ...composerModels.effort(), workspace_id: s.workspaceId, ...(writers ? { writer_assignments: writers } : {}),
  });
}

/**
 * A session named by its first task renames its open tab too, while Coding is the surface on show (its tab is then the active one
 * and only its title changes). Whichever read sees the new name first does it.
 */
export function retitle(page: Page, id: string, before: string | undefined | false, after: string | undefined | false) {
  const { host, root } = page;
  if (id && id === page.s.current && before && after && before !== after && root.getBoundingClientRect().width > 0) host.openItem("coding", id, after);
}

/** The runtime's roles decide which kinds of round the composer offers. */
function drawIntents(page: Page, result: StateRead) {
  const { L, q } = page, { s } = page;
  const runtime = result.sessions.find(session => session.session_id === s.current)?.runtime_id || result.project_runtime_id;
  const roles = result.runtimes.find(item => item.runtime_id === runtime)?.roles || [];
  const available = (id: string) => Boolean(roles.find(role => role.role_id === id)?.available);
  const option = (value: string) => q<HTMLOptionElement>("[data-coding-intent] option[value=" + value + "]");
  option("parallel").disabled = !available("writers");
  option("collaborate").disabled = !available("coordinator");
  const execute = option("execute"), edit = option("edit");
  execute.disabled = !available("builder");
  execute.textContent = available("builder") ? L("coding.intent.execute") : L("coding.intent.execute-pending");
  edit.disabled = !available("writer");
  edit.textContent = available("writer") ? L("coding.intent.edit") : L("coding.intent.edit-pending");
}

/** The directories the person may run rounds in, as the composer's choice. */
function drawWorkspaces(page: Page, result: StateRead) {
  const { L, q } = page, { s } = page;
  const selected = result.workspaces.find(item => item.workspace_id === s.workspaceId) || result.workspace || (result.workspaces.length === 1 ? result.workspaces[0] : null);
  if (!s.configurations.get(s.current)) s.workspaceId = selected?.workspace_id || "";
  showWorkspace(page, selected?.canonical_path, L("coding.workspace.choose-first"));
  const choice = q<HTMLSelectElement>("[data-coding-workspace-choice]"), key = JSON.stringify(result.workspaces);
  if (choice.dataset.options !== key) {
    choice.replaceChildren(...result.workspaces.map(item => {
      const option = el("option", item.canonical_path);
      option.value = item.workspace_id;
      return option;
    }));
    choice.dataset.options = key;
    choice.value = s.workspaceId;
  }
  if (!q<HTMLDialogElement>("[data-coding-workspace-dialog]").open) choice.value = s.workspaceId;
}

async function readState(page: Page) {
  const { composerModels } = page.refs, { s } = page;
  const before = s.current && s.state.sessions.find(item => item.session_id === s.current)?.title;
  const result = await api<StateRead>(page, "/state");
  s.state = result;
  s.stateLoaded = true;
  retitle(page, s.current, before, s.current && result.sessions.find(item => item.session_id === s.current)?.title);
  composerModels.fill(result.models);
  drawWorkspaces(page, result);
  drawIntents(page, result);
  applyConfiguration(page);
  renderDirectory(page);
  controls(page);
}

/** Reads the project's state (sessions, models, directories); a read asked for while one is under way follows it, once. */
export function refreshState(page: Page): Promise<void> {
  const { s } = page;
  const run = () => {
    const read = readState(page).finally(() => {
      s.stateRead = null;
    });
    s.stateRead = read;
    return read;
  };
  if (!s.stateRead) return run();
  s.stateNext ??= s.stateRead.catch(() => {
    // The read under way failed; the one waiting asks again.
  }).then(() => {
    s.stateNext = null;
    return s.stateRead ?? run();
  });
  return s.stateNext;
}
