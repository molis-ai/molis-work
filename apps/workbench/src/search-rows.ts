import { pluginRecordRows, pluginSearchRows } from "./plugin-workbench.js";

/**
 * Characters is a platform module, not a plugin: it has no registration to declare a row in, and what it shows is a platform fact
 * (the platform owns it, as it owns the settings page the row sits on), so its one search row is named here.
 */
const CHARACTERS_SEARCH_ROW: [string, string, string] = ["characters", "[data-character-id]", "characterId"];

/**
 * Feed's search hit is a source (it switches the Feed to that source), not an entry, so it is not the `recordRow` its registration
 * declares and `pluginSearchRows()` cannot carry it without a record being opened by the source's id elsewhere (placement.ts).
 * It leaves here with the Feed source directory (PG-034, PG-093), which declares it in Feed's own registration.
 */
const FEED_SOURCE_SEARCH_ROW: [string, string, string] = ["feed", "[data-feed-task-toggle]", "feedTaskToggle"];

/** The rows a record opens from on its plugin's page, as the plugins declare them (`recordRow`). */
export function recordRows(): Array<[string, string, string]> {
  return pluginRecordRows();
}

/** Every row a search hit is opened from: the plugins' declared `searchRow`s, then the two above. */
export function searchRows(): Array<[string, string, string]> {
  return [...pluginSearchRows(), FEED_SOURCE_SEARCH_ROW, CHARACTERS_SEARCH_ROW];
}
