import type { Chord, SettingsPage } from "./types.js";
import type { ShelfPanelKeyChord, ShelfPanelKeySlot } from "@molis-ai/molis-work-module-shelf/contract";

export const chordFromEvent = (page: SettingsPage, event: KeyboardEvent): Chord | null => {
  const { tables } = page;
  if (tables.modifierCodes.includes(event.code)) return null;
  const keyCode = tables.codes[event.code];
  if (keyCode == null) return null;
  let mods = 0;
  if (event.ctrlKey) mods |= tables.control;
  if (event.altKey) mods |= tables.option;
  if (event.shiftKey) mods |= tables.shift;
  if (event.metaKey) mods |= tables.cmd;
  return { key_code: keyCode, carbon_modifiers: mods };
};

export const labelOf = (page: SettingsPage, chord: Chord): string => {
  const { tables } = page;
  const mods = chord.carbon_modifiers;
  return (mods & tables.control ? "⌃" : "") + (mods & tables.option ? "⌥" : "") + (mods & tables.shift ? "⇧" : "") + (mods & tables.cmd ? "⌘" : "")
    + (tables.names[chord.key_code] || "Key" + chord.key_code);
};

export const sameChord = (left: Chord | undefined, right: Chord | undefined): boolean =>
  Boolean(left && right) && left?.key_code === right?.key_code && left?.carbon_modifiers === right?.carbon_modifiers;

export function panelLabel(chord: ShelfPanelKeyChord): string {
  const label = (chord.ctrl ? "⌃" : "") + (chord.alt ? "⌥" : "") + (chord.shift ? "⇧" : "") + (chord.meta ? "⌘" : "");
  const { code } = chord;
  if (code === "Escape") return label + "Esc";
  if (code === "Backspace") return label + "⌫";
  if (code === "Delete") return label + "⌦";
  if (code === "Enter") return label + "↩";
  if (code.startsWith("Key")) return label + code.slice(3);
  if (code.startsWith("Digit")) return label + code.slice(5);
  return label + code;
}

const plain = (code: string, meta = false): ShelfPanelKeyChord => ({ code, meta, ctrl: false, alt: false, shift: false });
export const PANEL_DEFAULTS: Readonly<Record<ShelfPanelKeySlot, ShelfPanelKeyChord>> = {
  hide: plain("Escape"), paste: plain("KeyV", true), copy: plain("KeyC", true), delete: plain("Backspace"),
};

export const samePanel = (left: ShelfPanelKeyChord | undefined, right: ShelfPanelKeyChord | undefined): boolean =>
  Boolean(left && right) && left?.code === right?.code && !!left?.meta === !!right?.meta && !!left?.ctrl === !!right?.ctrl
  && !!left?.alt === !!right?.alt && !!left?.shift === !!right?.shift;

/** The row's panel-key button as it was drawn, read back from its data attributes. */
export const panelChordOf = (button: HTMLElement): ShelfPanelKeyChord => ({
  code: button.dataset.code ?? "", meta: button.dataset.meta === "true", ctrl: button.dataset.ctrl === "true", alt: button.dataset.alt === "true", shift: button.dataset.shift === "true",
});
