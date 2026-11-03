import { LINGGUANG_MESSAGES } from "@molis-ai/molis-work-plugin-lingguang";
import { fillMessage } from "@molis-ai/molis-work-plugin-sdk";
import { createUiRequest } from "@molis-ai/molis-work-ui-host";
import type { fakeLifetime } from "./fake-client-lifetime.js";

export const LINGGUANG_PLUGIN_ID = "io.molis.work.lingguang";

/** The translator the workbench gives the page, in Chinese: a stable key's `zh`, its values filled in. */
export const zh = (key: string, values?: Record<string, string | number>): string => fillMessage(LINGGUANG_MESSAGES[key as keyof typeof LINGGUANG_MESSAGES]?.zh ?? key, values);

/**
 * The host a 灵光 client is given, over a fake mount scope: the page's real request helper (`molisWorkRequest`) sends through the
 * `fetch` the test installs on `globalThis` (looked up when a request is made), and `pluginRoute` is the Manifest identity's path.
 */
export function lingguangHost(lifetime: ReturnType<typeof fakeLifetime>, overrides: Record<string, unknown> = {}) {
  const request = createUiRequest({ fetch: (input, init) => globalThis.fetch(input, init as RequestInit), origin: "http://lingguang.test", token: () => "t", newKey: () => "k-0000001", translate: zh });
  Object.assign(globalThis, { molisWorkRequest: request });
  return {
    translate: zh, route: (path: string) => path, pluginRoute: (path: string) => `/api/plugins/${LINGGUANG_PLUGIN_ID}${path}`, pluginId: LINGGUANG_PLUGIN_ID,
    readRefusal: () => "", mountPluginClient: lifetime.mount, view: lifetime.view, ...overrides,
  };
}
