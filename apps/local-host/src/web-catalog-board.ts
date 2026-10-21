import type { IncomingMessage, ServerResponse } from "node:http";
import { parseConditionFrame, renderMolisWorkBarSpecimen, renderMolisWorkConditionsSpecimen, renderMolisWorkPrimitiveCatalog } from "@molis-ai/molis-work-app-workbench";
import { L, clientI18nScript, htmlLang, runWithLocale } from "./web-locale.js";

/**
 * The component board's pages (a development tool, not in the person's navigation): the board, the bottom bar in its own
 * workbench context, and the conditions frame (specs/visual-ui-experience VUX-39), whose own language comes from its query so
 * the board can compare both. Answers true when it served the request.
 */
export function handleComponentBoardHttp(request: IncomingMessage, response: ServerResponse, url: URL, pageCsp: string): boolean {
  if (request.method !== "GET") return false;
  const page = url.pathname === "/__ui/catalog" ? () => renderMolisWorkPrimitiveCatalog(L)
    : url.pathname === "/__ui/catalog/bar" ? renderMolisWorkBarSpecimen
      : url.pathname === "/__ui/catalog/conditions" ? () => {
        const options = parseConditionFrame(url.searchParams);
        return runWithLocale(options.lang, () => renderMolisWorkConditionsSpecimen(options, { L, htmlLang, clientI18nScript }));
      } : null;
  if (!page) return false;
  response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": pageCsp });
  response.end(page());
  return true;
}
