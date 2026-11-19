import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { codingIntentOptions } from "../../composer-labels.js";
import { buildEnvironmentChecklistHtml } from "../../recovery-parts.js";
import { el, errorMessage } from "../dom.js";
import { renderDirectory } from "./directory.js";
import { controls } from "./controls.js";
import type { Page } from "./page.js";
import { api, status } from "./request.js";
import { surfaceChanged } from "./select.js";
import type { StateRead } from "./shapes.js";
import { showWorkspace } from "./workspace.js";

/** Puts the session's remembered start (intent, model, directory, effort) back on the composer. */
export function applyConfiguration(page: Page) {
  const { q } = page, { composerModels } = page.refs, { s } = page;
  const config = s.configurations.get(s.current), unstarted = !s.runtimeSessionId && !s.allRuns.length;
  if (config) {
    const model = unstarted && s.state.models[0];
    const defaultWorkspace = unstarted ? s.state.workspace?.workspace_id || (s.state.workspaces?.length === 1 ? s.state.workspaces[0]!.workspace_id : "") : "";
    s.intent = config.intent || "discuss";
    composerModels.choose(config.provider_id && config.model_id ? JSON.stringify([config.provider_id, config.model_id]) : model ? JSON.stringify([model.provider_id, model.model_id]) : "");
    s.workspaceId = config.workspace_id || defaultWorkspace;
    composerModels.apply(config);
  }
  s.worktree = config?.worktree ?? null;
  // A session pointed at one of the Host's worktrees names that worktree: it is where its next round runs.
  const workspace = s.state.workspaces?.find(item => item.workspace_id === s.workspaceId);
  showWorkspace(page, workspace ? s.worktree?.canonical_path ?? workspace.canonical_path : undefined, s.workspaceId ? uiText.text("coding.workspace.unavailable") : uiText.text("coding.workspace.choose-first"));
  if (!q<HTMLDialogElement>("[data-coding-workspace-dialog]").open) q<HTMLSelectElement>("[data-coding-workspace-choice]").value = s.workspaceId;
}

/** Keeps what the composer is set to as the open session's start. */
export function rememberConfiguration(page: Page) {
  const { composerModels, draft } = page.refs, { s } = page;
  if (!draft.owns(s.current)) return;
  const [provider, model] = JSON.parse(composerModels.value() || "[]") as [string?, string?];
  const writers = s.configurations.get(s.current)?.writer_assignments;
  s.configurations.set(s.current, {
    intent: s.intent, provider_id: provider || "", model_id: model || "", ...composerModels.effort(), workspace_id: s.workspaceId, ...(writers ? { writer_assignments: writers } : {}),
    ...(s.worktree ? { worktree: s.worktree } : {}),
  });
}

/** The person changed what the next round starts with (the way of working, the model, its effort): kept as the session's start and saved. */
export function configurationChanged(page: Page) {
  const { readText, refs, s } = page, id = s.current;
  rememberConfiguration(page);
  controls(page);
  void refs.draft.flush().then(() => surfaceChanged(page, id)).catch(error => status(page, readText("coding.configuration.unsaved", { reason: errorMessage(error) }), true));
}

