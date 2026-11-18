import type { PluginModelChoice } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SandboxJson } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import type { UiRequest } from "@molis-ai/molis-work-contracts/platform/ui";

/** Only the scene document needs these presentations. Choices are fetched when the person opens the editor. */
export function sceneSettingValues(words: (key: string) => string, request: UiRequest) {
  const locale = document.documentElement.lang;
  const calendarDay = (day: SandboxJson | undefined, maximum: number): day is number =>
    typeof day === "number" && Number.isInteger(day) && day >= 1 && day <= maximum;
  function describe(key: string, value: SandboxJson, modelSelection?: true) {
    if (typeof value === "boolean") return words(value ? "workbench.scene.on" : "workbench.scene.off");
    if (typeof value === "string") return value;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      if (modelSelection && typeof value.model_id === "string" && typeof value.provider_id === "string")
        return value.model_id + " · " + value.provider_id;
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

  // Clone the component-board radio group so scope, boolean and model choices use the same keyboard-accessible control.
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

  function modelEditor(details: HTMLDetailsElement, initial: SandboxJson, save: HTMLButtonElement) {
    const holder = document.createElement("div"), status = document.createElement("p");
    status.setAttribute("role", "status");
    let selected: PluginModelChoice | undefined, loading = false;
    save.disabled = true;
    details.append(holder, status, save);
    details.addEventListener("toggle", async () => {
      if (!details.open || loading) return;
      loading = true; save.disabled = true; holder.replaceChildren();
      status.textContent = words("workbench.home-model-settings.loading");
      try {
        const available = await request<readonly PluginModelChoice[]>("/api/settings/models?choices=1");
        if (!details.isConnected) return;
        const current = selected ?? (initial && typeof initial === "object" && !Array.isArray(initial) ? initial : undefined);
        const index = available.findIndex(choice => choice.provider_id === current?.provider_id && choice.model_id === current?.model_id);
        const group = options(words("workbench.scene.proposed"), "scene-model",
          available.map((choice, i) => ({ value: String(i), label: choice.label })), String(index));
        const changed = () => {
          const picked = group.value();
          selected = picked ? available[Number(picked)] : undefined;
          save.disabled = !selected;
        };
        changed();
        group.field.addEventListener("change", changed);
        if (available.length) holder.append(group.field);
        status.textContent = available.length ? "" : words("workbench.settings-models.no-model-turned");
      } catch (error) {
        status.textContent = request.text(error, words("workbench.settings-models.cannot-load-model-settings"));
      } finally { loading = false; }
    });
    return () => ({ provider_id: selected!.provider_id, model_id: selected!.model_id });
  }
  return { describe, options, modelEditor };
}
