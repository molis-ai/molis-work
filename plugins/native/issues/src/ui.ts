import type { UiContribution } from "@molis-ai/molis-work-contracts/platform/ui";
import { icon, renderPluginStageShell } from "@molis-ai/molis-work-design-system";
import { ISSUES_PLUGIN_ID, ISSUES_UI_CONTRIBUTION_ID } from "./manifest.js";

export const issuesUiContribution: UiContribution<unknown> = {
  descriptor: { contribution_id: ISSUES_UI_CONTRIBUTION_ID, plugin_id: ISSUES_PLUGIN_ID, kind: "primary-page", navigation_id: "issues", label: "Issue",
    surfaces: [{ surface_id: "workbench", target_slot_id: "workbench.main", format: "declarative-html" },
      { surface_id: "capture", target_slot_id: "workbench.side", format: "declarative-html" }], slots: [] },
  render: () => renderIssuesWorkbench(),
};

const types = (name: string) => `<div class="mw-toggle-group" data-issue-label role="radiogroup" aria-label="类型" data-issue-types="${name}">${[["bug", "Bug"], ["experience", "体验问题"], ["feature", "功能需求"]]
  .map(([value, label]) => `<button type="button" data-issue-label role="radio" aria-checked="false" data-type="${value}">${label}</button>`).join("")}</div>`;
const shots = (key: string) => `<div class="issues-shots" data-issue-${key}></div>`;

/**
 * One column everywhere (side panel, stage, full page): write at the top, your Issues below, a record replaces the
 * list when opened. A capture needs words or a picture and one keystroke; the Assistant names it after it is sent.
 */
export function renderIssuesWorkbench(): string {
  return renderPluginStageShell({ surface: "issues", label: "Issue", dataset: "issues", body: `<div class="issues" data-issue-root>
    <section class="issues-home" data-issue-home>
      <form class="issues-composer" data-issue-composer>
        <textarea data-issue-label name="description" rows="3" maxlength="100000" aria-label="问题描述" placeholder="遇到什么问题？写下来，截图可以直接粘贴"></textarea>
        ${shots("thumbs")}
        <div class="issues-bar">
          <button type="button" class="mw-btn mw-btn--ghost mw-btn--icon-only mw-btn--sm" data-issue-pick data-issue-label aria-label="添加截图" title="添加截图">${icon("image")}</button>
          <span class="issues-tip" data-issue-tip></span>
          <button type="submit" class="mw-btn mw-btn--primary mw-btn--sm" data-issue-submit data-issue-label>记录<span class="mw-btn__key" data-issue-key></span></button>
        </div>
      </form>
      <h2 class="issues-head" data-issue-label>我的 Issue</h2>
      <ol class="issues-list" data-issue-list data-issue-label aria-label="我的 Issue" aria-busy="true"></ol>
      <button type="button" class="mw-btn mw-btn--ghost mw-btn--sm issues-more" data-issue-more data-issue-label hidden>加载更多</button>
    </section>
    <article class="issues-detail" data-issue-detail hidden>
      <header class="issues-detail-bar">
        <button type="button" class="mw-btn mw-btn--ghost mw-btn--sm" data-issue-back>${icon("chevron-left")}<span data-issue-label>全部</span></button>
        <span></span>
        <button type="button" class="mw-btn mw-btn--ghost mw-btn--sm" data-issue-edit data-issue-label>编辑</button>
        <button type="button" class="mw-btn mw-btn--ghost mw-btn--sm" data-issue-delete data-issue-label>删除</button>
      </header>
      <div class="issues-page" data-issue-page>
        <div data-issue-view>
          <p class="issues-meta"><span class="mw-badge" data-issue-type></span> <span data-issue-when></span></p>
          <h1 data-issue-title></h1>
          <div class="issues-prose" data-issue-text></div>
          ${shots("view-shots")}
          <p class="issues-meta" data-issue-source></p>
        </div>
        <form class="issues-editor" data-issue-editor hidden novalidate>
          <p class="issues-flag" data-issue-flag role="status" hidden></p>
          <input class="mw-input" data-issue-label name="title" maxlength="200" aria-label="标题" placeholder="标题">
          ${types("edit")}
          <textarea class="mw-textarea" data-issue-label name="description" maxlength="100000" aria-label="问题描述" placeholder="问题描述"></textarea>
          ${shots("edit-shots")}
          <div class="issues-bar">
            <button type="button" class="mw-btn mw-btn--ghost mw-btn--icon-only mw-btn--sm" data-issue-pick data-issue-label aria-label="添加截图" title="添加截图">${icon("image")}</button>
            <span class="issues-tip" data-issue-tip></span>
            <button type="button" class="mw-btn mw-btn--ghost mw-btn--sm" data-issue-cancel data-issue-label>取消</button>
            <button type="button" class="mw-btn mw-btn--secondary mw-btn--sm" data-issue-redo data-issue-label hidden>重新整理</button>
            <button type="submit" class="mw-btn mw-btn--primary mw-btn--sm" data-issue-save data-issue-label>保存</button>
          </div>
        </form>
      </div>
    </article>
    <div class="issues-toast" data-issue-toast role="status" hidden><span></span><button type="button" class="mw-btn mw-btn--sm" data-issue-toast-action></button></div>
    <input type="file" accept="image/png,image/jpeg,image/webp" multiple hidden data-issue-files>
    <dialog class="mw-dialog issues-preview" data-issue-preview data-issue-label aria-label="截图">
      <form method="dialog"><img alt=""><button class="mw-btn mw-btn--secondary mw-btn--sm" data-issue-zoom data-issue-label type="button">原始尺寸</button><button class="mw-btn mw-btn--secondary mw-btn--sm" data-issue-label>关闭</button></form>
    </dialog>
    <dialog class="mw-dialog mw-dialog--form" data-issue-dialog aria-labelledby="issue-dialog-title">
      <form method="dialog" class="mw-dialog__shell mw-form"><div class="mw-form__body"><h2 id="issue-dialog-title"></h2><p></p></div>
        <footer class="mw-form__footer"><button class="mw-btn mw-btn--secondary" data-issue-label value="cancel">取消</button><button class="mw-btn mw-btn--danger" value="confirm"></button></footer>
      </form>
    </dialog>
  </div>` });
}

