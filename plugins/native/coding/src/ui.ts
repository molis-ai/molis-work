import type {
  UiContribution,
  UiContributionDescriptor,
  UiRenderRequest,
} from "@molis-ai/molis-work-contracts/platform/ui";
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
  return `<section class="desktop-work-surface plugin-stage-shell" data-work-surface="coding" data-work-surface-label="Coding" hidden data-coding-workbench data-coding-prefix="${p.escape(model.route_prefix)}">
    <dialog class="mw-dialog mw-dialog--form" data-coding-workspace-dialog aria-label="选择工作区"><form class="mw-form mw-dialog__shell" data-coding-workspace-form>
      <header class="mw-form__header"><h2>选择工作区</h2><button class="mw-btn" type="button" data-coding-workspace-close>关闭</button></header>
      <section class="mw-form__body"><label class="mw-field">已关联的目录<select class="mw-select" data-coding-workspace-choice></select></label>
      <label class="mw-field">或者关联新目录<input class="mw-input" data-coding-workspace-path placeholder="这台电脑上的绝对路径" autocomplete="off"></label>
      <label class="mw-field"><span><input type="checkbox" data-coding-workspace-confirm> 确认把新目录关联到当前项目，作为任务工作区。</span></label>
      <p>选择用于下一轮；正在执行的任务继续使用原工作区。</p><p data-coding-workspace-error role="alert"></p></section>
      <footer class="mw-form__footer"><button class="mw-btn mw-btn--primary" type="submit">使用这个工作区</button></footer>
    </form></dialog>
    <div class="coding-stage" data-coding-stage>
      <div class="coding-dialogue" data-coding-dialogue>
        <header class="coding-dialogue-head" data-coding-dialogue-head>
          <div><span data-coding-title>选择或新建编码会话</span><small data-coding-workspace-label>${renderWorkspaceLine(model.workspace_path, p)}</small></div>
          <button class="mw-btn" type="button" data-coding-workspace-open>工作区</button>
          <button class="mw-btn" type="button" data-coding-rename hidden>重命名</button><button class="mw-btn" type="button" data-coding-stop hidden>停止</button>
        </header>
        <div class="coding-turns" data-coding-turns tabindex="0" aria-label="编码对话"><div class="mw-empty" data-coding-welcome><p>从一个具体问题开始</p><p>选择已授权工作区和模型后，讨论代码或开始任务。</p><button class="mw-btn" type="button" data-coding-new>新建编码会话</button></div></div>
        <button class="mw-btn coding-jump" type="button" data-coding-latest hidden>回到最新</button>
        <p class="coding-status" data-coding-status role="status" aria-live="polite"></p>
        <form class="coding-composer" data-coding-composer>
          <label class="coding-task-label" for="coding-task">任务或补充要求</label>
          <textarea class="mw-input" id="coding-task" data-coding-task rows="3" placeholder="描述要完成的任务…" disabled></textarea>
          <div class="coding-composer-actions"><select class="mw-select" data-coding-intent aria-label="任务方式"><option value="discuss">讨论</option><option value="edit" disabled>修改文件（待接通审批）</option><option value="execute" disabled>执行（待接通审批）</option><option value="review">评审</option></select>
          <select class="mw-select" data-coding-model aria-label="下一轮使用的模型"></select><button class="mw-btn mw-btn--primary" type="submit" data-coding-send disabled>发送</button></div>
          <small data-coding-draft-status>模型与方式的选择用于下一轮。</small>
        </form>
      </div>
      <aside class="coding-tools" data-coding-tools>
        <nav class="coding-tool-tabs" aria-label="${p.escape("结果与工具")}">${tools || '<span>结果</span>'}</nav>
        <div data-coding-host-reviews hidden></div><div class="coding-result" data-coding-result><p>任务成果与执行记录会留在这里，方便审查和继续。</p></div><section class="coding-result" data-coding-commands aria-label="命令与检查回执" hidden></section>${panels}
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
  readonly runtimes: ReadonlyArray<{ runtime_id: string; display_name: string; can_write: boolean }>;
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
  const roles = model.roles.map((role) => `<li><strong>${p.escape(role.name)}</strong><span>${p.escape(executionLabel(role.execution))}</span></li>`).join("");
  const runtimes = model.runtimes.length === 0
    ? `<p class="model-field-hint">${p.escape("宿主还没有注册任何运行时")}</p>`
    : model.runtimes.map((runtime) => `<li><strong>${p.escape(runtime.display_name)}</strong><span class="mw-status" data-tone="${runtime.can_write ? "done" : "idle"}">${p.escape(runtime.can_write ? "可以运行会写入的角色" : "只读：写入未接宿主审批")}</span></li>`).join("");
  return `<section class="settings-document coding-settings" data-coding-settings>
    <header class="settings-heading"><div class="settings-heading-title"><h1>${p.escape("Coding")}</h1></div>
      <p>${p.escape("编码会话用哪个角色、跑在哪个运行时上。模型和凭据在「模型设置」里配。")}</p>
    </header>
    <section class="settings-section" aria-label="${p.escape("角色")}">
      <h2>${p.escape("角色")}</h2>
      <ul class="coding-settings-list">${roles}</ul>
    </section>
    <section class="settings-section" aria-label="${p.escape("运行时")}">
      <h2>${p.escape("运行时")}</h2>
      <ul class="coding-settings-list">${runtimes}</ul>
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
    const options = question.options.map((option, index) => `<label class="coding-question-option">
      <input type="radio" name="${p.escape(name)}" value="${p.escape(option.value)}" id="${p.escape(`${name}-${index}`)}">
      <span>${p.escape(option.label)}</span>
    </label>`).join("");
    const freeText = question.allows_free_text
      ? `<label class="coding-question-text" for="${p.escape(`${name}-text`)}">
          <span>${p.escape(question.options.length === 0 ? "你的回答" : "或者自己写")}</span>
          <textarea id="${p.escape(`${name}-text`)}" data-coding-answer-text="${p.escape(question.pending_id)}" rows="2"></textarea>
        </label>`
      : "";
    return `<form class="coding-question-card" data-coding-question="${p.escape(question.pending_id)}">
      <div class="mw-status" data-tone="attention">${p.icon("help-circle")}${p.escape("需要你回答")}</div>
      <p class="coding-question-prompt">${p.escape(question.prompt)}</p>
      ${options === "" ? "" : `<fieldset class="coding-question-options"><legend class="mw-visually-hidden">${p.escape(question.prompt)}</legend>${options}</fieldset>`}
      ${freeText}
      <button type="submit" class="mw-button mw-button--primary" data-coding-answer-submit="${p.escape(question.pending_id)}">${p.escape("提交回答")}</button>
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
  if (usage.unavailable_reason !== undefined) {
    return `<div class="coding-usage" data-coding-usage="unknown">
      <span class="mw-status" data-tone="idle">${p.icon("help-circle")}${p.escape("用量未知")}</span>
      <span class="coding-usage-why">${p.escape(usage.unavailable_reason)}</span>
    </div>`;
  }
  const rows = [
    ["输入", usage.tokens.input],
    ["输出", usage.tokens.output],
  ] as const;
  const cost = usage.cost_usd === undefined
    ? ""
    : `<span class="coding-usage-cost">${p.escape(`$${usage.cost_usd.toFixed(4)}`)}</span>`;
  return `<div class="coding-usage" data-coding-usage="known">
    ${rows.map(([label, value]) => `<span class="coding-usage-row"><span>${p.escape(label)}</span><span>${p.escape(String(value))}</span></span>`).join("")}
    ${cost}
  </div>`;
}
