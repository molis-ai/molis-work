import { SCHEDULE_MESSAGES } from "@molis-ai/molis-work-plugin-schedule";
import { fillMessage } from "@molis-ai/molis-work-plugin-sdk";
import { createUiRequest } from "@molis-ai/molis-work-ui-host";

export const SCHEDULE_PLUGIN_ID = "io.molis.work.schedule";

/** The translator the workbench gives the page, in Chinese: a stable key's `zh`, its values filled in. */
export const zh = (key: string, values?: Record<string, string | number>): string => fillMessage(SCHEDULE_MESSAGES[key as keyof typeof SCHEDULE_MESSAGES]?.zh ?? key, values);

/**
 * The host a Schedule client is given: the page's real request helper (`molisWorkRequest`) sends through the `fetch` the test
 * installs on `globalThis` (looked up when a request is made), and `pluginRoute` is the Manifest identity's path.
 */
export function scheduleHost(overrides: Record<string, unknown> = {}) {
  const request = createUiRequest({ fetch: (input, init) => globalThis.fetch(input, init as RequestInit), origin: "http://schedule.test", token: () => "t", newKey: () => "k-0000001", translate: zh });
  Object.assign(globalThis, { molisWorkRequest: request });
  return {
    translate: zh, pluginRoute: (path: string) => `/api/plugins/${SCHEDULE_PLUGIN_ID}${path}`, pluginId: SCHEDULE_PLUGIN_ID,
    confirm: async () => true, showToast() {}, view: { readDocument: async () => "" }, ...overrides,
  };
}
