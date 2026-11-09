import type { TestContext } from "node:test";
import type { ServerResponse } from "node:http";
import type { ChromeHarness, ChromePage, WaitOptions } from "@molis-ai/molis-work-test-kit/browser";
import { renderPluginFrameClientScript, pluginWorkbenchClientAsset, renderPluginDocumentShell, workbenchLanguageResource, createWorkbenchLocale, BUILTIN_PLUGIN_CATALOG, STYLES, MORE_STYLES, RESPONSIVE_STYLES, type WebLocale } from "@molis-ai/molis-work-app-workbench";
import { PLUGIN_COMPONENT_STYLES } from "@molis-ai/molis-work-design-system";
import { AGENT_STUDIO_STYLES, renderAgentStudio } from "@molis-ai/molis-work-plugin-builder";
import { installHostUiText, pluginPagesFor } from "@molis-ai/molis-work-app-local-host";
import { pagePack, pageText } from "./page-text.js";
import { pluginFrameBrowser } from "./plugin-frame-browser.js";

export function studioFrameAsset(response: ServerResponse, path: string): boolean {
  const body = path === "/assets/molis-work-plugin-frame.js" ? renderPluginFrameClientScript()
    : path === "/assets/molis-work-plugins/plugin-builder.js" ? pluginWorkbenchClientAsset("plugin-builder")
    : path === "/assets/molis-work-workbench.css" ? STYLES + MORE_STYLES + RESPONSIVE_STYLES + PLUGIN_COMPONENT_STYLES + AGENT_STUDIO_STYLES
    : workbenchLanguageResource(path)?.body ?? null;
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
export function isolatedStudioHarness(home: string, projectId: string, controlToken: string, locale: WebLocale = "zh"): string {
  installHostUiText();
  const entry = BUILTIN_PLUGIN_CATALOG.find(entry => entry.project_plugin_id === "plugin-builder")!;
  const words = entry.manifest.ui.locales!;
  const authorization = pluginPagesFor(home).open(entry.manifest.plugin_id, projectId, "web-user", undefined, {
    manifest: entry.manifest, install_id: null, project_id: projectId, actor_id: "web-user", assertCurrent() {},
    registeredText: { owner: entry.manifest.plugin_id, default: words.default, pack: tag => words.available.includes(tag) ? pagePack("plugin-builder", tag) : null },
    requestAllowed: (method, path) => entry.workbench.pageRequests!.some(route => route.method === method && new RegExp("^" + route.path.replace(/:[a-z]+/gu, "[^/]+") + "$", "u").test(path)),
  });
  const text = pageText(locale, "plugin-builder");
  return renderPluginDocumentShell({ id: "plugin-builder", plugin_id: entry.manifest.plugin_id, bundle: "plugin-builder", title: text("plugin-builder.workbench.plugin-studio"),
    html: renderAgentStudio(text), lang: createWorkbenchLocale(() => locale).htmlLang(), project_id: projectId, route_prefix: "/projects/" + projectId, page: {}, control_token: controlToken, authorization });
}
