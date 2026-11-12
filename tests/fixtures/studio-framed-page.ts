import type { TestContext } from "node:test";
import type { ChromeHarness, ChromePage, WaitOptions } from "@molis-ai/molis-work-test-kit/browser";
import type { WebLocale } from "@molis-ai/molis-work-app-workbench";
import { studioHarnessPage } from "../../scripts/agent-studio-harness.mjs";
import { installHostUiText } from "@molis-ai/molis-work-app-local-host";
import { pluginFrameBrowser } from "./plugin-frame-browser.js";
export { studioFrameAsset, studioHarnessRequests } from "../../scripts/agent-studio-harness.mjs";

export async function framedStudioPage(t: TestContext, browser: ChromeHarness, page: ChromePage) {
  const child = await pluginFrameBrowser(t, { command: browser.command.bind(browser), on: browser.on.bind(browser),
    evaluate: page.evaluate.bind(page), sessionId: page.sessionId });
  return { command: page.command.bind(page), viewport: page.viewport.bind(page), evaluate: child.evaluate, click: child.click,
    wait: (expression: string, options?: WaitOptions) => child.waitFor(expression, options?.timeoutMs ?? 14000),
    async fill(selector: string, value: string) {
      await child.click(selector);
      await page.command("Input.dispatchKeyEvent", { type: "keyDown", key: "a", code: "KeyA", modifiers: process.platform === "darwin" ? 4 : 2, commands: ["selectAll"] });
      await page.command("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", modifiers: 0 });
      await page.command("Input.insertText", { text: value });
    } };
}

/**
 * Production opaque frame and registered route catalog; only models and the surrounding standalone server are fixtures. The studio is
 * the plugin builder's, so in another language it gets that plugin's own English with the page's catalog, as a frame does (PG-071).
 */
export function isolatedStudioHarness(home: string, projectId: string, controlToken: string, locale: WebLocale = "zh", preview = false): string {
  installHostUiText();
  return studioHarnessPage(home, projectId, "/projects/" + projectId, controlToken, locale, preview);
}
