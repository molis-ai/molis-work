import type { SandboxJson } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";

/** Only the scene document needs these presentations. */
export function sceneSettingValues(words: (key: string) => string) {
  const locale = document.documentElement.lang;
  const calendarDay = (day: SandboxJson | undefined, maximum: number): day is number =>
    typeof day === "number" && Number.isInteger(day) && day >= 1 && day <= maximum;
  function describe(key: string, value: SandboxJson) {
    if (typeof value === "boolean") return words(value ? "workbench.scene.on" : "workbench.scene.off");
    if (typeof value === "string") return value;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      if (key === "assistant.lookback" && typeof value.count === "number") {
        const unit = value.unit === "hours" ? "hour" : value.unit === "days" ? "day" : value.unit === "weeks" ? "week" : undefined;
        if (unit) return new Intl.NumberFormat(locale, { style: "unit", unit, unitDisplay: "long" }).format(value.count);
      }
      if (key === "assistant.report_schedule" && typeof value.enabled === "boolean" && typeof value.time === "string" && typeof value.time_zone === "string") {
        const { frequency, weekday, month_day } = value;
        // Skipped proposals have not necessarily passed their owner's schema.
        const parts: string[] = [];
        if (frequency === "weekly" && calendarDay(weekday, 7)) {
          const dayName = new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" });
          parts.push(words("workbench.settings-assistant.report-weekly"), dayName.format(Date.UTC(2024, 0, weekday)));
        } else if (frequency === "monthly" && calendarDay(month_day, 31)) {
          parts.push(words("workbench.settings-assistant.report-monthly"),
            words("workbench.settings-assistant.report-month-day") + " " + new Intl.NumberFormat(locale).format(month_day));
        } else if (frequency === "daily") {
          parts.push(words("workbench.settings-assistant.report-daily"));
        } else return JSON.stringify(value, null, 2);
        parts.push(value.time, value.time_zone);
        if (!value.enabled) parts.unshift(words("workbench.scene.off"));
        return parts.join(" · ");
      }
    }
    return JSON.stringify(value, null, 2);
  }

  // Clone the component-board radio group so scope and boolean choices use the same keyboard-accessible control.
  function options(legend: string, name: string, items: readonly { value: string; label: string }[], initial: string) {
    const template = document.querySelector<HTMLTemplateElement>("[data-scene-options]")!;
    const field = template.content.firstElementChild!.cloneNode(true) as HTMLFieldSetElement;
    const row = field.querySelector("label")!;
    row.remove();
    field.querySelector("legend")!.textContent = legend;
    for (const item of items) {
      const label = row.cloneNode(true) as HTMLLabelElement;
      const input = label.querySelector("input")!;
      input.name = name; input.value = item.value; input.checked = item.value === initial;
      label.querySelector("span")!.textContent = item.label;
      field.append(label);
    }
    return { field, value: () => field.querySelector<HTMLInputElement>("input:checked")?.value ?? "" };
  }
  return { describe, options };
}
