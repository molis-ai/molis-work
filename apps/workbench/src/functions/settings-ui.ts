import type { FunctionsSettingsStatus } from "@molis-ai/molis-work-contracts/modules/functions";
import type { FunctionsUiPrimitives } from "./ui.js";

export interface FunctionsSettingsUiModel {
  readonly settings: FunctionsSettingsStatus;
  readonly primitives: FunctionsUiPrimitives;
  readonly connections?: readonly { connection_id: string; display_name: string; state: string }[];
  readonly selected_connection_id?: string;
  readonly embedded?: boolean;
}

export function renderFunctionsSettings(model: FunctionsSettingsUiModel): string {
  const { primitives: p, settings } = model;
  const configured = settings.has_credential;
  const status = settings.source === "env" ? p.text("来自 TYPESAFE_API_KEY。")
    : configured ? p.text("已配置判断服务。") : p.text("还未选择账号连接。");
  return `<section class="settings-document functions-settings-document" data-functions-settings data-settings-panel="functions" aria-labelledby="functions-settings-title">
    <header class="${model.embedded ? "functions-settings-heading" : "settings-heading"}">
      <div class="settings-heading-title">
        <${model.embedded ? "h3" : "h1"} id="functions-settings-title">${p.text("判断服务使用的账号")}</${model.embedded ? "h3" : "h1"}>
      </div>
      <p>${p.text("试跑用 TypeSafe 的 Jev。")}</p>
    </header>
    <form class="functions-settings-form" data-functions-settings-form>
      <label class="settings-field">${p.text("TypeSafe 账号连接")}
        <select class="mw-select" data-functions-connection><option value="">${p.text("选择连接")}</option>
          ${(model.connections ?? []).filter((connection) => connection.state === "connected").map((connection) => `<option value="${p.escape(connection.connection_id)}"${connection.connection_id === model.selected_connection_id ? " selected" : ""}>${p.escape(connection.display_name)}</option>`).join("")}
        </select>
      </label>${model.embedded ? "" : `<a href="/capabilities/connections?connector=typesafe">${p.text("管理 TypeSafe 连接")}</a>`}
      <p class="functions-settings-status" data-functions-settings-status data-source="${p.escape(settings.source)}">${status}</p>
      <div class="functions-settings-actions">
        <button class="mw-btn mw-btn--primary" type="submit" data-functions-key-save>${p.text("保存选择")}</button>
        <button class="mw-btn mw-btn--ghost" type="button" data-functions-key-clear ${!model.selected_connection_id ? "hidden" : ""}>${p.text("取消选择")}</button>
      </div>
      <p class="functions-settings-hint">${p.text("选择一个已连接的账号，用于判断规则的试跑和执行。")}</p>
    </form>
  </section>`;
}
