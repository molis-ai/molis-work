import { codingUsageSummary } from "./usage.js";
import type {
  UiContribution,
  UiContributionDescriptor,
  UiRenderRequest,
} from "@molis-ai/molis-work-contracts/platform/ui";
import { renderButton, renderTextarea, renderStatusMark } from "@molis-ai/molis-work-design-system";
import type {
  AgentPendingQuestion,
  AgentRunUsage,
} from "@molis-ai/molis-work-contracts/services/agent-host";
import type { CodingIdentityView } from "./identity.js";
import {
  filterSessions,
  groupByGoal,
  type CodingDirectoryFilter,
  type CodingSessionEntry,
  type CodingSessionState,
  type CodingToolAvailability,
} from "./projection.js";

export const CODING_UI_CONTRIBUTION_ID = "io.molis.work.native.coding.ui.v1";
export const CODING_SETTINGS_UI_CONTRIBUTION_ID = "io.molis.work.native.coding.settings.v1";

export type CodingUiSurface = "directory" | "workbench";

/** The five navigation faces the directory column switches between. */
export const CODING_DIRECTORY_FACES = [
  { face: "sessions", label: "会话", icon: "message" },
  { face: "taskboard", label: "TaskBoard", icon: "grid" },
  { face: "goals", label: "目标", icon: "target" },
  { face: "artifacts", label: "产物", icon: "package" },
  { face: "files", label: "文件", icon: "folder" },
] as const;

export type CodingDirectoryFace = (typeof CODING_DIRECTORY_FACES)[number]["face"];

export interface CodingUiPrimitives {
  escape(value: unknown): string;
  icon(name: string): string;
  text(value: string, values?: Record<string, string | number>): string;
  formatDate(value: string): string;
}

export interface CodingUiModel {
  readonly route_prefix: string;
  readonly face: CodingDirectoryFace;
  readonly filter: CodingDirectoryFilter;
  readonly sessions: readonly CodingSessionEntry[];
  readonly tools: readonly CodingToolAvailability[];
  /** Host-authorized workspace, or null when this project has none bound. */
  readonly workspace_path: string | null;
  /** Trusted HTML contributed by companion plugins through the Host. */
  readonly companion_directory?: string;
  readonly companion_result?: string;
  readonly primitives: CodingUiPrimitives;
}

export const codingUiDescriptor: UiContributionDescriptor = {
  contribution_id: CODING_UI_CONTRIBUTION_ID,
  plugin_id: "io.molis.work.coding",
  kind: "primary-page",
  navigation_id: "coding",
  label: "Coding",
  surfaces: [
    { surface_id: "directory", target_slot_id: "workbench.directory", format: "declarative-html" },
    { surface_id: "workbench", target_slot_id: "workbench.main", format: "declarative-html" },
  ],
  slots: [],
};

/** How a session's state reads. Status is an icon plus family-coloured text, never a pill. */
const STATE_MARK: Record<CodingSessionState, { icon: string; tone: string; label: string }> = {
  "idle": { icon: "message", tone: "idle", label: "尚未执行" },
  "running": { icon: "loader", tone: "progress", label: "执行中" },
  "waiting-answer": { icon: "help-circle", tone: "attention", label: "等你回答" },
  "waiting-approval": { icon: "alert-circle", tone: "attention", label: "等你审查" },
  "failed": { icon: "alert-triangle", tone: "blocked", label: "失败待处理" },
  "stopped": { icon: "slash", tone: "idle", label: "你停下的" },
  "cancelled": { icon: "x", tone: "idle", label: "已取消" },
  "reconcile-required": { icon: "alert-circle", tone: "attention", label: "需要你核对结果" },
  "done": { icon: "check", tone: "done", label: "本轮结束" },
};

export const codingUiContribution: UiContribution<CodingUiModel> = {
  descriptor: codingUiDescriptor,
  render(request: UiRenderRequest<CodingUiModel>): string {
    switch (request.surface as CodingUiSurface) {
      case "directory":
        return renderCodingDirectory(request.model);
      case "workbench":
        return renderCodingWorkbench(request.model);
      default:
        throw new Error(`Coding UI surface ${(request as UiRenderRequest).surface} 不存在`);
    }
  },
};

