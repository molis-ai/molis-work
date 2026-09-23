import type { UiContribution, UiContributionDescriptor } from "@molis-ai/molis-work-contracts/platform/ui";
import { icon, renderPluginStageShell } from "@molis-ai/molis-work-design-system";
export const ALCHEMIST_UI_CONTRIBUTION_ID = "io.molis.work.native.alchemist.ui.v1";
export type AlchemistUiSurface = "directory" | "workbench";
export interface AlchemistUiPrimitives { escape(value: unknown): string; text(value: string, values?: Record<string,string|number>): string }
export interface AlchemistUiModel { readonly primitives: AlchemistUiPrimitives }
export const alchemistUiDescriptor: UiContributionDescriptor = {
  contribution_id: ALCHEMIST_UI_CONTRIBUTION_ID, plugin_id: "io.molis.work.alchemist", kind: "primary-page", navigation_id: "alchemist", label: "炼金术士",
  surfaces: [{surface_id:"directory",target_slot_id:"workbench.directory",format:"declarative-html"},{surface_id:"workbench",target_slot_id:"workbench.main",format:"declarative-html"}], slots: [],
};
export const alchemistUiContribution: UiContribution<AlchemistUiModel> = { descriptor: alchemistUiDescriptor, render(request) { return request.surface === "directory" ? "" : renderAlchemistWorkbench(request.model); } };
export function renderAlchemistWorkbench({primitives:p}:AlchemistUiModel):string {
  const t=(s:string)=>p.escape(p.text(s));
  const btn=(name:string,action:string,primary=false)=>`<button type="button" class="mw-btn mw-btn--${primary?'primary':'ghost'}" data-alc-action="${action}">${t(name)}</button>`;
  return renderPluginStageShell({surface:"alchemist",label:"炼金术士",dataset:"alchemist",body:`
    <div class="plugin-stage-list feed-stage-list feed-stage-tree alc-list" data-alchemist="directory">
      <header class="plugin-stage-chrome">${btn("新建方向","new",true)}${btn("研究偏好","settings")}</header>
      <nav class="alc-collections" aria-label="${t('炼金术集合')}">${[['directions','方向'],['ideas','已保留'],['pulse','市场脉搏'],['decisions','决策']].map(([id,label])=>`<button type="button" class="mw-btn mw-btn--ghost" data-alc-collection="${id}" aria-pressed="${id==='directions'}">${t(label!)}</button>`).join('')}</nav>
      <label class="alc-search">${icon('search')}<input class="mw-input" type="search" data-alc-search placeholder="${t('搜索当前集合')}" aria-label="${t('搜索当前集合')}"></label>
      <div data-alc-list-actions class="alc-list-actions"></div>
      <div data-alc-rows><p class="alc-empty">${t('正在读取…')}</p></div>
    </div>
    <section class="plugin-stage-workspace alc-workspace" data-alc-workspace hidden>
      <header class="plugin-stage-detail-bar"><button type="button" class="plugin-stage-back" data-alc-action="back" aria-label="${t('返回列表')}">${icon('arrow')}</button><h1 data-alc-title></h1>${btn('讨论','chat')}${btn('注释','annotations')}</header>
      <div class="alc-detail-layout"><div class="alc-document"><div class="alc-content" data-alc-content></div><footer class="alc-footer" data-alc-footer></footer></div>
        <aside class="alc-context-panel" data-alc-side hidden aria-label="${t('当前对象讨论与注释')}"><header><span data-alc-side-title></span>${btn('关闭','side-close')}</header><div data-alc-side-body></div></aside>
      </div>
    </section>
    <div class="alc-notice" data-alc-notice hidden role="status"><span></span>${btn('重试','reload')}${btn('关闭','notice-close')}</div>
    <dialog class="mw-dialog alc-dialog" data-alc-dialog aria-labelledby="alc-dialog-title"><form data-alc-form><header><h2 id="alc-dialog-title"></h2>${btn('关闭','close')}</header><div class="alc-dialog-body" data-alc-dialog-body></div><p role="alert" class="alc-error" data-alc-form-error hidden></p><footer>${btn('取消','close')}<button class="mw-btn mw-btn--primary" type="submit" data-alc-submit>${t('保存')}</button></footer></form></dialog>
  `});
}
