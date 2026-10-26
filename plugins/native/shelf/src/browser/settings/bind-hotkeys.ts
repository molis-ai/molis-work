import { fresh, startRecording } from "./bind-basic.js";
import { chordFromEvent } from "./keys.js";
import { paintHotkeys, paintPanelKeys, save, stopRecording } from "./save.js";
import type { SettingsPage } from "./types.js";
import type { ShelfHotKeySlot, ShelfPanelKeySlot } from "@molis-ai/molis-work-module-shelf/contract";

export function bindDropWheel(page: SettingsPage, scope: ParentNode): void {
  scope.querySelectorAll<HTMLInputElement>("[data-shelf-drop-wheel]").forEach((input) => {
    if (!fresh(input)) return;
    input.addEventListener("change", async () => {
      const previous = !input.checked;
      input.disabled = true;
      try {
        const body = await save(page, scope, { drop_wheel_enabled: input.checked }, input);
        input.checked = body.drop_wheel_enabled === true;
      } catch {
        input.checked = previous;
      } finally {
        input.disabled = false;
      }
    });
  });
}

/** The global chords: record a new one, or go back to the default. */
export function bindHotkeys(page: SettingsPage, scope: ParentNode): void {
  scope.querySelectorAll<HTMLElement>("[data-shelf-hotkey-slot]").forEach((row) => {
    if (!fresh(row)) return;
    const record = row.querySelector<HTMLElement>("[data-shelf-hotkey-record]");
    const reset = row.querySelector<HTMLElement>("[data-shelf-hotkey-reset]");
    record?.addEventListener("click", () => startRecording(page, row, scope, record, false));
    reset?.addEventListener("click", async () => {
      const slot = row.dataset.shelfHotkeySlot as ShelfHotKeySlot | undefined;
      if (!slot || !page.tables.defaults[slot]) return;
      stopRecording(page);
      try {
        await save(page, scope, { hotkeys: { [slot]: page.tables.defaults[slot] } }, reset);
      } catch {
        // Reported in its block.
      }
    });
  });
}

/** The key that ends a recording takes the chord the person pressed. */
function takeKey(page: SettingsPage, event: KeyboardEvent): void {
  const { recording } = page;
  if (!recording || !recording.row.isConnected) { page.recording = null; return; }
  if (event.repeat) return;
  const bare = !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey;
  if (!recording.panel && event.code === "Escape" && bare) {
    event.preventDefault();
    event.stopPropagation();
    stopRecording(page);
    return;
  }
  const { row, root } = recording;
  if (recording.panel) {
    if (page.tables.modifierCodes.includes(event.code)) return;
    event.preventDefault();
    event.stopPropagation();
    const slot = row.dataset.shelfPanelSlot as ShelfPanelKeySlot;
    const chord = { code: event.code, meta: event.metaKey, ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey };
    stopRecording(page);
    save(page, root, { panel_keys: { [slot]: chord } }, row)
      .then((body) => { page.settings = body; paintPanelKeys(page, root); })
      .catch(() => paintPanelKeys(page, root));
    return;
  }
  const chord = chordFromEvent(page, event);
  if (!chord) return;
  event.preventDefault();
  event.stopPropagation();
  if (!chord.carbon_modifiers) return;
  const slot = row.dataset.shelfHotkeySlot as ShelfHotKeySlot;
  stopRecording(page);
  save(page, root, { hotkeys: { [slot]: chord } }, row).then((body) => { page.settings = body; }, () => paintHotkeys(page, root, page.settings?.hotkeys));
}

/** One recorder for the page, however often Shelf's settings are bound. */
export function installRecorder(page: SettingsPage): void {
  if (globalThis.__molisWorkShelfHotkeyRecorder) return;
  globalThis.__molisWorkShelfHotkeyRecorder = true;
  window.addEventListener("keydown", (event) => takeKey(page, event), true);
}
