import { renderButton, renderSettingRow, renderSettingsSection, renderSwitch, t } from "@molis-ai/molis-work-plugin-sdk/ui";

function savePreference(kind: "lookback" | "report"): string {
  const reset = renderButton({ label: t.text("workbench.settings-assistant.use-default"), variant: "ghost", size: "sm", attrs: { "data-inherit": true, hidden: true } });
  const save = renderButton({ label: t.text("common.control.save"), variant: "secondary", size: "sm", type: "submit", disabled: true });
  return `${renderSettingRow({ name: "", nameAttrs: { [`data-${kind}-source`]: true }, control: `${reset}${save}` })}
    <p class="settings-form-error" data-${kind}-error role="alert" hidden></p>`;
}

export function renderAssistantPreferenceForms(): string {
  const text = t.text;
  const lookback = renderSettingsSection({
    title: text("workbench.settings-assistant.lookback"), id: "assistant-lookback-title",
    body: `<form data-assistant-lookback>
      ${renderSettingRow({ name: text("workbench.settings-assistant.lookback-window"), label: true, control: '<input class="mw-input" type="number" min="1" step="1" required data-lookback-count>' })}
      ${renderSettingRow({ name: text("workbench.settings-assistant.lookback-unit"), label: true,
        control: `<select class="mw-select" data-lookback-unit>
          <option value="hours">${t("workbench.settings-assistant.hours")}</option><option value="days">${t("workbench.settings-assistant.days")}</option><option value="weeks">${t("workbench.settings-assistant.weeks")}</option></select>` })}
      ${savePreference("lookback")}</form>`,
  });
  const report = renderSettingsSection({
    title: text("workbench.settings-assistant.report-schedule"), id: "assistant-report-title",
    body: `<form data-assistant-report>
      ${renderSettingRow({ name: text("workbench.settings-assistant.report-enabled"), hint: text("workbench.settings-assistant.report-effect"), label: true, control: renderSwitch({ name: "enabled" }) })}
      ${renderSettingRow({ name: text("workbench.settings-assistant.report-frequency"), label: true, control: `<select class="mw-select" name="frequency">
        <option value="daily">${t("workbench.settings-assistant.report-daily")}</option><option value="weekly">${t("workbench.settings-assistant.report-weekly")}</option><option value="monthly">${t("workbench.settings-assistant.report-monthly")}</option></select>` })}
      ${renderSettingRow({ name: text("workbench.settings-assistant.report-weekday"), label: true, attrs: { "data-report-week": true, hidden: true }, control: '<select class="mw-select" name="weekday"></select>' })}
      ${renderSettingRow({ name: text("workbench.settings-assistant.report-month-day"), label: true, attrs: { "data-report-month": true, hidden: true }, control: '<input class="mw-input" type="number" name="month_day" min="1" max="31" step="1" value="1">' })}
      ${renderSettingRow({ name: text("workbench.settings-assistant.report-time"), label: true, control: '<input class="mw-input" type="time" name="time" required>' })}
      ${renderSettingRow({ name: text("workbench.settings-assistant.report-timezone"), label: true, control: '<input class="mw-input" name="time_zone" list="assistant-report-zones" required><datalist id="assistant-report-zones"></datalist>' })}
      ${savePreference("report")}</form>`,
  });
  return lookback + report;
}
