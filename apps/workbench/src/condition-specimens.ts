import { WORKBENCH_LANGUAGES } from "./platform-languages.js";
import { DEFAULT_WEB_LOCALE, type WebLocale } from "./i18n.js";
import { readFileSync } from "node:fs";
import { escapeHtml, renderChoice } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderToggleGroup } from "@molis-ai/molis-work-design-system";

/**
 * The component board's 条件与状态 section (specs/visual-ui-experience VUX-39): one parameter strip and the conditions frame
 * (`condition-frame.ts`). A choice changes one parameter of the frame's address (or, for the container, the frame's width),
 * so the comparison is the same content under one change, never every state cycling at once. Theme and density are the
 * page's own preference controls (`data-theme-option`, `data-density-option`), which the frame follows as every page does.
 */
type Say = (text: string, values?: Record<string, string | number>) => string;
type Option = readonly [value: string, label: string];
/** One parameter of a board frame: its name in the frame's address (or `width`, the frame's own width), its label and its values. */
export type BoardFrameParam = readonly [name: string, label: string, options: readonly Option[]];

// The language names are written in their own language, as the product's language switch writes them.
const PARAMS: readonly BoardFrameParam[] = [
  ["lang", "workbench.context-onboarding.language-2", WORKBENCH_LANGUAGES.languages.map(row => [row.tag, row.name] as const)],
  ["text", "workbench.condition-specimens.body-language", [["zh", "中文"], ["en", "English"], ["mixed", "workbench.condition-specimens.mixed"]]],
  ["kind", "workbench.settings-sync-comparison.content", [["code", "workbench.condition-specimens.programming"], ["prose", "workbench.condition-specimens.non-programming"]]],
  ["font", "workbench.env.font", [["system", "workbench.client-render.system"], ["fallback", "workbench.condition-specimens.fallback-only-simulated"]]],
  ["copy", "workbench.condition-specimens.copy-result", [["ok", "workbench.navigation-specimens.ok"], ["fail", "workbench.condition-specimens.fails-simulated"]]],
  ["width", "workbench.condition-specimens.container", [["760", "workbench.condition-specimens.wide-window"], ["420", "workbench.condition-specimens.one-split-pane"], ["360", "workbench.account-management.phone"]]],
];
const NATIVE = new Set(["中文", "English"]);

/** A frame's parameter as one toggle group, `current` (else its first value) current; the board's strip program (conditions-section.ts) reads it. */
export function boardFrameParam(say: Say, [name, label, options]: BoardFrameParam, current = options[0]![0]): string {
  return `<div class="mw-cond-param"><span>${escapeHtml(say(label))}</span>${renderToggleGroup({ label: say(label), items: options.map(([value, text]) => ({
    value, label: name === "lang" || NATIVE.has(text) ? text : say(text), current: value === current, attrs: { "data-cond-param": name, "data-cond-value": value },
  })) })}</div>`;
}

function preference(say: Say, label: string, attribute: string, options: readonly Option[]): string {
  return `<div class="mw-cond-param"><span>${escapeHtml(say(label))}</span><div class="mw-choice-group" role="group" aria-label="${escapeHtml(say(label))}">${options.map(([value, text]) => renderChoice({ label: say(text), attrs: { [attribute]: value } })).join("")}</div></div>`;
}

/** `lang` is the board's own language: the frame starts in it. */
export function renderConditionsSection(say: Say, lang: WebLocale = DEFAULT_WEB_LOCALE): string {
  const preferences = preference(say, "workbench.condition-specimens.light-and-dark", "data-theme-option", [["light", "workbench.context-onboarding.light"], ["dark", "workbench.context-onboarding.dark"]])
    + preference(say, "workbench.context-onboarding.interface-density", "data-density-option", [["standard", "workbench.context-onboarding.standard"], ["compact", "workbench.context-onboarding.compact"]]);
  return `<section class="mw-catalog__section" id="conditions" data-primitive="conditions"><h2>${escapeHtml(say("workbench.primitive-catalog.conditions-states"))}</h2>
    <div class="mw-cond-params" data-cond-params>${PARAMS.map((one) => boardFrameParam(say, one, one[0] === "lang" ? lang : undefined)).join("")}${preferences}</div>
    <iframe class="mw-cond-frame" data-cond-frame src="/__ui/catalog/conditions?lang=${lang}&amp;text=zh&amp;kind=code&amp;font=system&amp;copy=ok" title="${escapeHtml(say("workbench.condition-frame.conditions-states-specimen"))}" style="width:760px" loading="lazy"></iframe>
    <script>${CONDITIONS_SECTION_SCRIPT}</script>
  </section>`;
}

export const CONDITIONS_SECTION_STYLES = `.mw-cond-params{display:flex;flex-wrap:wrap;gap:12px 20px;margin:0 0 16px}.mw-cond-param{display:grid;gap:6px;font-size:12px;color:var(--muted)}`
  + `.mw-cond-frame{display:block;max-width:100%;height:1180px;border:0;border-radius:var(--r-sheet);box-shadow:var(--sheet-shadow)}`;

/** The strip's program, written in `src/browser/board/conditions-section.ts` and bundled into `dist/` when the package builds. */
const CONDITIONS_SECTION_SCRIPT = readFileSync(new URL("./board-conditions-section.js", import.meta.url), "utf8").trim();
