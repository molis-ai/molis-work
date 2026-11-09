import type { IncomingMessage, ServerResponse } from 'node:http';
import { VISUAL_FOUNDATION_STYLES, PLUGIN_COMPONENT_STYLES } from '@molis-ai/molis-work-design-system';
import { AGENT_STUDIO_STYLES, renderAgentStudio } from '@molis-ai/molis-work-plugin-builder';
import { installHostUiText, pluginPagesFor, registeredBuiltinText, runWithLocale, runWithRegisteredText, readText, htmlLang, resolveWebLocale, handlePageLocales, WebSessions, webPageToken, withWebSessionRequest } from '@molis-ai/molis-work-app-local-host';
import { renderPluginFrameClientScript, pluginWorkbenchClientAsset, renderPluginDocumentShell, workbenchLanguageResource,
  BUILTIN_PLUGIN_CATALOG, STYLES, MORE_STYLES, RESPONSIVE_STYLES, type WebLocale } from '@molis-ai/molis-work-app-workbench';

/** The isolated harness exercises the workbench's opaque frame; only the outer application and model are fixtures. */
export const STUDIO_HARNESS_PATH = '/studio';

export function studioFrameAsset(response: ServerResponse, path: string): boolean {
  const body = path === "/assets/molis-work-plugin-frame.js" ? renderPluginFrameClientScript()
    : path === "/assets/molis-work-plugins/plugin-builder.js" ? pluginWorkbenchClientAsset("plugin-builder")
    : path === "/assets/molis-work-workbench.css" ? STYLES + MORE_STYLES + RESPONSIVE_STYLES + PLUGIN_COMPONENT_STYLES + AGENT_STUDIO_STYLES
    : path === "/assets/molis-work-settings.css" ? VISUAL_FOUNDATION_STYLES
    : workbenchLanguageResource(path)?.body ?? null;
  if (body === null) return false;
  response.writeHead(200, { "content-type": path.endsWith(".css") ? "text/css" : "text/javascript" }); response.end(body); return true;
}

export function studioHarnessPage(home: string, projectId: string, routePrefix: string, proof: string, locale: WebLocale): string {
  const entry = BUILTIN_PLUGIN_CATALOG.find(entry => entry.project_plugin_id === "plugin-builder")!;
  const reader = registeredBuiltinText(entry.manifest)!;
  const authorization = pluginPagesFor(home).open(entry.manifest.plugin_id, projectId, "web-user", undefined, {
    manifest: entry.manifest, install_id: null, project_id: projectId, actor_id: "web-user", assertCurrent() {}, registeredText: reader,
    requestAllowed: (method, path) => entry.workbench.pageRequests!.some(route => route.method === method && new RegExp("^" + route.path.replace(/:[a-z]+/gu, "[^/]+") + "$", "u").test(path)),
  });
  return runWithLocale(locale, () => runWithRegisteredText(reader, () => renderPluginDocumentShell({ id: "plugin-builder", plugin_id: entry.manifest.plugin_id, bundle: "plugin-builder",
    title: readText("plugin-builder.workbench.plugin-studio"), html: renderAgentStudio(readText),
    lang: htmlLang(), project_id: projectId, route_prefix: routePrefix, page: {}, control_token: proof, authorization })));
}

export function studioHarnessRequests(home: string, projectId: string, token: string) {
  installHostUiText();
  const sessions = new WebSessions(home);
  return { close: () => sessions.close(),
    handle(request: IncomingMessage, response: ServerResponse, url: URL, prefix: string, next: (local: URL, proof: string) => void | Promise<void>) {
      if (studioFrameAsset(response, url.pathname)) return;
      sessions.bind(request, token, response);
      const local = new URL(url);
      if (prefix && local.pathname.startsWith(prefix + '/')) local.pathname = local.pathname.slice(prefix.length);
      return withWebSessionRequest(request, () => runWithLocale(resolveWebLocale(request.headers.cookie, request.headers["accept-language"]), () => {
        if (local.pathname === "/api/ui/locales") {
          return handlePageLocales({ request, response, url: local, serverOptions: { homeDirectory: home } }, projectId);
        }
        return next(local, webPageToken(request) || token);
      }));
    } };
}
