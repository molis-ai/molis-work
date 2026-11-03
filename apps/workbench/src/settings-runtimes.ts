import { renderHint } from "@molis-ai/molis-work-design-system";
import type { RuntimeIntegrationDetection } from "@molis-ai/molis-work-contracts/platform/app-host";
import { renderMcpAccess } from "./mcp-access.js";
import type { SettingsRenderPrimitives } from "./settings-renderer.js";
import { settingRow } from "./settings-row.js";
import type { MolisWorkSettingsView } from "./settings-view.js";

type RuntimePrimitives = Pick<SettingsRenderPrimitives, "L" | "escapeHtml" | "icon">;

function runtimeStatePresentation(state: RuntimeIntegrationDetection["connection_state"], L: RuntimePrimitives["L"]): {
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

export function renderRuntimeSettings(view: MolisWorkSettingsView, primitives: RuntimePrimitives): string {
  const { L, escapeHtml, icon } = primitives;
  const rows = view.runtimes.map((runtime) => {
    const state = runtimeStatePresentation(runtime.connection_state, L);
    const unavailable = runtime.connection_state === "not_detected" || runtime.connection_state === "molis_work_unavailable";
    const action = runtime.connection_state === "connected" ? "remove" : "connect";
    const actionLabel = action === "remove" ? L("预览移除") : runtime.connection_state === "needs_repair" ? L("预览修复") : L("查看并接入");
    return `<article data-runtime-row="${escapeHtml(runtime.runtime_id)}">
      ${settingRow(escapeHtml(runtime.display_name), escapeHtml(state.description), `<span class="settings-state settings-state--${state.tone}">${escapeHtml(state.label)}</span><button class="mw-btn mw-btn--secondary" type="button" data-runtime-plan="${escapeHtml(runtime.runtime_id)}" data-runtime-action="${action}"${unavailable ? " disabled" : ""}>${escapeHtml(actionLabel)}</button>`)}
      <details class="settings-data-disclosure"><summary><span class="setting-copy"><strong>${L("本机路径")}</strong><span>${L("查看可执行文件、配置和 Skill 位置。")}</span></span>${icon("chevron-down")}</summary><dl class="settings-data-list"><div><dt>Runtime</dt><dd>${runtime.executable_path ? escapeHtml(runtime.executable_path) : L("未找到可执行文件")}</dd></div><div><dt>${L("配置")}</dt><dd>${escapeHtml(runtime.config_path)}</dd></div><div><dt>Skill</dt><dd>${escapeHtml(runtime.skill_path)}</dd></div></dl></details>
    </article>`;
  }).join("");
  return `<section class="settings-document" aria-labelledby="settings-title">
    <header class="settings-heading"><div class="settings-heading-title"><h1 id="settings-title">${L("AI 与执行工具")}</h1>${renderHint({ id: "settings-hint-runtimes", label: L("如何生效"), text: L("当前自动适配 Codex、Claude Code、OpenCode、Pi Agent 和 Grok Build。每次确认只对应当前 Runtime 和当前预览；配置在预览后变化时会要求重新生成。Session 与运行位置请进入对应项目的 Sessions 管理。") })}</div><p>${L("不接入也能正常使用 Goal Tree、待决定和记录。只有想让 AI 工具直接读取或推进 Goal 时才需要连接；每次修改前都会先展示变化并由你确认。")}</p></header>
    <section class="settings-section" aria-label="${L("AI 与执行工具")}">${rows || `<div class="settings-empty"><strong>${L("没有可探测的 Runtime")}</strong><span>${L("Molis Work 本体仍可使用；稍后安装 Runtime 后再回来检查。")}</span></div>`}</section>
  </section>`;
}

export function renderMcpSettings(view: MolisWorkSettingsView, desktopShell: boolean, primitives: SettingsRenderPrimitives): string {
  const { L, settingsContextHref } = primitives;
  return `<section class="settings-document" aria-labelledby="settings-title" data-mcp-settings>
    <header class="settings-heading"><div class="settings-heading-title"><h1 id="settings-title">${L(view.capabilities ? "对外接入" : "MCP")}</h1>${renderHint({ id: "settings-hint-mcp", label: L("如何生效"), text: L("授权决定客户端可以发现和调用的能力。撤销后再次调用会被拒绝；客户端可能需要刷新自己的工具列表。") })}</div><p>${L("选择客户端，决定它可以读取什么、执行哪些操作。")}</p><p><a href="${settingsContextHref("/settings/runtimes", view.context_project ?? null, desktopShell)}">${L("连接外部 AI 工具")}</a></p></header>
    ${view.mcp_access ? renderMcpAccess(view.mcp_access, view.projects, desktopShell, primitives) : ""}
    <p class="settings-form-error" data-mcp-settings-error role="alert" hidden></p>
  </section>`;
}
