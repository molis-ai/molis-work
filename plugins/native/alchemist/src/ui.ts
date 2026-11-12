import type { UiContribution, UiContributionDeclaration } from "@molis-ai/molis-work-contracts/platform/ui";
import { t as uiText, icon, renderPluginStageShell } from "@molis-ai/molis-work-plugin-sdk/ui";
export const ALCHEMIST_UI_CONTRIBUTION_ID = "io.molis.work.native.alchemist.ui.v1";
export type AlchemistUiSurface = "directory" | "workbench";
export interface AlchemistUiPrimitives { escape(value: unknown): string; text(value: string, values?: Record<string,string|number>): string }
export interface AlchemistUiModel { readonly primitives: AlchemistUiPrimitives }
export const alchemistUiDescriptor: UiContributionDeclaration = {
  contribution_id: ALCHEMIST_UI_CONTRIBUTION_ID, kind: "primary-page", navigation_id: "alchemist", label: "炼金术士",
  surfaces: [{surface_id:"directory",target_slot_id:"workbench.directory",format:"declarative-html"},{surface_id:"workbench",target_slot_id:"workbench.main",format:"declarative-html"}], slots: [],
};
export const alchemistUiContribution: UiContribution<AlchemistUiModel> = { descriptor: alchemistUiDescriptor, render(request) { return request.surface === "directory" ? "" : renderAlchemistWorkbench(request.model); } };
export function renderAlchemistWorkbench({primitives:p}:AlchemistUiModel):string {
  const t=(s:string)=>p.escape(uiText.text(s));
  const btn=(name:string,action:string,primary=false)=>`<button type="button" class="mw-btn mw-btn--${primary?'primary':'ghost'}" data-alc-action="${action}">${t(name)}</button>`;
  return renderPluginStageShell({surface:"alchemist",label:"炼金术士",dataset:"alchemist",body:`
    <div class="plugin-stage-list feed-stage-list feed-stage-tree alc-list" data-alchemist="directory">
      <header class="plugin-stage-chrome"><button type="button" class="mw-btn mw-btn--ghost tree-create" data-alc-action="new">${icon("plus")}<span>${t("alchemist.ui.new-direction")}</span></button><button type="button" class="mw-btn mw-btn--ghost" data-alc-action="settings">${icon("tune")}<span>${t("alchemist.ui.research-preferences")}</span></button></header>
      <nav class="alc-collections" aria-label="${t("alchemist.ui.alchemist-collections")}">${[['directions','alchemist.ui.collection-directions'],['ideas','alchemist.ui.collection-kept'],['pulse','alchemist.ui.collection-market-pulse'],['decisions','alchemist.ui.collection-decisions']].map(([id,label])=>`<button type="button" class="mw-btn mw-btn--ghost" data-alc-collection="${id}" aria-pressed="${id==='directions'}">${t(label!)}</button>`).join('')}</nav>
      <label class="alc-search">${icon('search')}<input class="mw-input" type="search" data-alc-search placeholder="${t("alchemist.ui.search-collection")}" aria-label="${t("alchemist.ui.search-collection")}"></label>
      <div data-alc-list-actions class="alc-list-actions"></div>
      <p class="alc-muted alc-list-note" data-alc-pulse-note hidden>${t("alchemist.ui.collecting-contacts-toolify-watcha-git-hub-only-reads")}</p>
      <div data-alc-rows><p class="alc-empty mw-loading">${t("alchemist.ui.loading")}</p></div>
    </div>
    <section class="plugin-stage-workspace alc-workspace" data-alc-workspace hidden>
      <header class="plugin-stage-detail-bar"><button type="button" class="plugin-stage-back" data-alc-action="back" aria-label="${t("alchemist.ui.back-list")}">${icon('arrow')}</button><h1 data-alc-title></h1>${btn("alchemist.ui.discuss",'chat')}${btn("alchemist.ui.annotations",'annotations')}</header>
      <div class="alc-detail-layout"><div class="alc-document"><div class="alc-content" data-alc-content></div><footer class="alc-footer" data-alc-footer></footer></div>
        <aside class="alc-context-panel" data-alc-side hidden aria-label="${t("alchemist.ui.discussion-annotations-item")}"><header><span data-alc-side-title></span>${btn("alchemist.ui.close",'side-close')}</header><div data-alc-side-body></div></aside>
      </div>
    </section>
    <div class="alc-notice" data-alc-notice hidden role="status"><span></span>${btn("alchemist.ui.retry",'reload')}${btn("alchemist.ui.close",'notice-close')}</div>
    <template data-alc-github><label class="alc-field">${t("alchemist.ui.git-hub-account")}<select class="mw-select" name="githubAccount"><option value="">${t("alchemist.ui.anonymous")}</option></select></label><p class="alc-muted">${t("alchemist.ui.every-project-shares-choice-git-hub-source-uses")}</p></template>
    <dialog class="mw-dialog alc-dialog" data-alc-dialog aria-labelledby="alc-dialog-title"><form data-alc-form><header><h2 id="alc-dialog-title"></h2>${btn("alchemist.ui.close",'close')}</header><div class="alc-dialog-body" data-alc-dialog-body></div><p role="alert" class="alc-error" data-alc-form-error hidden></p><footer>${btn("alchemist.ui.cancel",'close')}<button class="mw-btn mw-btn--primary" type="submit" data-alc-submit>${t("alchemist.ui.save")}</button></footer></form></dialog>
  `});
}
