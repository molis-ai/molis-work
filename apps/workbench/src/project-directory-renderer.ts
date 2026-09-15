import { CONTROL_CLIENT_SCRIPT, PROJECT_INDEX_CLIENT_SCRIPT } from "./browser-assets.js";
import type { WebProjectNavigation } from "./settings-navigation.js";
export interface ProjectDirectoryPrimitives {
  L(text: string): string;
  escapeHtml(value: unknown): string;
  icon(name: "x" | "database" | "arrow" | "brand" | "settings" | "search" | "plus"): string;
  withDesktopQuery(path: string): string;
  htmlLang(): string;
  renderIconSprite(): string;
  controlTokenMeta(token: string): string;
  clientI18nScript(): string;
  themeBootstrapScript: string;
  visualFoundationClientScript: string;
}
export function createWorkbenchProjectDirectoryRenderer(primitives: ProjectDirectoryPrimitives) {
  const { L, escapeHtml, icon, withDesktopQuery, htmlLang, renderIconSprite, controlTokenMeta, clientI18nScript,
    themeBootstrapScript: THEME_BOOTSTRAP_SCRIPT, visualFoundationClientScript: VISUAL_FOUNDATION_CLIENT_SCRIPT } = primitives;
function renderProjectMigrationDialog(): string {
  return `<dialog class="project-migration-dialog" data-project-migration-dialog aria-labelledby="project-migration-title">
  <form class="project-migration-form" data-project-migration-form>
    <header>
      <div><h2 id="project-migration-title">${L("迁移已有 Molis Work 数据")}</h2><p>${L("这是一次单独确认的文件迁移，不会绑定或切换任何 Runtime Session。")}</p></div>
      <button class="icon-button" type="button" data-close-project-migration aria-label="${L("关闭迁移窗口")}">${icon("x")}</button>
    </header>
    <div class="project-migration-body">
      <label>${L("已有 Molis Work DB")}<input name="legacy_database_path" type="text" required autocomplete="off" placeholder="${L("/绝对路径/到/molis-work.db")}"><small>${L("请输入你明确要迁移的本机 Molis Work 数据库路径。")}</small></label>
      <label><span>${L("迁移后项目名")} <small>${L("可选")}</small></span><input name="display_name" type="text" maxlength="160" autocomplete="off" placeholder="${L("留空则使用旧 Board 的名称")}"></label>
      <p class="project-migration-warning">${L("确认后，来源 DB 会由 Molis Work 的受管理项目目录接管，原位置不再保留该 DB；Goal、Claim、Run、Evidence 和审计历史会原样迁入。迁移失败时来源 DB 不会被移动。")}</p>
      <label class="project-migration-confirm"><input name="user_confirmed" type="checkbox"><span>${L("我确认要迁移这份已有 Molis Work 数据，并理解成功后来源 DB 将移入 Molis Work 管理目录。")}</span></label>
      <p class="project-migration-error" data-project-migration-error role="alert" hidden></p>
    </div>
    <footer><button type="button" data-close-project-migration>${L("取消")}</button><button class="project-migration-submit" type="submit" data-project-migration-submit>${L("确认迁移")}</button></footer>
  </form>
</dialog>`;
}

function projectIndexKind(project: WebProjectNavigation): { chip: string; detail: string } {
  if (project.data_class === "regenerable_demo") {
    return { chip: L("演示数据"), detail: L("演示数据 · 可随时重建，不属于用户项目") };
  }
  if (project.data_class === "migrated_user") {
    return { chip: L("已迁移"), detail: L("用户数据 · 由已有 Molis Work 数据迁入") };
  }
  return { chip: L("本地项目"), detail: L("用户数据 · 在 Molis Work 中创建") };
}

function renderMolisWorkProjectIndex(
  projects: readonly WebProjectNavigation[],
  controlToken = "",
  desktopShell = false,
): string {
  const href = (path: string) => desktopShell ? withDesktopQuery(path) : path;
  const projectCards = projects
    .map((project) => {
      const kind = projectIndexKind(project);
      const searchRow = `${project.display_name} ${kind.chip} ${kind.detail} ${project.data_class ?? ""}`.toLocaleLowerCase();
      return `<a class="project-card" role="listitem" href="${href(`/projects/${encodeURIComponent(project.project_id)}`)}" data-project-search-row="${escapeHtml(searchRow)}"><header><span class="project-card-icon" aria-hidden="true">${icon("database")}</span><span class="project-card-kind">${kind.chip}</span></header><div><h2 title="${escapeHtml(project.display_name)}">${escapeHtml(project.display_name)}</h2><p>${kind.detail}</p></div><footer><span>${L("打开项目")}</span>${icon("arrow")}</footer></a>`;
    })
    .join("");
  return `<!doctype html>
<html lang="${htmlLang()}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${controlTokenMeta(controlToken)}
  <title>${L("选择项目 · Molis Work")}</title>
  <script>${THEME_BOOTSTRAP_SCRIPT}</script>
  <link rel="stylesheet" href="/assets/molis-work-project-index.css">
</head>
<body class="project-index-page" data-desktop-shell="true"${desktopShell ? ' data-native-desktop="true"' : ""}>
  ${renderIconSprite()}
  <header class="topbar project-directory-topbar">
    <a class="brand" href="${href("/")}" aria-label="${L("Molis Work 项目目录")}">${icon("brand")}<strong>Molis Work</strong></a>
    <div class="top-spacer"${desktopShell ? " data-tauri-drag-region" : ""}></div>
    <a class="top-action" href="${href("/settings/appearance")}" aria-label="${L("打开系统设置")}">${icon("settings")}<span>${L("系统设置")}</span></a>
  </header>
  <main class="project-index">
    <section class="project-index-panel" aria-labelledby="project-index-title">
      <header class="project-index-heading"><div><h1 id="project-index-title">${L("选择一个项目")}</h1><p>${L("每个项目管理自己的 Goals 和 Sessions；工作目录在新建或关联 Session 时选择。")}</p></div><div class="project-index-actions">${projects.length ? `<label class="project-index-search">${icon("search")}<input type="search" data-project-search placeholder="${L("搜索项目")}" aria-label="${L("搜索项目")}"></label>` : ""}<a class="project-index-create" href="${href("/onboarding")}">${icon("plus")}${L("引导创建项目")}</a></div></header>
      <div class="project-index-body">${projects.length
        ? `<div class="project-card-grid" role="list">${projectCards}</div><p class="project-index-search-empty" data-project-search-empty hidden aria-live="polite">${L("没有匹配的项目，换一个关键词。")}</p>`
        : `<div class="project-index-empty"><h2>${L("从一个真实项目开始")}</h2><p>${L("通过逐步引导建立 Project 和第一条根 Goal；是否关联工作目录、是否打开 Runtime 都由你确认。")}</p><div class="project-index-start"><a href="${href("/onboarding")}">${L("开始建立第一个项目")}</a><a href="${href("/settings/projects")}">${L("直接进入项目设置")}</a></div></div>`}</div>
      <section class="project-index-migration"><div><strong>${L("已有一份旧的 Molis Work DB？")}</strong><small>${L("只有你明确选择并确认后，才会迁移它并保留已有历史。")}</small></div><button class="project-index-migrate" type="button" data-open-project-migration>${L("迁移已有 Molis Work 数据")}</button></section>
      <p class="project-index-note">${L("选择项目只影响这次网页浏览；正在对话的 Runtime Session 保持原来的项目关系。")}</p>
    </section>
  </main>
  ${renderProjectMigrationDialog()}
  <script>${clientI18nScript()}${CONTROL_CLIENT_SCRIPT}${PROJECT_INDEX_CLIENT_SCRIPT}${VISUAL_FOUNDATION_CLIENT_SCRIPT}</script>
</body>
</html>`;
}


  return { renderMolisWorkProjectIndex, renderProjectMigrationDialog };
}
