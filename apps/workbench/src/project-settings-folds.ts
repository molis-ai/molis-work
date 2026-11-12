import { renderInteractionOptions } from "@molis-ai/molis-work-design-system";
import { t as uiText, icon as uiIcon, renderAlert, renderButton, renderStatusMark } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";

/** Standalone hub / embed fold stack. Workbench exclusive settings use project-settings-stage. */
export type ProjectSettingsFoldId = "general" | "workspaces" | "guidance" | "memory" | "knowledge" | "plugins" | "kit" | "grants" | "rules" | "planning";

export interface ProjectSettingsFoldProject {
  project_id: string;
  display_name: string;
  data_class?: "user" | "regenerable_demo";
  database_path?: string;
  source?: "created";
  plugin_requirements?: readonly { plugin_id: string; installed: boolean }[];
}

interface ProjectSettingsFoldContent {
  html?: string;
  embedSrc?: string;
}

interface ProjectSettingsFoldsPrimitives {
  readText(text: string, values?: Record<string, string | number>): string;
  escapeHtml(value: unknown): string;
  icon(name: Extract<PluginIconName, "settings" | "book" | "shield" | "workflow" | "chevron-right" | "chevron-down" | "tree" | "plus">, className?: string): string;
  withDesktopQuery(path: string): string;
  projectDeletionLabels?(): readonly string[];
}

function renderMissingPlugins(project: ProjectSettingsFoldProject, { escapeHtml }: Pick<ProjectSettingsFoldsPrimitives, "readText" | "escapeHtml">): string {
  const missing = (project.plugin_requirements ?? []).filter(plugin => !plugin.installed);
  if (!missing.length) return "";
  return `<section class="settings-section" data-project-missing-plugins><h2>${uiText("workbench.project-settings-folds.missing-plugins")}</h2>${missing.map(plugin => `<div class="settings-setting-row"><span class="setting-copy"><strong>${(plugin.plugin_id.match(/.{1,24}/gu) ?? []).map(escapeHtml).join("<wbr>")}</strong><span>${uiText("workbench.project-settings-folds.install-plugin-device-synced-content-kept")}</span></span><div class="setting-value">${renderStatusMark({ label: uiText.text("workbench.project-settings-folds.not-installed"), plain: true })}</div></div>`).join("")}</section>`;
}

/**
 * The one question the dialog asks when the project's default output directory still has files (design 05-materials-directories, A3,
 * user 2026-11-08): the two option cards are the confirmation, so the checkbox goes while it shows. Hidden until delete-scope says
 * `has_files`; empty or unreadable folders are not asked about and stay (SSC-23).
 */
function renderDeleteOutputQuestion(project: ProjectSettingsFoldProject, { escapeHtml }: Pick<ProjectSettingsFoldsPrimitives, "readText" | "escapeHtml">): string {
  const id = `project-delete-output-${project.project_id}`;
  const options = [
    { value: "keep", label: uiText.text("workbench.project-settings-folds.delete-project-keep-files"), description: uiText.text("workbench.project-settings-folds.default-output-folder-stays-mac-after-deleting-ll") },
    { value: "delete", label: uiText.text("workbench.project-settings-folds.delete-project-files"), description: uiText.text("workbench.project-settings-folds.default-output-folder-goes-its-files-including-code") },
  ];
  return `<div class="project-delete-output" data-project-delete-output hidden><p class="project-delete-output__ask" id="${escapeHtml(id)}-label">${uiText("workbench.project-settings-folds.default-output-folder-still-has-files-what-should")}</p>${
    renderInteractionOptions(options, { id, labelledBy: `${id}-label` })}<p class="project-delete-output__say">${uiText("workbench.project-settings-folds.both-delete-project-good-can-t-be-undone")}</p></div>`;
}