export function renderCodingDirectory(model: CodingUiModel): string {
  const { primitives: p } = model;
  const faces = CODING_DIRECTORY_FACES.map((face) => `<button type="button" class="mw-toggle coding-face" data-coding-face="${face.face}"${face.face === model.face ? ' aria-selected="true"' : ""} aria-label="${p.escape(face.label)}">${p.icon(face.icon)}</button>`).join("");
  const filters = (["all", "running", "needs-you"] as const).map((filter) => `<button type="button" class="mw-toggle coding-filter" data-coding-filter="${filter}"${filter === model.filter ? ' aria-selected="true"' : ""}>${p.escape(filterLabel(filter))}</button>`).join("");
  const groups = groupByGoal(filterSessions(model.sessions, model.filter))
    .map((group) => renderGroup(group.goal_id, group.title, group.entries, p))
    .join("");
  return `<section class="coding-directory" data-coding-directory data-coding-current-face="${model.face}">
    <nav class="coding-faces" aria-label="${p.escape("Coding 导航面")}">${faces}</nav>
    <header class="coding-directory-head"><h2>${p.escape(faceLabel(model.face))}</h2><button type="button" class="mw-btn mw-btn--icon-only" data-coding-new aria-label="新建编码会话">${p.icon("plus")}</button></header>
    <label class="coding-search"><span>搜索标题</span><input class="mw-input" data-coding-search aria-label="搜索会话标题" placeholder="搜索会话标题"></label>
    <div class="coding-filters" role="group" aria-label="${p.escape("会话筛选")}">${filters}</div>
    <div class="coding-session-list" data-coding-sessions>${groups || renderEmpty(p)}</div>
    <section data-coding-artifact-directory hidden aria-label="已保存的 Coding 成果">
      <label class="coding-search"><span>搜索成果</span><input class="mw-input" data-coding-artifact-search aria-label="搜索固定成果" placeholder="搜索固定成果"></label>
      <button class="mw-btn mw-btn--ghost" type="button" data-coding-artifact-refresh>刷新成果</button>
      <p data-coding-artifact-status role="status"></p><div data-coding-artifact-list></div>
    </section>
    ${model.companion_directory ?? ""}
  </section>`;
}

function renderGroup(
  goalId: string | null,
  title: string,
  entries: readonly CodingSessionEntry[],
  p: CodingUiPrimitives,
): string {
  const rows = entries.map((entry) => {
    const mark = STATE_MARK[entry.state];
    return `<a class="coding-session-row" href="#session-${p.escape(entry.session_id)}" data-coding-session="${p.escape(entry.session_id)}">
      <span class="coding-session-title">${p.escape(entry.title)}</span>
      <time class="coding-session-time">${p.escape(p.formatDate(entry.updated_at))}</time>
      <span class="mw-status" data-tone="${mark.tone}">${p.icon(mark.icon)}${p.escape(mark.label)}</span>
    </a>`;
  }).join("");
  return `<section class="coding-session-group"${goalId === null ? "" : ` data-coding-goal="${p.escape(goalId)}"`}>
    <h3>${goalId === null ? "" : p.icon("target")}${p.escape(title)}</h3>
    ${rows}
  </section>`;
}

function renderEmpty(p: CodingUiPrimitives): string {
  return `<div class="mw-empty" data-coding-empty>${p.icon("code")}<p>${p.escape("还没有编码会话")}</p></div>`;
}