/** The next round's way of working, chosen in the bar, by a command or by a suggestion on the welcome. */
export function chooseIntent(page: Page, value: string) {
  if (page.s.intent === value) return;
  page.s.intent = value;
  configurationChanged(page);
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
export function drawIntents(page: Page, result: StateRead) {
  const { readText, s } = page;
  const runtime = result.sessions.find(session => session.session_id === s.current)?.runtime_id || result.project_runtime_id;
  const roles = result.runtimes.find(item => item.runtime_id === runtime)?.roles || [];
  const needs: Readonly<Record<string, string>> = { parallel: "writers", collaborate: "coordinator", execute: "builder", edit: "writer" };
  s.intents = codingIntentOptions(readText, intent => !needs[intent] || Boolean(roles.find(role => role.role_id === needs[intent])?.available));
}

/** The directories the person may run rounds in, as the composer's choice. */
function drawWorkspaces(page: Page, result: StateRead) {
  const { q } = page, { s } = page;
  const prevWorking = s.workspaceId || "";
  const selected = result.workspaces.find(item => item.workspace_id === s.workspaceId) || result.workspace || (result.workspaces.length === 1 ? result.workspaces[0] : null);
  const config = s.current ? s.configurations.get(s.current) : undefined;
  if (!config) s.workspaceId = selected?.workspace_id || "";
  else if (!s.runtimeSessionId && !s.allRuns.length) {
    const model = result.models[0], workspace = !config.workspace_id && selected?.workspace_id, pickModel = !config.provider_id && !config.model_id && model;
    if (workspace || pickModel) {
      const id = s.current;
      s.configurations.set(id, { ...config, ...(workspace ? { workspace_id: workspace } : {}), ...(pickModel ? { provider_id: model.provider_id, model_id: model.model_id } : {}) });
      void page.refs.draft.flush().then(() => surfaceChanged(page, id)).catch(() => {});
    }
  }
  showWorkspace(page, selected?.canonical_path, uiText.text("coding.workspace.choose-first"));
  const choice = q<HTMLSelectElement>("[data-coding-workspace-choice]"), key = JSON.stringify(result.workspaces);
  const workspacesChanged = choice.dataset.options !== key;
  if (workspacesChanged) {
    choice.replaceChildren(...result.workspaces.map(item => {
      const option = el("option", item.canonical_path);
      option.value = item.workspace_id;
      return option;
    }));
    choice.dataset.options = key;
    choice.value = s.workspaceId;
  }
  if (!q<HTMLDialogElement>("[data-coding-workspace-dialog]").open) choice.value = s.workspaceId;
  if (workspacesChanged || prevWorking !== s.workspaceId) page.refs.filesFace?.follow(s.workspaceId);
}

export function drawEnvironmentReadiness(page: Page, readiness: StateRead["environment_readiness"]) {
  const { s, turns } = page;
  const welcoming = turns.hasAttribute("data-coding-welcoming");
  const matchesSelected = Boolean(readiness) && !s.worktree && (!s.workspaceId || readiness?.workspace_id === s.workspaceId);
  if (welcoming) {
    const html = matchesSelected ? buildEnvironmentChecklistHtml(readiness) : "";
    let box = turns.querySelector<HTMLElement>(":scope > [data-coding-env-checklist]");
    if (!html) {
      box?.remove();
      return;
    }
    if (!box) {
      box = el("div", "", "coding-env-checklist");
      box.dataset.codingEnvChecklist = "";
      turns.append(box);
    }
    if (box.dataset.html !== html) {
      box.dataset.html = html;
      box.innerHTML = html;
    }
    return;
  }
  turns.querySelector(":scope > [data-coding-env-checklist]")?.remove();
  const last = s.lastRun;
  const block = [...turns.querySelectorAll<HTMLElement>(":scope > [data-run]")].find(node => node.dataset.run === last?.ref.run_id);
  turns.querySelectorAll("[data-run] > [data-coding-env-checklist]").forEach(node => { if (node.parentElement !== block) node.remove(); });
  if (!block || !last) return;
  let mounted = block.querySelector<HTMLElement>(":scope > [data-coding-env-checklist]");
  const matchesLastRun = Boolean(readiness)
    && last?.frozen?.directories?.execution.kind !== "worktree"
    && (!last?.frozen?.directory?.canonical_path || !readiness?.canonical_path || last.frozen.directory.canonical_path === readiness.canonical_path);
  const html = matchesLastRun ? buildEnvironmentChecklistHtml(readiness) : "";
  if (!html) {
    mounted?.remove();
    return;
  }
  if (!mounted) {
    mounted = el("div", "", "coding-env-checklist");
    mounted.dataset.codingEnvChecklist = "";
  }
  const user = block.querySelector(":scope > [data-kind=user]");
  if (user ? user.nextElementSibling !== mounted : block.firstElementChild !== mounted) {
    if (user) user.after(mounted); else block.prepend(mounted);
  }
  if (mounted.dataset.html !== html) {
    mounted.dataset.html = html;
    mounted.innerHTML = html;
  }
}

async function readState(page: Page) {
  const { composerModels } = page.refs, { s } = page;
  const before = s.current && s.state.sessions.find(item => item.session_id === s.current)?.title;
  const defaultOutput = s.state.workspaces?.find(item => Array.isArray(item.roles) && item.roles.includes("output"))?.workspace_id;
  const path = s.workspaceId && s.workspaceId !== defaultOutput ? "/state?workspace_id=" + encodeURIComponent(s.workspaceId) : "/state";
  const result = await api<StateRead>(page, path);
  s.state = result;
  s.stateLoaded = true;
  retitle(page, s.current, before, s.current && result.sessions.find(item => item.session_id === s.current)?.title);
  composerModels.fill(result.models);
  if (s.current && !s.configurations.get(s.current) && !composerModels.value() && result.models[0]) {
    composerModels.choose(JSON.stringify([result.models[0].provider_id, result.models[0].model_id]));
  }
  drawWorkspaces(page, result);
  drawIntents(page, result);
  applyConfiguration(page);
  drawEnvironmentReadiness(page, result.environment_readiness);
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
