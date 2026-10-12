import { renderHint } from "@molis-ai/molis-work-design-system";
import { renderAgentDiagnostics } from "./settings-agent-diagnostics.js";
import { renderCallRow, type CallRowView } from "./call-row.js";
import { settingRow } from "./settings-row.js";
import type { SettingsRenderPrimitives } from "./settings-renderer.js";
import type { MolisWorkSettingsView } from "./settings-view.js";

type DiagnosticsPrimitives = Pick<SettingsRenderPrimitives, "L" | "escapeHtml" | "icon" | "withDesktopQuery">;

/** Where a row's project is, and the way to the call history of that project; a project deleted since has none to open. */
function callPlace(row: CallRowView, view: MolisWorkSettingsView, p: DiagnosticsPrimitives, desktopShell: boolean): { label: string; href?: string } {
  const href = (path: string) => desktopShell ? p.withDesktopQuery(path) : path;
  if (row.project_id === null) return { label: p.L("不属于任何项目"), href: href("/capabilities/history") };
  const project = view.projects.find(item => item.project_id === row.project_id);
  return project ? { label: project.display_name, href: href(`/capabilities/history?project=${encodeURIComponent(project.project_id)}`) } : { label: p.L("已不存在的项目") };
}

/** Look a call up by its 诊断编号, as the error that showed it gave it; or, with none asked for, the newest calls that failed or were turned away. A view the Host gave no call rows has no such section. */
function renderCallLookup(view: MolisWorkSettingsView, p: DiagnosticsPrimitives, desktopShell: boolean): string {
  const { L, escapeHtml: e } = p;
  const query = view.call_query;
  if (!query) return "";
  const context = view.context_project ?? null;
  const rows = (list: readonly CallRowView[]) => `<div class="capability-history">${list.map(row => renderCallRow(row, p, callPlace(row, view, p, desktopShell))).join("")}</div>`;
  const note = (title: string, detail: string) => `<div class="settings-empty" role="status"><strong>${title}</strong><span>${detail}</span></div>`;
  let result: string;
  if (query.text === "") {
    const recent = view.recent_calls ?? [];
    result = `<h3>${L("最近失败或未执行的调用")}</h3>${recent.length ? rows(recent)
      : note(L("最近没有失败或未执行的调用"), L("失败的调用和被拒绝的调用会出现在这里；成功的读取不记录。"))}`;
  } else if (query.matches === undefined) {
    result = note(L("诊断编号至少要 {count} 位", { count: query.min_length }), L("再多输入几位，才能准确找到这次操作。"));
  } else if (query.matches.length === 0) {
    result = note(L("没有找到以 {id} 开头的诊断编号", { id: e(query.text) }), L("调用记录只保留最近的调用，更早的会被整理掉；有些操作也不留记录。"));
  } else {
    result = `<p class="capability-count" role="status">${L("找到 {count} 条记录", { count: query.matches.length })}</p>${rows(query.matches)}`;
  }
  return `<section class="settings-section" aria-labelledby="call-lookup-title" data-call-lookup-section>
      <h2 id="call-lookup-title">${L("按诊断编号查找")}</h2>
      <p>${L("在报错详情里复制诊断编号，粘贴到这里（至少 {count} 位），可以找到这次操作经过的每一步：谁调用了什么、结果如何。不含输入和返回内容。", { count: query.min_length })}</p>
      <form class="capability-filters" data-call-lookup action="/settings/diagnostics" method="get">${context ? `<input type="hidden" name="project" value="${e(context.project_id)}">` : ""}${desktopShell ? '<input type="hidden" name="desktop" value="1">' : ""}
        <label class="capability-search">${L("诊断编号")}<input type="search" name="call" value="${e(query.text)}" maxlength="64" autocomplete="off" spellcheck="false" placeholder="${L("例如 a1b2c3d4")}"></label>
        <button class="mw-btn mw-btn--secondary" type="submit">${L("查找")}</button>
      </form>
      ${result}
    </section>`;
}

