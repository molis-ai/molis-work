import type {} from "@molis-ai/molis-work-plugin-sdk";
import { labelOf, panelChordOf, panelLabel, PANEL_DEFAULTS, sameChord, samePanel } from "./keys.js";
import type { Chord, Settings, SettingsPage } from "./types.js";
import type { ShelfHotKeySlot, ShelfPanelKeySlot, ShelfSettingsPatch } from "@molis-ai/molis-work-contracts/modules/shelf";

export const invoke = (name: string, payload?: unknown): Promise<unknown> => {
  const fn = globalThis.__TAURI__?.core?.invoke;
  return typeof fn === "function" ? fn(name, payload) : Promise.resolve(null);
};

export const messageOf = (error: unknown): string => error instanceof Error ? error.message : String(error);

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

function paintOccupied(page: SettingsPage, root: ParentNode, status: Record<string, boolean> | null): void {
  root.querySelectorAll<HTMLElement>("[data-shelf-hotkey-slot]").forEach((row) => {
    const caption = row.querySelector<HTMLElement>("[data-shelf-hotkey-caption]");
    if (!caption) return;
    const taken = status?.[row.dataset.shelfHotkeySlot ?? ""] === false;
    caption.textContent = taken ? page.L("shelf.settings.hotkey-occupied") : (caption.dataset.idleCaption || caption.textContent);
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
  const body = await molisWorkRequest<Settings>(page.api + "/settings", { method: "POST", body: patch, fallback: page.L("shelf.settings.save-failed") });
  paintHotkeys(page, root, body.hotkeys);
  if (patch.hotkeys) {
    const status = await invoke("shelf_apply_hotkeys", { toggle: body.hotkeys.toggle, capture: body.hotkeys.capture, files: body.hotkeys.files }).catch(() => null);
    if (status) paintOccupied(page, root, status as Record<string, boolean>);
  } else markOccupied(page, root);
  return body;
}

export async function refreshSettings(page: SettingsPage, scope: ParentNode): Promise<Settings | null> {
  const read = await molisWorkRequest<Settings>(page.api + "/settings").catch(() => null);
  if (read) page.settings = read;
  paintPanes(page, scope);
  return page.settings;
}

/** A failed save is reported in the control's own block; the caller puts the control back. */
export async function save(page: SettingsPage, scope: ParentNode, patch: ShelfSettingsPatch, control: Element): Promise<Settings> {
  const block = control.closest(".shelf-settings-block, .settings-section");
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
    if (line) { line.textContent = messageOf(error) || page.L("shelf.settings.save-failed"); line.hidden = false; }
    throw error;
  }
}

