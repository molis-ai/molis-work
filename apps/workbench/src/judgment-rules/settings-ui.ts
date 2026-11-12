import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { JudgmentRuleSettingsStatus } from "@molis-ai/molis-work-contracts/modules/functions";
import type { FunctionsUiPrimitives } from "./ui.js";

export interface FunctionsSettingsUiModel {
  readonly settings: JudgmentRuleSettingsStatus;
  readonly primitives: FunctionsUiPrimitives;
  readonly connections?: readonly { connection_id: string; display_name: string; state: string }[];
  readonly selected_connection_id?: string;
  readonly embedded?: boolean;
}

export function renderFunctionsSettings(model: FunctionsSettingsUiModel): string {
  const { primitives: p, settings } = model;
  const configured = settings.has_credential;
  const status = settings.source === "env" ? uiText.text("workbench.settings-ui.typesafe-api-key")
    : configured ? uiText.text("workbench.settings-ui.judgment-service-configured") : uiText.text("workbench.settings-ui.no-account-connection-selected-yet");
  return `<section class="settings-document functions-settings-document" data-functions-settings data-settings-panel="functions" aria-labelledby="functions-settings-title">
    <header class="${model.embedded ? "functions-settings-heading" : "settings-heading"}">
      <div class="settings-heading-title">
        <${model.embedded ? "h3" : "h1"} id="functions-settings-title">${uiText("workbench.settings-ui.account-judgment-rules")}</${model.embedded ? "h3" : "h1"}>
      </div>
      <p>${uiText("workbench.settings-ui.preview-runs-type-safe-s-jev")}</p>
    </header>
    <form class="functions-settings-form" data-functions-settings-form>
      <label class="settings-field">${uiText("workbench.settings-ui.type-safe-account-connection")}
        <select class="mw-select" data-functions-connection><option value="">${uiText("workbench.settings-ui.choose-connection")}</option>
          ${(model.connections ?? []).filter((connection) => connection.state === "connected").map((connection) => `<option value="${p.escape(connection.connection_id)}"${connection.connection_id === model.selected_connection_id ? " selected" : ""}>${p.escape(connection.display_name)}</option>`).join("")}
        </select>
      </label>${model.embedded ? "" : `<a href="/capabilities/connections?connector=typesafe">${uiText("workbench.settings-ui.manage-type-safe-connections")}</a>`}
      <p class="functions-settings-status" data-functions-settings-status data-source="${p.escape(settings.source)}">${status}</p>
      <div class="functions-settings-actions">
        <button class="mw-btn mw-btn--primary" type="submit" data-functions-key-save>${uiText("workbench.settings-ui.save-selection")}</button>
        <button class="mw-btn mw-btn--ghost" type="button" data-functions-key-clear ${!model.selected_connection_id ? "hidden" : ""}>${uiText("workbench.settings-ui.clear-selection")}</button>
      </div>
      <p class="functions-settings-hint">${uiText("workbench.settings-ui.choose-connected-account-test-run-judgment-rules")}</p>
    </form>
  </section>`;
}