/** The diagnostics page: how to find a call by its 诊断编号, then the installation, the registries, the launchers and the resident service. */
export function renderDiagnosticsSettings(view: MolisWorkSettingsView, p: DiagnosticsPrimitives, desktopShell: boolean): string {
  const { L, escapeHtml, icon } = p;
  const diagnostics = view.diagnostics;
  const service = view.web_service;
  const installation = diagnostics.installation_state === "ready"
    ? { label: L("安装完整"), tone: "success" }
    : diagnostics.installation_state === "missing"
      ? { label: L("尚未安装本体"), tone: "warning" }
      : { label: L("安装清单无效"), tone: "danger" };
  const launchers = diagnostics.launchers.map((launcher) => settingRow(escapeHtml(launcher.name), escapeHtml(launcher.path), `<span class="settings-state settings-state--${launcher.state === "ready" ? "success" : "danger"}">${launcher.state === "ready" ? L("可用") : L("缺失")}</span>`)).join("");
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
  const serviceButtons = serviceActions.map(([action, label]) => `<button class="mw-btn mw-btn--secondary" type="button" data-web-service-action="${action}">${label}</button>`).join("");
  const serviceMessage = service.message ? escapeHtml(L(service.message)) : "";
  return `<section class="settings-document" aria-labelledby="settings-title">
    <header class="settings-heading"><div class="settings-heading-title"><h1 id="settings-title">${L("诊断")}</h1>${renderHint({ id: "settings-hint-diagnostics", label: L("如何生效"), html: `${escapeHtml(L("如果本体不完整，请在终端重新运行 "))}<code>molis-work install</code>${escapeHtml(L("。常驻服务操作会先展示预览并要求确认；不会在后台使用 nohup。"))}` })}</div><p>${L("这里只读取 Molis Work 自己的安装状态和调用记录，不扫描项目内容，也不会自动修复或修改 Runtime。")}</p></header>
    ${renderCallLookup(view, p, desktopShell)}
    <section class="settings-section" aria-label="${L("Molis Work 本体")}">
      ${settingRow(L("安装状态"), L("只检查本机安装清单，不扫描项目内容。"), `<span class="settings-state settings-state--${installation.tone}">${installation.label}</span>`)}
      ${settingRow(L("版本"), L("当前安装的产品版本。"), `<span class="setting-number">${escapeHtml(diagnostics.version ?? L("未识别"))}</span>`)}
      ${settingRow(L("项目数"), L("本机已经创建的项目数量。"), `<span class="setting-number">${diagnostics.project_count}</span>`)}
      <details class="settings-data-disclosure"><summary><span class="setting-copy"><strong>${L("本机路径")}</strong><span>${L("查看安装目录与发布位置。")}</span></span>${icon("chevron-down")}</summary><dl class="settings-data-list"><div><dt>Home</dt><dd>${escapeHtml(diagnostics.home_directory)}</dd></div><div><dt>Release</dt><dd>${escapeHtml(diagnostics.release_directory ?? L("未找到"))}</dd></div></dl></details>
    </section>
    <section class="settings-section" aria-label="${L("提示词与角色登记")}">
      ${settingRow(L("提示词与角色登记"), L("查看每个来源登记了什么、哪些没有生效。"), `<a class="mw-btn mw-btn--secondary mw-btn--sm" href="/settings/prompts#diagnostics">${L("开发者诊断")}</a>`)}
    </section>
    ${renderAgentDiagnostics({ L })}
    <section class="settings-section" aria-labelledby="launcher-title"><h2 id="launcher-title">${L("启动入口")}</h2>${launchers}</section>
    <section class="settings-section settings-project-maintenance" aria-labelledby="web-service-title">
      <h2 id="web-service-title">${L("Web 常驻服务")}</h2>
      <section class="project-manager-danger" aria-labelledby="web-service-state">
        <h3 id="web-service-state"><span class="settings-state settings-state--${serviceTone}">${serviceLabel}</span></h3>
        ${serviceMessage ? `<p>${serviceMessage}</p>` : ""}
        ${serviceButtons ? `<div class="project-manager-danger-actions">${serviceButtons}</div>` : ""}
        <p class="settings-form-error" data-web-service-error role="alert" hidden></p>
      </section>
      <details class="settings-data-disclosure"><summary><span class="setting-copy"><strong>${L("服务配置与日志")}</strong><span>${L("查看方式、命令、配置和日志路径。")}</span></span>${icon("chevron-down")}</summary><dl class="settings-data-list"><div><dt>${L("方式")}</dt><dd>${service.provider === "macos-launchagent" ? L("macOS 用户级 LaunchAgent") : L("尚未提供")}</dd></div><div><dt>${L("命令")}</dt><dd>${escapeHtml(service.command.join(" "))}</dd></div><div><dt>${L("配置")}</dt><dd>${escapeHtml(service.plist_path)}</dd></div><div><dt>${L("日志")}</dt><dd>${escapeHtml(service.stdout_log)}<br>${escapeHtml(service.stderr_log)}</dd></div></dl></details>
    </section>
  </section>`;
}