export function renderCodingWorkbench(model: CodingUiModel): string {
  const { primitives: p } = model;
  // Relative global URL survives the host's project-local link prefixing.
  const settingsHref = "../".repeat(model.route_prefix.split("/").filter(Boolean).length) + "settings/coding-settings?project=" + encodeURIComponent(model.route_prefix.split("/").filter(Boolean).at(-1) ?? "");
  const tools = model.tools.map((tool) => renderToolTab(tool, p)).join("");
  const panels = model.tools.map((tool) => renderToolPanel(tool, p)).join("");
  return `<section class="desktop-work-surface plugin-stage-shell" data-work-surface="coding" data-work-surface-label="Coding" hidden data-coding-workbench data-coding-prefix="${p.escape(model.route_prefix)}">
    <dialog class="mw-dialog mw-dialog--form" data-coding-workspace-dialog aria-label="选择工作区"><form class="mw-form mw-dialog__shell" data-coding-workspace-form>
      <header class="mw-form__header"><h2>选择工作区</h2><button class="mw-btn" type="button" data-coding-workspace-close>关闭</button></header>
      <section class="mw-form__body"><label class="mw-field">已关联的目录<select class="mw-select" data-coding-workspace-choice></select></label>
      <label class="mw-field">或者关联新目录<input class="mw-input" data-coding-workspace-path placeholder="这台电脑上的绝对路径" autocomplete="off"></label>
      <label class="mw-field"><span><input type="checkbox" data-coding-workspace-confirm> 确认把新目录关联到当前项目，作为任务工作区。</span></label>
      <p>选择用于下一轮；正在执行的任务继续使用原工作区。</p><p data-coding-workspace-error role="alert"></p></section>
      <footer class="mw-form__footer"><button class="mw-btn mw-btn--primary" type="submit">使用这个工作区</button></footer>
    </form></dialog>
    <dialog class="mw-dialog mw-dialog--form" data-coding-mcp-dialog aria-label="选择 MCP 工具与资料"><form class="mw-form mw-dialog__shell" data-coding-mcp-form>
      <header class="mw-dialog__header"><h2>选择 MCP 工具与资料</h2>${renderButton({label:"取消",variant:"ghost",attrs:{"data-coding-mcp-close":""}})}</header>
      <p>选择仅用于下一轮。选中的服务可供读取资料；外部工具需选择执行方式，并逐笔审查。只选资料可以继续使用讨论或评审。断开或版本变化后需重新选择。</p>
      <p><a data-coding-mcp-settings-link href="${p.escape(settingsHref)}">配置 MCP 服务</a></p>
      <div data-coding-mcp-list></div><p role="alert" data-coding-mcp-error></p>
      <footer class="mw-dialog__footer">${renderButton({label:"保存 MCP 选择",type:"submit"})}</footer>
    </form></dialog>
    <dialog class="mw-dialog mw-dialog--form" data-coding-goal-dialog aria-label="关联目标"><form class="mw-form mw-dialog__shell" data-coding-goal-form>
      <header class="mw-form__header"><h2>下一轮关联目标</h2>${renderButton({label:"取消",variant:"ghost",attrs:{"data-coding-goal-close":""}})}</header>
      <section class="mw-form__body"><p>先查看目标，再确认使用的版本。只影响下一轮；正在执行的任务和历史成果保留原目标。也可以不关联目标。</p>
        ${renderButton({label:"不关联目标",variant:"secondary",attrs:{"data-coding-goal-none":""}})}
        <label class="mw-form__field">搜索已加载目标<input class="mw-input" data-coding-goal-search type="search"></label>
        <div data-coding-goal-list></div>${renderButton({label:"加载更多目标",variant:"ghost",attrs:{"data-coding-goal-more":"",hidden:""}})}
        <section class="coding-material" data-coding-goal-preview></section><p data-coding-goal-error role="alert"></p>
      </section><footer class="mw-form__footer">${renderButton({label:"确认目标版本",type:"submit",attrs:{"data-coding-goal-save":""}})}</footer>
    </form></dialog>
    <dialog class="mw-dialog mw-dialog--form" data-coding-progress-dialog aria-label="记录原目标进展"><form class="mw-form mw-dialog__shell" data-coding-progress-form>
      <header class="mw-form__header"><h2>记录原目标进展</h2>${renderButton({label:"关闭",variant:"ghost",attrs:{"data-coding-progress-close":""}})}</header>
      <section class="mw-form__body"><p>这份报告只写回本轮原目标。记录进展不会验收、完成或恢复目标，也不会执行新的任务。</p>
        <section class="coding-material" data-coding-progress-facts></section>
        <details class="coding-material"><summary>固定来源与目标版本</summary><pre data-coding-progress-source></pre></details>
        <label class="mw-form__field">进展内容<textarea class="mw-textarea" data-coding-progress-summary maxlength="10000" rows="4" placeholder="已完成什么、还有什么未验证或需要决定？"></textarea></label>
        <label class="mw-form__field">下一步（可选）<textarea class="mw-textarea" data-coding-progress-next maxlength="10000" rows="2"></textarea></label>
        <p data-coding-progress-status role="status"></p>
      </section><footer class="mw-form__footer">
        ${renderButton({label:"重新读取目标",variant:"secondary",attrs:{"data-coding-progress-refresh":""}})}
        ${renderButton({label:"打开原目标",variant:"secondary",attrs:{"data-coding-progress-goal":"",hidden:""}})}
        ${renderButton({label:"确认记录进展",type:"submit",attrs:{"data-coding-progress-save":""}})}
      </footer>
    </form></dialog>
    <dialog class="mw-dialog mw-dialog--form" data-coding-material-dialog aria-label="选择固定材料"><form class="mw-form mw-dialog__shell" data-coding-material-form>
      <header class="mw-form__header"><h2>选择固定材料</h2>${renderButton({label:"取消",variant:"ghost",attrs:{"data-coding-material-close":""}})}</header>
      <section class="mw-form__body"><p>选择下一轮使用的固定文件、差异、Git 结果或 Shelf 材料。保存不会发送；来源更新后，已选版本保持不变。</p><div data-coding-material-list></div><p data-coding-material-error role="alert"></p></section>
      <footer class="mw-form__footer">${renderButton({label:"保存材料选择",type:"submit",attrs:{"data-coding-material-save":""}})}</footer>
    </form></dialog>
    <dialog class="mw-dialog mw-dialog--form" data-coding-character-dialog aria-label="选择角色"><form class="mw-form mw-dialog__shell" data-coding-character-form>
      <header class="mw-form__header"><h2>选择角色</h2>${renderButton({label:"取消",variant:"ghost",attrs:{"data-coding-character-close":""}})}</header>
      <section class="mw-form__body"><p>选择下一轮使用的已发布版本，也可以不使用角色。保存不会发送；后续编辑或发布不改变已选版本，在跑任务保留原内容。</p><div data-coding-character-list></div><p data-coding-character-error role="alert"></p></section>
      <footer class="mw-form__footer">${renderButton({label:"保存角色选择",type:"submit",attrs:{"data-coding-character-save":""}})}</footer>
    </form></dialog>
    <dialog class="mw-dialog mw-dialog--form" data-coding-method-dialog aria-label="选择方法"><form class="mw-form mw-dialog__shell" data-coding-method-form>
      <header class="mw-form__header"><h2>选择方法</h2>${renderButton({label:"取消",variant:"secondary",attrs:{"data-coding-method-close":""}})}</header>
      <section class="mw-form__body"><label class="mw-field">搜索方法<input class="mw-input" data-coding-method-search placeholder="名称或说明"></label>
      <p>方法为下一轮提供做事步骤，不增加权限。不选择也能直接执行任务。</p>
      <div data-coding-method-list></div><article data-coding-method-document hidden></article><p data-coding-method-error role="alert"></p></section>
      <footer class="mw-form__footer">${renderButton({label:"保存选择",variant:"primary",type:"submit"})}</footer>
    </form></dialog>
    <div class="coding-stage" data-coding-stage>
      <div class="coding-dialogue" data-coding-dialogue>
        <header class="coding-dialogue-head" data-coding-dialogue-head>
          <div><span data-coding-title>选择或新建编码会话</span><small data-coding-workspace-label>${renderWorkspaceLine(model.workspace_path, p)}</small><small data-coding-goal-label></small></div>
          <button class="mw-btn" type="button" data-coding-goal-open disabled>关联目标</button>
          <button class="mw-btn" type="button" data-coding-workspace-open>工作区</button>
          <button class="mw-btn" type="button" data-coding-rename hidden>重命名</button><button class="mw-btn" type="button" data-coding-stop hidden>停止</button>
        </header>
        <div class="coding-turns" data-coding-turns tabindex="0" aria-label="编码对话"><div class="mw-empty" data-coding-welcome><p>从一个具体问题开始</p><p>选择已授权工作区和模型后，讨论代码或开始任务。</p><button class="mw-btn" type="button" data-coding-new>新建编码会话</button></div></div>
        <section class="coding-turns" data-coding-report-reader aria-label="执行报告" tabindex="0" hidden>
          <header><button class="mw-btn" type="button" data-coding-report-close>返回对话</button><button class="mw-btn" type="button" data-coding-report-save>保存固定报告</button><button class="mw-btn" type="button" data-coding-report-progress hidden>记录原目标进展</button><button class="mw-btn" type="button" data-coding-report-output hidden>设为报告输出</button></header>
          <p data-coding-report-status role="status"></p><p data-coding-report-output-status role="status" hidden></p><div data-coding-report-body></div>
        </section>
        <button class="mw-btn coding-jump" type="button" data-coding-latest hidden>回到最新</button>
        <p class="coding-status" data-coding-status role="status" aria-live="polite"></p>
        <form class="coding-composer" data-coding-composer>
          <label class="coding-task-label" for="coding-task">任务或补充要求</label>
          <textarea class="mw-input" id="coding-task" data-coding-task rows="3" placeholder="描述要完成的任务…" disabled></textarea>
          <div class="coding-composer-actions">${renderButton({label:"＋ 材料",variant:"secondary",attrs:{"data-coding-material-open":"","aria-label":"选择固定材料"}})}${renderButton({label:"角色",variant:"secondary",attrs:{"data-coding-character-open":"","aria-label":"选择角色"}})}${renderButton({label:"/ 方法",variant:"secondary",attrs:{"data-coding-method-open":"","aria-label":"选择方法"}})}${renderButton({label:"MCP",variant:"secondary",attrs:{"data-coding-mcp-open":"","aria-label":"选择 MCP 工具与资料"}})}<select class="mw-select" data-coding-intent aria-label="任务方式"><option value="discuss">讨论</option><option value="edit" disabled>修改文件（待接通审批）</option><option value="execute" disabled>执行（待接通审批）</option><option value="review">评审</option></select>
          <select class="mw-select" data-coding-model aria-label="下一轮使用的模型"></select><button class="mw-btn mw-btn--primary" type="submit" data-coding-send disabled>发送</button></div>
          <small data-coding-draft-status>模型与方式的选择用于下一轮。</small>
        </form>
      </div>
      <aside class="coding-tools" data-coding-tools>
        <nav class="coding-tool-tabs" aria-label="${p.escape("结果与工具")}">${tools || '<span>结果</span>'}</nav>
        ${model.companion_result ?? ""}
        <section class="coding-result" data-coding-recovery hidden aria-label="中断恢复">
          <h3>核对中断结果</h3>
          <p>先核对已发生的操作，再结束中断轮次。不会自动重跑任务或撤销操作；未保存的过程和用量无法补回。</p>
          <button class="mw-btn" type="button" data-coding-recovery-refresh>重新核对</button>
          <p data-coding-recovery-status role="status"></p><div data-coding-recovery-list></div>
        </section>
        <section class="coding-result" data-coding-checkpoints aria-label="文件检查点">
          <details><summary>文件检查点</summary><p>回到所列文件的一次修改前；不会撤销命令和外部操作，也不会删除对话。</p>
          <button class="mw-btn" type="button" data-coding-checkpoints-refresh>刷新检查点</button>
          <p data-coding-checkpoints-status role="status">选择会话后查看。</p><div data-coding-checkpoints-list></div></details>
        </section><div data-coding-host-reviews hidden></div><div class="coding-result" data-coding-result><p>任务成果与执行记录会留在这里，方便审查和继续。</p></div>
        <section class="coding-result" data-coding-changes hidden aria-label="固定变更入口"><h3>本轮固定变更</h3><div data-coding-changes-list></div></section>
        <section class="coding-result" data-coding-reports hidden aria-label="执行报告"><h3>执行报告</h3><p>选择已结束的一轮，查看证据并保存固定版本。</p><div data-coding-report-list></div></section>
        <section class="coding-result" data-coding-change-reader aria-label="本轮固定变更" hidden>
          <header><button class="mw-btn" type="button" data-coding-change-close>收起变更</button><button class="mw-btn" type="button" data-coding-change-save>保存固定变更</button><button class="mw-btn" type="button" data-coding-change-output disabled>设为变更输出</button></header>
          <p data-coding-change-status role="status"></p><nav data-coding-change-files aria-label="本轮文件修改"></nav><div data-coding-change-body></div>
          <h3>行级意见</h3><p>保存后点击前后行号添加意见；加入原任务草稿后，由你选择方式并发送。意见不代表批准写入。</p>
          <div data-coding-feedback-list></div><button class="mw-btn" type="button" data-coding-feedback-return disabled>加入原任务草稿</button>
        </section>
        <section class="coding-result" data-coding-commands aria-label="命令与检查回执" hidden></section>${panels}
      </aside>
    </div>
  </section>`;
}

