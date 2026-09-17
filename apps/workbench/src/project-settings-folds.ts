import type { MolisWorkIcon } from "@molis-ai/molis-work-design-system";

/** Standalone hub / embed fold stack. Workbench exclusive settings use project-settings-stage. */
export type ProjectSettingsFoldId = "general" | "guidance" | "rules" | "planning";

export interface ProjectSettingsFoldProject {
  project_id: string;
  display_name: string;
  data_class?: "user" | "regenerable_demo";
  database_path?: string;
  source?: "created";
}

export interface ProjectSettingsFoldContent {
  html?: string;
  embedSrc?: string;
}

export interface ProjectSettingsFoldsPrimitives {
  L(text: string, values?: Record<string, string | number>): string;
  escapeHtml(value: unknown): string;
  icon(name: Extract<MolisWorkIcon, "settings" | "book" | "shield" | "workflow" | "chevron-right" | "chevron-down" | "tree" | "plus">, className?: string): string;
  withDesktopQuery(path: string): string;
}

export function createProjectSettingsFolds(primitives: ProjectSettingsFoldsPrimitives) {
  const { L, escapeHtml, icon, withDesktopQuery } = primitives;

  function projectKindLong(project: ProjectSettingsFoldProject): string {
    if (project.data_class === "regenerable_demo") return L("演示数据 · 可随时重建，不属于用户项目");
    return L("用户数据 · 在 Molis Work 中创建");
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
      ? `<dl class="project-manager-storage"><div><dt>${L("项目 ID")}</dt><dd>${safe}</dd></div><div><dt>${L("数据文件")}</dt><dd>${escapeHtml(project.database_path)}</dd></div></dl>`
      : "";
    return `<section class="project-settings-identity" data-settings-fold="general">
      <form class="inline-settings-form" data-project-rename="${safe}">
        <label>${L("项目名称")}<input name="display_name" type="text" value="${escapeHtml(project.display_name)}" required maxlength="160"></label>
        <button class="mw-btn mw-btn--primary" type="submit">${L("保存名称")}</button>
        <p class="settings-form-error" role="alert" hidden></p>
      </form>
      ${storage ? `<details class="form-disclosure"><summary>${L("本地数据位置")}</summary>${storage}</details>` : ""}
    </section>`;
  }

  function renderGeneralPage(project: ProjectSettingsFoldProject, desktopShell = false): string {
    const safe = escapeHtml(project.project_id);
    return `<section class="project-settings-page" data-project-pane="${safe}" data-settings-panel="general">
      <header class="settings-page-heading"><h1>${L("常规")}</h1><p>${L("管理项目名称和保存在本机的数据。")}</p></header>
      <section class="settings-section" aria-label="${L("项目信息")}">
        <form class="settings-setting-row project-name-form" data-project-rename="${safe}">
          <label class="setting-copy" for="project-display-name"><strong>${L("项目名称")}</strong><span>${L("显示在项目列表、目录和工作区中。")}</span></label>
          <div class="setting-value"><input id="project-display-name" name="display_name" type="text" value="${escapeHtml(project.display_name)}" required maxlength="160"><button class="mw-btn mw-btn--secondary" type="submit">${L("保存名称")}</button></div>
          <p class="settings-form-error" role="alert" hidden></p>
        </form>
        <details class="settings-data-disclosure"><summary><span class="setting-copy"><strong>${L("本地数据")}</strong><span>${L("查看项目标识与数据库位置。")}</span></span>${icon("chevron-down")}</summary><dl class="settings-data-list"><div><dt>${L("项目 ID")}</dt><dd>${safe}</dd></div>${project.database_path ? `<div><dt>${L("数据文件")}</dt><dd>${escapeHtml(project.database_path)}</dd></div>` : ""}</dl></details>
      </section>
      <section class="settings-section settings-project-maintenance"><h2>${L("项目管理")}</h2>${renderDanger(project)}</section>
      ${renderProjectDeleteDialog(project, desktopShell)}
    </section>`;
  }

  function renderDanger(project: ProjectSettingsFoldProject): string {
    const safe = escapeHtml(project.project_id);
    if (project.data_class === "regenerable_demo") {
      return `<section class="project-manager-danger" aria-labelledby="project-demo-title-${safe}">
        <h3 id="project-demo-title-${safe}">${L("重建或删除 demo")}</h3>
        <p>${L("重建会清除你在 demo 中做的改动；删除只移除这个可重建项目，不影响用户项目。")}</p>
        <p class="settings-form-error" data-demo-error role="alert" hidden></p>
        <div class="project-manager-danger-actions"><button class="mw-btn mw-btn--secondary" type="button" data-demo-action="reset">${L("重建 demo")}</button><button class="mw-btn mw-btn--danger" type="button" data-demo-action="remove">${L("删除 demo")}</button></div>
      </section>`;
    }
    return `<section class="project-manager-danger">
      <button class="mw-btn mw-btn--link project-delete-quiet" type="button" data-project-delete-open>${L("删除项目")}</button>
    </section>`;
  }

  function renderProjectDeleteDialog(project: ProjectSettingsFoldProject, desktopShell: boolean): string {
    if (project.data_class === "regenerable_demo") return "";
    const directoryHref = desktopShell ? withDesktopQuery("/") : "/";
    return `<dialog class="runtime-plan-dialog project-delete-dialog" data-project-delete-dialog aria-labelledby="project-delete-dialog-title-${escapeHtml(project.project_id)}" aria-describedby="project-delete-description-${escapeHtml(project.project_id)}">
      <form class="runtime-plan-shell" data-project-delete="${escapeHtml(project.project_id)}" data-project-directory-href="${directoryHref}">
        <header><div><h2 id="project-delete-dialog-title-${escapeHtml(project.project_id)}">${L("删除项目")}</h2><p>${escapeHtml(project.display_name)}</p></div></header>
        <div class="runtime-plan-body"><p id="project-delete-description-${escapeHtml(project.project_id)}">${L("永久删除这个项目在 Molis Work 中的目标、记录和关联。关联工作目录中的代码和文件会保留。")}</p><label class="runtime-plan-confirm"><input type="checkbox" name="delete_confirmed"><span>${L("我确认删除这个项目，且理解此操作无法撤销。")}</span></label><p class="settings-form-error" data-project-delete-error role="alert" hidden></p></div>
        <footer><button class="mw-btn mw-btn--secondary" type="button" data-project-delete-cancel autofocus>${L("取消")}</button><button class="mw-btn mw-btn--danger project-delete-button" type="submit" disabled>${L("确认删除项目")}</button></footer>
      </form>
    </dialog>`;
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
      : `<a class="mw-btn mw-btn--primary" href="${href}/">${icon("tree")}<span>${L("打开工作台")}</span></a>`;
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
      <div class="project-settings-stack mw-accordion" data-slot="accordion" role="region" aria-label="${L("项目设置")}">
        ${renderFold("guidance", L("项目说明"), options.guidance, open === "guidance")}
        ${renderFold("rules", L("工作规则"), options.rules, open === "rules")}
        ${renderFold("planning", L("工作规划"), options.planning, open === "planning")}
      </div>
      ${renderDanger(project)}
    </div>`;
    const dialog = options.includeDeleteDialog === false ? "" : renderProjectDeleteDialog(project, options.desktopShell === true);
    return `${stack}${dialog}`;
  }

  return {
    renderGeneralBody,
    renderGeneralPage,
    renderDanger,
    renderProjectDeleteDialog,
    renderProjectSettingsHero,
    renderProjectSettingsStack,
  };
}
