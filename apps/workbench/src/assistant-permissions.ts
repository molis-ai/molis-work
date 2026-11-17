import { renderDialog } from "@molis-ai/molis-work-design-system";
import { renderButton, renderRadioGroup, t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";

export function renderAssistantPermissions() {
  const text = (key: string) => uiText.text("workbench.authorization." + key);
  return renderDialog({
    labelledBy: "assistant-permission-title", title: text("choose"), closeLabel: uiText.text("common.control.close"),
    className: "assistant-permission-dialog", attrs: { "data-assistant-permission-dialog": true },
    body: `<p class="settings-muted" data-permission-work></p><div class="authorization-layout"><div>`
      + renderRadioGroup({ legend: text("mode"), name: "mode", items: ["read-only", "confirm", "automatic"].map(value =>
        ({ value, label: text(value), checked: value === "confirm" })) })
      + `<p data-permission-mode-note></p></div><div class="authorization-detail"><h3>${text("allowed")}</h3><div data-permission-scope></div>`
      + renderRadioGroup({ legend: text("lifetime"), name: "lifetime", items: [
        { value: "work", label: text("work"), checked: true }, { value: "ongoing", label: text("ongoing") },
      ] })
      + `<p data-permission-lifetime-note></p></div></div><p role="status" data-permission-status></p><p class="settings-form-error" role="alert" data-permission-error hidden></p>`,
    footer: renderButton({ variant: "ghost", label: uiText.text("common.control.cancel"), attrs: { "data-dialog-close": true } })
      + renderButton({ variant: "primary", label: text("save"), type: "submit", attrs: { "data-permission-save": true, disabled: true } }),
  });
}

export const AUTHORIZATION_LAYOUT_STYLES = [
  ".assistant-permission-dialog{width:min(690px,calc(100% - 24px))}",
  ".assistant-permission-dialog .mw-form__body{overflow:auto}",
  ".authorization-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr);gap:var(--space-4,16px);align-items:start}",
  ".authorization-detail{border:1px solid var(--line);border-radius:var(--radius-control);padding:var(--space-4,16px);min-width:0;overflow-wrap:anywhere}",
  ".authorization-detail :is(h3,h4){margin:0 0 8px}",
  ".authorization-detail pre{max-height:12em;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere}",
  ".authorization-detail fieldset{margin-top:12px}",
  ".authorization-detail p,.assistant-permission-dialog [data-permission-mode-note]{color:var(--muted)}",
  ".authorization-detail label:has(input[type=checkbox]){display:flex;align-items:center;min-height:44px;gap:8px}",
  "@media(max-width:600px){.authorization-layout{grid-template-columns:1fr}}",
].join("");

/** Uses the same permission layout for an exact command or tool proposal in the Host's review surface. */
export function renderReviewPermission() {
  const text = (key: string) => uiText.text("workbench.authorization." + key);
  return renderDialog({
    labelledBy: "review-permission-title", title: text("choose"), closeLabel: uiText.text("common.control.close"),
    className: "assistant-permission-dialog", attrs: { "data-review-permission-dialog": true },
    body: `<p class="settings-muted" data-permission-work></p><div class="authorization-layout"><div>`
      + renderRadioGroup({ legend: text("mode"), name: "mode", items: ["read-only", "confirm", "automatic"].map(value =>
        ({ value, label: text(value), checked: value === "automatic" })) })
      + `<p data-permission-mode-note></p></div><div class="authorization-detail"><h3>${text("allowed")}</h3><pre data-permission-scope></pre>`
      + renderRadioGroup({ legend: text("lifetime"), name: "lifetime", items: [
        { value: "work", label: text("work"), checked: true }, { value: "ongoing", label: text("ongoing") },
      ] })
      + `<p data-permission-lifetime-note></p></div></div><p role="status" data-permission-status></p><p class="settings-form-error" role="alert" data-permission-error hidden></p>`,
    footer: renderButton({ variant: "ghost", label: uiText.text("common.control.cancel"), attrs: { "data-dialog-close": true } })
      + renderButton({ variant: "primary", label: text("save"), type: "submit", attrs: { "data-permission-save": true, disabled: true } }),
  });
}
