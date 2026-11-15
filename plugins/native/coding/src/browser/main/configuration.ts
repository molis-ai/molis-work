import { renderEnvChecklist, type MwEnvCheckRowOptions, t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { setContentHtml } from "@molis-ai/molis-work-plugin-sdk/browser";
import { codingIntentOptions } from "../../composer-labels.js";
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
  const config = s.configurations.get(s.current);
  if (config) {
    s.intent = config.intent || "discuss";
    composerModels.choose(config.provider_id && config.model_id ? JSON.stringify([config.provider_id, config.model_id]) : "");
    s.workspaceId = config.workspace_id ?? "";
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
  if (!s.configurations.get(s.current)) s.workspaceId = selected?.workspace_id || "";
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

export function buildEnvironmentChecklistHtml(readiness: StateRead["environment_readiness"]): string {
  if (!readiness || !readiness.workspace_id) return "";
  const rows: MwEnvCheckRowOptions[] = [];
  const branch = readiness.branch || uiText.text("coding.env.git.detached");
  if (!readiness.is_git_repo) {
    rows.push({ state: "idle", label: uiText.text("coding.env.row.git"), value: uiText.text("coding.env.git.not-repo-detail") });
  } else if (readiness.git_conflicted_count > 0 || readiness.git_merging) {
    rows.push({
      state: "failed",
      label: uiText.text("coding.env.row.git"),
      value: uiText.text("coding.env.git.conflict", { branch, count: readiness.git_conflicted_count }),
      badge: { label: uiText.text("coding.env.badge.missing"), tone: "danger" },
      recovery: {
        tone: "danger",
        title: uiText.text("coding.env.recovery.conflict-title"),
        body: uiText.text("coding.env.recovery.conflict-body"),
        actions: [
          { label: uiText.text("coding.env.action.open-files"), variant: "secondary", attrs: { "data-coding-env-action": "open-files" } },
          { label: uiText.text("coding.env.action.switch-workspace"), variant: "ghost", attrs: { "data-coding-env-action": "open-workspace" } },
        ],
      },
    });
  } else if (readiness.dirty_count > 0) {
    rows.push({
      state: "partial",
      label: uiText.text("coding.env.row.git"),
      value: uiText.text("coding.env.git.dirty", { branch, count: readiness.dirty_count }),
      badge: { label: uiText.text("coding.env.badge.pre-existing"), tone: "warning" },
    });
  } else {
    rows.push({
      state: "done",
      label: uiText.text("coding.env.row.git"),
      value: uiText.text("coding.env.git.clean", { branch }),
      status: { label: uiText.text("coding.env.badge.ready"), tone: "done" },
    });
  }
  if (!readiness.deps_manager) {
    rows.push({ state: "idle", label: uiText.text("coding.env.row.deps"), value: uiText.text("coding.env.deps-none") });
  } else if (readiness.deps_manager === "cargo") {
    rows.push({ state: "done", label: uiText.text("coding.env.row.deps"), value: uiText.text("coding.env.deps.cargo-ok"), status: { label: uiText.text("coding.env.badge.ready"), tone: "done" } });
  } else if (readiness.deps_manager === "python") {
    rows.push({
      state: readiness.deps_installed ? "done" : "idle",
      label: uiText.text("coding.env.row.deps"),
      value: readiness.deps_installed ? uiText.text("coding.env.deps.python-ok") : uiText.text("coding.env.deps.python-info"),
      ...(readiness.deps_installed ? { status: { label: uiText.text("coding.env.badge.ready"), tone: "done" } } : { badge: { label: uiText.text("coding.env.badge.missing"), tone: "neutral" } }),
    });
  } else if (readiness.deps_installed) {
    rows.push({
      state: "done",
      label: uiText.text("coding.env.row.deps"),
      value: uiText.text("coding.env.deps.node-ok", { manifest: readiness.deps_manager }),
      status: { label: uiText.text("coding.env.badge.ready"), tone: "done" },
    });
  } else {
    rows.push({
      state: "verify",
      label: uiText.text("coding.env.row.deps"),
      value: uiText.text("coding.env.deps.node-missing", { manifest: readiness.deps_manager }),
      badge: { label: uiText.text("coding.env.badge.missing"), tone: "warning" },
      recovery: {
        tone: "warning",
        title: uiText.text("coding.env.recovery.deps-title"),
        body: uiText.text("coding.env.recovery.deps-body"),
        actions: [
          { label: uiText.text("coding.env.action.prepare-deps"), variant: "secondary", attrs: { "data-coding-env-action": "install-deps", "data-manifest": readiness.deps_manager } },
        ],
      },
    });
  }
  if (readiness.package_json_invalid) {
    rows.push({
      state: "verify",
      label: uiText.text("coding.env.row.scripts"),
      value: uiText.text("coding.env.scripts.invalid-pkg"),
      badge: { label: uiText.text("coding.env.badge.missing"), tone: "warning" },
    });
  } else if (readiness.script_names.length) {
    const scripts = uiText.text("coding.env.scripts.summary", { scripts: readiness.script_names.join(", ") });
    const scriptsValue = readiness.ports.length
      ? uiText.text("coding.env.scripts.summary-ports", { scripts, ports: uiText.text("coding.env.scripts.ports", { ports: readiness.ports.join(", ") }) })
      : scripts;
    rows.push({
      state: "done",
      label: uiText.text("coding.env.row.scripts"),
      value: scriptsValue,
      status: { label: uiText.text("coding.env.badge.ready"), tone: "done" },
    });
  }
  const hasBaselineTest = readiness.script_names.includes("test") || readiness.deps_manager === "cargo";
  const baselineCmd = readiness.deps_manager === "cargo"
    ? "cargo test"
    : readiness.deps_manager === "pnpm"
      ? "pnpm test"
      : readiness.deps_manager === "yarn"
        ? "yarn test"
        : readiness.deps_manager === "bun"
          ? "bun test"
          : "npm test";
  if (hasBaselineTest) {
    const blockedByDeps = Boolean(readiness.deps_manager && !readiness.deps_installed && readiness.deps_manager !== "cargo");
    rows.push(blockedByDeps
      ? {
          state: "idle",
          label: uiText.text("coding.env.row.baseline"),
          value: uiText.text("coding.env.baseline.after-deps", { command: baselineCmd }),
        }
      : {
          state: "ready",
          label: uiText.text("coding.env.row.baseline"),
          value: uiText.text("coding.env.baseline.ready", { command: baselineCmd }),
          status: { label: uiText.text("coding.env.badge.ready"), tone: "done" },
        });
  }
  if (readiness.env_template) {
    const shownKeys = readiness.env_keys.length > 5
      ? uiText.text("coding.env.vars.more", { keys: readiness.env_keys.slice(0, 5).join(", "), count: readiness.env_keys.length })
      : readiness.env_keys.join(", ");
    if (!readiness.has_local_env && readiness.env_keys.length > 0) {
      rows.push({
        state: "verify",
        label: uiText.text("coding.env.row.env"),
        value: uiText.text("coding.env.vars.missing", { file: readiness.env_template, keys: shownKeys }),
        badge: { label: uiText.text("coding.env.badge.missing"), tone: "warning" },
        recovery: {
          tone: "warning",
          title: uiText.text("coding.env.recovery.env-title"),
          body: uiText.text("coding.env.recovery.env-body", { file: readiness.env_template, keys: shownKeys }),
          actions: [
            { label: uiText.text("coding.env.action.open-files"), variant: "secondary", attrs: { "data-coding-env-action": "open-files" } },
          ],
        },
      });
    } else {
      rows.push({
        state: "done",
        label: uiText.text("coding.env.row.env"),
        value: readiness.has_local_env
          ? uiText.text("coding.env.vars.present", { file: readiness.env_template })
          : uiText.text("coding.env.vars.checked", { file: readiness.env_template }),
        status: { label: uiText.text("coding.env.badge.ready"), tone: "done" },
      });
    }
  }
  if (readiness.worktrees.active > 0) {
    if (readiness.worktrees.problem_count > 0) {
      rows.push({
        state: "verify",
        label: uiText.text("coding.env.row.worktrees"),
        value: uiText.text("coding.env.worktrees.problem", { total: readiness.worktrees.active, problems: readiness.worktrees.problem_count }),
        badge: { label: uiText.text("coding.env.badge.missing"), tone: "warning" },
        recovery: {
          tone: "warning",
          title: uiText.text("coding.env.recovery.worktree-title"),
          body: uiText.text("coding.env.recovery.worktree-body"),
          actions: [
            { label: uiText.text("coding.env.action.open-files"), variant: "secondary", attrs: { "data-coding-env-action": "open-files" } },
          ],
        },
      });
    } else if (readiness.worktrees.cleanup_count > 0) {
      rows.push({
        state: "ready",
        label: uiText.text("coding.env.row.worktrees"),
        value: uiText.text("coding.env.worktrees.cleanup", { total: readiness.worktrees.active }),
      });
    } else {
      rows.push({
        state: "done",
        label: uiText.text("coding.env.row.worktrees"),
        value: uiText.text("coding.env.worktrees.ready", { total: readiness.worktrees.active }),
        status: { label: uiText.text("coding.env.badge.ready"), tone: "done" },
      });
    }
  }
  const attentionCount = rows.filter(row => row.state === "failed" || row.state === "verify").length;
  const canRunBaseline = hasBaselineTest && (!readiness.deps_manager || readiness.deps_installed || readiness.deps_manager === "cargo");
  return renderEnvChecklist({
    title: uiText.text("coding.env.title"),
    statusLabel: attentionCount > 0 ? uiText.text("coding.env.status.attention", { count: attentionCount }) : uiText.text("coding.env.status.ready"),
    statusTone: rows.some(row => row.state === "failed") ? "blocked" : attentionCount > 0 ? "attention" : "done",
    rows,
    footer: {
      title: uiText.text("coding.env.footer.title"),
      detail: uiText.text("coding.env.footer.detail"),
      ...(canRunBaseline ? { action: { label: uiText.text("coding.env.action.run-baseline"), variant: "ghost", attrs: { "data-coding-env-action": "run-baseline", "data-command": baselineCmd } } } : {}),
    },
  });
}

export function drawEnvironmentReadiness(page: Page, readiness: StateRead["environment_readiness"]) {
  page.q("[data-coding-composer]").querySelector("[data-coding-env-bar]")?.remove();
  const mounted = page.turns.querySelector<HTMLElement>("[data-coding-env-checklist]");
  if (!mounted) return;
  const html = buildEnvironmentChecklistHtml(readiness);
  if (!html) {
    mounted.remove();
    return;
  }
  if (mounted.dataset.html !== html) {
    mounted.dataset.html = html;
    setContentHtml(mounted, html);
  }
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
  drawEnvironmentReadiness(page, result.environment_readiness);
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
