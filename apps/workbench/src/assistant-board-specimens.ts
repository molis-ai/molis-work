import { WORKBENCH_LANGUAGES } from "./platform-languages.js";
import { DEFAULT_WEB_LOCALE, type WebLocale } from "./i18n.js";
import { escapeHtml } from "@molis-ai/molis-work-plugin-sdk/ui";
import { boardFrameParam, type BoardFrameParam } from "./condition-specimens.js";

/**
 * The component board's 助理信息与任务 section (specs/visual-ui-experience VUX-39): the shipped Assistant in its own frame
 * (`assistant-board-frame.ts`) on fixed works, one parameter at a time — the interface language, the work open (not about
 * code, about code, one cut off to be checked, or a new one) and the container (a wide window shows the side pane beside the conversation, a narrower
 * one as a drawer). The strip is read by the board's one strip program, which the 条件与状态 section carries.
 */
type Say = (text: string, values?: Record<string, string | number>) => string;

const PARAMS: readonly BoardFrameParam[] = [
  ["lang", "workbench.context-onboarding.language-2", WORKBENCH_LANGUAGES.languages.map(row => [row.tag, row.name] as const)],
  ["text", "workbench.assistant-board-specimens.body-language", [["zh", "中文"], ["en", "English"], ["mixed", "workbench.assistant-board-specimens.mixed"]]],
  ["work", "workbench.assistant-dock.open-work", [["plan", "workbench.assistant-board-specimens.non-programming-waiting-for-you-to-confirm"], ["coding", "workbench.assistant-board-specimens.programming-running"], ["check", "workbench.assistant-board-specimens.interrupted-to-be-checked"], ["limited", "workbench.assistant-board-specimens.rate-limited-waiting-to-retry"], ["new", "workbench.assistant-dock.new-work"]]],
  ["answer", "workbench.assistant-board-specimens.answering-the-questionnaire", [["ok", "workbench.assistant-board-specimens.taken"], ["refused", "workbench.assistant-board-specimens.refused-simulated"]]],
  ["width", "workbench.assistant-board-specimens.container", [["1280", "workbench.assistant-board-specimens.wide-window"], ["760", "workbench.assistant-board-specimens.one-split-pane"], ["390", "workbench.account-management.phone"]]],
];

export function renderAssistantBoardSection(say: Say, lang: WebLocale = DEFAULT_WEB_LOCALE): string {
  return `<section class="mw-catalog__section" id="assistant" data-primitive="assistant"><h2>${escapeHtml(say("workbench.primitive-catalog.assistant-information-works"))}</h2>
    <div class="mw-cond-params" data-asst-params>${PARAMS.map((one) => boardFrameParam(say, one, one[0] === "lang" ? lang : undefined)).join("")}</div>
    <div class="mw-asst-stage"><iframe class="mw-asst-frame" data-asst-frame src="/__ui/catalog/assistant?lang=${lang}&amp;text=zh&amp;work=plan&amp;answer=ok" title="${escapeHtml(say("workbench.assistant-board-frame.assistant-specimen"))}" style="width:1280px" loading="lazy"></iframe></div>
  </section>`;
}

export const ASSISTANT_SECTION_STYLES = `.mw-asst-stage{width:100%;contain:inline-size;overflow-x:auto;border-radius:var(--r-sheet)}`
  + `.mw-asst-frame{display:block;height:880px;border:0;border-radius:var(--r-sheet);box-shadow:var(--sheet-shadow)}`;
