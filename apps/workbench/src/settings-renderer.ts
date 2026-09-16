import { CONTROL_CLIENT_SCRIPT, PROJECT_INDEX_CLIENT_SCRIPT, SETTINGS_CLIENT_SCRIPT } from "./browser-assets.js";
import type { RuntimeIntegrationDetection } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { MolisWorkSettingsView, WebSettingsProject } from "./settings-view.js";
import type { createWorkbenchSettingsNavigation } from "./settings-navigation.js";
import { createProjectSettingsFolds } from "./project-settings-folds.js";
import { renderAppearanceSettingsDocument, renderRuntimePlanDialog } from "./settings-appearance.js";
export interface SettingsRenderPrimitives {
  L(text: string, values?: Record<string, string | number>): string;
  escapeHtml(value: unknown): string;
  icon(name: "check" | "sun" | "moon" | "system" | "workflow" | "folder" | "settings" | "chevron-down" | "chevron-right" | "database" | "refresh" | "x" | "brand" | "blocked" | "tree" | "plus" | "book" | "shield", className?: string): string;
  currentLocale(): string;
  localeSwitchHref(locale: "zh" | "en", nextPath: string): string;
  htmlLang(): string;
  controlTokenMeta(token: string): string;
  clientI18nScript(): string;
  renderIconSprite(): string;
  withDesktopQuery(path: string): string;
  themeBootstrapScript: string;
  visualFoundationClientScript: string;
  settingsContextHref: ReturnType<typeof createWorkbenchSettingsNavigation>["settingsContextHref"];
  renderSettingsNavigation: ReturnType<typeof createWorkbenchSettingsNavigation>["renderSettingsNavigation"];
  renderProjectMigrationDialog(): string;
}
export function createWorkbenchSettingsRenderer(primitives: SettingsRenderPrimitives) {
  const { L, escapeHtml, icon, currentLocale, localeSwitchHref, htmlLang, controlTokenMeta, clientI18nScript, renderIconSprite,
    withDesktopQuery, settingsContextHref, renderSettingsNavigation, renderProjectMigrationDialog,
    themeBootstrapScript: THEME_BOOTSTRAP_SCRIPT, visualFoundationClientScript: VISUAL_FOUNDATION_CLIENT_SCRIPT } = primitives;
  const folds = createProjectSettingsFolds({ L, escapeHtml, icon, withDesktopQuery });
function runtimeStatePresentation(state: RuntimeIntegrationDetection["connection_state"]): {
  label: string;
  tone: "neutral" | "success" | "warning" | "danger";
  description: string;
} {
  if (state === "connected") return { label: L("已接入"), tone: "success", description: L("MCP 与 Molis Work Skill 都指向当前安装。") };
  if (state === "needs_repair") return { label: L("需要修复"), tone: "warning", description: L("检测到旧版或不完整的 Molis Work 接入。") };
  if (state === "conflict") return { label: L("存在冲突"), tone: "danger", description: L("同名配置或 Skill 不属于 Molis Work，不会自动覆盖。") };
  if (state === "molis_work_unavailable") return { label: L("本体不完整"), tone: "danger", description: L("请先查看诊断并修复 Molis Work 本体安装。") };
  if (state === "not_detected") return { label: L("未检测到"), tone: "neutral", description: L("这台设备上没有找到对应 Runtime。") };
  return { label: L("未接入"), tone: "neutral", description: L("尚未把 Molis Work MCP 与 Skill 写入这个 Runtime。") };
}

function renderAppearanceSettings(nextPath: string): string {
  return renderAppearanceSettingsDocument({ L, currentLocale, localeSwitchHref }, nextPath);
}

function renderRuntimeSettings(view: MolisWorkSettingsView): string {
  const rows = view.runtimes.map((runtime) => {
    const state = runtimeStatePresentation(runtime.connection_state);
    const unavailable = runtime.connection_state === "not_detected" || runtime.connection_state === "molis_work_unavailable";
    const action = runtime.connection_state === "connected" ? "remove" : "connect";
    const actionLabel = action === "remove" ? L("预览移除") : runtime.connection_state === "needs_repair" ? L("预览修复") : L("查看并接入");
    return `<article class="settings-record runtime-record" data-runtime-row="${escapeHtml(runtime.runtime_id)}">
      <header>
        <div class="settings-record-title"><span class="record-icon">${icon("workflow")}</span><div><h2>${escapeHtml(runtime.display_name)}</h2><p>${escapeHtml(state.description)}</p></div></div>
        <div class="settings-record-action"><span class="settings-state settings-state--${state.tone}">${escapeHtml(state.label)}</span><button type="button" data-runtime-plan="${escapeHtml(runtime.runtime_id)}" data-runtime-action="${action}"${unavailable ? " disabled" : ""}>${escapeHtml(actionLabel)}</button></div>
      </header>
      <details class="settings-data-disclosure"><summary><span>${L("本机路径")}</span>${icon("chevron-down")}</summary><dl class="settings-paths"><div><dt>Runtime</dt><dd>${runtime.executable_path ? escapeHtml(runtime.executable_path) : L("未找到可执行文件")}</dd></div><div><dt>${L("配置")}</dt><dd>${escapeHtml(runtime.config_path)}</dd></div><div><dt>Skill</dt><dd>${escapeHtml(runtime.skill_path)}</dd></div></dl></details>
    </article>`;
  }).join("");
  return `<section class="settings-document" aria-labelledby="settings-title">
    <header class="settings-heading"><h1 id="settings-title">${L("AI 与执行工具")}</h1><p>${L("不接入也能正常使用 Goal Tree、待决定和记录。只有想让 AI 工具直接读取或推进 Goal 时才需要连接；每次修改前都会先展示变化并由你确认。")}</p></header>
    <div class="settings-body"><div class="settings-record-list">${rows || `<div class="settings-empty"><h2>${L("没有可探测的 Runtime")}</h2><p>${L("Molis Work 本体仍可使用；稍后安装 Runtime 后再回来检查。")}</p></div>`}</div>
    <p class="settings-footnote">${L("当前自动适配 Codex、Claude Code、OpenCode、Pi Agent 和 Grok Build。每次确认只对应当前 Runtime 和当前预览；配置在预览后变化时会要求重新生成。Session 与运行位置请进入对应项目的 Sessions 管理。")}</p></div>
  </section>`;
}

function projectKindShort(project: WebSettingsProject): string {
  if (project.data_class === "regenerable_demo") return L("演示数据");
  if (project.data_class === "migrated_user") return L("已迁移");
  return L("本地项目");
}

function renderProjectDetail(project: WebSettingsProject, selected: boolean, desktopShell: boolean): string {
  const id = project.project_id;
  const safe = escapeHtml(id);
  const href = `/projects/${encodeURIComponent(id)}`;
  return `<article class="project-manager-detail" data-project-pane="${safe}" data-route-prefix="${href}"${selected ? "" : " hidden"} aria-labelledby="project-pane-title-${safe}">
    ${folds.renderProjectSettingsHero(project, { headingTag: "h2", showOpenTree: true })}
    <p class="settings-footnote">${L("项目说明、工作规则和工作规划在项目设置中维护。")}</p>
    ${folds.renderGeneralBody(project)}
    ${folds.renderDanger(project)}
    ${folds.renderProjectDeleteDialog(project, desktopShell)}
  </article>`;
}

function renderProjectSettings(view: MolisWorkSettingsView, desktopShell: boolean): string {
  const demo = view.projects.find((project) => project.data_class === "regenerable_demo");
  const selectedId = view.projects[0]?.project_id ?? "create";
  const rows = view.projects.map((project) => {
    const safe = escapeHtml(project.project_id);
    const checked = project.project_id === selectedId ? " checked" : "";
    return `<label class="project-manager-row" data-project-row="${safe}"><input type="radio" name="project-focus" value="${safe}"${checked}><span><strong>${escapeHtml(project.display_name)}</strong><small>${projectKindShort(project)}</small></span></label>`;
  }).join("");
  const createChecked = selectedId === "create" ? " checked" : "";
  const details = view.projects.map((project) => renderProjectDetail(project, project.project_id === selectedId, desktopShell)).join("");
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
        <button type="button" data-open-project-migration>${icon("folder")}<span>${L("导入")}</span></button>
      </footer>
    </aside>
    <div class="project-manager-stage">
      ${details}
      <article class="project-manager-detail" data-project-pane="create"${selectedId === "create" ? "" : " hidden"} aria-labelledby="create-project-title">
        <header class="project-manager-hero">
          <div>
            <h2 id="create-project-title">${L("创建项目")}</h2>
            <p>${L("创建一个空项目，随后进入工作台。")}</p>
          </div>
        </header>
        <form class="inline-settings-form project-manager-create-form" data-project-create>
          <label>${L("项目名称")}<input name="display_name" required maxlength="160" placeholder="${L("例如：新产品发布")}"></label>
          <label class="inline-confirm"><input type="checkbox" name="user_confirmed"><span>${L("确认创建这个项目")}</span></label>
          <p class="settings-form-error" role="alert" hidden></p>
          <button type="submit">${L("创建并打开")}</button>
        </form>
        <section class="project-manager-section" aria-labelledby="import-project-title">
          <h3 id="import-project-title">${L("导入已有 Molis Work 数据")}</h3>
          <p>${L("选择并确认数据文件后，Molis Work 会把它作为一个独立项目保存。")}</p>
          <button type="button" data-open-project-migration>${L("导入已有数据")}</button>
        </section>
        ${demo ? "" : `<section class="project-manager-section" aria-labelledby="demo-project-title"><h3 id="demo-project-title">${L("产品示例")}</h3><p>${L("创建一份明确标记为可重建的示例数据；普通卸载会清理它，但保留用户项目。")}</p><button type="button" data-demo-action="create">${L("创建示例项目")}</button><p class="settings-form-error" data-demo-error role="alert" hidden></p></section>`}
        <p class="settings-footnote">${view.projects.length ? L("普通用户项目不会被示例操作或普通卸载删除；永久清除用户数据需要单独确认精确数据目录和项目数量。") : L("创建第一个项目，或导入已有 Molis Work 数据。")}</p>
      </article>
    </div>
  </section>`;
}

function renderDiagnosticsSettings(view: MolisWorkSettingsView): string {
  const diagnostics = view.diagnostics;
  const service = view.web_service;
  const installation = diagnostics.installation_state === "ready"
    ? { label: L("安装完整"), tone: "success" }
    : diagnostics.installation_state === "missing"
      ? { label: L("尚未安装本体"), tone: "warning" }
      : { label: L("安装清单无效"), tone: "danger" };
  const launchers = diagnostics.launchers.map((launcher) => `<li><span>${icon(launcher.state === "ready" ? "check" : "blocked")}<strong>${launcher.name}</strong><small>${escapeHtml(launcher.path)}</small></span><span class="settings-state settings-state--${launcher.state === "ready" ? "success" : "danger"}">${launcher.state === "ready" ? L("可用") : L("缺失")}</span></li>`).join("");
  const serviceTone = service.state === "running" ? "success" : service.state === "stopped" || service.state === "absent" || service.state === "unhealthy" ? "warning" : "danger";
  const serviceLabel = service.state === "running" ? L("运行中") : service.state === "stopped" ? L("已安装，未运行") : service.state === "unhealthy" ? L("进程运行中，页面不可用") : service.state === "absent" ? L("未启用") : service.state === "unsupported" ? L("当前系统不支持") : service.state === "conflict" ? L("配置冲突") : L("需要修复");
  const serviceActions = service.state === "running"
    ? [["restart", L("重启")], ["stop", L("停止")], ["remove", L("移除")]]
    : service.state === "stopped"
      ? [["start", L("启动")], ["remove", L("移除")]]
      : service.state === "unhealthy"
        ? [["restart", L("重启并检查")], ["remove", L("移除")]]
      : service.state === "absent"
        ? [["install", L("启用常驻服务")]]
        : service.state === "needs_repair"
          ? [["install", L("修复常驻服务")]]
        : [];
  const serviceButtons = serviceActions.map(([action, label]) => `<button type="button" data-web-service-action="${action}">${label}</button>`).join("");
  return `<section class="settings-document" aria-labelledby="settings-title">
    <header class="settings-heading"><h1 id="settings-title">${L("诊断")}</h1><p>${L("这里只读取 Molis Work 自己的安装状态，不扫描项目内容，也不会自动修复或修改 Runtime。")}</p></header>
    <div class="settings-body"><section class="diagnostics-summary"><div><h2>${L("Molis Work 本体")}</h2><span class="settings-state settings-state--${installation.tone}">${installation.label}</span></div><dl><div><dt>${L("版本")}</dt><dd>${escapeHtml(diagnostics.version ?? L("未识别"))}</dd></div><div><dt>${L("项目数")}</dt><dd>${diagnostics.project_count}</dd></div></dl><details class="settings-data-disclosure"><summary><span>${L("本机路径")}</span>${icon("chevron-down")}</summary><dl class="settings-paths"><div><dt>Home</dt><dd>${escapeHtml(diagnostics.home_directory)}</dd></div><div><dt>Release</dt><dd>${escapeHtml(diagnostics.release_directory ?? L("未找到"))}</dd></div></dl></details></section>
    <section class="launcher-section" aria-labelledby="launcher-title"><h2 id="launcher-title">${L("启动入口")}</h2><ul>${launchers}</ul></section>
    <section class="diagnostics-summary" aria-labelledby="web-service-title"><div><div><h2 id="web-service-title">${L("Web 常驻服务")}</h2><p>${escapeHtml(L(service.message))}</p></div><span class="settings-state settings-state--${serviceTone}">${serviceLabel}</span></div><div class="service-action-row">${serviceButtons}</div><details class="settings-data-disclosure"><summary><span>${L("服务配置与日志")}</span>${icon("chevron-down")}</summary><dl><div><dt>${L("方式")}</dt><dd>${service.provider === "macos-launchagent" ? L("macOS 用户级 LaunchAgent") : L("尚未提供")}</dd></div><div><dt>${L("命令")}</dt><dd>${escapeHtml(service.command.join(" "))}</dd></div><div><dt>${L("配置")}</dt><dd>${escapeHtml(service.plist_path)}</dd></div><div><dt>${L("日志")}</dt><dd>${escapeHtml(service.stdout_log)}<br>${escapeHtml(service.stderr_log)}</dd></div></dl></details><p class="settings-form-error" data-web-service-error role="alert" hidden></p></section>
    <p class="settings-footnote">${L("如果本体不完整，请在终端重新运行 ")}<code>molis-work install</code>${L("。常驻服务操作会先展示预览并要求确认；不会在后台使用 nohup。")}</p></div>
  </section>`;
}

function renderMolisWorkSettings(view: MolisWorkSettingsView, controlToken = "", desktopShell = false): string {
  const title = view.section === "appearance"
    ? L("界面与语言")
    : view.section === "runtimes"
      ? L("AI 与执行工具")
      : view.section === "projects"
        ? L("项目设置")
        : L("诊断");
  const contextProject = view.context_project ?? null;
  const settingsPath = settingsContextHref(`/settings/${view.section}`, contextProject, desktopShell);
  const rawReturnHref = contextProject ? `/projects/${encodeURIComponent(contextProject.project_id)}/` : "/";
  const returnHref = desktopShell ? withDesktopQuery(rawReturnHref) : rawReturnHref;
  const projectManager = view.section === "projects";
  const content = view.section === "appearance"
    ? renderAppearanceSettings(settingsPath)
    : view.section === "runtimes"
      ? renderRuntimeSettings(view)
      : view.section === "projects"
        ? renderProjectSettings(view, desktopShell)
        : renderDiagnosticsSettings(view);
  return `<!doctype html>
<html lang="${htmlLang()}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${controlTokenMeta(controlToken)}<title>${title} · ${L("Molis Work 设置")}</title><script>${THEME_BOOTSTRAP_SCRIPT}</script><link rel="stylesheet" href="/assets/molis-work-settings.css"></head>
<body class="settings-page project-preferences-page global-preferences-page" data-settings-section="${view.section}" data-desktop-shell="false"${desktopShell ? ' data-native-desktop="true"' : ""}>
  ${renderIconSprite()}
  <header class="project-preferences-chrome"${desktopShell ? " data-tauri-drag-region" : ""}><span>${projectManager ? L("项目管理") : L("全局设置")}</span><a href="${returnHref}" aria-label="${L("关闭全局设置")}">${icon("x")}</a></header>
  <main class="settings-shell${projectManager ? " settings-shell--standalone" : ""}">
    ${projectManager ? "" : renderSettingsNavigation(view.section, contextProject, desktopShell, view.projects)}
    <div class="settings-content">${content}</div>
  </main>
  ${renderRuntimePlanDialog({ L, icon })}
  ${renderProjectMigrationDialog()}
  <div class="toast" data-settings-toast role="status" aria-live="polite"></div>
  <script>${clientI18nScript()}${CONTROL_CLIENT_SCRIPT}${PROJECT_INDEX_CLIENT_SCRIPT}${SETTINGS_CLIENT_SCRIPT}${VISUAL_FOUNDATION_CLIENT_SCRIPT}</script>
</body></html>`;
}


  return renderMolisWorkSettings;
}
