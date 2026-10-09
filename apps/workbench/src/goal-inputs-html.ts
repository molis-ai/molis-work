/**
 * A Goal's inputs in one place (specs/artifact-positioning 五.1, 「合成一种入口」): materials it follows as they change
 * (bound work objects) and versions it fixed (成果 taken as input), one list and one 「加输入」. New materials can still be
 * created straight into the project; plugin objects are filled in by the placement client from their owners.
 */
export interface GoalInputsItem {
  readonly goal: { readonly goal_id: string };
  readonly input_bindings: ReadonlyArray<{ readonly binding_id: string; readonly source_type: string; readonly source_ref: string; readonly input_name: string;
    readonly state: string; readonly reason: string; readonly snapshot_digest?: string | null }>;
  /** Versions in the 成果库 this Goal takes as input (`goal.input`). */
  readonly artifact_inputs?: ReadonlyArray<{ readonly artifact_id: string; readonly version: number; readonly title: string;
    readonly state: "available" | "unavailable" | "archived" | "missing"; readonly reason: string | null }>;
}

export interface GoalInputsPrimitives {
  L(text: string, values?: Record<string, string | number>): string;
  escapeHtml(value: unknown): string;
  renderReference(value: string, label?: string): string;
}

const CREATE = [["pages", "文档"], ["ppt", "演示稿"], ["form", "问卷"], ["dataset", "数据表"]] as const;

export function renderGoalInputsHtml(item: GoalInputsItem, { L, escapeHtml, renderReference }: GoalInputsPrimitives): string {
  const goalId = escapeHtml(item.goal.goal_id);
  const follows = `<span class="goal-input-mode" data-goal-input-mode="live">${L("跟着原文")}</span>`;
  const live = item.input_bindings.filter((binding) => binding.state !== "inactive").map((binding) => {
    if (binding.source_type === "plugin_object") {
      let subject: [string, string] | null = null;
      try { const value = JSON.parse(binding.source_ref); if (Array.isArray(value) && value.length === 2) subject = [String(value[0]), String(value[1])]; } catch { subject = null; }
      if (!subject) return "";
      return `<article class="placement-goal-material" data-placement-material data-placement-kind="${escapeHtml(subject[0])}" data-placement-id="${escapeHtml(subject[1])}" data-placement-binding="${escapeHtml(binding.binding_id)}" data-goal-id="${goalId}"><div><strong>${escapeHtml(binding.input_name)}</strong>${follows}<small data-placement-material-state>${escapeHtml(L("正在读取…"))}</small></div><span class="placement-goal-material-actions"></span></article>`;
    }
    return `<article>${renderReference(binding.source_ref, binding.input_name)}<small>${escapeHtml(binding.state)} · ${escapeHtml(binding.reason)}${binding.snapshot_digest ? ` · ${escapeHtml(binding.snapshot_digest)}` : ""}</small></article>`;
  });
  const fixed = (item.artifact_inputs ?? []).map((input) => {
    const path = `/artifacts/${encodeURIComponent(input.artifact_id)}/versions/${input.version}`;
    // The reference stays when the version cannot be read; it is never swapped for a later one.
    const note = { available: "", unavailable: L("这一版现在不可用"), archived: L("这一版已归档"), missing: L("找不到这一版") }[input.state];
    return `<article class="placement-goal-material goal-input-fixed" data-goal-input-fixed><div><a href="#" data-workbench-item-plugin="artifacts" data-workbench-item-id="${escapeHtml(path)}" data-workbench-item-title="${escapeHtml(input.title)}"><strong>${escapeHtml(input.title)}</strong></a><span class="goal-input-mode" data-goal-input-mode="fixed">${escapeHtml(L("固定的第 {version} 版", { version: input.version }))}</span>${note ? `<small>${escapeHtml([note, input.reason].filter(Boolean).join(" · "))}</small>` : ""}</div><span class="placement-goal-material-actions"><button type="button" class="mw-btn mw-btn--ghost mw-btn--sm" data-goal-input-remove data-goal-id="${goalId}" data-artifact-reference="${escapeHtml(JSON.stringify({ artifact_id: input.artifact_id, version: input.version }))}">${L("移除")}</button></span></article>`;
  });
  const rows = [...live, ...fixed].join("");
  const create = CREATE.map(([station, label]) => `<button type="button" class="mw-btn mw-btn--secondary mw-btn--sm" data-placement-create="${station}" data-goal-id="${goalId}">${escapeHtml(L(label))}</button>`).join("");
  return `<section class="placement-goal-materials" data-placement-goal-materials data-goal-inputs data-goal-id="${goalId}"><h3>${L("输入")}</h3>
    <div class="placement-goal-create"><button type="button" class="mw-btn mw-btn--primary mw-btn--sm" data-goal-input-add data-goal-id="${goalId}">${L("加输入…")}</button><span>${L("或为这个 Goal 新建")}</span>${create}</div>
    ${rows ? `<div class="bound-list">${rows}</div>` : `<p class="empty-row">${L("还没有输入。")}</p>`}
    <p class="placement-goal-hint">${L("「跟着原文」：目标看到的是它现在的样子；「固定这一版」：目标认的是加入时存下的那一版，原文之后再改也不变。")}</p></section>`;
}
