import type { ShelfDeviceSettings, ShelfHotKeyChord, ShelfHotKeys } from "@molis-ai/molis-work-contracts/modules/shelf";
import type { UiClientTranslate } from "@molis-ai/molis-work-contracts/platform/ui";

/** What the server-side wrapper (src/settings-client.ts) puts in front of the bundle: the chord tables and the plugin's route. */
export interface HotkeyTables {
  readonly codes: Readonly<Record<string, number>>;
  readonly names: Readonly<Record<number, string>>;
  readonly modifierCodes: readonly string[];
  readonly defaults: ShelfHotKeys;
  readonly control: number;
  readonly option: number;
  readonly shift: number;
  readonly cmd: number;
}
declare global {
  var __TAURI__: { core?: { invoke?: (name: string, payload?: unknown) => Promise<unknown> } } | undefined;
  var __molisWorkShelfHotkeyRecorder: boolean | undefined;
  var molisWorkBindShelfSettings: ((root?: ParentNode) => void) | undefined;
}

export type Translate = UiClientTranslate;
export type Settings = ShelfDeviceSettings;
export type Chord = ShelfHotKeyChord;

/** The row being recorded: a global chord's, or (with `panel`) an in-panel key's. */
export interface Recording { readonly row: HTMLElement; readonly root: ParentNode; readonly panel?: boolean }

/** The settings page's state: the settings last read, and the key being recorded. */
export interface SettingsPage {
  readonly api: string;
  readonly tables: HotkeyTables;
  readonly L: Translate;
  settings: Settings | null;
  recording: Recording | null;
}
