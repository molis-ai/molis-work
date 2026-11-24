import { messageOf } from "@molis-ai/molis-work-plugin-sdk/browser";
import type {} from "@molis-ai/molis-work-plugin-sdk";
import { labelOf, panelChordOf, panelLabel, PANEL_DEFAULTS, sameChord, samePanel } from "./keys.js";
import { applyDeviceValues, deviceChange } from "../device-change.js";
import { SHELF_PREFERENCE_FIELDS, type ShelfPreferenceKey } from "../../../contract.js";
import type { SettingsValues } from "@molis-ai/molis-work-contracts/platform/settings";
import type { Chord, Settings, SettingsPage } from "./types.js";
import type { ShelfHotKeySlot, ShelfPanelKeySlot, ShelfSettingsPatch } from "../../../contract.js";

const uiText = globalThis.t;

export const invoke = (name: string, payload?: unknown): Promise<unknown> => {
  const fn = globalThis.__TAURI__?.core?.invoke;
  return typeof fn === "function" ? fn(name, payload) : Promise.resolve(null);
};

export function say(scope: ParentNode, selector: string, message: string): void {
  const node = scope.querySelector<HTMLElement>(selector);
  if (!node) return;
  node.hidden = !message;
  node.textContent = message;
}

/** Puts a hotkey row's button and reset back as the chord says. */
export function paintChord(page: SettingsPage, row: HTMLElement, chord: Chord | undefined): void {
  const button = row.querySelector<HTMLElement>("[data-shelf-hotkey-record]");
  const reset = row.querySelector<HTMLElement>("[data-shelf-hotkey-reset]");
  if (!button || !chord) return;
  button.dataset.keyCode = String(chord.key_code);
  button.dataset.carbonModifiers = String(chord.carbon_modifiers);
  button.textContent = labelOf(page, chord);
  button.setAttribute("aria-pressed", "false");
  if (reset) reset.hidden = sameChord(chord, page.tables.defaults[row.dataset.shelfHotkeySlot as ShelfHotKeySlot]);
}

export function paintHotkeys(page: SettingsPage, root: ParentNode, hotkeys: Settings["hotkeys"] | undefined): void {
  if (!hotkeys) return;
  root.querySelectorAll<HTMLElement>("[data-shelf-hotkey-slot]").forEach((row) => paintChord(page, row, hotkeys[row.dataset.shelfHotkeySlot as ShelfHotKeySlot]));
}

function paintOccupied(_page: SettingsPage, root: ParentNode, status: Record<string, boolean> | null): void {
  root.querySelectorAll<HTMLElement>("[data-shelf-hotkey-slot]").forEach((row) => {
    const caption = row.querySelector<HTMLElement>("[data-shelf-hotkey-caption]");
    if (!caption) return;
    const taken = status?.[row.dataset.shelfHotkeySlot ?? ""] === false;
    caption.textContent = taken ? uiText.text("shelf.settings.hotkey-occupied") : (caption.dataset.caption || caption.textContent);
    caption.toggleAttribute("data-occupied", taken);
  });
}

/** Asks the desktop which of the chords another program holds, and marks them. */
export function markOccupied(page: SettingsPage, root: ParentNode): void {
  invoke("shelf_hotkey_status").then((status) => paintOccupied(page, root, status as Record<string, boolean> | null)).catch(() => undefined);
}

export function paintPanelKeys(page: SettingsPage, scope: ParentNode): void {
  const keys = page.settings?.panel_keys;
  if (!keys) return;
  scope.querySelectorAll<HTMLElement>("[data-shelf-panel-slot]").forEach((row) => {
    const slot = row.dataset.shelfPanelSlot as ShelfPanelKeySlot;
    const chord = keys[slot];
    const button = row.querySelector<HTMLElement>("[data-shelf-panel-record]");
    const reset = row.querySelector<HTMLElement>("[data-shelf-panel-reset]");
    if (!button || !chord) return;
    Object.assign(button.dataset, { code: chord.code, meta: String(Boolean(chord.meta)), ctrl: String(Boolean(chord.ctrl)), alt: String(Boolean(chord.alt)), shift: String(Boolean(chord.shift)) });
    button.textContent = panelLabel(chord);
    button.setAttribute("aria-pressed", "false");
    if (reset) reset.hidden = samePanel(chord, PANEL_DEFAULTS[slot]);
  });
}

