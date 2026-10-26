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
    <p class="mw-catalog__hint">${escapeHtml(say("常驻助理的生产程序放在它自己的底栏里：多项工作的标签与列表、侧栏六组（工作环境、上下文、连接与工具、产出、变更、后台任务）、一轮的过程、输入框、上下文条与附件。读到的工作是固定样例（模拟），由宿主照常画好；回答问题、核对中断的一轮与处理提醒只在这一页里生效，别的写入一律被拒绝，不碰真实的工作，也不改这台电脑上工作台记住的东西。侧栏的「用量」照这一轮的报告写：进行中、已报告、暂不可用各有一项工作；「给王一骏回邮件」的问卷可以单选、多选、写「其他」和补充，交回时按钮转圈，被拒（模拟）时说明落在那一题下面。正文语言换的是工作里的话，界面语言换的是产品的字。"))}</p>
    <div class="mw-cond-params" data-asst-params>${PARAMS.map((one) => boardFrameParam(say, one, one[0] === "lang" ? lang : undefined)).join("")}</div>
    <div class="mw-asst-stage"><iframe class="mw-asst-frame" data-asst-frame src="/__ui/catalog/assistant?lang=${lang}&amp;text=zh&amp;work=plan&amp;answer=ok" title="${escapeHtml(say("助理样例"))}" style="width:1280px" loading="lazy"></iframe></div>
  </section>`;
}

export const ASSISTANT_SECTION_STYLES = `.mw-asst-stage{width:100%;contain:inline-size;overflow-x:auto;border-radius:var(--r-sheet)}`
  + `.mw-asst-frame{display:block;height:880px;border:0;border-radius:var(--r-sheet);box-shadow:var(--sheet-shadow)}`;
