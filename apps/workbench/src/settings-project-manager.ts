import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderHint } from "@molis-ai/molis-work-design-system";
import { createProjectSettingsFolds } from "./project-settings-folds.js";
import type { SettingsRenderPrimitives } from "./settings-renderer.js";
import type { MolisWorkSettingsView, WebSettingsProject } from "./settings-view.js";

type ProjectManagerPrimitives = Pick<SettingsRenderPrimitives, "readText" | "escapeHtml" | "icon" | "withDesktopQuery" | "projectDeletionLabels">;
type ProjectFolds = ReturnType<typeof createProjectSettingsFolds>;

function projectKindShort(project: WebSettingsProject, _L: ProjectManagerPrimitives["readText"]): string {
  if (project.data_class === "regenerable_demo") return uiText.text("workbench.settings-project-manager.demo-data");
  return uiText.text("workbench.settings-project-manager.local-project");
}

function renderProjectDetail(project: WebSettingsProject, selected: boolean, desktopShell: boolean, primitives: ProjectManagerPrimitives, folds: ProjectFolds): string {
  const { escapeHtml } = primitives;
  const id = project.project_id;
  const safe = escapeHtml(id);
  const href = `/projects/${encodeURIComponent(id)}`;
  return `<article class="project-manager-detail" data-project-pane="${safe}" data-route-prefix="${href}"${selected ? "" : " hidden"} aria-labelledby="project-pane-title-${safe}">
    ${folds.renderProjectSettingsHero(project, { headingTag: "h2", showOpenTree: true, hint: renderHint({ id: `settings-hint-project-${project.project_id}`, label: uiText.text("workbench.settings-project-manager.how-applies"), text: uiText.text("workbench.settings-project-manager.project-guidance-lives-project-settings-work-planning-work") }) })}
    ${folds.renderGeneralBody(project)}
    ${folds.renderDanger(project)}
    ${folds.renderProjectDeleteDialog(project, desktopShell)}
  </article>`;
}

export function renderProjectSettings(view: MolisWorkSettingsView, desktopShell: boolean, primitives: ProjectManagerPrimitives): string {
  const { readText, escapeHtml, icon, withDesktopQuery } = primitives;
  const folds = createProjectSettingsFolds({ readText, escapeHtml, icon, withDesktopQuery, projectDeletionLabels: primitives.projectDeletionLabels });
  const demo = view.projects.find((project) => project.data_class === "regenerable_demo");
  const selectedId = view.projects[0]?.project_id ?? "create";
  const rows = view.projects.map((project) => {
    const safe = escapeHtml(project.project_id);
    const checked = project.project_id === selectedId ? " checked" : "";
    return `<label class="project-manager-row" data-project-row="${safe}"><input type="radio" name="project-focus" value="${safe}"${checked}><span><strong>${escapeHtml(project.display_name)}</strong><small>${projectKindShort(project, readText)}</small></span></label>`;
  }).join("");
  const createChecked = selectedId === "create" ? " checked" : "";
  const details = view.projects.map((project) => renderProjectDetail(project, project.project_id === selectedId, desktopShell, primitives, folds)).join("");
  return `<section class="project-manager" data-project-manager aria-labelledby="settings-title">
    <aside class="project-manager-index">
      <header class="project-manager-index-chrome">
        <h1 id="settings-title">${uiText("workbench.settings-project-manager.project")}</h1>
        <p>${uiText("workbench.settings-project-manager.count-count-device", { count: view.projects.length })}</p>
      </header>
      <div class="project-manager-list">
        <div class="project-manager-rows" role="radiogroup" aria-label="${uiText("workbench.settings-project-manager.choose-project-configure")}">
          ${rows}
          <input id="project-focus-create" class="project-manager-create-input" type="radio" name="project-focus" value="create"${createChecked}>
        </div>
        ${view.projects.length ? "" : `<p class="project-manager-empty">${uiText("workbench.settings-project-manager.no-project-yet")}</p>`}
      </div>
      <footer class="project-manager-index-actions">
        <label class="project-manager-ghost" for="project-focus-create">${icon("plus")}<span>${uiText("workbench.settings-project-manager.new-project")}</span></label>
      </footer>
    </aside>
    <div class="project-manager-stage">
      ${details}
      <article class="project-manager-detail" data-project-pane="create"${selectedId === "create" ? "" : " hidden"} aria-labelledby="create-project-title">
        <header class="project-manager-hero">
          <div>
            <div class="settings-heading-title"><h2 id="create-project-title">${uiText("workbench.settings-project-manager.create-project")}</h2>${view.projects.length ? renderHint({ id: "settings-hint-create-project", label: uiText.text("workbench.settings-project-manager.how-applies"), text: uiText.text("workbench.settings-project-manager.user-projects-not-deleted-sample-actions-normal-uninstall") }) : ""}</div>
            <p>${uiText("workbench.settings-project-manager.create-empty-project-then-open-workbench")}</p>
          </div>
        </header>
        <form class="inline-settings-form project-manager-create-form" data-project-create>
          <label>${uiText("workbench.settings-project-manager.project-name")}<input name="display_name" required maxlength="160" placeholder="${uiText("workbench.settings-project-manager.example-new-product-launch")}"></label>
          <label class="inline-confirm"><input type="checkbox" name="user_confirmed"><span>${uiText("workbench.settings-project-manager.confirm-creating-project")}</span></label>
          <p class="settings-form-error" role="alert" hidden></p>
          <button class="mw-btn mw-btn--primary" type="submit">${uiText("workbench.settings-project-manager.create-open")}</button>
        </form>
        ${demo ? "" : `<section class="project-manager-section" aria-labelledby="demo-project-title"><h3 id="demo-project-title">${uiText("workbench.settings-project-manager.product-demo")}</h3><p>${uiText("workbench.settings-project-manager.create-demo-data-that-clearly-marked-regenerable-normal")}</p><button class="mw-btn mw-btn--secondary" type="button" data-demo-action="create">${uiText("workbench.settings-project-manager.create-demo-project")}</button><p class="settings-form-error" data-demo-error role="alert" hidden></p></section>`}
      </article>
    </div>
  </section>`;
}
