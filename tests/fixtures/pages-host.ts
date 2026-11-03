import { PAGES_MESSAGES } from "@molis-ai/molis-work-plugin-pages";
import { fillMessage } from "@molis-ai/molis-work-plugin-sdk";
import { createUiRequest } from "@molis-ai/molis-work-ui-host";
import type { fakeLifetime } from "./fake-client-lifetime.js";

export const PAGES_PLUGIN_ID = "io.molis.work.pages";

/** The translator the workbench gives the page, in Chinese: a stable key's `zh`, its values filled in. */
export const zh = (key: string, values?: Record<string, string | number>): string => fillMessage(PAGES_MESSAGES[key as keyof typeof PAGES_MESSAGES]?.zh ?? key, values);

/**
 * The host a Pages client is given, over a fake mount scope: the page's real request helper (`molisWorkRequest`) sends through the
 * `fetch` the test installs on `globalThis` (looked up when a request is made), `pluginRoute` is the Manifest identity's path,
 * and `projectId` is the function the frame gives (the current project, or empty).
 */
export function pagesHost(lifetime: ReturnType<typeof fakeLifetime>, overrides: Record<string, unknown> = {}) {
  const request = createUiRequest({ fetch: (input, init) => globalThis.fetch(input, init as RequestInit), origin: "http://pages.test", token: () => "t", newKey: () => "k-0000001", translate: zh });
  Object.assign(globalThis, { molisWorkRequest: request });
  return {
    translate: zh, route: (path: string) => path, pluginRoute: (path: string) => `/api/plugins/${PAGES_PLUGIN_ID}${path}`, pluginId: PAGES_PLUGIN_ID,
    projectId: () => "project-pages", readRefusal: () => "", messages: { send() {}, listen: () => () => {} },
    mountPluginClient: lifetime.mount, view: lifetime.view, ...overrides,
  };
}
