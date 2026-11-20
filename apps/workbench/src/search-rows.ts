import { pluginRecordRows, pluginSearchRows } from "./plugin-workbench.js";

/**
 * Characters is a platform module, not a plugin: it has no registration to declare a row in, and what it shows is a platform fact
 * (the platform owns it, as it owns the settings page the row sits on), so its one search row is named here.
 */
const CHARACTERS_SEARCH_ROW: [string, string, string] = ["characters", "[data-character-id]", "characterId"];
const SESSIONS_SEARCH_ROW: [string, string, string] = ["sessions", "[data-session-key]", "sessionKey"];

/** The rows a record opens from on its plugin's page, as the plugins declare them (`recordRow`). */
export function recordRows(): Array<[string, string, string]> {
  return pluginRecordRows();
}

/** Every row a search hit is opened from: the plugins' declared `searchRow`s, then the platform's own two. */
export function searchRows(): Array<[string, string, string]> {
  return [...pluginSearchRows(), CHARACTERS_SEARCH_ROW, SESSIONS_SEARCH_ROW];
}
