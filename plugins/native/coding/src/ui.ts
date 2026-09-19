import type {
  UiContribution,
  UiContributionDescriptor,
  UiRenderRequest,
} from "@molis-ai/molis-work-contracts/platform/ui";
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
  { face: "sessions", label: "会话", icon: "message-circle" },
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
  "running": { icon: "loader", tone: "progress", label: "执行中" },
  "waiting-answer": { icon: "help-circle", tone: "attention", label: "等你回答" },
  "waiting-approval": { icon: "alert-circle", tone: "attention", label: "等你审查" },
  "failed": { icon: "alert-triangle", tone: "blocked", label: "失败待处理" },
  "done": { icon: "check", tone: "done", label: "已完成" },
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
  const faces = CODING_DIRECTORY_FACES.map((face) => `<button type="button" class="coding-face" data-coding-face="${face.face}"${face.face === model.face ? ' aria-selected="true"' : ""} aria-label="${p.escape(face.label)}">${p.icon(face.icon)}</button>`).join("");
  const filters = (["all", "running", "needs-you"] as const).map((filter) => `<button type="button" class="coding-filter" data-coding-filter="${filter}"${filter === model.filter ? ' aria-selected="true"' : ""}>${p.escape(filterLabel(filter))}</button>`).join("");
  const groups = groupByGoal(filterSessions(model.sessions, model.filter))
    .map((group) => renderGroup(group.goal_id, group.title, group.entries, p))
    .join("");
  return `<section class="coding-directory" data-coding-directory data-coding-current-face="${model.face}">
    <nav class="coding-faces" aria-label="${p.escape("Coding 导航面")}">${faces}</nav>
    <header class="coding-directory-head"><h2>${p.escape(faceLabel(model.face))}</h2></header>
    <div class="coding-filters" role="group" aria-label="${p.escape("会话筛选")}">${filters}</div>
    <div class="coding-session-list" data-coding-sessions>${groups || renderEmpty(p)}</div>
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
  const tools = model.tools.map((tool) => renderToolTab(tool, p)).join("");
  const panels = model.tools.map((tool) => renderToolPanel(tool, p)).join("");
  return `<section class="desktop-work-surface plugin-stage-shell" data-work-surface="coding" data-work-surface-label="Coding" hidden data-coding-workbench>
    <div class="coding-stage" data-coding-stage>
      <div class="coding-dialogue" data-coding-dialogue>
        <header class="coding-dialogue-head" data-coding-dialogue-head>
          ${renderWorkspaceLine(model.workspace_path, p)}
        </header>
        <div class="coding-turns" data-coding-turns></div>
      </div>
      <aside class="coding-tools" data-coding-tools>
        <nav class="coding-tool-tabs" aria-label="${p.escape("结果与工具")}">${tools}</nav>
        ${panels}
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