export const ISSUES_STYLES = `
[data-issues=workbench] [hidden]{display:none!important}
.issues{position:absolute;inset:0;display:flex;flex-direction:column;background:var(--paper);color:var(--ink)}
.issues-home,.issues-page{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;padding:12px 12px 72px}
.issues-home>*,.issues-page>*{max-width:720px;margin-inline:auto}
.issues-composer{border:1px solid var(--line-strong);border-radius:12px;padding:10px 10px 8px 12px;background:var(--paper);transition:border-color var(--dur-hover) var(--ease-quint),box-shadow var(--dur-hover) var(--ease-quint)}
.issues-composer:focus-within,.issues-composer.is-drop{border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 16%,transparent)}
.issues textarea{display:block;width:100%;resize:none;overflow:hidden;font:inherit;font-size:15px;line-height:1.65;color:var(--ink);background:transparent}
.issues-composer textarea{border:0!important;outline:0!important;box-shadow:none!important;border-radius:0;padding:0;min-height:69px}
.issues-bar{display:flex;align-items:center;gap:6px;margin-top:6px}
.issues-tip{flex:1;min-width:0;color:var(--muted);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.issues-tip.is-error{color:var(--red)}
.issues-shots{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.issues-shots:empty{display:none}
.issues-shots figure{position:relative;margin:0}
.issues-shots figure>button:first-child{display:block;padding:0;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--surface-soft);cursor:zoom-in}
.issues-shots img{display:block;width:64px;height:64px;object-fit:cover}
[data-issue-view-shots] img{width:auto;height:auto;max-width:100%;max-height:220px;object-fit:contain}
.issues-shots [data-remove]{position:absolute;top:-6px;right:-6px;width:22px;height:22px;min-height:0;padding:0;border-radius:50%;background:var(--action);color:var(--action-ink);font-size:13px;line-height:1}
.issues-head{display:flex;margin:20px auto 4px;padding:0 10px;font-size:12px;font-weight:var(--weight-control);color:var(--muted)}
.issues-list{list-style:none;padding:0;margin-block:0}
.issues-row{display:flex;gap:10px;align-items:flex-start;width:100%;padding:8px 10px;border:0;border-radius:10px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.issues-row:hover{background:var(--nav-hover)}.issues-row:focus-visible{outline:var(--focus-stroke);outline-offset:-2px}
.issues-row>span{flex:1;min-width:0}
.issues-row b{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-weight:var(--weight-control);overflow-wrap:anywhere}
.issues-row small,.issues-meta{display:block;color:var(--muted);font-size:12px;line-height:1.6;margin:2px 0 0}
.issues-row[data-state] b{font-weight:var(--weight-body);color:var(--ink-soft)}
.issues-row[data-state=attention] small{color:var(--amber)}
.issues-row .mw-spinner,.issues-dot{flex:none;margin-top:4px}
.issues-dot{width:8px;height:8px;margin:6px 3px 0;border-radius:50%;background:var(--amber)}
.issues-row.is-new{animation:issues-new 1.6s var(--ease-quint)}
@keyframes issues-new{from{background:var(--accent-soft)}}
.issues-empty{padding:28px 10px;color:var(--muted);font-size:13px;line-height:1.7;text-align:center}
.issues-more{display:flex;margin:8px auto}
.issues-detail{flex:1;min-height:0;display:flex;flex-direction:column}
.issues-detail-bar{display:flex;align-items:center;gap:4px;padding:8px 8px 0}.issues-detail-bar>span{flex:1}
.issues-detail-bar svg{width:16px;height:16px}
.issues h1{font-size:17px;line-height:1.45;font-weight:var(--weight-title);letter-spacing:-.01em;margin:6px auto 12px;overflow-wrap:anywhere}
.issues-prose{font-size:15px;line-height:1.75;white-space:pre-wrap;overflow-wrap:anywhere}
[data-issue-source]{margin-top:20px;padding-top:12px;border-top:1px solid var(--line)}
.issues-editor{display:grid;gap:12px}.issues-editor .mw-toggle-group{justify-self:start}
.issues-editor textarea{min-height:120px}
.issues-editor .issues-bar{position:sticky;bottom:-60px;padding:8px 0 60px;margin-bottom:-60px;background:var(--paper)}
.issues-flag{margin:0;padding:8px 10px;border-radius:8px;background:color-mix(in srgb,var(--amber) 12%,transparent);color:var(--ink);font-size:13px;line-height:1.6}
.issues-toast{position:absolute;left:50%;bottom:14px;z-index:5;transform:translateX(-50%);display:flex;align-items:center;gap:6px;max-width:calc(100% - 24px);padding:4px 4px 4px 14px;border-radius:999px;background:var(--action);color:var(--action-ink);box-shadow:var(--shadow);font-size:13px;animation:issues-toast var(--dur-move) var(--ease-quint)}
.issues-toast>span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.issues-toast .mw-btn{background:transparent;color:inherit;text-decoration:underline;text-underline-offset:3px}.issues-toast .mw-btn:empty{display:none}
@keyframes issues-toast{from{opacity:0;transform:translate(-50%,8px)}}
dialog.issues-preview{width:calc(100vw - 32px);max-width:1440px;height:calc(100dvh - 32px);padding:0}
.issues-preview form{position:relative;height:100%;overflow:auto;display:grid;place-items:safe center;padding:48px 16px 16px}
.issues-preview img{max-width:100%;max-height:100%;object-fit:contain}.issues-preview[data-zoom] img{max-width:none;max-height:none}
.issues-preview .mw-btn{position:absolute;top:10px;right:10px}.issues-preview [data-issue-zoom]{right:76px}
@media(max-width:760px){.issues textarea{font-size:16px}}
@media(prefers-reduced-motion:reduce){.issues-row.is-new,.issues-toast{animation:none}}
`;
