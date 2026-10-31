import type { PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { GoalsHintOptions } from "./ports.js";

/** The fields of a project's guidance this page shows: an entry in force or switched off, and one revision of it. */
interface GuidanceEntry { guidance_id: string; kind: string; content: string; revision: number; updated_at: string }
interface GuidanceRevision {
  kind: string; content: string; revision: number; active: boolean; change_kind: string;
  changed_by: string; confirmation_summary: string; reason: string; created_at: string;
}
interface ProjectGuidanceView { entries: readonly GuidanceEntry[]; inactive_entries: readonly GuidanceEntry[]; revisions: readonly GuidanceRevision[] }

/** The project's guidance page: what is in force by kind, what was switched off, and every revision. */
export function createProjectGuidanceDocumentRenderer(ports: {
  L(text: string, values?: Record<string, string | number>): string;
  escapeHtml(value: unknown): string;
  formatDate(value: string | null | undefined): string;
  icon(name: PluginIconName): string;
  renderHint(options: GoalsHintOptions): string;
}) {
  const { L, escapeHtml, formatDate, icon, renderHint } = ports;

  function renderProjectGuidanceDocument(guidance: ProjectGuidanceView): string {
    const kindMeta: Record<string, { label: string; description: string }> = {
      context: { label: L("项目背景"), description: L("项目是什么，以及长期成立的事实") },
      requirement: { label: L("共同要求"), description: L("这个项目里所有工作都要满足的产品或业务要求") },
      constraint: { label: L("硬约束"), description: L("任何推进都不能越过的边界") },
      convention: { label: L("协作约定"), description: L("命名、表达和协作方式") },
      workflow: { label: L("工作方式"), description: L("项目稳定采用的推进顺序") },
      quality_bar: { label: L("质量标准"), description: L("共同认可的完成质量") },
    };
    const orderedKinds = ["context", "requirement", "constraint", "convention", "workflow", "quality_bar"];
    const sections = orderedKinds.map((kind) => {
      const entries = guidance.entries.filter((entry) => entry.kind === kind);
      const meta = kindMeta[kind]!;
      return `<section class="guidance-section" aria-labelledby="guidance-${kind}"><header class="guidance-section-heading"><h2 id="guidance-${kind}">${meta.label}</h2><p>${meta.description}</p></header><button type="button" class="mw-btn mw-btn--link guidance-category-add" data-guidance-new data-guidance-kind="${kind}" aria-label="${meta.label} · ${L("新增说明")}">${icon("plus")}${L("添加")}</button><div class="guidance-entry-list">${entries.map((entry) => `<article class="guidance-entry" data-guidance-entry="${escapeHtml(entry.guidance_id)}"><p>${escapeHtml(entry.content)}</p><footer><span class="guidance-entry-meta">${L("第 {revision} 版 · 更新于 {time}", { revision: entry.revision, time: formatDate(entry.updated_at) })}</span><span class="guidance-entry-actions"><button class="mw-btn mw-btn--link" type="button" data-guidance-edit="${escapeHtml(entry.guidance_id)}">${L("修改")}</button><button class="mw-btn mw-btn--danger-outline" type="button" data-guidance-action="deactivate" data-guidance-id="${escapeHtml(entry.guidance_id)}">${L("停用")}</button></span></footer></article>`).join("")}</div></section>`;
    }).join("");
    const inactiveItems = guidance.inactive_entries.length > 0
      ? `<ul class="guidance-inactive-list">${guidance.inactive_entries.map((entry) => `<li><p>${escapeHtml(entry.content)}</p><button class="mw-btn mw-btn--link" type="button" data-guidance-action="restore" data-guidance-id="${escapeHtml(entry.guidance_id)}">${L("恢复这条说明")}</button></li>`).join("")}</ul>`
      : `<p>${L("当前没有停用的说明。")}</p>`;
    const changeLabels: Record<string, string> = {
      created: L("新增"),
      edited: L("修改"),
      deactivated: L("停用"),
      restored: L("恢复"),
    };
    const historyRows = guidance.revisions.map((revision) => {
      const content = revision.content.length > 220 ? `${revision.content.slice(0, 220)}…` : revision.content;
      const stateLabel = revision.active ? L("生效版本") : L("停用版本");
      return `<article class="guidance-history-row"><div><strong>${escapeHtml(changeLabels[revision.change_kind] ?? revision.change_kind)}</strong><div class="guidance-history-state${revision.active ? "" : " guidance-history-state--inactive"}">${L("第 {revision} 版", { revision: revision.revision })} · ${stateLabel}</div></div><div><strong>${escapeHtml(kindMeta[revision.kind]?.label ?? revision.kind)}</strong><p>${escapeHtml(content)}</p><details class="guidance-history-entry"><summary>${L("查看完整版本与变更原因")}</summary><dl class="guidance-history-full"><div><dt>${L("完整原文")}</dt><dd>${escapeHtml(revision.content)}</dd></div><div><dt>${L("变更原因")}</dt><dd>${escapeHtml(revision.reason)}</dd></div><div><dt>${L("操作者")}</dt><dd>${escapeHtml(revision.changed_by)}</dd></div><div><dt>${L("确认记录")}</dt><dd>${escapeHtml(revision.confirmation_summary)}</dd></div></dl></details></div><time datetime="${escapeHtml(revision.created_at)}">${formatDate(revision.created_at)}</time></article>`;
    }).join("");
    const guidanceData = JSON.stringify(guidance).replaceAll("<", "\\u003c");
    return `<section class="guidance-document" aria-labelledby="guidance-title">
      <header class="guidance-page-header"><div><div class="settings-heading-title"><h1 id="guidance-title">${L("项目说明")}</h1>${renderHint({ id: "settings-hint-guidance", label: L("Runtime 如何使用"), text: L("只发送当前生效版本，放在这一轮的任务和外部内容之前。修改或停用会在下一次 Prompt 中生效。") })}</div><p>${L("这是这个项目所有工作共享的长期说明：助理、各插件里的 Agent 和外部 Runtime 在这个项目里都会收到。这里只显示已经生效的内容；你可以直接维护它，并随时查看每次改动。")}</p></div><button class="mw-btn mw-btn--primary" type="button" data-guidance-new>${icon("plus")}${L("新增说明")}</button></header>
      <div class="settings-body"><p class="project-rules-receipt" data-guidance-receipt role="status" aria-live="polite" hidden></p>
      <section class="guidance-editor" data-guidance-editor data-cover-layer hidden aria-labelledby="guidance-editor-title"><header><div><h2 id="guidance-editor-title" data-guidance-editor-title></h2><p data-guidance-editor-description></p></div></header><form data-guidance-form><input type="hidden" name="action"><input type="hidden" name="guidance_id"><div class="guidance-editor-body"><div class="guidance-editor-fields" data-guidance-editor-fields><label>${L("分类")}<select name="kind"><option value="context">${L("项目背景")}</option><option value="requirement">${L("共同要求")}</option><option value="constraint">${L("硬约束")}</option><option value="convention">${L("协作约定")}</option><option value="workflow">${L("工作方式")}</option><option value="quality_bar">${L("质量标准")}</option></select></label><label>${L("说明原文")}<textarea name="content" maxlength="4000" rows="5" placeholder="${L("写成未来 Runtime 可以直接理解和遵守的完整说明")}"></textarea></label></div><p class="guidance-editor-preview" data-guidance-editor-preview hidden></p><label>${L("为什么要做这次变更")}<textarea name="reason" rows="3" required placeholder="${L("这条原因会进入版本记录，方便以后理解当时为什么修改")}"></textarea></label></div><div class="guidance-editor-actions"><p class="guidance-editor-error" data-guidance-editor-error role="alert" hidden></p><footer><button class="mw-btn mw-btn--secondary" type="button" data-guidance-editor-close>${L("取消")}</button><button class="mw-btn mw-btn--primary" type="submit">${L("保存说明")}</button></footer></div></form></section>
      <div class="guidance-settings-list">${sections}</div>
      <div class="guidance-advanced-list">
      <details class="settings-advanced guidance-history"><summary><span class="setting-copy"><strong>${L("版本记录")}</strong><span>${L("共 {count} 次变更", { count: guidance.revisions.length })}</span></span>${icon("chevron-down")}</summary><div class="guidance-history-list">${historyRows || `<p>${L("还没有版本记录。")}</p>`}</div></details>
      <details class="settings-advanced guidance-inactive"><summary><span class="setting-copy"><strong>${L("已停用的说明")}</strong><span>${L("共 {count} 条", { count: guidance.inactive_entries.length })}</span></span>${icon("chevron-down")}</summary><div class="guidance-inactive-body">${inactiveItems}</div></details>
      </div>
      </div>
      <script type="application/json" data-project-guidance-json>${guidanceData}</script>
    </section>`;
  }

  return renderProjectGuidanceDocument;
}