/** The delete dialog of a project's settings: its question, the busy refusal's way out, and where kept files stay. */
function renderProjectDeleteDialog(project: ProjectSettingsFoldProject, desktopShell: boolean, primitives: ProjectSettingsFoldsPrimitives): string {
  const { escapeHtml, withDesktopQuery } = primitives;
  if (project.data_class === "regenerable_demo") return "";
  const directoryHref = desktopShell ? withDesktopQuery("/") : "/";
  const labels = primitives.projectDeletionLabels?.().join(uiText.text("workbench.project-deletion.separator")) ?? "";
  return `<dialog class="runtime-plan-dialog project-delete-dialog" data-project-delete-dialog aria-labelledby="project-delete-dialog-title-${escapeHtml(project.project_id)}" aria-describedby="project-delete-description-${escapeHtml(project.project_id)}">
    <form class="runtime-plan-shell" data-project-delete="${escapeHtml(project.project_id)}" data-project-directory-href="${directoryHref}">
      <header><div><h2 id="project-delete-dialog-title-${escapeHtml(project.project_id)}">${uiText("workbench.project-settings-folds.delete-project")}</h2><p translate="no">${escapeHtml(project.display_name)}</p></div></header>
      <div class="runtime-plan-body"><p id="project-delete-description-${escapeHtml(project.project_id)}">${uiText("workbench.project-settings-folds.delete-project-data")}</p><p class="mw-field__hint" data-project-delete-scope>${uiText("workbench.project-settings-folds.data-that-plugins-keep-project-deleted")}<br><span id="project-delete-owners-${escapeHtml(project.project_id)}" translate="no">${escapeHtml(labels)}</span></p>${renderDeleteOutputQuestion(project, primitives)}<label class="runtime-plan-confirm" data-project-delete-confirm><input type="checkbox" name="delete_confirmed"><span>${uiText("workbench.project-settings-folds.i-confirm-that-i-want-delete-project-understand")}</span></label>${renderAlert({
        title: uiText.text("workbench.project-settings-folds.these-files-can-t-be-deleted-cleanly-right"), tone: "warning", state: "answer", role: "alert", className: "project-delete-busy", attrs: { "data-project-delete-busy": true, hidden: true },
        body: uiText.text("workbench.project-settings-folds.project-still-has-tasks-running-queued-they-may"),
        actions: [{ label: uiText.text("workbench.project-settings-folds.keep-files-instead"), variant: "secondary", attrs: { "data-project-delete-keep-instead": true } }] })}<p class="settings-form-error" data-project-delete-error role="alert" hidden></p></div>
      <div class="runtime-plan-body project-delete-kept" data-project-delete-kept hidden><div class="project-delete-kept__box"><div class="project-delete-kept__title">${uiIcon("folder")}<span>${uiText("workbench.project-settings-folds.default-output-folder-stays-mac")}</span></div>
        <div class="project-delete-kept__path"><code data-project-delete-kept-path></code>${renderButton({ label: uiText.text("workbench.project-settings-folds.copy-location"), icon: "copy", variant: "secondary", size: "sm", attrs: { "data-project-delete-copy": true } })}</div></div>
        <p data-project-delete-kept-note>${uiText("workbench.project-settings-folds.folder-named-project-s-number-molis-work-won")}</p></div>
      <footer data-project-delete-actions><button class="mw-btn mw-btn--secondary" type="button" data-project-delete-cancel autofocus>${uiText("common.control.cancel")}</button><button class="mw-btn mw-btn--danger project-delete-button" type="submit" disabled>${uiText("workbench.project-settings-folds.confirm-project-deletion")}</button></footer>
      <footer data-project-delete-done hidden><a class="mw-btn mw-btn--primary" href="${directoryHref}" data-project-delete-home>${uiText("workbench.project-settings-folds.back-projects")}</a></footer>
    </form>
  </dialog>`;
}