function renderWorkspaceLine(workspacePath: string | null, p: CodingUiPrimitives): string {
  // A project with no workspace bound says so; it never shows a guessed path.
  if (workspacePath === null) {
    return `<span class="mw-status" data-tone="attention">${p.icon("alert-circle")}${p.escape("这个项目还没有绑定工作区目录")}</span>`;
  }
  return `<span class="coding-workspace" data-coding-workspace>${p.icon("folder")}${p.escape(workspacePath)}</span>`;
}

function renderToolTab(tool: CodingToolAvailability, p: CodingUiPrimitives): string {
  const label = toolLabel(tool.page);
  // An unusable page keeps its tab, disabled, carrying the reason: hiding it
  // would leave the user wondering where it went.
  return `<button type="button" class="coding-tool-tab" data-coding-tool="${tool.page}"${tool.available ? "" : " disabled"}${tool.reason === undefined ? "" : ` title="${p.escape(tool.reason)}"`}>${p.escape(label)}</button>`;
}

function renderToolPanel(tool: CodingToolAvailability, p: CodingUiPrimitives): string {
  if (!tool.available) {
    return `<div class="coding-tool-panel is-unavailable" data-coding-tool-panel="${tool.page}" hidden>
      <div class="mw-empty">${p.icon("slash")}<p>${p.escape(tool.reason ?? "这一页现在不可用")}</p></div>
    </div>`;
  }
  return `<div class="coding-tool-panel" data-coding-tool-panel="${tool.page}" hidden></div>`;
}

