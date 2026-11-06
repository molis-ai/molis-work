/**
 * What a person can let one background task of another plugin read, in this plugin's own words (`read_groups` in the Manifest;
 * specs/proactive-assistant/schedule-task-reads.md §3.2, decided 2026-11-05). Each group is one switch on a task's "能读的数据":
 * turning it on grants the task the group's actions as they are at that moment, and nothing added to the group later.
 *
 * Every action listed must be one this Manifest declares, offered to agents, and read-only (a query whose effect is `read`); a
 * Manifest that lists anything else is refused when it is read. An action belongs to at most one group. A plugin that declares no
 * groups is one switch covering all of its such actions; one that declares groups gives a task none of the actions left out of them.
 */
export interface PluginReadGroupDeclaration {
  /** Stable within the plugin: lower-case letters, digits and `-`, starting with a letter. A grant keeps it. */
  readonly group_id: string;
  /** The switch's name, in Chinese; its English comes from `ui.translations` like the rest of the Manifest's words. */
  readonly title: string;
  /** One line saying what the group contains, shown under the switch so the person knows what they allow. */
  readonly description: string;
  /** The `capability_id`s of this plugin's own actions in the group; every declared version of each is in it. */
  readonly actions: readonly string[];
}
