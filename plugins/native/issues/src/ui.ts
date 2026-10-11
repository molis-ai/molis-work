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
      <p class="issues-note" role="status" data-issue-list-note hidden></p>
      <div data-issue-list aria-label="个人问题列表" aria-live="polite"><div class="mw-empty" aria-busy="true"><span class="mw-skeleton">正在读取问题…</span></div></div>
      <button class="mw-btn mw-btn--secondary" type="button" data-issue-more hidden>加载更多</button>
    </div>
    <div class="plugin-stage-workspace" data-issue-workspace hidden>
      <header class="plugin-stage-detail-bar"><button class="plugin-stage-back" type="button" data-issue-back aria-label="返回问题列表">${icon("chevron-right")}</button>
        <span data-issue-heading>记录问题</span><button class="mw-btn mw-btn--ghost" type="button" data-issue-reread hidden>刷新详情</button>
        <button class="mw-btn mw-btn--ghost" type="button" data-issue-edit hidden>编辑</button>
        <button class="mw-btn mw-btn--ghost" type="button" data-issue-delete hidden>删除</button></header>
      <form class="issues-editor mw-form" data-issue-form>
        <div class="issues-scroll" data-issue-scroll>
        <section data-issue-view hidden><p class="issues-kind" data-issue-view-type></p><h2 data-issue-view-title></h2><p class="issues-meta" data-issue-meta></p><div class="issues-prose" data-issue-view-description></div><div class="issues-images" data-issue-view-images></div></section>
        <fieldset class="issues-fields" data-issue-inputs>
        <section class="issues-comparison" data-issue-comparison aria-label="核对最新内容与草稿" hidden>
          <h3>核对最新内容与草稿</h3><p>保留修改后继续编辑，放弃草稿则查看最新内容。</p>
          <div class="issues-compare-grid"><strong>最新内容</strong><strong>我的草稿</strong>
          ${[["title", "标题"], ["type", "问题类型"], ["description", "问题描述"], ["images", "图片"]].map(([field, label]) =>
            `<div><b>${label}</b><pre data-issue-latest="${field}"></pre></div><div><b>${label}</b><pre data-issue-draft="${field}"></pre></div>`).join("")}</div>
          <button class="mw-btn mw-btn--secondary" type="button" data-issue-keep>保留我的修改，继续编辑</button>
          <button class="mw-btn mw-btn--ghost" type="button" data-issue-accept>放弃草稿，使用最新内容</button>
        </section>
        <div class="mw-field"><label for="issue-description">问题描述</label>
          <div class="issues-composer" data-issue-drop>
            <textarea id="issue-description" class="mw-textarea" name="description" maxlength="100000" rows="1" placeholder="描述发生了什么、期望怎样，也可以把图片拖到这里。" aria-describedby="issue-image-hint"></textarea>
            <div class="issues-images" data-issue-images></div>
            <div class="issues-tools"><button class="mw-btn mw-btn--ghost" type="button" data-issue-pick>${icon("image")}<span>添加图片</span></button>
              <span class="issues-meta" data-issue-image-count></span><input type="file" accept="image/png,image/jpeg,image/webp" multiple data-issue-files hidden>
            </div>
          </div><small class="issues-meta" id="issue-image-hint">可拖入或粘贴图片，最多 6 张。大图会压缩后保存。</small>
        </div>
        <label class="mw-field" hidden>标题<input class="mw-input" name="title" maxlength="200" placeholder="用一句话概括问题"></label>
        <label class="mw-field" hidden>问题类型<select class="mw-select" name="type"><option value="">提交前请选择</option><option value="bug">Bug</option><option value="experience">体验问题</option><option value="feature">功能需求</option></select></label>
        </fieldset>
        </div>
        <footer class="issues-footer">
          <div data-issue-assistant-tools><p class="issues-assistant-note" data-issue-assistant-note role="status"></p>
            <p class="issues-meta" data-issue-assistant-help>助理会建议标题和类型，确认后保存。</p>
            <a href="/settings/models" data-issue-model-settings hidden>模型设置</a></div>
          <p class="issues-note" role="status" data-issue-note hidden></p>
          <div class="issues-tools" data-issue-actions>
            <button class="mw-btn mw-btn--primary" type="submit" data-issue-save hidden>保存问题</button>
            <button class="mw-btn mw-btn--primary" type="button" data-issue-organize>交给助理整理</button>
            <button class="mw-btn mw-btn--primary" type="button" data-issue-retry hidden>重试整理</button>
            <button class="mw-btn mw-btn--ghost" type="button" data-issue-revise hidden>修改描述和图片</button>
            <button class="mw-btn mw-btn--ghost" type="button" data-issue-manual>手动填写标题和类型</button>
            <button class="mw-btn mw-btn--ghost" type="button" data-issue-cancel-edit hidden>取消编辑</button>
          </div>
        </footer>
      </form>
    </div>
    <dialog class="mw-dialog issues-image-dialog" data-issue-image-dialog aria-label="图片预览">
      <form method="dialog" class="mw-dialog__shell"><header class="issues-image-bar"><span data-issue-image-name></span><button type="button" class="mw-btn mw-btn--secondary" data-issue-zoom>原始尺寸</button><button class="mw-btn mw-btn--ghost" data-issue-image-close>关闭</button></header><div class="issues-image-canvas"><img class="issues-preview" alt=""></div></form>
    </dialog>
    <dialog class="mw-dialog mw-dialog--form" data-issue-dialog aria-labelledby="issue-dialog-title">
      <form method="dialog" class="mw-dialog__shell mw-form"><div class="mw-form__body"><h2 id="issue-dialog-title" data-issue-dialog-title></h2><p data-issue-dialog-text></p></div>
        <footer class="mw-form__footer"><button class="mw-btn mw-btn--secondary" value="cancel">取消</button><button class="mw-btn mw-btn--primary" value="confirm" data-issue-dialog-ok>确认</button></footer>
      </form>
    </dialog>` });
}
export const ISSUES_STYLES = `
[data-issues="workbench"] [hidden]{display:none!important}.issues-assistant-note:empty{display:none}
.issues-intro{color:var(--muted);margin:0 0 20px}
.issues-editor{width:100%;flex:1;display:flex;flex-direction:column;overflow:hidden;min-height:0}
.issues-scroll{flex:1;overflow:auto;min-height:0;padding:32px max(24px,calc((100% - 48rem)/2)) 24px;scrollbar-gutter:stable}
.issues-footer{flex:none;padding:12px 24px 16px;border-top:1px solid var(--line);background:var(--paper)}
.issues-footer:has([data-issue-actions][hidden]):has([data-issue-note][hidden]){display:none}
.issues-fields{border:0;padding:0;margin:0;min-width:0;display:grid;gap:24px}.issues-prose{font-size:15px;line-height:1.8;white-space:pre-wrap;overflow-wrap:anywhere;margin-top:24px}
[data-issue-view] h2{font-size:24px;line-height:1.4;font-weight:var(--weight-title);letter-spacing:-.02em;overflow-wrap:anywhere;margin:8px 0 12px}
.issues-kind{font-size:12px;color:var(--muted);margin:0}
[data-issues="workbench"] .mw-field{display:flex;flex-direction:column;gap:8px;font-weight:var(--weight-control);scroll-margin-block:8px}
[data-issues="workbench"] .mw-field :is(input,select,textarea){font-weight:var(--weight-body)}
[data-issues="workbench"] .mw-select{background-repeat:no-repeat;background-position:right 8px center;background-size:14px 14px}
.issues-meta{color:var(--muted);font-size:12px;font-weight:var(--weight-body);line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere;margin:0}
.issues-note{font-size:13px;line-height:1.6;margin:0 0 8px;color:var(--ink)}
.issues-note.is-error,.issues-assistant-note.is-error{color:var(--red)}
.issues-assistant-note{font-size:12px;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere;max-height:8rem;overflow:auto;margin:0 0 8px;color:var(--muted)}
[data-issues="workbench"] [data-issue-list] .issues-row{width:100%;height:auto;min-height:60px;display:flex;align-items:center;gap:12px;padding:10px 12px;text-align:left}
[data-issues="workbench"] .issues-row[aria-current="true"]{background:var(--nav-hover);box-shadow:inset 2px 0 var(--ink)}
.issues-row-title{flex:1;min-width:0;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;font-weight:var(--weight-control);overflow-wrap:anywhere}
.issues-row-meta{color:var(--muted);font-size:12px;white-space:nowrap}
[data-issues="workbench"] [data-issue-save]{align-self:flex-start}
.issues-comparison{border:1px solid var(--line-strong);padding:16px;border-radius:8px}
.issues-compare-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:16px 0}
.issues-compare-grid pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:10rem;overflow:auto;font:inherit;margin:4px 0}
.issues-composer{border:1px solid var(--line-strong);border-radius:8px;overflow:hidden}.issues-composer.is-dragging,.issues-composer:focus-within{outline:var(--focus-stroke);outline-offset:var(--focus-stroke-inset)}
[data-issues="workbench"] .issues-editor .issues-composer textarea.mw-textarea{display:block;border:0;border-radius:0;outline:none;width:100%;min-height:0;max-height:none;resize:none;overflow:hidden;box-shadow:none;background:transparent;font-size:15px;line-height:1.8}.issues-tools,.issues-images{display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:8px}
.issues-footer .issues-tools{padding:8px 0 0}
.issues-images:empty{display:none}.issues-images figure{margin:0;max-width:140px}.issues-images img,.issues-compare-grid img{max-width:120px;height:80px;object-fit:contain}
.issues-images figcaption{display:flex;align-items:center;gap:4px}.issues-images figcaption span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.issues-images figcaption button{min-width:44px;min-height:44px}
dialog.issues-image-dialog{width:calc(100vw - 48px);max-width:1440px;height:calc(100dvh - 48px);max-height:1000px}
.issues-image-dialog form{display:flex;flex-direction:column}.issues-image-bar{display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid var(--line)}
.issues-image-bar span{flex:1;min-width:0;overflow-wrap:anywhere;font-size:12px}.issues-image-canvas{flex:1;min-height:0;overflow:auto;padding:16px;display:grid;grid-template: minmax(0,1fr) / minmax(0,1fr);place-items:safe center}
.issues-preview{max-width:100%;max-height:100%;object-fit:contain}.issues-image-dialog[data-zoom="true"] img{max-width:none;max-height:none}
@media(max-width:760px){[data-issues="workbench"] .issues-editor .issues-composer textarea.mw-textarea{font-size:16px}}
@media(max-width:600px){.issues-scroll{padding:24px 16px}.issues-footer{padding:12px 16px}[data-issue-view] h2{font-size:20px}.issues-row{flex-wrap:wrap;gap:4px;padding:12px}.issues-row-title{flex-basis:100%}dialog.issues-image-dialog{width:calc(100vw - 16px);height:calc(100dvh - 16px)}}
`;
