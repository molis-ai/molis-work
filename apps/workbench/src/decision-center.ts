/** Workbench composes already-rendered owner contributions in Decision and Feed surfaces. */
type DecisionCenterIcon = "clipboard" | "check" | "input" | "chevron-down" | "workflow";
export interface WorkbenchDecisionGroup {
  ownerGoalId: string | null;
  item: { goal: { goal_id: string; title: string } } | null;
  counts: { goalTree: number };
  ownerLinkHtml: string;
  content: { goalTree: string };
}
export interface WorkbenchDecisionCenterModel {
  groups: WorkbenchDecisionGroup[];
  count: number;
  typeCounts: { proposals: number };
  recentHtml: string;
}
export interface WorkbenchDecisionCenterPrimitives {
  translate(text: string, values?: Record<string, string | number>): string;
  escapeHtml(value: unknown): string;
  icon(name: DecisionCenterIcon): string;
  currentLocale(): "zh" | "en";
  formatDate(value: string | null | undefined): string;
}
export function createWorkbenchDecisionCenterRenderer({ translate: L, escapeHtml, icon, currentLocale, formatDate }: WorkbenchDecisionCenterPrimitives) {
function renderDecisionCenter(model: WorkbenchDecisionCenterModel, desktopInbox = false): string {
  const { groups, count, typeCounts } = model;
  const empty = `<div class="decision-empty">${icon("check")}<h2>${L("当前没有等待你的决定")}</h2><p>${L("需要你确认当前 Goal 或关系方案时，会自动出现在这里。事件决定仍在对应 Goal 文档中处理。")}</p><a href="/">${L("返回 Goal Tree")}</a></div>`;
  if (!desktopInbox) {
    return `<article class="decision-center" data-decision-center>
      <header class="decision-center-header"><div><h1>${L("等待你的决定")}</h1><p>${L("这里只列出当前仍可执行的 Goal / 关系方案。历史记录可在对应 Goal 中阅读。")}</p></div><strong>${count}<small>${L("项待处理")}</small></strong></header>
      <div class="decision-summary" aria-label="${L("待决定事项统计")}"><span>${L("Goal / 关系方案")} <strong>${typeCounts.proposals}</strong></span></div>
      ${groups.length ? `<div class="decision-groups">${groups.map((group) => {
        const goalId = group.item?.goal.goal_id ?? group.ownerGoalId ?? "board";
        return `<section class="decision-goal-group" id="decision-goal-${escapeHtml(goalId)}">
          <header class="decision-owner"><div><span>${L("这些决定属于")}</span>${group.ownerLinkHtml}</div><small>${group.counts.goalTree} ${L("项")}</small></header>
          <div class="decision-stack">${group.content.goalTree}</div>
        </section>`;
      }).join("")}</div>` : empty}
      ${model.recentHtml}
    </article>`;
  }
  return `<article class="decision-center inbox-workspace" data-decision-center>
    <header class="decision-center-header inbox-header"><div><h1>Inbox</h1><p>${L("当前仍需要你确认的 Goal / 关系方案。")}</p></div><strong>${count}<small>${L("项待处理")}</small></strong></header>
    <div class="decision-summary" aria-label="${L("待决定事项统计")}"><span>${L("Goal / 关系方案")} <strong>${typeCounts.proposals}</strong></span></div>
    ${groups.length ? `<div class="decision-groups">${groups.map((group) => {
      const goalId = group.item?.goal.goal_id ?? group.ownerGoalId ?? "board";
      const itemCount = group.counts.goalTree;
      const ownerTitle = group.item?.goal.title ?? L("整个项目的事项");
      return `<details class="decision-goal-group inbox-group" id="decision-goal-${escapeHtml(goalId)}">
        <summary class="inbox-item"><span class="inbox-item-icon" aria-hidden="true">${icon("clipboard")}</span><span class="inbox-item-copy"><strong>${escapeHtml(ownerTitle)}</strong><small>${escapeHtml(L("Goal / 关系方案"))}</small></span><span class="inbox-item-types"><span>${icon("clipboard")}${escapeHtml(L("Goal / 关系方案"))}${itemCount > 1 ? `<em>${itemCount}</em>` : ""}</span></span><b>${itemCount}</b>${icon("chevron-down")}</summary>
        <div class="inbox-item-detail"><header class="decision-owner"><div><span>${L("这些决定属于")}</span>${group.ownerLinkHtml}</div><small>${itemCount} ${L("项")}</small></header>
        <div class="decision-stack">${group.content.goalTree}</div></div>
      </details>`;
    }).join("")}</div>` : empty}
    ${model.recentHtml}
  </article>`;
}

function renderFeedDecisionGroupDetail(
  group: WorkbenchDecisionGroup,
  goalId: string,
  title: string,
  summary: string,
  updatedAt: string,
): string {
  const count = group.counts.goalTree;
  return `<article class="feed-detail feed-detail--decision" data-feed-detail="decision:${escapeHtml(goalId)}">
    <header class="feed-detail-header"><div class="feed-detail-kicker"><span>Feed</span><span>${L("Goal 决定")}</span><span>${L("待处理")}</span></div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(summary)}</p><div class="feed-detail-meta"><span>${icon("workflow")}Molis Work</span><time datetime="${escapeHtml(updatedAt)}">${formatDate(updatedAt)}</time></div></header>
    <section class="feed-decision-work"><header><div><span>${L("这些决定属于")}</span>${group.ownerLinkHtml}</div><small>${count} ${L("项")}</small></header><div class="decision-stack">
      ${group.content.goalTree}
    </div></section>
  </article>`;
}
void currentLocale;
return { renderDecisionCenter, renderFeedDecisionGroupDetail };
}