export function paintPanes(page: SettingsPage, scope: ParentNode): void {
  paintPanelKeys(page, scope);
  const { settings } = page;
  if (!settings) return;
  scope.querySelectorAll<HTMLInputElement>("[data-shelf-engine]").forEach((input) => { input.checked = input.value === settings.engine; });
}

/** Leaves recording: the row's button shows its chord again. */
export function stopRecording(page: SettingsPage): void {
  const { recording } = page;
  if (!recording) return;
  page.recording = null;
  recording.row.classList.remove("is-recording");
  if (recording.panel) {
    const panelButton = recording.row.querySelector<HTMLElement>("[data-shelf-panel-record]");
    if (!panelButton) return;
    panelButton.setAttribute("aria-pressed", "false");
    panelButton.textContent = panelLabel(panelChordOf(panelButton));
    return;
  }
  const button = recording.row.querySelector<HTMLElement>("[data-shelf-hotkey-record]");
  if (!button) return;
  button.setAttribute("aria-pressed", "false");
  button.textContent = labelOf(page, { key_code: Number(button.dataset.keyCode), carbon_modifiers: Number(button.dataset.carbonModifiers) });
}

/** One save of a patch: paints what came back and hands the new hotkeys to the desktop. */
export async function savePatch(page: SettingsPage, root: ParentNode, patch: ShelfSettingsPatch): Promise<Settings> {
  if (!page.settings && !await refreshSettings(page, root)) throw new Error(uiText.text("shelf.settings.save-failed"));
  if (patch.custom_runtimes) {
    page.settings = await molisWorkRequest<Settings>(page.api + "/settings", { method: "POST", body: patch, fallback: uiText.text("shelf.settings.save-failed") });
    return page.settings;
  }
  const [key] = (Object.keys(SHELF_PREFERENCE_FIELDS) as ShelfPreferenceKey[]).filter(key =>
    SHELF_PREFERENCE_FIELDS[key].some(field => Object.hasOwn(patch, field)));
  const before = key && page.preferences.get(key);
  if (!key || before?.state !== "ok") throw new Error(uiText.text("shelf.settings.save-failed"));
  const change = deviceChange(page.settings!, key, patch);
  const response = await molisWorkRequest<SettingsValues>(page.api + "/preferences/write", { method: "POST",
    body: { key, layer: "personal", expected_revision: before.revision, request_id: crypto.randomUUID(), change }, fallback: uiText.text("shelf.settings.save-failed") });
  const saved = response.values[0];
  if (saved?.state !== "ok" || saved.key !== key) throw new Error(uiText.text("shelf.settings.save-failed"));
  page.preferences.set(key, saved);
  const body = applyDeviceValues(page.settings!, { values: [saved] });
  page.settings = body;
  paintHotkeys(page, root, body.hotkeys);
  if (patch.hotkeys || patch.drop_wheel_enabled !== undefined) await globalThis.molisWorkRefreshShelfPreferences?.();
  markOccupied(page, root);
  return body;
}

export async function refreshSettings(page: SettingsPage, scope: ParentNode): Promise<Settings | null> {
  const read = await Promise.all([molisWorkRequest<Settings>(page.api + "/settings"),
    molisWorkRequest<SettingsValues>(page.api + "/preferences/read", { method: "POST", body: { keys: Object.keys(SHELF_PREFERENCE_FIELDS) } })]).catch(() => null);
  if (read) {
    for (const item of read[1].values) page.preferences.set(item.key, item);
    page.settings = applyDeviceValues(read[0], read[1]);
  }
  paintPanes(page, scope);
  return page.settings;
}

/** A failed save is reported in the control's own block; the caller puts the control back. */
export async function save(page: SettingsPage, scope: ParentNode, patch: ShelfSettingsPatch, control: Element): Promise<Settings> {
  // A control that is not in a block of its own sits straight in its section's card.
  const block = control.closest(".shelf-settings-block, .mw-settings-section__rows");
  let line = block?.querySelector<HTMLElement>(":scope > [data-shelf-save-error]") ?? null;
  try {
    const body = await savePatch(page, scope, patch);
    if (line) line.hidden = true;
    return body;
  } catch (error) {
    if (block && !line) {
      line = document.createElement("p");
      line.className = "shelf-settings-line";
      line.dataset.shelfSaveError = "";
      line.setAttribute("role", "alert");
      block.append(line);
    }
    if (line) { line.textContent = messageOf(error) || uiText.text("shelf.settings.save-failed"); line.hidden = false; }
    throw error;
  }
}
