import { CONTROL_CLIENT_SCRIPT, PROJECT_INDEX_CLIENT_SCRIPT, SETTINGS_CLIENT_SCRIPT } from "./browser-assets.js";
import type { RuntimeIntegrationDetection } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { MolisWorkSettingsView } from "./settings-view.js";
import type { createWorkbenchSettingsNavigation } from "./settings-navigation.js";
export interface SettingsRenderPrimitives {
  L(text: string, values?: Record<string, string | number>): string;
  escapeHtml(value: unknown): string;
  icon(name: "check" | "sun" | "moon" | "system" | "workflow" | "folder" | "settings" | "chevron-down" | "database" | "refresh" | "x" | "brand" | "blocked" | "tree", className?: string): string;
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
  const densityPreview = (mode: "standard" | "compact") =>
    `<span class="density-preview density-preview--${mode}" aria-hidden="true"><i></i><span><i></i><i></i><i></i><i></i><i></i></span></span>`;
  const locale = currentLocale();
  const languageOption = (value: "zh" | "en", label: string, description: string) =>
    `<a class="preference-option" href="${localeSwitchHref(value, nextPath)}" hreflang="${value === "zh" ? "zh-CN" : "en"}" lang="${value === "zh" ? "zh-CN" : "en"}" aria-current="${locale === value}"><span class="language-preview" aria-hidden="true">${value === "zh" ? "中" : "EN"}</span><span><strong>${label}</strong><small>${description}</small></span>${icon("check", "preference-check")}</a>`;
  return `<section class="settings-document appearance-document" aria-labelledby="settings-title">
    <header class="settings-heading"><h1 id="settings-title">${L("界面与语言")}</h1><p>${L("集中设置当前设备上的语言、主题、终端外观和信息密度，不会改动项目、Goal 或 Runtime 数据。")}</p></header>
    <div class="settings-body"><div class="appearance-settings">
      <section class="preference-section" aria-labelledby="language-settings-title">
        <div class="preference-copy"><h2 id="language-settings-title">${L("界面语言")}</h2><p>${L("只改变 Molis Work 的界面文案，不翻译 Goal 名称和正文内容。")}</p></div>
        <div class="preference-options preference-options--language" role="group" aria-label="${L("界面语言")}">
          ${languageOption("zh", "中文", L("使用中文界面。"))}
          ${languageOption("en", "English", L("使用英文界面。"))}
        </div>
      </section>
      <section class="preference-section" aria-labelledby="density-settings-title">
        <div class="preference-copy"><h2 id="density-settings-title">${L("界面密度")}</h2><p>${L("决定桌面 Goal 工作台一次显示多少 Goal 和正文内容。")}</p></div>
        <div class="preference-options preference-options--density" role="group" aria-label="${L("界面密度")}">
          <button class="preference-option" type="button" data-density-option="standard" aria-pressed="true">${densityPreview("standard")}<span><strong>${L("标准")}</strong><small>${L("舒展的间距，适合专注阅读和一般工作量。")}</small></span>${icon("check", "preference-check")}</button>
          <button class="preference-option" type="button" data-density-option="compact" aria-pressed="false">${densityPreview("compact")}<span><strong>${L("紧凑")}</strong><small>${L("减少 Goal 行和正文留白，适合长 Goal Tree 与宽屏。")}</small></span>${icon("check", "preference-check")}</button>
        </div>
      </section>
      <section class="preference-section" aria-labelledby="theme-settings-title">
        <div class="preference-copy"><h2 id="theme-settings-title">${L("主题")}</h2><p>${L("选择固定主题，或让 Molis Work 跟随当前系统外观。")}</p></div>
        <div class="preference-options preference-options--theme" role="group" aria-label="${L("主题")}">
          <button class="preference-option" type="button" data-theme-option="light" aria-pressed="false">${icon("sun")}<span><strong>${L("浅色")}</strong><small>${L("适合明亮环境。")}</small></span>${icon("check", "preference-check")}</button>
          <button class="preference-option" type="button" data-theme-option="dark" aria-pressed="false">${icon("moon")}<span><strong>${L("深色")}</strong><small>${L("适合低光环境。")}</small></span>${icon("check", "preference-check")}</button>
          <button class="preference-option" type="button" data-theme-option="system" aria-pressed="true">${icon("system")}<span><strong>${L("跟随系统")}</strong><small>${L("随设备主题自动切换。")}</small></span>${icon("check", "preference-check")}</button>
        </div>
      </section>
      <section class="preference-section" aria-labelledby="terminal-theme-settings-title">
        <div class="preference-copy"><h2 id="terminal-theme-settings-title">${L("终端外观")}</h2><p>${L("只改变终端画布的配色；Runtime 导航、Goal 信息和操作继续使用界面主题。")}</p></div>
        <div class="preference-options preference-options--theme" role="group" aria-label="${L("终端外观")}">
          <button class="preference-option" type="button" data-terminal-theme-option="auto" aria-pressed="true">${icon("system")}<span><strong>${L("跟随界面")}</strong><small>${L("终端随 Molis Work 的浅色或深色主题切换。")}</small></span>${icon("check", "preference-check")}</button>
          <button class="preference-option" type="button" data-terminal-theme-option="light" aria-pressed="false">${icon("sun")}<span><strong>${L("浅色终端")}</strong><small>${L("始终使用浅色终端画布。")}</small></span>${icon("check", "preference-check")}</button>
          <button class="preference-option" type="button" data-terminal-theme-option="dark" aria-pressed="false">${icon("moon")}<span><strong>${L("深色终端")}</strong><small>${L("始终使用深色终端画布。")}</small></span>${icon("check", "preference-check")}</button>
        </div>
      </section>
    </div>
    <p class="preference-note">${L("语言、主题、终端外观和密度只保存在当前设备。紧凑模式仅影响 760px 以上的 Goal 导航和 Goal 正文；Runtime、决定中心、设置页和窄屏布局保持原来的密度。")}</p></div>
  </section>`;
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
      <dl class="settings-paths"><div><dt>Runtime</dt><dd>${runtime.executable_path ? escapeHtml(runtime.executable_path) : L("未找到可执行文件")}</dd></div><div><dt>${L("配置")}</dt><dd>${escapeHtml(runtime.config_path)}</dd></div><div><dt>Skill</dt><dd>${escapeHtml(runtime.skill_path)}</dd></div></dl>
    </article>`;
  }).join("");
  return `<section class="settings-document" aria-labelledby="settings-title">
    <header class="settings-heading"><h1 id="settings-title">${L("AI 与执行工具")}</h1><p>${L("不接入也能正常使用 Goal Tree、待决定和记录。只有想让 AI 工具直接读取或推进 Goal 时才需要连接；每次修改前都会先展示变化并由你确认。")}</p></header>
    <div class="settings-body"><div class="settings-record-list">${rows || `<div class="settings-empty"><h2>${L("没有可探测的 Runtime")}</h2><p>${L("Molis Work 本体仍可使用；稍后安装 Runtime 后再回来检查。")}</p></div>`}</div>
    <p class="settings-footnote">${L("当前自动适配 Codex、Claude Code、OpenCode、Pi Agent 和 Grok Build。每次确认只对应当前 Runtime 和当前预览；配置在预览后变化时会要求重新生成。Session 与运行位置请进入对应项目的 Sessions 管理。")}</p></div>
  </section>`;
}

function renderProjectSettings(view: MolisWorkSettingsView): string {
  const demo = view.projects.find((project) => project.data_class === "regenerable_demo");
  const rows = view.projects.map((project) => `<article class="settings-record project-record" data-project-row="${escapeHtml(project.project_id)}">
    <header>
      <div class="settings-record-title"><span class="record-icon">${icon("folder")}</span><div><h2>${escapeHtml(project.display_name)}</h2><p>${project.data_class === "regenerable_demo" ? L("演示数据 · 可随时重建，不属于用户项目") : project.source === "migrated" ? L("用户数据 · 由已有 Molis Work 数据迁入") : L("用户数据 · 在 Molis Work 中创建")}</p></div></div>
      <div class="settings-record-action">${project.data_class === "regenerable_demo" ? `<span class="settings-state settings-state--warning">${L("可重建 demo")}</span>` : `<span class="settings-state settings-state--success">${L("用户数据")}</span>`}<a class="settings-button" href="/projects/${encodeURIComponent(project.project_id)}/settings/general">${L("基本信息")}</a><a class="settings-button" href="/projects/${encodeURIComponent(project.project_id)}/settings/guidance">${L("项目说明")}</a><a class="settings-button" href="/projects/${encodeURIComponent(project.project_id)}/settings/rules">${L("工作规则")}</a><a class="settings-button" href="/projects/${encodeURIComponent(project.project_id)}/settings/planning">${L("工作规划")}</a><a class="settings-button" href="/projects/${encodeURIComponent(project.project_id)}/">${L("打开 Goal Tree")}</a></div>
    </header>
    <div class="project-record-tools">
      <details><summary>${icon("settings")}<span>${L("改名")}</span>${icon("chevron-down")}</summary><form data-project-rename="${escapeHtml(project.project_id)}"><label>${L("项目名称")}<input name="display_name" value="${escapeHtml(project.display_name)}" required maxlength="160"></label><p class="settings-form-error" role="alert" hidden></p><button type="submit">${L("保存名称")}</button></form></details>
      <details><summary>${icon("database")}<span>${L("存储信息")}</span>${icon("chevron-down")}</summary><dl class="project-db-details"><div><dt>${L("项目 ID")}</dt><dd>${escapeHtml(project.project_id)}</dd></div><div><dt>${L("数据文件")}</dt><dd>${escapeHtml(project.database_path)}</dd></div></dl></details>
      ${project.data_class === "regenerable_demo" ? `<details><summary>${icon("refresh")}<span>${L("重建或删除 demo")}</span>${icon("chevron-down")}</summary><div class="connection-action-form connection-action-form--danger"><p class="settings-footnote">${L("重建会清除你在 demo 中做的改动；删除只移除这个可重建项目，不影响用户项目。")}</p><p class="settings-form-error" data-demo-error role="alert" hidden></p><div class="service-action-row"><button type="button" data-demo-action="reset">${L("重建 demo")}</button><button type="button" data-demo-action="remove">${L("删除 demo")}</button></div></div></details>` : ""}
    </div>
  </article>`).join("");
  return `<section class="settings-document" aria-labelledby="settings-title">
    <header class="settings-heading"><h1 id="settings-title">${L("项目设置")}</h1><p>${L("先选择要配置的项目，再进入它的工作规则或工作规划。每个项目单独保存自己的 Goal、记录和项目专用设置。")}</p></header>
    <div class="settings-body"><section class="settings-action-section" aria-labelledby="create-project-title"><div><h2 id="create-project-title">${L("创建项目")}</h2><p>${L("创建一个空的 Molis Work 项目，然后直接打开它的 Goal Tree。")}</p></div><form class="inline-settings-form" data-project-create><label>${L("项目名称")}<input name="display_name" required maxlength="160" placeholder="${L("例如：新产品发布")}"></label><label class="inline-confirm"><input type="checkbox" name="user_confirmed"><span>${L("确认创建这个项目")}</span></label><p class="settings-form-error" role="alert" hidden></p><button type="submit">${L("创建并打开")}</button></form></section>
    <section class="settings-action-section" aria-labelledby="demo-project-title"><div><h2 id="demo-project-title">${L("产品示例")}</h2><p>${demo ? L("示例项目已单独标记为可重建数据，可以放心重置或删除。") : L("创建一份明确标记为可重建的示例数据；普通卸载会清理它，但保留用户项目。")}</p></div>${demo ? `<a class="settings-button" href="/projects/${encodeURIComponent(demo.project_id)}/">${L("打开示例")}</a>` : `<button type="button" data-demo-action="create">${L("创建示例项目")}</button>`}<p class="settings-form-error" data-demo-error role="alert" hidden></p></section>
    <div class="settings-record-list project-settings-list">${rows || `<div class="settings-empty"><h2>${L("还没有项目")}</h2><p>${L("在上方创建第一个项目，或从下方导入一份已有 Molis Work 数据。")}</p></div>`}</div>
    <section class="settings-import-row"><div><h2>${L("导入已有 Molis Work 数据")}</h2><p>${L("选择并确认数据文件后，Molis Work 会把它作为一个独立项目保存。")}</p></div><button type="button" data-open-project-migration>${L("选择数据文件并预览")}</button></section>
    <p class="settings-footnote">${L("普通用户项目不会被示例操作或普通卸载删除；永久清除用户数据需要单独确认精确数据目录和项目数量。")}</p></div>
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
    <div class="settings-body"><section class="diagnostics-summary"><div><h2>${L("Molis Work 本体")}</h2><span class="settings-state settings-state--${installation.tone}">${installation.label}</span></div><dl><div><dt>${L("版本")}</dt><dd>${escapeHtml(diagnostics.version ?? L("未识别"))}</dd></div><div><dt>Home</dt><dd>${escapeHtml(diagnostics.home_directory)}</dd></div><div><dt>Release</dt><dd>${escapeHtml(diagnostics.release_directory ?? L("未找到"))}</dd></div><div><dt>${L("项目数")}</dt><dd>${diagnostics.project_count}</dd></div></dl></section>
    <section class="launcher-section" aria-labelledby="launcher-title"><h2 id="launcher-title">${L("启动入口")}</h2><ul>${launchers}</ul></section>
    <section class="diagnostics-summary" aria-labelledby="web-service-title"><div><div><h2 id="web-service-title">${L("Web 常驻服务")}</h2><p>${escapeHtml(L(service.message))}</p></div><span class="settings-state settings-state--${serviceTone}">${serviceLabel}</span></div><dl><div><dt>${L("方式")}</dt><dd>${service.provider === "macos-launchagent" ? L("macOS 用户级 LaunchAgent") : L("尚未提供")}</dd></div><div><dt>${L("命令")}</dt><dd>${escapeHtml(service.command.join(" "))}</dd></div><div><dt>${L("配置")}</dt><dd>${escapeHtml(service.plist_path)}</dd></div><div><dt>${L("日志")}</dt><dd>${escapeHtml(service.stdout_log)}<br>${escapeHtml(service.stderr_log)}</dd></div></dl><div class="service-action-row">${serviceButtons}</div><p class="settings-form-error" data-web-service-error role="alert" hidden></p></section>
    <p class="settings-footnote">${L("如果本体不完整，请在终端重新运行 ")}<code>molis-work install</code>${L("。常驻服务操作会先展示预览并要求确认；不会在后台使用 nohup。")}</p></div>
  </section>`;
}

function renderRuntimePlanDialog(): string {
  return `<dialog class="runtime-plan-dialog" data-runtime-plan-dialog aria-labelledby="runtime-plan-title">
    <div class="runtime-plan-shell">
      <header><div><h2 id="runtime-plan-title" data-runtime-plan-title>${L("Runtime 接入预览")}</h2><p data-runtime-plan-message>${L("正在读取变更计划…")}</p></div><button class="icon-button" type="button" data-runtime-plan-close aria-label="${L("关闭预览")}">${icon("x")}</button></header>
      <div class="runtime-plan-body"><ul class="runtime-change-list" data-runtime-change-list></ul><dl class="runtime-plan-meta"><div><dt>${L("备份")}</dt><dd data-runtime-plan-backup>${L("无须备份")}</dd></div><div><dt>${L("完成后")}</dt><dd data-runtime-plan-restart>${L("按页面提示重启 Runtime")}</dd></div></dl><label class="runtime-plan-confirm" data-runtime-confirm-row><input type="checkbox" data-runtime-confirm><span data-runtime-confirm-label>${L("我已查看并确认这份变更")}</span></label><p class="settings-form-error" data-runtime-plan-error role="alert" hidden></p></div>
      <footer><button type="button" data-runtime-plan-close>${L("取消")}</button><button class="runtime-plan-apply" type="button" data-runtime-plan-apply disabled>${L("确认应用")}</button></footer>
    </div>
  </dialog>`;
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
        ? renderProjectSettings(view)
        : renderDiagnosticsSettings(view);
  return `<!doctype html>
<html lang="${htmlLang()}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${controlTokenMeta(controlToken)}<title>${title} · ${L("Molis Work 设置")}</title><script>${THEME_BOOTSTRAP_SCRIPT}</script><link rel="stylesheet" href="/assets/molis-work-settings.css"></head>
<body class="settings-page" data-settings-section="${view.section}" data-desktop-shell="true"${desktopShell ? ' data-native-desktop="true"' : ""}>
  ${renderIconSprite()}
  <header class="topbar"><a class="brand" href="${returnHref}" aria-label="${contextProject ? L("返回 Goal Tree") : L("返回 Molis Work 项目列表")}">${icon("brand")}<strong>Molis Work</strong></a><div class="project-context"${desktopShell ? " data-tauri-drag-region" : ""}><strong${desktopShell ? " data-tauri-drag-region" : ""}>${projectManager ? L("项目管理") : L("全局设置")}</strong><small${desktopShell ? " data-tauri-drag-region" : ""}>${projectManager ? L("创建、导入和维护项目") : title}</small></div><div class="top-spacer"${desktopShell ? " data-tauri-drag-region" : ""}></div><a class="top-action" href="${returnHref}" aria-label="${L("关闭全局设置")}">${icon(desktopShell ? "x" : contextProject ? "tree" : "folder")}<span>${contextProject ? L("Goal Tree") : L("项目列表")}</span></a></header>
  <main class="settings-shell${projectManager ? " settings-shell--standalone" : ""}">
    ${projectManager ? "" : renderSettingsNavigation(view.section, contextProject, desktopShell, view.projects)}
    <div class="settings-content">${content}</div>
  </main>
  ${renderRuntimePlanDialog()}
  ${renderProjectMigrationDialog()}
  <div class="toast" data-settings-toast role="status" aria-live="polite"></div>
  <script>${clientI18nScript()}${CONTROL_CLIENT_SCRIPT}${PROJECT_INDEX_CLIENT_SCRIPT}${SETTINGS_CLIENT_SCRIPT}${VISUAL_FOUNDATION_CLIENT_SCRIPT}</script>
</body></html>`;
}


  return renderMolisWorkSettings;
}