export function createProjectSettingsFolds(primitives: ProjectSettingsFoldsPrimitives) {
  const { escapeHtml, icon } = primitives;

  function projectKindLong(project: ProjectSettingsFoldProject): string {
    if (project.data_class === "regenerable_demo") return uiText.text("workbench.project-settings-folds.demo-data-can-be-rebuilt-any-time-not");
    return uiText.text("workbench.project-settings-folds.user-data-created-molis-work");
  }

  function renderFold(
    id: Exclude<ProjectSettingsFoldId, "general">,
    title: string,
    content: ProjectSettingsFoldContent,
    open: boolean,
  ): string {
    const embed = content.embedSrc ? ` data-settings-embed="${escapeHtml(content.embedSrc)}"` : "";
    const body = content.html ?? "";
    return `<details class="project-settings-fold mw-collapsible" data-settings-fold="${id}"${embed}${open ? " open" : ""}>
      <summary><strong>${title}</strong><span class="project-settings-fold-chevron">${icon("chevron-right")}</span></summary>
      <div class="project-settings-fold-body" data-settings-embed-target>${body}</div>
    </details>`;
  }

  function renderGeneralBody(project: ProjectSettingsFoldProject): string {
    const safe = escapeHtml(project.project_id);
    const storage = project.database_path
      ? `<dl class="project-manager-storage"><div><dt>${uiText("workbench.project-settings-folds.project-id")}</dt><dd>${safe}</dd></div><div><dt>${uiText("workbench.project-settings-folds.data-file")}</dt><dd>${escapeHtml(project.database_path)}</dd></div></dl>`
      : "";
    return `<section class="project-settings-identity" data-settings-fold="general">
      <form class="inline-settings-form" data-project-rename="${safe}" data-project-observed-name="${escapeHtml(project.display_name)}">
        <label>${uiText("workbench.project-settings-folds.project-name")}<input name="display_name" type="text" value="${escapeHtml(project.display_name)}" required maxlength="160"></label>
        <button class="mw-btn mw-btn--primary" type="submit">${uiText("workbench.project-settings-folds.save-name")}</button>
        <p class="settings-form-error" role="alert" hidden></p>
      </form>
      ${storage ? `<details class="form-disclosure"><summary>${uiText("workbench.project-settings-folds.local-data-location")}</summary>${storage}</details>` : ""}
    </section>`;
  }

  function renderGeneralPage(project: ProjectSettingsFoldProject, desktopShell = false): string {
    const safe = escapeHtml(project.project_id);
    return `<section class="project-settings-page" data-project-pane="${safe}" data-settings-panel="general">
      <header class="settings-page-heading"><h1>${uiText("workbench.project-settings-folds.general")}</h1><p>${uiText("workbench.project-settings-folds.manage-project-name-data-stored-device")}</p></header>
      <section class="settings-section" aria-label="${uiText("workbench.project-settings-folds.project-information")}">
        <form class="settings-setting-row project-name-form" data-project-rename="${safe}" data-project-observed-name="${escapeHtml(project.display_name)}">
          <label class="setting-copy" for="project-display-name"><strong>${uiText("workbench.project-settings-folds.project-name")}</strong><span>${uiText("workbench.project-settings-folds.shown-project-lists-navigation-workspace")}</span></label>
          <div class="setting-value"><input id="project-display-name" name="display_name" type="text" value="${escapeHtml(project.display_name)}" required maxlength="160"><button class="mw-btn mw-btn--secondary" type="submit">${uiText("workbench.project-settings-folds.save-name")}</button></div>
          <p class="settings-form-error" role="alert" hidden></p>
        </form>
        <details class="settings-data-disclosure"><summary><span class="setting-copy"><strong>${uiText("workbench.project-settings-folds.local-data")}</strong><span>${uiText("workbench.project-settings-folds.view-project-id-database-location")}</span></span>${icon("chevron-down")}</summary><dl class="settings-data-list"><div><dt>${uiText("workbench.project-settings-folds.project-id")}</dt><dd>${safe}</dd></div>${project.database_path ? `<div><dt>${uiText("workbench.project-settings-folds.data-file")}</dt><dd>${escapeHtml(project.database_path)}</dd></div>` : ""}</dl></details>
      </section>
      ${renderMissingPlugins(project, primitives)}
      <section class="settings-section" data-project-runtime data-runtime-prefix="/projects/${encodeURIComponent(project.project_id)}" hidden>
        <div class="settings-setting-row"><label class="setting-copy" for="project-runtime"><strong>${uiText("workbench.project-settings-folds.agent-runtime")}</strong><span>${uiText("workbench.project-settings-folds.which-runtime-project-s-new-sessions-run-default")}</span></label>
          <div class="setting-value"><select id="project-runtime"></select></div><p class="settings-form-error" role="alert" hidden></p></div>
      </section>
      <section class="settings-section settings-project-maintenance"><h2>${uiText("workbench.project-settings-folds.project-management")}</h2>${renderDanger(project)}</section>
      ${renderProjectDeleteDialog(project, desktopShell, primitives)}
    </section>`;
  }

  function renderDanger(project: ProjectSettingsFoldProject): string {
    const safe = escapeHtml(project.project_id);
    if (project.data_class === "regenerable_demo") {
      return `<section class="project-manager-danger" aria-labelledby="project-demo-title-${safe}">
        <h3 id="project-demo-title-${safe}">${uiText("workbench.project-settings-folds.rebuild-delete-demo")}</h3>
        <p>${uiText("workbench.project-settings-folds.rebuild-clears-changes-made-demo-delete-only-removes")}</p>
        <p class="settings-form-error" data-demo-error role="alert" hidden></p>
        <div class="project-manager-danger-actions"><button class="mw-btn mw-btn--secondary" type="button" data-demo-action="reset">${uiText("workbench.project-settings-folds.rebuild-demo")}</button><button class="mw-btn mw-btn--danger" type="button" data-demo-action="remove">${uiText("workbench.project-settings-folds.delete-demo")}</button></div>
      </section>`;
    }
    return `<section class="project-manager-danger">
      <button class="mw-btn mw-btn--link project-delete-quiet" type="button" data-project-delete-open>${uiText("workbench.project-settings-folds.delete-project")}</button>
    </section>`;
  }

  function renderProjectSettingsHero(
    project: ProjectSettingsFoldProject,
    options: { headingTag?: "h1" | "h2"; showOpenTree?: boolean; hint?: string } = {},
  ): string {
    const headingTag = options.headingTag ?? "h2";
    const safe = escapeHtml(project.project_id);
    const href = `/projects/${encodeURIComponent(project.project_id)}`;
    const open = options.showOpenTree === false
      ? ""
      : `<a class="mw-btn mw-btn--primary" href="${href}/">${icon("tree")}<span>${uiText("workbench.project-settings-folds.open-workbench")}</span></a>`;
    const title = `<${headingTag} id="project-pane-title-${safe}">${escapeHtml(project.display_name)}</${headingTag}>`;
    return `<header class="project-manager-hero">
      <div>
        ${options.hint ? `<div class="settings-heading-title">${title}${options.hint}</div>` : title}
        <p>${projectKindLong(project)}</p>
      </div>
      ${open}
    </header>`;
  }

  function renderProjectSettingsStack(
    project: ProjectSettingsFoldProject,
    options: {
      open?: ProjectSettingsFoldId;
      general: ProjectSettingsFoldContent;
      guidance: ProjectSettingsFoldContent;
      rules: ProjectSettingsFoldContent;
      planning: ProjectSettingsFoldContent;
      desktopShell?: boolean;
      headingTag?: "h1" | "h2";
      showOpenTree?: boolean;
      includeDeleteDialog?: boolean;
    },
  ): string {
    const open = options.open ?? "general";
    const identity = options.general.html ?? renderGeneralBody(project);
    const stack = `<div class="project-settings-document">
      ${renderProjectSettingsHero(project, { headingTag: options.headingTag, showOpenTree: options.showOpenTree })}
      ${identity}
      <div class="project-settings-stack mw-accordion" data-slot="accordion" role="region" aria-label="${uiText("workbench.project-settings-folds.project-settings")}">
        ${renderFold("guidance", uiText.text("workbench.project-settings-folds.project-guidance"), options.guidance, open === "guidance")}
        ${renderFold("rules", uiText.text("workbench.project-settings-folds.work-rules"), options.rules, open === "rules")}
        ${renderFold("planning", uiText.text("workbench.project-settings-folds.work-planning"), options.planning, open === "planning")}
      </div>
      ${renderDanger(project)}
    </div>`;
    const dialog = options.includeDeleteDialog === false ? "" : renderProjectDeleteDialog(project, options.desktopShell === true, primitives);
    return `${stack}${dialog}`;
  }

  return {
    renderGeneralBody,
    renderGeneralPage,
    renderDanger,
    renderProjectDeleteDialog: (project: ProjectSettingsFoldProject, desktopShell: boolean) => renderProjectDeleteDialog(project, desktopShell, primitives),
    renderProjectSettingsHero,
    renderProjectSettingsStack,
  };
}
