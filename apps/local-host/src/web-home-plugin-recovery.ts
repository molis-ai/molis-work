import { renderPluginStoreUnavailablePage, resolveGoalsPageRoute } from "@molis-ai/molis-work-app-workbench";
import { isHomePluginStoreRefusal } from "./home-plugin-store.js";
import type { MolisWorkProjectCatalog } from "./project-catalog.js";
import type { WebRequestContext } from "./web-route-table.js";
import { htmlLang, L } from "./web-locale.js";
import { sendLocalWebJson } from "./web-http.js";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";

/** GET display projection only. Availability, commands and content routes must use the strict Catalog methods. */
export function projectPluginMembershipForPage(catalog: MolisWorkProjectCatalog, projectId: string) {
  try { return { plugins: catalog.listProjectPlugins(projectId), hidden: catalog.listHiddenPlugins(projectId) }; }
  catch (error) {
    if (!isHomePluginStoreRefusal(error)) throw error;
    return { ...catalog.storedProjectPluginMembership(projectId), unavailable: L("Home 插件运行库不可用") };
  }
}

/** A known Home-store refusal gives HTML its static recovery page and read APIs an unavailable response. No mutation or content read receives substitute data. */
export async function withHomePluginStorePageRecovery(context: WebRequestContext, projectId: string | null, render: () => Promise<unknown>) {
  try { await render(); }
  catch (error) {
    const { request, response, url, serverOptions, composition } = context;
    if (!isHomePluginStoreRefusal(error) || request.method !== "GET"
      || !serverOptions.homeDirectory || response.headersSent) throw error;
    if (url.pathname.startsWith("/api/")) {
      const failure = actionErrorResponse(new ActionError(error.code, L("Home 插件运行库不可用"), { kind: "unavailable", cause: error }));
      sendLocalWebJson(response, failure.status, failure.body);
      return;
    }
    const page = resolveGoalsPageRoute(url.pathname) || /^\/(?:settings|capabilities|planning|assistant|side)(?:\/|$)/u.test(url.pathname);
    if (!page) throw error;
    const selectedId = projectId ?? url.searchParams.get("project");
    const projection = selectedId ? await composition.withCatalog({ homeDirectory: serverOptions.homeDirectory }, catalog => ({
      project: catalog.getProject(selectedId), membership: catalog.storedProjectPluginMembership(selectedId),
    })) : { project: null, membership: { plugins: [], hidden: [] } };
    const prefix = projectId ? `/projects/${encodeURIComponent(projectId)}` : "";
    const html = renderPluginStoreUnavailablePage({ ...projection, reason: error.message,
      reloadHref: prefix + url.pathname + url.search, desktopShell: composition.isDesktopShellRequest(request, url) }, { L, htmlLang, desktop: composition.desktopRenderer });
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": composition.PAGE_CSP });
    response.end(html);
  }
}
