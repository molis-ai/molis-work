import { readFileSync } from "node:fs";
import { escapeHtml, renderDirectoryRow, type MwStatusTone as DirectoryStatusTone } from "@molis-ai/molis-work-plugin-sdk/ui";
import { THEME_BOOTSTRAP_SCRIPT, VISUAL_FOUNDATION_CLIENT_SCRIPT, renderIconSprite } from "@molis-ai/molis-work-design-system";
import { assistantTextHtml } from "./scripts/client/assistant-island.js";
import { createAssistantCodeGrow } from "./scripts/client/assistant-code-grow.js";
import { conditionSample, conditionStream, type ConditionKind, type ConditionText } from "./condition-samples.js";
import { BOARD_PLUGIN_ROW_STYLES, renderBoardPluginRows } from "./board-plugin-rows.js";

/**
 * The component board's conditions frame (specs/visual-ui-experience VUX-39, §render-lifecycle 同源标本): the page
 * `/__ui/catalog/conditions` that the board's 条件与状态 section loads in an iframe, so a width is a real viewport and the
 * workbench's media queries answer it. Everything in it is a production part in the workbench's own context (stylesheet,
 * `body.immersive-workbench`, the page programs): the Assistant's reply drawn by the Host's renderer with Coding's tokenizer,
 * its code figure's copy and fold, `molisStreamText`, `molisFollow`, `molisCopy` and `molisShowMore` with the Assistant's
 * keep-failures rule. The query picks one value per parameter; theme and density follow the page's preferences.
 */
export interface ConditionFrameOptions {
  lang: "zh" | "en";
  text: ConditionText;
  kind: ConditionKind;
  /** `fallback` (simulated): the system faces are gone and only the bundled Inter Variable and Noto Sans SC are left. */
  font: "system" | "fallback";
  /** `fail` (simulated): the clipboard refuses, so every copy answers with its failure. */
  copy: "ok" | "fail";
  /** `rows`: the plugins' own rows (board-plugin-rows.ts) instead of the reply, for the board's 插件行视图 section. */
  part: "reply" | "rows";
}
export interface ConditionFramePorts { L(text: string, values?: Record<string, string | number>): string; htmlLang(): string; clientI18nScript(): string }

const pick = <T extends string>(value: string | null, allowed: readonly T[]): T => (allowed as readonly string[]).includes(value ?? "") ? value as T : allowed[0]!;

/** Only known values are read; anything else is the first value, so the page never reflects what the query said. */
export function parseConditionFrame(query: URLSearchParams): ConditionFrameOptions {
  return {
    lang: pick(query.get("lang"), ["zh", "en"] as const), text: pick(query.get("text"), ["zh", "en", "mixed"] as const),
    kind: pick(query.get("kind"), ["code", "prose"] as const), font: pick(query.get("font"), ["system", "fallback"] as const),
    copy: pick(query.get("copy"), ["ok", "fail"] as const), part: pick(query.get("part"), ["reply", "rows"] as const),
  };
}

// Twelve tool calls of one round: one failed and one whose outcome is unknown stay in sight past the limit (the Assistant's rule).
const TOOLS: Array<[string, string, DirectoryStatusTone, string]> = [
  ["读文件", "auth/session.ts", "done", "完成"], ["查找", "readCookie(", "done", "完成"], ["读文件", "auth/cookie.ts", "done", "完成"],
  ["读文件", "tests/session.test.ts", "done", "完成"], ["改写文件", "auth/session.ts", "done", "完成"], ["跑命令", "pnpm --filter ./auth run build", "done", "完成"],
  ["跑命令", "pnpm test auth", "blocked", "失败"], ["改写文件", "auth/session.ts", "done", "完成"], ["跑命令", "pnpm test auth", "done", "完成"],
  ["跑命令", "git push origin feature/session-cookie", "attention", "结果未知"], ["读文件", "docs/auth.md", "done", "完成"], ["改写文件", "docs/auth.md", "done", "完成"],
];

function toolRows(L: ConditionFramePorts["L"], count: number): string {
  return TOOLS.slice(0, count).map(([verb, target, tone, state]) => renderDirectoryRow({
    title: target, caption: L(verb) + (tone === "attention" ? " · " + L("连接中断") : ""), density: "meta", icon: verb === "跑命令" ? "terminal" : verb === "查找" ? "search" : "file",
    status: L(state), statusTone: tone, statusIcon: tone === "done" ? "status-done" : tone === "blocked" ? "status-blocked" : "status-needs-you",
    attrs: tone === "done" ? {} : { "data-cond-kept": "" },
  })).join("");
}

