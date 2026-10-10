import type { UiContribution } from "@molis-ai/molis-work-contracts/platform/ui";
import { icon, renderPluginStageShell } from "@molis-ai/molis-work-design-system";
import { ISSUES_PLUGIN_ID, ISSUES_UI_CONTRIBUTION_ID } from "./manifest.js";

export const issuesUiContribution: UiContribution<unknown> = {
  descriptor: { contribution_id: ISSUES_UI_CONTRIBUTION_ID, plugin_id: ISSUES_PLUGIN_ID, kind: "primary-page", navigation_id: "issues", label: "Issue",
    surfaces: [{ surface_id: "workbench", target_slot_id: "workbench.main", format: "declarative-html" }], slots: [] },
  render: () => renderIssuesWorkbench(),
};
export function renderIssuesWorkbench(): string {
  return renderPluginStageShell({ surface: "issues", label: "Issue", dataset: "issues", body: `
    <div class="plugin-stage-list feed-stage-list feed-stage-tree">
      <header class="plugin-stage-chrome"><button class="mw-btn mw-btn--ghost tree-create" type="button" data-issue-new>${icon("plus")}<span>记录问题</span></button>
        <button class="mw-btn mw-btn--ghost" type="button" data-issue-refresh>${icon("refresh")}<span>刷新列表</span></button></header>
      <p class="issues-intro">记录遇到的问题。你的记录在各个项目中保持一致。</p>
      <div data-issue-list aria-label="个人问题列表" aria-live="polite"><div class="mw-empty" aria-busy="true"><span class="mw-skeleton">正在读取问题…</span></div></div>
      <button class="mw-btn mw-btn--secondary" type="button" data-issue-more hidden>加载更多</button>
    </div>
    <div class="plugin-stage-workspace" data-issue-workspace hidden>
      <header class="plugin-stage-detail-bar"><button class="plugin-stage-back" type="button" data-issue-back aria-label="返回问题列表">${icon("chevron-right")}</button>
        <span data-issue-heading>记录问题</span><button class="mw-btn mw-btn--ghost" type="button" data-issue-reread hidden>重新读取</button>
        <button class="mw-btn mw-btn--ghost" type="button" data-issue-delete hidden>删除</button></header>
      <form class="issues-editor mw-form" data-issue-form>
        <label class="mw-field">标题<input class="mw-input" name="title" maxlength="200" required placeholder="一句话说清遇到的问题"></label>
        <label class="mw-field">原始描述<textarea class="mw-textarea" name="description" maxlength="100000" rows="10" placeholder="可以写发生了什么、期望怎样。保留你的原话。"></textarea></label>
        <label class="mw-field">问题类型<select class="mw-select" name="type" required><option value="">提交前请选择</option><option value="bug">Bug</option><option value="experience">体验问题</option><option value="feature">功能需求</option></select></label>
        <label class="mw-field">补充信息<textarea class="mw-textarea" name="supplement" maxlength="10000" rows="3" placeholder="可选，与原话分开保存"></textarea></label>
        <p class="issues-meta" data-issue-meta>提交人：我。录入时间将在保存时记录。</p>
        <button class="mw-btn mw-btn--primary" type="submit" data-issue-save>保存问题</button>
      </form>
    </div>
    <p class="issues-note" role="status" data-issue-note hidden></p>
    <dialog class="mw-dialog mw-dialog--form" data-issue-dialog aria-labelledby="issue-dialog-title">
      <form method="dialog" class="mw-dialog__shell"><h2 id="issue-dialog-title" data-issue-dialog-title></h2><p data-issue-dialog-text></p>
        <footer class="mw-form__footer"><button class="mw-btn mw-btn--secondary" value="cancel">取消</button><button class="mw-btn mw-btn--primary" value="confirm" data-issue-dialog-ok>确认</button></footer>
      </form>
    </dialog>` });
}
export const ISSUES_STYLES = `
[data-issues="workbench"] .issues-intro{color:var(--muted);margin:0 0 20px}
[data-issues="workbench"] .issues-editor{width:min(100%,52rem);margin:0 auto;padding:24px 24px 76px;display:flex;flex-direction:column;gap:20px;overflow:auto;min-height:0}
[data-issues="workbench"] .mw-field{display:flex;flex-direction:column;gap:8px}
[data-issues="workbench"] .mw-select{background-repeat:no-repeat;background-position:right 8px center;background-size:14px 14px}
[data-issues="workbench"] .mw-textarea{resize:vertical;min-height:6rem}
[data-issues="workbench"] .issues-meta{color:var(--muted);font-size:var(--text-sm);white-space:pre-wrap;overflow-wrap:anywhere}
[data-issues="workbench"] .issues-note{position:absolute;bottom:16px;left:24px;right:24px;padding:12px;background:var(--surface);color:var(--ink);box-shadow:var(--sheet-shadow);z-index:4;pointer-events:none}
[data-issues="workbench"] .issues-note.is-error{color:var(--danger)}
[data-issues="workbench"] .issues-row{width:100%;min-height:52px;display:flex;align-items:center;gap:16px;text-align:left}
[data-issues="workbench"] .issues-row-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
[data-issues="workbench"] .issues-row-meta{color:var(--muted);font-size:var(--text-sm);white-space:nowrap}
[data-issues="workbench"] [data-issue-save]{align-self:flex-start}
@media(max-width:600px){[data-issues="workbench"] .issues-editor{padding:16px 16px 76px}[data-issues="workbench"] .issues-row{flex-wrap:wrap;gap:4px;padding:12px}[data-issues="workbench"] .issues-row-title{flex-basis:100%}}
`;
