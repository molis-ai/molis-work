import { PANEL_DEFAULTS } from "./keys.js";
import { messageOf, paintPanelKeys, paintPanes, refreshSettings, save, savePatch, say, stopRecording } from "./save.js";
import type { SettingsPage } from "./types.js";
import type { ShelfCustomRuntime, ShelfPanelKeySlot } from "@molis-ai/molis-work-module-shelf/contract";

/** A control is bound once, however often the block is redrawn. */
export const fresh = (node: HTMLElement): boolean => {
  if (node.dataset.shelfSettingsBound === "1") return false;
  node.dataset.shelfSettingsBound = "1";
  return true;
};

/** The row's button waits for the next chord, which `recorder.ts` takes. */
export function startRecording(page: SettingsPage, row: HTMLElement, scope: ParentNode, record: HTMLElement, panel: boolean): void {
  if (page.recording?.row === row) { stopRecording(page); return; }
  stopRecording(page);
  page.recording = panel ? { row, root: scope, panel: true } : { row, root: scope };
  row.classList.add("is-recording");
  record.setAttribute("aria-pressed", "true");
  record.textContent = page.L("shelf.settings.hotkey-recording");
  record.focus();
}

export function bindPanelKeys(page: SettingsPage, scope: ParentNode): void {
  scope.querySelectorAll<HTMLElement>("[data-shelf-panel-slot]").forEach((row) => {
    if (!fresh(row)) return;
    const record = row.querySelector<HTMLElement>("[data-shelf-panel-record]");
    const reset = row.querySelector<HTMLElement>("[data-shelf-panel-reset]");
    record?.addEventListener("click", () => startRecording(page, row, scope, record, true));
    reset?.addEventListener("click", async () => {
      const slot = row.dataset.shelfPanelSlot as ShelfPanelKeySlot | undefined;
      if (!slot) return;
      stopRecording(page);
      try {
        page.settings = await save(page, scope, { panel_keys: { [slot]: PANEL_DEFAULTS[slot] } }, reset);
        paintPanelKeys(page, scope);
      } catch {
        // Reported in its block.
      }
    });
  });
}

export function bindEngine(page: SettingsPage, scope: ParentNode): void {
  scope.querySelectorAll<HTMLInputElement>("[data-shelf-engine]").forEach((input) => {
    if (!fresh(input)) return;
    input.addEventListener("change", async () => {
      if (!input.checked) return;
      try { page.settings = await save(page, scope, { engine: input.value }, input); } catch { paintPanes(page, scope); }
    });
  });
}

export function bindModel(page: SettingsPage, scope: ParentNode, reload: () => Promise<void>): void {
  scope.querySelectorAll<HTMLInputElement>("[data-shelf-model]").forEach((input) => {
    if (!fresh(input)) return;
    let saved = input.value;
    input.addEventListener("change", async () => {
      try {
        const value = input.value ? JSON.parse(input.value) as [string, string] : null;
        page.settings = await save(page, scope, { model_selection: value ? { provider_id: value[0], model_id: value[1] } : null }, input);
        saved = input.value;
        await reload().catch((error) => say(scope, "[data-shelf-save-error]", messageOf(error)));
      } catch {
        if (saved !== input.value) input.value = saved;
      }
    });
  });
}

const valueOf = (form: ParentNode, selector: string): string => form.querySelector<HTMLInputElement>(selector)?.value?.trim() || "";

/** Adding a terminal program, and taking one away. */
export function bindRuntimes(page: SettingsPage, scope: ParentNode, reload: () => Promise<void>): void {
  const form = scope.querySelector<HTMLFormElement>("[data-shelf-runtime-form]");
  if (form && fresh(form)) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const current = page.settings || await refreshSettings(page, scope);
      const kind: ShelfCustomRuntime["kind"] = form.querySelector<HTMLInputElement>("[data-shelf-runtime-kind]")?.value === "cli" ? "cli" : "tui";
      const next = [...(current?.custom_runtimes || []), { id: "", title: valueOf(form, "[data-shelf-runtime-title]"), executable: valueOf(form, "[data-shelf-runtime-path]"), kind }];
      try {
        page.settings = await savePatch(page, scope, { custom_runtimes: next });
        await reload().catch((error) => say(scope, "[data-shelf-runtime-error]", messageOf(error)));
      } catch (error) {
        say(scope, "[data-shelf-runtime-error]", messageOf(error));
      }
    });
  }
  scope.querySelectorAll<HTMLElement>("[data-shelf-runtime-delete]").forEach((button) => {
    if (!fresh(button)) return;
    button.addEventListener("click", async () => {
      const id = button.closest<HTMLElement>("[data-shelf-runtime-id]")?.dataset.shelfRuntimeId;
      const current = page.settings || await refreshSettings(page, scope);
      if (!id || !current) return;
      try {
        page.settings = await savePatch(page, scope, { custom_runtimes: current.custom_runtimes.filter((entry) => entry.id !== id) });
        await reload().catch((error) => say(scope, "[data-shelf-runtime-error]", messageOf(error)));
      } catch (error) {
        say(scope, "[data-shelf-runtime-error]", messageOf(error));
      }
    });
  });
}
