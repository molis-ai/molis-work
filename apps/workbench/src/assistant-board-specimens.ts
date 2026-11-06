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
  ["lang", "界面语言", [["zh", "中文"], ["en", "English"]]],
  ["text", "正文语言", [["zh", "中文"], ["en", "English"], ["mixed", "混排"]]],
  ["work", "打开的工作", [["plan", "非编程 · 等你确认"], ["coding", "编程 · 进行中"], ["check", "中断 · 要核对"], ["limited", "限流 · 等待重试"], ["new", "新工作"]]],
  ["answer", "回答问卷", [["ok", "交回"], ["refused", "被拒（模拟）"]]],
  ["width", "容器", [["1280", "宽窗口"], ["760", "分屏一格"], ["390", "手机"]]],
];

export function renderAssistantBoardSection(say: Say, lang: "zh" | "en" = "zh"): string {
  return `<section class="mw-catalog__section" id="assistant" data-primitive="assistant"><h2>${escapeHtml(say("助理信息与任务"))}</h2>
    <div class="mw-cond-params" data-asst-params>${PARAMS.map((one) => boardFrameParam(say, one, one[0] === "lang" ? lang : undefined)).join("")}</div>
    <div class="mw-asst-stage"><iframe class="mw-asst-frame" data-asst-frame src="/__ui/catalog/assistant?lang=${lang}&amp;text=zh&amp;work=plan&amp;answer=ok" title="${escapeHtml(say("助理样例"))}" style="width:1280px" loading="lazy"></iframe></div>
  </section>`;
}

export const ASSISTANT_SECTION_STYLES = `.mw-asst-stage{width:100%;contain:inline-size;overflow-x:auto;border-radius:var(--r-sheet)}`
  + `.mw-asst-frame{display:block;height:880px;border:0;border-radius:var(--r-sheet);box-shadow:var(--sheet-shadow)}`;
