import type { GoalRecord } from "@molis-ai/molis-work-contracts/modules/goals";
import type { UiContribution } from "@molis-ai/molis-work-contracts/platform/ui";

export interface WorkTerminalUiModel {
  selected?: Pick<GoalRecord, "goal_id" | "title" | "decomposition_state" | "fulfillment_state"> & { statusHtml: string; event_work?: boolean };
  children: readonly { goal_id: string; title: string; statusLabel: string; nextAction: string }[];
  cliAvailability: Record<string, boolean>;
  text(value: string, vars?: Record<string, string | number>): string;
  icon(name: "chevron-right" | "target" | "plus" | "tree" | "play" | "copy" | "refresh" | "terminal"): string;
}

export const WORK_TERMINAL_UI_CONTRIBUTION_ID = "io.molis.work.native.work.terminal.v1";
export const workTerminalUiContribution: UiContribution<WorkTerminalUiModel> = {
  descriptor: {
    contribution_id: WORK_TERMINAL_UI_CONTRIBUTION_ID,
    plugin_id: "io.molis.work.native.work",
    kind: "embedded",
    label: "Terminal",
    surfaces: [{ surface_id: "terminal", target_slot_id: "workbench.main", format: "declarative-html" }],
    slots: [],
  },
  render: (request) => renderWorkTerminal(request.model),
};

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function renderWorkTerminal(model: WorkTerminalUiModel): string {
  const { selected, children, cliAvailability, text: L, icon } = model;
  const selectedGoalId = selected?.goal_id ?? "";
  const compoundParent = selected?.decomposition_state === "closed_compound" && !selected?.event_work;
  const compoundParentComplete = compoundParent && selected?.fulfillment_state === "satisfied";
  const childChoices = children.map((child) => {
    return `<a class="tui-child-choice" href="/goals/${encodeURIComponent(child.goal_id)}">
      <span><strong>${escapeHtml(child.title)}</strong><small>${escapeHtml(child.statusLabel)} · ${escapeHtml(child.nextAction)}</small></span>
      <b>${L("打开这个子 Goal")}${icon("chevron-right")}</b>
    </a>`;
  }).join("");
  const runtimeKinds: Array<[string, string]> = [
    ["claude-code", "Claude Code"],
    ["codex", "Codex"],
    ["opencode", "OpenCode"],
    ["pi-agent", "Pi Agent"],
    ["grok-build", "Grok Build"],
  ];
  const runtimeChoices = runtimeKinds.map(([kind, label]) => {
    const available = cliAvailability[kind] !== false;
    return `<button type="button" data-tui-kind="${kind}"${available ? "" : ` disabled title="${escapeHtml(L("需要先安装 CLI"))}"`}>${label}${available ? "" : `<small>${L("未安装")}</small>`}</button>`;
  }).join("");
  const missingKinds = runtimeKinds
    .filter(([kind]) => cliAvailability[kind] === false)
    .map(([, label]) => label);
  const missingHint = missingKinds.length
    ? `<p class="tui-menu-missing">${L("以下 CLI 未安装：{list}。安装后刷新页面即可使用。", { list: missingKinds.join("、") })}</p>`
    : "";
  return `
      <div class="tui-resizer" role="separator" aria-label="${L("调整终端宽度，双击收起")}" aria-orientation="vertical" aria-valuemin="280" aria-valuemax="720" aria-valuenow="480" tabindex="0" data-tui-resizer></div>
      <aside class="tui-pane" id="goal-tui-pane" data-tui-pane data-goal-id="${escapeHtml(selectedGoalId)}" data-tui-parent-read-only="${compoundParent}"${compoundParent ? ' data-tui-read-only="true"' : ""} aria-label="${L("终端面板")}">
        <div class="tui-owner" data-tui-owner>
          <div class="tui-owner-copy">
            <strong data-tui-owner-title>${escapeHtml(selected?.title ?? L("还没有选择 Goal"))}</strong>
            <span class="tui-owner-binding"><i aria-hidden="true"></i><b>${L("绑定到 Goal")}</b></span>
          </div>
          <div class="tui-owner-actions">
            ${selected
              ? selected.statusHtml
              : `<span class="goal-status" data-tui-owner-status hidden><span data-tui-owner-status-label></span></span>`}
            <button class="tui-focus-return" type="button" data-tui-focus-return>${icon("target")}<span>${L("返回聚焦")}</span></button>
          </div>
        </div>
        <div class="tui-tabs">
          <span class="tui-mode-label">${L("终端")}</span>
          <div class="tui-tab-list" data-tui-tabs></div>
          <button class="tui-add" type="button" data-tui-add aria-expanded="false" aria-controls="tui-open-menu" aria-haspopup="true" aria-label="${L("添加终端")}"${compoundParent ? ` disabled title="${escapeHtml(L("请进入一个具体的子 Goal"))}"` : ""}>${icon("plus")}<span>${L("添加终端")}</span></button>
        </div>
        <div class="tui-stage">
          <section class="tui-parent-guard" data-tui-parent-guard${compoundParent ? "" : " hidden"}>
            <div class="tui-parent-guard-copy">
              ${icon("tree")}
              <div><strong>${L("这个上层 Goal 不直接使用终端")}</strong><p>${compoundParentComplete
                ? L("这项工作已经由子 Goal 完成，不需要再为上层 Goal 打开终端。要查看或继续具体工作，请进入对应的子 Goal。")
                : L("它会在子 Goal 全部完成后自动完成。请选择具体的子 Goal，再从那里打开终端。")}</p></div>
            </div>
            <div class="tui-child-choices" data-tui-child-choices>${childChoices || `<p>${L("还没有可推进的子 Goal，请先检查 Goal 的拆分。")}</p>`}</div>
          </section>
          <div class="tui-chrome">
            <div class="tui-chrome-actions">
              <button class="tui-advance" type="button" data-tui-advance disabled>${icon("play")}<span>${L("推进这个 Goal")}</span></button>
              <button type="button" data-tui-copy>${icon("copy")}<span>${L("复制命令")}</span></button>
              <button type="button" data-tui-fill disabled>${L("填入不发送")}</button>
              <button type="button" data-tui-reopen hidden>${icon("refresh")}<span>${L("重新打开")}</span></button>
            </div>
            <p class="tui-status" data-tui-status role="status"></p>
          </div>
          <div class="tui-terminal" data-tui-terminal>
            <div class="tui-empty" data-tui-empty>
              <span class="tui-empty-mark" aria-hidden="true">${icon("terminal")}</span>
              <p><strong>${compoundParent ? L("这个上层 Goal 不直接使用终端") : L("还没有终端")}</strong></p>
              <p>${compoundParent ? L("请从上方进入一个具体的子 Goal。") : L("选择常用 Runtime 或自定义命令，在这个 Goal 上开始工作。")}</p>
              <button type="button" class="button primary" data-tui-empty-add aria-haspopup="true" aria-controls="tui-open-menu" aria-expanded="false"${compoundParent ? " hidden" : ""}>${icon("plus")}${L("添加终端")}</button>
            </div>
          </div>
        </div>
        <form class="tui-menu" id="tui-open-menu" data-tui-menu aria-hidden="true" inert>
          <strong>${L("在这个 Goal 上打开终端")}</strong>
          <p>${L("标签只属于当前 Goal。打开不会自动发送或领取。")}</p>
          <div class="tui-runtime-choices">
            ${runtimeChoices}
            <button type="button" data-tui-kind="generic">${L("自定义命令")}</button>
          </div>
          ${missingHint}
          <label data-tui-generic-fields hidden>${L("命令")}<input name="command" type="text" autocomplete="off" placeholder="opencode"></label>
          <details class="form-disclosure"><summary>${L("继续已有会话（可选）")}</summary><label>${L("会话 ID")}<input name="resume_session_id" type="text" autocomplete="off"></label><small>${L("先填入对应 Runtime 的会话 ID，再选择上方的 Runtime。")}</small></details>
          <div class="tui-menu-actions">
            <button type="button" data-tui-menu-cancel>${L("取消")}</button>
            <button type="submit" data-tui-generic-open hidden>${L("打开")}</button>
          </div>
        </form>
      </aside>
      `;
}
