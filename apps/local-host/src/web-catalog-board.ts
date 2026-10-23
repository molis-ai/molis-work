import type { IncomingMessage, ServerResponse } from "node:http";
import {
  assistantBoardSamples, parseAssistantFrame, parseConditionFrame, renderMolisWorkAssistantSpecimen, renderMolisWorkBarSpecimen, renderMolisWorkConditionsSpecimen,
  renderMolisWorkPrimitiveCatalog,
} from "@molis-ai/molis-work-app-workbench";
import { drawAssistantReply } from "./assistant/assistant-view-html.js";
import { L, clientI18nScript, htmlLang, runWithLocale } from "./web-locale.js";

/**
 * The component board's pages (a development tool, not in the person's navigation): the board, the bottom bar in its own
 * workbench context, the conditions frame and the Assistant frame (specs/visual-ui-experience VUX-39), whose own language
 * comes from its query so the board can compare both. Answers true when it served the request.
 */
export function handleComponentBoardHttp(request: IncomingMessage, response: ServerResponse, url: URL, pageCsp: string): boolean {
  if (request.method !== "GET") return false;
  const page = url.pathname === "/__ui/catalog" ? () => renderMolisWorkPrimitiveCatalog(L)
    : url.pathname === "/__ui/catalog/bar" ? renderMolisWorkBarSpecimen
      : url.pathname === "/__ui/catalog/conditions" ? () => {
        const options = parseConditionFrame(url.searchParams);
        return runWithLocale(options.lang, () => renderMolisWorkConditionsSpecimen(options, { L, htmlLang, clientI18nScript }));
      } : url.pathname === "/__ui/catalog/assistant" ? () => {
        const options = parseAssistantFrame(url.searchParams);
        return runWithLocale(options.lang, () => renderMolisWorkAssistantSpecimen(options, { L, htmlLang, clientI18nScript, samples: drawnSamples() }));
      } : null;
  if (!page) return false;
  response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": pageCsp });
  response.end(page());
  return true;
}

/**
 * The Assistant frame's fixed works, drawn by the Host exactly as it draws a real answer (questions, reviews, replies, the
 * next steps and the delivery note), in the page's language — also what a work becomes once answered or checked. Nothing is read from or written to any store.
 */
function drawnSamples(): string {
  const samples = assistantBoardSamples(Date.now());
  for (const view of [...Object.values(samples.views), ...Object.values(samples.next).flat(), ...Object.values(samples.answered), ...Object.values(samples.closed)]) drawAssistantReply(view, { say: L, drafts: () => ({}), card: () => "" });
  return JSON.stringify(samples);
}
