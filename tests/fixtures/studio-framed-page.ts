import type { TestContext } from "node:test";
import type { ServerResponse } from "node:http";
import type { ChromeHarness, ChromePage, WaitOptions } from "@molis-ai/molis-work-test-kit/browser";
import { renderPluginFrameClientScript, pluginWorkbenchClientAsset, renderPluginDocumentShell, withPluginWords, BUILTIN_PLUGIN_CATALOG, STYLES, MORE_STYLES, RESPONSIVE_STYLES } from "@molis-ai/molis-work-app-workbench";
import { PLUGIN_COMPONENT_STYLES } from "@molis-ai/molis-work-design-system";
import { AGENT_STUDIO_STYLES, renderAgentStudio } from "@molis-ai/molis-work-plugin-builder";
import { pluginPagesFor } from "@molis-ai/molis-work-app-local-host";
import type { StudioHarnessLocale } from "../../scripts/agent-studio-harness.mjs";
import { pluginFrameBrowser } from "./plugin-frame-browser.js";

export function studioFrameAsset(response: ServerResponse, path: string): boolean {
  const body = path === "/assets/molis-work-plugin-frame.js" ? renderPluginFrameClientScript()
    : path === "/assets/molis-work-plugins/plugin-builder.js" ? pluginWorkbenchClientAsset("plugin-builder")
    : path === "/assets/molis-work-workbench.css" ? STYLES + MORE_STYLES + RESPONSIVE_STYLES + PLUGIN_COMPONENT_STYLES + AGENT_STUDIO_STYLES : null;
  if (body === null) return false;
  response.writeHead(200, { "content-type": path.endsWith(".css") ? "text/css" : "text/javascript" }); response.end(body); return true;
}

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
export function isolatedStudioHarness(home: string, projectId: string, controlToken: string, locale?: StudioHarnessLocale): string {
  const entry = BUILTIN_PLUGIN_CATALOG.find(entry => entry.project_plugin_id === "plugin-builder")!;
  const authorization = pluginPagesFor(home).open(entry.manifest.plugin_id, projectId, "web-user", undefined, {
    manifest: entry.manifest, install_id: null, project_id: projectId, actor_id: "web-user", assertCurrent() {},
    requestAllowed: (method, path) => entry.workbench.pageRequests!.some(route => route.method === method && new RegExp("^" + route.path.replace(/:[a-z]+/gu, "[^/]+") + "$", "u").test(path)),
  });
  const document = renderPluginDocumentShell({ id: "plugin-builder", plugin_id: entry.manifest.plugin_id, bundle: "plugin-builder", title: "插件创作台",
    html: renderAgentStudio(locale && ((zh, values) => withPluginWords(entry.manifest.plugin_id, () => locale.translate(zh, values)))), project_id: projectId, route_prefix: "/projects/" + projectId, page: {}, control_token: controlToken, authorization });
  return locale ? document.replace('<html lang="zh-CN">', '<html lang="' + locale.lang + '">').replace('<script src="/assets/molis-work-plugin-frame.js">', '<script>' + locale.clientScript + ';globalThis.MOLIS_WORK_MESSAGES = { ...globalThis.MOLIS_WORK_PLUGIN_WORDS?.[' + JSON.stringify(entry.manifest.plugin_id) + '], ...globalThis.MOLIS_WORK_MESSAGES };</script><script src="/assets/molis-work-plugin-frame.js">') : document;
}