function faceLabel(face: CodingDirectoryFace): string {
  return CODING_DIRECTORY_FACES.find((entry) => entry.face === face)?.label ?? face;
}

function filterLabel(filter: CodingDirectoryFilter): string {
  if (filter === "all") return "全部";
  if (filter === "running") return "进行中";
  return "需要我";
}

function toolLabel(page: CodingToolAvailability["page"]): string {
  if (page === "result") return "结果";
  if (page === "browser") return "浏览器";
  if (page === "terminal") return "终端";
  return "Canvas";
}

export interface CodingSettingsModel {
  /** Roles this build offers, from the Agent Manifest. */
  readonly roles: ReadonlyArray<{ role_id: string; name: string; execution: string }>;
  /** Runtimes the Host registered, with whether each can run a writing role. */
  readonly runtimes: ReadonlyArray<{ runtime_id: string; display_name: string; can_write: boolean; can_command?: boolean; methods?: string }>;
  readonly methods?: ReadonlyArray<{ name: string; version: number; summary?: string }>;
  readonly project_href?: string | null;
  readonly project_name?: string;
  readonly projects?: ReadonlyArray<{ project_id: string; name: string }>;
  readonly primitives: CodingUiPrimitives;
}

export const codingSettingsDescriptor: UiContributionDescriptor = {
  contribution_id: CODING_SETTINGS_UI_CONTRIBUTION_ID,
  plugin_id: "io.molis.work.coding",
  kind: "settings-page",
  navigation_id: "coding-settings",
  label: "Coding",
  surfaces: [
    { surface_id: "settings", target_slot_id: "workbench.settings", format: "declarative-html" },
  ],
  slots: [],
};

/**
 * Coding's own settings.
 *
 * It states what this build can actually do rather than offering switches that
 * do nothing: which roles exist, and which Runtimes can carry a role that
 * writes. Model and credential settings belong to the Host and are linked, not
 * duplicated here.
 */
