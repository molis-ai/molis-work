import type { UiContribution, UiRenderRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import { icon, renderPluginStageShell } from "@molis-ai/molis-work-design-system";
import { ISSUES_PLUGIN_ID, ISSUES_UI_CONTRIBUTION_ID } from "./manifest.js";

export { ISSUES_STYLES } from "./styles.js";

type Text = (key: string, values?: Record<string, string | number>) => string;
export interface IssuesUiModel {
  readonly primitives: { text: Text };
}

export const issuesUiContribution: UiContribution<IssuesUiModel> = {
  descriptor: { contribution_id: ISSUES_UI_CONTRIBUTION_ID, plugin_id: ISSUES_PLUGIN_ID, kind: "primary-page", navigation_id: "issues", label: "Issue",
    surfaces: [{ surface_id: "workbench", target_slot_id: "workbench.main", format: "declarative-html" },
      { surface_id: "capture", target_slot_id: "workbench.side", format: "declarative-html" }], slots: [] },
  render: (request: UiRenderRequest<IssuesUiModel>) => renderIssuesWorkbench(request.model),
};

const KINDS: readonly [string, string][] = [["bug", "issues.kind.bug"], ["experience", "issues.kind.experience"], ["feature", "issues.kind.feature"]];
const types = (name: string, t: Text) => `<div class="mw-toggle-group" role="radiogroup" aria-label="${t("issues.editor.type")}" data-issue-types="${name}">${KINDS
  .map(([value, key]) => `<button type="button" role="radio" aria-checked="false" data-type="${value}">${t(key)}</button>`).join("")}</div>`;
const shots = (key: string) => `<div class="issues-shots" data-issue-${key}></div>`;

/**
 * One column everywhere (side panel, stage, full page): write at the top, your Issues below, a record replaces the
 * list when opened. A capture needs words or a picture and one keystroke; the Assistant names it after it is sent.
 */
export function renderIssuesWorkbench(model: IssuesUiModel): string {
  const t = model.primitives.text;
  return renderPluginStageShell({ surface: "issues", label: "Issue", dataset: "issues", body: `<div class="issues" data-issue-root>
    <section class="issues-home" data-issue-home>
      <p class="mw-alert mw-alert--info issues-gone" data-issue-gone role="status" hidden></p>
      <form class="issues-composer" data-issue-composer>
        <textarea data-fit name="description" rows="3" maxlength="100000" aria-label="${t("issues.composer.label")}" placeholder="${t("issues.composer.placeholder")}"></textarea>
        ${shots("thumbs")}
        <div class="issues-bar">
          <button type="button" class="mw-btn mw-btn--ghost mw-btn--icon-only mw-btn--sm" data-issue-pick aria-label="${t("issues.composer.add-shot")}" title="${t("issues.composer.add-shot")}">${icon("image")}</button>
          <span class="issues-tip" data-issue-tip></span>
          <button type="submit" class="mw-btn mw-btn--primary mw-btn--sm" data-issue-submit>${t("issues.composer.record")}<span class="mw-btn__key" data-issue-key></span></button>
        </div>
      </form>
      <h2 class="issues-head">${t("issues.list.title")}</h2>
      <ol class="issues-list" data-issue-list aria-label="${t("issues.list.title")}" aria-busy="true"></ol>
      <button type="button" class="mw-btn mw-btn--ghost mw-btn--sm issues-more" data-issue-more hidden>${t("issues.list.more")}</button>
    </section>
    <article class="issues-detail" data-issue-detail hidden>
      <header class="issues-detail-bar">
        <button type="button" class="mw-btn mw-btn--ghost mw-btn--sm" data-issue-back>${icon("chevron-left")}<span>${t("issues.detail.all")}</span></button>
        <span></span>
        <button type="button" class="mw-btn mw-btn--ghost mw-btn--sm" data-issue-edit>${t("issues.detail.edit")}</button>
        <button type="button" class="mw-btn mw-btn--ghost mw-btn--sm" data-issue-delete>${t("issues.detail.delete")}</button>
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
          <input class="mw-input" name="title" maxlength="200" aria-label="${t("issues.editor.title")}" placeholder="${t("issues.editor.title")}">
          ${types("edit", t)}
          <textarea class="mw-textarea" data-fit name="description" maxlength="100000" aria-label="${t("issues.editor.description")}" placeholder="${t("issues.editor.description")}"></textarea>
          ${shots("edit-shots")}
          <div class="issues-bar">
            <button type="button" class="mw-btn mw-btn--ghost mw-btn--icon-only mw-btn--sm" data-issue-pick aria-label="${t("issues.composer.add-shot")}" title="${t("issues.composer.add-shot")}">${icon("image")}</button>
            <span class="issues-tip" data-issue-tip></span>
            <button type="button" class="mw-btn mw-btn--ghost mw-btn--sm" data-issue-cancel>${t("issues.editor.cancel")}</button>
            <button type="button" class="mw-btn mw-btn--secondary mw-btn--sm" data-issue-redo hidden>${t("issues.editor.redo")}</button>
            <button type="submit" class="mw-btn mw-btn--primary mw-btn--sm" data-issue-save>${t("issues.editor.save")}</button>
          </div>
        </form>
      </div>
    </article>
    <div class="mw-toast issues-toast" data-issue-toast role="status" hidden><span></span><button type="button" class="mw-toast__action" data-issue-toast-action></button></div>
    <input type="file" accept="image/png,image/jpeg,image/webp" multiple hidden data-issue-files>
    <dialog class="mw-dialog issues-preview" data-issue-preview aria-label="${t("issues.shots.preview")}">
      <form method="dialog"><header><button class="mw-btn mw-btn--secondary mw-btn--sm" data-issue-zoom type="button">${t("issues.shots.actual-size")}</button><button class="mw-btn mw-btn--secondary mw-btn--sm">${t("issues.shots.close")}</button></header><div class="issues-preview-body"><div class="issues-preview-view" data-issue-picture><img alt=""></div></div></form>
    </dialog>
    <dialog class="mw-dialog mw-dialog--form" data-issue-dialog aria-labelledby="issue-dialog-title">
      <form method="dialog" class="mw-dialog__shell mw-form"><div class="mw-form__body"><h2 id="issue-dialog-title"></h2><p></p></div>
        <footer class="mw-form__footer"><button class="mw-btn mw-btn--secondary" value="cancel">${t("issues.editor.cancel")}</button><button class="mw-btn mw-btn--danger" value="confirm"></button></footer>
      </form>
    </dialog>
  </div>` });
}
