import { UI_HOST_CLIENT_CODES } from "@molis-ai/molis-work-contracts/platform/ui";
import { chinesePagePacks, pageTextForPacks } from "./page-text-packs.js";
import { createUiRequest } from "@molis-ai/molis-work-ui-host";
import type { fakeLifetime } from "./fake-client-lifetime.js";

export const LINGGUANG_PLUGIN_ID = "io.molis.work.lingguang";

const zh = pageTextForPacks("zh", chinesePagePacks("lingguang"));

/**
 * The host a 灵光 client is given, over a fake mount scope: the page's real request helper (`molisWorkRequest`) sends through the
 * `fetch` the test installs on `globalThis` (looked up when a request is made), and `pluginRoute` is the Manifest identity's path.
 */
export function lingguangHost(lifetime: ReturnType<typeof fakeLifetime>, overrides: Record<string, unknown> = {}) {
  const request = createUiRequest({ fetch: (input, init) => globalThis.fetch(input, init as RequestInit), origin: "http://lingguang.test", token: () => "t", newKey: () => "k-0000001", readText: zh }, UI_HOST_CLIENT_CODES);
  Object.assign(globalThis, { molisWorkRequest: request });
  return {
    route: (path: string) => path, pluginRoute: (path: string) => `/api/plugins/${LINGGUANG_PLUGIN_ID}${path}`, pluginId: LINGGUANG_PLUGIN_ID,
    readRefusal: () => "", mountPluginClient: lifetime.mount, view: lifetime.view, ...overrides,
  };
}