export function renderCodingSettings(model: CodingSettingsModel): string {
  const { primitives: p } = model;
  const roles = model.roles.map((role) => `<div class="settings-setting-row"><div class="setting-copy"><strong>${p.escape(role.name)}</strong><span>${p.escape(role.role_id === "coordinator" || role.role_id === "writers" ? "计划协作尚未接通" : executionLabel(role.execution))}</span></div></div>`).join("");
  const runtimes = model.runtimes.length === 0
    ? `<p class="model-field-hint">${p.escape("宿主还没有注册任何运行时")}</p>`
    : model.runtimes.map((runtime) => `<div class="settings-setting-row"><div class="setting-copy"><strong>${p.escape(runtime.display_name)}</strong><span>${p.escape(runtime.can_write ? runtime.can_command ? "可读取、修改文件和运行命令；写入与命令经过宿主审查。" : "可读取和修改文件；写入经过宿主审查。" : "只读：写入未接宿主审批")}</span><span>${p.escape(runtime.methods === "partial" ? "方法：支持安装和显式选择，执行冻结正文；自动选择尚未接通。" : runtime.methods === "supported" ? "方法：运行时已接通" : "方法：当前运行时不可用")}</span></div></div>`).join("");
  const methods = (model.methods ?? []).map(method => `<div class="settings-setting-row"><div class="setting-copy"><strong>${p.escape(method.name)} · v${method.version}</strong><span>${p.escape(method.summary ?? "")}</span></div></div>`).join("");
  return `<section class="settings-document coding-settings" data-coding-settings>
    <header class="settings-heading"><div class="settings-heading-title"><h1>${p.escape("Coding")}</h1></div>
      <p>${p.escape("查看当前可用的执行方式与方法，在编码会话中选择本轮使用的配置。")}</p>
      <p><a href="/settings/models">${p.escape("配置模型与凭据")}</a>${model.project_href ? ` · <a data-settings-return-workbench href="${p.escape(model.project_href)}?returnToWorkbench=1">${p.escape("返回工作台")}</a>` : ""}</p>
    </header>
    <section class="settings-section" aria-label="${p.escape("角色")}">
      <h2>${p.escape("内置执行方式")}</h2>
      ${roles}
    </section>
    <section class="settings-section" aria-label="${p.escape("运行时")}">
      <h2>${p.escape("运行时")}</h2>
      ${runtimes}
    </section>
    <section class="settings-section" aria-label="${p.escape("方法")}">
      <h2>${p.escape("方法")}</h2>
      <p>${p.escape("在编码会话输入区点「方法」或输入 /，阅读正文并选择。改选只影响下一轮，执行记录保留当时的版本。")}</p>
      ${methods}
      <h3>项目方法</h3>
      ${model.project_href ? `<div data-coding-method-library data-prefix="${p.escape(model.project_href)}">
        <p>当前项目：${p.escape(model.project_name ?? "当前项目")} · <a href="/settings/coding-settings">切换项目</a></p>
        <p>方法保存在当前项目，安装后需在会话中选择。安装不执行包内脚本，不增加工具权限；同名方法不会覆盖。</p>
        <form data-method-discovery-form class="mw-form-stack">
          <label class="mw-field">授权工作区<select class="mw-select" data-method-workspace aria-label="方法来源工作区"></select></label>
          <label class="mw-field">相对目录<input class="mw-input" data-method-path aria-label="方法相对目录" value="skills" required maxlength="1000"></label>
          <div>${renderButton({ label: "发现方法", type: "submit", disabled: true, attrs: { "data-method-discover": "" } })}</div>
        </form>
        <p data-method-library-status role="status">正在读取项目方法…</p>
        <div data-method-candidates></div>
        <h3>已安装</h3><div data-installed-methods></div>
      </div>
      <section data-coding-mcp-settings data-prefix="${p.escape(model.project_href)}">
        <h2>MCP 服务</h2><p>配置归当前项目。保存后手动连接，再在会话中选择工具；外部工具调用经过宿主审查。</p>
        <div data-mcp-servers></div>
        <h3 data-mcp-form-title>添加 MCP 服务</h3>
        <form data-mcp-config class="mw-form-stack">
          <label class="mw-field">名称<input class="mw-input" name="label" required maxlength="128" aria-label="MCP 名称"></label>
          <label class="mw-field">连接方式<select class="mw-select" name="transport" aria-label="MCP 连接方式"><option value="stdio">本机进程（stdio）</option><option value="http">HTTP</option></select></label>
          <div data-mcp-stdio class="mw-form-stack">
            <label class="mw-field">授权工作区<select class="mw-select" name="workspace" aria-label="MCP 工作区"></select></label>
            <label class="mw-field">可执行文件<input class="mw-input" name="executable" aria-label="MCP 可执行文件"></label>
            <label class="mw-field">参数（JSON 数组）<textarea class="mw-textarea" name="argv" aria-label="MCP 参数">[]</textarea></label>
            <p>连接会启动此命令。不继承任意环境变量；请使用已确认的本机服务，不填写 shell 拼接语句。</p>
          </div>
          <div data-mcp-http class="mw-form-stack" hidden>
            <label class="mw-field">服务地址<input class="mw-input" name="endpoint" aria-label="MCP 地址" placeholder="https://example.com/mcp"></label>
            <label class="mw-field">认证<select class="mw-select" name="auth" aria-label="MCP 认证"><option value="none">无认证</option><option value="keep-existing">保留原凭据</option><option value="replace-secret">使用新 Bearer 凭据</option></select></label>
            <label class="mw-field">新凭据<input class="mw-input" type="password" name="secret" autocomplete="off" aria-label="MCP 新凭据"></label>
          </div>
          <label class="mw-field">请求超时（毫秒）<input class="mw-input" type="number" name="timeout" value="30000" min="1000" max="600000" aria-label="MCP 超时"></label>
          <label class="mw-check-row"><input class="mw-check" type="checkbox" name="enabled" checked>启用此配置</label>
          <div>${renderButton({label:"保存 MCP",type:"submit"})} ${renderButton({label:"取消编辑",variant:"ghost",attrs:{"data-mcp-reset":""}})}</div>
        </form><p role="status" data-mcp-status>正在读取 MCP 配置…</p>
      </section>` : `<p>选择方法所属项目：</p><ul>${(model.projects ?? []).map(project => `<li><a href="/settings/coding-settings?project=${encodeURIComponent(project.project_id)}">${p.escape(project.name)}</a></li>`).join("")}</ul>`}
    </section>
  </section>`;
}

