import type { UiContribution, UiContributionDescriptor, UiRenderRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import { icon, renderPluginStageShell } from "@molis-ai/molis-work-design-system";
import { IMAGES_PLUGIN_ID } from "@molis-ai/molis-work-contracts/modules/images";
import { IMAGES_UI_CONTRIBUTION_ID } from "./manifest.js";

export interface ImagesUiModel {
  readonly primitives: {
    escape(value: unknown): string;
    text(value: string, values?: Record<string, string | number>): string;
  };
}

export const imagesUiDescriptor: UiContributionDescriptor = {
  contribution_id: IMAGES_UI_CONTRIBUTION_ID,
  plugin_id: IMAGES_PLUGIN_ID,
  kind: "primary-page",
  navigation_id: "images",
  label: "图片",
  surfaces: [
    { surface_id: "directory", target_slot_id: "workbench.directory", format: "declarative-html" },
    { surface_id: "workbench", target_slot_id: "workbench.main", format: "declarative-html" },
  ],
  slots: [],
};

export const imagesUiContribution: UiContribution<ImagesUiModel> = {
  descriptor: imagesUiDescriptor,
  render(request: UiRenderRequest<ImagesUiModel>): string {
    if (request.surface === "directory") return "";
    if (request.surface === "workbench") return renderImagesWorkbench(request.model);
    throw new Error(`Images UI surface ${request.surface} 不存在`);
  },
};

export function renderImagesWorkbench({ primitives: p }: ImagesUiModel): string {
  return renderPluginStageShell({
    surface: "images", label: p.text("图片"), dataset: "images",
    body: `
      <div class="plugin-stage-list feed-stage-list feed-stage-tree" data-images="directory">
        <header class="plugin-stage-chrome">
          <button class="mw-btn mw-btn--ghost tree-create" type="button" data-images-new>${icon("plus")}<span>${p.text("新建图片")}</span></button>
          <button class="mw-btn mw-btn--ghost" type="button" data-images-refresh>${icon("refresh")}<span>${p.text("刷新")}</span></button>
        </header>
        <div class="mw-empty" data-images-history-empty><span class="mw-empty__mark">${icon("image")}</span><strong>${p.text("还没有图片")}</strong><p>${p.text("这里会留下当前项目的图片与生成记录。")}</p></div>
        <div data-images-rows></div>
        <p class="images-note" role="status" data-images-list-note hidden></p>
      </div>
      <div class="plugin-stage-workspace" data-images-workspace hidden>
        <header class="plugin-stage-detail-bar">
          <button class="plugin-stage-back" type="button" data-images-back aria-label="${p.text("返回生成记录")}" title="${p.text("返回生成记录")}">${icon("chevron-right")}</button>
          <h1 data-images-title>${p.text("新建图片")}</h1>
          <button class="mw-btn mw-btn--ghost" type="button" data-images-refresh>${p.text("刷新")}</button>
          <button class="mw-btn mw-btn--ghost" type="button" data-images-connections>${p.text("管理服务")}</button>
        </header>
        <div class="images-workspace-body">
          <form class="images-compose" data-images-compose>
            <div class="images-intro"><h2>${p.text("把想法变成图片")}</h2><p>${p.text("选择生图服务，写下画面、风格和细节。")}</p></div>
            <div class="images-connection-empty" data-images-connection-empty hidden><p>${p.text("先连接一个生图服务。密钥加密保存在这台电脑，配置可跨项目使用。")}</p><button class="mw-btn mw-btn--secondary" type="button" data-images-connections>${p.text("连接生图服务")}</button></div>
            <p class="images-note is-error" data-images-service-unavailable role="status" hidden></p>
            <div data-images-connected hidden>
              <label class="images-field-label">${p.text("生图服务与模型")}</label>
              <details class="images-service-menu" data-images-service-menu>
                <summary class="mw-btn mw-btn--secondary"><span data-images-service-label></span>${icon("chevron-down")}</summary>
                <div class="images-service-options" role="group" aria-label="${p.text("生图服务与模型")}" data-images-service-options></div>
              </details>
            </div>
            <label class="images-field"><span>${p.text("描述你想要的图片")}</span><textarea class="mw-textarea images-prompt" data-images-prompt rows="7" maxlength="32000" required placeholder="${p.text("例如：清晨的书桌，一杯咖啡和翻开的书，阳光从左侧照入，胶片摄影，暖色调。")}"></textarea></label>
            <div class="images-parameters">
              <label class="images-field" data-images-size-field><span>${p.text("图片尺寸（可选）")}</span><input class="mw-input" data-images-size autocomplete="off" maxlength="100" placeholder="${p.text("留空使用厂商默认，如 1024x1024 或 2K")}"><small>${p.text("可用尺寸由所选服务与模型决定。")}</small></label>
              <label class="images-field" data-images-ratio-field hidden><span>${p.text("宽高比（可选）")}</span><input class="mw-input" data-images-ratio autocomplete="off" maxlength="100" placeholder="${p.text("留空使用厂商默认，如 1:1 或 16:9")}"></label>
            </div>
            <div class="images-submit-row"><p>${p.text("点击生成将调用所选服务，费用由该厂商按实际用量收取。")}</p><button class="mw-btn mw-btn--primary" type="submit" data-images-generate disabled>${p.text("生成图片")}</button></div>
            <p class="images-note" data-images-project-note hidden>${p.text("请先选择一个项目，再生成图片。")}</p>
          </form>
          <section class="images-result" aria-label="${p.text("生成结果")}" data-images-result hidden></section>
          <p class="images-note" role="status" aria-live="polite" data-images-note hidden></p>
        </div>
      </div>
      <dialog class="mw-dialog images-connections-dialog" data-images-dialog aria-label="${p.text("管理生图服务")}">
        <form data-images-connection-form>
          <header class="images-dialog-header"><h2>${p.text("管理生图服务")}</h2><button class="mw-btn mw-btn--ghost" type="button" data-images-dialog-close>${p.text("关闭")}</button></header>
          <div class="images-dialog-body">
            <p class="images-help">${p.text("服务配置在这台电脑共享。兼容接入需要厂商支持下列协议。")}</p>
            <div class="images-saved-connections" role="group" aria-label="${p.text("已保存的服务")}" data-images-saved-connections></div>
            <fieldset class="images-connection-fields" data-images-connection-fields>
              <legend data-images-connection-heading>${p.text("添加服务")}</legend>
              <div class="images-presets" role="group" aria-label="${p.text("服务模板")}">
                <button type="button" class="mw-btn mw-btn--secondary" data-images-preset="openai">OpenAI</button>
                <button type="button" class="mw-btn mw-btn--secondary" data-images-preset="gemini">Gemini</button>
                <button type="button" class="mw-btn mw-btn--secondary" data-images-preset="custom">${p.text("自定义兼容服务")}</button>
              </div>
              <label class="images-field"><span>${p.text("服务名称")}</span><input class="mw-input" name="connection_name" data-images-connection-name required maxlength="100" autocomplete="off"></label>
              <div class="images-field"><span>${p.text("API 协议")}</span><div class="images-protocols" role="group" aria-label="${p.text("API 协议")}"><button class="mw-btn mw-btn--secondary" type="button" data-images-format="openai-images" aria-pressed="true">OpenAI Images</button><button class="mw-btn mw-btn--secondary" type="button" data-images-format="gemini" aria-pressed="false">Gemini generateContent</button></div></div>
              <label class="images-field"><span>${p.text("API 基址")}</span><input class="mw-input" name="base_url" data-images-connection-url type="url" required autocomplete="off" placeholder="https://api.openai.com/v1"></label>
              <label class="images-field"><span>${p.text("模型名称")}</span><input class="mw-input" name="model" data-images-connection-model required maxlength="200" autocomplete="off"></label>
              <label class="images-field"><span>${p.text("账号连接")}</span><select class="mw-select" data-images-connection-auth><option value="">${p.text("本机无鉴权服务")}</option></select><small data-images-key-help>${p.text("API Key 在 Connectors 统一管理。")}</small></label><a href="/settings/connectors?connector=image-api">${p.text("在 Connectors 管理图像 API Key")}</a>
            </fieldset>
          </div>
          <footer class="images-dialog-footer"><p class="images-note" role="status" data-images-connection-note hidden></p><div class="images-actions"><button class="mw-btn mw-btn--ghost" type="button" data-images-add-connection>${p.text("添加另一服务")}</button><button class="mw-btn mw-btn--primary" type="submit" data-images-save-connection>${p.text("保存服务")}</button></div></footer>
        </form>
      </dialog>`,
  });
}