const FRAME_STYLES = `body.mw-cond-page{margin:0;background:var(--desk,var(--wash));color:var(--ink)}.mw-cond{display:grid;grid-template-columns:minmax(0,1fr);gap:20px;padding:16px}.mw-cond>*{min-width:0}`
  + `.mw-cond h2{margin:0 0 4px;font-size:13px}.mw-cond p.mw-cond-note{margin:0 0 8px;color:var(--muted);font-size:12px}`
  + `.mw-cond-env{display:flex;flex-wrap:wrap;gap:4px 12px;margin:0;color:var(--muted);font-size:12px}.mw-cond-env b{color:var(--ink);font-weight:var(--weight-control)}`
  + `.mw-cond .mw-cond-thread{flex:none;height:320px;border-radius:var(--r-card);background:var(--paper);box-shadow:var(--lift-1)}`
  + `.mw-cond-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:8px}.mw-cond-list{display:flex;flex-direction:column;gap:2px;padding:6px;border-radius:var(--r-card);background:var(--paper);box-shadow:var(--lift-1)}`;

function frameBody(options: ConditionFrameOptions, L: ConditionFramePorts["L"], sample: { question: string; reply: string }): string {
  return `<main class="mw-cond" data-cond-frame-page data-text="${options.text}" data-kind="${options.kind}" data-font="${options.font}" data-copy="${options.copy}">
    <p class="mw-cond-env" data-cond-env><span>${escapeHtml(L("缩放"))} <b data-cond-env-zoom></b></span><span>${escapeHtml(L("指针"))} <b data-cond-env-pointer></b></span><span>${escapeHtml(L("动效"))} <b data-cond-env-motion></b></span><span>${escapeHtml(L("由浏览器给，板上不模拟"))}</span></p>
    <section><h2>${escapeHtml(L("回复 · 流式写出与滚动交错"))}</h2><p class="mw-cond-note">${escapeHtml(L("往上滚就停在原处，新写出的在「回到最新」后面等着；停止时已写出的部分留着。"))}</p>
      <div class="assistant-thread mw-cond-thread" data-cond-thread role="log" aria-live="polite"><div class="assistant-round"><div class="assistant-msg assistant-msg--user">${escapeHtml(sample.question)}</div><div class="assistant-msg assistant-msg--assistant" data-cond-reply></div><button type="button" class="assistant-copy" data-cond-copy-reply>${escapeHtml(L("复制"))}</button></div></div>
      <div class="mw-cond-row"><button type="button" class="mw-btn mw-btn--secondary mw-btn--sm" data-cond-replay>${escapeHtml(L("重播"))}</button><button type="button" class="mw-btn mw-btn--secondary mw-btn--sm" data-cond-stop disabled>${escapeHtml(L("停止"))}</button><button type="button" class="mw-btn mw-btn--secondary mw-btn--sm" data-cond-latest hidden>${escapeHtml(L("回到最新"))}</button><span role="status" data-cond-state></span></div>
    </section>
    <section><h2>${escapeHtml(L("多工具 · 失败与结果未知不收起"))}</h2><div class="mw-cond-list" data-cond-tools>${toolRows(L, TOOLS.length)}</div></section>
    <section><h2>${escapeHtml(L("边界 · 只多一项时不收起"))}</h2><div class="mw-cond-list" data-cond-tools-edge>${toolRows(L, 6)}</div></section>
  </main>`;
}

/** The fallback faces are the product's own last entries (design-system typeface.ts), so nothing here names another font. */
const FALLBACK_FONT = `--font:"Inter Variable","Noto Sans SC",sans-serif;--font-mono:monospace`;

export function renderMolisWorkConditionsSpecimen(options: ConditionFrameOptions, ports: ConditionFramePorts): string {
  const { L } = ports, sample = conditionSample(options.kind, options.text), rows = options.part === "rows";
  const steps = rows ? [] : conditionStream(sample.reply).map((text) => assistantTextHtml(text, [], L));
  const data = JSON.stringify({ steps, reply: sample.reply, copy: options.copy, pace: 220 }).replaceAll("<", "\\u003c");
  return `<!doctype html>
<html lang="${ports.htmlLang()}"${options.font === "fallback" ? ` style='${FALLBACK_FONT}'` : ""}>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(L("条件与状态样例"))} · Molis Work</title>
  <script>${THEME_BOOTSTRAP_SCRIPT}</script>
  <link rel="stylesheet" href="/assets/molis-work-workbench.css">
  <style>${FRAME_STYLES}${rows ? BOARD_PLUGIN_ROW_STYLES : ""}</style>
</head>
<body class="immersive-workbench mw-cond-page">
  ${renderIconSprite()}
  ${rows ? `<main class="mw-cond" data-cond-frame-page data-part="rows">${renderBoardPluginRows(L, options.text)}</main>` : frameBody(options, L, sample)}
  <script>${ports.clientI18nScript()}${VISUAL_FOUNDATION_CLIENT_SCRIPT}</script>
  ${rows ? "" : `<script type="application/json" id="mw-cond-data">${data}</script>
  <script>globalThis.molisBoardCodeGrow = ${createAssistantCodeGrow.toString()};</script>
  <script>${CONDITIONS_FRAME_SCRIPT}</script>`}
</body>
</html>`;
}

/** The frame's program, written in `src/browser/board/conditions-frame.ts` and bundled into `dist/` when the package builds. */
const CONDITIONS_FRAME_SCRIPT = readFileSync(new URL("./board-conditions-frame.js", import.meta.url), "utf8").trim();