function executionLabel(execution: string): string {
  if (execution === "read-only") return "只读，给建议";
  if (execution === "text-edit") return "可改文件，每处写入都要你批准";
  return "可改文件并运行命令";
}

export const codingSettingsContribution: UiContribution<CodingSettingsModel> = {
  descriptor: codingSettingsDescriptor,
  render: (request) => renderCodingSettings(request.model),
};

export interface CodingPendingReview {
  review_id: string;
  /** What kind of effect is waiting. Shown as-is, never softened. */
  kind: "text-edit" | "command" | "tool-operation" | "mcp" | "rewind";
  /** One safe line describing the effect, prepared by the Host. */
  summary: string;
}

export interface CodingReviewCardModel {
  readonly pending: readonly CodingPendingReview[];
  /** Where the Host's review surface lives. Coding links there; it never decides. */
  readonly review_href: string;
  readonly primitives: CodingUiPrimitives;
}

const REVIEW_KIND_LABEL: Record<CodingPendingReview["kind"], string> = {
  "text-edit": "改文件",
  command: "跑命令",
  "tool-operation": "工具操作",
  mcp: "外部工具",
  rewind: "回退检查点",
};

/**
 * The card that appears in a session when the Run is waiting on approval.
 *
 * It is a summary and a way out, and deliberately nothing else: no approve
 * button, no "allow all", no remembered decision. Approving is the user's
 * action in the Host's own surface, and putting a shortcut here would let
 * Coding release its own side effects — which is the one thing the design says
 * it must not do. An empty list renders nothing rather than a reassuring
 * "no pending approvals", which would be noise in the middle of a conversation.
 */
export function renderPendingReviewCard(model: CodingReviewCardModel): string {
  const { primitives: p } = model;
  if (model.pending.length === 0) return "";
  const items = model.pending.slice(0, 3).map((review) => `<li>
    <span class="coding-review-kind">${p.escape(REVIEW_KIND_LABEL[review.kind])}</span>
    <span class="coding-review-summary">${p.escape(review.summary)}</span>
  </li>`).join("");
  const more = model.pending.length > 3
    ? `<li class="coding-review-more">${p.escape(`还有 ${model.pending.length - 3} 项`)}</li>`
    : "";
  return `<aside class="coding-review-card" data-coding-review-card>
    <div class="mw-status" data-tone="attention">${p.icon("alert-circle")}${p.escape(`${model.pending.length} 项操作等你决定`)}</div>
    <ul class="coding-review-list">${items}${more}</ul>
    <a class="mw-button mw-button--primary" href="${p.escape(model.review_href)}" data-coding-review-open>${p.escape("查看并处理")}</a>
    <p class="coding-review-note">${p.escape("在你批准之前，这些操作不会发生。批准在宿主的审查面里做。")}</p>
  </aside>`;
}

export interface CodingQuestionCardModel {
  readonly questions: readonly AgentPendingQuestion[];
  readonly primitives: CodingUiPrimitives;
}

/**
 * The card that asks the user a question the Run stopped on.
 *
 * Three rules from the design, each load-bearing:
 *
 * - **Nothing is pre-selected.** No option carries `checked`, because a
 *   pre-filled answer is an answer the user did not give, and the Run would act
 *   on it.
 * - **Leaving is not cancelling.** There is no dismiss control; the question
 *   stays until it is answered or the Run ends.
 * - **Free text is offered only when the Runtime accepts it**, so the form
 *   never invites an answer that would be thrown away.
 */
export function renderPendingQuestionCard(model: CodingQuestionCardModel): string {
  const { primitives: p } = model;
  if (model.questions.length === 0) return "";
  return model.questions.map((question) => {
    const name = `coding-answer-${question.pending_id}`;
    const disabled = question.answerable === false;
    const options = question.options.map((option, index) => `<label class="coding-question-option">
      <input type="radio" name="${p.escape(name)}" value="${p.escape(option.value)}" id="${p.escape(`${name}-${index}`)}"${disabled ? " disabled" : ""}>
      <span>${p.escape(option.label)}</span>
    </label>`).join("");
    const freeText = question.allows_free_text
      ? `<label class="coding-question-text" for="${p.escape(`${name}-text`)}">
          <span>${p.escape(question.options.length === 0 ? "你的回答" : "或者自己写")}</span>
          ${renderTextarea({ id: `${name}-text`, rows: 2, disabled, attrs: { "data-coding-answer-text": question.pending_id } })}
        </label>`
      : "";
    const questionnaire = (question.questions ?? []).map(item => `<fieldset class="coding-question-options" data-question-index="${item.index}"${disabled ? " disabled" : ""}>
      <legend>${p.escape(item.prompt)}</legend>
      ${item.multiple ? `<p class="coding-question-hint">${p.escape("可选择多项")}</p>` : ""}
      ${item.options.map(option => `<label class="coding-question-option"><input type="${item.multiple ? "checkbox" : "radio"}" name="${p.escape(`${name}-${item.index}`)}" value="${option.index}"><span>${p.escape(option.label)}</span></label>`).join("")}
      ${item.allow_other ? `<label class="coding-question-text"><span>${p.escape("其他说明（可选）")}</span>${renderTextarea({ rows: 2, disabled, attrs: { "data-question-other": item.index, maxlength: 500 } })}</label>` : ""}
    </fieldset>`).join("");
    return `<form class="coding-question-card" data-coding-question="${p.escape(question.pending_id)}" data-pending-revision="${question.pending_revision ?? ""}">
      ${renderStatusMark({ label: disabled ? "问题不可回答" : "需要你回答", tone: disabled ? "quiet" : "attention", icon: "question", plain: true, labelAttrs: { "data-question-label": "" } })}
      <p class="coding-question-prompt">${p.escape(question.prompt)}</p>
      ${options === "" ? "" : `<fieldset class="coding-question-options"><legend class="mw-visually-hidden">${p.escape(question.prompt)}</legend>${options}</fieldset>`}
      ${freeText}
      ${questionnaire}
      <p class="coding-question-hint" data-question-hint>${p.escape(disabled ? "保留原问题与未提交内容，便于核对；这不表示答案已交付。" : "回答用于继续这一轮任务；离开会话不会取消等待。")}</p>
      <p data-question-status role="status" aria-live="polite">${p.escape(question.unavailable_reason ?? "")}</p>
      ${renderButton({ label: "提交回答", type: "submit", variant: "primary", disabled, attrs: { "data-coding-answer-submit": question.pending_id } })}
    </form>`;
  }).join("");
}

