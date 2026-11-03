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
  ["lang", "界面语言", [["zh", "中文"], ["en", "English"]]],
  ["text", "正文语言", [["zh", "中文"], ["en", "English"], ["mixed", "混排"]]],
  ["kind", "内容", [["code", "编程"], ["prose", "非编程"]]],
  ["font", "字体", [["system", "系统"], ["fallback", "只剩后备（模拟）"]]],
  ["copy", "复制结果", [["ok", "正常"], ["fail", "会失败（模拟）"]]],
  ["width", "容器", [["760", "宽窗口"], ["420", "分屏一格"], ["360", "手机"]]],
];
const NATIVE = new Set(["中文", "English"]);

/** A frame's parameter as one toggle group, `current` (else its first value) current; the board's strip program (conditions-section.ts) reads it. */
export function boardFrameParam(say: Say, [name, label, options]: BoardFrameParam, current = options[0]![0]): string {
  return `<div class="mw-cond-param"><span>${escapeHtml(say(label))}</span>${renderToggleGroup({ label: say(label), items: options.map(([value, text]) => ({
    value, label: NATIVE.has(text) ? text : say(text), current: value === current, attrs: { "data-cond-param": name, "data-cond-value": value },
  })) })}</div>`;
}

function preference(say: Say, label: string, attribute: string, options: readonly Option[]): string {
  return `<div class="mw-cond-param"><span>${escapeHtml(say(label))}</span><div class="mw-choice-group" role="group" aria-label="${escapeHtml(say(label))}">${options.map(([value, text]) => renderChoice({ label: say(text), attrs: { [attribute]: value } })).join("")}</div></div>`;
}

/** `lang` is the board's own language: the frame starts in it. */
export function renderConditionsSection(say: Say, lang: "zh" | "en" = "zh"): string {
  const preferences = preference(say, "明暗", "data-theme-option", [["light", "浅色"], ["dark", "深色"]])
    + preference(say, "界面密度", "data-density-option", [["standard", "标准"], ["compact", "紧凑"]]);
  return `<section class="mw-catalog__section" id="conditions" data-primitive="conditions"><h2>${escapeHtml(say("条件与状态"))}</h2>
    <p class="mw-catalog__hint">${escapeHtml(say("同一块生产内容放在真实的工作台环境里（下面的框架用工作台的样式表与页面程序），一次只换一个参数对照：界面语言、正文语言与混排、编程与非编程、后备字体、复制成败、容器宽度，明暗与密度用页面的偏好。缩放、触控与减少动态效果由浏览器给，框架只读出当前值。示例内容固定，不连接任何服务；标「模拟」的是板上造出的条件，不代替生产验证。"))}</p>
    <div class="mw-cond-params" data-cond-params>${PARAMS.map((one) => boardFrameParam(say, one, one[0] === "lang" ? lang : undefined)).join("")}${preferences}</div>
    <iframe class="mw-cond-frame" data-cond-frame src="/__ui/catalog/conditions?lang=${lang}&amp;text=zh&amp;kind=code&amp;font=system&amp;copy=ok" title="${escapeHtml(say("条件与状态样例"))}" style="width:760px" loading="lazy"></iframe>
    <script>${CONDITIONS_SECTION_SCRIPT}</script>
  </section>`;
}

export const CONDITIONS_SECTION_STYLES = `.mw-cond-params{display:flex;flex-wrap:wrap;gap:12px 20px;margin:0 0 16px}.mw-cond-param{display:grid;gap:6px;font-size:12px;color:var(--muted)}`
  + `.mw-cond-frame{display:block;max-width:100%;height:1180px;border:0;border-radius:var(--r-sheet);box-shadow:var(--sheet-shadow)}`;

/** The strip's program, written in `src/browser/board/conditions-section.ts` and bundled into `dist/` when the package builds. */
const CONDITIONS_SECTION_SCRIPT = readFileSync(new URL("./board-conditions-section.js", import.meta.url), "utf8").trim();
