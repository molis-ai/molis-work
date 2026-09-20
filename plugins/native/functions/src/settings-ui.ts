import type {
  UiContribution,
  UiContributionDescriptor,
  UiRenderRequest,
} from "@molis-ai/molis-work-contracts/platform/ui";
import type { FunctionsSettingsStatus } from "@molis-ai/molis-work-contracts/modules/functions";
import type { FunctionsUiPrimitives } from "./ui.js";

export const FUNCTIONS_SETTINGS_UI_CONTRIBUTION_ID = "io.molis.work.native.functions.settings.v1";

export interface FunctionsSettingsUiModel {
  readonly settings: FunctionsSettingsStatus;
  readonly primitives: FunctionsUiPrimitives;
}

export const functionsSettingsUiDescriptor: UiContributionDescriptor = {
  contribution_id: FUNCTIONS_SETTINGS_UI_CONTRIBUTION_ID,
  plugin_id: "io.molis.work.functions",
  kind: "settings-page",
  navigation_id: "functions",
  label: "Functions",
  surfaces: [
    { surface_id: "settings", target_slot_id: "workbench.settings", format: "declarative-html" },
  ],
  slots: [],
};

export const functionsSettingsUiContribution: UiContribution<FunctionsSettingsUiModel> = {
  descriptor: functionsSettingsUiDescriptor,
  render(request: UiRenderRequest<FunctionsSettingsUiModel>): string {
    if (request.surface !== "settings") {
      throw new Error(`Functions settings surface ${request.surface} 不存在`);
    }
    return renderFunctionsSettings(request.model);
  },
};

export function renderFunctionsSettings(model: FunctionsSettingsUiModel): string {
  const { primitives: p, settings } = model;
  const fromEnv = settings.source === "env";
  const configured = settings.has_credential;
  const status = fromEnv
    ? p.text("由环境变量 TYPESAFE_API_KEY 提供，输入框不可改。")
    : configured
      ? p.text("已配置。页面不会再显示明文。")
      : p.text("还没有 Key。没有它也能写草稿，试跑时会停住。");
  return `<section class="settings-document functions-settings-document" data-functions-settings data-settings-panel="functions" aria-labelledby="functions-settings-title">
    <header class="settings-heading">
      <div class="settings-heading-title">
        <h1 id="functions-settings-title">${p.text("Functions")}</h1>
      </div>
      <p>${p.text("TypeSafe 的 Jev 用来跑这些判断。Key 留在这台机器，保存后页面不会再显示明文。")}</p>
    </header>
    <form class="functions-settings-form" data-functions-settings-form>
      <label class="settings-field">${p.text("TypeSafe API Key")}
        <input class="mw-input" type="password" name="api_key" data-functions-api-key autocomplete="off" ${fromEnv ? "disabled" : ""} placeholder="${configured && !fromEnv ? "••••••••" : ""}">
      </label>
      <p class="functions-settings-status" data-functions-settings-status data-source="${p.escape(settings.source)}">${status}</p>
      <div class="functions-settings-actions">
        <button class="mw-btn mw-btn--primary" type="submit" data-functions-key-save ${fromEnv ? "disabled" : ""}>${p.text("保存")}</button>
        <button class="mw-btn mw-btn--ghost" type="button" data-functions-key-clear ${fromEnv || !configured ? "hidden" : ""}>${p.text("清除")}</button>
      </div>
      <p class="functions-settings-hint">${p.text("保存只记下已配置，不会向 TypeSafe 发探测。试跑成功才算连通。")}</p>
    </form>
  </section>`;
}