export interface CodingReportModel {
  readonly title: string;
  /** Already-rendered Markdown. Coding does not parse it itself. */
  readonly body_html: string;
  readonly run_id: string;
  readonly primitives: CodingUiPrimitives;
}

/**
 * A report produced by one run.
 *
 * The body arrives already rendered by the shared Markdown path, so this only
 * frames it and says where it came from. A report with no provenance is just
 * text someone has to take on faith.
 */
export function renderCodingReport(model: CodingReportModel): string {
  const { primitives: p } = model;
  return `<article class="coding-report" data-coding-report="${p.escape(model.run_id)}">
    <header class="coding-report-head">
      <h1>${p.escape(model.title)}</h1>
      <p class="coding-report-source">${p.escape(`来自本轮执行 ${model.run_id}`)}</p>
    </header>
    <div class="coding-report-body mw-prose">${model.body_html}</div>
  </article>`;
}

export interface CodingIdentityModel {
  readonly identity: CodingIdentityView;
  readonly primitives: CodingUiPrimitives;
}

/**
 * What this run was frozen with.
 *
 * Every layer is rendered, empty ones included, with the reason they are empty
 * — "this project has stated no conventions" is something the user can act on,
 * while a missing section reads as nothing to see.
 *
 * There is no control here. Editing a frozen run's instructions would edit the
 * thing the Host froze in order to decide what the run may do; changing them is
 * changing the role, for the next run.
 */
export function renderCodingIdentity(model: CodingIdentityModel): string {
  const { primitives: p, identity } = model;
  const layers = identity.layers.map((layer) => {
    const body = layer.absent_reason !== undefined
      ? `<p class="coding-identity-absent">${p.escape(layer.absent_reason)}</p>`
      : `<ul class="coding-identity-entries">${layer.entries.map((entry) =>
        `<li data-prompt="${p.escape(entry.prompt_id)}">`
        + `<span class="coding-identity-id">${p.escape(entry.prompt_id)} · v${p.escape(entry.version)}</span>`
        + (entry.body === undefined ? "" : `<pre class="coding-identity-body">${p.escape(entry.body)}</pre>`)
        + `</li>`).join("")}</ul>`;
    return `<section class="coding-identity-layer" data-layer="${p.escape(layer.layer)}">`
      + `<h3>${p.escape(layer.title)}<span class="coding-identity-owner">${p.escape(layer.owner)}</span></h3>`
      + `${body}</section>`;
  }).join("");
  const tools = identity.host_tools.length === 0
    ? `<span class="coding-identity-tools" data-empty="true">${p.escape("这一轮不能调用任何工具")}</span>`
    : `<span class="coding-identity-tools">${identity.host_tools.map((tool) => p.escape(tool)).join(" · ")}</span>`;
  return `<article class="coding-identity" data-role="${p.escape(identity.role_id)}" data-editable="false">
    <header class="coding-identity-head">
      <h2>${p.escape(identity.role_name)}</h2>
      <span class="coding-identity-execution">${p.escape(identity.execution)}</span>
      ${tools}
    </header>
    ${layers}
  </article>`;
}

export interface CodingUsageModel {
  readonly usage: AgentRunUsage;
  readonly primitives: CodingUiPrimitives;
}

/**
 * What this run cost.
 *
 * When the Runtime did not report usage, this says so. Showing 0 would read as
 * "this run was free", which is a different claim from "we do not know".
 */
export function renderCodingUsage(model: CodingUsageModel): string {
  const { primitives: p, usage } = model;
  const hasKnown = usage.coverage
    ? Object.values(usage.coverage).some(value => value !== "unknown")
    : usage.unavailable_reason === undefined;
  const state = !hasKnown ? "unknown" : usage.unavailable_reason ? "partial" : "known";
  return `<div class="coding-usage" data-coding-usage="${state}">
    ${hasKnown ? "" : `<span class="mw-status" data-tone="idle">${p.icon("help-circle")}${p.escape("用量未知")}</span>`}
    <span class="coding-usage-why">${p.escape(codingUsageSummary(usage))}</span>
  </div>`;
}
