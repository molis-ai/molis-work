import type { UiContribution, UiContributionDescriptor } from "@molis-ai/molis-work-contracts/platform/ui";
import { icon, renderPluginStageShell } from "@molis-ai/molis-work-design-system";
export const COGNIA_UI_CONTRIBUTION_ID = "io.molis.work.cognia.ui.v1";
export interface CogniaUiModel { primitives: { escape(value: unknown): string; text(value: string): string } }
export const cogniaUiDescriptor: UiContributionDescriptor = { contribution_id: COGNIA_UI_CONTRIBUTION_ID, plugin_id: "io.molis.work.cognia", kind: "primary-page", navigation_id: "cognia", label: "Cognia", surfaces: [{ surface_id: "directory", target_slot_id: "workbench.directory", format: "declarative-html" }, { surface_id: "workbench", target_slot_id: "workbench.main", format: "declarative-html" }], slots: [] };
export const cogniaUiContribution: UiContribution<CogniaUiModel> = { descriptor: cogniaUiDescriptor, render(request) { return request.surface === "directory" ? "" : renderCogniaWorkbench(request.model); } };
export function renderCogniaWorkbench({ primitives: p }: CogniaUiModel): string {
  const t = (value: string) => p.escape(p.text(value));
  const button = (label: string, action: string, primary = false) => `<button type="button" class="mw-btn mw-btn--${primary ? "primary" : "ghost"}" data-cognia-action="${action}">${t(label)}</button>`;
  const tool = (label: string, action: string, glyph: Parameters<typeof icon>[0], create = false) => `<button type="button" class="mw-btn mw-btn--ghost${create ? " tree-create" : ""}" data-cognia-action="${action}">${icon(glyph)}<span>${t(label)}</span></button>`;
  return renderPluginStageShell({ surface: "cognia", label: "Cognia", dataset: "cognia", body: `
    <div class="plugin-stage-list feed-stage-list feed-stage-tree cognia-list" data-cognia="directory">
      <header class="plugin-stage-chrome cognia-toolbar">${tool("导入知识库", "import", "upload", true)}${tool("添加材料", "add", "plus")}${tool("新建领域", "domain", "folder")}</header>
      <p class="cognia-scope">${t("个人知识库 · 所有项目可见")}</p>
      <div class="cognia-filters"><label class="cognia-search">${icon("search")}<input class="mw-input" type="search" data-cognia-search aria-label="${t("搜索资料全文")}" placeholder="${t("搜索资料全文")}"></label><select class="mw-select" data-cognia-domain aria-label="${t("领域")}"><option value="">${t("全部领域")}</option></select><select class="mw-select" data-cognia-source aria-label="${t("来源")}"><option value="">${t("全部来源")}</option></select><details class="cognia-manage"><summary class="mw-btn mw-btn--ghost">${icon("more")}${t("管理分类")}</summary><div>${button("重命名领域", "rename-domain")}${button("删除领域", "delete-domain")}${button("重命名来源", "rename-source")}${button("删除来源", "delete-source")}</div></details></div>
      <div class="cognia-selection">${tool("整理选中材料", "synthesize", "sparkles")}<span data-cognia-selected>${t("选择 1–5 份材料")}</span><span class="cognia-selection__gap" aria-hidden="true"></span>${tool("检索问答", "query", "message")}${tool("审阅草稿", "drafts", "review")}</div>
      <p class="cognia-model-note" data-cognia-model hidden>${t("尚未配置文字模型，导入、搜索和阅读仍可使用。")}</p>
      <button class="mw-btn mw-btn--ghost cognia-model-settings" type="button" data-cognia-action="model-settings" hidden>${t("打开模型设置")}</button>
      <div data-cognia-rows aria-live="polite"><p class="cognia-empty">${t("正在读取资料…")}</p></div>
    </div>
    <section class="plugin-stage-workspace cognia-workspace" data-cognia-workspace hidden>
      <header class="plugin-stage-detail-bar"><button type="button" class="plugin-stage-back" data-cognia-action="back" aria-label="${t("返回资料列表")}">${icon("chevron-right")}</button><h1 data-cognia-heading>${t("资料")}</h1>${button("编辑", "edit-material")}${button("移出列表", "delete-material")}${button("整理为知识", "synthesize-current")}<a class="mw-btn mw-btn--ghost" data-cognia-download>${t("下载原文")}</a></header>
      <div class="cognia-reading" data-cognia-reading></div>
    </section>
    <div class="cognia-notice" role="status" data-cognia-notice hidden><span></span>${button("重试读取", "reload")}</div>
    <dialog class="mw-dialog cognia-dialog" data-cognia-dialog aria-labelledby="cognia-dialog-title"><form data-cognia-form><header><h2 id="cognia-dialog-title"></h2>${button("关闭", "close")}</header><div class="cognia-dialog-scroll" data-cognia-dialog-content></div><p class="cognia-error" role="alert" data-cognia-error hidden></p><footer><span data-cognia-step></span><div>${button("取消", "close")}<button class="mw-btn mw-btn--primary" type="submit" data-cognia-submit>${t("继续")}</button></div></footer></form></dialog>
  ` });
}
