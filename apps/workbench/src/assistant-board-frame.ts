import { readFileSync } from "node:fs";
import { t as uiText, escapeHtml, icon } from "@molis-ai/molis-work-plugin-sdk/ui";
import {
  INPUT_RECEIPTS_CLIENT_SCRIPT,
  INTERACTION_CLIENT_SCRIPT_TYPED_DATES,
  THEME_BOOTSTRAP_SCRIPT,
  VISUAL_FOUNDATION_CLIENT_SCRIPT,
  renderIconSprite,
} from "@molis-ai/molis-work-design-system";
import { UI_REQUEST_CLIENT_SCRIPT } from "@molis-ai/molis-work-ui-host";
import { ASSISTANT_ISLAND_FACTORY_SCRIPT } from "./scripts/client/assistant-island.js";
import { ATTENTION_FACTORY_SCRIPT } from "./scripts/client/attention.js";
import { renderWorkbenchBar } from "./immersive-shell.js";
import { WEB_LOCALES, type WebLocale } from "./i18n.js";
import { renderLanguageHead } from "./language-resource.js";

/**
 * The component board's Assistant frame (specs/visual-ui-experience VUX-39; VUX-08/09/10/13/18): the page
 * `/__ui/catalog/assistant` that the board's 助理信息与任务 section loads in an iframe. The resident Assistant is the shipped
 * island in the bar the workbench composes, with its panel, tabs and list of works, the side pane's six groups, the round's
 * steps, the composer, the context strip and the attachment path. What it reads is simulated: a stand-in for the Host
 * (`src/browser/board/assistant-frame.ts`) answers `/api/assistant` and the page's attention read from fixed works (`assistant-board-samples.ts`) that the
 * Host has drawn as it draws a real answer, refuses every write, and keeps the island's per-viewer state in memory, so the
 * frame never reaches a real work or changes what the workbench remembers on this computer.
 */
export interface AssistantFrameOptions {
  lang: WebLocale;
  /** The works' own words (the person's, the model's and what the Host and plugins wrote): Chinese, English or mixed. */
  text: "zh" | "en" | "mixed";
  /** What the stand-in Host does with a questionnaire's answer: takes it, or refuses it as the Runtime would (simulated). */
  answer: "ok" | "refused";
  /** The work open when the frame starts: not about code, about code, one cut off to be checked, one waiting out a rate limit, or a new one. */
  work: "plan" | "coding" | "check" | "limited" | "new";
}
export interface AssistantFramePorts {
  readText(text: string, values?: Record<string, string | number>): string;
  htmlLang(): string;
  pluginTitleScript(): string;
  /** The samples as the Host drew them (`drawAssistantReply`), as JSON. */
  samples: string;
}

const pick = <T extends string>(value: string | null, allowed: readonly T[]): T => (allowed as readonly string[]).includes(value ?? "") ? value as T : allowed[0]!;

/** Only known values are read; anything else is the first value, so the page never reflects what the query said. */
export function parseAssistantFrame(query: URLSearchParams): AssistantFrameOptions {
  return { lang: pick(query.get("lang"), WEB_LOCALES), text: pick(query.get("text"), ["zh", "en", "mixed"] as const),
    work: pick(query.get("work"), ["plan", "coding", "check", "limited", "new"] as const), answer: pick(query.get("answer"), ["ok", "refused"] as const) };
}

const WORK_IDS: Record<AssistantFrameOptions["work"], string | null> = { plan: "board-plan", coding: "board-coding", check: "board-sync", limited: "board-sub-interviews", new: null };

// The bar stands at the foot of the frame, as it does in the workbench, so the panel opens upwards into the room above it.
const FRAME_STYLES = `body.mw-asst-page{display:flex;flex-direction:column;margin:0;min-height:100vh;background:var(--desk,var(--wash));color:var(--ink)}`
  + `.mw-asst{flex:1;display:grid;align-content:start;gap:8px;padding:12px 16px}.mw-asst p{margin:0;color:var(--muted);font-size:12px}`
  + `.mw-asst-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.mw-asst-row [role=status]{color:var(--muted);font-size:12px}`;

export function renderMolisWorkAssistantSpecimen(options: AssistantFrameOptions, ports: AssistantFramePorts): string {
  const { readText } = ports;
  const bar = renderWorkbenchBar({ readText, escapeHtml, icon, htmlLang: ports.htmlLang }, { rail: "", projectChrome: "", enabled: [] });
  const data = `{"samples":${ports.samples.replaceAll("<", "\\u003c")},"current":${JSON.stringify(WORK_IDS[options.work])},"answer":"${options.answer}"}`;
  return `<!doctype html>
<html lang="${ports.htmlLang()}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(uiText.text("workbench.assistant-board-frame.assistant-specimen"))} · Molis Work</title>
  ${renderLanguageHead(ports.htmlLang())}
  <script>${THEME_BOOTSTRAP_SCRIPT}</script>
  <link rel="stylesheet" href="/assets/molis-work-workbench.css">
  <style>${FRAME_STYLES}</style>
</head>
<body class="immersive-workbench mw-asst-page">
  ${renderIconSprite()}
  <main class="mw-asst" data-asst-frame-page data-work="${options.work}" data-text="${options.text}" data-answer="${options.answer}">
    <p data-asst-note>${escapeHtml(uiText.text("workbench.assistant-board-frame.simulated-works-turns-host-s-answers-fixed-samples"))}</p>
    <div class="mw-asst-row">
      <button type="button" class="mw-btn mw-btn--secondary mw-btn--sm" data-asst-attach>${escapeHtml(uiText.text("workbench.assistant-board-frame.bring-three-files-simulated"))}</button>
      <button type="button" class="mw-btn mw-btn--secondary mw-btn--sm" data-asst-advance>${escapeHtml(uiText.text("workbench.assistant-board-frame.move-one-step-simulated"))}</button>
      <span role="status" data-asst-state></span>
    </div>
  </main>
  ${bar}
  <div class="mw-toast toast" data-toast role="status" aria-live="polite"></div>
  <script type="application/json" id="mw-asst-data">${data}</script>
  <script>${ports.pluginTitleScript()}${UI_REQUEST_CLIENT_SCRIPT}${VISUAL_FOUNDATION_CLIENT_SCRIPT}</script>
  <script>${ASSISTANT_FRAME_SCRIPT}</script>
  <script>(board => board.start((${ASSISTANT_ISLAND_FACTORY_SCRIPT})({ translate: globalThis.t.text, route: board.route, headers: () => ({}), project: board.project,
    showToast: board.toast, openItem: board.openItem, pluginTitle: (plugin) => plugin, receipts: (${INPUT_RECEIPTS_CLIENT_SCRIPT})(globalThis.t.text),
    interaction: (client => (root, host) => client(root, { references: () => Promise.resolve({ items: [] }), ...host }))((${INTERACTION_CLIENT_SCRIPT_TYPED_DATES})) })))(globalThis.molisBoardAssistant);
  (board => (${ATTENTION_FACTORY_SCRIPT})({ translate: globalThis.t.text, projectId: board.project.id, openItem: board.openItem, route: board.route }))(globalThis.molisBoardAssistant);</script>
</body>
</html>`;
}

/** The frame's stand-in Host and driver, written in `src/browser/board/assistant-frame.ts` and bundled into `dist/` when the package builds. */
const ASSISTANT_FRAME_SCRIPT = readFileSync(new URL("./board-assistant-frame.js", import.meta.url), "utf8").trim();
