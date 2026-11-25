import { t } from "@molis-ai/molis-work-plugin-sdk/ui";
import { developerMode } from "./developer-mode.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  assistantBoardSamples, catalogBoardText, parseAssistantFrame, type AssistantFrameOptions, parseConditionFrame, renderMolisWorkAssistantSpecimen, renderMolisWorkBarSpecimen, renderMolisWorkConditionsSpecimen,
  renderMolisWorkNavigationSpecimen, renderMolisWorkPrimitiveCatalog, renderEnvironmentSection, renderEnvironmentSpecimen,
  type WorkbenchAppearancePorts,
} from "@molis-ai/molis-work-app-workbench";
import { drawAssistantReply } from "./assistant/assistant-view-html.js";
import { questionErrors } from "./agent-question-card.js";
import { readText, currentLocale, htmlLang, isWebLocale, runWithLocale, runWithRegisteredText, WEB_LOCALES, type WebLocale } from "./web-locale.js";

/** Which sheet the navigation frame is asked for: the project page's (the default), the arrival page's, or the work line's specimens. */
const catalogSheet = (value: string | null) => value === "arrival" || value === "work-line" ? value : "workbench";

/** Runs a `/__ui/catalog*` render with the requested locale and the on-demand catalog locale sub-pack registered. */
function runCatalogLocale<T>(locale: WebLocale, render: () => T): T {
  return runWithLocale(locale, () => runWithRegisteredText(catalogBoardText, render));
}

/**
 * The component board's pages (a development tool, not in the person's navigation): the board, the bottom bar in its own
 * workbench context, the conditions frame and the Assistant frame (specs/visual-ui-experience VUX-39), whose own language
 * comes from its query so the board can compare all UI languages. Answers true when it served the request.
 */
export function handleComponentBoardHttp(request: IncomingMessage, response: ServerResponse, url: URL, pageCsp: string, appearance?: WorkbenchAppearancePorts): boolean {
  if ((url.pathname === "/__ui/catalog" || url.pathname.startsWith("/__ui/catalog/")) && !developerMode()) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" }); response.end("Not found"); return true;
  }
  if (request.method !== "GET") return false;
  // The board's own language switch (`?lang=`) changes this page only, never the Home's language; without it, the Home's.
  const currentAppearance = appearance?.current();
  const lang = url.searchParams.get("lang");
  const resolved = isWebLocale(lang) ? lang : currentLocale();
  const board = (locale: WebLocale) => runCatalogLocale(locale, () => renderMolisWorkPrimitiveCatalog(t, locale, environmentSection(locale), currentAppearance, t.text("workbench.composer.next-boundary")));
  const page = url.pathname === "/__ui/catalog"
    ? () => board(resolved)
    : url.pathname === "/__ui/catalog/bar"
      ? () => runCatalogLocale(resolved, () => renderMolisWorkBarSpecimen(currentAppearance, resolved))
      : url.pathname === "/__ui/catalog/navigation"
        ? () => runCatalogLocale(resolved, () => renderMolisWorkNavigationSpecimen(t, htmlLang(), catalogSheet(url.searchParams.get("sheet")), currentAppearance))
        : url.pathname === "/__ui/catalog/conditions"
          ? () => {
              const options = parseConditionFrame(url.searchParams);
              return runCatalogLocale(options.lang, () => renderMolisWorkConditionsSpecimen(options, { readText, htmlLang }, currentAppearance));
            }
          : url.pathname === "/__ui/catalog/assistant"
            ? () => {
                const options = parseAssistantFrame(url.searchParams);
                return runCatalogLocale(options.lang, () => renderMolisWorkAssistantSpecimen(options, { readText, htmlLang, samples: drawnSamples(options.text) }, currentAppearance));
              }
            : null;
  if (!page) return false;
  response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": pageCsp });
  response.end(page());
  return true;
}

/**
 * The 语言与文字 section (specs/font-and-skin-system/a-section-contract.md §8.2): its content drawn in every UI language, each in a scope of its own, so the
 * page switches between them in place; the section itself in the page's language.
 */
function environmentSection(locale: WebLocale): string {
  const renders = Object.fromEntries(WEB_LOCALES.map(tag => [tag, runCatalogLocale(tag, () => renderEnvironmentSpecimen(tag))]));
  return runCatalogLocale(locale, () => renderEnvironmentSection(renders, locale));
}

/**
 * The Assistant frame's fixed works, drawn by the Host exactly as it draws a real answer (questions, reviews, replies, the
 * next steps and the delivery note), in the page's language — also what a work becomes once answered or checked. Nothing is read from or written to any store.
 */
function drawnSamples(text: AssistantFrameOptions["text"]) {
  const samples = assistantBoardSamples(Date.now(), text);
  for (const view of [...Object.values(samples.views), ...Object.values(samples.next).flat(), ...Object.values(samples.answered), ...Object.values(samples.closed)]) drawAssistantReply(view, { say: readText, drafts: () => ({}), card: () => "" });
  // A questionnaire answer the Runtime refuses (the frame's 回答问卷 · 被拒): the first question's options changed meanwhile, in
  // the lines the Host puts beside each field (assistant-http.ts).
  const refused = Object.fromEntries(Object.values(samples.views).flatMap((view) => view.rounds.flatMap((round) => round.awaiting_input))
    .filter((question) => question.questions?.length).map((question) => [question.pending_id, questionErrors([{ question: 1, reason: "unknown-option" }], readText, question.questions)]));
  return { ...samples, refused };
}
