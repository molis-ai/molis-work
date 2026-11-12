import { UI_HOST_CLIENT_CODES } from "@molis-ai/molis-work-contracts/platform/ui";
import { chinesePagePacks, pageTextForPacks } from "./page-text-packs.js";
import { createUiRequest } from "@molis-ai/molis-work-ui-host";

export const SCHEDULE_PLUGIN_ID = "io.molis.work.schedule";

export const zh = pageTextForPacks("zh", chinesePagePacks("schedule"));

/**
 * The host a Schedule client is given: the page's real request helper (`molisWorkRequest`) sends through the `fetch` the test
 * installs on `globalThis` (looked up when a request is made), and `pluginRoute` is the Manifest identity's path.
 */
export function scheduleHost(overrides: Record<string, unknown> = {}) {
  const request = createUiRequest({ fetch: (input, init) => globalThis.fetch(input, init as RequestInit), origin: "http://schedule.test", token: () => "t", newKey: () => "k-0000001", readText: zh }, UI_HOST_CLIENT_CODES);
  Object.assign(globalThis, { molisWorkRequest: request });
  return {
    pluginRoute: (path: string) => `/api/plugins/${SCHEDULE_PLUGIN_ID}${path}`, pluginId: SCHEDULE_PLUGIN_ID,
    confirm: async () => true, showToast() {}, view: { readDocument: async () => "" }, ...overrides,
  };
}
