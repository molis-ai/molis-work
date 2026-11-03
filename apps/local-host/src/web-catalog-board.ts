import type { IncomingMessage, ServerResponse } from "node:http";
import {
  assistantBoardSamples, parseAssistantFrame, type AssistantFrameOptions, parseConditionFrame, renderMolisWorkAssistantSpecimen, renderMolisWorkBarSpecimen, renderMolisWorkConditionsSpecimen,
  renderMolisWorkPrimitiveCatalog,
} from "@molis-ai/molis-work-app-workbench";
import { drawAssistantReply } from "./assistant/assistant-view-html.js";
import { questionErrors } from "./agent-question-card.js";
import { L, clientI18nScript, currentLocale, htmlLang, isWebLocale, runWithLocale, type WebLocale } from "./web-locale.js";

/**
 * The component board's pages (a development tool, not in the person's navigation): the board, the bottom bar in its own
 * workbench context, the conditions frame and the Assistant frame (specs/visual-ui-experience VUX-39), whose own language
 * comes from its query so the board can compare both. Answers true when it served the request.
 */
export function handleComponentBoardHttp(request: IncomingMessage, response: ServerResponse, url: URL, pageCsp: string): boolean {
  if (request.method !== "GET") return false;
  // The board's own language switch (`?lang=`) changes this page only, never the Home's language; without it, the Home's.
  const lang = url.searchParams.get("lang"), board = (locale: WebLocale) => runWithLocale(locale, () => renderMolisWorkPrimitiveCatalog(L, locale));
  const page = url.pathname === "/__ui/catalog" ? () => board(isWebLocale(lang) ? lang : currentLocale())
    : url.pathname === "/__ui/catalog/bar" ? renderMolisWorkBarSpecimen
      : url.pathname === "/__ui/catalog/conditions" ? () => {
        const options = parseConditionFrame(url.searchParams);
        return runWithLocale(options.lang, () => renderMolisWorkConditionsSpecimen(options, { L, htmlLang, clientI18nScript }));
      } : url.pathname === "/__ui/catalog/assistant" ? () => {
        const options = parseAssistantFrame(url.searchParams);
        return runWithLocale(options.lang, () => renderMolisWorkAssistantSpecimen(options, { L, htmlLang, clientI18nScript, samples: drawnSamples(options.text) }));
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
function drawnSamples(text: AssistantFrameOptions["text"]): string {
  const samples = assistantBoardSamples(Date.now(), text);
  for (const view of [...Object.values(samples.views), ...Object.values(samples.next).flat(), ...Object.values(samples.answered), ...Object.values(samples.closed)]) drawAssistantReply(view, { say: L, drafts: () => ({}), card: () => "" });
  // A questionnaire answer the Runtime refuses (the frame's 回答问卷 · 被拒): the first question's options changed meanwhile, in
  // the lines the Host puts beside each field (assistant-http.ts).
  const refused = Object.fromEntries(Object.values(samples.views).flatMap((view) => view.rounds.flatMap((round) => round.awaiting_input))
    .filter((question) => question.questions?.length).map((question) => [question.pending_id, questionErrors([{ question: 1, reason: "unknown-option" }], L, question.questions)]));
  return JSON.stringify({ ...samples, refused });
}
