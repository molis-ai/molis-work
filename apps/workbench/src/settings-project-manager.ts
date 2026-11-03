import { renderHint } from "@molis-ai/molis-work-design-system";
import { createProjectSettingsFolds } from "./project-settings-folds.js";
import type { SettingsRenderPrimitives } from "./settings-renderer.js";
import type { MolisWorkSettingsView, WebSettingsProject } from "./settings-view.js";

type ProjectManagerPrimitives = Pick<SettingsRenderPrimitives, "L" | "escapeHtml" | "icon" | "withDesktopQuery">;
type ProjectFolds = ReturnType<typeof createProjectSettingsFolds>;

function projectKindShort(project: WebSettingsProject, L: ProjectManagerPrimitives["L"]): string {
  if (project.data_class === "regenerable_demo") return L("演示数据");
  return L("本地项目");
}

function renderProjectDetail(project: WebSettingsProject, selected: boolean, desktopShell: boolean, primitives: ProjectManagerPrimitives, folds: ProjectFolds): string {
  const { L, escapeHtml } = primitives;
  const id = project.project_id;
  const safe = escapeHtml(id);
  const href = `/projects/${encodeURIComponent(id)}`;
  return `<article class="project-manager-detail" data-project-pane="${safe}" data-route-prefix="${href}"${selected ? "" : " hidden"} aria-labelledby="project-pane-title-${safe}">
    ${folds.renderProjectSettingsHero(project, { headingTag: "h2", showOpenTree: true, hint: renderHint({ id: `settings-hint-project-${project.project_id}`, label: L("如何生效"), text: L("项目说明在项目设置中维护。工作规划和工作规则在 Goals 顶栏。") }) })}
    ${folds.renderGeneralBody(project)}
    ${folds.renderDanger(project)}
    ${folds.renderProjectDeleteDialog(project, desktopShell)}
  </article>`;
}

export function renderProjectSettings(view: MolisWorkSettingsView, desktopShell: boolean, primitives: ProjectManagerPrimitives): string {
  const { L, escapeHtml, icon, withDesktopQuery } = primitives;
  const folds = createProjectSettingsFolds({ L, escapeHtml, icon, withDesktopQuery });
  const demo = view.projects.find((project) => project.data_class === "regenerable_demo");
  const selectedId = view.projects[0]?.project_id ?? "create";
  const rows = view.projects.map((project) => {
    const safe = escapeHtml(project.project_id);
    const checked = project.project_id === selectedId ? " checked" : "";
    return `<label class="project-manager-row" data-project-row="${safe}"><input type="radio" name="project-focus" value="${safe}"${checked}><span><strong>${escapeHtml(project.display_name)}</strong><small>${projectKindShort(project, L)}</small></span></label>`;
  }).join("");
  const createChecked = selectedId === "create" ? " checked" : "";
  const details = view.projects.map((project) => renderProjectDetail(project, project.project_id === selectedId, desktopShell, primitives, folds)).join("");
  return `<section class="project-manager" data-project-manager aria-labelledby="settings-title">
    <aside class="project-manager-index">
      <header class="project-manager-index-chrome">
        <h1 id="settings-title">${L("项目")}</h1>
        <p>${L("本机 {count} 个项目", { count: view.projects.length })}</p>
      </header>
      <div class="project-manager-list">
        <div class="project-manager-rows" role="radiogroup" aria-label="${L("选择要配置的项目")}">
          ${rows}
          <input id="project-focus-create" class="project-manager-create-input" type="radio" name="project-focus" value="create"${createChecked}>
        </div>
        ${view.projects.length ? "" : `<p class="project-manager-empty">${L("还没有项目")}</p>`}
      </div>
      <footer class="project-manager-index-actions">
        <label class="project-manager-ghost" for="project-focus-create">${icon("plus")}<span>${L("新建项目")}</span></label>
      </footer>
    </aside>
    <div class="project-manager-stage">
      ${details}
      <article class="project-manager-detail" data-project-pane="create"${selectedId === "create" ? "" : " hidden"} aria-labelledby="create-project-title">
        <header class="project-manager-hero">
          <div>
            <div class="settings-heading-title"><h2 id="create-project-title">${L("创建项目")}</h2>${view.projects.length ? renderHint({ id: "settings-hint-create-project", label: L("如何生效"), text: L("普通用户项目不会被示例操作或普通卸载删除；永久清除用户数据需要单独确认精确数据目录和项目数量。") }) : ""}</div>
            <p>${L("创建一个空项目，随后进入工作台。")}</p>
          </div>
        </header>
        <form class="inline-settings-form project-manager-create-form" data-project-create>
          <label>${L("项目名称")}<input name="display_name" required maxlength="160" placeholder="${L("例如：新产品发布")}"></label>
          <label class="inline-confirm"><input type="checkbox" name="user_confirmed"><span>${L("确认创建这个项目")}</span></label>
          <p class="settings-form-error" role="alert" hidden></p>
          <button class="mw-btn mw-btn--primary" type="submit">${L("创建并打开")}</button>
        </form>
        ${demo ? "" : `<section class="project-manager-section" aria-labelledby="demo-project-title"><h3 id="demo-project-title">${L("产品示例")}</h3><p>${L("创建一份明确标记为可重建的示例数据；普通卸载会清理它，但保留用户项目。")}</p><button class="mw-btn mw-btn--secondary" type="button" data-demo-action="create">${L("创建示例项目")}</button><p class="settings-form-error" data-demo-error role="alert" hidden></p></section>`}
      </article>
    </div>
  </section>`;
}
