import type { PersonSettingRecord } from "../services/person-settings.js";

/**
 * Work a per-partition instance has to do at some time (specs/unified-partition-plugins §4.1 到期的工作, batch 108): kept in the Home's due
 * registry, so the instance need not run until then; at the time the platform wakes only this plugin in this partition
 * (S-partition-wake-scope) and hands it the entry (`onDue`). Two kinds of entries reach a plugin: the ones it registers itself
 * (`services.due`), and the reminder times the platform read from its overview table (`source: "overview"`, keyed `<kind>:<row_id>`), which
 * it never registers itself. An entry seven days past its time is not handed over (batch 95-3's rule for missed runs).
 */
export interface PluginDueEntry {
  readonly entry_key: string;
  readonly due_at: string;
}

/** `services.due`: a per-partition instance's own entries. The owner (installation, plugin, partition) is the platform's stamp, never the plugin's word. */
export interface PluginDueClient {
  /** Registers or moves one entry; the same key again moves it. At most `DUE_ENTRY_LIMIT` per installation and partition. */
  register(entry: PluginDueEntry): PluginDueEntry;
  cancel(entryKey: string): boolean;
  list(): PluginDueEntry[];
}

/** One entry handed to the plugin when it falls due. `late`: it was reached well after its time (the Host was off or asleep). */
export interface PluginDueDelivery extends PluginDueEntry {
  readonly source: "plugin" | "overview";
  readonly late: boolean;
}

/** What `onDue` is given: the partition it runs in and the delivery's own authority, as an event handler is. */
export interface PluginDueContext {
  readonly project_id: string;
  readonly plugin_id: string;
  readonly install_id: string;
  readonly signal: AbortSignal;
  /** Throws once this instance stopped or was disabled here: check it right before writing. */
  readonly beforeEffect: () => void;
}

/**
 * What a reminder tells the person: the platform shows it under their notice rules, once per entry and time. A plugin that answers `null`
 * for an overview entry says the reminder no longer stands (done, acknowledged, moved): nothing is shown.
 */
export interface PluginDueReminder {
  readonly title: string;
  /** The object to open, in this plugin's page in this partition. */
  readonly open?: { readonly surface: string; readonly id: string };
}

/**
 * `onDue`'s answer. For an overview entry: the reminder to show, or `null` for none. Leaving `reminder` out of an overview entry's answer, or
 * giving no `onDue` at all, shows the overview row's own title. For an entry the plugin registered itself, `reminder` is shown when given.
 */
export interface PluginDueOutcome {
  readonly reminder?: PluginDueReminder | null;
}

/**
 * `services.personSettings` (§4.2 第 4 条): the keys the Manifest declares in `person_settings`, kept in the Home per (installation, key) and
 * following the person, not the partition. The caller is the platform's: the person's own call (a page or a command of theirs), or this
 * plugin's own background work; an Agent, an MCP client, a workflow or another plugin is refused (S-person-settings-private).
 */
export interface PluginPersonSettingsClient {
  get(key: string): PersonSettingRecord | null;
  list(): PersonSettingRecord[];
  /** With `expected_revision`, refused (`actions.conflict`) when the stored one differs; `null` expects none. */
  set(key: string, value: unknown, options?: { readonly expected_revision?: number | null }): PersonSettingRecord;
  remove(key: string): boolean;
}
